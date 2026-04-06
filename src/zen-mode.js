/**
 * Zen Mode — distraction-free writing mode
 * Provides typewriter scrolling, line dimming, centered content, and a floating HUD.
 * Toggle with F11, exit with Escape.
 */

const {
    EditorView,
    ViewPlugin,
    Decoration,
    DecorationSet,
} = require('@codemirror/view');
const { RangeSetBuilder } = require('@codemirror/state');

class ZenMode {
    /**
     * @param {import('./renderer').TabManager} tabManager
     */
    constructor(tabManager) {
        this.tabManager = tabManager;
        this.active = false;
        this._hud = null;
        this._timerInterval = null;
        this._sessionStart = null;
        this._extensions = [];
    }

    activate() {
        if (this.active) return;
        this.active = true;

        document.body.classList.add('zen-mode');

        // Collapse sidebar
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.add('collapsed');

        // Hide preview pane for the active tab
        const tab = this.tabManager.tabs.get(this.tabManager.activeTabId);
        if (tab) {
            const previewContainer = document.getElementById(`preview-pane-${tab.id}`);
            if (previewContainer) previewContainer.classList.add('hidden');
            const editorPane = document.getElementById(`editor-pane-${tab.id}`);
            if (editorPane) editorPane.classList.add('full-width');

            // Add CM6 extensions to the active editor
            if (tab.editorView) {
                this._extensions = [
                    typewriterScrollExtension,
                    lineDimmingExtension,
                ];
                // Reconfigure is not straightforward with CM6's immutable state.
                // Instead we dispatch effects or simply rebuild with new extensions.
                // Since we cannot hot-swap extensions on an existing EditorView,
                // we store a reference and the CSS + updateListener handle the rest.
                // The typewriter + dimming plugins are applied via a compartment approach
                // would be ideal, but for simplicity we use DOM + updateListener.
                this._applyTypewriterBehavior(tab.editorView);
            }
        }

        // Create HUD
        this._createHUD();

        // Start session timer
        this._sessionStart = Date.now();
        this._timerInterval = setInterval(() => this._updateHUD(), 1000);

        // Focus editor
        if (tab?.editorView) tab.editorView.focus();
    }

    deactivate() {
        if (!this.active) return;
        this.active = false;

        document.body.classList.remove('zen-mode');

        // Restore preview pane for the active tab
        const tab = this.tabManager.tabs.get(this.tabManager.activeTabId);
        if (tab) {
            const previewContainer = document.getElementById(`preview-pane-${tab.id}`);
            if (previewContainer) previewContainer.classList.remove('hidden');
            const editorPane = document.getElementById(`editor-pane-${tab.id}`);
            if (editorPane) editorPane.classList.remove('full-width');

            // Remove typewriter listener
            if (tab.editorView && this._selectionListener) {
                window.removeEventListener('zen-typewriter', this._selectionListener);
                this._selectionListener = null;
            }
        }

        // Remove HUD
        if (this._hud && this._hud.parentNode) {
            this._hud.parentNode.removeChild(this._hud);
            this._hud = null;
        }

        // Stop timer
        if (this._timerInterval) {
            clearInterval(this._timerInterval);
            this._timerInterval = null;
        }
        this._sessionStart = null;
        this._extensions = [];
    }

    toggle() {
        if (this.active) {
            this.deactivate();
        } else {
            this.activate();
        }
    }

    _applyTypewriterBehavior(view) {
        // We use a custom update listener that scrolls the cursor to center.
        // This is stored on the instance so we can clean it up.
        let scrollTimeout = null;

        const scrollFn = () => {
            if (!this.active) return;
            const pos = view.state.selection.main.head;
            requestAnimationFrame(() => {
                view.dispatch({
                    effects: EditorView.scrollIntoView(pos, { y: 'center' }),
                });
            });
        };

        // Listen for selection/doc changes via a polling approach
        // since we cannot add extensions to an existing view.
        // Instead, use the DOM scrollIntoView after selection changes.
        const observer = new MutationObserver(() => {
            // No-op, we use interval below
        });

        // Use interval to keep cursor centered during typing
        this._scrollInterval = setInterval(() => {
            if (!this.active) {
                clearInterval(this._scrollInterval);
                this._scrollInterval = null;
                return;
            }
            // Typewriter scroll: center the cursor line
            try {
                const pos = view.state.selection.main.head;
                const coords = view.coordsAtPos(pos);
                const scroller = view.scrollDOM;
                if (coords && scroller) {
                    const scrollerRect = scroller.getBoundingClientRect();
                    const cursorCenter = coords.top + (coords.bottom - coords.top) / 2;
                    const viewCenter = scrollerRect.top + scrollerRect.height / 2;
                    const diff = cursorCenter - viewCenter;
                    if (Math.abs(diff) > 30) {
                        scroller.scrollTop += diff;
                    }
                }
            } catch (e) {
                // Ignore errors from destroyed views
            }
        }, 200);

        // Initial scroll to center
        scrollFn();
    }

