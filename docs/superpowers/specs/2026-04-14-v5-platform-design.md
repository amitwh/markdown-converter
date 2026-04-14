# MarkdownConverter v5.0 — Platform Design

**Date:** 2026-04-14
**Status:** Approved
**Author:** Amit Haridas

## Overview

Transform MarkdownConverter from a monolithic editor into an extensible platform with a plugin system and three feature packs, shipped together as v5.0.

## Subsystems

1. **Plugin System** — Lightweight plugin registry with extension points (sidebar, commands, settings, status bar, export hooks, event bus)
2. **Writing Studio Plugin** — Manuscript manager, goal tracking, writing sprints, snapshots, smart proofreading
3. **AI Assistant Plugin** — Multi-provider AI writing assistant (Ollama, LMStudio, GGUF direct with GPU, Anthropic, OpenAI)
4. **Collaboration Plugin** — Git-based async collaboration, comments/annotations, review requests

## Core Principle

**Existing functionality is never replaced or broken.** The plugin system is additive. All existing keyboard shortcuts, features, and UI remain untouched. Plugin shortcuts use `Ctrl+Alt+` namespace.

---

## 1. Plugin System

### File Structure

```
src/
  plugins/
    plugin-registry.js      # Load, register, lifecycle
    plugin-api.js            # Base class plugins extend
    plugin-loader.js         # Discovers and validates manifests
    built-in/
      writing-studio/
        manifest.json
        index.js
        panels/
        components/
      ai-assistant/
        manifest.json
        index.js
        providers/
      collaboration/
        manifest.json
        index.js
```

### Manifest Schema

```json
{
  "id": "writing-studio",
  "name": "Writing Studio",
  "version": "1.0.0",
  "description": "Manuscript management, goal tracking, writing sprints",
  "icon": "pen-tool",
  "extensionPoints": {
    "sidebar": { "panel": "panels/manuscript-panel.js", "order": 30 },
    "settings": { "section": "settings/index.js" },
    "statusBar": { "indicators": ["sprint-timer", "word-goal"] },
    "commands": [
      { "id": "start-sprint", "label": "Start Writing Sprint", "shortcut": "Ctrl+Alt+S" },
      { "id": "take-snapshot", "label": "Take Snapshot", "shortcut": "Ctrl+Alt+N" }
    ],
    "exportHooks": {
      "preExport": "hooks/pre-export.js",
      "postExport": "hooks/post-export.js"
    }
  },
  "settings": [
    { "key": "dailyGoal", "type": "number", "default": 1000, "label": "Daily word goal" },
    { "key": "sprintDuration", "type": "number", "default": 25, "label": "Sprint duration (min)" }
  ]
}
```

### Plugin Lifecycle

1. PluginLoader discovers manifests in `built-in/` + user plugins directory
2. PluginRegistry validates manifests
3. Each plugin calls `Plugin.init(context)` receiving scoped API context
4. Extension points registered (sidebar panels, commands, status bar items)
5. Plugins activate lazily — sidebar panel loads JS when user clicks tab

### Plugin Context API

Each plugin's `init()` receives:

```javascript
{
  sidebar: {
    registerPanel(id, { icon, title, component })
  },
  commands: {
    register(id, label, handler, shortcut?)
  },
  statusBar: {
    registerIndicator(id, { position, render })
  },
  settings: {
    get(key),                    // plugin-scoped
    set(key, value),             // auto-persisted via electron-store
    onChanged(key, callback)
  },
  editor: {
    getContent(),                // current document
    getSelection(),              // selected text
    insertAtCursor(text),        // requires opt-in
    onContentChanged(callback)
  },
  events: {
    on(event, handler),
    emit(event, data)
  },
  exports: {
    registerPreHook(handler),
    registerPostHook(handler)
  },
  ipc: {
    invoke(channel, ...args),
    on(channel, handler)
  }
}
```

### Event Bus Events

