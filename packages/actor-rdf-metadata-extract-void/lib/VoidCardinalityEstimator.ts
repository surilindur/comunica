import type { IQueryEngine } from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import { LRUCache } from 'lru-cache';
import { termToString } from 'rdf-string-ttl';
import type { Algebra } from 'sparqlalgebrajs';
import type { IVoidDataset } from './ActorRdfMetadataExtractVoid';

export class VoidCardinalityEstimator {
  private readonly queryEngine: IQueryEngine;
  private readonly bindingsCache: LRUCache<string, RDF.Bindings[]>;

  public constructor(queryEngine: IQueryEngine, bindingsCacheSize: number) {
    this.queryEngine = queryEngine;
    this.bindingsCache = new LRUCache({ max: bindingsCacheSize });
  }

  public async estimateOperationCardinality(
    operation: Algebra.Operation,
    dataset: IVoidDataset,
  ): Promise<RDF.QueryResultCardinality> {
    switch (operation.type) {
      case 'pattern':
        return this.estimatePatternCardinality(operation, dataset);
      case 'bgp':
        return this.estimateBgpCardinality(operation, dataset);
      case 'join':
        return this.estimateJoinCardinality(operation, dataset);
      case 'project':
      case 'filter':
        return this.estimateOperationCardinality(operation.input, dataset);
      default:
        return { type: 'estimate', value: Number.POSITIVE_INFINITY };
    }
  }

  public async estimateBgpCardinality(
    join: Algebra.Bgp,
    dataset: IVoidDataset,
  ): Promise<RDF.QueryResultCardinality> {
    const inputCardinalities = [];
    for (const pattern of join.patterns) {
      inputCardinalities.push(await this.estimatePatternCardinality(pattern, dataset));
    }
    inputCardinalities.sort((first, second) => second.value - first.value);
    return { type: 'estimate', value: inputCardinalities.reduce((acc, card) => acc * card.value, 1) };
  }

  /**
   * Estimate the triple pattern cardinality using the formulae from Hagedorn, Stefan, et al.
   * "Resource Planning for SPARQL Query Execution on Data Sharing Platforms." COLD 1264 (2014)
   *
   * Additional heuristics are applied based on void:uriPatternRegex and void:vocabulary data when available.
   */
  public async estimatePatternCardinality(
    pattern: Algebra.Pattern,
    dataset: IVoidDataset,
  ): Promise<RDF.QueryResultCardinality> {
    if (this.matchVocabularies(pattern, dataset) && this.matchUriRegexPattern(pattern, dataset)) {
      return { type: 'estimate', value: await this.estimatePatternCardinalityRaw(pattern, dataset) };
    }
    return { type: 'exact', value: 0 };
  }

  public async estimateJoinCardinality(
    join: Algebra.Join,
    dataset: IVoidDataset,
  ): Promise<RDF.QueryAlgebraContext> {}

  /**
   * Test whether the given albegra pattern could produce answers from a dataset with the specified uriPatternRegex.
   * Specifically, if both subject and object are IRIs, but neither matches the uriRegexPattern,
   * then the dataset does not contain any RDF resources that would satisfy the pattern.
   */
  public matchUriRegexPattern(pattern: Algebra.Pattern, dataset: IVoidDataset): boolean {
    return !dataset.uriRegexPattern ||
      pattern.subject.termType !== 'NamedNode' ||
      pattern.object.termType !== 'NamedNode' ||
      dataset.uriRegexPattern.test(pattern.subject.value) ||
      dataset.uriRegexPattern.test(pattern.object.value);
  }

  /**
   * Test whether the given algebra pattern could produce answers from a dataset with the specified vocabularies.
   * Specifically, if the predicate if an IRI but it does not use any of the specifiec vocabularies,
   * then the pattern cannot be answered by the dataset.
   */
  public matchVocabularies(pattern: Algebra.Pattern, dataset: IVoidDataset): boolean {
    return !dataset.vocabularies ||
      pattern.predicate.termType !== 'NamedNode' ||
      dataset.vocabularies.some(vc => pattern.predicate.value.startsWith(vc));
  }

