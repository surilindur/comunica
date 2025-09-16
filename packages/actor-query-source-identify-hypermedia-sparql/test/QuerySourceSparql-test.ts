import { Readable } from 'node:stream';
import type { MediatorHttp } from '@comunica/bus-http';
import { KeysCore, KeysInitQuery } from '@comunica/context-entries';
import { ActionContext } from '@comunica/core';
import type { IActionContext, IDataset, QueryResultCardinality } from '@comunica/types';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import type * as RDF from '@rdfjs/types';
import { ArrayIterator, EmptyIterator } from 'asynciterator';
import { SparqlEndpointFetcher } from 'fetch-sparql-endpoint';
import { LRUCache } from 'lru-cache';
import { DataFactory } from 'rdf-data-factory';

// Needed to load Headers
import 'jest-rdf';
import { Algebra, Factory, toSparql } from 'sparqlalgebrajs';
import type { BindMethod } from '../lib/ActorQuerySourceIdentifyHypermediaSparql';
import { QuerySourceSparql } from '../lib/QuerySourceSparql';
import '@comunica/utils-jest';

const nodeToWebReadable = require('readable-stream-node-to-web');
const streamToString = require('stream-to-string');

const DF = new DataFactory();
const AF = new Factory();
const BF = new BindingsFactory(DF);
const url = 'http://localhost/sparql';

