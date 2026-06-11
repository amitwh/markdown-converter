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
