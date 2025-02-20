#!/bin/bash

query='SELECT ?person ?name ?book ?title {
  ?person dbpedia-owl:birthPlace [ rdfs:label "San Francisco"@en ].
  ?viafID schema:sameAs ?person;
               schema:name ?name.
  ?book dc:contributor [ foaf:name ?name ];
              dc:title ?title.
}'
context='{
  "sources": [ "https://dbpedia.org/sparql", "https://data.linkeddatafragments.org/viaf", "https://data.linkeddatafragments.org/harvard" ]
}'

node --max-old-space-size=8192 ./engines/query-sparql/bin/query.js --query "$query" --context "$context" --httpRetryCount 1 -t stats --logLevel debug
