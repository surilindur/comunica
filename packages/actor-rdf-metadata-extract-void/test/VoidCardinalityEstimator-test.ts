import type { IQueryEngine } from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import { DataFactory } from 'rdf-data-factory';
import { Factory } from 'sparqlalgebrajs';
import type { IVoidDataset } from '../lib/ActorRdfMetadataExtractVoid';
import { VoidCardinalityEstimator } from '../lib/VoidCardinalityEstimator';

const DF = new DataFactory();
const AF = new Factory(DF);

describe('VoidCardinalityEstimator', () => {
  let estimator: VoidCardinalityEstimator;
  let queryEngine: IQueryEngine;
  let dataset: IVoidDataset;

  const bindingsCacheSize = 10;

  beforeEach(() => {
    queryEngine = <any>{
      queryBindings: jest.fn().mockResolvedValue({ toArray: jest.fn().mockResolvedValue([]) }),
    };
    dataset = <any>{ identifier: DF.blankNode() };
    estimator = new VoidCardinalityEstimator(queryEngine, bindingsCacheSize);
  });

  describe('estimateOperationCardinality', () => {
    it('should return the estimated cardinality for Algebra.Pattern', async() => {
      const cardinality: RDF.QueryResultCardinality = { type: 'estimate', value: 123 };
      jest.spyOn(estimator, 'estimatePatternCardinality').mockResolvedValue(cardinality);
      await expect(estimator.estimateOperationCardinality(<any>{
        type: 'pattern',
      }, dataset)).resolves.toEqual(cardinality);
    });

    it('should return the estimated cardinality for Algebra.Bgp', async() => {
      const cardinality: RDF.QueryResultCardinality = { type: 'estimate', value: 123 };
      jest.spyOn(estimator, 'estimateBgpCardinality').mockResolvedValue(cardinality);
      await expect(estimator.estimateOperationCardinality(<any>{
        type: 'bgp',
      }, dataset)).resolves.toEqual(cardinality);
    });
  });

  describe('estimatePatternCardinality', () => {
    it('should return the estimated cardinality', async() => {
      jest.spyOn(estimator, 'matchUriRegexPattern').mockReturnValue(true);
      jest.spyOn(estimator, 'matchVocabularies').mockReturnValue(true);
      jest.spyOn(estimator, 'estimatePatternCardinalityRaw').mockResolvedValue(1);
      expect(estimator.matchUriRegexPattern).not.toHaveBeenCalled();
      expect(estimator.matchVocabularies).not.toHaveBeenCalled();
      expect(estimator.estimatePatternCardinalityRaw).not.toHaveBeenCalled();
      await expect(estimator.estimatePatternCardinality(<any>{}, dataset)).resolves.toEqual({
        type: 'estimate',
        value: 1,
      });
      expect(estimator.matchUriRegexPattern).toHaveBeenCalledTimes(1);
      expect(estimator.matchVocabularies).toHaveBeenCalledTimes(1);
      expect(estimator.estimatePatternCardinalityRaw).toHaveBeenCalledTimes(1);
    });

    it('should return 0 when the dataset cannot answer the pattern', async() => {
      jest.spyOn(estimator, 'matchUriRegexPattern').mockReturnValue(false);
      jest.spyOn(estimator, 'matchVocabularies').mockReturnValue(false);
      jest.spyOn(estimator, 'estimatePatternCardinalityRaw').mockResolvedValue(1);
      expect(estimator.matchUriRegexPattern).not.toHaveBeenCalled();
      expect(estimator.matchVocabularies).not.toHaveBeenCalled();
      expect(estimator.estimatePatternCardinalityRaw).not.toHaveBeenCalled();
      await expect(estimator.estimatePatternCardinality(<any>{}, dataset)).resolves.toEqual({
        type: 'exact',
        value: 0,
      });
      expect(estimator.matchVocabularies).toHaveBeenCalledTimes(1);
      expect(estimator.matchUriRegexPattern).not.toHaveBeenCalled();
      expect(estimator.estimatePatternCardinalityRaw).not.toHaveBeenCalled();
    });
  });

  describe('matchUriRegexPattern', () => {
    const pattern = AF.createPattern(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o'));

    it('should return true without regex provided', () => {
      expect(estimator.matchUriRegexPattern(pattern, <any>{ uriRegexPattern: undefined })).toBeTruthy();
    });

    it('should return true with matching regex provided', () => {
      expect(estimator.matchUriRegexPattern(pattern, <any>{ uriRegexPattern: /^ex:/u })).toBeTruthy();
    });

    it('should return false with non-matching regex provided', () => {
      expect(estimator.matchUriRegexPattern(pattern, <any>{ uriRegexPattern: /^ex2:/u })).toBeFalsy();
    });
  });

  describe('matchVocabularies', () => {
    const pattern = AF.createPattern(DF.variable('s'), DF.namedNode('ex:p'), DF.variable('o'));

    it('should return true without vocabularies provided', () => {
      expect(estimator.matchVocabularies(pattern, <any>{ vocabularies: undefined })).toBeTruthy();
    });

    it('should return true when matching vocabularies are provided', () => {
      expect(estimator.matchVocabularies(pattern, <any>{ vocabularies: [ 'ex:' ]})).toBeTruthy();
    });

    it('should return false with non-matching vocabularies provided', () => {
      expect(estimator.matchVocabularies(pattern, <any>{ vocabularies: [ 'ex2:' ]})).toBeFalsy();
    });
  });

  describe('estimatePatternCardinalityRaw', () => {
    const rdfType = DF.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');

    describe.each([
      /* eslint-disable max-len */
      [ '?s rdf:type <o>', AF.createPattern(DF.variable('s'), rdfType, DF.namedNode('ex:o')), 3, 3, 0 ],
      [ '?s ?p ?o', AF.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o')), 9, 0, 9 ],
      [ '<s> ?p ?o', AF.createPattern(DF.namedNode('ex:s'), DF.variable('p'), DF.variable('o')), 3, 0, Number.POSITIVE_INFINITY ],
      [ '?s <p> ?o', AF.createPattern(DF.variable('s'), DF.namedNode('ex:p'), DF.variable('o')), 9, 0, 9 ],
      [ '?s ?p <o>', AF.createPattern(DF.variable('s'), DF.variable('p'), DF.namedNode('ex:o')), 3, 0, Number.POSITIVE_INFINITY ],
      [ '<s> <p> ?o', AF.createPattern(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.variable('o')), 3, 0, Number.POSITIVE_INFINITY ],
      [ '<s> ?p <o>', AF.createPattern(DF.namedNode('ex:s'), DF.variable('p'), DF.namedNode('ex:o')), 1, 0, Number.POSITIVE_INFINITY ],
      [ '?s <p> <o>', AF.createPattern(DF.variable('s'), DF.namedNode('ex:p'), DF.namedNode('ex:o')), 3, 0, Number.POSITIVE_INFINITY ],
      [ '<s> <p> <o>', AF.createPattern(DF.namedNode('ex:s'), DF.namedNode('ex:p'), DF.namedNode('ex:o')), 1, 0, Number.POSITIVE_INFINITY ],
    ])('should execute successfully for %s', (type, pattern, value, valueWith0Triples, valueWith0Divisor) => {
      /* eslint-enable max-len */
      it('with triple counts provided', async() => {
        jest.spyOn(estimator, 'getTriples').mockResolvedValue(9);
        jest.spyOn(estimator, 'getDistinctSubjects').mockResolvedValue(3);
        jest.spyOn(estimator, 'getDistinctObjects').mockResolvedValue(3);
        jest.spyOn(estimator, 'getPredicateTriples').mockResolvedValue(9);
        jest.spyOn(estimator, 'getPredicateObjects').mockResolvedValue(3);
        jest.spyOn(estimator, 'getPredicateSubjects').mockResolvedValue(3);
        jest.spyOn(estimator, 'getClassPartitionEntities').mockResolvedValue(3);
        await expect(estimator.estimatePatternCardinalityRaw(pattern, dataset)).resolves.toBe(value);
      });

      it('with no triple counts provided', async() => {
        jest.spyOn(estimator, 'getTriples').mockResolvedValue(0);
        jest.spyOn(estimator, 'getDistinctSubjects').mockResolvedValue(3);
        jest.spyOn(estimator, 'getDistinctObjects').mockResolvedValue(3);
        jest.spyOn(estimator, 'getPredicateTriples').mockResolvedValue(0);
        jest.spyOn(estimator, 'getPredicateObjects').mockResolvedValue(3);
        jest.spyOn(estimator, 'getPredicateSubjects').mockResolvedValue(3);
        jest.spyOn(estimator, 'getClassPartitionEntities').mockResolvedValue(3);
        await expect(estimator.estimatePatternCardinalityRaw(pattern, dataset)).resolves.toBe(valueWith0Triples);
      });

      it('with formulae divisors approaching zero', async() => {
        jest.spyOn(estimator, 'getTriples').mockResolvedValue(9);
        jest.spyOn(estimator, 'getDistinctSubjects').mockResolvedValue(0);
        jest.spyOn(estimator, 'getDistinctObjects').mockResolvedValue(0);
        jest.spyOn(estimator, 'getPredicateTriples').mockResolvedValue(9);
        jest.spyOn(estimator, 'getPredicateObjects').mockResolvedValue(0);
        jest.spyOn(estimator, 'getPredicateSubjects').mockResolvedValue(0);
        jest.spyOn(estimator, 'getClassPartitionEntities').mockResolvedValue(0);
        await expect(estimator.estimatePatternCardinalityRaw(pattern, dataset)).resolves.toBe(valueWith0Divisor);
      });
    });
  });

  describe('getTriples', () => {
    it('should execute successfully', async() => {
      jest.spyOn(estimator, 'getBindings').mockResolvedValue([]);
      expect(estimator.getBindings).not.toHaveBeenCalled();
      await expect(estimator.getTriples(dataset)).resolves.toBe(0);
      expect(estimator.getBindings).toHaveBeenCalledTimes(1);
    });
  });

  describe('getDistinctSubjects', () => {
    it('should execute successfully', async() => {
      jest.spyOn(estimator, 'getBindings').mockResolvedValue([]);
      expect(estimator.getBindings).not.toHaveBeenCalled();
      await expect(estimator.getDistinctSubjects(dataset)).resolves.toBe(0);
      expect(estimator.getBindings).toHaveBeenCalledTimes(1);
    });
  });

  describe('getDistinctObjects', () => {
    it('should execute successfully', async() => {
      jest.spyOn(estimator, 'getBindings').mockResolvedValue([]);
      expect(estimator.getBindings).not.toHaveBeenCalled();
      await expect(estimator.getDistinctObjects(dataset)).resolves.toBe(0);
      expect(estimator.getBindings).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPredicateTriples', () => {
    it('should execute successfully', async() => {
      jest.spyOn(estimator, 'getBindings').mockResolvedValue([]);
      expect(estimator.getBindings).not.toHaveBeenCalled();
      await expect(estimator.getPredicateTriples(dataset, DF.namedNode('ex:p'))).resolves.toBe(0);
      expect(estimator.getBindings).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPredicateSubjects', () => {
    it('should execute successfully', async() => {
      jest.spyOn(estimator, 'getBindings').mockResolvedValue([]);
      expect(estimator.getBindings).not.toHaveBeenCalled();
      await expect(estimator.getPredicateSubjects(dataset, DF.namedNode('ex:p'))).resolves.toBe(0);
      expect(estimator.getBindings).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPredicateObjects', () => {
    it('should execute successfully', async() => {
      jest.spyOn(estimator, 'getBindings').mockResolvedValue([]);
      expect(estimator.getBindings).not.toHaveBeenCalled();
      await expect(estimator.getPredicateObjects(dataset, DF.namedNode('ex:p'))).resolves.toBe(0);
      expect(estimator.getBindings).toHaveBeenCalledTimes(1);
    });
  });

  describe('getClassPartitionEntities', () => {
    it('should execute successfully', async() => {
      jest.spyOn(estimator, 'getBindings').mockResolvedValue([]);
      expect(estimator.getBindings).not.toHaveBeenCalled();
      await expect(estimator.getClassPartitionEntities(dataset, DF.namedNode('ex:o'))).resolves.toBe(0);
      expect(estimator.getBindings).toHaveBeenCalledTimes(1);
    });
  });

  describe('getBindings', () => {
    it('should execute the given query and cache the result', async() => {
      expect(queryEngine.queryBindings).not.toHaveBeenCalled();
      await expect(estimator.getBindings(dataset, 'q')).resolves.toEqual([]);
      expect(queryEngine.queryBindings).toHaveBeenCalledTimes(1);
      await expect(estimator.getBindings(dataset, 'q')).resolves.toEqual([]);
      expect(queryEngine.queryBindings).toHaveBeenCalledTimes(1);
    });
  });
});
