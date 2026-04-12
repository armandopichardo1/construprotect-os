import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatUSD } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { History, ChevronDown, ChevronUp, User, Calendar } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function PhysicalCountHistoryDialog({ open, onOpenChange }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: counts = [] } = useQuery({
    queryKey: ['physical-counts-history'],
    queryFn: async () => {
      const { data } = await supabase
        .from('physical_counts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      return data || [];
    },
    enabled: open,
  });

  const { data: expandedItems = [] } = useQuery({
    queryKey: ['physical-count-items', expandedId],
    queryFn: async () => {
      if (!expandedId) return [];
      const { data } = await supabase
        .from('physical_count_items')
        .select('*')
        .eq('physical_count_id', expandedId)
        .order('sku');
      return data || [];
    },
    enabled: !!expandedId,
  });

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5" /> Historial de Conteos Físicos
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto rounded-lg border border-border bg-card min-h-0">
          {counts.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              No hay conteos físicos registrados
            </p>
          ) : (
            <div className="divide-y divide-border">
              {counts.map((c: any) => (
                <div key={c.id}>
                  <button
                    onClick={() => toggleExpand(c.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium flex items-center gap-1 text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          {new Date(c.created_at).toLocaleDateString('es-DO', {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </span>
                        <span className="text-xs flex items-center gap-1 text-muted-foreground">
                          <User className="w-3 h-3" />
                          {c.performed_by_name || 'Sistema'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="secondary" className="text-[10px]">
                          {c.total_products_counted} contados
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          {c.total_differences} diferencia(s)
                        </Badge>
                        {c.total_surplus > 0 && (
                          <Badge className="text-[10px] bg-success/15 text-success border-success/30">
                            +{c.total_surplus} sobrantes
                          </Badge>
                        )}
                        {c.total_shortfall > 0 && (
                          <Badge className="text-[10px] bg-destructive/15 text-destructive border-destructive/30">
                            -{c.total_shortfall} faltantes
                          </Badge>
                        )}
                        <span className="text-[10px] font-mono text-muted-foreground">
                          Ajuste neto: {formatUSD(Number(c.net_adjustment_value_usd))}
                        </span>
                      </div>
                      {c.notes && (
                        <p className="text-[10px] text-muted-foreground mt-1 truncate">{c.notes}</p>
                      )}
                    </div>
                    {expandedId === c.id ? (
                      <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                  </button>

                  {expandedId === c.id && (
                    <div className="px-4 pb-3">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px]">SKU</TableHead>
                            <TableHead className="text-[10px]">Producto</TableHead>
                            <TableHead className="text-[10px] text-center">Sistema</TableHead>
                            <TableHead className="text-[10px] text-center">Conteo</TableHead>
                            <TableHead className="text-[10px] text-center">Diferencia</TableHead>
                            <TableHead className="text-[10px] text-right">Valor Ajuste</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {expandedItems.map((item: any) => (
                            <TableRow key={item.id}>
                              <TableCell className="text-[10px] font-mono text-muted-foreground py-1.5">{item.sku}</TableCell>
                              <TableCell className="text-[10px] font-medium py-1.5 truncate max-w-[180px]">{item.product_name}</TableCell>
                              <TableCell className="text-[10px] text-center font-mono py-1.5">{item.system_qty}</TableCell>
                              <TableCell className="text-[10px] text-center font-mono py-1.5">{item.counted_qty}</TableCell>
                              <TableCell className="text-center py-1.5">
                                <span className={cn('text-[10px] font-bold font-mono',
                                  item.difference > 0 ? 'text-success' : 'text-destructive')}>
                                  {item.difference > 0 ? '+' : ''}{item.difference}
                                </span>
                              </TableCell>
                              <TableCell className="text-[10px] text-right font-mono text-muted-foreground py-1.5">
                                {formatUSD(Number(item.adjustment_value_usd))}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {expandedItems.length === 0 && (
                        <p className="text-center text-[10px] text-muted-foreground py-3">Cargando detalle...</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