  public async estimatePatternCardinalityRaw(pattern: Algebra.Pattern, dataset: IVoidDataset): Promise<number> {
    // ?s rdf:type <o>
    if (
      pattern.predicate.termType === 'NamedNode' &&
      pattern.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
      pattern.subject.termType === 'Variable' &&
      pattern.object.termType !== 'Variable'
    ) {
      return await this.getClassPartitionEntities(dataset, pattern.object);
    }

    // ?s ?p ?o
    if (
      pattern.subject.termType === 'Variable' &&
      pattern.predicate.termType === 'Variable' &&
      pattern.object.termType === 'Variable'
    ) {
      return await this.getTriples(dataset);
    }

    // <s> ?p ?o
    if (
      pattern.subject.termType !== 'Variable' &&
      pattern.predicate.termType === 'Variable' &&
      pattern.object.termType === 'Variable'
    ) {
      const graphTriples = await this.getTriples(dataset);
      if (graphTriples === 0) {
        return 0;
      }
      const distinctSubjects = await this.getDistinctSubjects(dataset);
      if (distinctSubjects > 0) {
        return graphTriples / distinctSubjects;
      }
    }

    // ?s <p> ?o
    if (
      pattern.subject.termType === 'Variable' &&
      pattern.predicate.termType === 'NamedNode' &&
      pattern.object.termType === 'Variable'
    ) {
      return this.getPredicateTriples(dataset, pattern.predicate);
    }

    // ?s ?p <o>
    if (
      pattern.subject.termType === 'Variable' &&
      pattern.predicate.termType === 'Variable' &&
      pattern.object.termType !== 'Variable'
    ) {
      const graphTriples = await this.getTriples(dataset);
      if (graphTriples === 0) {
        return 0;
      }
      const distinctObjects = await this.getDistinctObjects(dataset);
      if (distinctObjects > 0) {
        return graphTriples / distinctObjects;
      }
    }

    // <s> <p> ?o
    if (
      pattern.subject.termType !== 'Variable' &&
      pattern.predicate.termType === 'NamedNode' &&
      pattern.object.termType === 'Variable'
    ) {
      const predicateTriples = await this.getPredicateTriples(dataset, pattern.predicate);
      if (predicateTriples === 0) {
        return 0;
      }
      const predicateSubjects = await this.getPredicateSubjects(dataset, pattern.predicate);
      if (predicateSubjects > 0) {
        return predicateTriples / predicateSubjects;
      }
    }

    // <s> ?p <o>
    if (
      pattern.subject.termType !== 'Variable' &&
      pattern.predicate.termType === 'Variable' &&
      pattern.object.termType !== 'Variable'
    ) {
      const graphTriples = await this.getTriples(dataset);
      if (graphTriples === 0) {
        return 0;
      }
      const distinctSubjects = await this.getDistinctSubjects(dataset);
      const distinctObjects = await this.getDistinctObjects(dataset);
      if (distinctSubjects > 0 && distinctObjects > 0) {
        return graphTriples / (distinctSubjects * distinctObjects);
      }
    }

    // ?s <p> <o>
    if (
      pattern.subject.termType === 'Variable' &&
      pattern.predicate.termType === 'NamedNode' &&
      pattern.object.termType !== 'Variable'
    ) {
      const predicateTriples = await this.getPredicateTriples(dataset, pattern.predicate);
      if (predicateTriples === 0) {
        return 0;
      }
      const predicateObjects = await this.getPredicateObjects(dataset, pattern.predicate);
      if (predicateObjects > 0) {
        return predicateTriples / predicateObjects;
      }
    }

    // <s> <p> <o>
    if (
      pattern.subject.termType !== 'Variable' &&
      pattern.predicate.termType === 'NamedNode' &&
      pattern.object.termType !== 'Variable'
    ) {
      const predicateTriples = await this.getPredicateTriples(dataset, pattern.predicate);
      if (predicateTriples === 0) {
        return 0;
      }
      const predicateSubjects = await this.getPredicateSubjects(dataset, pattern.predicate);
      const predicateObjects = await this.getPredicateObjects(dataset, pattern.predicate);
      if (predicateSubjects > 0 && predicateObjects > 0) {
        return predicateTriples / (predicateSubjects * predicateObjects);
      }
    }

    // In all other cases, or when a divisor would go to 0, return infinity
    return Number.POSITIVE_INFINITY;
  }

