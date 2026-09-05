const { GoalTracker } = require('../src/plugins/built-in/writing-studio/goal-tracker');

// All GoalTracker methods are async (the real settings backend is the
// IPC-backed SettingsStore; these tests inject a synchronous fake, which
// `await` handles transparently).
describe('GoalTracker', () => {
  let tracker;
  let store;

  beforeEach(() => {
    store = {};
    tracker = new GoalTracker({
      get: (key) => store[key],
      set: (key, value) => {
        store[key] = value;
      },
    });
  });

  test('addWords records words for today', async () => {
    await tracker.addWords(500);
    const today = new Date().toISOString().split('T')[0];
    expect(store['plugins.writing-studio.history']).toBeDefined();
    const history = JSON.parse(store['plugins.writing-studio.history']);
    expect(history[today].words).toBe(500);
  });

  test('addWords accumulates across multiple calls', async () => {
    await tracker.addWords(300);
    await tracker.addWords(200);
    const today = new Date().toISOString().split('T')[0];
    const history = JSON.parse(store['plugins.writing-studio.history']);
    expect(history[today].words).toBe(500);
  });

  test('works with a Promise-returning (IPC-style) backend', async () => {
    const asyncTracker = new GoalTracker({
      get: async (key) => store[key],
      set: async (key, value) => {
        store[key] = value;
      },
    });
    await asyncTracker.addWords(250);
    await expect(asyncTracker.getDailyProgress(1000)).resolves.toEqual({
      written: 250,
      goal: 1000,
      pct: 25,
    });
  });

  test('getDailyProgress returns 0 when no history', async () => {
    await expect(tracker.getDailyProgress(1000)).resolves.toEqual({
      written: 0,
      goal: 1000,
      pct: 0,
    });
  });

  test('getDailyProgress returns percentage', async () => {
    await tracker.addWords(500);
    const progress = await tracker.getDailyProgress(1000);
    expect(progress.written).toBe(500);
    expect(progress.pct).toBe(50);
  });

  test('getStreak counts consecutive days meeting goal', async () => {
    const today = new Date();
    for (let i = 0; i < 3; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      await tracker._setHistoryDay(key, { words: 1200 });
    }
    await expect(tracker.getStreak(1000)).resolves.toBe(3);
  });

  test('getStreak breaks on missed day', async () => {
    const today = new Date();
    await tracker._setHistoryDay(today.toISOString().split('T')[0], { words: 1200 });
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    await tracker._setHistoryDay(yesterday.toISOString().split('T')[0], { words: 500 });
    const dayBefore = new Date(today);
    dayBefore.setDate(dayBefore.getDate() - 2);
    await tracker._setHistoryDay(dayBefore.toISOString().split('T')[0], { words: 1200 });
    await expect(tracker.getStreak(1000)).resolves.toBe(1);
  });

  test('getLast30Days returns array of 30 entries', async () => {
    await tracker.addWords(100);
    const days = await tracker.getLast30Days();
    expect(days.length).toBe(30);
    expect(days[29].words).toBe(100);
  });

  test('getWeeklyTotal sums last 7 days', async () => {
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      await tracker._setHistoryDay(d.toISOString().split('T')[0], { words: 200 });
    }
    await expect(tracker.getWeeklyTotal()).resolves.toBe(1400);
  });
});
