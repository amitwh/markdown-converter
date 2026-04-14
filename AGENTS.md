# Repository Guidelines

## Project Structure & Module Organization
Core application code lives in `src/`. Use `src/main.js` for the Electron main process, `src/preload.js` for the preload bridge, and `src/renderer.js` plus `src/editor/`, `src/sidebar/`, `src/repl/`, and `src/utils/` for renderer-side features. Electron adapter code is in `src/adapters/electron/`. Reusable markdown/document templates live in `src/templates/`. Static assets and icons are in `assets/`. Tests are in `tests/`, and build output goes to `dist/`.

## Build, Test, and Development Commands
- `npm start`: launch the Electron app locally.
- `npm test`: run the Jest suite once.
- `npm run test:watch`: rerun tests during local development.
- `npm run test:coverage`: generate coverage output.
- `npm run lint` / `npm run lint:fix`: check or fix ESLint issues in `src` and `tests`.
- `npm run format` / `npm run format:check`: apply or verify Prettier formatting.
- `npm run build:linux`, `npm run build:win`, `npm run build:mac`: create platform packages with `electron-builder`.

## Coding Style & Naming Conventions
This repo uses Prettier and ESLint. Follow `.prettierrc`: 2-space indentation, single quotes, semicolons, trailing commas where valid in ES5, and a 100-character line width. Prefer `camelCase` for variables/functions, `PascalCase` for classes, and kebab-case for file names only when already established. Keep module boundaries clear: UI logic in renderer modules, OS/file-system work behind Electron IPC and adapters.

## Testing Guidelines
Tests use Jest with `jest-environment-jsdom`. Add new tests under `tests/` with `*.test.js` names, mirroring the feature area when possible, for example `tests/sidebar.test.js` or `tests/print-preview.test.js`. Update or add regression tests for renderer behavior, preload APIs, and utility helpers when fixing bugs. Run `npm test` before opening a PR; use `npm run test:coverage` for larger refactors.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commit prefixes such as `feat:`, `fix:`, and `refactor:`. Keep subjects short and imperative, for example `fix: guard modal cleanup on close`. PRs should describe the user-visible change, note test coverage, link any related issue, and include screenshots or GIFs for UI changes.

## Security & Configuration Tips
Do not bypass preload boundaries or introduce direct `eval`/dynamic code paths; ESLint already treats these as errors. Export and conversion features depend on external tools such as Pandoc, FFmpeg, ImageMagick, and LibreOffice, so document any new runtime dependency in `README.md` and packaging config.
