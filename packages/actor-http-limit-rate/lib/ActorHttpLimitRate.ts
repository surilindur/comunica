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

    // Wait for the next free request slot on the host
    await this.waitForSlot(host);

    // If the request is not the first one, wait for the calculated amount of time.
    if (this.requests[host].responseTimes.length > 0) {
      const interval = (
        this.requests[host].responseTimes.reduce((a, b) => a + b) /
        this.requests[host].responseTimes.length
      );
      // Delay is calculated from when the latest request was sent to the same host
      const requestDelay = this.requests[host].latestRequestTimestamp + interval - Date.now();
      if (requestDelay > 1) {
        this.logDebug(action.context, 'Delaying request due to client-side rate limit', () => ({
          host,
          requestDelay,
          minimumRequestInterval: interval,
          responseTimes: this.requests[host].responseTimes,
        }));
        await new Promise(resolve => setTimeout(resolve, requestDelay));
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
        const previousOk = this.requests[host].requestsSuccessful.every(Boolean);
        console.log(host, previousOk, this.requests[host].requestsSuccessful);
        if (previousOk) {
          this.requests[host].concurrentRequestLimit++;
          console.log('BUMP LIMIT', host);
        }
      }
    } else {
      console.log('FAILED', host);
      duration *= this.failureMultiplier;
      this.requests[host].concurrentRequestLimit = Math.ceil(this.requests[host].concurrentRequestLimit * 0.5);
    }

    this.requests[host].responseTimes.push(duration);
    this.requests[host].requestsSuccessful.push(response.ok);

    if (this.requests[host].responseTimes.length > this.historyLength) {
      this.requests[host].responseTimes.shift();
      this.requests[host].requestsSuccessful.shift();
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
   * Waits for a free request slot for the specified host,
   * and resolves when one becomes available.
   * @param {string} host The host for which the request is to be sent.
   */
  public async waitForSlot(host: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const send = (): void => {
        // Immediately reserve the free slot by incrementing the 'active requests' counter.
        this.requests[host].openRequests++;
        resolve();
      };

      if (typeof this.requests[host] === 'undefined') {
        this.requests[host] = {
          openRequests: 0,
          concurrentRequestLimit: 1,
          latestRequestTimestamp: 0,
          requestsSuccessful: [],
          responseTimes: [],
          requestQueue: [],
        };
      }

      // When there are free slots, send the request immediately, otherwise add to queue
      if (this.requests[host].openRequests < this.requests[host].concurrentRequestLimit) {
        send();
      } else {
        this.requests[host].requestQueue.push({ send, cancel: reject });
      }
    });
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
  responseTimes: number[];
  /**
   * Whether the previous requests were successful or not.
   */
  requestsSuccessful: boolean[];
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
   * @default {20}
   */
  historyLength: number;
  /**
   * The impact of a failed request is taken into account with this multiplier applied.
   * @default {10}
   */
  failureMultiplier: number;
}
