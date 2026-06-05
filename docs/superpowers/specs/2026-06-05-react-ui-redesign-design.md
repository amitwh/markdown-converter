# MarkdownConverter — React + shadcn/ui UI Redesign

**Date:** 2026-06-05
**Status:** Design (awaiting user approval)
**Branch:** `react-electron`
**Author:** Brainstormed with user via superpowers:brainstorming

## Summary

Replace the legacy vanilla JS renderer (`src/renderer.js` is 213 KB; `src/styles.css` is 74 KB) with a modern React 19 + Vite + TypeScript + shadcn/ui renderer that achieves visual feature parity while delivering a Polished + Glassy (Raycast/Arc-style) aesthetic. The Electron main process, preload bridge, and IPC contracts stay unchanged. Work proceeds via vertical slices — each PR ships a demoable feature.

## Goals

1. Replace every render-time feature of the legacy renderer with an idiomatic React + shadcn/ui implementation.
2. Adopt the "Polished + Glassy" visual language (subtle shadows, 8–12 px radii, gradient accents, gentle depth) on top of the existing ConcreteInfo brand tokens and design system.
3. Use a single component foundation (shadcn/ui) and a single motion library (Motion / Framer Motion) to keep the dependency surface narrow and the design coherent.
4. Keep the main process, preload, and IPC contracts untouched. The renderer is the only surface being rewritten.
5. Keep the app runnable at every commit. No "big bang" merge.

## Non-Goals

- Migrating the main process to TypeScript (out of scope for this spec).
- Adding new features the legacy renderer does not have (plugin system, AI features, etc. — those are future specs).
- Replacing Pandoc/FFmpeg/ImageMagick orchestration.
- Changing the packaging pipeline (electron-builder config stays).
- Replacing the CodeMirror 6 editor — it is the right tool and is already wired up.

## Decisions Locked During Brainstorming

| Decision | Choice | Why |
|---|---|---|
| Scope | Full feature parity with legacy renderer | User-selected option. Renderer is one cohesive surface; splitting it across specs would force premature contracts. |
| Visual style | **B — Polished + Glassy** (Raycast/Arc aesthetic) | "Fancy" comes from elevation, gradient accents, and material depth — not over-designed visuals. |
| Layout | **2 — IDE-style** (equal editor/preview, draggable divider, collapsible sidebar) | Power-user markdown apps converge on this. Draggable divider + keyboard reset. |
| Modal patterns | **A (Centered Dialog), B (Right Side-Sheet), D (Toasts)** | No command palette. |
| Command palette | **No** — full menus, no ⌘K | Power users can use the OS-level launcher. App stays focused on writing. |
| Animation | **Motion (Framer Motion)** | Best for layout transitions, modal/drawer enter/exit, drag. Sparingly used. |
| Component library | **shadcn/ui** | Tailwind + Radix primitives, copy-paste ownership, perfect fit for the "glassy" aesthetic and the HSL-CSS-variable foundation that is already in place. |
| Implementation strategy | **Vertical slices** — one feature end-to-end per PR | App stays runnable. Each PR is reviewable. |

## Defaults (Used Unless Overridden Later)

| Item | Default | Why |
|---|---|---|
| State management | Zustand (already in deps) + Immer for nested patches | Already in `package.json`; perfect for editor state. |
| Theming | shadcn `next-themes`, dark default + light, system-aware | shadcn canonical pattern. Brand colors already in CSS vars. |
| Icons | `lucide-react` (already in deps) | 1000+ tree-shakable icons. |
| Forms | `react-hook-form` + `zod` | Standard for shadcn forms. |
| Drag/drop | `@dnd-kit/core` | De facto React drag lib (file tree reordering, divider resize). |
| Testing | Vitest + RTL + Playwright (E2E + visual regression) | Standard for React + Electron. |
| TypeScript | Strict mode (already wired) | Already in deps and `vite.renderer.config.ts`. |

## Architecture

The Electron app keeps its existing process model. Only the renderer is rewritten.

