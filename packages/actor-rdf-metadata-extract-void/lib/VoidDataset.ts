import type { IQueryEngine, IDataset } from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import { LRUCache } from 'lru-cache';
import { termToString } from 'rdf-string-ttl';
import { Algebra } from 'sparqlalgebrajs';

export class VoidDataset implements IDataset {
  private readonly store: RDF.Store;
  private readonly identifier: RDF.BlankNode | RDF.NamedNode;
  private readonly queryEngine: IQueryEngine;
  private readonly bindingsCache: LRUCache<string, RDF.Bindings[]>;

  public readonly triples: number;
  public readonly source: string;
  public readonly vocabularies?: string[];
  public readonly resourceUriPattern?: RegExp;

  public static readonly RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
  public static readonly RDFS_LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';

  public get uri(): string {
    return this.identifier.value;
  }

  public constructor(args: IVoidDatasetArgs) {
    this.triples = args.triples;
    this.source = args.source;
    this.store = args.store;
    this.identifier = args.identifier;
    this.vocabularies = args.vocabularies;
    this.queryEngine = args.queryEngine;
    this.resourceUriPattern = args.resourceUriPattern;
    this.bindingsCache = new LRUCache({ max: args.bindingsCacheSize });
  }

  public async cardinality(operation: Algebra.Operation): Promise<RDF.QueryResultCardinality> {
    switch (operation.type) {
      case Algebra.types.PROJECT:
      case Algebra.types.FILTER:
        return this.cardinality(operation.input);
      case Algebra.types.PATTERN:
        return this.estimatePatternCardinality(operation);
      case Algebra.types.BGP:
        return this.estimateJoinCardinality(operation.patterns);
      case Algebra.types.JOIN:
        return this.estimateJoinCardinality(operation.input);
      case Algebra.types.VALUES:
        return { type: 'exact', value: operation.bindings.length };
      default:
        return { type: 'estimate', value: Number.POSITIVE_INFINITY };
    }
  }

  /**
   * Estimate triple pattern cardinality, by first applying heuristics based on void:uriPatternRegex
   * and void:vocabulary data when available, before performing estimations using the formulae.
   * @param {Algebra.Pattern} pattern The triple pattern to estimate.
   * @returns {RDF.QueryResultCardinality} The estimated cardinality.
   */
  public async estimatePatternCardinality(pattern: Algebra.Pattern): Promise<RDF.QueryResultCardinality> {
    const estimate: RDF.QueryResultCardinality = { type: 'exact', value: 0 };
    if (this.matchVocabularies(pattern) && this.matchResourceUriPattern(pattern)) {
      const value = await this.estimatePatternCardinalityRaw(pattern);
      if (value > 0) {
        estimate.value = value;
        estimate.type = 'estimate';
      }
    }
    return estimate;
  }

  /**
   * Estimate the cardinality of a join, using a sum of the individual input cardinalities.
   * This should result in a somewhat acceptable estimate that will likely be above the probable join plan,
   * but still below an unreasonably high and unlikely cartesian estimate.
   * @param {Algebra.Operation[]} operations The operations being joined.
   * @returns {RDF.QueryResultCardinality} The result cardinality estimate.
   */
  public async estimateJoinCardinality(operations: Algebra.Operation[]): Promise<RDF.QueryResultCardinality> {
    const estimate: RDF.QueryResultCardinality = { type: 'exact', value: 0 };
    for (const input of operations) {
      const cardinality = await this.cardinality(input);
      if (cardinality.value > 0) {
        estimate.type = 'estimate';
        if (cardinality.value === Number.POSITIVE_INFINITY) {
          estimate.value = cardinality.value;
          break;
        } else {
          estimate.value += cardinality.value;
        }
      }
    }
    return estimate;
  }

  /**
   * Test whether the given albegra pattern could produce answers from a dataset with the specified resourceUriPattern.
   * Specifically, if both subject and object are IRIs, but neither matches the resourceUriPattern,
   * then the dataset does not contain any RDF resources that would satisfy the pattern.
   */
  public matchResourceUriPattern(pattern: Algebra.Pattern): boolean {
    if (this.resourceUriPattern) {
      if (pattern.subject.termType === 'NamedNode') {
        return this.resourceUriPattern.test(pattern.subject.value);
      }
      if (pattern.object.termType === 'NamedNode') {
        return this.resourceUriPattern.test(pattern.object.value);
      }
    }
    return true;
  }

  /**
   * Test whether the given algebra pattern could produce answers from a dataset with the specified vocabularies.
   * Specifically, if the predicate if an IRI but it does not use any of the specifiec vocabularies,
   * then the pattern cannot be answered by the dataset.
   */
  public matchVocabularies(pattern: Algebra.Pattern): boolean {
    if (this.vocabularies && pattern.predicate.termType === 'NamedNode') {
      return this.vocabularies.some(vc => pattern.predicate.value.startsWith(vc));
    }
    return true;
  }

