import type { IFetchInitPreprocessor } from './IFetchInitPreprocessor';

/**
 * Overrides the HTTP agent to perform better in Node.js.
 */
export class FetchInitPreprocessor implements IFetchInitPreprocessor {
  public async handle(init: RequestInit): Promise<RequestInit> {
    // Add 'Accept-Encoding' headers
    const headers = new Headers(init.headers);
    if (!headers.has('Accept-Encoding')) {
      headers.set('Accept-Encoding', 'br,gzip,deflate');
      init = { ...init, headers };
    }

    // The Fetch API requires specific options to be set when sending body streams:
    // - 'keepalive' can not be true
    // - 'duplex' must be set to 'half'
    return {
      ...init,
      ...init.body ? { keepalive: false, duplex: 'half' } : { keepalive: true },
    };
  }
}
