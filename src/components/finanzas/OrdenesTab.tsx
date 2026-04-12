import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatDOP, getGlobalExchangeRate } from '@/lib/format';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { Package, ShoppingCart, ChevronRight, CalendarDays, User, FileText } from 'lucide-react';

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

type ViewMode = 'compras' | 'ventas';

export function OrdenesTab() {
  const [mode, setMode] = useState<ViewMode>('compras');
  const [detailOrder, setDetailOrder] = useState<any>(null);
  const [detailType, setDetailType] = useState<ViewMode>('compras');
  const rate = getGlobalExchangeRate();

  const { data: shipments = [] } = useQuery({
    queryKey: ['shipments-orders'],
    queryFn: async () => {
      const { data } = await supabase.from('shipments')
        .select('*, shipment_items(*, products(name, sku))')
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  const { data: sales = [] } = useQuery({
    queryKey: ['sales-orders'],
    queryFn: async () => {
      const { data } = await supabase.from('sales')
        .select('*, contacts(contact_name, company_name), sale_items(*, products(name, sku))')
        .order('date', { ascending: false });
      return data || [];
    },
  });

  const openDetail = (order: any, type: ViewMode) => {
    setDetailOrder(order);
    setDetailType(type);
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
                  <TableHead className="text-xs w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shipments.map((s: any) => (
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
                    <TableCell><ChevronRight className="w-3.5 h-3.5 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))}
                {shipments.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">Sin órdenes de compra</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Sales Orders */}
      {mode === 'ventas' && (
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
      )}

      {/* Detail Dialog */}
      <Dialog open={!!detailOrder} onOpenChange={v => { if (!v) setDetailOrder(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {detailOrder && detailType === 'compras' && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base flex items-center gap-2">
                  <Package className="w-4 h-4 text-primary" />
                  Orden de Compra — {detailOrder.po_number || detailOrder.id.slice(0, 8)}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
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
                  {detailOrder.estimated_arrival && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">ETA:</span>
                      <span className="font-medium text-primary">{detailOrder.estimated_arrival}</span>
                    </div>
                  )}
                </div>

                {/* Costs breakdown */}
                <div className="rounded-xl bg-muted/30 p-3 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Costo Productos</span>
                    <span className="font-mono">{formatDOP(Number(detailOrder.total_cost_usd || 0) * rate)}</span>
                  </div>
                  {Number(detailOrder.shipping_cost_usd) > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Envío</span>
                      <span className="font-mono">{formatDOP(Number(detailOrder.shipping_cost_usd) * rate)}</span>
                    </div>
                  )}
                  {Number(detailOrder.customs_cost_usd) > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Aduana</span>
                      <span className="font-mono">{formatDOP(Number(detailOrder.customs_cost_usd) * rate)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-xs font-semibold border-t border-border pt-1.5">
                    <span>Total</span>
                    <span className="font-mono">{formatDOP((Number(detailOrder.total_cost_usd || 0) + Number(detailOrder.shipping_cost_usd || 0) + Number(detailOrder.customs_cost_usd || 0)) * rate)}</span>
                  </div>
                </div>

                {/* Items table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px]">SKU</TableHead>
                      <TableHead className="text-[10px]">Producto</TableHead>
                      <TableHead className="text-[10px] text-right">Cant.</TableHead>
                      <TableHead className="text-[10px] text-right">Recibido</TableHead>
                      <TableHead className="text-[10px] text-right">Costo Unit.</TableHead>
                      <TableHead className="text-[10px] text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detailOrder.shipment_items || []).map((si: any) => (
                      <TableRow key={si.id}>
                        <TableCell className="text-[10px] font-mono">{si.products?.sku || '—'}</TableCell>
                        <TableCell className="text-[10px]">{si.products?.name || '—'}</TableCell>
                        <TableCell className="text-[10px] text-right font-mono">{si.quantity_ordered}</TableCell>
                        <TableCell className="text-[10px] text-right font-mono">{si.quantity_received}</TableCell>
                        <TableCell className="text-[10px] text-right font-mono">{formatDOP(Number(si.unit_cost_usd || 0) * rate)}</TableCell>
                        <TableCell className="text-[10px] text-right font-mono font-medium">{formatDOP(Number(si.unit_cost_usd || 0) * si.quantity_ordered * rate)}</TableCell>
                      </TableRow>
                    ))}
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

          {detailOrder && detailType === 'ventas' && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-primary" />
                  Orden de Venta — {detailOrder.invoice_ref || detailOrder.id.slice(0, 8)}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
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
                      <TableHead className="text-[10px] text-right">Precio Unit.</TableHead>
                      <TableHead className="text-[10px] text-right">Costo Unit.</TableHead>
                      <TableHead className="text-[10px] text-right">Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(detailOrder.sale_items || []).map((si: any) => (
                      <TableRow key={si.id}>
                        <TableCell className="text-[10px] font-mono">{si.products?.sku || '—'}</TableCell>
                        <TableCell className="text-[10px]">{si.products?.name || '—'}</TableCell>
                        <TableCell className="text-[10px] text-right font-mono">{si.quantity}</TableCell>
                        <TableCell className="text-[10px] text-right font-mono">{formatDOP(Number(si.unit_price_usd || 0) * rate)}</TableCell>
                        <TableCell className="text-[10px] text-right font-mono text-muted-foreground">{formatDOP(Number(si.unit_cost_usd || 0) * rate)}</TableCell>
                        <TableCell className="text-[10px] text-right font-mono font-medium">{formatDOP(Number(si.line_total_usd || 0) * rate)}</TableCell>
                      </TableRow>
                    ))}
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
    </div>
  );
}
