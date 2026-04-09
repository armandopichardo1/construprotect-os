import { AppLayout } from '@/components/AppLayout';
import { KpiCard } from '@/components/KpiCard';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatUSD } from '@/lib/format';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

const chartTooltipStyle = { background: 'hsl(222, 20%, 10%)', border: '1px solid hsl(222, 20%, 20%)', borderRadius: 8, fontSize: 12 };
const axisTick = { fill: 'hsl(220, 12%, 55%)', fontSize: 10 };

export default function DashboardPage() {
  const { user } = useAuth();

  // Real inventory data
  const { data: inventoryStats } = useQuery({
    queryKey: ['dashboard-inventory'],
    queryFn: async () => {
      const { data: inv } = await supabase.from('inventory').select('quantity_on_hand, quantity_reserved, product_id');
      const { data: products } = await supabase.from('products').select('id, name, category, unit_cost_usd, price_list_usd, reorder_point');
      if (!inv || !products) return null;

      const productMap = Object.fromEntries(products.map(p => [p.id, p]));
      let totalUnits = 0, totalValue = 0, alerts = 0;
      const categoryValues: Record<string, number> = {};
      const stockItems: { name: string; qty: number; reorder: number; status: string; value: number }[] = [];

      inv.forEach(i => {
        const p = productMap[i.product_id];
        if (!p) return;
        const qty = i.quantity_on_hand;
        totalUnits += qty;
        const val = qty * Number(p.unit_cost_usd);
        totalValue += val;
        const cat = p.category || 'Otros';
        categoryValues[cat] = (categoryValues[cat] || 0) + val;

        let status = 'ok';
        if (qty === 0) { status = 'out'; alerts++; }
        else if (qty <= Number(p.reorder_point)) { status = 'low'; alerts++; }
        else if (qty > Number(p.reorder_point) * 5) status = 'excess';

        stockItems.push({ name: p.name, qty, reorder: Number(p.reorder_point), status, value: val });
      });

      const categoryData = Object.entries(categoryValues)
        .sort((a, b) => b[1] - a[1])
        .map(([name, value], i) => ({
          name, value,
          color: ['hsl(217, 91%, 60%)', 'hsl(160, 84%, 39%)', 'hsl(38, 92%, 50%)', 'hsl(280, 60%, 55%)', 'hsl(0, 84%, 60%)'][i] || 'hsl(220, 12%, 55%)',
        }));

      return { totalUnits, totalValue, alerts, categoryData, stockItems };
    },
  });

  // Revenue from movements (sales)
  const { data: revenueData } = useQuery({
    queryKey: ['dashboard-revenue'],
    queryFn: async () => {
      const { data: movements } = await supabase
        .from('inventory_movements')
        .select('movement_type, quantity, unit_cost_usd, created_at, product_id')
        .order('created_at');
      if (!movements) return { monthly: [], totalRevenue: 0, totalCogs: 0, topProducts: [] };

      const months: Record<string, { revenue: number; cogs: number }> = {};
      const productRevenue: Record<string, { name: string; revenue: number }> = {};
      let totalRevenue = 0, totalCogs = 0;

      const { data: products } = await supabase.from('products').select('id, name, unit_cost_usd');
      const productMap = Object.fromEntries((products || []).map(p => [p.id, p]));

      movements.forEach(m => {
        if (m.movement_type !== 'sale') return;
        const date = new Date(m.created_at);
        const monthKey = date.toLocaleDateString('es', { month: 'short' });
        const monthIdx = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`;
        
        const revenue = Math.abs(m.quantity) * Number(m.unit_cost_usd || 0);
        const p = productMap[m.product_id];
        const cogs = Math.abs(m.quantity) * Number(p?.unit_cost_usd || 0);

        if (!months[monthIdx]) months[monthIdx] = { revenue: 0, cogs: 0 };
        months[monthIdx].revenue += revenue;
        months[monthIdx].cogs += cogs;
        totalRevenue += revenue;
        totalCogs += cogs;

        const pName = p?.name || 'Desconocido';
        if (!productRevenue[m.product_id]) productRevenue[m.product_id] = { name: pName, revenue: 0 };
        productRevenue[m.product_id].revenue += revenue;
      });

      const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      const monthly = Object.entries(months)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, val]) => ({
          month: monthNames[parseInt(key.split('-')[1])] || key,
          revenue: Math.round(val.revenue),
          cogs: Math.round(val.cogs),
        }));

      const topProducts = Object.values(productRevenue)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);
      const maxRev = topProducts[0]?.revenue || 1;
      const topNormalized = topProducts.map(p => ({ ...p, pct: Math.round((p.revenue / maxRev) * 100) }));

      return { monthly, totalRevenue, totalCogs, topProducts: topNormalized };
    },
  });

  // Exchange rate
  const { data: rate } = useQuery({
    queryKey: ['latest-rate'],
    queryFn: async () => {
      const { data } = await supabase.from('exchange_rates').select('*').order('date', { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });

  const margin = revenueData && revenueData.totalRevenue > 0
    ? ((revenueData.totalRevenue - revenueData.totalCogs) / revenueData.totalRevenue * 100)
    : 0;

  const lowStockItems = inventoryStats?.stockItems.filter(i => i.status === 'low' || i.status === 'out') || [];

  return (
    <AppLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-bold text-foreground">Dashboard</h1>
          <p className="text-xs text-muted-foreground">Hola, {user?.user_metadata?.full_name || 'usuario'}</p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3">
          <KpiCard title="Ingresos MTD" value={formatUSD(revenueData?.totalRevenue || 0)} icon="💰" variant="primary" />
          <KpiCard title="Margen" value={`${margin.toFixed(1)}%`} icon="📈" variant="success" />
          <KpiCard title="Valor Inventario" value={formatUSD(inventoryStats?.totalValue || 0)} icon="📦" />
          <KpiCard
            title="Inventario"
            value={`${(inventoryStats?.totalUnits || 0).toLocaleString()} uds`}
            icon="🔔"
            variant={inventoryStats?.alerts ? 'warning' : 'default'}
            subtitle={`${inventoryStats?.alerts || 0} alertas`}
          />
        </div>

        {/* Rate banner */}
        {rate && (
          <div className="flex items-center justify-between rounded-xl bg-card border border-border px-3 py-2">
            <span className="text-xs text-muted-foreground">USD/DOP hoy</span>
            <div className="flex gap-3 text-xs">
              <span className="text-foreground">Compra: <strong>{Number(rate.usd_buy).toFixed(2)}</strong></span>
              <span className="text-foreground">Venta: <strong>{Number(rate.usd_sell).toFixed(2)}</strong></span>
            </div>
          </div>
        )}

        {/* Alerts */}
        {lowStockItems.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-foreground">Alertas de Stock</h2>
            {lowStockItems.slice(0, 4).map((item, i) => (
              <div key={i} className="flex items-center gap-2 rounded-xl bg-card border border-border px-3 py-2.5">
                <span className="text-sm">{item.status === 'out' ? '🔴' : '🟡'}</span>
                <span className="text-xs text-foreground flex-1">{item.name}</span>
                <span className="text-xs text-muted-foreground">{item.qty} uds</span>
              </div>
            ))}
          </div>
        )}

        {/* Revenue vs COGS */}
        {revenueData && revenueData.monthly.length > 0 && (
          <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Ingresos vs Costos</h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={revenueData.monthly} barGap={2}>
                <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatUSD(v)} />
                <Bar dataKey="revenue" fill="hsl(217, 91%, 60%)" radius={[4, 4, 0, 0]} name="Ingresos" />
                <Bar dataKey="cogs" fill="hsl(222, 20%, 25%)" radius={[4, 4, 0, 0]} name="Costos" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Category donut */}
        {inventoryStats && inventoryStats.categoryData.length > 0 && (
          <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Inventario por Categoría</h2>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={120} height={120}>
                <PieChart>
                  <Pie data={inventoryStats.categoryData} innerRadius={35} outerRadius={55} dataKey="value" stroke="none">
                    {inventoryStats.categoryData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5">
                {inventoryStats.categoryData.map((c) => (
                  <div key={c.name} className="flex items-center gap-2">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                    <span className="text-xs text-foreground">{c.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{formatUSD(c.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Top Products */}
        {revenueData && revenueData.topProducts.length > 0 && (
          <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Top 5 Productos (por venta)</h2>
            <div className="space-y-2.5">
              {revenueData.topProducts.map((p) => (
                <div key={p.name} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-foreground truncate mr-2">{p.name}</span>
                    <span className="text-muted-foreground shrink-0">{formatUSD(p.revenue)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${p.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Summary */}
        <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span>🤖</span>
            <h2 className="text-sm font-semibold text-foreground">Resumen IA</h2>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Inventario total: {(inventoryStats?.totalUnits || 0).toLocaleString()} unidades valoradas en {formatUSD(inventoryStats?.totalValue || 0)}.
            {lowStockItems.length > 0 && ` Hay ${lowStockItems.length} producto(s) requiriendo reabastecimiento urgente.`}
            {' '}Margen bruto actual: {margin.toFixed(1)}%.
            {rate && ` Tasa USD/DOP: ${Number(rate.usd_sell).toFixed(2)}.`}
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