```
┌──────────────────────────────────────────────────────────┐
│  Electron Main (UNCHANGED)                                │
│  - BrowserWindow, IPC handlers, file/fs ops               │
│  - Pandoc, FFmpeg, ImageMagick orchestration              │
└────────────┬─────────────────────────────────────────────┘
             │ contextBridge (UNCHANGED preload.js)
┌────────────▼─────────────────────────────────────────────┐
│  React Renderer (REWRITTEN)                                │
│  ┌────────────────────────────────────────────────────┐  │
│  │  AppShell (layout)                                  │  │
│  │  ├─ MenuBar (native)                                │  │
│  │  ├─ AppHeader (logo, breadcrumbs, theme toggle)     │  │
│  │  ├─ TabBar (open files)                             │  │
│  │  ├─ Toolbar (formatting)                            │  │
│  │  ├─ ResizablePaneGroup (sidebar | editor | preview) │  │
│  │  │   ├─ Sidebar (file tree, outline)                │  │
│  │  │   ├─ EditorPane (CodeMirror 6)                   │  │
│  │  │   └─ PreviewPane (marked + KaTeX + Mermaid)      │  │
│  │  ├─ StatusBar (word count, encoding, cursor pos)    │  │
│  │  └─ ModalLayer (Dialog, SideSheet, Toaster)         │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Feature Modules (each owns UI + state slice)       │  │
│  │  ├─ editor/    CodeMirror wrapper, syntax, themes   │  │
│  │  ├─ preview/   markdown→html, KaTeX, Mermaid       │  │
│  │  ├─ tabs/      open files, dirty state              │  │
│  │  ├─ sidebar/   file tree, outline, search results   │  │
│  │  ├─ modals/    export, settings, about, etc.        │  │
│  │  ├─ tools/     zen, repl, ascii-gen, table-gen      │  │
│  │  └─ export/    pdf, docx, html, image batch         │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Shared Infrastructure                              │  │
│  │  ├─ stores/  Zustand slices per feature             │  │
│  │  ├─ hooks/   useFile, useEditor, useTheme, etc.     │  │
│  │  ├─ lib/     cn, ipc, formatters, validators        │  │
│  │  ├─ ui/      shadcn primitives: button, dialog…     │  │
│  │  └─ types/   shared TS types                        │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Architectural Rules

- **Shell components** (`AppHeader`, `TabBar`, `StatusBar`) subscribe only to `useAppStore`.
- **Feature components** subscribe to their own feature's store.
- **Cross-feature access** goes through hooks, not direct store imports (e.g., `useFileTree()` wraps `useFileStore`).
- **Feature modules are self-contained** — each owns its components, its Zustand slice, and its types. Safe to develop in parallel later.
- **No direct `window.electronAPI` calls** from feature code. All IPC goes through `lib/ipc.ts` for type safety and error normalization.

## State Management

```
stores/
├─ useAppStore        // global UI: theme, sidebar, pane sizes, modals open
├─ useFileStore       // file system: tree, open files, active tab
├─ useEditorStore     // editor: per-file content, cursor, selection, dirty
├─ usePreviewStore    // preview: scroll sync, zoom, theme
├─ useSettingsStore   // user prefs (persisted to electron-store)
└─ useCommandStore    // menu actions registry, recent actions
```

**Why slices instead of one mega-store?** Editor content can be megabytes. Keeping it in its own slice lets React avoid re-rendering the preview when only the editor changes — components subscribe with selectors.

**Persistent state** (auto-saved to electron-store via Zustand `persist` middleware): theme, sidebar visibility, last open files, pane divider positions, settings.

**Ephemeral state** (lost on quit): active modal, hover states, search query, current file content (saved to disk on idle).

## Visual Design System

### Color Tokens

The existing `globals.css` HSL variables stay. Additions for the "glassy" aesthetic:

```css
--shadow-sm: 0 1px 2px rgba(13, 11, 9, 0.06);
--shadow-md: 0 4px 12px rgba(13, 11, 9, 0.08), 0 0 0 1px rgba(13, 11, 9, 0.04);
--shadow-lg: 0 12px 32px rgba(13, 11, 9, 0.12), 0 0 0 1px rgba(13, 11, 9, 0.06);
--shadow-glow-brand: 0 0 24px rgba(229, 70, 31, 0.25);

