# SP-1: Quick-switcher fuzzy overlay + Inline AI assist

**Branch:** master
**Started:** 2026-09-30 IST
**Status:** in progress

## Scope

Replace the existing Cmd+P "Recent Files" menu with a fuzzy quick-switcher
overlay, and add Cmd+K inline AI assist (Rewrite / Shorten / Expand) on
selected text using the existing `AiProviders` infrastructure.

## Design decisions (user-approved)

| Question | Answer |
|---|---|
| Cmd+P behavior | Replace Recent Files menu with overlay |
| AI response mode | Typewriter stream into selection |
| AI action set | Rewrite + Shorten + Expand only (no custom prompts) |

## Commit plan

### SP-1A — Quick-switcher fuzzy overlay
- [ ] **C1**: `feat(quick-switcher): pure fuzzy matcher + ranker` — `src/quick-switcher/fuzzy-matcher.js` + tests
- [ ] **C2**: `feat(quick-switcher): IPC for listing workspace files` — main.js + preload.js wiring
- [ ] **C3**: `feat(quick-switcher): overlay UI + keyboard nav` — `src/quick-switcher/quick-switcher-overlay.js` + tests
- [ ] **C4**: `feat(quick-switcher): wire Cmd+P into renderer, drop old Recent Files menu`

### SP-1B — Inline AI assist
- [ ] **C5**: `feat(ai-assist): pure prompt builder + result applier` — `src/ai-assist/inline-assist.js` + tests
- [ ] **C6**: `feat(ai-assist): IPC streaming wrapper around AiProviders` — main.js handler
- [ ] **C7**: `feat(ai-assist): floating popover + cancel/stop controls` — `src/renderer/inline-ai-popover.js` + tests
- [ ] **C8**: `feat(ai-assist): Cmd+K keymap + popover mount in renderer`

## TDD discipline

- All pure modules test: integration tests first, then implementation
- All renderer UI test: DOM contract tests using @testing-library/dom
- All IPC handlers: tests using injected fetch stub
- Lint + format green at every commit
- Grep forbidden markers before each commit claim

## Out of scope (deferred)

- Per-action configurable prompts
- Multi-selection batch assist
- AI inline assist without specific settings (built on AI Assistant plugin config)