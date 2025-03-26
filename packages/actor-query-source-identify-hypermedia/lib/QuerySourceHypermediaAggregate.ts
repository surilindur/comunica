import type { ILinkQueue } from '@comunica/bus-rdf-resolve-hypermedia-links-queue';
import type {
  Bindings,
  BindingsStream,
  FragmentSelectorShape,
  IActionContext,
  IQueryBindingsOptions,
  IQuerySource,
  QuerySourceReference,
} from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import { AsyncIterator } from 'asynciterator';
import type { Ask, Operation, Update } from 'sparqlalgebrajs/lib/algebra';

export class QuerySourceHypermediaAggregate implements IQuerySource {
  private readonly linkQueue: ILinkQueue;
  private readonly sources: Map<string, IQuerySource>;

  public readonly referenceValue: QuerySourceReference;

  public constructor(args: IQuerySourceHypermediaSimpleArgs) {
    this.referenceValue = args.referenceValue;
    this.linkQueue = args.linkQueue;
  }

  public async getSelectorShape(_context: IActionContext): Promise<FragmentSelectorShape> {
    return <any>{};
  }

  public queryBindings(operation: Operation, context: IActionContext, options?: IQueryBindingsOptions): BindingsStream {
    let bindingsStream = new AsyncIterator<Bindings>();

    // TODO: Take into account sources that are added while bindings are being produced,
    // instead of only the sources present at the time of query
    for (const source of this.sources.values()) {
      const sourceBindingsStream = source.queryBindings(operation, context, options);
      bindingsStream = bindingsStream.append(sourceBindingsStream);
    }

    return bindingsStream;
  }

  public queryQuads(operation: Operation, context: IActionContext): AsyncIterator<RDF.Quad> {
    let quadStream = new AsyncIterator<RDF.Quad>();

    for (const source of this.sources.values()) {
      const sourceQuadStream = source.queryQuads(operation, context);
      quadStream = quadStream.append(sourceQuadStream);
    }

    return quadStream;
  }

  public async queryVoid(operation: Update, context: IActionContext): Promise<void> {
    const sourcePromises: Promise<void>[] = [];

    for (const source of this.sources.values()) {
      sourcePromises.push(source.queryVoid(operation, context));
    }

    await Promise.all(sourcePromises);
  }

  public async queryBoolean(_operation: Ask, _context: IActionContext): Promise<boolean> {
    // TODO: Find better ways to estimate this, instead of always returning true
    return true;
  }

  public toString(): string {
    // The referenceValue will always be a string
    return `QuerySourceHypermediaAggregate(${(<string> this.referenceValue)})`;
  }
}

export interface IQuerySourceHypermediaSimpleArgs {
  referenceValue: string;
  linkQueue: ILinkQueue;
}
