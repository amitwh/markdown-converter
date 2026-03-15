# MarkdownConverter v5.0 - React + Tauri + PWA Architecture Design

**Date:** 2026-03-15
**Status:** Approved
**Target Platforms:** Desktop (Tauri), Web (PWA), Mobile (Future)

---

## Executive Summary

This document outlines the architecture for MarkdownConverter v5.0, a complete rewrite using React, Tauri, and PWA technologies. The new architecture enables:

- **Multi-platform support**: Single codebase for desktop, web, and future mobile
- **Improved security**: Eliminates critical Electron vulnerabilities by design
- **Reduced bundle size**: ~5-10MB desktop, ~137KB web (vs 150MB+ Electron)
- **Better maintainability**: Component-based architecture with TypeScript
- **Offline support**: Full PWA capabilities with IndexedDB storage

---

## 1. Project Structure

```
markdown-converter-v5/
├── src/
│   ├── components/
│   │   ├── ui/                    # Shadcn/ui components (button, dialog, etc.)
│   │   ├── editor/                # CodeMirror wrapper, toolbar
│   │   ├── preview/               # Markdown preview, theme rendering
│   │   ├── sidebar/               # Explorer, Git, Snippets, Templates panels
│   │   ├── tabs/                  # Tab bar, tab management
│   │   ├── dialogs/               # Export, batch converter, settings dialogs
│   │   └── layout/                # Main layout, splitter panes
│   │
│   ├── hooks/
│   │   ├── useEditor.ts           # Editor state & actions
│   │   ├── useTheme.ts            # Theme management
│   │   ├── useFileSystem.ts       # File operations (uses adapter)
│   │   ├── useConversion.ts       # Conversion operations
│   │   └── useKeyboardShortcuts.ts
│   │
│   ├── stores/
│   │   ├── editorStore.ts         # Content, tabs, cursor position
│   │   ├── settingsStore.ts       # User preferences
│   │   ├── themeStore.ts          # Active theme, custom themes
│   │   └── sidebarStore.ts        # Sidebar state, active panel
│   │
│   ├── adapters/
│   │   ├── types.ts               # Interface definitions
│   │   ├── tauri/
│   │   │   ├── index.ts           # Tauri adapter implementation
│   │   │   ├── fs.ts              # File system via Tauri
│   │   │   ├── convert.ts         # Pandoc, FFmpeg via Tauri
│   │   │   └── system.ts          # System info, paths
│   │   ├── web/
│   │   │   ├── index.ts           # Web adapter implementation
│   │   │   ├── fs.ts              # IndexedDB + File System Access API
│   │   │   ├── convert.ts         # WASM converters, cloud fallback
│   │   │   └── system.ts          # Browser capabilities
│   │   └── index.ts               # Platform detection & export
│   │
│   ├── wasm/
│   │   ├── pdf.wasm               # PDF generation
│   │   ├── marked.wasm            # Markdown parsing (if available)
│   │   └── loader.ts              # WASM module loader
│   │
│   ├── lib/
│   │   ├── markdown.ts            # Marked + plugins config
│   │   ├── syntax.ts              # Highlight.js config
│   │   ├── mermaid.ts             # Diagram rendering
│   │   └── utils.ts               # Helper functions
│   │
│   ├── styles/
│   │   ├── globals.css            # Tailwind imports, CSS variables
│   │   ├── themes/                # Theme CSS files
│   │   └── editor.css             # CodeMirror styling
│   │
│   ├── types/
│   │   ├── editor.ts              # Editor-related types
│   │   ├── conversion.ts          # Conversion options types
│   │   └── platform.ts            # Platform capability types
│   │
│   ├── App.tsx                    # Root component
│   ├── main.tsx                   # Entry point
│   └── vite-env.d.ts
│
├── src-tauri/                     # Tauri backend (Rust)
│   ├── src/
│   │   ├── main.rs                # Tauri entry
│   │   ├── commands/              # IPC command handlers
│   │   │   ├── fs.rs              # File system operations
│   │   │   ├── convert.rs         # Pandoc, FFmpeg wrappers
│   │   │   └── system.rs          # System utilities
│   │   └── lib.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── public/
│   ├── manifest.json              # PWA manifest
│   ├── sw.js                      # Service worker
│   ├── fonts/                     # JetBrains Mono, Inter
│   └── icons/                     # App icons
│
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── components.json                # Shadcn/ui config
```

---

## 2. Component Architecture

```tsx
// Component hierarchy

<App>                              // Root layout, theme provider
├── <Layout>
│   ├── <TitleBar />              // Draggable title bar (desktop only)
│   ├── <TabBar />                // Document tabs
│   ├── <MainContent>
│   │   ├── <Sidebar>             // Collapsible sidebar
│   │   │   ├── <ExplorerPanel />
│   │   │   ├── <GitPanel />
│   │   │   ├── <SnippetsPanel />
│   │   │   └── <TemplatesPanel />
│   │   ├── <EditorPane>          // Split view container
│   │   │   ├── <CodeMirrorEditor />
│   │   │   └── <PreviewPane>
│   │   │       └── <MarkdownPreview />
│   │   └── <BottomPanel>         // REPL, terminal, output
│   └── <StatusBar />             // Line count, encoding, status
│
└── <Dialogs>                      // Portal-based dialogs
    ├── <ExportDialog />
    ├── <BatchConvertDialog />
    ├── <SettingsDialog />
    ├── <ThemeDialog />
    └── <PdfEditorDialog />
```

