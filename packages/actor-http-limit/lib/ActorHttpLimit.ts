import type { IActionHttp, IActorHttpOutput, IActorHttpArgs, MediatorHttp } from '@comunica/bus-http';
import { ActorHttp } from '@comunica/bus-http';
import { ActionContextKey } from '@comunica/core';
import type { IMediatorTypeTime } from '@comunica/mediatortype-time';

export class ActorHttpLimit extends ActorHttp {
  private readonly mediatorHttp: MediatorHttp;
  private readonly requestQueues: Record<string, Promise<IActorHttpOutput>[]>;
  private readonly requestIntervalMS: number;

  public constructor(args: IActorHttpLimitArgs) {
    super(args);
    this.mediatorHttp = args.mediatorHttp;
    this.requestIntervalMS = 1_000 / args.requestsPerSecond;
    this.requestQueues = {};
  }

  public async test(action: IActionHttp): Promise<IMediatorTypeTime> {
    if (action.context.has(KEY_WRAPPED)) {
      throw new Error(`${this.name} will only wrap request once`);
    }
    return { time: 0 };
  }

  public async run(action: IActionHttp): Promise<IActorHttpOutput> {
    const host = new URL(action.input instanceof Request ? action.input.url : action.input).host;

    if (this.requestQueues[host] === undefined) {
      this.requestQueues[host] = [ <any> Promise.resolve() ];
    }

    const previousIndex = this.requestQueues[host].length - 1;
    const previousRequest = this.requestQueues[host][previousIndex];
    const removePreviousRequest = (): void => {
      <any> this.requestQueues[host].splice(previousIndex, 1);
    };

    const promise = new Promise<IActorHttpOutput>((resolve, reject) => {
      previousRequest.then(() => {
        removePreviousRequest();
        setTimeout(() => {
          // eslint-disable-next-line max-len, no-console
          console.log('Request', host, 'with queue size', this.requestQueues[host].length, 'at intervals of', this.requestIntervalMS, 'MS');
          this.mediatorHttp.mediate({
            ...action,
            context: action.context.set(KEY_WRAPPED, true),
          }).then(resolve).catch(reject);
        }, this.requestIntervalMS);
      }).catch((error) => {
        removePreviousRequest();
        reject(error);
      });
    });

    this.requestQueues[host].push(promise);

    return promise;
  }
}

export interface IActorHttpLimitArgs extends IActorHttpArgs {
  /**
   * The HTTP mediator.
   */
  mediatorHttp: MediatorHttp;
  /**
   * Limit the average number of requests per host per second.
   */
  requestsPerSecond: number;
}

const KEY_WRAPPED = new ActionContextKey<boolean>('urn:comunica:actor-http-limit#wrapped');
