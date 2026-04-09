import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import { formatUSD } from '@/lib/format';

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => Promise<void>;
}

export function DeleteConfirmDialog({ open, onOpenChange, title, description, onConfirm }: DeleteConfirmDialogProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // error handled by caller
    }
    setDeleting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-destructive/10 shrink-0"><AlertTriangle className="w-5 h-5 text-destructive" /></div>
            <p className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: description }} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="flex-1">{deleting ? 'Eliminando...' : 'Eliminar'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
