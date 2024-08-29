
COMUNICA_CONFIG="$(pwd)/engines/config-query-sparql/config/config-default.json"
COMUNICA_BIN="$(pwd)/engines/query-sparql/bin/query-dynamic.js"

QUERY1="$(pwd)/testing/qv1.sparql"
QUERY2="$(pwd)/testing/qv2.sparql"
QUERY3="$(pwd)/testing/qv3.sparql"
QUERY4="$(pwd)/testing/qv4.sparql"
QUERYX="$(pwd)/testing/qvX.sparql"

#COMUNICA_CONFIG="$COMUNICA_CONFIG" node "$COMUNICA_BIN" --help

#COMUNICA_CONFIG="$COMUNICA_CONFIG" node --max-old-space-size=16384 "$COMUNICA_BIN" sparql@https://lindas.admin.ch/query sparql@https://sparql.rhea-db.org/sparql --file "$QUERYX" --showStackTrace

#COMUNICA_CONFIG="$COMUNICA_CONFIG" node --max-old-space-size=16384 "$COMUNICA_BIN" sparql@https://sparql.uniprot.org/sparql sparql@https://sparql.rhea-db.org/sparql --file "$QUERY1" --showStackTrace --httpRetryCount 1 --logLevel debug

# --httpRequestsPerSecond 10

##COMUNICA_CONFIG="$COMUNICA_CONFIG" node "$COMUNICA_BIN" https://sparql.uniprot.org/sparql https://sparql.rhea-db.org/sparql --file "$QUERY2" --showStackTrace -l debug --httpRetryCount 3 --httpRetryDelay 1000

COMUNICA_CONFIG="$COMUNICA_CONFIG" node --max-old-space-size=16384 "$COMUNICA_BIN" sparql@https://query.wikidata.org/sparql sparql@https://sparql.rhea-db.org/sparql --file "$QUERY3" --showStackTrace --httpRequestsPerSecond 5 --httpRetryCount 10 --logLevel debug

#COMUNICA_CONFIG="$COMUNICA_CONFIG" node "$COMUNICA_BIN" https://sparql.uniprot.org/sparql https://sparql.rhea-db.org/sparql --file "$QUERY4" --showStackTrace -l debug --httpRetryCount 3 --httpRetryDelay 1000 --explain logical