  /**
   * Estimate the triple pattern cardinality using the formulae from Hagedorn, Stefan, et al.
   * "Resource Planning for SPARQL Query Execution on Data Sharing Platforms." COLD 1264 (2014)
   * @param {Algebra.Pattern} pattern The triple pattern to estimate.
   * @returns {number} The estimated cardinality as a number.
   */
  public async estimatePatternCardinalityRaw(pattern: Algebra.Pattern): Promise<number> {
    // First check if the dataset has any triples in it
    if (this.triples < 1) {
      return 0;
    }
    // ?s rdf:type <o> (from the original paper)
    // ?s rdf:type _:o (also accounted for)
    if (
      pattern.subject.termType === 'Variable' &&
      pattern.predicate.termType === 'NamedNode' &&
      pattern.predicate.value === VoidDataset.RDF_TYPE &&
      (pattern.object.termType === 'NamedNode' || pattern.object.termType === 'BlankNode')
    ) {
      return await this.getClassPartitionEntities(pattern.object);
    }
    // ?s ?p ?o (from the original paper)
    if (
      pattern.subject.termType === 'Variable' &&
      pattern.predicate.termType === 'Variable' &&
      pattern.object.termType === 'Variable'
    ) {
      return this.triples;
    }
    // <s> ?p ?o (from the original paper)
    // _:s ?p ?o (also accounted for)
    // <s> ?p "o"
    // _:s ?p "o"
    if (
      (pattern.subject.termType === 'NamedNode' || pattern.subject.termType === 'BlankNode') &&
      pattern.predicate.termType === 'Variable' &&
      (pattern.object.termType === 'Variable' || pattern.object.termType === 'Literal')
    ) {
      const distinctSubjects = await this.getDistinctSubjects();
      return distinctSubjects > 0 ? this.triples / distinctSubjects : Number.POSITIVE_INFINITY;
    }
    // ?s <p> ?o (from the original paper)
    // ?s <p> "o" (also accounted for)
    if (
      pattern.subject.termType === 'Variable' &&
      pattern.predicate.termType === 'NamedNode' &&
      (pattern.object.termType === 'Variable' || pattern.object.termType === 'Literal')
    ) {
      return this.getPredicateTriples(pattern.predicate);
    }
    // ?s ?p <o> (from the original paper)
    // ?s ?p _:o (also accounted for)
    // ?s ?p "o"
    if (
      pattern.subject.termType === 'Variable' &&
      pattern.predicate.termType === 'Variable' &&
      (
        pattern.object.termType === 'NamedNode' ||
        pattern.object.termType === 'BlankNode' ||
        pattern.object.termType === 'Literal'
      )
    ) {
      const distinctObjects = await this.getDistinctObjects();
      return distinctObjects > 0 ? this.triples / distinctObjects : Number.POSITIVE_INFINITY;
    }
    // <s> <p> ?o (from the original paper)
    // _:s <p> ?o (also accounted for)
    // <s> <p> "o"
    // _:s <p> "o"
    if (
      (pattern.subject.termType === 'NamedNode' || pattern.subject.termType === 'BlankNode') &&
      pattern.predicate.termType === 'NamedNode' &&
      (pattern.object.termType === 'Variable' || pattern.object.termType === 'Literal')
    ) {
      const predicateTriples = await this.getPredicateTriples(pattern.predicate);
      const predicateSubjects = await this.getPredicateSubjects(pattern.predicate);
      return predicateSubjects > 0 ? predicateTriples / predicateSubjects : Number.POSITIVE_INFINITY;
    }
    // <s> ?p <o> (from the original paper)
    // _:s ?p _:o (also accounted for)
    // _:s ?p <o>
    // <s> ?p _:o
    if (
      (pattern.subject.termType === 'NamedNode' || pattern.subject.termType === 'BlankNode') &&
      pattern.predicate.termType === 'Variable' &&
      (pattern.object.termType === 'NamedNode' || pattern.object.termType === 'BlankNode')
    ) {
      const distinctSubjects = await this.getDistinctSubjects();
      const distinctObjects = await this.getDistinctObjects();
      return distinctSubjects > 0 && distinctObjects > 0 ?
        this.triples / (distinctSubjects * distinctObjects) :
        Number.POSITIVE_INFINITY;
    }
    // ?s <p> <o> (from the original paper)
    // ?s <p> _:o (also accounted for)
    if (
      pattern.subject.termType === 'Variable' &&
      pattern.predicate.termType === 'NamedNode' &&
      (pattern.object.termType === 'NamedNode' || pattern.object.termType === 'BlankNode')
    ) {
      const predicateTriples = await this.getPredicateTriples(pattern.predicate);
      const predicateObjects = await this.getPredicateObjects(pattern.predicate);
      return predicateObjects > 0 ? predicateTriples / predicateObjects : Number.POSITIVE_INFINITY;
    }
    // <s> <p> <o> (from the original paper)
    // _:s <p> _:o (also accounted for)
    // <s> <p> _:o
    // _:s <p> <o>
    if (
      (pattern.subject.termType === 'NamedNode' || pattern.subject.termType === 'BlankNode') &&
      pattern.predicate.termType === 'NamedNode' &&
      (pattern.object.termType === 'NamedNode' || pattern.object.termType === 'BlankNode')
    ) {
      const predicateTriples = await this.getPredicateTriples(pattern.predicate);
      const predicateSubjects = await this.getPredicateSubjects(pattern.predicate);
      const predicateObjects = await this.getPredicateObjects(pattern.predicate);
      return predicateSubjects > 0 && predicateObjects > 0 ?
        predicateTriples / (predicateSubjects * predicateObjects) :
        Number.POSITIVE_INFINITY;
    }

    // In all other cases, return infinity as the upper bound
    return Number.POSITIVE_INFINITY;
  }

