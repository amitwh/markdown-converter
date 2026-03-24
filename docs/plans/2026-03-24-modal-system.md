# Modal System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace existing dialog implementations with a unified modal system providing glassmorphism backdrop, full accessibility, and smooth animations.

**Architecture:** Single `ModalManager` class manages all modals with focus trap, keyboard handling, and dynamic backdrop. All 10 dialogs convert to unified HTML structure with new CSS classes.

**Tech Stack:** Vanilla JavaScript, CSS custom properties (design tokens), no external dependencies

---

## Task 1: Create ModalManager Class

**Files:**
- Create: `src/utils/ModalManager.js`

**Step 1: Create utils directory and ModalManager class**

```javascript
/**
 * ModalManager - Unified modal system with accessibility support
 * @version 4.0.0
 */
export class ModalManager {
    #modal;
    #backdrop;
    #options;
    #lastFocusedElement;
    #focusableElements;
    #eventListeners;
    #isOpen;

    static #openModals = [];

    constructor(element, options = {}) {
        this.#modal = typeof element === 'string' ? document.querySelector(element) : element;
        this.#options = {
            closeOnBackdrop: true,
            closeOnEscape: true,
            focusFirst: true,
            onOpen: null,
            onClose: null,
            ...options
        };
        this.#isOpen = false;
        this.#eventListeners = [];
        this.#init();
    }

    #init() {
        // Ensure modal has required attributes
        if (!this.#modal.hasAttribute('role')) {
            this.#modal.setAttribute('role', 'dialog');
        }
        if (!this.#modal.hasAttribute('aria-modal')) {
            this.#modal.setAttribute('aria-modal', 'true');
        }

        // Find or create backdrop
        this.#backdrop = this.#modal.querySelector('.modal-backdrop');

        // Setup close triggers
        this.#setupCloseTriggers();
    }

    #setupCloseTriggers() {
        // Close button
        const closeBtn = this.#modal.querySelector('.modal-close');
        if (closeBtn) {
            const handler = (e) => {
                e.preventDefault();
                this.close();
            };
            closeBtn.addEventListener('click', handler);
            this.#eventListeners.push({ el: closeBtn, type: 'click', handler });
        }

        // Elements with data-close attribute
        const closeTriggers = this.#modal.querySelectorAll('[data-close]');
        closeTriggers.forEach(el => {
            if (el.classList.contains('modal-backdrop') && !this.#options.closeOnBackdrop) {
                return;
            }
            const handler = (e) => {
                e.preventDefault();
                this.close();
            };
            el.addEventListener('click', handler);
            this.#eventListeners.push({ el, type: 'click', handler });
        });
    }

    #getFocusableElements() {
        const selector = [
            'button:not([disabled])',
            'input:not([disabled])',
            'select:not([disabled])',
            'textarea:not([disabled])',
            'a[href]',
            '[tabindex]:not([tabindex="-1"])'
        ].join(', ');

        return Array.from(this.#modal.querySelectorAll(selector))
            .filter(el => el.offsetParent !== null && !el.classList.contains('modal-backdrop'));
    }

    #trapFocus(e) {
        if (e.key !== 'Tab') return;

        const focusable = this.#getFocusableElements();
        if (focusable.length === 0) return;

        const firstEl = focusable[0];
        const lastEl = focusable[focusable.length - 1];

        if (e.shiftKey) {
            if (document.activeElement === firstEl) {
                e.preventDefault();
                lastEl.focus();
            }
        } else {
            if (document.activeElement === lastEl) {
                e.preventDefault();
                firstEl.focus();
            }
        }
    }

    #handleKeydown(e) {
        if (e.key === 'Escape' && this.#options.closeOnEscape) {
            e.preventDefault();
            this.close();
        }
        this.#trapFocus(e);
    }

    open() {
        if (this.#isOpen) return;

        // Store last focused element
        this.#lastFocusedElement = document.activeElement;

        // Track open modals
        ModalManager.#openModals.push(this);

        // Show modal
        this.#modal.classList.add('open');
        this.#isOpen = true;

        // Prevent body scroll
        document.body.style.overflow = 'hidden';

        // Add keyboard listener
        const keydownHandler = (e) => this.#handleKeydown(e);
        document.addEventListener('keydown', keydownHandler);
        this.#eventListeners.push({ el: document, type: 'keydown', handler: keydownHandler });

        // Focus first element
        if (this.#options.focusFirst) {
            requestAnimationFrame(() => {
                const focusable = this.#getFocusableElements();
                if (focusable.length > 0) {
                    focusable[0].focus();
                }
            });
        }

        // Callback
        if (this.#options.onOpen) {
            this.#options.onOpen(this);
        }

        // Dispatch custom event
        this.#modal.dispatchEvent(new CustomEvent('modal:open'));
    }

    close() {
        if (!this.#isOpen) return;

        // Remove from open modals
        const index = ModalManager.#openModals.indexOf(this);
        if (index > -1) {
            ModalManager.#openModals.splice(index, 1);
        }

        // Hide modal
        this.#modal.classList.remove('open');
        this.#isOpen = false;

        // Restore body scroll if no modals open
        if (ModalManager.#openModals.length === 0) {
            document.body.style.overflow = '';
        }

        // Remove keyboard listener
        const keydownListener = this.#eventListeners.find(
            l => l.el === document && l.type === 'keydown'
        );
        if (keydownListener) {
            document.removeEventListener('keydown', keydownListener.handler);
            this.#eventListeners = this.#eventListeners.filter(l => l !== keydownListener);
        }

        // Restore focus
        if (this.#lastFocusedElement && typeof this.#lastFocusedElement.focus === 'function') {
            this.#lastFocusedElement.focus();
        }

        // Callback
        if (this.#options.onClose) {
            this.#options.onClose(this);
        }

        // Dispatch custom event
        this.#modal.dispatchEvent(new CustomEvent('modal:close'));
    }

    isOpen() {
        return this.#isOpen;
    }

    destroy() {
        // Close if open
        if (this.#isOpen) {
            this.close();
        }

        // Remove all event listeners
        this.#eventListeners.forEach(({ el, type, handler }) => {
            el.removeEventListener(type, handler);
        });
        this.#eventListeners = [];
    }
}

// Export for use in renderer
window.ModalManager = ModalManager;
```

