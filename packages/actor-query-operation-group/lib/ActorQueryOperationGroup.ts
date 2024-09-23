import { BindingsFactory } from '@comunica/bindings-factory';
import type { MediatorMergeBindingsContext } from '@comunica/bus-merge-bindings-context';
import type { IActorQueryOperationTypedMediatedArgs } from '@comunica/bus-query-operation';
import { ActorQueryOperation, ActorQueryOperationTypedMediated } from '@comunica/bus-query-operation';
import { KeysInitQuery } from '@comunica/context-entries';
import type { IActorTest, TestResult } from '@comunica/core';
import { failTest, passTestVoid } from '@comunica/core';
import { AsyncEvaluator } from '@comunica/expression-evaluator';
import type {
  BindingsStream,
  ComunicaDataFactory,
  IActionContext,
  IQueryOperationResult,
  MetadataVariable,
} from '@comunica/types';
import { ArrayIterator, TransformIterator } from 'asynciterator';
import type { Algebra } from 'sparqlalgebrajs';
import { GroupsState } from './GroupsState';

/**
 * A comunica Group Query Operation Actor.
 */
export class ActorQueryOperationGroup extends ActorQueryOperationTypedMediated<Algebra.Group> {
  public readonly mediatorMergeBindingsContext: MediatorMergeBindingsContext;

  public constructor(args: IActorQueryOperationGroupArgs) {
    super(args, 'group');
  }

  public async testOperation(operation: Algebra.Group, context: IActionContext): Promise<TestResult<IActorTest>> {
    const dataFactory: ComunicaDataFactory = context.getSafe(KeysInitQuery.dataFactory);
    const bindingsFactory = await BindingsFactory.create(
      this.mediatorMergeBindingsContext,
      context,
      dataFactory,
    );
    for (const aggregate of operation.aggregates) {
      // Will throw for unsupported expressions
      try {
        const _ = new AsyncEvaluator(
          dataFactory,
          aggregate.expression,
          ActorQueryOperation.getAsyncExpressionContext(context, this.mediatorQueryOperation, bindingsFactory),
        );
      } catch (error: unknown) {
        // TODO: return TestResult in ActorQueryOperation.getAsyncExpressionContext
        return failTest((<Error> error).message);
      }
    }
    return passTestVoid();
  }

  public async runOperation(operation: Algebra.Group, context: IActionContext):
  Promise<IQueryOperationResult> {
    const dataFactory: ComunicaDataFactory = context.getSafe(KeysInitQuery.dataFactory);
    const bindingsFactory = await BindingsFactory.create(this.mediatorMergeBindingsContext, context, dataFactory);

    // Get result stream for the input query
    const { input, aggregates } = operation;
    const outputRaw = await this.mediatorQueryOperation.mediate({ operation: input, context });
    const output = ActorQueryOperation.getSafeBindings(outputRaw);

    // The variables in scope are the variables on which we group, i.e. pattern.variables.
    // For 'GROUP BY ?x, ?z', this is [?x, ?z], for 'GROUP by expr(?x) as ?e' this is [?e].
    // But also in scope are the variables defined by the aggregations, since GROUP has to handle this.
    const variables: MetadataVariable[] = [
      ...operation.variables,
      ...aggregates.map(agg => agg.variable),
    ].map(variable => ({ variable, canBeUndef: false }));

    const sparqleeConfig = ActorQueryOperation.getAsyncExpressionContext(
      context,
      this.mediatorQueryOperation,
      bindingsFactory,
    );

    const variablesInner = (await output.metadata()).variables.map(v => v.variable);

    // Wrap a new promise inside an iterator that completes when the stream has ended or when an error occurs
    const bindingsStream = new TransformIterator(() => new Promise<BindingsStream>((resolve, reject) => {
      const groups = new GroupsState(operation, sparqleeConfig, bindingsFactory, variablesInner);

      // Phase 2: Collect aggregator results
      // We can only return when the binding stream ends, when that happens
      // we return the identified groups. Which are nothing more than Bindings
      // of the grouping variables merged with the aggregate variables
      // eslint-disable-next-line ts/no-misused-promises
      output.bindingsStream.on('end', async() => {
        try {
          const bindingsStreamInner = new ArrayIterator(await groups.collectResults(), { autoStart: false });
          resolve(bindingsStreamInner);
        } catch (error: unknown) {
          reject(error);
        }
      });

      // Make sure to propagate any errors in the binding stream
      output.bindingsStream.on('error', reject);

      // Phase 1: Consume the stream, identify the groups and populate the aggregators.
      // We need to bind this after the 'error' and 'end' listeners to avoid the
      // stream having ended before those listeners are bound.
      output.bindingsStream.on('data', (bindings) => {
        groups.consumeBindings(bindings).catch(reject);
      });
    }), { autoStart: false });

    return {
      type: 'bindings',
      bindingsStream,
      metadata: async() => ({ ...await output.metadata(), variables }),
    };
  }
}

export interface IActorQueryOperationGroupArgs extends IActorQueryOperationTypedMediatedArgs {
  /**
   * A mediator for creating binding context merge handlers
   */
  mediatorMergeBindingsContext: MediatorMergeBindingsContext;
}
