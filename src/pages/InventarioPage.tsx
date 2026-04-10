import { useState, useMemo, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/lib/format';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid } from 'recharts';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Bot, RefreshCw, ArrowUpDown, AlertTriangle } from 'lucide-react';
import { streamBusinessAI } from '@/lib/business-ai';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { ShipmentsTab } from '@/components/inventario/ShipmentsTab';
import { MovimientosTab } from '@/components/inventario/MovimientosTab';

import { DaysOfSupplyChart, OverstockWarnings } from '@/components/inventario/InventoryAnalytics';
import { ReorderTab } from '@/components/inventario/ReorderTab';
import { ContainerPlanner } from '@/components/inventario/ContainerPlanner';

const tabs = ['Stock', 'Reorden', 'Contenedor', 'Movimientos', 'Analytics', 'Envíos', 'ABC'];
const chartTooltipStyle = { background: 'hsl(222, 20%, 10%)', border: '1px solid hsl(222, 20%, 20%)', borderRadius: 8, fontSize: 12 };

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = { ok: 'bg-success/15 text-success', low: 'bg-warning/15 text-warning', out: 'bg-destructive/15 text-destructive', excess: 'bg-primary/15 text-primary' };
  const labels: Record<string, string> = { ok: 'OK', low: 'Bajo', out: 'Agotado', excess: 'Exceso' };
  return <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', styles[status])}>{labels[status]}</span>;
}

function MiniSparkline({ data }: { data: number[] }) {
  if (!data.length) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => `${(i / Math.max(data.length - 1, 1)) * 60},${20 - ((v - min) / range) * 18}`).join(' ');
  const trending = data[data.length - 1] >= data[0];
  return (
    <svg width="60" height="22" className="shrink-0">
      <polyline points={points} fill="none" stroke={trending ? 'hsl(160, 84%, 39%)' : 'hsl(0, 84%, 60%)'} strokeWidth="1.5" />
    </svg>
  );
}

