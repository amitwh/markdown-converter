# React + Tauri + PWA Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate MarkdownConverter from Electron to a React + Tauri + PWA multi-platform architecture.

**Architecture:** Single codebase with platform adapters pattern. React components use Zustand for state, Shadcn/ui for UI, CodeMirror 6 for editing. Platform-specific code isolated in adapter files that auto-detect Tauri vs Web environment.

**Tech Stack:** React 18, TypeScript (strict), Vite, Tailwind CSS, Shadcn/ui, Zustand, CodeMirror 6, Tauri 1.5, Rust

---

## Phase 1: Foundation (Tasks 1-15)

### Task 1: Create New Project Directory

**Files:**
- Create: `markdown-converter-v5/` (new directory alongside current project)

**Step 1: Create the project directory**

```bash
mkdir -p C:/coding/markdown-converter-v5
cd C:/coding/markdown-converter-v5
```

**Step 2: Initialize git repository**

```bash
git init
echo "node_modules/" > .gitignore
echo "dist/" >> .gitignore
echo "src-tauri/target/" >> .gitignore
echo ".tauri/" >> .gitignore
git add .gitignore
git commit -m "chore: initialize project"
```

---

### Task 2: Initialize Vite + React + TypeScript Project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/vite-env.d.ts`

**Step 1: Create package.json**

```bash
cd C:/coding/markdown-converter-v5
```

Create `package.json`:
```json
{
  "name": "markdown-converter-v5",
  "version": "5.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0"
  }
}
```

**Step 2: Install dependencies**

```bash
npm install
```

Expected output:
```
added X packages in Xs
```

**Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Step 4: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

**Step 5: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
```

**Step 6: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Markdown Converter</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**Step 7: Create src/vite-env.d.ts**

```typescript
/// <reference types="vite/client" />
```

**Step 8: Create src/main.tsx**

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

**Step 9: Create src/App.tsx**

```typescript
function App() {
  return (
    <div className="app">
      <h1>Markdown Converter v5</h1>
      <p>React + Tauri + PWA</p>
    </div>
  );
}

export default App;
```

**Step 10: Create placeholder CSS**

```bash
mkdir -p C:/coding/markdown-converter-v5/src/styles
```

Create `src/styles/globals.css`:
```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: system-ui, -apple-system, sans-serif;
}

.app {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
}

h1 {
  font-size: 2rem;
  margin-bottom: 1rem;
}
```

**Step 11: Verify build works**

```bash
npm run build
```

Expected output:
```
vite v5.x.x building for production...
✓ X modules transformed.
dist/index.html                  X.xx kB │ gzip: X.xx kB
dist/assets/index-XXXXXXXX.js    X.xx kB │ gzip: X.xx kB
✓ built in X.XXs
```

**Step 12: Commit**

```bash
git add .
git commit -m "chore: initialize Vite + React + TypeScript project"
```

---

### Task 3: Configure Tailwind CSS

**Files:**
- Modify: `package.json`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`
- Modify: `src/styles/globals.css`

**Step 1: Install Tailwind dependencies**

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Expected output:
```
Created tailwind.config.js
Created postcss.config.js
```

**Step 2: Update tailwind.config.ts**

Rename `tailwind.config.js` to `tailwind.config.ts` and replace content:
```typescript
import type { Config } from 'tailwindcss';

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
```

**Step 3: Update globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom base styles */
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --primary: 227 44% 52%;
    --primary-foreground: 0 0% 100%;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --primary: 227 44% 52%;
    --primary-foreground: 0 0% 100%;
  }
}

body {
  @apply bg-background text-foreground;
  font-feature-settings: "rlig" 1, "calt" 1;
}
```

**Step 4: Update App.tsx to use Tailwind**

```typescript
function App() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <h1 className="text-4xl font-bold text-primary mb-4">
        Markdown Converter v5
      </h1>
      <p className="text-muted-foreground">React + Tauri + PWA</p>
    </div>
  );
}

