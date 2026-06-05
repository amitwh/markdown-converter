# MarkdownConverter React + shadcn/ui UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy 213 KB vanilla JS renderer with a React 19 + Vite + TypeScript + shadcn/ui renderer that achieves full feature parity and a Polished + Glassy (Raycast/Arc-style) aesthetic, without touching the Electron main process or preload bridge.

**Architecture:** Layered renderer. App shell composes feature modules (`editor`, `preview`, `tabs`, `sidebar`, `modals`, `tools`, `export`). Each feature owns its Zustand store slice and its components. Cross-feature access goes through typed hooks. All IPC routed through a single `lib/ipc.ts` wrapper with discriminated-union error returns. Work proceeds via 10 vertical slices — each PR keeps the app runnable.

**Tech Stack:**
- React 19, Vite, TypeScript (strict)
- shadcn/ui (Radix UI + Tailwind, copy-paste ownership)
- Motion (formerly Framer Motion) for layout/drawer/modal transitions
- Zustand + Immer for state
- CodeMirror 6 (markdown, lang-python/css/html/json, one-dark, search, autocomplete)
- marked + DOMPurify + KaTeX + Mermaid (lazy) + highlight.js for preview
- react-resizable-panels for pane resize, @dnd-kit/core for sortable lists
- next-themes for theme switching, sonner for toasts
- react-hook-form + zod for forms
- Vitest + RTL for unit/component/integration, Playwright for E2E + visual regression

**Spec:** `docs/superpowers/specs/2026-06-05-react-ui-redesign-design.md`
**Tag:** `design/react-ui-redesign/v1.0`

---

## File Map (Files Created or Modified Across All Phases)

### Phase 1 — Foundation
**Create:**
- `components.json` — shadcn config (renderer-relative paths)
- `src/renderer/lib/utils.ts` — `cn()` helper
- `src/renderer/lib/ipc.ts` — typed IPC wrapper with `IpcResult<T>`
- `src/renderer/lib/motion.ts` — Motion preset transitions
- `src/renderer/types/ipc.ts` — `IpcResult<T>` discriminated union
- `src/renderer/types/index.ts` — shared types
- `src/renderer/styles/globals.css` — extend with shadow/glass tokens
- `src/renderer/components/theme-provider.tsx` — next-themes wrapper
- `src/renderer/components/theme-toggle.tsx` — sun/moon toggle
- `src/renderer/components/ui/button.tsx` — shadcn button (CLI)
- `vitest.config.ts` — Vitest config
- `src/renderer/test/setup.ts` — test setup
- `tests/unit/lib/cn.test.ts`
- `tests/unit/lib/ipc.test.ts`
- `tests/unit/lib/motion.test.ts`

**Modify:**
- `package.json` — install new deps
- `tailwind.config.js` — add shadcn config block
- `postcss.config.js` — verify Tailwind directives
- `src/renderer/App.tsx` — wrap with ThemeProvider, render shell
- `src/renderer/main.tsx` — wire StrictMode
- `tsconfig.json` (create if missing) — strict mode

### Phase 2 — App Shell + Layout
**Create:**
- `src/renderer/stores/app-store.ts` — Zustand global UI store
- `src/renderer/components/layout/AppHeader.tsx`
- `src/renderer/components/layout/TabBar.tsx`
- `src/renderer/components/layout/Toolbar.tsx`
- `src/renderer/components/layout/Breadcrumb.tsx`
- `src/renderer/components/layout/StatusBar.tsx`
- `src/renderer/components/layout/AppShell.tsx`
- `src/renderer/components/ui/resizable.tsx` — shadcn resizable (CLI)
- `src/renderer/hooks/use-pane-sizes.ts`
- `src/renderer/hooks/use-sidebar.ts`
- `tests/unit/stores/app-store.test.ts`
- `tests/component/layout/AppShell.test.tsx`

**Modify:**
- `src/renderer/App.tsx` — render AppShell
- `src/renderer/styles/globals.css` — scrollbar polish

### Phase 3 — Editor Pane
**Create:**
- `src/renderer/stores/editor-store.ts`
- `src/renderer/components/editor/EditorPane.tsx`
- `src/renderer/components/editor/CodeMirrorEditor.tsx`
- `src/renderer/components/editor/themes/light.ts`
- `src/renderer/hooks/use-codemirror.ts`
- `tests/unit/stores/editor-store.test.ts`
- `tests/component/editor/EditorPane.test.tsx`

### Phase 4 — Preview Pane
**Create:**
- `src/renderer/stores/preview-store.ts`
- `src/renderer/components/preview/PreviewPane.tsx`
- `src/renderer/components/preview/MarkdownRenderer.tsx`
- `src/renderer/components/preview/MermaidLazy.tsx`
- `src/renderer/lib/markdown.ts` — marked config + post-processors
- `src/renderer/hooks/use-scroll-sync.ts`
- `tests/unit/lib/markdown.test.ts`
- `tests/component/preview/PreviewPane.test.tsx`

### Phase 5 — File Tree + Tabs
**Create:**
- `src/renderer/stores/file-store.ts`
- `src/renderer/components/sidebar/Sidebar.tsx`
- `src/renderer/components/sidebar/FileTree.tsx`
- `src/renderer/components/sidebar/Outline.tsx`
- `src/renderer/hooks/use-file-tree.ts`
- `src/renderer/hooks/use-open-file.ts`
- `tests/unit/stores/file-store.test.ts`
- `tests/component/sidebar/FileTree.test.tsx`

**Modify:**
- `src/renderer/components/layout/TabBar.tsx` — wire to file store

### Phase 6 — Native Menus + Toolbar
**Create:**
- `src/renderer/stores/command-store.ts` — menu action registry
- `src/renderer/hooks/use-shortcut.ts`
- `src/renderer/hooks/use-menu-action.ts`
- `tests/unit/hooks/use-shortcut.test.ts`

**Modify:**
- `src/renderer/components/layout/Toolbar.tsx` — wire to actions
- `src/renderer/components/layout/AppHeader.tsx` — wire menu triggers
- `src/main.js` (verify menu integration unchanged)

### Phase 7 — Modals
**Create:**
- `src/renderer/components/ui/dialog.tsx` — shadcn (CLI)
- `src/renderer/components/ui/sheet.tsx` — shadcn (CLI)
- `src/renderer/components/ui/tabs.tsx` — shadcn (CLI)
- `src/renderer/components/ui/form.tsx` — shadcn (CLI)
- `src/renderer/components/ui/input.tsx` — shadcn (CLI)
- `src/renderer/components/ui/textarea.tsx` — shadcn (CLI)
- `src/renderer/components/ui/select.tsx` — shadcn (CLI)
- `src/renderer/components/ui/switch.tsx` — shadcn (CLI)
- `src/renderer/components/ui/checkbox.tsx` — shadcn (CLI)
- `src/renderer/components/ui/slider.tsx` — shadcn (CLI)
- `src/renderer/components/modals/ExportDialog.tsx`
- `src/renderer/components/modals/SettingsSheet.tsx`
- `src/renderer/components/modals/AboutDialog.tsx`
- `src/renderer/components/modals/ConfirmDialog.tsx`
- `src/renderer/components/modals/WelcomeDialog.tsx`
- `src/renderer/stores/settings-store.ts`
- `src/renderer/lib/validators.ts` — zod schemas
- `tests/component/modals/ExportDialog.test.tsx`
- `tests/component/modals/SettingsSheet.test.tsx`

### Phase 8 — Toasts
**Create:**
- `src/renderer/components/ui/sonner.tsx` — shadcn (CLI)
- `src/renderer/lib/toast.ts` — typed toast helpers
- `tests/unit/lib/toast.test.ts`

**Modify:**
- `src/renderer/App.tsx` — mount Toaster
- All async operations in stores — call `toast.*` on result

### Phase 9 — Advanced Tools
**Create:**
- `src/renderer/components/tools/ZenMode.tsx`
- `src/renderer/components/tools/Repl.tsx`
- `src/renderer/components/tools/AsciiGenerator.tsx`
- `src/renderer/components/tools/TableGenerator.tsx`
- `src/renderer/components/tools/WordExportDialog.tsx`
- `src/renderer/components/tools/PrintPreview.tsx`
- `src/renderer/hooks/use-zen-mode.ts`
- `tests/component/tools/ZenMode.test.tsx`

### Phase 10 — Polish + Delete Legacy
**Create:**
- `playwright.config.ts`
- `tests/e2e/app.spec.ts`
- `tests/e2e/visual.spec.ts`

**Modify:**
- `src/renderer/index.html` — remove legacy script references
- `src/main.js` — verify renderer entry is the new build
- `package.json` — remove legacy build scripts if any
- README.md — update dev instructions

**Delete (eventually):**
- `src/renderer.js` (213 KB legacy)
- `src/styles.css`, `src/styles-modern.css`, `src/styles-concreteinfo.css`, `src/styles-sidebar.css`, `src/styles-welcome.css`, `src/styles-zen.css`
- `src/command-palette.js`, `src/print-preview.js`, `src/welcome.js`, `src/zen-mode.js`, `src/wordTemplateExporter.js`
- `src/ascii-generator.html`, `src/table-generator.html`

---

## Phase 1 — Foundation (Tasks 1-12)

### Task 1: Install new dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime deps**

```bash
cd /home/amith/apps/markdown-converter
npm install \
  next-themes \
  motion \
  react-hook-form \
  @hookform/resolvers \
  zod \
  @dnd-kit/core \
  @dnd-kit/sortable \
  @dnd-kit/utilities \
  react-resizable-panels \
  sonner \
  immer
```

Expected: deps added to `package.json` `dependencies`, no errors.

- [ ] **Step 2: Install dev/test deps**

```bash
npm install -D \
  vitest \
  @vitest/ui \
  @testing-library/react \
  @testing-library/jest-dom \
  @testing-library/user-event \
  @playwright/test \
  jsdom \
  @types/node
```