--glass-bg-light: rgba(255, 255, 255, 0.72);
--glass-bg-dark:  rgba(13, 11, 9, 0.72);
--glass-border-light: rgba(255, 255, 255, 0.4);
--glass-border-dark:  rgba(255, 255, 255, 0.08);
```

### shadcn Components

Install via `npx shadcn@latest add`:

**Primitives** (need all of these): `button`, `dialog`, `sheet`, `popover`, `tooltip`, `select`, `dropdown-menu`, `tabs`, `separator`, `scroll-area`, `toggle`, `switch`, `slider`, `input`, `textarea`, `label`, `form`, `skeleton`, `sonner`, `command`.

**Composite** (custom-built on top of primitives): `file-tree`, `pane-group`, `divider`, `status-bar`, `menu-bar`, `toast`.

### Typography

- Body: Plus Jakarta Sans 15 px / line-height 1.6
- Code: JetBrains Mono 13.5 px
- Display: Barlow Condensed 700/800 — used sparingly (page titles, big metrics)
- Headings: Plus Jakarta Sans 600/700 with tight letter-spacing
- Labels (`.label`): Plus Jakarta Sans 500, 12 px, uppercase, 0.05 em letter-spacing

### Motion Choreography

| Element | Motion | Duration | Easing |
|---|---|---|---|
| Modal (Dialog A) | Scale 0.96→1, opacity 0→1 | 200 ms | `ease-out` |
| Side sheet (B) | TranslateX 100%→0, opacity 0→1 | 300 ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Toast | TranslateY 100%→0, opacity | 250 ms | spring(stiffness: 300, damping: 30) |
| Sidebar toggle | Width 264 px↔72 px, content fade | 250 ms | `ease-in-out` |
| Divider drag | Live width update | 0 ms | none (instant) |
| Theme switch | CSS variables, opacity overlay | 300 ms | `ease-in-out` |
| Tab switch | Underline slide | 200 ms | `ease-out` |
| Hover (buttons) | `bg` + `shadow` shift | 150 ms | `ease-out` |
| Focus ring | Outline grow | 100 ms | `ease-out` |

**Rules:** Every motion has a purpose. No gratuitous animation. Respects `prefers-reduced-motion` (Motion handles this automatically).

### Empty / Loading / Error States

Every async surface ships all three. Sonner toasts for ephemeral feedback. Skeleton screens for content areas. Empty-state components with icon + message + primary CTA.

## Modal/Overlay Patterns

| Use case | Pattern | Why |
|---|---|---|
| Export (PDF/DOCX/HTML) | A — Centered Dialog | Focused decision, ~3–5 fields, "do one thing" |
| Settings | B — Right Side-Sheet | Long form, tabbed sections, stays open while editing |
| Find/Replace | Inline toolbar (not modal) | Always-visible utility |
| About | A — Centered Dialog | Tiny info dump |
| Confirm destructive (delete, close unsaved) | A — Centered Dialog | Forces attention |
| File save error | D — Toast | Non-blocking info |
| Pandoc/FFmpeg progress | D — Toast → sticky on >3 s | Background work feedback |
| Plugin manager | B — Right Side-Sheet | Lists + per-item actions |
| ASCII/Table generators | A — Centered Dialog | Tool-style focused input → output |
| Print preview | A — Centered Dialog | Full-screen-ish modal overlay |
| Welcome (first launch) | A — Centered Dialog | One-time onboarding |
| Word export | A — Centered Dialog | Template selection |
| Zen mode | Full-viewport toggle (no modal) | Replaces the editor entirely |
| REPL | Bottom-pinned panel (split-pane) | Persistent terminal-like UI |
| Quick file open | B — Right Side-Sheet | File tree, search, recent |

### Dialog A Anatomy (Export as example)

```
┌─ Backdrop (rgba(13,11,9,0.45) + backdrop-blur 4px) ─────────┐
│                                                            │
│   ┌──── Modal (max-w-md, rounded-2xl, shadow-lg) ─────┐    │
│   │ ┌── Header ────────────────────────────────────┐  │    │
│   │ │ [Icon] Export as PDF                  [×]    │  │    │
│   │ │ Choose format options                       │  │    │
│   │ └─────────────────────────────────────────────┘  │    │
│   │ ┌── Body ──────────────────────────────────────┐  │    │
│   │ │ Format: [Letter] [A4] [Legal]                │  │    │
│   │ │ Margins: ────●────                           │  │    │
│   │ │ ☐ Include table of contents                  │  │    │
│   │ │ ☐ Embed fonts                                │  │    │
│   │ └─────────────────────────────────────────────┘  │    │
│   │ ┌── Footer ────────────────────────────────────┐  │    │
│   │ │                       [Cancel] [Export →]    │  │    │
│   │ └─────────────────────────────────────────────┘  │    │
│   └──────────────────────────────────────────────────┘    │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Side-Sheet B Anatomy (Settings as example)

Slides in from right, ~50 % width (max 560 px). Backdrop is `rgba(13,11,9,0.2)` with `backdrop-blur(2 px)` (lighter than dialog — the sheet is the focus). Tab navigation in the sheet header (Editor / Theme / Export / Plugins / About).

