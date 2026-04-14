const { EventBus } = require('../src/plugins/event-bus');

describe('EventBus', () => {
  let bus;

  beforeEach(() => {
    bus = new EventBus();
  });

  test('on/emit — listener receives payload', () => {
    const received = [];
    bus.on('document:saved', (payload) => received.push(payload));
    bus.emit('document:saved', { filePath: '/test.md', tabId: 'tab1' });
    expect(received).toEqual([{ filePath: '/test.md', tabId: 'tab1' }]);
  });

  test('on — ignores events with no listeners', () => {
    expect(() => bus.emit('unknown:event', {})).not.toThrow();
  });

  test('off — removes specific listener', () => {
    const handler = jest.fn();
    bus.on('test:event', handler);
    bus.off('test:event', handler);
    bus.emit('test:event', {});
    expect(handler).not.toHaveBeenCalled();
  });

  test('off — removes all listeners for event when no handler given', () => {
    const h1 = jest.fn();
    const h2 = jest.fn();
    bus.on('test:event', h1);
    bus.on('test:event', h2);
    bus.off('test:event');
    bus.emit('test:event', {});
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });

  test('hasHandler — returns true when listener exists', () => {
    bus.on('ai:analyze', () => {});
    expect(bus.hasHandler('ai:analyze')).toBe(true);
  });

  test('hasHandler — returns false when no listener exists', () => {
    expect(bus.hasHandler('ai:analyze')).toBe(false);
  });

  test('handler errors are caught and logged, not thrown', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    bus.on('bad:event', () => { throw new Error('boom'); });
    expect(() => bus.emit('bad:event', {})).not.toThrow();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('multiple listeners all receive the event', () => {
    const results = [];
    bus.on('multi:event', () => results.push('a'));
    bus.on('multi:event', () => results.push('b'));
    bus.emit('multi:event', {});
    expect(results).toEqual(['a', 'b']);
  });
});
