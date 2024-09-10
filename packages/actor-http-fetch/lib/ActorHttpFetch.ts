import type { IActionHttp, IActorHttpOutput, IActorHttpArgs } from '@comunica/bus-http';
import { ActorHttp } from '@comunica/bus-http';
import { KeysHttp } from '@comunica/context-entries';
import type { IMediatorTypeTime } from '@comunica/mediatortype-time';
import type { Readable } from 'readable-stream';
import 'cross-fetch/polyfill';

// eslint-disable-next-line import/extensions
import { version as actorVersion } from '../package.json';

import { FetchInitPreprocessor } from './FetchInitPreprocessor';
import type { IFetchInitPreprocessor } from './IFetchInitPreprocessor';

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class ActorHttpFetch extends ActorHttp {
  private readonly fetchInitPreprocessor: IFetchInitPreprocessor;

  private static readonly userAgent = ActorHttp.createUserAgent(ActorHttpFetch.name, actorVersion);

  public constructor(args: IActorHttpFetchArgs) {
    super(args);
    this.fetchInitPreprocessor = new FetchInitPreprocessor(args.agentOptions);
  }

  public async test(_action: IActionHttp): Promise<IMediatorTypeTime> {
    return { time: Number.POSITIVE_INFINITY };
  }

  public async run(action: IActionHttp): Promise<IActorHttpOutput> {
    const headers = this.prepareRequestHeaders(action);

    const init: RequestInit = { method: 'GET', ...action.init, headers };

    this.logInfo(action.context, `Requesting ${ActorHttp.getInputUrl(action.input).href}`, () => ({
      headers: ActorHttp.headersToHash(headers),
      method: init.method,
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
    const fetchFunction = action.context.get<Fetch>(KeysHttp.fetch) ?? fetch;
    const requestInit = await this.fetchInitPreprocessor.handle(init);

    let timeoutCallback: () => void;
    let timeoutHandle: NodeJS.Timeout | undefined;

    if (httpTimeout) {
      const abortController = await this.fetchInitPreprocessor.createAbortController();
      requestInit.signal = abortController.signal;
      timeoutCallback = () => abortController.abort(new Error(`Dereferencing timed out for ${ActorHttp.getInputUrl(action.input).href} after ${httpTimeout} ms`));
      timeoutHandle = setTimeout(() => timeoutCallback(), httpTimeout);
    }

    const response = await fetchFunction(action.input, requestInit);

    if (httpTimeout && (!httpBodyTimeout || !response.body)) {
      clearTimeout(timeoutHandle);
    }

    // TODO: remove the following workaround when cross-fetch is removed
    // Node-fetch does not support body.cancel, while it is mandatory according to the fetch and readablestream api.
    // If it doesn't exist, we monkey-patch it.
    if (response.body && !response.body.cancel && 'destroy' in response.body) {
      response.body.cancel = async(error?: Error) => {
        (<Readable><any>response.body).destroy(error);
      };
    }

    return response;
  }

  /**
   * Prepares the request headers, taking into account the environment.
   * @param {IActionHttp} action The HTTP action
   * @returns {Headers} Headers
   */
  public prepareRequestHeaders(action: IActionHttp): Headers {
    const headers = new Headers(action.init?.headers);

    // The actor-defined User-Agent header should be applied when:
    // 1. There is no header provided, because it is good to include one
    // 2. The actor is running in a browser, in which case the browser header value should be used
    if (!headers.has('user-agent') || typeof globalThis.process === 'undefined') {
      headers.set('user-agent', ActorHttpFetch.userAgent);
    }

    const authString = action.context.get<string>(KeysHttp.auth);
    if (authString) {
      headers.set('Authorization', `Basic ${Buffer.from(authString).toString('base64')}`);
    }

    return headers;
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