**Key Components:**

| Component | Props | Responsibility |
|-----------|-------|----------------|
| `CodeMirrorEditor` | `content`, `onChange`, `theme` | Wrap CodeMirror 6 with React |
| `MarkdownPreview` | `content`, `theme` | Render sanitized HTML with themes |
| `TabBar` | `tabs`, `activeId`, `onSelect`, `onClose` | Manage document tabs |
| `Sidebar` | `activePanel`, `collapsed` | Collapsible sidebar container |
| `ExportDialog` | `format`, `options` | Export configuration UI |

---

## 3. State Management (Zustand)

### Editor Store

```typescript
interface Tab {
  id: string;
  title: string;
  content: string;
  filePath?: string;
  isDirty: boolean;
  cursorPosition: { line: number; column: number };
}

interface EditorState {
  tabs: Tab[];
  activeTabId: string | null;

  // Actions
  createTab: (title?: string) => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateContent: (id: string, content: string) => void;
  updateCursorPosition: (id: string, pos: { line: number; column: number }) => void;
  markSaved: (id: string, filePath?: string) => void;
}
```

### Settings Store

```typescript
interface SettingsState {
  theme: string;
  fontSize: number;
  fontFamily: string;
  previewMode: 'split' | 'editor' | 'preview';
  showLineNumbers: boolean;
  wordWrap: boolean;
  autoSave: boolean;
  autoSaveInterval: number;
}
```

**Stores Summary:**

| Store | State | Persisted |
|-------|-------|-----------|
| `editorStore` | Tabs, content, cursor | Tab metadata only |
| `settingsStore` | User preferences | Yes |
| `themeStore` | Active theme, custom themes | Yes |
| `sidebarStore` | Panel state, width | Yes |

---

## 4. Platform Adapters

### Adapter Interface

```typescript
export interface PlatformAdapter {
  name: 'tauri' | 'web';

  // File System
  fs: {
    readFile: (path: string) => Promise<string>;
    writeFile: (path: string, content: string) => Promise<void>;
    deleteFile: (path: string) => Promise<void>;
    listDirectory: (path: string) => Promise<FileInfo[]>;
    exists: (path: string) => Promise<boolean>;
    watchDirectory?: (path: string, callback: WatchCallback) => () => void;
  };

  // Conversion
  convert: {
    toPdf: (content: string, options: PdfOptions) => Promise<Blob>;
    toDocx: (content: string, options: DocxOptions) => Promise<Blob>;
    toHtml: (content: string, options: HtmlOptions) => Promise<string>;
    batchConvert: (files: string[], format: string) => Promise<ConversionResult[]>;
  };

  // Capabilities
  capabilities: {
    hasPandoc: boolean;
    hasFfmpeg: boolean;
    hasLibreOffice: boolean;
    hasDirectFs: boolean;
    hasSystemNotifications: boolean;
  };
}
```

### Platform Detection

```typescript
// Auto-detect platform at startup
const isTauri = typeof window !== 'undefined' &&
                '__TAURI__' in window;

export const adapter: PlatformAdapter = isTauri
  ? tauriAdapter
  : webAdapter;
```

### Capability Differences

| Feature | Tauri (Desktop) | Web (PWA) |
|---------|-----------------|-----------|
| File System | Direct access | IndexedDB + File System Access API |
| PDF Export | Pandoc (native) | WASM converter |
| DOCX Export | Pandoc (native) | Limited/not available |
| Media Conversion | FFmpeg (native) | Cloud API or limited |
| File Watching | Native events | Not available |
| Offline | Always | Service Worker |

---

## 5. Build Configuration

### Vite Configuration

- Target: ESNext
- Minifier: esbuild
- Code splitting by vendor chunks
- Source maps enabled

### Tailwind Configuration

- Dark mode: `class` strategy
- Custom colors using CSS variables
- Custom font families (JetBrains Mono, Inter)
- Tailwindcss-animate plugin

### TypeScript Configuration

- Target: ES2022
- Strict mode enabled
- All strict checks enabled
- Path aliases (`@/*`)

### Bundle Sizes (Estimated)

| Chunk | Size (gzipped) |
|-------|----------------|
| `vendor-react` | ~12KB |
| `vendor-editor` | ~45KB |
| `vendor-markdown` | ~35KB |
| `vendor-ui` | ~15KB |
| `app` (your code) | ~30KB |
| **Total PWA** | **~137KB** |
| Tauri desktop | ~5-10MB (with WebView) |

---

## 6. Tauri Backend (Rust)

### IPC Commands

**File System:**
- `read_file` - Read file content
- `write_file` - Write file content
- `delete_file` - Delete file
- `list_directory` - List directory contents
- `path_exists` - Check path existence
- `watch_directory` - Watch for file changes

