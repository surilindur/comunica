import type { IActionQueryParse, IActorQueryParseArgs, IActorQueryParseOutput } from '@comunica/bus-query-parse';
import { ActorQueryParse } from '@comunica/bus-query-parse';
import { type IActorTest, ActionContextKey } from '@comunica/core';
import { DataFactory } from 'rdf-data-factory';
import { Algebra, translate } from 'sparqlalgebrajs';
import { Parser as SparqlParser } from 'sparqljs';

const CONTEXT_KEY_DEFAULT_GRAPHS = new ActionContextKey<string[]>('@comunica/actor-init-query:defaultGraphUris');
const CONTEXT_KEY_NAMED_GRAPHS = new ActionContextKey<string[]>('@comunica/actor-init-query:namedGraphUris');
const DF = new DataFactory();

/**
 * A comunica Algebra SPARQL Parse Actor.
 */
export class ActorQueryParseSparql extends ActorQueryParse {
  public readonly prefixes: Record<string, string>;

  public constructor(args: IActorQueryParseSparqlArgs) {
    super(args);
    this.prefixes = Object.freeze(this.prefixes);
  }

  public async test(action: IActionQueryParse): Promise<IActorTest> {
    console.log('ActorQueryParseSparql TEST');
    if (action.queryFormat && action.queryFormat.language !== 'sparql') {
      throw new Error('This actor can only parse SPARQL queries');
    }
    return true;
  }

  public async run(action: IActionQueryParse): Promise<IActorQueryParseOutput> {
    console.log('ActorQueryParseSparql RUN');
    const parser = new SparqlParser({ prefixes: this.prefixes, baseIRI: action.baseIRI, sparqlStar: true });
    const parsedSyntax = parser.parse(action.query);
    const baseIRI = parsedSyntax.type === 'query' ? parsedSyntax.base : undefined;
    let operation = translate(parsedSyntax, {
      quads: true,
      prefixes: this.prefixes,
      blankToVariable: true,
      baseIRI: action.baseIRI,
    });
    const defaultGraphUris = action.context.get<string[]>(CONTEXT_KEY_DEFAULT_GRAPHS)?.map(uri => DF.namedNode(uri));
    const namedGraphUris = action.context.get<string[]>(CONTEXT_KEY_NAMED_GRAPHS)?.map(uri => DF.namedNode(uri));
    if (defaultGraphUris !== undefined || namedGraphUris !== undefined) {
      if (operation.type === Algebra.types.FROM) {
        if (defaultGraphUris) {
          operation.default = defaultGraphUris;
        }
        if (namedGraphUris) {
          operation.named = namedGraphUris;
        }
      } else {
        operation = {
          default: defaultGraphUris ?? [],
          named: namedGraphUris ?? [],
          input: operation,
          type: Algebra.types.FROM,
        };
      }
    }
    console.log('PARSE QUERY', action.query);
    console.log('CONTEXT KEYS', action.context.keys().map(k => k.name));
    console.log(operation);
    return { baseIRI, operation };
  }
}

export interface IActorQueryParseSparqlArgs extends IActorQueryParseArgs {
  /**
   * Default prefixes to use
   * @range {json}
   * @default {{
   *   "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
   *   "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
   *   "owl": "http://www.w3.org/2002/07/owl#",
   *   "xsd": "http://www.w3.org/2001/XMLSchema#",
   *   "dc": "http://purl.org/dc/terms/",
   *   "dcterms": "http://purl.org/dc/terms/",
   *   "dc11": "http://purl.org/dc/elements/1.1/",
   *   "foaf": "http://xmlns.com/foaf/0.1/",
   *   "geo": "http://www.w3.org/2003/01/geo/wgs84_pos#",
   *   "dbpedia": "http://dbpedia.org/resource/",
   *   "dbpedia-owl": "http://dbpedia.org/ontology/",
   *   "dbpprop": "http://dbpedia.org/property/",
   *   "schema": "http://schema.org/",
   *   "skos": "http://www.w3.org/2008/05/skos#"
   * }}
   */
  prefixes?: Record<string, string>;
}
