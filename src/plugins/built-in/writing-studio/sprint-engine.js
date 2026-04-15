class SprintEngine {
  /**
   * @param {object} opts
   * @param {function} opts.onEvent - callback(event_name, data)
   */
  constructor(opts = {}) {
    this.onEvent = opts.onEvent || (() => {});
    this._active = false;
    this._startTime = null;
    this._duration = 0;
    this._initialWords = 0;
  }

  start(durationMinutes, currentWordCount) {
    if (this._active) throw new Error('Sprint already active');
    this._active = true;
    this._startTime = Date.now();
    this._duration = durationMinutes * 60 * 1000;
    this._initialWords = currentWordCount;
  }

  stop(currentWordCount) {
    if (!this._active) throw new Error('No active sprint');
    const elapsed = Date.now() - this._startTime;
    const wordDelta = Math.max(0, currentWordCount - this._initialWords);
    const elapsedMinutes = elapsed / 60000;
    const wpm = elapsedMinutes > 0 ? Math.round(wordDelta / elapsedMinutes) : 0;
    this._active = false;
    this._startTime = null;
    return { wordDelta, elapsed, wpm };
  }

  tick(elapsedMs) {
    if (!this._active) return;
    const remaining = Math.max(0, this._duration - elapsedMs);
    this.onEvent('sprint:tick', { remaining, elapsed: elapsedMs });
    if (remaining <= 0) {
      this._active = false;
      this.onEvent('sprint:complete', { expired: true });
    }
  }

  isActive() { return this._active; }

  getRemaining() {
    if (!this._active) return 0;
    return Math.max(0, this._duration - (Date.now() - this._startTime));
  }
}

module.exports = { SprintEngine };
