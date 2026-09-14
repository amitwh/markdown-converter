# MarkdownConverter — Editor Theme Registry Design

**Date:** 2026-09-14
**Status:** Draft — pending review
**Author:** Amit Haridas

## Overview

Replace the hardcoded editor-theme menu array in `main.js` (25 inline items at `src/main.js:1137-1245`) and the scattered CSS (`body.theme-<id>` selector blocks across `styles.css`, `styles-modern.css`, `styles-concreteinfo.css`) with a single `ThemeRegistry` module and a per-theme CSS file convention. Add 12 new themes spanning popular-requested, high-contrast, and seasonal categories. Future theme additions become a one-line `register()` call plus one CSS file.

## Goals

1. New themes can be added by changing one JS file and adding one CSS file — no menu edits.
2. Add 12 new themes spanning popular-requested (Catppuccin palette), high-contrast (Solarized Dark HC), and seasonal categories.
3. Theme application stays sub-100ms on theme switch (current behaviour).
4. Existing 25 themes keep working — pure refactor for them, additive for the 12 new ones.
5. Theme persistence model unchanged — `electron-store` `theme` key, default `atomonelight`.

## Non-Goals (v1)

- No user-defined custom themes (theme editor) — only shipped themes.
- No per-syntax-token color customization beyond the per-theme palette.
- No theme auto-switching based on system light/dark mode.
- No export-theme changes — `ExportThemes.js` is a separate system with its own registry (already exists).

## Decisions Locked

| Decision | Choice | Reason |
|---|---|---|
| Module location | `src/main/ThemeRegistry.js` (pure, no Electron) | Matches the established `DocQA`/`DailyNotes`/`WorkspaceSearch` pattern |
| Persistence | Existing `electron-store` `theme` key | Already wired; no migration needed |
| CSS organisation | One file per theme at `src/styles/themes/<id>.css` | Convention beats scattered selector blocks |
| CSS loading | Preload ALL theme `<link>` tags in `index.html`; toggle `disabled` on theme switch | Avoids link-swap network roundtrip; < 5 KB per theme × 37 = ~185 KB total CSS overhead |
| Menu generation | `main.js` calls `ThemeRegistry.list()` + `categories()` to build menu items | Removes the 109-line hardcoded block |
| Theme id format | kebab-case, lowercase, no spaces (`catppuccin-mocha`, `winter-is-coming-light`) | Stable contract for storage + CSS file naming |
| New themes | 12 new: 4× Catppuccin, 1× One Light, 1× Tokyo Night Storm, 2× Synthwave/Outrun, 2× Winter is Coming, 1× Solarized Dark HC, 1× Solarized Light (seasonal Spring variant) | Highest demand per GitHub issues + aesthetic completeness |

## Architecture

```
                       ┌─────────────────────────┐
   electron-store ───► │  src/main/ThemeRegistry │ ◄── register() at startup
   (theme = "x")       │   .js (pure module)     │
                       │   list()                │
                       │   get(id)               │
                       │   categories()          │
                       └──────────┬──────────────┘
                                  │ list()
                                  ▼
                       main.js menu builder
                                  │
                       ┌──────────┴───────────┐
                       │                      │
                       ▼                      ▼
              "Light Themes"         "Dark Themes"
              "High-Contrast"        "Seasonal"
                       │                      │
                       └──────────┬───────────┘
                                  │ IPC: theme-changed
                                  ▼
                  renderer.js applyTheme(id)
                                  │
                                  ▼
                  index.html has 37 <link rel="stylesheet"
                  href="styles/themes/<id>.css" disabled
                  (all themes preloaded)
                                  │
                                  ▼
                  applyTheme() flips `disabled` on the
                  matching <link>, removes from others
```

## New Modules

| File | Role |
|---|---|
| `src/main/ThemeRegistry.js` | Pure module: `register(theme)`, `unregister(id)`, `list()`, `get(id)`, `categories()`, `lightThemes()`, `darkThemes()`. A theme is `{ id, label, category: 'light'\|'dark'\|'high-contrast'\|'seasonal', isDark: boolean }`. No Electron imports. |
| `src/main/ThemeRegistry.bootstrap.js` | Calls `register()` for all 37 themes (25 existing + 12 new). Imported by `main.js` at startup. |
| `src/styles/themes/<id>.css` × 37 | Per-theme CSS rules previously scattered. Each file's body selector is `body.theme-<id>`. Naming convention: `<id>.css`. |
| `tests/theme-registry.test.js` | Register / unregister / list / get / categories; lightThemes/darkThemes filtering; throws on duplicate id. |
| `tests/theme-menu-builder.test.js` | Generates MenuItem[] from `list()` + `categories()`: each item has `{ id, label, type: 'radio', checked, click: () => setTheme(id) }`. |

## Modified Modules

| File | Change |
|---|---|
| `src/main.js:1137-1245` | Delete the 109-line hardcoded theme menu array. Replace with: `const themeMenu = buildThemeMenu(store, mainWindow)` (new helper, ~25 lines, lives next to the menu builder). |
| `src/main.js:3952-3955` | `setTheme(id)` already validates against a hardcoded set — replace hardcoded list with `ThemeRegistry.get(id) ? id : 'atomonelight'`. |
| `src/main.js` startup | Add `require('./main/ThemeRegistry.bootstrap')` once. |
| `src/index.html` | Replace the bare `<link rel="stylesheet" href="styles.css">` block with: preload ALL theme CSS as `<link id="theme-<id>" rel="stylesheet" href="styles/themes/<id>.css" disabled>` (one per theme). The base `styles.css` link stays as the structural (non-themed) layer. |
| `src/renderer.js:2900` (`get-theme` IPC) | No change — handler already returns stored theme. |
| `src/renderer.js:3005-3007` (apply theme) | Replace `document.body.className = 'theme-<id>'` with: find the matching `<link id="theme-<id>">`, set `disabled = false`; find the previously active `<link>`, set `disabled = true`. Keep the `theme-<id>` body className for any rule that depends on it (we keep the convention). |
| `src/styles.css` + `styles-modern.css` + `styles-concreteinfo.css` | Remove the inlined `body.theme-<id> { … }` blocks (one per existing 25 themes). Move them to `src/styles/themes/<id>.css`. Pure code-motion — no rules change. |
| `README.md:129-159` (Themes section) | Update list to 37 themes, mention new categories. |

