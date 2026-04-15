const HISTORY_KEY = 'plugins.writing-studio.history';

class GoalTracker {
  /**
   * @param {object} store - { get(key), set(key, value) } settings backend
   */
  constructor(store) {
    this.store = store;
  }

  _getHistory() {
    const raw = this.store.get(HISTORY_KEY);
    return raw ? JSON.parse(raw) : {};
  }

  _setHistory(history) {
    this.store.set(HISTORY_KEY, JSON.stringify(history));
  }

  _setHistoryDay(dateStr, data) {
    const history = this._getHistory();
    history[dateStr] = data;
    this._setHistory(history);
  }

  addWords(count) {
    const today = new Date().toISOString().split('T')[0];
    const history = this._getHistory();
    if (!history[today]) {
      history[today] = { words: 0, sessions: 0 };
    }
    history[today].words += count;
    history[today].sessions += 1;
    this._setHistory(history);
  }

  getDailyProgress(goal) {
    const today = new Date().toISOString().split('T')[0];
    const history = this._getHistory();
    const written = history[today]?.words || 0;
    return { written, goal, pct: goal > 0 ? Math.min(100, Math.round((written / goal) * 100)) : 0 };
  }

  getStreak(goal) {
    const history = this._getHistory();
    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 365; i++) {
      const key = d.toISOString().split('T')[0];
      const day = history[key];
      if (day && day.words >= goal) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  getLast30Days() {
    const history = this._getHistory();
    const days = [];
    const d = new Date();
    for (let i = 0; i < 30; i++) {
      const key = d.toISOString().split('T')[0];
      const day = history[key];
      days.push({ date: key, words: day?.words || 0 });
      d.setDate(d.getDate() - 1);
    }
    return days.reverse();
  }

  getWeeklyTotal() {
    const history = this._getHistory();
    let total = 0;
    const d = new Date();
    for (let i = 0; i < 7; i++) {
      const key = d.toISOString().split('T')[0];
      if (history[key]) total += history[key].words || 0;
      d.setDate(d.getDate() - 1);
    }
    return total;
  }
}

module.exports = { GoalTracker };
