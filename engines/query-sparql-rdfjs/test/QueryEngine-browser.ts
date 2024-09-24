import type { QuerySourceUnidentified } from '@comunica/types';
import { test, expect } from '@playwright/test';
import { devServerUrl, bundleName } from '../../../webpack.config';
import { QueryEngine } from '../lib/index-browser';

const Comunica = { QueryEngine };

test.describe('QueryEngine', () => {
  test.beforeEach(async({ page }) => {
    await page.goto(devServerUrl);
    await page.addScriptTag({ url: bundleName, type: 'text/javascript' });
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

  test.describe('against a Turtle string source', () => {
    const source: QuerySourceUnidentified = {
      type: 'serialized',
      value: '<ex:s> <ex:p> <ex:o>. <ex:s> <ex:p2> <ex:o2>.',
      mediaType: 'text/turtle',
      baseIRI: 'http://localhost/',
    };

    test('successfully performs ASK queries with matches', async({ page }) => expect(
      page.evaluate<boolean, [string, QuerySourceUnidentified]>(async([ query, source ]) => {
        const engine = new Comunica.QueryEngine();
        const result = await engine.queryBoolean(query, { sources: [ source ]});
        return result;
      }, [ 'ASK { <ex:s> ?p ?o }', source ]),
    ).resolves.toBeTruthy());

    test('successfully performs ASK queries without matches', async({ page }) => expect(
      page.evaluate<boolean, [string, QuerySourceUnidentified]>(async([ query, source ]) => {
        const engine = new Comunica.QueryEngine();
        const result = await engine.queryBoolean(query, { sources: [ source ]});
        return result;
      }, [ 'ASK { <ex:s2> ?p ?o }', source ]),
    ).resolves.toBeFalsy());

    test('successfully performs COUNT queries with matches', async({ page }) => expect(
      page.evaluate<string | undefined, [string, QuerySourceUnidentified]>(async([ query, source ]) => {
        const engine = new Comunica.QueryEngine();
        const bindingsStream = await engine.queryBindings(query, { sources: [ source ]});
        const bindingsArray = await bindingsStream.toArray();
        return bindingsArray.at(0)?.get('count')?.value;
      }, [ 'SELECT (COUNT(*) AS ?count) WHERE { <ex:s> ?p ?o }', source ]),
    ).resolves.toBe('2'));

    test('successfully performs COUNT queries without matches', async({ page }) => expect(
      page.evaluate<string | undefined, [string, QuerySourceUnidentified]>(async([ query, source ]) => {
        const engine = new Comunica.QueryEngine();
        const bindingsStream = await engine.queryBindings(query, { sources: [ source ]});
        const bindingsArray = await bindingsStream.toArray();
        return bindingsArray.at(0)?.get('count')?.value;
      }, [ 'SELECT (COUNT(*) AS ?count) WHERE { <ex:s2> ?p ?o }', source ]),
    ).resolves.toBe('0'));

    test('successfully performs CONSTRUCT queries with matches', async({ page }) => expect(
      page.evaluate<number, [string, QuerySourceUnidentified]>(async([ query, source ]) => {
        const engine = new Comunica.QueryEngine();
        const quadStream = await engine.queryQuads(query, { sources: [ source ]});
        const quadArray = await quadStream.toArray();
        return quadArray.length;
      }, [ 'CONSTRUCT WHERE { <ex:s> ?p ?o }', source ]),
    ).resolves.toBe(2));

    test('successfully performs CONSTRUCT queries without matches', async({ page }) => expect(
      page.evaluate<number, [string, QuerySourceUnidentified]>(async([ query, source ]) => {
        const engine = new Comunica.QueryEngine();
        const quadStream = await engine.queryQuads(query, { sources: [ source ]});
        const quadArray = await quadStream.toArray();
        return quadArray.length;
      }, [ 'CONSTRUCT WHERE { <ex:s2> ?p ?o }', source ]),
    ).resolves.toBe(0));
  });
});
