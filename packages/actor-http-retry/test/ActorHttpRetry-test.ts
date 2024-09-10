import type { IActionHttp, IActorHttpOutput, ActorHttp, MediatorHttp } from '@comunica/bus-http';
import { KeysHttp } from '@comunica/context-entries';
import type { IActorTest } from '@comunica/core';
import { Bus, ActionContext } from '@comunica/core';
import { ActorHttpRetry } from '../lib/ActorHttpRetry';

describe('ActorHttpRetry', () => {
  let bus: Bus<ActorHttp, IActionHttp, IActorTest, IActorHttpOutput>;
  let actor: ActorHttpRetry;
  let mediatorHttp: MediatorHttp;
  let input: string;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
    mediatorHttp = <any> {
      mediate: jest.fn().mockRejectedValue(new Error('mediatorHttp.mediate called without mocking')),
    };
    input = 'http://example.org/abc';
    actor = new ActorHttpRetry({ bus, mediatorHttp, name: 'actor' });
    jest.resetAllMocks();
  });

  describe('test', () => {
    it('should reject without retry count in the context', async() => {
      const context = new ActionContext();
      await expect(actor.test({ input, context })).rejects.toThrow(`${actor.name} requires a retry count greater than zero to function`);
    });

    it('should reject with retry count below 1 in the context', async() => {
      const context = new ActionContext({ [KeysHttp.httpRetryCount.name]: 0 });
      await expect(actor.test({ input, context })).rejects.toThrow(`${actor.name} requires a retry count greater than zero to function`);
    });

    it('should reject when the action has already been wrapped by it once', async() => {
      const context = new ActionContext({ [(<any>ActorHttpRetry).keyWrapped.name]: true });
      await expect(actor.test({ input, context })).rejects.toThrow(`${actor.name} can only wrap a request once`);
    });

    it('should accept when retry count is provided in the context', async() => {
      const context = new ActionContext({ [KeysHttp.httpRetryCount.name]: 1 });
      await expect(actor.test({ input, context })).resolves.toEqual({ time: 0 });
    });
  });

  describe('run', () => {
    beforeEach(() => {
      jest.spyOn(actor, 'waitUntil').mockResolvedValue();
      jest.spyOn(actor, 'parseRetryAfterHeader').mockReturnValue(new Date(0));
    });

    it('should handle an immediately successful request', async() => {
      const context = new ActionContext({ [KeysHttp.httpRetryCount.name]: 1 });
      const response: Response = <any> { ok: true };
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(response);
      expect(actor.waitUntil).not.toHaveBeenCalled();
      expect(actor.parseRetryAfterHeader).not.toHaveBeenCalled();
      expect(mediatorHttp.mediate).not.toHaveBeenCalled();
      await expect(actor.run({ input, context })).resolves.toEqual(response);
      expect(actor.waitUntil).not.toHaveBeenCalled();
      expect(actor.parseRetryAfterHeader).not.toHaveBeenCalled();
      expect(mediatorHttp.mediate).toHaveBeenCalledTimes(1);
    });

    it('should handle error codes in the 400 range', async() => {
      const context = new ActionContext({ [KeysHttp.httpRetryCount.name]: 1 });
      const response: Response = <any> { ok: false, status: 400 };
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(response);
      expect(actor.waitUntil).not.toHaveBeenCalled();
      expect(actor.parseRetryAfterHeader).not.toHaveBeenCalled();
      expect(mediatorHttp.mediate).not.toHaveBeenCalled();
      await expect(actor.run({ input, context })).rejects.toThrow(`Dereferencing failed after 1 attempts: ${input}`);
      expect(actor.waitUntil).not.toHaveBeenCalled();
      expect(actor.parseRetryAfterHeader).not.toHaveBeenCalled();
      expect(mediatorHttp.mediate).toHaveBeenCalledTimes(1);
    });

    it('should handle error codes in the 500 range', async() => {
      const context = new ActionContext({ [KeysHttp.httpRetryCount.name]: 1 });
      const response: Response = <any> { ok: false, status: 500 };
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(response);
      expect(actor.waitUntil).not.toHaveBeenCalled();
      expect(actor.parseRetryAfterHeader).not.toHaveBeenCalled();
      expect(mediatorHttp.mediate).not.toHaveBeenCalled();
      await expect(actor.run({ input, context })).rejects.toThrow(`Dereferencing failed after 1 attempts: ${input}`);
      expect(actor.waitUntil).not.toHaveBeenCalled();
      expect(actor.parseRetryAfterHeader).not.toHaveBeenCalled();
      expect(mediatorHttp.mediate).toHaveBeenCalledTimes(1);
    });

    it('should handle server-side rate limiting with retry-after header', async() => {
      const retryAfterDate = new Date(1_000);
      jest.spyOn(Date, 'now').mockReturnValue(0);
      jest.spyOn(actor, 'parseRetryAfterHeader').mockReturnValue(retryAfterDate);
      jest.spyOn(globalThis, 'setTimeout').mockImplementation((callback, ms?: number) => <any>callback());
      const context = new ActionContext({ [KeysHttp.httpRetryCount.name]: 1 });
      const response: Response = <any> { ok: false, status: 429, headers: new Headers({ 'retry-after': '1000' }) };
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(response);
      expect(actor.waitUntil).not.toHaveBeenCalled();
      expect(actor.parseRetryAfterHeader).not.toHaveBeenCalled();
      expect(mediatorHttp.mediate).not.toHaveBeenCalled();
      await expect(actor.run({ input, context })).rejects.toThrow(`Dereferencing failed after 2 attempts: ${input}`);
      expect(actor.waitUntil).toHaveBeenCalledTimes(1);
      expect(actor.waitUntil).toHaveBeenNthCalledWith(1, retryAfterDate);
      expect(actor.parseRetryAfterHeader).toHaveBeenCalledTimes(2);
      expect(actor.parseRetryAfterHeader).toHaveBeenNthCalledWith(1, '1000');
      expect(actor.parseRetryAfterHeader).toHaveBeenNthCalledWith(2, '1000');
      expect(mediatorHttp.mediate).toHaveBeenCalledTimes(2);
    });

    it('should handle server-side rate limiting without retry-after header', async() => {
      const retryAfterDate = new Date(200);
      jest.spyOn(Date, 'now').mockReturnValue(0);
      jest.spyOn(actor, 'parseRetryAfterHeader').mockReturnValue(retryAfterDate);
      jest.spyOn(globalThis, 'setTimeout').mockImplementation((callback, ms?: number) => <any>callback());
      const context = new ActionContext({ [KeysHttp.httpRetryCount.name]: 1, [KeysHttp.httpRetryDelay.name]: 200 });
      const response: Response = <any> { ok: false, status: 429, headers: new Headers() };
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(response);
      expect(actor.waitUntil).not.toHaveBeenCalled();
      expect(actor.parseRetryAfterHeader).not.toHaveBeenCalled();
      expect(mediatorHttp.mediate).not.toHaveBeenCalled();
      await expect(actor.run({ input, context })).rejects.toThrow(`Dereferencing failed after 2 attempts: ${input}`);
      expect(actor.waitUntil).toHaveBeenCalledTimes(1);
      expect(actor.waitUntil).toHaveBeenNthCalledWith(1, retryAfterDate);
      expect(actor.parseRetryAfterHeader).toHaveBeenCalledTimes(2);
      expect(actor.parseRetryAfterHeader).toHaveBeenNthCalledWith(1, '200');
      expect(actor.parseRetryAfterHeader).toHaveBeenNthCalledWith(2, '200');
      expect(mediatorHttp.mediate).toHaveBeenCalledTimes(2);
    });

    it('should propagate errors from the mediator', async() => {
      const error = new Error('mediator error');
      const context = new ActionContext({ [KeysHttp.httpRetryCount.name]: 1 });
      jest.spyOn(mediatorHttp, 'mediate').mockRejectedValue(error);
      await expect(actor.run({ input, context })).rejects.toThrow(error);
    });
  });

  describe('waitUntil', () => {
    beforeEach(() => {
      jest.spyOn(globalThis, 'setTimeout').mockImplementation((callback, ms?: number) => <any> callback());
    });

    it('should wait until the specified time', async() => {
      jest.spyOn(Date, 'now').mockReturnValue(0);
      expect(Date.now).not.toHaveBeenCalled();
      expect(setTimeout).not.toHaveBeenCalled();
      const waitTimeMilliseconds = 100;
      await actor.waitUntil(new Date(waitTimeMilliseconds));
      expect(Date.now).toHaveBeenCalledTimes(1);
      expect(setTimeout).toHaveBeenCalledTimes(1);
      expect(setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), waitTimeMilliseconds);
    });

    it('should return immediately if the time is in the past', async() => {
      jest.spyOn(Date, 'now').mockReturnValue(100);
      expect(Date.now).not.toHaveBeenCalled();
      expect(setTimeout).not.toHaveBeenCalled();
      await actor.waitUntil(new Date(10));
      expect(Date.now).toHaveBeenCalledTimes(1);
      expect(setTimeout).toHaveBeenCalledTimes(1);
      expect(setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), 0);
    });
  });

  describe('parseRetryAfterHeader', () => {
    beforeEach(() => {
      jest.spyOn(Date, 'now').mockReturnValue(0);
    });

    it('should parse integer header', () => {
      expect(Date.now).not.toHaveBeenCalled();
      expect(actor.parseRetryAfterHeader('1')).toEqual(new Date(1_000));
      expect(Date.now).toHaveBeenCalledTimes(1);
    });

    it('should parse date string header', () => {
      expect(actor.parseRetryAfterHeader('Thu, 01 Jan 1970 00:00:01 GMT')).toEqual(new Date(1_000));
    });

    it('should reject invalid header value', () => {
      expect(() => actor.parseRetryAfterHeader('a b c')).toThrow('Invalid Retry-After header: a b c');
    });
  });
});
