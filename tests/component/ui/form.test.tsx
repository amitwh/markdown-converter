import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useForm, FormProvider } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';

const schema = z.object({ name: z.string().min(2) });

function Harness() {
  const form = useForm<{ name: string }>({
    resolver: zodResolver(schema),
    defaultValues: { name: '' },
  });
  return (
    <FormProvider {...form}>
      <Form>
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
    </FormProvider>
  );
}

describe('Form', () => {
  it('renders a labeled form field', () => {
    render(<Harness />);
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  });
});
