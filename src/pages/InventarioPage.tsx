import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

const statusFilters = [
  { key: 'all', label: 'Todos', count: 47 },
  { key: 'ok', label: '🟢 OK', count: 32 },
  { key: 'low', label: '🟡 Bajo', count: 8 },
  { key: 'out', label: '🔴 Agotado', count: 3 },
  { key: 'excess', label: '🟠 Exceso', count: 4 },
];

const stockItems = [
  { name: 'Porcelanato Calacatta 60x60', sku: 'PRC-001', qty: 245, reorder: 100, status: 'ok', trend: [40, 55, 48, 60, 52, 45] },
  { name: 'Gres Manhattan Grey', sku: 'GRM-012', qty: 18, reorder: 50, status: 'low', trend: [80, 65, 50, 40, 30, 18] },
  { name: 'Mosaico Hexagonal Blanco', sku: 'MHB-005', qty: 0, reorder: 30, status: 'out', trend: [25, 20, 15, 8, 3, 0] },
  { name: 'Cenefa Mármol Gold', sku: 'CMG-008', qty: 312, reorder: 40, status: 'excess', trend: [100, 150, 200, 250, 290, 312] },
  { name: 'Piso Vinílico Oak Natural', sku: 'PVO-003', qty: 89, reorder: 60, status: 'ok', trend: [120, 110, 105, 95, 90, 89] },
  { name: 'Adhesivo Premium 25kg', sku: 'APR-020', qty: 5, reorder: 20, status: 'low', trend: [45, 38, 28, 18, 10, 5] },
];

const categoryValues = [
  { name: 'Pisos', value: 85400, color: 'hsl(217, 91%, 60%)' },
  { name: 'Revestimientos', value: 42300, color: 'hsl(160, 84%, 39%)' },
  { name: 'Accesorios', value: 28100, color: 'hsl(38, 92%, 50%)' },
  { name: 'Adhesivos', value: 15800, color: 'hsl(280, 60%, 55%)' },
];

const daysOfSupply = [
  { name: 'Porcelanato Calacatta', days: 45, color: 'hsl(160, 84%, 39%)' },
  { name: 'Gres Manhattan', days: 12, color: 'hsl(38, 92%, 50%)' },
  { name: 'Adhesivo Premium', days: 5, color: 'hsl(0, 84%, 60%)' },
  { name: 'Cenefa Mármol', days: 90, color: 'hsl(217, 91%, 60%)' },
  { name: 'Piso Vinílico', days: 30, color: 'hsl(160, 84%, 39%)' },
];

const shipments = [
  { id: 'ENV-2847', supplier: 'Porcelanosa España', items: 12, eta: '2026-04-18', step: 2, steps: ['Ordenado', 'Tránsito', 'Aduanas', 'Almacén', 'Recibido'] },
  { id: 'ENV-2851', supplier: 'Marazzi Italia', items: 8, eta: '2026-04-25', step: 1, steps: ['Ordenado', 'Tránsito', 'Aduanas', 'Almacén', 'Recibido'] },
  { id: 'ENV-2839', supplier: 'Interceramic MX', items: 5, eta: '2026-04-12', step: 4, steps: ['Ordenado', 'Tránsito', 'Aduanas', 'Almacén', 'Recibido'] },
];

const abcData = {
  A: { label: 'Clase A — 70% ingresos', count: 8, items: ['Porcelanato Calacatta', 'Gres Manhattan', 'Mosaico Hexagonal'] },
  B: { label: 'Clase B — 20% ingresos', count: 15, items: ['Cenefa Mármol', 'Piso Vinílico', 'Listelo Acero'] },
  C: { label: 'Clase C — 10% ingresos', count: 24, items: ['Adhesivo Premium', 'Crucetas 3mm', 'Boquilla Gris'] },
};

const tabs = ['Stock', 'Analytics', 'Envíos', 'ABC'];

function MiniSparkline({ data }: { data: number[] }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => `${(i / (data.length - 1)) * 50},${20 - ((v - min) / range) * 18}`).join(' ');
  const trending = data[data.length - 1] >= data[0];
  return (
    <svg width="50" height="22" className="shrink-0">
      <polyline points={points} fill="none" stroke={trending ? 'hsl(160, 84%, 39%)' : 'hsl(0, 84%, 60%)'} strokeWidth="1.5" />
    </svg>
  );
}

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

export default function InventarioPage() {
  const [tab, setTab] = useState('Stock');
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all' ? stockItems : stockItems.filter(i => i.status === filter);

  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="text-lg font-bold text-foreground">Inventario</h1>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-muted p-1">
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              )}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'Stock' && (
          <div className="space-y-3">
            {/* Filters */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {statusFilters.map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                    filter === f.key
                      ? 'bg-primary/15 text-primary border-primary/30'
                      : 'bg-card text-muted-foreground border-border'
                  )}
                >
                  {f.label} ({f.count})
                </button>
              ))}
            </div>

            {/* Items */}
            {filtered.map(item => (
              <div key={item.sku} className="rounded-xl bg-card border border-border p-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground">{item.sku}</p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-lg font-bold text-foreground">{item.qty}</p>
                      <p className="text-[10px] text-muted-foreground">en stock</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Reorden: {item.reorder}</p>
                    </div>
                  </div>
                  <MiniSparkline data={item.trend} />
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'Analytics' && (
          <div className="space-y-4">
            {/* Inventory Value Donut */}
            <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Valor de Inventario por Categoría</h2>
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={120} height={120}>
                  <PieChart>
                    <Pie data={categoryValues} innerRadius={35} outerRadius={55} dataKey="value" stroke="none">
                      {categoryValues.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5">
                  {categoryValues.map(c => (
                    <div key={c.name} className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                      <span className="text-xs text-foreground">{c.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">${(c.value / 1000).toFixed(1)}K</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Days of Supply */}
            <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Días de Suministro</h2>
              <div className="space-y-2.5">
                {daysOfSupply.map(d => (
                  <div key={d.name} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-foreground">{d.name}</span>
                      <span className="text-muted-foreground">{d.days}d</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(d.days, 90) / 90 * 100}%`, background: d.color }} />
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
                {/* Step Progress */}
                <div className="flex items-center gap-1">
                  {s.steps.map((step, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div className={cn(
                        'h-1.5 w-full rounded-full',
                        i <= s.step ? 'bg-primary' : 'bg-muted'
                      )} />
                      <span className={cn(
                        'text-[8px]',
                        i <= s.step ? 'text-primary font-medium' : 'text-muted-foreground'
                      )}>
                        {step}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'ABC' && (
          <div className="space-y-3">
            {(Object.entries(abcData) as [string, typeof abcData.A][]).map(([tier, data]) => (
              <div key={tier} className="rounded-2xl bg-card border border-border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      'h-8 w-8 rounded-lg flex items-center justify-center text-sm font-bold',
                      tier === 'A' ? 'bg-primary/15 text-primary' :
                      tier === 'B' ? 'bg-warning/15 text-warning' :
                      'bg-muted text-muted-foreground'
                    )}>
                      {tier}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{data.label}</p>
                      <p className="text-[10px] text-muted-foreground">{data.count} productos</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {data.items.map(item => (
                    <span key={item} className="rounded-full bg-muted px-2.5 py-1 text-[10px] text-foreground">
                      {item}
                    </span>
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
