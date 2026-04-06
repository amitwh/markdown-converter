# Writer's Studio Feature Pack — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Zen Mode, Document Outline, and Writing Analytics to MarkdownConverter v4.2.0.

**Architecture:** Three independent feature modules that integrate into the existing sidebar, modal, command palette, and CodeMirror 6 infrastructure. Each feature is self-contained in its own file with minimal modifications to existing code.

**Tech Stack:** CodeMirror 6 (ViewPlugin, Decoration, scrollIntoView), existing SidebarManager/ModalManager APIs, pure JS math for analytics.

---

## Task 1: Document Outline Panel

**Files:**
- Create: `src/sidebar/outline-panel.js`
- Modify: `src/renderer.js` (lazy loader + panel registration + command palette + keyboard shortcut)
- Modify: `src/index.html` (sidebar icon button)

### Step 1: Create outline panel module

Create `src/sidebar/outline-panel.js`:

```javascript
/**
 * Document Outline Sidebar Panel
 * Shows heading hierarchy parsed from active markdown document.
 */

function renderOutlinePanel(container, { getEditorContent, onHeadingClick, getActiveLine }) {
    container.innerHTML = `
        <div class="outline-panel">
            <div class="outline-list" id="outline-list"></div>
            <div class="outline-footer" id="outline-footer"></div>
        </div>
    `;

    let headings = [];
    let activeHeadingIndex = -1;
    let debounceTimer = null;

    function parseHeadings(content) {
        const lines = content.split('\n');
        const result = [];
        for (let i = 0; i < lines.length; i++) {
            const match = lines[i].match(/^(#{1,6})\s+(.+)$/);
            if (match) {
                result.push({
                    level: match[1].length,
                    text: match[2].replace(/[*_`~\[\]()#]/g, '').trim(),
                    line: i + 1 // 1-based line number
                });
            }
        }
        return result;
    }

    function renderOutline() {
        const list = document.getElementById('outline-list');
        const footer = document.getElementById('outline-footer');
        if (!list) return;

        if (headings.length === 0) {
            list.innerHTML = `
                <div class="outline-empty">
                    <p>No headings found</p>
                    <p class="outline-hint">Use # to create headings</p>
                </div>
            `;
            footer.textContent = '';
            return;
        }

        list.innerHTML = headings.map((h, i) => `
            <div class="outline-item outline-level-${h.level} ${i === activeHeadingIndex ? 'active' : ''}"
                 data-index="${i}" data-line="${h.line}" title="${h.text}">
                <span class="outline-text">${h.text}</span>
                <span class="outline-badge">H${h.level}</span>
            </div>
        `).join('');

        // Click handlers
        list.querySelectorAll('.outline-item').forEach(item => {
            item.addEventListener('click', () => {
                const line = parseInt(item.dataset.line);
                onHeadingClick(line);
            });
        });

        // Footer summary
        const counts = {};
        headings.forEach(h => { counts[h.level] = (counts[h.level] || 0) + 1; });
        const summary = Object.entries(counts)
            .sort((a, b) => a[0] - b[0])
            .map(([level, count]) => `${count} H${level}`)
            .join(' \u2022 ');
        footer.textContent = `${headings.length} headings \u2022 ${summary}`;
    }

    function setActiveHeading(cursorLine) {
        let newIndex = -1;
        for (let i = headings.length - 1; i >= 0; i--) {
            if (headings[i].line <= cursorLine) {
                newIndex = i;
                break;
            }
        }
        if (newIndex !== activeHeadingIndex) {
            activeHeadingIndex = newIndex;
            renderOutline();
        }
    }

    function refresh() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const content = getEditorContent();
            headings = parseHeadings(content);
            if (typeof getActiveLine === 'function') {
                setActiveHeading(getActiveLine());
            }
            renderOutline();
        }, 300);
    }

    // Public refresh for external callers
    container._refreshOutline = refresh;
    container._setActiveHeading = setActiveHeading;

    // Initial render
    refresh();

    return { refresh, setActiveHeading };
}

