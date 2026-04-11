import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/lib/format';
import { exportToExcel } from '@/lib/export-utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Container, Plus, Minus, Truck, Weight, Box, AlertTriangle, CheckCircle2, Download, Ship, BarChart3, ChevronDown, ChevronUp } from 'lucide-react';

const CONTAINER_TYPES = {
  '20ft': { label: '20\' Standard', maxCbm: 33.2, maxKg: 21770, costEstimate: 3500 },
  '40ft': { label: '40\' Standard', maxCbm: 67.7, maxKg: 26780, costEstimate: 5500 },
  '40hc': { label: '40\' High Cube', maxCbm: 76.3, maxKg: 26580, costEstimate: 6000 },
};

type ContainerType = keyof typeof CONTAINER_TYPES;

type ProductLine = {
  id: string;
  sku: string;
  name: string;
  category: string;
  unitCost: number;
  cbmPerUnit: number;
  weightPerUnit: number;
  minOrderQty: number;
  currentStock: number;
  reorderPoint: number;
  reorderQty: number;
  avgMonthly: number;
  daysOfSupply: number;
  leadTime: number;
  qty: number; // qty to order
};

export function ContainerPlanner() {
  const queryClient = useQueryClient();
  const [containerType, setContainerType] = useState<ContainerType>('40hc');
  const [orderLines, setOrderLines] = useState<Record<string, number>>({});
  const [showShipmentDialog, setShowShipmentDialog] = useState(false);
  const [shipmentSupplierId, setShipmentSupplierId] = useState('');
  const [shipmentPoNumber, setShipmentPoNumber] = useState('');
  const [shipmentEta, setShipmentEta] = useState('');
  const [shipmentNotes, setShipmentNotes] = useState('');
  const [creatingShipment, setCreatingShipment] = useState(false);
  const container = CONTAINER_TYPES[containerType];

  const { data: products } = useQuery({
    queryKey: ['container-products'],
    queryFn: async () => {
      const [{ data: inv }, { data: prods }, { data: movements }] = await Promise.all([
        supabase.from('inventory').select('*'),
        supabase.from('products').select('id, sku, name, category, unit_cost_usd, reorder_point, reorder_qty, lead_time_days, cbm_per_unit, weight_kg_per_unit, min_order_qty').eq('is_active', true),
        supabase.from('inventory_movements').select('product_id, quantity, movement_type, created_at').eq('movement_type', 'sale').order('created_at'),
      ]);
      if (!prods) return [];
      const invMap = Object.fromEntries((inv || []).map(i => [i.product_id, i]));
      const now = new Date();
      const salesByProduct: Record<string, number> = {};
      (movements || []).forEach(m => {
        const date = new Date(m.created_at);
        const monthsAgo = (now.getFullYear() - date.getFullYear()) * 12 + now.getMonth() - date.getMonth();
        if (monthsAgo > 5 || monthsAgo < 0) return;
        salesByProduct[m.product_id] = (salesByProduct[m.product_id] || 0) + Math.abs(m.quantity);
      });

      return prods.map(p => {
        const stock = invMap[p.id]?.quantity_on_hand || 0;
        const avgMonthly = (salesByProduct[p.id] || 0) / 6;
        const daysOfSupply = avgMonthly > 0 ? Math.round((stock / avgMonthly) * 30) : 999;
        const leadTime = Number(p.lead_time_days) || 21;
        return {
          id: p.id,
          sku: p.sku,
          name: p.name,
          category: p.category || 'Otros',
          unitCost: Number(p.unit_cost_usd) || 0,
          cbmPerUnit: Number((p as any).cbm_per_unit) || 0,
          weightPerUnit: Number((p as any).weight_kg_per_unit) || 0,
          minOrderQty: Number((p as any).min_order_qty) || 1,
          currentStock: stock,
          reorderPoint: Number(p.reorder_point) || 0,
          reorderQty: Number(p.reorder_qty) || 0,
          avgMonthly,
          daysOfSupply,
          leadTime,
          qty: 0,
        } as ProductLine;
      });
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers-active'],
    queryFn: async () => {
      const { data } = await supabase.from('suppliers').select('id, name').eq('is_active', true).order('name');
      return data || [];
    },
  });

  const items = products || [];

  // Compute suggested quantities based on rotation + safety stock
  const suggestedLines = useMemo(() => {
    return items.map(p => {
      const dailyVelocity = p.avgMonthly / 30;
      const safetyStock = Math.ceil(dailyVelocity * p.leadTime * 1.5);
      const targetStock = safetyStock + Math.ceil(dailyVelocity * 30); // safety + 1 month
      const needed = Math.max(0, targetStock - p.currentStock);
      // Round up to min order qty
      const suggested = needed > 0 ? Math.max(p.minOrderQty, Math.ceil(needed / Math.max(p.minOrderQty, 1)) * p.minOrderQty) : 0;
      return { ...p, suggestedQty: suggested, safetyStock, targetStock };
    });
  }, [items]);

  // Merge order lines
  const lines = useMemo(() => {
    return suggestedLines.map(p => ({
      ...p,
      qty: orderLines[p.id] ?? p.suggestedQty,
    }));
  }, [suggestedLines, orderLines]);

  const activeLines = lines.filter(l => l.qty > 0);

  // Container fill calculations
  const totalCbm = activeLines.reduce((s, l) => s + l.qty * l.cbmPerUnit, 0);
  const totalWeight = activeLines.reduce((s, l) => s + l.qty * l.weightPerUnit, 0);
  const totalCost = activeLines.reduce((s, l) => s + l.qty * l.unitCost, 0);
  const fillPctVolume = container.maxCbm > 0 ? (totalCbm / container.maxCbm) * 100 : 0;
  const fillPctWeight = container.maxKg > 0 ? (totalWeight / container.maxKg) * 100 : 0;
  const fillPct = Math.max(fillPctVolume, fillPctWeight);
  const hasVolumeData = activeLines.some(l => l.cbmPerUnit > 0);
  const hasWeightData = activeLines.some(l => l.weightPerUnit > 0);

  const setQty = (id: string, qty: number) => {
    setOrderLines(prev => ({ ...prev, [id]: Math.max(0, qty) }));
  };

  const autoFillSuggested = () => {
    const newLines: Record<string, number> = {};
    suggestedLines.forEach(p => { if (p.suggestedQty > 0) newLines[p.id] = p.suggestedQty; });
    setOrderLines(newLines);
  };

  const clearAll = () => setOrderLines({});

  const handleExport = () => {
    const data = activeLines.map(p => ({
      SKU: p.sku,
      Producto: p.name,
      Categoría: p.category,
      'Stock Actual': p.currentStock,
      'Vel/Mes': Number(p.avgMonthly.toFixed(1)),
      'Días Stock': p.daysOfSupply >= 999 ? '∞' : p.daysOfSupply,
      Urgencia: urgencyLabel(p),
      'Min Batch': p.minOrderQty,
      'Qty Sugerida': p.suggestedQty || 0,
      'Qty Ordenar': p.qty,
      'CBM/Unidad': p.cbmPerUnit,
      'CBM Total': p.cbmPerUnit > 0 ? Number((p.qty * p.cbmPerUnit).toFixed(3)) : 0,
      'Peso/Unidad (kg)': p.weightPerUnit,
      'Peso Total (kg)': p.weightPerUnit > 0 ? Number((p.qty * p.weightPerUnit).toFixed(1)) : 0,
      'Costo Unit (USD)': p.unitCost,
      'Costo Total (USD)': Number((p.qty * p.unitCost).toFixed(2)),
    }));

    // Summary rows
    const totalUnits = activeLines.reduce((s, l) => s + l.qty, 0);
    const emptyRow: Record<string, any> = {};
    const summaryRows = [
      emptyRow,
      { SKU: 'RESUMEN', Producto: '', Categoría: '', 'Stock Actual': '', 'Vel/Mes': '', 'Días Stock': '', Urgencia: '', 'Min Batch': '', 'Qty Sugerida': '', 'Qty Ordenar': '', 'CBM/Unidad': '', 'CBM Total': '', 'Peso/Unidad (kg)': '', 'Peso Total (kg)': '', 'Costo Unit (USD)': '', 'Costo Total (USD)': '' },
      { SKU: 'Contenedor', Producto: CONTAINER_TYPES[containerType].label, 'CBM Total': '', 'Peso Total (kg)': '', 'Costo Total (USD)': '' },
      { SKU: 'SKUs', Producto: `${activeLines.length} productos`, 'Qty Ordenar': totalUnits, 'CBM Total': '', 'Peso Total (kg)': '', 'Costo Total (USD)': '' },
      { SKU: 'CBM Total', Producto: `${totalCbm.toFixed(2)} / ${container.maxCbm} m³`, 'Qty Ordenar': '', 'CBM Total': Number(totalCbm.toFixed(2)), 'Peso Total (kg)': '', 'Costo Total (USD)': '' },
      { SKU: 'Peso Total', Producto: `${totalWeight.toFixed(0)} / ${container.maxKg.toLocaleString()} kg`, 'Qty Ordenar': '', 'CBM Total': '', 'Peso Total (kg)': Number(totalWeight.toFixed(0)), 'Costo Total (USD)': '' },
      { SKU: 'Llenado Vol.', Producto: `${fillPctVolume.toFixed(1)}%` },
      { SKU: 'Llenado Peso', Producto: `${fillPctWeight.toFixed(1)}%` },
      { SKU: 'Costo Producto', Producto: `$${totalCost.toFixed(2)}`, 'Costo Total (USD)': Number(totalCost.toFixed(2)) },
      { SKU: 'Flete Estimado', Producto: `$${container.costEstimate.toFixed(2)}`, 'Costo Total (USD)': container.costEstimate },
      { SKU: 'Costo Total', Producto: `$${(totalCost + container.costEstimate).toFixed(2)}`, 'Costo Total (USD)': Number((totalCost + container.costEstimate).toFixed(2)) },
      { SKU: 'Fecha', Producto: new Date().toLocaleDateString('es-DO') },
    ];

    exportToExcel([...data, ...summaryRows], `orden-contenedor-${containerType}-${new Date().toISOString().slice(0, 10)}`, 'Orden Contenedor');
  };

  const handleCreateShipment = async () => {
    if (!shipmentSupplierId) { toast.error('Selecciona un proveedor'); return; }
    const supplier = suppliers.find(s => s.id === shipmentSupplierId);
    setCreatingShipment(true);
    try {
      const { data: shipment, error } = await supabase.from('shipments').insert({
        supplier_id: shipmentSupplierId,
        supplier_name: supplier?.name || '',
        po_number: shipmentPoNumber || null,
        status: 'ordered' as any,
        order_date: new Date().toISOString().split('T')[0],
        estimated_arrival: shipmentEta || null,
        shipping_cost_usd: container.costEstimate,
        customs_cost_usd: 0,
        total_cost_usd: totalCost + container.costEstimate,
        notes: shipmentNotes || `Contenedor ${CONTAINER_TYPES[containerType].label} — ${activeLines.length} SKUs`,
      }).select().single();
      if (error) throw error;

      const shipmentItems = activeLines.map(l => ({
        shipment_id: shipment.id,
        product_id: l.id,
        quantity_ordered: l.qty,
        unit_cost_usd: l.unitCost,
      }));
      const { error: itemsError } = await supabase.from('shipment_items').insert(shipmentItems);
      if (itemsError) throw itemsError;

      toast.success(`Envío creado con ${activeLines.length} productos`);
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      setShowShipmentDialog(false);
      setShipmentSupplierId('');
      setShipmentPoNumber('');
      setShipmentEta('');
      setShipmentNotes('');
      clearAll();
    } catch (e: any) {
      toast.error(e.message || 'Error creando envío');
    } finally {
      setCreatingShipment(false);
    }
  };

  const urgencyColor = (p: typeof lines[0]) => {
    if (p.currentStock === 0) return 'text-destructive';
    if (p.daysOfSupply < p.leadTime) return 'text-destructive';
    if (p.currentStock <= p.reorderPoint) return 'text-warning';
    return 'text-muted-foreground';
  };

  const urgencyLabel = (p: typeof lines[0]) => {
    if (p.currentStock === 0) return 'Agotado';
    if (p.daysOfSupply < p.leadTime) return 'Crítico';
    if (p.currentStock <= p.reorderPoint) return 'Bajo';
    return 'OK';
  };

  return (
    <div className="space-y-5">
      {/* Container selector + KPIs */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
        <div className="rounded-xl bg-card border border-border p-4 space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Contenedor</p>
          <Select value={containerType} onValueChange={v => setContainerType(v as ContainerType)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(CONTAINER_TYPES).map(([k, v]) => (
                <SelectItem key={k} value={k} className="text-xs">{v.label} ({v.maxCbm} m³)</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground">Flete est: {formatUSD(container.costEstimate)}</p>
        </div>

        {/* Fill gauge - Volume */}
        <div className="rounded-xl bg-card border border-border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Box className="w-3 h-3" /> Volumen</p>
            {hasVolumeData ? (
              <span className={cn('text-lg font-bold', fillPctVolume > 95 ? 'text-destructive' : fillPctVolume > 70 ? 'text-success' : 'text-warning')}>
                {fillPctVolume.toFixed(0)}%
              </span>
            ) : <span className="text-xs text-muted-foreground">Sin datos</span>}
          </div>
          <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
            <div className={cn('h-full rounded-full transition-all', fillPctVolume > 95 ? 'bg-destructive' : fillPctVolume > 70 ? 'bg-success' : 'bg-warning')}
              style={{ width: `${Math.min(fillPctVolume, 100)}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground">{totalCbm.toFixed(1)} / {container.maxCbm} m³</p>
        </div>

        {/* Fill gauge - Weight */}
        <div className="rounded-xl bg-card border border-border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Weight className="w-3 h-3" /> Peso</p>
            {hasWeightData ? (
              <span className={cn('text-lg font-bold', fillPctWeight > 95 ? 'text-destructive' : fillPctWeight > 70 ? 'text-success' : 'text-warning')}>
                {fillPctWeight.toFixed(0)}%
              </span>
            ) : <span className="text-xs text-muted-foreground">Sin datos</span>}
          </div>
          <div className="w-full h-3 rounded-full bg-muted overflow-hidden">
            <div className={cn('h-full rounded-full transition-all', fillPctWeight > 95 ? 'bg-destructive' : fillPctWeight > 70 ? 'bg-success' : 'bg-warning')}
              style={{ width: `${Math.min(fillPctWeight, 100)}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground">{totalWeight.toFixed(0)} / {container.maxKg.toLocaleString()} kg</p>
        </div>

        {/* Cost */}
        <div className="rounded-xl bg-card border border-border p-4 space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Costo Producto</p>
          <p className="text-lg font-bold text-foreground">{formatUSD(totalCost)}</p>
          <p className="text-[10px] text-muted-foreground">+Flete: {formatUSD(totalCost + container.costEstimate)}</p>
        </div>

        {/* Items */}
        <div className="rounded-xl bg-card border border-border p-4 space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">SKUs en Orden</p>
          <p className="text-lg font-bold text-foreground">{activeLines.length}</p>
          <p className="text-[10px] text-muted-foreground">{activeLines.reduce((s, l) => s + l.qty, 0).toLocaleString()} unidades total</p>
        </div>
      </div>

      {/* Container fill status alert */}
      {fillPct > 0 && (
        <div className={cn('rounded-xl p-3 flex items-center gap-3 text-xs border',
          fillPct > 95 ? 'bg-destructive/10 border-destructive/20' : 
          fillPct > 70 ? 'bg-success/10 border-success/20' : 'bg-warning/10 border-warning/20'
        )}>
          {fillPct > 95 ? <AlertTriangle className="w-4 h-4 text-destructive shrink-0" /> : 
           fillPct > 70 ? <CheckCircle2 className="w-4 h-4 text-success shrink-0" /> :
           <Truck className="w-4 h-4 text-warning shrink-0" />}
          <span>
            {fillPct > 95 ? '⚠️ Contenedor sobrecargado. Reduce cantidades o usa un contenedor más grande.' :
             fillPct > 70 ? '✅ Buen aprovechamiento del contenedor. Rango óptimo: 70-95%.' :
             `📦 Contenedor con espacio disponible (${(100 - fillPct).toFixed(0)}% libre). Considera agregar más productos.`}
          </span>
          {!hasVolumeData && !hasWeightData && (
            <span className="text-muted-foreground ml-auto shrink-0">💡 Configura CBM y peso en Productos para cálculos precisos</span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={autoFillSuggested} className="gap-1.5 text-xs">
          <Truck className="w-3.5 h-3.5" /> Auto-llenar sugeridos
        </Button>
        <Button size="sm" variant="ghost" onClick={clearAll} className="text-xs text-muted-foreground">Limpiar</Button>
        {activeLines.length > 0 && (
          <>
            <Button size="sm" variant="outline" onClick={handleExport} className="gap-1.5 text-xs ml-auto">
              <Download className="w-3.5 h-3.5" /> Exportar Excel
            </Button>
            <Button size="sm" onClick={() => setShowShipmentDialog(true)} className="gap-1.5 text-xs">
              <Ship className="w-3.5 h-3.5" /> Crear Envío
            </Button>
          </>
        )}
      </div>

      {/* Product table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[10px]">SKU</TableHead>
              <TableHead className="text-[10px]">Producto</TableHead>
              <TableHead className="text-[10px] text-right">Stock</TableHead>
              <TableHead className="text-[10px] text-right">Vel/mes</TableHead>
              <TableHead className="text-[10px] text-right">Días Stock</TableHead>
              <TableHead className="text-[10px] text-center">Urgencia</TableHead>
              <TableHead className="text-[10px] text-right">Min Batch</TableHead>
              <TableHead className="text-[10px] text-right">Sugerido</TableHead>
              <TableHead className="text-[10px] text-center">Ordenar</TableHead>
              <TableHead className="text-[10px] text-right">CBM</TableHead>
              <TableHead className="text-[10px] text-right">Kg</TableHead>
              <TableHead className="text-[10px] text-right">Costo</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines
              .sort((a, b) => {
                // Sort: agotados first, then by days of supply
                const urgA = a.currentStock === 0 ? 0 : a.daysOfSupply < a.leadTime ? 1 : a.currentStock <= a.reorderPoint ? 2 : 3;
                const urgB = b.currentStock === 0 ? 0 : b.daysOfSupply < b.leadTime ? 1 : b.currentStock <= b.reorderPoint ? 2 : 3;
                if (urgA !== urgB) return urgA - urgB;
                return a.daysOfSupply - b.daysOfSupply;
              })
              .map(p => (
              <TableRow key={p.id} className={cn(p.qty > 0 && 'bg-primary/5')}>
                <TableCell className="text-[10px] font-mono text-muted-foreground">{p.sku}</TableCell>
                <TableCell className="text-[10px] font-medium">{p.name}</TableCell>
                <TableCell className="text-[10px] text-right font-mono font-bold">{p.currentStock}</TableCell>
                <TableCell className="text-[10px] text-right font-mono">{p.avgMonthly.toFixed(1)}</TableCell>
                <TableCell className={cn('text-[10px] text-right font-mono', urgencyColor(p))}>
                  {p.daysOfSupply >= 999 ? '∞' : `${p.daysOfSupply}d`}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="outline" className={cn('text-[9px]', 
                    p.currentStock === 0 ? 'border-destructive/30 text-destructive' :
                    p.daysOfSupply < p.leadTime ? 'border-destructive/30 text-destructive' :
                    p.currentStock <= p.reorderPoint ? 'border-warning/30 text-warning' : 'border-border text-muted-foreground'
                  )}>{urgencyLabel(p)}</Badge>
                </TableCell>
                <TableCell className="text-[10px] text-right font-mono text-muted-foreground">{p.minOrderQty}</TableCell>
                <TableCell className="text-[10px] text-right font-mono text-primary">{p.suggestedQty || '-'}</TableCell>
                <TableCell>
                  <div className="flex items-center justify-center gap-1">
                    <button onClick={() => setQty(p.id, p.qty - Math.max(p.minOrderQty, 1))} className="w-5 h-5 rounded bg-muted flex items-center justify-center hover:bg-muted/80">
                      <Minus className="w-3 h-3" />
                    </button>
                    <Input type="number" value={p.qty} onChange={e => setQty(p.id, Number(e.target.value))}
                      className="w-14 h-6 text-[10px] text-center p-0 font-mono" />
                    <button onClick={() => setQty(p.id, p.qty + Math.max(p.minOrderQty, 1))} className="w-5 h-5 rounded bg-muted flex items-center justify-center hover:bg-muted/80">
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </TableCell>
                <TableCell className="text-[10px] text-right font-mono text-muted-foreground">
                  {p.qty > 0 && p.cbmPerUnit > 0 ? (p.qty * p.cbmPerUnit).toFixed(2) : '-'}
                </TableCell>
                <TableCell className="text-[10px] text-right font-mono text-muted-foreground">
                  {p.qty > 0 && p.weightPerUnit > 0 ? (p.qty * p.weightPerUnit).toFixed(0) : '-'}
                </TableCell>
                <TableCell className="text-[10px] text-right font-mono">
                  {p.qty > 0 ? formatUSD(p.qty * p.unitCost) : '-'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Create Shipment Dialog */}
      <Dialog open={showShipmentDialog} onOpenChange={setShowShipmentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Ship className="w-4 h-4 text-primary" /> Crear Envío desde Contenedor
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-xs space-y-1">
              <p><b>{activeLines.length}</b> productos · <b>{activeLines.reduce((s, l) => s + l.qty, 0).toLocaleString()}</b> unidades</p>
              <p>Costo producto: <b>{formatUSD(totalCost)}</b> · Flete est: <b>{formatUSD(container.costEstimate)}</b></p>
              <p>Contenedor: <b>{CONTAINER_TYPES[containerType].label}</b> · Llenado: <b>{fillPct.toFixed(0)}%</b></p>
            </div>
            <div>
              <Label className="text-xs">Proveedor *</Label>
              <Select value={shipmentSupplierId} onValueChange={setShipmentSupplierId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar proveedor" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">PO Number</Label>
                <Input value={shipmentPoNumber} onChange={e => setShipmentPoNumber(e.target.value)} className="mt-1" placeholder="PO-2026-001" />
              </div>
              <div>
                <Label className="text-xs">ETA</Label>
                <Input type="date" value={shipmentEta} onChange={e => setShipmentEta(e.target.value)} className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notas</Label>
              <Input value={shipmentNotes} onChange={e => setShipmentNotes(e.target.value)} className="mt-1" placeholder="Opcional" />
            </div>
            <Button onClick={handleCreateShipment} disabled={creatingShipment} className="w-full gap-2">
              <Ship className="w-4 h-4" />
              {creatingShipment ? 'Creando...' : `Crear Envío (${formatUSD(totalCost + container.costEstimate)})`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
