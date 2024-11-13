/* eslint-disable import/no-extraneous-dependencies */
// import { KeysHttp } from '@comunica/context-entries';
import { LoggerPretty } from '@comunica/logger-pretty';
import { QueryEngine } from '@comunica/query-sparql';

const engine = new QueryEngine();

const query = `#uniprot38: https://sparql.uniprot.org/.well-known/sparql-examples/

PREFIX uniprotkb: <http://purl.uniprot.org/uniprot/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX pq: <http://www.wikidata.org/prop/qualifier/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX ps: <http://www.wikidata.org/prop/statement/>

SELECT ?protein ?begin ?end ?chromosome ?assembly WHERE {
  {
    BIND(uniprotkb:P05067 AS ?proteinIRI)
    BIND (SUBSTR(STR(?proteinIRI), STRLEN(STR(uniprotkb:))+1) AS ?protein)
  }
  #SERVICE <https://query.wikidata.org/sparql> {
    ?wp wdt:P352 ?protein ;
        wdt:P702 ?wg .
    ?wg p:P644   ?wgss .
    ?wgss ps:P644        ?begin ;
      pq:P1057/wdt:P1813 ?chromosome ;
      pq:P659/rdfs:label ?assembly .
    ?wg p:P645 ?wgse .
    ?wgse ps:P645        ?end ;
      pq:P1057/wdt:P1813 ?chromosome ;
      pq:P659/rdfs:label ?assembly .
    FILTER(lang(?assembly) = "en")
  #}
}`;

const sources = [ 'https://query.wikidata.org/sparql', 'https://sparql.rhea-db.org/sparql' ];

// Sources = [ 'https://query.wikidata.org/sparql' ];
// query = 'SELECT * { ?s ?p ?o } LIMIT 2';

const bindingsStream = await engine.queryBindings(query, {
  sources,
  httpRetryCount: 10,
  httpRetryDelayFallback: 1_000,
  // [KeysHttp.httpRetryStatusCodes.name]: [ 500 ],
  log: new LoggerPretty({ level: 'error' }),
});

for await (const bindings of bindingsStream) {
  // eslint-disable-next-line no-console
  console.log(bindings.toString());
}
