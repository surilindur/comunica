import { KeysInitQuery } from '@comunica/context-entries';
import { ActionContext } from '@comunica/core';
import type { IActionContext } from '@comunica/types';
import { DataFactory } from 'rdf-data-factory';
import { termToString } from 'rdf-string';
import { Factory } from 'sparqlalgebrajs';
import { ActorOptimizeQueryOperationExpandValues } from '../lib/ActorOptimizeQueryOperationExpandValues';
import '@comunica/utils-jest';

const DF = new DataFactory();
const AF = new Factory(DF);

const nop = AF.createNop();

const s = DF.variable('s');
const p = DF.variable('p');
const o = DF.variable('o');
const exs = DF.namedNode('ex:s');
const exp = DF.namedNode('ex:p');
const exo = DF.namedNode('ex:o');

describe('ActorOptimizeQueryOperationExpandValues', () => {
  let bus: any;
  let actor: ActorOptimizeQueryOperationExpandValues;
  let context: IActionContext;

  beforeEach(() => {
    bus = { subscribe: jest.fn() };
    actor = new ActorOptimizeQueryOperationExpandValues({ bus, name: 'actor' });
    context = new ActionContext().set(KeysInitQuery.dataFactory, DF);
    jest.restoreAllMocks();
  });

  describe('test', () => {
    it('should pass', async() => {
      const operation = AF.createNop();
      await expect(actor.test({ context, operation })).resolves.toPassTestVoid();
    });
  });

  describe('run', () => {
    const values = AF.createValues([], []);

    it('removes value bindings', async() => {
      const operation = AF.createJoin([ nop, values ]);
      jest.spyOn(ActorOptimizeQueryOperationExpandValues, 'collectValueBindings').mockReturnValue([]);
      jest.spyOn(ActorOptimizeQueryOperationExpandValues, 'expandPattern').mockReturnValue([]);
      await expect(actor.run({ context, operation })).resolves.toEqual({ operation: AF.createJoin([ nop ]), context });
      expect(ActorOptimizeQueryOperationExpandValues.collectValueBindings).toHaveBeenCalledTimes(1);
      expect(ActorOptimizeQueryOperationExpandValues.collectValueBindings).toHaveBeenNthCalledWith(1, operation);
      expect(ActorOptimizeQueryOperationExpandValues.expandPattern).not.toHaveBeenCalled();
    });

    it('removes left joins with value binding input', async() => {
      const rightSideValues = AF.createLeftJoin(nop, values);
      const leftSideValues = AF.createLeftJoin(values, nop);
      const neither = AF.createLeftJoin(nop, nop);
      jest.spyOn(ActorOptimizeQueryOperationExpandValues, 'collectValueBindings').mockReturnValue([]);
      jest.spyOn(ActorOptimizeQueryOperationExpandValues, 'expandPattern').mockReturnValue([]);
      await expect(actor.run({ context, operation: rightSideValues })).resolves.toEqual({ operation: nop, context });
      expect(ActorOptimizeQueryOperationExpandValues.collectValueBindings).toHaveBeenCalledTimes(1);
      expect(ActorOptimizeQueryOperationExpandValues.collectValueBindings).toHaveBeenNthCalledWith(1, rightSideValues);
      await expect(actor.run({ context, operation: leftSideValues })).resolves.toEqual({ operation: nop, context });
      expect(ActorOptimizeQueryOperationExpandValues.collectValueBindings).toHaveBeenCalledTimes(2);
      expect(ActorOptimizeQueryOperationExpandValues.collectValueBindings).toHaveBeenNthCalledWith(2, leftSideValues);
      await expect(actor.run({ context, operation: neither })).resolves.toEqual({ operation: neither, context });
      expect(ActorOptimizeQueryOperationExpandValues.expandPattern).not.toHaveBeenCalled();
    });

    it('handles pattern expansion into a single pattern', async() => {
      const pattern1 = AF.createPattern(s, p, o);
      const pattern2 = AF.createPattern(s, p, exo);
      const operation = AF.createJoin([ pattern1 ]);
      const operationOut = AF.createJoin([ pattern2 ]);
      jest.spyOn(ActorOptimizeQueryOperationExpandValues, 'collectValueBindings').mockReturnValue([]);
      jest.spyOn(ActorOptimizeQueryOperationExpandValues, 'expandPattern').mockReturnValue([ pattern2 ]);
      await expect(actor.run({ context, operation })).resolves.toEqual({ operation: operationOut, context });
      expect(ActorOptimizeQueryOperationExpandValues.collectValueBindings).toHaveBeenCalledTimes(1);
      expect(ActorOptimizeQueryOperationExpandValues.collectValueBindings).toHaveBeenNthCalledWith(1, operation);
      expect(ActorOptimizeQueryOperationExpandValues.expandPattern).toHaveBeenCalledTimes(1);
      expect(ActorOptimizeQueryOperationExpandValues.expandPattern).toHaveBeenNthCalledWith(1, AF, pattern1, []);
    });

    it('handles pattern expansion into multiple patterns', async() => {
      const pattern1 = AF.createPattern(s, p, o);
      const pattern2 = AF.createPattern(s, p, exo);
      const operation = AF.createJoin([ pattern1 ]);
      const operationOut = AF.createJoin([ AF.createUnion([ pattern1, pattern2 ]) ]);
      jest.spyOn(ActorOptimizeQueryOperationExpandValues, 'collectValueBindings').mockReturnValue([]);
      jest.spyOn(ActorOptimizeQueryOperationExpandValues, 'expandPattern').mockReturnValue([ pattern1, pattern2 ]);
      await expect(actor.run({ context, operation })).resolves.toEqual({ operation: operationOut, context });
      expect(ActorOptimizeQueryOperationExpandValues.collectValueBindings).toHaveBeenCalledTimes(1);
      expect(ActorOptimizeQueryOperationExpandValues.collectValueBindings).toHaveBeenNthCalledWith(1, operation);
      expect(ActorOptimizeQueryOperationExpandValues.expandPattern).toHaveBeenCalledTimes(1);
      expect(ActorOptimizeQueryOperationExpandValues.expandPattern).toHaveBeenNthCalledWith(1, AF, pattern1, []);
    });

    it('ignores service clauses', async() => {
      const pattern = AF.createPattern(s, p, o);
      const operation = AF.createJoin([ AF.createService(pattern, exs) ]);
      jest.spyOn(ActorOptimizeQueryOperationExpandValues, 'collectValueBindings').mockReturnValue([]);
      jest.spyOn(ActorOptimizeQueryOperationExpandValues, 'expandPattern').mockReturnValue([ pattern ]);
      await expect(actor.run({ context, operation })).resolves.toEqual({ operation, context });
      expect(ActorOptimizeQueryOperationExpandValues.collectValueBindings).toHaveBeenCalledTimes(1);
      expect(ActorOptimizeQueryOperationExpandValues.collectValueBindings).toHaveBeenNthCalledWith(1, operation);
      expect(ActorOptimizeQueryOperationExpandValues.expandPattern).not.toHaveBeenCalled();
    });
  });

  describe('expandPattern', () => {
    const pattern = AF.createPattern(s, p, o);

    it('returns original pattern when it contains no variables', () => {
      const values = AF.createValues([], [{}]);
      const filledPattern = AF.createPattern(exs, exp, exo);
      expect(ActorOptimizeQueryOperationExpandValues.expandPattern(AF, filledPattern, [ values ])).toEqual([
        filledPattern,
      ]);
    });

    it('returns original pattern with no value bindings', () => {
      expect(ActorOptimizeQueryOperationExpandValues.expandPattern(AF, pattern, [])).toEqual([ pattern ]);
    });

    it('returns original pattern with no applicable value bindings', () => {
      const values = AF.createValues([ s, p, o ], [{}]);
      expect(ActorOptimizeQueryOperationExpandValues.expandPattern(AF, pattern, [ values ])).toEqual([ pattern ]);
    });

    it('substitutes pattern members with value bindings', () => {
      const values = AF.createValues(
        [ s, p, o ],
        [{ [termToString(s)]: exs, [termToString(p)]: exp, [termToString(o)]: exo }],
      );
      expect(ActorOptimizeQueryOperationExpandValues.expandPattern(AF, pattern, [ values ])).toEqual([
        AF.createPattern(exs, exp, exo),
      ]);
    });

    it('returns multiple patterns with different value bindings', () => {
      const values = AF.createValues(
        [ o ],
        [{ [termToString(o)]: exo }, { [termToString(s)]: exs }],
      );
      expect(ActorOptimizeQueryOperationExpandValues.expandPattern(AF, pattern, [ values ])).toEqual([
        AF.createPattern(s, p, exo),
        AF.createPattern(exs, p, o),
      ]);
    });
  });

  describe('collectValueBindings', () => {
    it('collects all value binding operations', () => {
      const values = AF.createValues([], []);
      const operation = AF.createJoin([ nop, values ]);
      expect(ActorOptimizeQueryOperationExpandValues.collectValueBindings(operation)).toEqual([ values ]);
    });
  });
});
