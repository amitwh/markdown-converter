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
