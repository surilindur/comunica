/* eslint-disable import/no-nodejs-modules */
/* eslint-disable import/no-extraneous-dependencies */
import { resolve } from 'node:path';
import { KeysHttp } from '@comunica/context-entries';
import { LoggerPretty } from '@comunica/logger-pretty';
import { QueryEngineFactory } from '@comunica/query-sparql';

const factory = new QueryEngineFactory();
const config = resolve('engines', 'config-query-sparql', 'config', 'config-default.json');

const engine = await factory.create({ configPath: config });

const query = `
SELECT ?person ?name ?book ?title {
  ?person dbpedia-owl:birthPlace [ rdfs:label "San Francisco"@en ].
  ?viafID schema:sameAs ?person;
               schema:name ?name.
  ?book dc:contributor [ foaf:name ?name ];
              dc:title ?title.
}`;

const bindingsStream = await engine.queryBindings(query, {
  sources: [ 'https://dbpedia.org/sparql', 'https://data.linkeddatafragments.org/viaf', 'https://data.linkeddatafragments.org/harvard' ],
  httpRetryCount: 10,
  httpRetryDelayFallback: 1_000,
  [KeysHttp.httpRetryStatusCodes.name]: [ 405 ],
  log: new LoggerPretty({ level: 'debug' }),
});

const bindings = await bindingsStream.toArray();

// eslint-disable-next-line no-console
console.log(bindings);
