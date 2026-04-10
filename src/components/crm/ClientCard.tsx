import { cn } from '@/lib/utils';
import { Pencil, Trash2, MessageCircle, Phone, Mail } from 'lucide-react';

interface ClientCardProps {
  client: any;
  onEdit: (client: any) => void;
  onDelete: (client: any) => void;
}

export function ClientCard({ client, onEdit, onDelete }: ClientCardProps) {
  return (
    <div className="rounded-xl bg-card border border-border p-3">
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">{client.name}</p>
          <p className="text-[10px] text-muted-foreground">{client.company || '—'}</p>
        </div>
        <div className="flex items-center gap-1.5 ml-2">
          <span className={cn(
            'px-2 py-0.5 rounded-full text-[10px] font-semibold',
            client.status === 'active' ? 'bg-success/15 text-success' :
            client.status === 'inactive' ? 'bg-destructive/15 text-destructive' :
            'bg-primary/15 text-primary'
          )}>
            {client.status === 'active' ? 'Activo' : client.status === 'inactive' ? 'Inactivo' : 'Prospecto'}
          </span>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="flex gap-4 text-xs text-muted-foreground">
          <span>{client.deals} oportunidades</span>
          <span className="text-foreground font-medium">
            ${client.totalValue >= 1000 ? (client.totalValue / 1000).toFixed(1) + 'K' : client.totalValue}
          </span>
        </div>
        <div className="flex gap-1">
          {client.phone && (
            <a
              href={`https://wa.me/${client.phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-success hover:bg-success/10 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <MessageCircle className="w-3.5 h-3.5" />
            </a>
          )}
          <button onClick={() => onEdit(client)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onDelete(client)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