export default App;
```

**Step 5: Verify build still works**

```bash
npm run build
```

Expected: Build succeeds without errors

**Step 6: Commit**

```bash
git add .
git commit -m "chore: configure Tailwind CSS"
```

---

### Task 4: Setup Shadcn/ui

**Files:**
- Modify: `package.json`
- Create: `components.json`
- Create: `src/lib/utils.ts`
- Create: `src/components/ui/button.tsx`

**Step 1: Install Shadcn/ui dependencies**

```bash
npm install class-variance-authority clsx tailwind-merge
npm install -D @types/node
```

**Step 2: Create components.json**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/styles/globals.css",
    "baseColor": "slate",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

**Step 3: Create src/lib/utils.ts**

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

**Step 4: Update tailwind.config.ts with Shadcn colors**

```typescript
import type { Config } from 'tailwindcss';

export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
```

**Step 5: Install tailwindcss-animate**

```bash
npm install -D tailwindcss-animate
```

**Step 6: Update globals.css with full Shadcn variables**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 227 44% 52%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 227 44% 52%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 227 44% 52%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 227 44% 52%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-feature-settings: "rlig" 1, "calt" 1;
  }
}
```

**Step 7: Verify build**

```bash
npm run build
```

**Step 8: Commit**

```bash
git add .
git commit -m "chore: setup Shadcn/ui configuration"
```

---

### Task 5: Create Zustand Stores

**Files:**
- Create: `src/stores/editorStore.ts`
- Create: `src/stores/settingsStore.ts`
- Create: `src/stores/themeStore.ts`
- Create: `src/stores/sidebarStore.ts`
- Create: `src/types/editor.ts`

**Step 1: Create type definitions**

Create `src/types/editor.ts`:
```typescript
export interface CursorPosition {
  line: number;
  column: number;
}

export interface Tab {
  id: string;
  title: string;
  content: string;
  filePath?: string;
  isDirty: boolean;
  cursorPosition: CursorPosition;
}

export interface FileInfo {
  name: string;
  isDir: boolean;
  size: number;
  modified: number;
}
```

**Step 2: Create editorStore.ts**

Create `src/stores/editorStore.ts`:
```typescript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Tab, CursorPosition } from '@/types/editor';

interface EditorState {
  tabs: Tab[];
  activeTabId: string | null;

  createTab: (title?: string, content?: string) => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateContent: (id: string, content: string) => void;
  updateCursorPosition: (id: string, pos: CursorPosition) => void;
  markSaved: (id: string, filePath?: string) => void;
  getActiveTab: () => Tab | null;
}

export const useEditorStore = create<EditorState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,

      createTab: (title = 'Untitled', content = '') => {
        const id = crypto.randomUUID();
        const tab: Tab = {
          id,
          title,
          content,
          isDirty: false,
          cursorPosition: { line: 1, column: 1 },
        };
        set((state) => ({
          tabs: [...state.tabs, tab],
          activeTabId: id,
        }));
        return id;
      },

      closeTab: (id) => {
        set((state) => {
          const newTabs = state.tabs.filter((t) => t.id !== id);
          const newActiveId =
            state.activeTabId === id
              ? newTabs[newTabs.length - 1]?.id ?? null
              : state.activeTabId;
          return { tabs: newTabs, activeTabId: newActiveId };
        });
      },

      setActiveTab: (id) => set({ activeTabId: id }),

      updateContent: (id, content) => {
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === id ? { ...tab, content, isDirty: true } : tab
          ),
        }));
      },

      updateCursorPosition: (id, pos) => {
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === id ? { ...tab, cursorPosition: pos } : tab
          ),
        }));
      },

      markSaved: (id, filePath) => {
        set((state) => ({
          tabs: state.tabs.map((tab) =>
            tab.id === id
              ? { ...tab, isDirty: false, filePath, title: filePath?.split('/').pop() ?? tab.title }
              : tab
          ),
        }));
      },

      getActiveTab: () => {
        const state = get();
        return state.tabs.find((t) => t.id === state.activeTabId) ?? null;
      },
    }),
    {
      name: 'editor-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tabs: state.tabs.map((t) => ({ ...t, content: '' })), // Don't persist content
      }),
    }
  )
);
```

