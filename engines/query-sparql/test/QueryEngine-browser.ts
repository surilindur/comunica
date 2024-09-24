import type { QuerySourceUnidentified } from '@comunica/types';
import { test } from '@playwright/test';
import expect from 'expect';
import jest from 'jest-mock';
import '@comunica/jest';
import { devServerUrl, bundleName } from '../../../webpack.config';
import { QueryEngine } from '../lib/index-browser';

const Comunica = { QueryEngine };

test.describe('QueryEngine', () => {
  const sparqlEndpoint: QuerySourceUnidentified = {
    value: 'http://127.0.0.1:3030/sparql',
  };

  const turtleDocument: QuerySourceUnidentified = {
    value: new URL('/test/data/example.ttl', devServerUrl).href,
  };

  const turtleStringSource: QuerySourceUnidentified = {
    type: 'serialized',
    value: '<ex:s> <ex:p> <ex:o>. <ex:s> <ex:p2> <ex:o2>.',
    mediaType: 'text/turtle',
    baseIRI: 'http://localhost/',
  };

  const jsonLdStringSource: QuerySourceUnidentified = {
    type: 'serialized',
    value: '{ "@id":"ex:s2", "ex:p":{"@id":"ex:o"}, "ex:p2":{"@id":"ex:o2"} }',
    mediaType: 'application/ld+json',
    baseIRI: 'http://localhost/',
  };

  const testDataSources: Record<string, QuerySourceUnidentified[]> = {
    // 'SPARQL endpoint': [ sparqlEndpoint ],
    'one online RDF document': [ turtleDocument ],
    'one serialized RDF string source': [ turtleStringSource ],
    'two serialized RDF string sources': [ turtleStringSource, jsonLdStringSource ],
  };

  test.beforeEach(async({ page, context }) => {
    await page.goto(devServerUrl);
    await page.addScriptTag({ url: bundleName, type: 'text/javascript' });
    await page.addInitScript(() => {
      // Add missing Jest functions

      window.it = globalThis.it;
      window.test = <any> window.it;
      window.test.each = inputs => (testName, test) => {
        for (const args of inputs) {
          window.it(testName, () => test(...args));
        }
      };
      window.test.todo = function() {};
      window.jest = <any> jest;
      window.expect = <any> expect;
    });
  });

  test.describe('instantiated multiple times', () => {
    test('produces different instances', async({ page }) => expect(
      page.evaluate<boolean>(async() => {
        const engine1 = new Comunica.QueryEngine();
        const engine2 = new Comunica.QueryEngine();
        return engine1 === engine2 || (<any>engine1).actorInitQuery === (<any>engine2).actorInitQuery;
      }),
    ).resolves.toBeFalsy());
  });

  //
  // test.describe('SELECT', () => {
  // for (const [ sourceDescription, sources ] of Object.entries(testDataSources)) {
  //     test.describe(sourceDescription, () => {
  //       test('successfully performs ASK with matches', async({ page }) => expect(
  //         page.evaluate<boolean, [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //           const engine = new Comunica.QueryEngine();
  //           const result = await engine.queryBoolean(query, { sources: [ sources[0], ...sources.slice(1) ]});
  //           return result;
  //         }, [ 'ASK { <ex:s> ?p ?o }', sources ]),
  //       ).resolves.toBeTruthy());
  //
  //       test('successfully performs ASK without matches', async({ page }) => expect(
  //         page.evaluate<boolean, [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //           const engine = new Comunica.QueryEngine();
  //           const result = await engine.queryBoolean(query, { sources: [ sources[0], ...sources.slice(1) ]});
  //           return result;
  //         }, [ 'ASK { <ex:n> ?p ?o }', sources ]),
  //       ).resolves.toBeFalsy());
  //
  //       test('successfully performs SELECT with matches', async({ page }) => expect(
  //         page.evaluate<RDF.Bindings[], [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //           const engine = new Comunica.QueryEngine();
  //           const bindingsStream = await engine.queryBindings(query, { sources: [ sources[0], ...sources.slice(1) ]});
  //           const bindingsArray = await bindingsStream.toArray();
  //           return bindingsArray;
  //         }, [ 'SELECT * WHERE { <ex:s> ?p ?o }', sources ]),
  //       ).resolves.toHaveLength(2));
  //
  //       test('successfully performs SELECT without matches', async({ page }) => expect(
  //         page.evaluate<RDF.Bindings[], [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //           const engine = new Comunica.QueryEngine();
  //           const bindingsStream = await engine.queryBindings(query, { sources: [ sources[0], ...sources.slice(1) ]});
  //           const bindingsArray = await bindingsStream.toArray();
  //           return bindingsArray;
  //         }, [ 'SELECT * WHERE { <ex:n> ?p ?o }', sources ]),
  //       ).resolves.toHaveLength(0));
  //     });
  // }
  // });
  //

  //
  // test.describe('against a SPARQL endpoint', () => {
  // test('successfully performs ASK queries with no matches', async({ page }) => expect(
  //     page.evaluate<boolean, [string, QuerySourceUnidentified]>(async([ query, source ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const result = await engine.queryBoolean(query, { sources: [ source ]});
  //       return result;
  //     }, [ 'ASK { <ex:s> ?p ?o }', sparqlEndpoint ]),
  // ).resolves.toBeFalsy());
  //
  // test('successfully performs INSERT queries', async({ page }) => expect(
  //     page.evaluate<void, [string, QuerySourceUnidentified]>(async([ query, source ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const result = await engine.queryVoid(query, { sources: [ source ]});
  //       return result;
  //     }, [ 'INSERT DATA { <ex:s> <ex:p> <ex:o> }', sparqlEndpoint ]),
  // ).resolves.toBeUndefined());
  //
  // test('successfully performs ASK queries with matches', async({ page }) => expect(
  //     page.evaluate<boolean, [string, QuerySourceUnidentified]>(async([ query, source ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const result = await engine.queryBoolean(query, { sources: [ source ]});
  //       return result;
  //     }, [ 'ASK { <ex:s> ?p ?o }', sparqlEndpoint ]),
  // ).resolves.toBeTruthy());
  //
  // test('successfully performs SELECT queries with matches', async({ page }) => expect(
  //     page.evaluate<number, [string, QuerySourceUnidentified]>(async([ query, source ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const bindingsStream = await engine.queryBindings(query, { sources: [ source ]});
  //       const bindingsArray = await bindingsStream.toArray();
  //       return bindingsArray.length;
  //     }, [ 'SELECT * WHERE { <ex:s> ?p ?o }', sparqlEndpoint ]),
  // ).resolves.toBe(1));
  //
  // test('successfully performs COUNT queries with matches', async({ page }) => expect(
  //     page.evaluate<string | undefined, [string, QuerySourceUnidentified]>(async([ query, source ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const bindingsStream = await engine.queryBindings(query, { sources: [ source ]});
  //       const bindingsArray = await bindingsStream.toArray();
  //       return bindingsArray.at(0)?.get('count')?.value;
  //     }, [ 'SELECT (COUNT(*) AS ?count) WHERE { <ex:s> ?p ?o }', sparqlEndpoint ]),
  // ).resolves.toBe('1'));
  //
  // test('successfully performs CONSTRUCT queries', async({ page }) => expect(
  //     page.evaluate<number, [string, QuerySourceUnidentified]>(async([ query, source ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const quadStream = await engine.queryQuads(query, { sources: [ source ]});
  //       const quadArray = await quadStream.toArray();
  //       return quadArray.length;
  //     }, [ 'CONSTRUCT WHERE { <ex:s> ?p ?o }', sparqlEndpoint ]),
  // ).resolves.toBe(1));
  //
  // test('successfully performs DELETE queries', async({ page }) => expect(
  //     page.evaluate<void, [string, QuerySourceUnidentified]>(async([ query, source ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const result = await engine.queryVoid(query, { sources: [ source ]});
  //       return result;
  //     }, [ 'DELETE WHERE { <ex:s> ?p ?o }', sparqlEndpoint ]),
  // ).resolves.toBeUndefined());
  //
  // test('successfully performs SELECT queries with no matches', async({ page }) => expect(
  //     page.evaluate<number, [string, QuerySourceUnidentified]>(async([ query, source ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const bindingsStream = await engine.queryBindings(query, { sources: [ source ]});
  //       const bindingsArray = await bindingsStream.toArray();
  //       return bindingsArray.length;
  //     }, [ 'SELECT * WHERE { <ex:s> ?p ?o }', sparqlEndpoint ]),
  // ).resolves.toBe(0));
  //
  // test('successfully performs SELECT queries with LIMIT and FILTER and no matches', async({ page }) => expect(
  //     page.evaluate<number, [string, QuerySourceUnidentified]>(async([ query, source ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const bindingsStream = await engine.queryBindings(query, { sources: [ source ]});
  //       const bindingsArray = await bindingsStream.toArray();
  //       return bindingsArray.length;
  //     }, [ 'SELECT * WHERE { <ex:s> ?p ?o . FILTER(?o > 0) } LIMIT 1', sparqlEndpoint ]),
  // ).resolves.toBe(0));
  //
  // test('successfully performs COUNT queries with no matches', async({ page }) => expect(
  //     page.evaluate<string | undefined, [string, QuerySourceUnidentified]>(async([ query, source ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const bindingsStream = await engine.queryBindings(query, { sources: [ source ]});
  //       const bindingsArray = await bindingsStream.toArray();
  //       return bindingsArray.at(0)?.get('count')?.value;
  //     }, [ 'SELECT (COUNT(*) AS ?count) WHERE { <ex:s> ?p ?o }', sparqlEndpoint ]),
  // ).resolves.toBe('0'));
  // });
  //
  // test.describe('against one serialized string source', () => {
  // test('successfully performs ASK queries with matches', async({ page }) => expect(
  //     page.evaluate<boolean, [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const result = await engine.queryBoolean(query, { sources: [ sources[0], ...sources ]});
  //       return result;
  //     }, [ 'ASK { ?s <ex:p> ?o }', [ turtleSource ]]),
  // ).resolves.toBeTruthy());
  //
  // test('successfully performs ASK queries without matches', async({ page }) => expect(
  //     page.evaluate<boolean, [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const result = await engine.queryBoolean(query, { sources: [ sources[0], ...sources ]});
  //       return result;
  //     }, [ 'ASK { <ex:s2> ?p ?o }', [ turtleSource ]]),
  // ).resolves.toBeFalsy());
  //
  // test('successfully performs COUNT queries with matches', async({ page }) => expect(
  //     page.evaluate<string | undefined, [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const bindingsStream = await engine.queryBindings(query, { sources: [ sources[0], ...sources ]});
  //       const bindingsArray = await bindingsStream.toArray();
  //       return bindingsArray.at(0)?.get('count')?.value;
  //     }, [ 'SELECT (COUNT(*) AS ?count) WHERE { ?s <ex:p> ?o }', [ turtleSource ]]),
  // ).resolves.toBe('2'));
  //
  // test('successfully performs COUNT queries with matches and DISTINCT', async({ page }) => expect(
  //     page.evaluate<string | undefined, [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const bindingsStream = await engine.queryBindings(query, { sources: [ sources[0], ...sources ]});
  //       const bindingsArray = await bindingsStream.toArray();
  //       return bindingsArray.at(0)?.get('count')?.value;
  //     }, [ 'SELECT (COUNT(DISTINCT *) AS ?count) WHERE { ?s <ex:p> ?o }', [ turtleSource ]]),
  // ).resolves.toBe('1'));
  //
  // test('successfully performs COUNT queries without matches', async({ page }) => expect(
  //     page.evaluate<number, [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const bindingsStream = await engine.queryBindings(query, { sources: [ sources[0], ...sources ]});
  //       const bindingsArray = await bindingsStream.toArray();
  //       return bindingsArray.length;
  //     }, [ 'SELECT (COUNT(*) AS ?count) WHERE { <ex:s2> ?p ?o }', [ turtleSource ]]),
  // ).resolves.toBe(0));
  //
  // test('successfully performs CONSTRUCT queries with matches', async({ page }) => expect(
  //     page.evaluate<number, [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const quadStream = await engine.queryQuads(query, { sources: [ sources[0], ...sources ]});
  //       const quadArray = await quadStream.toArray();
  //       return quadArray.length;
  //     }, [ 'CONSTRUCT WHERE { ?s <ex:p> ?o }', [ turtleSource ]]),
  // ).resolves.toBe(2));
  //
  // test('successfully performs CONSTRUCT queries without matches', async({ page }) => expect(
  //     page.evaluate<number, [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const quadStream = await engine.queryQuads(query, { sources: [ sources[0], ...sources ]});
  //       const quadArray = await quadStream.toArray();
  //       return quadArray.length;
  //     }, [ 'CONSTRUCT WHERE { <ex:s2> ?p ?o }', [ turtleSource ]]),
  // ).resolves.toBe(0));
  // });
  //
  // test.describe('against one online RDF document', () => {
  // test('successfully performs ASK queries with matches', async({ page }) => expect(
  //     page.evaluate<boolean, [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const result = await engine.queryBoolean(query, { sources: [ sources[0], ...sources ]});
  //       return result;
  //     }, [ 'ASK { ?s <ex:p> ?o }', [ turtleDocument ]]),
  // ).resolves.toBeTruthy());
  //
  // test('successfully performs ASK queries without matches', async({ page }) => expect(
  //     page.evaluate<boolean, [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const result = await engine.queryBoolean(query, { sources: [ sources[0], ...sources ]});
  //       return result;
  //     }, [ 'ASK { <ex:s2> ?p ?o }', [ turtleDocument ]]),
  // ).resolves.toBeFalsy());
  //
  // test('successfully performs SELECT queries with matches', async({ page }) => expect(
  //     page.evaluate<number, [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const bindingsStream = await engine.queryBindings(query, { sources: [ sources[0], ...sources ]});
  //       const bindingsArray = await bindingsStream.toArray();
  //       return bindingsArray.length;
  //     }, [ 'SELECT * WHERE { ?s <ex:p> ?o }', [ turtleDocument ]]),
  // ).resolves.toBe(2));
  //
  // test('successfully performs SELECT queries with matches multiple times with one engine', async({ page }) => expect(
  //     page.evaluate<boolean, [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const bindingsStream1 = await engine.queryBindings(query, { sources: [ sources[0], ...sources ]});
  //       const bindingsArray1 = await bindingsStream1.toArray();
  //       const bindingsStream2 = await engine.queryBindings(query, { sources: [ sources[0], ...sources ]});
  //       const bindingsArray2 = await bindingsStream2.toArray();
  //       const bindingsStream3 = await engine.queryBindings(query, { sources: [ sources[0], ...sources ]});
  //       const bindingsArray3 = await bindingsStream3.toArray();
  //       return bindingsArray1.length === bindingsArray2.length && bindingsArray1.length === bindingsArray3.length;
  //     }, [ 'SELECT * WHERE { ?s <ex:p> ?o }', [ turtleDocument ]]),
  // ).resolves.toBeTruthy());
  //
  // test('successfully performs COUNT queries with matches', async({ page }) => expect(
  //     page.evaluate<string | undefined, [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const bindingsStream = await engine.queryBindings(query, { sources: [ sources[0], ...sources ]});
  //       const bindingsArray = await bindingsStream.toArray();
  //       return bindingsArray.at(0)?.get('count')?.value;
  //     }, [ 'SELECT (COUNT(*) AS ?count) WHERE { ?s <ex:p> ?o }', [ turtleDocument ]]),
  // ).resolves.toBe('2'));
  //
  // test('successfully performs COUNT queries with matches and DISTINCT', async({ page }) => expect(
  //     page.evaluate<string | undefined, [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const bindingsStream = await engine.queryBindings(query, { sources: [ sources[0], ...sources ]});
  //       const bindingsArray = await bindingsStream.toArray();
  //       return bindingsArray.at(0)?.get('count')?.value;
  //     }, [ 'SELECT (COUNT(DISTINCT *) AS ?count) WHERE { ?s <ex:p> ?o }', [ turtleDocument ]]),
  // ).resolves.toBe('1'));
  //
  // test('successfully performs COUNT queries without matches', async({ page }) => expect(
  //     page.evaluate<number, [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const bindingsStream = await engine.queryBindings(query, { sources: [ sources[0], ...sources ]});
  //       const bindingsArray = await bindingsStream.toArray();
  //       return bindingsArray.length;
  //     }, [ 'SELECT (COUNT(*) AS ?count) WHERE { <ex:s2> ?p ?o }', [ turtleDocument ]]),
  // ).resolves.toBe(0));
  //
  // test('successfully performs CONSTRUCT queries with matches', async({ page }) => expect(
  //     page.evaluate<number, [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const quadStream = await engine.queryQuads(query, { sources: [ sources[0], ...sources ]});
  //       const quadArray = await quadStream.toArray();
  //       return quadArray.length;
  //     }, [ 'CONSTRUCT WHERE { ?s <ex:p> ?o }', [ turtleDocument ]]),
  // ).resolves.toBe(2));
  //
  // test('successfully performs CONSTRUCT queries without matches', async({ page }) => expect(
  //     page.evaluate<number, [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const quadStream = await engine.queryQuads(query, { sources: [ sources[0], ...sources ]});
  //       const quadArray = await quadStream.toArray();
  //       return quadArray.length;
  //     }, [ 'CONSTRUCT WHERE { <ex:s2> ?p ?o }', [ turtleDocument ]]),
  // ).resolves.toBe(0));
  // });
  //
  // test.describe('against two serialized string sources', () => {
  // test('successfully performs ASK queries with matches', async({ page }) => expect(
  //     page.evaluate<boolean, [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const result = await engine.queryBoolean(query, { sources: [ sources[0], ...sources ]});
  //       return result;
  //     }, [ 'ASK { <ex:s> ?p ?o }', [ turtleSource, jsonLdSource ]]),
  // ).resolves.toBeTruthy());
  //
  // test('successfully performs ASK queries without matches', async({ page }) => expect(
  //     page.evaluate<boolean, [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const result = await engine.queryBoolean(query, { sources: [ sources[0], ...sources ]});
  //       return result;
  //     }, [ 'ASK { <ex:s2> ?p ?o }', [ turtleSource, jsonLdSource ]]),
  // ).resolves.toBeFalsy());
  //
  // test('successfully performs COUNT queries with matches', async({ page }) => expect(
  //     page.evaluate<string | undefined, [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const bindingsStream = await engine.queryBindings(query, { sources: [ sources[0], ...sources ]});
  //       const bindingsArray = await bindingsStream.toArray();
  //       return bindingsArray.at(0)?.get('count')?.value;
  //     }, [ 'SELECT (COUNT(*) AS ?count) WHERE { ?s <ex:p> ?o }', [ turtleSource, jsonLdSource ]]),
  // ).resolves.toBe('3'));
  //
  // test('successfully performs COUNT queries with matches and DISTINCT', async({ page }) => expect(
  //     page.evaluate<string | undefined, [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const bindingsStream = await engine.queryBindings(query, { sources: [ sources[0], ...sources ]});
  //       const bindingsArray = await bindingsStream.toArray();
  //       return bindingsArray.at(0)?.get('count')?.value;
  //     }, [ 'SELECT (COUNT(DISTINCT *) AS ?count) WHERE { <ex:s> ?p ?o }', [ turtleSource, jsonLdSource ]]),
  // ).resolves.toBe('2'));
  //
  // test('successfully performs COUNT queries without matches', async({ page }) => expect(
  //     page.evaluate<number, [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const bindingsStream = await engine.queryBindings(query, { sources: [ sources[0], ...sources ]});
  //       const bindingsArray = await bindingsStream.toArray();
  //       return bindingsArray.length;
  //     }, [ 'SELECT (COUNT(*) AS ?count) WHERE { <ex:s2> ?p ?o }', [ turtleSource, jsonLdSource ]]),
  // ).resolves.toBe(0));
  //
  // test('successfully performs CONSTRUCT queries with matches', async({ page }) => expect(
  //     page.evaluate<number, [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const quadStream = await engine.queryQuads(query, { sources: [ sources[0], ...sources ]});
  //       const quadArray = await quadStream.toArray();
  //       return quadArray.length;
  //     }, [ 'CONSTRUCT WHERE { ?s <ex:p> ?o }', [ turtleSource, jsonLdSource ]]),
  // ).resolves.toBe(3));
  //
  // test('successfully performs CONSTRUCT queries without matches', async({ page }) => expect(
  //     page.evaluate<number, [string, QuerySourceUnidentified[]]>(async([ query, sources ]) => {
  //       const engine = new Comunica.QueryEngine();
  //       const quadStream = await engine.queryQuads(query, { sources: [ sources[0], ...sources ]});
  //       const quadArray = await quadStream.toArray();
  //       return quadArray.length;
  //     }, [ 'CONSTRUCT WHERE { <ex:s2> ?p ?o }', [ turtleSource, jsonLdSource ]]),
  // ).resolves.toBe(0));
  // });
  //
});
