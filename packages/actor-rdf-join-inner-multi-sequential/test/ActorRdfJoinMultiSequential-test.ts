import { ActorRdfJoinNestedLoop } from '@comunica/actor-rdf-join-inner-nestedloop';
import type { IActionRdfJoin } from '@comunica/bus-rdf-join';
import { ActorRdfJoin } from '@comunica/bus-rdf-join';
import type { IActionRdfJoinSelectivity, IActorRdfJoinSelectivityOutput } from '@comunica/bus-rdf-join-selectivity';
import { KeysInitQuery } from '@comunica/context-entries';
import type { Actor, IActorTest, Mediator } from '@comunica/core';
import { ActionContext, Bus } from '@comunica/core';
import type { IActionContext } from '@comunica/types';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import { MetadataValidationState } from '@comunica/utils-metadata';
import type * as RDF from '@rdfjs/types';
import { ArrayIterator } from 'asynciterator';
import { DataFactory } from 'rdf-data-factory';
import { ActorRdfJoinMultiSequential } from '../lib/ActorRdfJoinMultiSequential';
import '@comunica/utils-jest';

const DF = new DataFactory();
const BF = new BindingsFactory(DF);

describe('ActorRdfJoinMultiSequential', () => {
  let bus: any;
  let context: IActionContext;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
    context = new ActionContext({ [KeysInitQuery.dataFactory.name]: DF });
  });

  describe('The ActorRdfJoinMultiSequential module', () => {
    it('should be a function', () => {
      expect(ActorRdfJoinMultiSequential).toBeInstanceOf(Function);
    });

    it('should be a ActorRdfJoinMultiSequential constructor', () => {
      expect(new (<any> ActorRdfJoinMultiSequential)({ name: 'actor', bus }))
        .toBeInstanceOf(ActorRdfJoinMultiSequential);
      expect(new (<any> ActorRdfJoinMultiSequential)({ name: 'actor', bus }))
        .toBeInstanceOf(ActorRdfJoin);
    });

    it('should not be able to create new ActorRdfJoinMultiSequential objects without \'new\'', () => {
      expect(() => {
        (<any> ActorRdfJoinMultiSequential)();
      }).toThrow(`Class constructor ActorRdfJoinMultiSequential cannot be invoked without 'new'`);
    });
  });

  describe('An ActorRdfJoinMultiSequential instance', () => {
    let mediatorJoinSelectivity: Mediator<
    Actor<IActionRdfJoinSelectivity, IActorTest, IActorRdfJoinSelectivityOutput>,
    IActionRdfJoinSelectivity,
IActorTest,
IActorRdfJoinSelectivityOutput
>;
    let mediatorJoin: any;
    let actor: ActorRdfJoinMultiSequential;
    let action3: IActionRdfJoin;
    let action4: IActionRdfJoin;
    let invocationCounter: any;

    beforeEach(() => {
      mediatorJoinSelectivity = <any> {
        mediate: async() => ({ selectivity: 1 }),
      };
      invocationCounter = 0;
      mediatorJoin = {
        mediate(a: any) {
          if (a.entries.length === 2) {
            a.entries[0].called = invocationCounter;
            a.entries[1].called = invocationCounter;
            invocationCounter++;
            return new ActorRdfJoinNestedLoop({ name: 'actor', bus, mediatorJoinSelectivity }).run(a, undefined!);
          }
          return actor.run(a, undefined!);
        },
      };
      actor = new ActorRdfJoinMultiSequential({ name: 'actor', bus, mediatorJoin, mediatorJoinSelectivity });
      action3 = {
        type: 'inner',
        entries: [
          {
            output: {
              bindingsStream: new ArrayIterator<RDF.Bindings>([
                BF.bindings([
                  [ DF.variable('a'), DF.literal('a1') ],
                  [ DF.variable('b'), DF.literal('b1') ],
                ]),
                BF.bindings([
                  [ DF.variable('a'), DF.literal('a2') ],
                  [ DF.variable('b'), DF.literal('b2') ],
                ]),
              ]),
              metadata: () => Promise.resolve(
                {
                  state: new MetadataValidationState(),
                  cardinality: { type: 'estimate', value: 4 },
                  pageSize: 100,
                  requestTime: 10,

                  variables: [
                    { variable: DF.variable('a'), canBeUndef: false },
                    { variable: DF.variable('b'), canBeUndef: false },
                  ],
                },
              ),
              type: 'bindings',
            },
            operation: <any> {},
          },
          {
            output: {
              bindingsStream: new ArrayIterator<RDF.Bindings>([
                BF.bindings([
                  [ DF.variable('a'), DF.literal('a1') ],
                  [ DF.variable('c'), DF.literal('c1') ],
                ]),
                BF.bindings([
                  [ DF.variable('a'), DF.literal('a2') ],
                  [ DF.variable('c'), DF.literal('c2') ],
                ]),
              ]),
              metadata: () => Promise.resolve(
                {
                  state: new MetadataValidationState(),
                  cardinality: { type: 'estimate', value: 5 },
                  pageSize: 100,
                  requestTime: 20,

                  variables: [
                    { variable: DF.variable('a'), canBeUndef: false },
                    { variable: DF.variable('c'), canBeUndef: false },
                  ],
                },
              ),
              type: 'bindings',
            },
            operation: <any> {},
          },
          {
            output: {
              bindingsStream: new ArrayIterator<RDF.Bindings>([
                BF.bindings([
                  [ DF.variable('a'), DF.literal('a1') ],
                  [ DF.variable('b'), DF.literal('b1') ],
                ]),
                BF.bindings([
                  [ DF.variable('a'), DF.literal('a2') ],
                  [ DF.variable('b'), DF.literal('b2') ],
                ]),
              ]),
              metadata: () => Promise.resolve(
                {
                  state: new MetadataValidationState(),
                  cardinality: { type: 'estimate', value: 2 },
                  pageSize: 100,
                  requestTime: 30,

                  variables: [
                    { variable: DF.variable('a'), canBeUndef: false },
                    { variable: DF.variable('b'), canBeUndef: false },
                  ],
                },
              ),
              type: 'bindings',
            },
            operation: <any> {},
          },
        ],
        context,
      };
      action4 = {
        type: 'inner',
        entries: [
          {
            output: {
              bindingsStream: new ArrayIterator<RDF.Bindings>([
                BF.bindings([
                  [ DF.variable('a'), DF.literal('a1') ],
                  [ DF.variable('b'), DF.literal('b1') ],
                ]),
                BF.bindings([
                  [ DF.variable('a'), DF.literal('a2') ],
                  [ DF.variable('b'), DF.literal('b2') ],
                ]),
              ]),
              metadata: () => Promise.resolve(
                {
                  state: new MetadataValidationState(),
                  cardinality: { type: 'estimate', value: 4 },
                  pageSize: 100,
                  requestTime: 10,

                  variables: [
                    { variable: DF.variable('a'), canBeUndef: false },
                    { variable: DF.variable('b'), canBeUndef: false },
                  ],
                },
              ),
              type: 'bindings',
            },
            operation: <any> {},
          },
          {
            output: {
              bindingsStream: new ArrayIterator<RDF.Bindings>([
                BF.bindings([
                  [ DF.variable('a'), DF.literal('a1') ],
                  [ DF.variable('c'), DF.literal('c1') ],
                ]),
                BF.bindings([
                  [ DF.variable('a'), DF.literal('a2') ],
                  [ DF.variable('c'), DF.literal('c2') ],
                ]),
              ]),
              metadata: () => Promise.resolve(
                {
                  state: new MetadataValidationState(),
                  cardinality: { type: 'estimate', value: 5 },
                  pageSize: 100,
                  requestTime: 20,

                  variables: [
                    { variable: DF.variable('a'), canBeUndef: false },
                    { variable: DF.variable('c'), canBeUndef: false },
                  ],
                },
              ),
              type: 'bindings',
            },
            operation: <any> {},
          },
          {
            output: {
              bindingsStream: new ArrayIterator<RDF.Bindings>([
                BF.bindings([
                  [ DF.variable('a'), DF.literal('a1') ],
                  [ DF.variable('b'), DF.literal('b1') ],
                ]),
                BF.bindings([
                  [ DF.variable('a'), DF.literal('a2') ],
                  [ DF.variable('b'), DF.literal('b2') ],
                ]),
              ]),
              metadata: () => Promise.resolve(
                {
                  state: new MetadataValidationState(),
                  cardinality: { type: 'estimate', value: 2 },
                  pageSize: 100,
                  requestTime: 30,

                  variables: [
                    { variable: DF.variable('a'), canBeUndef: false },
                    { variable: DF.variable('b'), canBeUndef: false },
                  ],
                },
              ),
              type: 'bindings',
            },
            operation: <any> {},
          },
          {
            output: {
              bindingsStream: new ArrayIterator<RDF.Bindings>([
                BF.bindings([
                  [ DF.variable('a'), DF.literal('a1') ],
                  [ DF.variable('d'), DF.literal('d1') ],
                ]),
                BF.bindings([
                  [ DF.variable('a'), DF.literal('a2') ],
                  [ DF.variable('d'), DF.literal('d2') ],
                ]),
              ]),
              metadata: () => Promise.resolve(
                {
                  state: new MetadataValidationState(),
                  cardinality: { type: 'estimate', value: 2 },
                  pageSize: 100,
                  requestTime: 40,

                  variables: [
                    { variable: DF.variable('a'), canBeUndef: false },
                    { variable: DF.variable('d'), canBeUndef: false },
                  ],
                },
              ),
              type: 'bindings',
            },
            operation: <any> {},
          },
        ],
        context,
      };
    });

    it('should not test on 0 streams', async() => {
      await expect(actor.test({ type: 'inner', entries: [], context })).resolves
        .toFailTest('actor requires at least two join entries.');
    });

    it('should not test on 1 stream', async() => {
      await expect(actor.test({ type: 'inner', entries: [ <any> null ], context })).resolves
        .toFailTest('actor requires at least two join entries.');
    });

    it('should not test on 2 streams', async() => {
      await expect(actor.test({ type: 'inner', entries: [ <any> {}, <any> {} ], context })).resolves
        .toFailTest('actor requires 3 join entries at least. The input contained 2.');
    });

    it('should test on 3 streams', async() => {
      await expect(actor.test(action3)).resolves.toPassTest({
        iterations: 40,
        persistedItems: 0,
        blockingItems: 0,
        requestTime: 1.599_999_999_999_999_9,
      });
    });

    it('should test on 4 streams', async() => {
      await expect(actor.test(action4)).resolves.toPassTest({
        iterations: 80,
        persistedItems: 0,
        blockingItems: 0,
        requestTime: 2,
      });
    });

    it('should run on 3 streams', async() => {
      const output = await actor.run(action3, undefined!);
      expect(output.type).toBe('bindings');
      await expect((<any> output).metadata()).resolves.toEqual({
        state: expect.any(MetadataValidationState),
        cardinality: { type: 'estimate', value: 40 },

        variables: [
          { variable: DF.variable('a'), canBeUndef: false },
          { variable: DF.variable('b'), canBeUndef: false },
          { variable: DF.variable('c'), canBeUndef: false },
        ],
      });
      await expect(output.bindingsStream).toEqualBindingsStream([
        BF.bindings([
          [ DF.variable('a'), DF.literal('a1') ],
          [ DF.variable('b'), DF.literal('b1') ],
          [ DF.variable('c'), DF.literal('c1') ],
        ]),
        BF.bindings([
          [ DF.variable('a'), DF.literal('a2') ],
          [ DF.variable('b'), DF.literal('b2') ],
          [ DF.variable('c'), DF.literal('c2') ],
        ]),
      ]);

      // Check join order
      expect((<any> action3.entries[0]).called).toBe(0);
      expect((<any> action3.entries[1]).called).toBe(0);
      expect((<any> action3.entries[2]).called).toBe(1);
    });

    it('should run on 4 streams', async() => {
      const output = await actor.run(action4, undefined!);
      expect(output.type).toBe('bindings');
      await expect((<any> output).metadata()).resolves.toEqual({
        state: expect.any(MetadataValidationState),
        cardinality: { type: 'estimate', value: 80 },

        variables: [
          { variable: DF.variable('a'), canBeUndef: false },
          { variable: DF.variable('b'), canBeUndef: false },
          { variable: DF.variable('c'), canBeUndef: false },
          { variable: DF.variable('d'), canBeUndef: false },
        ],
      });
      await expect(output.bindingsStream).toEqualBindingsStream([
        BF.bindings([
          [ DF.variable('a'), DF.literal('a1') ],
          [ DF.variable('b'), DF.literal('b1') ],
          [ DF.variable('c'), DF.literal('c1') ],
          [ DF.variable('d'), DF.literal('d1') ],
        ]),
        BF.bindings([
          [ DF.variable('a'), DF.literal('a2') ],
          [ DF.variable('b'), DF.literal('b2') ],
          [ DF.variable('c'), DF.literal('c2') ],
          [ DF.variable('d'), DF.literal('d2') ],
        ]),
      ]);

      // Check join order
      expect((<any> action4.entries[0]).called).toBe(0);
      expect((<any> action4.entries[1]).called).toBe(0);
      expect((<any> action4.entries[2]).called).toBe(1);
      expect((<any> action4.entries[3]).called).toBe(2);
    });
  });
});
