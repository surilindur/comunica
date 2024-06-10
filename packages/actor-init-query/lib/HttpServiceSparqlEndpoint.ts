/* eslint-disable import/no-nodejs-modules, ts/no-var-requires, ts/no-require-imports */
import type { Worker, Cluster } from 'node:cluster';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Writable } from 'node:stream';
import { KeysQueryOperation } from '@comunica/context-entries';
import type { ICliArgsHandler, QueryQuads, QueryType, QueryStringContext } from '@comunica/types';
import { ArrayIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import yargs from 'yargs';
import { CliArgsHandlerBase } from './cli/CliArgsHandlerBase';
import { CliArgsHandlerHttp } from './cli/CliArgsHandlerHttp';
import { QueryEngineBase } from './QueryEngineBase';
import { QueryEngineFactoryBase } from './QueryEngineFactoryBase';
import type { IDynamicQueryEngineOptions } from './QueryEngineFactoryBase';

// Cluster has to be forced a type due to some weird inconsistency
const cluster: Cluster = require('node:cluster');

// The negotiate package does not even have types, and could be replaced in future
const negotiate = require('negotiate');

// Use require instead of import for default exports, to be compatible with variants of esModuleInterop in tsconfig.
const process: NodeJS.Process = require('process/');

/* eslint-enable import/no-nodejs-modules, ts/no-var-requires, ts/no-require-imports */

const DF = new DataFactory();

/**
 * An HTTP service that exposes a Comunica engine as a SPARQL endpoint.
 */
export class HttpServiceSparqlEndpoint {
  public static readonly MIME_PLAIN = 'text/plain';
  public static readonly MIME_JSON = 'application/json';

  protected readonly port: number;
  protected readonly timeout: number;
  protected readonly workers: number;
  protected readonly context: QueryStringContext;
  protected readonly invalidateCacheBeforeQuery: boolean;
  protected readonly freshWorkerPerQuery: boolean;
  protected readonly allowContextOverride: boolean;

  protected readonly requestBytesLimit: number = 1_000;
  protected readonly endpointPath: string = '/sparql';

  protected readonly engineFactory: QueryEngineFactoryBase<QueryEngineBase>;

  public constructor(args: IHttpServiceSparqlEndpointArgs) {
    this.context = args.context || {};
    this.timeout = args.timeout ?? 60_000;
    this.port = args.port ?? 3_000;
    this.workers = args.workers ?? 1;
    this.invalidateCacheBeforeQuery = Boolean(args.invalidateCacheBeforeQuery);
    this.freshWorkerPerQuery = Boolean(args.freshWorkerPerQuery);
    this.allowContextOverride = Boolean(args.allowContextOverride);
    this.engineFactory = new QueryEngineFactoryBase(
      args.moduleRootPath,
      args.defaultConfigPath,
      actorInitQuery => new QueryEngineBase(actorInitQuery),
    );
  }

  /**
   * Start the HTTP service.
   * @param {Writable} stdout The output stream to log to.
   * @param {Writable} stderr The error stream to log errors to.
   */
  public run(stdout: Writable, stderr: Writable): Promise<void> {
    return (<Cluster><unknown>cluster).isPrimary ? this.runPrimary(stdout, stderr) : this.runWorker(stdout, stderr);
  }

  public async handleRequest(
    stdout: Writable,
    stderr: Writable,
    request: IncomingMessage,
    response: ServerResponse,
    engine: QueryEngineBase,
    mediaTypes: IWeighedMediaType[],
  ): Promise<void> {
    const requestUrl = new URL(request.url!, `http://${request.headers.host}`);
    stdout.write(`${request.method} ${requestUrl.protocol}//${requestUrl.host}\n`);

    // Headers that should always be sent and will not depend on the response
    response.setHeader('server', 'comunica');
    response.setHeader('access-control-allow-origin', '*');

    try {
      // Requests should only be accepted at the specificed endpoint path
      if (requestUrl.pathname !== this.endpointPath) {
        throw new HTTPError(404, 'Not Found');
      }

      // Attempt to parse the request, and throw an error in case of failure
      const operation = await this.parseOperation(requestUrl, request);

      // Cache only needs to be invalidated when the worker is not fresh
      if (this.invalidateCacheBeforeQuery && !this.freshWorkerPerQuery) {
        await engine.invalidateHttpCache();
      }

      // Execute the query, although this should ideally be done AFTER media type negotiation
      const result: QueryType = await engine.query(operation.queryString, operation.context);

      // Attempt to negotiate a suitable result serialization format
      const resultMediaType = this.negotiateResultType(request, result, mediaTypes);

      // Everything is fine thus far, so assign the status code
      response.statusCode = 200;

      // Serialize the result and pipe the output to the response, then wait for the serialization to be done
      const { data } = await engine.resultToString(result, resultMediaType, this.context);
      await new Promise<void>((resolve, reject) => {
        data.on('error', reject).on('end', () => response.end(() => resolve()));
        data.pipe(response);
      });
    } catch (error: unknown) {
      if (error instanceof HTTPError) {
        stderr.write(`[${error.statusCode}] ${error.message}\n`);
        response.statusCode = error.statusCode;
        response.end(error.message);
      } else {
        stderr.write(`[500] Internal Server Error\n`);
        stderr.write(error);
        response.statusCode = 500;
        response.end('Internal Server Error');
      }
    }

    if (!response.closed) {
      response.end();
    }
  }

  /**
   * Resolve the media type for result serialization via content negotiation.
   * @param {IncomingMessage} request The incoming HTTP request.
   * @param {QueryType} result The query result.
   * @param {IWeighedMediaType[]} mediaTypes The list of media types and their weighs.
   * @returns {string} The negotiated media type.
   */
  public negotiateResultType(request: IncomingMessage, result: QueryType, mediaTypes: IWeighedMediaType[]): string {
    const negotiatedMediaType = request.headers.accept ?
      negotiate.choose(mediaTypes, request).sort((first: any, second: any) => second.qts - first.qts).at(0) :
      null;

    // Require qts strictly larger than 2, as 1 and 2 respectively allow * and */* matching.
    // For qts 0, 1, and 2, we fallback to our built-in media type defaults, for which we pass null.
    let mediaType: string = negotiatedMediaType && negotiatedMediaType.qts > 2 ? negotiatedMediaType.type : null;

    // Default to SPARQL JSON for bindings and boolean
    if (!mediaType) {
      switch (result.resultType) {
        case 'quads':
          mediaType = 'application/trig';
          break;
        case 'void':
          mediaType = 'simple';
          break;
        default:
          mediaType = 'application/sparql-results+json';
          break;
      }
    }
    return mediaType;
  }

  /**
   * Extracts the SPARQL protocol operation from an incoming HTTP request.
   * @param {URL} url The parsed request URL.
   * @param {IncomingMessage} request The incoming HTTP request.
   * @returns {ISparqlOperation} The parsed SPARQL protocol operation.
   */
  public async parseOperation(url: URL, request: IncomingMessage): Promise<ISparqlOperation> {
    switch (request.method) {
      case 'HEAD':
      case 'GET':
        if (url.searchParams.has('query')) {
          return {
            type: 'query',
            queryString: url.searchParams.get('query')!,
            context: this.parseOperationParams(url.searchParams),
          };
        }
        if (url.searchParams.has('update')) {
          return {
            type: 'update',
            queryString: url.searchParams.get('update')!,
            context: this.parseOperationParams(url.searchParams),
          };
        }
        break;
      case 'POST':
        // eslint-disable-next-line no-case-declarations
        const requestBody = await this.readRequestBody(request);
        if (requestBody.contentType.includes('application/sparql-query')) {
          return {
            type: 'query',
            queryString: requestBody.content,
            context: this.parseOperationParams(url.searchParams),
          };
        }
        if (requestBody.contentType.includes('application/sparql-update')) {
          return {
            type: 'update',
            queryString: requestBody.content,
            context: this.parseOperationParams(url.searchParams),
          };
        }
        if (requestBody.contentType.includes('application/x-www-form-urlencoded')) {
          const requestBodyParams = new URLSearchParams(requestBody.content);
          let requestBodyContext: QueryStringContext | undefined;
          if (requestBodyParams.has('context')) {
            try {
              requestBodyContext = JSON.parse(requestBodyParams.get('context')!);
            } catch {
              break;
            }
          }
          if (requestBodyParams.has('query')) {
            return {
              type: 'query',
              queryString: requestBodyParams.get('query')!,
              context: this.parseOperationParams(url.searchParams, requestBodyContext),
            };
          }
          if (requestBodyParams.has('update')) {
            return {
              type: 'update',
              queryString: requestBodyParams.get('update')!,
              context: this.parseOperationParams(url.searchParams, requestBodyContext),
            };
          }
        }
        break;
      default:
        throw new HTTPError(501, 'Not Implemented');
    }
    // If no parsed operation has been returned, and the default switch block was not reached,
    // it means that no SPARQL operation has been parsed, and the request is invalid.
    throw new HTTPError(400, 'Bad Request');
  }

  /**
   * Reads the incoming HTTP request body into a string, using the Content-Encoding header.
   * @param {IncomingMessage} request The incoming client request.
   * @returns {IParsedRequestBody} The request body.
   */
  public async readRequestBody(request: IncomingMessage): Promise<IParsedRequestBody> {
    return new Promise((resolve, reject) => {
      if (!request.headers['content-type']) {
        throw new HTTPError(400, 'Bad Request');
      }
      if (!request.headers['content-length']) {
        throw new HTTPError(411, 'Length Required');
      }
      const length = Number.parseInt(request.headers['content-length'], 10);
      if (length > this.requestBytesLimit) {
        throw new HTTPError(413, 'Payload Too Large');
      }
      const chunks: Uint8Array[] = [];
      const encoding = <BufferEncoding>request.headers['content-encoding'] ?? 'utf-8';
      request
        .on('data', (chunk: Uint8Array) => chunks.push(chunk))
        .on('error', reject)
        .on('close', reject)
        .on('end', () => resolve({
          content: Buffer.concat(chunks).toString(encoding),
          contentType: request.headers['content-type']!,
          contentLength: length,
          contentEncoding: encoding,
        }));
    });
  }

  /**
   * Parses additional operation parameters from the URL search params into the context.
   * @param {URLSearchParams} params The URL search parameters from user.
   * @returns {QueryStringContext} The extended query string context.
   */
  public parseOperationParams(params: URLSearchParams, userContext?: QueryStringContext): QueryStringContext {
    return {
      ...this.context,
      ...this.allowContextOverride ? userContext : {},
      // TODO: This is hideous and in dire need of clean-up... by the gods!
      ...params.has('default-graph-uri') ?
          { defaultGraphUris: params.getAll('default-graph-uri').map(uri => DF.namedNode(uri)) } :
          {},
      ...params.has('named-graph-uri') ?
          { namedGraphUris: params.getAll('named-graph-uri').map(uri => DF.namedNode(uri)) } :
          {},
      ...params.has('using-graph-uri') ?
          { usingGraphUris: params.getAll('using-graph-uri').map(uri => DF.namedNode(uri)) } :
          {},
      ...params.has('using-named-graph-uri') ?
          { usingNamedGraphUris: params.getAll('using-named-graph-uri').map(uri => DF.namedNode(uri)) } :
          {},
    };
  }

  /**
   * Gets the SPARQL service description as a quad result format for serialization.
   * @param {IncomingMessage} request The incoming client request.
   * @param {Record<string, string>} formats The supported result formats.
   * @returns {QueryQuads} The service description as query result quads.
   */
  public async getServiceDescription(request: IncomingMessage, formats: Record<string, string>): Promise<QueryQuads> {
    const endpoint = DF.namedNode(`http://${request.headers.host}${this.endpointPath}`);
    const sd = 'http://www.w3.org/ns/sparql-service-description#';
    const rdf = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
    const quads = [
      // Basic metadata
      DF.quad(endpoint, DF.namedNode(`${rdf}type`), DF.namedNode(`${sd}Service`)),
      DF.quad(endpoint, DF.namedNode(`${sd}endpoint`), endpoint),
      DF.quad(endpoint, DF.namedNode(`${sd}url`), endpoint),
      // Features
      DF.quad(endpoint, DF.namedNode(`${sd}feature`), DF.namedNode(`${sd}BasicFederatedQuery`)),
      DF.quad(endpoint, DF.namedNode(`${sd}supportedLanguage`), DF.namedNode(`${sd}SPARQL10Query`)),
      DF.quad(endpoint, DF.namedNode(`${sd}supportedLanguage`), DF.namedNode(`${sd}SPARQL11Query`)),
    ];

    // Append result formats
    for (const resultFormat of Object.values(formats)) {
      quads.push(DF.quad(endpoint, DF.namedNode(`${sd}resultFormat`), DF.namedNode(resultFormat)));
    }

    // Return the service description as a fake query result for serialization
    return <QueryQuads> {
      resultType: 'quads',
      execute: async() => new ArrayIterator(quads),
      metadata: <any> undefined,
    };
  }

  /**
   * Starts the server
   * @param {string[]} argv The commandline arguments that the script was called with
   * @param {module:stream.internal.Writable} stdout The output stream to log to.
   * @param {module:stream.internal.Writable} stderr The error stream to log errors to.
   * @param {string} moduleRootPath The path to the invoking module.
   * @param {NodeJS.ProcessEnv} env The process env to get constants from.
   * @param {string} defaultConfigPath The path to get the config from if none is defined in the environment.
   * @param {(code: number) => void} exit The callback to invoke to stop the script.
   * @param {ICliArgsHandler[]} cliArgsHandlers Enables manipulation of the CLI arguments and their processing.
   * @return {Promise<void>} A promise that resolves when the server has been started.
   */
  public static async runArgsInProcess(
    argv: string[],
    stdout: Writable,
    stderr: Writable,
    moduleRootPath: string,
    env: NodeJS.ProcessEnv,
    defaultConfigPath: string,
    exit: (code: number) => void,
    cliArgsHandlers: ICliArgsHandler[] = [],
  ): Promise<void> {
    const options = await HttpServiceSparqlEndpoint
      .generateConstructorArguments(argv, moduleRootPath, env, defaultConfigPath, stderr, exit, cliArgsHandlers);

    return new Promise<void>((resolve) => {
      new HttpServiceSparqlEndpoint(options || {}).run(stdout, stderr)
        .then(resolve)
        .catch((error) => {
          stderr.write(error);
          exit(1);
          resolve();
        });
    });
  }

  /**
   * Takes parsed commandline arguments and turns them into an object used in the HttpServiceSparqlEndpoint constructor
   * @param {args: string[]} argv The commandline arguments that the script was called with
   * @param {string} moduleRootPath The path to the invoking module.
   * @param {NodeJS.ProcessEnv} env The process env to get constants from.
   * @param {string} defaultConfigPath The path to get the config from if none is defined in the environment.
   * @param stderr The error stream.
   * @param exit An exit process callback.
   * @param {ICliArgsHandler[]} cliArgsHandlers Enables manipulation of the CLI arguments and their processing.
   */
  public static async generateConstructorArguments(
    argv: string[],
    moduleRootPath: string,
    env: NodeJS.ProcessEnv,
    defaultConfigPath: string,
    stderr: Writable,
    exit: (code: number) => void,
    cliArgsHandlers: ICliArgsHandler[],
  ): Promise<IHttpServiceSparqlEndpointArgs> {
    // Populate yargs arguments object
    cliArgsHandlers = [
      new CliArgsHandlerBase(),
      new CliArgsHandlerHttp(),
      ...cliArgsHandlers,
    ];
    let argumentsBuilder = yargs([]);
    for (const cliArgsHandler of cliArgsHandlers) {
      argumentsBuilder = cliArgsHandler.populateYargs(argumentsBuilder);
    }

    // Extract raw argument values from parsed yargs object, so that we can handle each of them hereafter
    let args: Record<string, any>;
    try {
      args = await argumentsBuilder.parse(argv);
    } catch (error: unknown) {
      stderr.write(`${await argumentsBuilder.getHelp()}\n\n${(<Error> error).message}\n`);
      return <any> exit(1);
    }

    // Invoke args handlers to process any remaining args
    const context: Record<string, any> = {};
    try {
      for (const cliArgsHandler of cliArgsHandlers) {
        await cliArgsHandler.handleArgs(args, context);
      }
    } catch (error: unknown) {
      stderr.write(`${(<Error>error).message}/n`);
      exit(1);
    }

    const invalidateCacheBeforeQuery: boolean = args.invalidateCache;
    const freshWorkerPerQuery: boolean = args.freshWorker;
    const allowContextOverride: boolean = args.allowContextOverride;
    const port = args.port;
    const timeout = args.timeout * 1_000;
    const workers = args.workers;
    context[KeysQueryOperation.readOnly.name] = !args.u;

    const configPath = env.COMUNICA_CONFIG ? env.COMUNICA_CONFIG : defaultConfigPath;

    return {
      defaultConfigPath,
      configPath,
      context,
      invalidateCacheBeforeQuery,
      freshWorkerPerQuery,
      allowContextOverride,
      moduleRootPath,
      mainModulePath: moduleRootPath,
      port,
      timeout,
      workers,
    };
  }

  /**
   * Start the HTTP service as master.
   * @param {Writable} stdout The output stream to log to.
   * @param {Writable} stderr The error stream to log errors to.
   */
  public async runPrimary(stdout: Writable, stderr: Writable): Promise<void> {
    stdout.write(`Starting SPARQL endpoint with ${this.workers} workers at <http://localhost:${this.port}${this.endpointPath}>\n`);

    const workers = new Set<Worker>();

    // Create workers
    for (let i = 0; i < this.workers; i++) {
      workers.add(cluster.fork());
    }

    // Attach listeners to each new worker
    cluster.on('listening', (worker) => {
      // Respawn crashed workers
      worker.once('exit', (code, signal) => {
        if (!worker.exitedAfterDisconnect) {
          if (code === 9 || signal === 'SIGKILL') {
            stderr.write(`Worker ${worker.process.pid} forcefully killed with ${code || signal}, killing main process\n`);
            cluster.disconnect();
          } else {
            stderr.write(`Worker ${worker.process.pid} died with ${code || signal}, starting new worker\n`);
            workers.delete(worker);
            workers.add(cluster.fork());
          }
        }
      });
    });

    // Disconnect from cluster on SIGINT, so that the process can cleanly terminate
    process.once('SIGINT', () => {
      stdout.write(`Received SIGINT, terminating SPARQL endpoint\n`);
      cluster.disconnect();
    });
  }

  /**
   * Start the HTTP service as worker.
   * @param {Writable} stdout The output stream to log to.
   * @param {Writable} stderr The error stream to log errors to.
   */
  public async runWorker(stdout: Writable, stderr: Writable): Promise<void> {
    // Create the engine for this worker
    const engine = await this.engineFactory.create();

    // Determine the allowed media types for requests
    const mediaTypes: Record<string, number> = await engine.getResultMediaTypes();
    const mediaTypesWeighed: IWeighedMediaType[] = Object.entries(mediaTypes).map(
      ([ type, quality ]) => ({ type, quality }),
    );

    // Keep track of all open connections, to be able to terminate then when the worker is terminated
    const openConnections = new Set<ServerResponse>();

    // The current timeout handle is tracked in this variable for this worker
    let timeoutHandle: NodeJS.Timeout | undefined;

    // Handle termination of this worker
    const terminateWorker = async(code = 15): Promise<void> => {
      stderr.write(`Terminating worker ${process.pid} with code ${code} and ${openConnections.size} open connections\n`);
      server.close((error) => {
        if (error) {
          stderr.write(error);
        }
      });
      await Promise.all([
        ...openConnections.values(),
      ].map(connection => new Promise<void>(resolve => connection.end('!TERMINATED!', resolve))));
      // eslint-disable-next-line unicorn/no-process-exit
      process.exit(code);
    };

    // Create the server with the request handler function, that has to be synchronous
    const server = createServer((request: IncomingMessage, response: ServerResponse) => {
      stdout.write(`Worker ${process.pid} assigned a new request\n`);
      openConnections.add(response);
      response.on('close', () => {
        // Remove the connection from the tracked open list
        openConnections.delete(response);
        // Unset the timeout handle
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = undefined;
        }
        // Kill the worker if we want fresh workers per query
        if (this.freshWorkerPerQuery) {
          terminateWorker().then().catch(error => stderr.write(error));
        }
      });
      timeoutHandle = setTimeout(() => response.end('!TIMEOUT!'), this.timeout);
      this.handleRequest(stdout, stderr, request, response, engine, mediaTypesWeighed).then(() => {
        stdout.write(`Worker ${process.pid} finished\n`);
      }).catch((error: Error) => {
        stdout.write(`Worker ${process.pid} failed\n`);
        stderr.write(error);
      });
    });

    // Subscribe to shutdown messages
    process.on('message', (message: string) => {
      if (message === 'shutdown') {
        terminateWorker().then().catch(error => stderr.write(error));
      }
    });

    // Catch global errors, and cleanly close open connections
    process.on('uncaughtException', (error) => {
      stderr.write(error);
      terminateWorker().then().catch(error => stderr.write(error));
    });

    // Start listening on the assigned port
    server.listen({ port: this.port }, () => {
      stdout.write(`Worker ${process.pid} listening at <http://localhost:${this.port}${this.endpointPath}>\n`);
    });
  }
}

export interface IHttpServiceSparqlEndpointArgs extends IDynamicQueryEngineOptions {
  context?: any;
  timeout?: number;
  port?: number;
  workers?: number;
  invalidateCacheBeforeQuery?: boolean;
  freshWorkerPerQuery?: boolean;
  allowContextOverride?: boolean;
  moduleRootPath: string;
  defaultConfigPath: string;
}

class HTTPError extends Error {
  public readonly statusCode: number;
  public constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

interface IWeighedMediaType {
  type: string;
  quality: number;
}

interface ISparqlOperation {
  type: 'query' | 'update';
  queryString: string;
  context: QueryStringContext;
}

interface IParsedRequestBody {
  content: string;
  contentType: string;
  contentEncoding: string;
  contentLength: number;
}
