import type { IActionHttp, IActorHttpOutput, ActorHttp, MediatorHttp } from '@comunica/bus-http';
import { KeysHttp } from '@comunica/context-entries';
import type { IActorTest } from '@comunica/core';
import { Bus, ActionContext } from '@comunica/core';
import { ActorHttpLimitRate } from '../lib/ActorHttpLimitRate';

describe('ActorHttpLimitRate', () => {
  let bus: Bus<ActorHttp, IActionHttp, IActorTest, IActorHttpOutput>;
  let actor: ActorHttpLimitRate;
  let mediatorHttp: MediatorHttp;
  let input: URL;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
    mediatorHttp = <any> {
      mediate: jest.fn().mockRejectedValue(new Error('mediatorHttp.mediate called without mocking')),
    };
    input = new URL('http://example.org/abc');
    actor = new ActorHttpLimitRate({ bus, mediatorHttp, name: 'actor' });
    jest.resetAllMocks();
  });

  describe('test', () => {
    it('should reject without rate limit in the context', async() => {
      const context = new ActionContext();
      await expect(actor.test({ input: input.href, context })).rejects.toThrow(`${actor.name} requires a rate limit of 1 or more to function`);
    });

    it('should reject with retry count below 1 in the context', async() => {
      const context = new ActionContext({ [KeysHttp.httpRequestsPerSecond.name]: 0 });
      await expect(actor.test({ input: input.href, context })).rejects.toThrow(`${actor.name} requires a rate limit of 1 or more to function`);
    });

    it('should reject when the action has already been wrapped by it once', async() => {
      const context = new ActionContext({ [(<any>ActorHttpLimitRate).keyWrapped.name]: true });
      await expect(actor.test({ input: input.href, context })).rejects.toThrow(`${actor.name} can only wrap a request once`);
    });

    it('should accept when retry count is provided in the context', async() => {
      const context = new ActionContext({ [KeysHttp.httpRequestsPerSecond.name]: 1 });
      await expect(actor.test({ input: input.href, context })).resolves.toEqual({ time: 0 });
    });
  });

  describe('run', () => {
    beforeEach(() => {
      jest.spyOn(actor, 'registerRequest').mockImplementation(() => undefined);
      jest.spyOn(Date, 'now').mockReturnValue(0);
    });

    it('should handle one request', async() => {
      const context = new ActionContext({ [KeysHttp.httpRequestsPerSecond.name]: 1 });
      const response: Response = <any> { ok: true };
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(response);
      expect(mediatorHttp.mediate).not.toHaveBeenCalled();
      expect(actor.registerRequest).not.toHaveBeenCalled();
      await expect(actor.run({ input: input.href, context })).resolves.toEqual(response);
      expect(mediatorHttp.mediate).toHaveBeenCalledTimes(1);
      expect(actor.registerRequest).toHaveBeenCalledTimes(1);
      expect(actor.registerRequest).toHaveBeenNthCalledWith(1, input.host, 0, 0);
    });

    it('should properly delay requests above the limit', async() => {
      (<any>actor).requests[input.host] = { timestamps: [ 100 ], timeout: undefined };
      const context = new ActionContext({ [KeysHttp.httpRequestsPerSecond.name]: 1 });
      const response: Response = <any> { ok: true };
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(response);
      expect(mediatorHttp.mediate).not.toHaveBeenCalled();
      expect(actor.registerRequest).not.toHaveBeenCalled();
      await expect(actor.run({ input: input.href, context })).resolves.toEqual(response);
      expect(mediatorHttp.mediate).toHaveBeenCalledTimes(1);
      expect(actor.registerRequest).toHaveBeenCalledTimes(1);
      expect(actor.registerRequest).toHaveBeenNthCalledWith(1, input.host, 0, 1_100);
    });

    it('should propagate errors from the mediator', async() => {
      const error = new Error('mediator error');
      const context = new ActionContext({ [KeysHttp.httpRequestsPerSecond.name]: 1 });
      jest.spyOn(mediatorHttp, 'mediate').mockRejectedValue(error);
      await expect(actor.run({ input: input.href, context })).rejects.toThrow(error);
    });
  });

  describe('registerRequest', () => {
    it('should add new request to tracking structure', () => {
      jest.spyOn(globalThis, 'setTimeout').mockReturnValue(<any>'timeout');
      expect(setTimeout).not.toHaveBeenCalled();
      expect((<any>actor).requests[input.host]).toBeUndefined();
      actor.registerRequest(input.host, 100, 10);
      expect(setTimeout).toHaveBeenCalledTimes(1);
      expect(setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), 2_010);
      expect((<any>actor).requests[input.host]).toEqual({ timestamps: [ 110 ], timeout: 'timeout' });
    });

    it('should add new request to tracking structure with existing data', () => {
      jest.spyOn(globalThis, 'setTimeout').mockReturnValue(<any>'new timeout');
      jest.spyOn(globalThis, 'clearTimeout').mockReturnValue();
      expect(setTimeout).not.toHaveBeenCalled();
      expect(clearTimeout).not.toHaveBeenCalled();
      (<any>actor).requests[input.host] = { timestamps: [ 10, 50, 100 ], timeout: 'old timeout' };
      actor.registerRequest(input.host, 100, 10);
      expect(clearTimeout).toHaveBeenCalledTimes(1);
      expect(clearTimeout).toHaveBeenNthCalledWith(1, 'old timeout');
      expect(setTimeout).toHaveBeenCalledTimes(1);
      expect(setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), 2_010);
      expect((<any>actor).requests[input.host]).toEqual({ timestamps: [ 10, 50, 100, 110 ], timeout: 'new timeout' });
    });
  });
});