**Step 3: Create settingsStore.ts**

Create `src/stores/settingsStore.ts`:
```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type PreviewMode = 'split' | 'editor' | 'preview';

interface SettingsState {
  fontSize: number;
  fontFamily: string;
  previewMode: PreviewMode;
  showLineNumbers: boolean;
  wordWrap: boolean;
  autoSave: boolean;
  autoSaveInterval: number;

  setFontSize: (size: number) => void;
  setFontFamily: (family: string) => void;
  setPreviewMode: (mode: PreviewMode) => void;
  toggleLineNumbers: () => void;
  toggleWordWrap: () => void;
  toggleAutoSave: () => void;
  setAutoSaveInterval: (interval: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      fontSize: 14,
      fontFamily: 'JetBrains Mono',
      previewMode: 'split',
      showLineNumbers: true,
      wordWrap: true,
      autoSave: true,
      autoSaveInterval: 30000,

      setFontSize: (fontSize) => set({ fontSize }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setPreviewMode: (previewMode) => set({ previewMode }),
      toggleLineNumbers: () => set((state) => ({ showLineNumbers: !state.showLineNumbers })),
      toggleWordWrap: () => set((state) => ({ wordWrap: !state.wordWrap })),
      toggleAutoSave: () => set((state) => ({ autoSave: !state.autoSave })),
      setAutoSaveInterval: (autoSaveInterval) => set({ autoSaveInterval }),
    }),
    { name: 'settings-storage' }
  )
);
```

**Step 4: Create themeStore.ts**

Create `src/stores/themeStore.ts`:
```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ThemeName =
  | 'github-light'
  | 'github-dark'
  | 'solarized'
  | 'monokai'
  | 'dracula'
  | 'nord'
  | 'onedark'
  | 'atomonelight'
  | 'material'
  | 'gruvbox-dark'
  | 'gruvbox-light'
  | 'tokyonight'
  | 'palenight';

interface ThemeState {
  theme: ThemeName;
  isDark: boolean;

  setTheme: (theme: ThemeName) => void;
  toggleDarkMode: () => void;
}

const darkThemes: ThemeName[] = [
  'github-dark',
  'monokai',
  'dracula',
  'nord',
  'onedark',
  'material',
  'gruvbox-dark',
  'tokyonight',
  'palenight',
];

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'github-light',
      isDark: false,

      setTheme: (theme) => {
        const isDark = darkThemes.includes(theme);
        set({ theme, isDark });

        // Update document class for Tailwind dark mode
        if (isDark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      },

      toggleDarkMode: () => {
        set((state) => {
          const newIsDark = !state.isDark;
          if (newIsDark) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
          return { isDark: newIsDark };
        });
      },
    }),
    { name: 'theme-storage' }
  )
);
```

**Step 5: Create sidebarStore.ts**

Create `src/stores/sidebarStore.ts`:
```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type SidebarPanel = 'explorer' | 'git' | 'snippets' | 'templates';

interface SidebarState {
  activePanel: SidebarPanel;
  collapsed: boolean;
  width: number;

  setActivePanel: (panel: SidebarPanel) => void;
  toggleCollapse: () => void;
  setWidth: (width: number) => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      activePanel: 'explorer',
      collapsed: false,
      width: 280,

      setActivePanel: (activePanel) => set({ activePanel, collapsed: false }),
      toggleCollapse: () => set((state) => ({ collapsed: !state.collapsed })),
      setWidth: (width) => set({ width }),
    }),
    { name: 'sidebar-storage' }
  )
);
```

