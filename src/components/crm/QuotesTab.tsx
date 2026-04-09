import { cn } from '@/lib/utils';
import { type Quote, type QuoteStatus } from '@/lib/crm-utils';
import { Pencil, Trash2, Send, Eye } from 'lucide-react';

const STATUS_STYLES: Record<QuoteStatus, { label: string; style: string }> = {
  draft: { label: 'Borrador', style: 'bg-muted text-muted-foreground' },
  sent: { label: 'Enviada', style: 'bg-primary/15 text-primary' },
  accepted: { label: 'Aceptada', style: 'bg-success/15 text-success' },
  rejected: { label: 'Rechazada', style: 'bg-destructive/15 text-destructive' },
  expired: { label: 'Expirada', style: 'bg-warning/15 text-warning' },
};

interface QuotesTabProps {
  quotes: Quote[];
  onNew: () => void;
  onEdit: (q: Quote) => void;
  onDelete: (q: Quote) => void;
}

export function QuotesTab({ quotes, onNew, onEdit, onDelete }: QuotesTabProps) {
  const totalPending = quotes.filter(q => q.status === 'sent').reduce((s, q) => s + Number(q.total_usd), 0);
  const totalAccepted = quotes.filter(q => q.status === 'accepted').reduce((s, q) => s + Number(q.total_usd), 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-card border border-border p-2.5 text-center">
          <p className="text-lg font-bold text-primary">${totalPending >= 1000 ? (totalPending / 1000).toFixed(0) + 'K' : totalPending.toFixed(0)}</p>
          <p className="text-[9px] text-muted-foreground">Pendientes</p>
        </div>
        <div className="rounded-xl bg-card border border-border p-2.5 text-center">
          <p className="text-lg font-bold text-success">${totalAccepted >= 1000 ? (totalAccepted / 1000).toFixed(0) + 'K' : totalAccepted.toFixed(0)}</p>
          <p className="text-[9px] text-muted-foreground">Aceptadas</p>
        </div>
      </div>

      {quotes.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No hay cotizaciones aún</p>}
      {quotes.map(q => {
        const sts = STATUS_STYLES[q.status] || STATUS_STYLES.draft;
        return (
          <div key={q.id} className="rounded-xl bg-card border border-border p-3 space-y-1.5">
            <div className="flex justify-between items-start">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{q.quote_number}</p>
                  <span className={cn('px-1.5 py-0.5 rounded-full text-[9px] font-semibold', sts.style)}>{sts.label}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{q.contacts?.contact_name} · {q.contacts?.company_name || ''}</p>
              </div>
              <div className="flex items-center gap-1 ml-2">
                <button onClick={() => onEdit(q)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"><Pencil className="w-3 h-3" /></button>
                <button onClick={() => onDelete(q)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
            <div className="flex gap-4 text-[10px] text-muted-foreground">
              <span>Subtotal: ${Number(q.subtotal_usd).toLocaleString()}</span>
              <span>ITBIS: ${Number(q.itbis_usd).toLocaleString()}</span>
              <span className="text-foreground font-semibold">Total: ${Number(q.total_usd).toLocaleString()}</span>
            </div>
            {q.valid_until && (
              <p className="text-[9px] text-muted-foreground">Válida hasta: {new Date(q.valid_until).toLocaleDateString('es-DO')}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
