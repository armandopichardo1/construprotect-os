import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/lib/format';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { exportToExcel } from '@/lib/export-utils';

const chartTooltipStyle = { background: 'hsl(222, 20%, 10%)', border: '1px solid hsl(222, 20%, 20%)', borderRadius: 8, fontSize: 12 };

interface Props {
  sales: any[];
  expenses: any[];
}

export function CashFlowTab({ sales, expenses }: Props) {
  const [months, setMonths] = useState('6');
  const now = useMemo(() => new Date(), []);

  const data = useMemo(() => {
    const n = Number(months);
    const rows: { month: string; key: string; inflows: number; outflows: number; net: number; cumulative: number }[] = [];
    let cumulative = 0;

    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('es-DO', { month: 'short', year: '2-digit' });

      // Inflows: paid sales only
      const inflows = sales
        .filter((s: any) => s.date?.startsWith(key) && s.payment_status === 'paid')
        .reduce((s: number, r: any) => s + Number(r.total_usd || 0), 0);

      // Outflows: all expenses
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

  // Pending receivables (sales not paid)
  const pendingReceivables = useMemo(() => {
    return sales
      .filter((s: any) => s.payment_status !== 'paid' && s.payment_status !== 'cancelled')
      .reduce((s: number, r: any) => s + Number(r.total_usd || 0), 0);
  }, [sales]);

  const handleExport = () => {
    exportToExcel(data.map(r => ({
      Mes: r.month, 'Entradas USD': r.inflows, 'Salidas USD': r.outflows,
      'Flujo Neto USD': r.net, 'Acumulado USD': r.cumulative,
    })), 'flujo_caja', 'Flujo de Caja');
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
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
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
    </div>
  );
}