**Conversion:**
- `to_pdf` - Convert to PDF via Pandoc
- `to_docx` - Convert to DOCX via Pandoc
- `to_html` - Convert to HTML via Pandoc
- `batch_convert` - Batch conversion

**System:**
- `check_dependencies` - Check for Pandoc, FFmpeg, LibreOffice
- `get_config_dir` - Get config directory path

### Security Comparison

| Aspect | Electron (Current) | Tauri |
|--------|-------------------|-------|
| `nodeIntegration` | `true` (CVE) | Not possible |
| `contextIsolation` | `false` (CVE) | Always enforced |
| Bundle size | ~150MB | ~5-10MB |
| Memory usage | Higher | Lower |
| IPC security | Manual whitelist | Compile-time verified |

---

## 7. PWA Configuration

### Web App Manifest

- Name: Markdown Converter
- Display: Standalone
- Theme color: #5661b3
- File handlers for .md, .markdown, .txt
- Share target for receiving shared content

### Service Worker

- Cache-first for static assets
- Network-first for API calls
- Stale-while-revalidate for dynamic content
- Automatic update detection

### IndexedDB Storage

**Stores:**
- `files` - Offline file storage
- `settings` - User preferences
- `templates` - Custom templates

### PWA Features

| Feature | Implementation |
|---------|---------------|
| Offline support | Service Worker + IndexedDB |
| Install prompt | Web App Manifest |
| File handling | File System Access API (Chrome) |
| Share target | Share Target API |
| Background sync | Background Sync API |

---

## 8. Migration Plan

### Timeline: 8 Weeks

**Phase 1: Foundation (Week 1-2)**
- Initialize new repo
- Setup Vite + React + TypeScript
- Configure Tailwind + Shadcn/ui
- Setup Zustand stores
- Create platform adapter interfaces
- Setup Tauri project structure

**Phase 2: Core Editor (Week 3-4)**
- CodeMirrorEditor component
- MarkdownPreview component
- SplitPane layout
- Theme system
- Tab management
- Keyboard shortcuts

**Phase 3: Sidebar & Panels (Week 5)**
- Sidebar container
- ExplorerPanel
- GitPanel
- SnippetsPanel
- TemplatesPanel
- Bottom panel

**Phase 4: Platform Adapters (Week 6)**
- Web adapter implementation
- Tauri adapter implementation
- File system operations
- PDF conversion
- Capability detection

**Phase 5: Export & Conversion (Week 7)**
- ExportDialog
- BatchConvertDialog
- UniversalConverterDialog
- ImageConverterDialog
- AudioConverterDialog
- VideoConverterDialog
- PDF Editor Dialog

**Phase 6: PWA & Polish (Week 8)**
- Service Worker setup
- Web App Manifest
- IndexedDB storage
- Offline mode indicator
- Settings persistence
- Accessibility audit
- Performance optimization

### Parallel Development Strategy

```
Current Electron App (v4.x)     New React+Tauri App (v5.0)
        │                               │
        │  Bug fixes only               │  Active development
        │  Security patches             │  Feature migration
        ▼                               ▼
   Stable release  ────────────>  Beta release
   (maintained)                    (new features)
```

---

## 9. Design Decisions Summary

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Code Structure | Single repo with platform adapters | Lightest weight, clean separation |
| State Management | Zustand | Minimal (~1KB), simple API |
| UI Library | Shadcn/ui + Tailwind | Copy-paste ownership, excellent DX |
| Build Tool | Vite | Industry standard, fast HMR |
| TypeScript | Strict mode | Maximum type safety |
| Desktop Features | Hybrid (WASM core, desktop advanced) | Best of both worlds |
| Migration | Parallel development | Zero disruption to stable release |

---

## 10. Success Criteria

- [ ] All core editor features functional on both Tauri and PWA
- [ ] Bundle size under 150KB for PWA
- [ ] All 13 themes migrated and working
- [ ] Export to PDF works on both platforms
- [ ] Offline mode fully functional in PWA
- [ ] WCAG 2.1 AA accessibility compliance
- [ ] TypeScript strict mode with no `any` types
- [ ] All IPC channels have TypeScript types
- [ ] Security audit passes with no critical issues

---

## Appendix: Dependencies

### Production Dependencies

- `react` - UI library
- `react-dom` - React DOM renderer
- `zustand` - State management
- `@radix-ui/react-*` - Headless UI primitives
- `@codemirror/*` - Code editor
- `marked` - Markdown parser
- `highlight.js` - Syntax highlighting
- `mermaid` - Diagram rendering
- `dompurify` - HTML sanitization
- `class-variance-authority` - Component variants
- `clsx` + `tailwind-merge` - Class utilities
- `lucide-react` - Icons

### Development Dependencies

- `@tauri-apps/cli` - Tauri CLI
- `typescript` - TypeScript compiler
- `vite` - Build tool
- `tailwindcss` - CSS framework
- `eslint` - Linting
- `prettier` - Formatting

---

*Document generated: 2026-03-15*
*Next step: Invoke writing-plans skill to create detailed implementation plan*
