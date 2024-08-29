import { Readable } from 'readable-stream';
import { ActorHttp } from '../lib/ActorHttp';
import 'cross-fetch/polyfill';

const readableToWeb = require('readable-stream-node-to-web');

describe('ActorHttp', () => {
  describe('toNodeReadable', () => {
    it('should handle null input', () => {
      expect(ActorHttp.toNodeReadable(null)).toBeNull();
    });

    it('should handle WHATWG ReadableStream', () => {
      const readableStream = Readable.from([ 'CONTENT' ]);
      const whatwgReadableStream = readableToWeb(readableStream);
      expect(ActorHttp.toNodeReadable(whatwgReadableStream)).toBeInstanceOf(Readable);
    });
  });

  describe('toWebReadableStream', () => {
    it('should handle null input', () => {
      expect(() => ActorHttp.toWebReadableStream(null)).toThrow('Cannot read properties of null (reading \'on\')');
    });

    it('should handle NodeJS.ReadableStream', () => {
      const readableStream = Readable.from([ 'CONTENT' ]);
      expect(ActorHttp.toWebReadableStream(readableStream)).toBeInstanceOf(ReadableStream);
    });
  });

  describe('headersToHash', () => {
    it('should handle empty headers', () => {
      expect(ActorHttp.headersToHash(new Headers())).toEqual({});
    });

    it('should handle non-empty headers', () => {
      expect(ActorHttp.headersToHash(new Headers({
        a: 'b',
        c: 'd',
      }))).toEqual({
        a: 'b',
        c: 'd',
      });
    });

    it('should handle headers with multi-valued entries', () => {
      expect(ActorHttp.headersToHash(new Headers([
        [ 'a', 'a1' ],
        [ 'a', 'a2' ],
        [ 'b', 'b1' ],
        [ 'b', 'b2' ],
      ]))).toEqual({
        a: 'a1, a2',
        b: 'b1, b2',
      });
    });
  });

  describe('getInputUrl', () => {
    const url = 'http://example.org/abc';

    it('should handle string values', () => {
      expect(ActorHttp.getInputUrl(url).href).toBe(url);
    });

    it('should handle Request objects', () => {
      expect(ActorHttp.getInputUrl(new Request(url)).href).toBe(url);
    });

    it('should handle URL objects', () => {
      expect(ActorHttp.getInputUrl(new URL(url)).href).toBe(url);
    });
  });
});
