import type { IActionHttp, IActorHttpOutput, IActorHttpArgs, MediatorHttp } from '@comunica/bus-http';
import { ActorHttp } from '@comunica/bus-http';
import { KeysHttp } from '@comunica/context-entries';
import { ActionContextKey } from '@comunica/core';
import type { IMediatorTypeTime } from '@comunica/mediatortype-time';

export class ActorHttpLimitRate extends ActorHttp {
  private readonly mediatorHttp: MediatorHttp;
  private readonly cleanupTimeouts: Record<string, NodeJS.Timeout>;
  private readonly requestTimestamps: Record<string, number[]>;

  private static readonly keyWrapped = new ActionContextKey<boolean>('urn:comunica:actor-http-limit-rate#wrapped');

  public constructor(args: IActorHttpQueueArgs) {
    super(args);
    this.mediatorHttp = args.mediatorHttp;
    this.cleanupTimeouts = {};
    this.requestTimestamps = {};
  }

  public async test(action: IActionHttp): Promise<IMediatorTypeTime> {
    if (action.context.has(ActorHttpLimitRate.keyWrapped)) {
      throw new Error(`${this.name} will only wrap request once`);
    }
    const requestsPerSecond = action.context.get<number>(KeysHttp.httpRequestsPerSecond);
    if (!requestsPerSecond || requestsPerSecond < 1) {
      throw new Error(`${this.name} requires a request limit per second to function`);
    }
    return { time: 0 };
  }

  public async run(action: IActionHttp): Promise<IActorHttpOutput> {
    const host = ActorHttpLimitRate.getInputUrl(action.input).host;
    const requestsPerSecond = action.context.getSafe<number>(KeysHttp.httpRequestsPerSecond);

    if (this.requestTimestamps[host] === undefined) {
      this.requestTimestamps[host] = [];
    }

    const currentTimestamp = Date.now();

    if (this.requestTimestamps[host].length < requestsPerSecond) {
      this.registerRequest(host, currentTimestamp, 0);
    } else {
      const oldestTimestamp = this.requestTimestamps[host].shift()!;
      const delayBeforeRequest = Math.max(0, oldestTimestamp + 1_000 - currentTimestamp);
      this.registerRequest(host, currentTimestamp, delayBeforeRequest);
      if (delayBeforeRequest > 0) {
        this.logDebug(action.context, `Delaying request to ${host} by ${delayBeforeRequest}ms due to client-side rate limit`);
        await new Promise(resolve => setTimeout(resolve, delayBeforeRequest));
      }
    }

    return this.mediatorHttp.mediate({
      ...action,
      context: action.context.set(ActorHttpLimitRate.keyWrapped, true),
    });
  }

  private registerRequest(host: string, currentTimestamp: number, requestDelay: number): void {
    this.requestTimestamps[host].push(currentTimestamp + requestDelay);
    if (host in this.cleanupTimeouts) {
      clearTimeout(this.cleanupTimeouts[host]);
      delete this.cleanupTimeouts[host];
    }
    this.cleanupTimeouts[host] = setTimeout(() => {
      delete this.cleanupTimeouts[host];
      delete this.requestTimestamps[host];
    }, requestDelay + 2_000);
  }
}

export interface IActorHttpQueueArgs extends IActorHttpArgs {
  /**
   * The HTTP mediator.
   */
  mediatorHttp: MediatorHttp;
}
