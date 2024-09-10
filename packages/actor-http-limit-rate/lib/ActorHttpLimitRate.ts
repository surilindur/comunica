import type { IActionHttp, IActorHttpOutput, IActorHttpArgs, MediatorHttp } from '@comunica/bus-http';
import { ActorHttp } from '@comunica/bus-http';
import { ActionContextKey } from '@comunica/core';
import type { IMediatorTypeTime } from '@comunica/mediatortype-time';

export class ActorHttpLimitRate extends ActorHttp {
  private readonly mediatorHttp: MediatorHttp;
  private readonly concurrentRequestLimit: number;
  private readonly requestDelayLimit: number;
  private readonly requests: Record<string, IHostRequestLimitMetadata>;

  private static readonly keyWrapped = new ActionContextKey<boolean>('urn:comunica:actor-http-limit-rate#wrapped');

  public constructor(args: IActorHttpQueueArgs) {
    super(args);
    this.mediatorHttp = args.mediatorHttp;
    this.concurrentRequestLimit = args.concurrentRequestLimit;
    this.requestDelayLimit = args.requestDelayLimit;
    this.requests = {};
  }

  public async test(action: IActionHttp): Promise<IMediatorTypeTime> {
    if (action.context.has(ActorHttpLimitRate.keyWrapped)) {
      throw new Error(`${this.name} can only wrap a request once`);
    }
    return { time: 0 };
  }

  public async run(action: IActionHttp): Promise<IActorHttpOutput> {
    const host = ActorHttpLimitRate.getInputUrl(action.input).host;

    if (typeof this.requests[host] === 'undefined') {
      this.requests[host] = { queue: [], open: 0, limit: 1, delay: 1_000, previousSuccess: true };
    }

    // The enqueue function resolves the 'wait' promise, which triggers the actual request.
    // The 'queue' is essentially an array of these enqueue functions.
    let enqueue = (): void => {};

    const output = new Promise<IActorHttpOutput>((resolve, reject) => {
      let success = false;
      new Promise<void>((stopWaiting) => {
        enqueue = stopWaiting;
      }).then(() => {
        ActorHttpLimitRate.sleep(this.requests[host].delay).then(() => {
          this.requests[host].open++;
          this.mediatorHttp.mediate({
            ...action,
            context: action.context.set(ActorHttpLimitRate.keyWrapped, true),
          }).then((response) => {
            success = response.ok;
            resolve(response);
          }).catch(reject).finally(() => this.onRequestFinished(action, host, success));
        }).catch(reject);
      }).catch(reject);
    });

    if (this.requests[host].open < this.requests[host].limit) {
      enqueue();
    } else {
      this.requests[host].queue.push(enqueue);
    }

    return output;
  }

  /**
   * Register a request at a host as finished. This function will despatch the next requests from the queue,
   * as well as update the request limit and delay accordingly.
   * @param {IActionHttp} action The original action from run method.
   * @param {string} host The hostname for which the request was sent.
   * @param {boolean} success Whether the request was successful or not.
   */
  public onRequestFinished(action: IActionHttp, host: string, success: boolean): void {
    if (!success) {
      this.requests[host].delay = Math.min(this.requestDelayLimit, this.requests[host].delay * 2);
      this.requests[host].limit = Math.round(Math.sqrt(this.requests[host].limit));
    } else if (this.requests[host].previousSuccess) {
      this.requests[host].delay = Math.ceil(this.requests[host].delay * 0.9);
      if (
        this.requests[host].open >= this.requests[host].limit &&
        this.requests[host].limit < this.concurrentRequestLimit
      ) {
        this.requests[host].limit++;
      }
    }

    this.logDebug(action.context, `Finished request to ${host}`, () => ({
      success,
      previousSuccess: this.requests[host].previousSuccess,
      openRequests: this.requests[host].open,
      concurrentRequestLimit: this.requests[host].limit,
      requestQueueLength: this.requests[host].queue.length,
      requestDelayMilliseconds: this.requests[host].delay,
    }));

    this.requests[host].previousSuccess = success;
    this.requests[host].open--;

    for (let i = this.requests[host].limit - this.requests[host].open; i > 0; i--) {
      const next = this.requests[host].queue.shift();
      if (next) {
        next();
      }
    }
  }

  /**
   * Waits for the specified number of milliseconds.
   * @param {number} ms The amount of time to wait
   */
  public static async sleep(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms));
  }
}

interface IHostRequestLimitMetadata {
  /**
   * The pending request queue, containing functions
   * that trigger their correpsonding requests when invoked.
   */
  queue: (() => void)[];
  /**
   * The number of open requests at the host.
   */
  open: number;
  /**
   * The delay between subsequent requests.
   */
  delay: number;
  /**
   * The concurrent open request limit.
   */
  limit: number;
  /**
   * Whether the previous request was a success or not,
   * to determine whether rate limits should be adjusted or not.
   */
  previousSuccess: boolean;
};

export interface IActorHttpQueueArgs extends IActorHttpArgs {
  /**
   * The HTTP mediator.
   */
  mediatorHttp: MediatorHttp;
  /**
   * The maximum number of concurrent requests to send to a server.
   * @default {1000}
   */
  concurrentRequestLimit: number;
  /**
   * The maximum delay between subsequent requests.
   * @default {60000}
   */
  requestDelayLimit: number;
}
