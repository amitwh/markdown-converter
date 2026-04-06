# Writer's Studio Feature Pack — Design Document

**Date**: 2026-04-06
**Version**: 4.2.0 target
**Status**: Approved
**Scope**: Three cohesive features to transform MarkdownConverter into a writing environment

---

## Overview

The Writer's Studio Feature Pack adds three interconnected features to MarkdownConverter:

1. **Zen Mode** — Distraction-free writing environment with typewriter scrolling
2. **Document Outline** — Heading hierarchy sidebar panel for navigation
3. **Writing Analytics** — Real-time readability and vocabulary analysis dashboard

These features work together: Zen Mode creates the environment, Outline provides navigation, Analytics gives insight.

---

## Feature 1: Zen Mode

### Purpose

Transform the app from a multi-tool into a focused writing environment. Inspired by iA Writer, Typora, and Bear.

### New Files

- `src/zen-mode.js` — ZenMode class (~150 lines)
- `src/styles-zen.css` — Zen mode specific styles (~120 lines)

### Integration Points

- `src/renderer.js` — Initialize ZenMode, register F11 shortcut, add View > Zen Mode menu
- `src/editor/codemirror-setup.js` — Export typewriter + dimming extensions

### Behavior

**Toggle**: F11, View > Zen Mode, command palette "Toggle Zen Mode"
**Exit**: Escape key, F11 again

**What hides**:
- Tab bar
- Toolbar
- Sidebar (collapsed)
- Status bar
- App header

**What shows**:
- Editor (full viewport)
- Floating HUD (bottom-center, semi-transparent)

### Floating HUD

```
┌─────────────────────────────────────────┐
│  847 words  •  ~4 min  •  23:45 session │
│  ████████████████░░░░  85% of 1000      │
└─────────────────────────────────────────┘
```

- Word count (from existing status bar logic)
- Estimated reading time (~200 wpm)
- Session timer (starts when zen mode activates)
- Optional progress bar toward word goal

### CodeMirror Extensions

**Typewriter Scroll** (`ViewPlugin`):
- Listens to `EditorView.update` for selection changes
- Calls `editor.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) })`
- Smooth scrolling with `scrollBehavior: 'smooth'` in CSS

**Line Dimming** (`ViewPlugin` + `Decoration`):
- Builds a `DecorationSet` mapping each line to an opacity value
- Active line: opacity 1.0
- 1-2 lines away: 0.7
- 3-4 lines away: 0.5
- 5+ lines away: 0.3
- Uses `Decoration.line({ attributes: { style: 'opacity: X' } })`

### Centered Column

CSS applied to `.zen-mode .cm-content`:
```css
.zen-mode .cm-content {
    max-width: 700px;
    margin: 0 auto;
    font-size: 18px;
    line-height: 1.8;
}
```

### State Management

- `this.previousState` stores which UI elements were visible before zen mode
- On exit, restores all elements to their previous visibility
- Editor content, cursor position, and scroll state are never modified

---

## Feature 2: Document Outline Panel

### Purpose

Provide always-visible heading navigation for documents of any length. The single most-requested navigation feature for multi-section documents.

### New Files

- `src/sidebar/outline-panel.js` — `renderOutlinePanel` function (~100 lines)

### Modified Files

- `src/index.html` — Add outline icon button in sidebar icons strip
- `src/renderer.js` — Register 'outline' panel, provide editor reference

### Sidebar Integration

Uses existing `SidebarManager.registerPanel()` API:
```javascript
sidebarManager.registerPanel('outline', {
    title: 'Outline',
    render: (container) => renderOutlinePanel(container, editor, editorContent)
});
```

New icon button in sidebar strip (after templates icon):
```html
<button class="sidebar-icon" data-panel="outline" title="Outline (Ctrl+Shift+O)">
    <!-- hierarchy/list icon SVG -->
</button>
```

### Parsing Logic

Parse headings from raw markdown content using regex:
```javascript
const headingRegex = /^(#{1,6})\s+(.+)$/gm;
```

Returns array of:
```javascript
{ level: 1-6, text: "Heading Text", line: 42 }
```

Debounced at 300ms to avoid re-parsing on every keystroke.

### UI Structure

```
┌──────────────────────────────────────────┐
│  OUTLINE                          ☰      │
├──────────────────────────────────────────┤
│  ▸ Introduction                  (H1)    │
│    ▸ Getting Started             (H2)    │
│    ▸ Prerequisites               (H2)    │
│      ▸ Node.js                   (H3) ◄  │
│    ▸ Installation                (H2)    │
│  ▸ Features                      (H1)    │
│    ▸ Editor                      (H2)    │
│    ▸ Export                      (H2)    │
├──────────────────────────────────────────┤
│  9 headings  •  2 H1  •  4 H2  •  3 H3  │
└──────────────────────────────────────────┘
```

