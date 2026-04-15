const { GoalTracker } = require('../src/plugins/built-in/writing-studio/goal-tracker');

describe('GoalTracker', () => {
  let tracker;
  let store;

  beforeEach(() => {
    store = {};
    tracker = new GoalTracker({
      get: (key) => store[key],
      set: (key, value) => { store[key] = value; }
    });
  });

  test('addWords records words for today', () => {
    tracker.addWords(500);
    const today = new Date().toISOString().split('T')[0];
    expect(store['plugins.writing-studio.history']).toBeDefined();
    const history = JSON.parse(store['plugins.writing-studio.history']);
    expect(history[today].words).toBe(500);
  });

  test('addWords accumulates across multiple calls', () => {
    tracker.addWords(300);
    tracker.addWords(200);
    const today = new Date().toISOString().split('T')[0];
    const history = JSON.parse(store['plugins.writing-studio.history']);
    expect(history[today].words).toBe(500);
  });

  test('getDailyProgress returns 0 when no history', () => {
    expect(tracker.getDailyProgress(1000)).toEqual({ written: 0, goal: 1000, pct: 0 });
  });

  test('getDailyProgress returns percentage', () => {
    tracker.addWords(500);
    const progress = tracker.getDailyProgress(1000);
    expect(progress.written).toBe(500);
    expect(progress.pct).toBe(50);
  });

  test('getStreak counts consecutive days meeting goal', () => {
    const today = new Date();
    for (let i = 0; i < 3; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      tracker._setHistoryDay(key, { words: 1200 });
    }
    const streak = tracker.getStreak(1000);
    expect(streak).toBe(3);
  });

  test('getStreak breaks on missed day', () => {
    const today = new Date();
    tracker._setHistoryDay(today.toISOString().split('T')[0], { words: 1200 });
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    tracker._setHistoryDay(yesterday.toISOString().split('T')[0], { words: 500 });
    const dayBefore = new Date(today);
    dayBefore.setDate(dayBefore.getDate() - 2);
    tracker._setHistoryDay(dayBefore.toISOString().split('T')[0], { words: 1200 });
    expect(tracker.getStreak(1000)).toBe(1);
  });

  test('getLast30Days returns array of 30 entries', () => {
    tracker.addWords(100);
    const days = tracker.getLast30Days();
    expect(days.length).toBe(30);
    expect(days[29].words).toBe(100);
  });

  test('getWeeklyTotal sums last 7 days', () => {
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      tracker._setHistoryDay(d.toISOString().split('T')[0], { words: 200 });
    }
    expect(tracker.getWeeklyTotal()).toBe(1400);
  });
});
