import type { QueryEngineBase } from '@comunica/actor-init-query';
import type * as RDF from '@rdfjs/types';
import { termToString } from 'rdf-string-ttl';
import type { IVoidDataset } from './ActorRdfMetadataExtractVoid';

export interface IVoidCardinalityProviderArgs {
  graph: RDF.NamedNode | RDF.BlankNode;
  uriRegexPattern?: RegExp;
  queryEngine: QueryEngineBase;
  store: RDF.Store;
}

export class VoidDataset implements IVoidDataset {
  public readonly graph: RDF.NamedNode | RDF.BlankNode;

  private readonly uriRegexPattern?: RegExp;
  private readonly queryEngine: QueryEngineBase;
  private readonly store: RDF.Store;

  public constructor(args: IVoidCardinalityProviderArgs) {
    this.graph = args.graph;
    this.queryEngine = args.queryEngine;
    this.store = args.store;
    this.uriRegexPattern = args.uriRegexPattern;
  }

  /**
   * Cardinality estimatiom formulae based on:
   * Hagedorn, Stefan, et al. "Resource Planning for SPARQL Query Execution on Data Sharing Platforms." COLD 1264 (2014)
   */
  public async getCardinality(
    subject: RDF.Term,
    predicate: RDF.Term,
    object: RDF.Term,
  ): Promise<RDF.QueryResultCardinality> {
    const pattern = `${termToString(subject)} ${termToString(predicate)} ${termToString(object)}`;
    if (
      this.uriRegexPattern &&
      subject.termType === 'NamedNode' &&
      object.termType === 'NamedNode' &&
      !this.uriRegexPattern.test(subject.value) &&
      !this.uriRegexPattern.test(object.value)
    ) {
      console.log('PATTERN OUTSIDE SPACE', this.uriRegexPattern, ':', pattern);
      return { type: 'exact', value: 0 };
    }
    const value = await this.getCardinalityRaw(subject, predicate, object);
    console.log('ESTIMATE:', pattern, '->', value);
    return { type: 'estimate', value };
  }

  public async getCardinalityRaw(
    subject: RDF.Term,
    predicate: RDF.Term,
    object: RDF.Term,
  ): Promise<number> {
    // ?s rdf:type <o>
    if (predicate.termType !== 'Variable' && predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' &&
      subject.termType === 'Variable' && object.termType !== 'Variable') {
      return await this.getClassPartitionEntities(object);
    }

    // ?s ?p ?o
    if (subject.termType === 'Variable' && predicate.termType === 'Variable' && object.termType === 'Variable') {
      return await this.getTriples();
    }

    // <s> ?p ?o
    if (subject.termType !== 'Variable' && predicate.termType === 'Variable' && object.termType === 'Variable') {
      const graphTriples = await this.getTriples();
      return graphTriples === 0 ? 0 : graphTriples / await this.getDistinctSubjects();
    }

    // ?s <p> ?o
    if (subject.termType === 'Variable' && predicate.termType !== 'Variable' && object.termType === 'Variable') {
      return this.getPredicateTriples(predicate);
    }

    // ?s ?p <o>
    if (subject.termType === 'Variable' && predicate.termType === 'Variable' && object.termType !== 'Variable') {
      return await this.getTriples() / await this.getDistinctObjects();
    }

    // <s> <p> ?o
    if (subject.termType !== 'Variable' && predicate.termType !== 'Variable' && object.termType === 'Variable') {
      const predicateTriples = await this.getPredicateTriples(predicate);
      return predicateTriples === 0 ? 0 : predicateTriples / await this.getPredicateSubjects(predicate);
    }

    // <s> ?p <o>
    if (subject.termType !== 'Variable' && predicate.termType === 'Variable' && object.termType !== 'Variable') {
      const graphTriples = await this.getTriples();
      return graphTriples === 0 ?
        0 :
        graphTriples / (await this.getDistinctSubjects() * await this.getDistinctObjects());
    }

    // ?s <p> <o>
    if (subject.termType === 'Variable' && predicate.termType !== 'Variable' && object.termType !== 'Variable') {
      const predicateTriples = await this.getPredicateTriples(predicate);
      return predicateTriples === 0 ? 0 : predicateTriples / await this.getPredicateObjects(predicate);
    }

    // <s> <p> <o>
    if (subject.termType !== 'Variable' && predicate.termType !== 'Variable' && object.termType !== 'Variable') {
      const predicateTriples = await this.getPredicateTriples(predicate);
      return predicateTriples === 0 ?
        0 :
        predicateTriples / (
          await this.getPredicateSubjects(predicate) * await this.getPredicateObjects(predicate)
        );
    }

    // In all other cases, return infinity
    return Number.POSITIVE_INFINITY;
  }

  public async getTriples(): Promise<number> {
    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?value WHERE {
        ${termToString(this.graph)} void:triples ?value .
      }
    `;
    return await this.getValue(query);
  }

  public async getDistinctSubjects(): Promise<number> {
    const query = `
        PREFIX void: <http://rdfs.org/ns/void#>

        SELECT ?value WHERE {
          ${termToString(this.graph)} void:distinctSubjects ?value .
        }
      `;
    return await this.getValue(query);
  }

  public async getDistinctObjects(): Promise<number> {
    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?value WHERE {
        ${termToString(this.graph)} void:distinctObjects ?value .
      }
    `;
    return await this.getValue(query);
  }

  public async getPredicateTriples(predicate: RDF.Term): Promise<number> {
    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?value WHERE {
        ${termToString(this.graph)} void:propertyPartition [
          void:property ${termToString(predicate)} ;
          void:triples ?value
        ] .
      }
    `;
    return await this.getValue(query);
  }

  public async getPredicateSubjects(predicate: RDF.Term): Promise<number> {
    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?value WHERE {
        ${termToString(this.graph)} void:propertyPartition [
          void:property ${termToString(predicate)} ;
          void:distinctSubjects ?value
        ] .
      }
    `;
    return await this.getValue(query);
  }

  public async getPredicateObjects(predicate: RDF.Term): Promise<number> {
    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?value WHERE {
        ${termToString(this.graph)} void:propertyPartition [
          void:property ${termToString(predicate)} ;
          void:distinctObjects ?value
        ] .
      }
    `;
    return await this.getValue(query);
  }

  public async getClassPartitionEntities(object: RDF.Term): Promise<number> {
    const query = `
        PREFIX void: <http://rdfs.org/ns/void#>

        SELECT ?value WHERE {
          ${termToString(this.graph)} void:classPartition [
            void:class ${termToString(object)} ;
            void:entities ?value
          ] .
        }
      `;
    return await this.getValue(query);
  }

  protected async getValue(query: string): Promise<number> {
    const bindingsStream = await this.queryEngine.queryBindings(query, { sources: [ this.store ]});
    const bindings = await bindingsStream.toArray({ limit: 1 });
    if (bindings.at(0)?.has('value')) {
      return Number.parseInt(bindings[0].get('value')!.value, 10);
    }
    return 0;
  }

  public async getVocabularies(): Promise<string[] | undefined> {
    const vocabularies: string[] = [];

    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT DISTINCT ?vocabulary WHERE {
        ${termToString(this.graph)} void:vocabulary ?vocabulary .
      }
    `;

    const bindingsStream = await this.queryEngine.queryBindings(query, { sources: [ this.store ]});

    for await (const bindings of bindingsStream) {
      vocabularies.push(bindings.get('vocabulary')!.value);
    }

    return vocabularies.length > 0 ? vocabularies : undefined;
  }
}