**Step 2: Commit ModalManager**

```bash
git add src/utils/ModalManager.js
git commit -m "feat: add ModalManager class for unified modal system"
```

---

## Task 2: Create Modal CSS Styles

**Files:**
- Create: `src/styles/modal.css`

**Step 1: Create modal.css with glassmorphism styles**

```css
/**
 * Modal System Styles
 * Unified modal components with glassmorphism backdrop
 * @version 4.0.0
 */

/* ============================================
 * Modal Backdrop - Glassmorphism
 * ============================================ */

.modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: var(--z-modal, 200);
    cursor: pointer;
}

/* ============================================
 * Modal Container
 * ============================================ */

.modal {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: calc(var(--z-modal, 200) + 1);
    opacity: 0;
    visibility: hidden;
    transition: opacity var(--transition-normal, 200ms cubic-bezier(0.4, 0, 0.2, 1)),
                visibility var(--transition-normal, 200ms cubic-bezier(0.4, 0, 0.2, 1));
    padding: var(--spacing-4, 1rem);
}

.modal.open {
    opacity: 1;
    visibility: visible;
}

/* ============================================
 * Modal Content - With Animation
 * ============================================ */

.modal-content {
    background: hsl(var(--background, 0 0% 100%));
    border-radius: var(--radius-lg, 0.5rem);
    box-shadow: var(--shadow-xl, 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1));
    max-width: 90vw;
    max-height: 90vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transform: scale(0.95);
    transition: transform var(--transition-normal, 200ms cubic-bezier(0.4, 0, 0.2, 1));
}

.modal.open .modal-content {
    transform: scale(1);
}

/* ============================================
 * Modal Header
 * ============================================ */

.modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-4, 1rem) var(--spacing-6, 1.5rem);
    border-bottom: 1px solid hsl(var(--border, 214.3 31.8% 91.4%));
    background: hsl(var(--muted, 210 40% 96.1%));
}

.modal-header h3 {
    margin: 0;
    font-size: var(--text-lg, 1.125rem);
    font-weight: var(--font-semibold, 600);
    color: hsl(var(--foreground, 222.2 84% 4.9%));
}

/* ============================================
 * Modal Close Button
 * ============================================ */

.modal-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: var(--radius, 0.5rem);
    background: transparent;
    color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
    font-size: 24px;
    line-height: 1;
    cursor: pointer;
    transition: background-color var(--transition-fast, 150ms),
                color var(--transition-fast, 150ms);
}

.modal-close:hover {
    background: hsl(var(--accent, 210 40% 96.1%));
    color: hsl(var(--foreground, 222.2 84% 4.9%));
}

.modal-close:focus-visible {
    outline: 2px solid hsl(var(--ring, 227 44% 52%));
    outline-offset: 2px;
}

/* ============================================
 * Modal Body
 * ============================================ */

.modal-body {
    padding: var(--spacing-6, 1.5rem);
    overflow-y: auto;
    flex: 1;
}

/* ============================================
 * Modal Footer
 * ============================================ */

.modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-3, 0.75rem);
    padding: var(--spacing-4, 1rem) var(--spacing-6, 1.5rem);
    border-top: 1px solid hsl(var(--border, 214.3 31.8% 91.4%));
    background: hsl(var(--muted, 210 40% 96.1%));
}

.modal-footer .btn {
    min-width: 80px;
}

/* ============================================
 * Form Elements within Modal
 * ============================================ */

.modal-body .form-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-3, 0.75rem);
    margin-bottom: var(--spacing-3, 0.75rem);
}

.modal-body .form-row label {
    min-width: 100px;
    font-size: var(--text-sm, 0.875rem);
    color: hsl(var(--foreground, 222.2 84% 4.9%));
}

.modal-body .form-row input,
.modal-body .form-row select {
    flex: 1;
    padding: var(--spacing-2, 0.5rem) var(--spacing-3, 0.75rem);
    border: 1px solid hsl(var(--input, 214.3 31.8% 91.4%));
    border-radius: var(--radius, 0.5rem);
    font-size: var(--text-sm, 0.875rem);
    background: hsl(var(--background, 0 0% 100%));
    color: hsl(var(--foreground, 222.2 84% 4.9%));
}

.modal-body .form-row input:focus,
.modal-body .form-row select:focus {
    outline: 2px solid hsl(var(--ring, 227 44% 52%));
    outline-offset: 1px;
}

.modal-body .export-section {
    margin-bottom: var(--spacing-4, 1rem);
    padding-bottom: var(--spacing-4, 1rem);
    border-bottom: 1px solid hsl(var(--border, 214.3 31.8% 91.4%));
}

.modal-body .export-section:last-child {
    border-bottom: none;
    margin-bottom: 0;
}

.modal-body .export-section label {
    display: block;
    font-weight: var(--font-medium, 500);
    margin-bottom: var(--spacing-2, 0.5rem);
    color: hsl(var(--foreground, 222.2 84% 4.9%));
}

.modal-body .checkbox-group label {
    display: flex;
    align-items: center;
    gap: var(--spacing-2, 0.5rem);
    margin-bottom: var(--spacing-2, 0.5rem);
    font-weight: var(--font-normal, 400);
    cursor: pointer;
}

/* ============================================
 * Size Variants
 * ============================================ */

.modal-content.small {
    max-width: 400px;
}

.modal-content.large {
    max-width: 800px;
}

.modal-content.full {
    max-width: 95vw;
    max-height: 95vh;
}

/* ============================================
 * Dark Mode Support
 * ============================================ */

.dark .modal-content,
[data-theme="dark"] .modal-content {
    background: hsl(var(--background));
    box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.4), 0 8px 10px -6px rgb(0 0 0 / 0.3);
}

.dark .modal-header,
.dark .modal-footer,
[data-theme="dark"] .modal-header,
[data-theme="dark"] .modal-footer {
    background: hsl(var(--muted));
}

/* ============================================
 * Accessibility - Reduced Motion
 * ============================================ */

@media (prefers-reduced-motion: reduce) {
    .modal,
    .modal-content {
        transition: none;
    }
}

/* ============================================
 * Legacy Support - Hidden class
 * ============================================ */

.modal.hidden {
    display: none;
}
```

