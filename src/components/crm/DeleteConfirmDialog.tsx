import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  type: 'client' | 'opportunity';
  item: any | null;
  queryClient: any;
}

export function DeleteConfirmDialog({ open, onOpenChange, type, item, queryClient }: DeleteConfirmDialogProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!item) return;
    setDeleting(true);

    if (type === 'client') {
      // First delete related opportunities
      const { error: oppError } = await supabase
        .from('crm_opportunities')
        .delete()
        .eq('client_id', item.id);
      if (oppError) { toast.error('Error al eliminar oportunidades del cliente'); setDeleting(false); return; }

      const { error } = await supabase.from('crm_clients').delete().eq('id', item.id);
      if (error) { toast.error('Error al eliminar cliente'); setDeleting(false); return; }
      toast.success('Cliente eliminado');
      queryClient.invalidateQueries({ queryKey: ['crm-clients'] });
      queryClient.invalidateQueries({ queryKey: ['crm-opportunities'] });
    } else {
      const { error } = await supabase.from('crm_opportunities').delete().eq('id', item.id);
      if (error) { toast.error('Error al eliminar oportunidad'); setDeleting(false); return; }
      toast.success('Oportunidad eliminada');
      queryClient.invalidateQueries({ queryKey: ['crm-opportunities'] });
    }

    setDeleting(false);
    onOpenChange(false);
  };

  const name = type === 'client' ? item?.name : item?.title;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs">
        <DialogHeader><DialogTitle className="text-base">Confirmar eliminación</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-destructive/10">
              <AlertTriangle className="w-5 h-5 text-destructive" />
            </div>
            <div className="text-sm text-muted-foreground">
              {type === 'client' ? (
                <>¿Eliminar a <strong className="text-foreground">{name}</strong> y todas sus oportunidades asociadas? Esta acción no se puede deshacer.</>
              ) : (
                <>¿Eliminar la oportunidad <strong className="text-foreground">{name}</strong>? Esta acción no se puede deshacer.</>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1 rounded-xl text-xs">Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="flex-1 rounded-xl text-xs">
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
