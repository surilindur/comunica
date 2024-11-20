import type { ActorInitQueryBase } from '@comunica/actor-init-query';
import { QueryEngineBase } from '@comunica/actor-init-query';
import type {
  IActionRdfMetadataExtract,
  IActorRdfMetadataExtractOutput,
  IActorRdfMetadataExtractArgs,
} from '@comunica/bus-rdf-metadata-extract';
import { ActorRdfMetadataExtract } from '@comunica/bus-rdf-metadata-extract';
import type { IActorTest, TestResult } from '@comunica/core';
import { passTestVoid } from '@comunica/core';
import type * as RDF from '@rdfjs/types';
import { RdfStore } from 'rdf-stores';
import { termToString } from 'rdf-string-ttl';

/**
 * A comunica Void RDF Metadata Extract Actor.
 */
export class ActorRdfMetadataExtractVoid extends ActorRdfMetadataExtract {
  private readonly queryEngine: QueryEngineBase;
  private readonly inferUriRegexPattern: boolean;

  public static readonly VOID = 'http://rdfs.org/ns/void#';
  public static readonly SPARQL_SD = 'http://www.w3.org/ns/sparql-service-description#';

  public constructor(args: IActorRdfMetadataExtractVoidArgs) {
    super(args);
    this.queryEngine = new QueryEngineBase(args.actorInitQuery);
    this.inferUriRegexPattern = args.inferUriRegexPattern;
  }

  public async test(_action: IActionRdfMetadataExtract): Promise<TestResult<IActorTest>> {
    return passTestVoid();
  }

  public async run(action: IActionRdfMetadataExtract): Promise<IActorRdfMetadataExtractOutput> {
    const store = await this.collectFromMetadata(action.metadata);
    const datasets = await this.getDatasets(store, action.url);
    const metadata = datasets.length > 0 ? { voidDatasets: datasets } : {};
    return { metadata };
  }

  /**
   * Collect all the VoID-related quads from the metadata stream.
   * The purpose of this is to avoid storing unrelated data present in the metadata stream.
   * @param {RDF.Stream} stream The metadata Quad stream.
   * @returns {RDF.Store} An RDF/JS in-memory store containing all the VoID-related quads.
   */
  public async collectFromMetadata(stream: RDF.Stream): Promise<RDF.Store> {
    return new Promise<RDF.Store>((resolve, reject) => {
      const store = RdfStore.createDefault();
      stream
        .on('error', reject)
        .on('end', () => resolve(store))
        .on('data', (quad: RDF.Quad) => {
          if (
            quad.predicate.value.startsWith(ActorRdfMetadataExtractVoid.VOID) ||
            quad.predicate.value.startsWith(ActorRdfMetadataExtractVoid.SPARQL_SD) ||
            quad.object.value.startsWith(ActorRdfMetadataExtractVoid.VOID) ||
            quad.object.value.startsWith(ActorRdfMetadataExtractVoid.SPARQL_SD)
          ) {
            store.addQuad(quad);
          }
        });
    });
  }

  public async getDatasets(store: RDF.Store, voidDescriptionUrl: string): Promise<IVoidDataset[]> {
    const datasets: IVoidDataset[] = [];

    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>
      PREFIX sd: <http://www.w3.org/ns/sparql-service-description#>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

      SELECT DISTINCT ?identifier ?uriRegexPattern ?uriSpace WHERE {
        ?identifier rdf:type ?type .

        # First, try to find the uriRegexPattern on the dataset itself
        OPTIONAL {
          ?identifier void:uriRegexPattern ?uriRegexPattern .
        }

        # Then, try to find it on a parent dataset
        OPTIONAL {
          ?var1 sd:defaultGraph ?identifier .
          ?var1 void:uriRegexPattern ?uriRegexPattern .
        }

        # Again, try to find the uriSpace on the dataset itself
        OPTIONAL {
          ?identifier void:uriSpace ?uriSpace .
        }

        # If that fails, try the parent dataset
        OPTIONAL {
          ?var2 sd:defaultGraph ?identifier .
          ?var2 void:uriSpace ?uriSpace .
        }

        # Exclude intermediate defaultDataset from SPARQL SD as not actual graphs
        FILTER NOT EXISTS {
          ?var3 sd:defaultDataset ?identifier .
        }

        # Exclude union default graphs that merely combine every other graph
        FILTER NOT EXISTS {
          ?var4 sd:feature sd:UnionDefaultGraph .
          ?var4 sd:defaultDataset/sd:defaultGraph ?identifier .
        }

        # By definition, sd:Graph and sd:Dataset are both also void:Datasets, however
        # sd:Dataset represents the dataset and not the graph, so it can likely be ignored.
        FILTER(?type IN (sd:Graph,void:Dataset))
      }
    `;

    const queryBindings = await this.queryEngine.queryBindings(query, { sources: [ store ]});

    for await (const bindings of queryBindings) {
      const identifier = bindings.get('identifier')!;
      if (identifier.termType === 'BlankNode' || identifier.termType === 'NamedNode') {
        let uriRegexPattern: RegExp | undefined;
        // The actual pattern should take precedence when available
        if (bindings.has('uriRegexPattern')) {
          uriRegexPattern = new RegExp(bindings.get('uriRegexPattern')!.value, 'u');
        } else if (bindings.has('uriSpace')) {
          uriRegexPattern = new RegExp(`^${bindings.get('uriSpace')?.value}`, 'u');
        } else if (this.inferUriRegexPattern) {
          const url = new URL(identifier.termType === 'NamedNode' ? identifier.value : voidDescriptionUrl);
          uriRegexPattern = new RegExp(`^${url.protocol}//${url.host}`, 'u');
        }

