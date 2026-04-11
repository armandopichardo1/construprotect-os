import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { exportToExcel } from '@/lib/export-utils';
import { formatUSD } from '@/lib/format';
import { ShoppingCart, Truck, Package, Download, Trash2, Plus, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

type CartProduct = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  category: string | null;
  unit_cost_usd: number | null;
  reorder_qty: number;
  qty: number;
};

type CartItem = CartProduct & {
  orderQty: number;
  supplierId: string;
};

interface POCartDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: CartProduct[];
  onSuccess: () => void;
}

export function POCartDialog({ open, onOpenChange, products, onSuccess }: POCartDialogProps) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<CartItem[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers-po-cart'],
    queryFn: async () => {
      const { data } = await supabase.from('suppliers').select('id, name').eq('is_active', true).order('name');
      return data || [];
    },
    enabled: open,
  });

  // Initialize items when dialog opens
  useState(() => {
    if (open && products.length > 0 && items.length === 0) {
      setItems(products.map(p => ({
        ...p,
        orderQty: p.reorder_qty || 1,
        supplierId: '',
      })));
    }
  });

  // Re-init when products change
  useMemo(() => {
    if (open) {
      setItems(products.map(p => ({
        ...p,
        orderQty: p.reorder_qty || 1,
        supplierId: '',
      })));
    }
  }, [open, products]);

  const setField = (id: string, field: 'orderQty' | 'supplierId', val: any) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: val } : i));
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  // Group by supplier
  const grouped = useMemo(() => {
    const map: Record<string, { supplierName: string; supplierId: string; items: CartItem[] }> = {};
    items.forEach(item => {
      const key = item.supplierId || '_unassigned';
      if (!map[key]) {
        const supplier = suppliers.find(s => s.id === item.supplierId);
        map[key] = {
          supplierId: item.supplierId,
          supplierName: supplier?.name || 'Sin proveedor asignado',
          items: [],
        };
      }
      map[key].items.push(item);
    });
    return Object.values(map);
  }, [items, suppliers]);

  const totalCost = items.reduce((s, i) => s + (Number(i.unit_cost_usd) || 0) * i.orderQty, 0);
  const totalUnits = items.reduce((s, i) => s + i.orderQty, 0);

  const canConfirm = items.length > 0 && items.every(i => i.supplierId && i.orderQty > 0);

  const handleConfirm = async () => {
    if (!canConfirm) {
      toast.error('Asigna un proveedor a todos los productos');
      return;
    }
    setSaving(true);

    try {
      // Group by supplier for shipment creation
      const bySupplier: Record<string, CartItem[]> = {};
      items.forEach(i => {
        if (!bySupplier[i.supplierId]) bySupplier[i.supplierId] = [];
        bySupplier[i.supplierId].push(i);
      });

      const shipmentIds: string[] = [];
      const today = new Date().toISOString().split('T')[0];

      for (const [supplierId, supItems] of Object.entries(bySupplier)) {
        const supplier = suppliers.find(s => s.id === supplierId);
        const totalShipCost = supItems.reduce((s, i) => s + (Number(i.unit_cost_usd) || 0) * i.orderQty, 0);

        // Create shipment
        const { data: shipment, error: shipErr } = await supabase.from('shipments').insert({
          supplier_id: supplierId,
          supplier_name: supplier?.name || 'Desconocido',
          order_date: today,
          status: 'ordered',
          total_cost_usd: totalShipCost,
          po_number: `PO-${Date.now().toString(36).toUpperCase()}`,
          notes: `Generado automáticamente desde PO Recomendado (${supItems.length} productos)`,
        }).select('id').single();

        if (shipErr) throw shipErr;
        shipmentIds.push(shipment.id);

        // Create shipment items
        const shipItems = supItems.map(i => ({
          shipment_id: shipment.id,
          product_id: i.id,
          quantity_ordered: i.orderQty,
          quantity_received: 0,
          unit_cost_usd: Number(i.unit_cost_usd) || 0,
        }));

        const { error: itemsErr } = await supabase.from('shipment_items').insert(shipItems);
        if (itemsErr) throw itemsErr;
      }

      // Export Excel
      const excelData = grouped.filter(g => g.supplierId).flatMap(g =>
        g.items.map(i => ({
          'PO': `PO-${Date.now().toString(36).toUpperCase()}`,
          'Proveedor': g.supplierName,
          'SKU': i.sku,
          'Producto': i.name,
          'Categoría': i.category || '',
          'Marca': i.brand || '',
          'Cantidad': i.orderQty,
          'Costo Unit. USD': Number(i.unit_cost_usd) || 0,
          'Total Línea USD': (Number(i.unit_cost_usd) || 0) * i.orderQty,
          'Stock Actual': i.qty,
        }))
      );

      exportToExcel(excelData, `PO_${today}`, 'Órdenes de Compra');

      toast.success(`${shipmentIds.length} envío(s) creado(s) y Excel descargado`);
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['shipment-items'] });
      onSuccess();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Error al crear envíos');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-primary" /> Carrito de Orden de Compra
          </DialogTitle>
        </DialogHeader>

        {/* Summary bar */}
        <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs">
            <Package className="w-3.5 h-3.5 text-primary" />
            <span className="text-muted-foreground">Productos:</span>
            <span className="font-bold text-foreground">{items.length}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Unidades:</span>
            <span className="font-bold text-foreground">{totalUnits.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">Costo estimado:</span>
            <span className="font-bold text-primary">{formatUSD(totalCost)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <Truck className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Envíos:</span>
            <span className="font-bold text-foreground">{grouped.filter(g => g.supplierId).length}</span>
          </div>
        </div>

        {/* Grouped by supplier */}
        <div className="space-y-4">
          {grouped.map((group, gi) => {
            const groupCost = group.items.reduce((s, i) => s + (Number(i.unit_cost_usd) || 0) * i.orderQty, 0);
            const groupUnits = group.items.reduce((s, i) => s + i.orderQty, 0);
            return (
              <div key={gi} className="rounded-xl border border-border overflow-hidden">
                <div className={cn(
                  'px-4 py-2.5 flex items-center gap-3 flex-wrap',
                  group.supplierId ? 'bg-card' : 'bg-destructive/5'
                )}>
                  <Truck className={cn('w-4 h-4', group.supplierId ? 'text-primary' : 'text-destructive')} />
                  <span className="text-xs font-semibold text-foreground">{group.supplierName}</span>
                  <Badge variant="secondary" className="text-[10px]">{group.items.length} producto(s)</Badge>
                  <span className="text-[10px] text-muted-foreground ml-auto">{groupUnits} uds · {formatUSD(groupCost)}</span>
                </div>
                <div className="divide-y divide-border">
                  {group.items.map(item => (
                    <div key={item.id} className="px-4 py-2.5 flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-[200px]">
                        <p className="text-xs font-medium text-foreground">{item.name}</p>
                        <p className="text-[10px] text-muted-foreground">{item.sku} · Stock: {item.qty} · {item.brand || 'Sin marca'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select value={item.supplierId || '_none'} onValueChange={v => setField(item.id, 'supplierId', v === '_none' ? '' : v)}>
                          <SelectTrigger className="h-7 w-[160px] text-[10px]">
                            <SelectValue placeholder="Proveedor..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_none" className="text-[10px]">Sin proveedor</SelectItem>
                            {suppliers.map(s => (
                              <SelectItem key={s.id} value={s.id} className="text-[10px]">{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          min={1}
                          value={item.orderQty}
                          onChange={e => setField(item.id, 'orderQty', Math.max(1, Number(e.target.value) || 1))}
                          className="w-20 h-7 text-xs text-center font-mono"
                        />
                        <span className="text-[10px] text-muted-foreground w-20 text-right font-mono">
                          {formatUSD((Number(item.unit_cost_usd) || 0) * item.orderQty)}
                        </span>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeItem(item.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">El carrito está vacío</p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground">
            {!canConfirm && items.length > 0 && '⚠️ Asigna proveedor a todos los productos'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button size="sm" className="gap-1.5 text-xs rounded-xl" onClick={handleConfirm} disabled={saving || !canConfirm}>
              <Check className="w-3.5 h-3.5" />
              {saving ? 'Creando...' : `Confirmar ${grouped.filter(g => g.supplierId).length} envío(s)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
