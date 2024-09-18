import { devServerUrl, bundleName } from '@comunica/actor-init-query/webpack.config';
import { test, expect } from '@playwright/test';
import { QueryEngine } from '../lib/index-browser';

// Helper type for linting, not available in the browser itself
const Comunica = { QueryEngine };

test('QueryEngine', async({ page }) => {
  // Add the script bundles to the webpage, served directly by webpack dev server
  await page.goto(devServerUrl);
  await page.addScriptTag({ url: bundleName, type: 'text/javascript' });

  const endpoint = 'http://127.0.0.1:3030/sparql';

  await expect(
    page.evaluate<boolean, [string, [string, ...string[]]]>(async([ query, sources ]) => {
      const engine = new Comunica.QueryEngine();
      const result = await engine.queryBoolean(query, { sources });
      return result;
    }, [ 'ASK { <ex:s> ?p ?o }', [ endpoint ]]),
    'successfully performs ASK queries with no matches',
  ).resolves.toBe(false);

  await expect(
    page.evaluate<void, [string, [string, ...string[]]]>(async([ query, sources ]) => {
      const engine = new Comunica.QueryEngine();
      const result = await engine.queryVoid(query, { sources });
      return result;
    }, [ 'INSERT DATA { <ex:s> <ex:p> <ex:o> }', [ endpoint ]]),
    'successfully performs INSERT queries',
  ).resolves.toBeUndefined();

  await expect(
    page.evaluate<boolean, [string, [string, ...string[]]]>(async([ query, sources ]) => {
      const engine = new Comunica.QueryEngine();
      const result = await engine.queryBoolean(query, { sources });
      return result;
    }, [ 'ASK { <ex:s> ?p ?o }', [ endpoint ]]),
    'successfully performs ASK queries with matches',
  ).resolves.toBe(true);

  await expect(
    page.evaluate<string | undefined, [string, [string, ...string[]]]>(async([ query, sources ]) => {
      const engine = new Comunica.QueryEngine();
      const bindingsStream = await engine.queryBindings(query, { sources });
      const bindingsArray = await bindingsStream.toArray();
      return bindingsArray.at(0)?.get('count')?.value;
    }, [ 'SELECT (COUNT(*) AS ?count) WHERE { <ex:s> ?p ?o }', [ endpoint ]]),
    'successfully performs COUNT queries with matches',
  ).resolves.toBe('1');

  await expect(
    page.evaluate<number, [string, [string, ...string[]]]>(async([ query, sources ]) => {
      const engine = new Comunica.QueryEngine();
      const quadStream = await engine.queryQuads(query, { sources });
      const quadArray = await quadStream.toArray();
      return quadArray.length;
    }, [ 'CONSTRUCT { <ex:s> ?p ?o } WHERE { <ex:s> ?p ?o }', [ endpoint ]]),
    'successfully performs CONSTRUCT queries',
  ).resolves.toBe(1);

  await expect(
    page.evaluate<void, [string, [string, ...string[]]]>(async([ query, sources ]) => {
      const engine = new Comunica.QueryEngine();
      const result = await engine.queryVoid(query, { sources });
      return result;
    }, [ 'DELETE WHERE { <ex:s> ?p ?o }', [ endpoint ]]),
    'successfully performs DELETE queries',
  ).resolves.toBeUndefined();

  await expect(
    page.evaluate<string | undefined, [string, [string, ...string[]]]>(async([ query, sources ]) => {
      const engine = new Comunica.QueryEngine();
      const bindingsStream = await engine.queryBindings(query, { sources });
      const bindingsArray = await bindingsStream.toArray();
      return bindingsArray.at(0)?.get('count')?.value;
    }, [ 'SELECT (COUNT(*) AS ?count) WHERE { <ex:s> ?p ?o }', [ endpoint ]]),
    'successfully performs COUNT queries with no matches',
  ).resolves.toBe('0');
});
