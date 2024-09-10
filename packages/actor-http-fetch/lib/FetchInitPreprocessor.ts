/* eslint-disable import/no-nodejs-modules */
import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';

/* eslint-enable import/no-nodejs-modules */
import type { IFetchInitPreprocessor } from './IFetchInitPreprocessor';

/**
 * Overrides the HTTP agent to perform better in Node.js.
 */
export class FetchInitPreprocessor implements IFetchInitPreprocessor {
  private readonly agent: (url: URL) => HttpAgent;

  public constructor(agentOptions: any) {
    const httpAgent = new HttpAgent(agentOptions);
    const httpsAgent = new HttpsAgent(agentOptions);
    this.agent = (_parsedURL: URL): HttpAgent => _parsedURL.protocol === 'http:' ? httpAgent : httpsAgent;
  }

  public async handle(init: RequestInit): Promise<RequestInit> {
    // The Fetch API requires specific options to be set when sending body streams:
    // - 'keepalive' can not be true
    // - 'duplex' must be set to 'half'
    return <any> {
      ...init,
      agent: this.agent,
      keepalive: !init.body,
      duplex: init.body ? 'half' : undefined,
    };
  }
}
