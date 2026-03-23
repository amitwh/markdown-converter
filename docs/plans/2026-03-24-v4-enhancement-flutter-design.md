# V4 Enhancement + Flutter Exploration Design

**Date:** 2026-03-24
**Status:** Approved
**Approach:** Incremental V4 Enhancement + Flutter Spike (70/30 split)

---

## Executive Summary

This design outlines a two-track approach:
1. **V4 Enhancement (70%)**: Fix critical bugs, optimize performance, add platform adapters, improve UI patterns
2. **Flutter Exploration (30%)**: Build proof-of-concept for cross-platform evaluation (Windows, Mobile, Web)

---

## Goals & Scope

### Primary Goals
1. **Fix critical bug**: PDF and markdown multitab functionality
2. **Performance improvements**: Faster startup, smoother editing, responsive preview
3. **Architecture improvements**: Platform adapters, cleaner state management
4. **Flutter research**: Proof-of-concept for cross-platform evaluation

### Out of Scope
- Full V5 migration
- Complete UI redesign
- New features (focus on optimization)

### Success Criteria

| Metric | Current | Target |
|--------|---------|--------|
| Startup time | ~3-5s | <2s |
| Editor typing latency | Noticeable lag | <16ms |
| Preview render (1MB file) | ~500ms | <200ms |
| Memory usage | ~300MB | <200MB |
| Bundle size | ~150MB | <100MB |

---

## Section 1: V4 Critical Fixes & Performance Optimizations

### 1.1 Fix: PDF/Markdown Multitab Bug

**Location:** `src/renderer.js` (TabManager class)

**Investigation areas:**
- `switchToTab()` - ensure proper state preservation
- `closeTab()` - ensure EditorView cleanup
- Add tab type tracking (markdown vs pdf)
- Isolate PDF viewer state from editor state

### 1.2 Startup Performance Optimizations

| Optimization | Implementation | Expected Gain |
|--------------|----------------|---------------|
| Defer Mermaid | Load only when diagram detected | ~500ms |
| Defer PDF.js | Load on first PDF open | ~800ms |
| Lazy load themes | Load active theme only | ~200ms |
| Lazy sidebar panels | Load panel code when sidebar opens | ~300ms |
| Preload optimization | Remove unused IPC channels | ~100ms |

**Lazy loading pattern:**
```javascript
// Current (loads everything upfront)
const { dialog } = require('@electron/remote');

// Optimized (load on demand)
let _dialog;
function getDialog() {
  if (!_dialog) _dialog = require('@electron/remote').dialog;
  return _dialog;
}
```

### 1.3 Editor Performance

| Issue | Solution |
|-------|----------|
| Typing lag with large files | Debounce preview updates (300ms) |
| Syntax highlight overhead | Use highlight.js lazy mode |
| Memory leaks | Clean up EditorView on tab close |
| Theme switching lag | Pre-compile theme CSS |

### 1.4 Preview Rendering

| Issue | Solution |
|-------|----------|
| Mermaid slow | Render on-demand, cache results |
| Full re-render on keystroke | Debounced incremental updates |
| Large documents | Viewport rendering (visible portion only) |

---

## Section 2: Platform Adapter Pattern

### 2.1 Architecture

```
src/
├── adapters/
│   ├── index.js              # Auto-detects and exports adapter
│   ├── types.js              # Interface definitions (JSDoc)
│   │
│   ├── electron/             # Current Electron implementation
│   │   ├── index.js          # Exports electronAdapter
│   │   ├── fs.js             # File system operations
│   │   ├── convert.js        # Pandoc, FFmpeg conversions
│   │   ├── pdf.js            # PDF operations
│   │   └── system.js         # System info, dialogs, notifications
│   │
│   └── mock/                 # For testing
│       └── index.js          # Mock adapter for unit tests
```

### 2.2 Adapter Interface

```javascript
/**
 * @typedef {Object} PlatformAdapter
 * @property {'electron'} name
 * @property {FileSystemAdapter} fs
 * @property {ConversionAdapter} convert
 * @property {PdfAdapter} pdf
 * @property {SystemAdapter} system
 */

/**
 * @typedef {Object} FileSystemAdapter
 * @property {(path: string) => Promise<string>} readFile
 * @property {(path: string, content: string) => Promise<void>} writeFile
 * @property {(path: string) => Promise<void>} deleteFile
 * @property {(path: string) => Promise<FileInfo[]>} listDirectory
 * @property {(path: string) => Promise<boolean>} exists
 */
```

### 2.3 Migration Strategy

| Phase | What | Files Affected |
|-------|------|----------------|
| 1 | Create adapter structure | New files only |
| 2 | Migrate file operations | `renderer.js`, `sidebar/*.js` |
| 3 | Migrate conversions | Export dialogs |
| 4 | Migrate PDF operations | PDF viewer |
| 5 | Remove old IPC calls | `preload.js` cleanup |

