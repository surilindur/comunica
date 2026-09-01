import { TermFunctionBase } from '@comunica/bus-function-factory';
import type {
  NumericLiteral,
  StringLiteral,
} from '@comunica/utils-expression-evaluator';
import {
  bool,
  declare,
  decimal,
  double,
  float,
  integer,
  string,
  TypeURL,
} from '@comunica/utils-expression-evaluator';

/**
 * https://www.w3.org/TR/xpath-functions/#casting-to-string
 */
export class TermFunctionXsdToString extends TermFunctionBase {
  public constructor() {
    super({
      arity: 1,
      operator: TypeURL.XSD_STRING,
      overloads: declare(TypeURL.XSD_STRING)
        .onNumeric1(() => (val: NumericLiteral) => {
          if (val.dataType === TypeURL.XSD_INTEGER) {
            return string(integer(val.typedValue).str());
          }
          if (val.dataType === TypeURL.XSD_DECIMAL) {
            return string(decimal(val.typedValue).str());
          }
          if (val.dataType === TypeURL.XSD_DOUBLE || val.dataType === TypeURL.XSD_FLOAT) {
            // When the value is zero, it should be returned as "0"
            if (val.typedValue === 0) {
              return string('0');
            }
            const absoluteValue = Math.abs(val.typedValue);
            if (absoluteValue >= 1e-6 && absoluteValue < 1e6) {
              // Doubles and floats with absolute values in [1e-6, 1e6[
              // must be cast to decimal before casting to string.
              return string(decimal(val.typedValue).str());
            }
            if (val.dataType === TypeURL.XSD_DOUBLE) {
              return string(double(val.typedValue).str());
            }
          }
          return string(float(val.typedValue).str());
        })
        .onBoolean1Typed(() => val => string(bool(val).str()))
        .onTerm1(() => (val: StringLiteral) => string(val.str()))
        .collect(),
    });
  }
}
