import type {
  IActionRdfMetadataExtract,
  IActorRdfMetadataExtractOutput,
  IActorRdfMetadataExtractArgs,
} from '@comunica/bus-rdf-metadata-extract';
import { ActorRdfMetadataExtract } from '@comunica/bus-rdf-metadata-extract';
import type { IActorTest, TestResult } from '@comunica/core';
import { passTestVoid } from '@comunica/core';

/**
 * A comunica Patch SPARQL Update RDF Metadata Extract Actor.
 */
export class ActorRdfMetadataExtractPatchSparqlUpdate extends ActorRdfMetadataExtract {
  public constructor(args: IActorRdfMetadataExtractArgs) {
    super(args);
  }

  public async test(_action: IActionRdfMetadataExtract): Promise<TestResult<IActorTest>> {
    return passTestVoid();
  }

  public async run(action: IActionRdfMetadataExtract): Promise<IActorRdfMetadataExtractOutput> {
    const metadata: IActorRdfMetadataExtractOutput['metadata'] = {};
    // The ms-author-via header is added for backwards-compatibility with old Solid servers
    if (
      action.headers?.get('accept-patch')?.includes('application/sparql-update') ??
      action.headers?.get('ms-author-via')?.includes('SPARQL')
    ) {
      metadata.patchSparqlUpdate = true;
    }
    return { metadata };
  }
}
