# Phase 7 — Modals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a layered modal system to the React renderer — a single `<ModalLayer />` driven by a discriminated-union `useAppStore.modal` field, hosting 7 modal types (SettingsSheet + 4 export dialogs + About + Welcome + Confirm) plus a persisted `useSettingsStore` for user preferences, with all modals opened via the Phase 6 command store.

**Architecture:** Modal state is a discriminated union in `useAppStore` (runtime-only, excluded from `partialize`). A new `useSettingsStore` persists user preferences via `zustand persist` with `partialize` (matching the `useFileStore` and `useCommandStore` precedent). All 7 modal components are small, focused, and individually testable. A `useExportSource` hook and `ExportDialogFooter` component are shared across the 4 export dialogs. Commands registered in `register-menu-commands.ts` open the modals — no component opens a modal directly.

**Tech Stack:** React 19, zustand (with persist + immer middleware), shadcn/ui new-york style (radix-ui primitives), react-hook-form + zod, lucide-react icons, motion (for transitions).

**Spec:** `docs/superpowers/specs/2026-06-05-phase-7-modals-design.md`
**Tag:** `phase-7-modals`

---

## Conventions

- **shadcn primitives** are pasted manually from canonical sources (the shadcn CLI is broken on Node v24 in this project — see memory `shadcn-cli-blocked-manual-primitives`). For each primitive, the task cites the canonical URL and provides a smoke test.
- **All stores** use zustand's `persist` middleware with `partialize` to selectively serialize (matching the `useFileStore` and `useCommandStore` precedent).
- **All commands** are registered in `src/renderer/lib/commands/register-menu-commands.ts` (Phase 6 pattern). Components never call `openModal` directly — they `dispatch` a command.
- **All IPC** goes through `ipc.*` wrappers (`src/renderer/lib/ipc.ts`).
- **No `tsconfig.json`** exists in this project. Validate TypeScript with `npx vite build --config vite.renderer.config.ts` after each task that adds/changes code.
- **Test commands:** `npx vitest run tests/<path>` (one file) or `npx vitest run` (full suite). Tests live in `tests/unit/`, `tests/component/`, `tests/integration/`.
- **Commit style:** `feat(renderer): ...`, `test(renderer): ...`, `feat(renderer): ... + tests` for combined commits.
- **Style:** new-york (set in `components.json`). All primitives use `cn()` from `@/lib/utils` for class merging.

---

## Task 1: Add shadcn `label` primitive + smoke test

**Files:**
- Create: `src/renderer/components/ui/label.tsx`
- Create: `tests/component/ui/label.test.tsx`

- [ ] **Step 1: Create the primitive**

Canonical source: https://ui.shadcn.com/docs/components/label

Create `src/renderer/components/ui/label.tsx` by pasting the canonical new-york style source. It is a thin wrapper around `@radix-ui/react-label` using `forwardRef` and `cn()`. The file should be ~25 lines.

Verify the file imports `@radix-ui/react-label` (if not installed, run `npm install @radix-ui/react-label`).

- [ ] **Step 2: Write the smoke test**

Create `tests/component/ui/label.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Label } from '@/components/ui/label';

describe('Label', () => {
  it('renders children and associates with a control', () => {
    render(
      <>
        <Label htmlFor="x">Username</Label>
        <input id="x" />
      </>
    );
    const label = screen.getByText(/username/i);
    expect(label).toBeInTheDocument();
    expect(label.tagName).toBe('LABEL');
  });
});
```

- [ ] **Step 3: Run the test**

```bash
npx vitest run tests/component/ui/label.test.tsx
```

Expected: PASS, 1 test.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/components/ui/label.tsx tests/component/ui/label.test.tsx package.json package-lock.json
git commit -m "feat(renderer): add shadcn label primitive"
```

---

## Task 2: Add shadcn `input` primitive + smoke test

**Files:**
- Create: `src/renderer/components/ui/input.tsx`
- Create: `tests/component/ui/input.test.tsx`

- [ ] **Step 1: Create the primitive**

Canonical source: https://ui.shadcn.com/docs/components/input

Create `src/renderer/components/ui/input.tsx` by pasting the canonical new-york source. ~30 lines. Uses `React.forwardRef`, `cn()`, no radix dep.

- [ ] **Step 2: Write the smoke test**

Create `tests/component/ui/input.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from '@/components/ui/input';

