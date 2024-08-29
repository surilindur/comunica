import type { IActionHttp, IActorHttpOutput, IActorHttpArgs, MediatorHttp } from '@comunica/bus-http';
import { ActorHttp } from '@comunica/bus-http';
import { KeysHttp } from '@comunica/context-entries';
import { ActionContextKey } from '@comunica/core';
import type { IMediatorTypeTime } from '@comunica/mediatortype-time';

export class ActorHttpLimitRate extends ActorHttp {
  private readonly mediatorHttp: MediatorHttp;
  private readonly requests: Record<string, { timestamps: number[]; timeout: NodeJS.Timeout }>;

  private static readonly keyWrapped = new ActionContextKey<boolean>('urn:comunica:actor-http-limit-rate#wrapped');

  public constructor(args: IActorHttpQueueArgs) {
    super(args);
    this.mediatorHttp = args.mediatorHttp;
    this.requests = {};
  }

  public async test(action: IActionHttp): Promise<IMediatorTypeTime> {
    if (action.context.has(ActorHttpLimitRate.keyWrapped)) {
      throw new Error(`${this.name} can only wrap a request once`);
    }
    const requestsPerSecond = action.context.get<number>(KeysHttp.httpRequestsPerSecond);
    if (!requestsPerSecond || requestsPerSecond < 1) {
      throw new Error(`${this.name} requires a rate limit of 1 or more to function`);
    }
    return { time: 0 };
  }

  public async run(action: IActionHttp): Promise<IActorHttpOutput> {
    const host = ActorHttpLimitRate.getInputUrl(action.input).host;
    const requestsPerSecond = action.context.getSafe<number>(KeysHttp.httpRequestsPerSecond);
    const currentTimestamp = Date.now();

    if (this.requests[host] === undefined || this.requests[host].timestamps.length < requestsPerSecond) {
      this.registerRequest(host, currentTimestamp, 0);
    } else {
      const oldestTimestamp = this.requests[host].timestamps.shift()!;
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

  public registerRequest(host: string, currentTimestamp: number, requestDelay: number): void {
    if (host in this.requests) {
      clearTimeout(this.requests[host].timeout);
    } else {
      this.requests[host] = { timestamps: [], timeout: <any>undefined };
    }
    this.requests[host].timestamps.push(currentTimestamp + requestDelay);
    this.requests[host].timeout = setTimeout(() => delete this.requests[host], requestDelay + 2_000);
  }
}

export interface IActorHttpQueueArgs extends IActorHttpArgs {
  /**
   * The HTTP mediator.
   */
  mediatorHttp: MediatorHttp;
}
