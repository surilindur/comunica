# Comunica Traversal Query Source Identify Hypermedia Actor

[![npm version](https://badge.fury.io/js/%40comunica%2Factor-query-source-identify-hypermedia-traverse.svg)](https://www.npmjs.com/package/@comunica/actor-query-source-identify-hypermedia-traverse)

Comunica [Query Source Identify Hypermedia](https://github.com/comunica/comunica/tree/master/packages/bus-query-source-identify-hypermedia) actor
that handles link traversal from a seed URI, and forwards query operations to all discovered sources.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-query-source-identify-hypermedia-traverse
```

## Configure

After installing, this package can be added to your engine's configuration as follows:
```json
{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-query-source-identify-hypermedia-traverse/^4.0.0/components/context.jsonld"
  ],
  "actors": [
    {
      "@id": "urn:comunica:default:query-source-identify-hypermedia/actors#traverse",
      "@type": "ActorQuerySourceIdentifyHypermediaTraverse"
    }
  ]
}
```

### Config Parameters

*