  public async getTriples(dataset: IVoidDataset): Promise<number> {
    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?triples WHERE {
        ${termToString(dataset.identifier)} void:triples ?triples .
      } LIMIT 1
    `;
    const bindings = await this.getBindings(dataset, query);
    return Number.parseInt(bindings.at(0)?.get('triples')?.value ?? '0', 10);
  }

  /**
   * Attempts to retrieve void:distinctSubjects, falls back to void:entities
   */
  public async getDistinctSubjects(dataset: IVoidDataset): Promise<number> {
    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?count WHERE {
        OPTIONAL { ${termToString(dataset.identifier)} void:distinctSubjects ?distinctSubjects } .
        OPTIONAL { ${termToString(dataset.identifier)} void:entities ?entities } .

        BIND(COALESCE(?distinctObjects,?entities) AS ?count)
      } LIMIT 1
    `;
    const bindings = await this.getBindings(dataset, query);
    return Number.parseInt(bindings.at(0)?.get('count')?.value ?? '0', 10);
  }

  /**
   * Attempts to retrieve void:distinctObjects, falls back to void:entities
   */
  public async getDistinctObjects(dataset: IVoidDataset): Promise<number> {
    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?count WHERE {
        OPTIONAL { ${termToString(dataset.identifier)} void:distinctObjects ?distinctObjects } .
        OPTIONAL { ${termToString(dataset.identifier)} void:entities ?entities } .

        BIND(COALESCE(?distinctObjects,?entities) AS ?count)
      } LIMIT 1
    `;
    const bindings = await this.getBindings(dataset, query);
    return Number.parseInt(bindings.at(0)?.get('count')?.value ?? '0', 10);
  }

  public async getPredicateTriples(dataset: IVoidDataset, predicate: RDF.Term): Promise<number> {
    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?triples WHERE {
        ${termToString(dataset.identifier)} void:propertyPartition [
          void:property ${termToString(predicate)} ;
          void:triples ?triples
        ] .
      } LIMIT 1
    `;
    const bindings = await this.getBindings(dataset, query);
    return Number.parseInt(bindings.at(0)?.get('triples')?.value ?? '0', 10);
  }

  public async getPredicateSubjects(dataset: IVoidDataset, predicate: RDF.Term): Promise<number> {
    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?distinctSubjects WHERE {
        ${termToString(dataset.identifier)} void:propertyPartition [
          void:property ${termToString(predicate)} ;
          void:distinctSubjects ?distinctSubjects
        ] .
      } LIMIT 1
    `;
    const bindings = await this.getBindings(dataset, query);
    return Number.parseInt(bindings.at(0)?.get('distinctSubjects')?.value ?? '0', 10);
  }

  public async getPredicateObjects(dataset: IVoidDataset, predicate: RDF.Term): Promise<number> {
    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?distinctObjects WHERE {
        ${termToString(dataset.identifier)} void:propertyPartition [
          void:property ${termToString(predicate)} ;
          void:distinctObjects ?distinctObjects
        ] .
      } LIMIT 1
    `;
    const bindings = await this.getBindings(dataset, query);
    return Number.parseInt(bindings.at(0)?.get('distinctObjects')?.value ?? '0', 10);
  }

  public async getClassPartitionEntities(dataset: IVoidDataset, object: RDF.Term): Promise<number> {
    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?entities WHERE {
        ${termToString(dataset.identifier)} void:classPartition [
          void:class ${termToString(object)} ;
          void:entities ?entities
        ] .
      } LIMIT 1
    `;
    const bindings = await this.getBindings(dataset, query);
    return Number.parseInt(bindings.at(0)?.get('entities')?.value ?? '0', 10);
  }

  public async getBindings(dataset: IVoidDataset, query: string): Promise<RDF.Bindings[]> {
    const cacheKey = `${dataset.identifier.value}${query}`;
    let bindings = this.bindingsCache.get(cacheKey);
    if (!bindings) {
      const bindingsStream = await this.queryEngine.queryBindings(query, { sources: [ dataset.store ]});
      bindings = await bindingsStream.toArray();
      this.bindingsCache.set(cacheKey, bindings);
    }
    return bindings;
  }
}