/** Horizontal thermometer: shows current stock vs reorder point */
function StockThermometer({ qty, reorder, maxQty }: { qty: number; reorder: number; maxQty: number }) {
  const barMax = Math.max(maxQty, reorder * 2, qty, 1);
  const qtyPct = Math.min((qty / barMax) * 100, 100);
  const reorderPct = Math.min((reorder / barMax) * 100, 100);
  const color = qty === 0 ? 'hsl(0, 84%, 60%)' : qty <= reorder ? 'hsl(38, 92%, 50%)' : 'hsl(160, 84%, 39%)';

  return (
    <div className="relative h-4 w-full">
      {/* Background track */}
      <div className="absolute inset-0 rounded-full bg-muted" />
      {/* Fill bar */}
      <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${qtyPct}%`, background: color }} />
      {/* Reorder point marker */}
      <div
        className="absolute top-[-2px] bottom-[-2px] w-0.5 bg-destructive z-10"
        style={{ left: `${reorderPct}%` }}
        title={`Reorden: ${reorder}`}
      />
      {/* Reorder label */}
      <div className="absolute text-[8px] text-destructive font-bold" style={{ left: `${reorderPct}%`, top: '-12px', transform: 'translateX(-50%)' }}>
        {reorder}
      </div>
    </div>
  );
}

type StockItem = {
  id: string; name: string; sku: string; qty: number; reorder: number;
  status: string; category: string; value: number; movements: number[];
  velocity: number; costUsd: number;
};

type SortField = 'status' | 'name' | 'category' | 'qty' | 'value' | 'velocity';
type SortDir = 'asc' | 'desc';

const ABC_DEFINITIONS: Record<string, { title: string; desc: string; color: string }> = {
  A: {
    title: 'Clase A — Alta prioridad (70% del valor)',
    desc: 'Productos que generan la mayor parte del valor del inventario. Requieren monitoreo constante, reabastecimiento frecuente y revisión semanal de stock. Nunca deben agotarse.',
    color: 'bg-primary/15 text-primary',
  },
  B: {
    title: 'Clase B — Prioridad media (20% del valor)',
    desc: 'Productos con demanda moderada y valor intermedio. Se revisan cada 2 semanas. Mantener stock de seguridad estándar.',
    color: 'bg-warning/15 text-warning',
  },
  C: {
    title: 'Clase C — Baja prioridad (10% del valor)',
    desc: 'Productos de bajo valor o baja rotación. Comprar en cantidades mayores con menor frecuencia. Revisar mensualmente y considerar descontinuar los de menor demanda.',
    color: 'bg-muted text-muted-foreground',
  },
};

export default function InventarioPage() {
  const [tab, setTab] = useState('Stock');
  const [filter, setFilter] = useState('all');
  const [sortField, setSortField] = useState<SortField>('status');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showPO, setShowPO] = useState(false);
  const [poContent, setPOContent] = useState('');
  const [poLoading, setPOLoading] = useState(false);
  const queryClient = useQueryClient();

  // Cash flow data for PO recommender
  const { data: cashData } = useQuery({
    queryKey: ['cash-flow-summary'],
    queryFn: async () => {
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const [{ data: paidSales }, { data: monthExpenses }, { data: pendingPOs }] = await Promise.all([
        supabase.from('sales').select('total_usd').eq('payment_status', 'paid'),
        supabase.from('expenses').select('amount_usd').gte('date', `${monthKey}-01`),
        supabase.from('shipments').select('total_cost_usd').neq('status', 'received'),
      ]);
      const totalReceived = (paidSales || []).reduce((s, r) => s + Number(r.total_usd || 0), 0);
      const totalExpenses = (monthExpenses || []).reduce((s, r) => s + Number(r.amount_usd || 0), 0);
      const pendingPOCost = (pendingPOs || []).reduce((s, r) => s + Number(r.total_cost_usd || 0), 0);
      return { totalReceived, totalExpenses, pendingPOCost, estimatedCash: totalReceived - totalExpenses - pendingPOCost };
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel('inventory-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
        queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_movements' }, () => {
        queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  const { data: stockData } = useQuery({
    queryKey: ['inventory-stock'],
    queryFn: async () => {
      const [{ data: inv }, { data: products }, { data: movements }] = await Promise.all([
        supabase.from('inventory').select('*'),
        supabase.from('products').select('id, sku, name, category, unit_cost_usd, reorder_point'),
        supabase.from('inventory_movements').select('product_id, quantity, created_at, movement_type').order('created_at'),
      ]);
      if (!inv || !products) return [];
      const productMap = Object.fromEntries(products.map(p => [p.id, p]));
      const movementsByProduct: Record<string, number[]> = {};
      const salesByProduct: Record<string, number> = {};
      const now = new Date();
      (movements || []).forEach(m => {
        const date = new Date(m.created_at);
        const monthsAgo = (now.getFullYear() - date.getFullYear()) * 12 + now.getMonth() - date.getMonth();
        if (monthsAgo > 5 || monthsAgo < 0) return;
        const idx = 5 - monthsAgo;
        if (!movementsByProduct[m.product_id]) movementsByProduct[m.product_id] = [0, 0, 0, 0, 0, 0];
        movementsByProduct[m.product_id][idx] += Math.abs(m.quantity);
        if (m.movement_type === 'sale') {
          salesByProduct[m.product_id] = (salesByProduct[m.product_id] || 0) + Math.abs(m.quantity);
        }
      });
      return inv.map(i => {
        const p = productMap[i.product_id];
        if (!p) return null;
        const qty = i.quantity_on_hand;
        let status = 'ok';
        if (qty === 0) status = 'out';
        else if (qty <= Number(p.reorder_point)) status = 'low';
        else if (qty > Number(p.reorder_point) * 5) status = 'excess';
        const mvmts = movementsByProduct[i.product_id] || [0, 0, 0, 0, 0, 0];
        const velocity = (salesByProduct[i.product_id] || 0) / 6;
        return {
          id: i.id, name: p.name, sku: p.sku, qty, reorder: Number(p.reorder_point),
          status, category: p.category || 'Otros',
          value: qty * Number(p.unit_cost_usd), movements: mvmts, velocity,
          costUsd: Number(p.unit_cost_usd),
        } as StockItem;
      }).filter(Boolean) as StockItem[];
    },
  });

  const items = stockData || [];
  const counts = useMemo(() => ({
    all: items.length, ok: items.filter(i => i.status === 'ok').length,
    low: items.filter(i => i.status === 'low').length, out: items.filter(i => i.status === 'out').length,
    excess: items.filter(i => i.status === 'excess').length,
  }), [items]);

  const filtered = filter === 'all' ? items : items.filter(i => i.status === filter);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const sorted = useMemo(() => {
    const statusOrder: Record<string, number> = { out: 0, low: 1, excess: 2, ok: 3 };
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'status': cmp = (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4); break;
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'category': cmp = a.category.localeCompare(b.category); break;
        case 'qty': cmp = a.qty - b.qty; break;
        case 'value': cmp = a.value - b.value; break;
        case 'velocity': cmp = a.velocity - b.velocity; break;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });
  }, [filtered, sortField, sortDir]);

  const maxQty = useMemo(() => Math.max(...items.map(i => i.qty), 1), [items]);

  const categoryValues = useMemo(() => {
    const cats: Record<string, number> = {};
    items.forEach(i => { cats[i.category] = (cats[i.category] || 0) + i.value; });
    const colors = ['hsl(217, 91%, 60%)', 'hsl(160, 84%, 39%)', 'hsl(38, 92%, 50%)', 'hsl(280, 60%, 55%)', 'hsl(0, 84%, 60%)'];
    return Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([name, value], i) => ({ name, value, color: colors[i] || colors[4] }));
  }, [items]);

  const bubbleData = useMemo(() => {
    return items.filter(i => i.velocity > 0 || i.qty > 0).map(i => ({
      x: i.velocity, y: i.qty, z: i.value, name: i.name, status: i.status,
    }));
  }, [items]);

  const abcGroups = useMemo(() => {
    const scored = items.map(i => ({ ...i, score: i.velocity * i.costUsd + i.value }));
    const byScore = [...scored].sort((a, b) => b.score - a.score);
    const total = byScore.reduce((s, i) => s + i.score, 0);
    let cum = 0;
    const A: StockItem[] = [], B: StockItem[] = [], C: StockItem[] = [];
    byScore.forEach(i => {
      cum += i.score;
      if (cum / total <= 0.7) A.push(i);
      else if (cum / total <= 0.9) B.push(i);
      else C.push(i);
    });
    return { A, B, C };
  }, [items]);

  // Parse PO content into table rows
  const poTableData = useMemo(() => {
    if (!poContent) return null;
    // Try to parse markdown table from PO content
    const lines = poContent.split('\n').filter(l => l.trim());
    const tableLines = lines.filter(l => l.includes('|'));
    if (tableLines.length < 3) return null; // Need header + separator + at least 1 row
    
    const parseRow = (line: string) => line.split('|').map(c => c.trim()).filter(Boolean);
    const headers = parseRow(tableLines[0]);
    const rows = tableLines.slice(2).map(parseRow).filter(r => r.length >= 2);
    
    if (rows.length === 0) return null;
    return { headers, rows };
  }, [poContent]);

  const generatePO = async () => {
    setShowPO(true);
    setPOContent('');
    setPOLoading(true);
    try {
      await streamBusinessAI({
        action: 'po-recommender',
        onDelta: (chunk) => setPOContent(prev => prev + chunk),
        onDone: () => setPOLoading(false),
      });
    } catch (e: any) {
      toast.error(e.message || 'Error');
      setPOLoading(false);
    }
  };

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead className="text-xs cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort(field)}>
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={cn('w-3 h-3', sortField === field ? 'text-primary' : 'text-muted-foreground/40')} />
      </div>
    </TableHead>
  );

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="flex gap-2 rounded-xl bg-muted p-1 w-fit">
            {tabs.map(t => (
              <button key={t} onClick={() => setTab(t)} className={cn('rounded-lg px-4 py-1.5 text-xs font-medium transition-colors', tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
                {t}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={generatePO}>
            <Bot className="w-3.5 h-3.5" /> 🤖 PO Recomendado
          </Button>
        </div>

        {tab === 'Stock' && (
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              {([['all', 'Todos'], ['ok', '🟢 OK'], ['low', '🟡 Bajo'], ['out', '🔴 Agotado'], ['excess', '🟠 Exceso']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setFilter(key)}
                  className={cn('rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                    filter === key ? 'bg-primary/15 text-primary border-primary/30' : 'bg-card text-muted-foreground border-border')}>
                  {label} ({counts[key]})
                </button>
              ))}
            </div>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">SKU</TableHead>
                    <SortHeader field="name">Producto</SortHeader>
                    <SortHeader field="category">Categoría</SortHeader>
                    <SortHeader field="qty">Stock</SortHeader>
                    <TableHead className="text-xs w-[180px]">Nivel</TableHead>
                    <SortHeader field="value">Valor</SortHeader>
                    <SortHeader field="velocity">Vel/mes</SortHeader>
                    <SortHeader field="status">Estado</SortHeader>
                    <TableHead className="text-xs">Tendencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="text-xs font-mono text-muted-foreground">{item.sku}</TableCell>
                      <TableCell className="text-xs font-medium">{item.name}</TableCell>
                      <TableCell className="text-xs"><span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{item.category}</span></TableCell>
                      <TableCell className="text-xs text-right font-mono font-bold">{item.qty}</TableCell>
                      <TableCell className="px-2">
                        <StockThermometer qty={item.qty} reorder={item.reorder} maxQty={maxQty} />
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono">{formatUSD(item.value)}</TableCell>
                      <TableCell className="text-xs text-right font-mono text-muted-foreground">{item.velocity.toFixed(1)}</TableCell>
                      <TableCell><StatusBadge status={item.status} /></TableCell>
                      <TableCell><MiniSparkline data={item.movements} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {sorted.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Sin productos en inventario</p>}
            </div>
          </div>
        )}

        {tab === 'Reorden' && <ReorderTab />}
        {tab === 'Contenedor' && <ContainerPlanner />}
        {tab === 'Movimientos' && <MovimientosTab />}

        {tab === 'Analytics' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
                <h2 className="text-sm font-semibold text-foreground">Valor por Categoría</h2>
                <div className="flex items-center gap-6">
                  <ResponsiveContainer width={160} height={160}>
                    <PieChart><Pie data={categoryValues} innerRadius={45} outerRadius={70} dataKey="value" stroke="none">
                      {categoryValues.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie><Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatUSD(v)} /></PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {categoryValues.map(c => (
                      <div key={c.name} className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full shrink-0" style={{ background: c.color }} />
                        <span className="text-xs text-foreground">{c.name}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{formatUSD(c.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Thermometer overview by product */}
              <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
                <h2 className="text-sm font-semibold text-foreground">Stock vs Punto de Reorden</h2>
                <div className="space-y-4">
                  {[...items].sort((a, b) => (a.qty / Math.max(a.reorder, 1)) - (b.qty / Math.max(b.reorder, 1))).slice(0, 10).map(item => (
                    <div key={item.id} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-foreground truncate mr-2">{item.name}</span>
                        <span className="text-muted-foreground font-mono shrink-0">{item.qty} / {item.reorder}</span>
                      </div>
                      <StockThermometer qty={item.qty} reorder={item.reorder} maxQty={Math.max(item.reorder * 3, item.qty)} />
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-4 pt-2 border-t border-border">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-0.5 bg-destructive" />
                    <span className="text-[10px] text-muted-foreground">Punto de reorden</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-2 rounded-sm bg-success" />
                    <span className="text-[10px] text-muted-foreground">Sobre reorden</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-2 rounded-sm bg-warning" />
                    <span className="text-[10px] text-muted-foreground">Bajo reorden</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Velocity vs Stock bubble chart */}
            <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Velocidad vs Stock (Tamaño = Valor)</h2>
              {bubbleData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 18%)" />
                    <XAxis dataKey="x" name="Velocidad/mes" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} />
                    <YAxis dataKey="y" name="Stock" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} />
                    <ZAxis dataKey="z" range={[40, 400]} name="Valor" />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number, name: string) => {
                      if (name === 'Valor') return formatUSD(v);
                      return v;
                    }} labelFormatter={() => ''} />
                    <Scatter data={bubbleData} fill="hsl(217, 91%, 60%)" fillOpacity={0.6} />
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">Sin datos</div>
              )}
            </div>

            {/* Days of Supply */}
            <DaysOfSupplyChart items={items} />

            {/* Overstock Warnings */}
            <OverstockWarnings items={items} />
          </div>
        )}

        {tab === 'Envíos' && <ShipmentsTab />}
        

        {tab === 'ABC' && (
          <div className="space-y-4">
            {/* ABC definitions info */}
            <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
              <h2 className="text-sm font-semibold text-foreground">¿Qué es el Análisis ABC?</h2>
              <p className="text-xs text-muted-foreground">
                El análisis ABC clasifica productos según su contribución al valor total del inventario, combinando el valor en stock y la velocidad de venta. Permite priorizar la gestión de los productos más importantes.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(['A', 'B', 'C'] as const).map(tier => (
                  <div key={tier} className={cn('rounded-xl p-3 space-y-1', ABC_DEFINITIONS[tier].color.split(' ')[0])}>
                    <p className={cn('text-xs font-bold', ABC_DEFINITIONS[tier].color.split(' ')[1])}>{ABC_DEFINITIONS[tier].title}</p>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">{ABC_DEFINITIONS[tier].desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {([
                ['A', abcGroups.A, '70% del valor', 'bg-primary/15 text-primary'] as const,
                ['B', abcGroups.B, '20% del valor', 'bg-warning/15 text-warning'] as const,
                ['C', abcGroups.C, '10% del valor', 'bg-muted text-muted-foreground'] as const,
              ]).map(([tier, group, desc, style]) => (
                <div key={tier} className="rounded-2xl bg-card border border-border p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className={cn('h-10 w-10 rounded-lg flex items-center justify-center text-lg font-bold', style)}>{tier}</span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">Clase {tier} — {desc}</p>
                      <p className="text-xs text-muted-foreground">{group.length} productos</p>
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px]">SKU</TableHead>
                        <TableHead className="text-[10px]">Producto</TableHead>
                        <TableHead className="text-[10px] text-right">Stock</TableHead>
                        <TableHead className="text-[10px] text-right">Vel/mes</TableHead>
                        <TableHead className="text-[10px] text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.slice(0, 8).map(i => (
                        <TableRow key={i.sku}>
                          <TableCell className="text-[10px] font-mono">{i.sku}</TableCell>
                          <TableCell className="text-[10px]">{i.name}</TableCell>
                          <TableCell className="text-[10px] text-right font-mono">{i.qty}</TableCell>
                          <TableCell className="text-[10px] text-right font-mono">{i.velocity.toFixed(1)}</TableCell>
                          <TableCell className="text-[10px] text-right font-mono">{formatUSD(i.value)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* AI PO Recommender Dialog */}
      <Dialog open={showPO} onOpenChange={setShowPO}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="w-4 h-4" /> 🤖 PO Recomendado
              <Button size="sm" variant="ghost" onClick={generatePO} disabled={poLoading} className="ml-auto">
                <RefreshCw className={`w-3.5 h-3.5 ${poLoading ? 'animate-spin' : ''}`} />
              </Button>
            </DialogTitle>
          </DialogHeader>

          {/* Cash Flow Check */}
          {cashData && (
            <div className={cn('rounded-xl p-3 flex items-center gap-3 text-xs',
              cashData.estimatedCash > 0 ? 'bg-success/10' : 'bg-destructive/10')}>
              <AlertTriangle className={cn('w-4 h-4 shrink-0', cashData.estimatedCash > 0 ? 'text-success' : 'text-destructive')} />
              <div className="flex-1 grid grid-cols-4 gap-2">
                <div><span className="text-muted-foreground">Cobrado:</span> <span className="font-mono font-semibold text-success">{formatUSD(cashData.totalReceived)}</span></div>
                <div><span className="text-muted-foreground">Gastos mes:</span> <span className="font-mono text-destructive">{formatUSD(cashData.totalExpenses)}</span></div>
                <div><span className="text-muted-foreground">POs pend.:</span> <span className="font-mono text-warning">{formatUSD(cashData.pendingPOCost)}</span></div>
                <div><span className="text-muted-foreground">Disponible:</span> <span className={cn('font-mono font-bold', cashData.estimatedCash >= 0 ? 'text-success' : 'text-destructive')}>{formatUSD(cashData.estimatedCash)}</span></div>
              </div>
            </div>
          )}
          
          {poContent ? (
            poTableData ? (
              <div className="space-y-4">
                {/* Render non-table content above */}
                {poContent.split('\n').filter(l => !l.includes('|') && !l.match(/^[\s-]+$/)).filter(l => l.trim()).length > 0 && (
                  <div className="prose prose-sm prose-invert max-w-none">
                    <ReactMarkdown>
                      {poContent.split('\n').filter(l => !l.includes('|') && !l.match(/^[\s-]+$/)).join('\n')}
                    </ReactMarkdown>
                  </div>
                )}
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {poTableData.headers.map((h, i) => (
                          <TableHead key={i} className="text-xs font-semibold">{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {poTableData.rows.map((row, ri) => (
                        <TableRow key={ri}>
                          {row.map((cell, ci) => (
                            <TableCell key={ci} className="text-xs">{cell}</TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="prose prose-sm prose-invert max-w-none">
                <ReactMarkdown>{poContent}</ReactMarkdown>
              </div>
            )
          ) : (
            <div className="text-center text-muted-foreground py-8">
              {poLoading ? <p className="animate-pulse">Analizando inventario y generando PO...</p> : <p>Generando...</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
