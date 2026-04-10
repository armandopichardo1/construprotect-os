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

const LABEL_MAP = { contact: 'contacto', deal: 'deal', activity: 'actividad', quote: 'cotización' };

export function CrmDeleteDialog({ open, onOpenChange, type, item, queryClient }: CrmDeleteDialogProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!item) return;
    setDeleting(true);
    try {
      if (type === 'contact') {
        // Cascade: delete activities, deals, quotes linked to this contact
        await supabase.from('activities').delete().eq('contact_id', item.id);
        // Delete quote_items for quotes of this contact
        const { data: contactQuotes } = await supabase.from('quotes').select('id').eq('contact_id', item.id);
        if (contactQuotes && contactQuotes.length > 0) {
          for (const q of contactQuotes) {
            await supabase.from('quote_items').delete().eq('quote_id', q.id);
          }
          await supabase.from('quotes').delete().eq('contact_id', item.id);
        }
        await supabase.from('deals').delete().eq('contact_id', item.id);
        const { error } = await supabase.from('contacts').delete().eq('id', item.id);
        if (error) throw error;
      } else if (type === 'deal') {
        // Cascade: delete activities linked to this deal
        await supabase.from('activities').delete().eq('deal_id', item.id);
        // Delete quotes linked to this deal
        const { data: dealQuotes } = await supabase.from('quotes').select('id').eq('deal_id', item.id);
        if (dealQuotes && dealQuotes.length > 0) {
          for (const q of dealQuotes) {
            await supabase.from('quote_items').delete().eq('quote_id', q.id);
          }
          await supabase.from('quotes').delete().eq('deal_id', item.id);
        }
        const { error } = await supabase.from('deals').delete().eq('id', item.id);
        if (error) throw error;
      } else if (type === 'quote') {
        await supabase.from('quote_items').delete().eq('quote_id', item.id);
        const { error } = await supabase.from('quotes').delete().eq('id', item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('activities').delete().eq('id', item.id);
        if (error) throw error;
      }

      const label = LABEL_MAP[type];
      toast.success(`${label.charAt(0).toUpperCase() + label.slice(1)} eliminado`);
      queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
      queryClient.invalidateQueries({ queryKey: ['crm-deals'] });
      queryClient.invalidateQueries({ queryKey: ['crm-activities'] });
      queryClient.invalidateQueries({ queryKey: ['crm-quotes'] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(`Error al eliminar: ${e.message || 'Error desconocido'}`);
    } finally {
      setDeleting(false);
    }
  };

  const name = type === 'contact' ? item?.contact_name : type === 'deal' ? item?.title : type === 'quote' ? item?.quote_number : item?.title;

  const warningMessages: Record<string, string> = {
    contact: 'Se eliminarán todos los deals, actividades y cotizaciones asociados a este contacto.',
    deal: 'Se eliminarán todas las actividades y cotizaciones asociadas a este deal.',
    quote: 'Se eliminarán todos los ítems de esta cotización.',
    activity: '',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-base">Confirmar eliminación</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-full bg-destructive/10 shrink-0"><AlertTriangle className="w-5 h-5 text-destructive" /></div>
            <div className="space-y-1">
              <p className="text-sm text-foreground font-medium">
                ¿Eliminar {LABEL_MAP[type]} "{name}"?
              </p>
              {warningMessages[type] && (
                <p className="text-xs text-muted-foreground">{warningMessages[type]}</p>
              )}
              <p className="text-xs text-destructive font-medium">Esta acción no se puede deshacer.</p>
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