        const dataset: IVoidDataset = {
          identifier,
          store,
          source: voidDescriptionUrl,
          uriRegexPattern,
          vocabularies: await this.getVocabularies(store, identifier),
        };

        datasets.push(dataset);
      }
    }

    return datasets;
  }

  public async getVocabularies(
    store: RDF.Store,
    identifier: RDF.NamedNode | RDF.BlankNode,
  ): Promise<string[] | undefined> {
    const vocabularies: string[] = [];

    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>
      PREFIX sd: <http://www.w3.org/ns/sparql-service-description#>

      SELECT DISTINCT ?vocabulary WHERE {
        {
          SELECT ?vocabulary WHERE {
            ${termToString(identifier)} void:vocabulary ?vocabulary .
          }
        } UNION {
          SELECT ?vocabulary WHERE {
            ?dataset sd:defaultGraph ${termToString(identifier)} .
            ?dataset void:vocabulary ?vocabulary .
          }
        }
      }
    `;

    const bindingsStream = await this.queryEngine.queryBindings(query, { sources: [ store ]});

    for await (const bindings of bindingsStream) {
      vocabularies.push(bindings.get('vocabulary')!.value);
    }

    if (vocabularies.length > 0) {
      return vocabularies;
    }
  }
}

export interface IActorRdfMetadataExtractVoidArgs extends IActorRdfMetadataExtractArgs {
  /**
   * An init query actor that is used to query shapes.
   * @default {<urn:comunica:default:init/actors#query>}
   */
  actorInitQuery: ActorInitQueryBase;
  /**
   * Whether URI regex patterns should be inferred based on dataset URI or
   * void:uriSpace if not present in the VoID description.
   * @default {true}
   */
  inferUriRegexPattern: boolean;
}

/**
 * Comunica-specific wrapper utility class for VoID dataset description:
 * https://www.w3.org/TR/void/
 */
export interface IVoidDataset {
  /**
   * The identifier of the dataset, either an IRI or a blank node.
   * This should be used when querying dataset metadata from the triplestore.
   */
  identifier: RDF.NamedNode | RDF.BlankNode;
  /**
   * The URL from which the dataset description was acquired.
   * This is not guaranteed to be unique, since multiple descriptions can be found at the same URL.
   */
  source: string;
  /**
   * The RDF/JS store containing the data for this dataset description.
   * Note that the store might also contain data for other datasets defined in the same VoID description.
   * When querying the metadata, use the dataset identifier.
   */
  store: RDF.Store;
  /**
   * The regex pattern that is matched by all RDF resources within this dataset.
   * This corresponds to void:uriRegexPattern, and all void:uriSpace are internally converted into void:uriRegexPattern.
   * The value here can be optionally inferred from the dataset source URL.
   * https://www.w3.org/TR/void/#pattern
   */
  uriRegexPattern?: RegExp;
  /**
   * The vocabularies used within the dataset, as listed with void:vocabulary predicates.
   * When no vocabularies are defined, this is set to undefined.
   */
  vocabularies?: string[];
}
