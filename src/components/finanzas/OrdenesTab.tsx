import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatDOP, getGlobalExchangeRate } from '@/lib/format';
import { fetchAccounts, findTransitAccount, findInventoryAccount, findCxPAccount } from '@/lib/accounting-utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Package, ShoppingCart, ChevronRight, CalendarDays, User, FileText, PackageCheck, CreditCard, Pencil, Download, Truck, Layers, Anchor } from 'lucide-react';
import { ShipmentPaymentDialog } from '@/components/inventario/ShipmentPaymentDialog';
import { ShipmentDialog } from '@/components/inventario/ShipmentDialog';
import { ShipmentExpensesDialog } from '@/components/finanzas/ShipmentExpensesDialog';
import { SaleEditDialog } from '@/components/finanzas/SaleEditDialog';
import { exportToExcel } from '@/lib/export-utils';
import { toast } from 'sonner';

const STATUS_LABELS: Record<string, string> = {
  ordered: 'Ordenado', in_transit: 'Tránsito', customs: 'Aduanas', warehouse: 'Almacén', received: 'Recibido',
  pending: 'Pendiente', paid: 'Pagado', partial: 'Parcial', overdue: 'Vencido', cancelled: 'Cancelado',
};

const STATUS_COLORS: Record<string, string> = {
  ordered: 'bg-blue-500/15 text-blue-400', in_transit: 'bg-amber-500/15 text-amber-400', customs: 'bg-purple-500/15 text-purple-400',
  warehouse: 'bg-cyan-500/15 text-cyan-400', received: 'bg-emerald-500/15 text-emerald-400',
  pending: 'bg-amber-500/15 text-amber-400', paid: 'bg-emerald-500/15 text-emerald-400',
  partial: 'bg-blue-500/15 text-blue-400', overdue: 'bg-red-500/15 text-red-400', cancelled: 'bg-muted text-muted-foreground',
};

const PAYMENT_LABELS: Record<string, string> = { pending: 'Pendiente', paid: 'Pagado', partial: 'Parcial' };
const PAYMENT_COLORS: Record<string, string> = { pending: 'bg-amber-500/15 text-amber-400', paid: 'bg-emerald-500/15 text-emerald-400', partial: 'bg-blue-500/15 text-blue-400' };

type ViewMode = 'compras' | 'ventas';