describe('QuerySourceSparql', () => {
  let logger: { warn: Function };
  let context: IActionContext;
  let metadata: Record<string, any>;
  let bindMethod: BindMethod;
  let forceHttpGet: boolean;
  let cacheSize: number;
  let countTimeout: number;
  let forceGetIfUrlLengthBelow: number;
  let cardinalityCountQueries: boolean;
  let cardinalityEstimateConstruction: boolean;
  let source: QuerySourceSparql;

  const mediatorHttp: MediatorHttp = <any> {
    mediate: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    // Throw errors when unintentionally calling unmocked functions from the endpoint fetcher
    jest.spyOn(SparqlEndpointFetcher.prototype, 'fetchAsk').mockRejectedValue(new Error('fetchAsk'));
    jest.spyOn(SparqlEndpointFetcher.prototype, 'fetchBindings').mockRejectedValue(new Error('fetchBindings'));
    jest.spyOn(SparqlEndpointFetcher.prototype, 'fetchTriples').mockRejectedValue(new Error('fetchTriples'));
    jest.spyOn(SparqlEndpointFetcher.prototype, 'fetchUpdate').mockRejectedValue(new Error('fetchUpdate'));
    jest.spyOn(SparqlEndpointFetcher.prototype, 'fetchRawStream').mockRejectedValue(new Error('fetchRawStream'));
    logger = { warn: jest.fn() };
    context = new ActionContext({ [KeysCore.log.name]: logger });
    metadata = {};
    cacheSize = 0;
    bindMethod = 'values';
    countTimeout = 1000;
    forceHttpGet = false;
    forceGetIfUrlLengthBelow = 0;
    cardinalityCountQueries = true;
    cardinalityEstimateConstruction = false;
    source = new QuerySourceSparql(
      url,
      context,
      mediatorHttp,
      bindMethod,
      DF,
      AF,
      BF,
      forceHttpGet,
      cacheSize,
      countTimeout,
      cardinalityCountQueries,
      cardinalityEstimateConstruction,
      forceGetIfUrlLengthBelow,
      metadata,
    );
  });

  describe('getSelectorShape', () => {
    it('should return selector shape without extension functions', async() => {
      await expect(source.getSelectorShape()).resolves.toEqual({
        type: 'conjunction',
        children: [
          {
            type: 'disjunction',
            children: [
              {
                type: 'operation',
                operation: { operationType: 'wildcard' },
                joinBindings: true,
              },
            ],
          },
          {
            type: 'negation',
            child: {
              type: 'operation',
              operation: { operationType: 'type', type: Algebra.types.DISTINCT },
              children: [
                {
                  type: 'operation',
                  operation: { operationType: 'type', type: Algebra.types.CONSTRUCT },
                },
              ],
            },
          },
        ],
      });
    });

    it('should return selector shape with extension functions', async() => {
      source = new QuerySourceSparql(
        url,
        context,
        mediatorHttp,
        bindMethod,
        DF,
        AF,
        BF,
        forceHttpGet,
        cacheSize,
        countTimeout,
        cardinalityCountQueries,
        cardinalityEstimateConstruction,
        forceGetIfUrlLengthBelow,
        { extensionFunctions: [ 'ex:function' ]},
      );
      await expect(source.getSelectorShape()).resolves.toEqual({
        type: 'conjunction',
        children: [
          {
            type: 'disjunction',
            children: [
              {
                type: 'operation',
                operation: { operationType: 'wildcard' },
                joinBindings: true,
              },
              {
                type: 'operation',
                operation: {
                  operationType: 'type',
                  type: Algebra.types.EXPRESSION,
                  extensionFunctions: [ 'ex:function' ],
                },
                joinBindings: true,
              },
            ],
          },
          {
            type: 'negation',
            child: {
              type: 'operation',
              operation: { operationType: 'type', type: Algebra.types.DISTINCT },
              children: [
                {
                  type: 'operation',
                  operation: { operationType: 'type', type: Algebra.types.CONSTRUCT },
                },
              ],
            },
          },
        ],
      });
    });
  });

  describe('endpointFetcher', () => {
    it('fetches through the http bus with POST', async() => {
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(<any>{
        method: 'GET',
        headers: new Headers({ 'Content-Type': 'text/mock' }),
        body: nodeToWebReadable(Readable.from('stream')),
        ok: true,
      });
      expect(mediatorHttp.mediate).not.toHaveBeenCalled();
      const fetcher: SparqlEndpointFetcher = (<any>source).endpointFetcher;
      (<any>fetcher.fetchRawStream).mockRestore();
      const [ contentType, resultStream ] = await fetcher.fetchRawStream(url, 'query', '*/*');
      expect(contentType).toBe('text/mock');
      await expect(streamToString(resultStream)).resolves.toBe('stream');
      expect(mediatorHttp.mediate).toHaveBeenCalledTimes(1);
      expect(mediatorHttp.mediate).toHaveBeenNthCalledWith(1, {
        context: undefined,
        init: {
          method: 'POST',
          body: expect.any(URLSearchParams),
          headers: expect.any(Headers),
        },
        input: url,
      });
    });

    it('fetches through the http bus with POST non-encoded when supported', async() => {
      source = new QuerySourceSparql(
        url,
        context,
        mediatorHttp,
        bindMethod,
        DF,
        AF,
        BF,
        forceHttpGet,
        cacheSize,
        countTimeout,
        cardinalityCountQueries,
        cardinalityEstimateConstruction,
        forceGetIfUrlLengthBelow,
        { postAccepted: 'abc' },
      );
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(<any>{
        method: 'GET',
        headers: new Headers({ 'Content-Type': 'text/mock' }),
        body: nodeToWebReadable(Readable.from('stream')),
        ok: true,
      });
      expect(mediatorHttp.mediate).not.toHaveBeenCalled();
      const fetcher: SparqlEndpointFetcher = (<any>source).endpointFetcher;
      (<any>fetcher.fetchRawStream).mockRestore();
      const [ contentType, resultStream ] = await fetcher.fetchRawStream(url, 'query', '*/*');
      expect(contentType).toBe('text/mock');
      await expect(streamToString(resultStream)).resolves.toBe('stream');
      expect(mediatorHttp.mediate).toHaveBeenCalledTimes(1);
      expect(mediatorHttp.mediate).toHaveBeenNthCalledWith(1, {
        context: undefined,
        init: {
          method: 'POST',
          body: 'query',
          headers: expect.any(Headers),
        },
        input: url,
      });
    });

    it('fetches through the http bus with GET when forced to always use it', async() => {
      source = new QuerySourceSparql(
        url,
        context,
        mediatorHttp,
        bindMethod,
        DF,
        AF,
        BF,
        // Force HTTP GET
        true,
        cacheSize,
        countTimeout,
        cardinalityCountQueries,
        cardinalityEstimateConstruction,
        forceGetIfUrlLengthBelow,
        metadata,
      );
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(<any>{
        headers: new Headers({ 'Content-Type': 'text/mock' }),
        body: nodeToWebReadable(Readable.from('stream')),
        ok: true,
      });
      expect(mediatorHttp.mediate).not.toHaveBeenCalled();
      const fetcher: SparqlEndpointFetcher = (<any>source).endpointFetcher;
      (<any>fetcher.fetchRawStream).mockRestore();
      const [ contentType, resultStream ] = await fetcher.fetchRawStream(url, 'query', '*/*');
      expect(contentType).toBe('text/mock');
      await expect(streamToString(resultStream)).resolves.toBe('stream');
      expect(mediatorHttp.mediate).toHaveBeenCalledTimes(1);
      expect(mediatorHttp.mediate).toHaveBeenNthCalledWith(1, {
        context: undefined,
        init: {
          method: 'GET',
          body: undefined,
          headers: expect.any(Headers),
        },
        input: `${url}?query=query`,
      });
    });

    it('fetches through the http bus with GET when forced for short URLs', async() => {
      source = new QuerySourceSparql(
        url,
        context,
        mediatorHttp,
        bindMethod,
        DF,
        AF,
        BF,
        // Do not force HTTP GET
        false,
        cacheSize,
        countTimeout,
        cardinalityCountQueries,
        cardinalityEstimateConstruction,
        // Force GET for URLs below 100 character
        100,
        metadata,
      );
      jest.spyOn(mediatorHttp, 'mediate').mockResolvedValue(<any>{
        headers: new Headers({ 'Content-Type': 'text/mock' }),
        body: nodeToWebReadable(Readable.from('stream')),
        ok: true,
      });
      expect(mediatorHttp.mediate).not.toHaveBeenCalled();
      const fetcher: SparqlEndpointFetcher = (<any>source).endpointFetcher;
      (<any>fetcher.fetchRawStream).mockRestore();
      const [ contentType, resultStream ] = await fetcher.fetchRawStream(url, 'query', '*/*');
      expect(contentType).toBe('text/mock');
      await expect(streamToString(resultStream)).resolves.toBe('stream');
      expect(mediatorHttp.mediate).toHaveBeenCalledTimes(1);
      expect(mediatorHttp.mediate).toHaveBeenNthCalledWith(1, {
        context: undefined,
        init: {
          method: 'GET',
          body: undefined,
          headers: expect.any(Headers),
        },
        input: `${url}?query=query`,
      });
    });
  });

  describe('queryBindings', () => {
    const bindings: RDF.Bindings[] = [
      BF.fromRecord({ s: DF.namedNode('ex:s1') }),
      BF.fromRecord({ s: DF.namedNode('ex:s2') }),
    ];

    it('should query remote source and attach metadata', async() => {
      jest.spyOn(<any>source, 'attachMetadata').mockReturnValue(undefined);
      jest.spyOn(source, 'queryBindingsRemote').mockResolvedValue(new ArrayIterator(bindings));
      jest.spyOn(QuerySourceSparql, 'operationToQuery').mockReturnValue('query');
      jest.spyOn(QuerySourceSparql, 'addBindingsToOperation').mockRejectedValue(new Error('addBindingsToOperation'));
      expect((<any>source).attachMetadata).not.toHaveBeenCalled();
      expect(source.queryBindingsRemote).not.toHaveBeenCalled();
      expect(QuerySourceSparql.operationToQuery).not.toHaveBeenCalled();
      expect(QuerySourceSparql.addBindingsToOperation).not.toHaveBeenCalled();
      const operation = AF.createPattern(DF.namedNode('s'), DF.variable('p'), DF.namedNode('o'));
      context = context.set(KeysInitQuery.queryFormat, { language: 'sparql', version: '1.1' });
      await expect(source.queryBindings(operation, context)).toEqualBindingsStream(bindings);
      expect(QuerySourceSparql.operationToQuery).toHaveBeenCalledTimes(1);
      expect(QuerySourceSparql.addBindingsToOperation).not.toHaveBeenCalled();
      expect((<any>source).attachMetadata).toHaveBeenCalledTimes(1);
      expect(source.queryBindingsRemote).toHaveBeenCalledTimes(1);
      expect(source.queryBindingsRemote).toHaveBeenNthCalledWith(
        1,
        url,
        'query',
        expect.anything(),
        context,
        expect.anything(),
      );
    });

    it('should query remote source and include bindings', async() => {
      jest.spyOn(<any>source, 'attachMetadata').mockReturnValue(undefined);
      jest.spyOn(source, 'queryBindingsRemote').mockResolvedValue(new ArrayIterator(bindings));
      jest.spyOn(QuerySourceSparql, 'operationToQuery').mockReturnValue('query');
      jest.spyOn(QuerySourceSparql, 'addBindingsToOperation').mockImplementation((_af, _bf, op) => Promise.resolve(op));
      expect((<any>source).attachMetadata).not.toHaveBeenCalled();
      expect(source.queryBindingsRemote).not.toHaveBeenCalled();
      expect(QuerySourceSparql.operationToQuery).not.toHaveBeenCalled();
      expect(QuerySourceSparql.addBindingsToOperation).not.toHaveBeenCalled();
      const joinBindings: any = 'joinBindings';
      const operation = AF.createPattern(DF.namedNode('s'), DF.variable('p'), DF.namedNode('o'));
      context = context.set(KeysInitQuery.queryFormat, { language: 'sparql', version: '1.1' });
      await expect(source.queryBindings(operation, context, { joinBindings })).toEqualBindingsStream(bindings);
      expect(QuerySourceSparql.operationToQuery).toHaveBeenCalledTimes(1);
      expect(QuerySourceSparql.addBindingsToOperation).toHaveBeenCalledTimes(1);
      expect((<any>source).attachMetadata).toHaveBeenCalledTimes(1);
      expect(source.queryBindingsRemote).toHaveBeenCalledTimes(1);
      expect(source.queryBindingsRemote).toHaveBeenNthCalledWith(
        1,
        url,
        'query',
        expect.anything(),
        context,
        expect.anything(),
      );
    });

    it('should use original query string when available', async() => {
      jest.spyOn(<any>source, 'attachMetadata').mockReturnValue(undefined);
      jest.spyOn(source, 'queryBindingsRemote').mockResolvedValue(new ArrayIterator(bindings));
      jest.spyOn(QuerySourceSparql, 'operationToQuery').mockReturnValue('query');
      expect((<any>source).attachMetadata).not.toHaveBeenCalled();
      expect(source.queryBindingsRemote).not.toHaveBeenCalled();
      expect(QuerySourceSparql.operationToQuery).not.toHaveBeenCalled();
      const operation = AF.createPattern(DF.namedNode('s'), DF.variable('p'), DF.namedNode('o'));
      context = context
        .set(KeysInitQuery.queryFormat, { language: 'sparql', version: '1.1' })
        .set(KeysInitQuery.queryString, 'abc');
      await expect(source.queryBindings(operation, context)).toEqualBindingsStream(bindings);
      expect(QuerySourceSparql.operationToQuery).not.toHaveBeenCalled();
      expect((<any>source).attachMetadata).toHaveBeenCalledTimes(1);
      expect(source.queryBindingsRemote).toHaveBeenCalledTimes(1);
      expect(source.queryBindingsRemote).toHaveBeenNthCalledWith(
        1,
        url,
        'abc',
        expect.anything(),
        context,
        expect.anything(),
      );
    });

    it('should not use original query string when it is not sparql', async() => {
      jest.spyOn(<any>source, 'attachMetadata').mockReturnValue(undefined);
      jest.spyOn(source, 'queryBindingsRemote').mockResolvedValue(new ArrayIterator(bindings));
      jest.spyOn(QuerySourceSparql, 'operationToQuery').mockReturnValue('query');
      expect((<any>source).attachMetadata).not.toHaveBeenCalled();
      expect(source.queryBindingsRemote).not.toHaveBeenCalled();
      expect(QuerySourceSparql.operationToQuery).not.toHaveBeenCalled();
      const operation = AF.createPattern(DF.namedNode('s'), DF.variable('p'), DF.namedNode('o'));
      context = context
        .set(KeysInitQuery.queryFormat, { language: 'graphql', version: '1.0' })
        .set(KeysInitQuery.queryString, 'abc');
      await expect(source.queryBindings(operation, context)).toEqualBindingsStream(bindings);
      expect(QuerySourceSparql.operationToQuery).toHaveBeenCalledTimes(1);
      expect((<any>source).attachMetadata).toHaveBeenCalledTimes(1);
      expect(source.queryBindingsRemote).toHaveBeenCalledTimes(1);
      expect(source.queryBindingsRemote).toHaveBeenNthCalledWith(
        1,
        url,
        'query',
        expect.anything(),
        context,
        expect.anything(),
      );
    });
  });

  describe('queryQuads', () => {
    const quads: RDF.Quad[] = [
      DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o1')),
      DF.quad(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o2')),
    ];

    it('should query remote source and attach metadata', async() => {
      jest.spyOn(<any>source, 'attachMetadata').mockReturnValue(undefined);
      jest.spyOn((<any>source).endpointFetcher, 'fetchTriples').mockResolvedValue(new ArrayIterator(quads));
      jest.spyOn(QuerySourceSparql, 'operationToQuery').mockReturnValue('query');
      expect((<any>source).attachMetadata).not.toHaveBeenCalled();
      expect((<any>source).endpointFetcher.fetchTriples).not.toHaveBeenCalled();
      expect(QuerySourceSparql.operationToQuery).not.toHaveBeenCalled();
      const pattern = AF.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o'));
      const operation = AF.createConstruct(pattern, [ pattern ]);
      await expect(source.queryQuads(operation, context).toArray()).resolves.toEqualRdfQuadArray(quads);
      expect(QuerySourceSparql.operationToQuery).toHaveBeenCalledTimes(1);
      expect((<any>source).attachMetadata).toHaveBeenCalledTimes(1);
      expect((<any>source).endpointFetcher.fetchTriples).toHaveBeenCalledTimes(1);
      expect((<any>source).endpointFetcher.fetchTriples).toHaveBeenNthCalledWith(1, url, 'query');
    });

    it('should use original query string when available', async() => {
      jest.spyOn(<any>source, 'attachMetadata').mockReturnValue(undefined);
      jest.spyOn((<any>source).endpointFetcher, 'fetchTriples').mockResolvedValue(new ArrayIterator(quads));
      jest.spyOn(QuerySourceSparql, 'operationToQuery').mockReturnValue('query');
      expect((<any>source).attachMetadata).not.toHaveBeenCalled();
      expect((<any>source).endpointFetcher.fetchTriples).not.toHaveBeenCalled();
      expect(QuerySourceSparql.operationToQuery).not.toHaveBeenCalled();
      const pattern = AF.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o'));
      const operation = AF.createConstruct(pattern, [ pattern ]);
      await expect(source.queryQuads(operation, context.set(KeysInitQuery.queryString, 'abc')).toArray())
        .resolves.toEqualRdfQuadArray(quads);
      expect(QuerySourceSparql.operationToQuery).not.toHaveBeenCalled();
      expect((<any>source).attachMetadata).toHaveBeenCalledTimes(1);
      expect((<any>source).endpointFetcher.fetchTriples).toHaveBeenCalledTimes(1);
      expect((<any>source).endpointFetcher.fetchTriples).toHaveBeenNthCalledWith(1, url, 'abc');
    });
  });

  describe('queryBoolean', () => {
    const operation = AF.createAsk(AF.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o')));
    const query = AF.createProject(AF.createNop(), []);

    it('should shortcut to true when operation uses propertyFeatures', async() => {
      jest.spyOn(source, 'operationUsesPropertyFeatures').mockReturnValue(true);
      jest.spyOn((<any>source).endpointFetcher, 'fetchAsk').mockResolvedValue(false);
      jest.spyOn(QuerySourceSparql, 'operationToQuery').mockReturnValue('query');
      expect(source.operationUsesPropertyFeatures).not.toHaveBeenCalled();
      expect(QuerySourceSparql.operationToQuery).not.toHaveBeenCalled();
      expect((<any>source).endpointFetcher.fetchAsk).not.toHaveBeenCalled();
      await expect(source.queryBoolean(operation, context.set(KeysInitQuery.query, query))).resolves.toBeTruthy();
      expect(source.operationUsesPropertyFeatures).toHaveBeenCalledTimes(1);
      expect(QuerySourceSparql.operationToQuery).not.toHaveBeenCalled();
      expect((<any>source).endpointFetcher.fetchAsk).not.toHaveBeenCalled();
    });

    it('should query remote source when operation does not use propertyFeatures', async() => {
      jest.spyOn(source, 'operationUsesPropertyFeatures').mockReturnValue(false);
      jest.spyOn((<any>source).endpointFetcher, 'fetchAsk').mockResolvedValue(false);
      jest.spyOn(QuerySourceSparql, 'operationToQuery').mockReturnValue('query');
      expect(source.operationUsesPropertyFeatures).not.toHaveBeenCalled();
      expect(QuerySourceSparql.operationToQuery).not.toHaveBeenCalled();
      expect((<any>source).endpointFetcher.fetchAsk).not.toHaveBeenCalled();
      await expect(source.queryBoolean(operation, context.set(KeysInitQuery.query, query))).resolves.toBeFalsy();
      expect(source.operationUsesPropertyFeatures).toHaveBeenCalledTimes(1);
      expect(QuerySourceSparql.operationToQuery).toHaveBeenCalledTimes(1);
      expect((<any>source).endpointFetcher.fetchAsk).toHaveBeenCalledTimes(1);
      expect((<any>source).endpointFetcher.fetchAsk).toHaveBeenNthCalledWith(1, url, 'query');
    });

    it('should use original query string when available', async() => {
      jest.spyOn(source, 'operationUsesPropertyFeatures').mockReturnValue(false);
      jest.spyOn((<any>source).endpointFetcher, 'fetchAsk').mockResolvedValue(false);
      jest.spyOn(QuerySourceSparql, 'operationToQuery').mockReturnValue('query');
      expect(source.operationUsesPropertyFeatures).not.toHaveBeenCalled();
      expect(QuerySourceSparql.operationToQuery).not.toHaveBeenCalled();
      expect((<any>source).endpointFetcher.fetchAsk).not.toHaveBeenCalled();
      await expect(source.queryBoolean(
        operation,
        context.set(KeysInitQuery.query, query).set(KeysInitQuery.queryString, 'abc'),
      )).resolves.toBeFalsy();
      expect(source.operationUsesPropertyFeatures).toHaveBeenCalledTimes(1);
      expect(QuerySourceSparql.operationToQuery).not.toHaveBeenCalled();
      expect((<any>source).endpointFetcher.fetchAsk).toHaveBeenCalledTimes(1);
      expect((<any>source).endpointFetcher.fetchAsk).toHaveBeenNthCalledWith(1, url, 'abc');
    });
  });

  describe('queryVoid', () => {
    it('should query remote source', async() => {
      jest.spyOn((<any>source).endpointFetcher, 'fetchUpdate').mockResolvedValue(undefined);
      jest.spyOn(QuerySourceSparql, 'operationToQuery').mockReturnValue('query');
      expect((<any>source).endpointFetcher.fetchUpdate).not.toHaveBeenCalled();
      expect(QuerySourceSparql.operationToQuery).not.toHaveBeenCalled();
      const pattern = AF.createPattern(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'));
      const operation = AF.createDeleteInsert(undefined, [ pattern ], undefined);
      await expect(source.queryVoid(operation, context)).resolves.toBeUndefined();
      expect(QuerySourceSparql.operationToQuery).toHaveBeenCalledTimes(1);
      expect((<any>source).endpointFetcher.fetchUpdate).toHaveBeenCalledTimes(1);
      expect((<any>source).endpointFetcher.fetchUpdate).toHaveBeenNthCalledWith(1, url, 'query');
    });

    it('should use original query string when available', async() => {
      jest.spyOn((<any>source).endpointFetcher, 'fetchUpdate').mockResolvedValue(undefined);
      jest.spyOn(QuerySourceSparql, 'operationToQuery').mockReturnValue('query');
      expect((<any>source).endpointFetcher.fetchUpdate).not.toHaveBeenCalled();
      expect(QuerySourceSparql.operationToQuery).not.toHaveBeenCalled();
      const pattern = AF.createPattern(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'));
      const operation = AF.createDeleteInsert(undefined, [ pattern ], undefined);
      await expect(source.queryVoid(operation, context.set(KeysInitQuery.queryString, 'abc'))).resolves.toBeUndefined();
      expect(QuerySourceSparql.operationToQuery).not.toHaveBeenCalled();
      expect((<any>source).endpointFetcher.fetchUpdate).toHaveBeenCalledTimes(1);
      expect((<any>source).endpointFetcher.fetchUpdate).toHaveBeenNthCalledWith(1, url, 'abc');
    });
  });

  describe('attachMetadata', () => {
    it('should query remote source with count queries enabled', async() => {
      source = new QuerySourceSparql(
        url,
        context,
        mediatorHttp,
        bindMethod,
        DF,
        AF,
        BF,
        forceHttpGet,
        cacheSize,
        countTimeout,
        // Enable cardinality count queries
        true,
        cardinalityEstimateConstruction,
        forceGetIfUrlLengthBelow,
        metadata,
      );
      const metadataBindingsStream = new ArrayIterator<RDF.Bindings>([
        BF.fromRecord({ count: DF.literal('1234', 'http://www.w3.org/2001/XMLSchema#integer') }),
      ]);
      const target = new EmptyIterator();
      const operation = AF.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o'));
      const operationPromise = Promise.resolve(operation);
      jest.useFakeTimers();
      jest.spyOn(target, 'setProperty');
      jest.spyOn(source, 'queryBindingsRemote').mockResolvedValue(metadataBindingsStream);
      jest.spyOn(source, 'operationToNormalizedCountQuery').mockReturnValue('query');
      jest.spyOn(source, 'estimateOperationCardinality').mockRejectedValue(new Error('estimateOperationCardinality'));
      jest.spyOn(QuerySourceSparql, 'getOperationUndefs').mockReturnValue([]);
      expect(source.operationToNormalizedCountQuery).not.toHaveBeenCalled();
      expect(source.estimateOperationCardinality).not.toHaveBeenCalled();
      expect(source.queryBindingsRemote).not.toHaveBeenCalled();
      expect(QuerySourceSparql.getOperationUndefs).not.toHaveBeenCalled();
      // Execute the method, which will queue the metadata to be attached when it becomes available from remote stream
      expect((<any>source).attachMetadata(target, context, operationPromise)).toBeUndefined();
      expect(target.setProperty).not.toHaveBeenCalled();
      // Run all the times to make sure the metadata stream is processed
      await jest.runAllTimersAsync();
      expect(QuerySourceSparql.getOperationUndefs).toHaveBeenCalledTimes(1);
      expect(source.operationToNormalizedCountQuery).toHaveBeenCalledTimes(1);
      expect(source.estimateOperationCardinality).not.toHaveBeenCalled();
      expect(source.queryBindingsRemote).toHaveBeenCalledTimes(1);
      expect(target.setProperty).toHaveBeenCalledTimes(1);
      expect(target.setProperty).toHaveBeenNthCalledWith(1, 'metadata', expect.objectContaining({
        cardinality: { value: 1234, type: 'exact', dataset: url },
      }));
      jest.useRealTimers();
    });

    it('should use local cache when available', async() => {
      source = new QuerySourceSparql(
        url,
        context,
        mediatorHttp,
        bindMethod,
        DF,
        AF,
        BF,
        forceHttpGet,
        // Set cache size to over 0 to enable it,
        16,
        countTimeout,
        cardinalityCountQueries,
        cardinalityEstimateConstruction,
        forceGetIfUrlLengthBelow,
        metadata,
      );
      const cachedCardinality: QueryResultCardinality = { value: 9876, type: 'exact', dataset: url };
      expect((<any>source).cache).toBeInstanceOf(LRUCache);
      (<any>source).cache.set('query', cachedCardinality);
      const metadataBindingsStream = new ArrayIterator<RDF.Bindings>([
        BF.fromRecord({ count: DF.literal('1234', DF.namedNode('http://www.w3.org/2001/XMLSchema#integer')) }),
      ]);
      const target = new EmptyIterator();
      const operation = AF.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o'));
      const operationPromise = Promise.resolve(operation);
      jest.useFakeTimers();
      jest.spyOn(target, 'setProperty');
      jest.spyOn(source, 'queryBindingsRemote').mockResolvedValue(metadataBindingsStream);
      jest.spyOn(source, 'operationToNormalizedCountQuery').mockReturnValue('query');
      jest.spyOn(source, 'estimateOperationCardinality').mockRejectedValue(new Error('estimateOperationCardinality'));
      jest.spyOn(QuerySourceSparql, 'getOperationUndefs').mockReturnValue([]);
      expect(source.operationToNormalizedCountQuery).not.toHaveBeenCalled();
      expect(source.estimateOperationCardinality).not.toHaveBeenCalled();
      expect(source.queryBindingsRemote).not.toHaveBeenCalled();
      expect(QuerySourceSparql.getOperationUndefs).not.toHaveBeenCalled();
      // Execute the method, which will queue the metadata to be attached when it becomes available from remote stream
      expect((<any>source).attachMetadata(target, context, operationPromise)).toBeUndefined();
      expect(target.setProperty).not.toHaveBeenCalled();
      // Run all the times to make sure the metadata stream is processed
      await jest.runAllTimersAsync();
      expect(QuerySourceSparql.getOperationUndefs).not.toHaveBeenCalled();
      expect(source.operationToNormalizedCountQuery).toHaveBeenCalledTimes(1);
      expect(source.estimateOperationCardinality).not.toHaveBeenCalled();
      expect(source.queryBindingsRemote).not.toHaveBeenCalled();
      expect(target.setProperty).toHaveBeenCalledTimes(1);
      expect(target.setProperty).toHaveBeenNthCalledWith(1, 'metadata', expect.objectContaining({
        cardinality: cachedCardinality,
      }));
      jest.useRealTimers();
    });

    it('should return infinity with estimation and remote queries disabled', async() => {
      source = new QuerySourceSparql(
        url,
        context,
        mediatorHttp,
        bindMethod,
        DF,
        AF,
        BF,
        forceHttpGet,
        cacheSize,
        countTimeout,
        // Disable count queries
        false,
        // Disable local estimation
        false,
        forceGetIfUrlLengthBelow,
        metadata,
      );
      const target = new EmptyIterator();
      const operation = AF.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o'));
      const operationPromise = Promise.resolve(operation);
      jest.useFakeTimers();
      jest.spyOn(target, 'setProperty');
      jest.spyOn(source, 'queryBindingsRemote').mockRejectedValue(new Error('queryBindingsRemote'));
      jest.spyOn(source, 'operationToNormalizedCountQuery').mockReturnValue('query');
      jest.spyOn(source, 'estimateOperationCardinality').mockRejectedValue(new Error('estimateOperationCardinality'));
      jest.spyOn(QuerySourceSparql, 'getOperationUndefs').mockReturnValue([]);
      expect(source.operationToNormalizedCountQuery).not.toHaveBeenCalled();
      expect(source.estimateOperationCardinality).not.toHaveBeenCalled();
      expect(source.queryBindingsRemote).not.toHaveBeenCalled();
      expect(QuerySourceSparql.getOperationUndefs).not.toHaveBeenCalled();
      // Execute the method, which will queue the metadata to be attached when it becomes available from remote stream
      expect((<any>source).attachMetadata(target, context, operationPromise)).toBeUndefined();
      expect(target.setProperty).not.toHaveBeenCalled();
      // Run all the times to make sure the metadata stream is processed
      await jest.runAllTimersAsync();
      expect(QuerySourceSparql.getOperationUndefs).toHaveBeenCalledTimes(1);
      expect(source.operationToNormalizedCountQuery).toHaveBeenCalledTimes(1);
      expect(source.estimateOperationCardinality).not.toHaveBeenCalled();
      expect(source.queryBindingsRemote).not.toHaveBeenCalled();
      expect(target.setProperty).toHaveBeenCalledTimes(1);
      expect(target.setProperty).toHaveBeenNthCalledWith(1, 'metadata', expect.objectContaining({
        cardinality: { value: Number.POSITIVE_INFINITY, type: 'estimate', dataset: url },
      }));
      jest.useRealTimers();
    });

    it('should prefer local estimation when enabled', async() => {
      source = new QuerySourceSparql(
        url,
        context,
        mediatorHttp,
        bindMethod,
        DF,
        AF,
        BF,
        forceHttpGet,
        cacheSize,
        countTimeout,
        // Disable count queries
        false,
        // Enable local estimation
        true,
        forceGetIfUrlLengthBelow,
        metadata,
      );
      const target = new EmptyIterator();
      const operation = AF.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o'));
      const operationPromise = Promise.resolve(operation);
      const estimatedCardinality: QueryResultCardinality = {
        type: 'estimate',
        value: 1234567,
        dataset: url,
      };
      jest.useFakeTimers();
      jest.spyOn(target, 'setProperty');
      jest.spyOn(source, 'queryBindingsRemote').mockRejectedValue(new Error('queryBindingsRemote'));
      jest.spyOn(source, 'operationToNormalizedCountQuery').mockReturnValue('query');
      jest.spyOn(source, 'estimateOperationCardinality').mockResolvedValue(estimatedCardinality);
      // Also test the undefined passthrough at this point
      jest.spyOn(QuerySourceSparql, 'getOperationUndefs').mockReturnValue([ DF.variable('s') ]);
      expect(source.operationToNormalizedCountQuery).not.toHaveBeenCalled();
      expect(source.estimateOperationCardinality).not.toHaveBeenCalled();
      expect(source.queryBindingsRemote).not.toHaveBeenCalled();
      expect(QuerySourceSparql.getOperationUndefs).not.toHaveBeenCalled();
      // Execute the method, which will queue the metadata to be attached when it becomes available from remote stream
      expect((<any>source).attachMetadata(target, context.set(KeysInitQuery.query, AF.createNop()), operationPromise))
        .toBeUndefined();
      expect(target.setProperty).not.toHaveBeenCalled();
      // Run all the times to make sure the metadata stream is processed
      await jest.runAllTimersAsync();
      expect(QuerySourceSparql.getOperationUndefs).toHaveBeenCalledTimes(1);
      expect(source.operationToNormalizedCountQuery).toHaveBeenCalledTimes(1);
      expect(source.estimateOperationCardinality).toHaveBeenCalledTimes(1);
      expect(source.queryBindingsRemote).not.toHaveBeenCalled();
      expect(target.setProperty).toHaveBeenCalledTimes(1);
      expect(target.setProperty).toHaveBeenNthCalledWith(1, 'metadata', expect.objectContaining({
        cardinality: estimatedCardinality,
        variables: [
          // Subject is forced to can-be-undefined earlier via the mock
          { variable: DF.variable('s'), canBeUndef: true },
          { variable: DF.variable('p'), canBeUndef: false },
          { variable: DF.variable('o'), canBeUndef: false },
        ],
      }));
      jest.useRealTimers();
    });

    it('should return infinity for remote query result without count', async() => {
      const metadataBindingsStream = new ArrayIterator<RDF.Bindings>([
        BF.fromRecord({ notCount: DF.literal('9821', DF.namedNode('http://www.w3.org/2001/XMLSchema#integer')) }),
      ]);
      const target = new EmptyIterator();
      const operation = AF.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o'));
      const operationPromise = Promise.resolve(operation);
      jest.useFakeTimers();
      jest.spyOn(target, 'setProperty');
      jest.spyOn(source, 'queryBindingsRemote').mockResolvedValue(metadataBindingsStream);
      jest.spyOn(source, 'operationToNormalizedCountQuery').mockReturnValue('query');
      jest.spyOn(source, 'estimateOperationCardinality').mockRejectedValue(new Error('estimateOperationCardinality'));
      jest.spyOn(QuerySourceSparql, 'getOperationUndefs').mockReturnValue([]);
      expect(source.operationToNormalizedCountQuery).not.toHaveBeenCalled();
      expect(source.estimateOperationCardinality).not.toHaveBeenCalled();
      expect(source.queryBindingsRemote).not.toHaveBeenCalled();
      expect(QuerySourceSparql.getOperationUndefs).not.toHaveBeenCalled();
      // Execute the method, which will queue the metadata to be attached when it becomes available from remote stream
      expect((<any>source).attachMetadata(target, context, operationPromise)).toBeUndefined();
      expect(target.setProperty).not.toHaveBeenCalled();
      // Run all the times to make sure the metadata stream is processed
      await jest.runAllTimersAsync();
      expect(QuerySourceSparql.getOperationUndefs).toHaveBeenCalledTimes(1);
      expect(source.operationToNormalizedCountQuery).toHaveBeenCalledTimes(1);
      expect(source.estimateOperationCardinality).not.toHaveBeenCalled();
      expect(source.queryBindingsRemote).toHaveBeenCalledTimes(1);
      expect(target.setProperty).toHaveBeenCalledTimes(1);
      expect(target.setProperty).toHaveBeenNthCalledWith(1, 'metadata', expect.objectContaining({
        cardinality: { value: Number.POSITIVE_INFINITY, type: 'estimate', dataset: url },
      }));
      jest.useRealTimers();
    });

    it('should return infinity for empty remote query result', async() => {
      const metadataBindingsStream = new ArrayIterator<RDF.Bindings>([]);
      const target = new EmptyIterator();
      const operation = AF.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o'));
      const operationPromise = Promise.resolve(operation);
      jest.useFakeTimers();
      jest.spyOn(target, 'setProperty');
      jest.spyOn(source, 'queryBindingsRemote').mockResolvedValue(metadataBindingsStream);
      jest.spyOn(source, 'operationToNormalizedCountQuery').mockReturnValue('query');
      jest.spyOn(source, 'estimateOperationCardinality').mockRejectedValue(new Error('estimateOperationCardinality'));
      jest.spyOn(QuerySourceSparql, 'getOperationUndefs').mockReturnValue([]);
      expect(source.operationToNormalizedCountQuery).not.toHaveBeenCalled();
      expect(source.estimateOperationCardinality).not.toHaveBeenCalled();
      expect(source.queryBindingsRemote).not.toHaveBeenCalled();
      expect(QuerySourceSparql.getOperationUndefs).not.toHaveBeenCalled();
      // Execute the method, which will queue the metadata to be attached when it becomes available from remote stream
      expect((<any>source).attachMetadata(target, context, operationPromise)).toBeUndefined();
      expect(target.setProperty).not.toHaveBeenCalled();
      // Run all the times to make sure the metadata stream is processed
      await jest.runAllTimersAsync();
      expect(QuerySourceSparql.getOperationUndefs).toHaveBeenCalledTimes(1);
      expect(source.operationToNormalizedCountQuery).toHaveBeenCalledTimes(1);
      expect(source.estimateOperationCardinality).not.toHaveBeenCalled();
      expect(source.queryBindingsRemote).toHaveBeenCalledTimes(1);
      expect(target.setProperty).toHaveBeenCalledTimes(1);
      expect(target.setProperty).toHaveBeenNthCalledWith(1, 'metadata', expect.objectContaining({
        cardinality: { value: Number.POSITIVE_INFINITY, type: 'estimate', dataset: url },
      }));
      jest.useRealTimers();
    });

    it('should return infinity for failing remote queries', async() => {
      const metadataBindingsStream = new ArrayIterator<RDF.Bindings>([]);
      const target = new EmptyIterator();
      const operation = AF.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o'));
      const operationPromise = Promise.resolve(operation);
      jest.useFakeTimers();
      jest.spyOn(target, 'setProperty');
      jest.spyOn(source, 'queryBindingsRemote').mockResolvedValue(metadataBindingsStream);
      jest.spyOn(source, 'operationToNormalizedCountQuery').mockReturnValue('query');
      jest.spyOn(source, 'estimateOperationCardinality').mockRejectedValue(new Error('estimateOperationCardinality'));
      jest.spyOn(QuerySourceSparql, 'getOperationUndefs').mockReturnValue([]);
      expect(source.operationToNormalizedCountQuery).not.toHaveBeenCalled();
      expect(source.estimateOperationCardinality).not.toHaveBeenCalled();
      expect(source.queryBindingsRemote).not.toHaveBeenCalled();
      expect(QuerySourceSparql.getOperationUndefs).not.toHaveBeenCalled();
      // Execute the method, which will queue the metadata to be attached when it becomes available from remote stream
      expect((<any>source).attachMetadata(target, context, operationPromise)).toBeUndefined();
      expect(target.setProperty).not.toHaveBeenCalled();
      // Run all the times to make sure the metadata stream is processed
      await jest.runAllTimersAsync();
      expect(metadataBindingsStream.emit('error')).toBeTruthy();
      await jest.runAllTimersAsync();
      expect(QuerySourceSparql.getOperationUndefs).toHaveBeenCalledTimes(1);
      expect(source.operationToNormalizedCountQuery).toHaveBeenCalledTimes(1);
      expect(source.estimateOperationCardinality).not.toHaveBeenCalled();
      expect(source.queryBindingsRemote).toHaveBeenCalledTimes(1);
      expect(target.setProperty).toHaveBeenCalledTimes(1);
      expect(target.setProperty).toHaveBeenNthCalledWith(1, 'metadata', expect.objectContaining({
        cardinality: { value: Number.POSITIVE_INFINITY, type: 'estimate', dataset: url },
      }));
      jest.useRealTimers();
    });

    it('should return infinity for internal logic errors', async() => {
      const target = new EmptyIterator();
      const operation = AF.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o'));
      const operationPromise = Promise.resolve(operation);
      jest.useFakeTimers();
      jest.spyOn(target, 'setProperty');
      jest.spyOn(source, 'queryBindingsRemote').mockRejectedValue(new Error('queryBindingsRemote'));
      jest.spyOn(source, 'estimateOperationCardinality').mockRejectedValue(new Error('estimateOperationCardinality'));
      jest.spyOn(QuerySourceSparql, 'getOperationUndefs').mockReturnValue(<any>'undefs');
      jest.spyOn(source, 'operationToNormalizedCountQuery').mockImplementation(() => {
        throw new Error('Simulated logic error in operationToNormalizedCountQuery');
      });
      expect(source.operationToNormalizedCountQuery).not.toHaveBeenCalled();
      expect(source.estimateOperationCardinality).not.toHaveBeenCalled();
      expect(source.queryBindingsRemote).not.toHaveBeenCalled();
      expect(QuerySourceSparql.getOperationUndefs).not.toHaveBeenCalled();
      // Execute the method, which will queue the metadata to be attached when it becomes available from remote stream
      expect((<any>source).attachMetadata(target, context, operationPromise)).toBeUndefined();
      expect(target.setProperty).not.toHaveBeenCalled();
      // Run all the times to make sure the metadata stream is processed
      await jest.runAllTimersAsync();
      expect(QuerySourceSparql.getOperationUndefs).not.toHaveBeenCalled();
      expect(source.operationToNormalizedCountQuery).toHaveBeenCalledTimes(1);
      expect(source.estimateOperationCardinality).not.toHaveBeenCalled();
      expect(source.queryBindingsRemote).not.toHaveBeenCalledTimes(1);
      expect(target.setProperty).toHaveBeenCalledTimes(1);
      expect(target.setProperty).toHaveBeenNthCalledWith(1, 'metadata', expect.objectContaining({
        cardinality: { value: Number.POSITIVE_INFINITY, type: 'estimate', dataset: url },
      }));
      jest.useRealTimers();
    });
  });

  describe('operationToNormalizedCountQuery', () => {
    it('should change variable names on patterns', () => {
      const operation = AF.createPattern(DF.variable('var0'), DF.variable('var1'), DF.variable('var2'));
      const normalized = AF.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o'));
      jest.spyOn(QuerySourceSparql, 'operationToCountQuery').mockReturnValue('query');
      expect(QuerySourceSparql.operationToCountQuery).not.toHaveBeenCalled();
      expect(source.operationToNormalizedCountQuery(operation)).toBe('query');
      expect(QuerySourceSparql.operationToCountQuery).toHaveBeenCalledTimes(1);
      expect(QuerySourceSparql.operationToCountQuery).toHaveBeenNthCalledWith(1, DF, AF, normalized);
    });

    it('should not modify named nodes, blank nodes or literals', () => {
      const operation = AF.createPattern(DF.namedNode('ex:s'), DF.blankNode(), DF.literal('o'));
      jest.spyOn(QuerySourceSparql, 'operationToCountQuery').mockReturnValue('query');
      expect(QuerySourceSparql.operationToCountQuery).not.toHaveBeenCalled();
      expect(source.operationToNormalizedCountQuery(operation)).toBe('query');
      expect(QuerySourceSparql.operationToCountQuery).toHaveBeenCalledTimes(1);
      expect(QuerySourceSparql.operationToCountQuery).toHaveBeenNthCalledWith(1, DF, AF, operation);
    });

    it('should not modify non-pattern operations', () => {
      const operation = AF.createNop();
      jest.spyOn(QuerySourceSparql, 'operationToCountQuery').mockReturnValue('query');
      expect(QuerySourceSparql.operationToCountQuery).not.toHaveBeenCalled();
      expect(source.operationToNormalizedCountQuery(operation)).toBe('query');
      expect(QuerySourceSparql.operationToCountQuery).toHaveBeenCalledTimes(1);
      expect(QuerySourceSparql.operationToCountQuery).toHaveBeenNthCalledWith(1, DF, AF, operation);
    });
  });

  describe('estimateOperationCardinality', () => {
    const operation = AF.createPattern(DF.variable('s'), DF.namedNode('ex:p'), DF.variable('o'));
    const query = AF.createProject(operation, [ <RDF.Variable>operation.subject ]);

    it('should shortcut when operation uses propertyFeatures of the endpoint', async() => {
      jest.spyOn(source, 'operationUsesPropertyFeatures').mockReturnValue(true);
      jest.spyOn(source, 'operationToNormalizedCountQuery').mockReturnValue('query');
      expect(source.operationUsesPropertyFeatures).not.toHaveBeenCalled();
      expect(source.operationToNormalizedCountQuery).not.toHaveBeenCalled();
      await expect(source.estimateOperationCardinality(query, operation)).resolves.toEqual({
        type: 'estimate',
        value: 1,
        dataset: url,
      });
      expect(source.operationUsesPropertyFeatures).toHaveBeenCalledTimes(1);
      expect(source.operationToNormalizedCountQuery).not.toHaveBeenCalled();
    });

    it('should return existing estimate from cache when available', async() => {
      source = new QuerySourceSparql(
        url,
        context,
        mediatorHttp,
        bindMethod,
        DF,
        AF,
        BF,
        forceHttpGet,
        // Enable the cache
        16,
        countTimeout,
        cardinalityCountQueries,
        cardinalityEstimateConstruction,
        forceGetIfUrlLengthBelow,
        metadata,
      );
      expect((<any>source).cache).toBeInstanceOf(LRUCache);
      jest.spyOn(source, 'operationUsesPropertyFeatures').mockReturnValue(false);
      jest.spyOn(source, 'operationToNormalizedCountQuery').mockImplementation(op => toSparql(op));
      expect(source.operationUsesPropertyFeatures).not.toHaveBeenCalled();
      expect(source.operationToNormalizedCountQuery).not.toHaveBeenCalled();
      const key = source.operationToNormalizedCountQuery(operation);
      const cardinality: QueryResultCardinality = {
        type: 'estimate',
        value: 987654,
        dataset: url,
      };
      (<any>source).cache.set(key, cardinality);
      expect(source.operationToNormalizedCountQuery).toHaveBeenCalledTimes(1);
      await expect(source.estimateOperationCardinality(query, operation)).resolves.toEqual(cardinality);
      expect(source.operationUsesPropertyFeatures).toHaveBeenCalledTimes(1);
      expect(source.operationToNormalizedCountQuery).toHaveBeenCalledTimes(2);
    });

    it('should return infinity without datasets to estimate over', async() => {
      jest.spyOn(source, 'operationUsesPropertyFeatures').mockReturnValue(false);
      jest.spyOn(source, 'operationToNormalizedCountQuery').mockImplementation(op => toSparql(op));
      expect(source.operationUsesPropertyFeatures).not.toHaveBeenCalled();
      expect(source.operationToNormalizedCountQuery).not.toHaveBeenCalled();
      await expect(source.estimateOperationCardinality(query, operation)).resolves.toEqual({
        type: 'estimate',
        value: Number.POSITIVE_INFINITY,
        dataset: url,
      });
      expect(source.operationUsesPropertyFeatures).toHaveBeenCalledTimes(1);
      expect(source.operationToNormalizedCountQuery).toHaveBeenCalledTimes(1);
    });

    it('should return zero without empty array of datasets to estimate over', async() => {
      (<any>source).datasets = [];
      jest.spyOn(source, 'operationUsesPropertyFeatures').mockReturnValue(false);
      jest.spyOn(source, 'operationToNormalizedCountQuery').mockImplementation(op => toSparql(op));
      expect(source.operationUsesPropertyFeatures).not.toHaveBeenCalled();
      expect(source.operationToNormalizedCountQuery).not.toHaveBeenCalled();
      await expect(source.estimateOperationCardinality(query, operation)).resolves.toEqual({
        type: 'exact',
        value: 0,
        dataset: url,
      });
      expect(source.operationUsesPropertyFeatures).toHaveBeenCalledTimes(1);
      expect(source.operationToNormalizedCountQuery).toHaveBeenCalledTimes(1);
    });

    it('should return cardinality from default graph dataset if available', async() => {
      const defaultGraphUri = 'ex:defaultDataset';
      const defaultGraphCardinality: QueryResultCardinality = {
        type: 'estimate',
        value: 123,
        dataset: defaultGraphUri,
      };
      const defaultGraph: IDataset = {
        uri: defaultGraphUri,
        source: url,
        getCardinality: jest.fn().mockReturnValue(defaultGraphCardinality),
      };
      source = new QuerySourceSparql(
        url,
        context,
        mediatorHttp,
        bindMethod,
        DF,
        AF,
        BF,
        forceHttpGet,
        cacheSize,
        countTimeout,
        cardinalityCountQueries,
        cardinalityEstimateConstruction,
        forceGetIfUrlLengthBelow,
        { defaultGraph: defaultGraphUri, datasets: [ defaultGraph ]},
      );
      jest.spyOn(source, 'operationUsesPropertyFeatures').mockReturnValue(false);
      jest.spyOn(source, 'operationToNormalizedCountQuery').mockImplementation(op => toSparql(op));
      expect(defaultGraph.getCardinality).not.toHaveBeenCalled();
      expect(source.operationUsesPropertyFeatures).not.toHaveBeenCalled();
      expect(source.operationToNormalizedCountQuery).not.toHaveBeenCalled();
      await expect(source.estimateOperationCardinality(query, operation)).resolves.toEqual({
        type: 'estimate',
        value: 123,
        dataset: url,
      });
      expect(defaultGraph.getCardinality).toHaveBeenCalledTimes(1);
      expect(source.operationUsesPropertyFeatures).toHaveBeenCalledTimes(1);
      expect(source.operationToNormalizedCountQuery).toHaveBeenCalledTimes(1);
    });

    it('should return exact sum for union default graph over exact cardinalities', async() => {
      const graphs: IDataset[] = [
        {
          uri: 'ex:g1',
          source: url,
          getCardinality: jest.fn().mockReturnValue({ type: 'exact', value: 1, dataset: 'ex:g1' }),
        },
        {
          uri: 'ex:g2',
          source: url,
          getCardinality: jest.fn().mockReturnValue({ type: 'exact', value: 2, dataset: 'ex:g2' }),
        },
      ];
      source = new QuerySourceSparql(
        url,
        context,
        mediatorHttp,
        bindMethod,
        DF,
        AF,
        BF,
        forceHttpGet,
        cacheSize,
        countTimeout,
        cardinalityCountQueries,
        cardinalityEstimateConstruction,
        forceGetIfUrlLengthBelow,
        { unionDefaultGraph: true, datasets: <any>graphs },
      );
      jest.spyOn(source, 'operationUsesPropertyFeatures').mockReturnValue(false);
      jest.spyOn(source, 'operationToNormalizedCountQuery').mockImplementation(op => toSparql(op));
      expect(source.operationUsesPropertyFeatures).not.toHaveBeenCalled();
      expect(source.operationToNormalizedCountQuery).not.toHaveBeenCalled();
      expect(graphs[0].getCardinality).not.toHaveBeenCalled();
      expect(graphs[1].getCardinality).not.toHaveBeenCalled();
      await expect(source.estimateOperationCardinality(query, operation)).resolves.toEqual({
        type: 'exact',
        value: 3,
        dataset: url,
      });
      expect(source.operationUsesPropertyFeatures).toHaveBeenCalledTimes(1);
      expect(source.operationToNormalizedCountQuery).toHaveBeenCalledTimes(1);
      expect(graphs[0].getCardinality).toHaveBeenCalledTimes(1);
      expect(graphs[1].getCardinality).toHaveBeenCalledTimes(1);
    });

    it('should return estimate sum for union default graph over mixed cardinality estimates', async() => {
      const graphs: IDataset[] = [
        {
          uri: 'ex:g1',
          source: url,
          getCardinality: jest.fn().mockReturnValue({ type: 'exact', value: 2, dataset: 'ex:g1' }),
        },
        {
          uri: 'ex:g2',
          source: url,
          getCardinality: jest.fn().mockReturnValue({ type: 'estimate', value: 3, dataset: 'ex:g2' }),
        },
      ];
      source = new QuerySourceSparql(
        url,
        context,
        mediatorHttp,
        bindMethod,
        DF,
        AF,
        BF,
        forceHttpGet,
        cacheSize,
        countTimeout,
        cardinalityCountQueries,
        cardinalityEstimateConstruction,
        forceGetIfUrlLengthBelow,
        { unionDefaultGraph: true, datasets: <any>graphs },
      );
      jest.spyOn(source, 'operationUsesPropertyFeatures').mockReturnValue(false);
      jest.spyOn(source, 'operationToNormalizedCountQuery').mockImplementation(op => toSparql(op));
      expect(source.operationUsesPropertyFeatures).not.toHaveBeenCalled();
      expect(source.operationToNormalizedCountQuery).not.toHaveBeenCalled();
      expect(graphs[0].getCardinality).not.toHaveBeenCalled();
      expect(graphs[1].getCardinality).not.toHaveBeenCalled();
      await expect(source.estimateOperationCardinality(query, operation)).resolves.toEqual({
        type: 'estimate',
        value: 5,
        dataset: url,
      });
      expect(source.operationUsesPropertyFeatures).toHaveBeenCalledTimes(1);
      expect(source.operationToNormalizedCountQuery).toHaveBeenCalledTimes(1);
      expect(graphs[0].getCardinality).toHaveBeenCalledTimes(1);
      expect(graphs[1].getCardinality).toHaveBeenCalledTimes(1);
    });
  });

  describe('operationUsesPropertyFeatures', () => {
    const propertyFeature = DF.namedNode('ex:propertyFeature');

    it('should shortcut to false when source has no propertyFeatures', () => {
      expect(source.operationUsesPropertyFeatures(<any>'query', <any>'operation')).toBeFalsy();
    });

    it('should return false when source has propertyFeatures but operation does not', () => {
      source = new QuerySourceSparql(
        url,
        context,
        mediatorHttp,
        bindMethod,
        DF,
        AF,
        BF,
        forceHttpGet,
        cacheSize,
        countTimeout,
        cardinalityCountQueries,
        cardinalityEstimateConstruction,
        forceGetIfUrlLengthBelow,
        { propertyFeatures: [ propertyFeature.value ]},
      );
      const operation = AF.createPattern(DF.variable('s'), DF.namedNode('ex:p'), DF.variable('o'));
      const query = AF.createProject(operation, [ <RDF.Variable>operation.subject ]);
      expect(source.operationUsesPropertyFeatures(query, operation)).toBeFalsy();
    });

    it('should return true when source and operation share propertyFeatures', () => {
      source = new QuerySourceSparql(
        url,
        context,
        mediatorHttp,
        bindMethod,
        DF,
        AF,
        BF,
        forceHttpGet,
        cacheSize,
        countTimeout,
        cardinalityCountQueries,
        cardinalityEstimateConstruction,
        forceGetIfUrlLengthBelow,
        { propertyFeatures: [ propertyFeature.value ]},
      );
      const operation = AF.createPattern(DF.variable('s'), propertyFeature, DF.variable('o'));
      const query = AF.createProject(operation, [ <RDF.Variable>operation.subject ]);
      expect(source.operationUsesPropertyFeatures(query, operation)).toBeTruthy();
    });
  });

  describe('addBindingsToOperation', () => {
    it('should handle an empty stream for values', async() => {
      await expect(QuerySourceSparql.addBindingsToOperation(AF, 'values', AF.createNop(), {
        bindings: new ArrayIterator<RDF.Bindings>([], { autoStart: false }),
        metadata: <any> { variables: []},
      })).resolves.toEqual(AF.createJoin([
        AF.createValues([], []),
        AF.createNop(),
      ]));
    });

    it('should handle a non-empty stream for values', async() => {
      await expect(QuerySourceSparql.addBindingsToOperation(AF, 'values', AF.createNop(), {
        bindings: new ArrayIterator<RDF.Bindings>([
          BF.fromRecord({ a: DF.namedNode('a1') }),
          BF.fromRecord({ a: DF.namedNode('a2') }),
        ], { autoStart: false }),
        metadata: <any> { variables: [
          { variable: DF.variable('a'), canBeUndef: false },
        ]},
      })).resolves.toEqual(AF.createJoin([
        AF.createValues([ DF.variable('a') ], [
          { '?a': DF.namedNode('a1') },
          { '?a': DF.namedNode('a2') },
        ]),
        AF.createNop(),
      ]));
    });

    it('should throw on union', async() => {
      await expect(QuerySourceSparql.addBindingsToOperation(AF, 'union', AF.createNop(), {
        bindings: new ArrayIterator<RDF.Bindings>([], { autoStart: false }),
        metadata: <any> { variables: []},
      })).rejects.toThrow(`Not implemented yet: "union" case`);
    });

    it('should throw on filter', async() => {
      await expect(QuerySourceSparql.addBindingsToOperation(AF, 'filter', AF.createNop(), {
        bindings: new ArrayIterator<RDF.Bindings>([], { autoStart: false }),
        metadata: <any> { variables: []},
      })).rejects.toThrow(`Not implemented yet: "filter" case`);
    });
  });

  describe('operationToSelectQuery', () => {
    it('should wrap operations in project', () => {
      const operation = AF.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o'));
      const variables = [ <RDF.Variable>operation.subject ];
      const selectQuery = QuerySourceSparql.operationToSelectQuery(AF, operation, variables);
      expect(selectQuery.startsWith('SELECT ?s WHERE {')).toBeTruthy();
      expect(selectQuery).toContain(toSparql(operation));
    });
  });

  describe('operationToCountQuery', () => {
    it('should wrap operations in count', () => {
      const operation = AF.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o'));
      const countQuery = QuerySourceSparql.operationToCountQuery(DF, AF, operation);
      expect(countQuery.startsWith('SELECT (COUNT(*) AS ?count) WHERE {')).toBeTruthy();
      expect(countQuery).toContain(toSparql(operation));
    });
  });

  describe('operationToQuery', () => {
    it('should convert with sparqlalgebrajs', () => {
      const operation = AF.createProject(
        AF.createPattern(DF.variable('s'), DF.namedNode('ex:p'), DF.variable('o')),
        [ DF.variable('s') ],
      );
      expect(QuerySourceSparql.operationToQuery(operation)).toBe(toSparql(operation));
    });
  });

  describe('getOperationUndefs', () => {
    it('should be empty for a triple pattern', () => {
      expect(QuerySourceSparql.getOperationUndefs(
        AF.createPattern(DF.namedNode('s'), DF.variable('p'), DF.namedNode('o')),
      )).toEqual([]);
    });

    it('should handle a left join', () => {
      expect(QuerySourceSparql.getOperationUndefs(
        AF.createLeftJoin(
          AF.createPattern(DF.namedNode('s'), DF.variable('p'), DF.namedNode('o')),
          AF.createPattern(DF.namedNode('s'), DF.variable('p'), DF.namedNode('o')),
        ),
      )).toEqual([]);
      expect(QuerySourceSparql.getOperationUndefs(
        AF.createLeftJoin(
          AF.createPattern(DF.namedNode('s'), DF.variable('p1'), DF.namedNode('o')),
          AF.createPattern(DF.namedNode('s'), DF.variable('p2'), DF.namedNode('o')),
        ),
      )).toEqual([ DF.variable('p2') ]);
    });

    it('should handle a nested left join', () => {
      expect(QuerySourceSparql.getOperationUndefs(
        AF.createProject(
          AF.createLeftJoin(
            AF.createPattern(DF.namedNode('s'), DF.variable('p1'), DF.namedNode('o')),
            AF.createPattern(DF.namedNode('s'), DF.variable('p2'), DF.namedNode('o')),
          ),
          [],
        ),
      )).toEqual([ DF.variable('p2') ]);
    });

    it('should handle values with undefs', () => {
      expect(QuerySourceSparql.getOperationUndefs(
        AF.createValues(
          [ DF.variable('v'), DF.variable('w') ],
          [
            { '?v': DF.namedNode('v1') },
            { '?v': DF.namedNode('v2'), '?w': DF.namedNode('w2') },
          ],
        ),
      )).toEqual([ DF.variable('w') ]);
    });

    it('should handle values without undefs', () => {
      expect(QuerySourceSparql.getOperationUndefs(
        AF.createValues(
          [ DF.variable('v'), DF.variable('w') ],
          [
            { '?v': DF.namedNode('v1'), '?w': DF.namedNode('w1') },
            { '?v': DF.namedNode('v2'), '?w': DF.namedNode('w2') },
          ],
        ),
      )).toEqual([]);
    });

    it('should handle union without equal variables', () => {
      expect(QuerySourceSparql.getOperationUndefs(
        AF.createUnion(
          [
            AF.createPattern(DF.variable('s'), DF.variable('p1'), DF.namedNode('o')),
            AF.createPattern(DF.variable('s'), DF.variable('p2'), DF.namedNode('o')),
          ],
        ),
      )).toEqual([ DF.variable('p1'), DF.variable('p2') ]);
    });

    it('should handle union with equal variables', () => {
      expect(QuerySourceSparql.getOperationUndefs(
        AF.createUnion(
          [
            AF.createPattern(DF.variable('s'), DF.variable('p'), DF.namedNode('o')),
            AF.createPattern(DF.variable('s'), DF.variable('p'), DF.namedNode('o')),
          ],
        ),
      )).toEqual([]);
    });

    it('should handle union with equal variables but an inner with undefs', () => {
      expect(QuerySourceSparql.getOperationUndefs(
        AF.createUnion(
          [
            AF.createPattern(DF.variable('p'), DF.variable('p1'), DF.namedNode('o')),
            AF.createLeftJoin(
              AF.createPattern(DF.namedNode('s'), DF.variable('p'), DF.namedNode('o')),
              AF.createPattern(DF.namedNode('s'), DF.variable('p1'), DF.namedNode('o')),
            ),
          ],
        ),
      )).toEqual([ DF.variable('p1') ]);
    });
  });

  describe('queryBindingsRemote', () => {
    const variable = DF.variable('o');
    const bindingsRaw: Record<string, RDF.Term>[] = [
      { '?o': DF.namedNode('ex:o1') },
      { '?o': DF.namedNode('ex:o2') },
    ];
    const bindings: RDF.Bindings[] = [
      BF.fromRecord({ o: DF.namedNode('ex:o1') }),
      BF.fromRecord({ o: DF.namedNode('ex:o2') }),
    ];

    it('should query remote source', async() => {
      const variables = [ variable ];
      jest.spyOn((<any>source).endpointFetcher, 'fetchBindings').mockResolvedValue(new ArrayIterator(bindingsRaw));
      expect((<any>source).endpointFetcher.fetchBindings).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
      await expect(source.queryBindingsRemote(url, 'query', variables, context, variables))
        .resolves.toEqualBindingsStream(bindings);
      expect((<any>source).endpointFetcher.fetchBindings).toHaveBeenCalledTimes(1);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should warn of incomplete bindings', async() => {
      const unboundVariable = DF.variable('o2');
      const variables = [ variable, unboundVariable ];
      const undefVariables = [ variable ];
      jest.spyOn((<any>source).endpointFetcher, 'fetchBindings').mockResolvedValue(new ArrayIterator(bindingsRaw));
      expect((<any>source).endpointFetcher.fetchBindings).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
      await expect(source.queryBindingsRemote(url, 'query', variables, context, undefVariables))
        .resolves.toEqualBindingsStream(bindings);
      expect((<any>source).endpointFetcher.fetchBindings).toHaveBeenCalledTimes(1);
      // Ensure the warning was emitted for both bindings
      expect(logger.warn).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenNthCalledWith(1, `The endpoint ${url} failed to provide a binding for ${unboundVariable.value}.`);
      expect(logger.warn).toHaveBeenNthCalledWith(2, `The endpoint ${url} failed to provide a binding for ${unboundVariable.value}.`);
    });
  });

  describe('toString', () => {
    it('should return a string representation', async() => {
      expect(source.toString()).toBe(`QuerySourceSparql(${url})`);
    });
  });
});
