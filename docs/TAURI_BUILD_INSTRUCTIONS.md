# Building MarkdownConverter with Tauri 2.x

## Prerequisites

1. **Node.js 18+** and npm
2. **Rust 1.75+** — install via [rustup](https://rustup.rs/)

```bash
# Install Rust
winget install Rust.Rustup  # Windows
# OR
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh  # macOS/Linux

# Set stable as default
rustup default stable

# Install Tauri CLI (alternative to npm package)
cargo install tauri-cli --locked
```

## Development

```bash
# Install dependencies
npm install

# Run frontend dev server
npm run dev

# In another terminal, run Tauri dev
npm run tauri:dev

# Or use Tauri CLI directly (if installed globally via cargo)
cargo tauri dev
```

## Production Build

```bash
# Build the frontend first
npm run build:frontend

# Then build Tauri app
npm run tauri:build

# Output:
#   Windows: src-tauri/target/release/markdown-converter.exe
#   Installer: dist/MarkdownConverter-Setup-4.3.0.exe
```

## Troubleshooting

### Rust not found
Ensure Rust is in PATH: `rustc --version`

### WebView2 not installed (Windows)
Download from https://developer.microsoft.com/en-us/microsoft-edge/webview2/

### pandoc not found
Pandoc must be installed and in PATH. Download from https://pandoc.org/installing.html

## File Structure

```
src-tauri/
  src/
    main.rs        # Binary entry point
    lib.rs         # Tauri app setup + command registration
    commands/      # Rust commands (file, git, pdf, export, etc.)
    menu.rs        # Native menu
    tray.rs        # System tray
    pdf_ops.rs     # PDF processing
    plugin_manager.rs
    error.rs
  Cargo.toml
  tauri.conf.json
  capabilities/default.json
  icons/
src/
  renderer.js     # Main renderer (updated for Tauri invoke/listen)
  tauri-commands.js  # Tauri command bridge
  index.html      # Main HTML (copied to dist/index.html)
dist/
  index.html      # Built frontend output
```

## Key Differences from Electron

| Aspect | Electron | Tauri |
|--------|----------|-------|
| IPC | ipcRenderer.invoke() | invoke() from @tauri-apps/api |
| Events | ipcRenderer.on() | listen() from @tauri-apps/api |
| File access | Node.js fs module | Rust std::fs or tauri-plugin-fs |
| Native menus | Electron Menu API | tauri menu API |
| Settings | electron-store | tauri-plugin-store |
| Binary size | ~150MB | ~10MB |