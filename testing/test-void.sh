
COMUNICA_CONFIG="$(pwd)/engines/config-query-sparql/config/config-default.json"
COMUNICA_BIN="$(pwd)/engines/query-sparql/bin/query-dynamic.js"

QUERY1="$(pwd)/testing/qv1.sparql"
QUERY2="$(pwd)/testing/qv2.sparql"
QUERY3="$(pwd)/testing/qv3.sparql"
QUERY4="$(pwd)/testing/qv4.sparql"

COMUNICA_CONFIG="$COMUNICA_CONFIG" node "$COMUNICA_BIN" https://sparql.uniprot.org/sparql https://sparql.rhea-db.org/sparql --file "$QUERY1" --showStackTrace
#-l debug

#COMUNICA_CONFIG="$COMUNICA_CONFIG" node "$COMUNICA_BIN" https://sparql.uniprot.org/sparql https://sparql.rhea-db.org/sparql --file "$QUERY2" --showStackTrace -l debug --httpRetryCount 3 --httpRetryDelay 1000
#COMUNICA_CONFIG="$COMUNICA_CONFIG" node "$COMUNICA_BIN" https://query.wikidata.org/sparql https://sparql.rhea-db.org/sparql --file "$QUERY3" --showStackTrace
#COMUNICA_CONFIG="$COMUNICA_CONFIG" node "$COMUNICA_BIN" https://sparql.uniprot.org/sparql https://sparql.rhea-db.org/sparql --file "$QUERY4" --showStackTrace -l debug --httpRetryCount 3 --httpRetryDelay 1000 --explain logical
