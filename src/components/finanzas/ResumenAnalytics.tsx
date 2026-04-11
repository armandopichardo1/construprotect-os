import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/lib/format';
import { LineChart, Line, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, Cell } from 'recharts';
import { AlertTriangle, TrendingUp, TrendingDown } from 'lucide-react';

const chartTooltipStyle = { background: 'hsl(222, 20%, 10%)', border: '1px solid hsl(222, 20%, 20%)', borderRadius: 8, fontSize: 12 };

interface Props {
  sales: any[];
  saleItems: any[];
}

export function ClientSparklines({ sales }: { sales: any[] }) {
  const clientTrends = useMemo(() => {
    const now = new Date();
    const clients: Record<string, { name: string; months: number[] }> = {};

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      sales.filter((s: any) => s.date?.startsWith(key)).forEach((s: any) => {
        const cid = s.contact_id || 'sin_cliente';
        const name = s.contacts?.contact_name || 'Sin Cliente';
        if (!clients[cid]) clients[cid] = { name, months: Array(6).fill(0) };
        clients[cid].months[5 - i] += Number(s.total_usd || 0);
      });
    }

    return Object.entries(clients)
      .map(([id, { name, months }]) => {
        const total = months.reduce((a, b) => a + b, 0);
        const recent = months[5] + months[4];
        const earlier = months[1] + months[0];
        const trend = earlier > 0 ? ((recent - earlier) / earlier) * 100 : (recent > 0 ? 100 : 0);
        return { id, name, months, total, trend };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [sales]);

  if (clientTrends.length === 0) return null;

  return (
    <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Tendencia por Cliente (6 meses)</h2>
      <div className="space-y-2">
        {clientTrends.map(c => (
          <div key={c.id} className="flex items-center gap-3">
            <span className="text-xs text-foreground w-[120px] truncate">{c.name}</span>
            <div className="w-[80px] h-[24px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={c.months.map((v, i) => ({ v, i }))}>
                  <Line type="monotone" dataKey="v" stroke={c.trend >= 0 ? 'hsl(160, 84%, 39%)' : 'hsl(0, 84%, 60%)'} strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <span className="text-xs font-mono text-muted-foreground w-[70px] text-right">{formatUSD(c.total)}</span>
            <span className={cn('text-xs font-mono flex items-center gap-0.5',
              c.trend > 0 ? 'text-success' : c.trend < 0 ? 'text-destructive' : 'text-muted-foreground')}>
              {c.trend > 0 ? <TrendingUp className="w-3 h-3" /> : c.trend < 0 ? <TrendingDown className="w-3 h-3" /> : null}
              {c.trend > 0 ? '+' : ''}{c.trend.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ConcentrationAnalysis({ sales }: { sales: any[] }) {
  const analysis = useMemo(() => {
    const clientRevenue: Record<string, { name: string; revenue: number }> = {};
    sales.forEach((s: any) => {
      const cid = s.contact_id || 'sin_cliente';
      const name = s.contacts?.contact_name || 'Sin Cliente';
      if (!clientRevenue[cid]) clientRevenue[cid] = { name, revenue: 0 };
      clientRevenue[cid].revenue += Number(s.total_usd || 0);
    });

    const sorted = Object.values(clientRevenue).sort((a, b) => b.revenue - a.revenue);
    const totalRevenue = sorted.reduce((s, r) => s + r.revenue, 0);
    if (totalRevenue === 0) return null;

    let cumulative = 0;
    const top = sorted.slice(0, 5).map(c => {
      cumulative += c.revenue;
      return { ...c, pct: (c.revenue / totalRevenue) * 100, cumPct: (cumulative / totalRevenue) * 100 };
    });

    const topClientPct = sorted.length > 0 ? (sorted[0].revenue / totalRevenue) * 100 : 0;
    const top3Pct = sorted.slice(0, 3).reduce((s, r) => s + r.revenue, 0) / totalRevenue * 100;
    const riskLevel = topClientPct > 30 ? 'alto' : topClientPct > 20 ? 'medio' : 'bajo';

    return { top, totalRevenue, topClientPct, top3Pct, riskLevel, totalClients: sorted.length };
  }, [sales]);

  if (!analysis) return null;

  return (
    <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Concentración de Ingresos</h2>
      {analysis.riskLevel !== 'bajo' && (
        <div className={cn('flex items-center gap-2 rounded-lg px-3 py-2 text-xs',
          analysis.riskLevel === 'alto' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning')}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Riesgo {analysis.riskLevel}: Top cliente = {analysis.topClientPct.toFixed(0)}% del ingreso total</span>
        </div>
      )}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div><p className="text-lg font-bold text-foreground">{analysis.totalClients}</p><p className="text-[10px] text-muted-foreground">Clientes</p></div>
        <div><p className="text-lg font-bold text-primary">{analysis.topClientPct.toFixed(0)}%</p><p className="text-[10px] text-muted-foreground">Top Cliente</p></div>
        <div><p className="text-lg font-bold text-primary">{analysis.top3Pct.toFixed(0)}%</p><p className="text-[10px] text-muted-foreground">Top 3</p></div>
      </div>
      <div className="space-y-1.5">
        {analysis.top.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-4">{i + 1}.</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground truncate">{c.name}</span>
                <span className="text-xs font-mono text-muted-foreground shrink-0 ml-2">{c.pct.toFixed(1)}%</span>
              </div>
              <div className="h-1 bg-muted rounded-full mt-0.5">
                <div className="h-full bg-primary rounded-full" style={{ width: `${c.pct}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProductMarginBreakdown({ saleItems }: { saleItems: any[] }) {
  const products = useMemo(() => {
    const map: Record<string, { name: string; revenue: number; cogs: number; units: number }> = {};
    saleItems.forEach((si: any) => {
      const pid = si.product_id || 'unknown';
      const name = si.products?.name || '?';
      if (!map[pid]) map[pid] = { name, revenue: 0, cogs: 0, units: 0 };
      map[pid].revenue += Number(si.line_total_usd || 0);
      map[pid].cogs += Number(si.unit_cost_usd || 0) * Number(si.quantity || 0);
      map[pid].units += Number(si.quantity || 0);
    });
    return Object.values(map)
      .map(p => ({
        ...p,
        gm: p.revenue - p.cogs,
        gmPct: p.revenue > 0 ? ((p.revenue - p.cogs) / p.revenue) * 100 : 0,
      }))
      .filter(p => p.revenue > 0)
      .sort((a, b) => b.gmPct - a.gmPct)
      .slice(0, 15);
  }, [saleItems]);

  if (products.length === 0) return null;

  const chartData = products.map(p => ({
    name: p.name.length > 20 ? p.name.substring(0, 20) + '…' : p.name,
    margin: Math.round(p.gmPct * 10) / 10,
    fill: p.gmPct >= 55 ? 'hsl(160, 84%, 39%)' : p.gmPct >= 45 ? 'hsl(38, 92%, 50%)' : 'hsl(0, 84%, 60%)',
  }));

  return (
    <div className="lg:col-span-3 rounded-2xl bg-card border border-border p-5 space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Margen Bruto por Producto (%)</h2>
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success inline-block" /> &gt;55%</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning inline-block" /> 45-55%</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-destructive inline-block" /> &lt;45%</span>
      </div>
      <ResponsiveContainer width="100%" height={Math.max(200, products.length * 32)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 40 }}>
          <XAxis type="number" domain={[0, 100]} tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
          <YAxis type="category" dataKey="name" width={140} tick={{ fill: 'hsl(220, 12%, 65%)', fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={{ background: 'hsl(222, 20%, 10%)', border: '1px solid hsl(222, 20%, 20%)', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`${v}%`, 'Margen']} />
          <Bar dataKey="margin" radius={[0, 4, 4, 0]} barSize={18}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