**Step 2: Commit modal.css**

```bash
git add src/styles/modal.css
git commit -m "feat: add modal CSS with glassmorphism and animations"
```

---

## Task 3: Include Modal CSS in HTML

**Files:**
- Modify: `src/index.html` (line ~18)

**Step 1: Add modal.css link after tokens.css**

Find this line in `src/index.html`:
```html
    <link rel="stylesheet" href="styles/tokens.css">
```

Add after it:
```html
    <link rel="stylesheet" href="styles/modal.css">
```

**Step 2: Commit**

```bash
git add src/index.html
git commit -m "feat: include modal.css in index.html"
```

---

## Task 4: Include ModalManager in HTML

**Files:**
- Modify: `src/index.html` (near end of body, before renderer.js)

**Step 1: Add script tag for ModalManager**

Find the script tags near the end of body and add before renderer.js:
```html
    <script src="utils/ModalManager.js"></script>
```

**Step 2: Commit**

```bash
git add src/index.html
git commit -m "feat: include ModalManager script in index.html"
```

---

## Task 5: Convert Find Dialog

**Files:**
- Modify: `src/index.html` (lines 160-174)
- Modify: `src/renderer.js` (find dialog handlers)

**Step 1: Update HTML structure**

Replace the find-dialog div (lines 160-174) with:

```html
        <!-- Find & Replace Dialog -->
        <div id="find-dialog" class="modal" role="dialog" aria-modal="true" aria-labelledby="find-dialog-title">
            <div class="modal-backdrop" data-close></div>
            <div class="modal-content small">
                <div class="modal-header">
                    <h3 id="find-dialog-title">Find & Replace</h3>
                    <button class="modal-close" id="btn-find-close" aria-label="Close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="find-controls">
                        <input type="text" id="find-input" placeholder="Find..." class="input">
                        <input type="text" id="replace-input" placeholder="Replace..." class="input">
                    </div>
                    <div class="find-buttons" style="display: flex; gap: 8px; margin-top: 8px;">
                        <button id="btn-find-prev" class="btn btn-secondary" title="Previous">↑</button>
                        <button id="btn-find-next" class="btn btn-secondary" title="Next">↓</button>
                        <button id="btn-replace" class="btn btn-secondary" title="Replace">Replace</button>
                        <button id="btn-replace-all" class="btn btn-secondary" title="Replace All">All</button>
                    </div>
                </div>
                <div class="modal-footer">
                    <span id="find-count" style="flex: 1; color: hsl(var(--muted-foreground));">0 matches</span>
                </div>
            </div>
        </div>
```

**Step 2: Add CSS for find controls in modal.css**

Append to `src/styles/modal.css`:

```css
/* ============================================
 * Find Dialog Specific
 * ============================================ */

.find-controls {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2, 0.5rem);
}

.find-controls input {
    width: 100%;
}
```

**Step 3: Update renderer.js to use ModalManager**

Find the find dialog show/hide code and replace with ModalManager usage.

Add near top of renderer.js (after DOMContentLoaded):

```javascript
// Initialize ModalManager for find dialog
let findModal = null;

document.addEventListener('DOMContentLoaded', () => {
    findModal = new ModalManager('#find-dialog');
    // ... rest of initialization
});
```

