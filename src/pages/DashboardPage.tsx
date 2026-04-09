import { AppLayout } from '@/components/AppLayout';
import { KpiCard } from '@/components/KpiCard';
import { useAuth } from '@/hooks/useAuth';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

const revenueData = [
  { month: 'Ene', revenue: 45200, cogs: 28100 },
  { month: 'Feb', revenue: 52100, cogs: 31200 },
  { month: 'Mar', revenue: 48700, cogs: 29800 },
  { month: 'Abr', revenue: 61300, cogs: 35400 },
  { month: 'May', revenue: 55800, cogs: 32100 },
  { month: 'Jun', revenue: 67400, cogs: 38900 },
];

const categoryData = [
  { name: 'Pisos', value: 35, color: 'hsl(217, 91%, 60%)' },
  { name: 'Paredes', value: 25, color: 'hsl(160, 84%, 39%)' },
  { name: 'Baños', value: 20, color: 'hsl(38, 92%, 50%)' },
  { name: 'Otros', value: 20, color: 'hsl(280, 60%, 55%)' },
];

const topProducts = [
  { name: 'Porcelanato Calacatta', value: 85 },
  { name: 'Gres Manhattan Grey', value: 72 },
  { name: 'Mosaico Hexagonal', value: 65 },
  { name: 'Cenefa Mármol', value: 48 },
  { name: 'Piso Vinílico Oak', value: 41 },
];

const alerts = [
  { type: 'warning' as const, text: '3 productos bajo punto de reorden' },
  { type: 'info' as const, text: 'Envío #2847 llegó a aduanas' },
  { type: 'success' as const, text: 'Cotización #1205 aceptada ($12,400)' },
];

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <AppLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-bold text-foreground">Dashboard</h1>
          <p className="text-xs text-muted-foreground">Hola, {user?.user_metadata?.full_name || 'usuario'}</p>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3">
          <KpiCard title="Ingresos MTD" value="$67,400" icon="💰" variant="primary" trend={{ value: 12.4, label: 'vs mes ant.' }} />
          <KpiCard title="Margen" value="42.3%" icon="📈" variant="success" trend={{ value: 2.1, label: 'vs mes ant.' }} />
          <KpiCard title="Pipeline" value="$145K" icon="🎯" subtitle="$89K ponderado" />
          <KpiCard title="Inventario" value="2,847 uds" icon="📦" variant="warning" subtitle="5 alertas" />
        </div>

        {/* Alerts */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">Alertas</h2>
          {alerts.map((a, i) => (
            <div key={i} className="flex items-center gap-2 rounded-xl bg-card border border-border px-3 py-2.5">
              <span className="text-sm">
                {a.type === 'warning' ? '⚠️' : a.type === 'success' ? '✅' : 'ℹ️'}
              </span>
              <span className="text-xs text-foreground">{a.text}</span>
            </div>
          ))}
        </div>

        {/* Revenue vs COGS */}
        <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Ingresos vs Costos (6 meses)</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={revenueData} barGap={2}>
              <XAxis dataKey="month" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 10 }} axisLine={false} tickLine={false} width={35} tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip contentStyle={{ background: 'hsl(222, 20%, 10%)', border: '1px solid hsl(222, 20%, 20%)', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="revenue" fill="hsl(217, 91%, 60%)" radius={[4, 4, 0, 0]} name="Ingresos" />
              <Bar dataKey="cogs" fill="hsl(222, 20%, 25%)" radius={[4, 4, 0, 0]} name="Costos" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Category donut */}
        <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Ingresos por Categoría</h2>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={120} height={120}>
              <PieChart>
                <Pie data={categoryData} innerRadius={35} outerRadius={55} dataKey="value" stroke="none">
                  {categoryData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5">
              {categoryData.map((c) => (
                <div key={c.name} className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                  <span className="text-xs text-foreground">{c.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{c.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Products */}
        <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Top 5 Productos</h2>
          <div className="space-y-2.5">
            {topProducts.map((p) => (
              <div key={p.name} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground">{p.name}</span>
                  <span className="text-muted-foreground">{p.value} uds</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${p.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Summary */}
        <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span>🤖</span>
            <h2 className="text-sm font-semibold text-foreground">Resumen IA</h2>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Las ventas de junio superaron la meta en 8%. La categoría de pisos lidera con 35% de ingresos. 
            Hay 3 productos por debajo del punto de reorden que requieren acción inmediata. 
            El margen promedio mejoró 2.1pp gracias a mejor negociación con proveedores.
          </p>
        </div>
      </div>
    </AppLayout>
  );
}
