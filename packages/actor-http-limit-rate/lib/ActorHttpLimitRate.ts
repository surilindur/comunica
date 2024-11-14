import type { IActionHttp, IActorHttpOutput, IActorHttpArgs, MediatorHttp } from '@comunica/bus-http';
import { ActorHttp } from '@comunica/bus-http';
import type { ActorHttpInvalidateListenable, IActionHttpInvalidate } from '@comunica/bus-http-invalidate';
import type { TestResult } from '@comunica/core';
import { ActionContextKey, failTest, passTest } from '@comunica/core';
import type { IMediatorTypeTime } from '@comunica/mediatortype-time';

export class ActorHttpLimitRate extends ActorHttp {
  private readonly historyLength: number;
  private readonly failureMultiplier: number;
  private readonly requests: Record<string, IHostRequestData>;
  private readonly httpInvalidator: ActorHttpInvalidateListenable;
  private readonly mediatorHttp: MediatorHttp;

  // Context key to indicate that the actor has already wrapped the given request
  private static readonly keyWrapped = new ActionContextKey<boolean>('urn:comunica:actor-http-limit-rate#wrapped');

  public constructor(args: IActorHttpLimitConcurrentArgs) {
    super(args);
    this.mediatorHttp = args.mediatorHttp;
    this.httpInvalidator = args.httpInvalidator;
    this.httpInvalidator.addInvalidateListener(action => this.handleHttpInvalidateEvent(action));
    this.historyLength = args.historyLength;
    this.failureMultiplier = args.failureMultiplier;
    this.requests = {};
  }

  public async test(action: IActionHttp): Promise<TestResult<IMediatorTypeTime>> {
    if (action.context.has(ActorHttpLimitRate.keyWrapped)) {
      return failTest(`${this.name} can only wrap a request once`);
    }
    return passTest({ time: 0 });
  }

  public async run(action: IActionHttp): Promise<IActorHttpOutput> {
    const host = ActorHttp.getInputUrl(action.input).host;

    const wait = new Promise<void>((resolve, reject) => {
      const send = (): void => {
        this.requests[host].openRequests++;
        resolve();
      };
      if (typeof this.requests[host] === 'undefined') {
        this.requests[host] = {
          openRequests: 0,
          concurrentRequestLimit: 1,
          latestRequestTimestamp: 0,
          previousResponseTimes: [],
          requestQueue: [],
        };
      }
      if (this.requests[host].openRequests < this.requests[host].concurrentRequestLimit) {
        send();
      } else {
        this.requests[host].requestQueue.push({ send, cancel: reject });
      }
    });

    await wait;

    if (this.requests[host].previousResponseTimes.length > 0) {
      const interval = (
        this.requests[host].previousResponseTimes.reduce((a, b) => a + b) /
        this.requests[host].previousResponseTimes.length
      );
      const delay = this.requests[host].latestRequestTimestamp + interval - Date.now();
      if (delay > 1) {
        this.logDebug(action.context, 'Delaying request due to client-side rate limit', () => ({
          host,
          delay,
          minimumRequestInterval: interval,
          previousResponseTimes: this.requests[host].previousResponseTimes,
        }));
        await ActorHttp.sleep(delay);
      }
    }

    const timeStart = Date.now();

    this.requests[host].latestRequestTimestamp = timeStart;

    console.log(host, { open: this.requests[host].openRequests, concurrent: this.requests[host].concurrentRequestLimit });

    const response = await this.mediatorHttp.mediate({
      ...action,
      context: action.context.set(ActorHttpLimitRate.keyWrapped, true),
    });

    let duration = Date.now() - timeStart;

    if (response.ok) {
      if (this.requests[host].openRequests >= this.requests[host].concurrentRequestLimit) {
        this.requests[host].concurrentRequestLimit++;
      }
    } else {
      console.log('FAILED', response);
      duration *= this.failureMultiplier;
      this.requests[host].concurrentRequestLimit = Math.ceil(this.requests[host].concurrentRequestLimit * 0.5);
    }

    this.requests[host].previousResponseTimes.push(duration);

    if (this.requests[host].previousResponseTimes.length > this.historyLength) {
      this.requests[host].previousResponseTimes.shift();
    }

    this.requests[host].openRequests--;

    while (this.requests[host].openRequests < this.requests[host].concurrentRequestLimit) {
      const next = this.requests[host].requestQueue.shift();
      if (next) {
        next.send();
      } else {
        break;
      }
    }

    return response;
  }

  /**
   * Handles HTTP cache invalidation events.
   * @param {IActionHttpInvalidate} action The invalidation action
   */
  public handleHttpInvalidateEvent(action: IActionHttpInvalidate): void {
    const invalidatedHost = action.url ? new URL(action.url).host : undefined;
    for (const host of Object.keys(this.requests)) {
      if (!invalidatedHost || host === invalidatedHost) {
        for (const entry of this.requests[host].requestQueue) {
          entry.cancel();
        }
        delete this.requests[host];
      }
    }
  }
}

interface IHostRequestData {
  /**
   * The number of currently open requests to the host.
   */
  openRequests: number;
  /**
   * The timestamp of when the latest request was sent to the host.
   */
  latestRequestTimestamp: number;
  /**
   * Server response times for a number of previous requests.
   * The size of this tracker array is determined by the history length parameter.
   */
  previousResponseTimes: number[];
  /**
   * The estimated concurrent request limit for the host.
   */
  concurrentRequestLimit: number;
  /**
   * Queue containing all the pending requests that could not be immediately sent.
   */
  requestQueue: { send: () => void; cancel: () => void }[];
};

export interface IActorHttpLimitConcurrentArgs extends IActorHttpArgs {
  /**
   * The HTTP mediator.
   */
  mediatorHttp: MediatorHttp;
  /* eslint-disable max-len */
  /**
   * An actor that listens to HTTP invalidation events
   * @default {<default_invalidator> a <npmd:@comunica/bus-http-invalidate/^4.0.0/components/ActorHttpInvalidateListenable.jsonld#ActorHttpInvalidateListenable>}
   */
  httpInvalidator: ActorHttpInvalidateListenable;
  /* eslint-enable max-len */
  /**
   * The number of past requests to consider for the delay average.
   * @default {5}
   */
  historyLength: number;
  /**
   * The impact of a failed request is taken into account with this multiplier applied.
   * @default {10}
   */
  failureMultiplier: number;
}
