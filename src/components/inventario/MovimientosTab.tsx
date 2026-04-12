import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';

const MOVEMENT_TYPES: Record<string, { label: string; icon: string; sign: number; desc: string }> = {
  receipt: { label: 'Entrada Manual', icon: '📥', sign: 1, desc: 'Ingreso de productos sin envío' },
  adjustment: { label: 'Ajuste', icon: '📋', sign: 0, desc: 'Corrección de conteo físico' },
  sample: { label: 'Muestra', icon: '🧱', sign: -1, desc: 'Salida por muestra a cliente' },
  return: { label: 'Devolución', icon: '🔄', sign: 1, desc: 'Entrada por devolución de cliente' },
  damage: { label: 'Daño', icon: '💥', sign: -1, desc: 'Salida por producto dañado' },
};

const FILTER_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'receipt', label: '📥 Entrada' },
  { value: 'sale', label: '💰 Venta' },
  { value: 'adjustment', label: '📋 Ajuste' },
  { value: 'sample', label: '🧱 Muestra' },
  { value: 'return', label: '🔄 Devolución' },
  { value: 'damage', label: '💥 Daño' },
];

export function MovimientosTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState('all');

  const { data: movements = [] } = useQuery({
    queryKey: ['inventory-movements-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('inventory_movements')
        .select('*, products(name, sku)')
        .order('created_at', { ascending: false })
        .limit(200);
      return data || [];
    },
  });

  const filtered = useMemo(() => {
    if (filter === 'all') return movements;
    return movements.filter((m: any) => m.movement_type === filter);
  }, [movements, filter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Nuevo Movimiento
        </Button>
        <div className="flex gap-1 flex-wrap">
          {FILTER_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setFilter(opt.value)}
              className={cn('rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                filter === opt.value ? 'bg-primary/15 text-primary border-primary/30' : 'bg-card text-muted-foreground border-border')}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden max-h-[calc(100vh-280px)] overflow-auto">
        <Table wrapperClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
            <TableRow>
              <TableHead className="text-xs">Fecha</TableHead>
              <TableHead className="text-xs">Tipo</TableHead>
              <TableHead className="text-xs">SKU</TableHead>
              <TableHead className="text-xs">Producto</TableHead>
              <TableHead className="text-xs text-right">Cantidad</TableHead>
              <TableHead className="text-xs text-right">Costo Unit.</TableHead>
              <TableHead className="text-xs">Notas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((m: any) => {
              const typeInfo = MOVEMENT_TYPES[m.movement_type] || { label: m.movement_type, icon: '📦' };
              const isPositive = m.quantity > 0;
              return (
                <TableRow key={m.id}>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(m.created_at).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: '2-digit' })}
                  </TableCell>
                  <TableCell className="text-xs">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">
                      {typeInfo.icon} {typeInfo.label || m.movement_type}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{m.products?.sku || '—'}</TableCell>
                  <TableCell className="text-xs font-medium">{m.products?.name || '—'}</TableCell>
                  <TableCell className={cn('text-xs text-right font-mono font-bold', isPositive ? 'text-success' : 'text-destructive')}>
                    {isPositive ? '+' : ''}{m.quantity}
                  </TableCell>
                  <TableCell className="text-xs text-right font-mono text-muted-foreground">
                    {m.unit_cost_usd ? formatUSD(Number(m.unit_cost_usd)) : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{m.notes || '—'}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Sin movimientos registrados</p>}
      </div>

      <MovementFormDialog open={showForm} onOpenChange={setShowForm} queryClient={queryClient} />
    </div>
  );
}

function MovementFormDialog({ open, onOpenChange, queryClient }: { open: boolean; onOpenChange: (v: boolean) => void; queryClient: any }) {
  const [form, setForm] = useState({ product_id: '', movement_type: 'receipt', quantity: '', unit_cost_usd: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ['products-active'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, name, sku, unit_cost_usd').eq('is_active', true).order('name');
      return data || [];
    },
  });

  const handleSave = async () => {
    if (!form.product_id) { toast.error('Selecciona un producto'); return; }
    const qty = Number(form.quantity);
    if (!qty || qty <= 0) { toast.error('Cantidad inválida'); return; }
    setSaving(true);

    const typeInfo = MOVEMENT_TYPES[form.movement_type];
    // For adjustments, user enters the actual new quantity — we calculate the delta
    // For others, sign determines direction
    let finalQty: number;
    if (form.movement_type === 'adjustment') {
      // Get current stock to calculate delta
      const { data: inv } = await supabase.from('inventory').select('quantity_on_hand').eq('product_id', form.product_id).maybeSingle();
      const currentQty = inv?.quantity_on_hand || 0;
      finalQty = qty - currentQty; // positive if adding, negative if removing
    } else {
      finalQty = typeInfo.sign >= 0 ? qty : -qty;
    }

    const costUsd = Number(form.unit_cost_usd) || Number(products.find(p => p.id === form.product_id)?.unit_cost_usd) || 0;

    // Insert movement
    const { error: mvError } = await supabase.from('inventory_movements').insert({
      product_id: form.product_id,
      movement_type: form.movement_type as any,
      quantity: finalQty,
      unit_cost_usd: costUsd,
      notes: form.notes.trim() || null,
    });

    if (mvError) { toast.error('Error al registrar movimiento'); setSaving(false); return; }

    // Update inventory
    const { data: inv } = await supabase.from('inventory').select('id, quantity_on_hand').eq('product_id', form.product_id).maybeSingle();
    if (inv) {
      await supabase.from('inventory').update({
        quantity_on_hand: Math.max(0, inv.quantity_on_hand + finalQty),
      }).eq('id', inv.id);
    } else {
      await supabase.from('inventory').insert({
        product_id: form.product_id,
        quantity_on_hand: Math.max(0, finalQty),
      });
    }

    // Auto-generate journal entry for inventory adjustments
    if (form.movement_type === 'adjustment' && finalQty !== 0) {
      const adjustmentValue = Math.abs(finalQty) * costUsd;
      const inventoryAccountId = '90ddec52-5cac-4217-97de-351f864a3bd3'; // 13100 Inventarios
      const adjustmentAccountId = '147bcb80-f2eb-4205-a82e-feab08b51503'; // 59900 Ajuste de Inventario
      const prodName = products.find(p => p.id === form.product_id)?.name || '';
      const desc = finalQty > 0
        ? `Ajuste inventario (sobrante): +${finalQty} ${prodName}`
        : `Ajuste inventario (faltante): ${finalQty} ${prodName}`;

      const { data: je } = await supabase.from('journal_entries').insert({
        description: desc,
        total_debit_usd: adjustmentValue,
        total_credit_usd: adjustmentValue,
        notes: form.notes.trim() || null,
      }).select('id').single();

      if (je) {
        const lines = finalQty > 0
          ? [
              { journal_entry_id: je.id, account_id: inventoryAccountId, debit_usd: adjustmentValue, credit_usd: 0, description: 'Aumento inventario por sobrante' },
              { journal_entry_id: je.id, account_id: adjustmentAccountId, debit_usd: 0, credit_usd: adjustmentValue, description: 'Ajuste de inventario' },
            ]
          : [
              { journal_entry_id: je.id, account_id: adjustmentAccountId, debit_usd: adjustmentValue, credit_usd: 0, description: 'Faltante de inventario' },
              { journal_entry_id: je.id, account_id: inventoryAccountId, debit_usd: 0, credit_usd: adjustmentValue, description: 'Reducción inventario por faltante' },
            ];
        await supabase.from('journal_entry_lines').insert(lines);
      }
    }

    setSaving(false);
    toast.success('Movimiento registrado — inventario actualizado');
    queryClient.invalidateQueries({ queryKey: ['inventory-movements-list'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
    queryClient.invalidateQueries({ queryKey: ['journal-entries-finanzas'] });
    onOpenChange(false);
    setForm({ product_id: '', movement_type: 'receipt', quantity: '', unit_cost_usd: '', notes: '' });
  };

  const selectedType = MOVEMENT_TYPES[form.movement_type];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nuevo Movimiento de Inventario</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Tipo de Movimiento</Label>
            <Select value={form.movement_type} onValueChange={v => setForm(f => ({ ...f, movement_type: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(MOVEMENT_TYPES).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.icon} {v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedType && <p className="text-[10px] text-muted-foreground mt-1">{selectedType.desc}</p>}
          </div>

          <div>
            <Label className="text-xs">Producto *</Label>
            <Select value={form.product_id} onValueChange={v => {
              const prod = products.find(p => p.id === v);
              setForm(f => ({ ...f, product_id: v, unit_cost_usd: String(prod?.unit_cost_usd || '') }));
            }}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar producto..." /></SelectTrigger>
              <SelectContent>
                {products.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.sku} — {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">
                {form.movement_type === 'adjustment' ? 'Cantidad Real (conteo físico)' : 'Cantidad'}
              </Label>
              <Input type="number" min="1" value={form.quantity}
                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">Costo Unitario USD</Label>
              <Input type="number" step="0.01" value={form.unit_cost_usd}
                onChange={e => setForm(f => ({ ...f, unit_cost_usd: e.target.value }))} className="mt-1" />
            </div>
          </div>

          <div>
            <Label className="text-xs">Notas</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="mt-1" rows={2} placeholder="Razón del movimiento..." />
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Guardando...' : 'Registrar Movimiento'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
