import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/lib/format';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { exportToExcel } from '@/lib/export-utils';
import { AlertTriangle, TrendingDown, PackageX, Archive, Download } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts';

const chartTooltipStyle = { background: 'hsl(222,20%,10%)', border: '1px solid hsl(222,20%,20%)', borderRadius: 8, fontSize: 12 };

type AlertItem = {
  sku: string;
  name: string;
  category: string;
  qty: number;
  reorder: number;
  costUsd: number;
  value: number;
  alertType: 'critical' | 'overstock' | 'dormant';
  daysSinceMove: number | null;
};

export function AlertsDashboard() {
  const { data: products = [] } = useQuery({
    queryKey: ['products-active-alerts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('id, sku, name, category, unit_cost_usd, reorder_point')
        .eq('is_active', true);
      return data || [];
    },
  });

  const { data: inventory = [] } = useQuery({
    queryKey: ['inventory-alerts'],
    queryFn: async () => {
      const { data } = await supabase.from('inventory').select('product_id, quantity_on_hand');
      return data || [];
    },
  });

  const { data: lastMovements = [] } = useQuery({
    queryKey: ['last-movements-alerts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('inventory_movements')
        .select('product_id, created_at')
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  const alerts: AlertItem[] = useMemo(() => {
    const invMap: Record<string, number> = {};
    inventory.forEach((i: any) => { invMap[i.product_id] = i.quantity_on_hand; });

    const lastMoveMap: Record<string, string> = {};
    (lastMovements as any[]).forEach(m => {
      if (!lastMoveMap[m.product_id]) lastMoveMap[m.product_id] = m.created_at;
    });

    const now = new Date();
    const result: AlertItem[] = [];

    products.forEach((p: any) => {
      const qty = invMap[p.id] ?? 0;
      const reorder = Number(p.reorder_point) || 10;
      const costUsd = Number(p.unit_cost_usd) || 0;
      const value = qty * costUsd;
      const lastMove = lastMoveMap[p.id];
      const daysSinceMove = lastMove
        ? Math.floor((now.getTime() - new Date(lastMove).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      // Critical: stock is 0 or below reorder point
      if (qty <= reorder) {
        result.push({ sku: p.sku, name: p.name, category: p.category || 'Otros', qty, reorder, costUsd, value, alertType: 'critical', daysSinceMove });
      }
      // Overstock: qty > 5x reorder point
      if (qty > reorder * 5 && reorder > 0) {
        result.push({ sku: p.sku, name: p.name, category: p.category || 'Otros', qty, reorder, costUsd, value, alertType: 'overstock', daysSinceMove });
      }
      // Dormant: no movement in 60+ days (and has stock)
      if (qty > 0 && (daysSinceMove === null || daysSinceMove >= 60)) {
        result.push({ sku: p.sku, name: p.name, category: p.category || 'Otros', qty, reorder, costUsd, value, alertType: 'dormant', daysSinceMove });
      }
    });

    return result;
  }, [products, inventory, lastMovements]);

  const critical = alerts.filter(a => a.alertType === 'critical');
  const overstock = alerts.filter(a => a.alertType === 'overstock');
  const dormant = alerts.filter(a => a.alertType === 'dormant');

  const pieData = [
    { name: 'Stock Crítico', value: critical.length, color: 'hsl(0, 84%, 60%)' },
    { name: 'Sobre-stock', value: overstock.length, color: 'hsl(38, 92%, 50%)' },
    { name: 'Sin Movimiento', value: dormant.length, color: 'hsl(220, 12%, 50%)' },
  ].filter(d => d.value > 0);

  const categoryBreakdown = useMemo(() => {
    const map: Record<string, { critical: number; overstock: number; dormant: number }> = {};
    alerts.forEach(a => {
      if (!map[a.category]) map[a.category] = { critical: 0, overstock: 0, dormant: 0 };
      map[a.category][a.alertType]++;
    });
    return Object.entries(map).map(([name, counts]) => ({ name, ...counts })).sort((a, b) => (b.critical + b.overstock + b.dormant) - (a.critical + a.overstock + a.dormant));
  }, [alerts]);

  const handleExport = () => {
    if (alerts.length === 0) return;
    exportToExcel(alerts.map(a => ({
      Tipo: a.alertType === 'critical' ? '🔴 Stock Crítico' : a.alertType === 'overstock' ? '🟠 Sobre-stock' : '⚪ Sin Movimiento',
      SKU: a.sku,
      Producto: a.name,
      Categoría: a.category,
      'Stock Actual': a.qty,
      'Punto Reorden': a.reorder,
      'Costo Unit. USD': a.costUsd,
      'Valor Inventario USD': a.value,
      'Días Sin Movimiento': a.daysSinceMove ?? 'N/A',
    })), 'alertas-inventario', 'Alertas Inventario');
  };

  const totalValueAtRisk = critical.reduce((s, a) => s + (a.reorder - a.qty) * a.costUsd, 0);
  const totalOverstockValue = overstock.reduce((s, a) => s + a.value, 0);
  const totalDormantValue = dormant.reduce((s, a) => s + a.value, 0);

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-warning" /> Panel de Alertas de Inventario
        </h2>
        <Button size="sm" variant="outline" onClick={handleExport} disabled={alerts.length === 0}>
          <Download className="w-3.5 h-3.5 mr-1" /> Excel
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <AlertKpi icon={<PackageX className="w-4 h-4" />} label="Stock Crítico" count={critical.length} subtext={`${formatUSD(totalValueAtRisk)} para reabastecer`} color="text-destructive" bgColor="bg-destructive/10" />
        <AlertKpi icon={<Archive className="w-4 h-4" />} label="Sobre-stock" count={overstock.length} subtext={`${formatUSD(totalOverstockValue)} en exceso`} color="text-warning" bgColor="bg-warning/10" />
        <AlertKpi icon={<TrendingDown className="w-4 h-4" />} label="Sin Movimiento 60d+" count={dormant.length} subtext={`${formatUSD(totalDormantValue)} inmovilizado`} color="text-muted-foreground" bgColor="bg-muted" />
        <AlertKpi icon={<AlertTriangle className="w-4 h-4" />} label="Total Alertas" count={alerts.length} subtext={`${products.length} productos monitoreados`} color="text-primary" bgColor="bg-primary/10" />
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-4">
        {pieData.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">Distribución de Alertas</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} paddingAngle={3} strokeWidth={0}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => [`${v} productos`, '']} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-2">
              {pieData.map(d => (
                <div key={d.name} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                  <span className="text-[10px] text-muted-foreground">{d.name} ({d.value})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {categoryBreakdown.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold mb-3">Alertas por Categoría</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={categoryBreakdown} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(222,10%,55%)' }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: 'hsl(222,10%,55%)' }} />
                <Tooltip contentStyle={chartTooltipStyle} />
                <Bar dataKey="critical" name="Crítico" stackId="a" fill="hsl(0, 84%, 60%)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="overstock" name="Sobre-stock" stackId="a" fill="hsl(38, 92%, 50%)" />
                <Bar dataKey="dormant" name="Sin Movimiento" stackId="a" fill="hsl(220, 12%, 50%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Critical Stock Table */}
      {critical.length > 0 && (
        <AlertTable
          title="🔴 Stock Crítico — Requiere Acción Inmediata"
          items={critical}
          highlight="destructive"
        />
      )}

      {/* Overstock Table */}
      {overstock.length > 0 && (
        <AlertTable
          title="🟠 Sobre-stock — Capital Inmovilizado"
          items={overstock}
          highlight="warning"
        />
      )}

      {/* Dormant Table */}
      {dormant.length > 0 && (
        <AlertTable
          title="⚪ Sin Movimiento en 60+ Días"
          items={dormant}
          highlight="muted"
        />
      )}

      {alerts.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">✅ No hay alertas activas. Todos los productos están dentro de parámetros normales.</p>
        </div>
      )}
    </div>
  );
}

function AlertKpi({ icon, label, count, subtext, color, bgColor }: {
  icon: React.ReactNode; label: string; count: number; subtext: string; color: string; bgColor: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-2 mb-1">
        <div className={cn('p-1.5 rounded-lg', bgColor, color)}>{icon}</div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
      </div>
      <p className={cn('text-2xl font-bold', color)}>{count}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{subtext}</p>
    </div>
  );
}

function AlertTable({ title, items, highlight }: { title: string; items: AlertItem[]; highlight: string }) {
  const borderColor = highlight === 'destructive' ? 'border-destructive/30' : highlight === 'warning' ? 'border-warning/30' : 'border-border';
  return (
    <div className={cn('rounded-xl border bg-card overflow-hidden', borderColor)}>
      <div className="p-3 border-b border-border">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="max-h-[350px] overflow-auto">
        <Table wrapperClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
            <TableRow>
              <TableHead className="text-xs">SKU</TableHead>
              <TableHead className="text-xs">Producto</TableHead>
              <TableHead className="text-xs">Categoría</TableHead>
              <TableHead className="text-xs text-right">Stock</TableHead>
              <TableHead className="text-xs text-right">Reorden</TableHead>
              <TableHead className="text-xs text-right">Valor USD</TableHead>
              <TableHead className="text-xs text-right">Días s/Mov.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, i) => (
              <TableRow key={`${item.sku}-${i}`}>
                <TableCell className="text-xs font-mono text-muted-foreground">{item.sku}</TableCell>
                <TableCell className="text-xs font-medium truncate max-w-[200px]">{item.name}</TableCell>
                <TableCell className="text-xs"><Badge variant="secondary" className="text-[10px]">{item.category}</Badge></TableCell>
                <TableCell className={cn('text-xs text-right font-mono font-bold', item.qty === 0 ? 'text-destructive' : item.qty <= item.reorder ? 'text-warning' : '')}>{item.qty}</TableCell>
                <TableCell className="text-xs text-right font-mono text-muted-foreground">{item.reorder}</TableCell>
                <TableCell className="text-xs text-right font-mono">{formatUSD(item.value)}</TableCell>
                <TableCell className="text-xs text-right font-mono text-muted-foreground">{item.daysSinceMove ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
