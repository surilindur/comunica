import type { IAction, IActorArgs, IActorOutput, IActorTest, Mediate } from '@comunica/core';
import { Actor } from '@comunica/core';
import { readableFromWeb } from 'readable-from-web';

/* istanbul ignore next */
if (!globalThis.ReadableStream) {
  globalThis.ReadableStream = require('web-streams-ponyfill').ReadableStream;
}

const isStream = require('is-stream');
const toWebReadableStream = require('readable-stream-node-to-web');

/**
 * A base actor for listening to HTTP events.
 *
 * Actor types:
 * * Input:  IActionHttp:      The HTTP request.
 * * Test:   IActorHttpTest:   An estimate for the response time.
 * * Output: IActorHttpOutput: The HTTP response.
 *
 * @see IActionHttp
 * @see IActorHttpTest
 * @see IActorHttpOutput
 */
export abstract class ActorHttp extends Actor<IActionHttp, IActorTest, IActorHttpOutput> {
  /**
   * Converts WhatWG streams to Node streams if required.
   * Returns the input in case the stream already is a Node stream.
   * @param {ReadableStream} body
   * @returns {NodeJS.ReadableStream} A node stream.
   */
  public static toNodeReadable(body: ReadableStream | null): NodeJS.ReadableStream {
    return isStream(body) || body === null ?
      <NodeJS.ReadableStream> <any> body :
      <NodeJS.ReadableStream> <any> readableFromWeb(body);
  }

  /**
   * Converts Node streams to WhatWG streams.
   * @param {NodeJS.ReadableStream} body
   * @returns {ReadableStream} A web stream.
   */
  public static toWebReadableStream(body: NodeJS.ReadableStream | null): ReadableStream {
    return toWebReadableStream(body);
  }

  /**
   * Convert the given headers object into a raw hash.
   * @param headers A headers object.
   */
  public static headersToHash(headers: Headers): Record<string, string> {
    const hash: Record<string, string> = {};
    // eslint-disable-next-line unicorn/no-array-for-each
    headers.forEach((value, key) => {
      hash[key] = value;
    });
    return hash;
  }

  /**
   * Extract the requested URL from the action input.
   * @param {RequestInfo | URL} input The request input.
   * @returns {URL} The extracted URL.
   */
  public static getInputUrl(input: RequestInfo | URL): URL {
    return new URL(input instanceof Request ? input.url : input);
  }
}

/**
 * The HTTP input, which contains the HTTP request.
 */
export interface IActionHttp extends IAction {
  input: RequestInfo;
  init?: RequestInit;
}

/**
 * The HTTP output, which contains the HTTP response.
 */
export interface IActorHttpOutput extends IActorOutput, Response {

}

export type IActorHttpArgs = IActorArgs<IActionHttp, IActorTest, IActorHttpOutput>;

export type MediatorHttp = Mediate<IActionHttp, IActorHttpOutput>;
