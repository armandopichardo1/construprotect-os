import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';

interface ProductDeleteDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product: { id: string; name: string; sku: string } | null;
  onSuccess: () => void;
}

export function ProductDeleteDialog({ open, onOpenChange, product, onSuccess }: ProductDeleteDialogProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!product) return;
    setDeleting(true);
    // Soft delete — mark as inactive
    const { error } = await supabase.from('products').update({ is_active: false }).eq('id', product.id);
    setDeleting(false);
    if (error) { toast.error('Error al eliminar producto'); return; }
    toast.success('Producto eliminado');
    onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle className="text-base">Eliminar producto</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-destructive/10"><AlertTriangle className="w-5 h-5 text-destructive" /></div>
            <p className="text-sm text-muted-foreground">
              ¿Eliminar <strong className="text-foreground">{product?.name}</strong> ({product?.sku})? El producto se desactivará y dejará de aparecer en la lista.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 rounded-xl text-xs">Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="flex-1 rounded-xl text-xs">{deleting ? 'Eliminando...' : 'Eliminar'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
