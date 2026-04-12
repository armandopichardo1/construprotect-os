import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/lib/format';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine, LineChart, Line, Area, AreaChart, Legend } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download, TrendingUp, AlertTriangle } from 'lucide-react';
import { exportToExcel } from '@/lib/export-utils';
import { useAlertRules } from '@/hooks/useAlerts';

const chartTooltipStyle = { background: 'hsl(222, 20%, 10%)', border: '1px solid hsl(222, 20%, 20%)', borderRadius: 8, fontSize: 12 };

interface Props {
  sales: any[];
  expenses: any[];
}

export function CashFlowTab({ sales, expenses }: Props) {
  const [months, setMonths] = useState('6');
  const [projMonths, setProjMonths] = useState('3');
  const now = useMemo(() => new Date(), []);
  const { data: alertRules } = useAlertRules();

  const cashflowRule = alertRules?.find(r => r.id === 'cashflow_projection_low');
  const thresholdEnabled = cashflowRule?.enabled ?? true;
  const thresholdValue = cashflowRule?.threshold ?? 1000;

  const data = useMemo(() => {
    const n = Number(months);
    const rows: { month: string; key: string; inflows: number; outflows: number; net: number; cumulative: number }[] = [];
    let cumulative = 0;

    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('es-DO', { month: 'short', year: '2-digit' });

      const inflows = sales
        .filter((s: any) => s.date?.startsWith(key) && s.payment_status === 'paid')
        .reduce((s: number, r: any) => s + Number(r.total_usd || 0), 0);

      const outflows = expenses
        .filter((e: any) => e.date?.startsWith(key))
        .reduce((s: number, r: any) => s + Number(r.amount_usd || 0), 0);

      const net = inflows - outflows;
      cumulative += net;

      rows.push({ month: label, key, inflows, outflows, net, cumulative });
    }
    return rows;
  }, [sales, expenses, months, now]);

  const totalIn = data.reduce((s, r) => s + r.inflows, 0);
  const totalOut = data.reduce((s, r) => s + r.outflows, 0);
  const totalNet = totalIn - totalOut;

  const pendingReceivables = useMemo(() => {
    return sales
      .filter((s: any) => s.payment_status !== 'paid' && s.payment_status !== 'cancelled')
      .reduce((s: number, r: any) => s + Number(r.total_usd || 0), 0);
  }, [sales]);

  // --- PROJECTION with scenarios ---
  const projection = useMemo(() => {
    const nProj = Number(projMonths);
    const currentCumulative = data[data.length - 1]?.cumulative || 0;

    const pendingSales = sales.filter((s: any) => s.payment_status !== 'paid' && s.payment_status !== 'cancelled');
    const totalPending = pendingSales.reduce((s: number, r: any) => s + Number(r.total_usd || 0), 0);
    const monthlyReceivable = nProj > 0 ? totalPending / nProj : 0;

    const recurringExpenses = expenses.filter((e: any) => e.is_recurring);
    const monthlyRecurring = recurringExpenses.reduce((s: number, e: any) => {
      const amt = Number(e.amount_usd || 0);
      const freq = (e.recurring_frequency || 'monthly').toLowerCase();
      if (freq === 'weekly') return s + amt * 4.33;
      if (freq === 'biweekly' || freq === 'quincenal') return s + amt * 2;
      if (freq === 'quarterly' || freq === 'trimestral') return s + amt / 3;
      if (freq === 'yearly' || freq === 'anual') return s + amt / 12;
      return s + amt;
    }, 0);

    const last3 = data.slice(-3);
    const avgNonRecurringOut = last3.length > 0
      ? last3.reduce((s, r) => s + r.outflows, 0) / last3.length - monthlyRecurring
      : 0;
    const estimatedOtherExpenses = Math.max(0, avgNonRecurringOut);

    const avgNewSales = last3.length > 0
      ? last3.reduce((s, r) => s + r.inflows, 0) / last3.length
      : 0;

    const SCENARIOS = [
      { key: 'optimista', salesMult: 1.20, expMult: 0.80 },
      { key: 'base', salesMult: 1.0, expMult: 1.0 },
      { key: 'pesimista', salesMult: 0.80, expMult: 1.20 },
    ] as const;

    const rows: {
      month: string; receivables: number; newSales: number; recurring: number; otherExpenses: number;
      netProjected: number; cumulative: number;
      netOptimista: number; cumOptimista: number;
      netPesimista: number; cumPesimista: number;
    }[] = [];

    let cumBase = currentCumulative;
    let cumOpt = currentCumulative;
    let cumPes = currentCumulative;

    for (let i = 1; i <= nProj; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const label = d.toLocaleDateString('es-DO', { month: 'short', year: '2-digit' });

      const baseIn = monthlyReceivable + avgNewSales;
      const baseOut = monthlyRecurring + estimatedOtherExpenses;
      const netBase = baseIn - baseOut;
      cumBase += netBase;

      const optIn = monthlyReceivable + avgNewSales * 1.20;
      const optOut = monthlyRecurring + estimatedOtherExpenses * 0.80;
      const netOpt = optIn - optOut;
      cumOpt += netOpt;

      const pesIn = monthlyReceivable + avgNewSales * 0.80;
      const pesOut = monthlyRecurring + estimatedOtherExpenses * 1.20;
      const netPes = pesIn - pesOut;
      cumPes += netPes;

      rows.push({
        month: label,
        receivables: monthlyReceivable,
        newSales: avgNewSales,
        recurring: monthlyRecurring,
        otherExpenses: estimatedOtherExpenses,
        netProjected: netBase,
        cumulative: cumBase,
        netOptimista: netOpt,
        cumOptimista: cumOpt,
        netPesimista: netPes,
        cumPesimista: cumPes,
      });
    }

    return { rows, monthlyReceivable, avgNewSales, monthlyRecurring, estimatedOtherExpenses, totalPending };
  }, [sales, expenses, data, projMonths, now]);

  // Detect threshold breaches in projection
  const breachMonths = useMemo(() => {
    if (!thresholdEnabled) return [];
    return projection.rows.filter(r => r.cumulative < thresholdValue || r.cumPesimista < thresholdValue);
  }, [projection.rows, thresholdEnabled, thresholdValue]);

  const handleExport = () => {
    exportToExcel(data.map(r => ({
      Mes: r.month, 'Entradas USD': r.inflows, 'Salidas USD': r.outflows,
      'Flujo Neto USD': r.net, 'Acumulado USD': r.cumulative,
    })), 'flujo_caja', 'Flujo de Caja');
  };

  const handleExportProjection = () => {
    exportToExcel(projection.rows.map(r => ({
      Mes: r.month,
      'Cobros Pendientes USD': r.receivables,
      'Ventas Estimadas USD': r.newSales,
      'Gastos Recurrentes USD': r.recurring,
      'Otros Gastos USD': r.otherExpenses,
      'Flujo Neto Proyectado USD': r.netProjected,
      'Acumulado Proyectado USD': r.cumulative,
    })), 'proyeccion_flujo', 'Proyección');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={months} onValueChange={setMonths}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="3">3 Meses</SelectItem>
            <SelectItem value="6">6 Meses</SelectItem>
            <SelectItem value="12">12 Meses</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={handleExport} className="ml-auto"><Download className="w-3.5 h-3.5 mr-1" /> Excel</Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Entradas', value: formatUSD(totalIn), color: 'text-success' },
          { label: 'Salidas', value: formatUSD(totalOut), color: 'text-destructive' },
          { label: 'Flujo Neto', value: formatUSD(totalNet), color: totalNet >= 0 ? 'text-success' : 'text-destructive' },
          { label: 'Ctas por Cobrar', value: formatUSD(pendingReceivables), color: 'text-warning' },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-2xl bg-card border border-border p-4 text-center">
            <p className={cn('text-xl font-bold', kpi.color)}>{kpi.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="rounded-2xl bg-card border border-border p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Flujo de Caja Mensual</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <XAxis dataKey="month" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
            <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatUSD(v)} />
            <ReferenceLine y={0} stroke="hsl(220, 12%, 30%)" />
            <Bar dataKey="inflows" name="Entradas" fill="hsl(160, 84%, 39%)" radius={[6,6,0,0]} />
            <Bar dataKey="outflows" name="Salidas" fill="hsl(0, 84%, 60%)" radius={[6,6,0,0]} />
            <Bar dataKey="net" name="Neto" fill="hsl(217, 91%, 60%)" radius={[6,6,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden max-h-[calc(100vh-320px)] overflow-auto">
        <Table wrapperClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
            <TableRow>
              <TableHead className="text-xs">Mes</TableHead>
              <TableHead className="text-xs text-right">Entradas</TableHead>
              <TableHead className="text-xs text-right">Salidas</TableHead>
              <TableHead className="text-xs text-right">Flujo Neto</TableHead>
              <TableHead className="text-xs text-right">Acumulado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map(r => (
              <TableRow key={r.key}>
                <TableCell className="text-xs font-medium">{r.month}</TableCell>
                <TableCell className="text-xs text-right font-mono text-success">{formatUSD(r.inflows)}</TableCell>
                <TableCell className="text-xs text-right font-mono text-destructive">{formatUSD(r.outflows)}</TableCell>
                <TableCell className={cn('text-xs text-right font-mono font-semibold', r.net >= 0 ? 'text-success' : 'text-destructive')}>{formatUSD(r.net)}</TableCell>
                <TableCell className={cn('text-xs text-right font-mono', r.cumulative >= 0 ? 'text-foreground' : 'text-destructive')}>{formatUSD(r.cumulative)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="bg-muted/30 font-bold">
              <TableCell className="text-xs font-bold">TOTAL</TableCell>
              <TableCell className="text-xs text-right font-mono font-bold text-success">{formatUSD(totalIn)}</TableCell>
              <TableCell className="text-xs text-right font-mono font-bold text-destructive">{formatUSD(totalOut)}</TableCell>
              <TableCell className={cn('text-xs text-right font-mono font-bold', totalNet >= 0 ? 'text-success' : 'text-destructive')}>{formatUSD(totalNet)}</TableCell>
              <TableCell className="text-xs text-right font-mono font-bold">{formatUSD(data[data.length - 1]?.cumulative || 0)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* ========== PROJECTION SECTION ========== */}
      <div className="rounded-2xl bg-card border border-primary/20 p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">Proyección de Flujo de Caja</h2>
          </div>
          <div className="flex items-center gap-2">
            <Select value={projMonths} onValueChange={setProjMonths}>
              <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 Meses</SelectItem>
                <SelectItem value="6">6 Meses</SelectItem>
                <SelectItem value="12">12 Meses</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={handleExportProjection}><Download className="w-3.5 h-3.5 mr-1" /> Excel</Button>
          </div>
        </div>

        {/* Projection assumptions */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Cobros Pendientes', value: formatUSD(projection.totalPending), sub: `${formatUSD(projection.monthlyReceivable)}/mes`, color: 'text-warning' },
            { label: 'Ventas Estimadas', value: formatUSD(projection.avgNewSales), sub: 'promedio mensual', color: 'text-success' },
            { label: 'Gastos Recurrentes', value: formatUSD(projection.monthlyRecurring), sub: 'mensual fijo', color: 'text-destructive' },
            { label: 'Otros Gastos Est.', value: formatUSD(projection.estimatedOtherExpenses), sub: 'promedio mensual', color: 'text-muted-foreground' },
          ].map(k => (
            <div key={k.label} className="rounded-xl bg-muted/30 border border-border/50 p-3 text-center">
              <p className={cn('text-lg font-bold', k.color)}>{k.value}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{k.label}</p>
              <p className="text-[9px] text-muted-foreground/70">{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Threshold warning banner */}
        {thresholdEnabled && breachMonths.length > 0 && (
          <div className="flex items-start gap-3 rounded-xl bg-destructive/10 border border-destructive/30 p-4">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-destructive">Alerta de flujo de caja</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                El flujo acumulado proyectado baja de <span className="font-mono font-medium text-foreground">{formatUSD(thresholdValue)}</span> en {breachMonths.length} mes(es): {breachMonths.map(m => m.month).join(', ')}.
                <span className="opacity-70"> Configura el umbral en Más &gt; Alertas.</span>
              </p>
            </div>
          </div>
        )}

        {/* Projection chart with scenarios */}
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={projection.rows}>
            <defs>
              <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.2} />
                <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="optGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.15} />
                <stop offset="95%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="pesGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.15} />
                <stop offset="95%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
            <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatUSD(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={0} stroke="hsl(220, 12%, 30%)" strokeDasharray="3 3" />
            {thresholdEnabled && (
              <ReferenceLine y={thresholdValue} stroke="hsl(38, 92%, 50%)" strokeDasharray="6 3" strokeWidth={2} label={{ value: `Umbral $${(thresholdValue/1000).toFixed(0)}K`, position: 'right', fill: 'hsl(38, 92%, 50%)', fontSize: 10 }} />
            )}
            <Area type="monotone" dataKey="cumOptimista" name="Optimista (+20%)" stroke="hsl(160, 84%, 39%)" fill="url(#optGrad)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
            <Area type="monotone" dataKey="cumulative" name="Base" stroke="hsl(217, 91%, 60%)" fill="url(#projGrad)" strokeWidth={2.5} dot={{ r: 4, fill: 'hsl(217, 91%, 60%)' }} />
            <Area type="monotone" dataKey="cumPesimista" name="Pesimista (-20%)" stroke="hsl(0, 84%, 60%)" fill="url(#pesGrad)" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
          </AreaChart>
        </ResponsiveContainer>

        {/* Projection table with scenarios */}
        <div className="rounded-xl border border-border bg-card overflow-hidden max-h-[calc(100vh-320px)] overflow-auto">
          <Table wrapperClassName="overflow-visible">
            <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
              <TableRow>
                <TableHead className="text-xs">Mes</TableHead>
                <TableHead className="text-xs text-right">Cobros</TableHead>
                <TableHead className="text-xs text-right">Ventas Est.</TableHead>
                <TableHead className="text-xs text-right">G. Recurrentes</TableHead>
                <TableHead className="text-xs text-right">Otros Gastos</TableHead>
                <TableHead className="text-xs text-right text-success">Optimista</TableHead>
                <TableHead className="text-xs text-right">Base</TableHead>
                <TableHead className="text-xs text-right text-destructive">Pesimista</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projection.rows.map(r => (
                <TableRow key={r.month}>
                  <TableCell className="text-xs font-medium">{r.month}</TableCell>
                  <TableCell className="text-xs text-right font-mono text-warning">{formatUSD(r.receivables)}</TableCell>
                  <TableCell className="text-xs text-right font-mono text-success">{formatUSD(r.newSales)}</TableCell>
                  <TableCell className="text-xs text-right font-mono text-destructive">{formatUSD(r.recurring)}</TableCell>
                  <TableCell className="text-xs text-right font-mono text-muted-foreground">{formatUSD(r.otherExpenses)}</TableCell>
                  <TableCell className="text-xs text-right font-mono text-success font-semibold">{formatUSD(r.cumOptimista)}</TableCell>
                  <TableCell className={cn('text-xs text-right font-mono font-bold', r.cumulative >= 0 ? 'text-primary' : 'text-destructive')}>{formatUSD(r.cumulative)}</TableCell>
                  <TableCell className="text-xs text-right font-mono text-destructive font-semibold">{formatUSD(r.cumPesimista)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <p className="text-[10px] text-muted-foreground/60 italic">
          * Escenarios Optimista/Pesimista aplican ±20% sobre ventas estimadas y otros gastos. Cobros pendientes y gastos recurrentes se mantienen fijos. No constituye garantía financiera.
        </p>
      </div>
    </div>
  );
}