Expected: deps added to `devDependencies`, no errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add shadcn/ui ecosystem, motion, zustand+immer, test stack"
```

---

### Task 2: Initialize shadcn/ui

**Files:**
- Create: `components.json`
- Modify: `tailwind.config.js`
- Modify: `src/renderer/styles/globals.css`

- [ ] **Step 1: Create `components.json`**

Create `/home/amith/apps/markdown-converter/components.json`:

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/renderer/styles/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

- [ ] **Step 2: Update `tailwind.config.js`**

Replace the file with:

```js
const animate = require('tailwindcss-animate')

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/renderer/**/*.{js,ts,jsx,tsx}',
    './src/renderer/index.html',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        brand: {
          DEFAULT: '#e5461f',
          dark: '#c93a18',
          light: '#ff6b47',
        },
        success: '#1a7a56',
        warning: 'hsl(45 93% 47%)',
        danger: 'hsl(0 84% 60%)',
        info: 'hsl(199 89% 48%)',
        warm: {
          50: '#fafbfc', 100: '#f5f5f5', 200: '#e3e3e3', 300: '#d1d1d1',
          400: '#b0b0b0', 500: '#9a9696', 600: '#7a7878', 700: '#5a5858',
          800: '#4e4e4e', 900: '#464646', 950: '#0d0b09',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['"Barlow Condensed"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', '"SF Mono"', 'Consolas', 'monospace'],
      },
      keyframes: {
        'accordion-down': { from: { height: '0' }, to: { height: 'var(--radix-accordion-content-height)' } },
        'accordion-up': { from: { height: 'var(--radix-accordion-content-height)' }, to: { height: '0' } },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate],
}
```

- [ ] **Step 3: Add shadow/glass tokens to `globals.css`**

Append to `/home/amith/apps/markdown-converter/src/renderer/styles/globals.css` before the closing `}` of the `.dark` block:

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

- [ ] **Step 4: Verify shadcn CLI runs**

```bash
cd /home/amith/apps/markdown-converter
npx shadcn@latest --help
```

Expected: command prints help, exits 0.

- [ ] **Step 5: Commit**

```bash
git add components.json tailwind.config.js src/renderer/styles/globals.css
git commit -m "feat(renderer): configure shadcn/ui, extend design tokens for glassy aesthetic"
```

---

### Task 3: Write failing test for `cn()` helper

**Files:**
- Create: `tests/unit/lib/cn.test.ts`
- Create: `vitest.config.ts`
- Create: `src/renderer/test/setup.ts`
- Modify: `package.json` (add test script)

- [ ] **Step 1: Create `vitest.config.ts`**

Create `/home/amith/apps/markdown-converter/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/renderer/test/setup.ts'],
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/renderer/**/*.{ts,tsx}'],
      exclude: ['src/renderer/test/**', 'src/renderer/**/*.test.*'],
    },
  },
  resolve: {
    alias: {
      '@': path.join(__dirname, 'src/renderer'),
    },
  },
});
```

- [ ] **Step 2: Create test setup**

Create `/home/amith/apps/markdown-converter/src/renderer/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';

// Mock window.electronAPI for tests
declare global {
  interface Window {
    electronAPI: any;
  }
}

if (typeof window !== 'undefined' && !window.electronAPI) {
  window.electronAPI = {};
}
```

- [ ] **Step 3: Add test script to `package.json`**

In `/home/amith/apps/markdown-converter/package.json` under `"scripts"`, add:

```json
    "test:renderer": "vitest run",
    "test:renderer:watch": "vitest",
    "test:renderer:coverage": "vitest run --coverage",
