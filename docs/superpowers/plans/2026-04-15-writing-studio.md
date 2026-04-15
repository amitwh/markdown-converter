# Writing Studio Plugin Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Writing Studio plugin that adds manuscript/project management, writing sprints, goal tracking, snapshots, and smart proofreading to MarkdownConverter via the plugin system.

**Architecture:** Writing Studio is a built-in plugin (`src/plugins/built-in/writing-studio/`) that uses the PluginContext API to register sidebar panels, commands, status bar indicators, and settings. Pure logic (sprint engine, goal tracker, snapshot manager) lives in separate modules with zero DOM dependencies — testable in isolation. The plugin's `index.js` wires them together. Proofreading delegates to the AI plugin via the event bus (graceful fallback if AI plugin absent).

**Tech Stack:** Electron, CodeMirror 6 (decorations for proofreading), existing `writing-analytics.js` for readability metrics, Node.js `fs` via IPC for file operations.

**Spec:** `docs/superpowers/specs/2026-04-14-v5-platform-design.md` — Section 2: Writing Studio Plugin

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/plugins/built-in/writing-studio/manifest.json` | Plugin metadata, extension points, settings schema |
| `src/plugins/built-in/writing-studio/index.js` | Plugin entry — extends PluginAPI, wires all components |
| `src/plugins/built-in/writing-studio/sprint-engine.js` | Pure logic: start/stop sprints, calculate WPM, time tracking |
| `src/plugins/built-in/writing-studio/goal-tracker.js` | Pure logic: daily/weekly goals, streaks, history persistence |
| `src/plugins/built-in/writing-studio/snapshot-manager.js` | Pure logic: create/restore/list snapshots, diff generation |
| `src/plugins/built-in/writing-studio/project-manager.js` | Pure logic: create/load/compile manuscript projects |
| `src/plugins/built-in/writing-studio/panels/goals-panel.js` | Sidebar panel: daily progress, streak, heatmap, analytics |
| `src/plugins/built-in/writing-studio/panels/snapshots-panel.js` | Sidebar panel: snapshot list, restore, diff view |
| `src/plugins/built-in/writing-studio/panels/manuscript-panel.js` | Sidebar panel: project tree, chapter list, word counts, compile |
| `src/plugins/built-in/writing-studio/panels/proofread-panel.js` | Sidebar panel: issues list, accept/dismiss, cross-plugin AI call |
| `src/plugins/built-in/writing-studio/styles.css` | Writing studio panel styles (dark mode compatible) |
| `tests/sprint-engine.test.js` | Sprint engine tests |
| `tests/goal-tracker.test.js` | Goal tracker tests |
| `tests/snapshot-manager.test.js` | Snapshot manager tests |
| `tests/project-manager.test.js` | Project manager tests |

**Security note:** Panel render functions use innerHTML for template rendering. All interpolated values come from trusted plugin data (word counts, timestamps, labels) — never raw user content. Snapshot content is never rendered as HTML; it's inserted as plain text via editor APIs.

---

## Chunk 1: Sprint Engine

Pure logic with no DOM dependencies. Manages writing sprint lifecycle.

### Task 1: Sprint Engine

**Files:**
- Create: `src/plugins/built-in/writing-studio/sprint-engine.js`
- Test: `tests/sprint-engine.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/sprint-engine.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/sprint-engine.test.js --verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/plugins/built-in/writing-studio/sprint-engine.js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/sprint-engine.test.js --verbose`
Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/built-in/writing-studio/sprint-engine.js tests/sprint-engine.test.js
git commit -m "feat(writing-studio): add sprint engine with WPM tracking"
```

---

## Chunk 2: Goal Tracker

Pure logic for daily/weekly word goals, streaks, and history persistence.

### Task 2: Goal Tracker

**Files:**
- Create: `src/plugins/built-in/writing-studio/goal-tracker.js`
- Test: `tests/goal-tracker.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/goal-tracker.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/goal-tracker.test.js --verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/plugins/built-in/writing-studio/goal-tracker.js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/goal-tracker.test.js --verbose`
Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/built-in/writing-studio/goal-tracker.js tests/goal-tracker.test.js
git commit -m "feat(writing-studio): add goal tracker with streaks and history"
```

---

## Chunk 3: Snapshot Manager

Pure logic for document snapshots — create, list, restore, diff.

### Task 3: Snapshot Manager

**Files:**
- Create: `src/plugins/built-in/writing-studio/snapshot-manager.js`
- Test: `tests/snapshot-manager.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/snapshot-manager.test.js
const { SnapshotManager } = require('../src/plugins/built-in/writing-studio/snapshot-manager');