### Toast D Anatomy (Sonner)

Stacked bottom-right, max 3 visible. Glass background. Color-coded 3 px left border — success `#1a7a56`, error `#ef4444`, info `#0ea5e9`, warning `#eab308`. Icon + title + description. Optional action button. Auto-dismiss 4 s for success, sticky for error.

## Data Flow (Editor → Preview Pipeline)

```
User types
  ↓
CodeMirror onChange
  ↓
useEditorStore.updateContent(tabId, content)  ← debounced 50 ms
  ↓
┌─ Persist to electron-store on idle (1 s) ─┐
│                                            │
└─ Publish to usePreviewStore (subscribed) ─┘
  ↓
marked(content) → sanitized HTML
  ↓
PreviewPane renders HTML
  KaTeX post-processes $...$
  Mermaid post-processes ```mermaid
  Highlight.js post-processes ```lang
  ↓
useEffect: scroll-sync editor cursor → preview position
```

**Bidirectional scroll sync:** editor scroll → preview (primary), preview click → editor cursor (secondary). Throttled to 60 fps via `requestAnimationFrame`.

## IPC Contract

The preload bridge stays unchanged. A new `src/renderer/lib/ipc.ts` wraps every channel with TypeScript types and normalizes errors to a discriminated union:

```ts
type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export const ipc = {
  file: {
    open: (): Promise<IpcResult<FileResult>>,
    read: (path: string): Promise<IpcResult<string>>,
    write: (path: string, content: string): Promise<IpcResult<void>>,
    list: (dir: string): Promise<IpcResult<FileEntry[]>>,
    onChange: (cb: (path: string) => void) => () => void,
  },
  export: {
    pdf: (opts: PdfOptions): Promise<IpcResult<ExportResult>>,
    docx: (opts: DocxOptions): Promise<IpcResult<ExportResult>>,
    html: (opts: HtmlOptions): Promise<IpcResult<ExportResult>>,
    batch: (items: BatchItem[], opts: BatchOptions): Promise<IpcResult<BatchResult>>,
  },
  app: {
    getVersion: (): Promise<IpcResult<string>>,
    openExternal: (url: string): Promise<IpcResult<void>>,
    showItemInFolder: (path: string): Promise<IpcResult<void>>,
  },
};
```

## Error Handling

Layered defense — no single failure can crash the app:

1. **IPC errors** → caught in `lib/ipc.ts` wrapper, returned as `IpcResult<T>` discriminated union. Components show toast on error.
2. **Component errors** → React error boundary per feature area (one for editor, one for preview, one for modals). On error: show inline error UI with "Reload this panel" + "Copy details" actions.
3. **Async operations** (export, file ops) → loading state on button + toast on completion. Long ops (>2 s) get a sticky toast with cancel.
4. **Validation errors** (settings, export options) → inline form errors via `react-hook-form` + `zod`. shadcn `Form` component for consistent error display.
5. **Pandoc/FFmpeg missing** → detected at startup, banner + disable export menu items. Don't surprise-fail at export time.

## Testing Strategy

- **Unit (Vitest):** stores, hooks, lib utilities, formatters, validators
- **Component (Vitest + RTL):** shadcn wrappers, dialog interactions, sidebar toggle, divider drag, theme toggle
- **Integration (Vitest + RTL):** editor ↔ preview flow, file open → tab add → content display, settings change persists
- **E2E (Playwright):** app launches, file opens, markdown renders, export to PDF works
- **Visual regression (Playwright snapshots):** locked-in screenshots for header, sidebar, dialogs, toasts — catch accidental style drift
- **Target coverage:** stores/hooks/lib ≥ 90 %, components ≥ 75 %, E2E covers all critical paths

## Accessibility (WCAG 2.1 AA)

Baked in via shadcn + Radix:

- All dialogs focus-trap, Esc to close, return focus to trigger
- All interactive elements keyboard-reachable
- Visible focus rings (2 px brand ring)
- 4.5:1 contrast minimum (already met by brand colors)
- `aria-label` on icon buttons, `role="alert"` on toasts
- Respects `prefers-reduced-motion` (Motion handles this automatically)

## Implementation Phases (Vertical Slices)

Each phase is a shippable PR that keeps the app runnable. The legacy `renderer.js` is gradually replaced; until each phase is complete, the old renderer code still runs the missing parts.