Each event has a versioned payload schema. Breaking changes increment the version suffix.

```
document:opened        → { filePath: string, tabId: string }
document:saved         → { filePath: string, tabId: string }
document:changed       → { tabId: string, content: string, wordCount: number }
editor:selection-changed → { tabId: string, text: string, from: {line,ch}, to: {line,ch} }
tab:switched           → { tabId: string, filePath: string }
tab:closed             → { tabId: string, filePath: string }
export:started         → { format: string, filePath: string }
export:completed       → { format: string, filePath: string, outputPath: string }
export:failed          → { format: string, error: string }
plugin:loaded          → { pluginId: string, version: string }
plugin:activated       → { pluginId: string }
plugin:deactivated     → { pluginId: string }
app:ready              → {}
app:before-quit        → {}
```

### Design Rules

- Built-in plugins use the same API as future third-party plugins
- Lazy activation — sidebar panels don't load until clicked
- Scoped settings: `plugins.<id>.<key>` in electron-store
- Plugin commands globally unique — registry rejects duplicate command IDs at load time
- **Plugin sandboxing**: each plugin handler is wrapped in try/catch. For CPU-intensive operations (AI inference, diff computation), plugins must delegate to main process via IPC. Handlers that block the renderer for >5s trigger a warning notification. Memory-hungry operations (GGUF inference) run in isolated child processes.
- **Cross-plugin graceful degradation**: plugins check `context.events.hasHandler('ai:analyze')` before emitting cross-plugin requests. If no handler (AI plugin disabled), show a "this feature requires the AI plugin" prompt instead of failing silently. All cross-plugin calls have a 30s timeout with default fallback behavior.

---

## 2. Writing Studio Plugin

### 2A. Manuscript / Project Manager

Folder-based project structure:

```
~/Manuscripts/
  my-novel/
    .project.json          # { title, targets, metadata }
    01-chapter-one.md
    02-chapter-two.md
    characters/
      protagonist.md
    research/
      world-building.md
    .snapshots/
      2026-04-14T10-30.json
```

`.project.json`:

```json
{
  "title": "My Novel",
  "type": "manuscript",
  "target": { "words": 80000, "deadline": "2026-09-01" },
  "chapters": [
    { "file": "01-chapter-one.md", "title": "The Beginning", "status": "draft" }
  ],
  "metadata": { "author": "", "genre": "", "synopsis": "" }
}
```

Sidebar panel shows project tree with drag-to-reorder, word counts per chapter, target progress bar. "Compile manuscript" exports all chapters as a single document.

### 2B. Goal Tracking & Writing Sprints

- **Status bar**: daily progress bar + sprint timer
- **Writing sprint**: configurable duration (15/25/30/45/60 min), word count delta, WPM at end
- **Goal tracking**: daily/weekly word goals, streak tracking, 30-day bar chart
- **Enhanced analytics**: session tracking, readability scores, productive time-of-day heatmap
- Data stored in `plugins.writing-studio.history` as date-keyed map

### 2C. Snapshot & Versioning

- `Ctrl+Alt+N` or toolbar button saves snapshot
- Stored as JSON: `{ timestamp, content, wordCount, cursorPos, label }`
- Snapshot panel in sidebar: Restore, Diff (side-by-side), auto-snapshot interval
- Snapshots in `.snapshots/` inside project folder, or app data if no project

### 2D. Smart Proofreading

Delegates to AI plugin via event bus. Writing Studio provides:
- Right-click context menu: "Check grammar", "Suggest alternatives", "Analyze readability"
- Inline wavy underline decorations for issues
- Proofread panel: issues categorized by type with Accept/Dismiss

### Commands

