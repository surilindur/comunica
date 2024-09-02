import type { IActionHttp, IActorHttpOutput, IActorHttpArgs } from '@comunica/bus-http';
import { ActorHttp } from '@comunica/bus-http';
import { KeysHttp } from '@comunica/context-entries';
import type { IMediatorTypeTime } from '@comunica/mediatortype-time';
import type { Readable } from 'readable-stream';
import 'cross-fetch/polyfill';
import { FetchInitPreprocessor } from './FetchInitPreprocessor';
import type { IFetchInitPreprocessor } from './IFetchInitPreprocessor';

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class ActorHttpFetch extends ActorHttp {
  private readonly userAgent: string;
  private readonly fetchInitPreprocessor: IFetchInitPreprocessor;

  public constructor(args: IActorHttpFetchArgs) {
    super(args);
    this.userAgent = ActorHttpFetch.createUserAgent();
    this.fetchInitPreprocessor = new FetchInitPreprocessor(args.agentOptions);
  }

  public static createUserAgent(): string {
    const systemInformation = typeof globalThis.process === 'undefined' ?
      'browser' :
      `${globalThis.process.platform}; ${globalThis.process.arch}`;
    return `Comunica/actor-http-fetch (${systemInformation}) ${globalThis.navigator.userAgent}`;
  }

  public async test(_action: IActionHttp): Promise<IMediatorTypeTime> {
    return { time: Number.POSITIVE_INFINITY };
  }

  public async run(action: IActionHttp): Promise<IActorHttpOutput> {
    const headers = new Headers(action.init?.headers);

    if (!headers.has('user-agent')) {
      headers.set('user-agent', this.userAgent);
    }

    const authString: string | undefined = action.context.get(KeysHttp.auth);
    if (authString) {
      headers.set('Authorization', `Basic ${Buffer.from(authString).toString('base64')}`);
    }

    const init: RequestInit = { ...action.init, headers };

    // Log request
    this.logInfo(action.context, `Requesting ${ActorHttpFetch.getInputUrl(action.input).href}`, () => ({
      headers: ActorHttp.headersToHash(headers),
      method: init.method ?? 'GET',
    }));

    // TODO: remove this workaround once this has a fix: https://github.com/inrupt/solid-client-authn-js/issues/1708
    if (action.context.has(KeysHttp.fetch)) {
      init.headers = ActorHttp.headersToHash(headers);
    }

    if (action.context.get(KeysHttp.includeCredentials)) {
      init.credentials = 'include';
    }

    const httpTimeout = action.context.get<number>(KeysHttp.httpTimeout);
    const httpBodyTimeout = action.context.get<boolean>(KeysHttp.httpBodyTimeout);

    let requestTimeout: NodeJS.Timeout | undefined;
    let onTimeout: (() => void) | undefined;

    if (httpTimeout) {
      const controller = await this.fetchInitPreprocessor.createAbortController();
      init.signal = controller.signal;
      onTimeout = () => controller.abort();
      requestTimeout = setTimeout(() => onTimeout!(), httpTimeout);
    }

    try {
      const requestInit = await this.fetchInitPreprocessor.handle(init);
      const customFetch = action.context.get<Fetch>(KeysHttp.fetch);

      const response = await (customFetch ?? fetch)(action.input, requestInit);

      // When the timeout should also encompass the receiving of the response body, adjust the clearing
      // of it to happen after the body stream has ended, otherwise clear it immediately
      if (requestTimeout && httpBodyTimeout && response.body) {
        // eslint-disable-next-line ts/no-misused-promises
        onTimeout = () => response.body?.cancel(new Error(`HTTP timeout when reading the body of ${response.url}.
This error can be disabled by modifying the 'httpBodyTimeout' and/or 'httpTimeout' options.`));
        (<Readable><any>response.body).on('close', () => clearTimeout(requestTimeout));
      } else {
        clearTimeout(requestTimeout);
      }

      // Node-fetch does not support body.cancel, while it is mandatory according to the fetch and readablestream api.
      // If it doesn't exist, we monkey-patch it.
      if (response.body && !response.body.cancel) {
        response.body.cancel = async(error?: Error) => {
          (<Readable><any>response.body).destroy(error);
          if (requestTimeout !== undefined) {
            // We make sure to remove the timeout if it is still enabled
            clearTimeout(requestTimeout);
          }
        };
      }

      return response;
    } catch (error: unknown) {
      clearTimeout(requestTimeout);
      throw error;
    }
  }
}

export interface IActorHttpFetchArgs extends IActorHttpArgs {
  /**
   * The agent options for the HTTP agent
   * @range {json}
   * @default {{ "keepAlive": true, "maxSockets": 5 }}
   */
  agentOptions?: Record<string, any>;
}