Replace show/hide calls:
```javascript
// Old: document.getElementById('find-dialog').classList.remove('hidden');
// New:
findModal.open();

// Old: document.getElementById('find-dialog').classList.add('hidden');
// New:
findModal.close();
```

**Step 4: Commit**

```bash
git add src/index.html src/renderer.js src/styles/modal.css
git commit -m "feat: convert find dialog to unified modal system"
```

---

## Task 6: Convert Export Dialog

**Files:**
- Modify: `src/index.html` (lines 176-337)
- Modify: `src/renderer.js` (export dialog handlers)

**Step 1: Update HTML structure**

Replace the export-dialog div with new modal structure. Keep all the internal content, just wrap in modal classes:

```html
        <!-- Export Options Dialog -->
        <div id="export-dialog" class="modal" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title">
            <div class="modal-backdrop" data-close></div>
            <div class="modal-content large">
                <div class="modal-header">
                    <h3 id="export-dialog-title">Export Options</h3>
                    <button class="modal-close" id="export-dialog-close" aria-label="Close">&times;</button>
                </div>
                <div class="modal-body">
                    <!-- Keep ALL existing content from export-dialog-body here -->
                </div>
                <div class="modal-footer">
                    <button id="export-cancel" class="btn btn-secondary" data-close>Cancel</button>
                    <button id="export-confirm" class="btn btn-primary">Export</button>
                </div>
            </div>
        </div>
```

**Step 2: Update renderer.js**

```javascript
// Initialize export modal
let exportModal = null;

// In DOMContentLoaded:
exportModal = new ModalManager('#export-dialog');

// Replace showExportDialog function:
function showExportDialog(format) {
    console.log('showExportDialog called with format:', format);
    const title = document.getElementById('export-dialog-title');

    title.textContent = `Export as ${format.toUpperCase()}`;
    document.getElementById('export-dialog').setAttribute('data-format', format);

    initializeExportForm(format);
    exportModal.open();
}

// Replace hideExportDialog function:
function hideExportDialog() {
    exportModal.close();
    currentExportFormat = null;
}
```

**Step 3: Remove old event listeners**

Remove the manual click and escape key handlers for export-dialog since ModalManager handles them.

**Step 4: Commit**

```bash
git add src/index.html src/renderer.js
git commit -m "feat: convert export dialog to unified modal system"
```

---

## Task 7: Convert Print Preview Dialog

**Files:**
- Modify: `src/index.html` (lines 339-420)
- Modify: `src/renderer.js`

**Step 1: Update HTML structure**

```html
        <!-- Print Preview Dialog -->
        <div id="print-preview-overlay" class="modal" role="dialog" aria-modal="true" aria-labelledby="print-preview-title">
            <div class="modal-backdrop" data-close></div>
            <div class="modal-content full">
                <div class="modal-header">
                    <h3 id="print-preview-title">Print Preview</h3>
                    <button class="modal-close" id="print-preview-close" aria-label="Close">&times;</button>
                </div>
                <div class="modal-body print-preview-body">
                    <!-- Keep existing print preview content -->
                </div>
            </div>
        </div>
```

**Step 2: Update renderer.js**

```javascript
let printPreviewModal = null;

// In DOMContentLoaded:
printPreviewModal = new ModalManager('#print-preview-overlay');

function openPrintPreviewDialog() {
    printPreviewModal.open();
    // ... rest of existing logic
}
```

**Step 3: Commit**

```bash
git add src/index.html src/renderer.js
git commit -m "feat: convert print preview dialog to unified modal system"
```

---

## Task 8: Convert Table Generator Dialog

**Files:**
- Modify: `src/index.html` (lines 422-471)
- Modify: `src/renderer.js`

**Step 1: Update HTML structure**