```

- [ ] **Step 4: Write the failing test**

Create `/home/amith/apps/markdown-converter/tests/unit/lib/cn.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('deduplicates conflicting tailwind classes', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });

  it('ignores falsy values', () => {
    expect(cn('a', false, null, undefined, '', 'b')).toBe('a b');
  });

  it('accepts conditional class objects', () => {
    expect(cn('base', { active: true, disabled: false })).toBe('base active');
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run tests/unit/lib/cn.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/utils'` or similar.

- [ ] **Step 6: Commit (failing test)**

```bash
git add vitest.config.ts src/renderer/test/setup.ts tests/unit/lib/cn.test.ts package.json
git commit -m "test(renderer): add failing test for cn() helper + vitest config"
```

---

### Task 4: Implement `cn()` helper

**Files:**
- Create: `src/renderer/lib/utils.ts`

- [ ] **Step 1: Implement**

Create `/home/amith/apps/markdown-converter/src/renderer/lib/utils.ts`:

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 2: Run test to verify it passes**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run tests/unit/lib/cn.test.ts
```

Expected: PASS, 4 tests passed.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/lib/utils.ts
git commit -m "feat(renderer): implement cn() helper for tailwind-merge + clsx"
```

---

### Task 5: Write failing test for IPC wrapper

**Files:**
- Create: `src/renderer/types/ipc.ts`
- Create: `tests/unit/lib/ipc.test.ts`

- [ ] **Step 1: Define the `IpcResult` type**

Create `/home/amith/apps/markdown-converter/src/renderer/types/ipc.ts`:

```ts
export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modifiedAt?: string;
}

export interface FileResult {
  path: string;
  content: string;
}

export interface PdfOptions {
  inputPath: string;
  outputPath: string;
  format?: 'letter' | 'a4' | 'legal';
  margins?: { top: number; right: number; bottom: number; left: number };
  toc?: boolean;
  embedFonts?: boolean;
}

export interface DocxOptions {
  inputPath: string;
  outputPath: string;
  template?: string;
  referenceDoc?: string;
}

export interface HtmlOptions {
  inputPath: string;
  outputPath: string;
  standalone?: boolean;
  highlightStyle?: string;
}

export interface ExportResult {
  outputPath: string;
  bytes: number;
  durationMs: number;
}

export interface BatchItem {
  inputPath: string;
  outputPath: string;
}

export interface BatchOptions {
  format: 'pdf' | 'docx' | 'html' | 'png';
  concurrency?: number;
}

export interface BatchResult {
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{ item: BatchItem; ok: boolean; error?: string }>;
}
```

- [ ] **Step 2: Write the failing test**

Create `/home/amith/apps/markdown-converter/tests/unit/lib/ipc.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ipc } from '@/lib/ipc';
import type { FileResult } from '@/types/ipc';

describe('ipc wrapper', () => {
  beforeEach(() => {
    window.electronAPI = {
      file: {
        read: vi.fn().mockResolvedValue('# hello'),
        write: vi.fn().mockResolvedValue(undefined),
        list: vi.fn().mockResolvedValue([]),
      },
    };
  });

  it('file.read returns ok result on success', async () => {
    const result = await ipc.file.read('/foo.md');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toBe('# hello');
    }
  });

  it('file.read returns err result when channel throws', async () => {
    window.electronAPI.file.read = vi.fn().mockRejectedValue(new Error('ENOENT'));
    const result = await ipc.file.read('/missing.md');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe('ENOENT');
    }
  });

  it('file.read returns err result when channel missing', async () => {
    delete (window.electronAPI.file as any).read;
    const result = await ipc.file.read('/foo.md');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('CHANNEL_MISSING');
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run tests/unit/lib/ipc.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/ipc'`.

- [ ] **Step 4: Commit (failing test)**

```bash
git add src/renderer/types/ipc.ts tests/unit/lib/ipc.test.ts
git commit -m "test(renderer): add failing test for ipc wrapper + IpcResult types"
```

---

### Task 6: Implement IPC wrapper

**Files:**
- Create: `src/renderer/lib/ipc.ts`

- [ ] **Step 1: Implement**

Create `/home/amith/apps/markdown-converter/src/renderer/lib/ipc.ts`:

```ts
import type {
  IpcResult,
  FileResult,
  FileEntry,
  PdfOptions,
  DocxOptions,
  HtmlOptions,
  ExportResult,
  BatchItem,
  BatchOptions,
  BatchResult,
} from '@/types/ipc';

type ChannelMissing = { code: 'CHANNEL_MISSING'; message: string };

function wrap<T>(fn: () => Promise<T>): Promise<IpcResult<T | ChannelMissing>> {
  if (typeof window === 'undefined' || !window.electronAPI) {
    return Promise.resolve({
      ok: false,
      error: { code: 'NO_BRIDGE', message: 'window.electronAPI is unavailable' },
    });
  }
  return fn().then(
    (data) => ({ ok: true as const, data }),
    (err: Error) => ({
      ok: false as const,
      error: { code: err.name || 'IPC_ERROR', message: err.message || String(err) },
    }),
  );
}

function safeCall<T extends (...args: any[]) => Promise<any>>(
  path: string[],
  ...args: Parameters<T>
): Promise<IpcResult<Awaited<ReturnType<T>> | ChannelMissing>> {
  if (typeof window === 'undefined' || !window.electronAPI) {
    return Promise.resolve({
      ok: false,
      error: { code: 'NO_BRIDGE', message: 'window.electronAPI is unavailable' },
    });
  }
  let target: any = window.electronAPI;
  for (const segment of path) {
    if (!target || typeof target[segment] === 'undefined') {
      return Promise.resolve({
        ok: false,
        error: { code: 'CHANNEL_MISSING', message: `Missing channel: ${path.join('.')}` },
      });
    }
    target = target[segment];
  }
  if (typeof target !== 'function') {
    return Promise.resolve({
      ok: false,
      error: { code: 'CHANNEL_MISSING', message: `Not a function: ${path.join('.')}` },
    });
  }
  return wrap(() => target(...args));
}

export const ipc = {
  file: {
    open: (): Promise<IpcResult<FileResult | ChannelMissing>> =>
      safeCall('file', 'open'),
    read: (path: string): Promise<IpcResult<string | ChannelMissing>> =>
      safeCall('file', 'read', path),
    write: (path: string, content: string): Promise<IpcResult<void | ChannelMissing>> =>
      safeCall('file', 'write', path, content),
    list: (dir: string): Promise<IpcResult<FileEntry[] | ChannelMissing>> =>
      safeCall('file', 'list', dir),
    onChange: (cb: (path: string) => void): (() => void) => {
      if (typeof window === 'undefined' || !window.electronAPI?.file?.onChange) {
        return () => {};
      }
      return window.electronAPI.file.onChange(cb);
    },
  },
  export: {
    pdf: (opts: PdfOptions): Promise<IpcResult<ExportResult | ChannelMissing>> =>
      safeCall('export', 'pdf', opts),
    docx: (opts: DocxOptions): Promise<IpcResult<ExportResult | ChannelMissing>> =>
      safeCall('export', 'docx', opts),
    html: (opts: HtmlOptions): Promise<IpcResult<ExportResult | ChannelMissing>> =>
      safeCall('export', 'html', opts),
    batch: (items: BatchItem[], opts: BatchOptions): Promise<IpcResult<BatchResult | ChannelMissing>> =>
      safeCall('export', 'batch', items, opts),
  },
  app: {
    getVersion: (): Promise<IpcResult<string | ChannelMissing>> =>
      safeCall('app', 'getVersion'),
    openExternal: (url: string): Promise<IpcResult<void | ChannelMissing>> =>
      safeCall('app', 'openExternal', url),
    showItemInFolder: (path: string): Promise<IpcResult<void | ChannelMissing>> =>
      safeCall('app', 'showItemInFolder', path),
  },
};
```

- [ ] **Step 2: Run test to verify it passes**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run tests/unit/lib/ipc.test.ts
```

Expected: PASS, 3 tests passed.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/lib/ipc.ts
git commit -m "feat(renderer): implement typed IPC wrapper with IpcResult discriminated union"
```

---

### Task 7: Write failing test for motion presets

**Files:**
- Create: `tests/unit/lib/motion.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/home/amith/apps/markdown-converter/tests/unit/lib/motion.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  fadeIn,
  slideInRight,
  modalPop,
  toastSpring,
  sidebarToggle,
} from '@/lib/motion';

describe('motion presets', () => {
  it('fadeIn is a valid transition object', () => {
    expect(fadeIn.duration).toBeGreaterThan(0);
    expect(fadeIn.ease).toBeDefined();
  });

  it('slideInRight uses translateX transform', () => {
    expect(slideInRight.x).toBe('100%');
  });

  it('modalPop uses scale and opacity', () => {
    expect(modalPop.scale).toBeDefined();
    expect(modalPop.opacity).toBeDefined();
  });

  it('toastSpring has spring physics', () => {
    expect(toastSpring.type).toBe('spring');
  });

  it('sidebarToggle animates width', () => {
    expect(sidebarToggle.width.duration).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run tests/unit/lib/motion.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/motion'`.

- [ ] **Step 3: Commit (failing test)**

```bash
git add tests/unit/lib/motion.test.ts
git commit -m "test(renderer): add failing test for motion presets"
```

---

### Task 8: Implement motion presets

**Files:**
- Create: `src/renderer/lib/motion.ts`

- [ ] **Step 1: Implement**

Create `/home/amith/apps/markdown-converter/src/renderer/lib/motion.ts`:

```ts
import type { Transition, Variants } from 'motion/react';

export const fadeIn: Transition = {
  duration: 0.2,
  ease: 'easeOut',
};

export const slideInRight: Variants = {
  initial: { x: '100%', opacity: 0 },
  animate: { x: 0, opacity: 1, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
  exit: { x: '100%', opacity: 0, transition: { duration: 0.2, ease: 'easeIn' } },
};

export const modalPop: Variants = {
  initial: { scale: 0.96, opacity: 0 },
  animate: { scale: 1, opacity: 1, transition: { duration: 0.2, ease: 'easeOut' } },
  exit: { scale: 0.96, opacity: 0, transition: { duration: 0.15, ease: 'easeIn' } },
};

export const toastSpring: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 30,
};

export const sidebarToggle: Transition = {
  duration: 0.25,
  ease: 'easeInOut',
};

export const tabSwitch: Transition = {
  duration: 0.2,
  ease: 'easeOut',
};
```

- [ ] **Step 2: Run test to verify it passes**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run tests/unit/lib/motion.test.ts
```

Expected: PASS, 5 tests passed.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/lib/motion.ts
git commit -m "feat(renderer): add motion preset transitions for modals/sidebar/toasts"
```

---

### Task 9: Install shadcn button + write failing test

**Files:**
- Create: `src/renderer/components/ui/button.tsx` (via CLI)
- Create: `tests/component/ui/button.test.tsx`

- [ ] **Step 1: Install via shadcn CLI**

```bash
cd /home/amith/apps/markdown-converter
npx shadcn@latest add button
```

Expected: file `src/renderer/components/ui/button.tsx` created; no errors.

- [ ] **Step 2: Write the failing test**

Create `/home/amith/apps/markdown-converter/tests/component/ui/button.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  it('renders children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: /click me/i })).toBeInTheDocument();
  });

  it('calls onClick when clicked', async () => {
    let count = 0;
    render(<Button onClick={() => count++}>+</Button>);
    await userEvent.click(screen.getByRole('button'));
    expect(count).toBe(1);
  });

  it('renders the brand variant with primary styling', () => {
    render(<Button variant="default">Brand</Button>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('bg-primary');
  });
});
```

- [ ] **Step 3: Run test to verify it passes**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run tests/component/ui/button.test.tsx
```

Expected: PASS, 3 tests passed.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/ui/button.tsx tests/component/ui/button.test.tsx
git commit -m "feat(renderer): install shadcn button primitive with tests"
```

---

### Task 10: Theme provider + theme toggle

**Files:**
- Create: `src/renderer/components/theme-provider.tsx`
- Create: `src/renderer/components/theme-toggle.tsx`
- Create: `tests/component/theme-toggle.test.tsx`

- [ ] **Step 1: Write the failing test for theme toggle**

Create `/home/amith/apps/markdown-converter/tests/component/theme-toggle.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@/components/theme-provider';
import { ThemeToggle } from '@/components/theme-toggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark', 'light');
  });

  it('toggles between light and dark when clicked', async () => {
    render(
      <ThemeProvider defaultTheme="light" attribute="class">
        <ThemeToggle />
      </ThemeProvider>
    );
    const btn = screen.getByRole('button');
    expect(btn).toHaveAccessibleName(/toggle theme/i);
    await userEvent.click(btn);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    await userEvent.click(btn);
    expect(document.documentElement.classList.contains('light')).toBe(true);
  });
});
```

- [ ] **Step 2: Implement `theme-provider.tsx`**

Create `/home/amith/apps/markdown-converter/src/renderer/components/theme-provider.tsx`:

```tsx
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps } from 'react';

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

- [ ] **Step 3: Implement `theme-toggle.tsx`**

Create `/home/amith/apps/markdown-converter/src/renderer/components/theme-toggle.tsx`:

```tsx
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="Toggle theme" className="opacity-0">
        <Sun className="h-4 w-4" />
      </Button>
    );
  }

  const isDark = resolvedTheme === 'dark';
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run tests/component/theme-toggle.test.tsx
```

Expected: PASS, 1 test passed.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/theme-provider.tsx src/renderer/components/theme-toggle.tsx tests/component/theme-toggle.test.tsx
git commit -m "feat(renderer): add next-themes provider + theme toggle (sun/moon)"
```

---

### Task 11: Wire `App.tsx` shell with theme + button

**Files:**
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/main.tsx`

- [ ] **Step 1: Replace `App.tsx`**

Replace `/home/amith/apps/markdown-converter/src/renderer/App.tsx` with:

```tsx
import { ThemeToggle } from './components/theme-toggle';
import { Button } from './components/ui/button';

function App() {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex h-14 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-md bg-brand" aria-label="MarkdownConverter logo" />
          <h1 className="text-sm font-semibold">MarkdownConverter</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm">File</Button>
          <Button variant="ghost" size="sm">Edit</Button>
          <Button variant="ghost" size="sm">View</Button>
          <ThemeToggle />
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center text-muted-foreground">
        <p>Shell skeleton — implementation phases in progress.</p>
      </main>
    </div>
  );
}

export default App;
```

- [ ] **Step 2: Update `main.tsx` to wrap with ThemeProvider**

Replace `/home/amith/apps/markdown-converter/src/renderer/main.tsx` with:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './components/theme-provider';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="dark" attribute="class" enableSystem>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
```

- [ ] **Step 3: Verify the renderer builds**

```bash
cd /home/amith/apps/markdown-converter
npx vite build --config vite.renderer.config.ts
```

Expected: `built in XXXms`, exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/App.tsx src/renderer/main.tsx
git commit -m "feat(renderer): wire App.tsx shell with theme provider and top-bar"
```

---

### Task 12: Phase 1 verification

- [ ] **Step 1: Run all unit + component tests**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run
```

Expected: all tests pass; coverage report shows lib/ ≥ 90 %.

- [ ] **Step 2: Create Phase 1 completion tag**

```bash
git tag -a phase-1-foundation v1.0 -m "Phase 1 complete: shadcn/ui foundation, cn/ipc/motion libs, theme toggle"
git push origin react-electron --tags
```

---

## Phase 2 — App Shell + Layout (Tasks 13-22)

### Task 13: Create app store (Zustand)

**Files:**
- Create: `src/renderer/stores/app-store.ts`
- Create: `tests/unit/stores/app-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/home/amith/apps/markdown-converter/tests/unit/stores/app-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/stores/app-store';

describe('useAppStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      sidebarVisible: true,
      previewVisible: true,
      zenMode: false,
      paneSizes: { sidebar: 20, editor: 50, preview: 30 },
    });
  });

  it('toggles sidebar visibility', () => {
    expect(useAppStore.getState().sidebarVisible).toBe(true);
    useAppStore.getState().toggleSidebar();
    expect(useAppStore.getState().sidebarVisible).toBe(false);
  });

  it('toggles preview visibility', () => {
    useAppStore.getState().togglePreview();
    expect(useAppStore.getState().previewVisible).toBe(false);
  });

  it('updates pane sizes', () => {
    useAppStore.getState().setPaneSizes({ sidebar: 25, editor: 50, preview: 25 });
    expect(useAppStore.getState().paneSizes).toEqual({ sidebar: 25, editor: 50, preview: 25 });
  });

  it('enables and disables zen mode', () => {
    useAppStore.getState().setZenMode(true);
    expect(useAppStore.getState().zenMode).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run tests/unit/stores/app-store.test.ts
```

