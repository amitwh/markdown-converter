# Security Assessment Summary — MarkdownConverter (master branch)

**Date:** 2026-08-23 · **Scope:** full branch `6db54a5..HEAD` (feature-audit-and-hardening plan, 27 tasks) · **Method:** manual feature/security audit at plan time + formal review pass (Task 24: three-stage vulnerability scan — identify → false-positive filter at confidence ≥ 8 → inline fix of confirmed High findings)

## 1. What the manual audit found (plan Phases A–D)

| # | Finding | Severity | Resolution |
|---|---------|----------|------------|
| SEC-1 | Pandoc invocation built as shell-style string and re-tokenized — argument injection via crafted filenames/options/bibliography paths | **Critical** | Fixed — Task 23 (`d41b7df`): every invocation now `execFile(path, args[])` via pure builder `src/main/PandocArgs.js`; string tokenizer deleted; 21 injection-vector tests + differential exploit-split proof + 23 real-pandoc e2e checks |
| UX-1..7 | Seven non-working features: PDF menu IPC misrouting, media converter with 16 IPC channels and 0 handlers, dead New-from-Template menu, dead View-menu toggles, Clear-Recent-Files no-op, unreachable font settings, jszip/sharp misplaced in devDependencies | High (functional) | Fixed — Tasks 1–14; media backends (sharp/ffmpeg) implemented execFile-array-first |
| LAT-1 | `File.path` reads dead on Electron 41 (removed in v32; app pins ^41.1.1) — every renderer file-picker returned `undefined` | High (functional) | Found during Task 20 review; fixed — Task 26 (`32a5755`): `webUtils.getPathForFile` exposed in preload + main-window shim; all ~15 picker sites migrated |
| LAT-2 | pdf-lib 1.17.1 silently ignores `userPassword`/`ownerPassword`/`permissions` — PDF encrypt/permissions wrote **unprotected** files while reporting success; decrypt was a copy no-op | High (integrity) | Found during Task 22 review; fixed — Task 27 (`78afccc`): empirical capability probe (fail-closed), honest unavailability errors, UI controls disabled with hint. Real encryption requires a library swap (see deferred #D1) |

## 2. What the formal pass (Task 24) found

**Confirmed (confidence 8/10, HIGH) — fixed inline:**

- **Git sidebar XSS → code execution** (`src/sidebar/git-panel.js`): repo-derived branch names, git-status file names, commit messages/author names, and git stderr rendered into `innerHTML` unescaped in the `nodeIntegration:true` main window, whose CSP permits `'unsafe-inline'` handlers. A malicious repo (attacker-authored commit message or crafted branch name) cloned by the victim executes script with full Node access when the Git panel loads. Fixed — `eafaf6e`: `escapeHtml` (& < > " ') across all 13 sink sites; jsdom tests assert structural inertness (no `img`/`script` elements, no attribute breakout) and that `dataset` reads still return raw names for git operations.

**Candidate assessed and dropped (with evidence):**

- PowerShell BurntToast interpolation (`main.js` ~4344): pre-existing at origin/master in identical `execFile`-array form. The dialog path interpolates a `format` chosen from a hardcoded 12-entry list; the `--convert-to <format>` CLI path feeds raw argv into the same string — but argv is trusted local-user input (precedent: CLI flags are trusted), and no shell is involved. Not exploitable. (Evidence note: the "hardcoded list" rationale covers the dialog path only; the drop stands on the argv-trust precedent for the CLI path.)

**Verified clean (14 areas):** media operation backends and all batch handlers (execFile arrays throughout, no string re-tokenization); plugin system (no escalation beyond the renderer's existing privileges; format metadata reaches main only as native menu labels and save-dialog filters); all new dialog renderers (`textContent`-only for dynamic content); PDFOperations new ops (pdfjs/sharp in-process, no shell); wordTemplateExporter (all `<w:t>` insertions escaped, no zip extraction → no zip-slip); GitOperations (simple-git array args); settings/presets stores (no deep merge → no prototype pollution); PandocArgs completeness (tree-wide grep: zero surviving string-built pandoc invocations); font embedders (fixed family→filename maps); generator windows (no untrusted prefill); print-preview (DOMPurify flow); no `eval`/`new Function`; no variable-URL `shell.openExternal`; no secrets in the diff.

## 3. Deferred / accepted risks

| ID | Risk | Disposition |
|----|------|-------------|
| D1 | **Real PDF encryption unavailable** (pdf-lib limitation) — feature now fails honestly rather than lying | Accepted for this release. Restoring it means swapping pdf-lib for an encryption-capable fork (e.g. `@cantoo/pdf-lib`, API-compatible) — **needs explicit sign-off on a new dependency** |
| D2 | `nodeIntegration:true` + `contextIsolation:false` on mainWindow, pdfWindow, hiddenWindow; main window does not load `preload.js` (inline shim instead) — the IPC whitelist is a live control only on the two generator windows | Accepted legacy risk for this branch; owned by the react-electron migration (contextIsolation + preload-everywhere), tracked separately |
| D3 | Generator-window preload whitelist is broad (`execute-code`, `read-file`, `write-file`, `delete-file` reachable from isolated windows) | No current content vector into those windows; flag for the migration to narrow per-window APIs |
| D4 | CSP allows `'unsafe-inline'` / `'unsafe-eval'` (required by marked + Mermaid rendering model) | Accepted; revisit under the migration with a nonce-based CSP |
| D5 | `outline-panel.js` / `repl-panel.js` / `analytics-panel.js` have local `escapeHtml` helpers that do not escape quotes | Deferred hardening: unsafe only if reused in attribute contexts; no such current use found |
| D6 | `scripts/download-tools.js` downloads Pandoc/fonts without checksum pinning | Build-time supply-chain hardening; recommended follow-up (pin + verify SHA-256) |
| D7 | Misc functional edge cases (batch same-folder overwrite, `pdfSplit` non-positive interval loop, rate-limiter dialog stall) | Deferred minors, logged in the plan ledger; none security-relevant |

## 4. Verification state

- Test suite: **49 suites / 512 tests passing**; ESLint and Prettier clean at every task boundary (enforced per-task during execution).
- All new external-process code paths verified `execFile`-array by independent tree-wide grep (Task 23 review) and re-verified in the formal pass.
- **Release blocker (human step):** this environment cannot launch the Electron GUI. A human pass in the running app — light + dark themes, file picking in the main dialogs (File B in Document Compare, bibliography/CSL, universal converter, PDF editor), Git sidebar on a real repo — is required before shipping.

**Bottom line:** the one Critical (argument injection) and one confirmed High (Git panel XSS) are closed with tests; two latent silent-failure bugs (File.path, fake encryption) are fixed; the remaining exposure is the documented legacy trust model (D2–D4) owned by the planned Electron security migration plus one dependency decision (D1).
