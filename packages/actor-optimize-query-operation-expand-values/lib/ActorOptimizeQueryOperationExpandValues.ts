import type {
  IActionOptimizeQueryOperation,
  IActorOptimizeQueryOperationArgs,
  IActorOptimizeQueryOperationOutput,
} from '@comunica/bus-optimize-query-operation';
import { ActorOptimizeQueryOperation } from '@comunica/bus-optimize-query-operation';
import { KeysInitQuery } from '@comunica/context-entries';
import type { IActorTest, TestResult } from '@comunica/core';
import { passTestVoid } from '@comunica/core';
import type { ComunicaDataFactory } from '@comunica/types';
import { termToString } from 'rdf-string';
import { Factory, Algebra, Util } from 'sparqlalgebrajs';

/**
 * Comunica query optimise actor to expand value bindings
 */
export class ActorOptimizeQueryOperationExpandValues extends ActorOptimizeQueryOperation {
  public constructor(args: IActorOptimizeQueryOperationArgs) {
    super(args);
  }

  public async test(_action: IActionOptimizeQueryOperation): Promise<TestResult<IActorTest>> {
    return passTestVoid();
  }

  public async run(action: IActionOptimizeQueryOperation): Promise<IActorOptimizeQueryOperationOutput> {
    const dataFactory: ComunicaDataFactory = action.context.getSafe(KeysInitQuery.dataFactory);
    const algebraFactory = new Factory(dataFactory);
    const valueBindings = ActorOptimizeQueryOperationExpandValues.collectValueBindings(action.operation);

    const operation = Util.mapOperation(action.operation, {
      [Algebra.types.JOIN](subOperation) {
        return {
          result: algebraFactory.createJoin(subOperation.input.filter(op => op.type !== Algebra.types.VALUES)),
          recurse: true,
        };
      },
      [Algebra.types.LEFT_JOIN](subOperation) {
        if (subOperation.input[0].type === Algebra.types.VALUES) {
          return { result: subOperation.input[1], recurse: true };
        }
        if (subOperation.input[1].type === Algebra.types.VALUES) {
          return { result: subOperation.input[0], recurse: true };
        }
        return { result: subOperation, recurse: true };
      },
      [Algebra.types.PATTERN](subOperation) {
        const expanded = ActorOptimizeQueryOperationExpandValues.expandPattern(
          algebraFactory,
          subOperation,
          valueBindings,
        );
        return {
          result: expanded.length > 1 ? algebraFactory.createUnion(expanded) : expanded[0],
          recurse: false,
        };
      },
      [Algebra.types.SERVICE](subOperation) {
        return { result: subOperation, recurse: false };
      },
    });

    return { operation, context: action.context };
  }

  public static expandPattern(
    algebraFactory: Factory,
    pattern: Algebra.Pattern,
    valueBindings: Algebra.Values[],
  ): Algebra.Pattern[] {
    const patterns: Algebra.Pattern[] = [];
    for (const values of valueBindings) {
      for (const bindings of values.bindings) {
        const s = pattern.subject.termType === 'Variable' ? bindings[termToString(pattern.subject)] : undefined;
        const p = pattern.predicate.termType === 'Variable' ? bindings[termToString(pattern.predicate)] : undefined;
        const o = pattern.object.termType === 'Variable' ? bindings[termToString(pattern.object)] : undefined;
        if (s !== undefined || p !== undefined || o !== undefined) {
          const expandedPattern = algebraFactory.createPattern(
            s ?? pattern.subject,
            p ?? pattern.predicate,
            o ?? pattern.object,
          );
          expandedPattern.metadata = pattern.metadata;
          patterns.push(expandedPattern);
        }
      }
    }
    if (patterns.length === 0) {
      patterns.push(pattern);
    }
    return patterns;
  }

  /**
   * Collect all value bindings in the operation.
   * @param operation The input operation.
   * @returns The list of value bindings in the operation.
   */
  public static collectValueBindings(operation: Algebra.Operation): Algebra.Values[] {
    const values: Algebra.Values[] = [];
    Util.recurseOperation(operation, {
      [Algebra.types.VALUES](subOperation) {
        values.push(subOperation);
        return false;
      },
    });
    return values;
  }
}