**Step 6: Create stores index**

Create `src/stores/index.ts`:
```typescript
export { useEditorStore } from './editorStore';
export { useSettingsStore } from './settingsStore';
export { useThemeStore } from './themeStore';
export { useSidebarStore } from './sidebarStore';
```

**Step 7: Verify build**

```bash
npm run build
```

**Step 8: Commit**

```bash
git add .
git commit -m "feat: add Zustand stores for editor, settings, theme, and sidebar"
```

---

### Task 6: Create Platform Adapter Types

**Files:**
- Create: `src/adapters/types.ts`
- Create: `src/types/platform.ts`

**Step 1: Create platform types**

Create `src/types/platform.ts`:
```typescript
import type { FileInfo } from './editor';

export interface PdfOptions {
  paperSize: string;
  margins: string;
  header?: string;
  footer?: string;
  toc: boolean;
}

export interface DocxOptions {
  template?: string;
  margins?: string;
}

export interface HtmlOptions {
  standalone: boolean;
  includeCss: boolean;
}

export interface ConversionResult {
  input: string;
  output: string;
  success: boolean;
  error?: string;
}

export interface WatchCallback {
  (event: { type: string; path: string }): void;
}

export interface PlatformCapabilities {
  hasPandoc: boolean;
  hasFfmpeg: boolean;
  hasLibreOffice: boolean;
  hasDirectFs: boolean;
  hasSystemNotifications: boolean;
}

export interface FileSystemAdapter {
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<void>;
  deleteFile: (path: string) => Promise<void>;
  listDirectory: (path: string) => Promise<FileInfo[]>;
  exists: (path: string) => Promise<boolean>;
  watchDirectory?: (path: string, callback: WatchCallback) => () => void;
}

export interface ConversionAdapter {
  toPdf: (content: string, options: PdfOptions, outputPath: string) => Promise<string>;
  toDocx: (content: string, options: DocxOptions, outputPath: string) => Promise<string>;
  toHtml: (content: string, options: HtmlOptions) => Promise<string>;
  batchConvert: (files: string[], outputDir: string, format: string) => Promise<ConversionResult[]>;
}
```

**Step 2: Create adapter types**

Create `src/adapters/types.ts`:
```typescript
import type {
  FileSystemAdapter,
  ConversionAdapter,
  PlatformCapabilities,
} from '@/types/platform';

export interface PlatformAdapter {
  readonly name: 'tauri' | 'web';
  readonly fs: FileSystemAdapter;
  readonly convert: ConversionAdapter;
  readonly capabilities: PlatformCapabilities;
}
```

**Step 3: Verify build**

```bash
npm run build
```

**Step 4: Commit**

```bash
git add .
git commit -m "feat: add platform adapter type definitions"
```

---

### Task 7: Create Web Platform Adapter

**Files:**
- Create: `src/adapters/web/index.ts`
- Create: `src/adapters/web/fs.ts`
- Create: `src/adapters/web/convert.ts`
- Create: `src/adapters/web/system.ts`
- Create: `src/lib/db.ts`

**Step 1: Create IndexedDB helper**

Create `src/lib/db.ts`:
```typescript
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

interface MarkdownConverterDB extends DBSchema {
  files: {
    key: string;
    value: {
      path: string;
      content: string;
      modified: number;
      size: number;
    };
  };
  settings: {
    key: string;
    value: unknown;
  };
}

let db: IDBPDatabase<MarkdownConverterDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<MarkdownConverterDB>> {
  if (db) return db;

  db = await openDB<MarkdownConverterDB>('markdown-converter', 1, {
    upgrade(database) {
      database.createObjectStore('files', { keyPath: 'path' });
      database.createObjectStore('settings');
    },
  });

  return db;
}

export const dbStorage = {
  async saveFile(path: string, content: string): Promise<void> {
    const database = await getDB();
    await database.put('files', {
      path,
      content,
      modified: Date.now(),
      size: content.length,
    });
  },

  async getFile(path: string): Promise<string | undefined> {
    const database = await getDB();
    const file = await database.get('files', path);
    return file?.content;
  },

  async deleteFile(path: string): Promise<void> {
    const database = await getDB();
    await database.delete('files', path);
  },

  async listFiles(): Promise<string[]> {
    const database = await getDB();
    return (await database.getAllKeys('files')) as string[];
  },
};
```

