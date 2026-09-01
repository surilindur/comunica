import {
  runFuncTestTable,
  Notation,
} from '@comunica/utils-jest';
import { ActorFunctionFactoryTermXsdToString } from '../lib';

describe('to string', () => {
  runFuncTestTable({
    registeredActors: [
      args => new ActorFunctionFactoryTermXsdToString(args),
    ],
    arity: 1,
    notation: Notation.Function,
    operation: 'xsd:string',
    testTable: `
        "http://example.org/z" = "http://example.org/z"
        <http://example.org/z> = "http://example.org/z"
        "true"^^xsd:boolean = "true"
        "false"^^xsd:boolean = "false"
        "1"^^xsd:boolean = "true"
        "0"^^xsd:boolean = "false"
        "1"^^xsd:integer = "1"
        "0"^^xsd:double = "0"
        "+0"^^xsd:float = "0"
        "+0"^^xsd:double = "0"
        "0.0"^^xsd:decimal = "0"
        "+1.0"^^xsd:decimal = "1"
        "-1.0"^^xsd:decimal = "-1"
        "0E1"^^xsd:double = "0"
        "1E0"^^xsd:double = "1"
        "1E0"^^xsd:float = "1"
        "1.25"^^xsd:float = "1.25"
        "2.5"^^xsd:decimal = "2.5"
        "-2.5"^^xsd:decimal = "-2.5"
        "0.0000001"^^xsd:float = "1.0E-7"
        "0.0000001"^^xsd:double = "1.0E-7"
        "0.0000001"^^xsd:decimal = "0.0000001"
        "0.000001"^^xsd:float = "0.000001"
        "0.000001"^^xsd:double = "0.000001"
        "0.000001"^^xsd:decimal = "0.000001"
        "1E5"^^xsd:double = "100000"
        "999999"^^xsd:float = "999999"
        "999999"^^xsd:double = "999999"
        "999999"^^xsd:decimal = "999999"
        "1000000"^^xsd:float = "1.0E6"
        "1000000"^^xsd:double = "1.0E6"
        "1000000"^^xsd:decimal = "1000000"
        "INF"^^xsd:float = "INF"
        "INF"^^xsd:double = "INF"
        "-INF"^^xsd:float = "-INF"
        "-INF"^^xsd:double = "-INF"
      `,
  });
});
