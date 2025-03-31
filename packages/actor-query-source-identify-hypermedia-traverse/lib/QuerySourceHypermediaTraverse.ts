import { getVariables } from '@comunica/bus-query-source-identify';
import type { ILinkQueue } from '@comunica/bus-rdf-resolve-hypermedia-links-queue';
import { KeysInitQuery } from '@comunica/context-entries';
import type {
  Bindings,
  BindingsStream,
  FragmentSelectorShape,
  IActionContext,
  IQueryBindingsOptions,
  IQuerySource,
  QuerySourceReference,
  IMetadata,
  ILink,
} from '@comunica/types';
import { MetadataValidationState } from '@comunica/utils-metadata';
import type * as RDF from '@rdfjs/types';
import { AsyncIterator } from 'asynciterator';
import { Factory } from 'sparqlalgebrajs';
import type { Algebra } from 'sparqlalgebrajs';

export class QuerySourceHypermediaTraverse implements IQuerySource {
  public readonly referenceValue: QuerySourceReference;

  private traversalDone: boolean;

  private readonly linkQueue: ILinkQueue;
  private readonly sources: Map<string, IQuerySource>;
  private readonly sourceAddedListeners: Set<((source: IQuerySource) => void)>;
  private readonly identifySource: (url: string) => Promise<IQuerySource | undefined>;

  public constructor(args: IQuerySourceHypermediaTraverseArgs) {
    this.referenceValue = args.referenceValue;
    this.linkQueue = args.linkQueue;
    this.sourceAddedListeners = new Set();
    this.traversalDone = false;
    this.identifySource = args.identifySource;
    this.traverseUntilQueueIsEmpty().then(() => {
      this.traversalDone = true;
    }).catch((error) => {
      throw error;
    });
  }

  /**
   * The traverse actor can handle triple patterns only, since it can wrap multiple sources,
   * and triple patterns is the lowest common denominator shape-wise.
   */
  public async getSelectorShape(context: IActionContext): Promise<FragmentSelectorShape> {
    const dataFactory = context.getSafe(KeysInitQuery.dataFactory);
    const algebraFactory = new Factory(dataFactory);
    return {
      type: 'operation',
      operation: {
        operationType: 'pattern',
        pattern: algebraFactory.createPattern(
          dataFactory.variable('s'),
          dataFactory.variable('p'),
          dataFactory.variable('o'),
        ),
      },
      variablesOptional: [
        dataFactory.variable('s'),
        dataFactory.variable('p'),
        dataFactory.variable('o'),
      ],
    };
  }

  /**
   * Query the source for bindings. This will forward the operation to all current and
   * future sources discovered via link traversal, and combine the results into a single bindings stream.
   */
  public queryBindings(
    operation: Algebra.Operation,
    context: IActionContext,
    options?: IQueryBindingsOptions,
  ): BindingsStream {
    const bindingsStream = new AsyncIterator<Bindings>();

    const metadata: IMetadata<RDF.Variable> = {
      state: new MetadataValidationState(),
      cardinality: { type: 'estimate', value: 0 },
      // The selector shape ensures this actor will only receive patterns
      variables: getVariables(<Algebra.Pattern>operation),
    };

    bindingsStream.setProperty('metadata', metadata);

    const openStreams = new Set<BindingsStream>();

    const proxyBindings = (source: IQuerySource): void => {
      const sourceStream = source.queryBindings(operation, context, options);
      openStreams.add(sourceStream);
      sourceStream.once('end', () => {
        openStreams.delete(sourceStream);
        this.sourceAddedListeners.delete(proxyBindings);
        if (openStreams.size === 0 && this.traversalDone) {
          bindingsStream.close();
        }
      }).once('error', (error: Error) => {
        openStreams.delete(sourceStream);
        this.sourceAddedListeners.delete(proxyBindings);
        for (const stream of openStreams) {
          stream.destroy(error);
        }
        bindingsStream.destroy(error);
      }).on('data', (data) => {
        bindingsStream.emit('data', data);
      });

      const sourceMetadata: { traverse?: ILink[] } | undefined = sourceStream.getProperty('metadata');

      if (sourceMetadata?.traverse) {
        for (const link of sourceMetadata.traverse) {
          this.linkQueue.push(link, { url: <string>source.referenceValue });
        }
      }
    };

    this.sourceAddedListeners.add(proxyBindings);

    for (const source of this.sources.values()) {
      proxyBindings(source);
    }

    return bindingsStream;
  }

  public queryQuads(operation: Algebra.Operation, context: IActionContext): AsyncIterator<RDF.Quad> {
    let quadStream = new AsyncIterator<RDF.Quad>();

    const openIterators = new Set<AsyncIterator<RDF.Quad>>();

    const proxyQuads = (source: IQuerySource): void => {
      const sourceIterator = source.queryQuads(operation, context);
      openIterators.add(sourceIterator);
      sourceIterator.once('end', () => {
        openIterators.delete(sourceIterator);
        this.sourceAddedListeners.r;
      }).once('error', (error: Error) => {
        openIterators.delete(sourceIterator);
        for (const iterator of openIterators) {
          iterator.destroy(error);
        }
        quadStream.destroy(error);
      }).on('data', (data) => {
        quadStream.emit('data', data);
      });
    };

    this.sourceAddedListeners.push(proxyQuads);

    for (const source of this.sources.values()) {
      const sourceQuadStream = source.queryQuads(operation, context);
      quadStream = quadStream.append(sourceQuadStream);
    }

    return quadStream;
  }

  /**
   * Execute an update operation. This will forward the supplied operation to all sources.
   */
  public async queryVoid(operation: Algebra.Update, context: IActionContext): Promise<void> {
    const sourcePromises: Promise<void>[] = [];

    for (const source of this.sources.values()) {
      sourcePromises.push(source.queryVoid(operation, context));
    }

    await Promise.all(sourcePromises);
  }

  /**
   * Check whether the source contains any results matching the operation.
   *
   * When traversal is underway, this will always return true, since sources with results
   * may simply not have been discovered yet.
   * Only when traversal is done, and no sources contain results, will false be returned.
   */
  public async queryBoolean(operation: Algebra.Ask, context: IActionContext): Promise<boolean> {
    if (this.linkQueue.isEmpty()) {
      for (const source of this.sources.values()) {
        const sourceContainsResults = await source.queryBoolean(operation, context);
        if (sourceContainsResults) {
          return true;
        }
      }
      return false;
    }
    return true;
  }

  /**
   * Return a string representation with the seed URI.
   */
  public toString(): string {
    return `QuerySourceHypermediaAggregate(${(<string> this.referenceValue)})`;
  }

  /**
   * Perform link traversal over the queue until the queue is empty.
   * When the queue is empty, there have been no further links to follow,
   * and thus traversal can be terminated.
   */
  public async traverseUntilQueueIsEmpty(): Promise<void> {
    while (!this.linkQueue.isEmpty()) {
      const link = this.linkQueue.pop();
      if (link && !this.sources.has(link.url)) {
        const source = await this.identifySource(link.url);
        if (source) {
          this.sources.set(link.url, source);
          for (const listener of this.sourceAddedListeners) {
            listener(source);
          }
        }
      }
    }
  }
}

export interface IQuerySourceHypermediaTraverseArgs {
  referenceValue: string;
  linkQueue: ILinkQueue;
  identifySource: (url: string) => Promise<IQuerySource | undefined>;
}