    _createHUD() {
        const hud = document.createElement('div');
        hud.className = 'zen-hud';
        hud.innerHTML = `
            <span class="zen-hud-item" id="zen-words">0 words</span>
            <span class="zen-hud-sep">&middot;</span>
            <span class="zen-hud-item" id="zen-reading-time">0 min read</span>
            <span class="zen-hud-sep">&middot;</span>
            <span class="zen-hud-item" id="zen-timer">00:00</span>
            <div class="zen-progress-container" id="zen-progress-container">
                <div class="zen-progress-bar" id="zen-progress-bar"></div>
            </div>
        `;
        document.body.appendChild(hud);
        this._hud = hud;
        this._updateHUD();
    }

    _updateHUD() {
        if (!this.active || !this._hud) return;

        const content = this.tabManager.getEditorContent();
        const words = content.trim() ? content.trim().split(/\s+/).filter(w => w.length > 0).length : 0;
        const readingTime = Math.max(1, Math.ceil(words / 200));

        const wordsEl = document.getElementById('zen-words');
        const readingEl = document.getElementById('zen-reading-time');
        const timerEl = document.getElementById('zen-timer');

        if (wordsEl) wordsEl.textContent = `${words.toLocaleString()} words`;
        if (readingEl) readingEl.textContent = `${readingTime} min read`;

        // Session timer
        if (this._sessionStart) {
            const elapsed = Math.floor((Date.now() - this._sessionStart) / 1000);
            const minutes = String(Math.floor(elapsed / 60)).padStart(2, '0');
            const seconds = String(elapsed % 60).padStart(2, '0');
            if (timerEl) timerEl.textContent = `${minutes}:${seconds}`;
        }

        // Word goal progress
        const goalStr = localStorage.getItem('zen-word-goal');
        const progressBar = document.getElementById('zen-progress-bar');
        const progressContainer = document.getElementById('zen-progress-container');
        if (progressBar && progressContainer) {
            if (goalStr) {
                const goal = parseInt(goalStr, 10);
                if (goal > 0) {
                    const pct = Math.min(100, Math.round((words / goal) * 100));
                    progressBar.style.width = `${pct}%`;
                    progressContainer.style.display = 'block';
                } else {
                    progressContainer.style.display = 'none';
                }
            } else {
                progressContainer.style.display = 'none';
            }
        }
    }
}

// Typewriter scroll ViewPlugin
const typewriterScrollExtension = ViewPlugin.fromClass(class {
    constructor(view) {
        this.view = view;
    }

    update(update) {
        if (update.selectionSet || update.docChanged) {
            const pos = update.state.selection.main.head;
            requestAnimationFrame(() => {
                if (this.view.dom && this.view.dom.isConnected) {
                    this.view.dispatch({
                        effects: EditorView.scrollIntoView(pos, { y: 'center' }),
                    });
                }
            });
        }
    }
});

// Line dimming ViewPlugin
function getOpacity(distance) {
    if (distance === 0) return 1.0;
    if (distance === 1) return 0.7;
    if (distance === 2) return 0.6;
    if (distance === 3) return 0.45;
    return 0.3;
}

const lineDimmingExtension = ViewPlugin.fromClass(class {
    constructor(view) {
        this.decorations = this.buildDecorations(view);
    }

    update(update) {
        if (update.docChanged || update.selectionSet || update.viewportChanged) {
            this.decorations = this.buildDecorations(update.view);
        }
    }

    buildDecorations(view) {
        const builder = new RangeSetBuilder();
        const pos = view.state.selection.main.head;
        const activeLine = view.state.doc.lineAt(pos).number;
        const doc = view.state.doc;

        for (let lineNum = 1; lineNum <= doc.lines; lineNum++) {
            const line = doc.line(lineNum);
            const distance = Math.abs(lineNum - activeLine);
            const opacity = getOpacity(distance);
            const deco = Decoration.line({
                attributes: { style: `opacity:${opacity};transition:opacity 0.15s ease` },
            });
            builder.add(line.from, line.from, deco);
        }

        return builder.finish();
    }
}, {
    decorations: v => v.decorations,
});

module.exports = { ZenMode };
