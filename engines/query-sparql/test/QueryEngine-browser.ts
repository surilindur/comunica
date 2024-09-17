import { devServerUrl, bundleName } from '@comunica/actor-init-query/webpack.config';
import { test, expect } from '@playwright/test';
import { QueryEngine } from '../lib/index-browser';

// Helper type for linting, not available in the browser itself
const Comunica = { QueryEngine };

test('QueryEngine', async({ page, browserName }) => {
  // Add the script bundles to the webpage, served directly by webpack dev server
  await page.goto(devServerUrl);
  await page.addScriptTag({ url: bundleName, type: 'text/javascript' });

  const time = Date.now();

  const s = `${browserName}:s${time}`;
  const p = `${browserName}:p${time}`;
  const o = `${browserName}:o${time}`;

  const endpoint = 'http://127.0.0.1:3030/sparql';

  await expect(page.evaluate<boolean, [string, [string, ...string[]]]>(async([ query, sources ]) => {
    const engine = new Comunica.QueryEngine();
    const result = await engine.queryBoolean(query, { sources });
    return result;
  }, [ `ASK { <${s}> ?p ?o }`, [ endpoint ]]), 'successfully performs ask queries with no matches').resolves.toBe(false);

  await expect(page.evaluate<void, [string, [string, ...string[]]]>(async([ query, sources ]) => {
    const engine = new Comunica.QueryEngine();
    const result = await engine.queryVoid(query, { sources });
    return result;
  }, [ `INSERT DATA { <${s}> <${p}> <${o}> }`, [ endpoint ]]), 'successfully performs update queries').resolves.toBeUndefined();

  await expect(page.evaluate<boolean, [string, [string, ...string[]]]>(async([ query, sources ]) => {
    const engine = new Comunica.QueryEngine();
    const result = await engine.queryBoolean(query, { sources });
    return result;
  }, [ `ASK { <${s}> ?p ?o }`, [ endpoint ]]), 'successfully performs ask queries with matches').resolves.toBe(true);

  await expect(page.evaluate<string | undefined, [string, [string, ...string[]]]>(async([ query, sources ]) => {
    const engine = new Comunica.QueryEngine();
    const bindingsStream = await engine.queryBindings(query, { sources });
    const bindingsArray = await bindingsStream.toArray();
    return bindingsArray.at(0)?.get('count')?.value;
  }, [ `SELECT (COUNT(*) AS ?count) WHERE { <${s}> ?p ?o }`, [ endpoint ]]), 'successfully performs count queries with matches').resolves.toBe('1');

  await expect(page.evaluate<void, [string, [string, ...string[]]]>(async([ query, sources ]) => {
    const engine = new Comunica.QueryEngine();
    const result = await engine.queryVoid(query, { sources });
    return result;
  }, [ `DELETE WHERE { <${s}> ?p ?o }`, [ endpoint ]]), 'successfully performs delete queries').resolves.toBeUndefined();

  await expect(page.evaluate<string | undefined, [string, [string, ...string[]]]>(async([ query, sources ]) => {
    const engine = new Comunica.QueryEngine();
    const bindingsStream = await engine.queryBindings(query, { sources });
    const bindingsArray = await bindingsStream.toArray();
    return bindingsArray.at(0)?.get('count')?.value;
  }, [ `SELECT (COUNT(*) AS ?count) WHERE { <${s}> ?p ?o }`, [ endpoint ]]), 'successfully performs count queries with no matches').resolves.toBe('0');
});