**Step 2: Install idb**

```bash
npm install idb
```

**Step 3: Create web fs adapter**

Create `src/adapters/web/fs.ts`:
```typescript
import type { FileSystemAdapter } from '@/types/platform';
import type { FileInfo } from '@/types/editor';
import { dbStorage } from '@/lib/db';

export const webFsAdapter: FileSystemAdapter = {
  async readFile(path: string): Promise<string> {
    const content = await dbStorage.getFile(path);
    if (content === undefined) {
      throw new Error(`File not found: ${path}`);
    }
    return content;
  },

  async writeFile(path: string, content: string): Promise<void> {
    await dbStorage.saveFile(path, content);
  },

  async deleteFile(path: string): Promise<void> {
    await dbStorage.deleteFile(path);
  },

  async listDirectory(_path: string): Promise<FileInfo[]> {
    // In web mode, we use a flat file list from IndexedDB
    const paths = await dbStorage.listFiles();
    return paths.map((path) => ({
      name: path.split('/').pop() ?? path,
      isDir: false,
      size: 0,
      modified: Date.now(),
    }));
  },

  async exists(path: string): Promise<boolean> {
    const content = await dbStorage.getFile(path);
    return content !== undefined;
  },
};
```

**Step 4: Create web convert adapter**

Create `src/adapters/web/convert.ts`:
```typescript
import type { ConversionAdapter } from '@/types/platform';

export const webConvertAdapter: ConversionAdapter = {
  async toPdf(_content: string, _options, _outputPath): Promise<string> {
    // Web uses WASM or cloud service - placeholder for now
    throw new Error('PDF conversion requires desktop app or cloud service');
  },

  async toDocx(_content: string, _options, _outputPath): Promise<string> {
    throw new Error('DOCX conversion requires desktop app');
  },

  async toHtml(content: string, options): Promise<string> {
    // Basic HTML conversion using marked (will be implemented later)
    const { marked } = await import('marked');
    const html = await marked(content);

    if (options.standalone) {
      return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Exported Markdown</title>
  ${options.includeCss ? '<link rel="stylesheet" href="styles.css">' : ''}
</head>
<body>
${html}
</body>
</html>`;
    }

    return html;
  },

  async batchConvert(_files: string[], _outputDir: string, _format: string) {
    throw new Error('Batch conversion requires desktop app');
  },
};
```

**Step 5: Create web system adapter**

Create `src/adapters/web/system.ts`:
```typescript
import type { PlatformCapabilities } from '@/types/platform';

export const webCapabilities: PlatformCapabilities = {
  hasPandoc: false,
  hasFfmpeg: false,
  hasLibreOffice: false,
  hasDirectFs: false,
  hasSystemNotifications: 'Notification' in window,
};
```

**Step 6: Create web adapter index**

Create `src/adapters/web/index.ts`:
```typescript
import type { PlatformAdapter } from '../types';
import { webFsAdapter } from './fs';
import { webConvertAdapter } from './convert';
import { webCapabilities } from './system';

export const webAdapter: PlatformAdapter = {
  name: 'web',
  fs: webFsAdapter,
  convert: webConvertAdapter,
  capabilities: webCapabilities,
};
```

**Step 7: Install marked**

```bash
npm install marked
```

**Step 8: Verify build**

```bash
npm run build
```

**Step 9: Commit**

```bash
git add .
git commit -m "feat: add web platform adapter with IndexedDB storage"
```

---

### Task 8: Create Tauri Platform Adapter (Stub)

**Files:**
- Create: `src/adapters/tauri/index.ts`
- Create: `src/adapters/tauri/fs.ts`
- Create: `src/adapters/tauri/convert.ts`
- Create: `src/adapters/tauri/system.ts`

**Step 1: Create tauri fs adapter stub**

Create `src/adapters/tauri/fs.ts`:
```typescript
import type { FileSystemAdapter } from '@/types/platform';
import type { FileInfo } from '@/types/editor';