- Indentation based on heading level (H1 = 0px, H2 = 16px, H3 = 32px, etc.)
- Current heading highlighted with accent color (◄ indicator)
- Hover shows full heading text if truncated

### Click-to-Navigate

```javascript
editor.dispatch({
    effects: EditorView.scrollIntoView(linePos, { y: 'center' })
});
```

Brief highlight animation on the target line (fades out over 500ms).

### Current Heading Sync

On editor update (debounced 100ms):
1. Get cursor line number
2. Find the last heading whose line number <= cursor line
3. Set that heading as active in the outline

### Empty State

When no headings found:
```
No headings found

Use # to create headings:
# Heading 1
## Heading 2
### Heading 3
```

---

## Feature 3: Writing Analytics

### Purpose

Give writers real-time insight into their document's readability, structure, and vocabulary. This is the "surprise" feature most Markdown editors lack.

### New Files

- `src/analytics/writing-analytics.js` — `WritingAnalytics` class (~180 lines)
- `src/analytics/analytics-panel.js` — `renderAnalyticsPanel` function (~120 lines)

### Integration Points

- `src/renderer.js` — Register Ctrl+Shift+A shortcut, command palette entry, View menu item

### Trigger

- Keyboard: `Ctrl+Shift+A`
- Command Palette: "Show Writing Analytics"
- Menu: View > Writing Analytics

### Presentation

Uses existing `ModalManager` to show a modal overlay with analytics dashboard.

```
┌─────────────────────────────────────────────────────┐
│  Writing Analytics                              ✕   │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌─ Readability ──────────────────────────────────┐ │
│  │  Flesch Reading Ease:  67.3 (Standard)    ○   │ │
│  │  Grade Level:          8.2              ○○○●○  │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─ Timing ───────────────────────────────────────┐ │
│  │  Reading Time:   ~4 min                        │ │
│  │  Speaking Time:  ~6 min                        │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─ Structure ────────────────────────────────────┐ │
│  │  Sentences:  42  •  Paragraphs:  8            │ │
│  │  Avg Sentence:  14.2 words                     │ │
│  │  Longest:  38 words ("The quick brown fox...") │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─ Vocabulary ───────────────────────────────────┐ │
│  │  Unique: 312 / 847 words (36.8%)               │ │
│  │  Top: the(42) and(31) markdown(28) ...         │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌─ Word Goal ────────────────────────────────────┐ │
│  │  Target: [1000] words                          │ │
│  │  ████████████████░░░░  847/1000 (85%)          │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### Metrics Implementation

**Readability (Flesch-Kincaid):**
```javascript
// Flesch Reading Ease
ease = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words);

// Flesch-Kincaid Grade Level
grade = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
```

**Syllable Estimation:**
```javascript
function countSyllables(word) {
    word = word.toLowerCase().replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
    word = word.replace(/^y/, '');
    return word.match(/[aeiouy]{1,2}/g)?.length || 1;
}
```

**Reading/Speaking Time:**
- Reading: 200 words/minute
- Speaking: 130 words/minute

**Lexical Diversity:**
- Ratio of unique words to total words (excluding stop words)

**Top Words:**
- Frequency map, sorted descending, top 10
- Excludes common stop words (the, a, an, is, are, etc.)

### Word Goal

- Persisted in `electron-store` per document (or global default)
- Progress bar with percentage
- Celebration effect when goal is reached (brief confetti animation or green flash)

### Update Cadence

- Re-analyzes on editor content change (debounced at 1000ms)
- If modal is open, updates live
- If modal is closed, no computation (zero overhead)

---

## File Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/zen-mode.js` | Create | ZenMode class with CM6 extensions |
| `src/styles-zen.css` | Create | Zen mode styling |
| `src/sidebar/outline-panel.js` | Create | Outline sidebar panel |
| `src/analytics/writing-analytics.js` | Create | Analytics computation engine |
| `src/analytics/analytics-panel.js` | Create | Analytics modal UI |
| `src/index.html` | Modify | Add outline icon, zen mode button |
| `src/renderer.js` | Modify | Initialize all three features |
| `src/editor/codemirror-setup.js` | Modify | Export typewriter + dimming extensions |

## Keyboard Shortcuts

| Shortcut | Feature | Action |
|----------|---------|--------|
| F11 | Zen Mode | Toggle on/off |
| Escape | Zen Mode | Exit (when active) |
| Ctrl+Shift+O | Outline | Open outline sidebar panel |
| Ctrl+Shift+A | Analytics | Open analytics modal |

## Dependencies

No new npm dependencies required. All features use:
- Existing CodeMirror 6 APIs (ViewPlugin, Decoration, scrollIntoView)
- Existing SidebarManager API
- Existing ModalManager API
- Pure JavaScript math for analytics
