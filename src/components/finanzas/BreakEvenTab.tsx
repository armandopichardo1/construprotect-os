import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatUSD, getGlobalExchangeRate } from '@/lib/format';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine, Area, AreaChart } from 'recharts';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const chartTooltipStyle = { background: 'hsl(222, 20%, 10%)', border: '1px solid hsl(222, 20%, 20%)', borderRadius: 8, fontSize: 12 };

interface Props {
  sales: any[];
  saleItems: any[];
  expenses: any[];
}

export function BreakEvenTab({ sales, saleItems, expenses }: Props) {
  const now = useMemo(() => new Date(), []);

  // Calculate averages from last 3 months of data
  const metrics = useMemo(() => {
    const monthKeys: string[] = [];
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    let totalRevenue = 0, totalCogs = 0, totalExpenses = 0, totalUnits = 0;
    monthKeys.forEach(key => {
      const monthSales = sales.filter((s: any) => s.date?.startsWith(key));
      totalRevenue += monthSales.reduce((s: number, r: any) => s + Number(r.total_usd || 0), 0);
      const saleIds = new Set(monthSales.map((s: any) => s.id));
      const items = saleItems.filter((si: any) => saleIds.has(si.sale_id));
      totalCogs += items.reduce((s: number, r: any) => s + Number(r.unit_cost_usd || 0) * Number(r.quantity || 0), 0);
      totalUnits += items.reduce((s: number, r: any) => s + Number(r.quantity || 0), 0);
      totalExpenses += expenses.filter((e: any) => e.date?.startsWith(key)).reduce((s: number, r: any) => s + Number(r.amount_usd || 0), 0);
    });

    const avgMonthlyRevenue = totalRevenue / Math.max(monthKeys.length, 1);
    const avgMonthlyExpenses = totalExpenses / Math.max(monthKeys.length, 1);
    const avgMonthlyCogs = totalCogs / Math.max(monthKeys.length, 1);
    const avgMonthlyUnits = totalUnits / Math.max(monthKeys.length, 1);
    const avgPricePerUnit = avgMonthlyUnits > 0 ? avgMonthlyRevenue / avgMonthlyUnits : 0;
    const avgCostPerUnit = avgMonthlyUnits > 0 ? avgMonthlyCogs / avgMonthlyUnits : 0;
    const contributionMargin = avgPricePerUnit - avgCostPerUnit;
    const contributionMarginPct = avgPricePerUnit > 0 ? (contributionMargin / avgPricePerUnit) * 100 : 0;

    return { avgMonthlyRevenue, avgMonthlyExpenses, avgMonthlyCogs, avgMonthlyUnits, avgPricePerUnit, avgCostPerUnit, contributionMargin, contributionMarginPct };
  }, [sales, saleItems, expenses, now]);

  const [fixedCosts, setFixedCosts] = useState(String(Math.round(metrics.avgMonthlyExpenses)));

  const fc = Number(fixedCosts) || 0;
  const breakEvenUnits = metrics.contributionMargin > 0 ? Math.ceil(fc / metrics.contributionMargin) : 0;
  const breakEvenRevenue = metrics.contributionMarginPct > 0 ? fc / (metrics.contributionMarginPct / 100) : 0;
  const currentVsBreakeven = metrics.avgMonthlyUnits > 0 && breakEvenUnits > 0
    ? ((metrics.avgMonthlyUnits - breakEvenUnits) / breakEvenUnits) * 100 : 0;

  // Chart data
  const chartData = useMemo(() => {
    const maxUnits = Math.max(breakEvenUnits * 2, Math.round(metrics.avgMonthlyUnits * 1.5), 100);
    const points: { units: number; revenue: number; totalCost: number; profit: number }[] = [];
    for (let u = 0; u <= maxUnits; u += Math.max(1, Math.floor(maxUnits / 40))) {
      const revenue = u * metrics.avgPricePerUnit;
      const totalCost = fc + (u * metrics.avgCostPerUnit);
      points.push({ units: u, revenue, totalCost, profit: revenue - totalCost });
    }
    return points;
  }, [breakEvenUnits, metrics, fc]);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Punto de Equilibrio', value: `${breakEvenUnits.toLocaleString()} uds`, color: 'text-primary' },
          { label: 'Ingreso Equilibrio', value: formatUSD(breakEvenRevenue), color: 'text-primary' },
          { label: 'Margen Contribución', value: `${metrics.contributionMarginPct.toFixed(1)}%`, color: metrics.contributionMarginPct > 0 ? 'text-success' : 'text-destructive' },
          { label: 'vs Equilibrio', value: `${currentVsBreakeven >= 0 ? '+' : ''}${currentVsBreakeven.toFixed(0)}%`, color: currentVsBreakeven >= 0 ? 'text-success' : 'text-destructive' },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-2xl bg-card border border-border p-4 text-center">
            <p className={cn('text-xl font-bold', kpi.color)}>{kpi.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Inputs */}
        <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Parámetros</h2>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Costos Fijos Mensuales (USD)</Label>
              <Input type="number" value={fixedCosts} onChange={e => setFixedCosts(e.target.value)} className="mt-1" />
              <p className="text-[10px] text-muted-foreground mt-1">Promedio 3 meses: {formatUSD(metrics.avgMonthlyExpenses)}</p>
            </div>
            <div className="border-t border-border pt-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Precio Prom./ud</span>
                <span className="font-mono">{formatUSD(metrics.avgPricePerUnit)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Costo Prom./ud</span>
                <span className="font-mono">{formatUSD(metrics.avgCostPerUnit)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Margen Contrib./ud</span>
                <span className="font-mono font-semibold text-success">{formatUSD(metrics.contributionMargin)}</span>
              </div>
              <div className="border-t border-border pt-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Ventas Prom./mes</span>
                  <span className="font-mono">{Math.round(metrics.avgMonthlyUnits).toLocaleString()} uds</span>
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span className="text-muted-foreground">Ingreso Prom./mes</span>
                  <span className="font-mono">{formatUSD(metrics.avgMonthlyRevenue)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="lg:col-span-2 rounded-2xl bg-card border border-border p-6 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Gráfico de Punto de Equilibrio</h2>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={chartData}>
              <XAxis dataKey="units" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatUSD(v)} labelFormatter={v => `${v} unidades`} />
              {breakEvenUnits > 0 && <ReferenceLine x={breakEvenUnits} stroke="hsl(38, 92%, 50%)" strokeDasharray="5 5" label={{ value: 'BE', fill: 'hsl(38, 92%, 50%)', fontSize: 10 }} />}
              <Area type="monotone" dataKey="revenue" name="Ingresos" stroke="hsl(217, 91%, 60%)" fill="hsl(217, 91%, 60%)" fillOpacity={0.1} strokeWidth={2} />
              <Area type="monotone" dataKey="totalCost" name="Costo Total" stroke="hsl(0, 84%, 60%)" fill="hsl(0, 84%, 60%)" fillOpacity={0.1} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
