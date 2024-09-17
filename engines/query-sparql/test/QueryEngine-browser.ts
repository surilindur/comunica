import { test, expect } from '@playwright/test';
import { QueryEngine } from '../lib/index';

test('QueryEngine', async ({ page }) => {
  await page.goto('http://localhost:4000/');

  // Add the script bundles to the webpage, served directly by webpack dev server
  await page.addScriptTag({ url: '/index.js', type: 'text/javascript' });

  await expect(page.evaluate(async () => {
    const engine = new QueryEngine();
    const bindingsStream = await engine.queryBindings('SELECT * WHERE { ?s ?p ?o } LIMIT 10');
    const bindingsArray = await bindingsStream.toArray();
    return bindingsArray.length;
  }), 'successfully retrieves bindings').resolves.toBe(10);
});
