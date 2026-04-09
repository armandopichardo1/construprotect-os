import { AppLayout } from '@/components/AppLayout';
import { KpiCard } from '@/components/KpiCard';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, LineChart, Line } from 'recharts';

const monthlyPL = [
  { month: 'Ene', ingresos: 45200, gastos: 32100, profit: 13100 },
  { month: 'Feb', ingresos: 52100, gastos: 35800, profit: 16300 },
  { month: 'Mar', ingresos: 48700, gastos: 33200, profit: 15500 },
  { month: 'Abr', ingresos: 61300, gastos: 39400, profit: 21900 },
  { month: 'May', ingresos: 55800, gastos: 36200, profit: 19600 },
  { month: 'Jun', ingresos: 67400, gastos: 38900, profit: 28500 },
];

const cashflow = [
  { month: 'Ene', balance: 85000 },
  { month: 'Feb', balance: 92300 },
  { month: 'Mar', balance: 88500 },
  { month: 'Abr', balance: 101200 },
  { month: 'May', balance: 96800 },
  { month: 'Jun', balance: 118400 },
];

export default function FinanzasPage() {
  return (
    <AppLayout>
      <div className="space-y-5">
        <h1 className="text-lg font-bold text-foreground">Finanzas</h1>

        <div className="grid grid-cols-2 gap-3">
          <KpiCard title="Ingresos Junio" value="$67,400" icon="💰" variant="primary" trend={{ value: 20.8, label: 'vs mayo' }} />
          <KpiCard title="Utilidad Neta" value="$28,500" icon="📊" variant="success" trend={{ value: 45.4, label: 'vs mayo' }} />
          <KpiCard title="Gastos" value="$38,900" icon="📉" variant="warning" />
          <KpiCard title="Cuentas x Cobrar" value="$23,100" icon="🧾" />
        </div>

        <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Estado de Resultados</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={monthlyPL} barGap={2}>
              <XAxis dataKey="month" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 10 }} axisLine={false} tickLine={false} width={35} tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip contentStyle={{ background: 'hsl(222, 20%, 10%)', border: '1px solid hsl(222, 20%, 20%)', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="ingresos" fill="hsl(217, 91%, 60%)" radius={[4, 4, 0, 0]} name="Ingresos" />
              <Bar dataKey="profit" fill="hsl(160, 84%, 39%)" radius={[4, 4, 0, 0]} name="Utilidad" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Flujo de Caja</h2>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={cashflow}>
              <XAxis dataKey="month" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 10 }} axisLine={false} tickLine={false} width={35} tickFormatter={(v) => `${v / 1000}k`} />
              <Tooltip contentStyle={{ background: 'hsl(222, 20%, 10%)', border: '1px solid hsl(222, 20%, 20%)', borderRadius: 8, fontSize: 12 }} />
              <Line type="monotone" dataKey="balance" stroke="hsl(160, 84%, 39%)" strokeWidth={2} dot={{ fill: 'hsl(160, 84%, 39%)', r: 3 }} name="Balance" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </AppLayout>
  );
}
