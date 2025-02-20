import type { MediatorHttp } from '@comunica/bus-http';
import type { IActionHttpInvalidate } from '@comunica/bus-http-invalidate';
import { ActionContext, Bus } from '@comunica/core';
import { ActorHttpLimitRate } from '../lib/ActorHttpLimitRate';
import '@comunica/utils-jest';

describe('ActorHttpLimitRate', () => {
  let bus: any;
  let actor: ActorHttpLimitRate;
  let mediatorHttp: MediatorHttp;
  let actorHostDelays: Map<string, number>;
  let invalidateListeners: ((event: IActionHttpInvalidate) => void)[];

  const correctionMultiplier = 0.1;
  const failureMultiplier = 10;

  const url = 'http://localhost:3000/some/url';
  const host = 'localhost:3000';

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
      correctionMultiplier,
      failureMultiplier,
      limitByDefault: false,
      httpInvalidator: <any>{
        addInvalidateListener: jest.fn(listener => invalidateListeners.push(listener)),
      },
      mediatorHttp,
      name: 'actor',
    });
    actorHostDelays = (<any>actor).hostDelays;
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
      const response = { ok: true };
      jest.spyOn(Date, 'now').mockReturnValueOnce(0);
      jest.spyOn(Date, 'now').mockReturnValueOnce(100);
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(<any>response);
      jest.spyOn(globalThis, 'setTimeout').mockImplementation(callback => <any>callback());
      const action = { context: new ActionContext({}), input: url };
      expect(actorHostDelays.has(host)).toBeFalsy();
      await expect(actor.run(action)).resolves.toEqual(response);
      expect(globalThis.setTimeout).not.toHaveBeenCalled();
      expect(actorHostDelays.has(host)).toBeFalsy();
    });

    it('should handle successful requests when limiting by default', async() => {
      const duration1 = 100;
      const duration2 = 200;
      const delay1 = duration1;
      const delay2 = delay1 + correctionMultiplier * (duration2 - delay1);
      const response = { ok: true };
      (<any>actor).limitByDefault = true;
      jest.spyOn(Date, 'now')
        .mockReturnValueOnce(0).mockReturnValueOnce(duration1)
        .mockReturnValueOnce(0).mockReturnValueOnce(duration2);
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(<any>response);
      jest.spyOn(globalThis, 'setTimeout').mockImplementation(callback => <any>callback());
      const action = { context: new ActionContext({}), input: url };
      expect(actorHostDelays.has(host)).toBeFalsy();
      // First call, when the duration is assigned as the delay
      await expect(actor.run(action)).resolves.toEqual(response);
      expect(globalThis.setTimeout).not.toHaveBeenCalled();
      expect(actorHostDelays.get(host)).toBe(delay1);
      // Second call, when the delay is adjusted based on the correction multiplier
      await expect(actor.run(action)).resolves.toEqual(response);
      expect(globalThis.setTimeout).toHaveBeenCalledTimes(1);
      expect(globalThis.setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), delay1);
      expect(actorHostDelays.get(host)).toBe(delay2);
    });

    it('should handle successful requests with delay', async() => {
      const response = { ok: true };
      jest.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(100);
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(<any>response);
      jest.spyOn(globalThis, 'setTimeout').mockImplementation(callback => <any>callback());
      const expectedDelay = 123456;
      actorHostDelays.set(host, expectedDelay);
      const action = { context: new ActionContext({}), input: url };
      await expect(actor.run(action)).resolves.toEqual(response);
      expect(globalThis.setTimeout).toHaveBeenCalledTimes(1);
      expect(globalThis.setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), expectedDelay);
    });

    it('should handle failing requests', async() => {
      const duration1 = 400;
      const duration2 = 600;
      const delay1 = duration1 * failureMultiplier;
      const delay2 = delay1 + correctionMultiplier * (failureMultiplier * duration2 - delay1);
      const response = { ok: false };
      jest.spyOn(Date, 'now')
        .mockReturnValueOnce(0).mockReturnValueOnce(duration1)
        .mockReturnValueOnce(0).mockReturnValueOnce(duration2);
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(<any>response);
      jest.spyOn(globalThis, 'setTimeout').mockImplementation(callback => <any>callback());
      const action = { context: new ActionContext({}), input: url };
      expect(actorHostDelays.has(host)).toBeFalsy();
      // First call, when the duration is assigned as the delay
      await expect(actor.run(action)).resolves.toEqual(response);
      expect(globalThis.setTimeout).not.toHaveBeenCalled();
      expect(actorHostDelays.get(host)).toBe(delay1);
      // Second call, when the delay is adjusted based on the correction multiplier
      await expect(actor.run(action)).resolves.toEqual(response);
      expect(globalThis.setTimeout).toHaveBeenCalledTimes(1);
      expect(globalThis.setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), delay1);
      expect(actorHostDelays.get(host)).toBe(delay2);
    });

    it('should handle mediator errors', async() => {
      const errorMessage = 'HTTP error';
      jest.spyOn(Date, 'now').mockReturnValueOnce(0);
      jest.spyOn(Date, 'now').mockReturnValueOnce(100);
      jest.spyOn(mediatorHttp, 'mediate').mockRejectedValue(new Error(errorMessage));
      jest.spyOn(globalThis, 'setTimeout').mockImplementation(callback => <any>callback());
      const action = { context: new ActionContext({}), input: url };
      await expect(actor.run(action)).rejects.toThrow(errorMessage);
      expect(globalThis.setTimeout).not.toHaveBeenCalled();
    });
  });

  describe('handleHttpInvalidateEvent', () => {
    it.each([
      [ 'specific host data when specified', url, 1 ],
      [ 'all host data when not specified', undefined, 0 ],
    ])('correctly clears %s', async(_, url, expectedSize) => {
      actorHostDelays.set(host, 1234);
      actorHostDelays.set('otherhost:3000', 4321);
      expect(actorHostDelays.size).toBe(2);
      for (const listener of invalidateListeners) {
        listener({ context: <any>{}, url });
      }
      expect(actorHostDelays.size).toBe(expectedSize);
    });
  });
});
