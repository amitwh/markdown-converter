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