// These will be implemented when Tauri is set up
export const tauriFsAdapter: FileSystemAdapter = {
  async readFile(path: string): Promise<string> {
    const { invoke } = await import('@tauri-apps/api/tauri');
    return invoke('read_file', { path });
  },

  async writeFile(path: string, content: string): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/tauri');
    await invoke('write_file', { path, content });
  },

  async deleteFile(path: string): Promise<void> {
    const { invoke } = await import('@tauri-apps/api/tauri');
    await invoke('delete_file', { path });
  },

  async listDirectory(path: string): Promise<FileInfo[]> {
    const { invoke } = await import('@tauri-apps/api/tauri');
    return invoke('list_directory', { path });
  },

  async exists(path: string): Promise<boolean> {
    const { invoke } = await import('@tauri-apps/api/tauri');
    return invoke('path_exists', { path });
  },

  watchDirectory(path: string, callback) {
    // Will use Tauri events for file watching
    console.log('File watching not yet implemented for:', path);
    return () => {};
  },
};
```

**Step 2: Create tauri convert adapter stub**

Create `src/adapters/tauri/convert.ts`:
```typescript
import type { ConversionAdapter } from '@/types/platform';

export const tauriConvertAdapter: ConversionAdapter = {
  async toPdf(content: string, options, outputPath): Promise<string> {
    const { invoke } = await import('@tauri-apps/api/tauri');
    return invoke('convert_to_pdf', { content, options, outputPath });
  },

  async toDocx(content: string, options, outputPath): Promise<string> {
    const { invoke } = await import('@tauri-apps/api/tauri');
    return invoke('convert_to_docx', { content, options, outputPath });
  },

  async toHtml(content: string, options): Promise<string> {
    const { invoke } = await import('@tauri-apps/api/tauri');
    return invoke('convert_to_html', { content, options });
  },

  async batchConvert(files: string[], outputDir: string, format: string) {
    const { invoke } = await import('@tauri-apps/api/tauri');
    return invoke('batch_convert', { files, outputDir, format });
  },
};
```

**Step 3: Create tauri system adapter stub**

Create `src/adapters/tauri/system.ts`:
```typescript
import type { PlatformCapabilities } from '@/types/platform';

export const tauriCapabilities: PlatformCapabilities = {
  hasPandoc: true,  // Will be detected at runtime
  hasFfmpeg: true,
  hasLibreOffice: true,
  hasDirectFs: true,
  hasSystemNotifications: true,
};
```

**Step 4: Create tauri adapter index**

Create `src/adapters/tauri/index.ts`:
```typescript
import type { PlatformAdapter } from '../types';
import { tauriFsAdapter } from './fs';
import { tauriConvertAdapter } from './convert';
import { tauriCapabilities } from './system';

export const tauriAdapter: PlatformAdapter = {
  name: 'tauri',
  fs: tauriFsAdapter,
  convert: tauriConvertAdapter,
  capabilities: tauriCapabilities,
};
```

**Step 5: Create main adapter export with platform detection**

Create `src/adapters/index.ts`:
```typescript
import type { PlatformAdapter } from './types';
import { webAdapter } from './web';
import { tauriAdapter } from './tauri';

// Detect platform at runtime
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

export const adapter: PlatformAdapter = isTauri ? tauriAdapter : webAdapter;

