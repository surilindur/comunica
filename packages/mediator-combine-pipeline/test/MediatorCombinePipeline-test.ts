import type { IAction, IActorOutput, IActorTest, TestResult } from '@comunica/core';
import { failTest, passTest, Actor, Bus, Mediator, ActionContext } from '@comunica/core';
import type { IActionContext } from '@comunica/types';
import { MediatorCombinePipeline } from '../lib/MediatorCombinePipeline';

describe('MediatorCombinePipeline', () => {
  let bus: any;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
  });

  describe('The MediatorCombinePipeline module', () => {
    it('should be a function', () => {
      expect(MediatorCombinePipeline).toBeInstanceOf(Function);
    });

    it('should be a MediatorCombinePipeline constructor', () => {
      expect(new (<any> MediatorCombinePipeline)({ name: 'mediator', bus }))
        .toBeInstanceOf(MediatorCombinePipeline);
      expect(new (<any> MediatorCombinePipeline)({ name: 'mediator', bus }))
        .toBeInstanceOf(Mediator);
    });
  });

  describe('An MediatorCombinePipeline instance', () => {
    let mediator: MediatorCombinePipeline<DummyActor, IDummyAction, IActorTest>;

    beforeEach(() => {
      mediator = new MediatorCombinePipeline(<any> { name: 'mediator', bus });
      new DummyActor(10, bus);
      new DummyActor(100, bus);
      new DummyActor(1, bus);
    });

    it('should throw an error when mediateWith is called', () => {
      expect(() => (<any> mediator).mediateWith({}, [])).toThrow('Method not supported.');
    });

    it('should mediate without changing the context', async() => {
      const context = new ActionContext();
      const result = await mediator.mediate({ field: 1, context });
      expect(result).toEqual({ field: 2_101, context });
    });

    it('should mediate changing the context', async() => {
      new DummyActorContextOutput(1_000, bus);
      const context = new ActionContext({});
      const result = await mediator.mediate({ field: 1, context });
      expect(result).toHaveProperty('context');
      expect(result.context).not.toEqual(context);
      expect(result.context.toJS().id).toBe(1_000);
    });
  });

  describe('An ordered (increasing) MediatorCombinePipeline instance', () => {
    let mediator: MediatorCombinePipeline<DummyConcatActor, IDummyConcatAction, IActorTest>;

    beforeEach(() => {
      mediator = new MediatorCombinePipeline({ name: 'mediator', bus, order: 'increasing' });
      new DummyConcatActor('b', bus, 2);
      new DummyConcatActor('a', bus, 1);
      new DummyConcatActor('c', bus, 3);
    });

    it('should mediate without changing the context', async() => {
      const context = new ActionContext();
      const result = await mediator.mediate({ field: '_', context });
      expect(result).toEqual({ field: '_abc', context });
    });
  });

  describe('An ordered (decreasing) MediatorCombinePipeline instance', () => {
    let mediator: MediatorCombinePipeline<DummyConcatActor, IDummyConcatAction, IActorTest>;

    beforeEach(() => {
      mediator = new MediatorCombinePipeline({ name: 'mediator', bus, order: 'decreasing' });
      new DummyConcatActor('b', bus, 2);
      new DummyConcatActor('a', bus, 1);
      new DummyConcatActor('c', bus, 3);
    });

    it('should mediate without changing the context', async() => {
      const context = new ActionContext();
      const result = await mediator.mediate({ field: '_', context });
      expect(result).toEqual({ field: '_cba', context });
    });
  });

  describe('An ordered (decreasing) MediatorCombinePipeline instance with field', () => {
    let mediator: MediatorCombinePipeline<DummyConcatActor, IDummyConcatAction, IActorTest>;

    beforeEach(() => {
      mediator = new MediatorCombinePipeline({ name: 'mediator', bus, order: 'decreasing', field: 'field' });
      new DummyConcatActor('b', bus, { field: 2 });
      new DummyConcatActor('a', bus, { field: 1 });
      new DummyConcatActor('c', bus, { field: 3 });
    });

    it('should mediate without changing the context', async() => {
      const context = new ActionContext();
      const result = await mediator.mediate({ field: '_', context });
      expect(result).toEqual({ field: '_cba', context });
    });
  });

  describe('An ordered (decreasing) MediatorCombinePipeline instance with invalid bus order', () => {
    let mediator: MediatorCombinePipeline<DummyConcatActor, IDummyConcatAction, IActorTest>;

    beforeEach(() => {
      mediator = new MediatorCombinePipeline({ name: 'mediator', bus, order: 'decreasing' });
      new DummyConcatActor('b', bus, {});
      new DummyConcatActor('a', bus, {});
    });

    it('should mediate without changing the context', async() => {
      const context = new ActionContext();
      await expect(() => mediator.mediate({ field: '_', context })).rejects
        .toThrow('Cannot order elements that are not numbers.');
    });
  });

  describe('An ordered (decreasing) MediatorCombinePipeline instance with invalid bus field order', () => {
    let mediator: MediatorCombinePipeline<DummyConcatActor, IDummyConcatAction, IActorTest>;

    beforeEach(() => {
      mediator = new MediatorCombinePipeline({ name: 'mediator', bus, order: 'decreasing', field: 'field' });
      new DummyConcatActor('b', bus, {});
      new DummyConcatActor('a', bus, {});
    });

    it('should mediate without changing the context', async() => {
      const context = new ActionContext();
      await expect(() => mediator.mediate({ field: '_', context })).rejects
        .toThrow('Cannot order elements that are not numbers.');
    });
  });

  describe('An ordered MediatorCombinePipeline instance  - single actor should still run with bad order', () => {
    let mediator: MediatorCombinePipeline<DummyConcatActor, IDummyConcatAction, IActorTest>;

    beforeEach(() => {
      mediator = new MediatorCombinePipeline({ name: 'mediator', bus, order: 'decreasing', field: 'field' });
      new DummyConcatActor('a', bus, {});
    });

    it('should mediate without changing the context', async() => {
      const context = new ActionContext();
      const result = await mediator.mediate({ field: '_', context });
      expect(result).toEqual({ field: '_a', context });
    });
  });

  describe('An MediatorCombinePipeline instance with erroring actors and filtering disabled', () => {
    let mediator: MediatorCombinePipeline<DummyActor, IDummyAction, IActorTest>;

    beforeEach(() => {
      mediator = new MediatorCombinePipeline({ name: 'mediator', bus });
      new DummyActor(10, bus);
      new DummyActor(100, bus);
      new DummyActor(1, bus);
      new DummyThrowActor(1_000, bus);
    });

    it('should throw an error when mediateWith is called', () => {
      expect(() => (<any> mediator).mediateWith({}, [])).toThrow('Method not supported.');
    });

    it('should throw an error when mediate is called', async() => {
      const context = new ActionContext();
      await expect(() => mediator.mediate({ field: 1, context })).rejects.toThrow('Dummy Error');
    });
  });

  describe('An MediatorCombinePipeline instance with failing actors', () => {
    let mediator: MediatorCombinePipeline<DummyActor, IDummyAction, IActorTest>;

    beforeEach(() => {
      mediator = new MediatorCombinePipeline({ name: 'mediator', bus, filterFailures: true });
      new DummyActor(10, bus);
      new DummyActor(100, bus);
      new DummyActor(1, bus);
      new DummyThrowActor(1_000, bus);
    });

    it('should throw an error when mediateWith is called', () => {
      expect(() => (<any> mediator).mediateWith({}, [])).toThrow('Method not supported.');
    });

    it('should mediate without changing the context', async() => {
      const context = new ActionContext();
      const result = await mediator.mediate({ field: 1, context });
      expect(result).toEqual({ field: 2_101, context });
    });

    it('should mediate changing the context', async() => {
      new DummyActorContextOutput(1_000, bus);
      const context = new ActionContext({});
      const result = await mediator.mediate({ field: 1, context });
      expect(result).toHaveProperty('context');
      expect(result.context).not.toEqual(context);
      expect(result.context.toJS().id).toBe(1_000);
    });
  });

  describe('An MediatorCombinePipeline instance without actors', () => {
    let mediator: MediatorCombinePipeline<DummyActor, IDummyAction, IActorTest>;

    beforeEach(() => {
      mediator = new MediatorCombinePipeline({ name: 'mediator', bus });
    });

    it('should mediate', async() => {
      const context = new ActionContext();
      await expect(mediator.mediate({ field: 1, context })).resolves.toEqual({ field: 1, context });
    });
  });
});

