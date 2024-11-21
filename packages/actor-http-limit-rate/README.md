# Comunica HTTP Rate Limit Actor

[![npm version](https://badge.fury.io/js/%40comunica%2Factor-http-limit-rate.svg)](https://www.npmjs.com/package/@comunica/actor-http-limit-rate)

An [HTTP](https://github.com/comunica/comunica/tree/master/packages/bus-http) actor that performs rate limiting,
by spacing out future requests based on past request durations.
The algorithm is a straightforward one, where the actor applies delay to outgoing requests based on URI hostname,
in an attempt to space them out in a way that roughly matches the rate at which the given host responds.
For example, if a host responds to 10 requests per second on average,
the actor will try to send roughly 10 requests a second to that host.
Whether requests are spaced out by default or not is configurable.
By default, the actor waits for the first request to fail for a given host prior to applying rate limits.

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
      "@type": "ActorHttpLimitRate"
    }
  ]
}
```

### Config Parameters

* `mediatorHttp`: A mediator over the [HTTP bus](https://github.com/comunica/comunica/tree/master/packages/bus-http).
* `httpInvalidator`: A mediator over the [HTTP invalidate bus](https://github.com/comunica/comunica/tree/master/packages/bus-http-invalidate).
* `historyLength`: The number of past requests to consider, defaults to 20.
* `failureMultiplier`: The multiplier applied to failed requests, defaults to 10.
* `limitByDefault`: Whether the actor should do rate limiting by default, already before a request fails. Defaults to `false`.
