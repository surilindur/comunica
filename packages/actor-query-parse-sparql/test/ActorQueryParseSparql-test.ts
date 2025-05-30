import { ActorQueryParse } from '@comunica/bus-query-parse';
import { KeysInitQuery } from '@comunica/context-entries';
import { ActionContext, Bus } from '@comunica/core';
import type { IActionContext } from '@comunica/types';
import { DataFactory } from 'rdf-data-factory';
import { ActorQueryParseSparql } from '..';
import '@comunica/utils-jest';

const DF = new DataFactory();

describe('ActorQueryParseSparql', () => {
  let bus: any;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
  });

  describe('The ActorQueryParseSparql module', () => {
    it('should be a function', () => {
      expect(ActorQueryParseSparql).toBeInstanceOf(Function);
    });

    it('should be a ActorQueryParseSparql constructor', () => {
      expect(new (<any> ActorQueryParseSparql)({ name: 'actor', bus })).toBeInstanceOf(ActorQueryParseSparql);
      expect(new (<any> ActorQueryParseSparql)({ name: 'actor', bus })).toBeInstanceOf(ActorQueryParse);
    });

    it('should not be able to create new ActorQueryParseSparql objects without \'new\'', () => {
      expect(() => {
        (<any> ActorQueryParseSparql)();
      }).toThrow(`Class constructor ActorQueryParseSparql cannot be invoked without 'new'`);
    });
  });

  describe('An ActorQueryParseSparql instance', () => {
    let actor: ActorQueryParseSparql;
    let context: IActionContext;

    beforeEach(() => {
      actor = new ActorQueryParseSparql({ name: 'actor', bus });
      context = new ActionContext({ [KeysInitQuery.dataFactory.name]: DF });
    });

    it('should not test on the graphql format', async() => {
      await expect(actor.test({
        query: 'a',
        queryFormat: { language: 'graphql', version: '1.0' },
        context,
      }))
        .resolves.toFailTest(`This actor can only parse SPARQL queries`);
    });

    it('should test on no format', async() => {
      await expect(actor.test({
        query: 'a',
        context,
      })).resolves.toPassTestVoid();
    });

    it('should test on the sparql format', async() => {
      await expect(actor.test({
        query: 'a',
        queryFormat: { language: 'sparql', version: '1.1' },
        context,
      }))
        .resolves.toPassTestVoid();
    });

    it('should run', async() => {
      const result = await actor.run({ query: 'SELECT * WHERE { ?a a ?b }', context });
      expect(result).toMatchObject(
        {
          operation: {
            input: { patterns: [
              {
                graph: { value: '' },
                object: { value: 'b' },
                predicate: { value: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' },
                subject: { value: 'a' },
                type: 'pattern',
              },
            ], type: 'bgp' },
            type: 'project',
            variables: [
              {
                value: 'a',
              },
              {
                value: 'b',
              },
            ],
          },
        },
      );
    });

    it('should run for a SPARQL-star query', async() => {
      const result = await actor.run({ query: 'SELECT * WHERE { << ?a a ?q >> a ?b }', context });
      expect(result).toBeTruthy();
    });

    it('should run for an update query', async() => {
      const result = await actor.run({
        query: 'INSERT { <http://example/egbook> <http://ex.org/p> "A" } WHERE {}',
        context,
      });
      expect(result).toMatchObject({
        operation: {
          insert: [
            {
              graph: { value: '' },
              object: { value: 'A' },
              predicate: { value: 'http://ex.org/p' },
              subject: { value: 'http://example/egbook' },
              type: 'pattern',
            },
          ],
          type: 'deleteinsert',
        },
      });
    });

    it('should run with an overridden baseIRI', async() => {
      const result = await actor.run({
        query: 'BASE <http://example.org/book/> SELECT * WHERE { ?a a ?b }',
        context,
      });
      expect(result).toMatchObject({
        baseIRI: 'http://example.org/book/',
        operation: {
          input: { patterns: [
            {
              graph: { value: '' },
              object: { value: 'b' },
              predicate: { value: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' },
              subject: { value: 'a' },
              type: 'pattern',
            },
          ], type: 'bgp' },
          type: 'project',
          variables: [
            {
              value: 'a',
            },
            {
              value: 'b',
            },
          ],
        },
      });
    });
  });
});
