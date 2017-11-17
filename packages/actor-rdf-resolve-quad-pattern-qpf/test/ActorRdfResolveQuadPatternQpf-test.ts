import {ActorRdfResolveQuadPattern} from "@comunica/bus-rdf-resolve-quad-pattern";
import {Bus} from "@comunica/core";
import {Readable} from "stream";
import {ActorRdfResolveQuadPatternQpf} from "../lib/ActorRdfResolveQuadPatternQpf";

describe('ActorRdfResolveQuadPatternQpf', () => {
  let bus;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
  });

  describe('The ActorRdfResolveQuadPatternQpf module', () => {
    it('should be a function', () => {
      expect(ActorRdfResolveQuadPatternQpf).toBeInstanceOf(Function);
    });

    it('should be a ActorRdfResolveQuadPatternQpf constructor', () => {
      expect(new (<any> ActorRdfResolveQuadPatternQpf)({ bus, graphUri: 'g', mediatorRdfDereferencePaged: {},
        name: 'actor', objectUri: 'o', predicateUri: 'p', subjectUri: 's' }))
        .toBeInstanceOf(ActorRdfResolveQuadPatternQpf);
      expect(new (<any> ActorRdfResolveQuadPatternQpf)({ bus, graphUri: 'g', mediatorRdfDereferencePaged: {},
        name: 'actor', objectUri: 'o', predicateUri: 'p', subjectUri: 's' }))
        .toBeInstanceOf(ActorRdfResolveQuadPattern);
    });

    it('should not be able to create new ActorRdfResolveQuadPatternQpf objects without \'new\'', () => {
      expect(() => { (<any> ActorRdfResolveQuadPatternQpf)(); }).toThrow();
    });

    it('should not throw an error when constructed without optional graph uri', () => {
      expect(() => { new (<any> ActorRdfResolveQuadPatternQpf)({ bus, mediatorRdfDereferencePaged: {},
        name: 'actor', objectUri: 'o', predicateUri: 'p', subjectUri: 's' }); }).not.toThrow();
    });
  });

  describe('An ActorRdfResolveQuadPatternQpf instance', () => {
    let actor: ActorRdfResolveQuadPatternQpf;
    let mediator;
    let pattern1;
    let pattern2;
    let pattern3;
    let pattern4;
    let metadataQpf;
    let metadataTpf;

    beforeEach(() => {
      mediator = {};
      pattern1 = {
        graph: { value: 'd', termType: 'NamedNode' },
        object: { value: 'c', termType: 'NamedNode' },
        predicate: { value: 'b', termType: 'Variable' },
        subject: { value: 'a', termType: 'NamedNode' },
      };
      pattern2 = {
        graph: { value: 'd', termType: 'NamedNode' },
        object: { value: 'c', termType: 'Variable' },
        predicate: { value: 'b', termType: 'NamedNode' },
        subject: { value: 'a', termType: 'NamedNode' },
      };
      pattern3 = {
        graph: { value: 'd', termType: 'Variable' },
        object: { value: 'c', termType: 'NamedNode' },
        predicate: { value: 'b', termType: 'NamedNode' },
        subject: { value: 'a', termType: 'NamedNode' },
      };
      pattern4 = {
        graph: { value: 'd', termType: 'NamedNode' },
        object: { value: 'c', termType: 'NamedNode' },
        predicate: { value: 'b', termType: 'NamedNode' },
        subject: { value: 'a', termType: 'Variable' },
      };
      metadataQpf = {
        searchForms: { values: [
          {
            getUri: (entries) => (entries.s || '_') + ',' + (entries.p || '_') + ',' + (entries.o || '_')
              + ',' + (entries.g || '_'),
            mappings: {
              g: 'G',
              o: 'O',
              p: 'P',
              s: 'S',
            },
          },
        ]},
      };
      metadataTpf = {
        searchForms: { values: [
          {
            getUri: (entries) => (entries.s || '_') + ',' + (entries.p || '_') + ',' + (entries.o || '_'),
            mappings: {
              o: 'O',
              p: 'P',
              s: 'S',
            },
          },
        ]},
      };
      mediator.mediate = (action) => Promise.resolve({
        data: stream([ action.url + '/a', action.url + '/b', action.url + '/c' ]),
        firstPageMetadata: metadataQpf,
      });
      actor = new ActorRdfResolveQuadPatternQpf({ bus, graphUri: 'g', mediatorRdfDereferencePaged: mediator,
        name: 'actor', objectUri: 'o', predicateUri: 'p', subjectUri: 's' });
    });

    it('should test', () => {
      return expect(actor.test({ pattern: pattern1, context: { entrypoint: 'entrypoint' } })).resolves
        .toBeTruthy();
    });

    it('should not test without an entrypoint', () => {
      return expect(actor.test({ pattern: pattern1, context: {} })).rejects.toBeTruthy();
    });

    it('should not test without a context', () => {
      return expect(actor.test({ pattern: pattern1 })).rejects.toBeTruthy();
    });

    it('should not run when no metadata is available', () => {
      mediator.mediate = () => Promise.resolve({});
      return expect(actor.run({ pattern: pattern1, context: { entrypoint: 'entrypoint' } })).rejects
        .toEqual(new Error('No metadata was found at entrypoint entrypoint'));
    });

    it('should not run when no metadata search forms are available', () => {
      mediator.mediate = () => Promise.resolve({ firstPageMetadata: {} });
      return expect(actor.run({ pattern: pattern1, context: { entrypoint: 'entrypoint' } })).rejects
        .toEqual(new Error('No Hydra search forms were discovered in the metadata of entrypoint. ' +
          'You may be missing an actor that extracts this metadata'));
    });

    it('should not run when 0 metadata search forms are available', () => {
      mediator.mediate = () => Promise.resolve({ firstPageMetadata: { searchForms: { values: [] } } });
      return expect(actor.run({ pattern: pattern1, context: { entrypoint: 'entrypoint' } })).rejects
        .toEqual(new Error('No Hydra search forms were discovered in the metadata of entrypoint. ' +
          'You may be missing an actor that extracts this metadata'));
    });

    it('should not run when no valid metadata search form was found', () => {
      mediator.mediate = () => Promise.resolve({ firstPageMetadata: { searchForms: { values: [
        {
          getUri: () => null,
          mappings: {
            a: 'g1',
            b: 'o1',
            c: 'p1',
            d: 's1',
          },
        },
      ]}}});
      return expect(actor.run({ pattern: pattern1, context: { entrypoint: 'entrypoint' } })).rejects
        .toEqual(new Error('No valid Hydra search form was found for quad pattern or triple pattern queries.'));
    });

    it('should run for QPF pattern 1', () => {
      return actor.run({ pattern: pattern1, context: { entrypoint: 'entrypoint' } }).then((output) => {
        return new Promise((resolve, reject) => {
          expect(output.metadata).toBe(metadataQpf);
          const list = [];
          output.data.on('data', (data) => list.push(data));
          output.data.on('end', () => {
            if (list.length !== 3) {
              reject();
            }
            expect(list).toEqual([ 'a,_,c,d/a', 'a,_,c,d/b', 'a,_,c,d/c' ]);
            resolve();
          });
        });
      });
    });

    it('should run for QPF pattern 2', () => {
      return actor.run({ pattern: pattern2, context: { entrypoint: 'entrypoint' } }).then((output) => {
        return new Promise((resolve, reject) => {
          expect(output.metadata).toBe(metadataQpf);
          const list = [];
          output.data.on('data', (data) => list.push(data));
          output.data.on('end', () => {
            if (list.length !== 3) {
              reject();
            }
            expect(list).toEqual([ 'a,b,_,d/a', 'a,b,_,d/b', 'a,b,_,d/c' ]);
            resolve();
          });
        });
      });
    });

    it('should run for QPF pattern 3', () => {
      return actor.run({ pattern: pattern3, context: { entrypoint: 'entrypoint' } }).then((output) => {
        return new Promise((resolve, reject) => {
          expect(output.metadata).toBe(metadataQpf);
          const list = [];
          output.data.on('data', (data) => list.push(data));
          output.data.on('end', () => {
            if (list.length !== 3) {
              reject();
            }
            expect(list).toEqual([ 'a,b,c,_/a', 'a,b,c,_/b', 'a,b,c,_/c' ]);
            resolve();
          });
        });
      });
    });

    it('should run for QPF pattern 4', () => {
      return actor.run({ pattern: pattern4, context: { entrypoint: 'entrypoint' } }).then((output) => {
        return new Promise((resolve, reject) => {
          expect(output.metadata).toBe(metadataQpf);
          const list = [];
          output.data.on('data', (data) => list.push(data));
          output.data.on('end', () => {
            if (list.length !== 3) {
              reject();
            }
            expect(list).toEqual([ '_,b,c,d/a', '_,b,c,d/b', '_,b,c,d/c' ]);
            resolve();
          });
        });
      });
    });

    it('should run for TPF', () => {
      mediator.mediate = (action) => Promise.resolve({
        data: stream([ action.url + '/a', action.url + '/b', action.url + '/c' ]),
        firstPageMetadata: metadataTpf,
      });
      return actor.run({ pattern: pattern2, context: { entrypoint: 'entrypoint' } }).then((output) => {
        return new Promise((resolve, reject) => {
          expect(output.metadata).toBe(metadataTpf);
          const list = [];
          output.data.on('data', (data) => list.push(data));
          output.data.on('end', () => {
            if (list.length !== 3) {
              reject();
            }
            expect(list).toEqual([ 'a,b,_/a', 'a,b,_/b', 'a,b,_/c' ]);
            resolve();
          });
        });
      });
    });

    it('should cache when run for the same entrypoint twice', () => {
      const spy = jest.spyOn(<any> actor, 'createSource');
      return actor.run({ pattern: pattern1, context: { entrypoint: 'entrypoint' } }).then(() => {
        actor.run({ pattern: pattern1, context: { entrypoint: 'entrypoint' } }).then(() => {
          expect(spy).toHaveBeenCalledTimes(1);
        });
      });
    });

    it('should not cache when run for different entrypoints', () => {
      const spy = jest.spyOn(<any> actor, 'createSource');
      return actor.run({ pattern: pattern1, context: { entrypoint: 'entrypoint1' } }).then(() => {
        actor.run({ pattern: pattern1, context: { entrypoint: 'entrypoint2' } }).then(() => {
          expect(spy).toHaveBeenCalledTimes(2);
        });
      });
    });
  });
});

function stream(elements) {
  const readable = new Readable({ objectMode: true });
  readable._read = () => {
    readable.push(elements.shift());
    if (elements.length === 0) {
      readable.push(null);
    }
  };
  return readable;
}