| Command | Shortcut | Action |
|---------|----------|--------|
| `start-sprint` | `Ctrl+Alt+S` | Start writing sprint |
| `stop-sprint` | `Ctrl+Alt+Shift+S` | Stop sprint |
| `take-snapshot` | `Ctrl+Alt+N` | Save snapshot |
| `restore-last-snapshot` | `Ctrl+Alt+Z` | Restore latest snapshot |
| `new-project` | — | Create manuscript project |
| `compile-manuscript` | `Ctrl+Alt+E` | Export all chapters |
| `proofread-document` | `Ctrl+Alt+G` | AI proofread |

---

## 3. AI Assistant Plugin

### Provider Architecture

```
AI Plugin
  ├── Provider Interface
  │     ├── complete(prompt, options) → string
  │     ├── stream(prompt, options) → AsyncIterable
  │     └── analyze(text, type) → AnalysisResult
  │
  ├── Providers
  │     ├── OllamaProvider      — localhost:11434
  │     ├── LMStudioProvider    — localhost:1234/v1
  │     ├── GGUFProvider         — direct llama.cpp with GPU support
  │     ├── AnthropicProvider    — Claude API
  │     └── OpenAIProvider       — GPT API
  │
  └── Features
        ├── Grammar/style check
        ├── Inline auto-complete
        ├── AI chat panel (sidebar)
        ├── Document analysis
        └── Smart commands (command palette)
```

### Provider Details

**Ollama:** `GET /api/tags` for models, `POST /api/generate` and `POST /api/chat` for inference.

**LMStudio:** OpenAI-compatible API at `localhost:1234/v1`. `GET /v1/models`, standard chat completion format, SSE streaming.

**GGUF Direct (with GPU):**
- Ships bundled llama.cpp binaries per platform (CUDA, Vulkan, Metal, CPU variants)
- Auto-detects GPU: CUDA (nvidia-smi), Vulkan driver, Metal (macOS)
- GPU layer offloading: configurable, auto-suggests based on VRAM vs model size
- Settings: GPU backend selection, layer count, context length, thread count
- "Keep model loaded" option for faster repeated requests
- WASM fallback for sandboxed environments (CPU-only)
- External binary path for advanced users with custom builds
- **Process isolation**: llama.cpp runs as a spawned child process (not in main process). If it crashes, detected via exit handler, auto-restarted with notification. GPU memory freed on crash. App remains stable.
- Process management: spawn in server mode on localhost ephemeral port, clean up on app quit or model unload

**Cloud (Anthropic/OpenAI):**
- API key stored encrypted via electron safeStorage
- Token usage tracking with estimated cost
- Rate limit awareness with request queueing and backoff

### IPC Design

All provider HTTP requests go through main process:
- No CORS issues
- API keys never in renderer
- Main process enforces rate limiting
- GGUF inference in isolated child process

**Request/response lifecycle:**
```
Renderer → ipc.invoke('ai:complete') → Main → HTTP to provider → result → Renderer
```

**Streaming lifecycle with error handling:**
```
Renderer → ipc.invoke('ai:stream', { requestId, prompt })
         ← Main assigns requestId, returns { requestId }
         ← ipc.on('ai:chunk', { requestId, text }) — repeated
         ← ipc.on('ai:done', { requestId }) — success
         ← ipc.on('ai:error', { requestId, error }) — failure

// Cancellation
Renderer → ipc.invoke('ai:cancel', { requestId })
         ← Main aborts HTTP request, emits 'ai:done'

// Orphan cleanup: if renderer disconnects (crash/close),
// main process detects via 'render-view-deleted' and aborts all active streams.
// Heartbeat: if no chunk received in 30s, main emits 'ai:error' with timeout.
```

### Features

1. **Inline suggestions**: ghost text after configurable delay, Tab to accept, Esc to dismiss
2. **AI chat panel**: sidebar conversation, "Insert" / "Replace selection" buttons
3. **Document analysis**: grammar, style, tone, with accept/reject per suggestion
4. **Smart commands**: summarize, generate outline, find inconsistencies, translate, explain code

### Privacy

- Local-first: default provider is Ollama
- No telemetry: requests go direct to provider
- Content gating: exclude file types from AI
- Status bar shows "AI: processing..." with cancel option
- Cloud usage stats in settings (tokens, cost)