---

## Section 3: UI Improvements (Shadcn/ui Patterns)

### 3.1 Design Token System

```css
/* src/styles/tokens.css */

:root {
  /* Colors - Light mode */
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 227 44% 52%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96.1%;
  --secondary-foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
  --destructive: 0 84.2% 60.2%;
  --border: 214.3 31.8% 91.4%;
  --ring: 227 44% 52%;

  /* Spacing & Radii */
  --radius: 0.5rem;
}
```

### 3.2 Component Improvements

| Component | Current Issue | Fix |
|-----------|---------------|-----|
| Buttons | Inconsistent hover/focus | Use `.btn` with variants |
| Dialogs | Missing focus trap | Add focus trap, Escape key, aria-modal |
| Tabs | No keyboard navigation | Add arrow key nav, aria-selected |
| Sidebar | No collapse animation | CSS transitions |
| Dropdowns | Missing click-outside | Add proper event handling |

### 3.3 Accessibility Improvements

- Focus states with `:focus-visible`
- Skip to content link
- ARIA labels on interactive elements
- Keyboard navigation for all components

---

## Section 4: Flutter Exploration (30% Effort)

### 4.1 Flutter Project Structure

```
markdown-converter-flutter/
├── lib/
│   ├── main.dart
│   ├── app.dart
│   ├── core/
│   │   ├── theme/
│   │   └── constants.dart
│   ├── features/
│   │   ├── editor/
│   │   ├── preview/
│   │   └── tabs/
│   ├── services/
│   │   ├── file_service.dart
│   │   ├── export_service.dart
│   │   └── platform_service.dart
│   └── adapters/
│       ├── file_adapter.dart
│       ├── file_adapter_mobile.dart
│       ├── file_adapter_web.dart
│       └── file_adapter_desktop.dart
├── pubspec.yaml
├── windows/
├── web/
└── lib/
```

### 4.2 Key Dependencies

```yaml
dependencies:
  flutter_markdown: ^0.7.0
  flutter_code_editor: ^0.3.0
  provider: ^6.1.0
  file_picker: ^8.0.0
  path_provider: ^2.1.0
  pdf: ^3.10.0
  printing: ^5.12.0
```

### 4.3 Prototype Features

| Feature | Priority |
|---------|----------|
| Basic markdown editor | Must have |
| Live preview | Must have |
| Light/dark theme | Must have |
| Tab management | Should have |
| File open/save | Should have |
| PDF export | Nice to have |
| Windows exe build | Must have |
| Web build | Must have |
| Mobile build | Should have |

### 4.4 Evaluation Criteria

| Metric | Target |
|--------|--------|
| Windows exe size | <50MB |
| Web initial load | <500KB |
| Cold start time | <2s |
| Editor typing latency | <16ms |

### 4.5 Flutter vs Tauri Comparison

| Aspect | Flutter | Tauri + React |
|--------|---------|---------------|
| Mobile support | ✅ Excellent | ❌ Requires separate app |
| Web performance | ⚠️ Good, larger | ✅ Excellent, small |
| Desktop bundle | ⚠️ ~30-50MB | ✅ ~5-10MB |
| Native feel | ⚠️ Custom rendering | ✅ System WebView |
| Code reuse | ✅ 100% shared | ⚠️ Some platform-specific |

---

## Implementation Timeline

### Phase 1: V4 Critical Fixes (Week 1)
- Fix PDF/markdown multitab bug
- Implement startup optimizations
- Add debounced preview rendering

### Phase 2: Platform Adapters (Week 2)
- Create adapter structure
- Migrate file operations
- Migrate conversions

### Phase 3: UI Improvements (Week 3)
- Add design tokens
- Improve component accessibility
- Add keyboard navigation

### Phase 4: Flutter Prototype (Weeks 2-4, parallel)
- Set up Flutter project
- Implement basic editor
- Build Windows and Web versions
- Document findings

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Multitab fix causes regressions | Comprehensive test suite before changes |
| Performance optimizations break features | Incremental changes with benchmarks |
| Flutter proves unsuitable | 30% effort limit, V4 remains primary |
| Platform adapter migration too slow | Phased approach, each phase independent |

---

## Success Metrics

- [ ] Multitab functionality working correctly
- [ ] Startup time < 2 seconds
- [ ] No perceived editor lag with files < 1MB
- [ ] Preview renders in < 200ms
- [ ] Bundle size reduced by 30%+
- [ ] Platform adapters for fs, convert, pdf implemented
- [ ] Design tokens applied to all components
- [ ] Flutter prototype running on Windows + Web
- [ ] Flutter evaluation documented with recommendation

---

*Document generated: 2026-03-24*
*Next step: Create detailed implementation plan*
