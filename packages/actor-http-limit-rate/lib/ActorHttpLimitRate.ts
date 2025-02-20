import type { IActionHttp, IActorHttpOutput, IActorHttpArgs, MediatorHttp } from '@comunica/bus-http';
import { ActorHttp } from '@comunica/bus-http';
import type { ActorHttpInvalidateListenable, IActionHttpInvalidate } from '@comunica/bus-http-invalidate';
import type { TestResult } from '@comunica/core';
import { ActionContextKey, failTest, passTest } from '@comunica/core';
import type { IMediatorTypeTime } from '@comunica/mediatortype-time';

export class ActorHttpLimitRate extends ActorHttp {
  private readonly hostDelays: Map<string, number>;
  private readonly correctionMultiplier: number;
  private readonly failureMultiplier: number;
  private readonly limitByDefault: boolean;
  private readonly httpInvalidator: ActorHttpInvalidateListenable;
  private readonly mediatorHttp: MediatorHttp;

  // Context key to indicate that the actor has already wrapped the given request
  private static readonly keyWrapped = new ActionContextKey<boolean>('urn:comunica:actor-http-limit-rate#wrapped');

  public constructor(args: IActorHttpLimitRateArgs) {
    super(args);
    this.mediatorHttp = args.mediatorHttp;
    this.httpInvalidator = args.httpInvalidator;
    this.httpInvalidator.addInvalidateListener(action => this.handleHttpInvalidateEvent(action));
    this.correctionMultiplier = args.correctionMultiplier;
    this.failureMultiplier = args.failureMultiplier;
    this.limitByDefault = args.limitByDefault;
    this.hostDelays = new Map();
  }

  public async test(action: IActionHttp): Promise<TestResult<IMediatorTypeTime>> {
    if (action.context.has(ActorHttpLimitRate.keyWrapped)) {
      return failTest(`${this.name} can only wrap a request once`);
    }
    return passTest({ time: 0 });
  }

  public async run(action: IActionHttp): Promise<IActorHttpOutput> {
    const requestUrl = ActorHttp.getInputUrl(action.input);

    if (this.hostDelays.has(requestUrl.host)) {
      const requestDelay = this.hostDelays.get(requestUrl.host);
      this.logDebug(action.context, 'Applying client-side rate limit via request delay', () => ({
        url: requestUrl.href,
        delay: requestDelay,
        host: requestUrl.host,
      }));
      await new Promise(resolve => setTimeout(resolve, requestDelay));
    }

    const requestSent = Date.now();

    const updateHostDelay = (success: boolean): void => {
      const previousDelay = this.hostDelays.get(requestUrl.host);
      if (previousDelay !== undefined || !success || this.limitByDefault) {
        const requestDuration = (success ? 1 : this.failureMultiplier) * (Date.now() - requestSent);
        const correctedDelay = Math.round(previousDelay === undefined ?
          requestDuration :
          previousDelay + this.correctionMultiplier * (requestDuration - previousDelay));
        this.hostDelays.set(requestUrl.host, correctedDelay);
        console.log(requestUrl.host, { requestDuration, previousDelay, correctedDelay });
      }
    };

    try {
      const response = await this.mediatorHttp.mediate({
        ...action,
        context: action.context.set(ActorHttpLimitRate.keyWrapped, true),
      });
      updateHostDelay(response.ok);
      return response;
    } catch (error: unknown) {
      updateHostDelay(false);
      throw error;
    }
  }

  /**
   * Handles HTTP cache invalidation events.
   * @param {IActionHttpInvalidate} action The invalidation action
   */
  public handleHttpInvalidateEvent(action: IActionHttpInvalidate): void {
    if (action.url) {
      const invalidatedHost = new URL(action.url).host;
      this.hostDelays.delete(invalidatedHost);
    } else {
      this.hostDelays.clear();
    }
  }
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
   * Multiplier for how aggressively the delay should follow the latest response time, ideally in range ]0.0, 1.0].
   * @range {float}
   * @default {0.01}
   */
  correctionMultiplier: number;
  /**
   * The response time of a failed request is taken into account with this multiplier applied.
   * @range {float}
   * @default {100}
   */
  failureMultiplier: number;
  /**
   * Whether the actor should perform rate limiting from the beginning, before any requests have failed.
   * Enabling this behaviour can help pre-emptively avoid situations where a server times out the client
   * due to perceived spam when rate limiting is not initially applied.
   * @range {boolean}
   * @default {true}
   */
  limitByDefault: boolean;
}
