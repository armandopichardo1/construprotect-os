import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface CrmDeleteDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  type: 'contact' | 'deal' | 'activity' | 'quote';
  item: any | null;
  queryClient: any;
}

const TABLE_MAP = { contact: 'contacts', deal: 'deals', activity: 'activities', quote: 'quotes' } as const;
const LABEL_MAP = { contact: 'contacto', deal: 'deal', activity: 'actividad', quote: 'cotización' };

export function CrmDeleteDialog({ open, onOpenChange, type, item, queryClient }: CrmDeleteDialogProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!item) return;
    setDeleting(true);
    const { error } = await supabase.from(TABLE_MAP[type]).delete().eq('id', item.id);
    setDeleting(false);
    if (error) { toast.error(`Error al eliminar ${LABEL_MAP[type]}`); return; }
    toast.success(`${LABEL_MAP[type].charAt(0).toUpperCase() + LABEL_MAP[type].slice(1)} eliminado`);
    queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
    queryClient.invalidateQueries({ queryKey: ['crm-deals'] });
    queryClient.invalidateQueries({ queryKey: ['crm-activities'] });
    queryClient.invalidateQueries({ queryKey: ['crm-quotes'] });
    onOpenChange(false);
  };

  const name = type === 'contact' ? item?.contact_name : type === 'deal' ? item?.title : type === 'quote' ? item?.quote_number : item?.title;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle className="text-base">Confirmar eliminación</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-destructive/10"><AlertTriangle className="w-5 h-5 text-destructive" /></div>
            <p className="text-sm text-muted-foreground">
              ¿Eliminar <strong className="text-foreground">{name}</strong>? {type === 'contact' && 'Se eliminarán todos los deals y actividades asociados. '}Esta acción no se puede deshacer.
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
