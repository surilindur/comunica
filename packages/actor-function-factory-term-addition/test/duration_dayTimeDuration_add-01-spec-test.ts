/* eslint max-len: 0 */
import { runFuncTestTable } from '@comunica/bus-function-factory/test/util';
import {
  dateTyped,
  dayTimeDurationTyped,
  dateTimeTyped,
  timeTyped,
} from '@comunica/utils-expression-evaluator/test/util/Aliases';
import { Notation } from '@comunica/utils-expression-evaluator/test/util/TestTable';
import { ActorFunctionFactoryTermAddition } from '../lib';

describe('Add duration and dayTimeDuration 01', () => {
  /**
   * PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
   * SELECT (?d + ?duration AS ?datetime)
   * WHERE {
   *  VALUES (?duration ?d) {
   *    ("P3DT1H15M"^^xsd:dayTimeDuration "2000-10-30T11:12:00"^^xsd:dateTime)
   *    ("P3DT1H15M"^^xsd:dayTimeDuration "2000-10-30"^^xsd:date)
   *    ("P3DT1H15M"^^xsd:dayTimeDuration "11:12:00"^^xsd:time)
   *  }
   * }
   */

  describe('respect the duration_dayTimeDuration_add-01 spec', () => {
    runFuncTestTable({
      registeredActors: [
        args => new ActorFunctionFactoryTermAddition(args),
      ],
      operation: '+',
      arity: 2,
      notation: Notation.Infix,
      testTable: `
        '${dateTimeTyped('2000-10-30T11:12:00')}' '${dayTimeDurationTyped('P3DT1H15M')}' = '${dateTimeTyped('2000-11-02T12:27:00')}'
        '${dateTyped('2000-10-30')}' '${dayTimeDurationTyped('P3DT1H15M')}' = '${dateTyped('2000-11-02')}'
        '${timeTyped('11:12:00')}' '${dayTimeDurationTyped('P3DT1H15M')}' = '${timeTyped('12:27:00')}'
      `,
    });
  });

  /**
   * <?xml version="1.0" encoding="utf-8"?>
   * <sparql xmlns="http://www.w3.org/2005/sparql-results#">
   * <head>
   *  <variable name="datetime"/>
   * </head>
   * <results>
   *    <result>
   *      <binding name="datetime"><literal datatype="http://www.w3.org/2001/XMLSchema#dateTime">2000-11-02T12:27:00</literal></binding>
   *    </result>
   *    <result>
   *      <binding name="datetime"><literal datatype="http://www.w3.org/2001/XMLSchema#date">2000-11-02</literal></binding>
   *    </result>
   *    <result>
   *      <binding name="datetime"><literal datatype="http://www.w3.org/2001/XMLSchema#time">12:27:00</literal></binding>
   *    </result>
   * </results>
   * </sparql>
   */
});