  /**
   * Attempts to retrieve void:distinctSubjects, falls back to void:entities
   */
  public async getDistinctSubjects(): Promise<number> {
    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?count WHERE {
        OPTIONAL { ${termToString(this.identifier)} void:distinctSubjects ?distinctSubjects } .
        OPTIONAL { ${termToString(this.identifier)} void:entities ?entities } .

        BIND(COALESCE(?distinctSubjects,?entities) AS ?count)
      } LIMIT 1
    `;
    const bindings = await this.getBindings(query);
    return Number.parseInt(bindings.at(0)?.get('count')?.value ?? '0', 10);
  }

  /**
   * Attempts to retrieve void:distinctObjects, falls back to void:entities
   */
  public async getDistinctObjects(): Promise<number> {
    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?count WHERE {
        OPTIONAL { ${termToString(this.identifier)} void:distinctObjects ?distinctObjects } .
        OPTIONAL { ${termToString(this.identifier)} void:entities ?entities } .

        BIND(COALESCE(?distinctObjects,?entities) AS ?count)
      } LIMIT 1
    `;
    const bindings = await this.getBindings(query);
    return Number.parseInt(bindings.at(0)?.get('count')?.value ?? '0', 10);
  }

  public async getPredicateTriples(predicate: RDF.Term): Promise<number> {
    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?triples WHERE {
        ${termToString(this.identifier)} void:propertyPartition [
          void:property ${termToString(predicate)} ;
          void:triples ?triples
        ] .
      } LIMIT 1
    `;
    const bindings = await this.getBindings(query);
    return Number.parseInt(bindings.at(0)?.get('triples')?.value ?? '0', 10);
  }

  public async getPredicateSubjects(predicate: RDF.Term): Promise<number> {
    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?distinctSubjects WHERE {
        ${termToString(this.identifier)} void:propertyPartition [
          void:property ${termToString(predicate)} ;
          void:distinctSubjects ?distinctSubjects
        ] .
      } LIMIT 1
    `;
    const bindings = await this.getBindings(query);
    return Number.parseInt(bindings.at(0)?.get('distinctSubjects')?.value ?? '0', 10);
  }

  public async getPredicateObjects(predicate: RDF.Term): Promise<number> {
    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?distinctObjects WHERE {
        ${termToString(this.identifier)} void:propertyPartition [
          void:property ${termToString(predicate)} ;
          void:distinctObjects ?distinctObjects
        ] .
      } LIMIT 1
    `;
    const bindings = await this.getBindings(query);
    return Number.parseInt(bindings.at(0)?.get('distinctObjects')?.value ?? '0', 10);
  }

  public async getClassPartitionEntities(object: RDF.Term): Promise<number> {
    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?entities WHERE {
        ${termToString(this.identifier)} void:classPartition [
          void:class ${termToString(object)} ;
          void:entities ?entities
        ] .
      } LIMIT 1
    `;
    const bindings = await this.getBindings(query);
    return Number.parseInt(bindings.at(0)?.get('entities')?.value ?? '0', 10);
  }

  public async getBindings(query: string): Promise<RDF.Bindings[]> {
    let bindings = this.bindingsCache.get(query);
    if (!bindings) {
      const bindingsStream = await this.queryEngine.queryBindings(query, { sources: [ this.store ]});
      bindings = await bindingsStream.toArray();
      this.bindingsCache.set(query, bindings);
    }
    return bindings;
  }
}

export interface IVoidDatasetArgs {
  bindingsCacheSize: number;
  identifier: RDF.NamedNode | RDF.BlankNode;
  queryEngine: IQueryEngine;
  resourceUriPattern?: RegExp;
  source: string;
  store: RDF.Store;
  triples: number;
  vocabularies?: string[];
}
