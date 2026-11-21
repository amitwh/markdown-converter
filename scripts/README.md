# Build & Tooling Scripts

Scripts in this directory support packaging, tool acquisition, and asset generation for **MarkdownConverter**. They are invoked from `package.json` scripts or CI; none are required at runtime.

## Build / tooling

| Script | npm command | Purpose |
|---|---|---|
| `download-tools.js` | `npm run download-tools` | Downloads Pandoc **3.9.0.2** for the host platform into `bin/<platform>/pandoc` and Fira Code **6.2** fonts into `assets/fonts`. SHA-256 pins are verified where available (the darwin Pandoc hash is intentionally unpinned). |
| `bundle-markitdown.js` | `npm run bundle:markitdown` | Builds an optional ~75 MB PyInstaller one-file `markitdown` binary into `bin/<platform>/`. Requires Python on the build host; excludes ML extras (audio/OCR). Failure is non-fatal — the app falls back to a system MarkItDown. |
| `build-flowchart-editor.js` | `npm run build:flowchart-editor` | Bundles the maxGraph flowchart editor (`src/flowchart-editor/`) into `src/renderer/flowchart-editor.bundle.js` for the sandboxed standalone window. |
| `build-icons.js` | `npm run build:icons` | Tree-shakes the selected Lucide icons from `src/icons/lucide-entry.js` into `src/renderer/lucide-icons.bundle.js` (exposes `window.Lucide`). |
| `generate-icons.js` | `npm run generate-icons` | Rasterizes `assets/markdown-converter-assets/app-icon.svg` into the platform icon set via `sharp`. |
| `create-selfsigned-cert.ps1` | `npm run create-cert` (Windows) | Creates a self-signed code-signing certificate for local Windows builds. |

## Optional CI / release helpers

- `download-tools.js` and `bundle-markitdown.js` run in `.github/workflows/release.yml` before platform builds.
- `bundle:markitdown` is best-effort in CI (`continue-on-error`); the Windows job uploads its logs when the bundle fails.

## Windows integration

The legacy PanConverter-branded context-menu scripts (`install-context-menu.*`, `uninstall-context-menu.*`) and `nsis-installer.nsh` were removed. They pointed at `PanConverter.exe` / `%LOCALAPPDATA%\Programs\PanConverter\`, and the NSIS include was never wired into `electron-builder.config.js`. Windows file integration now relies on the associations declared in `electron-builder.config.js` (`.md`, `.markdown`, `.pdf`).

CLI conversion is still supported:

```bat
MarkdownConverter.exe --convert "document.md"
MarkdownConverter.exe --convert-to pdf "document.md"
```

## Requirements

- Node.js >= 22 for the JavaScript scripts.
- Python 3 (host) only for `bundle-markitdown.js`.
- PowerShell on Windows for `create-selfsigned-cert.ps1` and the context-menu `.ps1`.
