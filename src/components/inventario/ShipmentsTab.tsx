import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShipmentDialog } from './ShipmentDialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, PackageCheck } from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';

const STATUS_STEPS = ['ordered', 'in_transit', 'customs', 'warehouse', 'received'];
const STATUS_LABELS: Record<string, string> = { ordered: 'Ordenado', in_transit: 'Tránsito', customs: 'Aduanas', warehouse: 'Almacén', received: 'Recibido' };

export function ShipmentsTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editShipment, setEditShipment] = useState<any>(null);
  const [deleteShipment, setDeleteShipment] = useState<any>(null);

  const { data: shipments = [] } = useQuery({
    queryKey: ['shipments'],
    queryFn: async () => {
      const { data } = await supabase.from('shipments').select('*, shipment_items(*, products(name, sku))').order('created_at', { ascending: false });
      return data || [];
    },
  });

  const handleDelete = async () => {
    if (!deleteShipment) return;
    await supabase.from('shipment_items').delete().eq('shipment_id', deleteShipment.id);
    const { error } = await supabase.from('shipments').delete().eq('id', deleteShipment.id);
    if (error) { toast.error('Error'); throw error; }
    toast.success('Envío eliminado');
    queryClient.invalidateQueries({ queryKey: ['shipments'] });
  };

  const receiveShipment = async (shipment: any) => {
    const items = shipment.shipment_items || [];
    if (items.length === 0) { toast.error('Sin productos para recibir'); return; }

    for (const item of items) {
      if (!item.product_id) continue;
      const qty = item.quantity_ordered;
      const newItemCost = Number(item.unit_cost_usd || 0);

      // Get current inventory qty
      const { data: inv } = await supabase.from('inventory').select('id, quantity_on_hand').eq('product_id', item.product_id).maybeSingle();
      const existingQty = inv ? inv.quantity_on_hand : 0;

      // Get current product cost for WAC calculation
      const { data: prod } = await supabase.from('products').select('unit_cost_usd, price_list_usd, price_architect_usd, price_project_usd, price_wholesale_usd').eq('id', item.product_id).single();
      const currentCost = Number(prod?.unit_cost_usd || 0);

      // Calculate Weighted Average Cost
      const totalQty = existingQty + qty;
      const newWAC = totalQty > 0
        ? ((existingQty * currentCost) + (qty * newItemCost)) / totalQty
        : newItemCost;

      // Update product cost (WAC) and recalculate margins
      const marginUpdates: Record<string, number> = { unit_cost_usd: Number(newWAC.toFixed(4)), total_unit_cost_usd: Number(newWAC.toFixed(4)) };
      if (prod) {
        const prices = [
          { price: Number(prod.price_list_usd), field: 'margin_list_pct' },
          { price: Number(prod.price_architect_usd), field: 'margin_architect_pct' },
          { price: Number(prod.price_project_usd), field: 'margin_project_pct' },
          { price: Number(prod.price_wholesale_usd), field: 'margin_wholesale_pct' },
        ];
        for (const { price, field } of prices) {
          if (price > 0) {
            marginUpdates[field] = Number((((price - newWAC) / price) * 100).toFixed(1));
          }
        }
      }
      await supabase.from('products').update(marginUpdates as any).eq('id', item.product_id);

      // Update inventory
      if (inv) {
        await supabase.from('inventory').update({ quantity_on_hand: existingQty + qty }).eq('id', inv.id);
      } else {
        await supabase.from('inventory').insert({ product_id: item.product_id, quantity_on_hand: qty });
      }

      // Create movement
      await supabase.from('inventory_movements').insert({
        product_id: item.product_id, quantity: qty, movement_type: 'receipt',
        unit_cost_usd: newItemCost, reference_id: shipment.id, reference_type: 'shipment',
        notes: `Recepción PO ${shipment.po_number || shipment.id.slice(0, 8)}`,
      });
    }

    await supabase.from('shipments').update({ status: 'received' as any, actual_arrival: new Date().toISOString().split('T')[0] }).eq('id', shipment.id);
    // Update received quantities
    for (const item of items) {
      await supabase.from('shipment_items').update({ quantity_received: item.quantity_ordered }).eq('id', item.id);
    }

    // Auto-generate journal entry for receipt
    const totalCost = items.reduce((s: number, i: any) => s + (Number(i.unit_cost_usd || 0) * Number(i.quantity_ordered || 0)), 0);
    if (totalCost > 0) {
      try {
        const desc = `Recepción inventario — PO ${shipment.po_number || shipment.id.slice(0, 8)} — ${shipment.supplier_name}`;
        
        // Fetch accounts for automatic journal entry
        const { data: accts } = await supabase.from('chart_of_accounts')
          .select('id, code, description, account_type')
          .eq('is_active', true).order('code');
        const accounts = accts || [];
        
        const invAcct = accounts.find(a => a.code?.startsWith('14') || a.code?.startsWith('13') || (a.account_type === 'Activo' && a.description?.toLowerCase().includes('inventar')));
        const cxpAcct = accounts.find(a => a.code?.startsWith('21') || a.code?.startsWith('20') || (a.account_type === 'Pasivo' && a.description?.toLowerCase().includes('pagar')));

        if (invAcct && cxpAcct) {
          const { data: entry } = await supabase.from('journal_entries').insert({
            description: desc,
            total_debit_usd: totalCost,
            total_credit_usd: totalCost,
            notes: `Auto-generado al recibir envío. Productos: ${items.map((i: any) => `${i.products?.name || i.product_id} x${i.quantity_ordered}`).join(', ')}`,
          }).select().single();

          if (entry) {
            // Debit: Inventario (increase asset), Credit: CxP (reduce liability — goods received)
            await supabase.from('journal_entry_lines').insert([
              { journal_entry_id: entry.id, account_id: invAcct.id, debit_usd: totalCost, credit_usd: 0, description: 'Recepción mercancía' },
              { journal_entry_id: entry.id, account_id: cxpAcct.id, debit_usd: 0, credit_usd: totalCost, description: 'Obligación por compra' },
            ]);
          }
        }
        queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      } catch (e) {
        console.error('Error creating receipt journal entry:', e);
      }
    }

    toast.success('Envío recibido — inventario y contabilidad actualizados');
    queryClient.invalidateQueries({ queryKey: ['shipments'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
  };

  return (
    <div className="space-y-4">
      <Button size="sm" onClick={() => { setEditShipment(null); setShowForm(true); }}><Plus className="w-3.5 h-3.5 mr-1" /> Nuevo Envío</Button>

      <div className="space-y-4">
        {shipments.map((s: any) => {
          const stepIdx = STATUS_STEPS.indexOf(s.status);
          const itemCount = s.shipment_items?.length || 0;
          return (
            <div key={s.id} className="rounded-2xl bg-card border border-border p-5 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-semibold text-foreground">{s.po_number || s.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">{s.supplier_name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {itemCount} ítems · {formatUSD(Number(s.total_cost_usd))}
                    {(Number(s.shipping_cost_usd) > 0 || Number(s.customs_cost_usd) > 0) && (
                      <span className="ml-1 text-[10px]">(envío: {formatUSD(Number(s.shipping_cost_usd || 0))}, aduana: {formatUSD(Number(s.customs_cost_usd || 0))})</span>
                    )}
                  </span>
                  {s.estimated_arrival && <span className="text-xs text-primary font-medium">ETA: {s.estimated_arrival}</span>}
                  <div className="flex gap-1">
                    {s.status !== 'received' && (
                      <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={() => receiveShipment(s)}>
                        <PackageCheck className="w-3 h-3" /> Recibir
                      </Button>
                    )}
                    <button onClick={() => { setEditShipment(s); setShowForm(true); }} className="p-1.5 rounded text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setDeleteShipment(s)} className="p-1.5 rounded text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>
              {/* Step progress */}
              <div className="flex items-center gap-1">
                {STATUS_STEPS.map((step, i) => (
                  <div key={step} className="flex-1 flex flex-col items-center gap-1">
                    <div className={cn('h-1.5 w-full rounded-full', i <= stepIdx ? 'bg-primary' : 'bg-muted')} />
                    <span className={cn('text-[9px]', i <= stepIdx ? 'text-primary font-medium' : 'text-muted-foreground')}>{STATUS_LABELS[step]}</span>
                  </div>
                ))}
              </div>
              {/* Items table */}
              {s.shipment_items && s.shipment_items.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">SKU</TableHead>
                      <TableHead className="text-[10px]">Producto</TableHead>
                      <TableHead className="text-[10px] text-right">Ordenado</TableHead>
                      <TableHead className="text-[10px] text-right">Recibido</TableHead>
                      <TableHead className="text-[10px] text-right">Costo Unit.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {s.shipment_items.map((si: any) => (
                      <TableRow key={si.id}>
                        <TableCell className="text-[10px] font-mono">{si.products?.sku || '—'}</TableCell>
                        <TableCell className="text-[10px]">{si.products?.name || '—'}</TableCell>
                        <TableCell className="text-[10px] text-right font-mono">{si.quantity_ordered}</TableCell>
                        <TableCell className="text-[10px] text-right font-mono">{si.quantity_received}</TableCell>
                        <TableCell className="text-[10px] text-right font-mono">{formatUSD(Number(si.unit_cost_usd))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          );
        })}
        {shipments.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Sin envíos registrados</p>}
      </div>

      <ShipmentDialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditShipment(null); }} editShipment={editShipment} />
      <DeleteConfirmDialog open={!!deleteShipment} onOpenChange={v => { if (!v) setDeleteShipment(null); }}
        title="Eliminar envío" description={`¿Eliminar el envío ${deleteShipment?.po_number || ''}? Esta acción no se puede deshacer.`}
        onConfirm={handleDelete} />
    </div>
  );
}