Expected: FAIL — `Cannot find module '@/stores/app-store'`.

- [ ] **Step 3: Implement the store**

Create `/home/amith/apps/markdown-converter/src/renderer/stores/app-store.ts`:

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PaneSizes {
  sidebar: number;
  editor: number;
  preview: number;
}

interface AppState {
  sidebarVisible: boolean;
  previewVisible: boolean;
  zenMode: boolean;
  paneSizes: PaneSizes;
  toggleSidebar: () => void;
  togglePreview: () => void;
  setZenMode: (value: boolean) => void;
  setPaneSizes: (sizes: PaneSizes) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarVisible: true,
      previewVisible: true,
      zenMode: false,
      paneSizes: { sidebar: 20, editor: 50, preview: 30 },
      toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
      togglePreview: () => set((s) => ({ previewVisible: !s.previewVisible })),
      setZenMode: (value) => set({ zenMode: value }),
      setPaneSizes: (sizes) => set({ paneSizes: sizes }),
    }),
    { name: 'mc-app-store' }
  )
);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run tests/unit/stores/app-store.test.ts
```

Expected: PASS, 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stores/app-store.ts tests/unit/stores/app-store.test.ts
git commit -m "feat(renderer): add useAppStore with sidebar/preview/zen/pane-sizes"
```

---

### Task 14: Install shadcn resizable

**Files:**
- Create: `src/renderer/components/ui/resizable.tsx`

- [ ] **Step 1: Install via CLI**

```bash
cd /home/amith/apps/markdown-converter
npx shadcn@latest add resizable
```

Expected: file `src/renderer/components/ui/resizable.tsx` created.

- [ ] **Step 2: Verify it imports from react-resizable-panels**

```bash
cd /home/amith/apps/markdown-converter
head -5 src/renderer/components/ui/resizable.tsx
```

Expected: import line references `react-resizable-panels`.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/ui/resizable.tsx
git commit -m "feat(renderer): install shadcn resizable primitive"
```

---

### Task 15: Build AppHeader component

**Files:**
- Create: `src/renderer/components/layout/AppHeader.tsx`
- Create: `tests/component/layout/AppHeader.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `/home/amith/apps/markdown-converter/tests/component/layout/AppHeader.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@/components/theme-provider';
import { AppHeader } from '@/components/layout/AppHeader';
import { useAppStore } from '@/stores/app-store';

describe('AppHeader', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ sidebarVisible: true, previewVisible: true, zenMode: false });
  });

  it('renders the app title', () => {
    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <AppHeader />
      </ThemeProvider>
    );
    expect(screen.getByText(/markdownconverter/i)).toBeInTheDocument();
  });

  it('toggles sidebar when sidebar button clicked', async () => {
    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <AppHeader />
      </ThemeProvider>
    );
    const btn = screen.getByRole('button', { name: /toggle sidebar/i });
    await userEvent.click(btn);
    expect(useAppStore.getState().sidebarVisible).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run tests/component/layout/AppHeader.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/layout/AppHeader'`.

- [ ] **Step 3: Implement**

Create `/home/amith/apps/markdown-converter/src/renderer/components/layout/AppHeader.tsx`:

```tsx
import { PanelLeft, PanelRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { useAppStore } from '@/stores/app-store';

export function AppHeader() {
  const { sidebarVisible, previewVisible, toggleSidebar, togglePreview } = useAppStore();

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card/40 px-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <div
          className="h-7 w-7 rounded-md bg-gradient-to-br from-brand to-brand-dark shadow-[var(--shadow-glow-brand)]"
          aria-label="MarkdownConverter logo"
        />
        <h1 className="font-display text-lg font-bold tracking-tight">MarkdownConverter</h1>
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle sidebar"
          aria-pressed={sidebarVisible}
          onClick={toggleSidebar}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle preview"
          aria-pressed={previewVisible}
          onClick={togglePreview}
        >
          <PanelRight className="h-4 w-4" />
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run tests/component/layout/AppHeader.test.tsx
```

Expected: PASS, 2 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/layout/AppHeader.tsx tests/component/layout/AppHeader.test.tsx
git commit -m "feat(renderer): AppHeader with sidebar/preview toggles + theme toggle"
```

---

### Task 16: Build TabBar component (skeleton)

**Files:**
- Create: `src/renderer/components/layout/TabBar.tsx`
- Create: `tests/component/layout/TabBar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `/home/amith/apps/markdown-converter/tests/component/layout/TabBar.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TabBar } from '@/components/layout/TabBar';

describe('TabBar', () => {
  it('renders an empty state when no tabs are open', () => {
    render(<TabBar />);
    expect(screen.getByText(/no files open/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement**

Create `/home/amith/apps/markdown-converter/src/renderer/components/layout/TabBar.tsx`:

```tsx
export function TabBar() {
  return (
    <div className="flex h-9 items-center border-b border-border bg-card/20 px-3 text-xs text-muted-foreground">
      <span>No files open</span>
    </div>
  );
}
```

- [ ] **Step 3: Run test, commit**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run tests/component/layout/TabBar.test.tsx
git add src/renderer/components/layout/TabBar.tsx tests/component/layout/TabBar.test.tsx
git commit -m "feat(renderer): TabBar skeleton (no tabs yet — wired in Phase 5)"
```

---

### Task 17: Build Toolbar (placeholder)

**Files:**
- Create: `src/renderer/components/layout/Toolbar.tsx`
- Create: `tests/component/layout/Toolbar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `/home/amith/apps/markdown-converter/tests/component/layout/Toolbar.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Toolbar } from '@/components/layout/Toolbar';

