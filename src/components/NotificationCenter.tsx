import { useState } from 'react';
import { useAlertHistory, type AlertHistoryRow } from '@/hooks/useAlertHistory';
import { cn } from '@/lib/utils';
import { Bell, Package, DollarSign, TrendingDown, Users, ShieldAlert, Clock, Filter, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const CATEGORY_CONFIG: Record<string, { icon: typeof Bell; label: string; color: string }> = {
  inventory: { icon: Package, label: 'Inventario', color: 'text-primary' },
  finance: { icon: DollarSign, label: 'Finanzas', color: 'text-warning' },
  margin: { icon: TrendingDown, label: 'Márgenes', color: 'text-destructive' },
  crm: { icon: Users, label: 'CRM', color: 'text-success' },
  concentration: { icon: ShieldAlert, label: 'Concentración', color: 'text-destructive' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Ahora';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString('es-DO', { month: 'short', day: 'numeric' });
}

function groupByDate(items: AlertHistoryRow[]): { label: string; items: AlertHistoryRow[] }[] {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  const groups: Record<string, AlertHistoryRow[]> = {};
  items.forEach(item => {
    const dateStr = item.fired_at.split('T')[0];
    let label: string;
    if (dateStr === todayStr) label = 'Hoy';
    else if (dateStr === yesterdayStr) label = 'Ayer';
    else label = new Date(dateStr).toLocaleDateString('es-DO', { weekday: 'long', month: 'short', day: 'numeric' });
    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  });

  return Object.entries(groups).map(([label, items]) => ({ label, items }));
}

export function NotificationCenter() {
  const { data: history = [], isLoading } = useAlertHistory(50);
  const [filter, setFilter] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const filtered = filter ? history.filter(h => h.category === filter) : history;
  const grouped = groupByDate(filtered);

  // Count recent (last 24h) unread
  const recentCount = history.filter(h => {
    const diff = Date.now() - new Date(h.fired_at).getTime();
    return diff < 86400000;
  }).length;

  const categories = [...new Set(history.map(h => h.category))];

  const clearHistory = async () => {
    const { error } = await supabase.from('alert_history').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) {
      toast.error('Error al limpiar historial');
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['alert-history'] });
    toast.success('Historial limpiado');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 relative">
          <Bell className="h-4 w-4" />
          {recentCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center">
              {recentCount > 9 ? '9+' : recentCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Notificaciones</h3>
          <div className="flex items-center gap-1">
            {history.length > 0 && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px] text-muted-foreground gap-1" onClick={clearHistory}>
                <Trash2 className="w-3 h-3" /> Limpiar
              </Button>
            )}
          </div>
        </div>

        {/* Category filters */}
        {categories.length > 1 && (
          <div className="flex items-center gap-1.5 px-4 py-2 border-b border-border overflow-x-auto">
            <button
              onClick={() => setFilter(null)}
              className={cn(
                'px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors shrink-0',
                !filter ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
              )}
            >
              Todas
            </button>
            {categories.map(cat => {
              const cfg = CATEGORY_CONFIG[cat] || { label: cat, color: 'text-muted-foreground' };
              return (
                <button
                  key={cat}
                  onClick={() => setFilter(filter === cat ? null : cat)}
                  className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors shrink-0',
                    filter === cat ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                  )}
                >
                  {cfg.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Notification list */}
        <ScrollArea className="max-h-[400px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">Cargando...</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Bell className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">Sin notificaciones</p>
            </div>
          ) : (
            <div className="py-1">
              {grouped.map(group => (
                <div key={group.label}>
                  <div className="px-4 py-1.5 sticky top-0 bg-popover/95 backdrop-blur-sm z-10">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</p>
                  </div>
                  {group.items.map(item => {
                    const cfg = CATEGORY_CONFIG[item.category] || { icon: Bell, label: item.category, color: 'text-muted-foreground' };
                    const Icon = cfg.icon;
                    return (
                      <div key={item.id} className="px-4 py-2.5 hover:bg-muted/50 transition-colors flex items-start gap-3">
                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5', 
                          item.severity === 'critical' ? 'bg-destructive/10' : 'bg-warning/10'
                        )}>
                          <Icon className={cn('w-4 h-4', item.severity === 'critical' ? 'text-destructive' : 'text-warning')} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-[11px] font-semibold text-foreground truncate">{item.label}</p>
                            <Badge variant="outline" className={cn('text-[8px] px-1 py-0 shrink-0', 
                              item.severity === 'critical' ? 'border-destructive/30 text-destructive' : 'border-warning/30 text-warning'
                            )}>
                              {item.severity === 'critical' ? 'Crítica' : 'Aviso'}
                            </Badge>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{item.message}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] text-muted-foreground/60 flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5" /> {timeAgo(item.fired_at)}
                            </span>
                            {item.alert_count > 1 && (
                              <span className="text-[9px] text-muted-foreground/60">×{item.alert_count}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        {filtered.length > 0 && (
          <div className="px-4 py-2 border-t border-border text-center">
            <p className="text-[10px] text-muted-foreground">{filtered.length} notificación(es) en total</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
