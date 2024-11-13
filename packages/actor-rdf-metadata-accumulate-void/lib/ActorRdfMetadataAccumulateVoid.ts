import type { IVoidDataset } from '@comunica/actor-rdf-metadata-extract-void';
import type {
  IActionRdfMetadataAccumulate,
  IActorRdfMetadataAccumulateOutput,
  IActorRdfMetadataAccumulateArgs,
} from '@comunica/bus-rdf-metadata-accumulate';
import { ActorRdfMetadataAccumulate } from '@comunica/bus-rdf-metadata-accumulate';
import type { IActorTest, TestResult } from '@comunica/core';
import { passTestVoid } from '@comunica/core';

/**
 * A comunica VoID RDF Metadata Accumulate Actor.
 */
export class ActorRdfMetadataAccumulateCardinality extends ActorRdfMetadataAccumulate {
  public constructor(args: IActorRdfMetadataAccumulateArgs) {
    super(args);
  }

  public async test(_action: IActionRdfMetadataAccumulate): Promise<TestResult<IActorTest>> {
    return passTestVoid();
  }

  public async run(action: IActionRdfMetadataAccumulate): Promise<IActorRdfMetadataAccumulateOutput> {
    if (action.mode === 'initialize') {
      return { metadata: { voidDatasets: []}};
    }

    const voidDatasets: IVoidDataset[] = action.accumulatedMetadata.voidDatasets;

    if (action.appendingMetadata.voidDatasets) {
      voidDatasets.push(...action.appendingMetadata.voidDatasets);
    }

    return { metadata: { voidDatasets }};
  }
}