```html
        <!-- Table Generator Dialog -->
        <div id="table-generator-dialog" class="modal" role="dialog" aria-modal="true" aria-labelledby="table-dialog-title">
            <div class="modal-backdrop" data-close></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="table-dialog-title">Table Generator</h3>
                    <button class="modal-close" id="table-dialog-close" aria-label="Close">&times;</button>
                </div>
                <div class="modal-body">
                    <!-- Keep existing table generator content -->
                </div>
                <div class="modal-footer">
                    <button id="table-dialog-cancel" class="btn btn-secondary" data-close>Cancel</button>
                    <button id="table-dialog-insert" class="btn btn-primary">Insert Table</button>
                </div>
            </div>
        </div>
```

**Step 2: Update renderer.js**

```javascript
let tableModal = null;

// In DOMContentLoaded:
tableModal = new ModalManager('#table-generator-dialog');
```

**Step 3: Commit**

```bash
git add src/index.html src/renderer.js
git commit -m "feat: convert table generator dialog to unified modal system"
```

---

## Task 9: Convert ASCII Art Dialog

**Files:**
- Modify: `src/index.html` (lines 473-582)
- Modify: `src/renderer.js`

**Step 1: Update HTML structure**

```html
        <!-- ASCII Art Generator Dialog -->
        <div id="ascii-art-dialog" class="modal" role="dialog" aria-modal="true" aria-labelledby="ascii-dialog-title">
            <div class="modal-backdrop" data-close></div>
            <div class="modal-content large">
                <div class="modal-header">
                    <h3 id="ascii-dialog-title">ASCII Art Generator</h3>
                    <button class="modal-close" id="ascii-dialog-close" aria-label="Close">&times;</button>
                </div>
                <div class="modal-body">
                    <!-- Keep existing ASCII art content -->
                </div>
                <div class="modal-footer">
                    <button id="ascii-dialog-cancel" class="btn btn-secondary" data-close>Cancel</button>
                    <button id="ascii-dialog-insert" class="btn btn-primary">Insert ASCII Art</button>
                </div>
            </div>
        </div>
```

**Step 2: Update renderer.js**

```javascript
let asciiModal = null;

// In DOMContentLoaded:
asciiModal = new ModalManager('#ascii-art-dialog');
```

**Step 3: Commit**

```bash
git add src/index.html src/renderer.js
git commit -m "feat: convert ASCII art dialog to unified modal system"
```

---

## Task 10: Convert Universal Converter Dialog

**Files:**
- Modify: `src/index.html` (lines 584-810)
- Modify: `src/renderer.js`

**Step 1: Update HTML structure**

```html
        <!-- Universal File Converter Dialog -->
        <div id="universal-converter-dialog" class="modal" role="dialog" aria-modal="true" aria-labelledby="converter-dialog-title">
            <div class="modal-backdrop" data-close></div>
            <div class="modal-content large">
                <div class="modal-header">
                    <h3 id="converter-dialog-title">Universal File Converter</h3>
                    <button class="modal-close" id="converter-dialog-close" aria-label="Close">&times;</button>
                </div>
                <div class="modal-body">
                    <!-- Keep existing converter content -->
                </div>
                <div class="modal-footer">
                    <button id="converter-dialog-cancel" class="btn btn-secondary" data-close>Cancel</button>
                    <button id="converter-dialog-convert" class="btn btn-primary">Convert</button>
                </div>
            </div>
        </div>
```

**Step 2: Update renderer.js**

```javascript
let converterModal = null;

// In DOMContentLoaded:
converterModal = new ModalManager('#universal-converter-dialog');
```

**Step 3: Commit**

```bash
git add src/index.html src/renderer.js
git commit -m "feat: convert universal converter dialog to unified modal system"
```

---

## Task 11: Convert Batch Dialog

**Files:**
- Modify: `src/index.html` (lines 812-879)
- Modify: `src/renderer.js`

**Step 1: Update HTML structure**

