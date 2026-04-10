import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Trash2, Phone, MessageCircle, Mail } from 'lucide-react';

const STAGE_CONFIG: Record<string, { label: string; color: string; order: number }> = {
  prospecto: { label: 'Prospecto', color: 'bg-muted', order: 0 },
  contactado: { label: 'Contactado', color: 'bg-primary/30', order: 1 },
  cotizado: { label: 'Cotizado', color: 'bg-primary/50', order: 2 },
  negociacion: { label: 'Negociación', color: 'bg-primary/70', order: 3 },
  cerrado_ganado: { label: 'Cerrado ✅', color: 'bg-success', order: 4 },
  cerrado_perdido: { label: 'Perdido ❌', color: 'bg-destructive/50', order: 5 },
};

export { STAGE_CONFIG };

interface OppCardProps {
  opp: any;
  queryClient: any;
  onEdit: (opp: any) => void;
  onDelete: (opp: any) => void;
}

export function OppCard({ opp, queryClient, onEdit, onDelete }: OppCardProps) {
  const client = opp.crm_clients;
  const phone = client?.phone;
  const email = client?.email;

  const updateStage = async (newStage: string) => {
    const { error } = await supabase
      .from('crm_opportunities')
      .update({ stage: newStage as any })
      .eq('id', opp.id);
    if (error) { toast.error('Error al actualizar'); return; }
    queryClient.invalidateQueries({ queryKey: ['crm-opportunities'] });
    toast.success('Etapa actualizada');
  };

  return (
    <div className="rounded-xl bg-card border border-border p-3 space-y-2">
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{opp.title}</p>
          <p className="text-[10px] text-muted-foreground">
            {client?.name} · {client?.company || ''}
          </p>
        </div>
        <div className="flex items-center gap-1.5 ml-2">
          <span className="text-sm font-bold text-foreground">${Number(opp.value_usd).toLocaleString()}</span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={opp.stage} onValueChange={updateStage}>
            <SelectTrigger className="h-7 text-[10px] w-auto min-w-[120px] rounded-lg">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STAGE_CONFIG).map(([key, s]) => (
                <SelectItem key={key} value={key} className="text-xs">{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {opp.probability_pct != null && (
            <span className="text-[10px] text-muted-foreground">{opp.probability_pct}% prob.</span>
          )}
        </div>
        <div className="flex gap-1">
          {phone && (
            <a href={`tel:${phone.replace(/\D/g, '')}`} className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" onClick={e => e.stopPropagation()} title="Llamar">
              <Phone className="w-3.5 h-3.5" />
            </a>
          )}
          {phone && (
            <a href={`https://wa.me/${phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-muted-foreground hover:text-success hover:bg-success/10 transition-colors" onClick={e => e.stopPropagation()} title="WhatsApp">
              <MessageCircle className="w-3.5 h-3.5" />
            </a>
          )}
          {email && (
            <a href={`mailto:${email}`} className="p-1.5 rounded-lg text-muted-foreground hover:text-warning hover:bg-warning/10 transition-colors" onClick={e => e.stopPropagation()} title="Email">
              <Mail className="w-3.5 h-3.5" />
            </a>
          )}
          <button onClick={() => onEdit(opp)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(opp)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