## New Themes (12)

| id | label | category | notes |
|---|---|---|---|
| `catppuccin-latte` | Catppuccin Latte | light | Warm pastel |
| `catppuccin-frappe` | Catppuccin Frappé | dark | Muted pastels |
| `catppuccin-macchiato` | Catppuccin Macchiato | dark | Medium contrast |
| `catppuccin-mocha` | Catppuccin Mocha | dark | High contrast pastels |
| `one-light` | One Light | light | Atom One Light sibling |
| `tokyo-night-storm` | Tokyo Night Storm | dark | Variant of existing Tokyo Night |
| `synthwave-84` | Synthwave '84 | dark | Neon-on-dark |
| `outrun` | Outrun | dark | Magenta/cyan |
| `winter-is-coming-light` | Winter is Coming (Light) | light | Light variant of existing dark |
| `winter-is-coming-dark` | Winter is Coming (Dark) | dark | New dark variant |
| `solarized-dark-hc` | Solarized Dark (High Contrast) | high-contrast | Accessibility-focused |
| `spring-light` | Spring Light | seasonal | First seasonal theme; same palette as Solarized Light but with green accents |

Categories are independent from `isDark`; e.g. `winter-is-coming-light` has `isDark: false` and `category: 'light'` but conceptually belongs to the "winter is coming" family. Future seasonal themes can share a `family: 'winter-is-coming'` field without changing the public API.

## Data Flow

1. App starts → `main.js` requires `ThemeRegistry.bootstrap.js` → calls `register()` for each of the 37 themes.
2. `main.js` menu builder reads `ThemeRegistry.list()` + `categories()`, generates the View → Theme submenu programmatically.
3. Renderer on init sends `get-theme` IPC → `main.js` replies with stored theme id.
4. `renderer.js:3005-3007` `applyTheme(id)` toggles `disabled` on the matching `<link id="theme-<id>">`; sets `body.className = 'theme-<id>'` for legacy rule compatibility.
5. User picks a new theme in menu → main process `setTheme(id)` → persists via `electron-store` → broadcasts `theme-changed` IPC → renderer `applyTheme(id)` re-toggles.

## Error Handling

| Scenario | Handling |
|---|---|
| Stored theme id no longer exists (e.g. after downgrade) | `setTheme()` falls back to `atomonelight`; logs a warning. Renderer also re-applies defensively. |
| Missing theme CSS file (e.g. partial install) | `<link disabled>` simply doesn't activate; no JS error. App continues with previous active theme. |
| `register()` called with duplicate id | Throws synchronously — startup fails loudly rather than silently shadowing an existing theme. |
| Theme CSS file fails to parse (syntax error) | Browser logs error to console; the disabled `<link>` is never activated so no visual breakage. |

## Testing

1. **Unit (`tests/theme-registry.test.js`)** — `register` adds to list, `unregister` removes, `get` returns the theme, `categories()` returns unique categories in registration order, `lightThemes()`/`darkThemes()` filter correctly. Throws on duplicate id. Throws on missing id in `get()`.
2. **Unit (`tests/theme-menu-builder.test.js`)** — Given a list of 5 sample themes (2 light, 2 dark, 1 hc), `buildThemeMenu` returns a `MenuItem[]` with the correct structure: submenu labels, accelerators, `type: 'radio'`, `checked` matching current selection, `click` handlers wired.
3. **Snapshot (`tests/theme-registry-bootstrap.test.js`)** — At startup, `ThemeRegistry.list()` returns exactly 37 themes with the expected ids in the expected order.
4. **Existing tests** — `tests/project-meta.test.js` already checks `v${version}` in README (now 4.8.0); unchanged.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Per-theme CSS files duplicate common rules across 37 files | Medium | Factor the shared editor-surface rules (caret, selection, scrollbar) into a `styles/themes/_base.css`; per-theme files only carry palette tokens. |
| Preloading 37 `<link>` tags delays first paint | Low | Total CSS ≈ 185 KB; gzip ≈ 30 KB; below the 100 ms first-paint budget on Electron's bundled Chromium. Measure with `webContents.getPrintersAsync`-style timing if needed. |
| Body className + disabled-link double-state could drift | Low | Single function `applyTheme(id)` is the only mutation path; unit-tested with both states asserted. |
| README Themes list grows unwieldy at 37 | Low | Group by category in the README; collapse to one-liners per theme with a table. |

## Acceptance Criteria

- [ ] `src/main/ThemeRegistry.js` exists with the public API documented.
- [ ] 37 themes registered at startup; `list().length === 37`.
- [ ] `main.js` menu builder produces the View → Theme submenu from the registry (no hardcoded theme names).
- [ ] Renderer switches themes by toggling `<link disabled>`; no full page reload.
- [ ] Theme persists across restarts via `electron-store`.
- [ ] All existing 25 themes look identical to v4.8.0 (visual regression by inspection — themes are CSS, no logic change).
- [ ] `npm test` passes with the new theme-registry + menu-builder test files added.
- [ ] `npm run lint` clean, `npm run format:check` clean.
- [ ] README updated to list all 37 themes by category.