module.exports = { renderOutlinePanel };
```

### Step 2: Add lazy loader in renderer.js

**File:** `src/renderer.js`
**Location:** After line 22 (after `getRenderSnippetsPanel` declaration), add:

```javascript
let _renderOutlinePanel;
function getRenderOutlinePanel() { if (!_renderOutlinePanel) _renderOutlinePanel = require('./sidebar/outline-panel').renderOutlinePanel; return _renderOutlinePanel; }
```

### Step 3: Add sidebar icon in index.html

**File:** `src/index.html`
**Location:** After line 1439 (after the templates `</button>`), before `</div>` on line 1440, add:

```html
                    <button class="sidebar-icon" data-panel="outline" title="Outline (Ctrl+Shift+O)">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="8" y1="6" x2="21" y2="6"/>
                            <line x1="8" y1="12" x2="21" y2="12"/>
                            <line x1="8" y1="18" x2="21" y2="18"/>
                            <line x1="3" y1="6" x2="3.01" y2="6"/>
                            <line x1="3" y1="12" x2="3.01" y2="12"/>
                            <line x1="3" y1="18" x2="3.01" y2="18"/>
                        </svg>
                    </button>
```

### Step 4: Register outline panel in renderer.js

**File:** `src/renderer.js`
**Location:** After line 1468 (after templates panel registration), add:

```javascript
    // Outline panel — refreshes on editor content change
    let outlinePanelContainer = null;
    sidebarManager.registerPanel('outline', {
        title: 'Outline',
        render: (container) => {
            outlinePanelContainer = container;
            getRenderOutlinePanel()(container, {
                getEditorContent: () => tabManager.getEditorContent(),
                getActiveLine: () => {
                    const tab = tabManager.tabs.get(tabManager.activeTabId);
                    if (tab?.editorView) {
                        const pos = tab.editorView.state.selection.main.head;
                        return tab.editorView.state.doc.lineAt(pos).number;
                    }
                    return 1;
                },
                onHeadingClick: (line) => {
                    const tab = tabManager.tabs.get(tabManager.activeTabId);
                    if (tab?.editorView) {
                        const pos = tab.editorView.state.doc.line(line).from;
                        tab.editorView.dispatch({
                            selection: { anchor: pos },
                            scrollIntoView: true
                        });
                        tab.editorView.focus();
                    }
                }
            });
        }
    });
```

### Step 5: Wire outline refresh to editor content changes

**File:** `src/renderer.js`
**Location:** In the `onChange` callback inside `createNewTab()` and the initial editor setup.

Find the `onChange` callback in `createNewTab` (around line 417) and add at the end of the callback:
```javascript
// Refresh outline panel if visible
if (outlinePanelContainer?._refreshOutline) outlinePanelContainer._refreshOutline();
```

Also add to the initial editor `onChange` (around line 1641):
```javascript
if (outlinePanelContainer?._refreshOutline) outlinePanelContainer._refreshOutline();
```

Similarly, in the `onUpdate` callbacks, add:
```javascript
if (outlinePanelContainer?._setActiveHeading) outlinePanelContainer._setActiveHeading(view.state.doc.lineAt(view.state.selection.main.head).number);
```

### Step 6: Add command palette entry + keyboard shortcut

**File:** `src/renderer.js`
**Location:** After line 1603 (after templates command), add:

```javascript
    commandPalette.register('Toggle Sidebar: Outline', 'Ctrl+Shift+O', () => sidebarManager.togglePanel('outline'));
```

### Step 7: Add outline panel CSS

**File:** `src/styles-sidebar.css`
**Location:** End of file, add:

```css
/* Outline Panel */
.outline-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.outline-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
}

.outline-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 12px;
    cursor: pointer;
    font-size: 13px;
    color: var(--text-secondary, #6b7280);
    transition: background 0.15s, color 0.15s;
    border-left: 2px solid transparent;
}