export type { PlatformAdapter } from './types';
```

**Step 6: Verify build**

```bash
npm run build
```

**Step 7: Commit**

```bash
git add .
git commit -m "feat: add Tauri platform adapter stubs"
```

---

### Task 9: Initialize Tauri Project

**Files:**
- Create: `src-tauri/` directory with Tauri configuration

**Step 1: Install Tauri CLI**

```bash
npm install -D @tauri-apps/cli
```

**Step 2: Initialize Tauri**

```bash
npm run tauri init -- --app-name "Markdown Converter" --window-title "Markdown Converter" --dev-url http://localhost:5173 --before-dev-command "npm run dev" --before-build-command "npm run build"
```

Expected output:
```
[1/3] Doing some setup...
[2/3] Building initial Tauri app...
[3/3] Setup complete!
```

**Step 3: Update tauri.conf.json**

After initialization, update `src-tauri/tauri.conf.json`:
```json
{
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devPath": "http://localhost:5173",
    "distDir": "../dist"
  },
  "package": {
    "productName": "Markdown Converter",
    "version": "5.0.0"
  },
  "tauri": {
    "allowlist": {
      "all": false,
      "fs": {
        "all": true,
        "scope": ["$HOME/**", "$DOCUMENT/**", "$DOWNLOAD/**"]
      },
      "path": {
        "all": true
      },
      "shell": {
        "all": true,
        "execute": true,
        "scope": [
          {
            "name": "pandoc",
            "cmd": "pandoc",
            "args": true
          },
          {
            "name": "ffmpeg",
            "cmd": "ffmpeg",
            "args": true
          }
        ]
      },
      "dialog": {
        "all": true
      },
      "notification": {
        "all": true
      }
    },
    "bundle": {
      "active": true,
      "icon": [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.icns",
        "icons/icon.ico"
      ],
      "identifier": "com.concreteinfo.markdownconverter",
      "targets": "all"
    },
    "security": {
      "csp": null
    },
    "windows": [
      {
        "title": "Markdown Converter",
        "width": 1200,
        "height": 800,
        "minWidth": 800,
        "minHeight": 600,
        "resizable": true,
        "fullscreen": false
      }
    ]
  }
}
```

**Step 4: Verify Tauri builds**

```bash
npm run tauri build -- --debug
```

Note: This may fail if Rust toolchain is not installed. Install from https://rustup.rs

**Step 5: Commit**

```bash
git add .
git commit -m "chore: initialize Tauri project structure"
```

---

### Task 10: Create Basic Layout Components

**Files:**
- Create: `src/components/layout/MainLayout.tsx`
- Create: `src/components/layout/TitleBar.tsx`
- Create: `src/components/layout/StatusBar.tsx`
- Create: `src/components/layout/index.ts`

**Step 1: Create TitleBar component**

Create `src/components/layout/TitleBar.tsx`:
```typescript
import { useThemeStore } from '@/stores';

export function TitleBar() {
  const { isDark, toggleDarkMode } = useThemeStore();

  // Only show custom title bar in Tauri
  const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

  if (!isTauri) return null;

  return (
    <div
      className="h-8 bg-secondary flex items-center justify-between px-4"
      data-tauri-drag-region
    >
      <span className="text-sm font-medium" data-tauri-drag-region>
        Markdown Converter
      </span>
      <button
        onClick={toggleDarkMode}
        className="p-1 hover:bg-accent rounded"
        aria-label="Toggle dark mode"
      >
        {isDark ? '☀️' : '🌙'}
      </button>
    </div>
  );
}
```

**Step 2: Create StatusBar component**

Create `src/components/layout/StatusBar.tsx`:
```typescript
import { useEditorStore, useSettingsStore } from '@/stores';

