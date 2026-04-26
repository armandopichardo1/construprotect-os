import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/lib/format';
import { fetchAccounts, findTransitAccount, findInventoryAccount, findCxPAccount, findFreightAccount, findCustomsAccount } from '@/lib/accounting-utils';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ShipmentDialog } from './ShipmentDialog';
import { ShipmentPaymentDialog } from './ShipmentPaymentDialog';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, PackageCheck, CreditCard, BookPlus, AlertTriangle } from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';

const STATUS_STEPS = ['ordered', 'in_transit', 'customs', 'warehouse', 'received'];
const STATUS_LABELS: Record<string, string> = { ordered: 'Ordenado', in_transit: 'Tránsito', customs: 'Aduanas', warehouse: 'Almacén', received: 'Recibido' };
const PAYMENT_LABELS: Record<string, string> = { pending: 'Pendiente', paid: 'Pagado', partial: 'Parcial' };
const PAYMENT_COLORS: Record<string, string> = { pending: 'bg-amber-500/15 text-amber-400', paid: 'bg-emerald-500/15 text-emerald-400', partial: 'bg-blue-500/15 text-blue-400' };

export function ShipmentsTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editShipment, setEditShipment] = useState<any>(null);
  const [deleteShipment, setDeleteShipment] = useState<any>(null);
  const [payShipment, setPayShipment] = useState<any>(null);

  const { data: shipments = [] } = useQuery({
    queryKey: ['shipments'],
    queryFn: async () => {
      const { data } = await supabase.from('shipments').select('*, shipment_items(*, products(name, sku))').order('created_at', { ascending: false });
      return data || [];
    },
  });

  // Detección de asientos contables existentes por shipment.
  // Como ShipmentDialog/receiveShipment no setean reference_id, hacemos match por
  // texto en `description` (PO number o id slice). Es heurístico pero confiable porque
  // las descripciones siguen un patrón fijo.
  const { data: shipmentJournals = {} } = useQuery({
    queryKey: ['shipments-journal-map', shipments.map((s: any) => s.id).join(',')],
    enabled: shipments.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('journal_entries')
        .select('id, description, total_debit_usd');
      const map: Record<string, { purchase: boolean; freight: boolean; customs: boolean; receipt: boolean }> = {};
      shipments.forEach((s: any) => {
        const tag = s.po_number || s.id.slice(0, 8);
        const matches = (data || []).filter((j: any) => (j.description || '').includes(tag));
        map[s.id] = {
          purchase: matches.some((j: any) => /^Compra —/i.test(j.description)),
          freight: matches.some((j: any) => /^Freight —/i.test(j.description)),
          customs: matches.some((j: any) => /^Gastos aduanales —/i.test(j.description)),
          receipt: matches.some((j: any) => /^Recepción inventario —/i.test(j.description)),
        };
      });
      return map;
    },
  });

  /** Detecta qué asientos faltan y los crea. Solo para envíos con costos > 0. */
  const regenerateJournals = async (shipment: any) => {
    const items = shipment.shipment_items || [];
    const productCost = items.reduce((s: number, i: any) => s + Number(i.unit_cost_usd || 0) * Number(i.quantity_ordered || 0), 0);
    const freightVal = Number(shipment.shipping_cost_usd || 0);
    const customsVal = Number(shipment.customs_cost_usd || 0);
    const tag = shipment.po_number || shipment.id.slice(0, 8);
    const status = shipmentJournals[shipment.id] || { purchase: false, freight: false, customs: false, receipt: false };

    const toCreate: string[] = [];
    if (productCost > 0 && !status.purchase) toCreate.push('compra');
    if (freightVal > 0 && !status.freight) toCreate.push('flete');
    if (customsVal > 0 && !status.customs) toCreate.push('aduanas');
    if (shipment.status === 'received' && productCost > 0 && !status.receipt) toCreate.push('recepción');

    if (toCreate.length === 0) {
      toast.info('Todos los asientos ya existen para este envío', {
        description: 'No hay nada que generar. Revisa el Libro Diario filtrando por el PO.',
      });
      return;
    }

    try {
      const accounts = await fetchAccounts();
      const transitAcct = findTransitAccount(accounts);
      const cxpAcct = findCxPAccount(accounts);
      const freightAcct = findFreightAccount(accounts);
      const customsAcct = findCustomsAccount(accounts);
      const invAcct = findInventoryAccount(accounts);

      const created: string[] = [];

      // 1. Compra: Compras en Tránsito DR / CxP CR
      if (toCreate.includes('compra') && transitAcct && cxpAcct) {
        const desc = `Compra — PO ${tag} — ${shipment.supplier_name}`;
        const { data: entry } = await supabase.from('journal_entries').insert({
          description: desc, total_debit_usd: productCost, total_credit_usd: productCost,
          notes: `Generado manualmente desde Envíos. Costo de productos.`,
        }).select().single();
        if (entry) {
          await supabase.from('journal_entry_lines').insert([
            { journal_entry_id: entry.id, account_id: transitAcct.id, debit_usd: productCost, credit_usd: 0, description: 'Compras en tránsito' },
            { journal_entry_id: entry.id, account_id: cxpAcct.id, debit_usd: 0, credit_usd: productCost, description: 'Obligación con proveedor' },
          ]);
          created.push(`Compra ${formatUSD(productCost)}`);
        }
      }

      // 2. Flete
      if (toCreate.includes('flete') && freightAcct && cxpAcct) {
        const desc = `Freight — PO ${tag} — ${shipment.supplier_name}`;
        const { data: entry } = await supabase.from('journal_entries').insert({
          description: desc, total_debit_usd: freightVal, total_credit_usd: freightVal,
          notes: `Generado manualmente desde Envíos. Flete.`,
        }).select().single();
        if (entry) {
          await supabase.from('journal_entry_lines').insert([
            { journal_entry_id: entry.id, account_id: freightAcct.id, debit_usd: freightVal, credit_usd: 0, description: 'Freight / Shipping' },
            { journal_entry_id: entry.id, account_id: cxpAcct.id, debit_usd: 0, credit_usd: freightVal, description: 'Obligación flete' },
          ]);
          created.push(`Flete ${formatUSD(freightVal)}`);
        }
      }

      // 3. Aduanas
      if (toCreate.includes('aduanas') && customsAcct && cxpAcct) {
        const desc = `Gastos aduanales — PO ${tag} — ${shipment.supplier_name}`;
        const { data: entry } = await supabase.from('journal_entries').insert({
          description: desc, total_debit_usd: customsVal, total_credit_usd: customsVal,
          notes: `Generado manualmente desde Envíos. DGA / Aduanas.`,
        }).select().single();
        if (entry) {
          await supabase.from('journal_entry_lines').insert([
            { journal_entry_id: entry.id, account_id: customsAcct.id, debit_usd: customsVal, credit_usd: 0, description: 'Impuestos DGA / Aduanas' },
            { journal_entry_id: entry.id, account_id: cxpAcct.id, debit_usd: 0, credit_usd: customsVal, description: 'Obligación aduanal' },
          ]);
          created.push(`Aduanas ${formatUSD(customsVal)}`);
        }
      }

      // 4. Recepción: cierra Compras en Tránsito y carga Inventario (solo si ya recibido)
      if (toCreate.includes('recepción') && invAcct && transitAcct && invAcct.id !== transitAcct.id) {
        const totalRecv = items.reduce((s: number, i: any) => s + Number(i.unit_cost_usd || 0) * Number(i.quantity_ordered || 0), 0);
        const desc = `Recepción inventario — PO ${tag} — ${shipment.supplier_name}`;
        const { data: entry } = await supabase.from('journal_entries').insert({
          description: desc, total_debit_usd: totalRecv, total_credit_usd: totalRecv,
          notes: `Generado manualmente. Cierre de compras en tránsito.`,
        }).select().single();
        if (entry) {
          await supabase.from('journal_entry_lines').insert([
            { journal_entry_id: entry.id, account_id: invAcct.id, debit_usd: totalRecv, credit_usd: 0, description: 'Inventario recibido' },
            { journal_entry_id: entry.id, account_id: transitAcct.id, debit_usd: 0, credit_usd: totalRecv, description: 'Cierre compras en tránsito' },
          ]);
          created.push(`Recepción ${formatUSD(totalRecv)}`);
        }
      }

      if (created.length === 0) {
        toast.error('No se pudo generar ningún asiento', {
          description: 'Faltan cuentas en el catálogo (Compras en Tránsito, CxP, Flete, Aduanas o Inventarios).',
        });
        return;
      }

      toast.success(`Asientos generados (${created.length})`, { description: created.join(' · ') });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['shipments-journal-map'] });
    } catch (e: any) {
      console.error('Error regenerando asientos:', e);
      toast.error('Error al generar asientos', { description: e.message });
    }
  };

  const handleDelete = async () => {
    if (!deleteShipment) return;
    await supabase.from('shipment_items').delete().eq('shipment_id', deleteShipment.id);
    const { error } = await supabase.from('shipments').delete().eq('id', deleteShipment.id);
    if (error) { toast.error('Error'); throw error; }
    toast.success('Envío eliminado');
    queryClient.invalidateQueries({ queryKey: ['shipments'] });
  };

  /** Receive shipment: update inventory, WAC, and generate receipt journal entry */
  const receiveShipment = async (shipment: any) => {
    const items = shipment.shipment_items || [];
    if (items.length === 0) { toast.error('Sin productos para recibir'); return; }

    for (const item of items) {
      if (!item.product_id) continue;
      const qty = item.quantity_ordered;
      const newItemCost = Number(item.unit_cost_usd || 0);

      const { data: inv } = await supabase.from('inventory').select('id, quantity_on_hand').eq('product_id', item.product_id).maybeSingle();
      const existingQty = inv ? inv.quantity_on_hand : 0;

      const { data: prod } = await supabase.from('products').select('unit_cost_usd, price_list_usd, price_architect_usd, price_project_usd, price_wholesale_usd').eq('id', item.product_id).single();
      const currentCost = Number(prod?.unit_cost_usd || 0);

      const totalQty = existingQty + qty;
      const newWAC = totalQty > 0
        ? ((existingQty * currentCost) + (qty * newItemCost)) / totalQty
        : newItemCost;

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

      if (inv) {
        await supabase.from('inventory').update({ quantity_on_hand: existingQty + qty }).eq('id', inv.id);
      } else {
        await supabase.from('inventory').insert({ product_id: item.product_id, quantity_on_hand: qty });
      }

      await supabase.from('inventory_movements').insert({
        product_id: item.product_id, quantity: qty, movement_type: 'receipt',
        unit_cost_usd: newItemCost, reference_id: shipment.id, reference_type: 'shipment',
        notes: `Recepción PO ${shipment.po_number || shipment.id.slice(0, 8)}`,
      });
    }

    await supabase.from('shipments').update({ status: 'received' as any, actual_arrival: new Date().toISOString().split('T')[0] }).eq('id', shipment.id);
    for (const item of items) {
      await supabase.from('shipment_items').update({ quantity_received: item.quantity_ordered }).eq('id', item.id);
    }

    // Receipt journal entry: Debit Inventory, Credit Inventory in Transit (close in-transit)
    const totalCost = items.reduce((s: number, i: any) => s + (Number(i.unit_cost_usd || 0) * Number(i.quantity_ordered || 0)), 0);
    if (totalCost > 0) {
      try {
        const accounts = await fetchAccounts();
        const invAcct = findInventoryAccount(accounts);
        const transitAcct = findTransitAccount(accounts);

        if (invAcct && transitAcct && invAcct.id !== transitAcct.id) {
          const desc = `Recepción inventario — PO ${shipment.po_number || shipment.id.slice(0, 8)} — ${shipment.supplier_name}`;
          const { data: entry } = await supabase.from('journal_entries').insert({
            description: desc,
            total_debit_usd: totalCost,
            total_credit_usd: totalCost,
            notes: `Cierre de compra en tránsito. Productos: ${items.map((i: any) => `${i.products?.name || i.product_id} x${i.quantity_ordered}`).join(', ')}`,
          }).select().single();

          if (entry) {
            await supabase.from('journal_entry_lines').insert([
              { journal_entry_id: entry.id, account_id: invAcct.id, debit_usd: totalCost, credit_usd: 0, description: 'Inventario recibido' },
              { journal_entry_id: entry.id, account_id: transitAcct.id, debit_usd: 0, credit_usd: totalCost, description: 'Cierre compras en tránsito' },
            ]);
          }
        } else if (invAcct) {
          // Fallback: if no separate transit account
          const cxpAcct = findCxPAccount(accounts);
          if (cxpAcct) {
            const desc = `Recepción inventario — PO ${shipment.po_number || shipment.id.slice(0, 8)} — ${shipment.supplier_name}`;
            const { data: entry } = await supabase.from('journal_entries').insert({
              description: desc,
              total_debit_usd: totalCost,
              total_credit_usd: totalCost,
              notes: `Recepción de mercancía.`,
            }).select().single();

            if (entry) {
              await supabase.from('journal_entry_lines').insert([
                { journal_entry_id: entry.id, account_id: invAcct.id, debit_usd: totalCost, credit_usd: 0, description: 'Recepción mercancía' },
                { journal_entry_id: entry.id, account_id: cxpAcct.id, debit_usd: 0, credit_usd: totalCost, description: 'Obligación por compra' },
              ]);
            }
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
          const payStatus = s.payment_status || 'pending';
          const totalCostPO = Number(s.total_cost_usd || 0);
          const paidAmount = Number(s.amount_paid_usd || 0);
          const pendingBalance = totalCostPO - paidAmount;
          return (
            <div key={s.id} className="rounded-2xl bg-card border border-border p-5 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-semibold text-foreground">{s.po_number || s.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">{s.supplier_name}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  {/* Payment badge */}
                  <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', PAYMENT_COLORS[payStatus] || PAYMENT_COLORS.pending)}>
                    {PAYMENT_LABELS[payStatus] || payStatus}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {itemCount} ítems · {formatUSD(totalCostPO)}
                    {payStatus === 'partial' && (
                      <span className="ml-1 text-[10px] text-amber-400">(saldo: {formatUSD(pendingBalance)})</span>
                    )}
                  </span>
                  {s.estimated_arrival && <span className="text-xs text-primary font-medium">ETA: {s.estimated_arrival}</span>}
                  <div className="flex gap-1">
                    {payStatus !== 'paid' && (
                      <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={() => setPayShipment(s)}>
                        <CreditCard className="w-3 h-3" /> {payStatus === 'partial' ? 'Abonar' : 'Pagar'}
                      </Button>
                    )}
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
      <ShipmentPaymentDialog open={!!payShipment} onOpenChange={v => { if (!v) setPayShipment(null); }} shipment={payShipment} />
      <DeleteConfirmDialog open={!!deleteShipment} onOpenChange={v => { if (!v) setDeleteShipment(null); }}
        title="Eliminar envío" description={`¿Eliminar el envío ${deleteShipment?.po_number || ''}? Esta acción no se puede deshacer.`}
        onConfirm={handleDelete} />
    </div>
  );
}
