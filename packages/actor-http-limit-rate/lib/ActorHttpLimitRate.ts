import type { IActionHttp, IActorHttpOutput, IActorHttpArgs, MediatorHttp } from '@comunica/bus-http';
import { ActorHttp } from '@comunica/bus-http';
import type { ActorHttpInvalidateListenable, IActionHttpInvalidate } from '@comunica/bus-http-invalidate';
import type { TestResult } from '@comunica/core';
import { ActionContextKey, failTest, passTest } from '@comunica/core';
import type { IMediatorTypeTime } from '@comunica/mediatortype-time';

export class ActorHttpLimitRate extends ActorHttp {
  private readonly historyLength: number;
  private readonly failureMultiplier: number;
  private readonly limitByDefault: boolean;
  private readonly hostData: Record<string, IHostData>;
  private readonly httpInvalidator: ActorHttpInvalidateListenable;
  private readonly mediatorHttp: MediatorHttp;

  // Context key to indicate that the actor has already wrapped the given request
  private static readonly keyWrapped = new ActionContextKey<boolean>('urn:comunica:actor-http-limit-rate#wrapped');

  public constructor(args: IActorHttpLimitRateArgs) {
    super(args);
    this.mediatorHttp = args.mediatorHttp;
    this.httpInvalidator = args.httpInvalidator;
    this.httpInvalidator.addInvalidateListener(action => this.handleHttpInvalidateEvent(action));
    this.historyLength = args.historyLength;
    this.failureMultiplier = args.failureMultiplier;
    this.limitByDefault = args.limitByDefault;
    this.hostData = {};
  }

  public async test(action: IActionHttp): Promise<TestResult<IMediatorTypeTime>> {
    if (action.context.has(ActorHttpLimitRate.keyWrapped)) {
      return failTest(`${this.name} can only wrap a request once`);
    }
    return passTest({ time: 0 });
  }

  public async run(action: IActionHttp): Promise<IActorHttpOutput> {
    const requestUrl = ActorHttp.getInputUrl(action.input);
    const requestTimestamp = Date.now();

    const delayMilliseconds = this.registerNewRequest(requestUrl.hostname, requestTimestamp);

    if (delayMilliseconds > 0) {
      this.logDebug(action.context, 'Applying client-side rate limit via request delay', () => ({
        url: requestUrl.href,
        delay: delayMilliseconds,
        hostname: requestUrl.hostname,
      }));
      await new Promise(resolve => setTimeout(resolve, delayMilliseconds));
    }

    try {
      const response = await this.mediatorHttp.mediate({
        ...action,
        context: action.context.set(ActorHttpLimitRate.keyWrapped, true),
      });
      this.registerCompletedRequest(requestUrl.hostname, response.ok, requestTimestamp + delayMilliseconds);
      return response;
    } catch (error: unknown) {
      this.registerCompletedRequest(requestUrl.hostname, false, requestTimestamp + delayMilliseconds);
      throw error;
    }
  }

  /**
   * Register a new request being sent for a given host, and delay it when appropriate.
   * @param {string} hostname The host to which the request is being sent.
   * @param {number} timestamp The timestamp of when the request is being sent.
   * @returns {number} The delay to be applied to the request.
   */
  public registerNewRequest(hostname: string, timestamp: number): number {
    if (!this.hostData[hostname]) {
      this.hostData[hostname] = {
        openRequests: 0,
        latestRequest: 0,
        rateLimited: this.limitByDefault,
        responseTimes: [],
      };
    }
    let delay = 0;
    if (this.hostData[hostname].rateLimited) {
      const minimumDelay = ActorHttpLimitRate.calculateMinimumRequestDelay(
        this.hostData[hostname].responseTimes,
        this.hostData[hostname].openRequests,
      );
      delay = Math.max(0, this.hostData[hostname].latestRequest + minimumDelay - timestamp);
    }
    this.hostData[hostname].latestRequest = timestamp;
    this.hostData[hostname].openRequests++;
    return delay;
  }

  /**
   * Register a request as complete for a given host.
   * @param {string} hostname The host to which the request was sent.
   * @param {boolan} success Whether the request was successful.
   * @param {number} timestamp The timestamp of when the request was sent to the host.
   */
  public registerCompletedRequest(hostname: string, success: boolean, timestamp: number): void {
    const duration = Date.now() - timestamp;
    const durationMultiplier = success ? 1 : this.failureMultiplier;
    this.hostData[hostname].responseTimes.push(duration * durationMultiplier);
    this.hostData[hostname].openRequests--;
    // Mark hosts that are not rate limited as rate limited upon the first failing request
    if (!success && !this.hostData[hostname].rateLimited) {
      this.hostData[hostname].rateLimited = true;
    }
    // Ensure the history stays within the limits bu dropping oldest entry
    if (this.hostData[hostname].responseTimes.length > this.historyLength) {
      this.hostData[hostname].responseTimes.shift();
    }
  }

  /**
   * Calculate the delay to be applied to the next request as a weighted sum of the previous ones.
   * @param {number[]} responseTimes The durations of previous requests.
   * @param {number} openRequests The number of currently open requests.
   * @returns {number} The request delay in milliseconds.
   */
  public static calculateMinimumRequestDelay(responseTimes: number[], openRequests: number): number {
    let minimumDelay = 0;
    if (responseTimes.length > 0) {
      let total = 0;
      let divisor = 0;
      for (const [ i, requestDuration ] of responseTimes.entries()) {
        const weight = i + 1;
        total += weight * requestDuration;
        divisor += weight;
      }
      minimumDelay = Math.round(total / divisor);
    }
    return (1 + openRequests) * minimumDelay;
  }

  /**
   * Handles HTTP cache invalidation events.
   * @param {IActionHttpInvalidate} action The invalidation action
   */
  public handleHttpInvalidateEvent(action: IActionHttpInvalidate): void {
    const invalidatedHost = action.url ? new URL(action.url).host : undefined;
    for (const host of Object.keys(this.hostData)) {
      if (!invalidatedHost || host === invalidatedHost) {
        delete this.hostData[host];
      }
    }
  }
}

interface IHostData {
  /**
   * The number of requests currently open to the host.
   */
  openRequests: number;
  /**
   * The previous server response times.
   */
  responseTimes: number[];
  /**
   * The timestamp of the latest request that was sent.
   */
  latestRequest: number;
  /**
   * Whether the host is being rate-limited or not.
   */
  rateLimited: boolean;
}

export interface IActorHttpLimitRateArgs extends IActorHttpArgs {
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
   * The number of past response times to consider when spacing out future requests.
   * Increasing this value should result in smoother scaling of request intervals,
   * but might also make the actor slower to react to changes.
   * @default {20}
   */
  historyLength: number;
  /**
   * The response time of a failed request is taken into account with this multiplier applied.
   * Increasing this value will cause request rates to failing hosts to be reduced more aggressively.
   * When set to 1, a failing request will have the same weight as a successful one.
   * @default {10}
   */
  failureMultiplier: number;
  /**
   * Whether the actor should space out requests by default already, before any requests have failed.
   * Enabling this behaviour can help avoid situations where a server times out the query engine for an
   * unusually long period of time after an initial burst of too many requests, which will eventually
   * result in longer query execution times than with initial rate limiting applied to avoid such bursts.
   * @range {boolean}
   * @default {false}
   */
  limitByDefault: boolean;
}
