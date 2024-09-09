import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import type { IActionHttp, IActorHttpOutput } from '@comunica/bus-http';
import { ActorHttp } from '@comunica/bus-http';
import { KeysCore, KeysHttp } from '@comunica/context-entries';
import type { IActorTest } from '@comunica/core';
import { ActionContext, Bus } from '@comunica/core';
import { LoggerVoid } from '@comunica/logger-void';
import type { IActionContext } from '@comunica/types';
import { Readable } from 'readable-stream';
import { ActorHttpFetch } from '../lib/ActorHttpFetch';
import { resolve } from 'node:path';

jest.mock('../lib/FetchInitPreprocessor');

describe('ActorHttpFetch', () => {
  let bus: Bus<ActorHttp, IActionHttp, IActorTest, IActorHttpOutput>;
  let input: string;
  let actor: ActorHttpFetch;
  let context: IActionContext;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
    input = 'http://example.org/';
    context = new ActionContext();
    actor = new ActorHttpFetch({ name: 'actor', bus });
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    jest.resetAllMocks();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create new instances', () => {
      expect(actor).toBeInstanceOf(ActorHttpFetch);
      expect(actor).toBeInstanceOf(ActorHttp);
    });
  });

  describe('test', () => {
    it('should provide infinite time estimate', async() => {
      await expect(actor.test(<any>{})).resolves.toEqual({ time: Number.POSITIVE_INFINITY });
    });
  });

  describe('run', () => {
    let headers: Headers;

    beforeEach(() => {
      headers = new Headers();
      jest.spyOn(actor, 'prepareRequestHeaders').mockReturnValue(headers);
      jest.spyOn(ActorHttp, 'headersToHash').mockReturnValue(<any>'headersDict');
      jest.replaceProperty(<any>actor, 'fetchInitPreprocessor', {
        handle: jest.fn().mockResolvedValue('requestInit'),
        createAbortController: jest.fn().mockResolvedValue(new AbortController()),
      });
    });

    it('should call fetch and return its output', async() => {
      const response = 'response';
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(<any>response);
      await expect(actor.run({ input, context })).resolves.toBe(response);
      expect(actor.prepareRequestHeaders).toHaveBeenCalledTimes(1);
      expect(ActorHttp.headersToHash).not.toHaveBeenCalled();
      expect((<any>actor).fetchInitPreprocessor.handle).toHaveBeenCalledTimes(1);
      expect((<any>actor).fetchInitPreprocessor.handle).toHaveBeenNthCalledWith(1, { method: 'GET', headers });
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch).toHaveBeenNthCalledWith(1, input, 'requestInit');
    });

    it('should call custom fetch and return its output', async() => {
      const response = 'custom fetch response';
      const customFetch = jest.fn().mockResolvedValue('custom fetch response');
      const contextWithFetch = context.set(KeysHttp.fetch, customFetch);
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(<any>'default fetch response');
      await expect(actor.run({ input, context: contextWithFetch })).resolves.toBe(response);
      expect(actor.prepareRequestHeaders).toHaveBeenCalledTimes(1);
      // TODO: the headersToHash will no longer be called once the workaround in the actor is removed
      expect(ActorHttp.headersToHash).toHaveBeenCalledTimes(1);
      expect(ActorHttp.headersToHash).toHaveBeenNthCalledWith(1, headers);
      expect((<any>actor).fetchInitPreprocessor.handle).toHaveBeenCalledTimes(1);
      expect((<any>actor).fetchInitPreprocessor.handle).toHaveBeenNthCalledWith(1, {
        method: 'GET',
        headers: 'headersDict',
      });
      expect(globalThis.fetch).not.toHaveBeenCalled();
      expect(customFetch).toHaveBeenCalledTimes(1);
      expect(customFetch).toHaveBeenNthCalledWith(1, input, 'requestInit');
    });

    it('should handle included credentials', async() => {
      const response = 'response';
      const contextWithFlag = context.set(KeysHttp.includeCredentials, true);
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(<any>response);
      await expect(actor.run({ input, context: contextWithFlag })).resolves.toBe(response);
      expect(actor.prepareRequestHeaders).toHaveBeenCalledTimes(1);
      expect(ActorHttp.headersToHash).not.toHaveBeenCalled();
      expect((<any>actor).fetchInitPreprocessor.handle).toHaveBeenCalledTimes(1);
      expect((<any>actor).fetchInitPreprocessor.handle).toHaveBeenNthCalledWith(1, {
        method: 'GET',
        credentials: 'include',
        headers,
      });
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch).toHaveBeenNthCalledWith(1, input, 'requestInit');
    });

    // TODO: this is a workaround and can be removed when cross-fetch/node-fetch has been dropped
    it('should patch response.body.cancel for node-fetch', async() => {
      const response = { body: { destroy: jest.fn() }};
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(<any>response);
      const output = await actor.run({ input, context });
      expect(output.body!.cancel).toBeInstanceOf(Function);
      expect((<any>output.body).destroy).toBe(response.body.destroy);
      expect(actor.prepareRequestHeaders).toHaveBeenCalledTimes(1);
      expect(ActorHttp.headersToHash).not.toHaveBeenCalled();
      expect((<any>actor).fetchInitPreprocessor.handle).toHaveBeenCalledTimes(1);
      expect((<any>actor).fetchInitPreprocessor.handle).toHaveBeenNthCalledWith(1, { method: 'GET', headers });
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
      expect(globalThis.fetch).toHaveBeenNthCalledWith(1, input, 'requestInit');
      // Attempt to call the close method, which is expected to invoke the destroy
      const error = 'cancel error';
      await expect(output.body!.cancel(error)).resolves.not.toThrow();
      expect(response.body.destroy).toHaveBeenCalledTimes(1);
      expect(response.body.destroy).toHaveBeenNthCalledWith(1, error);
    });

    it('should handle initial response timeout when it is reached', async() => {
      const timeoutMilliseconds = 10_000;
      const contextWithTimeout = context.set(KeysHttp.httpTimeout, timeoutMilliseconds);
      const expectedError = new Error(`Dereferencing timed out for ${input} after ${timeoutMilliseconds} ms`);
      // Mocks the fetch output to a promise that is never resolved, to mimick no reply from server,
      // and makes sure the promise is rejected on abort signal to simulate the fetch functionality
      jest.spyOn(globalThis, 'fetch').mockImplementation((_, init) => {
        return new Promise((_, reject) => init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason)));
      });
      jest.spyOn(globalThis, 'setTimeout');
      jest.spyOn(globalThis, 'clearTimeout');
      jest.spyOn((<any>actor).fetchInitPreprocessor, 'handle').mockResolvedValue({});
      const errorHandler = jest.fn();
      const successHandler = jest.fn();
      actor.run({ input, context: contextWithTimeout }).then(successHandler).catch(errorHandler);
      await jest.runAllTimersAsync();
      expect(successHandler).not.toHaveBeenCalled();
      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler).toHaveBeenNthCalledWith(1, expectedError);
      expect(globalThis.setTimeout).toHaveBeenCalledTimes(1);
      expect(globalThis.setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), timeoutMilliseconds);
      expect(globalThis.clearTimeout).not.toHaveBeenCalled();
    });

    it('should handle initial response timeout when it is not reached', async() => {
      const response = 'response';
      const timeoutMilliseconds = 10_000;
      const contextWithTimeout = context.set(KeysHttp.httpTimeout, timeoutMilliseconds);
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(<any>response);
      jest.spyOn(globalThis, 'setTimeout');
      jest.spyOn(globalThis, 'clearTimeout');
      jest.spyOn((<any>actor).fetchInitPreprocessor, 'handle').mockResolvedValue({});
      await expect(actor.run({ input, context: contextWithTimeout })).resolves.toBe(response);
      expect(globalThis.setTimeout).toHaveBeenCalledTimes(1);
      expect(globalThis.setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), timeoutMilliseconds);
      expect(globalThis.clearTimeout).toHaveBeenCalledTimes(1);
    });

    it('should handle response body timeout when it is reached', async() => {
      const timeoutMilliseconds = 10_000;
      const contextWithTimeout = context
        .set(KeysHttp.httpTimeout, timeoutMilliseconds)
        .set(KeysHttp.httpBodyTimeout, true);
      const expectedError = new Error(`Dereferencing timed out for ${input} after ${timeoutMilliseconds} ms`);
      jest.spyOn(globalThis, 'fetch').mockImplementation((_, init) => {
        let bodyReadReject: Function;
        const body = new ReadableStream({
          pull: () => new Promise((_, reject) => {
            bodyReadReject = reject;
          }),
        });
        init!.signal!.addEventListener('abort', () => {
          const error = init!.signal!.reason;
          bodyReadReject(error);
        });
        return Promise.resolve(<any>{ body });
      });
      jest.spyOn(globalThis, 'setTimeout');
      jest.spyOn(globalThis, 'clearTimeout');
      jest.spyOn((<any>actor).fetchInitPreprocessor, 'handle').mockResolvedValue({});
      const response = await actor.run({ input, context: contextWithTimeout });
      const responseReader = response.body!.getReader();
      const errorHandler = jest.fn();
      const successHandler = jest.fn();
      responseReader.read().then(successHandler).catch(errorHandler);
      await jest.runAllTimersAsync();
      expect(successHandler).not.toHaveBeenCalled();
      expect(errorHandler).toHaveBeenCalledTimes(1);
      expect(errorHandler).toHaveBeenNthCalledWith(1, expectedError);
      expect(globalThis.setTimeout).toHaveBeenCalledTimes(1);
      expect(globalThis.setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), timeoutMilliseconds);
      expect(globalThis.clearTimeout).not.toHaveBeenCalled();
    });

    it('should handle response body timeout when it is not reached', async() => {
      const timeoutMilliseconds = 10_000;
      const contextWithTimeout = context
        .set(KeysHttp.httpTimeout, timeoutMilliseconds)
        .set(KeysHttp.httpBodyTimeout, true);
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(<any>{
        body: new ReadableStream({
          pull: async(controller) => {
            controller.enqueue('abc');
            controller.close();
          },
        }),
      });
      jest.spyOn(globalThis, 'setTimeout');
      jest.spyOn(globalThis, 'clearTimeout');
      jest.spyOn((<any>actor).fetchInitPreprocessor, 'handle').mockResolvedValue({});
      const response = await actor.run({ input, context: contextWithTimeout });
      const responseReader = response.body!.getReader();
      await expect(responseReader.read()).resolves.toEqual({ done: false, value: 'abc' });
      expect(globalThis.setTimeout).toHaveBeenCalledTimes(1);
      expect(globalThis.setTimeout).toHaveBeenNthCalledWith(1, expect.any(Function), timeoutMilliseconds);
      expect(globalThis.clearTimeout).not.toHaveBeenCalled();
    });
  });

  describe('prepareRequestHeaders', () => {
    it('should assign user-agent header when none has been provided', () => {
      const userAgent = 'actor-determined agent';
      jest.replaceProperty(<any>ActorHttpFetch, 'userAgent', userAgent);
      expect(actor.prepareRequestHeaders({ input, context }).get('user-agent')).toBe(userAgent);
    });

    it('should override custom user-agent header in browser environments', () => {
      const userAgent = 'actor-determined agent';
      const init = { headers: { 'user-agent': 'custom agent' }};
      jest.replaceProperty(<any>ActorHttpFetch, 'userAgent', userAgent);
      jest.replaceProperty(globalThis, 'process', <any>undefined);
      expect(actor.prepareRequestHeaders({ input, context, init }).get('user-agent')).toBe(userAgent);
    });

    it('should add authorization header from context when provided', () => {
      const userAgent = 'actor-determined agent';
      const contextWithAuth = context.set(KeysHttp.auth, 'a');
      jest.replaceProperty(<any>ActorHttpFetch, 'userAgent', userAgent);
      expect(actor.prepareRequestHeaders({ input, context: contextWithAuth }).get('authorization')).toBe('Basic YQ==');
    });

    it('should not add empty authorization header from context when provided', () => {
      const userAgent = 'actor-determined agent';
      const contextWithAuth = context.set(KeysHttp.auth, '');
      jest.replaceProperty(<any>ActorHttpFetch, 'userAgent', userAgent);
      expect(actor.prepareRequestHeaders({ input, context: contextWithAuth }).has('authorization')).toBeFalsy();
    });
  });

  describe('createUserAgent', () => {
    it('should reuse browser agent in browser environments', () => {
      const browserAgent = 'browser user-agent';
      globalThis.window = <any>{ document: 'document' };
      jest.spyOn(globalThis.navigator, 'userAgent', 'get').mockReturnValue(browserAgent);
      expect(ActorHttpFetch.createUserAgent()).toBe(browserAgent);
      delete (<any>globalThis).window;
    });

    it('should construct custom agent in Node.js environments', () => {
      const expected = /^Comunica\/[0-9]+\.0 \([A-z0-9 ;]+\) [A-z]+\/[0-9]+\.[0-9]+\.[0-9]+ Node\.js\/[0-9]+$/u;
      expect(ActorHttpFetch.createUserAgent()).toMatch(expected);
    });
  });

  /* OLD STUFF BELOW */
  /*

  describe('#createUserAgent', () => {
    it('should create a user agent in the browser', () => {
      (<any> globalThis).navigator = { userAgent: 'Dummy' };
      expect(ActorHttpFetch.createUserAgent())
        .toBe(`Comunica/actor-http-fetch (Browser-${globalThis.navigator.userAgent})`);
    });

    it('should create a user agent in Node.js', () => {
      delete (<any> globalThis).navigator;
      expect(ActorHttpFetch.createUserAgent())
        .toBe(`Comunica/actor-http-fetch (Node.js ${process.version}; ${process.platform})`);
    });
  });

  describe('An ActorHttpFetch instance', () => {
    let actor: ActorHttpFetch;

    beforeEach(() => {
      actor = new ActorHttpFetch({ name: 'actor', bus });
    });

    it('should test', async() => {
      await expect(actor.test({ input: <Request> { url: 'https://www.google.com/' }, context })).resolves
        .toEqual({ time: Number.POSITIVE_INFINITY });
    });

    it('should run on an existing URI', async() => {
      await expect(actor.run({ input: <Request> { url: 'https://www.google.com/' }, context })).resolves
        .toMatchObject({ status: 200 });
    });

    it('should run and pass a custom agent to node-fetch', async() => {
      await actor.run({ input: <Request> { url: 'https://www.google.com/' }, context });

      expect((<any> jest.mocked(fetch).mock.calls[0][1]).agent).toBeInstanceOf(Function);

      expect((<any> jest.mocked(fetch).mock.calls[0][1]).agent(new URL('https://www.google.com/')))
        .toBeInstanceOf(HttpsAgent);
      expect((<any> jest.mocked(fetch).mock.calls[0][1]).agent(new URL('http://www.google.com/')))
        .toBeInstanceOf(HttpAgent);
    });

    it('for custom agent options should run and pass a custom agent to node-fetch', async() => {
      actor = new ActorHttpFetch({ name: 'actor', bus, agentOptions: { keepAlive: true, maxSockets: 5 }});

      await actor.run({ input: <Request> { url: 'https://www.google.com/' }, context });

      expect((<any> jest.mocked(fetch).mock.calls[0][1]).agent).toBeInstanceOf(Function);

      expect((<any> jest.mocked(fetch).mock.calls[0][1]).agent(new URL('https://www.google.com/')))
        .toBeInstanceOf(HttpsAgent);
      expect((<any> jest.mocked(fetch).mock.calls[0][1]).agent(new URL('http://www.google.com/')))
        .toBeInstanceOf(HttpAgent);
    });

    it('should run without body response', async() => {
      await expect(actor.run({ input: <Request> { url: 'NOBODY' }, context })).resolves
        .toMatchObject({ status: 404 });
    });

    it('should run on an non-existing URI', async() => {
      await expect(actor.run({ input: <Request> { url: 'https://www.google.com/notfound' }, context })).resolves
        .toMatchObject({ status: 404 });
    });

    it('should run for an input object and log', async() => {
      const spy = jest.spyOn(actor, <any> 'logInfo');
      await actor.run({ input: 'https://www.google.com/', context });
      expect(spy).toHaveBeenCalledWith(context, 'Requesting https://www.google.com/', expect.anything());
    });

    it('should run for an input string and log', async() => {
      const spy = jest.spyOn(actor, <any> 'logInfo');
      await actor.run({ input: <Request> { url: 'https://www.google.com/' }, context });
      expect(spy).toHaveBeenCalledWith(context, 'Requesting https://www.google.com/', expect.anything());
    });

    it('should run without KeysHttp.includeCredentials', async() => {
      const spy = jest.spyOn(globalThis, 'fetch');
      await actor.run({
        input: <Request> { url: 'https://www.google.com/' },
        context: new ActionContext({}),
      });
      expect(spy).toHaveBeenCalledWith({ url: 'https://www.google.com/' }, { headers: new Headers({ 'user-agent': (<any> actor).userAgent }), agent: expect.anything(), keepalive: true });
    });

    it('should run with KeysHttp.includeCredentials', async() => {
      const spy = jest.spyOn(globalThis, 'fetch');
      await actor.run({
        input: <Request> { url: 'https://www.google.com/' },
        context: new ActionContext({
          [KeysHttp.includeCredentials.name]: true,
        }),
      });
      expect(spy).toHaveBeenCalledWith({ url: 'https://www.google.com/' }, {
        credentials: 'include',
        headers: new Headers({ 'user-agent': (<any> actor).userAgent }),
        agent: expect.anything(),
        keepalive: true,
      });
    });

    it('should run with authorization', async() => {
      const spy = jest.spyOn(globalThis, 'fetch');
      await actor.run({
        input: <Request> { url: 'https://www.google.com/' },
        context: new ActionContext({
          [KeysHttp.auth.name]: 'user:password',
        }),
      });
      expect(spy).toHaveBeenCalledWith(
        { url: 'https://www.google.com/' },
        {
          headers: new Headers({
            Authorization: `Basic ${Buffer.from('user:password').toString('base64')}`,
            'user-agent': (<any> actor).userAgent,
          }),
          agent: expect.anything(),
          keepalive: true,
        },
      );
    });

    it('should run with authorization and init.headers undefined', async() => {
      const spy = jest.spyOn(globalThis, 'fetch');
      await actor.run({
        input: <Request> { url: 'https://www.google.com/' },
        init: {},
        context: new ActionContext({
          [KeysHttp.auth.name]: 'user:password',
        }),
      });
      expect(spy).toHaveBeenCalledWith(
        { url: 'https://www.google.com/' },
        {
          headers: new Headers({
            Authorization: `Basic ${Buffer.from('user:password').toString('base64')}`,
            'user-agent': (<any> actor).userAgent,
          }),
          agent: expect.anything(),
          keepalive: true,
        },
      );
    });

    it('should run with authorization and already header in init', async() => {
      const spy = jest.spyOn(globalThis, 'fetch');

      await actor.run({
        input: <Request> { url: 'https://www.google.com/' },
        init: { headers: new Headers({ 'Content-Type': 'image/jpeg' }) },
        context: new ActionContext({
          [KeysHttp.auth.name]: 'user:password',
        }),
      });
      expect(spy).toHaveBeenCalledWith(
        { url: 'https://www.google.com/' },
        {
          headers: new Headers({
            Authorization: `Basic ${Buffer.from('user:password').toString('base64')}`,
            'Content-Type': 'image/jpeg',
            'user-agent': (<any> actor).userAgent,
          }),
          agent: expect.anything(),
          keepalive: true,
        },
      );
    });

    it('should run with a logger', async() => {
      const logger = new LoggerVoid();
      const spy = jest.spyOn(logger, 'info');
      await actor.run({
        input: <Request> { url: 'https://www.google.com/' },
        init: { headers: new Headers({ a: 'b' }) },
        context: new ActionContext({ [KeysCore.log.name]: logger }),
      });
      expect(spy).toHaveBeenCalledWith('Requesting https://www.google.com/', {
        actor: 'actor',
        headers: { a: 'b', 'user-agent': (<any> actor).userAgent },
        method: 'GET',
      });
    });

    it('should run with a logger without init', async() => {
      const logger = new LoggerVoid();
      const spy = jest.spyOn(logger, 'info');
      await actor.run({
        input: <Request> { url: 'https://www.google.com/' },
        context: new ActionContext({ [KeysCore.log.name]: logger }),
      });
      expect(spy).toHaveBeenCalledWith('Requesting https://www.google.com/', {
        actor: 'actor',
        headers: { 'user-agent': (<any> actor).userAgent },
        method: 'GET',
      });
    });

    it('should run with a logger with another another method', async() => {
      const logger = new LoggerVoid();
      const spy = jest.spyOn(logger, 'info');
      await actor.run({
        input: <Request> { url: 'https://www.google.com/' },
        init: { headers: new Headers({ a: 'b' }), method: 'POST' },
        context: new ActionContext({ [KeysCore.log.name]: logger }),
      });
      expect(spy).toHaveBeenCalledWith('Requesting https://www.google.com/', {
        actor: 'actor',
        headers: { a: 'b', 'user-agent': (<any> actor).userAgent },
        method: 'POST',
      });
    });

    it('should set no user agent if one has been set', async() => {
      const spy = jest.spyOn(globalThis, 'fetch');
      await actor.run({
        input: <Request> { url: 'https://www.google.com/' },
        init: { headers: new Headers({ 'user-agent': 'b' }) },
        context,
      });
      expect(spy).toHaveBeenCalledWith({ url: 'https://www.google.com/' }, { headers: new Headers({ 'user-agent': 'b' }), agent: expect.anything(), keepalive: true });
    });

    it('should set a user agent if none has been set', async() => {
      const spy = jest.spyOn(globalThis, 'fetch');
      await actor.run({
        input: <Request> { url: 'https://www.google.com/' },
        init: { headers: new Headers({}) },
        context,
      });
      expect(spy).toHaveBeenCalledWith({ url: 'https://www.google.com/' }, { headers: new Headers({ 'user-agent': (<any> actor).userAgent }), agent: expect.anything(), keepalive: true });
    });

    it('should run and expose body.cancel', async() => {
      const response = await actor.run({ input: <Request> { url: 'https://www.google.com/' }, context });
      expect((<any> response.body).destroy).not.toHaveBeenCalled();
      expect(response.body!.cancel).toBeTruthy();

      const closeError = new Error('node-fetch close');
      await response.body!.cancel(closeError);

      expect((<any> response.body).destroy).toHaveBeenCalledWith(closeError);
    });

    it('should run with a Node.js body', async() => {
      const spy = jest.spyOn(globalThis, 'fetch');
      const body = <any> new Readable();
      await actor.run({ input: <Request> { url: 'https://www.google.com/' }, init: { body }, context });

      expect(spy).toHaveBeenCalledWith(
        { url: 'https://www.google.com/' },
        {
          body,
          agent: expect.anything(),
          headers: expect.anything(),
          keepalive: true,
        },
      );
    });

    it('should run with a Web stream body', async() => {
      const spy = jest.spyOn(globalThis, 'fetch');
      const body = ActorHttp.toWebReadableStream(Readable.from([ 'a' ]));
      await actor.run({ input: <Request> { url: 'https://www.google.com/' }, init: { body }, context });

      expect(spy).toHaveBeenCalledWith(
        { url: 'https://www.google.com/' },
        {
          body: expect.any(Readable),
          agent: expect.anything(),
          headers: expect.anything(),
          keepalive: undefined,
          duplex: 'half',
        },
      );
    });

    it('should run with a custom fetch function', async() => {
      const customFetch = jest.fn(async() => ({}));
      await actor.run({
        input: <Request> { url: 'https://www.google.com/' },
        context: new ActionContext({ [KeysHttp.fetch.name]: customFetch }),
      });

      expect(fetch).not.toHaveBeenCalled();
      expect(customFetch).toHaveBeenCalledTimes(1);
    });

    it('should run with headers and a custom fetch function to trigger temporary workaround', async() => {
      const customFetch = jest.fn(async() => ({}));
      await actor.run({
        input: <Request> { url: 'https://www.google.com/' },
        context: new ActionContext({ [KeysHttp.fetch.name]: customFetch }),
      });

      expect(fetch).not.toHaveBeenCalled();
      expect(customFetch).toHaveBeenCalledTimes(1);
    });

    it('should work with a large timeout', async() => {
      jest.spyOn(globalThis, 'clearTimeout');
      await expect(actor.run({
        input: <Request> { url: 'https://www.google.com/' },
        context: new ActionContext({ [KeysHttp.httpTimeout.name]: 100_000 }),
      })).resolves.toMatchObject({ status: 200 });
      expect(clearTimeout).toHaveBeenCalledTimes(1);
    });

    it('should work with a large timeout with an error', async() => {
      jest.spyOn(globalThis, 'clearTimeout');
      const customFetch = jest.fn(async(_, _init) => {
        throw new Error('foo');
      });
      await expect(actor.run({
        input: <Request> { url: 'https://www.google.com/' },
        context: new ActionContext({ [KeysHttp.fetch.name]: customFetch, [KeysHttp.httpTimeout.name]: 100_000 }),
      })).rejects.toBeInstanceOf(Error);
      expect(clearTimeout).toHaveBeenCalledTimes(1);
    });

    it('should abort properly with a timeout', async() => {
      jest.useFakeTimers();
      const customFetch = jest.fn(async(_, init) => {
        expect(init.signal.constructor.name).toBe('AbortSignal');
        expect(init.signal.aborted).toBe(false);
        jest.runAllTimers();
        expect(init.signal.aborted).toBe(true);
        throw new Error('foo');
      });
      await expect(actor.run({
        input: <Request> { url: 'https://www.google.com/' },
        context: new ActionContext({ [KeysHttp.fetch.name]: customFetch, [KeysHttp.httpTimeout.name]: 10 }),
      })).rejects.toThrow('foo');
      jest.useRealTimers();
    });

    it('should work with a large timeout including body if there is no body', async() => {
      jest.spyOn(globalThis, 'clearTimeout');
      await expect(actor.run({
        input: <Request> { url: 'NOBODY' },
        context: new ActionContext({ [KeysHttp.httpTimeout.name]: 100_000, [KeysHttp.httpBodyTimeout.name]: true }),
      })).resolves.toMatchObject({ status: 404 });
      expect(clearTimeout).toHaveBeenCalledTimes(1);
    });

    it('should work with a large timeout including body if the body is consumed', async() => {
      jest.spyOn(globalThis, 'clearTimeout');
      const customFetch = jest.fn(async(_, _init) => {
        const body = Readable.from([ 'foo' ]);
        return {
          body,
        };
      });
      const response = await actor.run({
        input: <Request> { url: 'https://www.google.com/' },
        context: new ActionContext({
          [KeysHttp.fetch.name]: customFetch,
          [KeysHttp.httpTimeout.name]: 100_000,
          [KeysHttp.httpBodyTimeout.name]: true,
        }),
      });
      const body = <Readable><any> response.body;
      for await (const chunk of body) {
        // We just want to consume everything
      }
      expect(clearTimeout).toHaveBeenCalledTimes(1);
    });

    it('should work with a large timeout including body if the body is cancelled', async() => {
      jest.spyOn(globalThis, 'clearTimeout');
      const customFetch = jest.fn(async(_, _init) => {
        const body = Readable.from([ 'foo' ]);
        return {
          body,
        };
      });
      const response = await actor.run({
        input: <Request> { url: 'https://www.google.com/' },
        context: new ActionContext({
          [KeysHttp.fetch.name]: customFetch,
          [KeysHttp.httpTimeout.name]: 100_000,
          [KeysHttp.httpBodyTimeout.name]: true,
        }),
      });
      await response.body?.cancel();
      expect(clearTimeout).toHaveBeenCalledTimes(1);
    });

    it('should abort properly with a timeout including body', async() => {
      jest.useFakeTimers();
      const response = await actor.run({
        input: <Request> { url: 'https://www.google.com/' },
        context: new ActionContext({ [KeysHttp.httpTimeout.name]: 20, [KeysHttp.httpBodyTimeout.name]: true }),
      });
      expect((<any> response.body).destroy).not.toHaveBeenCalled();
      expect(response.body!.cancel).toBeTruthy();

      jest.runAllTimers();
      expect((<any> response.body).destroy).toHaveBeenCalledWith(
        new Error(`HTTP timeout when reading the body of undefined.
This error can be disabled by modifying the 'httpBodyTimeout' and/or 'httpTimeout' options.`),
      );
      jest.useRealTimers();
    });

    it('should retry with a delay', async() => {
      let numberOfRetries = 0;
      const customFetch = jest.fn(async() => {
        if (numberOfRetries < 2) {
          numberOfRetries++;
          throw new Error('Retry count not reached.');
        }
        return {};
      });

      await actor.run({
        input: <Request> { url: 'ignored by custom fetch' },
        context: new ActionContext({
          [KeysHttp.fetch.name]: customFetch,
          [KeysHttp.httpRetryCount.name]: 2,
          [KeysHttp.httpRetryDelay.name]: 100,
        }),
      });

      expect(customFetch).toHaveBeenCalledTimes(3);
    });

    it('should abort, if retry count was exceeded', async() => {
      const error = new Error('This fetch is supposed to fail and be retried.');
      const customFetch = jest.fn(async() => {
        throw error;
      });

      await expect(actor.run({
        input: <Request> { url: 'ignored by custom fetch' },
        context: new ActionContext({
          [KeysHttp.fetch.name]: customFetch,
          [KeysHttp.httpRetryCount.name]: 2,
        }),
      })).rejects.toThrow(`Number of fetch retries (${2}) exceeded. Last error: ${String(error)}`);

      expect(customFetch).toHaveBeenCalledTimes(3);
    });

    it('should abort retry delay on timeout', async() => {
      const customFetch = jest.fn(async() => {
        throw new Error('This fetch is supposed to fail and be retried.');
      });
      await expect(actor.run({
        input: <Request> { url: 'ignored by custom fetch' },
        context: new ActionContext({
          [KeysHttp.fetch.name]: customFetch,
          [KeysHttp.httpTimeout.name]: 50,
          [KeysHttp.httpRetryCount.name]: 1,
          [KeysHttp.httpRetryDelay.name]: 500,
        }),
      })).rejects.toThrow(`Fetch aborted by timeout.`);
      expect(customFetch).toHaveBeenCalledTimes(1);
    });

    it('should retry, when server replies with an internal server error 5xx response', async() => {
      const response = new Response(undefined, { status: 503, statusText: 'currently not available' });
      const customFetch = jest.fn(async() => {
        return response;
      });

      await expect(actor.run({
        input: <Request> { url: 'ignored by custom fetch' },
        context: new ActionContext({
          [KeysHttp.fetch.name]: customFetch,
          [KeysHttp.httpRetryCount.name]: 1,
          [KeysHttp.httpRetryOnServerError.name]: true,
        }),
      })).rejects.toThrow(`Server replied with response code ${response.status}: ${response.statusText}`);

      expect(customFetch).toHaveBeenCalledTimes(2);
    });
  });
  */
});
