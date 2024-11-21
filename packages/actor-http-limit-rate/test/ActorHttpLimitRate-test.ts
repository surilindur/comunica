import type { MediatorHttp } from '@comunica/bus-http';
import type { IActionHttpInvalidate } from '@comunica/bus-http-invalidate';
import { ActionContext, Bus } from '@comunica/core';
import { ActorHttpLimitRate } from '../lib/ActorHttpLimitRate';
import '@comunica/utils-jest';

describe('ActorHttpLimitRate', () => {
  let bus: any;
  let actor: ActorHttpLimitRate;
  let mediatorHttp: MediatorHttp;
  let invalidateListeners: ((event: IActionHttpInvalidate) => void)[];

  const historyLength = 10;
  const failureMultiplier = 100;

  const url = 'http://localhost/some/url';
  const hostname = 'localhost';

  beforeEach(() => {
    jest.resetAllMocks();
    jest.restoreAllMocks();
    bus = new Bus({ name: 'bus' });
    invalidateListeners = [];
    mediatorHttp = <any>{
      mediate: jest.fn().mockRejectedValue(new Error('mediatorHttp.mediate')),
    };
    actor = new ActorHttpLimitRate({
      bus,
      failureMultiplier,
      historyLength,
      limitByDefault: false,
      httpInvalidator: <any>{
        addInvalidateListener: jest.fn(listener => invalidateListeners.push(listener)),
      },
      mediatorHttp,
      name: 'actor',
    });
    jest.spyOn((<any>actor), 'logDebug').mockImplementation((...args) => (<() => unknown>args[2])());
  });

  describe('test', () => {
    it('should wrap operation', async() => {
      const context = new ActionContext({});
      await expect(actor.test({ context, input: url })).resolves.toPassTest({ time: 0 });
    });

    it('should wrap operation only once', async() => {
      const context = new ActionContext({});
      await expect(actor.test({
        context: context.set((<any>ActorHttpLimitRate).keyWrapped, true),
        input: url,
      })).resolves.toFailTest(`${actor.name} can only wrap a request once`);
    });
  });

  describe('run', () => {
    it('should handle successful requests', async() => {
      jest.spyOn(Date, 'now').mockReturnValue(0);
      jest.spyOn(actor, 'registerNewRequest').mockReturnValue(0);
      jest.spyOn(actor, 'registerCompletedRequest').mockReturnValue(undefined);
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(<any>{ ok: true });
      jest.spyOn(globalThis, 'setTimeout').mockImplementation(callback => <any>callback());
      const action = { context: new ActionContext({}), input: url };
      await expect(actor.run(action)).resolves.toEqual({ ok: true });
      expect(actor.registerNewRequest).toHaveBeenCalledTimes(1);
      expect(actor.registerCompletedRequest).toHaveBeenCalledTimes(1);
      expect(globalThis.setTimeout).not.toHaveBeenCalled();
    });

    it('should handle successful requests with delay', async() => {
      jest.spyOn(Date, 'now').mockReturnValue(0);
      jest.spyOn(actor, 'registerNewRequest').mockReturnValue(1);
      jest.spyOn(actor, 'registerCompletedRequest').mockReturnValue(undefined);
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(<any>{ ok: true });
      jest.spyOn(globalThis, 'setTimeout').mockImplementation(callback => <any>callback());
      const action = { context: new ActionContext({}), input: url };
      await expect(actor.run(action)).resolves.toEqual({ ok: true });
      expect(actor.registerNewRequest).toHaveBeenCalledTimes(1);
      expect(actor.registerCompletedRequest).toHaveBeenCalledTimes(1);
      expect(globalThis.setTimeout).toHaveBeenCalledTimes(1);
      expect(globalThis.setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), 1);
    });

    it('should handle failing requests', async() => {
      const errorMessage = 'HTTP error';
      jest.spyOn(Date, 'now').mockReturnValue(0);
      jest.spyOn(actor, 'registerNewRequest').mockReturnValue(0);
      jest.spyOn(actor, 'registerCompletedRequest').mockReturnValue(undefined);
      jest.spyOn(mediatorHttp, 'mediate').mockRejectedValue(new Error(errorMessage));
      jest.spyOn(globalThis, 'setTimeout').mockImplementation(callback => <any>callback());
      const action = { context: new ActionContext({}), input: url };
      await expect(actor.run(action)).rejects.toThrow(errorMessage);
      expect(actor.registerNewRequest).toHaveBeenCalledTimes(1);
      expect(actor.registerCompletedRequest).toHaveBeenCalledTimes(1);
      expect(globalThis.setTimeout).not.toHaveBeenCalled();
    });
  });

  describe('registerNewRequest', () => {
    it('should register new requests successfully', () => {
      const timestamp = 100;
      jest.spyOn(ActorHttpLimitRate, 'calculateMinimumRequestDelay').mockReturnValue(123);
      expect(actor.registerNewRequest(hostname, timestamp)).toBe(0);
      expect((<any>actor).hostData[hostname]).toEqual({
        openRequests: 1,
        latestRequest: timestamp,
        rateLimited: false,
        responseTimes: [],
      });
      expect(ActorHttpLimitRate.calculateMinimumRequestDelay).not.toHaveBeenCalled();
    });

    it('should register new requests successfully when doing initial rate limits', () => {
      const timestamp = 100;
      (<any>actor).limitByDefault = true;
      jest.spyOn(ActorHttpLimitRate, 'calculateMinimumRequestDelay').mockReturnValue(123);
      expect(actor.registerNewRequest(hostname, timestamp)).toBe(23);
      expect((<any>actor).hostData[hostname]).toEqual({
        openRequests: 1,
        latestRequest: timestamp,
        rateLimited: true,
        responseTimes: [],
      });
      expect(ActorHttpLimitRate.calculateMinimumRequestDelay).toHaveBeenCalledTimes(1);
    });
  });

  describe('registerCompletedRequest', () => {
    it('should register successful requests and maintain history length', () => {
      const timestamp = 0;
      const data = {
        responseTimes: [],
        openRequests: historyLength + 2,
        rateLimited: false,
      };
      (<any>actor).hostData[hostname] = data;
      for (let i = 0; i < historyLength + 2; i++) {
        jest.spyOn(Date, 'now').mockReturnValue(i);
        expect(data.openRequests).toBe(historyLength + 2 - i);
        expect(actor.registerCompletedRequest(hostname, true, timestamp)).toBeUndefined();
        expect(data.openRequests).toBe(historyLength + 2 - i - 1);
        expect(data.responseTimes).toHaveLength(Math.min(historyLength, i + 1));
        expect(data.responseTimes.at(-1)).toBe(i);
      }
      expect(data.rateLimited).toBeFalsy();
      expect(data.openRequests).toBe(0);
    });

    it('should mark failing host as rate limited', () => {
      const data = {
        responseTimes: [],
        openRequests: 1,
        rateLimited: false,
      };
      (<any>actor).hostData[hostname] = data;
      jest.spyOn(Date, 'now').mockReturnValue(1);
      expect(data.rateLimited).toBeFalsy();
      expect(actor.registerCompletedRequest(hostname, false, 0)).toBeUndefined();
      expect(data.rateLimited).toBeTruthy();
      expect(data.openRequests).toBe(0);
    });
  });

  describe('calculateMinimumRequestDelay', () => {
    it.each([
      [ 'without data', [], 0, 0 ],
      [ 'with data', [ 3, 2, 1 ], 0, 2 ],
      [ 'with data and open requests', [ 3, 2, 1 ], 1, 4 ],
    ])('returns the appropriate delay %s', (_, responseTimes, openRequests, expected) => {
      expect(ActorHttpLimitRate.calculateMinimumRequestDelay(responseTimes, openRequests)).toBe(expected);
    });
  });

  describe('handleHttpInvalidateEvent', () => {
    it.each([
      [ 'specific host data when specified', url, 1 ],
      [ 'all host data when not specified', undefined, 0 ],
    ])('correctly clears %s', async(_, url, expectedDataCount) => {
      (<any>actor).hostData.localhost = 'localhost data';
      (<any>actor).hostData.otherhost = 'otherhost data';
      expect(Object.keys((<any>actor).hostData)).toHaveLength(2);
      for (const listener of invalidateListeners) {
        listener({ context: <any>{}, url });
      }
      expect(Object.keys((<any>actor).hostData)).toHaveLength(expectedDataCount);
    });
  });
});