```html
        <!-- Batch Conversion Dialog -->
        <div id="batch-dialog" class="modal" role="dialog" aria-modal="true" aria-labelledby="batch-dialog-title">
            <div class="modal-backdrop" data-close></div>
            <div class="modal-content large">
                <div class="modal-header">
                    <h3 id="batch-dialog-title">Batch Conversion</h3>
                    <button class="modal-close" id="batch-dialog-close" aria-label="Close">&times;</button>
                </div>
                <div class="modal-body">
                    <!-- Keep existing batch content -->
                </div>
                <div class="modal-footer">
                    <button id="batch-dialog-cancel" class="btn btn-secondary" data-close>Cancel</button>
                    <button id="batch-dialog-start" class="btn btn-primary">Start Conversion</button>
                </div>
            </div>
        </div>
```

**Step 2: Update renderer.js**

```javascript
let batchModal = null;

// In DOMContentLoaded:
batchModal = new ModalManager('#batch-dialog');

// Replace showBatchDialog:
function showBatchDialog() {
    batchModal.open();
}

// Replace hideBatchDialog:
function hideBatchDialog() {
    batchModal.close();
}
```

**Step 3: Commit**

```bash
git add src/index.html src/renderer.js
git commit -m "feat: convert batch dialog to unified modal system"
```

---

## Task 12: Convert PDF Editor Dialog

**Files:**
- Modify: `src/index.html` (lines 881-1274)
- Modify: `src/renderer.js`

**Step 1: Update HTML structure**

```html
        <!-- PDF Editor Dialog -->
        <div id="pdf-editor-dialog" class="modal" role="dialog" aria-modal="true" aria-labelledby="pdf-editor-title">
            <div class="modal-backdrop" data-close></div>
            <div class="modal-content full">
                <div class="modal-header">
                    <h3 id="pdf-editor-title">PDF Editor</h3>
                    <button class="modal-close" id="pdf-editor-dialog-close" aria-label="Close">&times;</button>
                </div>
                <div class="modal-body pdf-editor-body">
                    <!-- Keep existing PDF editor content -->
                </div>
                <div class="modal-footer">
                    <button id="pdf-editor-cancel" class="btn btn-secondary" data-close>Cancel</button>
                    <button id="pdf-editor-process" class="btn btn-primary">Process PDF</button>
                </div>
            </div>
        </div>
```

**Step 2: Update renderer.js**

```javascript
let pdfEditorModal = null;

// In DOMContentLoaded:
pdfEditorModal = new ModalManager('#pdf-editor-dialog');
```

**Step 3: Commit**

```bash
git add src/index.html src/renderer.js
git commit -m "feat: convert PDF editor dialog to unified modal system"
```

---

## Task 13: Convert Header & Footer Dialog

**Files:**
- Modify: `src/index.html` (lines 1276-1368)
- Modify: `src/renderer.js`

**Step 1: Update HTML structure**

```html
        <!-- Header & Footer Configuration Dialog -->
        <div id="header-footer-dialog" class="modal" role="dialog" aria-modal="true" aria-labelledby="header-footer-title">
            <div class="modal-backdrop" data-close></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="header-footer-title">Header & Footer Configuration</h3>
                    <button class="modal-close" id="header-footer-close" aria-label="Close">&times;</button>
                </div>
                <div class="modal-body">
                    <!-- Keep existing header/footer content -->
                </div>
                <div class="modal-footer">
                    <button id="header-footer-cancel" class="btn btn-secondary" data-close>Cancel</button>
                    <button id="header-footer-save" class="btn btn-primary">Save</button>
                </div>
            </div>
        </div>
```

**Step 2: Update renderer.js**

```javascript
let headerFooterModal = null;

// In DOMContentLoaded:
headerFooterModal = new ModalManager('#header-footer-dialog');
```

**Step 3: Commit**

```bash
git add src/index.html src/renderer.js
git commit -m "feat: convert header & footer dialog to unified modal system"
```

---

## Task 14: Convert Field Picker Dialog

**Files:**
- Modify: `src/index.html` (lines 1370-1440)
- Modify: `src/renderer.js`

**Step 1: Update HTML structure**

