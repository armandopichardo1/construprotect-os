import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/lib/format';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts';
import { AlertTriangle, Package, ShoppingCart } from 'lucide-react';

const chartTooltipStyle = { background: 'hsl(222, 20%, 10%)', border: '1px solid hsl(222, 20%, 20%)', borderRadius: 8, fontSize: 12 };

type StockItem = {
  id: string; name: string; sku: string; qty: number; reorder: number;
  status: string; category: string; value: number; movements: number[];
  velocity: number; costUsd: number;
};

export function DaysOfSupplyChart({ items }: { items: StockItem[] }) {
  const data = useMemo(() => {
    return items
      .filter(i => i.velocity > 0)
      .map(i => ({
        name: i.name.length > 20 ? i.name.slice(0, 18) + '…' : i.name,
        dos: i.velocity > 0 ? Math.round((i.qty / i.velocity) * 30) : 999,
        qty: i.qty,
        velocity: i.velocity,
      }))
      .sort((a, b) => a.dos - b.dos)
      .slice(0, 20);
  }, [items]);

  if (data.length === 0) return null;

  return (
    <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
      <h2 className="text-sm font-semibold text-foreground">Días de Inventario (DOS)</h2>
      <p className="text-[10px] text-muted-foreground">Días estimados de stock basado en velocidad promedio de venta mensual. Línea roja = 30 días.</p>
      <ResponsiveContainer width="100%" height={Math.max(250, data.length * 28)}>
        <BarChart data={data} layout="vertical">
          <XAxis type="number" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 10 }} axisLine={false} tickLine={false}
            label={{ value: 'Días', position: 'insideBottomRight', fill: 'hsl(220, 12%, 55%)', fontSize: 10 }} />
          <YAxis type="category" dataKey="name" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 10 }} axisLine={false} tickLine={false} width={140} />
          <Tooltip contentStyle={chartTooltipStyle}
            formatter={(v: number, _: string, props: any) => [`${v} días (${props.payload.qty} uds, ${props.payload.velocity.toFixed(1)}/mes)`, 'DOS']} />
          <ReferenceLine x={30} stroke="hsl(0, 84%, 60%)" strokeDasharray="5 5" label={{ value: '30d', fill: 'hsl(0, 84%, 60%)', fontSize: 9 }} />
          <Bar dataKey="dos" name="Días" radius={[0, 6, 6, 0]}
            fill="hsl(217, 91%, 60%)"
            label={({ x, y, width, height, value }: any) => (
              <text x={x + width + 4} y={y + height / 2} fill={value < 30 ? 'hsl(0, 84%, 60%)' : 'hsl(220, 12%, 55%)'} fontSize={9} dominantBaseline="middle">
                {value}d
              </text>
            )} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OverstockWarnings({ items }: { items: StockItem[] }) {
  const overstocked = useMemo(() => {
    return items
      .filter(i => i.status === 'excess' || (i.velocity > 0 && (i.qty / i.velocity) > 6))
      .map(i => {
        const monthsOfStock = i.velocity > 0 ? i.qty / i.velocity : 999;
        const excessQty = i.velocity > 0 ? Math.max(0, i.qty - Math.ceil(i.velocity * 3)) : i.qty;
        const excessValue = excessQty * i.costUsd;
        const suggestions: string[] = [];
        if (monthsOfStock > 12) suggestions.push('Considerar descuento agresivo (20-30%)');
        else if (monthsOfStock > 6) suggestions.push('Ofrecer en bundle con productos A');
        if (excessQty > 0) suggestions.push(`Reducir próximo pedido en ${excessQty} uds`);
        if (i.velocity === 0) suggestions.push('Sin ventas recientes — evaluar descontinuar');
        return { ...i, monthsOfStock, excessQty, excessValue, suggestions };
      })
      .sort((a, b) => b.excessValue - a.excessValue);
  }, [items]);

  if (overstocked.length === 0) return null;

  const totalExcessValue = overstocked.reduce((s, i) => s + i.excessValue, 0);

  return (
    <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">⚠️ Alertas de Sobrestock</h2>
        <span className="text-xs text-destructive font-mono font-bold">{formatUSD(totalExcessValue)} en exceso</span>
      </div>
      <div className="space-y-3">
        {overstocked.slice(0, 8).map(i => (
          <div key={i.id} className="rounded-xl bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package className="w-3.5 h-3.5 text-warning" />
                <span className="text-xs font-medium text-foreground">{i.name}</span>
                <span className="text-[10px] text-muted-foreground font-mono">{i.sku}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono">{i.qty} uds</span>
                <span className="text-xs font-mono text-warning">{i.monthsOfStock === 999 ? '∞' : i.monthsOfStock.toFixed(0)} meses</span>
                <span className="text-xs font-mono text-destructive">{formatUSD(i.excessValue)}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {i.suggestions.map((s, idx) => (
                <span key={idx} className="inline-flex items-center gap-1 rounded-md bg-warning/10 px-2 py-0.5 text-[10px] text-warning">
                  <ShoppingCart className="w-2.5 h-2.5" /> {s}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
