import { Readable } from 'node:stream';
import { KeysInitQuery, KeysRdfParseHtmlScript, KeysRdfParseJsonLd } from '@comunica/context-entries';
import { ActionContext, Bus } from '@comunica/core';
import 'jest-rdf';
import type { IActionContext } from '@comunica/types';
import arrayifyStream from 'arrayify-stream';
import { DataFactory } from 'rdf-data-factory';
import { ActorRdfParseJsonLd } from '../lib/ActorRdfParseJsonLd';
import '@comunica/utils-jest';

const quad = require('rdf-quad');

const DF = new DataFactory();

describe('ActorRdfParseJsonLd', () => {
  let bus: any;
  let mediatorHttp: any;
  let context: IActionContext;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
    mediatorHttp = {
      mediate(args: any) {
        // Error
        if (args.input.includes('error')) {
          return Promise.resolve({
            ok: false,
            statusText: 'some error',
            status: 500,
            headers: new Headers({}),
          });
        }

        return Promise.resolve({
          body: Readable.from([ `{
          "@context": {
            "@vocab": "http://example.org/"
          }
        }` ]),
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/ld+json' }),
        });
      },
    };
    context = new ActionContext({ [KeysInitQuery.dataFactory.name]: DF });
  });

  describe('The ActorRdfParseJsonLd module', () => {
    it('should be a function', () => {
      expect(ActorRdfParseJsonLd).toBeInstanceOf(Function);
    });

    it('should be a ActorRdfParseJsonLd constructor', () => {
      expect(new (<any> ActorRdfParseJsonLd)({ name: 'actor', bus, mediaTypePriorities: {}, mediatorHttp }))
        .toBeInstanceOf(ActorRdfParseJsonLd);
    });

    it('should not be able to create new ActorRdfParseJsonLd objects without \'new\'', () => {
      expect(() => {
        (<any> ActorRdfParseJsonLd)();
      }).toThrow(`Class constructor ActorRdfParseJsonLd cannot be invoked without 'new'`);
    });

    it('when constructed with optional mediaTypePriorities should set the mediaTypePriorities', () => {
      expect(new ActorRdfParseJsonLd(
        { name: 'actor', bus, mediaTypePriorities: {}, mediaTypeFormats: {}, mediatorHttp },
      ).mediaTypePriorities).toEqual({});
    });

    it('should not throw an error when constructed with optional priorityScale', () => {
      expect(() => {
        new ActorRdfParseJsonLd(
          { name: 'actor', bus, mediaTypePriorities: {}, mediaTypeFormats: {}, priorityScale: 0.5, mediatorHttp },
        );
      })
        .toBeTruthy();
    });

    it('when constructed with optional priorityScale should set the priorityScale', () => {
      expect(new ActorRdfParseJsonLd(
        { name: 'actor', bus, mediaTypePriorities: {}, mediaTypeFormats: {}, priorityScale: 0.5, mediatorHttp },
      ).priorityScale)
        .toBe(0.5);
    });

    it('when constructed with optional priorityScale should scale the priorities', () => {
      expect(new ActorRdfParseJsonLd(
        {
          name: 'actor',
          bus,
          mediaTypePriorities: { A: 2, B: 1, C: 0 },
          mediaTypeFormats: {},
          priorityScale: 0.5,
          mediatorHttp,
        },
      )
        .mediaTypePriorities).toEqual({
        A: 1,
        B: 0.5,
        C: 0,
      });
    });
  });

  describe('An ActorRdfParseJsonLd instance', () => {
    let actor: ActorRdfParseJsonLd;
    let input: Readable;
    let inputGraphs: Readable;
    let inputRemoteContext: Readable;
    let inputRemoteContextErr: Readable;
    let inputLinkHeader: Readable;
    let inputSkipped: Readable;

    beforeEach(() => {
      actor = new ActorRdfParseJsonLd({ bus, mediaTypePriorities: {
        'application/json': 1,
        'application/ld+json': 1,
      }, mediaTypeFormats: {}, mediatorHttp, name: 'actor' });
      input = Readable.from([ `{
            "@id": "http://example.org/a",
            "http://example.org/b": "http://example.org/c",
            "http://example.org/d": "http://example.org/e"
          }` ]);
    });

    describe('for parsing', () => {
      beforeEach(() => {
        inputGraphs = Readable.from([ `[
          {
            "@id": "http://example.org/g0",
            "@graph": [
              {
                "@id": "http://example.org/a",
                "http://example.org/b": "http://example.org/c",
                "http://example.org/d": { "@value": "http://example.org/e", "@language": "nl" }
              }
            ]
          },
          {
            "@id": "http://example.org/g1",
            "@graph": [
              {
                "http://example.org/b": "http://example.org/c",
                "http://example.org/d": "http://example.org/e"
              }
            ]
          }
            ]` ]);
        inputRemoteContext = Readable.from([ `{
            "@context": "http://schema.org/",
            "@id": "http://example.org/a",
            "b": "http://example.org/c",
            "d": "http://example.org/e"
          }` ]);
        inputRemoteContextErr = Readable.from([ `{
            "@context": "http://myschema.org/error",
            "@id": "http://example.org/a",
            "b": "http://example.org/c",
            "d": "http://example.org/e"
          }` ]);
        inputLinkHeader = Readable.from([ `{
          "@id": "http://www.example.org/",
          "term": "value"
        }` ]);
        inputSkipped = Readable.from([ `{
          "@id": "http://www.example.org/",
          "skipped": "value"
        }` ]);
      });

      it('should test on application/json', async() => {
        await expect(actor
          .test({ handle: { data: input, context }, handleMediaType: 'application/json', context }))
          .resolves.toBeTruthy();
        await expect(actor
          .test({
            handle: { data: input, metadata: { baseIRI: '' }, context },
            handleMediaType: 'application/json',
            context,
          }))
          .resolves.toPassTest({ handle: true });
      });

      it('should test on application/ld+json', async() => {
        await expect(actor
          .test({
            handle: { data: input, context },
            handleMediaType: 'application/ld+json',
            context,
          }))
          .resolves.toPassTest({ handle: true });
        await expect(actor
          .test({
            handle: { data: input, metadata: { baseIRI: '' }, context },
            handleMediaType: 'application/ld+json',
            context,
          }))
          .resolves.toPassTest({ handle: true });
      });

      it('should test on bla+json', async() => {
        await expect(actor.test({ handle: { data: input, context }, handleMediaType: 'bla+json', context }))
          .resolves.toPassTest({ handle: true });
        await expect(actor.test({
          handle: { data: input, metadata: { baseIRI: '' }, context },
          handleMediaType: 'bla+json',
          context,
        }))
          .resolves.toPassTest({ handle: true });
      });

      it('should not test on bla+json when processing html', async() => {
        await expect(actor.test({
          handle: { data: input, metadata: { baseIRI: '' }, context },
          handleMediaType: 'bla+json',
          context: new ActionContext({ [KeysRdfParseHtmlScript.processingHtmlScript.name]: true }),
        })).resolves.toFailTest(`JSON-LD in script tags can only have media type 'application/ld+json'`);
      });

      it('should test on application/ld+json when processing html', async() => {
        await expect(actor.test({
          handle: { data: input, context },
          handleMediaType: 'application/ld+json',
          context: new ActionContext({ [KeysRdfParseHtmlScript.processingHtmlScript.name]: true }),
        })).resolves.toPassTest({ handle: true });
        await expect(actor.test({
          handle: { data: input, metadata: { baseIRI: '' }, context },
          handleMediaType: 'application/ld+json',
          context: new ActionContext({ [KeysRdfParseHtmlScript.processingHtmlScript.name]: true }),
        })).resolves.toPassTest({ handle: true });
      });

      it('should not test on N-Triples', async() => {
        await expect(actor
          .test({ handle: { data: input, context }, handleMediaType: 'application/n-triples', context }))
          .resolves.toFailTest('Unrecognized media type: application/n-triples');
        await expect(actor
          .test({
            handle: { data: input, metadata: { baseIRI: '' }, context },
            handleMediaType: 'application/n-triples',
            context,
          }))
          .resolves.toFailTest('Unrecognized media type: application/n-triples');
      });

      it('should not test on undefined', async() => {
        await expect(actor
          .test({ handle: { data: input, context }, handleMediaType: undefined, context }))
          .resolves.toFailTest('Unrecognized media type: undefined');
        await expect(actor
          .test({
            handle: { data: input, metadata: { baseIRI: '' }, context },
            handleMediaType: undefined,
            context,
          }))
          .resolves.toFailTest('Unrecognized media type: undefined');
      });

      it('should run', async() => {
        await actor.run({
          handle: { data: input, metadata: { baseIRI: '' }, context },
          handleMediaType: 'application/ld+json',
          context,
        })
          .then(async(output: any) => await expect(arrayifyStream(output.handle.data)).resolves.toEqualRdfQuadArray([
            quad('http://example.org/a', 'http://example.org/b', '"http://example.org/c"'),
            quad('http://example.org/a', 'http://example.org/d', '"http://example.org/e"'),
          ]));
      });

      it('should run for graphs', async() => {
        await actor.run({
          handle: { data: inputGraphs, metadata: { baseIRI: '' }, context },
          handleMediaType: 'application/ld+json',
          context,
        })
          .then(async(output: any) => await expect(arrayifyStream(output.handle.data)).resolves.toEqualRdfQuadArray([
            quad('http://example.org/a', 'http://example.org/b', '"http://example.org/c"', 'http://example.org/g0'),
            quad('http://example.org/a', 'http://example.org/d', '"http://example.org/e"@nl', 'http://example.org/g0'),
            quad('_:b1', 'http://example.org/b', '"http://example.org/c"', 'http://example.org/g1'),
            quad('_:b1', 'http://example.org/d', '"http://example.org/e"', 'http://example.org/g1'),
          ]));
      });

      it('should run for a remote context', async() => {
        await actor.run({
          handle: { data: inputRemoteContext, metadata: { baseIRI: '' }, context },
          handleMediaType: 'application/ld+json',
          context,
        })
          .then(async(output: any) => await expect(arrayifyStream(output.handle.data)).resolves.toEqualRdfQuadArray([
            quad('http://example.org/a', 'http://example.org/b', '"http://example.org/c"'),
            quad('http://example.org/a', 'http://example.org/d', '"http://example.org/e"'),
          ]));
      });

      it('should error for an invalid remote context', async() => {
        await actor.run({
          handle: { data: inputRemoteContextErr, metadata: { baseIRI: '' }, context },
          handleMediaType: 'application/ld+json',
          context,
        })
          .then(async(output: any) => expect(arrayifyStream(output.handle.data)).rejects
            .toThrow(new Error('Failed to load remote context http://myschema.org/error: some error')));
      });

      it('should run for a JSON doc with a context link header', async() => {
        const headers = new Headers({
          Link: '<http://example.org/>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"',
        });
        await actor.run({
          handle: { data: inputLinkHeader, metadata: { baseIRI: '' }, headers, context },
          handleMediaType: 'application/json',
          context,
        })
          .then(async(output: any) => await expect(arrayifyStream(output.handle.data)).resolves.toEqualRdfQuadArray([
            quad('http://www.example.org/', 'http://example.org/term', '"value"'),
          ]));
      });

      it('should run for a doc with JSON extension type with a context link header', async() => {
        const headers = new Headers({
          Link: '<http://example.org/>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"',
        });
        await actor.run({
          handle: { data: inputLinkHeader, metadata: { baseIRI: '' }, headers, context },
          handleMediaType: 'bla+json',
          context,
        })
          .then(async(output: any) => await expect(arrayifyStream(output.handle.data)).resolves.toEqualRdfQuadArray([
            quad('http://www.example.org/', 'http://example.org/term', '"value"'),
          ]));
      });

      it('should error on a JSON doc with a context link header without type', async() => {
        const headers = new Headers({ Link: '<http://example.org/>; rel="http://www.w3.org/ns/json-ld#context"' });
        await actor.run({
          handle: { data: inputLinkHeader, metadata: { baseIRI: '' }, headers, context },
          handleMediaType: 'bla+json',
          context,
        })
          .then(async(output: any) => await expect(arrayifyStream(output.handle.data)).resolves.toEqualRdfQuadArray([
            quad('http://www.example.org/', 'http://example.org/term', '"value"'),
          ]));
      });

      it('should error on a JSON doc without a context link header', async() => {
        const headers = new Headers({});
        await expect(actor.run({
          handle: { data: inputLinkHeader, metadata: { baseIRI: 'IRI' }, headers, context },
          handleMediaType: 'application/json',
          context,
        })).rejects
          .toThrow(new Error('Missing context link header for media type application/json on IRI'));
      });

      it('should ignore a context link header on a valid JSON-LD document', async() => {
        const headers = new Headers({
          Link: '<http://example.org/error>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"',
        });
        await actor.run({
          handle: { data: input, metadata: { baseIRI: '' }, headers, context },
          handleMediaType: 'application/ld+json',
          context,
        })
          .then(async(output: any) => await expect(arrayifyStream(output.handle.data)).resolves.toEqualRdfQuadArray([
            quad('http://example.org/a', 'http://example.org/b', '"http://example.org/c"'),
            quad('http://example.org/a', 'http://example.org/d', '"http://example.org/e"'),
          ]));
      });

      it('should error for multiple context link headers', async() => {
        const headers = new Headers({ Link:
          '<http://example.org/valid1>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json",' +
          '<http://example.org/valid2>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"' });
        await expect(actor.run({
          handle: { data: inputLinkHeader, metadata: { baseIRI: 'mult' }, headers, context },
          handleMediaType: 'application/json',
          context,
        }))
          .rejects.toThrow(new Error('Multiple JSON-LD context link headers were found on mult'));
      });

      it('should run with a custom document loader', async() => {
        const documentLoader: any = {
          load: jest.fn(() => ({ '@context': { '@vocab': 'http://custom.org/' }})),
        };
        await actor.run({
          handle: { data: inputRemoteContext, metadata: { baseIRI: '' }, context },
          handleMediaType: 'application/ld+json',
          context: new ActionContext({ [KeysRdfParseJsonLd.documentLoader.name]: documentLoader }),
        })
          .then(async(output: any) => await expect(arrayifyStream(output.handle.data)).resolves.toEqualRdfQuadArray([
            quad('http://example.org/a', 'http://custom.org/b', '"http://example.org/c"'),
            quad('http://example.org/a', 'http://custom.org/d', '"http://example.org/e"'),
          ]));
      });

      it('should run with skipped properties', async() => {
        await actor.run({
          handle: { data: inputSkipped, metadata: { baseIRI: '' }, context },
          handleMediaType: 'application/ld+json',
          context,
        })
          .then(async(output: any) => await expect(arrayifyStream(output.handle.data))
            .resolves.toEqualRdfQuadArray([]));
      });

      it('should error on skipped properties with strict values', async() => {
        await actor.run({
          handle: { data: inputSkipped, metadata: { baseIRI: '' }, context },
          handleMediaType: 'application/ld+json',
          context: new ActionContext({ [KeysRdfParseJsonLd.strictValues.name]: true }),
        })
          .then(async(output: any) => expect(arrayifyStream(output.handle.data)).rejects
            .toThrow(new Error('Invalid predicate IRI: skipped')));
      });
    });

    describe('for getting media types', () => {
      it('should test', async() => {
        await expect(actor.test({ mediaTypes: true, context })).resolves.toPassTest({ mediaTypes: true });
      });

      it('should run', async() => {
        await expect(actor.run({ mediaTypes: true, context })).resolves.toEqual({ mediaTypes: {
          'application/json': 1,
          'application/ld+json': 1,
        }});
      });

      it('should run with scaled priorities 0.5', async() => {
        actor = new ActorRdfParseJsonLd({ bus, mediaTypePriorities: {
          'application/json': 1,
          'application/ld+json': 1,
        }, mediaTypeFormats: {}, mediatorHttp, name: 'actor', priorityScale: 0.5 });
        await expect(actor.run({ mediaTypes: true, context })).resolves.toEqual({ mediaTypes: {
          'application/json': 0.5,
          'application/ld+json': 0.5,
        }});
      });

      it('should run with scaled priorities 0', async() => {
        actor = new ActorRdfParseJsonLd({ bus, mediaTypePriorities: {
          'application/json': 1,
          'application/ld+json': 1,
        }, mediaTypeFormats: {}, mediatorHttp, name: 'actor', priorityScale: 0 });
        await expect(actor.run({ mediaTypes: true, context })).resolves.toEqual({ mediaTypes: {
          'application/json': 0,
          'application/ld+json': 0,
        }});
      });

      it('should not have duplicate results on multiple _read calls', async() => {
        await actor.run({
          handle: { data: input, metadata: { baseIRI: '' }, context },
          handleMediaType: 'application/ld+json',
          context,
        })
          .then(async(output: any) => {
            output.handle.data._read();
            output.handle.data._read();
            await expect(arrayifyStream(output.handle.data)).resolves.toEqualRdfQuadArray([
              quad('http://example.org/a', 'http://example.org/b', '"http://example.org/c"'),
              quad('http://example.org/a', 'http://example.org/d', '"http://example.org/e"'),
            ]);
          });
      });

      it('should not have duplicate results on multiple _read calls (with no metadata)', async() => {
        await actor.run({
          handle: { data: input, context },
          handleMediaType: 'application/ld+json',
          context,
        })
          .then(async(output: any) => {
            output.handle.data._read();
            output.handle.data._read();
            await expect(arrayifyStream(output.handle.data)).resolves.toEqualRdfQuadArray([
              quad('http://example.org/a', 'http://example.org/b', '"http://example.org/c"'),
              quad('http://example.org/a', 'http://example.org/d', '"http://example.org/e"'),
            ]);
          });
      });
    });
  });
});
