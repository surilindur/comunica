# Comunica HTTP Rate Limit Actor

[![npm version](https://badge.fury.io/js/%40comunica%2Factor-http-limit-rate.svg)](https://www.npmjs.com/package/@comunica/actor-http-limit-rate)

An [HTTP](https://github.com/comunica/comunica/tree/master/packages/bus-http) actor that performs simple rate limiting.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-http-limit-rate
```

## Configure

After installing, this package can be added to your engine's configuration as follows:

```json
{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-http-limit-rate/^4.0.0/components/context.jsonld"
  ],
  "actors": [
    {
      "@id": "urn:comunica:default:http/actors#limit-rate",
      "@type": "ActorHttpRetry"
    }
  ]
}
```

### Config Parameters

* `mediatorHttp`: A mediator over the [HTTP bus](https://github.com/comunica/comunica/tree/master/packages/bus-http).
* `httpInvalidator`: A mediator over the [HTTP invalidate bus](https://github.com/comunica/comunica/tree/master/packages/bus-http-invalidate).
* `historyLength`: The number of past requests to consider for the delay average.
* `failureMultiplier`: The impact of a failed request is taken into account with this multiplier applied.
