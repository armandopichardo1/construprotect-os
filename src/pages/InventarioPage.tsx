import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/lib/format';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ExcelImportDialog } from '@/components/ExcelImportDialog';
import { toast } from 'sonner';

const tabs = ['Stock', 'Productos', 'Analytics', 'Envíos', 'ABC'];
const productCategories = ['Pisos', 'Revestimientos', 'Mosaicos', 'Accesorios', 'Adhesivos', 'Herramientas'];

const shipments = [
  { id: 'ENV-2847', supplier: 'Porcelanosa España', items: 12, eta: '2026-04-18', step: 2, steps: ['Ordenado', 'Tránsito', 'Aduanas', 'Almacén', 'Recibido'] },
  { id: 'ENV-2851', supplier: 'Marazzi Italia', items: 8, eta: '2026-04-25', step: 1, steps: ['Ordenado', 'Tránsito', 'Aduanas', 'Almacén', 'Recibido'] },
  { id: 'ENV-2839', supplier: 'Interceramic MX', items: 5, eta: '2026-04-12', step: 4, steps: ['Ordenado', 'Tránsito', 'Aduanas', 'Almacén', 'Recibido'] },
];

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ok: 'bg-success/15 text-success',
    low: 'bg-warning/15 text-warning',
    out: 'bg-destructive/15 text-destructive',
    excess: 'bg-primary/15 text-primary',
  };
  const labels: Record<string, string> = { ok: 'OK', low: 'Bajo', out: 'Agotado', excess: 'Exceso' };
  return (
    <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', styles[status])}>
      {labels[status]}
    </span>
  );
}

function MiniSparkline({ data }: { data: number[] }) {
  if (!data.length) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => `${(i / Math.max(data.length - 1, 1)) * 50},${20 - ((v - min) / range) * 18}`).join(' ');
  const trending = data[data.length - 1] >= data[0];
  return (
    <svg width="50" height="22" className="shrink-0">
      <polyline points={points} fill="none" stroke={trending ? 'hsl(160, 84%, 39%)' : 'hsl(0, 84%, 60%)'} strokeWidth="1.5" />
    </svg>
  );
}