export function StatusBar() {
  const { tabs, activeTabId } = useEditorStore();
  const { fontSize, previewMode } = useSettingsStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const lineCount = activeTab?.content.split('\n').length ?? 0;
  const cursorPos = activeTab?.cursorPosition ?? { line: 1, column: 1 };

  return (
    <div className="h-6 bg-secondary border-t border-border flex items-center justify-between px-4 text-xs text-muted-foreground">
      <div className="flex items-center gap-4">
        <span>Ln {cursorPos.line}, Col {cursorPos.column}</span>
        <span>{lineCount} lines</span>
      </div>
      <div className="flex items-center gap-4">
        <span>{fontSize}px</span>
        <span className="capitalize">{previewMode}</span>
        <span>UTF-8</span>
      </div>
    </div>
  );
}
```

**Step 3: Create MainLayout component**

Create `src/components/layout/MainLayout.tsx`:
```typescript
import { ReactNode } from 'react';
import { TitleBar } from './TitleBar';
import { StatusBar } from './StatusBar';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <TitleBar />
      <main className="flex-1 overflow-hidden">{children}</main>
      <StatusBar />
    </div>
  );
}
```

**Step 4: Create index export**

Create `src/components/layout/index.ts`:
```typescript
export { MainLayout } from './MainLayout';
export { TitleBar } from './TitleBar';
export { StatusBar } from './StatusBar';
```

**Step 5: Update App.tsx to use layout**

Update `src/App.tsx`:
```typescript
import { MainLayout } from '@/components/layout';
import { useEditorStore } from '@/stores';

function App() {
  const { tabs, activeTabId, createTab, updateContent } = useEditorStore();

  // Create initial tab if none exists
  if (tabs.length === 0) {
    createTab('Welcome');
  }

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <MainLayout>
      <div className="flex h-full">
        {/* Editor Pane */}
        <div className="flex-1 p-4 border-r border-border">
          <textarea
            className="w-full h-full bg-background border-none outline-none resize-none font-mono text-sm"
            value={activeTab?.content ?? ''}
            onChange={(e) => {
              if (activeTabId) {
                updateContent(activeTabId, e.target.value);
              }
            }}
            placeholder="Start typing markdown..."
          />
        </div>

        {/* Preview Pane */}
        <div className="flex-1 p-4 overflow-auto">
          <div className="prose prose-sm max-w-none">
            <p className="text-muted-foreground">
              Preview will be implemented with marked + highlight.js
            </p>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

export default App;
```

**Step 6: Verify build**

```bash
npm run build
```

**Step 7: Commit**

```bash
git add .
git commit -m "feat: add basic layout components (TitleBar, StatusBar, MainLayout)"
```

---

## Phase 1 Summary

After completing Tasks 1-10, you will have:

1. ✅ New project initialized with Vite + React + TypeScript
2. ✅ Tailwind CSS configured with Shadcn/ui design tokens
3. ✅ Zustand stores for state management
4. ✅ Platform adapter pattern with web implementation
5. ✅ Tauri project structure initialized
6. ✅ Basic layout components

**Next Phase:** Core Editor (CodeMirror integration, Markdown preview, themes)

---

## Remaining Phases (High-Level)

### Phase 2: Core Editor (Week 3-4)
- Task 11: Integrate CodeMirror 6 editor
- Task 12: Create MarkdownPreview component
- Task 13: Implement theme system
- Task 14: Add tab management UI
- Task 15: Implement keyboard shortcuts

### Phase 3: Sidebar & Panels (Week 5)
- Task 16: Create collapsible sidebar
- Task 17: Implement ExplorerPanel
- Task 18: Implement GitPanel
- Task 19: Implement SnippetsPanel
- Task 20: Implement TemplatesPanel

### Phase 4: Platform Adapters (Week 6)
- Task 21: Complete Tauri Rust commands
- Task 22: Add capability detection
- Task 23: Implement file watching

### Phase 5: Export & Conversion (Week 7)
- Task 24-30: Export dialogs

### Phase 6: PWA & Polish (Week 8)
- Task 31-35: PWA configuration and optimization

---

*Plan generated: 2026-03-15*
*Based on design: docs/plans/2026-03-15-react-tauri-pwa-design.md*