| # | Phase | Output | Acceptance |
|---|---|---|---|
| 1 | **Foundation** | shadcn installed; `next-themes`, `motion`, `react-hook-form`, `zod`, `dnd-kit`, `sonner` installed; design tokens finalized; `lib/utils.ts` (`cn`), `lib/ipc.ts` typed wrappers, `lib/motion.ts` preset transitions, `app.tsx` shell skeleton renders | `npm run build` succeeds; dev server shows the new shell with theme toggle working |
| 2 | **App shell + layout** | `AppHeader`, `TabBar`, `Toolbar`, `Breadcrumb`, `StatusBar`, `ResizablePaneGroup` with sidebar toggle and draggable divider. Empty editor/preview panes. | Resize divider with mouse and arrow keys; sidebar collapses; pane sizes persist. |
| 3 | **Editor pane** | CodeMirror 6 wrapped, dark/light themes wired to shadcn theme, syntax highlighting, line numbers, search, autocomplete | Open `.md` file → renders in editor; can edit and save. |
| 4 | **Preview pane** | marked + DOMPurify + KaTeX + Mermaid + highlight.js. Bidirectional scroll sync with editor. | Open file → preview renders, follows cursor. |
| 5 | **File tree + tabs** | Sidebar file tree (open from disk, lazy load). Tabs for open files. Dirty state indicator. | Open folder → tree populates; click file → opens in tab; close tab reverts dirty. |
| 6 | **Native menus + toolbar** | Replace the legacy `CommandPalette` with full menus (File / Edit / View / Insert / Format / Tools / Help) bound to keyboard shortcuts. Toolbar buttons. | All menu items invoke the right action; shortcuts work; toolbar reflects active state. |
| 7 | **Modals** | Export dialog (PDF/DOCX/HTML/batch), Settings side-sheet (Editor/Theme/Export/Plugins/About tabs), About dialog, Confirm-destructive dialog | All dialogs and sheet render with proper motion; settings persist; export works end-to-end. |
| 8 | **Toasts** | Sonner wired into all async operations (save, export, errors, tool missing) | All operations give appropriate feedback; no silent failures. |
| 9 | **Advanced tools** | Zen mode (full-viewport toggle), REPL (bottom-pinned panel), ASCII generator, Table generator, Word export template picker, Print preview | Each tool is feature-complete vs. legacy version. |
| 10 | **Polish + delete legacy** | Visual regression snapshots locked; remove `renderer.js` and old `styles*.css` references from build; `npm run build:linux` produces a working installer | Final PR ships an installer with no legacy code paths. |

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| shadcn CLI requires Vite (not vanilla Electron renderer) | Vite is already configured for the renderer in `vite.renderer.config.ts`; the CLI works against the same project. |
| shadcn CLI assumes Tailwind is at project root; we have it in renderer/ only | Point the CLI at `src/renderer/components.json` and set `tailwind.css` to the right path. |
| Marked + KaTeX + Mermaid + highlight.js together is heavy | Lazy-load Mermaid (only when `mermaid` code block encountered). KaTeX is loaded once, cached. |
| Editor content state can be megabytes → re-render storms | Editor content lives in its own slice; preview subscribes to a derived/cached HTML string; components use `useShallow` / selector subscriptions. |
| Bidirectional scroll sync loops | `useEffect` debounce + ignore if cursor/selection is the sync source. |
| CodeMirror 6 doesn't ship a Tailwind theme by default | Use `@codemirror/theme-one-dark` for dark; build a custom theme that pulls from CSS variables for light. |
| The legacy `renderer.js` and `styles*.css` are referenced from `index.html` (now `src/renderer/index.html`) | Phase 10 deletes the references; until then, both run side-by-side and the new React app sits in a known root div. |
| Electron `nodeIntegration` is off; we use contextBridge | Already the case. Document the contract clearly in `lib/ipc.ts`. |

## Open Questions (to confirm before implementation)

None. All major decisions are locked. Defaults will be used unless the user overrides them when reviewing the implementation plan.

## References

- `src/renderer.js` (213 KB) — legacy renderer being replaced
- `src/styles.css` (74 KB), `src/styles-modern.css` (71 KB), `src/styles-concreteinfo.css` (21 KB) — legacy styles being replaced
- `src/renderer/styles/globals.css` — already shadcn-compatible (HSL CSS variables)
- `src/renderer/App.tsx` — empty skeleton that references components we will build
- `tailwind.config.js` — brand colors and fonts already defined
- `vite.renderer.config.ts` — Vite + React plugin already configured
- `package.json` — CodeMirror 6, TanStack Table, lucide-react, cva, clsx, tailwind-merge, tailwindcss-animate already installed