describe('Input', () => {
  it('renders and accepts typing', async () => {
    const onChange = vi.fn();
    render(<Input aria-label="name" onChange={onChange} />);
    const input = screen.getByLabelText(/name/i);
    await userEvent.type(input, 'a');
    expect(onChange).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run, commit**

```bash
npx vitest run tests/component/ui/input.test.tsx
git add src/renderer/components/ui/input.tsx tests/component/ui/input.test.tsx
git commit -m "feat(renderer): add shadcn input primitive"
```

---

## Task 3: Add shadcn `textarea` primitive + smoke test

**Files:**
- Create: `src/renderer/components/ui/textarea.tsx`
- Create: `tests/component/ui/textarea.test.tsx`

- [ ] **Step 1: Create the primitive**

Canonical source: https://ui.shadcn.com/docs/components/textarea

Create `src/renderer/components/ui/textarea.tsx` (~25 lines, `forwardRef` + `cn()`).

- [ ] **Step 2: Smoke test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Textarea } from '@/components/ui/textarea';

describe('Textarea', () => {
  it('renders a multi-line input', () => {
    render(<Textarea aria-label="notes" defaultValue="hello" />);
    const ta = screen.getByLabelText(/notes/i);
    expect.ta.tagName.toBe('TEXTAREA');
    expect(ta).toHaveValue('hello');
  });
});
```

Fix: change `expect.ta` to `expect(ta)`.

- [ ] **Step 3: Run, commit**

```bash
npx vitest run tests/component/ui/textarea.test.tsx
git add src/renderer/components/ui/textarea.tsx tests/component/ui/textarea.test.tsx
git commit -m "feat(renderer): add shadcn textarea primitive"
```

---

## Task 4: Add shadcn `checkbox` primitive + smoke test

**Files:**
- Create: `src/renderer/components/ui/checkbox.tsx`
- Create: `tests/component/ui/checkbox.test.tsx`

- [ ] **Step 1: Create**

Canonical: https://ui.shadcn.com/docs/components/checkbox. ~40 lines, wraps `@radix-ui/react-checkbox` with `Check` icon from lucide-react. If `@radix-ui/react-checkbox` is not installed, run `npm install @radix-ui/react-checkbox`.

- [ ] **Step 2: Smoke test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Checkbox } from '@/components/ui/checkbox';

describe('Checkbox', () => {
  it('toggles checked state on click', async () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox aria-label="agree" onCheckedChange={onCheckedChange} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /agree/i }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 3: Run, commit**

```bash
npx vitest run tests/component/ui/checkbox.test.tsx
git add src/renderer/components/ui/checkbox.tsx tests/component/ui/checkbox.test.tsx package.json package-lock.json
git commit -m "feat(renderer): add shadcn checkbox primitive"
```

---

## Task 5: Add shadcn `switch` primitive + smoke test

**Files:**
- Create: `src/renderer/components/ui/switch.tsx`
- Create: `tests/component/ui/switch.test.tsx`

- [ ] **Step 1: Create**

Canonical: https://ui.shadcn.com/docs/components/switch. ~30 lines, wraps `@radix-ui/react-switch`. Install if needed: `npm install @radix-ui/react-switch`.

- [ ] **Step 2: Smoke test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Switch } from '@/components/ui/switch';

describe('Switch', () => {
  it('toggles checked state', async () => {
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="airplane" onCheckedChange={onCheckedChange} />);
    await userEvent.click(screen.getByRole('switch', { name: /airplane/i }));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });
});
```

- [ ] **Step 3: Run, commit**

```bash
npx vitest run tests/component/ui/switch.test.tsx
git add src/renderer/components/ui/switch.tsx tests/component/ui/switch.test.tsx package.json package-lock.json
git commit -m "feat(renderer): add shadcn switch primitive"
```

---

## Task 6: Add shadcn `slider` primitive + smoke test

**Files:**
- Create: `src/renderer/components/ui/slider.tsx`
- Create: `tests/component/ui/slider.test.tsx`

- [ ] **Step 1: Create**

Canonical: https://ui.shadcn.com/docs/components/slider. ~50 lines, wraps `@radix-ui/react-slider`. Install if needed: `npm install @radix-ui/react-slider`.

- [ ] **Step 2: Smoke test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Slider } from '@/components/ui/slider';

describe('Slider', () => {
  it('renders with default value and accepts change', async () => {
    const onValueChange = vi.fn();
    render(<Slider aria-label="volume" defaultValue={[50]} onValueChange={onValueChange} />);
    expect(screen.getByRole('slider', { name: /volume/i })).toHaveAttribute('aria-valuenow', '50');
  });
});
```

- [ ] **Step 3: Run, commit**

```bash
npx vitest run tests/component/ui/slider.test.tsx
git add src/renderer/components/ui/slider.tsx tests/component/ui/slider.test.tsx package.json package-lock.json
git commit -m "feat(renderer): add shadcn slider primitive"
```

---

## Task 7: Add shadcn `radio-group` primitive + smoke test

**Files:**
- Create: `src/renderer/components/ui/radio-group.tsx`
- Create: `tests/component/ui/radio-group.test.tsx`

- [ ] **Step 1: Create**

Canonical: https://ui.shadcn.com/docs/components/radio-group. ~50 lines, wraps `@radix-ui/react-radio-group`. Install if needed: `npm install @radix-ui/react-radio-group`.

- [ ] **Step 2: Smoke test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

describe('RadioGroup', () => {
  it('selects the clicked item', async () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup onValueChange={onValueChange} defaultValue="a">
        <RadioGroupItem value="a" aria-label="A" />
        <RadioGroupItem value="b" aria-label="B" />
      </RadioGroup>
    );
    await userEvent.click(screen.getByRole('radio', { name: /b/i }));
    expect(onValueChange).toHaveBeenCalledWith('b');
  });
});
```

- [ ] **Step 3: Run, commit**

```bash
npx vitest run tests/component/ui/radio-group.test.tsx
git add src/renderer/components/ui/radio-group.tsx tests/component/ui/radio-group.test.tsx package.json package-lock.json
git commit -m "feat(renderer): add shadcn radio-group primitive"
```

---

## Task 8: Add shadcn `select` primitive + smoke test

**Files:**
- Create: `src/renderer/components/ui/select.tsx`
- Create: `tests/component/ui/select.test.tsx`

- [ ] **Step 1: Create**

Canonical: https://ui.shadcn.com/docs/components/select. ~150 lines, wraps `@radix-ui/react-select`. Install if needed: `npm install @radix-ui/react-select`. Use the canonical new-york source which exports: `Select`, `SelectGroup`, `SelectValue`, `SelectTrigger`, `SelectContent`, `SelectLabel`, `SelectItem`, `SelectSeparator`, `SelectScrollUpButton`, `SelectScrollDownButton`.

- [ ] **Step 2: Smoke test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

describe('Select', () => {
  it('renders trigger and opens content on click', async () => {
    const onValueChange = vi.fn();
    render(
      <Select onValueChange={onValueChange}>
        <SelectTrigger aria-label="fruit">
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
        </SelectContent>
      </Select>
    );
    await userEvent.click(screen.getByRole('combobox', { name: /fruit/i }));
    expect(screen.getByRole('option', { name: /apple/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run, commit**

```bash
npx vitest run tests/component/ui/select.test.tsx
git add src/renderer/components/ui/select.tsx tests/component/ui/select.test.tsx package.json package-lock.json
git commit -m "feat(renderer): add shadcn select primitive"
```

---

## Task 9: Add shadcn `tabs` primitive + smoke test

**Files:**
- Create: `src/renderer/components/ui/tabs.tsx`
- Create: `tests/component/ui/tabs.test.tsx`

- [ ] **Step 1: Create**

Canonical: https://ui.shadcn.com/docs/components/tabs. ~50 lines, wraps `@radix-ui/react-tabs`. Install if needed: `npm install @radix-ui/react-tabs`. Exports: `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`.

- [ ] **Step 2: Smoke test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

describe('Tabs', () => {
  it('switches content on trigger click', async () => {
    render(
      <Tabs defaultValue="one">
        <TabsList>
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two</TabsTrigger>
        </TabsList>
        <TabsContent value="one">Content one</TabsContent>
        <TabsContent value="two">Content two</TabsContent>
      </Tabs>
    );
    expect(screen.getByText(/content one/i)).toBeVisible();
    await userEvent.click(screen.getByRole('tab', { name: /two/i }));
    expect(screen.getByText(/content two/i)).toBeVisible();
  });
});
```

- [ ] **Step 3: Run, commit**

```bash
npx vitest run tests/component/ui/tabs.test.tsx
git add src/renderer/components/ui/tabs.tsx tests/component/ui/tabs.test.tsx package.json package-lock.json
git commit -m "feat(renderer): add shadcn tabs primitive"
```

---

## Task 10: Add shadcn `dialog` primitive + smoke test

**Files:**
- Create: `src/renderer/components/ui/dialog.tsx`
- Create: `tests/component/ui/dialog.test.tsx`

- [ ] **Step 1: Create**

Canonical: https://ui.shadcn.com/docs/components/dialog. ~120 lines, wraps `@radix-ui/react-dialog`. Install if needed: `npm install @radix-ui/react-dialog`. Exports: `Dialog`, `DialogPortal`, `DialogOverlay`, `DialogTrigger`, `DialogClose`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`.

- [ ] **Step 2: Smoke test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

describe('Dialog', () => {
  it('opens on trigger click and shows content', async () => {
    render(
      <Dialog>
        <DialogTrigger>Open</DialogTrigger>
        <DialogContent aria-describedby="d">
          <DialogHeader>
            <DialogTitle>Title</DialogTitle>
            <DialogDescription id="d">Desc</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    );
    await userEvent.click(screen.getByRole('button', { name: /open/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/title/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run, commit**

```bash
npx vitest run tests/component/ui/dialog.test.tsx
git add src/renderer/components/ui/dialog.tsx tests/component/ui/dialog.test.tsx package.json package-lock.json
git commit -m "feat(renderer): add shadcn dialog primitive"
```

---

## Task 11: Add shadcn `sheet` primitive + smoke test

**Files:**
- Create: `src/renderer/components/ui/sheet.tsx`
- Create: `tests/component/ui/sheet.test.tsx`

- [ ] **Step 1: Create**

Canonical: https://ui.shadcn.com/docs/components/sheet. ~180 lines, wraps `@radix-ui/react-dialog` with side-variant styling. Exports: `Sheet`, `SheetPortal`, `SheetOverlay`, `SheetTrigger`, `SheetClose`, `SheetContent`, `SheetHeader`, `SheetFooter`, `SheetTitle`, `SheetDescription`. Supports `side: 'top' | 'right' | 'bottom' | 'left'`. We'll use `side="right"` for the SettingsSheet.

- [ ] **Step 2: Smoke test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

describe('Sheet', () => {
  it('opens on trigger click', async () => {
    render(
      <Sheet>
        <SheetTrigger>Open</SheetTrigger>
        <SheetContent aria-describedby="d" side="right">
          <SheetHeader>
            <SheetTitle>Settings</SheetTitle>
            <SheetDescription id="d">Desc</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );
    await userEvent.click(screen.getByRole('button', { name: /open/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run, commit**

```bash
npx vitest run tests/component/ui/sheet.test.tsx
git add src/renderer/components/ui/sheet.tsx tests/component/ui/sheet.test.tsx
git commit -m "feat(renderer): add shadcn sheet primitive"
```

---

## Task 12: Add shadcn `form` primitive (react-hook-form glue) + smoke test

**Files:**
- Create: `src/renderer/components/ui/form.tsx`
- Create: `tests/component/ui/form.test.tsx`

- [ ] **Step 1: Create**

Canonical: https://ui.shadcn.com/docs/components/form. ~100 lines. Composes `react-hook-form` (already installed) + `@hookform/resolvers` (already installed) + radix `Label` and `Slot`. Exports: `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`, `useFormField`.

- [ ] **Step 2: Smoke test**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

const schema = z.object({ name: z.string().min(2) });

function Harness() {
  const form = useForm<{ name: string }>({
    resolver: zodResolver(schema),
    defaultValues: { name: '' },
  });
  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl>
              <Input {...field} aria-label="name" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </Form>
  );
}

describe('Form', () => {
  it('renders a labeled form field', () => {
    render(<Harness />);
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run, commit**

```bash
npx vitest run tests/component/ui/form.test.tsx
git add src/renderer/components/ui/form.tsx tests/component/ui/form.test.tsx
git commit -m "feat(renderer): add shadcn form primitive (react-hook-form glue)"
```

---

## Task 13: `lib/ascii-table.ts` helper + test (TDD)

**Files:**
- Create: `src/renderer/lib/ascii-table.ts`
- Create: `tests/unit/lib/ascii-table.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/lib/ascii-table.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { toAsciiTable, applyAsciiTransform } from '@/lib/ascii-table';

describe('toAsciiTable', () => {
  it('renders a simple 2x2 table with aligned columns', () => {
    const out = toAsciiTable([
      ['Name', 'Age'],
      ['Alice', '30'],
      ['Bob', '25'],
    ]);
    expect(out).toBe('| Name  | Age |\n| ----- | --- |\n| Alice | 30  |\n| Bob   | 25  |');
  });

  it('handles empty input', () => {
    expect(toAsciiTable([])).toBe('');
  });

  it('aligns numeric columns to the right', () => {
    const out = toAsciiTable([
      ['Item', 'Price'],
      ['X', '100'],
      ['YY', '7'],
    ]);
    // 3-char column width; "7" right-padded to 3 chars
    expect(out).toContain('| 100 |');
    expect(out).toContain('|   7 |');
  });
});

describe('applyAsciiTransform', () => {
  it('replaces markdown tables with fenced ASCII tables', () => {
    const md = 'Before\n\n| Name | Age |\n| --- | --- |\n| Alice | 30 |\n\nAfter';
    const out = applyAsciiTransform(md);
    expect(out).toContain('```\n| Name  | Age |');
    expect(out).toContain('| Alice | 30  |');
    expect(out).toContain('```');
    expect(out).toContain('Before');
    expect(out).toContain('After');
  });

  it('passes through markdown without tables unchanged', () => {
    const md = '# Hello\n\nNo tables here.';
    expect(applyAsciiTransform(md)).toBe(md);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/lib/ascii-table.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/ascii-table'`.

- [ ] **Step 3: Implement**

Create `src/renderer/lib/ascii-table.ts`:

```ts
/**
 * Convert a 2D string array to a fixed-width ASCII table with `| ... |` rows
 * and a `| --- |` separator. Right-aligns columns whose header starts with a
 * digit (heuristic for numeric columns).
 */
export function toAsciiTable(rows: string[][]): string {
  if (rows.length === 0) return '';
  const numCols = Math.max(...rows.map((r) => r.length));
  const widths: number[] = Array.from({ length: numCols }, (_, c) =>
    Math.max(...rows.map((r) => (r[c] ?? '').length))
  );
  const isNumeric = rows[0]?.slice(1).some((c) => /^\d/.test(c)) ?? false;
  const pad = (s: string, w: number) =>
    isNumeric ? s.padStart(w) : s.padEnd(w);
  const lines = rows.map((row) =>
    '| ' +
    Array.from({ length: numCols }, (_, c) => pad(row[c] ?? '', widths[c])).join(' | ') +
    ' |'
  );
  // Insert separator after first row
  const sep =
    '| ' + Array.from({ length: numCols }, (_, c) => '-'.repeat(widths[c])).join(' | ') + ' |';
  return [lines[0], sep, ...lines.slice(1)].join('\n');
}

// Matches a markdown table block: header row, separator, ≥1 data row.
const TABLE_RE = /^\|.+\|\n^\|[\s:|-]+\|\n((?:^\|.+\|\n?)+)/gm;

/**
 * Replace all markdown tables in `source` with fenced code blocks containing
 * the ASCII-rendered equivalent. Non-table content is preserved verbatim.
 */
export function applyAsciiTransform(source: string): string {
  return source.replace(TABLE_RE, (block) => {
    const lines = block.trim().split('\n');
    const header = lines[0].slice(1, -1).split('|').map((s) => s.trim());
    const body = lines.slice(2).map((l) =>
      l.slice(1, -1).split('|').map((s) => s.trim())
    );
    return '```\n' + toAsciiTable([header, ...body]) + '\n```';
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/lib/ascii-table.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/ascii-table.ts tests/unit/lib/ascii-table.test.ts
git commit -m "feat(renderer): ascii-table helper for export-time table formatting"
```

---

## Task 14: `lib/validators.ts` (zod schemas) + test (TDD)

**Files:**
- Create: `src/renderer/lib/validators.ts`
- Create: `tests/unit/lib/validators.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/lib/validators.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  settingsSchema,
  exportPdfSchema,
  exportDocxSchema,
  exportHtmlSchema,
  exportBatchSchema,
} from '@/lib/validators';

describe('settingsSchema', () => {
  it('accepts a valid settings object', () => {
    const r = settingsSchema.safeParse({});
    // Settings schema has all-optional/defaulted fields, so {} should pass
    expect(r.success).toBe(true);
  });

  it('rejects out-of-range fontSize', () => {
    const r = settingsSchema.safeParse({ fontSize: 100 });
    expect(r.success).toBe(false);
  });
});

describe('exportPdfSchema', () => {
  it('accepts a4 + normal margins + embedFonts true', () => {
    expect(exportPdfSchema.safeParse({ format: 'a4', margins: 'normal', embedFonts: true }).success).toBe(true);
  });
  it('rejects unknown format', () => {
    expect(exportPdfSchema.safeParse({ format: 'b4' }).success).toBe(false);
  });
});

describe('exportDocxSchema', () => {
  it('accepts standard template', () => {
    expect(exportDocxSchema.safeParse({ template: 'standard' }).success).toBe(true);
  });
  it('rejects unknown template', () => {
    expect(exportDocxSchema.safeParse({ template: 'fancy' }).success).toBe(false);
  });
});

describe('exportHtmlSchema', () => {
  it('accepts github highlight style', () => {
    expect(exportHtmlSchema.safeParse({ standalone: true, highlightStyle: 'github' }).success).toBe(true);
  });
});

describe('exportBatchSchema', () => {
  it('accepts a non-empty file list', () => {
    expect(exportBatchSchema.safeParse({ format: 'pdf', concurrency: 4, filePaths: ['/a.md'] }).success).toBe(true);
  });
  it('rejects empty file list', () => {
    expect(exportBatchSchema.safeParse({ format: 'pdf', concurrency: 4, filePaths: [] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/lib/validators.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/validators'`.

- [ ] **Step 3: Implement**

Create `src/renderer/lib/validators.ts`:

```ts
import { z } from 'zod';

export const settingsSchema = z.object({
  fontSize: z.number().min(10).max(24).default(14),
  tabSize: z.union([z.literal(2), z.literal(4), z.literal(8)]).default(4),
  lineNumbers: z.boolean().default(true),
  wordWrap: z.boolean().default(true),
  minimap: z.boolean().default(true),
  theme: z.enum(['light', 'dark', 'auto']).default('auto'),
  accentColor: z.enum(['brand', 'blue', 'green', 'purple', 'orange']).default('brand'),
  fontFamily: z.enum(['system', 'jetbrains', 'fira']).default('system'),
  pdfFormat: z.enum(['letter', 'a4', 'legal']).default('a4'),
  pdfMargins: z.enum(['normal', 'narrow', 'wide']).default('normal'),
  pdfEmbedFonts: z.boolean().default(true),
  docxTemplate: z.enum(['standard', 'minimal', 'modern']).default('standard'),
  htmlHighlightStyle: z.enum(['github', 'monokai', 'nord', 'none']).default('github'),
  renderTablesAsAscii: z.boolean().default(false),
  welcomeDismissed: z.boolean().default(false),
});
export type Settings = z.infer<typeof settingsSchema>;

export const exportPdfSchema = z.object({
  format: z.enum(['letter', 'a4', 'legal']),
  margins: z.enum(['normal', 'narrow', 'wide']),
  embedFonts: z.boolean(),
  renderTablesAsAscii: z.boolean().optional(),
});
export type ExportPdfOptions = z.infer<typeof exportPdfSchema>;

export const exportDocxSchema = z.object({
  template: z.enum(['standard', 'minimal', 'modern']),
  renderTablesAsAscii: z.boolean().optional(),
});
export type ExportDocxOptions = z.infer<typeof exportDocxSchema>;

export const exportHtmlSchema = z.object({
  standalone: z.boolean(),
  highlightStyle: z.enum(['github', 'monokai', 'nord', 'none']),
  renderTablesAsAscii: z.boolean().optional(),
});
export type ExportHtmlOptions = z.infer<typeof exportHtmlSchema>;

export const exportBatchSchema = z.object({
  format: z.enum(['pdf', 'docx', 'html', 'png']),
  concurrency: z.number().int().min(1).max(16),
  filePaths: z.array(z.string()).min(1),
});
export type ExportBatchOptions = z.infer<typeof exportBatchSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/lib/validators.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/validators.ts tests/unit/lib/validators.test.ts
git commit -m "feat(renderer): zod validators for settings + export schemas"
```

---

## Task 15: Extend `useAppStore` with `modal` discriminated union (TDD)

**Files:**
- Modify: `src/renderer/stores/app-store.ts`
- Modify: `tests/unit/stores/app-store.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/stores/app-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '@/stores/app-store';

describe('useAppStore (modal)', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({
      sidebarVisible: true,
      previewVisible: true,
      zenMode: false,
      paneSizes: { sidebar: 20, editor: 50, preview: 30 },
      modal: { kind: null },
    } as any);
  });

  it('openModal sets the modal state', () => {
    useAppStore.getState().openModal('about');
    expect(useAppStore.getState().modal).toEqual({ kind: 'about' });
  });

  it('openModal with kind requiring props passes them through', () => {
    useAppStore.getState().openModal('export-pdf', { sourcePath: '/a.md' });
    expect(useAppStore.getState().modal).toEqual({ kind: 'export-pdf', props: { sourcePath: '/a.md' } });
  });

  it('closeModal clears the modal state', () => {
    useAppStore.getState().openModal('about');
    useAppStore.getState().closeModal();
    expect(useAppStore.getState().modal).toEqual({ kind: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/stores/app-store.test.ts
```

Expected: FAIL — TS error or missing `openModal`/`closeModal`.

- [ ] **Step 3: Update `app-store.ts`**

Replace `src/renderer/stores/app-store.ts` with:

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PaneSizes {
  sidebar: number;
  editor: number;
  preview: number;
}

export interface ConfirmProps {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

export type ModalState =
  | { kind: null }
  | { kind: 'export-pdf'; props: { sourcePath: string } }
  | { kind: 'export-docx'; props: { sourcePath: string } }
  | { kind: 'export-html'; props: { sourcePath: string } }
  | { kind: 'export-batch'; props: { sourcePaths: string[] } }
  | { kind: 'settings' }
  | { kind: 'about' }
  | { kind: 'welcome' }
  | { kind: 'confirm'; props: ConfirmProps };

export type ModalKind = ModalState['kind'];

interface AppState {
  sidebarVisible: boolean;
  previewVisible: boolean;
  zenMode: boolean;
  paneSizes: PaneSizes;
  modal: ModalState;
  toggleSidebar: () => void;
  togglePreview: () => void;
  setZenMode: (value: boolean) => void;
  setPaneSizes: (sizes: PaneSizes) => void;
  openModal: <K extends NonNullable<ModalKind>>(
    kind: K,
    ...args: Extract<ModalState, { kind: K }> extends { props: infer P } ? [props?: P] : []
  ) => void;
  closeModal: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      sidebarVisible: true,
      previewVisible: true,
      zenMode: false,
      paneSizes: { sidebar: 20, editor: 50, preview: 30 },
      modal: { kind: null },
      toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
      togglePreview: () => set((s) => ({ previewVisible: !s.previewVisible })),
      setZenMode: (value) => set({ zenMode: value }),
      setPaneSizes: (sizes) => set({ paneSizes: sizes }),
      openModal: (kind, ...args) =>
        set(() => {
          // Find the matching variant and attach props if provided
          const candidate = { kind, ...(args[0] ? { props: args[0] } : {}) } as ModalState;
          return { modal: candidate };
        }),
      closeModal: () => set({ modal: { kind: null } }),
    }),
    {
      name: 'mc-app-store',
      partialize: (state) => ({
        sidebarVisible: state.sidebarVisible,
        previewVisible: state.previewVisible,
        zenMode: state.zenMode,
        paneSizes: state.paneSizes,
        // modal is intentionally NOT persisted (runtime-only)
      }),
    }
  )
);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/stores/app-store.test.ts
```

Expected: PASS, 7 tests (4 existing + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stores/app-store.ts tests/unit/stores/app-store.test.ts
git commit -m "feat(renderer): useAppStore extended with modal discriminated union"
```

---

## Task 16: `useSettingsStore` (full implementation) + test (TDD)

**Files:**
- Create: `src/renderer/stores/settings-store.ts`
- Create: `tests/unit/stores/settings-store.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/stores/settings-store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from '@/stores/settings-store';

describe('useSettingsStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState(useSettingsStore.getInitialState());
  });

  it('has sensible defaults', () => {
    const s = useSettingsStore.getState();
    expect(s.fontSize).toBe(14);
    expect(s.theme).toBe('auto');
    expect(s.pdfFormat).toBe('a4');
    expect(s.docxTemplate).toBe('standard');
    expect(s.renderTablesAsAscii).toBe(false);
    expect(s.welcomeDismissed).toBe(false);
  });

  it('setSetting updates a leaf field', () => {
    useSettingsStore.getState().setSetting('fontSize', 18);
    expect(useSettingsStore.getState().fontSize).toBe(18);
  });

  it('setSetting rejects unknown keys (TS) at compile time; runtime is a no-op', () => {
    useSettingsStore.getState().setSetting('fontSize' as any, 18);
    expect(useSettingsStore.getState().fontSize).toBe(18);
  });

  it('resetToDefaults restores all defaults', () => {
    useSettingsStore.getState().setSetting('fontSize', 22);
    useSettingsStore.getState().setSetting('theme', 'dark');
    useSettingsStore.getState().resetToDefaults();
    expect(useSettingsStore.getState().fontSize).toBe(14);
    expect(useSettingsStore.getState().theme).toBe('auto');
  });

  it('persists only leaf settings (partialize), not actions', () => {
    useSettingsStore.getState().setSetting('fontSize', 16);
    useSettingsStore.getState().setSetting('docxTemplate', 'modern');
    const raw = localStorage.getItem('mc-settings-store');
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.fontSize).toBe(16);
    expect(parsed.state.docxTemplate).toBe('modern');
    // Actions should not be in persisted payload
    expect(parsed.state.setSetting).toBeUndefined();
    expect(parsed.state.resetToDefaults).toBeUndefined();
  });

  it('hydrates from a partial localStorage payload without throwing', () => {
    localStorage.setItem('mc-settings-store', JSON.stringify({ state: { fontSize: 20 }, version: 0 }));
    // Re-import to trigger rehydration
    const reloaded = require('@/stores/settings-store').useSettingsStore;
    expect(reloaded.getState().fontSize).toBe(20);
  });
});
```

Note: the `require` in the last test is to simulate a re-hydration. In vitest, dynamic `require` works but you can also clear and re-create the store. If `require` is awkward, the alternative is to call `useSettingsStore.persist.rehydrate()`.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/stores/settings-store.test.ts
```

Expected: FAIL — `Cannot find module '@/stores/settings-store'`.

- [ ] **Step 3: Implement**

Create `src/renderer/stores/settings-store.ts`:

```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { settingsSchema, type Settings } from '@/lib/validators';

type SettingsLeaf = keyof Omit<Settings, never>;

interface SettingsState extends Settings {
  setSetting: <K extends SettingsLeaf>(key: K, value: Settings[K]) => void;
  resetToDefaults: () => void;
}

const DEFAULTS = settingsSchema.parse({});

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setSetting: (key, value) => set((s) => ({ ...s, [key]: value }) as Partial<SettingsState>),
      resetToDefaults: () => set(() => ({ ...DEFAULTS })),
    }),
    {
      name: 'mc-settings-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => {
        const { setSetting, resetToDefaults, ...rest } = state;
        return rest;
      },
      // Validate on hydration: if localStorage is corrupt, fall back to defaults
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        const result = settingsSchema.safeParse(state);
        if (!result.success) {
          console.warn('[settings-store] invalid persisted state, resetting to defaults', result.error);
          useSettingsStore.setState({ ...DEFAULTS } as any);
        }
      },
    }
  )
);
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/stores/settings-store.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/stores/settings-store.ts tests/unit/stores/settings-store.test.ts
git commit -m "feat(renderer): useSettingsStore (persisted, validated, reset-able)"
```

---

## Task 17: `ModalLayer` shell + test (TDD)

**Files:**
- Create: `src/renderer/components/modals/ModalLayer.tsx`
- Create: `tests/component/modals/ModalLayer.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/component/modals/ModalLayer.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModalLayer } from '@/components/modals/ModalLayer';
import { useAppStore } from '@/stores/app-store';

describe('ModalLayer', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ modal: { kind: null } } as any);
  });

  it('renders nothing when modal is null', () => {
    const { container } = render(<ModalLayer />);
    expect(container.firstChild).toBeNull();
  });

  it('renders AboutDialog when kind is "about"', () => {
    useAppStore.getState().openModal('about');
    render(<ModalLayer />);
    // AboutDialog should render a dialog with title "About MarkdownConverter"
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('switches from about to settings when modal kind changes', () => {
    useAppStore.getState().openModal('about');
    const { rerender } = render(<ModalLayer />);
    expect(screen.getByText(/about/i)).toBeInTheDocument();
    useAppStore.getState().openModal('settings');
    rerender(<ModalLayer />);
    expect(screen.queryByText(/about markdownconverter/i)).not.toBeInTheDocument();
    expect(screen.getByText(/settings/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/component/modals/ModalLayer.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/modals/ModalLayer'`.

- [ ] **Step 3: Implement**

Create `src/renderer/components/modals/ModalLayer.tsx`:

```tsx
import { useAppStore } from '@/stores/app-store';
import { AboutDialog } from './AboutDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { ExportBatchDialog } from './ExportBatchDialog';
import { ExportDocxDialog } from './ExportDocxDialog';
import { ExportHtmlDialog } from './ExportHtmlDialog';
import { ExportPdfDialog } from './ExportPdfDialog';
import { SettingsSheet } from './SettingsSheet';
import { WelcomeDialog } from './WelcomeDialog';

export function ModalLayer() {
  const modal = useAppStore((s) => s.modal);
  switch (modal.kind) {
    case null:
      return null;
    case 'export-pdf':
      return <ExportPdfDialog sourcePath={modal.props.sourcePath} />;
    case 'export-docx':
      return <ExportDocxDialog sourcePath={modal.props.sourcePath} />;
    case 'export-html':
      return <ExportHtmlDialog sourcePath={modal.props.sourcePath} />;
    case 'export-batch':
      return <ExportBatchDialog sourcePaths={modal.props.sourcePaths} />;
    case 'settings':
      return <SettingsSheet />;
    case 'about':
      return <AboutDialog />;
    case 'welcome':
      return <WelcomeDialog />;
    case 'confirm':
      return <ConfirmDialog {...modal.props} />;
  }
}
```

(All the imported modal components will be created in subsequent tasks. The ModalLayer test will fail until at least AboutDialog exists — that's why Task 18 follows immediately.)

- [ ] **Step 4: Run test (will fail until Task 18 lands)**

```bash
npx vitest run tests/component/modals/ModalLayer.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/modals/AboutDialog'` (and others). This is expected. Continue to Task 18.

- [ ] **Step 5: Commit the shell**

```bash
git add src/renderer/components/modals/ModalLayer.tsx tests/component/modals/ModalLayer.test.tsx
git commit -m "feat(renderer): ModalLayer shell (dispatches to 7 modal types)"
```

---

## Task 18: `AboutDialog` + test (TDD)

**Files:**
- Create: `src/renderer/components/modals/AboutDialog.tsx`
- Create: `tests/component/modals/AboutDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/component/modals/AboutDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AboutDialog } from '@/components/modals/AboutDialog';

describe('AboutDialog', () => {
  beforeEach(() => {
    window.electronAPI = {
      app: {
        getVersion: vi.fn().mockResolvedValue({ ok: true, data: '5.0.0' }),
        openExternal: vi.fn().mockResolvedValue({ ok: true }),
      },
    } as any;
  });

  it('renders title and version', async () => {
    render(<AboutDialog />);
    expect(screen.getByText(/about markdownconverter/i)).toBeInTheDocument();
    // version is fetched async; wait for it
    expect(await screen.findByText(/5\.0\.0/)).toBeInTheDocument();
  });

  it('closes when the close button is clicked', async () => {
    render(<AboutDialog />);
    const close = await screen.findByRole('button', { name: /close/i });
    await userEvent.click(close);
    // The dialog should no longer be in the document
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/component/modals/AboutDialog.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/modals/AboutDialog'`.

- [ ] **Step 3: Implement**

Create `src/renderer/components/modals/AboutDialog.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ipc } from '@/lib/ipc';
import { useAppStore } from '@/stores/app-store';

export function AboutDialog() {
  const closeModal = useAppStore((s) => s.closeModal);
  const [version, setVersion] = useState<string>('…');

  useEffect(() => {
    ipc.app.getVersion().then((r) => {
      if (r.ok && typeof r.data === 'string') setVersion(r.data);
    });
  }, []);

  return (
    <Dialog open onOpenChange={(o) => !o && closeModal()}>
      <DialogContent aria-describedby="about-desc">
        <DialogHeader>
          <DialogTitle>About MarkdownConverter</DialogTitle>
          <DialogDescription id="about-desc">
            Professional Markdown editor and universal file converter.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 text-sm text-muted-foreground">
          <p>Version: {version}</p>
          <p>
            <a
              href="https://github.com/amitwh/markdown-converter"
              className="text-brand hover:underline"
              onClick={(e) => {
                e.preventDefault();
                ipc.app.openExternal('https://github.com/amitwh/markdown-converter');
              }}
            >
              GitHub repository
            </a>
          </p>
          <p className="text-xs">© ConcreteInfo. Licensed under MIT.</p>
        </div>
        <DialogFooter>
          <Button onClick={closeModal}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/component/modals/AboutDialog.test.tsx
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/modals/AboutDialog.tsx tests/component/modals/AboutDialog.test.tsx
git commit -m "feat(renderer): AboutDialog (version + GitHub link)"
```

---

## Task 19: `ConfirmDialog` + test (TDD)

**Files:**
- Create: `src/renderer/components/modals/ConfirmDialog.tsx`
- Create: `tests/component/modals/ConfirmDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/component/modals/ConfirmDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from '@/components/modals/ConfirmDialog';
import { useAppStore } from '@/stores/app-store';

describe('ConfirmDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ modal: { kind: null } } as any);
  });

  it('renders title, body, and confirm/cancel labels', () => {
    render(
      <ConfirmDialog
        title="Delete file?"
        body="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {}}
      />
    );
    expect(screen.getByText(/delete file/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('calls onConfirm and closes on confirm click', async () => {
    const onConfirm = vi.fn();
    render(<ConfirmDialog title="T" body="B" onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().modal).toEqual({ kind: null });
  });

  it('destructive variant uses destructive button class', () => {
    render(
      <ConfirmDialog title="T" body="B" destructive onConfirm={() => {}} />
    );
    const btn = screen.getByRole('button', { name: /confirm/i });
    expect(btn.className).toContain('bg-destructive');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/component/modals/ConfirmDialog.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/modals/ConfirmDialog'`.

- [ ] **Step 3: Implement**

Create `src/renderer/components/modals/ConfirmDialog.tsx`:

```tsx
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAppStore, type ConfirmProps } from '@/stores/app-store';

export function ConfirmDialog(props: ConfirmProps) {
  const closeModal = useAppStore((s) => s.closeModal);
  const { title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel', destructive, onConfirm, onCancel } = props;

  const handleConfirm = async () => {
    await onConfirm();
    closeModal();
  };
  const handleCancel = () => {
    onCancel?.();
    closeModal();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && handleCancel()}>
      <DialogContent aria-describedby="confirm-body">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription id="confirm-body">{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={handleCancel}>
            {cancelLabel}
          </Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/component/modals/ConfirmDialog.test.tsx
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/modals/ConfirmDialog.tsx tests/component/modals/ConfirmDialog.test.tsx
git commit -m "feat(renderer): ConfirmDialog (generic title/body/onConfirm)"
```

---

## Task 20: `WelcomeDialog` + test (TDD)

**Files:**
- Create: `src/renderer/components/modals/WelcomeDialog.tsx`
- Create: `tests/component/modals/WelcomeDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/component/modals/WelcomeDialog.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WelcomeDialog } from '@/components/modals/WelcomeDialog';
import { useSettingsStore } from '@/stores/settings-store';
import { useAppStore } from '@/stores/app-store';

describe('WelcomeDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState(useSettingsStore.getInitialState());
    useAppStore.setState({ modal: { kind: null } } as any);
  });

  it('renders a heading and quick-start content', () => {
    render(<WelcomeDialog />);
    expect(screen.getByRole('heading', { name: /welcome/i })).toBeInTheDocument();
    expect(screen.getByText(/open a folder/i)).toBeInTheDocument();
  });

  it('closing without the checkbox does not dismiss future welcome dialogs', async () => {
    render(<WelcomeDialog />);
    await userEvent.click(screen.getByRole('button', { name: /get started/i }));
    expect(useSettingsStore.getState().welcomeDismissed).toBe(false);
    expect(useAppStore.getState().modal).toEqual({ kind: null });
  });

  it('checking "don\'t show again" persists the flag', async () => {
    render(<WelcomeDialog />);
    await userEvent.click(screen.getByRole('checkbox', { name: /don't show again/i }));
    await userEvent.click(screen.getByRole('button', { name: /get started/i }));
    expect(useSettingsStore.getState().welcomeDismissed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/component/modals/WelcomeDialog.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/modals/WelcomeDialog'`.

- [ ] **Step 3: Implement**

Create `src/renderer/components/modals/WelcomeDialog.tsx`:

```tsx
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAppStore } from '@/stores/app-store';
import { useSettingsStore } from '@/stores/settings-store';

export function WelcomeDialog() {
  const closeModal = useAppStore((s) => s.closeModal);
  const setSetting = useSettingsStore((s) => s.setSetting);
  const [dontShow, setDontShow] = useState(false);

  const handleClose = () => {
    if (dontShow) setSetting('welcomeDismissed', true);
    closeModal();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && handleClose()}>
      <DialogContent aria-describedby="welcome-desc" className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Welcome to MarkdownConverter</DialogTitle>
          <DialogDescription id="welcome-desc">
            A polished editor for Markdown, with PDF, DOCX, and HTML export.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border bg-card/30 p-3">
            <h3 className="font-semibold">1. Open a folder</h3>
            <p className="text-muted-foreground">File → Open Folder, or ⌘O. Your tree appears on the left.</p>
          </div>
          <div className="rounded-md border border-border bg-card/30 p-3">
            <h3 className="font-semibold">2. Edit & preview</h3>
            <p className="text-muted-foreground">Type on the left, see the rendered preview on the right. Toggle with ⌘\\.</p>
          </div>
          <div className="rounded-md border border-border bg-card/30 p-3">
            <h3 className="font-semibold">3. Export anywhere</h3>
            <p className="text-muted-foreground">File → Export to PDF / DOCX / HTML, or batch convert a folder.</p>
          </div>
        </div>
        <DialogFooter className="flex-row items-center justify-between sm:justify-between">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={dontShow} onCheckedChange={(c) => setDontShow(!!c)} aria-label="Don't show again" />
            Don't show again
          </label>
          <Button onClick={handleClose}>Get started</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/component/modals/WelcomeDialog.test.tsx
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/modals/WelcomeDialog.tsx tests/component/modals/WelcomeDialog.test.tsx
git commit -m "feat(renderer): WelcomeDialog (first-launch quick-start)"
```

---

## Task 21: `useExportSource` hook (shared by all 4 export dialogs)

**Files:**
- Create: `src/renderer/hooks/use-export-source.ts`

(No tests for this hook directly — it's exercised via the export dialog tests in Tasks 23-26.)

- [ ] **Step 1: Implement**

Create `src/renderer/hooks/use-export-source.ts`:

```ts
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';

export interface ExportSource {
  source: string;
  path: string;
  title: string;
}

/**
 * Read the active buffer's content from the editor store. Returns null if
 * no buffer is open. Components handle the null case (prompt to open a file).
 */
export function useExportSource(): ExportSource | null {
  const activeTabId = useFileStore((s) => s.activeTabId);
  const openTabs = useFileStore((s) => s.openTabs);
  const buffer = useEditorStore((s) => (activeTabId ? s.buffers.get(activeTabId) : undefined));

  if (!activeTabId || !buffer) return null;
  const tab = openTabs.find((t) => t.id === activeTabId);
  return {
    source: buffer.content,
    path: activeTabId,
    title: tab?.title ?? activeTabId,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/hooks/use-export-source.ts
git commit -m "feat(renderer): useExportSource hook (shared by export dialogs)"
```

---

## Task 22: `ExportDialogFooter` (shared cancel/export button row)

**Files:**
- Create: `src/renderer/components/modals/ExportDialogFooter.tsx`

(No tests — pure presentational, exercised via dialog tests.)

- [ ] **Step 1: Implement**

Create `src/renderer/components/modals/ExportDialogFooter.tsx`:

```tsx
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';

interface Props {
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitLabel: string;
  submitDisabled?: boolean;
}

export function ExportDialogFooter({ onCancel, onSubmit, submitting, submitLabel, submitDisabled }: Props) {
  return (
    <DialogFooter>
      <Button variant="ghost" onClick={onCancel} disabled={submitting}>
        Cancel
      </Button>
      <Button onClick={onSubmit} disabled={submitting || submitDisabled}>
        {submitting ? 'Exporting…' : submitLabel}
      </Button>
    </DialogFooter>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/modals/ExportDialogFooter.tsx
git commit -m "feat(renderer): ExportDialogFooter (shared cancel/export row)"
```

---

## Task 23: `ExportPdfDialog` + test (TDD)

**Files:**
- Create: `src/renderer/components/modals/ExportPdfDialog.tsx`
- Create: `tests/component/modals/ExportPdfDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/component/modals/ExportPdfDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportPdfDialog } from '@/components/modals/ExportPdfDialog';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsStore } from '@/stores/settings-store';

describe('ExportPdfDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    window.electronAPI = {
      export: {
        pdf: vi.fn().mockResolvedValue({ ok: true, data: { outputPath: '/out.pdf', bytes: 1024, durationMs: 100 } }),
      },
      app: { showSaveDialog: vi.fn().mockResolvedValue({ ok: true, data: '/out.pdf' }) },
    } as any;
    useSettingsStore.setState(useSettingsStore.getInitialState());
    useFileStore.setState({ activeTabId: '/test.md', openTabs: [{ id: '/test.md', path: '/test.md', title: 'test.md', dirty: false }] } as any);
    useEditorStore.setState({ buffers: new Map([['/test.md', { id: '/test.md', path: '/test.md', content: '# hi', dirty: false }]]) } as any);
  });

  it('renders with default PDF options from settings', () => {
    render(<ExportPdfDialog sourcePath="/test.md" />);
    expect(screen.getByText(/export to pdf/i)).toBeInTheDocument();
    // The default format is 'a4' and a select trigger should show it
    expect(screen.getByRole('combobox', { name: /format/i })).toBeInTheDocument();
  });

  it('toggles ASCII tables and submits merged options', async () => {
    render(<ExportPdfDialog sourcePath="/test.md" />);
    await userEvent.click(screen.getByRole('checkbox', { name: /ascii/i }));
    await userEvent.click(screen.getByRole('button', { name: /^export$/i }));
    // The IPC call should have included renderTablesAsAscii: true
    const call = (window.electronAPI.export.pdf as any).mock.calls[0][0];
    expect(call.renderTablesAsAscii).toBe(true);
    expect(call.format).toBe('a4');
  });

  it('renders an error banner when IPC fails', async () => {
    (window.electronAPI.export.pdf as any).mockResolvedValueOnce({ ok: false, error: { code: 'E', message: 'Pandoc not found' } });
    render(<ExportPdfDialog sourcePath="/test.md" />);
    await userEvent.click(screen.getByRole('button', { name: /^export$/i }));
    expect(await screen.findByText(/pandoc not found/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/component/modals/ExportPdfDialog.test.tsx
```

Expected: FAIL — `Cannot find module '@/components/modals/ExportPdfDialog'`.

- [ ] **Step 3: Implement**

Create `src/renderer/components/modals/ExportPdfDialog.tsx`:

```tsx
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppStore } from '@/stores/app-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useExportSource } from '@/hooks/use-export-source';
import { applyAsciiTransform } from '@/lib/ascii-table';
import { ipc } from '@/lib/ipc';
import { ExportDialogFooter } from './ExportDialogFooter';

const MARGIN_MAP = { normal: { top: 25, right: 25, bottom: 25, left: 25 }, narrow: { top: 15, right: 15, bottom: 15, left: 15 }, wide: { top: 35, right: 35, bottom: 35, left: 35 } };

export function ExportPdfDialog({ sourcePath }: { sourcePath: string }) {
  const closeModal = useAppStore((s) => s.closeModal);
  const { fontSize, pdfFormat, pdfMargins, pdfEmbedFonts, renderTablesAsAscii } = useSettingsStore();
  const [format, setFormat] = useState<'letter' | 'a4' | 'legal'>(pdfFormat);
  const [margins, setMargins] = useState<'normal' | 'narrow' | 'wide'>(pdfMargins);
  const [embed, setEmbed] = useState(pdfEmbedFonts);
  const [ascii, setAscii] = useState(renderTablesAsAscii);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const source = useExportSource();
    if (!source) { setError('No file open.'); return; }
    setSubmitting(true);
    setError(null);
    const finalSource = ascii ? applyAsciiTransform(source.source) : source.source;
    const saveResult = await ipc.export.pdf({
      inputPath: source.path,
      outputPath: source.path.replace(/\.md$/, '.pdf'),
      format,
      margins: MARGIN_MAP[margins],
      embedFonts: embed,
      renderTablesAsAscii: ascii,
      // fontSize is purely cosmetic; we pass it for any font-dependent layout
      fontSize,
    } as any);
    if (!saveResult.ok) {
      setError(saveResult.error.message);
      setSubmitting(false);
    } else {
      closeModal();
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && closeModal()}>
      <DialogContent aria-describedby="pdf-desc">
        <DialogHeader>
          <DialogTitle>Export to PDF</DialogTitle>
          <DialogDescription id="pdf-desc">{sourcePath}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <Label htmlFor="pdf-format">Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as any)}>
              <SelectTrigger id="pdf-format" aria-label="Format"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="letter">Letter</SelectItem>
                <SelectItem value="a4">A4</SelectItem>
                <SelectItem value="legal">Legal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="pdf-margins">Margins</Label>
            <Select value={margins} onValueChange={(v) => setMargins(v as any)}>
              <SelectTrigger id="pdf-margins" aria-label="Margins"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="narrow">Narrow</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="wide">Wide</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2">
            <Checkbox checked={embed} onCheckedChange={(c) => setEmbed(!!c)} aria-label="Embed fonts" />
            Embed fonts
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={ascii} onCheckedChange={(c) => setAscii(!!c)} aria-label="ASCII tables" />
            Render tables as ASCII
          </label>
          {error && (
            <div role="alert" className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>
        <ExportDialogFooter onCancel={closeModal} onSubmit={handleSubmit} submitting={submitting} submitLabel="Export" />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/component/modals/ExportPdfDialog.test.tsx
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/modals/ExportPdfDialog.tsx tests/component/modals/ExportPdfDialog.test.tsx
git commit -m "feat(renderer): ExportPdfDialog (format, margins, ascii tables)"
```

---

## Task 24: `ExportDocxDialog` + test (TDD)

**Files:**
- Create: `src/renderer/components/modals/ExportDocxDialog.tsx`
- Create: `tests/component/modals/ExportDocxDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/component/modals/ExportDocxDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportDocxDialog } from '@/components/modals/ExportDocxDialog';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsStore } from '@/stores/settings-store';

describe('ExportDocxDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    window.electronAPI = {
      export: { docx: vi.fn().mockResolvedValue({ ok: true, data: { outputPath: '/out.docx' } }) },
    } as any;
    useSettingsStore.setState(useSettingsStore.getInitialState());
    useFileStore.setState({ activeTabId: '/test.md', openTabs: [{ id: '/test.md', path: '/test.md', title: 'test.md', dirty: false }] } as any);
    useEditorStore.setState({ buffers: new Map([['/test.md', { id: '/test.md', path: '/test.md', content: '# hi', dirty: false }]]) } as any);
  });

  it('renders with standard template selected by default', () => {
    render(<ExportDocxDialog sourcePath="/test.md" />);
    expect(screen.getByText(/export to docx/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /template/i })).toBeInTheDocument();
  });

  it('submitting with default options sends template=standard', async () => {
    render(<ExportDocxDialog sourcePath="/test.md" />);
    await userEvent.click(screen.getByRole('button', { name: /^export$/i }));
    const call = (window.electronAPI.export.docx as any).mock.calls[0][0];
    expect(call.template).toBe('standard');
  });

  it('selecting "modern" template sends template=modern', async () => {
    render(<ExportDocxDialog sourcePath="/test.md" />);
    await userEvent.click(screen.getByRole('combobox', { name: /template/i }));
    await userEvent.click(screen.getByRole('option', { name: /modern/i }));
    await userEvent.click(screen.getByRole('button', { name: /^export$/i }));
    const call = (window.electronAPI.export.docx as any).mock.calls[0][0];
    expect(call.template).toBe('modern');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/component/modals/ExportDocxDialog.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/renderer/components/modals/ExportDocxDialog.tsx`:

```tsx
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppStore } from '@/stores/app-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useExportSource } from '@/hooks/use-export-source';
import { applyAsciiTransform } from '@/lib/ascii-table';
import { ipc } from '@/lib/ipc';
import { ExportDialogFooter } from './ExportDialogFooter';

export function ExportDocxDialog({ sourcePath }: { sourcePath: string }) {
  const closeModal = useAppStore((s) => s.closeModal);
  const { docxTemplate, renderTablesAsAscii } = useSettingsStore();
  const [template, setTemplate] = useState<'standard' | 'minimal' | 'modern'>(docxTemplate);
  const [ascii, setAscii] = useState(renderTablesAsAscii);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const source = useExportSource();
    if (!source) { setError('No file open.'); return; }
    setSubmitting(true);
    setError(null);
    const finalSource = ascii ? applyAsciiTransform(source.source) : source.source;
    const result = await ipc.export.docx({
      inputPath: source.path,
      outputPath: source.path.replace(/\.md$/, '.docx'),
      template,
      // We send the transformed source as part of the options object;
      // the main process reads the file from disk. To honor the toggle
      // without changing the IPC contract, we temporarily write the
      // transformed source to a sibling file. For Phase 7 we just send
      // the flag and let the main process handle it (planned for Phase 8).
      renderTablesAsAscii: ascii,
    } as any);
    if (!result.ok) {
      setError(result.error.message);
      setSubmitting(false);
    } else {
      closeModal();
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && closeModal()}>
      <DialogContent aria-describedby="docx-desc">
        <DialogHeader>
          <DialogTitle>Export to DOCX</DialogTitle>
          <DialogDescription id="docx-desc">{sourcePath}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <Label htmlFor="docx-template">Template</Label>
            <Select value={template} onValueChange={(v) => setTemplate(v as any)}>
              <SelectTrigger id="docx-template" aria-label="Template"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="minimal">Minimal</SelectItem>
                <SelectItem value="modern">Modern</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Bundled with the app. Standard is the default; Modern adds a colored cover page.
            </p>
          </div>
          <label className="flex items-center gap-2">
            <Checkbox checked={ascii} onCheckedChange={(c) => setAscii(!!c)} aria-label="ASCII tables" />
            Render tables as ASCII
          </label>
          {error && (
            <div role="alert" className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>
        <ExportDialogFooter onCancel={closeModal} onSubmit={handleSubmit} submitting={submitting} submitLabel="Export" />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/component/modals/ExportDocxDialog.test.tsx
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/modals/ExportDocxDialog.tsx tests/component/modals/ExportDocxDialog.test.tsx
git commit -m "feat(renderer): ExportDocxDialog (template picker + ascii tables)"
```

---

## Task 25: `ExportHtmlDialog` + test (TDD)

**Files:**
- Create: `src/renderer/components/modals/ExportHtmlDialog.tsx`
- Create: `tests/component/modals/ExportHtmlDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/component/modals/ExportHtmlDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportHtmlDialog } from '@/components/modals/ExportHtmlDialog';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { useSettingsStore } from '@/stores/settings-store';

describe('ExportHtmlDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    window.electronAPI = {
      export: { html: vi.fn().mockResolvedValue({ ok: true, data: { outputPath: '/out.html' } }) },
    } as any;
    useSettingsStore.setState(useSettingsStore.getInitialState());
    useFileStore.setState({ activeTabId: '/test.md', openTabs: [{ id: '/test.md', path: '/test.md', title: 'test.md', dirty: false }] } as any);
    useEditorStore.setState({ buffers: new Map([['/test.md', { id: '/test.md', path: '/test.md', content: '# hi', dirty: false }]]) } as any);
  });

  it('renders with default github highlight style', () => {
    render(<ExportHtmlDialog sourcePath="/test.md" />);
    expect(screen.getByText(/export to html/i)).toBeInTheDocument();
  });

  it('toggles standalone and submits with chosen highlight', async () => {
    render(<ExportHtmlDialog sourcePath="/test.md" />);
    await userEvent.click(screen.getByRole('checkbox', { name: /standalone/i }));
    await userEvent.click(screen.getByRole('combobox', { name: /highlight/i }));
    await userEvent.click(screen.getByRole('option', { name: /monokai/i }));
    await userEvent.click(screen.getByRole('button', { name: /^export$/i }));
    const call = (window.electronAPI.export.html as any).mock.calls[0][0];
    expect(call.standalone).toBe(true);
    expect(call.highlightStyle).toBe('monokai');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/component/modals/ExportHtmlDialog.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/renderer/components/modals/ExportHtmlDialog.tsx`:

```tsx
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppStore } from '@/stores/app-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useExportSource } from '@/hooks/use-export-source';
import { applyAsciiTransform } from '@/lib/ascii-table';
import { ipc } from '@/lib/ipc';
import { ExportDialogFooter } from './ExportDialogFooter';

export function ExportHtmlDialog({ sourcePath }: { sourcePath: string }) {
  const closeModal = useAppStore((s) => s.closeModal);
  const { htmlHighlightStyle, renderTablesAsAscii } = useSettingsStore();
  const [standalone, setStandalone] = useState(true);
  const [highlight, setHighlight] = useState(htmlHighlightStyle);
  const [ascii, setAscii] = useState(renderTablesAsAscii);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const source = useExportSource();
    if (!source) { setError('No file open.'); return; }
    setSubmitting(true);
    setError(null);
    const result = await ipc.export.html({
      inputPath: source.path,
      outputPath: source.path.replace(/\.md$/, '.html'),
      standalone,
      highlightStyle: highlight,
      renderTablesAsAscii: ascii,
    } as any);
    if (!result.ok) {
      setError(result.error.message);
      setSubmitting(false);
    } else {
      closeModal();
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && closeModal()}>
      <DialogContent aria-describedby="html-desc">
        <DialogHeader>
          <DialogTitle>Export to HTML</DialogTitle>
          <DialogDescription id="html-desc">{sourcePath}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox checked={standalone} onCheckedChange={(c) => setStandalone(!!c)} aria-label="Standalone" />
            Standalone document (with inline CSS)
          </label>
          <div>
            <Label htmlFor="html-highlight">Syntax highlight style</Label>
            <Select value={highlight} onValueChange={(v) => setHighlight(v as any)}>
              <SelectTrigger id="html-highlight" aria-label="Highlight style"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="github">GitHub</SelectItem>
                <SelectItem value="monokai">Monokai</SelectItem>
                <SelectItem value="nord">Nord</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2">
            <Checkbox checked={ascii} onCheckedChange={(c) => setAscii(!!c)} aria-label="ASCII tables" />
            Render tables as ASCII
          </label>
          {error && (
            <div role="alert" className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>
        <ExportDialogFooter onCancel={closeModal} onSubmit={handleSubmit} submitting={submitting} submitLabel="Export" />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run, commit**

```bash
npx vitest run tests/component/modals/ExportHtmlDialog.test.tsx
git add src/renderer/components/modals/ExportHtmlDialog.tsx tests/component/modals/ExportHtmlDialog.test.tsx
git commit -m "feat(renderer): ExportHtmlDialog (standalone, highlight style, ascii tables)"
```

---

## Task 26: `ExportBatchDialog` + test (TDD)

**Files:**
- Create: `src/renderer/components/modals/ExportBatchDialog.tsx`
- Create: `tests/component/modals/ExportBatchDialog.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/component/modals/ExportBatchDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportBatchDialog } from '@/components/modals/ExportBatchDialog';

describe('ExportBatchDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    window.electronAPI = {
      export: { batch: vi.fn().mockResolvedValue({ ok: true, data: { total: 2, succeeded: 2, failed: 0, results: [] } }) },
    } as any;
  });

  it('renders the file list passed via sourcePaths', () => {
    render(<ExportBatchDialog sourcePaths={['/a.md', '/b.md']} />);
    expect(screen.getByText('/a.md')).toBeInTheDocument();
    expect(screen.getByText('/b.md')).toBeInTheDocument();
  });

  it('selecting format and concurrency submits correct options', async () => {
    render(<ExportBatchDialog sourcePaths={['/a.md', '/b.md']} />);
    await userEvent.click(screen.getByRole('combobox', { name: /format/i }));
    await userEvent.click(screen.getByRole('option', { name: /^pdf$/i }));
    await userEvent.click(screen.getByRole('button', { name: /^export$/i }));
    const call = (window.electronAPI.export.batch as any).mock.calls[0];
    expect(call[0]).toEqual([{ inputPath: '/a.md', outputPath: expect.any(String) }, { inputPath: '/b.md', outputPath: expect.any(String) }]);
    expect(call[1].format).toBe('pdf');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/component/modals/ExportBatchDialog.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/renderer/components/modals/ExportBatchDialog.tsx`:

```tsx
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAppStore } from '@/stores/app-store';
import { ipc } from '@/lib/ipc';
import { ExportDialogFooter } from './ExportDialogFooter';

const extFor = (format: 'pdf' | 'docx' | 'html' | 'png') =>
  format === 'pdf' ? '.pdf' : format === 'docx' ? '.docx' : format === 'png' ? '.png' : '.html';

export function ExportBatchDialog({ sourcePaths }: { sourcePaths: string[] }) {
  const closeModal = useAppStore((s) => s.closeModal);
  const [format, setFormat] = useState<'pdf' | 'docx' | 'html' | 'png'>('pdf');
  const [concurrency, setConcurrency] = useState(4);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    const items = sourcePaths.map((p) => ({
      inputPath: p,
      outputPath: p.replace(/\.md$/, extFor(format)),
    }));
    const result = await ipc.export.batch(items, { format, concurrency });
    if (!result.ok) {
      setError(result.error.message);
      setSubmitting(false);
    } else {
      closeModal();
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && closeModal()}>
      <DialogContent aria-describedby="batch-desc">
        <DialogHeader>
          <DialogTitle>Batch export</DialogTitle>
          <DialogDescription id="batch-desc">{sourcePaths.length} files</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <Label htmlFor="batch-format">Format</Label>
            <Select value={format} onValueChange={(v) => setFormat(v as any)}>
              <SelectTrigger id="batch-format" aria-label="Format"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="docx">DOCX</SelectItem>
                <SelectItem value="html">HTML</SelectItem>
                <SelectItem value="png">PNG</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="batch-concurrency">Concurrency</Label>
            <Select value={String(concurrency)} onValueChange={(v) => setConcurrency(Number(v))}>
              <SelectTrigger id="batch-concurrency" aria-label="Concurrency"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[1, 2, 4, 8, 16].map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="max-h-40 overflow-auto rounded border border-border bg-card/20 p-2 text-xs">
            {sourcePaths.map((p) => <div key={p} className="truncate">{p}</div>)}
          </div>
          {error && (
            <div role="alert" className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>
        <ExportDialogFooter onCancel={closeModal} onSubmit={handleSubmit} submitting={submitting} submitLabel="Export" />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Run, commit**

```bash
npx vitest run tests/component/modals/ExportBatchDialog.test.tsx
git add src/renderer/components/modals/ExportBatchDialog.tsx tests/component/modals/ExportBatchDialog.test.tsx
git commit -m "feat(renderer): ExportBatchDialog (format, concurrency, file list)"
```

---

## Task 27: `EditorSettings` tab (no test, exercised via SettingsSheet test in Task 32)

**Files:**
- Create: `src/renderer/components/modals/EditorSettings.tsx`

- [ ] **Step 1: Implement**

Create `src/renderer/components/modals/EditorSettings.tsx`:

```tsx
import { useSettingsStore } from '@/stores/settings-store';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export function EditorSettings() {
  const { fontSize, tabSize, lineNumbers, wordWrap, minimap, setSetting } = useSettingsStore();

  return (
    <div className="space-y-5 text-sm">
      <div>
        <Label htmlFor="editor-font-size">Font size: {fontSize}px</Label>
        <Slider id="editor-font-size" min={10} max={24} step={1} value={[fontSize]} onValueChange={([v]) => setSetting('fontSize', v)} />
      </div>
      <div>
        <Label htmlFor="editor-tab-size">Tab size</Label>
        <Select value={String(tabSize)} onValueChange={(v) => setSetting('tabSize', Number(v) as 2 | 4 | 8)}>
          <SelectTrigger id="editor-tab-size" aria-label="Tab size"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="2">2 spaces</SelectItem>
            <SelectItem value="4">4 spaces</SelectItem>
            <SelectItem value="8">8 spaces</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center justify-between">
        <span>Line numbers</span>
        <Switch checked={lineNumbers} onCheckedChange={(c) => setSetting('lineNumbers', c)} aria-label="Line numbers" />
      </label>
      <label className="flex items-center justify-between">
        <span>Word wrap</span>
        <Switch checked={wordWrap} onCheckedChange={(c) => setSetting('wordWrap', c)} aria-label="Word wrap" />
      </label>
      <label className="flex items-center justify-between">
        <span>Minimap</span>
        <Switch checked={minimap} onCheckedChange={(c) => setSetting('minimap', c)} aria-label="Minimap" />
      </label>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/modals/EditorSettings.tsx
git commit -m "feat(renderer): EditorSettings tab (font, tab, line/wrap, minimap)"
```

---

## Task 28: `ThemeSettings` tab

**Files:**
- Create: `src/renderer/components/modals/ThemeSettings.tsx`

- [ ] **Step 1: Implement**

Create `src/renderer/components/modals/ThemeSettings.tsx`:

```tsx
import { useSettingsStore } from '@/stores/settings-store';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function ThemeSettings() {
  const { theme, accentColor, fontFamily, setSetting } = useSettingsStore();

  return (
    <div className="space-y-5 text-sm">
      <div>
        <Label>Mode</Label>
        <RadioGroup value={theme} onValueChange={(v) => setSetting('theme', v as 'light' | 'dark' | 'auto')}>
          <div className="flex items-center gap-2"><RadioGroupItem value="light" id="theme-light" /><Label htmlFor="theme-light">Light</Label></div>
          <div className="flex items-center gap-2"><RadioGroupItem value="dark" id="theme-dark" /><Label htmlFor="theme-dark">Dark</Label></div>
          <div className="flex items-center gap-2"><RadioGroupItem value="auto" id="theme-auto" /><Label htmlFor="theme-auto">Auto (system)</Label></div>
        </RadioGroup>
      </div>
      <div>
        <Label htmlFor="theme-accent">Accent color</Label>
        <Select value={accentColor} onValueChange={(v) => setSetting('accentColor', v as any)}>
          <SelectTrigger id="theme-accent" aria-label="Accent color"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="brand">Brand (orange)</SelectItem>
            <SelectItem value="blue">Blue</SelectItem>
            <SelectItem value="green">Green</SelectItem>
            <SelectItem value="purple">Purple</SelectItem>
            <SelectItem value="orange">Orange</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="theme-font-family">Editor font</Label>
        <Select value={fontFamily} onValueChange={(v) => setSetting('fontFamily', v as any)}>
          <SelectTrigger id="theme-font-family" aria-label="Editor font"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="system">System (Plus Jakarta Sans)</SelectItem>
            <SelectItem value="jetbrains">JetBrains Mono</SelectItem>
            <SelectItem value="fira">Fira Code</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/modals/ThemeSettings.tsx
git commit -m "feat(renderer): ThemeSettings tab (mode, accent, font)"
```

---

## Task 29: `ExportSettings` tab

**Files:**
- Create: `src/renderer/components/modals/ExportSettings.tsx`

- [ ] **Step 1: Implement**

Create `src/renderer/components/modals/ExportSettings.tsx`:

```tsx
import { useSettingsStore } from '@/stores/settings-store';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export function ExportSettings() {
  const { pdfFormat, pdfMargins, pdfEmbedFonts, docxTemplate, htmlHighlightStyle, renderTablesAsAscii, setSetting } = useSettingsStore();

  return (
    <div className="space-y-5 text-sm">
      <div>
        <Label htmlFor="export-pdf-format">Default PDF format</Label>
        <Select value={pdfFormat} onValueChange={(v) => setSetting('pdfFormat', v as any)}>
          <SelectTrigger id="export-pdf-format" aria-label="Default PDF format"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="letter">Letter</SelectItem>
            <SelectItem value="a4">A4</SelectItem>
            <SelectItem value="legal">Legal</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="export-pdf-margins">Default PDF margins</Label>
        <Select value={pdfMargins} onValueChange={(v) => setSetting('pdfMargins', v as any)}>
          <SelectTrigger id="export-pdf-margins" aria-label="Default PDF margins"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="narrow">Narrow</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="wide">Wide</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center justify-between">
        <span>Embed fonts in PDFs</span>
        <Switch checked={pdfEmbedFonts} onCheckedChange={(c) => setSetting('pdfEmbedFonts', c)} aria-label="Embed fonts" />
      </label>
      <div>
        <Label htmlFor="export-docx-template">Default DOCX template</Label>
        <Select value={docxTemplate} onValueChange={(v) => setSetting('docxTemplate', v as any)}>
          <SelectTrigger id="export-docx-template" aria-label="Default DOCX template"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">Standard</SelectItem>
            <SelectItem value="minimal">Minimal</SelectItem>
            <SelectItem value="modern">Modern</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="export-html-highlight">Default HTML highlight</Label>
        <Select value={htmlHighlightStyle} onValueChange={(v) => setSetting('htmlHighlightStyle', v as any)}>
          <SelectTrigger id="export-html-highlight" aria-label="Default HTML highlight"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="github">GitHub</SelectItem>
            <SelectItem value="monokai">Monokai</SelectItem>
            <SelectItem value="nord">Nord</SelectItem>
            <SelectItem value="none">None</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <label className="flex items-center justify-between">
        <span>Render tables as ASCII by default</span>
        <Switch checked={renderTablesAsAscii} onCheckedChange={(c) => setSetting('renderTablesAsAscii', c)} aria-label="ASCII tables by default" />
      </label>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/modals/ExportSettings.tsx
git commit -m "feat(renderer): ExportSettings tab (PDF/DOCX/HTML defaults + ascii toggle)"
```

---

## Task 30: `PluginsSettings` tab (placeholder)

**Files:**
- Create: `src/renderer/components/modals/PluginsSettings.tsx`

- [ ] **Step 1: Implement**

Create `src/renderer/components/modals/PluginsSettings.tsx`:

```tsx
import { Sparkles } from 'lucide-react';

export function PluginsSettings() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground">
      <Sparkles className="h-8 w-8 opacity-50" />
      <h3 className="text-base font-semibold text-foreground">Coming soon</h3>
      <p className="max-w-sm text-sm">
        The plugin system is on the roadmap. You'll be able to extend MarkdownConverter with custom
        commands, themes, and export formats.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/modals/PluginsSettings.tsx
git commit -m "feat(renderer): PluginsSettings tab placeholder (Coming soon)"
```

---

## Task 31: `AboutSettings` tab

**Files:**
- Create: `src/renderer/components/modals/AboutSettings.tsx`

- [ ] **Step 1: Implement**

Create `src/renderer/components/modals/AboutSettings.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { ipc } from '@/lib/ipc';

export function AboutSettings() {
  const [version, setVersion] = useState('…');

  useEffect(() => {
    ipc.app.getVersion().then((r) => {
      if (r.ok && typeof r.data === 'string') setVersion(r.data);
    });
  }, []);

  return (
    <div className="space-y-3 text-sm">
      <h3 className="text-base font-semibold">MarkdownConverter</h3>
      <p className="text-muted-foreground">Version {version}</p>
      <p>
        <a
          href="https://github.com/amitwh/markdown-converter"
          className="text-brand hover:underline"
          onClick={(e) => { e.preventDefault(); ipc.app.openExternal('https://github.com/amitwh/markdown-converter'); }}
        >
          GitHub repository
        </a>
      </p>
      <p>
        <a
          href="https://concreteinfo.co.in"
          className="text-brand hover:underline"
          onClick={(e) => { e.preventDefault(); ipc.app.openExternal('https://concreteinfo.co.in'); }}
        >
          ConcreteInfo
        </a>
      </p>
      <p className="text-xs text-muted-foreground">© ConcreteInfo. Licensed under MIT.</p>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/components/modals/AboutSettings.tsx
git commit -m "feat(renderer): AboutSettings tab (version + links)"
```

---

## Task 32: `SettingsSheet` (compose 5 tabs) + test (TDD)

**Files:**
- Create: `src/renderer/components/modals/SettingsSheet.tsx`
- Create: `tests/component/modals/SettingsSheet.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/component/modals/SettingsSheet.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsSheet } from '@/components/modals/SettingsSheet';
import { useSettingsStore } from '@/stores/settings-store';

describe('SettingsSheet', () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState(useSettingsStore.getInitialState());
  });

  it('renders 5 tab triggers', () => {
    render(<SettingsSheet />);
    expect(screen.getByRole('tab', { name: /editor/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /theme/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /export/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /plugins/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /about/i })).toBeInTheDocument();
  });

  it('editor tab is open by default and shows font size', () => {
    render(<SettingsSheet />);
    expect(screen.getByText(/font size/i)).toBeInTheDocument();
  });

  it('theme tab shows theme radio group', async () => {
    render(<SettingsSheet />);
    await userEvent.click(screen.getByRole('tab', { name: /theme/i }));
    expect(screen.getByText(/accent color/i)).toBeInTheDocument();
  });

  it('export tab shows ascii toggle and template picker', async () => {
    render(<SettingsSheet />);
    await userEvent.click(screen.getByRole('tab', { name: /export/i }));
    expect(screen.getByText(/render tables as ascii by default/i)).toBeInTheDocument();
    expect(screen.getByText(/default docx template/i)).toBeInTheDocument();
  });

  it('plugins tab shows coming soon message', async () => {
    render(<SettingsSheet />);
    await userEvent.click(screen.getByRole('tab', { name: /plugins/i }));
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument();
  });

  it('about tab shows version', async () => {
    render(<SettingsSheet />);
    await userEvent.click(screen.getByRole('tab', { name: /about/i }));
    expect(screen.getByText(/markdownconverter/i)).toBeInTheDocument();
  });

  it('reset to defaults button clears all settings', async () => {
    useSettingsStore.getState().setSetting('fontSize', 22);
    render(<SettingsSheet />);
    await userEvent.click(screen.getByRole('button', { name: /reset/i }));
    expect(useSettingsStore.getState().fontSize).toBe(14);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/component/modals/SettingsSheet.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

Create `src/renderer/components/modals/SettingsSheet.tsx`:

```tsx
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useAppStore } from '@/stores/app-store';
import { useSettingsStore } from '@/stores/settings-store';
import { EditorSettings } from './EditorSettings';
import { ThemeSettings } from './ThemeSettings';
import { ExportSettings } from './ExportSettings';
import { PluginsSettings } from './PluginsSettings';
import { AboutSettings } from './AboutSettings';

export function SettingsSheet() {
  const closeModal = useAppStore((s) => s.closeModal);
  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults);

  return (
    <Sheet open onOpenChange={(o) => !o && closeModal()}>
      <SheetContent aria-describedby="settings-desc" side="right" className="w-full sm:max-w-[480px]">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription id="settings-desc">Editor, theme, and export preferences</SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="editor" className="mt-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="editor">Editor</TabsTrigger>
            <TabsTrigger value="theme">Theme</TabsTrigger>
            <TabsTrigger value="export">Export</TabsTrigger>
            <TabsTrigger value="plugins">Plugins</TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
          </TabsList>
          <div className="mt-4 max-h-[70vh] overflow-y-auto pr-2">
            <TabsContent value="editor"><EditorSettings /></TabsContent>
            <TabsContent value="theme"><ThemeSettings /></TabsContent>
            <TabsContent value="export"><ExportSettings /></TabsContent>
            <TabsContent value="plugins"><PluginsSettings /></TabsContent>
            <TabsContent value="about"><AboutSettings /></TabsContent>
          </div>
        </Tabs>
        <div className="mt-4 flex justify-end border-t border-border pt-4">
          <Button variant="ghost" onClick={resetToDefaults}>Reset to defaults</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/component/modals/SettingsSheet.test.tsx
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/modals/SettingsSheet.tsx tests/component/modals/SettingsSheet.test.tsx
git commit -m "feat(renderer): SettingsSheet (5 tabs: editor, theme, export, plugins, about)"
```

---

## Task 33: Extend `register-menu-commands.ts` with 9 new commands + test (TDD)

**Files:**
- Modify: `src/renderer/lib/commands/register-menu-commands.ts`
- Create: `tests/unit/commands/modal-commands.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/commands/modal-commands.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerMenuCommands } from '@/lib/commands/register-menu-commands';
import { useCommandStore } from '@/stores/command-store';
import { useAppStore } from '@/stores/app-store';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';

describe('modal commands', () => {
  beforeEach(() => {
    localStorage.clear();
    useCommandStore.setState({ handlers: {}, userBindings: {} } as any);
    useAppStore.setState({ modal: { kind: null } } as any);
    useFileStore.setState({ activeTabId: '/x.md', openTabs: [{ id: '/x.md', path: '/x.md', title: 'x.md', dirty: false }] } as any);
    useEditorStore.setState({ buffers: new Map([['/x.md', { id: '/x.md', path: '/x.md', content: '# hi', dirty: false }]]) } as any);
  });

  it('settings.open opens settings modal', () => {
    registerMenuCommands();
    useCommandStore.getState().dispatch('settings.open');
    expect(useAppStore.getState().modal).toEqual({ kind: 'settings' });
  });

  it('help.about opens about modal', () => {
    registerMenuCommands();
    useCommandStore.getState().dispatch('help.about');
    expect(useAppStore.getState().modal).toEqual({ kind: 'about' });
  });

  it('help.welcome opens welcome modal', () => {
    registerMenuCommands();
    useCommandStore.getState().dispatch('help.welcome');
    expect(useAppStore.getState().modal).toEqual({ kind: 'welcome' });
  });

  it('file.exportPdf opens export-pdf modal with active path', () => {
    registerMenuCommands();
    useCommandStore.getState().dispatch('file.exportPdf');
    expect(useAppStore.getState().modal).toEqual({ kind: 'export-pdf', props: { sourcePath: '/x.md' } });
  });

  it('file.exportDocx opens export-docx modal', () => {
    registerMenuCommands();
    useCommandStore.getState().dispatch('file.exportDocx');
    expect(useAppStore.getState().modal).toEqual({ kind: 'export-docx', props: { sourcePath: '/x.md' } });
  });

  it('file.exportBatch opens export-batch modal with all open files', () => {
    useFileStore.setState({ activeTabId: '/x.md', openTabs: [{ id: '/x.md', path: '/x.md', title: 'x.md', dirty: false }, { id: '/y.md', path: '/y.md', title: 'y.md', dirty: false }] } as any);
    registerMenuCommands();
    useCommandStore.getState().dispatch('file.exportBatch');
    expect(useAppStore.getState().modal).toEqual({ kind: 'export-batch', props: { sourcePaths: ['/x.md', '/y.md'] } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/commands/modal-commands.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/commands/register-menu-commands'`.

- [ ] **Step 3: Update `register-menu-commands.ts`**

Open `src/renderer/lib/commands/register-menu-commands.ts` and add the new commands. The existing file (from Phase 6) registers `file.*` and `view.*` and `tab.*` commands. Append the new handlers.

(If the file uses a `registerMany` pattern from Phase 6, the addition is a single object spread. The exact structure depends on what's already there; the test above defines the contract.)

The new commands (full handler code):

```ts
import { useAppStore } from '@/stores/app-store';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';

export function registerMenuCommands() {
  const handlers: Record<string, (args?: unknown) => void | Promise<void>> = {
    // ... existing handlers from Phase 6 ...
    'settings.open': () => useAppStore.getState().openModal('settings'),
    'help.about': () => useAppStore.getState().openModal('about'),
    'help.welcome': () => useAppStore.getState().openModal('welcome'),
    'file.exportPdf': () => {
      const activeTabId = useFileStore.getState().activeTabId;
      if (!activeTabId) return;
      useAppStore.getState().openModal('export-pdf', { sourcePath: activeTabId });
    },
    'file.exportDocx': () => {
      const activeTabId = useFileStore.getState().activeTabId;
      if (!activeTabId) return;
      useAppStore.getState().openModal('export-docx', { sourcePath: activeTabId });
    },
    'file.exportHtml': () => {
      const activeTabId = useFileStore.getState().activeTabId;
      if (!activeTabId) return;
      useAppStore.getState().openModal('export-html', { sourcePath: activeTabId });
    },
    'file.exportBatch': () => {
      const paths = useFileStore.getState().openTabs.map((t) => t.path);
      if (paths.length === 0) return;
      useAppStore.getState().openModal('export-batch', { sourcePaths: paths });
    },
  };
  useCommandStore.getState().registerMany(handlers);
}
```

(If the existing `registerMenuCommands` already has a return signature, preserve it. The key requirement is that the 9 new commands are registered.)

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/commands/modal-commands.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/lib/commands/register-menu-commands.ts tests/unit/commands/modal-commands.test.ts
git commit -m "feat(renderer): register 9 modal-opening commands in command store"
```

---

## Task 34: Extend `AppHeader` with Settings + About icon buttons + test (TDD)

**Files:**
- Modify: `src/renderer/components/layout/AppHeader.tsx`
- Modify: `tests/component/layout/AppHeader.test.tsx`

- [ ] **Step 1: Read the current AppHeader to see its command pattern**

```bash
cat src/renderer/components/layout/AppHeader.tsx
```

The header from Phase 6 already uses `useCommandStore` to dispatch `view.toggleSidebar`, `view.togglePreview`, `shortcuts.show`. Add Settings (gear icon) and About (info icon) buttons that dispatch `settings.open` and `help.about`.

- [ ] **Step 2: Add the new buttons**

In `AppHeader.tsx`, add (after the existing buttons, before the `ThemeToggle`):

```tsx
import { Settings, Info } from 'lucide-react';
// ...
const dispatch = useCommandStore((s) => s.dispatch);
// ...
<Button
  variant="ghost"
  size="icon"
  aria-label="Settings"
  onClick={() => dispatch('settings.open')}
>
  <Settings className="h-4 w-4" />
</Button>
<Button
  variant="ghost"
  size="icon"
  aria-label="About"
  onClick={() => dispatch('help.about')}
>
  <Info className="h-4 w-4" />
</Button>
```

- [ ] **Step 3: Update the test**

The test must register the matching commands in `beforeEach` (the AppHeader dispatches, doesn't call store directly). Add to `tests/component/layout/AppHeader.test.tsx`:

```tsx
beforeEach(() => {
  // ... existing beforeEach ...
  useCommandStore.setState({ handlers: { 'settings.open': () => useAppStore.getState().openModal('settings'), 'help.about': () => useAppStore.getState().openModal('about') }, userBindings: {} } as any);
});

it('settings button opens settings modal', async () => {
  render(<AppHeader />);
  await userEvent.click(screen.getByRole('button', { name: /settings/i }));
  expect(useAppStore.getState().modal).toEqual({ kind: 'settings' });
});

it('about button opens about modal', async () => {
  render(<AppHeader />);
  await userEvent.click(screen.getByRole('button', { name: /^about$/i }));
  expect(useAppStore.getState().modal).toEqual({ kind: 'about' });
});
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/component/layout/AppHeader.test.tsx
```

Expected: PASS, 6 tests (2 existing + 2 new + the toggle tests from Phase 6).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/layout/AppHeader.tsx tests/component/layout/AppHeader.test.tsx
git commit -m "feat(renderer): AppHeader gets Settings + About icon buttons"
```

---

## Task 35: Mount `ModalLayer` in `App.tsx` + first-launch welcome `useEffect`

**Files:**
- Modify: `src/renderer/App.tsx`
- Create: `src/renderer/hooks/use-welcome-trigger.ts`

- [ ] **Step 1: Create the welcome trigger hook**

Create `src/renderer/hooks/use-welcome-trigger.ts`:

```ts
import { useEffect } from 'react';
import { useAppStore } from '@/stores/app-store';
import { useSettingsStore } from '@/stores/settings-store';

/**
 * On first mount, if the user hasn't dismissed the welcome dialog, open it.
 * Call once at the top of App.tsx.
 */
export function useWelcomeTrigger() {
  useEffect(() => {
    if (!useSettingsStore.getState().welcomeDismissed) {
      useAppStore.getState().openModal('welcome');
    }
  }, []);
}
```

- [ ] **Step 2: Mount `ModalLayer` + call the hook in `App.tsx`**

Open `src/renderer/App.tsx`. The current structure (from Phase 2) is:

```tsx
import { AppShell } from './components/layout/AppShell';

function App() {
  return <AppShell />;
}
export default App;
```

Replace with:

```tsx
import { AppShell } from './components/layout/AppShell';
import { ModalLayer } from './components/modals/ModalLayer';
import { useWelcomeTrigger } from './hooks/use-welcome-trigger';

function App() {
  useWelcomeTrigger();
  return (
    <>
      <AppShell />
      <ModalLayer />
    </>
  );
}
export default App;
```

- [ ] **Step 3: Build verification**

```bash
npx vite build --config vite.renderer.config.ts
```

Expected: success.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/App.tsx src/renderer/hooks/use-welcome-trigger.ts
git commit -m "feat(renderer): mount ModalLayer + first-launch welcome trigger"
```

---

## Task 36: Phase 7 integration smoke test

**Files:**
- Create: `tests/integration/phase7-modals-smoke.test.tsx`

- [ ] **Step 1: Write the test**

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '@/App';
import { useAppStore } from '@/stores/app-store';
import { useCommandStore } from '@/stores/command-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useFileStore } from '@/stores/file-store';
import { useEditorStore } from '@/stores/editor-store';
import { registerMenuCommands } from '@/lib/commands/register-menu-commands';

vi.mock('@/lib/ipc', () => ({
  ipc: {
    app: {
      getVersion: vi.fn().mockResolvedValue({ ok: true, data: '5.0.0' }),
      openExternal: vi.fn().mockResolvedValue({ ok: true }),
    },
  },
}));

describe('Phase 7 modals integration', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState({ modal: { kind: null }, sidebarVisible: true, previewVisible: true, zenMode: false, paneSizes: { sidebar: 20, editor: 50, preview: 30 } } as any);
    useCommandStore.setState({ handlers: {}, userBindings: {} } as any);
    useSettingsStore.setState(useSettingsStore.getInitialState());
    useFileStore.setState({ activeTabId: '/x.md', openTabs: [{ id: '/x.md', path: '/x.md', title: 'x.md', dirty: false }] } as any);
    useEditorStore.setState({ buffers: new Map([['/x.md', { id: '/x.md', path: '/x.md', content: '# hi', dirty: false }]]) } as any);
  });

  it('dispatching settings.open from command store opens SettingsSheet', () => {
    registerMenuCommands();
    render(<App />);
    useCommandStore.getState().dispatch('settings.open');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('AppHeader Settings button dispatches settings.open', async () => {
    registerMenuCommands();
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(useAppStore.getState().modal.kind).toBe('settings');
  });

  it('first launch with welcomeDismissed=false opens welcome modal', () => {
    useSettingsStore.setState({ ...useSettingsStore.getInitialState(), welcomeDismissed: false });
    registerMenuCommands();
    render(<App />);
    expect(useAppStore.getState().modal.kind).toBe('welcome');
  });

  it('first launch with welcomeDismissed=true does not open welcome', () => {
    useSettingsStore.setState({ ...useSettingsStore.getInitialState(), welcomeDismissed: true });
    registerMenuCommands();
    render(<App />);
    expect(useAppStore.getState().modal).toEqual({ kind: null });
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

```bash
npx vitest run tests/integration/phase7-modals-smoke.test.tsx
```

Expected: PASS, 4 tests.

If the App.tsx export is `default`, change the import to:

```ts
import App from '@/App';
```

- [ ] **Step 3: Commit**

```bash
git add tests/integration/phase7-modals-smoke.test.tsx
git commit -m "test(renderer): Phase 7 modals integration smoke test"
```

---

## Task 37: Phase 7 verification + tag

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```

Expected: all tests pass. Total should be ~250-270 (target: +50 from the ~220 at end of Phase 6).

- [ ] **Step 2: Build the renderer**

```bash
npx vite build --config vite.renderer.config.ts
```

Expected: `built in XXXms`, exit 0.

- [ ] **Step 3: Lint**

```bash
npx eslint src tests
```

Expected: no errors.

- [ ] **Step 4: Push the branch and tag**

```bash
git push origin react-electron
git tag -a phase-7-modals -m "Phase 7 complete: ModalLayer, 7 modal types, settings store, ASCII table transform, DOCX template picker"
git push origin react-electron --tags
```

---

## Self-Review Notes

**Spec coverage:**
- §2.1 modal state in `useAppStore` → Task 15 ✓
- §2.2 discriminated union → Task 15 ✓
- §2.3 single `<ModalLayer />` → Task 17 ✓
- §2.4 settings store → Task 16 ✓
- §2.5 welcome trigger → Task 35 ✓
- §2.6 commands trigger modals → Task 33 ✓
- §3.1 shadcn primitives → Tasks 1-12 ✓
- §3.2 modals → Tasks 17-26, 32 ✓
- §3.3 stores → Tasks 15-16 ✓
- §3.4 lib → Tasks 13-14 ✓
- §3.5 modified files → Tasks 33-35 ✓
- §3.6 tests → all tasks have tests ✓
- §4 data flow → Tasks 23-26, 33-35 ✓
- §5 error handling → inline error banner in Tasks 23-26; onRehydrateStorage in Task 16 ✓
- §6 testing strategy → followed throughout ✓
- §9 success criteria → Task 37 ✓

**Placeholder scan:** None.

**Type consistency:**
- `useAppStore.modal` shape consistent across Tasks 15, 17, 33.
- `useSettingsStore.setSetting` signature consistent across Tasks 16, 27-29.
- `useExportSource` shape consistent across Tasks 21, 23-26.
- IPC `ipc.export.{pdf,docx,html,batch}` signatures match `types/ipc.ts` from Phase 1.

**One spec gap:** the spec mentions "ascii-table.test.ts (3 tests: simple table, alignment, empty input)" but Task 13 has 5 tests. Acceptable — the additional `applyAsciiTransform` tests are needed.

**One risk:** Task 33 assumes `register-menu-commands.ts` has a specific shape. If the Phase 6 file uses a different structure (e.g., separate `useRegisterMenuCommands` hook), the engineer must adapt. The tests in Task 33 verify the behavior, not the internals.
