import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Search, ClipboardCheck, Loader2 } from 'lucide-react';

interface CountRow {
  product_id: string;
  sku: string;
  name: string;
  system_qty: number;
  counted_qty: string;
  unit_cost_usd: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const INVENTORY_ACCOUNT_ID = '90ddec52-5cac-4217-97de-351f864a3bd3';
const ADJUSTMENT_ACCOUNT_ID = '147bcb80-f2eb-4205-a82e-feab08b51503';

export function BulkPhysicalCountDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<CountRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ['products-with-stock'],
    queryFn: async () => {
      const { data: prods } = await supabase
        .from('products')
        .select('id, name, sku, unit_cost_usd')
        .eq('is_active', true)
        .order('sku');
      const { data: inv } = await supabase
        .from('inventory')
        .select('product_id, quantity_on_hand');
      const invMap: Record<string, number> = {};
      (inv || []).forEach((i: any) => { invMap[i.product_id] = i.quantity_on_hand; });
      return (prods || []).map((p: any) => ({
        ...p,
        quantity_on_hand: invMap[p.id] || 0,
      }));
    },
    enabled: open,
  });

  // Initialize rows when products load
  if (open && products.length > 0 && !initialized) {
    setRows(products.map((p: any) => ({
      product_id: p.id,
      sku: p.sku,
      name: p.name,
      system_qty: p.quantity_on_hand,
      counted_qty: '',
      unit_cost_usd: Number(p.unit_cost_usd) || 0,
    })));
    setInitialized(true);
  }

  // Reset when dialog closes
  if (!open && initialized) {
    setInitialized(false);
    setRows([]);
    setSearch('');
    setNotes('');
  }

  const filteredRows = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => r.sku.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  }, [rows, search]);

  const updateCount = (productId: string, value: string) => {
    setRows(prev => prev.map(r => r.product_id === productId ? { ...r, counted_qty: value } : r));
  };

  const changedRows = useMemo(() =>
    rows.filter(r => r.counted_qty !== '' && Number(r.counted_qty) !== r.system_qty),
    [rows]
  );

  const totalDifference = useMemo(() =>
    changedRows.reduce((sum, r) => sum + (Number(r.counted_qty) - r.system_qty), 0),
    [changedRows]
  );

  const handleSave = async () => {
    if (changedRows.length === 0) {
      toast.error('No hay diferencias para registrar');
      return;
    }
    setSaving(true);

    let successCount = 0;
    let totalAdjustmentValue = 0;
    const journalLines: { account_id: string; debit_usd: number; credit_usd: number; description: string }[] = [];

    for (const row of changedRows) {
      const newQty = Number(row.counted_qty);
      const delta = newQty - row.system_qty;
      const absValue = Math.abs(delta) * row.unit_cost_usd;

      // Insert movement
      const { error: mvErr } = await supabase.from('inventory_movements').insert({
        product_id: row.product_id,
        movement_type: 'adjustment' as any,
        quantity: delta,
        unit_cost_usd: row.unit_cost_usd,
        notes: notes.trim() || `Conteo físico masivo`,
      });
      if (mvErr) continue;

      // Update inventory
      const { data: inv } = await supabase.from('inventory')
        .select('id, quantity_on_hand')
        .eq('product_id', row.product_id)
        .maybeSingle();
      if (inv) {
        await supabase.from('inventory').update({
          quantity_on_hand: Math.max(0, inv.quantity_on_hand + delta),
        }).eq('id', inv.id);
      } else {
        await supabase.from('inventory').insert({
          product_id: row.product_id,
          quantity_on_hand: Math.max(0, newQty),
        });
      }

      // Accumulate journal lines
      if (delta > 0) {
        journalLines.push(
          { account_id: INVENTORY_ACCOUNT_ID, debit_usd: absValue, credit_usd: 0, description: `Sobrante: +${delta} ${row.sku}` },
          { account_id: ADJUSTMENT_ACCOUNT_ID, debit_usd: 0, credit_usd: absValue, description: `Ajuste sobrante ${row.sku}` },
        );
      } else {
        journalLines.push(
          { account_id: ADJUSTMENT_ACCOUNT_ID, debit_usd: absValue, credit_usd: 0, description: `Faltante: ${delta} ${row.sku}` },
          { account_id: INVENTORY_ACCOUNT_ID, debit_usd: 0, credit_usd: absValue, description: `Ajuste faltante ${row.sku}` },
        );
      }

      totalAdjustmentValue += absValue;
      successCount++;
    }

    // Create single consolidated journal entry
    if (journalLines.length > 0) {
      const { data: je } = await supabase.from('journal_entries').insert({
        description: `Conteo físico masivo — ${successCount} producto(s) ajustado(s)`,
        total_debit_usd: totalAdjustmentValue,
        total_credit_usd: totalAdjustmentValue,
        notes: notes.trim() || null,
      }).select('id').single();

      if (je) {
        await supabase.from('journal_entry_lines').insert(
          journalLines.map(l => ({ ...l, journal_entry_id: je.id }))
        );
      }
    }

    setSaving(false);
    toast.success(`${successCount} producto(s) ajustado(s) — inventario y contabilidad actualizados`);
    queryClient.invalidateQueries({ queryKey: ['inventory-movements-list'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
    queryClient.invalidateQueries({ queryKey: ['journal-entries-finanzas'] });
    queryClient.invalidateQueries({ queryKey: ['products-with-stock'] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5" /> Conteo Físico Masivo
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por SKU o nombre..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 text-xs h-9"
            />
          </div>
          {changedRows.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {changedRows.length} diferencia(s) · {totalDifference > 0 ? '+' : ''}{totalDifference} uds
            </Badge>
          )}
        </div>

        <div className="flex-1 overflow-auto rounded-lg border border-border bg-card min-h-0">
          <Table wrapperClassName="overflow-visible">
            <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
              <TableRow>
                <TableHead className="text-xs w-[100px]">SKU</TableHead>
                <TableHead className="text-xs">Producto</TableHead>
                <TableHead className="text-xs text-center w-[90px]">Sistema</TableHead>
                <TableHead className="text-xs text-center w-[110px]">Conteo Real</TableHead>
                <TableHead className="text-xs text-center w-[80px]">Diferencia</TableHead>
                <TableHead className="text-xs text-right w-[90px]">Valor Ajuste</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map(row => {
                const counted = row.counted_qty !== '' ? Number(row.counted_qty) : null;
                const diff = counted !== null ? counted - row.system_qty : null;
                const adjustValue = diff !== null ? Math.abs(diff) * row.unit_cost_usd : 0;
                return (
                  <TableRow key={row.product_id} className={cn(diff !== null && diff !== 0 && 'bg-warning/5')}>
                    <TableCell className="text-xs font-mono text-muted-foreground">{row.sku}</TableCell>
                    <TableCell className="text-xs font-medium truncate max-w-[200px]">{row.name}</TableCell>
                    <TableCell className="text-xs text-center font-mono">{row.system_qty}</TableCell>
                    <TableCell className="text-center p-1">
                      <Input
                        type="number"
                        min="0"
                        value={row.counted_qty}
                        onChange={e => updateCount(row.product_id, e.target.value)}
                        placeholder="—"
                        className="h-7 text-xs text-center w-full font-mono"
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      {diff !== null && diff !== 0 ? (
                        <span className={cn('text-xs font-bold font-mono', diff > 0 ? 'text-success' : 'text-destructive')}>
                          {diff > 0 ? '+' : ''}{diff}
                        </span>
                      ) : diff === 0 ? (
                        <span className="text-xs text-muted-foreground">✓</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {diff !== null && diff !== 0 ? (
                        <span className="text-xs font-mono text-muted-foreground">{formatUSD(adjustValue)}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filteredRows.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">No se encontraron productos</p>
          )}
        </div>

        <div>
          <Textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notas del conteo (opcional)..."
            className="text-xs min-h-[40px] resize-none"
            rows={1}
          />
        </div>

        <Button onClick={handleSave} disabled={saving || changedRows.length === 0} className="w-full">
          {saving ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Procesando ajustes...</>
          ) : (
            `Aplicar ${changedRows.length} Ajuste(s)`
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
