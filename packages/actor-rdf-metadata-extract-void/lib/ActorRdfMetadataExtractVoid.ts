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
import { storeStream } from 'rdf-store-stream';
import { VoidDataset } from './VoidDataset';

/**
 * A comunica Void RDF Metadata Extract Actor.
 */
export class ActorRdfMetadataExtractVoid extends ActorRdfMetadataExtract {
  private readonly queryEngine: QueryEngineBase;
  private readonly inferUriRegexPattern: boolean;

  public constructor(args: IActorRdfMetadataExtractVoidArgs) {
    super(args);
    this.queryEngine = new QueryEngineBase(args.actorInitQuery);
    this.inferUriRegexPattern = args.inferUriRegexPattern;
  }

  public async test(_action: IActionRdfMetadataExtract): Promise<TestResult<IActorTest>> {
    return passTestVoid();
  }

  public async run(action: IActionRdfMetadataExtract): Promise<IActorRdfMetadataExtractOutput> {
    const metadataStore = await storeStream(action.metadata);
    const voidDatasets: IVoidDataset[] = [];

    const query = `
      PREFIX void: <http://rdfs.org/ns/void#>
      PREFIX sd: <http://www.w3.org/ns/sparql-service-description#>
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>

      SELECT DISTINCT ?dataset ?uriRegexPattern ?uriSpace WHERE {
        ?dataset rdf:type ?type .

        OPTIONAL { ?dataset void:uriRegexPattern ?uriRegexPattern } .
        OPTIONAL { ?dataset void:uriSpace ?uriSpace } .

        FILTER(?type IN (sd:Graph,sd:Dataset,void:Dataset)) .
      }
    `;

    const bindingsStream = await this.queryEngine.queryBindings(query, { sources: [ metadataStore ]});

    for await (const bindings of bindingsStream) {
      const dataset = bindings.get('dataset')!;
      if (dataset.termType === 'BlankNode' || dataset.termType === 'NamedNode') {
        let uriRegexPattern: RegExp | undefined;

        // The actual pattern should take precedence when available
        if (bindings.has('uriRegexPattern')) {
          uriRegexPattern = new RegExp(bindings.get('uriRegexPattern')!.value, 'u');
        } else if (bindings.has('uriSpace')) {
          uriRegexPattern = new RegExp(`^${bindings.get('uriSpace')?.value}`, 'u');
        } else if (this.inferUriRegexPattern) {
          const url = new URL(dataset.termType === 'NamedNode' ? dataset.value : action.url);
          const datasetRoot = `${url.protocol}://${url.host}/`;
          uriRegexPattern = new RegExp(`^${datasetRoot}`, 'u');
        }

        voidDatasets.push(new VoidDataset({
          uriRegexPattern,
          queryEngine: this.queryEngine,
          store: metadataStore,
          graph: dataset,
        }));
      }
    }

    console.log(`Found ${voidDatasets.length} VoID Datasets from ${action.url}`);

    const metadata = voidDatasets.length > 0 ? { voidDatasets } : {};

    return { metadata };
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
 * Wrapper for VoID Dataset descriptions as defined in the specification:
 * https://www.w3.org/TR/void/#statistics
 *
 * For performance reasons, the entire description is not parsed immediately
 * into an object representation - instead, a set of utility functions are
 * provided to extract specific items as they are needed, to keep things
 * performant. This incurs the overhead of storing the entire description in
 * memory, but this should be feasible unless the description is massive.
 */
export interface IVoidDataset {
  /**
   * Produce a cardinality estimate for the given triple pattern.
   */
  getCardinality: (
    subject: RDF.Term,
    predicate: RDF.Term,
    object: RDF.Term,
  ) => Promise<RDF.QueryResultCardinality>;
  /**
   * Produce a list of vocabularies used, as defined in the description.
   * This does **not** scan the full description to extract vocabularies.
   */
  getVocabularies: () => Promise<string[] | undefined>;
}
