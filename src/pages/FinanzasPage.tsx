import { useState, useMemo, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { cn } from '@/lib/utils';
import { formatUSD, formatDOP } from '@/lib/format';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell, Tooltip, LineChart, Line, Legend, ComposedChart, Area } from 'recharts';
import { MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { toast } from 'sonner';
import { streamFinancialAI } from '@/lib/financial-ai';
import ReactMarkdown from 'react-markdown';
import { Bot, Send, X, Check, Pencil, Trash2, Download, RefreshCw } from 'lucide-react';
import { exportToExcel } from '@/lib/export-utils';
import { ClientSparklines, ConcentrationAnalysis, ProductMarginBreakdown } from '@/components/finanzas/ResumenAnalytics';
import { CrearTransaccionTab } from '@/components/finanzas/CrearTransaccionTab';
import { CashFlowTab } from '@/components/finanzas/CashFlowTab';
import { BreakEvenTab } from '@/components/finanzas/BreakEvenTab';
import { ReceiptUpload } from '@/components/finanzas/ReceiptUpload';

const tabs = ['Crear Transacción', 'Resumen', 'Ventas', 'Gastos', 'Costos', 'P&L', 'Reportes', 'Flujo Caja', 'Break-Even', 'AI Asesor'];

const COST_CATEGORIES: Record<string, { label: string; icon: string }> = {
  freight: { label: 'Flete', icon: '🚢' },
  customs: { label: 'Aduanas', icon: '🛃' },
  raw_materials: { label: 'Materiales', icon: '🧱' },
  packaging: { label: 'Empaque', icon: '📦' },
  labor: { label: 'Mano de Obra', icon: '👷' },
  logistics: { label: 'Logística', icon: '🚚' },
  warehousing: { label: 'Almacenaje', icon: '🏭' },
  insurance: { label: 'Seguro', icon: '🛡️' },
  other: { label: 'Otro', icon: '📎' },
};
const chartTooltipStyle = { background: 'hsl(222, 20%, 10%)', border: '1px solid hsl(222, 20%, 20%)', borderRadius: 8, fontSize: 12 };

const EXPENSE_CATEGORIES: Record<string, { label: string; icon: string }> = {
  purchases: { label: 'Compras', icon: '🛒' },
  warehouse: { label: 'Almacén', icon: '🏭' },
  payroll: { label: 'Nómina', icon: '👥' },
  rent: { label: 'Alquiler', icon: '🏠' },
  utilities: { label: 'Servicios', icon: '💡' },
  insurance: { label: 'Seguros', icon: '🛡️' },
  maintenance: { label: 'Mantenimiento', icon: '🔧' },
  software: { label: 'Software', icon: '💻' },
  accounting: { label: 'Contabilidad', icon: '📊' },
  marketing: { label: 'Marketing', icon: '📣' },
  shipping: { label: 'Envíos', icon: '🚚' },
  customs: { label: 'Aduanas', icon: '🛃' },
  travel: { label: 'Viajes', icon: '✈️' },
  samples: { label: 'Muestras', icon: '🧱' },
  office: { label: 'Oficina', icon: '🏢' },
  bank_fees: { label: 'Comisiones', icon: '🏦' },
  other: { label: 'Otro', icon: '📎' },
};

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1', '#14b8a6'];

function ExchangeRateKpi({ rate }: { rate: any }) {
  const queryClient = useQueryClient();
  const [fetching, setFetching] = useState(false);

  const fetchRate = async () => {
    setFetching(true);
    try {
      const resp = await supabase.functions.invoke('fetch-exchange-rate');
      if (resp.error) throw resp.error;
      toast.success('Tasa actualizada');
      queryClient.invalidateQueries({ queryKey: ['latest-rate'] });
    } catch { toast.error('Error al obtener tasa'); }
    setFetching(false);
  };

  return (
    <div className="rounded-2xl bg-card border border-border p-5 text-center relative">
      <p className="text-2xl font-bold text-foreground">{rate?.usd_sell ? `${Number(rate.usd_sell).toFixed(2)}` : '—'}</p>
      <p className="text-xs text-muted-foreground mt-1">USD/DOP Venta</p>
      <button onClick={fetchRate} disabled={fetching}
        className="absolute top-2 right-2 p-1 rounded-lg text-muted-foreground hover:text-primary transition-colors">
        <RefreshCw className={cn('w-3.5 h-3.5', fetching && 'animate-spin')} />
      </button>
    </div>
  );
}

export default function FinanzasPage() {
  const [tab, setTab] = useState('Crear Transacción');
  const [salePrefill, setSalePrefill] = useState<any>(null);
  const [expensePrefill, setExpensePrefill] = useState<any>(null);
  const { rate, rateForMonth } = useExchangeRate();
  const fmt = (usd: number) => formatDOP(usd * rate);
  const fmtDop = (dop: number) => formatDOP(dop);
  const queryClient = useQueryClient();

  const { data: sales = [] } = useQuery({
    queryKey: ['sales'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sales').select('*, crm_clients(name, company), sale_items(*, products(name, sku))').order('date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expenses').select('*, chart_of_accounts(code, description)').order('date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: costs = [] } = useQuery({
    queryKey: ['costs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('costs').select('*, chart_of_accounts(code, description)').order('date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: saleItems = [] } = useQuery({
    queryKey: ['sale-items'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sale_items').select('*, sales(date), products(name, margin_list_pct, margin_architect_pct, margin_project_pct, margin_wholesale_pct)');
      if (error) throw error;
      return data;
    },
  });

  const { data: territoryData = [] } = useQuery({
    queryKey: ['territory-coverage'],
    queryFn: async () => {
      const { data: contacts } = await supabase.from('contacts').select('territory, lifetime_revenue_usd, total_orders, is_active');
      if (!contacts) return [];
      const byTerritory: Record<string, { count: number; revenue: number; orders: number; active: number }> = {};
      contacts.forEach(c => {
        const t = c.territory || 'Sin asignar';
        if (!byTerritory[t]) byTerritory[t] = { count: 0, revenue: 0, orders: 0, active: 0 };
        byTerritory[t].count++;
        byTerritory[t].revenue += Number(c.lifetime_revenue_usd || 0);
        byTerritory[t].orders += Number(c.total_orders || 0);
        if (c.is_active) byTerritory[t].active++;
      });
      return Object.entries(byTerritory)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.revenue - a.revenue);
    },
  });

  const { data: latestRate } = useQuery({
    queryKey: ['latest-rate'],
    queryFn: async () => {
      const { data } = await supabase.from('exchange_rates').select('*').order('date', { ascending: false }).limit(1);
      return data?.[0];
    },
  });

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const mtdSales = sales.filter((s: any) => s.date?.startsWith(thisMonth));
  const mtdExpenses = expenses.filter((e: any) => e.date?.startsWith(thisMonth));
  const thisMonthRate = rateForMonth(thisMonth);
  const revenueMTD = mtdSales.reduce((s: number, r: any) => s + Number(r.total_usd || 0), 0);
  const expensesMTD_dop = mtdExpenses.reduce((s: number, r: any) => s + (Number(r.amount_dop) || Number(r.amount_usd || 0) * thisMonthRate), 0);
  const cogsMTD = saleItems.filter((si: any) => si.sales?.date?.startsWith(thisMonth))
    .reduce((s: number, r: any) => s + Number(r.unit_cost_usd || 0) * Number(r.quantity || 0), 0);
  const grossMargin = revenueMTD > 0 ? ((revenueMTD - cogsMTD) / revenueMTD * 100) : 0;
  const netIncome = (revenueMTD - cogsMTD) * thisMonthRate - expensesMTD_dop;

  const monthlyData = useMemo(() => {
    const months: { month: string; revenue: number; cogs: number; expenses: number; profit: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('es-DO', { month: 'short' });
      const mRate = rateForMonth(key);
      const rev = sales.filter((s: any) => s.date?.startsWith(key)).reduce((s: number, r: any) => s + Number(r.total_usd || 0), 0) * mRate;
      const cogs = saleItems.filter((si: any) => si.sales?.date?.startsWith(key))
        .reduce((s: number, r: any) => s + Number(r.unit_cost_usd || 0) * Number(r.quantity || 0), 0) * mRate;
      const exp = expenses.filter((e: any) => e.date?.startsWith(key)).reduce((s: number, r: any) => s + (Number(r.amount_dop) || Number(r.amount_usd || 0) * mRate), 0);
      months.push({ month: label, revenue: rev, cogs, expenses: exp, profit: rev - cogs - exp });
    }
    return months;
  }, [sales, expenses, saleItems, rateForMonth]);

  const expenseByCategory = useMemo(() => {
    const cats: Record<string, number> = {};
    expenses.forEach((e: any) => {
      const mRate = rateForMonth(e.date?.substring(0, 7) || thisMonth);
      cats[e.category] = (cats[e.category] || 0) + (Number(e.amount_dop) || Number(e.amount_usd || 0) * mRate);
    });
    return Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([key, value], i) => ({
      name: EXPENSE_CATEGORIES[key]?.label || key, value, color: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [expenses, rateForMonth]);

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="flex gap-1 rounded-xl bg-muted p-1">
            {tabs.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={cn('rounded-lg px-4 py-1.5 text-xs font-medium transition-colors',
                  tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {tab === 'Crear Transacción' && (
          <CrearTransaccionTab rate={latestRate}
            onEditSale={(data: any) => { setSalePrefill(data); setTab('Ventas'); }}
            onEditExpense={(data: any) => { setExpensePrefill(data); setTab('Gastos'); }} />
        )}

        {tab === 'Resumen' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                { label: 'Ingresos MTD', value: fmt(revenueMTD), color: 'text-primary' },
                { label: 'Margen Bruto', value: `${grossMargin.toFixed(1)}%`, color: grossMargin > 40 ? 'text-success' : 'text-warning' },
                { label: 'Gastos MTD', value: fmtDop(expensesMTD_dop), color: 'text-destructive' },
                { label: 'Ingreso Neto', value: fmtDop(netIncome), color: netIncome >= 0 ? 'text-success' : 'text-destructive' },
              ].map(kpi => (
                <div key={kpi.label} className="rounded-2xl bg-card border border-border p-5 text-center">
                  <p className={cn('text-2xl font-bold', kpi.color)}>{kpi.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
                </div>
              ))}
              <ExchangeRateKpi rate={latestRate} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 rounded-2xl bg-card border border-border p-5 space-y-4">
                <h2 className="text-sm font-semibold text-foreground">Ingresos vs Costos vs Gastos</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyData}>
                    <XAxis dataKey="month" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `RD$${(v/1000).toFixed(0)}K`} />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => fmtDop(v)} />
                    <Bar dataKey="revenue" name="Ingresos" fill="hsl(217, 91%, 60%)" radius={[6,6,0,0]} />
                    <Bar dataKey="cogs" name="COGS" fill="hsl(38, 92%, 50%)" radius={[6,6,0,0]} />
                    <Bar dataKey="expenses" name="Gastos" fill="hsl(0, 84%, 60%)" radius={[6,6,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {expenseByCategory.length > 0 && (
                <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
                  <h2 className="text-sm font-semibold text-foreground">Gastos por Categoría</h2>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart><Pie data={expenseByCategory} innerRadius={45} outerRadius={70} dataKey="value" stroke="none">
                      {expenseByCategory.map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                    </Pie><Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => fmtDop(v)} /></PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5">
                    {expenseByCategory.slice(0,6).map((c: any) => (
                      <div key={c.name} className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                        <span className="text-xs text-foreground truncate">{c.name}</span>
                        <span className="text-xs text-muted-foreground ml-auto shrink-0">{fmtDop(c.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Tendencia de Utilidad</h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={monthlyData}>
                  <XAxis dataKey="month" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `RD$${(v/1000).toFixed(0)}K`} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => fmtDop(v)} />
                  <Line type="monotone" dataKey="profit" stroke="hsl(160, 84%, 39%)" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* New analytics widgets */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <ClientSparklines sales={sales} />
              <ConcentrationAnalysis sales={sales} />
              <ProductMarginBreakdown saleItems={saleItems} />
            </div>
          </div>
        )}

        {tab === 'Ventas' && (
          <div className="space-y-6">
            <VentasTab sales={sales} queryClient={queryClient} rate={latestRate} prefill={salePrefill} clearPrefill={() => setSalePrefill(null)} onExport={() => {
              exportToExcel(sales.map((s: any) => ({
                Fecha: s.date, Ref: s.invoice_ref, Cliente: s.crm_clients?.name,
                'Subtotal USD': s.subtotal_usd, 'ITBIS USD': s.itbis_usd, 'Total USD': s.total_usd,
                Estado: s.payment_status,
              })), 'ventas', 'Ventas');
            }} />
            <TerritoryCoverageSection data={territoryData} />
          </div>
        )}
        {tab === 'Gastos' && <GastosTab expenses={expenses} queryClient={queryClient} rate={latestRate} onExport={() => {
          exportToExcel(expenses.map((e: any) => ({
            Fecha: e.date, Descripción: e.description, Categoría: e.category,
            Proveedor: e.vendor, 'Monto USD': e.amount_usd, 'Monto DOP': e.amount_dop,
          })), 'gastos', 'Gastos');
        }} />}
        {tab === 'Costos' && <CostosTab costs={costs} queryClient={queryClient} rate={latestRate} onExport={() => {
          exportToExcel(costs.map((c: any) => ({
            Fecha: c.date, Descripción: c.description, Categoría: c.category,
            Proveedor: c.vendor, 'Monto USD': c.amount_usd, 'Monto DOP': c.amount_dop,
          })), 'costos', 'Costos');
        }} />}
        {tab === 'P&L' && <PLTab sales={sales} saleItems={saleItems} expenses={expenses} />}
        {tab === 'Reportes' && <ReportesTab sales={sales} saleItems={saleItems} />}
        {tab === 'Flujo Caja' && <CashFlowTab sales={sales} expenses={expenses} />}
        {tab === 'Break-Even' && <BreakEvenTab sales={sales} saleItems={saleItems} expenses={expenses} />}
        {tab === 'AI Asesor' && <AIAsesorTab sales={sales} expenses={expenses} revenueMTD={revenueMTD} grossMargin={grossMargin} />}
      </div>
    </AppLayout>
  );
}

// ============ VENTAS TAB ============
function VentasTab({ sales, queryClient, rate, prefill, clearPrefill, onExport }: any) {
  const [showForm, setShowForm] = useState(false);
  const [editSale, setEditSale] = useState<any>(null);
  const [deleteSale, setDeleteSale] = useState<any>(null);
  const [activePrefill, setActivePrefill] = useState<any>(null);

  useEffect(() => {
    if (prefill) {
      setActivePrefill(prefill);
      setEditSale(null);
      setShowForm(true);
      clearPrefill?.();
    }
  }, [prefill]);

  const handleDeleteSale = async () => {
    if (!deleteSale) return;
    // Delete sale items first, then sale
    await supabase.from('sale_items').delete().eq('sale_id', deleteSale.id);
    const { error } = await supabase.from('sales').delete().eq('id', deleteSale.id);
    if (error) { toast.error('Error al eliminar venta'); throw error; }
    toast.success('Venta eliminada');
    queryClient.invalidateQueries({ queryKey: ['sales'] });
    queryClient.invalidateQueries({ queryKey: ['sale-items'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" onClick={() => { setEditSale(null); setShowForm(true); }}>+ Nueva Venta</Button>
        <Button size="sm" variant="outline" onClick={onExport}><Download className="w-3.5 h-3.5 mr-1" /> Excel</Button>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Fecha</TableHead>
              <TableHead className="text-xs">Cliente</TableHead>
              <TableHead className="text-xs">Ref.</TableHead>
              <TableHead className="text-xs text-right">Subtotal</TableHead>
              <TableHead className="text-xs text-right">ITBIS</TableHead>
              <TableHead className="text-xs text-right">Total RD$</TableHead>
              <TableHead className="text-xs">Estado</TableHead>
              <TableHead className="text-xs">Productos</TableHead>
              <TableHead className="text-xs w-[80px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sales.map((s: any) => (
              <TableRow key={s.id}>
                <TableCell className="text-xs">{s.date}</TableCell>
                <TableCell className="text-xs font-medium">{s.crm_clients?.name || '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{s.invoice_ref || '—'}</TableCell>
                <TableCell className="text-xs text-right font-mono">{formatDOP(Number(s.subtotal_usd) * (Number(s.exchange_rate) || rate))}</TableCell>
                <TableCell className="text-xs text-right font-mono text-muted-foreground">{formatDOP(Number(s.itbis_usd) * (Number(s.exchange_rate) || rate))}</TableCell>
                <TableCell className="text-xs text-right font-mono font-bold text-primary">{formatDOP(Number(s.total_dop) || Number(s.total_usd) * rate)}</TableCell>
                <TableCell>
                  <SaleStatusSelect sale={s} queryClient={queryClient} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                  {s.sale_items?.map((si: any) => `${si.products?.name || '?'} ×${si.quantity}`).join(', ') || '—'}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditSale(s); setShowForm(true); }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteSale(s)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {sales.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No hay ventas registradas</p>}
      </div>
      <SaleFormDialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) { setEditSale(null); setActivePrefill(null); } }} queryClient={queryClient} rate={rate} editSale={editSale} prefill={activePrefill} />
      <DeleteConfirmDialog
        open={!!deleteSale}
        onOpenChange={(v) => { if (!v) setDeleteSale(null); }}
        title="Eliminar venta"
        description={`¿Eliminar la venta <strong>${deleteSale?.invoice_ref || deleteSale?.date || ''}</strong> por <strong>${formatDOP(Number(deleteSale?.total_dop || Number(deleteSale?.total_usd || 0) * rate))}</strong>? Se eliminarán todos los ítems asociados. Esta acción no se puede deshacer.`}
        onConfirm={handleDeleteSale}
      />
    </div>
  );
}

function SaleStatusSelect({ sale, queryClient }: { sale: any; queryClient: any }) {
  const statusMap: Record<string, { label: string; style: string }> = {
    paid: { label: 'Pagado', style: 'bg-success/15 text-success' },
    pending: { label: 'Pendiente', style: 'bg-warning/15 text-warning' },
    overdue: { label: 'Vencido', style: 'bg-destructive/15 text-destructive' },
    partial: { label: 'Parcial', style: 'bg-primary/15 text-primary' },
    cancelled: { label: 'Cancelado', style: 'bg-muted text-muted-foreground' },
  };

  const handleChange = async (status: string) => {
    const update: any = { payment_status: status };
    if (status === 'paid') update.payment_date = new Date().toISOString().split('T')[0];
    const { error } = await supabase.from('sales').update(update).eq('id', sale.id);
    if (error) { toast.error('Error al actualizar estado'); return; }
    toast.success('Estado actualizado');
    queryClient.invalidateQueries({ queryKey: ['sales'] });
  };

  const current = statusMap[sale.payment_status] || statusMap.pending;
  return (
    <Select value={sale.payment_status} onValueChange={handleChange}>
      <SelectTrigger className={cn('h-6 text-[10px] px-2 rounded-full border-0 w-auto min-w-[80px]', current.style)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(statusMap).map(([k, v]) => (
          <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SaleFormDialog({ open, onOpenChange, queryClient, rate, editSale, prefill }: any) {
  const [contactId, setContactId] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [priceTier, setPriceTier] = useState('list');
  const [items, setItems] = useState([{ product_id: '', quantity: 1, unit_price_usd: 0 }]);
  const [saving, setSaving] = useState(false);
  const isEdit = !!editSale;

  const { data: clients = [] } = useQuery({ queryKey: ['crm-clients'], queryFn: async () => { const { data } = await supabase.from('crm_clients').select('*'); return data || []; } });
  const { data: contacts = [] } = useQuery({ queryKey: ['contacts-tiers'], queryFn: async () => { const { data } = await supabase.from('contacts').select('id, contact_name, price_tier'); return data || []; } });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: async () => { const { data } = await supabase.from('products').select('*').eq('is_active', true); return data || []; } });

  const getPriceForTier = (prod: any, tier: string) => {
    switch (tier) {
      case 'architect': return Number(prod?.price_architect_usd || prod?.price_list_usd || 0);
      case 'project': return Number(prod?.price_project_usd || prod?.price_list_usd || 0);
      case 'wholesale': return Number(prod?.price_wholesale_usd || prod?.price_list_usd || 0);
      default: return Number(prod?.price_list_usd || 0);
    }
  };

  const handleClientChange = (clientId: string) => {
    setContactId(clientId);
    // Find contact with matching name to get price tier
    const client = clients.find((c: any) => c.id === clientId);
    const contact = contacts.find((c: any) => c.contact_name === client?.name);
    const tier = contact?.price_tier || 'list';
    setPriceTier(tier);
    // Update all items prices with new tier
    setItems(prev => prev.map(item => {
      if (!item.product_id) return item;
      const prod = products.find((p: any) => p.id === item.product_id);
      return { ...item, unit_price_usd: getPriceForTier(prod, tier) };
    }));
  };

  useEffect(() => {
    if (prefill) {
      setContactId(prefill.contact_id || '');
      setInvoiceRef(prefill.invoice_ref || '');
      if (prefill.items?.length) {
        setItems(prefill.items.map((i: any) => ({
          product_id: i.product_id || '', quantity: i.quantity || 1, unit_price_usd: Number(i.unit_price_usd || 0),
        })));
      }
      return;
    }
    if (editSale) {
      setContactId(editSale.contact_id || '');
      setInvoiceRef(editSale.invoice_ref || '');
      if (editSale.sale_items?.length) {
        setItems(editSale.sale_items.map((si: any) => ({
          product_id: si.product_id || '', quantity: si.quantity, unit_price_usd: Number(si.unit_price_usd),
        })));
      }
    } else {
      setContactId(''); setInvoiceRef(''); setPriceTier('list');
      setItems([{ product_id: '', quantity: 1, unit_price_usd: 0 }]);
    }
  }, [editSale, open, prefill]);

  const subtotal = items.reduce((s, i) => s + i.unit_price_usd * i.quantity, 0);
  const itbis = subtotal * 0.18;
  const total = subtotal + itbis;
  const xr = Number(rate?.usd_sell) || 60.76;
  const totalCogs = items.reduce((s, i) => {
    const prod = products.find((p: any) => p.id === i.product_id);
    return s + Number(prod?.unit_cost_usd || 0) * i.quantity;
  }, 0);
  const marginPct = subtotal > 0 ? ((subtotal - totalCogs) / subtotal * 100) : 0;

  const handleSave = async () => {
    if (!contactId) { toast.error('Selecciona un cliente'); return; }
    if (items.some(i => !i.product_id)) { toast.error('Selecciona productos'); return; }
    setSaving(true);

    const salePayload = {
      contact_id: contactId, invoice_ref: invoiceRef || null,
      subtotal_usd: subtotal, itbis_usd: itbis, total_usd: total,
      total_dop: total * xr, exchange_rate: xr, payment_status: 'pending' as any,
    };

    let saleId: string;

    if (isEdit) {
      const { error } = await supabase.from('sales').update(salePayload).eq('id', editSale.id);
      if (error) { toast.error('Error al actualizar'); setSaving(false); return; }
      saleId = editSale.id;
      await supabase.from('sale_items').delete().eq('sale_id', saleId);
    } else {
      const { data: sale, error } = await supabase.from('sales').insert(salePayload).select().single();
      if (error || !sale) { toast.error('Error'); setSaving(false); return; }
      saleId = sale.id;
    }

    const saleItemsData = items.map(i => {
      const prod = products.find((p: any) => p.id === i.product_id);
      const costUsd = Number(prod?.unit_cost_usd || 0);
      return {
        sale_id: saleId, product_id: i.product_id, quantity: i.quantity,
        unit_price_usd: i.unit_price_usd, unit_cost_usd: costUsd,
        line_total_usd: i.unit_price_usd * i.quantity,
        margin_pct: i.unit_price_usd > 0 ? Math.round((i.unit_price_usd - costUsd) / i.unit_price_usd * 100) : 0,
      };
    });
    await supabase.from('sale_items').insert(saleItemsData);

    setSaving(false);
    toast.success(isEdit ? 'Venta actualizada' : 'Venta registrada');
    queryClient.invalidateQueries({ queryKey: ['sales'] });
    queryClient.invalidateQueries({ queryKey: ['sale-items'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? 'Editar Venta' : 'Nueva Venta'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Cliente *</Label>
              <Select value={contactId} onValueChange={handleClientChange}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>{clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
              {priceTier !== 'list' && (
                <p className="text-[10px] text-primary mt-0.5">Tier: {priceTier === 'architect' ? 'Arquitecto' : priceTier === 'project' ? 'Proyecto' : priceTier === 'wholesale' ? 'Mayoreo' : 'Lista'}</p>
              )}
            </div>
            <div><Label className="text-xs">Ref. Factura</Label><Input value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} className="mt-1" /></div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Productos</Label>
            {items.map((item, idx) => {
              const prod = products.find((p: any) => p.id === item.product_id);
              const costUsd = Number(prod?.unit_cost_usd || 0);
              const lineMargin = item.unit_price_usd > 0 ? ((item.unit_price_usd - costUsd) / item.unit_price_usd * 100) : 0;
              return (
                <div key={idx} className="space-y-0.5">
                  <div className="flex gap-2 items-end">
                    <Select value={item.product_id} onValueChange={v => {
                      const p = products.find((p: any) => p.id === v);
                      setItems(prev => prev.map((it, i) => i === idx ? { ...it, product_id: v, unit_price_usd: getPriceForTier(p, priceTier) } : it));
                    }}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Producto" /></SelectTrigger>
                      <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" value={item.quantity} onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: Number(e.target.value) } : it))} className="w-20" placeholder="Cant." />
                    <Input type="number" value={item.unit_price_usd} onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, unit_price_usd: Number(e.target.value) } : it))} className="w-24" step="0.01" placeholder="Precio" />
                    {items.length > 1 && (
                      <Button variant="ghost" size="sm" className="h-9 w-9 p-0 shrink-0" onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                  {item.product_id && (
                    <p className={cn('text-[9px] font-mono pl-1', lineMargin >= 40 ? 'text-success' : lineMargin >= 20 ? 'text-warning' : 'text-destructive')}>
                      Margen: {lineMargin.toFixed(0)}% · Costo: ${costUsd.toFixed(2)} · Línea: {formatUSD(item.unit_price_usd * item.quantity)}
                    </p>
                  )}
                </div>
              );
            })}
            <Button variant="ghost" size="sm" onClick={() => setItems(prev => [...prev, { product_id: '', quantity: 1, unit_price_usd: 0 }])}>+ Línea</Button>
          </div>
          <div className="rounded-lg bg-muted p-3 space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatUSD(subtotal)}</span></div>
            <div className="flex justify-between"><span>ITBIS (18%)</span><span>{formatUSD(itbis)}</span></div>
            <div className="flex justify-between font-bold"><span>Total USD</span><span>{formatUSD(total)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Total DOP</span><span>RD${(total * xr).toLocaleString('es-DO', { minimumFractionDigits: 0 })}</span></div>
            <div className={cn('flex justify-between text-xs', marginPct >= 40 ? 'text-success' : marginPct >= 20 ? 'text-warning' : 'text-destructive')}>
              <span>Margen Total</span><span>{marginPct.toFixed(1)}% ({formatUSD(subtotal - totalCogs)})</span>
            </div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">{saving ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Registrar Venta'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============ GASTOS TAB ============
function GastosTab({ expenses, queryClient, rate, onExport }: any) {
  const [showForm, setShowForm] = useState(false);
  const [editExpense, setEditExpense] = useState<any>(null);
  const [deleteExpense, setDeleteExpense] = useState<any>(null);

  const handleDeleteExpense = async () => {
    if (!deleteExpense) return;
    const { error } = await supabase.from('expenses').delete().eq('id', deleteExpense.id);
    if (error) { toast.error('Error al eliminar gasto'); throw error; }
    toast.success('Gasto eliminado');
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" onClick={() => { setEditExpense(null); setShowForm(true); }}>+ Nuevo Gasto</Button>
        <Button size="sm" variant="outline" onClick={onExport}><Download className="w-3.5 h-3.5 mr-1" /> Excel</Button>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Fecha</TableHead>
              <TableHead className="text-xs">Categoría</TableHead>
              <TableHead className="text-xs">Descripción</TableHead>
              <TableHead className="text-xs">Cuenta Contable</TableHead>
              <TableHead className="text-xs">Proveedor</TableHead>
              <TableHead className="text-xs text-right">Monto RD$</TableHead>
              <TableHead className="text-xs">Recibo</TableHead>
              <TableHead className="text-xs w-[80px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((e: any) => {
              const cat = EXPENSE_CATEGORIES[e.category] || EXPENSE_CATEGORIES.other;
              const amountDop = Number(e.amount_dop) || Number(e.amount_usd || 0) * rate;
              return (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">{e.date}</TableCell>
                  <TableCell className="text-xs"><span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{cat.icon} {cat.label}</span></TableCell>
                  <TableCell className="text-xs font-medium">{e.description}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {e.chart_of_accounts ? (
                      <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-medium">{e.chart_of_accounts.code} · {e.chart_of_accounts.description}</span>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{e.vendor || '—'}</TableCell>
                  <TableCell className="text-xs text-right font-mono font-bold text-destructive">{formatDOP(amountDop)}</TableCell>
                  <TableCell>
                    <ReceiptUpload expenseId={e.id} currentUrl={e.receipt_url} onUploaded={() => queryClient.invalidateQueries({ queryKey: ['expenses'] })} />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditExpense(e); setShowForm(true); }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteExpense(e)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {expenses.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No hay gastos registrados</p>}
      </div>
      <ExpenseFormDialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditExpense(null); }} queryClient={queryClient} rate={rate} editExpense={editExpense} />
      <DeleteConfirmDialog
        open={!!deleteExpense}
        onOpenChange={(v) => { if (!v) setDeleteExpense(null); }}
        title="Eliminar gasto"
        description={`¿Eliminar el gasto <strong>${deleteExpense?.description || ''}</strong> por <strong>${formatDOP(Number(deleteExpense?.amount_dop) || Number(deleteExpense?.amount_usd || 0) * rate)}</strong>? Esta acción no se puede deshacer.`}
        onConfirm={handleDeleteExpense}
      />
    </div>
  );
}

function ExpenseFormDialog({ open, onOpenChange, queryClient, rate, editExpense }: any) {
  const [form, setForm] = useState({ description: '', category: 'other', vendor: '', amount_usd: '', amount_dop: '', account_id: '' });
  const [saving, setSaving] = useState(false);
  const xr = Number(rate?.usd_sell) || 60.76;
  const isEdit = !!editExpense;

  const { data: accounts = [] } = useQuery({
    queryKey: ['chart-of-accounts-active'],
    queryFn: async () => {
      const { data } = await supabase.from('chart_of_accounts').select('id, code, description, account_type').eq('is_active', true).order('code');
      return data || [];
    },
  });

  // Group accounts by type for the selector
  const gastoAccounts = useMemo(() => accounts.filter((a: any) => ['Gasto', 'Costo', 'Gastos No Operacionales'].includes(a.account_type)), [accounts]);
  const otherAccounts = useMemo(() => accounts.filter((a: any) => !['Gasto', 'Costo', 'Gastos No Operacionales'].includes(a.account_type)), [accounts]);

  useEffect(() => {
    if (editExpense) {
      setForm({
        description: editExpense.description || '',
        category: editExpense.category || 'other',
        vendor: editExpense.vendor || '',
        amount_usd: String(editExpense.amount_usd || ''),
        amount_dop: String(editExpense.amount_dop || ''),
        account_id: editExpense.account_id || '',
      });
    } else {
      setForm({ description: '', category: 'other', vendor: '', amount_usd: '', amount_dop: '', account_id: '' });
    }
  }, [editExpense, open]);

  const handleSave = async () => {
    if (!form.description.trim()) { toast.error('Descripción requerida'); return; }
    setSaving(true);
    const amtUsd = Number(form.amount_usd) || (Number(form.amount_dop) / xr);
    const amtDop = Number(form.amount_dop) || (Number(form.amount_usd) * xr);
    const payload = {
      description: form.description.trim(), category: form.category as any,
      vendor: form.vendor.trim() || null,
      amount_usd: Math.round(amtUsd * 100) / 100,
      amount_dop: Math.round(amtDop * 100) / 100,
      exchange_rate: xr,
      account_id: form.account_id || null,
    };

    const { error } = isEdit
      ? await supabase.from('expenses').update(payload).eq('id', editExpense.id)
      : await supabase.from('expenses').insert(payload);

    setSaving(false);
    if (error) { toast.error('Error al guardar'); return; }
    toast.success(isEdit ? 'Gasto actualizado' : 'Gasto registrado');
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{isEdit ? 'Editar Gasto' : 'Nuevo Gasto'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label className="text-xs">Descripción *</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="mt-1" /></div>
            <div>
              <Label className="text-xs">Categoría</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.icon} {v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label className="text-xs">Proveedor</Label><Input value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} className="mt-1" /></div>
            <div>
              <Label className="text-xs">Cuenta Contable</Label>
              <Select value={form.account_id} onValueChange={v => setForm(f => ({ ...f, account_id: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar cuenta..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin asignar</SelectItem>
                  {gastoAccounts.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground">Gastos / Costos</div>
                      {gastoAccounts.map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>{a.code} · {a.description}</SelectItem>
                      ))}
                    </>
                  )}
                  {otherAccounts.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground">Otras cuentas</div>
                      {otherAccounts.map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>{a.code} · {a.description}</SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label className="text-xs">Monto USD</Label><Input type="number" step="0.01" value={form.amount_usd} onChange={e => setForm(f => ({ ...f, amount_usd: e.target.value, amount_dop: String(Math.round(Number(e.target.value) * xr * 100) / 100) }))} className="mt-1" /></div>
            <div><Label className="text-xs">Monto DOP</Label><Input type="number" step="0.01" value={form.amount_dop} onChange={e => setForm(f => ({ ...f, amount_dop: e.target.value, amount_usd: String(Math.round(Number(e.target.value) / xr * 100) / 100) }))} className="mt-1" /></div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">{saving ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Registrar Gasto'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============ COSTOS TAB ============
function CostosTab({ costs, queryClient, rate, onExport }: any) {
  const [showForm, setShowForm] = useState(false);
  const [editCost, setEditCost] = useState<any>(null);
  const [deleteCost, setDeleteCost] = useState<any>(null);

  const handleDeleteCost = async () => {
    if (!deleteCost) return;
    const { error } = await supabase.from('costs').delete().eq('id', deleteCost.id);
    if (error) { toast.error('Error al eliminar costo'); throw error; }
    toast.success('Costo eliminado');
    queryClient.invalidateQueries({ queryKey: ['costs'] });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" onClick={() => { setEditCost(null); setShowForm(true); }}>+ Nuevo Costo</Button>
        <Button size="sm" variant="outline" onClick={onExport}><Download className="w-3.5 h-3.5 mr-1" /> Excel</Button>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Fecha</TableHead>
              <TableHead className="text-xs">Categoría</TableHead>
              <TableHead className="text-xs">Descripción</TableHead>
              <TableHead className="text-xs">Cuenta Contable</TableHead>
              <TableHead className="text-xs">Proveedor</TableHead>
              <TableHead className="text-xs text-right">Monto RD$</TableHead>
              <TableHead className="text-xs">Recibo</TableHead>
              <TableHead className="text-xs w-[80px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {costs.map((c: any) => {
              const cat = COST_CATEGORIES[c.category] || COST_CATEGORIES.other;
              const amountDop = Number(c.amount_dop) || Number(c.amount_usd || 0) * (Number(rate?.usd_sell) || 60.76);
              return (
                <TableRow key={c.id}>
                  <TableCell className="text-xs">{c.date}</TableCell>
                  <TableCell className="text-xs"><span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{cat.icon} {cat.label}</span></TableCell>
                  <TableCell className="text-xs font-medium">{c.description}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {c.chart_of_accounts ? (
                      <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-medium">{c.chart_of_accounts.code} · {c.chart_of_accounts.description}</span>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.vendor || '—'}</TableCell>
                  <TableCell className="text-xs text-right font-mono font-bold text-destructive">{formatDOP(amountDop)}</TableCell>
                  <TableCell>
                    <ReceiptUpload expenseId={c.id} currentUrl={c.receipt_url} onUploaded={() => queryClient.invalidateQueries({ queryKey: ['costs'] })} />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditCost(c); setShowForm(true); }}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteCost(c)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {costs.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No hay costos registrados</p>}
      </div>
      <CostFormDialog open={showForm} onOpenChange={(v: boolean) => { setShowForm(v); if (!v) setEditCost(null); }} queryClient={queryClient} rate={rate} editCost={editCost} />
      <DeleteConfirmDialog
        open={!!deleteCost}
        onOpenChange={(v) => { if (!v) setDeleteCost(null); }}
        title="Eliminar costo"
        description={`¿Eliminar el costo <strong>${deleteCost?.description || ''}</strong> por <strong>${formatDOP(Number(deleteCost?.amount_dop) || Number(deleteCost?.amount_usd || 0) * (Number(rate?.usd_sell) || 60.76))}</strong>? Esta acción no se puede deshacer.`}
        onConfirm={handleDeleteCost}
      />
    </div>
  );
}

function CostFormDialog({ open, onOpenChange, queryClient, rate, editCost }: any) {
  const [form, setForm] = useState({ description: '', category: 'other', vendor: '', amount_usd: '', amount_dop: '', account_id: '' });
  const [saving, setSaving] = useState(false);
  const xr = Number(rate?.usd_sell) || 60.76;
  const isEdit = !!editCost;

  const { data: accounts = [] } = useQuery({
    queryKey: ['chart-of-accounts-active'],
    queryFn: async () => {
      const { data } = await supabase.from('chart_of_accounts').select('id, code, description, account_type').eq('is_active', true).order('code');
      return data || [];
    },
  });

  const costoAccounts = useMemo(() => accounts.filter((a: any) => ['Costo', 'Gasto', 'Gastos No Operacionales'].includes(a.account_type)), [accounts]);
  const otherAccounts = useMemo(() => accounts.filter((a: any) => !['Costo', 'Gasto', 'Gastos No Operacionales'].includes(a.account_type)), [accounts]);

  useEffect(() => {
    if (editCost) {
      setForm({
        description: editCost.description || '',
        category: editCost.category || 'other',
        vendor: editCost.vendor || '',
        amount_usd: String(editCost.amount_usd || ''),
        amount_dop: String(editCost.amount_dop || ''),
        account_id: editCost.account_id || '',
      });
    } else {
      setForm({ description: '', category: 'other', vendor: '', amount_usd: '', amount_dop: '', account_id: '' });
    }
  }, [editCost, open]);

  const handleSave = async () => {
    if (!form.description.trim()) { toast.error('Descripción requerida'); return; }
    setSaving(true);
    const amtUsd = Number(form.amount_usd) || (Number(form.amount_dop) / xr);
    const amtDop = Number(form.amount_dop) || (Number(form.amount_usd) * xr);
    const payload = {
      description: form.description.trim(), category: form.category as any,
      vendor: form.vendor.trim() || null,
      amount_usd: Math.round(amtUsd * 100) / 100,
      amount_dop: Math.round(amtDop * 100) / 100,
      exchange_rate: xr,
      account_id: form.account_id || null,
    };

    const { error } = isEdit
      ? await supabase.from('costs').update(payload).eq('id', editCost.id)
      : await supabase.from('costs').insert(payload);

    setSaving(false);
    if (error) { toast.error('Error al guardar'); return; }
    toast.success(isEdit ? 'Costo actualizado' : 'Costo registrado');
    queryClient.invalidateQueries({ queryKey: ['costs'] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{isEdit ? 'Editar Costo' : 'Nuevo Costo'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label className="text-xs">Descripción *</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="mt-1" /></div>
            <div>
              <Label className="text-xs">Categoría</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(COST_CATEGORIES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.icon} {v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label className="text-xs">Proveedor</Label><Input value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} className="mt-1" /></div>
            <div>
              <Label className="text-xs">Cuenta Contable</Label>
              <Select value={form.account_id} onValueChange={v => setForm(f => ({ ...f, account_id: v }))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar cuenta..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin asignar</SelectItem>
                  {costoAccounts.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground">Costos / Gastos</div>
                      {costoAccounts.map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>{a.code} · {a.description}</SelectItem>
                      ))}
                    </>
                  )}
                  {otherAccounts.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-[10px] font-semibold text-muted-foreground">Otras cuentas</div>
                      {otherAccounts.map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>{a.code} · {a.description}</SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label className="text-xs">Monto USD</Label><Input type="number" step="0.01" value={form.amount_usd} onChange={e => setForm(f => ({ ...f, amount_usd: e.target.value, amount_dop: String(Math.round(Number(e.target.value) * xr * 100) / 100) }))} className="mt-1" /></div>
            <div><Label className="text-xs">Monto DOP</Label><Input type="number" step="0.01" value={form.amount_dop} onChange={e => setForm(f => ({ ...f, amount_dop: e.target.value, amount_usd: String(Math.round(Number(e.target.value) / xr * 100) / 100) }))} className="mt-1" /></div>
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full">{saving ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Registrar Costo'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============ P&L TAB ============
type PeriodTotals = { revenue: number; cogs: number; grossProfit: number; cogsByProduct: Record<string, number>; expensesByCategory: Record<string, number>; totalExpenses: number; netIncome: number };

function calcPeriodTotals(sales: any[], saleItems: any[], expenses: any[], startDate: string, endDate: string): PeriodTotals {
  const filteredSales = sales.filter((s: any) => s.date >= startDate && s.date <= endDate);
  const saleIds = new Set(filteredSales.map((s: any) => s.id));
  const filteredItems = saleItems.filter((si: any) => saleIds.has(si.sale_id));
  const filteredExpenses = expenses.filter((e: any) => e.date >= startDate && e.date <= endDate);
  const revenue = filteredSales.reduce((s: number, r: any) => s + Number(r.total_usd || 0), 0);
  const cogs = filteredItems.reduce((s: number, r: any) => s + Number(r.unit_cost_usd || 0) * Number(r.quantity || 0), 0);
  const grossProfit = revenue - cogs;
  const cogsByProduct: Record<string, number> = {};
  filteredItems.forEach((si: any) => {
    const name = si.products?.name || 'Otro';
    cogsByProduct[name] = (cogsByProduct[name] || 0) + Number(si.unit_cost_usd || 0) * Number(si.quantity || 0);
  });
  const expensesByCategory: Record<string, number> = {};
  filteredExpenses.forEach((e: any) => {
    const label = EXPENSE_CATEGORIES[e.category]?.label || e.category;
    expensesByCategory[label] = (expensesByCategory[label] || 0) + Number(e.amount_usd || 0);
  });
  const totalExpenses = filteredExpenses.reduce((s: number, r: any) => s + Number(r.amount_usd || 0), 0);
  return { revenue, cogs, grossProfit, cogsByProduct, expensesByCategory, totalExpenses, netIncome: grossProfit - totalExpenses };
}

function getDateRange(period: string, now: Date): { start: string; end: string; label: string } {
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const y = now.getFullYear(), m = now.getMonth();
  switch (period) {
    case 'prev_month': { const s = new Date(y, m - 1, 1); const e = new Date(y, m, 0); return { start: fmt(s), end: fmt(e), label: s.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' }) }; }
    case 'ytd': return { start: `${y}-01-01`, end: fmt(now), label: `YTD ${y}` };
    case 'last_quarter': { const s = new Date(y, m - 3, 1); const e = new Date(y, m, 0); return { start: fmt(s), end: fmt(e), label: 'Últ. Trimestre' }; }
    case 'full_year': return { start: `${y}-01-01`, end: `${y}-12-31`, label: `Año ${y}` };
    default: { const s = new Date(y, m, 1); return { start: fmt(s), end: fmt(now), label: s.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' }) }; }
  }
}

function getPrevRange(r: { start: string; end: string }) {
  const s = new Date(r.start), e = new Date(r.end);
  const days = Math.round((e.getTime() - s.getTime()) / 86400000);
  const pe = new Date(s.getTime() - 86400000);
  const ps = new Date(pe.getTime() - days * 86400000);
  return { start: ps.toISOString().split('T')[0], end: pe.toISOString().split('T')[0] };
}

function getYoYRange(r: { start: string; end: string }) {
  const s = new Date(r.start), e = new Date(r.end);
  s.setFullYear(s.getFullYear() - 1); e.setFullYear(e.getFullYear() - 1);
  return { start: s.toISOString().split('T')[0], end: e.toISOString().split('T')[0] };
}

function deltaStr(cur: number, prev: number): string {
  if (prev === 0) return cur > 0 ? '+∞' : '—';
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

function PLTab({ sales, saleItems, expenses }: { sales: any[]; saleItems: any[]; expenses: any[] }) {
  const [period, setPeriod] = useState('current_month');
  const [expandCogs, setExpandCogs] = useState(false);
  const [expandExpenses, setExpandExpenses] = useState(true);
  const now = useMemo(() => new Date(), []);
  const range = useMemo(() => getDateRange(period, now), [period, now]);
  const prevRange = useMemo(() => getPrevRange(range), [range]);
  const yoyRange = useMemo(() => getYoYRange(range), [range]);

  const current = useMemo(() => calcPeriodTotals(sales, saleItems, expenses, range.start, range.end), [sales, saleItems, expenses, range]);
  const prev = useMemo(() => calcPeriodTotals(sales, saleItems, expenses, prevRange.start, prevRange.end), [sales, saleItems, expenses, prevRange]);
  const yoy = useMemo(() => calcPeriodTotals(sales, saleItems, expenses, yoyRange.start, yoyRange.end), [sales, saleItems, expenses, yoyRange]);

  const trendData = useMemo(() => {
    const months: { month: string; revenue: number; profit: number; revenuePY: number; profitPY: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const dEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const f = (dt: Date) => dt.toISOString().split('T')[0];
      const t = calcPeriodTotals(sales, saleItems, expenses, f(d), f(dEnd));
      const pyS = new Date(d); pyS.setFullYear(pyS.getFullYear() - 1);
      const pyE = new Date(dEnd); pyE.setFullYear(pyE.getFullYear() - 1);
      const py = calcPeriodTotals(sales, saleItems, expenses, f(pyS), f(pyE));
      months.push({ month: d.toLocaleDateString('es-DO', { month: 'short' }), revenue: t.revenue, profit: t.netIncome, revenuePY: py.revenue, profitPY: py.netIncome });
    }
    return months;
  }, [sales, saleItems, expenses, now]);

  const allExpCats = useMemo(() => {
    const cats = new Set<string>();
    [current, prev, yoy].forEach(p => Object.keys(p.expensesByCategory).forEach(k => cats.add(k)));
    return Array.from(cats).sort();
  }, [current, prev, yoy]);

  const allCogProducts = useMemo(() => {
    const prods = new Set<string>();
    [current, prev, yoy].forEach(p => Object.keys(p.cogsByProduct).forEach(k => prods.add(k)));
    return Array.from(prods).sort((a, b) => (current.cogsByProduct[b] || 0) - (current.cogsByProduct[a] || 0));
  }, [current, prev, yoy]);

  // Waterfall chart data
  const waterfallData = useMemo(() => {
    const categories = ['Ingresos', 'COGS', ...allExpCats.filter(cat => (current.expensesByCategory[cat] || 0) > 0 || (prev.expensesByCategory[cat] || 0) > 0).sort((a, b) => (current.expensesByCategory[b] || 0) - (current.expensesByCategory[a] || 0)), 'Utilidad Neta'];

    return categories.map(name => {
      let curVal = 0, prvVal = 0;
      if (name === 'Ingresos') { curVal = current.revenue; prvVal = prev.revenue; }
      else if (name === 'COGS') { curVal = current.cogs; prvVal = prev.cogs; }
      else if (name === 'Utilidad Neta') { curVal = current.netIncome; prvVal = prev.netIncome; }
      else { curVal = current.expensesByCategory[name] || 0; prvVal = prev.expensesByCategory[name] || 0; }

      const delta = curVal - prvVal;
      const deltaPct = prvVal !== 0 ? ((delta / prvVal) * 100) : (curVal > 0 ? 100 : 0);

      return {
        name,
        current: curVal,
        previous: prvVal,
        delta,
        deltaPct: Math.round(deltaPct * 10) / 10,
        isTotal: name === 'Ingresos' || name === 'Utilidad Neta',
      };
    });
  }, [current, prev, allExpCats]);

  // Pareto (80/20) analysis data
  const paretoData = useMemo(() => {
    const costItems: { name: string; value: number }[] = [];
    if (current.cogs > 0) costItems.push({ name: 'COGS', value: current.cogs });
    allExpCats.forEach(cat => {
      const val = current.expensesByCategory[cat] || 0;
      if (val > 0) costItems.push({ name: cat, value: val });
    });
    costItems.sort((a, b) => b.value - a.value);
    const totalCosts = costItems.reduce((s, c) => s + c.value, 0);
    let cumulative = 0;
    return costItems.map((item, i) => {
      cumulative += item.value;
      const pct = totalCosts > 0 ? (item.value / totalCosts) * 100 : 0;
      const cumPct = totalCosts > 0 ? (cumulative / totalCosts) * 100 : 0;
      return {
        name: item.name,
        value: item.value,
        pct: Math.round(pct * 10) / 10,
        cumPct: Math.round(cumPct * 10) / 10,
        fill: cumPct <= 80 ? 'hsl(0, 84%, 60%)' : 'hsl(220, 12%, 45%)',
        in80: cumPct <= 80,
      };
    });
  }, [current, allExpCats]);

  const handleExport = () => {
    const rows = [
      { Concepto: 'Ingresos', [range.label]: current.revenue, 'Período Ant.': prev.revenue, 'Año Ant.': yoy.revenue },
      { Concepto: 'COGS', [range.label]: current.cogs, 'Período Ant.': prev.cogs, 'Año Ant.': yoy.cogs },
      ...allCogProducts.map(p => ({ Concepto: `  ${p}`, [range.label]: current.cogsByProduct[p] || 0, 'Período Ant.': prev.cogsByProduct[p] || 0, 'Año Ant.': yoy.cogsByProduct[p] || 0 })),
      { Concepto: 'Utilidad Bruta', [range.label]: current.grossProfit, 'Período Ant.': prev.grossProfit, 'Año Ant.': yoy.grossProfit },
      ...allExpCats.map(cat => ({ Concepto: `  ${cat}`, [range.label]: current.expensesByCategory[cat] || 0, 'Período Ant.': prev.expensesByCategory[cat] || 0, 'Año Ant.': yoy.expensesByCategory[cat] || 0 })),
      { Concepto: 'Total Gastos', [range.label]: current.totalExpenses, 'Período Ant.': prev.totalExpenses, 'Año Ant.': yoy.totalExpenses },
      { Concepto: 'Utilidad Neta', [range.label]: current.netIncome, 'Período Ant.': prev.netIncome, 'Año Ant.': yoy.netIncome },
    ];
    exportToExcel(rows, 'estado_resultados', 'P&L');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="current_month">Mes Actual</SelectItem>
            <SelectItem value="prev_month">Mes Anterior</SelectItem>
            <SelectItem value="ytd">YTD (Año en Curso)</SelectItem>
            <SelectItem value="last_quarter">Último Trimestre</SelectItem>
            <SelectItem value="full_year">Año Completo</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{range.start} → {range.end}</span>
        <Button size="sm" variant="outline" onClick={handleExport} className="ml-auto"><Download className="w-3.5 h-3.5 mr-1" /> Excel</Button>
      </div>

      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs w-[200px]">Concepto</TableHead>
              <TableHead className="text-xs text-right">{range.label}</TableHead>
              <TableHead className="text-xs text-right text-muted-foreground">Δ vs Ant.</TableHead>
              <TableHead className="text-xs text-right">Período Ant.</TableHead>
              <TableHead className="text-xs text-right text-muted-foreground">Δ vs Año Ant.</TableHead>
              <TableHead className="text-xs text-right">Mismo Per. Año Ant.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <PLCompRow label="Ingresos" cur={current.revenue} prv={prev.revenue} yoy={yoy.revenue} bold />

            {/* COGS with expandable breakdown */}
            <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandCogs(!expandCogs)}>
              <TableCell className="text-xs">
                <span className="inline-flex items-center gap-1">
                  <span className="text-muted-foreground text-[10px]">{expandCogs ? '▼' : '▶'}</span>
                  (-) Costo de Ventas
                </span>
              </TableCell>
              <TableCell className="text-xs text-right font-mono">-{formatUSD(current.cogs)}</TableCell>
              <TableCell className={cn('text-xs text-right font-mono', current.cogs < prev.cogs ? 'text-success' : current.cogs > prev.cogs ? 'text-destructive' : 'text-muted-foreground')}>{deltaStr(current.cogs, prev.cogs)}</TableCell>
              <TableCell className="text-xs text-right font-mono text-muted-foreground">-{formatUSD(prev.cogs)}</TableCell>
              <TableCell className={cn('text-xs text-right font-mono', current.cogs < yoy.cogs ? 'text-success' : current.cogs > yoy.cogs ? 'text-destructive' : 'text-muted-foreground')}>{deltaStr(current.cogs, yoy.cogs)}</TableCell>
              <TableCell className="text-xs text-right font-mono text-muted-foreground">-{formatUSD(yoy.cogs)}</TableCell>
            </TableRow>
            {expandCogs && allCogProducts.map(prod => (
              <PLCompRow key={prod} label={`    ${prod}`} cur={current.cogsByProduct[prod] || 0} prv={prev.cogsByProduct[prod] || 0} yoy={yoy.cogsByProduct[prod] || 0} negative sub />
            ))}

            <TableRow><TableCell colSpan={6} className="p-0"><div className="border-t border-border" /></TableCell></TableRow>
            <PLCompRow label="Utilidad Bruta" cur={current.grossProfit} prv={prev.grossProfit} yoy={yoy.grossProfit} bold />
            <PLCompRow label="Margen Bruto" cur={current.revenue > 0 ? current.grossProfit / current.revenue * 100 : 0} prv={prev.revenue > 0 ? prev.grossProfit / prev.revenue * 100 : 0} yoy={yoy.revenue > 0 ? yoy.grossProfit / yoy.revenue * 100 : 0} pct />

            {/* Expenses with expandable breakdown */}
            <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandExpenses(!expandExpenses)}>
              <TableCell colSpan={6} className="py-1">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <span>{expandExpenses ? '▼' : '▶'}</span>
                  Gastos Operativos
                </span>
              </TableCell>
            </TableRow>
            {expandExpenses && allExpCats.map(cat => (
              <PLCompRow key={cat} label={`  ${cat}`} cur={current.expensesByCategory[cat] || 0} prv={prev.expensesByCategory[cat] || 0} yoy={yoy.expensesByCategory[cat] || 0} negative sub />
            ))}
            <TableRow><TableCell colSpan={6} className="p-0"><div className="border-t border-border" /></TableCell></TableRow>
            <PLCompRow label="(-) Total Gastos" cur={current.totalExpenses} prv={prev.totalExpenses} yoy={yoy.totalExpenses} negative bold />
            <TableRow><TableCell colSpan={6} className="p-0"><div className="border-t-2 border-border" /></TableCell></TableRow>
            <PLCompRow label="Utilidad Neta" cur={current.netIncome} prv={prev.netIncome} yoy={yoy.netIncome} bold highlight />
            <PLCompRow label="Margen Neto" cur={current.revenue > 0 ? current.netIncome / current.revenue * 100 : 0} prv={prev.revenue > 0 ? prev.netIncome / prev.revenue * 100 : 0} yoy={yoy.revenue > 0 ? yoy.netIncome / yoy.revenue * 100 : 0} pct />
          </TableBody>
        </Table>
      </div>

      {/* Waterfall Comparison Chart */}
      <div className="rounded-2xl bg-card border border-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Waterfall: Comparación por Categoría (USD)</h2>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: 'hsl(217, 91%, 60%)' }} /> Actual</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: 'hsl(220, 12%, 40%)' }} /> Anterior</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={380}>
          <BarChart data={waterfallData} barGap={2} barCategoryGap="20%">
            <XAxis dataKey="name" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={80} />
            <YAxis tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
            <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number, name: string) => {
              if (name === 'current') return [formatUSD(v), 'Actual'];
              if (name === 'previous') return [formatUSD(v), 'Anterior'];
              return [formatUSD(v), name];
            }} />
            <Bar dataKey="current" fill="hsl(217, 91%, 60%)" radius={[4,4,0,0]} barSize={28} />
            <Bar dataKey="previous" fill="hsl(220, 12%, 40%)" radius={[4,4,0,0]} barSize={28} />
          </BarChart>
        </ResponsiveContainer>
        {/* Delta indicators */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {waterfallData.map(d => {
            const isGood = d.isTotal ? d.delta > 0 : d.delta < 0;
            const isBad = d.isTotal ? d.delta < 0 : d.delta > 0;
            return (
              <div key={d.name} className="rounded-lg bg-muted/40 border border-border px-2.5 py-1.5 text-center">
                <p className="text-[9px] text-muted-foreground truncate">{d.name}</p>
                <p className={cn('text-[11px] font-bold', isGood ? 'text-success' : isBad ? 'text-destructive' : 'text-muted-foreground')}>
                  {d.delta > 0 ? '+' : ''}{formatUSD(d.delta)}
                </p>
                <p className={cn('text-[9px]', isGood ? 'text-success' : isBad ? 'text-destructive' : 'text-muted-foreground')}>
                  {d.deltaPct > 0 ? '+' : ''}{d.deltaPct}%
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Pareto 80/20 Analysis */}
      {paretoData.length > 0 && (
        <div className="rounded-2xl bg-card border border-border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Análisis Pareto 80/20: Costos por Categoría</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Las barras rojas representan el 80% de tus costos totales — enfoca tu optimización ahí
              </p>
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-destructive inline-block" /> 80% de costos</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: 'hsl(220, 12%, 45%)' }} /> Resto 20%</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={350}>
            <ComposedChart data={paretoData} barSize={36}>
              <XAxis dataKey="name" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={80} />
              <YAxis yAxisId="left" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: 'hsl(38, 92%, 50%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} domain={[0, 100]} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number, name: string) => {
                if (name === 'value') return [formatUSD(v), 'Monto'];
                if (name === 'cumPct') return [`${v}%`, '% Acumulado'];
                return [v, name];
              }} />
              <Bar yAxisId="left" dataKey="value" radius={[4,4,0,0]}>
                {paretoData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
              <Line yAxisId="right" type="monotone" dataKey="cumPct" stroke="hsl(38, 92%, 50%)" strokeWidth={2.5} dot={{ r: 4, fill: 'hsl(38, 92%, 50%)' }} />
            </ComposedChart>
          </ResponsiveContainer>
          {/* Summary badges */}
          <div className="flex gap-2 flex-wrap">
            {paretoData.filter(d => d.in80).map(d => (
              <span key={d.name} className="inline-flex items-center gap-1.5 rounded-lg bg-destructive/10 border border-destructive/20 px-2.5 py-1 text-[10px] font-medium text-destructive">
                {d.name} — {formatUSD(d.value)} ({d.pct}%)
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-card border border-border p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Tendencia 12 Meses (vs Año Anterior)</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={trendData}>
            <XAxis dataKey="month" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
            <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatUSD(v)} />
            <Bar dataKey="revenue" name="Ingresos" fill="hsl(217, 91%, 60%)" radius={[6,6,0,0]} />
            <Bar dataKey="revenuePY" name="Ing. Año Ant." fill="hsl(217, 91%, 60%)" fillOpacity={0.3} radius={[6,6,0,0]} />
            <Bar dataKey="profit" name="Utilidad" fill="hsl(160, 84%, 39%)" radius={[6,6,0,0]} />
            <Bar dataKey="profitPY" name="Util. Año Ant." fill="hsl(160, 84%, 39%)" fillOpacity={0.3} radius={[6,6,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PLCompRow({ label, cur, prv, yoy, bold, negative, pct, highlight, sub }: { label: string; cur: number; prv: number; yoy: number; bold?: boolean; negative?: boolean; pct?: boolean; highlight?: boolean; sub?: boolean }) {
  const fmtVal = (v: number) => pct ? `${v.toFixed(1)}%` : (negative ? (v > 0 ? `-${formatUSD(v)}` : formatUSD(Math.abs(v))) : formatUSD(v));
  const deltaColor = (c: number, p: number) => {
    if (p === 0 && c === 0) return 'text-muted-foreground';
    const better = negative ? c < p : c > p;
    return better ? 'text-success' : c === p ? 'text-muted-foreground' : 'text-destructive';
  };
  const dPrev = pct ? `${(cur - prv).toFixed(1)}pp` : deltaStr(cur, prv);
  const dYoy = pct ? `${(cur - yoy).toFixed(1)}pp` : deltaStr(cur, yoy);
  return (
    <TableRow className={cn(highlight ? 'bg-muted/30' : '', sub && 'bg-muted/10')}>
      <TableCell className={cn('text-xs', bold && 'font-bold', sub && 'text-muted-foreground pl-6')}>{label}</TableCell>
      <TableCell className={cn('text-xs text-right font-mono', bold && 'font-bold', highlight && (cur >= 0 ? 'text-success' : 'text-destructive'), sub && 'text-muted-foreground')}>{fmtVal(cur)}</TableCell>
      <TableCell className={cn('text-xs text-right font-mono', deltaColor(cur, prv))}>{dPrev}</TableCell>
      <TableCell className="text-xs text-right font-mono text-muted-foreground">{fmtVal(prv)}</TableCell>
      <TableCell className={cn('text-xs text-right font-mono', deltaColor(cur, yoy))}>{dYoy}</TableCell>
      <TableCell className="text-xs text-right font-mono text-muted-foreground">{fmtVal(yoy)}</TableCell>
    </TableRow>
  );
}
// ============ MONTHLY TREND CHART ============
const TREND_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

function MonthlyTrendChart({ sales, saleItems, view }: { sales: any[]; saleItems: any[]; view: 'clientes' | 'productos' }) {
  const [metric, setMetric] = useState<'ingresos' | 'margen'>('ingresos');

  const trendData = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('es-DO', { month: 'short', year: '2-digit' }),
      });
    }

    // Build a sale_id → month key map
    const saleMonthMap: Record<string, string> = {};
    sales.forEach((s: any) => { saleMonthMap[s.id] = s.date?.substring(0, 7); });

    // Build margin matrix from saleItems grouped by month+entity
    const marginMatrix: Record<string, Record<string, number>> = {};
    const revenueMatrixFromItems: Record<string, Record<string, number>> = {};

    if (view === 'clientes') {
      // For clients: group saleItems by contact_id via their sale
      const saleContactMap: Record<string, string> = {};
      const clientNames: Record<string, string> = {};
      sales.forEach((s: any) => {
        const cid = s.contact_id || 'sin_cliente';
        saleContactMap[s.id] = cid;
        clientNames[cid] = s.crm_clients?.name || 'Sin Cliente';
      });

      // Revenue matrix from sales (for ingresos view)
      const revenueMatrix: Record<string, Record<string, number>> = {};
      sales.forEach((s: any) => {
        const cid = s.contact_id || 'sin_cliente';
        const mk = s.date?.substring(0, 7);
        if (!revenueMatrix[mk]) revenueMatrix[mk] = {};
        revenueMatrix[mk][cid] = (revenueMatrix[mk][cid] || 0) + Number(s.total_usd || 0);
      });

      // Margin matrix from saleItems
      saleItems.forEach((si: any) => {
        const mk = saleMonthMap[si.sale_id];
        const cid = saleContactMap[si.sale_id] || 'sin_cliente';
        if (!mk) return;
        if (!marginMatrix[mk]) marginMatrix[mk] = {};
        if (!revenueMatrixFromItems[mk]) revenueMatrixFromItems[mk] = {};
        const margin = Number(si.line_total_usd || 0) - Number(si.unit_cost_usd || 0) * Number(si.quantity || 0);
        marginMatrix[mk][cid] = (marginMatrix[mk][cid] || 0) + margin;
        revenueMatrixFromItems[mk][cid] = (revenueMatrixFromItems[mk][cid] || 0) + Number(si.line_total_usd || 0);
      });

      const totals: Record<string, number> = {};
      Object.values(revenueMatrix).forEach(m => Object.entries(m).forEach(([cid, v]) => { totals[cid] = (totals[cid] || 0) + v; }));
      const topIds = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);
      const series = topIds.map(id => ({ id, name: clientNames[id] || id }));
      const activeMatrix = metric === 'ingresos' ? revenueMatrix : marginMatrix;
      const rows = months.map(m => {
        const row: any = { month: m.label };
        series.forEach(s => { row[s.name] = activeMatrix[m.key]?.[s.id] || 0; });
        return row;
      });
      return { rows, series };
    } else {
      const prodNames: Record<string, string> = {};
      const revMatrix: Record<string, Record<string, number>> = {};

      saleItems.forEach((si: any) => {
        const pid = si.product_id || 'unknown';
        prodNames[pid] = si.products?.name || '?';
        const mk = saleMonthMap[si.sale_id];
        if (!mk) return;
        if (!revMatrix[mk]) revMatrix[mk] = {};
        if (!marginMatrix[mk]) marginMatrix[mk] = {};
        revMatrix[mk][pid] = (revMatrix[mk][pid] || 0) + Number(si.line_total_usd || 0);
        const margin = Number(si.line_total_usd || 0) - Number(si.unit_cost_usd || 0) * Number(si.quantity || 0);
        marginMatrix[mk][pid] = (marginMatrix[mk][pid] || 0) + margin;
      });

      const totals: Record<string, number> = {};
      Object.values(revMatrix).forEach(m => Object.entries(m).forEach(([pid, v]) => { totals[pid] = (totals[pid] || 0) + v; }));
      const topIds = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8).map(e => e[0]);
      const series = topIds.map(id => ({ id, name: prodNames[id] || id }));
      const activeMatrix = metric === 'ingresos' ? revMatrix : marginMatrix;
      const rows = months.map(m => {
        const row: any = { month: m.label };
        series.forEach(s => { row[s.name] = activeMatrix[m.key]?.[s.id] || 0; });
        return row;
      });
      return { rows, series };
    }
  }, [sales, saleItems, view, metric]);

  if (trendData.series.length === 0) return null;

  return (
    <div className="rounded-2xl bg-card border border-border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          Tendencia Mensual por {view === 'clientes' ? 'Cliente' : 'Producto'} (6 meses)
        </h2>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-0.5">
          <button
            onClick={() => setMetric('ingresos')}
            className={cn('px-3 py-1 text-xs rounded-md transition-colors',
              metric === 'ingresos' ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground')}
          >Ingresos</button>
          <button
            onClick={() => setMetric('margen')}
            className={cn('px-3 py-1 text-xs rounded-md transition-colors',
              metric === 'margen' ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground')}
          >Margen</button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={trendData.rows}>
          <XAxis dataKey="month" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
          <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatUSD(v)} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {trendData.series.map((s, i) => (
            <Line key={s.id} type="monotone" dataKey={s.name} stroke={TREND_COLORS[i % TREND_COLORS.length]}
              strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ============ REPORTES TAB ============
function ReportesTab({ sales, saleItems }: { sales: any[]; saleItems: any[] }) {
  const [view, setView] = useState<'clientes' | 'productos'>('clientes');
  const [periodFilter, setPeriodFilter] = useState('all');
  const now = useMemo(() => new Date(), []);

  const dateRange = useMemo(() => {
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const y = now.getFullYear(), m = now.getMonth();
    switch (periodFilter) {
      case 'month': return { start: fmt(new Date(y, m, 1)), end: fmt(now) };
      case 'quarter': return { start: fmt(new Date(y, m - 3, 1)), end: fmt(now) };
      case 'ytd': return { start: `${y}-01-01`, end: fmt(now) };
      case 'year': return { start: `${y}-01-01`, end: `${y}-12-31` };
      default: return { start: '2000-01-01', end: '2099-12-31' };
    }
  }, [periodFilter, now]);

  const filteredSales = useMemo(() => sales.filter((s: any) => s.date >= dateRange.start && s.date <= dateRange.end), [sales, dateRange]);
  const filteredSaleIds = useMemo(() => new Set(filteredSales.map((s: any) => s.id)), [filteredSales]);
  const filteredItems = useMemo(() => saleItems.filter((si: any) => filteredSaleIds.has(si.sale_id)), [saleItems, filteredSaleIds]);

  const clientData = useMemo(() => {
    const map: Record<string, { name: string; revenue: number; cogs: number; units: number; lastDate: string; monthlyRevenue: number[] }> = {};
    const nowDate = new Date();
    filteredSales.forEach((s: any) => {
      const key = s.contact_id || 'sin_cliente';
      const name = s.crm_clients?.name || 'Sin Cliente';
      if (!map[key]) map[key] = { name, revenue: 0, cogs: 0, units: 0, lastDate: '', monthlyRevenue: [0, 0, 0, 0, 0, 0] };
      map[key].revenue += Number(s.total_usd || 0);
      if (!map[key].lastDate || s.date > map[key].lastDate) map[key].lastDate = s.date;
      // monthly sparkline (6 months)
      const d = new Date(s.date);
      const monthsAgo = (nowDate.getFullYear() - d.getFullYear()) * 12 + nowDate.getMonth() - d.getMonth();
      if (monthsAgo >= 0 && monthsAgo < 6) map[key].monthlyRevenue[5 - monthsAgo] += Number(s.total_usd || 0);
      const items = s.sale_items || [];
      items.forEach((si: any) => {
        map[key].cogs += Number(si.unit_cost_usd || 0) * Number(si.quantity || 0);
        map[key].units += Number(si.quantity || 0);
      });
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).map(c => {
      const daysSince = c.lastDate ? Math.floor((Date.now() - new Date(c.lastDate).getTime()) / 86400000) : 999;
      const recent3 = c.monthlyRevenue[5] + c.monthlyRevenue[4] + c.monthlyRevenue[3];
      const older3 = c.monthlyRevenue[2] + c.monthlyRevenue[1] + c.monthlyRevenue[0];
      const trendPct = older3 > 0 ? ((recent3 - older3) / older3 * 100) : (recent3 > 0 ? 100 : 0);
      return { ...c, daysSince, trendPct };
    });
  }, [filteredSales]);

  const productData = useMemo(() => {
    const map: Record<string, { name: string; sku: string; revenue: number; cogs: number; units: number; targetMargin: number; monthlyUnits: number[] }> = {};
    const nowDate = new Date();
    filteredItems.forEach((si: any) => {
      const key = si.product_id || 'unknown';
      const name = si.products?.name || 'Producto Desconocido';
      const prod = si.products || {};
      const avgTarget = [prod.margin_list_pct, prod.margin_architect_pct, prod.margin_project_pct, prod.margin_wholesale_pct]
        .filter((v: any) => v != null && v > 0).reduce((a: number, b: number, _: number, arr: number[]) => a + b / arr.length, 0);
      if (!map[key]) map[key] = { name, sku: '', revenue: 0, cogs: 0, units: 0, targetMargin: avgTarget || 0, monthlyUnits: [0, 0, 0, 0, 0, 0] };
      map[key].revenue += Number(si.line_total_usd || 0);
      map[key].cogs += Number(si.unit_cost_usd || 0) * Number(si.quantity || 0);
      map[key].units += Number(si.quantity || 0);
      // monthly units for velocity
      const saleDate = si.sales?.date;
      if (saleDate) {
        const d = new Date(saleDate);
        const monthsAgo = (nowDate.getFullYear() - d.getFullYear()) * 12 + nowDate.getMonth() - d.getMonth();
        if (monthsAgo >= 0 && monthsAgo < 6) map[key].monthlyUnits[5 - monthsAgo] += Number(si.quantity || 0);
      }
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).map(p => {
      const recent3 = p.monthlyUnits[5] + p.monthlyUnits[4] + p.monthlyUnits[3];
      const older3 = p.monthlyUnits[2] + p.monthlyUnits[1] + p.monthlyUnits[0];
      const velocity = Math.round(recent3 / 3);
      const trendPct = older3 > 0 ? ((recent3 - older3) / older3 * 100) : (recent3 > 0 ? 100 : 0);
      return { ...p, velocity, trendPct };
    });
  }, [filteredItems]);

  const data = view === 'clientes' ? clientData : productData;
  const totalRevenue = data.reduce((s, r) => s + r.revenue, 0);
  const totalCogs = data.reduce((s, r) => s + r.cogs, 0);
  const totalGM = totalRevenue - totalCogs;
  const totalGMPct = totalRevenue > 0 ? (totalGM / totalRevenue * 100) : 0;

  const handleExport = () => {
    exportToExcel(data.map(r => ({
      [view === 'clientes' ? 'Cliente' : 'Producto']: r.name,
      'Unidades': r.units,
      'Ingresos USD': r.revenue,
      'COGS USD': r.cogs,
      'GM USD': r.revenue - r.cogs,
      'GM %': r.revenue > 0 ? `${((r.revenue - r.cogs) / r.revenue * 100).toFixed(1)}%` : '0%',
      '% del Total': totalRevenue > 0 ? `${(r.revenue / totalRevenue * 100).toFixed(1)}%` : '0%',
    })), `reporte_${view}`, view === 'clientes' ? 'Por Cliente' : 'Por Producto');
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 rounded-lg bg-muted p-0.5">
          {(['clientes', 'productos'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={cn('rounded-md px-3 py-1 text-xs font-medium transition-colors',
                view === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
              {v === 'clientes' ? 'Por Cliente' : 'Por Producto'}
            </button>
          ))}
        </div>
        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todo el Tiempo</SelectItem>
            <SelectItem value="month">Mes Actual</SelectItem>
            <SelectItem value="quarter">Último Trimestre</SelectItem>
            <SelectItem value="ytd">YTD</SelectItem>
            <SelectItem value="year">Año Completo</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={handleExport} className="ml-auto"><Download className="w-3.5 h-3.5 mr-1" /> Excel</Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Ingresos', value: formatUSD(totalRevenue), color: 'text-primary' },
          { label: 'COGS', value: formatUSD(totalCogs), color: 'text-warning' },
          { label: 'Margen Bruto', value: formatUSD(totalGM), color: totalGM >= 0 ? 'text-success' : 'text-destructive' },
          { label: 'GM %', value: `${totalGMPct.toFixed(1)}%`, color: totalGMPct >= 40 ? 'text-success' : 'text-warning' },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-2xl bg-card border border-border p-4 text-center">
            <p className={cn('text-xl font-bold', kpi.color)}>{kpi.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">{view === 'clientes' ? 'Cliente' : 'Producto'}</TableHead>
              <TableHead className="text-xs text-right">Unidades</TableHead>
              <TableHead className="text-xs text-right">Ingresos</TableHead>
              <TableHead className="text-xs text-right">GM %</TableHead>
              <TableHead className="text-xs text-right">% Total</TableHead>
              {view === 'clientes' ? (
                <>
                  <TableHead className="text-xs text-right">Últ. Compra</TableHead>
                  <TableHead className="text-xs text-right">Días</TableHead>
                  <TableHead className="text-xs text-center">Tendencia</TableHead>
                </>
              ) : (
                <>
                  <TableHead className="text-xs text-right">Vel. uds/mes</TableHead>
                  <TableHead className="text-xs text-center">Tendencia</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((r: any, i: number) => {
              const gm = r.revenue - r.cogs;
              const gmPct = r.revenue > 0 ? (gm / r.revenue * 100) : 0;
              const sharePct = totalRevenue > 0 ? (r.revenue / totalRevenue * 100) : 0;
              const trendPct = r.trendPct ?? 0;
              const isInactive = view === 'clientes' && r.daysSince > 30;
              return (
                <TableRow key={i} className={cn(isInactive && 'bg-destructive/5')}>
                  <TableCell className={cn('text-xs font-medium', isInactive && 'text-destructive')}>{r.name}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{r.units.toLocaleString()}</TableCell>
                  <TableCell className="text-xs text-right font-mono font-bold text-primary">{formatUSD(r.revenue)}</TableCell>
                  <TableCell className={cn('text-xs text-right font-mono', gmPct >= 40 ? 'text-success' : gmPct >= 20 ? 'text-warning' : 'text-destructive')}>{gmPct.toFixed(1)}%</TableCell>
                  <TableCell className="text-xs text-right font-mono text-muted-foreground">{sharePct.toFixed(1)}%</TableCell>
                  {view === 'clientes' ? (
                    <>
                      <TableCell className="text-xs text-right font-mono text-muted-foreground">{r.lastDate || '—'}</TableCell>
                      <TableCell className={cn('text-xs text-right font-mono', isInactive ? 'text-destructive font-semibold' : 'text-muted-foreground')}>{r.daysSince < 999 ? r.daysSince : '—'}</TableCell>
                      <TableCell className="text-xs text-center">
                        <span className={cn('font-mono font-semibold', trendPct >= 0 ? 'text-success' : 'text-destructive')}>
                          {trendPct >= 0 ? '↑' : '↓'} {Math.abs(trendPct).toFixed(0)}%
                        </span>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell className="text-xs text-right font-mono">{r.velocity ?? 0}</TableCell>
                      <TableCell className="text-xs text-center">
                        <span className={cn('font-mono font-semibold', trendPct >= 0 ? 'text-success' : 'text-destructive')}>
                          {trendPct >= 0 ? '↑' : '↓'} {Math.abs(trendPct).toFixed(0)}%
                        </span>
                      </TableCell>
                    </>
                  )}
                </TableRow>
              );
            })}
            {data.length > 0 && (
              <TableRow className="bg-muted/30 font-bold">
                <TableCell className="text-xs font-bold">TOTAL</TableCell>
                <TableCell className="text-xs text-right font-mono font-bold">{data.reduce((s: number, r: any) => s + r.units, 0).toLocaleString()}</TableCell>
                <TableCell className="text-xs text-right font-mono font-bold text-primary">{formatUSD(totalRevenue)}</TableCell>
                <TableCell className="text-xs text-right font-mono font-bold">{totalGMPct.toFixed(1)}%</TableCell>
                <TableCell className="text-xs text-right font-mono font-bold">100%</TableCell>
                <TableCell colSpan={view === 'clientes' ? 3 : 2} />
              </TableRow>
            )}
          </TableBody>
        </Table>
        {data.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No hay datos para el período seleccionado</p>}
      </div>

      {/* Top chart */}
      {data.length > 0 && (
        <div className="rounded-2xl bg-card border border-border p-6 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Top {view === 'clientes' ? 'Clientes' : 'Productos'} por Ingresos</h2>
          <ResponsiveContainer width="100%" height={Math.max(200, Math.min(data.length * 40, 400))}>
            <BarChart data={data.slice(0, 15)} layout="vertical">
              <XAxis type="number" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
              <YAxis type="category" dataKey="name" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 10 }} axisLine={false} tickLine={false} width={120} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatUSD(v)} />
              <Bar dataKey="revenue" name="Ingresos" fill="hsl(217, 91%, 60%)" radius={[0,6,6,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Monthly Trend Chart */}
      <MonthlyTrendChart sales={sales} saleItems={saleItems} view={view} />

      {/* Margin vs Target (products only) */}
      {view === 'productos' && productData.length > 0 && (
        <div className="rounded-2xl bg-card border border-border p-6 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Margen Real vs Objetivo por Producto</h2>
          <ResponsiveContainer width="100%" height={Math.max(200, Math.min(productData.length * 50, 400))}>
            <BarChart data={productData.slice(0, 10).map(p => ({
              name: p.name,
              real: p.revenue > 0 ? +((p.revenue - p.cogs) / p.revenue * 100).toFixed(1) : 0,
              objetivo: +(p.targetMargin || 0).toFixed(1),
            }))} layout="vertical">
              <XAxis type="number" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} domain={[0, 100]} />
              <YAxis type="category" dataKey="name" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 10 }} axisLine={false} tickLine={false} width={140} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => `${v}%`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="real" name="Margen Real" fill="hsl(160, 84%, 39%)" radius={[0,4,4,0]} barSize={14} />
              <Bar dataKey="objetivo" name="Margen Objetivo" fill="hsl(220, 12%, 40%)" radius={[0,4,4,0]} barSize={14} />
            </BarChart>
          </ResponsiveContainer>
          <div className="space-y-1.5">
            {productData.slice(0, 10).map((p, i) => {
              const realPct = p.revenue > 0 ? (p.revenue - p.cogs) / p.revenue * 100 : 0;
              const target = p.targetMargin || 0;
              const diff = realPct - target;
              const hasTarget = target > 0;
              return (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-foreground truncate flex-1">{p.name}</span>
                  <span className={cn('font-mono w-16 text-right', realPct >= target ? 'text-success' : 'text-destructive')}>{realPct.toFixed(1)}%</span>
                  {hasTarget && (
                    <>
                      <span className="text-muted-foreground font-mono w-16 text-right">/ {target.toFixed(1)}%</span>
                      <span className={cn('font-mono w-16 text-right font-semibold', diff >= 0 ? 'text-success' : 'text-destructive')}>
                        {diff >= 0 ? '+' : ''}{diff.toFixed(1)}pp
                      </span>
                    </>
                  )}
                  {!hasTarget && <span className="text-muted-foreground text-[10px] w-32 text-right">Sin objetivo configurado</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function AIAsesorTab({ sales, expenses, revenueMTD, grossMargin }: any) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user' as const, content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    let assistantContent = '';
    const upsert = (chunk: string) => {
      assistantContent += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
        return [...prev, { role: 'assistant', content: assistantContent }];
      });
    };

    try {
      const contextMsg = { role: 'user' as const, content: `[CONTEXTO: Ingresos MTD: $${revenueMTD.toFixed(0)}, Margen: ${grossMargin.toFixed(1)}%, ${sales.length} ventas, ${expenses.length} gastos]\n\n${input}` };
      await streamFinancialAI({ messages: [...messages, contextMsg], action: 'advise', onDelta: upsert, onDone: () => setLoading(false) });
    } catch (e: any) {
      toast.error(e.message || 'Error de IA');
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-2xl bg-card border border-border p-5 flex flex-col" style={{ minHeight: '500px' }}>
        <div className="flex-1 overflow-y-auto space-y-3 mb-4">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-12">
              <Bot className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Pregúntame sobre tus finanzas</p>
              <p className="text-xs mt-1 opacity-70">Ej: "¿Cómo mejoro mi margen?" · "Analiza mis gastos"</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn('text-sm', m.role === 'user' ? 'text-right' : '')}>
              <div className={cn('inline-block rounded-xl px-4 py-2 max-w-[85%] text-left',
                m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                {m.role === 'assistant' ? (
                  <div className="prose prose-sm prose-invert max-w-none"><ReactMarkdown>{m.content}</ReactMarkdown></div>
                ) : <span>{m.content}</span>}
              </div>
            </div>
          ))}
          {loading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="text-sm text-muted-foreground animate-pulse">Analizando...</div>
          )}
        </div>
        <div className="flex gap-2">
          <Input value={input} onChange={e => setInput(e.target.value)} placeholder="Pregunta sobre tus finanzas..."
            className="flex-1" onKeyDown={e => e.key === 'Enter' && sendMessage()} />
          <Button onClick={sendMessage} disabled={loading} className="px-4"><Send className="w-4 h-4" /></Button>
        </div>
      </div>
      <div className="rounded-2xl bg-muted/30 border border-border p-5 space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Contexto Financiero</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Ingresos MTD</span><span className="font-medium">{formatUSD(revenueMTD)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Margen Bruto</span><span className="font-medium">{grossMargin.toFixed(1)}%</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Total Ventas</span><span className="font-medium">{sales.length}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Total Gastos</span><span className="font-medium">{expenses.length}</span></div>
        </div>
      </div>
    </div>
  );
}

// ============ AI ASSISTANT DIALOG ============
function AIAssistantDialog({ open, onOpenChange, queryClient, rate, onEditPrefill, onEditExpensePrefill }: any) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const xr = Number(rate?.usd_sell) || 60.76;

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user' as const, content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setPreview(null);

    let fullResponse = '';
    try {
      await streamFinancialAI({
        messages: [...messages, userMsg],
        action: 'classify',
        onDelta: (chunk) => {
          fullResponse += chunk;
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === 'assistant') return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: fullResponse } : m);
            return [...prev, { role: 'assistant', content: fullResponse }];
          });
        },
        onDone: () => {
          setLoading(false);
          try {
            const cleaned = fullResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(cleaned);
            if (parsed.type && parsed.data) setPreview(parsed);
          } catch {}
        },
      });
    } catch (e: any) {
      toast.error(e.message);
      setLoading(false);
    }
  };

  const approveTransaction = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      if (preview.type === 'expense') {
        await supabase.from('expenses').insert({
          description: preview.data.description, category: preview.data.category as any,
          vendor: preview.data.vendor || null, amount_usd: preview.data.amount_usd,
          amount_dop: preview.data.amount_dop, exchange_rate: preview.data.exchange_rate || xr,
        });
        toast.success('Gasto registrado');
        queryClient.invalidateQueries({ queryKey: ['expenses'] });
      } else if (preview.type === 'sale') {
        const { data: sale } = await supabase.from('sales').insert({
          contact_id: preview.data.contact_id || null, subtotal_usd: preview.data.subtotal_usd,
          itbis_usd: preview.data.itbis_usd, total_usd: preview.data.total_usd,
          total_dop: preview.data.total_dop, exchange_rate: preview.data.exchange_rate || xr,
          payment_status: 'pending' as any,
        }).select().single();
        if (sale && preview.data.items) {
          await supabase.from('sale_items').insert(preview.data.items.map((i: any) => ({
            sale_id: sale.id, product_id: i.product_id || null, quantity: i.quantity,
            unit_price_usd: i.unit_price_usd, unit_cost_usd: i.unit_cost_usd || 0,
            line_total_usd: i.line_total_usd, margin_pct: i.margin_pct || 0,
          })));
        }
        toast.success('Venta registrada');
        queryClient.invalidateQueries({ queryKey: ['sales'] });
        queryClient.invalidateQueries({ queryKey: ['sale-items'] });
      }
      setPreview(null);
      setMessages(prev => [...prev, { role: 'assistant', content: '✅ Transacción aprobada y registrada.' }]);
    } catch { toast.error('Error al registrar'); }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-5 pb-2">
          <DialogTitle className="flex items-center gap-2"><Bot className="w-4 h-4" /> AI Asistente Financiero</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-5 space-y-3 min-h-[250px]">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              <p className="font-medium text-sm">Describe una transacción</p>
              <p className="text-xs mt-1 opacity-70">"Pagué $60 de Fortech" · "Vendí 5 Ram Board a Pedralbes"</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn('text-sm', m.role === 'user' ? 'text-right' : '')}>
              <div className={cn('inline-block rounded-xl px-4 py-2 max-w-[85%] text-left',
                m.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted')}>{m.content}</div>
            </div>
          ))}
          {loading && <div className="text-sm text-muted-foreground animate-pulse">Clasificando...</div>}
          {preview && (
            <div className="rounded-xl border-2 border-primary/30 bg-card p-4 space-y-3">
              <span className="text-xs font-bold text-primary uppercase">{preview.type === 'expense' ? '💸 Gasto' : '💰 Venta'}</span>
              {preview.type === 'expense' && (
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Categoría</span><span>{EXPENSE_CATEGORIES[preview.data.category]?.icon} {EXPENSE_CATEGORIES[preview.data.category]?.label}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Descripción</span><span className="text-right max-w-[60%]">{preview.data.description}</span></div>
                  <div className="flex justify-between font-bold"><span>USD</span><span>{formatUSD(preview.data.amount_usd)}</span></div>
                </div>
              )}
              {preview.type === 'sale' && (
                <div className="space-y-1 text-sm">
                  {preview.data.contact_name && <div className="flex justify-between"><span className="text-muted-foreground">Cliente</span><span>{preview.data.contact_name}</span></div>}
                  {preview.data.items?.map((it: any, i: number) => (
                    <div key={i} className="flex justify-between"><span>{it.product_name} ×{it.quantity}</span><span>{formatUSD(it.line_total_usd)}</span></div>
                  ))}
                  <div className="flex justify-between font-bold"><span>Total</span><span>{formatUSD(preview.data.total_usd)}</span></div>
                </div>
              )}
              {preview.explanation && <p className="text-xs text-muted-foreground italic">{preview.explanation}</p>}
              <div className="flex gap-2">
                <Button size="sm" className="flex-1 gap-1" onClick={approveTransaction} disabled={loading}><Check className="w-3 h-3" /> Aprobar</Button>
                <Button size="sm" variant="outline" className="gap-1" onClick={() => {
                  if (preview.type === 'sale') {
                    onEditPrefill?.({
                      contact_id: preview.data.contact_id,
                      invoice_ref: '',
                      items: preview.data.items?.map((i: any) => ({
                        product_id: i.product_id || '', quantity: i.quantity, unit_price_usd: i.unit_price_usd,
                      })),
                    });
                  } else if (preview.type === 'expense') {
                    onEditExpensePrefill?.({
                      description: preview.data.description, category: preview.data.category,
                      vendor: preview.data.vendor || '', amount_usd: String(preview.data.amount_usd),
                      amount_dop: String(preview.data.amount_dop || 0),
                    });
                  }
                  setPreview(null);
                  onOpenChange(false);
                }}><Pencil className="w-3 h-3" /> Editar</Button>
                <Button size="sm" variant="destructive" className="gap-1" onClick={() => setPreview(null)}><X className="w-3 h-3" /> Rechazar</Button>
              </div>
            </div>
          )}
        </div>
        <div className="flex gap-2 p-5 pt-3 border-t border-border">
          <Input value={input} onChange={e => setInput(e.target.value)} placeholder="Describe la transacción..."
            className="flex-1" onKeyDown={e => e.key === 'Enter' && sendMessage()} />
          <Button onClick={sendMessage} disabled={loading} className="px-4"><Send className="w-4 h-4" /></Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ========== Territory Coverage ==========
const TERRITORY_COLORS = ['hsl(217, 91%, 60%)', 'hsl(160, 84%, 39%)', 'hsl(38, 92%, 50%)', 'hsl(280, 60%, 55%)', 'hsl(0, 84%, 60%)', 'hsl(190, 70%, 50%)', 'hsl(330, 70%, 55%)'];

function TerritoryCoverageSection({ data }: { data: { name: string; count: number; revenue: number; orders: number; active: number }[] }) {
  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
  const totalContacts = data.reduce((s, d) => s + d.count, 0);

  const chartData = data.slice(0, 8).map((d, i) => ({
    name: d.name.length > 12 ? d.name.substring(0, 12) + '...' : d.name,
    revenue: Math.round(d.revenue),
    contacts: d.count,
    fill: TERRITORY_COLORS[i % TERRITORY_COLORS.length],
  }));

  if (data.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5"><MapPin className="w-4 h-4 text-primary" /> Cobertura por Territorio</h2>
        <span className="text-xs text-muted-foreground">{data.length} territorios · {totalContacts} contactos</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
          <h3 className="text-xs font-semibold text-foreground">Ingresos por Territorio</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10 }}>
              <XAxis type="number" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 10 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 10 }} width={90} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatUSD(v)} />
              <Bar dataKey="revenue" radius={[0, 6, 6, 0]}>
                {chartData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
          <h3 className="text-xs font-semibold text-foreground">Distribución de Contactos</h3>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={chartData} innerRadius={40} outerRadius={65} dataKey="contacts" stroke="none">
                {chartData.map((_, i) => <Cell key={i} fill={TERRITORY_COLORS[i % TERRITORY_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={chartTooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1">
            {chartData.map((c, i) => (
              <div key={c.name} className="flex items-center gap-2">
                <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: TERRITORY_COLORS[i % TERRITORY_COLORS.length] }} />
                <span className="text-xs text-foreground truncate">{c.name}</span>
                <span className="text-xs text-muted-foreground ml-auto">{c.contacts}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-card border border-border p-5">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="text-left py-2 font-medium">Territorio</th>
              <th className="text-right py-2 font-medium">Contactos</th>
              <th className="text-right py-2 font-medium">Activos</th>
              <th className="text-right py-2 font-medium">Pedidos</th>
              <th className="text-right py-2 font-medium">Revenue</th>
              <th className="text-right py-2 font-medium">% Revenue</th>
            </tr>
          </thead>
          <tbody>
            {data.map(d => (
              <tr key={d.name} className="border-t border-border/50">
                <td className="py-2.5 font-medium text-foreground">{d.name}</td>
                <td className="py-2.5 text-right text-muted-foreground">{d.count}</td>
                <td className="py-2.5 text-right text-muted-foreground">{d.active}</td>
                <td className="py-2.5 text-right text-muted-foreground">{d.orders}</td>
                <td className="py-2.5 text-right text-foreground font-medium">{formatUSD(d.revenue)}</td>
                <td className="py-2.5 text-right">
                  <span className={cn('text-[10px] font-semibold', d.revenue / totalRevenue > 0.3 ? 'text-primary' : 'text-muted-foreground')}>
                    {totalRevenue > 0 ? ((d.revenue / totalRevenue) * 100).toFixed(1) : 0}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
