#!/bin/bash

config='engines/config-query-sparql/config/config-default.json'

context='{ "sources": [ "https://sparql.uniprot.org/sparql", "https://id.nlm.nih.gov/mesh/sparql" ] }'

query='PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX up: <http://purl.uniprot.org/core/>

SELECT
 ?disease ?protein
WHERE {
  # SERVICE<https://id.nlm.nih.gov/mesh/sparql> {
    #GRAPH <http://id.nlm.nih.gov/mesh> {
      # Mesh M0013493 represents the concept "Metabolic Diseases"
	  ?mesh <http://id.nlm.nih.gov/mesh/vocab#broaderDescriptor>* ?broader .
      ?broader <http://id.nlm.nih.gov/mesh/vocab#preferredConcept> <http://id.nlm.nih.gov/mesh/M0013493> .
    #}
  # }
  #GRAPH <http://sparql.uniprot.org/diseases>{
    ?disease a up:Disease ;
    	rdfs:seeAlso ?mesh .
    ?mesh up:database <http://purl.uniprot.org/database/MeSH> .
  #}
  #GRAPH <http://sparql.uniprot.org/uniprot> {
     ?protein up:annotation/up:disease ?disease . 
  #}
}'

COMUNICA_CONFIG="$config" node engines/query-sparql/bin/query-dynamic.js https://sparql.uniprot.org/sparql sparql@https://id.nlm.nih.gov/mesh/sparql --query "$query" -t stats

#--logLevel info 