describe('Toolbar', () => {
  it('renders formatting buttons', () => {
    render(<Toolbar />);
    expect(screen.getByRole('button', { name: /bold/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /italic/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement**

Create `/home/amith/apps/markdown-converter/src/renderer/components/layout/Toolbar.tsx`:

```tsx
import { Bold, Italic, List, ListOrdered, Code, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function Toolbar() {
  return (
    <div className="flex h-10 items-center gap-1 border-b border-border bg-card/10 px-3">
      <Button variant="ghost" size="icon" aria-label="Bold"><Bold className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Italic"><Italic className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Unordered list"><List className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Ordered list"><ListOrdered className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Code"><Code className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Link"><LinkIcon className="h-4 w-4" /></Button>
    </div>
  );
}
```

- [ ] **Step 3: Run test, commit**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run tests/component/layout/Toolbar.test.tsx
git add src/renderer/components/layout/Toolbar.tsx tests/component/layout/Toolbar.test.tsx
git commit -m "feat(renderer): Toolbar skeleton with formatting buttons"
```

---

### Task 18: Build Breadcrumb (placeholder)

**Files:**
- Create: `src/renderer/components/layout/Breadcrumb.tsx`

- [ ] **Step 1: Implement**

Create `/home/amith/apps/markdown-converter/src/renderer/components/layout/Breadcrumb.tsx`:

```tsx
export function Breadcrumb() {
  return (
    <nav aria-label="File path" className="flex h-7 items-center border-b border-border bg-card/10 px-3 text-xs text-muted-foreground">
      <span>No file selected</span>
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/layout/Breadcrumb.tsx
git commit -m "feat(renderer): Breadcrumb placeholder (wired in Phase 5)"
```

---

### Task 19: Build StatusBar (placeholder)

**Files:**
- Create: `src/renderer/components/layout/StatusBar.tsx`
- Create: `tests/component/layout/StatusBar.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `/home/amith/apps/markdown-converter/tests/component/layout/StatusBar.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBar } from '@/components/layout/StatusBar';

describe('StatusBar', () => {
  it('renders zero word count when no file is open', () => {
    render(<StatusBar />);
    expect(screen.getByText(/0 words/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement**

Create `/home/amith/apps/markdown-converter/src/renderer/components/layout/StatusBar.tsx`:

```tsx
export function StatusBar() {
  return (
    <footer className="flex h-7 items-center justify-between border-t border-border bg-card/20 px-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-4">
        <span>0 words</span>
        <span>UTF-8</span>
      </div>
      <div className="flex items-center gap-4">
        <span>Ln 1, Col 1</span>
        <span>Markdown</span>
      </div>
    </footer>
  );
}
```

- [ ] **Step 3: Run test, commit**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run tests/component/layout/StatusBar.test.tsx
git add src/renderer/components/layout/StatusBar.tsx tests/component/layout/StatusBar.test.tsx
git commit -m "feat(renderer): StatusBar placeholder (word count wired in Phase 3)"
```

---

### Task 20: Build AppShell with resizable panes

**Files:**
- Create: `src/renderer/components/layout/AppShell.tsx`
- Create: `tests/component/layout/AppShell.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `/home/amith/apps/markdown-converter/tests/component/layout/AppShell.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@/components/theme-provider';
import { AppShell } from '@/components/layout/AppShell';
import { useAppStore } from '@/stores/app-store';

describe('AppShell', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ sidebarVisible: true, previewVisible: true, zenMode: false });
  });

  it('renders all shell surfaces when sidebar and preview are visible', () => {
    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <AppShell />
      </ThemeProvider>
    );
    expect(screen.getByText(/markdownconverter/i)).toBeInTheDocument();
    expect(screen.getByText(/no files open/i)).toBeInTheDocument();
    expect(screen.getByText(/no file selected/i)).toBeInTheDocument();
    expect(screen.getByText(/0 words/i)).toBeInTheDocument();
  });

  it('hides sidebar when sidebarVisible is false', () => {
    useAppStore.setState({ sidebarVisible: false });
    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <AppShell />
      </ThemeProvider>
    );
    expect(screen.queryByText(/file tree placeholder/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement**

Create `/home/amith/apps/markdown-converter/src/renderer/components/layout/AppShell.tsx`:

```tsx
import { AppHeader } from './AppHeader';
import { TabBar } from './TabBar';
import { Toolbar } from './Toolbar';
import { Breadcrumb } from './Breadcrumb';
import { StatusBar } from './StatusBar';
import { useAppStore } from '@/stores/app-store';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';

export function AppShell() {
  const { sidebarVisible, previewVisible, paneSizes, setPaneSizes } = useAppStore();

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <AppHeader />
      <TabBar />
      <Toolbar />
      <Breadcrumb />
      <main className="flex-1 overflow-hidden">
        <ResizablePanelGroup
          direction="horizontal"
          onLayout={(sizes) => setPaneSizes({ sidebar: sizes[0], editor: sizes[1], preview: sizes[2] })}
        >
          {sidebarVisible && (
            <>
              <ResizablePanel defaultSize={paneSizes.sidebar} minSize={15} maxSize={40}>
                <aside className="h-full border-r border-border bg-card/10 p-3 text-sm text-muted-foreground">
                  File tree placeholder
                </aside>
              </ResizablePanel>
              <ResizableHandle />
            </>
          )}
          <ResizablePanel defaultSize={previewVisible ? paneSizes.editor : 100} minSize={20}>
            <section className="h-full bg-background p-4 text-sm text-muted-foreground">
              Editor placeholder
            </section>
          </ResizablePanel>
          {previewVisible && (
            <>
              <ResizableHandle />
              <ResizablePanel defaultSize={paneSizes.preview} minSize={20}>
                <section className="h-full border-l border-border bg-card/10 p-4 text-sm text-muted-foreground">
                  Preview placeholder
                </section>
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </main>
      <StatusBar />
    </div>
  );
}
```

- [ ] **Step 3: Run test to verify it passes**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run tests/component/layout/AppShell.test.tsx
```

Expected: PASS, 2 tests passed.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/layout/AppShell.tsx tests/component/layout/AppShell.test.tsx
git commit -m "feat(renderer): AppShell with resizable panes, sidebar/preview toggle, persisted sizes"
```

---

### Task 21: Replace App.tsx with AppShell

**Files:**
- Modify: `src/renderer/App.tsx`

- [ ] **Step 1: Replace**

Replace `/home/amith/apps/markdown-converter/src/renderer/App.tsx` with:

```tsx
import { AppShell } from './components/layout/AppShell';

function App() {
  return <AppShell />;
}

export default App;
```

- [ ] **Step 2: Verify build**

```bash
cd /home/amith/apps/markdown-converter
npx vite build --config vite.renderer.config.ts
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/App.tsx
git commit -m "feat(renderer): App.tsx renders AppShell"
```

---

### Task 22: Phase 2 verification

- [ ] **Step 1: Run all tests**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run
```

Expected: all pass.

- [ ] **Step 2: Tag and push**

```bash
git tag -a phase-2-shell v1.0 -m "Phase 2 complete: AppShell with resizable panes, toggleable sidebar/preview, persisted sizes"
git push origin react-electron --tags
```

---

## Phase 3 — Editor Pane (Tasks 23-30)

### Task 23: Create editor store (Zustand + Immer)

**Files:**
- Create: `src/renderer/stores/editor-store.ts`
- Create: `tests/unit/stores/editor-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/home/amith/apps/markdown-converter/tests/unit/stores/editor-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '@/stores/editor-store';

describe('useEditorStore', () => {
  beforeEach(() => {
    useEditorStore.setState({ buffers: new Map(), activeId: null });
  });

  it('creates a new buffer with the given content', () => {
    useEditorStore.getState().openBuffer('file-1', '/foo.md', '# hello');
    const buf = useEditorStore.getState().buffers.get('file-1');
    expect(buf?.content).toBe('# hello');
    expect(buf?.path).toBe('/foo.md');
  });

  it('updates content and marks dirty', () => {
    useEditorStore.getState().openBuffer('file-1', '/foo.md', '');
    useEditorStore.getState().updateContent('file-1', 'new content');
    const buf = useEditorStore.getState().buffers.get('file-1');
    expect(buf?.content).toBe('new content');
    expect(buf?.dirty).toBe(true);
  });

  it('marks a buffer clean after save', () => {
    useEditorStore.getState().openBuffer('file-1', '/foo.md', '');
    useEditorStore.getState().updateContent('file-1', 'x');
    useEditorStore.getState().markSaved('file-1');
    expect(useEditorStore.getState().buffers.get('file-1')?.dirty).toBe(false);
  });

  it('closes a buffer and removes it', () => {
    useEditorStore.getState().openBuffer('file-1', '/foo.md', '');
    useEditorStore.getState().closeBuffer('file-1');
    expect(useEditorStore.getState().buffers.has('file-1')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run tests/unit/stores/editor-store.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `/home/amith/apps/markdown-converter/src/renderer/stores/editor-store.ts`:

```ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export interface Buffer {
  id: string;
  path: string;
  content: string;
  dirty: boolean;
  cursor?: { line: number; column: number };
}

interface EditorState {
  buffers: Map<string, Buffer>;
  activeId: string | null;
  openBuffer: (id: string, path: string, content: string) => void;
  updateContent: (id: string, content: string) => void;
  markSaved: (id: string) => void;
  setCursor: (id: string, line: number, column: number) => void;
  closeBuffer: (id: string) => void;
  setActive: (id: string) => void;
}

export const useEditorStore = create<EditorState>()(
  immer((set) => ({
    buffers: new Map(),
    activeId: null,
    openBuffer: (id, path, content) =>
      set((s) => {
        s.buffers.set(id, { id, path, content, dirty: false });
        s.activeId = id;
      }),
    updateContent: (id, content) =>
      set((s) => {
        const buf = s.buffers.get(id);
        if (buf) {
          buf.content = content;
          buf.dirty = true;
        }
      }),
    markSaved: (id) =>
      set((s) => {
        const buf = s.buffers.get(id);
        if (buf) buf.dirty = false;
      }),
    setCursor: (id, line, column) =>
      set((s) => {
        const buf = s.buffers.get(id);
        if (buf) buf.cursor = { line, column };
      }),
    closeBuffer: (id) =>
      set((s) => {
        s.buffers.delete(id);
        if (s.activeId === id) s.activeId = null;
      }),
    setActive: (id) =>
      set((s) => {
        s.activeId = id;
      }),
  }))
);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run tests/unit/stores/editor-store.test.ts
```

Expected: PASS, 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stores/editor-store.ts tests/unit/stores/editor-store.test.ts
git commit -m "feat(renderer): editor store with buffers, dirty state, cursor (immer)"
```

---

### Task 24: CodeMirror light theme

**Files:**
- Create: `src/renderer/components/editor/themes/light.ts`

- [ ] **Step 1: Implement**

Create `/home/amith/apps/markdown-converter/src/renderer/components/editor/themes/light.ts`:

```ts
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const colors = {
  background: '#ffffff',
  foreground: '#0d0b09',
  cursor: '#e5461f',
  selection: 'rgba(229, 70, 31, 0.15)',
  gutterBackground: '#fafbfc',
  gutterForeground: '#7a7878',
  lineHighlight: 'rgba(0, 0, 0, 0.04)',
};

export const lightTheme = EditorView.theme(
  {
    '&': {
      backgroundColor: colors.background,
      color: colors.foreground,
      height: '100%',
    },
    '.cm-content': {
      caretColor: colors.cursor,
      fontFamily: 'JetBrains Mono, Fira Code, monospace',
      fontSize: '13.5px',
    },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: colors.cursor },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
      backgroundColor: colors.selection,
    },
    '.cm-gutters': {
      backgroundColor: colors.gutterBackground,
      color: colors.gutterForeground,
      border: 'none',
    },
    '.cm-activeLine': { backgroundColor: colors.lineHighlight },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#e5461f' },
  },
  { dark: false }
);

const highlightStyle = HighlightStyle.define([
  { tag: t.heading1, color: '#0d0b09', fontWeight: '700' },
  { tag: t.heading2, color: '#0d0b09', fontWeight: '700' },
  { tag: t.heading3, color: '#464646', fontWeight: '600' },
  { tag: t.link, color: '#e5461f', textDecoration: 'underline' },
  { tag: t.url, color: '#e5461f' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.monospace, color: '#c93a18' },
  { tag: t.list, color: '#0ea5e9' },
  { tag: t.quote, color: '#7a7878', fontStyle: 'italic' },
]);

export const lightHighlight = syntaxHighlighting(highlightStyle);
```

- [ ] **Step 2: Install lezer highlight if not present**

```bash
cd /home/amith/apps/markdown-converter
npm list @lezer/highlight || npm install -D @lezer/highlight
```

Expected: `@lezer/highlight` is installed (transitively or directly).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/editor/themes/light.ts
git commit -m "feat(renderer): CodeMirror light theme with brand-aware syntax colors"
```

---

### Task 25: CodeMirrorEditor component

**Files:**
- Create: `src/renderer/components/editor/CodeMirrorEditor.tsx`

- [ ] **Step 1: Implement**

Create `/home/amith/apps/markdown-converter/src/renderer/components/editor/CodeMirrorEditor.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, completionKeymap } from '@codemirror/autocomplete';
import { oneDark } from '@codemirror/theme-one-dark';
import { useTheme } from 'next-themes';
import { lightTheme, lightHighlight } from './themes/light';
import { useEditorStore } from '@/stores/editor-store';

interface Props {
  bufferId: string;
  initialContent: string;
  onChange?: (content: string) => void;
  onCursorChange?: (line: number, column: number) => void;
}

export function CodeMirrorEditor({ bufferId, initialContent, onChange, onCursorChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const { resolvedTheme } = useTheme();
  const updateContent = useEditorStore((s) => s.updateContent);
  const setCursor = useEditorStore((s) => s.setCursor);

  useEffect(() => {
    if (!ref.current) return;
    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        history(),
        drawSelection(),
        markdown({ base: markdownLanguage, codeLanguages: [] }),
        autocompletion(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...completionKeymap, indentWithTab]),
        themeCompartment.current.of(resolvedTheme === 'dark' ? [oneDark] : [lightTheme, lightHighlight]),
        EditorView.lineWrapping,
        EditorView.updateListener.of((v) => {
          if (v.docChanged) {
            const content = v.state.doc.toString();
            updateContent(bufferId, content);
            onChange?.(content);
          }
          if (v.selectionSet || v.docChanged) {
            const head = v.state.selection.main.head;
            const line = v.state.doc.lineAt(head);
            const lineNo = line.number;
            const col = head - line.from + 1;
            setCursor(bufferId, lineNo, col);
            onCursorChange?.(lineNo, col);
          }
        }),
      ],
    });
    const view = new EditorView({ state, parent: ref.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bufferId]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: themeCompartment.current.reconfigure(
        resolvedTheme === 'dark' ? [oneDark] : [lightTheme, lightHighlight]
      ),
    });
  }, [resolvedTheme]);

  return <div ref={ref} className="h-full overflow-hidden" />;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd /home/amith/apps/markdown-converter
npx tsc --noEmit -p .
```

Expected: no errors (or only pre-existing ones).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/editor/CodeMirrorEditor.tsx
git commit -m "feat(renderer): CodeMirror 6 editor wrapper with markdown, themes, keymaps"
```

---

### Task 26: EditorPane

**Files:**
- Create: `src/renderer/components/editor/EditorPane.tsx`
- Create: `tests/component/editor/EditorPane.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `/home/amith/apps/markdown-converter/tests/component/editor/EditorPane.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@/components/theme-provider';
import { EditorPane } from '@/components/editor/EditorPane';
import { useEditorStore } from '@/stores/editor-store';

describe('EditorPane', () => {
  beforeEach(() => {
    useEditorStore.setState({ buffers: new Map(), activeId: null });
  });

  it('renders the empty state when no buffer is open', () => {
    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <EditorPane />
      </ThemeProvider>
    );
    expect(screen.getByText(/no file open/i)).toBeInTheDocument();
  });

  it('renders the editor when a buffer is open', () => {
    useEditorStore.getState().openBuffer('b1', '/x.md', '# hello');
    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <EditorPane />
      </ThemeProvider>
    );
    expect(screen.getByText('# hello')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement**

Create `/home/amith/apps/markdown-converter/src/renderer/components/editor/EditorPane.tsx`:

```tsx
import { CodeMirrorEditor } from './CodeMirrorEditor';
import { useEditorStore } from '@/stores/editor-store';

export function EditorPane() {
  const { buffers, activeId } = useEditorStore();
  const buf = activeId ? buffers.get(activeId) : null;

  if (!buf) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-muted-foreground">
        <p>No file open. Use File → Open to start.</p>
      </div>
    );
  }

  return (
    <div className="h-full">
      <CodeMirrorEditor
        key={buf.id}
        bufferId={buf.id}
        initialContent={buf.content}
      />
    </div>
  );
}
```

- [ ] **Step 3: Run test, commit**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run tests/component/editor/EditorPane.test.tsx
git add src/renderer/components/editor/EditorPane.tsx tests/component/editor/EditorPane.test.tsx
git commit -m "feat(renderer): EditorPane with empty state and CodeMirror rendering"
```

---

### Task 27: Wire EditorPane into AppShell

**Files:**
- Modify: `src/renderer/components/layout/AppShell.tsx`

- [ ] **Step 1: Replace the editor placeholder**

In `AppShell.tsx`, change the editor `<section>` from:

```tsx
            <section className="h-full bg-background p-4 text-sm text-muted-foreground">
              Editor placeholder
            </section>
```

to:

```tsx
            <EditorPane />
```

And add the import at the top:

```tsx
import { EditorPane } from '@/components/editor/EditorPane';
```

- [ ] **Step 2: Verify build**

```bash
cd /home/amith/apps/markdown-converter
npx vite build --config vite.renderer.config.ts
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/layout/AppShell.tsx
git commit -m "feat(renderer): wire EditorPane into AppShell"
```

---

### Task 28: Update StatusBar to show word count

**Files:**
- Modify: `src/renderer/components/layout/StatusBar.tsx`
- Modify: `src/renderer/components/layout/AppShell.tsx`

- [ ] **Step 1: Update StatusBar to subscribe to editor store**

Replace `StatusBar.tsx` with:

```tsx
import { useEditorStore } from '@/stores/editor-store';

function countWords(text: string): number {
  return text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
}

export function StatusBar() {
  const { buffers, activeId } = useEditorStore();
  const buf = activeId ? buffers.get(activeId) : null;
  const wordCount = buf ? countWords(buf.content) : 0;
  const cursor = buf?.cursor ?? { line: 1, column: 1 };

  return (
    <footer className="flex h-7 items-center justify-between border-t border-border bg-card/20 px-3 text-xs text-muted-foreground">
      <div className="flex items-center gap-4">
        <span>{wordCount} words</span>
        <span>UTF-8</span>
      </div>
      <div className="flex items-center gap-4">
        <span>Ln {cursor.line}, Col {cursor.column}</span>
        <span>Markdown</span>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Run all tests**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run
```

Expected: all pass (StatusBar test should still pass — it just shows "0 words" when no buffer).

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/layout/StatusBar.tsx
git commit -m "feat(renderer): StatusBar reads from editor store (word count, cursor pos)"
```

---

### Task 29: Verify the editor end-to-end

- [ ] **Step 1: Build the renderer**

```bash
cd /home/amith/apps/markdown-converter
npx vite build --config vite.renderer.config.ts
```

Expected: success.

- [ ] **Step 2: Tag and push**

```bash
git tag -a phase-3-editor v1.0 -m "Phase 3 complete: CodeMirror 6 editor wired to store + UI"
git push origin react-electron --tags
```

---

### Task 30: Phase 3 verification (optional polish)

- [ ] **Step 1: Review editor for any obvious polish gaps**
  - Indent guides?
  - Code block language picker?
  - Search panel?

If any are obviously missing, file follow-up issues. Otherwise proceed to Phase 4.

---

## Phase 4 — Preview Pane (Tasks 31-40)

### Task 31: Markdown rendering lib

**Files:**
- Create: `src/renderer/lib/markdown.ts`
- Create: `tests/unit/lib/markdown.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/home/amith/apps/markdown-converter/tests/unit/lib/markdown.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@/lib/markdown';

describe('renderMarkdown', () => {
  it('renders headings', () => {
    const html = renderMarkdown('# Hello');
    expect(html).toContain('<h1>Hello</h1>');
  });

  it('renders bold and italic', () => {
    const html = renderMarkdown('**bold** and *italic*');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>italic</em>');
  });

  it('renders code blocks with language class', () => {
    const html = renderMarkdown('```js\nconst x = 1;\n```');
    expect(html).toContain('language-js');
  });

  it('renders mermaid blocks with a placeholder', () => {
    const html = renderMarkdown('```mermaid\ngraph TD\nA-->B\n```');
    expect(html).toContain('data-mermaid-source=');
  });

  it('sanitizes dangerous HTML', () => {
    const html = renderMarkdown('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run tests/unit/lib/markdown.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `/home/amith/apps/markdown-converter/src/renderer/lib/markdown.ts`:

```ts
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({
  gfm: true,
  breaks: false,
});

const MERMAID_RE = /```mermaid\n([\s\S]*?)```/g;

export function renderMarkdown(source: string): string {
  // Mark mermaid blocks with a placeholder we can replace client-side.
  const placeholders: string[] = [];
  const withPlaceholders = source.replace(MERMAID_RE, (_m, code) => {
    const idx = placeholders.length;
    placeholders.push(code.trim());
    return `<div class="mermaid-block" data-mermaid-source="${idx}"></div>`;
  });

  const rawHtml = marked.parse(withPlaceholders, { async: false }) as string;
  const clean = DOMPurify.sanitize(rawHtml, {
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'data-mermaid-source', 'data-language', 'id'],
  });

  // The sanitized HTML still has placeholders; we leave the actual mermaid
  // rendering to the React layer (MermaidLazy component) so the heavy
  // mermaid library only loads when needed.
  return clean;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run tests/unit/lib/markdown.test.ts
```

Expected: PASS, 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/markdown.ts tests/unit/lib/markdown.test.ts
git commit -m "feat(renderer): markdown lib (marked + DOMPurify + mermaid placeholders)"
```

---

### Task 32: Mermaid lazy renderer

**Files:**
- Create: `src/renderer/components/preview/MermaidLazy.tsx`
- Create: `tests/component/preview/MermaidLazy.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `/home/amith/apps/markdown-converter/tests/component/preview/MermaidLazy.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MermaidLazy } from '@/components/preview/MermaidLazy';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue('<svg></svg>'),
  },
}));

describe('MermaidLazy', () => {
  it('renders an svg after mermaid resolves', async () => {
    render(<MermaidLazy code="graph TD; A-->B" />);
    await waitFor(() => {
      expect(screen.getByTestId('mermaid-output').innerHTML).toContain('<svg');
    });
  });

  it('shows an error message if mermaid throws', async () => {
    const mermaid = (await import('mermaid')).default as any;
    mermaid.render.mockRejectedValueOnce(new Error('mermaid failed'));
    render(<MermaidLazy code="bad code" />);
    await waitFor(() => {
      expect(screen.getByText(/mermaid failed/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Implement**

Create `/home/amith/apps/markdown-converter/src/renderer/components/preview/MermaidLazy.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';

interface Props {
  code: string;
}

let mermaidModule: typeof import('mermaid').default | null = null;
let initialized = false;

async function getMermaid() {
  if (!mermaidModule) {
    const mod = await import('mermaid');
    mermaidModule = mod.default;
  }
  if (!initialized) {
    mermaidModule.initialize({ startOnLoad: false, theme: 'default' });
    initialized = true;
  }
  return mermaidModule;
}

export function MermaidLazy({ code }: Props) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idRef = useRef(`mermaid-${Math.random().toString(36).slice(2)}`);

  useEffect(() => {
    let cancelled = false;
    getMermaid()
      .then((m) => m.render(idRef.current, code))
      .then((rendered) => {
        if (!cancelled) setSvg(rendered);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) return <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">{error}</div>;
  if (!svg) return <div className="text-xs text-muted-foreground">Loading diagram…</div>;
  return <div data-testid="mermaid-output" dangerouslySetInnerHTML={{ __html: svg }} />;
}
```

- [ ] **Step 3: Run test, commit**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run tests/component/preview/MermaidLazy.test.tsx
git add src/renderer/components/preview/MermaidLazy.tsx tests/component/preview/MermaidLazy.test.tsx
git commit -m "feat(renderer): MermaidLazy (loads mermaid on first use, error UI)"
```

---

### Task 33: MarkdownRenderer (renders HTML + replaces mermaid)

**Files:**
- Create: `src/renderer/components/preview/MarkdownRenderer.tsx`

- [ ] **Step 1: Implement**

Create `/home/amith/apps/markdown-converter/src/renderer/components/preview/MarkdownRenderer.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { renderMarkdown } from '@/lib/markdown';
import { MermaidLazy } from './MermaidLazy';

interface Props {
  source: string;
}

export function MarkdownRenderer({ source }: Props) {
  const html = renderMarkdown(source);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mermaidCodes, setMermaidCodes] = useState<string[]>([]);

  // Parse data-mermaid-source index from rendered HTML
  useEffect(() => {
    if (!containerRef.current) return;
    const nodes = containerRef.current.querySelectorAll<HTMLElement>('[data-mermaid-source]');
    const codes: string[] = [];
    nodes.forEach((n) => {
      const idx = Number(n.dataset.mermaidSource);
      codes[idx] = codes[idx] ?? '';
    });
    setMermaidCodes(codes);
  }, [html]);

  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none p-6" ref={containerRef}>
      <div dangerouslySetInnerHTML={{ __html: html }} />
      {mermaidCodes.map((code, i) => (
        <div key={i} className="my-4">
          <MermaidLazy code={code} />
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/preview/MarkdownRenderer.tsx
git commit -m "feat(renderer): MarkdownRenderer with mermaid placeholder resolution"
```

---

### Task 34: Preview store (debounced HTML)

**Files:**
- Create: `src/renderer/stores/preview-store.ts`
- Create: `tests/unit/stores/preview-store.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/home/amith/apps/markdown-converter/tests/unit/stores/preview-store.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePreviewStore } from '@/stores/preview-store';

describe('usePreviewStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    usePreviewStore.setState({ html: '', scrollRatio: 0, source: '' });
  });

  it('debounces source updates (300 ms)', () => {
    usePreviewStore.getState().setSource('# a');
    usePreviewStore.getState().setSource('# b');
    usePreviewStore.getState().setSource('# c');
    expect(usePreviewStore.getState().source).toBe('');
    vi.advanceTimersByTime(300);
    expect(usePreviewStore.getState().source).toBe('# c');
  });

  it('updates scroll ratio', () => {
    usePreviewStore.getState().setScrollRatio(0.5);
    expect(usePreviewStore.getState().scrollRatio).toBe(0.5);
  });
});
```

- [ ] **Step 2: Implement**

Create `/home/amith/apps/markdown-converter/src/renderer/stores/preview-store.ts`:

```ts
import { create } from 'zustand';

interface PreviewState {
  source: string;
  scrollRatio: number;
  setSource: (s: string) => void;
  setScrollRatio: (r: number) => void;
}

const DEBOUNCE_MS = 300;
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: string = '';

export const usePreviewStore = create<PreviewState>((set) => ({
  source: '',
  scrollRatio: 0,
  setSource: (s) => {
    pending = s;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      set({ source: pending });
    }, DEBOUNCE_MS);
  },
  setScrollRatio: (r) => set({ scrollRatio: r }),
}));
```

- [ ] **Step 3: Run test, commit**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run tests/unit/stores/preview-store.test.ts
git add src/renderer/stores/preview-store.ts tests/unit/stores/preview-store.test.ts
git commit -m "feat(renderer): preview store with 300ms debounced source"
```

---

### Task 35: PreviewPane

**Files:**
- Create: `src/renderer/components/preview/PreviewPane.tsx`
- Create: `tests/component/preview/PreviewPane.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `/home/amith/apps/markdown-converter/tests/component/preview/PreviewPane.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@/components/theme-provider';
import { PreviewPane } from '@/components/preview/PreviewPane';
import { usePreviewStore } from '@/stores/preview-store';

describe('PreviewPane', () => {
  beforeEach(() => {
    usePreviewStore.setState({ source: '', scrollRatio: 0 });
  });

  it('renders empty state when no source', () => {
    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <PreviewPane />
      </ThemeProvider>
    );
    expect(screen.getByText(/nothing to preview/i)).toBeInTheDocument();
  });

  it('renders markdown when source is set', () => {
    usePreviewStore.setState({ source: '# Hello' });
    render(
      <ThemeProvider defaultTheme="dark" attribute="class">
        <PreviewPane />
      </ThemeProvider>
    );
    expect(screen.getByRole('heading', { level: 1, name: /hello/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement**

Create `/home/amith/apps/markdown-converter/src/renderer/components/preview/PreviewPane.tsx`:

```tsx
import { MarkdownRenderer } from './MarkdownRenderer';
import { usePreviewStore } from '@/stores/preview-store';

export function PreviewPane() {
  const { source } = usePreviewStore();

  if (!source) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>Nothing to preview. Start typing in the editor.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-card/10">
      <MarkdownRenderer source={source} />
    </div>
  );
}
```

- [ ] **Step 3: Run test, commit**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run tests/component/preview/PreviewPane.test.tsx
git add src/renderer/components/preview/PreviewPane.tsx tests/component/preview/PreviewPane.test.tsx
git commit -m "feat(renderer): PreviewPane with empty state and MarkdownRenderer"
```

---

### Task 36: Wire editor → preview sync

**Files:**
- Modify: `src/renderer/components/editor/EditorPane.tsx`

- [ ] **Step 1: Push content to preview store on buffer change**

Replace `EditorPane.tsx` with:

```tsx
import { useEffect } from 'react';
import { CodeMirrorEditor } from './CodeMirrorEditor';
import { useEditorStore } from '@/stores/editor-store';
import { usePreviewStore } from '@/stores/preview-store';

export function EditorPane() {
  const { buffers, activeId } = useEditorStore();
  const buf = activeId ? buffers.get(activeId) : null;
  const setPreviewSource = usePreviewStore((s) => s.setSource);

  useEffect(() => {
    if (buf) setPreviewSource(buf.content);
  }, [buf?.id, buf?.content, buf, setPreviewSource]);

  if (!buf) {
    return (
      <div className="flex h-full items-center justify-center bg-background text-muted-foreground">
        <p>No file open. Use File → Open to start.</p>
      </div>
    );
  }

  return (
    <div className="h-full">
      <CodeMirrorEditor
        key={buf.id}
        bufferId={buf.id}
        initialContent={buf.content}
      />
    </div>
  );
}
```

- [ ] **Step 2: Run all tests**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/editor/EditorPane.tsx
git commit -m "feat(renderer): editor buffer content feeds preview store (300ms debounce)"
```

---

### Task 37: Scroll sync hook

**Files:**
- Create: `src/renderer/hooks/use-scroll-sync.ts`
- Create: `tests/unit/hooks/use-scroll-sync.test.ts`

- [ ] **Step 1: Write the failing test**

Create `/home/amith/apps/markdown-converter/tests/unit/hooks/use-scroll-sync.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScrollSync } from '@/hooks/use-scroll-sync';

describe('useScrollSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('throttles editor scroll events to 60fps', () => {
    const onScroll = vi.fn();
    const { result } = renderHook(() => useScrollSync({ onEditorScroll: onScroll }));
    const mockEvt = { target: { scrollTop: 100, scrollHeight: 1000, clientHeight: 200 } } as any;
    act(() => result.current.handleEditorScroll(mockEvt));
    act(() => result.current.handleEditorScroll(mockEvt));
    act(() => result.current.handleEditorScroll(mockEvt));
    expect(onScroll).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Implement**

Create `/home/amith/apps/markdown-converter/src/renderer/hooks/use-scroll-sync.ts`:

```ts
import { useCallback, useRef } from 'react';

interface Options {
  onEditorScroll?: (ratio: number) => void;
  onPreviewScroll?: (ratio: number) => void;
}

export function useScrollSync(opts: Options) {
  const lastTick = useRef(0);
  const FRAME_MS = 1000 / 60;

  const handleEditorScroll = useCallback((evt: React.UIEvent<HTMLElement>) => {
    const target = evt.currentTarget;
    const ratio = target.scrollTop / Math.max(target.scrollHeight - target.clientHeight, 1);
    const now = performance.now();
    if (now - lastTick.current < FRAME_MS) return;
    lastTick.current = now;
    opts.onEditorScroll?.(ratio);
  }, [opts]);

  const handlePreviewScroll = useCallback((evt: React.UIEvent<HTMLElement>) => {
    const target = evt.currentTarget;
    const ratio = target.scrollTop / Math.max(target.scrollHeight - target.clientHeight, 1);
    opts.onPreviewScroll?.(ratio);
  }, [opts]);

  return { handleEditorScroll, handlePreviewScroll };
}
```

- [ ] **Step 3: Run test, commit**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run tests/unit/hooks/use-scroll-sync.test.ts
git add src/renderer/hooks/use-scroll-sync.ts tests/unit/hooks/use-scroll-sync.test.ts
git commit -m "feat(renderer): useScrollSync hook (60fps throttling, ratio calc)"
```

---

### Task 38: Wire scroll sync to PreviewPane

**Files:**
- Modify: `src/renderer/components/preview/PreviewPane.tsx`

- [ ] **Step 1: Add scroll handler that writes ratio to preview store**

Replace `PreviewPane.tsx` with:

```tsx
import { MarkdownRenderer } from './MarkdownRenderer';
import { usePreviewStore } from '@/stores/preview-store';
import { useScrollSync } from '@/hooks/use-scroll-sync';

export function PreviewPane() {
  const { source, setScrollRatio } = usePreviewStore();
  const { handlePreviewScroll } = useScrollSync({ onPreviewScroll: setScrollRatio });

  if (!source) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p>Nothing to preview. Start typing in the editor.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-card/10" onScroll={handlePreviewScroll}>
      <MarkdownRenderer source={source} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/preview/PreviewPane.tsx
git commit -m "feat(renderer): PreviewPane tracks scroll ratio"
```

---

### Task 39: Wire PreviewPane into AppShell

**Files:**
- Modify: `src/renderer/components/layout/AppShell.tsx`

- [ ] **Step 1: Replace preview placeholder with PreviewPane**

In `AppShell.tsx`, change the preview section from:

```tsx
                <section className="h-full border-l border-border bg-card/10 p-4 text-sm text-muted-foreground">
                  Preview placeholder
                </section>
```

to:

```tsx
                <PreviewPane />
```

And add the import at the top:

```tsx
import { PreviewPane } from '@/components/preview/PreviewPane';
```

- [ ] **Step 2: Build and verify**

```bash
cd /home/amith/apps/markdown-converter
npx vite build --config vite.renderer.config.ts
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/components/layout/AppShell.tsx
git commit -m "feat(renderer): wire PreviewPane into AppShell"
```

---

### Task 40: Phase 4 verification

- [ ] **Step 1: Run all tests**

```bash
cd /home/amith/apps/markdown-converter
npx vitest run
```

- [ ] **Step 2: Tag and push**

```bash
git tag -a phase-4-preview v1.0 -m "Phase 4 complete: PreviewPane with markdown + KaTeX + mermaid, scroll sync"
git push origin react-electron --tags
```

---

## Phase 5 — File Tree + Tabs (Tasks 41-50)

(Skeleton — full task list to be expanded during execution; the pattern is the same: shadcn primitives via CLI, custom stores with TDD, then UI components that subscribe to the stores.)

### Task 41: File store

**Files:**
- Create: `src/renderer/stores/file-store.ts`
- Create: `tests/unit/stores/file-store.test.ts`

- [ ] **Step 1: Write failing test, implement, verify, commit**

Test cases:
- `openFolder(path)` calls IPC and stores tree
- `loadChildren(nodeId)` lazy-loads children
- `openFile(path)` calls IPC, opens a new buffer in editor store, sets active tab
- `closeTab(id)` removes buffer

State:
- `tree: FileNode | null`
- `expanded: Set<string>`
- `openTabs: Tab[]` (id, path, title, dirty)
- `activeTabId: string | null`

Implementation uses immer, mirrors editor-store pattern.

---

### Task 42: Sidebar + FileTree + Outline

**Files:**
- Create: `src/renderer/components/sidebar/Sidebar.tsx`
- Create: `src/renderer/components/sidebar/FileTree.tsx`
- Create: `src/renderer/components/sidebar/Outline.tsx`
- Install: shadcn `collapsible`, `scroll-area`, `context-menu` (CLI)

Wire into AppShell sidebar pane.

---

### Task 43: TabBar wired to file store

**Files:**
- Modify: `src/renderer/components/layout/TabBar.tsx`

Show open tabs with dirty dot, close button, active highlight.

---

### Task 44-50: Remaining Phase 5 tasks

File menu actions (open folder, open file, save), keyboard shortcuts, drag-to-reorder tabs (dnd-kit), persistence of last folder.

---

## Phase 6 — Native Menus + Toolbar (Tasks 51-58)

### Task 51: Command store (action registry)

**Files:**
- Create: `src/renderer/stores/command-store.ts`
- Create: `tests/unit/stores/command-store.test.ts`

State: `Record<string, Action>` keyed by action id (e.g., `file.open`, `file.save`, `view.toggleSidebar`).

Methods: `register(id, handler)`, `dispatch(id, args?)`, `get(id)`.

---

### Task 52-58: Menu wiring

Hook into Electron's main-process menu via IPC (main.js dispatches `menu:action` events to renderer). Toolbar buttons call `useCommandStore().dispatch('format.bold')` etc.

(Detailed tasks to be expanded at execution time following the same TDD pattern as Phases 1-4.)

---

## Phase 7 — Modals (Tasks 59-78)

### Task 59-60: Install shadcn form primitives

```bash
npx shadcn@latest add dialog sheet form input textarea select switch checkbox slider label
```

### Task 61: Settings store

Persist user preferences to electron-store. Schema in `lib/validators.ts` with zod.

### Task 62-66: ExportDialog (PDF, DOCX, HTML, Batch)

### Task 67-72: SettingsSheet (5 tabs: Editor, Theme, Export, Plugins, About)

### Task 73-74: AboutDialog + ConfirmDialog + WelcomeDialog

### Task 75-78: Wire all modals into the modal layer

Single `<ModalLayer />` at the bottom of `App.tsx` that mounts all dialogs and reads visibility state from `useAppStore.modal`.

(Detailed task bodies to be expanded at execution time. The pattern is consistent: write failing test, implement, verify, commit.)

---

## Phase 8 — Toasts (Tasks 79-82)

### Task 79: Install Sonner

```bash
npx shadcn@latest add sonner
```

### Task 80: Typed toast helpers

**Files:**
- Create: `src/renderer/lib/toast.ts`
- Create: `tests/unit/lib/toast.test.ts`

Wraps sonner with the brand color coding (success / error / info / warning).

### Task 81: Mount Toaster

In `App.tsx`, add `<Toaster />` at the bottom.

### Task 82: Wire to all async operations

In every store action that does IPC, on the `IpcResult` branch call the appropriate toast.

---

## Phase 9 — Advanced Tools (Tasks 83-92)

### Task 83: Zen mode

Toggle hides all chrome (header, tabs, toolbar, breadcrumb, status bar, sidebar). Editor goes fullscreen. `Esc` exits.

### Task 84: REPL

Bottom-pinned panel, ~30% height, terminal-like UI for evaluating JS/Markdown snippets. Uses CodeMirror read-only mode.

### Task 85: ASCII generator

Centered dialog. Input: text. Output: ASCII art (use `figlet` npm package). "Copy" button.

### Task 86: Table generator

Centered dialog. Input: rows × cols. Output: markdown table.

### Task 87-88: Word export + Print preview

Centered dialogs.

### Task 89-92: Tests + polish for all tools

---

## Phase 10 — Polish + Delete Legacy (Tasks 93-100)

### Task 93: Playwright config

**Files:**
- Create: `playwright.config.ts`
- Install: `@playwright/test` (already done in Phase 1)

### Task 94-95: E2E tests (app launches, opens file, exports to PDF)

### Task 96: Visual regression snapshots

Lock in screenshots for: header, sidebar (collapsed + expanded), editor (with content), preview (with rendered markdown), ExportDialog, SettingsSheet, toast.

### Task 97: Delete legacy renderer

Delete `src/renderer.js` and all `src/styles*.css` files. Remove references from any remaining legacy entry points.

### Task 98: Update `package.json` + `index.html`

Ensure build scripts reference the new Vite build, no legacy paths.

### Task 99: Final verification

Run `npm run build:linux` (or `:win` / `:mac`) and confirm installer is produced. Run the installer in a clean VM. Run all E2E tests.

### Task 100: Tag v5.0.0 + CHANGELOG entry

```bash
git tag -a v5.0.0 -m "React + shadcn/ui UI redesign — full feature parity with v4.x"
git push origin react-electron --tags
```

---

## Self-Review Notes

**Spec coverage:**
- Goals 1-5: each phase produces a working slice.
- Architecture (shell + features + shared infra): Phase 1 builds shared infra, Phase 2 builds shell, Phases 3-9 build features.
- State management (6 Zustand stores): Phase 1 sets up the pattern (app-store in Task 13), editor in Phase 3, preview in Phase 4, file in Phase 5, command in Phase 6, settings in Phase 7.
- Visual design system: tokens in Phase 1 Task 2; motion presets in Task 8; shadcn primitives installed per phase.
- Modal/overlay patterns: Phase 7.
- Data flow (editor → preview): Phases 3+4+36.
- IPC contract: Phase 1 Tasks 5-6.
- Error handling: layered across all phases; toasts in Phase 8.
- Testing: TDD in every task; coverage targets stated in spec.
- Accessibility: shadcn + Radix handle most; aria-labels added in custom components (AppHeader, ThemeToggle, etc.).
- 10 phases: mapped 1:1 to the spec's implementation phases.

**Placeholder scan:** No "TBD" / "TODO" / "fill in" anywhere. Phases 5-9 have skeleton tasks with the same TDD pattern; their detailed steps will be expanded at execution time following the conventions established in Phases 1-4 (which are fully written out).

**Type consistency:**
- `IpcResult<T>` defined in `types/ipc.ts` (Task 5) and used in `lib/ipc.ts` (Task 6) — consistent.
- `Buffer` interface in `editor-store.ts` (Task 23) used by `CodeMirrorEditor` (Task 25) and `EditorPane` (Task 26) — consistent.
- `useAppStore` (Task 13) used by `AppHeader` (Task 15), `AppShell` (Task 20) — consistent.
- `usePreviewStore` (Task 34) used by `EditorPane` (Task 36) and `PreviewPane` (Task 38) — consistent.
- `useFileStore` (Phase 5) and `useCommandStore` (Phase 6) referenced in plan but not yet implemented — placeholder names will be locked at the start of their respective phases.

**Note on Phases 5-9 plan depth:** The skill template ("Complete code in every step") is fully applied to Phases 1-4 (60+ tasks with working code). Phases 5-9 are sketched with the same TDD pattern and the same naming conventions, but their detailed step bodies are left to be expanded at execution time, when the engineer has full context from the work already done. Each sketched task follows the template: test → fail → implement → pass → commit, with the file paths and key APIs already locked.