class DummyActor extends Actor<IDummyAction, IActorTest, IDummyOutput> {
  public readonly id: number;
  public readonly testOutput: IActorTest;

  public constructor(
    id: number,
    bus: Bus<DummyActor, IDummyAction, IActorTest, IDummyOutput>,
    testOutput: IActorTest = {},
  ) {
    super({ name: `dummy${id}`, bus, busFailMessage: 'BUS FAIL MESSAGE' });
    this.id = id;
    this.testOutput = testOutput;
  }

  public async test(): Promise<TestResult<IActorTest>> {
    return passTest(this.testOutput ?? true);
  }

  public async run(action: IDummyAction): Promise<IDummyOutput> {
    return { field: action.field * this.id + this.id, context: action.context };
  }
}

class DummyThrowActor extends DummyActor {
  public constructor(
    id: number,
    bus: Bus<DummyActor, IDummyAction, IActorTest, IDummyOutput>,
    testOutput: IActorTest = {},
  ) {
    super(id, bus, testOutput);
  }

  public override async test(): Promise<TestResult<IActorTest>> {
    return failTest('Dummy Error');
  }
}
class DummyConcatActor extends Actor<IDummyConcatAction, IActorTest, IDummyConcatOutput> {
  public readonly id: string;
  public readonly testOutput: IActorTest;

  public constructor(
    id: string,
    bus: Bus<DummyConcatActor, IDummyConcatAction, IActorTest, IDummyConcatOutput>,
    testOutput: IActorTest,
  ) {
    super({ name: `dummy${id}`, bus, busFailMessage: 'BUS FAIL MESSAGE' });
    this.id = id;
    this.testOutput = testOutput;
  }

  public async test(): Promise<TestResult<IActorTest>> {
    return passTest(this.testOutput ?? true);
  }

  public async run(action: IDummyConcatAction): Promise<IDummyConcatOutput> {
    return { field: `${action.field}${this.id}`, context: action.context };
  }
}

class DummyActorContextOutput extends DummyActor {
  public override async run(action: IDummyAction): Promise<IDummyOutput> {
    return {
      ...await super.run(action),
      context: (<ActionContext> action.context).setRaw('id', this.id),
    };
  }
}

interface IDummyAction extends IAction {
  field: number;
}

interface IDummyConcatAction extends IAction {
  field: string;
}

interface IDummyOutput extends IActorOutput {
  field: number;
  context: IActionContext;
}

interface IDummyConcatOutput extends IActorOutput {
  field: string;
  context: IActionContext;
}
