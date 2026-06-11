import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';

interface Props {
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitLabel: string;
  submitDisabled?: boolean;
}

export function ExportDialogFooter({
  onCancel,
  onSubmit,
  submitting,
  submitLabel,
  submitDisabled,
}: Props) {
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
