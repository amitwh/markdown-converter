const { SprintEngine } = require('../src/plugins/built-in/writing-studio/sprint-engine');

describe('SprintEngine', () => {
  let engine;
  let events;

  beforeEach(() => {
    events = [];
    engine = new SprintEngine({
      onEvent: (name, data) => events.push({ name, data })
    });
  });

  test('starts a sprint with duration and initial word count', () => {
    engine.start(25, 100);
    expect(engine.isActive()).toBe(true);
    expect(engine.getRemaining()).toBeLessThanOrEqual(25 * 60 * 1000);
  });

  test('start throws if sprint already active', () => {
    engine.start(25, 100);
    expect(() => engine.start(10, 50)).toThrow('Sprint already active');
  });

  test('stop calculates WPM from word delta', () => {
    engine.start(25, 100);
    const result = engine.stop(350); // 250 words added
    expect(result.wordDelta).toBe(250);
    expect(engine.isActive()).toBe(false);
  });

  test('stop throws if no active sprint', () => {
    expect(() => engine.stop(100)).toThrow('No active sprint');
  });

  test('tick emits progress event with remaining time', () => {
    engine.start(25, 100);
    engine.tick(200);
    expect(events.length).toBe(1);
    expect(events[0].name).toBe('sprint:tick');
    expect(events[0].data.remaining).toBeDefined();
    expect(events[0].data.elapsed).toBe(200);
  });

  test('tick auto-stops when time expires and emits sprint:complete', () => {
    engine.start(1, 100); // 1 minute
    engine.tick(60 * 1000 + 1); // just past
    expect(events.some(e => e.name === 'sprint:complete')).toBe(true);
    expect(engine.isActive()).toBe(false);
  });

  test('getRemaining returns 0 when no sprint active', () => {
    expect(engine.getRemaining()).toBe(0);
  });

  test('getStats returns elapsed, WPM, wordDelta after stop', () => {
    engine.start(25, 100);
    const result = engine.stop(350);
    expect(result).toHaveProperty('wordDelta', 250);
    expect(result).toHaveProperty('elapsed');
    expect(result).toHaveProperty('wpm');
  });
});
