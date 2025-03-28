import { runFuncTestTable } from '@comunica/bus-function-factory/test/util';
import { Notation } from '@comunica/utils-expression-evaluator/test/util/TestTable';
import { ActorFunctionFactoryTermSha1 } from '../lib';

describe('evaluation of \'sha1\' like', () => {
  runFuncTestTable({
    registeredActors: [
      args => new ActorFunctionFactoryTermSha1(args),
    ],
    arity: 1,
    operation: 'sha1',
    notation: Notation.Function,
    testTable: `
        "foo" = "0beec7b5ea3f0fdbc95d0dd47f3c5bc275da8a33"
      `,
    errorTable: `
        <http://example.com> = 'Argument types not valid for operator'
      `,
  });
});