```html
        <!-- Dynamic Field Picker Dialog -->
        <div id="field-picker-dialog" class="modal" role="dialog" aria-modal="true" aria-labelledby="field-picker-title">
            <div class="modal-backdrop" data-close></div>
            <div class="modal-content small">
                <div class="modal-header">
                    <h3 id="field-picker-title">Insert Field</h3>
                    <button class="modal-close" id="field-picker-close" aria-label="Close">&times;</button>
                </div>
                <div class="modal-body">
                    <!-- Keep existing field picker content -->
                </div>
            </div>
        </div>
```

**Step 2: Update renderer.js**

```javascript
let fieldPickerModal = null;

// In DOMContentLoaded:
fieldPickerModal = new ModalManager('#field-picker-dialog');
```

**Step 3: Commit**

```bash
git add src/index.html src/renderer.js
git commit -m "feat: convert field picker dialog to unified modal system"
```

---

## Task 15: Remove Old Dialog CSS

**Files:**
- Modify: `src/styles.css`

**Step 1: Remove old .export-dialog, .batch-dialog, .find-dialog CSS**

Find and remove these sections from `src/styles.css`:
- `.find-dialog` and related selectors (lines ~1244-1328)
- `.export-dialog` and related selectors (lines ~1332-1540)
- `.batch-dialog` and related selectors

**Step 2: Commit**

```bash
git add src/styles.css
git commit -m "refactor: remove old dialog CSS in favor of unified modal system"
```

---

## Task 16: Test All Modals

**Step 1: Run the application**

```bash
npm start
```

**Step 2: Verify each modal**

- [ ] Find dialog (Ctrl+F) - opens/closes, focus trap works
- [ ] Export dialog (Ctrl+E or File > Export) - all options visible
- [ ] Print preview (Ctrl+P) - renders correctly
- [ ] Table generator - inserts table
- [ ] ASCII art - generates art
- [ ] Universal converter - file selection works
- [ ] Batch conversion - file list works
- [ ] PDF editor - opens PDF
- [ ] Header & footer - saves settings
- [ ] Field picker - inserts fields

**Step 3: Test accessibility**

- [ ] Tab cycles within open modal
- [ ] Escape closes modal
- [ ] Click backdrop closes modal
- [ ] Focus returns to trigger element after close

---

## Task 17: Build Windows Release

**Files:**
- Run: build command

**Step 1: Build release**

```bash
npm run build:win
```

**Step 2: Verify artifacts**

```bash
ls -la dist/*.exe
```

Expected output:
- `dist/MarkdownConverter-Setup-4.0.0.exe`
- `dist/MarkdownConverter-4.0.0-x64.exe`

**Step 3: Final commit with version bump if needed**

```bash
git add -A
git commit -m "release: v4.0.0 with unified modal system"
git push origin master
```

---

## Summary

| Task | Description | Files Modified |
|------|-------------|----------------|
| 1 | Create ModalManager class | `src/utils/ModalManager.js` |
| 2 | Create modal CSS | `src/styles/modal.css` |
| 3 | Include modal CSS | `src/index.html` |
| 4 | Include ModalManager script | `src/index.html` |
| 5 | Convert find dialog | `src/index.html`, `src/renderer.js` |
| 6 | Convert export dialog | `src/index.html`, `src/renderer.js` |
| 7 | Convert print preview | `src/index.html`, `src/renderer.js` |
| 8 | Convert table generator | `src/index.html`, `src/renderer.js` |
| 9 | Convert ASCII art | `src/index.html`, `src/renderer.js` |
| 10 | Convert universal converter | `src/index.html`, `src/renderer.js` |
| 11 | Convert batch dialog | `src/index.html`, `src/renderer.js` |
| 12 | Convert PDF editor | `src/index.html`, `src/renderer.js` |
| 13 | Convert header/footer | `src/index.html`, `src/renderer.js` |
| 14 | Convert field picker | `src/index.html`, `src/renderer.js` |
| 15 | Remove old CSS | `src/styles.css` |
| 16 | Test all modals | - |
| 17 | Build release | - |
