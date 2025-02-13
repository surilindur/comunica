import type { MediatorQueryProcess } from '@comunica/bus-query-process';
import { KeysInitQuery } from '@comunica/context-entries';
import { ActionContext, Bus } from '@comunica/core';
import { LoggerPretty } from '@comunica/logger-pretty';
import type { IActionContext } from '@comunica/types';
import { stringify as stringifyStream } from '@jeswr/stream-to-string';
import { PassThrough, Readable, Transform } from 'readable-stream';
import { ActorInitQuery } from '../lib/ActorInitQuery';
import { QueryEngineBase } from '../lib/QueryEngineBase';

describe('ActorInitQuery', () => {
  let bus: any;
  let mediatorQueryProcess: MediatorQueryProcess;
  let mediatorSparqlSerialize: any;
  let mediatorHttpInvalidate: any;
  let context: IActionContext;
  let input: Readable;

  const defaultQueryInputFormat = 'sparql';
  const queryString = 'SELECT * WHERE { ?s ?p ?o } LIMIT 100';

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
    mediatorQueryProcess = <any>{
      mediate: jest.fn((action: any) => {
        if (action.context.has(KeysInitQuery.explain)) {
          return Promise.resolve({
            result: {
              explain: 'true',
              data: 'EXPLAINED',
            },
          });
        }
        return action.query === 'INVALID' ?
          Promise.reject(new Error('Invalid query')) :
          Promise.resolve({
            result: { type: 'bindings', bindingsStream: input, metadata: () => ({}), context: action.context },
          });
      }),
    };
    mediatorSparqlSerialize = {
      mediate(arg: any) {
        return Promise.resolve(arg.mediaTypes ?
            { mediaTypes: arg } :
            {
              handle: {
                data: arg.handle.bindingsStream
                  .pipe(new Transform({
                    objectMode: true,
                    transform: (e: any, enc: any, cb: any) => cb(null, JSON.stringify(e)),
                  })),
              },
            });
      },
    };
    mediatorHttpInvalidate = {
      mediate: () => Promise.resolve(true),
    };
    context = new ActionContext();
    input = new Readable({ objectMode: true });
    input._read = () => {
      const triple = { a: 'triple' };
      input.push(triple);
      input.push(null);
    };
    (<any> input).toArray = () => [ 'element' ];
  });

  describe('An ActorInitQuery instance', () => {
    let actorAllowNoSources: ActorInitQuery;
    let spyQueryOrExplain: any;
    beforeEach(() => {
      actorAllowNoSources = new ActorInitQuery({
        bus,
        defaultQueryInputFormat,
        mediatorHttpInvalidate,
        mediatorQueryProcess,
        mediatorQueryResultSerialize: mediatorSparqlSerialize,
        mediatorQueryResultSerializeMediaTypeCombiner: mediatorSparqlSerialize,
        mediatorQueryResultSerializeMediaTypeFormatCombiner: mediatorSparqlSerialize,
        name: 'actor',
        allowNoSources: true,
      });

      spyQueryOrExplain = jest.spyOn(QueryEngineBase.prototype, 'queryOrExplain');
    });

    describe('with allowNoSources', () => {
      it('handles a single source', async() => {
        const stdout = await stringifyStream(<any>(await actorAllowNoSources.run({
          argv: [ 'SOURCE', queryString ],
          env: {},
          stdin: <Readable><any> new PassThrough(),
          context,
        })).stdout);
        expect(stdout).toContain(`{"a":"triple"}`);
        expect(spyQueryOrExplain).toHaveBeenCalledWith(queryString, {
          [KeysInitQuery.queryFormat.name]: { language: 'sparql', version: '1.1' },
          sources: [{ value: 'SOURCE' }],
          log: expect.any(LoggerPretty),
        });
      });

      it('handles no sources', async() => {
        const stdout = await stringifyStream(<any>(await actorAllowNoSources.run({
          argv: [ queryString ],
          env: {},
          stdin: <Readable><any> new PassThrough(),
          context,
        })).stdout);
        expect(stdout).toContain(`{"a":"triple"}`);
        expect(spyQueryOrExplain).toHaveBeenCalledWith(queryString, {
          [KeysInitQuery.queryFormat.name]: { language: 'sparql', version: '1.1' },
          log: expect.any(LoggerPretty),
        });
      });

      it('emits to stderr for no argv', async() => {
        const stderr = await stringifyStream(<any>(await actorAllowNoSources.run({
          argv: [],
          env: {},
          stdin: <Readable><any> new PassThrough(),
          context,
        })).stderr);
        expect(stderr).toContain('evaluates SPARQL queries');
        expect(stderr).toContain('A query must be provided');
      });
    });
  });
});
