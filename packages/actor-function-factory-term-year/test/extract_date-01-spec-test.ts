import { ActorFunctionFactoryTermDay } from '@comunica/actor-function-factory-term-day';
import { ActorFunctionFactoryTermMonth } from '@comunica/actor-function-factory-term-month';
import { runFuncTestTable } from '@comunica/bus-function-factory/test/util';
import {
  int,
  dateTyped,
} from '@comunica/utils-expression-evaluator/test/util/Aliases';
import { Notation } from '@comunica/utils-expression-evaluator/test/util/TestTable';
import { ActorFunctionFactoryTermYear } from '../lib';

describe('Extract date', () => {
  /**
   * PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
   * SELECT (YEAR(?date) AS ?y) (MONTH(?date) AS ?m) (DAY(?date) AS ?d) WHERE {
   *   VALUES ?date {
   *     "2000-11-02"^^xsd:date
   *   }
   * }
   */

  describe('respect the extract_date-01 spec', () => {
    runFuncTestTable({
      registeredActors: [
        args => new ActorFunctionFactoryTermYear(args),
      ],
      operation: 'YEAR',
      arity: 1,
      notation: Notation.Function,
      testTable: `
        '${dateTyped('2000-11-02')}' = '${int('2000')}'
      `,
    });

    runFuncTestTable({
      registeredActors: [
        args => new ActorFunctionFactoryTermMonth(args),
      ],
      operation: 'MONTH',
      arity: 1,
      notation: Notation.Function,
      testTable: `
        '${dateTyped('2000-11-02')}' = '${int('11')}'
      `,
    });

    runFuncTestTable({
      registeredActors: [
        args => new ActorFunctionFactoryTermDay(args),
      ],
      operation: 'DAY',
      arity: 1,
      notation: Notation.Function,
      testTable: `
        '${dateTyped('2000-11-02')}' = '${int('2')}'
      `,
    });
  });

  /**
   * <?xml version="1.0" encoding="utf-8"?>
   * <sparql xmlns="http://www.w3.org/2005/sparql-results#">
   * <head>
   *  <variable name="y"/>
   *  <variable name="m"/>
   *  <variable name="d"/>
   * </head>
   * <results>
   *    <result>
   *      <binding name="y"><literal datatype="http://www.w3.org/2001/XMLSchema#integer">2000</literal></binding>
   *      <binding name="m"><literal datatype="http://www.w3.org/2001/XMLSchema#integer">11</literal></binding>
   *      <binding name="d"><literal datatype="http://www.w3.org/2001/XMLSchema#integer">2</literal></binding>
   *    </result>
   * </results>
   * </sparql>
   */
});