export function OrdenesTab() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<ViewMode>('compras');
  const [detailOrder, setDetailOrder] = useState<any>(null);
  const [detailType, setDetailType] = useState<ViewMode>('compras');
  const [payShipment, setPayShipment] = useState<any>(null);
  const [editShipment, setEditShipment] = useState<any>(null);
  const [editSale, setEditSale] = useState<any>(null);
  const [editExpenses, setEditExpenses] = useState<any>(null);
  const [receiving, setReceiving] = useState(false);
  const rate = getGlobalExchangeRate();

  const { data: shipments = [] } = useQuery({
    queryKey: ['shipments-orders'],
    queryFn: async () => {
      const { data } = await supabase.from('shipments')
        .select('*, shipment_items(*, products(name, sku))')
        .order('created_at', { ascending: false });
      return data || [];
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  // Mantener el snapshot del detalle/edición sincronizado con la lista refrescada
  // (cuando el diálogo de gastos invalida la query, debe verse al instante).
  useEffect(() => {
    if (!shipments.length) return;
    if (detailOrder && detailType === 'compras') {
      const fresh = shipments.find((s: any) => s.id === detailOrder.id);
      if (fresh && fresh !== detailOrder) setDetailOrder(fresh);
    }
    if (editExpenses) {
      const fresh = shipments.find((s: any) => s.id === editExpenses.id);
      if (fresh && fresh !== editExpenses) setEditExpenses(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipments]);

  const { data: sales = [] } = useQuery({
    queryKey: ['sales-orders'],
    queryFn: async () => {
      const { data } = await supabase.from('sales')
        .select('*, contacts(contact_name, company_name), sale_items(*, products(name, sku, price_list_usd))')
        .order('date', { ascending: false });
      return data || [];
    },
  });

  const openDetail = (order: any, type: ViewMode) => {
    setDetailOrder(order);
    setDetailType(type);
  };

  /** Receive shipment: update inventory, WAC, and generate receipt journal entry */
  const receiveShipment = async (shipment: any) => {
    const items = shipment.shipment_items || [];
    if (items.length === 0) { toast.error('Sin productos para recibir'); return; }
    setReceiving(true);

    try {
      for (const item of items) {
        if (!item.product_id) continue;
        const qty = item.quantity_ordered;
        const newItemCost = Number(item.unit_cost_usd || 0);

        const { data: inv } = await supabase.from('inventory').select('id, quantity_on_hand').eq('product_id', item.product_id).maybeSingle();
        const existingQty = inv ? inv.quantity_on_hand : 0;

        const { data: prod } = await supabase.from('products').select('unit_cost_usd, price_list_usd, price_architect_usd, price_project_usd, price_wholesale_usd').eq('id', item.product_id).single();
        const currentCost = Number(prod?.unit_cost_usd || 0);

        const totalQty = existingQty + qty;
        const newWAC = totalQty > 0 ? ((existingQty * currentCost) + (qty * newItemCost)) / totalQty : newItemCost;

        const marginUpdates: Record<string, number> = { unit_cost_usd: Number(newWAC.toFixed(4)), total_unit_cost_usd: Number(newWAC.toFixed(4)) };
        if (prod) {
          const prices = [
            { price: Number(prod.price_list_usd), field: 'margin_list_pct' },
            { price: Number(prod.price_architect_usd), field: 'margin_architect_pct' },
            { price: Number(prod.price_project_usd), field: 'margin_project_pct' },
            { price: Number(prod.price_wholesale_usd), field: 'margin_wholesale_pct' },
          ];
          for (const { price, field } of prices) {
            if (price > 0) marginUpdates[field] = Number((((price - newWAC) / price) * 100).toFixed(1));
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

      // Receipt journal entry
      const totalCost = items.reduce((s: number, i: any) => s + (Number(i.unit_cost_usd || 0) * Number(i.quantity_ordered || 0)), 0);
      if (totalCost > 0) {
        try {
          const accounts = await fetchAccounts();
          const invAcct = findInventoryAccount(accounts);
          const transitAcct = findTransitAccount(accounts);

          if (invAcct && transitAcct && invAcct.id !== transitAcct.id) {
            const desc = `Recepción inventario — PO ${shipment.po_number || shipment.id.slice(0, 8)} — ${shipment.supplier_name}`;
            const { data: entry } = await supabase.from('journal_entries').insert({
              description: desc, total_debit_usd: totalCost, total_credit_usd: totalCost,
              notes: `Cierre de compra en tránsito. Productos: ${items.map((i: any) => `${i.products?.name || i.product_id} x${i.quantity_ordered}`).join(', ')}`,
            }).select().single();
            if (entry) {
              await supabase.from('journal_entry_lines').insert([
                { journal_entry_id: entry.id, account_id: invAcct.id, debit_usd: totalCost, credit_usd: 0, description: 'Inventario recibido' },
                { journal_entry_id: entry.id, account_id: transitAcct.id, debit_usd: 0, credit_usd: totalCost, description: 'Cierre compras en tránsito' },
              ]);
            }
          } else if (invAcct) {
            const cxpAcct = findCxPAccount(accounts);
            if (cxpAcct) {
              const desc = `Recepción inventario — PO ${shipment.po_number || shipment.id.slice(0, 8)} — ${shipment.supplier_name}`;
              const { data: entry } = await supabase.from('journal_entries').insert({
                description: desc, total_debit_usd: totalCost, total_credit_usd: totalCost,
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
      queryClient.invalidateQueries({ queryKey: ['shipments-orders'] });
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      // Refresh detail order
      const { data: updated } = await supabase.from('shipments').select('*, shipment_items(*, products(name, sku))').eq('id', shipment.id).single();
      if (updated) setDetailOrder(updated);
    } catch (e: any) {
      toast.error(e.message || 'Error al recibir');
    }
    setReceiving(false);
  };

  return (
    <div className="space-y-4">
      {/* Toggle */}
      <div className="flex gap-1 rounded-xl bg-muted p-1 w-fit">
        <button onClick={() => setMode('compras')}
          className={cn('rounded-lg px-4 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5',
            mode === 'compras' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
          <Package className="w-3.5 h-3.5" /> Órdenes de Compra ({shipments.length})
        </button>
        <button onClick={() => setMode('ventas')}
          className={cn('rounded-lg px-4 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5',
            mode === 'ventas' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
          <ShoppingCart className="w-3.5 h-3.5" /> Órdenes de Venta ({sales.length})
        </button>
      </div>

      {/* Purchase Orders */}
      {mode === 'compras' && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="max-h-[calc(100vh-300px)] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                <TableRow>
                  <TableHead className="text-xs">PO #</TableHead>
                  <TableHead className="text-xs">Proveedor</TableHead>
                  <TableHead className="text-xs">Fecha Orden</TableHead>
                  <TableHead className="text-xs text-center">Ítems</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="text-xs text-center">Estado</TableHead>
                  <TableHead className="text-xs text-center">Pago</TableHead>
                  <TableHead className="text-xs text-center">Acciones</TableHead>
                  <TableHead className="text-xs w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shipments.map((s: any) => {
                  const payStatus = s.payment_status || 'pending';
                  const canEditExpenses = true; // siempre permitido — recibidos usan capitalización (WAC)
                  const otherMatch = String(s.notes || '').match(/Otros \$([0-9.]+)/);
                  const hasAddons = Number(s.shipping_cost_usd || 0) + Number(s.customs_cost_usd || 0) + (otherMatch ? Number(otherMatch[1]) : 0) > 0;
                  return (
                    <TableRow key={s.id} className="cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => openDetail(s, 'compras')}>
                      <TableCell className="text-xs font-mono font-medium">{s.po_number || s.id.slice(0, 8)}</TableCell>
                      <TableCell className="text-xs">{s.supplier_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.order_date}</TableCell>
                      <TableCell className="text-xs text-center font-mono">{s.shipment_items?.length || 0}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-medium">{formatDOP(Number(s.total_cost_usd || 0) * rate)}</TableCell>
                      <TableCell className="text-xs text-center">
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_COLORS[s.status] || 'bg-muted text-muted-foreground')}>
                          {STATUS_LABELS[s.status] || s.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-center">
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', PAYMENT_COLORS[payStatus] || PAYMENT_COLORS.pending)}>
                          {PAYMENT_LABELS[payStatus] || payStatus}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-center" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm"
                          variant={hasAddons ? 'outline' : 'default'}
                          className="h-7 text-[10px] gap-1 px-2"
                          disabled={!canEditExpenses}
                          title={canEditExpenses
                            ? (hasAddons ? 'Editar flete / aduana / otros y reprorratear inventario' : 'Agregar flete / aduana / otros y prorratear al inventario')
                            : 'Envío ya recibido — no se puede editar gastos'}
                          onClick={() => setEditExpenses(s)}
                        >
                          <Truck className="w-3 h-3" />
                          {hasAddons ? 'Editar gastos' : 'Agregar gastos'}
                        </Button>
                      </TableCell>
                      <TableCell><ChevronRight className="w-3.5 h-3.5 text-muted-foreground" /></TableCell>
                    </TableRow>
                  );
                })}
                {shipments.length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">Sin órdenes de compra</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Sales Orders */}
      {mode === 'ventas' && (
        <div className="space-y-2">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => {
              const rows: any[] = [];
              sales.forEach((s: any) => {
                const ex = Number(s.exchange_rate) || rate;
                const items = s.sale_items || [];
                if (items.length === 0) {
                  rows.push({
                    Factura: s.invoice_ref || s.id.slice(0, 8),
                    Fecha: s.date,
                    Cliente: s.contacts?.contact_name || s.contacts?.company_name || '—',
                    SKU: '—', Producto: '—', Cantidad: 0,
                    'Precio Bruto USD': 0, 'Descuento %': 0, 'Descuento USD': 0,
                    'Precio Neto USD': 0, 'Costo Unit. USD': 0,
                    'Subtotal Línea USD': 0, 'Margen %': 0,
                    'Tasa Cambio': ex,
                    'Estado Pago': s.payment_status,
                  });
                  return;
                }
                items.forEach((it: any) => {
                  const qty = Number(it.quantity || 0);
                  const netUnit = Number(it.unit_price_usd || 0);
                  // Prefer stored gross; fallback to product list price; finally to net
                  const grossUnit = Number(it.gross_unit_price_usd || 0) > 0
                    ? Number(it.gross_unit_price_usd)
                    : Math.max(Number(it.products?.price_list_usd || 0), netUnit);
                  const discountAmt = Number(it.discount_amount_usd || 0) > 0
                    ? Number(it.discount_amount_usd)
                    : Math.max(0, (grossUnit - netUnit) * qty);
                  const discountPct = grossUnit > 0 ? (((grossUnit - netUnit) / grossUnit) * 100) : 0;
                  const cost = Number(it.unit_cost_usd || 0);
                  const lineTotal = Number(it.line_total_usd || 0);
                  const margin = netUnit > 0 ? ((netUnit - cost) / netUnit) * 100 : 0;
                  rows.push({
                    Factura: s.invoice_ref || s.id.slice(0, 8),
                    Fecha: s.date,
                    Cliente: s.contacts?.contact_name || s.contacts?.company_name || '—',
                    SKU: it.products?.sku || '—',
                    Producto: it.products?.name || '—',
                    Cantidad: qty,
                    'Precio Bruto USD': Number(grossUnit.toFixed(2)),
                    'Descuento %': Number(discountPct.toFixed(2)),
                    'Descuento USD': Number(discountAmt.toFixed(2)),
                    'Precio Neto USD': Number(netUnit.toFixed(2)),
                    'Costo Unit. USD': Number(cost.toFixed(2)),
                    'Subtotal Línea USD': Number(lineTotal.toFixed(2)),
                    'Margen %': Number(margin.toFixed(2)),
                    'Tasa Cambio': ex,
                    'Estado Pago': s.payment_status,
                  });
                });
              });
              if (rows.length === 0) { toast.error('Sin ventas para exportar'); return; }
              exportToExcel(rows, 'ordenes-venta-detalle', 'Detalle Ventas');
              toast.success(`${rows.length} líneas exportadas`);
            }}>
              <Download className="w-3.5 h-3.5" /> Exportar detalle
            </Button>
          </div>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="max-h-[calc(100vh-300px)] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                <TableRow>
                  <TableHead className="text-xs">Factura</TableHead>
                  <TableHead className="text-xs">Cliente</TableHead>
                  <TableHead className="text-xs">Fecha</TableHead>
                  <TableHead className="text-xs text-center">Ítems</TableHead>
                  <TableHead className="text-xs text-right">Total</TableHead>
                  <TableHead className="text-xs text-center">Pago</TableHead>
                  <TableHead className="text-xs w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales.map((s: any) => (
                  <TableRow key={s.id} className="cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => openDetail(s, 'ventas')}>
                    <TableCell className="text-xs font-mono font-medium">{s.invoice_ref || s.id.slice(0, 8)}</TableCell>
                    <TableCell className="text-xs">{s.contacts?.company_name || s.contacts?.contact_name || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.date}</TableCell>
                    <TableCell className="text-xs text-center font-mono">{s.sale_items?.length || 0}</TableCell>
                    <TableCell className="text-xs text-right font-mono font-medium">{formatDOP(Number(s.total_dop || 0) || Number(s.total_usd || 0) * rate)}</TableCell>
                    <TableCell className="text-xs text-center">
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_COLORS[s.payment_status] || 'bg-muted text-muted-foreground')}>
                        {STATUS_LABELS[s.payment_status] || s.payment_status}
                      </span>
                    </TableCell>
                    <TableCell><ChevronRight className="w-3.5 h-3.5 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))}
                {sales.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">Sin órdenes de venta</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detailOrder} onOpenChange={v => { if (!v) setDetailOrder(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {detailOrder && detailType === 'compras' && (() => {
            const payStatus = detailOrder.payment_status || 'pending';
            const totalCostUSD = Number(detailOrder.total_cost_usd || 0);
            const paidUSD = Number(detailOrder.amount_paid_usd || 0);
            const pendingUSD = totalCostUSD - paidUSD;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-base flex items-center gap-2">
                    <Package className="w-4 h-4 text-primary" />
                    Orden de Compra — {detailOrder.po_number || detailOrder.id.slice(0, 8)}
                  </DialogTitle>
                  <DialogDescription>Detalle de la orden de compra y acciones disponibles.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  {/* Action buttons */}
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" variant="outline" className="gap-1.5 text-xs"
                      onClick={() => { setEditShipment(detailOrder); setDetailOrder(null); }}>
                      <Pencil className="w-3.5 h-3.5" /> Editar Orden
                    </Button>
                    {detailOrder.status !== 'received' && (
                      <Button size="sm" variant="outline" className="gap-1.5 text-xs"
                        onClick={() => { setEditExpenses(detailOrder); setDetailOrder(null); }}>
                        <Truck className="w-3.5 h-3.5" /> Editar Gastos (Flete/Aduana)
                      </Button>
                    )}
                    {detailOrder.status !== 'received' && (detailOrder.shipment_items?.length || 0) > 0 && (
                      <Button size="sm" variant="default" className="gap-1.5 text-xs" disabled={receiving}
                        onClick={() => receiveShipment(detailOrder)}>
                        <PackageCheck className="w-3.5 h-3.5" />
                        {receiving ? 'Recibiendo...' : 'Recibir Envío'}
                      </Button>
                    )}
                    {detailOrder.status !== 'received' && (detailOrder.shipment_items?.length || 0) === 0 && (
                      <p className="text-xs text-amber-400 bg-amber-500/10 rounded-lg px-3 py-1.5">
                        ⚠️ Sin ítems — usa "Editar Orden" para agregar productos antes de recibir.
                      </p>
                    )}
                    {payStatus !== 'paid' && (
                      <Button size="sm" variant="outline" className="gap-1.5 text-xs"
                        onClick={(e) => { e.stopPropagation(); setPayShipment(detailOrder); }}>
                        <CreditCard className="w-3.5 h-3.5" />
                        {payStatus === 'partial' ? 'Abonar' : 'Registrar Pago'}
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 text-xs">
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Proveedor:</span>
                      <span className="font-medium">{detailOrder.supplier_name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">Fecha:</span>
                      <span className="font-medium">{detailOrder.order_date}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Estado:</span>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_COLORS[detailOrder.status])}>
                        {STATUS_LABELS[detailOrder.status] || detailOrder.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Pago:</span>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', PAYMENT_COLORS[payStatus] || PAYMENT_COLORS.pending)}>
                        {PAYMENT_LABELS[payStatus] || payStatus}
                      </span>
                    </div>
                    {detailOrder.estimated_arrival && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">ETA:</span>
                        <span className="font-medium text-primary">{detailOrder.estimated_arrival}</span>
                      </div>
                    )}
                    {detailOrder.actual_arrival && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Recibido:</span>
                        <span className="font-medium text-success">{detailOrder.actual_arrival}</span>
                      </div>
                    )}
                  </div>

                  {/* Costs breakdown */}
                  {(() => {
                    const otherMatch = String(detailOrder.notes || '').match(/Otros \$([0-9.]+)/);
                    const otherUSD = otherMatch ? Number(otherMatch[1]) : 0;
                    const shippingUSD = Number(detailOrder.shipping_cost_usd || 0);
                    const customsUSD = Number(detailOrder.customs_cost_usd || 0);
                    const addonsUSD = shippingUSD + customsUSD + otherUSD;
                    const landedUSD = totalCostUSD + addonsUSD;
                    return (
                      <div className="rounded-xl bg-muted/30 p-3 space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Subtotal FOB (productos)</span>
                          <span className="font-mono">{formatDOP(totalCostUSD * rate)}</span>
                        </div>
                        {shippingUSD > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">+ Flete</span>
                            <span className="font-mono">{formatDOP(shippingUSD * rate)}</span>
                          </div>
                        )}
                        {customsUSD > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">+ Aduana</span>
                            <span className="font-mono">{formatDOP(customsUSD * rate)}</span>
                          </div>
                        )}
                        {otherUSD > 0 && (
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">+ Otros gastos</span>
                            <span className="font-mono">{formatDOP(otherUSD * rate)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-xs font-semibold border-t border-border pt-1.5">
                          <span>Costo Aterrizado Total</span>
                          <span className="font-mono text-primary">{formatDOP(landedUSD * rate)}</span>
                        </div>
                        {paidUSD > 0 && (
                          <>
                            <div className="flex justify-between text-xs text-success">
                              <span>Pagado</span>
                              <span className="font-mono">{formatDOP(paidUSD * rate)}</span>
                            </div>
                            {pendingUSD > 0 && (
                              <div className="flex justify-between text-xs text-warning">
                                <span>Saldo Pendiente</span>
                                <span className="font-mono">{formatDOP(pendingUSD * rate)}</span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}

                  {/* ===== Sección: Costo Aterrizado por Producto ===== */}
                  {(detailOrder.shipment_items?.length || 0) > 0 ? (() => {
                    const items = detailOrder.shipment_items || [];
                    const otherMatch = String(detailOrder.notes || '').match(/Otros \$([0-9.]+)/);
                    const otherUSD = otherMatch ? Number(otherMatch[1]) : 0;
                    const shippingUSD = Number(detailOrder.shipping_cost_usd || 0);
                    const customsUSD = Number(detailOrder.customs_cost_usd || 0);
                    const addonsUSD = shippingUSD + customsUSD + otherUSD;

                    // El unit_cost_usd guardado YA está aterrizado (re-prorrateado al editar gastos).
                    // Para mostrar FOB hay que des-prorratearlo de forma proporcional.
                    const totalLanded = items.reduce((s: number, it: any) =>
                      s + Number(it.unit_cost_usd || 0) * Number(it.quantity_ordered || 0), 0);
                    const totalFobUSD = Math.max(0, totalLanded - addonsUSD);
                    const fobFactor = totalLanded > 0 && totalFobUSD > 0 ? totalFobUSD / totalLanded : 1;

                    const enriched = items.map((si: any) => {
                      const qty = Number(si.quantity_ordered || 0);
                      const landedUnit = Number(si.unit_cost_usd || 0);
                      const fobUnit = landedUnit * fobFactor;
                      const lineFob = fobUnit * qty;
                      const lineWeight = totalFobUSD > 0 ? lineFob / totalFobUSD : (items.length ? 1 / items.length : 0);
                      const freightShare = shippingUSD * lineWeight;
                      const customsShare = customsUSD * lineWeight;
                      const otherShare = otherUSD * lineWeight;
                      const addonShare = freightShare + customsShare + otherShare;
                      const addonUnit = qty > 0 ? addonShare / qty : 0;
                      return { si, qty, fobUnit, lineFob, freightShare, customsShare, otherShare, addonShare, addonUnit, landedUnit, lineLanded: landedUnit * qty };
                    });

                    return (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-semibold flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-primary" /> Costo Aterrizado por Producto
                          </h4>
                          <span className="text-[10px] text-muted-foreground">
                            Prorrateo por valor FOB · NIC 2
                          </span>
                        </div>

                        {addonsUSD > 0 && (
                          <div className="grid grid-cols-3 gap-2">
                            {shippingUSD > 0 && (
                              <div className="rounded-lg border border-border bg-muted/20 p-2 text-center">
                                <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                                  <Truck className="w-3 h-3" /> Flete
                                </div>
                                <div className="text-xs font-mono font-semibold mt-0.5">${shippingUSD.toFixed(2)}</div>
                              </div>
                            )}
                            {customsUSD > 0 && (
                              <div className="rounded-lg border border-border bg-muted/20 p-2 text-center">
                                <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                                  <Anchor className="w-3 h-3" /> Aduana
                                </div>
                                <div className="text-xs font-mono font-semibold mt-0.5">${customsUSD.toFixed(2)}</div>
                              </div>
                            )}
                            {otherUSD > 0 && (
                              <div className="rounded-lg border border-border bg-muted/20 p-2 text-center">
                                <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
                                  <Package className="w-3 h-3" /> Otros
                                </div>
                                <div className="text-xs font-mono font-semibold mt-0.5">${otherUSD.toFixed(2)}</div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="rounded-lg border border-border overflow-hidden overflow-x-auto">
                          <table className="w-full text-[10px]">
                            <thead className="bg-muted/40">
                              <tr>
                                <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">SKU</th>
                                <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Producto</th>
                                <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Cant.</th>
                                <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">FOB unit USD</th>
                                <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Flete</th>
                                <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Aduana</th>
                                <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Otros</th>
                                <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">+ Addon /u</th>
                                <th className="text-right px-2 py-1.5 font-medium text-primary">Aterrizado /u</th>
                                <th className="text-right px-2 py-1.5 font-medium text-primary">Total línea</th>
                              </tr>
                            </thead>
                            <tbody>
                              {enriched.map((r: any) => (
                                <tr key={r.si.id} className="border-t border-border/40">
                                  <td className="px-2 py-1.5 font-mono">{r.si.products?.sku || '—'}</td>
                                  <td className="px-2 py-1.5 truncate max-w-[160px]">{r.si.products?.name || '—'}</td>
                                  <td className="text-right px-2 py-1.5 font-mono">{r.qty}</td>
                                  <td className="text-right px-2 py-1.5 font-mono text-muted-foreground">${r.fobUnit.toFixed(4)}</td>
                                  <td className="text-right px-2 py-1.5 font-mono text-muted-foreground">${r.freightShare.toFixed(2)}</td>
                                  <td className="text-right px-2 py-1.5 font-mono text-muted-foreground">${r.customsShare.toFixed(2)}</td>
                                  <td className="text-right px-2 py-1.5 font-mono text-muted-foreground">${r.otherShare.toFixed(2)}</td>
                                  <td className="text-right px-2 py-1.5 font-mono text-muted-foreground">${r.addonUnit.toFixed(4)}</td>
                                  <td className="text-right px-2 py-1.5 font-mono font-semibold text-primary">${r.landedUnit.toFixed(4)}</td>
                                  <td className="text-right px-2 py-1.5 font-mono font-semibold text-primary">${r.lineLanded.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-muted/30 border-t-2 border-border">
                              <tr>
                                <td colSpan={3} className="px-2 py-1.5 font-semibold">Totales</td>
                                <td className="text-right px-2 py-1.5 font-mono font-semibold">${totalFobUSD.toFixed(2)}</td>
                                <td className="text-right px-2 py-1.5 font-mono font-semibold">${shippingUSD.toFixed(2)}</td>
                                <td className="text-right px-2 py-1.5 font-mono font-semibold">${customsUSD.toFixed(2)}</td>
                                <td className="text-right px-2 py-1.5 font-mono font-semibold">${otherUSD.toFixed(2)}</td>
                                <td className="text-right px-2 py-1.5 font-mono font-semibold">${addonsUSD.toFixed(2)}</td>
                                <td className="text-right px-2 py-1.5"></td>
                                <td className="text-right px-2 py-1.5 font-mono font-bold text-primary">${(totalFobUSD + addonsUSD).toFixed(2)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>

                        {addonsUSD === 0 && (
                          <p className="text-[10px] text-muted-foreground italic">
                            Esta orden aún no tiene gastos de flete/aduana/otros registrados — el costo aterrizado coincide con el FOB. Usa "Editar Gastos" para añadirlos.
                          </p>
                        )}
                      </div>
                    );
                  })() : (
                    <p className="text-xs text-muted-foreground text-center py-4">Sin ítems de detalle en esta orden.</p>
                  )}

                  {detailOrder.notes && (
                    <div className="text-xs text-muted-foreground">
                      <FileText className="w-3 h-3 inline mr-1" /> {detailOrder.notes}
                    </div>
                  )}
                </div>
              </>
            );
          })()}

          {detailOrder && detailType === 'ventas' && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-primary" />
                  Orden de Venta — {detailOrder.invoice_ref || detailOrder.id.slice(0, 8)}
                </DialogTitle>
                <DialogDescription>Detalle de la orden de venta.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {/* Action buttons */}
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs"
                    onClick={() => { setEditSale(detailOrder); setDetailOrder(null); }}>
                    <Pencil className="w-3.5 h-3.5" /> Editar Venta
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2 text-xs">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Cliente:</span>
                    <span className="font-medium">{detailOrder.contacts?.company_name || detailOrder.contacts?.contact_name || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Fecha:</span>
                    <span className="font-medium">{detailOrder.date}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Pago:</span>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', STATUS_COLORS[detailOrder.payment_status])}>
                      {STATUS_LABELS[detailOrder.payment_status] || detailOrder.payment_status}
                    </span>
                  </div>
                  {detailOrder.payment_date && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Fecha Pago:</span>
                      <span className="font-medium">{detailOrder.payment_date}</span>
                    </div>
                  )}
                </div>

                {/* Totals breakdown */}
                <div className="rounded-xl bg-muted/30 p-3 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-mono">{formatDOP(Number(detailOrder.total_dop || 0) > 0 ? Number(detailOrder.subtotal_usd || 0) * (Number(detailOrder.exchange_rate) || rate) : Number(detailOrder.subtotal_usd || 0) * rate)}</span>
                  </div>
                  {Number(detailOrder.itbis_usd) > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">ITBIS (18%)</span>
                      <span className="font-mono">{formatDOP(Number(detailOrder.itbis_usd || 0) * (Number(detailOrder.exchange_rate) || rate))}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs font-semibold border-t border-border pt-1.5">
                    <span>Total</span>
                    <span className="font-mono">{formatDOP(Number(detailOrder.total_dop) || Number(detailOrder.total_usd || 0) * rate)}</span>
                  </div>
                </div>

                {/* Items table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">SKU</TableHead>
                      <TableHead className="text-[10px]">Producto</TableHead>
                      <TableHead className="text-[10px] text-right">Cant.</TableHead>
                      <TableHead className="text-[10px] text-right">Precio Bruto</TableHead>
                      <TableHead className="text-[10px] text-right">Desc.</TableHead>
                      <TableHead className="text-[10px] text-right">Precio Neto</TableHead>
                      <TableHead className="text-[10px] text-right">Costo Unit.</TableHead>
                      <TableHead className="text-[10px] text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detailOrder.sale_items || []).map((si: any) => {
                      const netUnit = Number(si.unit_price_usd || 0);
                      const listUnit = Number(si.products?.price_list_usd || 0);
                      // Use list price as gross when it's higher than what was sold (i.e. a discount was applied).
                      // Otherwise the net price is also the gross price.
                      const grossUnit = listUnit > netUnit && listUnit > 0 ? listUnit : netUnit;
                      const discountUsd = Math.max(0, grossUnit - netUnit);
                      const discountPct = grossUnit > 0 ? (discountUsd / grossUnit) * 100 : 0;
                      const hasDiscount = discountUsd > 0.001;
                      return (
                        <TableRow key={si.id}>
                          <TableCell className="text-[10px] font-mono">{si.products?.sku || '—'}</TableCell>
                          <TableCell className="text-[10px]">{si.products?.name || '—'}</TableCell>
                          <TableCell className="text-[10px] text-right font-mono">{si.quantity}</TableCell>
                          <TableCell className={cn('text-[10px] text-right font-mono', hasDiscount && 'text-muted-foreground line-through')}>
                            {formatDOP(grossUnit * rate)}
                          </TableCell>
                          <TableCell className="text-[10px] text-right font-mono text-warning">
                            {hasDiscount ? `-${discountPct.toFixed(1)}%` : '—'}
                          </TableCell>
                          <TableCell className="text-[10px] text-right font-mono font-semibold">
                            {formatDOP(netUnit * rate)}
                          </TableCell>
                          <TableCell className="text-[10px] text-right font-mono text-muted-foreground">{formatDOP(Number(si.unit_cost_usd || 0) * rate)}</TableCell>
                          <TableCell className="text-[10px] text-right font-mono font-medium">{formatDOP(Number(si.line_total_usd || 0) * rate)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>

                {detailOrder.notes && (
                  <div className="text-xs text-muted-foreground">
                    <FileText className="w-3 h-3 inline mr-1" /> {detailOrder.notes}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <ShipmentPaymentDialog 
        open={!!payShipment} 
        onOpenChange={v => { 
          if (!v) {
            setPayShipment(null);
            // Refresh the detail order after payment
            if (detailOrder) {
              supabase.from('shipments').select('*, shipment_items(*, products(name, sku))').eq('id', detailOrder.id).single()
                .then(({ data }) => { if (data) setDetailOrder(data); });
            }
            queryClient.invalidateQueries({ queryKey: ['shipments-orders'] });
          }
        }} 
        shipment={payShipment} 
      />

      {/* Edit Shipment Dialog */}
      <ShipmentDialog
        open={!!editShipment}
        onOpenChange={v => {
          if (!v) {
            setEditShipment(null);
            queryClient.invalidateQueries({ queryKey: ['shipments-orders'] });
            queryClient.invalidateQueries({ queryKey: ['shipments'] });
          }
        }}
        editShipment={editShipment}
      />

      {/* Edit Shipment Expenses (freight/customs/other) */}
      <ShipmentExpensesDialog
        open={!!editExpenses}
        onOpenChange={v => { if (!v) setEditExpenses(null); }}
        shipment={editExpenses}
        onSaved={async () => {
          // Refetch inmediato (no esperar a que la query se invalide perezosamente)
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['shipments-orders'], refetchType: 'active' }),
            queryClient.invalidateQueries({ queryKey: ['shipments'], refetchType: 'active' }),
            queryClient.invalidateQueries({ queryKey: ['inventory-stock'], refetchType: 'active' }),
            queryClient.invalidateQueries({ queryKey: ['journal-entries'], refetchType: 'active' }),
            queryClient.invalidateQueries({ queryKey: ['libro-diario'], refetchType: 'active' }),
          ]);
          // Refrescar snapshot del detalle abierto, si aplica
          const targetId = editExpenses?.id || detailOrder?.id;
          if (targetId) {
            const { data } = await supabase
              .from('shipments')
              .select('*, shipment_items(*, products(name, sku))')
              .eq('id', targetId)
              .maybeSingle();
            if (data) {
              if (detailOrder && detailOrder.id === targetId) setDetailOrder(data);
              if (editExpenses && editExpenses.id === targetId) setEditExpenses(data);
            }
          }
        }}
      />

      {/* Edit Sale Dialog */}
      <SaleEditDialog
        open={!!editSale}
        onOpenChange={v => {
          if (!v) {
            setEditSale(null);
            queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
          }
        }}
        sale={editSale}
      />
    </div>
  );
}
