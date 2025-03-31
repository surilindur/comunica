import type { MediatorDereferenceRdf } from '@comunica/bus-dereference-rdf';
import type {
  IActionQuerySourceIdentify,
  IActorQuerySourceIdentifyOutput,
  IActorQuerySourceIdentifyArgs,
} from '@comunica/bus-query-source-identify';
import { ActorQuerySourceIdentify } from '@comunica/bus-query-source-identify';
import type { MediatorQuerySourceIdentifyHypermedia } from '@comunica/bus-query-source-identify-hypermedia';
import type { MediatorRdfResolveHypermediaLinksQueue } from '@comunica/bus-rdf-resolve-hypermedia-links-queue';
import { KeysInitQuery, KeysQuerySourceIdentify } from '@comunica/context-entries';
import type { TestResult, IActorTest } from '@comunica/core';
import { failTest, passTestVoid } from '@comunica/core';
import type { IActionContext, IQuerySource } from '@comunica/types';
import { QuerySourceHypermediaTraverse } from './QuerySourceHypermediaTraverse';

export class ActorQuerySourceIdentifyHypermediaTraverse extends ActorQuerySourceIdentify {
  public readonly mediatorDereferenceRdf: MediatorDereferenceRdf;
  public readonly mediatorRdfResolveHypermediaLinksQueue: MediatorRdfResolveHypermediaLinksQueue;
  public readonly mediatorQuerySourceIdentifyHypermedia: MediatorQuerySourceIdentifyHypermedia;

  public constructor(args: IActorQuerySourceIdentifyHypermediaTraverseArgs) {
    super(args);
  }

  public async test(action: IActionQuerySourceIdentify): Promise<TestResult<IActorTest>> {
    if (action.context.has(KeysQuerySourceIdentify.traverse)) {
      return failTest(`${this.name} requires the traverse flag to be set in the context.`);
    }
    if (typeof action.querySourceUnidentified.value !== 'string') {
      return failTest(`${this.name} requires a single query source with a URL value to be present in the context.`);
    }
    return passTestVoid();
  }

  public async run(action: IActionQuerySourceIdentify): Promise<IActorQuerySourceIdentifyOutput> {
    const linkQueueMediatorResult = await this.mediatorRdfResolveHypermediaLinksQueue.mediate({
      context: action.context,
      firstUrl: <string>action.querySourceUnidentified.value,
    });
    const source = new QuerySourceHypermediaTraverse({
      referenceValue: <string>action.querySourceUnidentified.value,
      linkQueue: linkQueueMediatorResult.linkQueue,
      identifySource: (url: string) => this.identifySource(action.context, url),
    });
    return { querySource: { source }};
  }

  /**
   * Helper function to identify query sources, or return undefined when the source could not be identified.
   */
  public async identifySource(context: IActionContext, url: string): Promise<IQuerySource | undefined> {
    const dereference = await this.mediatorDereferenceRdf.mediate({
      url,
      context,
      acceptErrors: context.get(KeysInitQuery.lenient),
    });
    if (dereference.exists) {
      const source = await this.mediatorQuerySourceIdentifyHypermedia.mediate({
        context,
        metadata: dereference.metadata ?? {},
        quads: dereference.data,
        url: dereference.url,
      });
      return source.source;
    }
  }
}

export interface IActorQuerySourceIdentifyHypermediaTraverseArgs extends IActorQuerySourceIdentifyArgs {
  /**
   * The RDF dereference mediator.
   */
  mediatorDereferenceRdf: MediatorDereferenceRdf;
  /**
   * The hypermedia links queue mediator to produce a link queue.
   */
  mediatorRdfResolveHypermediaLinksQueue: MediatorRdfResolveHypermediaLinksQueue;
  /**
   * The hypermedia query source identify mediator.
   */
  mediatorQuerySourceIdentifyHypermedia: MediatorQuerySourceIdentifyHypermedia;
}