### Cross-Plugin Integration

```javascript
// Writing Studio calls AI Plugin
context.events.emit('ai:analyze', { text, type: 'grammar', callback });
```

---

## 4. Collaboration Plugin

### 4A. Enhanced Git Panel

Upgrades to existing git panel:
- Remote management (add/remove remotes, push/pull)
- Branch list and switching
- Commit history with diff viewer (side-by-side or unified)
- Conflict resolution UI (accept-ours/accept-theirs/per-edit)

### 4B. Shared Repository Workflow

1. Writer A creates project + initializes git + pushes to shared repo
2. Writer B clones repo from within MarkdownConverter
3. Both write on their own branches
4. Writer A creates review request (simplified PR)

Review request: changed files, word count diff, commit messages. Reviewer can approve, request changes, leave inline comments. Reviews are git branches + comments as git notes.

### 4C. Comments & Annotations

Inline comments stored as JSON in `.comments/` directory (git-tracked):
```json
{
  "id": "uuid",
  "file": "03-chapter-three.md",
  "anchor": {
    "contextBefore": "The hero looked at the horizon and said,",
    "selectedText": "I will not go quietly into that dark night",
    "contextAfter": "He turned to face the army alone."
  },
  "line": 142,
  "text": "This dialogue feels unnatural",
  "author": "amit",
  "timestamp": "2026-04-14T14:30:00Z",
  "replies": [],
  "resolved": false
}
```

- **Anchor-based positioning**: comments store `contextBefore`, `selectedText`, and `contextAfter` (not absolute byte offsets). On file change, re-anchor by searching for the context text. If context no longer matches, mark comment as "detached" and show a warning. Falls back to `line` number as rough position.
- Highlighted text in editor with tooltip on hover
- Comment panel in sidebar: all unresolved comments across files
- Resolution workflow: add → address → reply → resolve
- Resolved comments dim but stay visible

### 4D. Change Notifications

- Status bar indicator: `↓ 3 new commits`
- Click to see changes, one-click pull
- Conflicts trigger resolution UI
- Push button only when local commits ahead of remote

### 4E. Offline-First

All writing happens locally. Git is the sync mechanism. No internet required for writing, commenting, snapshots, or sprints. Push/pull on user action or auto-sync setting.

### Commands

| Command | Shortcut | Action |
|---------|----------|--------|
| `collab:commit` | `Ctrl+Shift+G` | Commit with message |
| `collab:push` | — | Push current branch |
| `collab:pull` | — | Pull from remote |
| `collab:add-comment` | `Ctrl+Alt+C` | Comment on selection |
| `collab:next-comment` | `F8` | Next unresolved comment |
| `collab:prev-comment` | `Shift+F8` | Previous comment |
| `collab:create-review` | — | Create review request |

### Cross-Plugin Integration

```javascript
context.events.emit('snapshot:created', { file, snapshotId });
context.events.on('project:chapter-opened', (chapter) => { /* load comments */ });
context.events.on('comment:added', (comment) => { /* AI could suggest fix */ });
```

---

## Bundle Size Impact

- llama.cpp binaries: ~15MB per GPU variant. Only target platform shipped. GPU variants (CUDA/Vulkan/Metal) downloaded on demand if user enables GGUF direct loading — not bundled by default. Only CPU fallback bundled (~15MB).
- Plugin system core: ~30KB
- Each built-in plugin: ~50-100KB
- Diff library (jsdiff): ~15KB
- Total estimated increase: ~20-30MB (core), additional ~30-50MB per GPU variant (lazy download)

## Testing Strategy

- Plugin system: unit tests for registry, loader, context API mocking
- Each plugin: isolated unit tests, integration tests via plugin context
- AI provider tests: mock HTTP responses, test streaming parsing
- Git tests: use test repository fixture
- E2E: verify plugin loading doesn't break existing features
