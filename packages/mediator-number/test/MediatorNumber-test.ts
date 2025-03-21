import type { IAction, IActorOutput, IActorTest, TestResult } from '@comunica/core';
import { failTest, passTest, ActionContext, Actor, Bus, Mediator } from '@comunica/core';
import type { IActionContext } from '@comunica/types';
import { MediatorNumber } from '..';

describe('MediatorNumber', () => {
  let bus: Bus<DummyActor, IAction, IDummyTest, IDummyTest>;
  let context: IActionContext;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
    context = new ActionContext();
  });

  describe('The MediatorNumber module', () => {
    it('should be a function', () => {
      expect(MediatorNumber).toBeInstanceOf(Function);
    });

    it('should be a MediatorNumber constructor', () => {
      expect(new (<any> MediatorNumber)({ name: 'mediator', bus, field: 'field', type: 'min' }))
        .toBeInstanceOf(MediatorNumber);
      expect(new (<any> MediatorNumber)({ name: 'mediator', bus, field: 'field', type: 'min' }))
        .toBeInstanceOf(Mediator);
    });

    it('should not throw an error when constructed with \'field\' and \'type\' parameters', () => {
      expect(() => {
        new MediatorNumber({ name: 'mediator', bus, field: 'field', type: 'min' });
      })
        .not.toThrow('TODO');
      expect(() => {
        new MediatorNumber({ name: 'mediator', bus, field: 'field', type: 'max' });
      })
        .not.toThrow('TODO');
    });

    it('should throw an error when constructed without arguments', () => {
      expect(() => {
        new MediatorNumber(
          { name: 'mediator', bus, field: 'field', type: <any> 'invalidType' },
        );
      }).toThrow(`No valid "type" value was given, must be either 'min' or 'max', but got: invalidType`);
    });

    it('should store the \'field\' and \'type\' parameters', () => {
      expect(new MediatorNumber({ name: 'mediator', bus, field: 'field', type: 'min' }).field)
        .toBe('field');
      expect(new MediatorNumber({ name: 'mediator', bus, field: 'field', type: 'min' }).type)
        .toBe('min');
    });
  });

  describe('An MediatorNumber instance', () => {
    let mediatorMin: MediatorNumber<DummyActor, IAction, IDummyTest, IDummyTest, undefined>;
    let mediatorMax: MediatorNumber<DummyActor, IAction, IDummyTest, IDummyTest, undefined>;

    beforeEach(() => {
      mediatorMin = new MediatorNumber({ name: 'mediatorMin', bus, field: 'field', type: 'min' });
      mediatorMax = new MediatorNumber({ name: 'mediatorMax', bus, field: 'field', type: 'max' });
    });

    describe('with defined actor fields', () => {
      beforeEach(() => {
        bus.subscribe(new DummyActor(10, bus));
        bus.subscribe(new DummyActor(100, bus));
        bus.subscribe(new DummyActor(1, bus));
      });

      it('should mediate to the minimum value for type MIN', async() => {
        await expect(mediatorMin.mediate({ context })).resolves.toEqual({ field: 1 });
      });

      it('should mediate to the maximum value for type MAX', async() => {
        await expect(mediatorMax.mediate({ context })).resolves.toEqual({ field: 100 });
      });
    });

    describe('with undefined actor fields', () => {
      beforeEach(() => {
        bus.subscribe(new DummyActor(undefined, bus));
      });

      it('should mediate to the minimum value for type MIN', async() => {
        await expect(mediatorMin.mediate({ context })).resolves.toEqual({ field: undefined });
      });

      it('should mediate to the maximum value for type MAX', async() => {
        await expect(mediatorMax.mediate({ context })).resolves.toEqual({ field: undefined });
      });
    });

    describe('without actors', () => {
      it('should mediate to the minimum value for type MIN', async() => {
        await expect(mediatorMin.mediate({ context })).rejects
          .toThrow(new Error('No actors are able to reply to a message in the bus bus'));
      });

      it('should mediate to the maximum value for type MAX', async() => {
        await expect(mediatorMax.mediate({ context })).rejects
          .toThrow(new Error('No actors are able to reply to a message in the bus bus'));
      });
    });

    describe('with defined and undefined actor fields', () => {
      beforeEach(() => {
        bus.subscribe(new DummyActor(undefined, bus));
        bus.subscribe(new DummyActor(10, bus));
        bus.subscribe(new DummyActor(undefined, bus));
        bus.subscribe(new DummyActor(100, bus));
        bus.subscribe(new DummyActor(undefined, bus));
        bus.subscribe(new DummyActor(1, bus));
        bus.subscribe(new DummyActor(undefined, bus));
      });

      it('should mediate to the minimum value for type MIN', async() => {
        await expect(mediatorMin.mediate({ context })).resolves.toEqual({ field: 1 });
      });

      it('should mediate to the maximum value for type MAX', async() => {
        await expect(mediatorMax.mediate({ context })).resolves.toEqual({ field: 100 });
      });
    });

    describe('without undefined actor fields', () => {
      beforeEach(() => {
        bus.subscribe(new DummyActorInvalid(1, bus));
        bus.subscribe(new DummyActorInvalid(2, bus));
        bus.subscribe(new DummyActorInvalid(3, bus));
        bus.subscribe(new DummyActorInvalid(4, bus));
      });

      it('should mediate to the first value for type MIN', async() => {
        await expect(mediatorMin.mediate({ context })).resolves.toEqual({ field: 1 });
      });

      it('should mediate to the first value for type MAX', async() => {
        await expect(mediatorMax.mediate({ context })).resolves.toEqual({ field: 1 });
      });
    });

    describe('with actors failing', () => {
      beforeEach(() => {
        mediatorMin = new MediatorNumber({
          bus,
          field: 'field',
          ignoreFailures: true,
          name: 'mediatorMin',
          type: 'min',
        });
        mediatorMax = new MediatorNumber({
          bus,
          field: 'field',
          ignoreFailures: true,
          name: 'mediatorMax',
          type: 'max',
        });
        bus.subscribe(new ErrorDummyActor(undefined, bus));
        bus.subscribe(new DummyActor(100, bus));
        bus.subscribe(new DummyActor(1, bus));
      });

      it('should mediate to the minimum value for type MIN', async() => {
        await expect(mediatorMin.mediate({ context })).resolves.toEqual({ field: 1 });
      });

      it('should mediate to the maximum value for type MAX', async() => {
        await expect(mediatorMax.mediate({ context })).resolves.toEqual({ field: 100 });
      });
    });

    describe('with only an actor failing, where failures are ignored', () => {
      beforeEach(() => {
        mediatorMin = new MediatorNumber({
          bus,
          field: 'field',
          ignoreFailures: true,
          name: 'mediatorMin',
          type: 'min',
        });
        mediatorMax = new MediatorNumber({
          bus,
          field: 'field',
          ignoreFailures: true,
          name: 'mediatorMax',
          type: 'max',
        });
        bus.subscribe(new ErrorDummyActor(undefined, bus));
      });

      it('should not mediate to the minimum value for type MIN', async() => {
        await expect(mediatorMin.mediate({ context })).rejects.toThrow(`BUS FAIL MESSAGE
    Error messages of failing actors:
        abc
        abc`);
      });

      it('should not mediate to the maximum value for type MAX', async() => {
        await expect(mediatorMax.mediate({ context })).rejects.toThrow(`BUS FAIL MESSAGE
    Error messages of failing actors:
        abc
        abc`);
      });
    });

    describe('with only an actor failing, where failures are not ignored', () => {
      beforeEach(() => {
        mediatorMin = new MediatorNumber({
          bus,
          field: 'field',
          ignoreFailures: false,
          name: 'mediatorMin',
          type: 'min',
        });
        mediatorMax = new MediatorNumber({
          bus,
          field: 'field',
          ignoreFailures: false,
          name: 'mediatorMax',
          type: 'max',
        });
        bus.subscribe(new ErrorDummyActor(undefined, bus));
      });

      it('should not mediate to the minimum value for type MIN', async() => {
        await expect(mediatorMin.mediate({ context })).rejects.toThrow(new Error('abc'));
      });

      it('should not mediate to the maximum value for type MAX', async() => {
        await expect(mediatorMax.mediate({ context })).rejects.toThrow(new Error('abc'));
      });
    });
  });
});

