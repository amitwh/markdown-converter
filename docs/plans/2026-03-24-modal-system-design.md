# Modal System Design

**Date:** 2026-03-24
**Version:** 4.0.0
**Status:** Approved

## Overview

Replace the existing dialog implementations with a unified modal system that provides:
- Glassmorphism backdrop matching app aesthetic
- Full accessibility (ARIA, focus trap, keyboard navigation)
- Smooth fade + scale animations
- Consistent API via `ModalManager` class

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Unified `ModalManager` class | Cleaner, consistent behavior across all modals |
| Backdrop style | Glassmorphism | Matches existing app design language |
| Focus management | Focus first interactive element | Standard, predictable behavior |
| Animation | Fade + scale (95% → 100%) | Modern, subtle effect |
| Implementation | Custom (not native `<dialog>`) | Full control, no polyfill concerns |

## Architecture

### File Structure

```
src/
├── utils/
│   └── ModalManager.js    # Core modal logic (~150 lines)
├── styles/
│   └── modal.css          # Unified modal styles (~200 lines)
└── index.html             # Updated dialog markup
```

### ModalManager Class

```javascript
class ModalManager {
  constructor(element, options = {})
  open()                    // Show modal with animation
  close()                   // Hide modal with animation
  destroy()                 // Cleanup event listeners
  on(event, callback)       // Event subscription

  // Internal
  #createBackdrop()         // Create glassmorphism backdrop
  #trapFocus()              // Manage focus within modal
  #handleKeydown(e)         // Escape key handler
  #getFocusableElements()   // Query focusable children
}
```

### Events

- `open` — Fired after open animation completes
- `close` — Fired after close animation completes

## CSS Design

### Variables (from tokens.css)

```css
--z-modal: 200;
--transition-normal: 200ms cubic-bezier(0.4, 0, 0.2, 1);
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1);
--radius-lg: 0.5rem;
```

### Backdrop

```css
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: var(--z-modal);
}
```

### Modal Container

```css
.modal {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: calc(var(--z-modal) + 1);
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--transition-normal),
              visibility var(--transition-normal);
}

.modal.open {
  opacity: 1;
  visibility: visible;
}
```

### Modal Content (with animation)

```css
.modal-content {
  background: hsl(var(--background));
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  max-width: 90vw;
  max-height: 90vh;
  overflow: hidden;
  transform: scale(0.95);
  transition: transform var(--transition-normal);
}

.modal.open .modal-content {
  transform: scale(1);
}
```

## HTML Structure

All dialogs convert to unified structure:

```html
<div id="export-dialog"
     class="modal"
     role="dialog"
     aria-modal="true"
     aria-labelledby="export-dialog-title">

  <div class="modal-backdrop" data-close></div>

  <div class="modal-content">
    <div class="modal-header">
      <h3 id="export-dialog-title">Export Options</h3>
      <button class="modal-close" aria-label="Close">&times;</button>
    </div>

    <div class="modal-body">
      <!-- Dialog-specific content -->
    </div>

    <div class="modal-footer">
      <button class="btn btn-secondary" data-close>Cancel</button>
      <button class="btn btn-primary">Confirm</button>
    </div>
  </div>
</div>
```

### Key Attributes

- `role="dialog"` — Screen reader identification
- `aria-modal="true"` — Prevents screen reader from accessing background
- `aria-labelledby` — References the dialog title
- `data-close` — Click handler for closing (backdrop, cancel buttons)

## Accessibility Features

1. **Focus trap** — Tab cycles within modal only
2. **Focus first element** — Auto-focuses first input/button on open
3. **Escape key** — Closes modal
4. **Click outside** — Clicking backdrop closes modal
5. **Focus restoration** — Returns focus to trigger element on close
6. **ARIA attributes** — Proper screen reader support

## Dialogs to Migrate

| Dialog ID | Current Class | Complexity |
|-----------|--------------|------------|
| `find-dialog` | `.find-dialog` | Simple |
| `export-dialog` | `.export-dialog` | Complex (many sections) |
| `print-preview-overlay` | `.export-dialog` | Medium |
| `table-generator-dialog` | `.export-dialog` | Simple |
| `ascii-art-dialog` | `.export-dialog` | Medium |
| `universal-converter-dialog` | `.export-dialog` | Complex |
| `batch-dialog` | `.batch-dialog` | Complex |
| `pdf-editor-dialog` | `.export-dialog` | Complex |
| `header-footer-dialog` | `.export-dialog` | Medium |
| `field-picker-dialog` | `.export-dialog` | Simple |

## Migration Steps

1. Create `src/utils/ModalManager.js`
2. Create `src/styles/modal.css`
3. Update `index.html` to include new stylesheet
4. Convert each dialog HTML to new structure
5. Initialize `ModalManager` instances in `renderer.js`
6. Remove old CSS from `styles.css`
7. Test all dialogs

## Out of Scope

- Modal nesting (stacked modals) — can be added later if needed
- Animated backdrop (currently static blur)
- Modal size variants (small/large/fullscreen) — can use inline styles
