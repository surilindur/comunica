import { Actor, Bus, passTestVoid } from '@comunica/core';
import { ActorAbstractMediaTyped } from '../lib/ActorAbstractMediaTyped';
import '@comunica/utils-jest';

describe('ActorAbstractMediaTyped', () => {
  const bus = new Bus({ name: 'bus' });

  describe('The ActorAbstractMediaTyped module', () => {
    it('should be a function', () => {
      expect(ActorAbstractMediaTyped).toBeInstanceOf(Function);
    });

    it('should be a ActorAbstractMediaTyped constructor', () => {
      expect(new (<any> ActorAbstractMediaTyped)({ bus: new Bus({ name: 'bus' }), name: 'actor' }))
        .toBeInstanceOf(ActorAbstractMediaTyped);
      expect(new (<any> ActorAbstractMediaTyped)({ bus: new Bus({ name: 'bus' }), name: 'actor' }))
        .toBeInstanceOf(Actor);
    });

    it('should not be able to create new ActorAbstractMediaTyped objects without \'new\'', () => {
      expect(() => {
        (<any> ActorAbstractMediaTyped)();
      }).toThrow(`Class constructor ActorAbstractMediaTyped cannot be invoked without 'new'`);
    });
  });

  describe('An ActorAbstractMediaTyped instance', () => {
    const actor = new (<any> ActorAbstractMediaTyped)({ bus, name: 'actor' });

    it('should test for a media type action', async() => {
      actor.testMediaType = () => Promise.resolve(passTestVoid());
      await expect(actor.test({ mediaTypes: true })).resolves.toPassTest({ mediaTypes: true });
    });

    it('should test for a media type format action', async() => {
      actor.testMediaTypeFormats = () => Promise.resolve(passTestVoid());
      await expect(actor.test({ mediaTypeFormats: true })).resolves.toPassTest({ mediaTypeFormats: true });
    });

    it('should test for a handle action', async() => {
      actor.testHandle = () => Promise.resolve(passTestVoid());
      await expect(actor.test({ handle: true, handleMediaType: 'a' })).resolves.toPassTest({ handle: true });
    });

    it('should not test for an invalid action', async() => {
      await expect(actor.test({ invalid: true })).resolves.toFailTest(`Either a handle, mediaTypes or mediaTypeFormats action needs to be provided`);
    });

    it('should run for a media type action', async() => {
      actor.getMediaTypes = () => Promise.resolve(true);
      await expect(actor.run({ mediaTypes: true })).resolves.toBeTruthy();
    });

    it('should run for a media type format action', async() => {
      actor.getMediaTypeFormats = () => Promise.resolve(true);
      await expect(actor.run({ mediaTypeFormats: true })).resolves.toBeTruthy();
    });

    it('should run for a handle action', async() => {
      actor.runHandle = () => Promise.resolve(true);
      await expect(actor.run({ handle: true, handleMediaType: 'a' })).resolves.toBeTruthy();
    });

    it('should not run for an invalid action', async() => {
      await expect(actor.run({ invalid: true })).rejects.toBeTruthy();
    });
  });
});