class DummyActor extends Actor<IAction, IDummyTest, IDummyTest> {
  public readonly id: number | undefined;

  public constructor(id: number | undefined, bus: Bus<DummyActor, IAction, IDummyTest, IDummyTest>) {
    super({ name: `dummy${id}`, bus, busFailMessage: 'BUS FAIL MESSAGE' });
    this.id = id;
  }

  public async test(): Promise<TestResult<IDummyTest>> {
    return passTest({ field: this.id });
  }

  public async run(): Promise<IDummyTest> {
    return { field: this.id };
  }
}

class DummyActorInvalid extends Actor<IAction, IDummyTest, IDummyTest> {
  public readonly id: number;

  public constructor(id: number, bus: Bus<DummyActor, IAction, IDummyTest, IDummyTest>) {
    super({ name: `dummy${id}`, bus, busFailMessage: 'BUS FAIL MESSAGE' });
    this.id = id;
  }

  public async test(): Promise<TestResult<IDummyTest>> {
    return passTest(<any> {});
  }

  public async run(): Promise<IDummyTest> {
    return { field: this.id };
  }
}

class ErrorDummyActor extends DummyActor {
  public override async test(): Promise<TestResult<IDummyTest>> {
    return failTest('abc');
  }
}

interface IDummyTest extends IActorTest, IActorOutput {
  field: number | undefined;
}
