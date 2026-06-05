# Phase 8 — Toasts Design

> Companion to the parent plan: `docs/superpowers/plans/2026-06-05-react-ui-redesign.md` (Phases 8+9+10 are sketched at high level; this spec locks Phase 8's architecture, file map, and contracts so it can be planned task-by-task.)

**Date:** 2026-06-05
**Phase:** 8 of 10 (React + shadcn/ui UI redesign)
**Tag (on completion):** `phase-8-toasts`

---

## 1. Goal & Non-Goals

**Goal:** Add a toast notification layer to the React renderer using sonner (already installed). Surface user-initiated async action results (file save, file/folder open, exports) as transient toasts in the bottom-right of the window. The error banner pattern in export dialogs stays — toasts are a complementary global channel.

**Non-goals (Phase 8):**
- Undo/redo support (Phase 9)
- Custom toast actions/buttons (Phase 9, if needed)
- Persistent notification history
- Toast queueing/throttling for rapid-fire events
- Replacing inline error banners (they stay as per-dialog context)

**Scope decision:** Toast on user-initiated actions only. Skip silent background operations (loadChildren, etc.) to avoid noise. 4 wire points total: save (success+error), open file/folder (error only), 4 export dialogs (success+error).

---

## 2. Architecture

### 2.1 Toast helpers in `lib/toast.ts`

A thin typed layer over sonner. The helpers exist to:
- Give us a single import surface (instead of scattering `import { toast } from 'sonner'` across the codebase)
- Provide a place to add brand colors, formatting, or analytics later without touching call sites
- Make mocking easier in tests (one module to mock)

```ts
// src/renderer/lib/toast.ts (sketch)
import { toast as sonnerToast } from 'sonner';

export const toast = {
  success: (message: string) => sonnerToast.success(message),
  error: (message: string) => sonnerToast.error(message),
  info: (message: string) => sonnerToast.info(message),
  warning: (message: string) => sonnerToast.warning(message),
  promise: <T>(
    promise: Promise<T>,
    msgs: { loading: string; success: string | ((data: T) => string); error: string | ((err: unknown) => string) }
  ) => sonnerToast.promise(promise, msgs),
  dismiss: (id?: string | number) => sonnerToast.dismiss(id),
};
```

### 2.2 `<Toaster />` mounted in App.tsx

A canonical shadcn Toaster wrapper (manual paste per memory `shadcn-cli-blocked-manual-primitives`). Mounts alongside `<ModalLayer />`:

```tsx
// src/renderer/App.tsx (sketch)
import { Toaster } from '@/components/ui/sonner';

function App() {
  useWelcomeTrigger();
  return (
    <>
      <AppShell />
      <ModalLayer />
      <Toaster />
    </>
  );
}
```

The Toaster uses sonner's `<Toaster />` component with:
- `theme={resolvedTheme}` from `useTheme()` (so toasts match the user's light/dark preference)
- `richColors` for semantic success/error/info/warning colors
- `position="bottom-right"` (sonner default; explicit for clarity)
- `closeButton` (so users can dismiss)

### 2.3 Inline wiring at 4 wire points

**Pattern choice — inline in stores/dialogs, NOT middleware.** Matches the Phase 7 precedent of inline error banners in export dialogs. Middleware would be DRY but harder to debug and harder to control granularity (we want errors on save, but NOT on silent loadChildren).

**Wire points:**

1. **`useFileStore.saveActiveBuffer`** — wrap the existing logic:
   ```ts
   saveActiveBuffer: async () => {
     // ... existing logic to get buffer ...
     const writeResult = await ipc.file.write(activeTabId, buffer.content);
     if (!writeResult.ok) {
       toast.error(`Failed to save: ${writeResult.error.message}`);
       return false;
     }
     // ... existing markSaved/markTabClean ...
     toast.success(`Saved ${title}`);
     return true;
   }
   ```

2. **`useFileStore.openFile`** — error only:
   ```ts
   openFile: async (filePath) => {
     // ... existing logic to check existing tab ...
     const result = await ipc.file.read(filePath);
     if (!result.ok) {
       toast.error(`Failed to open file: ${result.error.message}`);
       return;
     }
     // ... existing logic ...
   }
   ```

3. **`useFileStore.openFolder`** — error only:
   ```ts
   openFolder: async (path) => {
     const result = await ipc.file.list(path);
     if (!result.ok) {
       toast.error(`Failed to open folder: ${result.error.message}`);
       return;
     }
     // ... existing logic ...
   }
   ```

4. **4 export dialogs** — both success and error (error complements the inline banner):
   ```ts
   if (!result.ok) {
     toast.error(`Export failed: ${result.error.message}`);
     setError(result.error.message);
     setSubmitting(false);
   } else {
     toast.success(`Exported ${source.title} to ${result.data?.outputPath ?? 'file'}`);
     closeModal();
   }
   ```

---

## 3. File Map

### 3.1 Created files

- `src/renderer/lib/toast.ts` — typed wrappers (re-export of sonner with our naming)
- `src/renderer/components/ui/sonner.tsx` — canonical shadcn Toaster wrapper (manual paste)
- `tests/unit/lib/toast.test.ts` — ~5 unit tests
- `tests/component/ui/sonner.test.tsx` — 1 smoke test
- `tests/integration/phase8-toasts-smoke.test.tsx` — ~4 integration tests

### 3.2 Modified files

- `src/renderer/App.tsx` — mount `<Toaster />` alongside `<ModalLayer />`
- `src/renderer/stores/file-store.ts` — add 3 toast calls (save, openFile, openFolder)
- `src/renderer/components/modals/ExportPdfDialog.tsx` — toast on submit result
- `src/renderer/components/modals/ExportDocxDialog.tsx` — toast on submit result
- `src/renderer/components/modals/ExportHtmlDialog.tsx` — toast on submit result
- `src/renderer/components/modals/ExportBatchDialog.tsx` — toast on submit result

---

## 4. Data Flow

User action → store action OR export dialog submit → IPC call → result →
- if error: `toast.error(message)` → sonner renders in bottom-right portal
- if success: `toast.success(message)` → sonner renders
- inline error banner in dialog stays as per-dialog context (NOT removed)

Theme comes from `useTheme()` in the Toaster component, not from individual toasts. The Toaster is mounted once at the app level.

For the 4 export dialogs: the existing inline error banner stays (it's contextual to the dialog), AND a toast is fired. This gives the user both immediate context (in the dialog) and persistent notification (toast in corner).

For file save: ONLY a toast (no inline error UI in the editor pane — keeps the editor clean). Errors still show the toast.

---

## 5. Error Handling

- **Toast helpers never throw.** They are thin re-exports of sonner, which handles its own error cases (e.g., render failures, missing portal target).
- **In tests**, the `toast` module is mocked so calls don't render real toasts. Mock signature: `vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), ... } }))`.
- **Theme fallback:** If `useTheme()` is loading or `resolvedTheme` is undefined, Toaster uses `'system'` as a fallback (sonner's default behavior).
- **Sonner missing:** If for some reason sonner fails to load, the toast calls become no-ops. The user still sees inline error banners in the export dialogs.
- **Inline error banners stay.** They are not replaced by toasts — they complement them.

---

## 6. Testing Strategy

### 6.1 Unit tests (`tests/unit/lib/toast.test.ts`)

5 tests:
- `toast.success` calls sonner `toast.success` with the message
- `toast.error` calls sonner `toast.error` with the message
- `toast.info` calls sonner `toast.info`
- `toast.warning` calls sonner `toast.warning`
- `toast.promise` forwards the promise and messages to sonner

All tests mock the sonner module and verify the forwarded call.

### 6.2 Component test (`tests/component/ui/sonner.test.tsx`)

1 smoke test: `<Toaster />` renders without crashing inside a ThemeProvider.

### 6.3 Integration test (`tests/integration/phase8-toasts-smoke.test.tsx`)

~4 tests:
- Saving a file → `toast.success` called with `"Saved test.md"`
- Opening a non-existent file (ipc returns error) → `toast.error` called with file path in message
- Export success (ipc returns ok) → `toast.success` called + dialog closes
- Export failure (ipc returns error) → `toast.error` called + inline banner shown + dialog stays open

TDD throughout. Mocks for `ipc.*` and `lib/toast`.

### 6.4 Existing tests must still pass

- All 243 tests from Phase 7 must remain green
- Export dialog tests will need updates to verify the new toast calls (the dialog tests currently check for inline banner; they should ALSO verify the toast call)

---

## 7. Risks & Open Questions

**Risks:**
- **Sonner theme switching:** If `useTheme()` returns `'system'` and the OS preference changes mid-session, sonner will re-render. This is the correct behavior; just confirm in test.
- **Toast spam:** If user holds Cmd+S, the save could fire many times. Sonner deduplicates by default for similar messages? → Decision: rely on sonner's default behavior. If spam becomes an issue, add a `toast.dismiss()` debounce in v2.

**Open questions (deferrable):**
- Should we add a custom toast for "undo last close" (Phase 9's undo feature)? → Decision: out of scope for Phase 8. Phase 9 will handle undo toasts.
- Should the export dialog inline banner be removed once toasts are wired? → Decision: NO — keep both. The inline banner is contextual to the dialog; the toast is global. They serve different purposes.

---

## 8. Out of Scope (deferred to later phases)

- Phase 9: Undo toasts ("Tab closed — Undo" with action button)
- Phase 9: Long-running operation progress toasts (e.g., batch export queue)
- Phase 9: Custom toast variants for advanced tools (ASCII generator, table generator)
- Phase 10: Cleanup of inline error banners (will evaluate in Phase 10 if redundant)

---

## 9. Success Criteria

Phase 8 is complete when:
- `lib/toast.ts` exists with typed wrappers
- `<Toaster />` is mounted in `App.tsx` and renders toasts
- `useFileStore.saveActiveBuffer` calls `toast.success`/`toast.error` on result
- `useFileStore.openFile` calls `toast.error` on failure
- `useFileStore.openFolder` calls `toast.error` on failure
- 4 export dialogs call `toast.success`/`toast.error` on result
- All tests pass: ~+10 new tests, total ~253
- `npx vite build` succeeds
- Branch tagged `phase-8-toasts` and pushed to origin
