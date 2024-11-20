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
import type { IDataset } from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import { RdfStore } from 'rdf-stores';
import { termToString } from 'rdf-string-ttl';
import { VoidDataset } from './VoidDataset';

/**
 * A comunica Void RDF Metadata Extract Actor.
 */
export class ActorRdfMetadataExtractVoid extends ActorRdfMetadataExtract {
  private readonly queryEngine: QueryEngineBase;
  private readonly bindingsCacheSize: number;

  public static readonly VOID = 'http://rdfs.org/ns/void#';
  public static readonly SPARQL_SD = 'http://www.w3.org/ns/sparql-service-description#';

  public constructor(args: IActorRdfMetadataExtractVoidArgs) {
    super(args);
    this.queryEngine = new QueryEngineBase(args.actorInitQuery);
    this.bindingsCacheSize = args.bindingsCacheSize;
  }

  public async test(_action: IActionRdfMetadataExtract): Promise<TestResult<IActorTest>> {
    return passTestVoid();
  }

  public async run(action: IActionRdfMetadataExtract): Promise<IActorRdfMetadataExtractOutput> {
    const store = await this.collectFromMetadata(action.metadata);
    const datasets = await this.getDatasets(store, action.url);
    const metadata = datasets.length > 0 ? { datasets } : {};
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

  public async getDatasets(store: RDF.Store, source: string): Promise<IDataset[]> {
    const datasets: IDataset[] = [];

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
        let resourceUriPattern: RegExp | undefined;

        if (bindings.has('uriRegexPattern')) {
          resourceUriPattern = new RegExp(bindings.get('uriRegexPattern')!.value, 'u');
        } else if (bindings.has('uriSpace')) {
          resourceUriPattern = new RegExp(`^${bindings.get('uriSpace')?.value}`, 'u');
        }

        datasets.push(new VoidDataset({
          source,
          store,
          triples: await this.getTriples(store, identifier),
          queryEngine: this.queryEngine,
          identifier,
          resourceUriPattern,
          vocabularies: await this.getVocabularies(store, identifier),
          bindingsCacheSize: this.bindingsCacheSize,
        }));
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

  public async getTriples(
    store: RDF.Store,
    identifier: RDF.NamedNode | RDF.BlankNode,
  ): Promise<number> {
    let triples = 0;

    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>

      SELECT ?triples WHERE {
        ${termToString(identifier)} void:triples ?triples .
      } LIMIT 1
    `;

    const bindingsStream = await this.queryEngine.queryBindings(query, { sources: [ store ]});
    const bindingsArray = await bindingsStream.toArray();

    if (bindingsArray.length > 0) {
      triples = Number.parseInt(bindingsArray[0].get('triples')!.value, 10);
    }

    return triples;
  }
}

export interface IActorRdfMetadataExtractVoidArgs extends IActorRdfMetadataExtractArgs {
  /**
   * An init query actor that is used to query shapes.
   * @default {<urn:comunica:default:init/actors#query>}
   */
  actorInitQuery: ActorInitQueryBase;
  /**
   * The size for the bindings cache used in cardinality estimation to avoid repeat queries.
   * Each discovered VoID description will get its own cache, so this should not be too high.
   * @default {10}
   */
  bindingsCacheSize: number;
}
