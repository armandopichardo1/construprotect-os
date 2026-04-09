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
import { Bot, RefreshCw } from 'lucide-react';
import { streamBusinessAI } from '@/lib/business-ai';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';

const tabs = ['Stock', 'Analytics', 'Envíos', 'ABC'];
const chartTooltipStyle = { background: 'hsl(222, 20%, 10%)', border: '1px solid hsl(222, 20%, 20%)', borderRadius: 8, fontSize: 12 };

const shipments = [
  { id: 'ENV-2847', supplier: 'Porcelanosa España', items: 12, eta: '2026-04-18', step: 2, steps: ['Ordenado', 'Tránsito', 'Aduanas', 'Almacén', 'Recibido'] },
  { id: 'ENV-2851', supplier: 'Marazzi Italia', items: 8, eta: '2026-04-25', step: 1, steps: ['Ordenado', 'Tránsito', 'Aduanas', 'Almacén', 'Recibido'] },
  { id: 'ENV-2839', supplier: 'Interceramic MX', items: 5, eta: '2026-04-12', step: 4, steps: ['Ordenado', 'Tránsito', 'Aduanas', 'Almacén', 'Recibido'] },
];

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

type StockItem = {
  id: string; name: string; sku: string; qty: number; reorder: number;
  status: string; category: string; value: number; movements: number[];
  velocity: number; costUsd: number;
};

export default function InventarioPage() {
  const [tab, setTab] = useState('Stock');
  const [filter, setFilter] = useState('all');
  const [showPO, setShowPO] = useState(false);
  const [poContent, setPOContent] = useState('');
  const [poLoading, setPOLoading] = useState(false);
  const queryClient = useQueryClient();

  // Realtime: auto-refresh inventory when any user makes changes
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
  const sorted = [...filtered].sort((a, b) => {
    const order = { out: 0, low: 1, excess: 2, ok: 3 };
    return (order[a.status as keyof typeof order] ?? 4) - (order[b.status as keyof typeof order] ?? 4);
  });

  const categoryValues = useMemo(() => {
    const cats: Record<string, number> = {};
    items.forEach(i => { cats[i.category] = (cats[i.category] || 0) + i.value; });
    const colors = ['hsl(217, 91%, 60%)', 'hsl(160, 84%, 39%)', 'hsl(38, 92%, 50%)', 'hsl(280, 60%, 55%)', 'hsl(0, 84%, 60%)'];
    return Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([name, value], i) => ({ name, value, color: colors[i] || colors[4] }));
  }, [items]);

  const daysOfSupply = useMemo(() => {
    return items.map(i => {
      const avgMonthly = i.velocity;
      const days = avgMonthly > 0 ? Math.round((i.qty / avgMonthly) * 30) : 999;
      return { name: i.name, days: Math.min(days, 120), color: days < 15 ? 'hsl(0, 84%, 60%)' : days < 30 ? 'hsl(38, 92%, 50%)' : 'hsl(160, 84%, 39%)' };
    }).sort((a, b) => a.days - b.days).slice(0, 10);
  }, [items]);

  // Velocity vs Stock bubble chart data
  const bubbleData = useMemo(() => {
    return items.filter(i => i.velocity > 0 || i.qty > 0).map(i => ({
      x: i.velocity, y: i.qty, z: i.value, name: i.name, status: i.status,
    }));
  }, [items]);

  const abcGroups = useMemo(() => {
    // ABC based on revenue (velocity * price) + velocity
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
                    <TableHead className="text-xs">Producto</TableHead>
                    <TableHead className="text-xs">Categoría</TableHead>
                    <TableHead className="text-xs text-right">Stock</TableHead>
                    <TableHead className="text-xs text-right">Reorden</TableHead>
                    <TableHead className="text-xs text-right">Valor</TableHead>
                    <TableHead className="text-xs text-right">Vel/mes</TableHead>
                    <TableHead className="text-xs">Estado</TableHead>
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
                      <TableCell className="text-xs text-right font-mono text-muted-foreground">{item.reorder}</TableCell>
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
              <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
                <h2 className="text-sm font-semibold text-foreground">Días de Suministro</h2>
                <div className="space-y-3">
                  {daysOfSupply.map(d => (
                    <div key={d.name} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-foreground truncate mr-2">{d.name}</span>
                        <span className="text-muted-foreground shrink-0">{d.days >= 120 ? '120+' : d.days}d</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(d.days, 120) / 120 * 100}%`, background: d.color }} />
                      </div>
                    </div>
                  ))}
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
          </div>
        )}

        {tab === 'Envíos' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {shipments.map(s => (
              <div key={s.id} className="rounded-2xl bg-card border border-border p-5 space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{s.id}</p>
                    <p className="text-xs text-muted-foreground">{s.supplier}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{s.items} ítems</p>
                    <p className="text-xs text-primary font-medium">ETA: {s.eta}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {s.steps.map((step, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className={cn('h-1.5 w-full rounded-full', i <= s.step ? 'bg-primary' : 'bg-muted')} />
                      <span className={cn('text-[8px]', i <= s.step ? 'text-primary font-medium' : 'text-muted-foreground')}>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'ABC' && (
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
        )}
      </div>

      {/* AI PO Recommender Dialog */}
      <Dialog open={showPO} onOpenChange={setShowPO}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="w-4 h-4" /> 🤖 PO Recomendado
              <Button size="sm" variant="ghost" onClick={generatePO} disabled={poLoading} className="ml-auto">
                <RefreshCw className={`w-3.5 h-3.5 ${poLoading ? 'animate-spin' : ''}`} />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm prose-invert max-w-none">
            {poContent ? <ReactMarkdown>{poContent}</ReactMarkdown> : (
              <div className="text-center text-muted-foreground py-8">
                {poLoading ? <p className="animate-pulse">Analizando inventario y generando PO...</p> : <p>Generando...</p>}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
