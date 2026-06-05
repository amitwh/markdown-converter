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