describe('SnapshotManager', () => {
  let manager;
  let store;

  beforeEach(() => {
    store = {};
    manager = new SnapshotManager({
      get: (key) => store[key],
      set: (key, value) => { store[key] = value; }
    });
  });

  test('create stores snapshot with timestamp, content, wordCount', () => {
    const snap = manager.create('Hello world this is a test', 'auto');
    expect(snap).toHaveProperty('id');
    expect(snap.content).toBe('Hello world this is a test');
    expect(snap.wordCount).toBe(6);
    expect(snap.label).toBe('auto');
  });

  test('list returns snapshots ordered newest first', () => {
    manager.create('first', 'auto');
    manager.create('second', 'auto');
    const list = manager.list();
    expect(list.length).toBe(2);
    expect(list[0].content).toBe('second');
  });

  test('getById returns specific snapshot', () => {
    const snap = manager.create('find me', 'manual');
    const found = manager.getById(snap.id);
    expect(found.content).toBe('find me');
  });

  test('getById returns null for missing id', () => {
    expect(manager.getById('nope')).toBeNull();
  });

  test('restore returns content of snapshot', () => {
    const snap = manager.create('restore this', 'manual');
    expect(manager.restore(snap.id)).toBe('restore this');
  });

  test('restore throws for missing snapshot', () => {
    expect(() => manager.restore('nope')).toThrow('Snapshot not found');
  });

  test('delete removes a snapshot', () => {
    const snap = manager.create('delete me', 'auto');
    manager.delete(snap.id);
    expect(manager.getById(snap.id)).toBeNull();
  });

  test('diff returns added/removed line counts', () => {
    const snap = manager.create('line one\nline two\nline three', 'auto');
    const result = manager.diff(snap.id, 'line one\nline modified\nline three\nline four');
    expect(result.added).toBe(2);
    expect(result.removed).toBe(1);
  });

  test('diff throws for missing snapshot', () => {
    expect(() => manager.diff('nope', 'new content')).toThrow('Snapshot not found');
  });

  test('prune keeps only the N most recent snapshots', () => {
    for (let i = 0; i < 10; i++) manager.create('snap ' + i, 'auto');
    manager.prune(5);
    expect(manager.list().length).toBe(5);
    expect(manager.list()[0].content).toBe('snap 9');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/snapshot-manager.test.js --verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/plugins/built-in/writing-studio/snapshot-manager.js
class SnapshotManager {
  /**
   * @param {object} store - { get(key), set(key, value) }
   * @param {string} storeKey - settings key for snapshots
   */
  constructor(store, storeKey = 'plugins.writing-studio.snapshots') {
    this.store = store;
    this.storeKey = storeKey;
  }

  _getAll() {
    const raw = this.store.get(this.storeKey);
    return raw ? JSON.parse(raw) : [];
  }

  _saveAll(snaps) {
    this.store.set(this.storeKey, JSON.stringify(snaps));
  }

  create(content, label = 'manual') {
    const snaps = this._getAll();
    const snap = {
      id: 'snap-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      timestamp: new Date().toISOString(),
      content,
      wordCount: content.split(/\s+/).filter(Boolean).length,
      label
    };
    snaps.unshift(snap);
    this._saveAll(snaps);
    return snap;
  }

  list() {
    return this._getAll();
  }

  getById(id) {
    return this._getAll().find(s => s.id === id) || null;
  }

  restore(id) {
    const snap = this.getById(id);
    if (!snap) throw new Error('Snapshot not found');
    return snap.content;
  }

  delete(id) {
    const snaps = this._getAll().filter(s => s.id !== id);
    this._saveAll(snaps);
  }

  diff(id, currentContent) {
    const snap = this.getById(id);
    if (!snap) throw new Error('Snapshot not found');
    const oldLines = snap.content.split('\n');
    const newLines = currentContent.split('\n');
    const oldSet = new Set(oldLines);
    const newSet = new Set(newLines);
    let added = 0;
    let removed = 0;
    for (const line of newLines) { if (!oldSet.has(line)) added++; }
    for (const line of oldLines) { if (!newSet.has(line)) removed++; }
    return { added, removed };
  }

  prune(keepCount) {
    const snaps = this._getAll();
    this._saveAll(snaps.slice(0, keepCount));
  }
}

module.exports = { SnapshotManager };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/snapshot-manager.test.js --verbose`
Expected: 10 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/built-in/writing-studio/snapshot-manager.js tests/snapshot-manager.test.js
git commit -m "feat(writing-studio): add snapshot manager with diff and prune"
```

---

## Chunk 4: Project Manager

Pure logic for manuscript project CRUD — create, load, compile, chapter management.

### Task 4: Project Manager

**Files:**
- Create: `src/plugins/built-in/writing-studio/project-manager.js`
- Test: `tests/project-manager.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/project-manager.test.js
const { ProjectManager } = require('../src/plugins/built-in/writing-studio/project-manager');

describe('ProjectManager', () => {
  let pm;
  let files;

  beforeEach(() => {
    files = {};
    pm = new ProjectManager({
      readFile: (p) => files[p] || null,
      writeFile: (p, c) => { files[p] = c; },
      fileExists: (p) => p in files,
      listDir: (p) => Object.keys(files).filter(f => f.startsWith(p)).map(f => f.slice(p.length + 1))
    });
  });

  test('createProject writes .project.json', () => {
    const project = pm.createProject('/manuscripts/novel', {
      title: 'My Novel', type: 'manuscript', targetWords: 80000
    });
    expect(project.title).toBe('My Novel');
    expect(files['/manuscripts/novel/.project.json']).toBeDefined();
    const parsed = JSON.parse(files['/manuscripts/novel/.project.json']);
    expect(parsed.target.words).toBe(80000);
  });

  test('loadProject reads and returns project data', () => {
    files['/manuscripts/novel/.project.json'] = JSON.stringify({
      title: 'Test', type: 'manuscript', target: { words: 50000 },
      chapters: [], metadata: {}
    });
    const project = pm.loadProject('/manuscripts/novel');
    expect(project.title).toBe('Test');
  });

  test('loadProject returns null if no project file', () => {
    expect(pm.loadProject('/nonexistent')).toBeNull();
  });

  test('addChapter appends chapter and saves', () => {
    files['/manuscripts/novel/.project.json'] = JSON.stringify({
      title: 'Test', type: 'manuscript', target: { words: 50000 },
      chapters: [], metadata: {}
    });
    pm.addChapter('/manuscripts/novel', { file: '01-chapter.md', title: 'Chapter One', status: 'draft' });
    const parsed = JSON.parse(files['/manuscripts/novel/.project.json']);
    expect(parsed.chapters.length).toBe(1);
    expect(parsed.chapters[0].title).toBe('Chapter One');
  });

  test('compileManuscript concatenates chapter files', () => {
    files['/manuscripts/novel/.project.json'] = JSON.stringify({
      title: 'Test', type: 'manuscript', target: { words: 50000 },
      chapters: [
        { file: '01.md', title: 'One', status: 'draft' },
        { file: '02.md', title: 'Two', status: 'draft' }
      ], metadata: {}
    });
    files['/manuscripts/novel/01.md'] = 'First chapter content.';
    files['/manuscripts/novel/02.md'] = 'Second chapter content.';
    const result = pm.compileManuscript('/manuscripts/novel');
    expect(result).toBe('First chapter content.\n\n---\n\nSecond chapter content.');
  });

  test('compileManuscript skips missing files', () => {
    files['/manuscripts/novel/.project.json'] = JSON.stringify({
      title: 'Test', type: 'manuscript', target: { words: 50000 },
      chapters: [
        { file: '01.md', title: 'One', status: 'draft' },
        { file: '02.md', title: 'Two', status: 'draft' }
      ], metadata: {}
    });
    files['/manuscripts/novel/01.md'] = 'Only chapter one.';
    const result = pm.compileManuscript('/manuscripts/novel');
    expect(result).toBe('Only chapter one.');
  });

  test('getStats returns total word count across chapters', () => {
    files['/manuscripts/novel/.project.json'] = JSON.stringify({
      title: 'Test', type: 'manuscript', target: { words: 50000 },
      chapters: [
        { file: '01.md', title: 'One', status: 'draft' },
        { file: '02.md', title: 'Two', status: 'draft' }
      ], metadata: {}
    });
    files['/manuscripts/novel/01.md'] = 'word '.repeat(100).trim();
    files['/manuscripts/novel/02.md'] = 'more '.repeat(50).trim();
    const stats = pm.getStats('/manuscripts/novel');
    expect(stats.totalWords).toBeGreaterThan(0);
    expect(stats.chapterCount).toBe(2);
    expect(stats.targetWords).toBe(50000);
    expect(stats.pctComplete).toBeDefined();
  });

  test('updateChapter modifies a chapter by index', () => {
    files['/manuscripts/novel/.project.json'] = JSON.stringify({
      title: 'Test', type: 'manuscript', target: { words: 50000 },
      chapters: [{ file: '01.md', title: 'Old Title', status: 'draft' }],
      metadata: {}
    });
    pm.updateChapter('/manuscripts/novel', 0, { title: 'New Title', status: 'revised' });
    const parsed = JSON.parse(files['/manuscripts/novel/.project.json']);
    expect(parsed.chapters[0].title).toBe('New Title');
    expect(parsed.chapters[0].status).toBe('revised');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/project-manager.test.js --verbose`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/plugins/built-in/writing-studio/project-manager.js
class ProjectManager {
  /**
   * @param {object} fs - { readFile(path), writeFile(path, content), fileExists(path), listDir(path) }
   */
  constructor(fs) {
    this.fs = fs;
  }

  createProject(dir, opts) {
    const project = {
      title: opts.title,
      type: opts.type || 'manuscript',
      target: { words: opts.targetWords || 0, deadline: opts.deadline || null },
      chapters: [],
      metadata: opts.metadata || {}
    };
    this.fs.writeFile(dir + '/.project.json', JSON.stringify(project, null, 2));
    return project;
  }

  loadProject(dir) {
    const raw = this.fs.readFile(dir + '/.project.json');
    if (!raw) return null;
    return JSON.parse(raw);
  }

  _saveProject(dir, project) {
    this.fs.writeFile(dir + '/.project.json', JSON.stringify(project, null, 2));
  }

  addChapter(dir, chapter) {
    const project = this.loadProject(dir);
    if (!project) throw new Error('Project not found');
    project.chapters.push(chapter);
    this._saveProject(dir, project);
  }

  updateChapter(dir, index, updates) {
    const project = this.loadProject(dir);
    if (!project) throw new Error('Project not found');
    Object.assign(project.chapters[index], updates);
    this._saveProject(dir, project);
  }

  compileManuscript(dir) {
    const project = this.loadProject(dir);
    if (!project) throw new Error('Project not found');
    const parts = [];
    for (const ch of project.chapters) {
      const content = this.fs.readFile(dir + '/' + ch.file);
      if (content) parts.push(content);
    }
    return parts.join('\n\n---\n\n');
  }

  getStats(dir) {
    const project = this.loadProject(dir);
    if (!project) throw new Error('Project not found');
    let totalWords = 0;
    for (const ch of project.chapters) {
      const content = this.fs.readFile(dir + '/' + ch.file);
      if (content) totalWords += content.split(/\s+/).filter(Boolean).length;
    }
    const target = project.target.words || 0;
    return {
      totalWords,
      chapterCount: project.chapters.length,
      targetWords: target,
      pctComplete: target > 0 ? Math.min(100, Math.round((totalWords / target) * 100)) : 0
    };
  }
}

module.exports = { ProjectManager };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/project-manager.test.js --verbose`
Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/built-in/writing-studio/project-manager.js tests/project-manager.test.js
git commit -m "feat(writing-studio): add project manager with compile and stats"
```

---

## Chunk 5: Plugin Manifest + Entry Point

Wire all pure-logic modules into the plugin system.

### Task 5: Plugin Manifest and Entry Point

**Files:**
- Create: `src/plugins/built-in/writing-studio/manifest.json`
- Create: `src/plugins/built-in/writing-studio/index.js`

- [ ] **Step 1: Create manifest.json**

```json
{
  "id": "writing-studio",
  "name": "Writing Studio",
  "version": "1.0.0",
  "description": "Manuscript management, writing sprints, goal tracking, snapshots, and smart proofreading",
  "icon": "pen-tool",
  "extensionPoints": {
    "sidebar": [
      { "id": "manuscript", "title": "Manuscript", "order": 30 },
      { "id": "goals", "title": "Goals", "order": 31 },
      { "id": "snapshots", "title": "Snapshots", "order": 32 },
      { "id": "proofread", "title": "Proofread", "order": 33 }
    ],
    "commands": [
      { "id": "start-sprint", "label": "Studio: Start Sprint", "shortcut": "Ctrl+Alt+S" },
      { "id": "stop-sprint", "label": "Studio: Stop Sprint", "shortcut": "Ctrl+Alt+Shift+S" },
      { "id": "take-snapshot", "label": "Studio: Take Snapshot", "shortcut": "Ctrl+Alt+N" },
      { "id": "restore-last-snapshot", "label": "Studio: Restore Last Snapshot", "shortcut": "Ctrl+Alt+Z" },
      { "id": "new-project", "label": "Studio: New Project", "shortcut": "" },
      { "id": "compile-manuscript", "label": "Studio: Compile Manuscript", "shortcut": "Ctrl+Alt+E" },
      { "id": "proofread-document", "label": "Studio: Proofread Document", "shortcut": "Ctrl+Alt+G" }
    ],
    "statusBar": { "indicators": ["sprint-timer", "word-goal"] }
  },
  "settings": [
    { "key": "dailyGoal", "type": "number", "default": 1000, "label": "Daily word goal" },
    { "key": "sprintDuration", "type": "number", "default": 25, "label": "Sprint duration (min)" },
    { "key": "autoSnapshotInterval", "type": "number", "default": 0, "label": "Auto-snapshot interval (min, 0=off)" },
    { "key": "maxSnapshots", "type": "number", "default": 50, "label": "Max snapshots to keep" }
  ]
}
```

- [ ] **Step 2: Create plugin entry point**

```javascript
// src/plugins/built-in/writing-studio/index.js
const { PluginAPI } = require('../../../plugins/plugin-api');
const { SprintEngine } = require('./sprint-engine');
const { GoalTracker } = require('./goal-tracker');
const { SnapshotManager } = require('./snapshot-manager');
const { ProjectManager } = require('./project-manager');

class WritingStudioPlugin extends PluginAPI {
  init(context) {
    this.context = context;

    this.sprintEngine = new SprintEngine({
      onEvent: (name, data) => context.events.emit(name, data)
    });
    this.goalTracker = new GoalTracker(context.settings);
    this.snapshotManager = new SnapshotManager(context.settings);
    this.projectManager = new ProjectManager({
      readFile: (p) => context.ipc.invoke('read-file', p),
      writeFile: (p, c) => context.ipc.invoke('write-file', p, c),
      fileExists: (p) => context.ipc.invoke('path-exists', p),
      listDir: (p) => context.ipc.invoke('list-directory', p)
    });

    this._engines = {
      sprint: this.sprintEngine,
      goals: this.goalTracker,
      snapshots: this.snapshotManager,
      projects: this.projectManager
    };

    this._registerCommands(context);
    this._registerStatusBar(context);
  }

  _registerCommands(context) {
    const { sprintEngine, snapshotManager, goalTracker } = this;

    context.commands.register('start-sprint', 'Studio: Start Sprint', () => {
      const duration = context.settings.get('sprintDuration') || 25;
      const content = context.editor.getContent() || '';
      const words = content.split(/\s+/).filter(Boolean).length;
      sprintEngine.start(duration, words);
    }, 'Ctrl+Alt+S');

    context.commands.register('stop-sprint', 'Studio: Stop Sprint', () => {
      if (!sprintEngine.isActive()) return;
      const content = context.editor.getContent() || '';
      const words = content.split(/\s+/).filter(Boolean).length;
      const result = sprintEngine.stop(words);
      goalTracker.addWords(result.wordDelta);
      context.events.emit('sprint:stopped', result);
    }, 'Ctrl+Alt+Shift+S');

    context.commands.register('take-snapshot', 'Studio: Take Snapshot', () => {
      const content = context.editor.getContent() || '';
      snapshotManager.create(content, 'manual');
      context.events.emit('snapshot:created', {});
    }, 'Ctrl+Alt+N');

    context.commands.register('restore-last-snapshot', 'Studio: Restore Last Snapshot', () => {
      const snaps = snapshotManager.list();
      if (snaps.length === 0) return;
      const content = snapshotManager.restore(snaps[0].id);
      context.editor.insertAtCursor(content);
    }, 'Ctrl+Alt+Z');

    context.commands.register('new-project', 'Studio: New Project', () => {
      context.events.emit('studio:new-project', {});
    });

    context.commands.register('compile-manuscript', 'Studio: Compile Manuscript', () => {
      context.events.emit('studio:compile', {});
    }, 'Ctrl+Alt+E');

    context.commands.register('proofread-document', 'Studio: Proofread Document', () => {
      if (context.events.hasHandler('ai:analyze')) {
        const content = context.editor.getContent() || '';
        context.events.emit('ai:analyze', { text: content, type: 'grammar' });
      }
    }, 'Ctrl+Alt+G');
  }

  _registerStatusBar(context) {
    context.statusBar.registerIndicator('word-goal', {
      text: '0/1000',
      tooltip: 'Daily word goal progress'
    });
    context.statusBar.registerIndicator('sprint-timer', {
      text: '',
      tooltip: 'Writing sprint timer'
    });
  }

  deactivate() {
    if (this._sprintInterval) clearInterval(this._sprintInterval);
  }

  getEngines() {
    return this._engines;
  }
}

module.exports = { Plugin: WritingStudioPlugin };
```

- [ ] **Step 3: Run all tests to verify nothing broke**

Run: `npx jest --verbose`
Expected: All existing tests + 34 new writing-studio tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/plugins/built-in/writing-studio/manifest.json src/plugins/built-in/writing-studio/index.js
git commit -m "feat(writing-studio): add plugin manifest and entry point"
```

---

## Chunk 6: Sidebar Panels

Four sidebar panels for the Writing Studio. Each panel is a `render(container)` function that builds DOM inside the provided container.

### Task 6: Goals Panel

**Files:**
- Create: `src/plugins/built-in/writing-studio/panels/goals-panel.js`

- [ ] **Step 1: Write the goals panel**

```javascript
// src/plugins/built-in/writing-studio/panels/goals-panel.js
/**
 * Goals sidebar panel — daily progress, streak, weekly total, 30-day chart
 * All interpolated values are from trusted plugin data (numbers, dates).
 */
function renderGoalsPanel(container, { engines, settings }) {
  const dailyGoal = settings.get('dailyGoal') || 1000;
  const progress = engines.goals.getDailyProgress(dailyGoal);
  const streak = engines.goals.getStreak(dailyGoal);
  const weekly = engines.goals.getWeeklyTotal();
  const last30 = engines.goals.getLast30Days();

  container.innerHTML = '';

  const panel = document.createElement('div');
  panel.className = 'ws-panel';

  // Daily progress section
  const section1 = document.createElement('div');
  section1.className = 'ws-section';
  const heading1 = document.createElement('h3');
  heading1.className = 'ws-heading';
  heading1.textContent = 'Daily Progress';
  section1.appendChild(heading1);

  const bar = document.createElement('div');
  bar.className = 'ws-progress-bar';
  const fill = document.createElement('div');
  fill.className = 'ws-progress-fill';
  fill.style.width = progress.pct + '%';
  bar.appendChild(fill);
  section1.appendChild(bar);

  const row = document.createElement('div');
  row.className = 'ws-stat-row';
  const label = document.createElement('span');
  label.textContent = progress.written.toLocaleString() + ' / ' + dailyGoal.toLocaleString() + ' words';
  const pct = document.createElement('span');
  pct.className = 'ws-pct';
  pct.textContent = progress.pct + '%';
  row.appendChild(label);
  row.appendChild(pct);
  section1.appendChild(row);
  panel.appendChild(section1);

  // Stats cards
  const section2 = document.createElement('div');
  section2.className = 'ws-section';
  const grid = document.createElement('div');
  grid.className = 'ws-stat-grid';

  const streakCard = document.createElement('div');
  streakCard.className = 'ws-stat-card';
  const streakVal = document.createElement('span');
  streakVal.className = 'ws-stat-value';
  streakVal.textContent = String(streak);
  const streakLbl = document.createElement('span');
  streakLbl.className = 'ws-stat-label';
  streakLbl.textContent = 'Day Streak';
  streakCard.appendChild(streakVal);
  streakCard.appendChild(streakLbl);

  const weekCard = document.createElement('div');
  weekCard.className = 'ws-stat-card';
  const weekVal = document.createElement('span');
  weekVal.className = 'ws-stat-value';
  weekVal.textContent = weekly.toLocaleString();
  const weekLbl = document.createElement('span');
  weekLbl.className = 'ws-stat-label';
  weekLbl.textContent = 'This Week';
  weekCard.appendChild(weekVal);
  weekCard.appendChild(weekLbl);

  grid.appendChild(streakCard);
  grid.appendChild(weekCard);
  section2.appendChild(grid);
  panel.appendChild(section2);

  // 30-day chart
  const section3 = document.createElement('div');
  section3.className = 'ws-section';
  const heading3 = document.createElement('h3');
  heading3.className = 'ws-heading';
  heading3.textContent = 'Last 30 Days';
  section3.appendChild(heading3);

  const chart = document.createElement('div');
  chart.className = 'ws-chart';
  const maxWords = Math.max(...last30.map(d => d.words), 1);
  for (const day of last30) {
    const barEl = document.createElement('div');
    const height = Math.max(2, (day.words / maxWords) * 60);
    barEl.className = 'ws-bar' + (day.words >= dailyGoal ? ' ws-bar-met' : '');
    barEl.style.height = height + 'px';
    barEl.title = day.date + ': ' + day.words + ' words';
    chart.appendChild(barEl);
  }
  section3.appendChild(chart);
  panel.appendChild(section3);

  container.appendChild(panel);
}

module.exports = { renderGoalsPanel };
```

- [ ] **Step 2: Commit**

```bash
git add src/plugins/built-in/writing-studio/panels/goals-panel.js
git commit -m "feat(writing-studio): add goals sidebar panel with progress and chart"
```

### Task 7: Snapshots Panel

**Files:**
- Create: `src/plugins/built-in/writing-studio/panels/snapshots-panel.js`

- [ ] **Step 1: Write the snapshots panel**

```javascript
// src/plugins/built-in/writing-studio/panels/snapshots-panel.js
/**
 * Snapshots sidebar panel — list, restore, diff, delete
 * Values interpolated into DOM are trusted plugin metadata (timestamps, labels, word counts).
 * Snapshot content is never rendered as HTML.
 */
function renderSnapshotsPanel(container, { engines, editor }) {
  const snapshots = engines.snapshots.list();

  container.innerHTML = '';

  const panel = document.createElement('div');
  panel.className = 'ws-panel';

  // Header with take snapshot button
  const section = document.createElement('div');
  section.className = 'ws-section';
  const btn = document.createElement('button');
  btn.className = 'ws-btn ws-btn-primary';
  btn.id = 'ws-take-snapshot';
  btn.textContent = 'Take Snapshot';
  section.appendChild(btn);
  const count = document.createElement('span');
  count.className = 'ws-muted';
  count.textContent = snapshots.length + ' snapshots';
  section.appendChild(count);
  panel.appendChild(section);

  // Snapshot list
  const list = document.createElement('div');
  list.className = 'ws-snapshot-list';
  for (const s of snapshots) {
    const item = document.createElement('div');
    item.className = 'ws-snapshot-item';

    const header = document.createElement('div');
    header.className = 'ws-snapshot-header';
    const sLabel = document.createElement('span');
    sLabel.className = 'ws-snapshot-label';
    sLabel.textContent = s.label;
    const sWords = document.createElement('span');
    sWords.textContent = s.wordCount + ' words';
    header.appendChild(sLabel);
    header.appendChild(sWords);
    item.appendChild(header);

    const time = document.createElement('div');
    time.className = 'ws-snapshot-time';
    time.textContent = new Date(s.timestamp).toLocaleString();
    item.appendChild(time);

    const actions = document.createElement('div');
    actions.className = 'ws-snapshot-actions';
    for (const [action, text, cls] of [['restore', 'Restore', ''], ['diff', 'Diff', ''], ['delete', 'Delete', 'ws-btn-danger']]) {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'ws-btn ws-btn-sm' + (cls ? ' ' + cls : '');
      actionBtn.textContent = text;
      actionBtn.addEventListener('click', () => {
        if (action === 'restore') {
          const content = engines.snapshots.restore(s.id);
          editor.insertAtCursor(content);
        } else if (action === 'delete') {
          engines.snapshots.delete(s.id);
          renderSnapshotsPanel(container, { engines, editor });
        } else if (action === 'diff') {
          const current = editor.getContent() || '';
          const result = engines.snapshots.diff(s.id, current);
          alert('+' + result.added + ' lines added, -' + result.removed + ' lines removed');
        }
      });
      actions.appendChild(actionBtn);
    }
    item.appendChild(actions);
    list.appendChild(item);
  }
  panel.appendChild(list);
  container.appendChild(panel);

  // Take snapshot button handler
  container.querySelector('#ws-take-snapshot').addEventListener('click', () => {
    const content = editor.getContent() || '';
    engines.snapshots.create(content, 'manual');
    renderSnapshotsPanel(container, { engines, editor });
  });
}

module.exports = { renderSnapshotsPanel };
```

- [ ] **Step 2: Commit**

```bash
git add src/plugins/built-in/writing-studio/panels/snapshots-panel.js
git commit -m "feat(writing-studio): add snapshots sidebar panel"
```

### Task 8: Manuscript Panel

**Files:**
- Create: `src/plugins/built-in/writing-studio/panels/manuscript-panel.js`

- [ ] **Step 1: Write the manuscript panel**

```javascript
// src/plugins/built-in/writing-studio/panels/manuscript-panel.js
/**
 * Manuscript sidebar panel — project tree, chapters, word counts, compile
 */
function renderManuscriptPanel(container, { engines, editor, settings }) {
  const projectDir = settings.get('projectDir');

  container.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'ws-panel';

  if (!projectDir) {
    const empty = document.createElement('div');
    empty.className = 'ws-empty';
    const p = document.createElement('p');
    p.textContent = 'No manuscript project open';
    empty.appendChild(p);
    const btn = document.createElement('button');
    btn.className = 'ws-btn ws-btn-primary';
    btn.id = 'ws-new-project';
    btn.textContent = 'New Project';
    btn.addEventListener('click', () => {
      const name = prompt('Project name:');
      if (!name) return;
      settings.set('projectDir', name);
      renderManuscriptPanel(container, { engines, editor, settings });
    });
    empty.appendChild(btn);
    panel.appendChild(empty);
    container.appendChild(panel);
    return;
  }

  const project = engines.projects.loadProject(projectDir);
  if (!project) {
    const empty = document.createElement('div');
    empty.className = 'ws-empty';
    const p = document.createElement('p');
    p.textContent = 'Project not found at ' + projectDir;
    empty.appendChild(p);
    const btn = document.createElement('button');
    btn.className = 'ws-btn';
    btn.id = 'ws-clear-project';
    btn.textContent = 'Clear Project';
    btn.addEventListener('click', () => {
      settings.set('projectDir', null);
      renderManuscriptPanel(container, { engines, editor, settings });
    });
    empty.appendChild(btn);
    panel.appendChild(empty);
    container.appendChild(panel);
    return;
  }

  const stats = engines.projects.getStats(projectDir);

  // Project title + progress
  const section1 = document.createElement('div');
  section1.className = 'ws-section';
  const heading = document.createElement('h3');
  heading.className = 'ws-heading';
  heading.textContent = project.title;
  section1.appendChild(heading);

  const bar = document.createElement('div');
  bar.className = 'ws-progress-bar';
  const fill = document.createElement('div');
  fill.className = 'ws-progress-fill';
  fill.style.width = stats.pctComplete + '%';
  bar.appendChild(fill);
  section1.appendChild(bar);

  const row = document.createElement('div');
  row.className = 'ws-stat-row';
  const label = document.createElement('span');
  label.textContent = stats.totalWords.toLocaleString() + ' / ' + stats.targetWords.toLocaleString() + ' words';
  const pct = document.createElement('span');
  pct.className = 'ws-pct';
  pct.textContent = stats.pctComplete + '%';
  row.appendChild(label);
  row.appendChild(pct);
  section1.appendChild(row);
  panel.appendChild(section1);

  // Chapters list
  const section2 = document.createElement('div');
  section2.className = 'ws-section';
  const heading2 = document.createElement('h3');
  heading2.className = 'ws-heading';
  heading2.textContent = 'Chapters (' + project.chapters.length + ')';
  section2.appendChild(heading2);

  const chList = document.createElement('div');
  chList.className = 'ws-chapter-list';
  for (const ch of project.chapters) {
    const item = document.createElement('div');
    item.className = 'ws-chapter-item';
    const title = document.createElement('span');
    title.className = 'ws-chapter-title';
    title.textContent = ch.title || ch.file;
    const status = document.createElement('span');
    status.className = 'ws-chapter-status ws-status-' + (ch.status || 'draft');
    status.textContent = ch.status || 'draft';
    item.appendChild(title);
    item.appendChild(status);
    chList.appendChild(item);
  }
  section2.appendChild(chList);
  panel.appendChild(section2);

  // Compile button
  const section3 = document.createElement('div');
  section3.className = 'ws-section';
  const compileBtn = document.createElement('button');
  compileBtn.className = 'ws-btn ws-btn-primary';
  compileBtn.id = 'ws-compile';
  compileBtn.textContent = 'Compile Manuscript';
  compileBtn.addEventListener('click', () => {
    const compiled = engines.projects.compileManuscript(projectDir);
    editor.insertAtCursor(compiled);
  });
  section3.appendChild(compileBtn);
  panel.appendChild(section3);

  container.appendChild(panel);
}

module.exports = { renderManuscriptPanel };
```

- [ ] **Step 2: Commit**

```bash
git add src/plugins/built-in/writing-studio/panels/manuscript-panel.js
git commit -m "feat(writing-studio): add manuscript sidebar panel"
```

### Task 9: Proofread Panel (AI-delegate stub)

**Files:**
- Create: `src/plugins/built-in/writing-studio/panels/proofread-panel.js`

- [ ] **Step 1: Write the proofread panel**

```javascript
// src/plugins/built-in/writing-studio/panels/proofread-panel.js
/**
 * Proofread sidebar panel — grammar/style issues, accept/dismiss
 * Delegates analysis to AI plugin via event bus. Shows "requires AI plugin" if absent.
 */
function renderProofreadPanel(container, { events, editor }) {
  const hasAI = events.hasHandler('ai:analyze');

  container.innerHTML = '';

  const panel = document.createElement('div');
  panel.className = 'ws-panel';

  const section = document.createElement('div');
  section.className = 'ws-section';

  const btn = document.createElement('button');
  btn.className = 'ws-btn ws-btn-primary';
  btn.id = 'ws-proofread';
  btn.textContent = hasAI ? 'Check Document' : 'AI Plugin Required';
  btn.disabled = !hasAI;
  section.appendChild(btn);

  if (!hasAI) {
    const note = document.createElement('p');
    note.className = 'ws-muted';
    note.textContent = 'Install the AI Assistant plugin to enable proofreading.';
    section.appendChild(note);
  }
  panel.appendChild(section);

  const issuesList = document.createElement('div');
  issuesList.className = 'ws-issues-list';
  issuesList.id = 'ws-issues';
  panel.appendChild(issuesList);

  container.appendChild(panel);

  if (!hasAI) return;

  container.querySelector('#ws-proofread').addEventListener('click', () => {
    const content = editor.getContent() || '';
    events.emit('ai:analyze', {
      text: content,
      type: 'grammar',
      callback: (result) => {
        if (result && result.issues) {
          renderIssues(issuesList, result.issues);
        }
      }
    });
  });
}

function renderIssues(container, issues) {
  container.innerHTML = '';
  if (!issues || issues.length === 0) {
    const p = document.createElement('p');
    p.className = 'ws-muted';
    p.textContent = 'No issues found.';
    container.appendChild(p);
    return;
  }
  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    const item = document.createElement('div');
    item.className = 'ws-issue-item';

    const type = document.createElement('div');
    type.className = 'ws-issue-type';
    type.textContent = (issue.type || 'grammar').toUpperCase();
    item.appendChild(type);

    const text = document.createElement('div');
    text.className = 'ws-issue-text';
    text.textContent = issue.message || issue.text || '';
    item.appendChild(text);

    if (issue.suggestion) {
      const sug = document.createElement('div');
      sug.className = 'ws-issue-suggestion';
      sug.textContent = 'Suggestion: ' + issue.suggestion;
      item.appendChild(sug);
    }

    const actions = document.createElement('div');
    actions.className = 'ws-issue-actions';
    for (const [action, label] of [['accept', 'Accept'], ['dismiss', 'Dismiss']]) {
      const actionBtn = document.createElement('button');
      actionBtn.className = 'ws-btn ws-btn-sm';
      actionBtn.textContent = label;
      actionBtn.addEventListener('click', () => {
        item.remove();
      });
      actions.appendChild(actionBtn);
    }
    item.appendChild(actions);
    container.appendChild(item);
  }
}

module.exports = { renderProofreadPanel };
```

- [ ] **Step 2: Commit**

```bash
git add src/plugins/built-in/writing-studio/panels/proofread-panel.js
git commit -m "feat(writing-studio): add proofread sidebar panel with AI fallback"
```

---

## Chunk 7: Wire Panels to Plugin Entry Point + CSS + Icon

Update the plugin `index.js` to register all four sidebar panels, add CSS and sidebar icon.

### Task 10: Register panels, add CSS and sidebar icon

**Files:**
- Modify: `src/plugins/built-in/writing-studio/index.js` — add panel imports and registration
- Create: `src/plugins/built-in/writing-studio/styles.css` — writing studio panel styles
- Modify: `src/index.html` — add sidebar icon + CSS link

- [ ] **Step 1: Add panel imports and _registerPanels to index.js**

Add requires at top of index.js:

```javascript
const { renderGoalsPanel } = require('./panels/goals-panel');
const { renderSnapshotsPanel } = require('./panels/snapshots-panel');
const { renderManuscriptPanel } = require('./panels/manuscript-panel');
const { renderProofreadPanel } = require('./panels/proofread-panel');
```

Add `_registerPanels` method and call it from `init()` after `_registerStatusBar(context)`:

```javascript
_registerPanels(context) {
  const engines = this._engines;

  context.sidebar.registerPanel('manuscript', {
    title: 'Manuscript',
    render: (container) => renderManuscriptPanel(container, {
      engines, editor: context.editor, settings: context.settings
    })
  });

  context.sidebar.registerPanel('goals', {
    title: 'Goals',
    render: (container) => renderGoalsPanel(container, { engines, settings: context.settings })
  });

  context.sidebar.registerPanel('snapshots', {
    title: 'Snapshots',
    render: (container) => renderSnapshotsPanel(container, { engines, editor: context.editor })
  });

  context.sidebar.registerPanel('proofread', {
    title: 'Proofread',
    render: (container) => renderProofreadPanel(container, {
      events: context.events, editor: context.editor
    })
  });
}
```

- [ ] **Step 2: Create Writing Studio CSS**

Create `src/plugins/built-in/writing-studio/styles.css`:

```css
/* Writing Studio Panel Styles — ConcreteInfo Design System compatible */
.ws-panel { padding: 12px; }
.ws-heading { font-size: 13px; font-weight: 600; margin: 0 0 8px; }
.ws-section { margin-bottom: 16px; }
.ws-muted { color: var(--text-muted, #9a9696); font-size: 12px; }

.ws-progress-bar {
  height: 8px; background: var(--bg-200, #e3e3e3); border-radius: 4px;
  overflow: hidden; margin: 6px 0;
}
.ws-progress-fill {
  height: 100%; background: #e5461f; border-radius: 4px; transition: width 0.3s ease;
}
.ws-stat-row { display: flex; justify-content: space-between; font-size: 12px; }
.ws-pct { font-weight: 600; color: #e5461f; }

.ws-stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.ws-stat-card {
  background: var(--bg-100, #f5f5f5); padding: 10px; border-radius: 8px; text-align: center;
}
.ws-stat-value { display: block; font-size: 20px; font-weight: 700; color: #e5461f; }
.ws-stat-label { display: block; font-size: 11px; color: var(--text-muted, #9a9696); margin-top: 2px; }

/* 30-day chart */
.ws-chart { display: flex; align-items: flex-end; gap: 2px; height: 64px; overflow: hidden; }
.ws-bar { flex: 1; min-width: 4px; background: var(--bg-300, #d1d1d1); border-radius: 2px 2px 0 0; }
.ws-bar-met { background: #e5461f; }

/* Snapshot list */
.ws-snapshot-item {
  padding: 8px; border-bottom: 1px solid var(--bg-200, #e3e3e3);
}
.ws-snapshot-header { display: flex; justify-content: space-between; font-size: 12px; }
.ws-snapshot-label { font-weight: 600; }
.ws-snapshot-time { font-size: 11px; color: var(--text-muted, #9a9696); }
.ws-snapshot-actions { margin-top: 4px; display: flex; gap: 4px; }

/* Chapter list */
.ws-chapter-item {
  display: flex; justify-content: space-between; padding: 6px 8px; font-size: 12px;
  border-bottom: 1px solid var(--bg-200, #e3e3e3);
}
.ws-chapter-status { font-size: 11px; padding: 1px 6px; border-radius: 4px; }
.ws-status-draft { background: var(--bg-200, #e3e3e3); }
.ws-status-revised { background: #fef3c7; color: #92400e; }
.ws-status-final { background: #d1fae5; color: #065f46; }

/* Issue list */
.ws-issue-item { padding: 8px; border-bottom: 1px solid var(--bg-200, #e3e3e3); }
.ws-issue-type { font-size: 11px; font-weight: 600; color: #e5461f; text-transform: uppercase; }
.ws-issue-text { font-size: 12px; margin: 4px 0; }
.ws-issue-suggestion { font-size: 12px; color: #10b981; font-style: italic; }
.ws-issue-actions { margin-top: 4px; display: flex; gap: 4px; }

/* Buttons */
.ws-btn {
  padding: 6px 12px; border: 1px solid var(--bg-300, #d1d1d1); border-radius: 4px;
  background: var(--bg-100, #f5f5f5); cursor: pointer; font-size: 12px;
}
.ws-btn:hover { background: var(--bg-200, #e3e3e3); }
.ws-btn-primary { background: #e5461f; color: white; border-color: #e5461f; }
.ws-btn-primary:hover { background: #c93a18; }
.ws-btn-sm { padding: 3px 8px; font-size: 11px; }
.ws-btn-danger { color: #dc2626; }
.ws-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Empty state */
.ws-empty { text-align: center; padding: 24px; color: var(--text-muted, #9a9696); }

/* Dark mode */
.dark .ws-stat-card { background: var(--bg-900, #464646); }
.dark .ws-btn {
  background: var(--bg-800, #4e4e4e); border-color: var(--bg-700, #5a5858);
  color: var(--text-100, #fafbfc);
}
```

- [ ] **Step 3: Add sidebar icon and CSS link in index.html**

In `src/index.html`, add after the outline sidebar-icon button (after its closing `</button>`):

```html
<button class="sidebar-icon" data-panel="writing-studio:manuscript" title="Writing Studio">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
</button>
```

In `src/index.html`, add after existing stylesheet links in `<head>`:

```html
<link rel="stylesheet" href="plugins/built-in/writing-studio/styles.css">
```

- [ ] **Step 4: Run all tests**

Run: `npx jest --verbose`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/built-in/writing-studio/ src/index.html
git commit -m "feat(writing-studio): wire panels, add CSS and sidebar icon"
```

---

## Chunk 8: Sprint Timer UI + Status Bar Live Updates

Wire the sprint timer to update the status bar indicator in real-time.

### Task 11: Sprint timer interval and status bar updates

**Files:**
- Modify: `src/plugins/built-in/writing-studio/index.js` — replace `_registerStatusBar` with timer version

- [ ] **Step 1: Update _registerStatusBar with live timer**

Replace the existing `_registerStatusBar` method in `index.js` with:

```javascript
_registerStatusBar(context) {
  const goalEl = document.getElementById('plugin-status-writing-studio:word-goal');
  const sprintEl = document.getElementById('plugin-status-writing-studio:sprint-timer');
  const dailyGoal = context.settings.get('dailyGoal') || 1000;

  const updateGoalIndicator = () => {
    const progress = this.goalTracker.getDailyProgress(dailyGoal);
    if (goalEl) {
      goalEl.textContent = progress.written + '/' + dailyGoal;
      goalEl.title = 'Daily goal: ' + progress.pct + '%';
    }
  };

  context.editor.onContentChanged(() => updateGoalIndicator());
  updateGoalIndicator();

  // Sprint timer: poll every second
  this._sprintInterval = setInterval(() => {
    if (!this.sprintEngine.isActive()) {
      if (sprintEl) sprintEl.textContent = '';
      return;
    }
    const remaining = this.sprintEngine.getRemaining();
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    if (sprintEl) {
      sprintEl.textContent = 'Sprint ' + mins + ':' + String(secs).padStart(2, '0');
    }
    const elapsed = Date.now() - this.sprintEngine._startTime;
    this.sprintEngine.tick(elapsed);
  }, 1000);

  context.events.on('sprint:stopped', () => {
    if (sprintEl) sprintEl.textContent = '';
    updateGoalIndicator();
  });

  context.events.on('sprint:complete', () => {
    if (sprintEl) sprintEl.textContent = 'Sprint complete!';
  });
}
```

The existing `deactivate()` already clears `this._sprintInterval`.

- [ ] **Step 2: Run all tests**

Run: `npx jest --verbose`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/plugins/built-in/writing-studio/index.js
git commit -m "feat(writing-studio): wire sprint timer to status bar with live updates"
```

---

## Chunk 9: Final Integration Verification

### Task 12: Full test suite + lint + smoke test

- [ ] **Step 1: Run full test suite**

Run: `npx jest --verbose`
Expected: All tests PASS (143 existing + 34 new = 177 total)

- [ ] **Step 2: Run ESLint on new files**

Run: `npx eslint src/plugins/built-in/writing-studio/ tests/sprint-engine.test.js tests/goal-tracker.test.js tests/snapshot-manager.test.js tests/project-manager.test.js`
Expected: 0 errors

- [ ] **Step 3: Smoke test the app**

Run: `npm start`
Verify:
- App starts without errors in DevTools console
- Writing Studio icon appears in sidebar
- Clicking the icon opens the Manuscript panel (empty state)
- Status bar shows word goal indicator (e.g. `0/1000`)
- `Ctrl+Alt+N` works (check DevTools console for snapshot log)

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(writing-studio): integration fixes from smoke test"
```