.outline-item:hover {
    background: var(--bg-tertiary, #f3f4f6);
    color: var(--text-primary, #1f2937);
}

.outline-item.active {
    color: var(--accent-blue, #3b82f6);
    background: rgba(59, 130, 246, 0.08);
    border-left-color: var(--accent-blue, #3b82f6);
    font-weight: 600;
}

.outline-level-1 { padding-left: 12px; }
.outline-level-2 { padding-left: 24px; }
.outline-level-3 { padding-left: 36px; }
.outline-level-4 { padding-left: 48px; }
.outline-level-5 { padding-left: 56px; }
.outline-level-6 { padding-left: 64px; }

.outline-text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.outline-badge {
    font-size: 10px;
    opacity: 0.5;
    margin-left: 8px;
    flex-shrink: 0;
}

.outline-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px 16px;
    color: var(--text-muted, #9ca3af);
    text-align: center;
}

.outline-empty p { margin: 4px 0; }

.outline-hint {
    font-family: monospace;
    font-size: 12px;
    opacity: 0.7;
}

.outline-footer {
    padding: 8px 12px;
    border-top: 1px solid var(--border-color, #e5e7eb);
    font-size: 11px;
    color: var(--text-muted, #9ca3af);
}
```

### Step 8: Commit

```bash
git add src/sidebar/outline-panel.js src/renderer.js src/index.html src/styles-sidebar.css
git commit -m "feat: add document outline sidebar panel with heading navigation"
```

---

## Task 2: Zen Mode

**Files:**
- Create: `src/zen-mode.js`
- Create: `src/styles-zen.css`
- Modify: `src/renderer.js` (lazy loader + init + shortcuts + command palette)
- Modify: `src/index.html` (add CSS link)
- Modify: `src/editor/codemirror-setup.js` (export typewriter + dimming extensions)

### Step 1: Create CodeMirror extensions in codemirror-setup.js

**File:** `src/editor/codemirror-setup.js`
**Location:** Before the `createEditor` function (around line 55), add:

```javascript
const { ViewPlugin, Decoration, EditorView: EV } = require('@codemirror/view');
const { RangeSetBuilder } = require('@codemirror/state');

/**
 * Typewriter scrolling — keeps the cursor line vertically centered.
 */
function typewriterScrollExtension() {
  return ViewPlugin.fromClass(class {
    update(update) {
      if (update.selectionSet || update.docChanged) {
        const pos = update.state.selection.main.head;
        requestAnimationFrame(() => {
          update.view.dispatch({
            effects: EV.scrollIntoView(pos, { y: 'center' })
          });
        });
      }
    }
  });
}

/**
 * Line dimming — fades lines away from the active cursor line.
 */
function lineDimmingExtension() {
  return ViewPlugin.fromClass(class {
    constructor(view) { this.decorations = this.buildDimming(view); }

    update(update) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = this.buildDimming(update.view);
      }
    }

    buildDimming(view) {
      const builder = new RangeSetBuilder();
      const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number;
      for (let i = 1; i <= view.state.doc.lines; i++) {
        const distance = Math.abs(i - cursorLine);
        let opacity = 1;
        if (distance === 1) opacity = 0.7;
        else if (distance === 2) opacity = 0.6;
        else if (distance === 3) opacity = 0.45;
        else if (distance >= 4) opacity = 0.3;
        const line = view.state.doc.line(i);
        builder.add(line.from, line.from, Decoration.line({ attributes: { style: `opacity:${opacity}` } }));
      }
      return builder.finish();
    }
  }, { decorations: v => v.decorations });
}

module.exports = {
  createEditor,
  getLanguageExtension,
  typewriterScrollExtension,
  lineDimmingExtension
};
```

**Also update the existing `module.exports`** at the end of the file to include the new exports.

### Step 2: Create Zen Mode module

Create `src/zen-mode.js`:

```javascript
/**
 * Zen Mode — distraction-free writing environment.
 * Toggles with F11. Escape to exit.
 */
const { typewriterScrollExtension, lineDimmingExtension } = require('./editor/codemirror-setup');

class ZenMode {
    constructor(tabManager) {
        this.tabManager = tabManager;
        this.active = false;
        this.previousState = {};
        this.sessionStart = null;
        this.timerInterval = null;
        this.typewriterExt = null;
        this.dimmingExt = null;
        this.hud = null;
        this.wordGoal = parseInt(localStorage.getItem('zen-word-goal')) || 0;
    }

    toggle() {
        if (this.active) {
            this.deactivate();
        } else {
            this.activate();
        }
    }

    activate() {
        if (this.active) return;
        this.active = true;
        document.body.classList.add('zen-mode');

        // Save visibility state
        this.previousState = {
            header: document.getElementById('app-header')?.style.display,
            tabBar: document.getElementById('tab-bar')?.style.display,
            toolbar: document.querySelector('.toolbar')?.style.display,
            sidebar: document.getElementById('sidebar')?.className,
            statusBar: document.querySelector('.status-bar')?.style.display,
            preview: document.getElementById('preview-container-1')?.style.display,
        };

        // Hide UI chrome
        const elements = ['app-header', 'tab-bar'];
        elements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        const toolbar = document.querySelector('.toolbar');
        if (toolbar) toolbar.style.display = 'none';
        const statusBar = document.querySelector('.status-bar');
        if (statusBar) statusBar.style.display = 'none';
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.add('collapsed');

        // Hide preview pane — editor takes full width
        const tab = this.tabManager.tabs.get(this.tabManager.activeTabId);
        if (tab) {
            const preview = document.getElementById(`preview-container-${tab.id}`);
            if (preview) preview.style.display = 'none';
        }

        // Add CodeMirror extensions for typewriter + dimming
        if (tab?.editorView) {
            this.typewriterExt = typewriterScrollExtension();
            this.dimmingExt = lineDimmingExtension();
            // Reconfigure with additional extensions
            const { EditorView } = require('@codemirror/view');
            const { Compartment } = require('@codemirror/state');
            if (!this._zenCompartment) {
                this._zenCompartment = new Compartment();
            }
            tab.editorView.dispatch({
                effects: this._zenCompartment.reconfigure([
                    this.typewriterExt,
                    this.dimmingExt,
                ])
            });
        }

        // Start session timer
        this.sessionStart = Date.now();

        // Create floating HUD
        this.createHUD();

        // Focus editor
        if (tab?.editorView) tab.editorView.focus();
    }

    deactivate() {
        if (!this.active) return;
        this.active = false;
        document.body.classList.remove('zen-mode');

        // Restore UI chrome
        const header = document.getElementById('app-header');
        if (header) header.style.display = this.previousState.header || '';
        const tabBar = document.getElementById('tab-bar');
        if (tabBar) tabBar.style.display = this.previousState.tabBar || '';
        const toolbar = document.querySelector('.toolbar');
        if (toolbar) toolbar.style.display = this.previousState.toolbar || '';
        const statusBar = document.querySelector('.status-bar');
        if (statusBar) statusBar.style.display = this.previousState.statusBar || '';

        // Restore preview
        const tab = this.tabManager.tabs.get(this.tabManager.activeTabId);
        if (tab) {
            const preview = document.getElementById(`preview-container-${tab.id}`);
            if (preview) preview.style.display = this.previousState.preview || '';
        }

        // Remove CM6 extensions
        if (tab?.editorView && this._zenCompartment) {
            tab.editorView.dispatch({
                effects: this._zenCompartment.reconfigure([])
            });
        }

        // Remove HUD
        this.removeHUD();

        // Stop timer
        clearInterval(this.timerInterval);
        this.timerInterval = null;
        this.sessionStart = null;
    }

    createHUD() {
        this.removeHUD();
        const hud = document.createElement('div');
        hud.className = 'zen-hud';
        hud.id = 'zen-hud';
        document.body.appendChild(hud);
        this.hud = hud;
        this.updateHUD();

        this.timerInterval = setInterval(() => this.updateHUD(), 1000);
    }

    removeHUD() {
        if (this.hud) {
            this.hud.remove();
            this.hud = null;
        }
    }

    updateHUD() {
        if (!this.hud) return;

        const content = this.tabManager.getEditorContent();
        const words = content.trim().split(/\s+/).filter(w => w.length > 0).length;
        const readMin = Math.ceil(words / 200);

        let sessionStr = '';
        if (this.sessionStart) {
            const elapsed = Math.floor((Date.now() - this.sessionStart) / 1000);
            const m = Math.floor(elapsed / 60);
            const s = elapsed % 60;
            sessionStr = `${m}:${s.toString().padStart(2, '0')}`;
        }

        let goalHtml = '';
        if (this.wordGoal > 0) {
            const pct = Math.min(100, Math.round((words / this.wordGoal) * 100));
            goalHtml = `
                <div class="zen-progress">
                    <div class="zen-progress-bar" style="width:${pct}%"></div>
                    <span class="zen-progress-text">${words}/${this.wordGoal} (${pct}%)</span>
                </div>
            `;
        }

        this.hud.innerHTML = `
            <div class="zen-hud-stats">
                <span>${words} words</span>
                <span class="zen-hud-sep">\u2022</span>
                <span>~${readMin} min read</span>
                <span class="zen-hud-sep">\u2022</span>
                <span>${sessionStr} session</span>
            </div>
            ${goalHtml}
        `;
    }
}

module.exports = { ZenMode };
```

### Step 3: Create Zen Mode CSS

Create `src/styles-zen.css`:

```css
/* Zen Mode — Distraction-free writing */

/* Hide chrome elements */
body.zen-mode .app-header,
body.zen-mode .tab-bar,
body.zen-mode .toolbar,
body.zen-mode .status-bar,
body.zen-mode .sidebar {
    display: none !important;
}

/* Editor takes full viewport */
body.zen-mode .main-content {
    display: flex;
    flex-direction: column;
    height: 100vh;
}

body.zen-mode .editor-preview-container {
    flex: 1;
}

body.zen-mode .editor-container {
    width: 100% !important;
}

body.zen-mode .preview-container {
    display: none !important;
}

/* Center content, larger font */
body.zen-mode .cm-content {
    max-width: 700px;
    margin: 0 auto;
    font-size: 18px;
    line-height: 1.8;
    padding: 0 24px;
}

body.zen-mode .cm-scroller {
    overflow-y: auto;
}

/* Subtle background */
body.zen-mode .cm-editor {
    background: transparent;
}

/* Floating HUD */
.zen-hud {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: rgba(255, 255, 255, 0.8);
    padding: 10px 24px;
    border-radius: 24px;
    font-size: 13px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    z-index: 9999;
    pointer-events: none;
    transition: opacity 0.3s ease;
}

body:not(.zen-mode) .zen-hud {
    display: none;
}

.zen-hud-stats {
    display: flex;
    align-items: center;
    gap: 8px;
    white-space: nowrap;
}

.zen-hud-sep {
    opacity: 0.4;
}

/* Progress bar */
.zen-progress {
    margin-top: 8px;
    position: relative;
    height: 4px;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 2px;
    overflow: hidden;
}

.zen-progress-bar {
    height: 100%;
    background: rgba(255, 255, 255, 0.5);
    border-radius: 2px;
    transition: width 0.3s ease;
}

.zen-progress-text {
    position: absolute;
    right: 0;
    top: -16px;
    font-size: 10px;
    opacity: 0.6;
}

/* Dark mode adjustments */
body.zen-mode.dark .zen-hud,
body.zen-mode[class*="dark"] .zen-hud {
    background: rgba(0, 0, 0, 0.7);
}
```

### Step 4: Add CSS link in index.html

**File:** `src/index.html`
**Location:** After line 18 (after `styles-welcome.css` link), add:

```html
    <link rel="stylesheet" href="styles-zen.css">
```

### Step 5: Add lazy loader + init + shortcuts in renderer.js

**File:** `src/renderer.js`

**After the lazy loaders (line 22):**
```javascript
let _ZenMode;
function getZenMode() { if (!_ZenMode) _ZenMode = require('./zen-mode').ZenMode; return _ZenMode; }
```

**After sidebar + modal initialization (around line 1468):**
```javascript
    // Zen Mode
    const ZenModeClass = getZenMode();
    const zenMode = new ZenModeClass(tabManager);
```

**After command palette registrations (around line 1603):**
```javascript
    commandPalette.register('Toggle Zen Mode', 'F11', () => zenMode.toggle());
    commandPalette.register('Writing Analytics', 'Ctrl+Shift+A', () => { /* will be added in Task 3 */ });
```

**In the keyboard event listener (around line 1627, after Ctrl+Shift+P handler):**
```javascript
        // F11 — Zen Mode
        if (e.key === 'F11') {
            e.preventDefault();
            zenMode.toggle();
        }
        // Ctrl+Shift+A — Writing Analytics (placeholder)
        if (e.ctrlKey && e.shiftKey && e.key === 'A') {
            e.preventDefault();
            // Will be wired in Task 3
        }
        // Escape — Exit Zen Mode
        if (e.key === 'Escape' && zenMode.active) {
            zenMode.deactivate();
        }
```

### Step 6: Commit

```bash
git add src/zen-mode.js src/styles-zen.css src/editor/codemirror-setup.js src/renderer.js src/index.html
git commit -m "feat: add Zen Mode with typewriter scrolling and line dimming"
```

---

## Task 3: Writing Analytics

**Files:**
- Create: `src/analytics/writing-analytics.js`
- Create: `src/analytics/analytics-panel.js`
- Modify: `src/renderer.js` (wire analytics to shortcut + command palette)

### Step 1: Create analytics engine

Create `src/analytics/writing-analytics.js`:

```javascript
/**
 * Writing Analytics Engine
 * Computes readability, structure, and vocabulary metrics from text.
 */

const STOP_WORDS = new Set([
    'the','a','an','is','are','was','were','be','been','being','have','has','had',
    'do','does','did','will','would','could','should','may','might','shall','can',
    'to','of','in','for','on','with','at','by','from','as','into','through','during',
    'before','after','above','below','between','out','off','over','under','again',
    'further','then','once','here','there','when','where','why','how','all','each',
    'every','both','few','more','most','other','some','such','no','nor','not','only',
    'own','same','so','than','too','very','just','because','but','and','or','if',
    'while','about','up','it','its','this','that','these','those','i','me','my',
    'we','our','you','your','he','him','his','she','her','they','them','their','what',
    'which','who','whom','also'
]);

function countSyllables(word) {
    word = word.toLowerCase().replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    const matches = word.match(/[aeiouy]{1,2}/gi);
    return matches ? Math.max(1, matches.length) : 1;
}

function getWords(text) {
    return text.match(/[a-zA-Z]+(?:['-][a-zA-Z]+)*/g) || [];
}

function getSentences(text) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    return sentences.length || 1;
}

function getParagraphs(text) {
    return text.split(/\n\s*\n/).filter(p => p.trim().length > 0).length || 1;
}

/**
 * Analyze text and return comprehensive writing metrics.
 * @param {string} text - The document text to analyze
 * @returns {Object} Analytics object
 */
function analyze(text) {
    if (!text || text.trim().length === 0) {
        return emptyMetrics();
    }

    const words = getWords(text);
    const wordCount = words.length || 1;
    const sentenceCount = getSentences(text);
    const paragraphCount = getParagraphs(text);

    // Syllable counting
    let totalSyllables = 0;
    const syllableMap = {};
    words.forEach(w => {
        const s = countSyllables(w);
        totalSyllables += s;
        syllableMap[w.toLowerCase()] = s;
    });

    // Readability
    const fleschEase = 206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (totalSyllables / wordCount);
    const fleschGrade = 0.39 * (wordCount / sentenceCount) + 11.8 * (totalSyllables / wordCount) - 15.59;

    // Vocabulary
    const uniqueWords = new Set(words.map(w => w.toLowerCase()));
    const lexicalDiversity = uniqueWords.size / wordCount;

    // Word frequency (excluding stop words)
    const freq = {};
    words.forEach(w => {
        const lower = w.toLowerCase();
        if (!STOP_WORDS.has(lower) && lower.length > 1) {
            freq[lower] = (freq[lower] || 0) + 1;
        }
    });
    const topWords = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    // Sentence lengths
    const sentenceTexts = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const sentenceLengths = sentenceTexts.map(s => s.trim().split(/\s+/).filter(w => w.length > 0).length);
    const avgSentenceLength = sentenceLengths.length > 0
        ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length
        : 0;
    const longestSentence = sentenceTexts.reduce((a, b) => a.length >= b.length ? a : b, '').trim();

    // Timing
    const readingTime = Math.ceil(wordCount / 200);
    const speakingTime = Math.ceil(wordCount / 130);

    return {
        wordCount,
        sentenceCount,
        paragraphCount,
        totalSyllables,
        fleschEase: Math.round(fleschEase * 10) / 10,
        fleschGrade: Math.round(fleschGrade * 10) / 10,
        readabilityLabel: getReadabilityLabel(fleschEase),
        readingTime,
        speakingTime,
        uniqueWordCount: uniqueWords.size,
        lexicalDiversity: Math.round(lexicalDiversity * 1000) / 10,
        avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
        longestSentence: longestSentence.substring(0, 80) + (longestSentence.length > 80 ? '...' : ''),
        longestSentenceLength: longestSentence.split(/\s+/).filter(w => w.length > 0).length,
        topWords,
    };
}

function getReadabilityLabel(score) {
    if (score >= 90) return 'Very Easy';
    if (score >= 70) return 'Easy';
    if (score >= 50) return 'Standard';
    if (score >= 30) return 'Difficult';
    return 'Very Difficult';
}

function emptyMetrics() {
    return {
        wordCount: 0, sentenceCount: 0, paragraphCount: 0, totalSyllables: 0,
        fleschEase: 0, fleschGrade: 0, readabilityLabel: 'N/A',
        readingTime: 0, speakingTime: 0,
        uniqueWordCount: 0, lexicalDiversity: 0,
        avgSentenceLength: 0, longestSentence: '', longestSentenceLength: 0,
        topWords: [],
    };
}

module.exports = { analyze };
```

### Step 2: Create analytics panel UI

Create `src/analytics/analytics-panel.js`:

```javascript
/**
 * Writing Analytics Panel UI
 * Renders analytics dashboard as a modal overlay.
 */
const { analyze } = require('./writing-analytics');

function showAnalyticsModal(tabManager) {
    // Remove existing if open
    document.getElementById('analytics-modal')?.remove();

    const content = tabManager.getEditorContent();
    const metrics = analyze(content);

    const overlay = document.createElement('div');
    overlay.id = 'analytics-modal';
    overlay.className = 'analytics-overlay';
    overlay.innerHTML = `
        <div class="analytics-modal">
            <div class="analytics-header">
                <h2>Writing Analytics</h2>
                <button class="analytics-close" id="analytics-close" title="Close">&times;</button>
            </div>
            <div class="analytics-body">

                <div class="analytics-section">
                    <h3>Readability</h3>
                    <div class="analytics-row">
                        <span class="analytics-label">Flesch Reading Ease</span>
                        <span class="analytics-value">${metrics.fleschEase} <small>${metrics.readabilityLabel}</small></span>
                    </div>
                    <div class="analytics-row">
                        <span class="analytics-label">Grade Level</span>
                        <span class="analytics-value">${metrics.fleschGrade}</span>
                    </div>
                    <div class="readability-meter">
                        <div class="readability-fill" style="width:${Math.max(0, Math.min(100, metrics.fleschEase))}%"></div>
                    </div>
                </div>

                <div class="analytics-section">
                    <h3>Timing</h3>
                    <div class="analytics-row">
                        <span class="analytics-label">Reading Time</span>
                        <span class="analytics-value">~${metrics.readingTime} min</span>
                    </div>
                    <div class="analytics-row">
                        <span class="analytics-label">Speaking Time</span>
                        <span class="analytics-value">~${metrics.speakingTime} min</span>
                    </div>
                </div>

                <div class="analytics-section">
                    <h3>Structure</h3>
                    <div class="analytics-row">
                        <span class="analytics-label">Sentences</span>
                        <span class="analytics-value">${metrics.sentenceCount}</span>
                    </div>
                    <div class="analytics-row">
                        <span class="analytics-label">Paragraphs</span>
                        <span class="analytics-value">${metrics.paragraphCount}</span>
                    </div>
                    <div class="analytics-row">
                        <span class="analytics-label">Avg Sentence Length</span>
                        <span class="analytics-value">${metrics.avgSentenceLength} words</span>
                    </div>
                    ${metrics.longestSentence ? `
                    <div class="analytics-row analytics-longest">
                        <span class="analytics-label">Longest (${metrics.longestSentenceLength} words)</span>
                        <span class="analytics-value analytics-sentence-preview">"${metrics.longestSentence}"</span>
                    </div>
                    ` : ''}
                </div>

                <div class="analytics-section">
                    <h3>Vocabulary</h3>
                    <div class="analytics-row">
                        <span class="analytics-label">Unique Words</span>
                        <span class="analytics-value">${metrics.uniqueWordCount} / ${metrics.wordCount} (${metrics.lexicalDiversity}%)</span>
                    </div>
                    ${metrics.topWords.length > 0 ? `
                    <div class="word-cloud">
                        ${metrics.topWords.map(([word, count]) =>
                            `<span class="word-tag" style="font-size:${Math.min(20, 11 + count)}px">${word} <small>${count}</small></span>`
                        ).join('')}
                    </div>
                    ` : ''}
                </div>

            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Close handlers
    document.getElementById('analytics-close')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
    document.addEventListener('keydown', function handler(e) {
        if (e.key === 'Escape') {
            overlay.remove();
            document.removeEventListener('keydown', handler);
        }
    });
}

module.exports = { showAnalyticsModal };
```

### Step 3: Add analytics CSS

**File:** `src/styles-modern.css`
**Location:** End of file, add:

```css
/* Writing Analytics Modal */
.analytics-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    animation: fadeIn 0.2s ease;
}

.analytics-modal {
    background: var(--bg-primary, #fff);
    border-radius: 12px;
    width: 520px;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    animation: slideUp 0.3s ease;
}

.analytics-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.analytics-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
}

.analytics-close {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: var(--text-muted);
    padding: 4px 8px;
    border-radius: 4px;
}

.analytics-close:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
}

.analytics-body {
    padding: 16px 24px 24px;
}

.analytics-section {
    margin-bottom: 20px;
}

.analytics-section h3 {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-muted, #9ca3af);
    margin: 0 0 10px 0;
}

.analytics-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 6px 0;
    font-size: 14px;
}

.analytics-label {
    color: var(--text-secondary, #6b7280);
}

.analytics-value {
    font-weight: 500;
    color: var(--text-primary);
}

.analytics-value small {
    color: var(--text-muted);
    font-weight: 400;
    margin-left: 6px;
}

.analytics-longest {
    flex-direction: column;
    gap: 4px;
}

.analytics-sentence-preview {
    font-style: italic;
    font-size: 13px;
    color: var(--text-secondary);
    font-weight: 400;
}

.readability-meter {
    height: 4px;
    background: var(--bg-tertiary, #f3f4f6);
    border-radius: 2px;
    margin-top: 8px;
    overflow: hidden;
}

.readability-fill {
    height: 100%;
    background: linear-gradient(90deg, #ef4444, #f59e0b, #10b981);
    border-radius: 2px;
    transition: width 0.5s ease;
}

.word-cloud {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
}

.word-tag {
    background: var(--bg-tertiary, #f3f4f6);
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 13px;
    color: var(--text-secondary);
}

.word-tag small {
    opacity: 0.5;
    font-size: 10px;
    margin-left: 2px;
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes slideUp {
    from { transform: translateY(16px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
}

/* Dark mode analytics */
body[class*="dark"] .analytics-modal {
    background: var(--gray-800, #1f2937);
}

body[class*="dark"] .word-tag {
    background: var(--gray-700, #374151);
}
```

### Step 4: Wire analytics to renderer.js

**File:** `src/renderer.js`

**After lazy loaders (after ZenMode loader):**
```javascript
let _showAnalyticsModal;
function getShowAnalyticsModal() { if (!_showAnalyticsModal) _showAnalyticsModal = require('./analytics/analytics-panel').showAnalyticsModal; return _showAnalyticsModal; }
```

**Update the Ctrl+Shift+A keyboard shortcut (from Task 2 Step 5):**
Replace the placeholder with:
```javascript
        if (e.ctrlKey && e.shiftKey && e.key === 'A') {
            e.preventDefault();
            getShowAnalyticsModal()(tabManager);
        }
```

**Update the command palette entry (from Task 2 Step 5):**
Replace the placeholder with:
```javascript
    commandPalette.register('Writing Analytics', 'Ctrl+Shift+A', () => getShowAnalyticsModal()(tabManager));
```

### Step 5: Commit

```bash
git add src/analytics/writing-analytics.js src/analytics/analytics-panel.js src/renderer.js src/styles-modern.css
git commit -m "feat: add writing analytics with readability scores and vocabulary analysis"
```

---

## Task 4: Integration Testing & Final Polish

### Step 1: Test Document Outline

Manual test:
1. Open app with `npm start`
2. Open a markdown file with headings
3. Click the outline icon in sidebar
4. Verify heading tree appears with correct indentation
5. Click a heading — verify editor scrolls to it
6. Type in editor — verify outline updates
7. Move cursor — verify current heading highlights

### Step 2: Test Zen Mode

Manual test:
1. Press F11 — verify all chrome hides
2. Verify typewriter scrolling (cursor stays centered)
3. Verify line dimming (surrounding lines fade)
4. Verify floating HUD shows word count + timer
5. Press Escape — verify all chrome restores
6. Verify preview pane returns

### Step 3: Test Writing Analytics

Manual test:
1. Press Ctrl+Shift+A — verify analytics modal opens
2. Verify readability scores appear
3. Verify timing estimates are reasonable
4. Verify vocabulary section shows top words
5. Click backdrop — verify modal closes
6. Press Escape — verify modal closes

### Step 4: Test keyboard shortcuts

- F11: Toggle zen mode
- Escape: Exit zen mode
- Ctrl+Shift+O: Toggle outline panel
- Ctrl+Shift+A: Open analytics
- Ctrl+Shift+P: Command palette (existing — verify still works)

### Step 5: Update version + commit

Update `package.json` version to `4.2.0`.
Update `src/index.html` version badge to `v4.2.0`.

```bash
git add package.json src/index.html
git commit -m "chore: bump to v4.2.0 — Writer's Studio Feature Pack"
```

---

## Summary

| Task | Feature | New Files | Modified Files |
|------|---------|-----------|----------------|
| 1 | Document Outline | `src/sidebar/outline-panel.js` | `renderer.js`, `index.html`, `styles-sidebar.css` |
| 2 | Zen Mode | `src/zen-mode.js`, `src/styles-zen.css` | `codemirror-setup.js`, `renderer.js`, `index.html` |
| 3 | Writing Analytics | `src/analytics/writing-analytics.js`, `src/analytics/analytics-panel.js` | `renderer.js`, `styles-modern.css` |
| 4 | Integration & Polish | — | `package.json`, `index.html` |
