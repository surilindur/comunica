# Comunica OrderBy Sparqlee Query Operation Actor

[![npm version](https://badge.fury.io/js/%40comunica%2Factor-query-operation-orderby.svg)](https://www.npmjs.com/package/@comunica/actor-query-operation-orderby)

A [Query Operation](https://github.com/comunica/comunica/tree/master/packages/bus-query-operation) actor that handles [SPARQL `ORDER BY`](https://www.w3.org/TR/sparql11-query/#sparqlOrderBy) operations.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-query-operation-orderby
```

## Configure

After installing, this package can be added to your engine's configuration as follows:
```text
{
  "@context": [
    ...
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-query-operation-orderby/^4.0.0/components/context.jsonld"
  ],
  "actors": [
    ...
    {
      "@id": "urn:comunica:default:query-operation/actors#orderby",
      "@type": "ActorQueryOperationOrderBy",
      "mediatorQueryOperation": { "@id": "urn:comunica:default:query-operation/mediators#main" },
      "mediatorExpressionEvaluatorFactory": { "@id": "urn:comunica:default:expression-evaluator-factory/mediators#main" },
      "mediatorTermComparatorFactory": { "@id": "urn:comunica:default:term-comparator-factory/mediators#main" }
    }
  ]
}
```

### Config Parameters

* `mediatorQueryOperation`: A mediator over the [Query Operation bus](https://github.com/comunica/comunica/tree/master/packages/bus-query-operation).
* `mediatorExpressionEvaluatorFactory`: A mediator over the [Expression Evaluator Factory bus](https://github.com/comunica/comunica/tree/master/packages/bus-expression-evaluator-factory).
* `mediatorTermComparatorFactory`: A factory to create a [Term Comparator Factory bus](https://github.com/comunica/comunica/tree/master/packages/bus-term-comparator-factory).