type StockItem = {
  id: string; name: string; sku: string; qty: number; reorder: number;
  status: string; category: string; value: number; movements: number[];
};

  const [prodSearch, setProdSearch] = useState('');
  const [prodCatFilter, setProdCatFilter] = useState('');
  const [prodDialogOpen, setProdDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: allProducts = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').eq('is_active', true).order('name');
      if (error) throw error;
      return data;
    },
  });

  const addProductMutation = useMutation({
    mutationFn: async (product: any) => {
      const { error } = await supabase.from('products').insert(product);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      setProdDialogOpen(false);
      toast.success('Producto creado');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const { data: stockData } = useQuery({
    queryKey: ['inventory-stock'],
    queryFn: async () => {
      const [{ data: inv }, { data: products }, { data: movements }] = await Promise.all([
        supabase.from('inventory').select('*'),
        supabase.from('products').select('id, sku, name, category, unit_cost_usd, reorder_point'),
        supabase.from('inventory_movements').select('product_id, quantity, created_at').order('created_at'),
      ]);
      if (!inv || !products) return [];

      const productMap = Object.fromEntries(products.map(p => [p.id, p]));

      // Build monthly movement sums per product (last 6 months)
      const movementsByProduct: Record<string, number[]> = {};
      const now = new Date();
      (movements || []).forEach(m => {
        const date = new Date(m.created_at);
        const monthsAgo = (now.getFullYear() - date.getFullYear()) * 12 + now.getMonth() - date.getMonth();
        if (monthsAgo > 5 || monthsAgo < 0) return;
        const idx = 5 - monthsAgo;
        if (!movementsByProduct[m.product_id]) movementsByProduct[m.product_id] = [0, 0, 0, 0, 0, 0];
        movementsByProduct[m.product_id][idx] += Math.abs(m.quantity);
      });

      return inv.map(i => {
        const p = productMap[i.product_id];
        if (!p) return null;
        const qty = i.quantity_on_hand;
        let status = 'ok';
        if (qty === 0) status = 'out';
        else if (qty <= Number(p.reorder_point)) status = 'low';
        else if (qty > Number(p.reorder_point) * 5) status = 'excess';

        return {
          id: i.id, name: p.name, sku: p.sku, qty, reorder: Number(p.reorder_point),
          status, category: p.category || 'Otros',
          value: qty * Number(p.unit_cost_usd),
          movements: movementsByProduct[i.product_id] || [0, 0, 0, 0, 0, 0],
        } as StockItem;
      }).filter(Boolean) as StockItem[];
    },
  });

  const items = stockData || [];
  const counts = useMemo(() => ({
    all: items.length,
    ok: items.filter(i => i.status === 'ok').length,
    low: items.filter(i => i.status === 'low').length,
    out: items.filter(i => i.status === 'out').length,
    excess: items.filter(i => i.status === 'excess').length,
  }), [items]);

  const filtered = filter === 'all' ? items : items.filter(i => i.status === filter);
  const sorted = [...filtered].sort((a, b) => {
    const order = { out: 0, low: 1, excess: 2, ok: 3 };
    return (order[a.status as keyof typeof order] ?? 4) - (order[b.status as keyof typeof order] ?? 4);
  });

  // Analytics data
  const categoryValues = useMemo(() => {
    const cats: Record<string, number> = {};
    items.forEach(i => { cats[i.category] = (cats[i.category] || 0) + i.value; });
    const colors = ['hsl(217, 91%, 60%)', 'hsl(160, 84%, 39%)', 'hsl(38, 92%, 50%)', 'hsl(280, 60%, 55%)', 'hsl(0, 84%, 60%)'];
    return Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([name, value], i) => ({ name, value, color: colors[i] || colors[4] }));
  }, [items]);

  const daysOfSupply = useMemo(() => {
    return items
      .map(i => {
        const totalMovement = i.movements.reduce((a, b) => a + b, 0);
        const avgMonthly = totalMovement / 6;
        const days = avgMonthly > 0 ? Math.round((i.qty / avgMonthly) * 30) : 999;
        return { name: i.name, days: Math.min(days, 120), color: days < 15 ? 'hsl(0, 84%, 60%)' : days < 30 ? 'hsl(38, 92%, 50%)' : 'hsl(160, 84%, 39%)' };
      })
      .sort((a, b) => a.days - b.days)
      .slice(0, 8);
  }, [items]);

  // ABC
  const abcGroups = useMemo(() => {
    const byValue = [...items].sort((a, b) => b.value - a.value);
    const total = byValue.reduce((s, i) => s + i.value, 0);
    let cum = 0;
    const A: StockItem[] = [], B: StockItem[] = [], C: StockItem[] = [];
    byValue.forEach(i => {
      cum += i.value;
      if (cum / total <= 0.7) A.push(i);
      else if (cum / total <= 0.9) B.push(i);
      else C.push(i);
    });
    return { A, B, C };
  }, [items]);

  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="text-lg font-bold text-foreground">Inventario</h1>

        <div className="flex gap-1 rounded-xl bg-muted p-1">
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)} className={cn('flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors', tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'Stock' && (
          <div className="space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {([['all', 'Todos'], ['ok', '🟢 OK'], ['low', '🟡 Bajo'], ['out', '🔴 Agotado'], ['excess', '🟠 Exceso']] as const).map(([key, label]) => (
                <button key={key} onClick={() => setFilter(key)}
                  className={cn('shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                    filter === key ? 'bg-primary/15 text-primary border-primary/30' : 'bg-card text-muted-foreground border-border')}>
                  {label} ({counts[key]})
                </button>
              ))}
            </div>
            {sorted.map(item => (
              <div key={item.id} className="rounded-xl bg-card border border-border p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground">{item.sku} · {item.category}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-lg font-bold text-foreground">{item.qty}</p>
                      <p className="text-[10px] text-muted-foreground">en stock</p>
                    </div>
                    <p className="text-xs text-muted-foreground">Reorden: {item.reorder}</p>
                  </div>
                  <MiniSparkline data={item.movements} />
                </div>
              </div>
            ))}
            {sorted.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Sin productos en inventario</p>}
          </div>
        )}

        {tab === 'Analytics' && (
          <div className="space-y-4">
            <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Valor de Inventario por Categoría</h2>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={120} height={120}>
                  <PieChart><Pie data={categoryValues} innerRadius={35} outerRadius={55} dataKey="value" stroke="none">
                    {categoryValues.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie></PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5">
                  {categoryValues.map(c => (
                    <div key={c.name} className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                      <span className="text-xs text-foreground">{c.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{formatUSD(c.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Días de Suministro</h2>
              <div className="space-y-2.5">
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
        )}

        {tab === 'Envíos' && (
          <div className="space-y-3">
            {shipments.map(s => (
              <div key={s.id} className="rounded-2xl bg-card border border-border p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{s.id}</p>
                    <p className="text-xs text-muted-foreground">{s.supplier}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{s.items} ítems</p>
                    <p className="text-xs text-primary">ETA: {s.eta}</p>
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
          <div className="space-y-3">
            {([['A', abcGroups.A, '70% del valor', 'bg-primary/15 text-primary'] as const,
              ['B', abcGroups.B, '20% del valor', 'bg-warning/15 text-warning'] as const,
              ['C', abcGroups.C, '10% del valor', 'bg-muted text-muted-foreground'] as const,
            ]).map(([tier, group, desc, style]) => (
              <div key={tier} className="rounded-2xl bg-card border border-border p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className={cn('h-8 w-8 rounded-lg flex items-center justify-center text-sm font-bold', style)}>{tier}</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Clase {tier} — {desc}</p>
                    <p className="text-[10px] text-muted-foreground">{group.length} productos</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {group.map(i => (
                    <span key={i.sku} className="rounded-full bg-muted px-2.5 py-1 text-[10px] text-foreground">{i.name}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
