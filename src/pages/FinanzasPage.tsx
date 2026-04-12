import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { cn } from '@/lib/utils';
import { formatUSD, formatDOP, getGlobalExchangeRate } from '@/lib/format';
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
import { DatePeriodFilter, useDatePeriodFilter } from '@/components/finanzas/DatePeriodFilter';
import { LibroDiarioTab } from '@/components/finanzas/LibroDiarioTab';
import { BalanceComprobacionTab } from '@/components/finanzas/BalanceComprobacionTab';
import { ReceiptUpload } from '@/components/finanzas/ReceiptUpload';
import { PricingTab } from '@/components/finanzas/PricingTab';
import { OrdenesTab } from '@/components/finanzas/OrdenesTab';

const tabs = ['Crear Transacción', 'Resumen', 'Pricing', 'Órdenes', 'Libro Diario', 'Ventas', 'Gastos', 'Costos', 'P&L', 'Balance', 'Reportes', 'Flujo Caja', 'Break-Even', 'AI Asesor'];

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
      queryClient.invalidateQueries({ queryKey: ['all-exchange-rates'] });
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
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'Crear Transacción';
  const [tab, setTab] = useState(initialTab);
  useEffect(() => { const t = searchParams.get('tab'); if (t && tabs.includes(t)) setTab(t); }, [searchParams]);
  const [salePrefill, setSalePrefill] = useState<any>(null);
  const [expensePrefill, setExpensePrefill] = useState<any>(null);
  const [costPrefill, setCostPrefill] = useState<any>(null);
  const { rate, rateForMonth } = useExchangeRate();
  const fmt = (usd: number) => formatDOP(usd * rate);
  const fmtDop = (dop: number) => formatDOP(dop);
  const queryClient = useQueryClient();

  const { data: sales = [] } = useQuery({
    queryKey: ['sales'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sales').select('*, contacts(contact_name, company_name), sale_items(*, products(name, sku))').order('date', { ascending: false });
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

  const { data: journalEntries = [] } = useQuery({
    queryKey: ['journal-entries'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('journal_entries')
        .select('*, journal_entry_lines(*, chart_of_accounts(code, description))')
        .order('date', { ascending: false });
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
  const mtdCosts = costs.filter((c: any) => c.date?.startsWith(thisMonth));
  const thisMonthRate = rateForMonth(thisMonth);
  const revenueMTD = mtdSales.reduce((s: number, r: any) => s + Number(r.total_usd || 0), 0);
  const expensesMTD_dop = mtdExpenses.reduce((s: number, r: any) => s + (Number(r.amount_dop) || Number(r.amount_usd || 0) * thisMonthRate), 0);
  const cogsMTD = saleItems.filter((si: any) => si.sales?.date?.startsWith(thisMonth))
    .reduce((s: number, r: any) => s + Number(r.unit_cost_usd || 0) * Number(r.quantity || 0), 0);
  const directCostsMTD = mtdCosts.reduce((s: number, r: any) => s + Number(r.amount_usd || 0), 0);
  const grossMargin = revenueMTD > 0 ? ((revenueMTD - cogsMTD - directCostsMTD) / revenueMTD * 100) : 0;
  const netIncome = (revenueMTD - cogsMTD - directCostsMTD) * thisMonthRate - expensesMTD_dop;

  const monthlyData = useMemo(() => {
    const months: { month: string; revenue: number; cogs: number; directCosts: number; expenses: number; profit: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('es-DO', { month: 'short' });
      const mRate = rateForMonth(key);
      const rev = sales.filter((s: any) => s.date?.startsWith(key)).reduce((s: number, r: any) => s + Number(r.total_usd || 0), 0) * mRate;
      const cogs = saleItems.filter((si: any) => si.sales?.date?.startsWith(key))
        .reduce((s: number, r: any) => s + Number(r.unit_cost_usd || 0) * Number(r.quantity || 0), 0) * mRate;
      const dc = costs.filter((c: any) => c.date?.startsWith(key)).reduce((s: number, r: any) => s + Number(r.amount_usd || 0), 0) * mRate;
      const exp = expenses.filter((e: any) => e.date?.startsWith(key)).reduce((s: number, r: any) => s + (Number(r.amount_dop) || Number(r.amount_usd || 0) * mRate), 0);
      months.push({ month: label, revenue: rev, cogs, directCosts: dc, expenses: exp, profit: rev - cogs - dc - exp });
    }
    return months;
  }, [sales, expenses, costs, saleItems, rateForMonth]);

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
          <CrearTransaccionTab rate={latestRate} rateForMonth={rateForMonth}
            onEditSale={(data: any) => { setSalePrefill(data); setTab('Ventas'); }}
            onEditExpense={(data: any) => { setExpensePrefill(data); setTab('Gastos'); }}
            onEditCost={(data: any) => { setCostPrefill(data); setTab('Costos'); }} />
        )}

        {tab === 'Pricing' && <PricingTab />}

        {tab === 'Órdenes' && <OrdenesTab />}

        {tab === 'Resumen' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
              {[
                { label: 'Ingresos MTD', value: fmt(revenueMTD), color: 'text-primary' },
                { label: 'Margen Bruto', value: `${grossMargin.toFixed(1)}%`, color: grossMargin > 40 ? 'text-success' : 'text-warning' },
                { label: 'Costos Directos', value: fmt(directCostsMTD), color: 'text-warning' },
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
                    <Bar dataKey="directCosts" name="Costos Directos" fill="hsl(280, 60%, 55%)" radius={[6,6,0,0]} />
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
            </div>
            <ProductMarginBreakdown saleItems={saleItems} />
          </div>
        )}

        {tab === 'Libro Diario' && <LibroDiarioTab sales={sales} expenses={expenses} costs={costs} journalEntries={journalEntries} rate={Number(latestRate?.usd_sell || 60)} />}

        {tab === 'Ventas' && (
          <div className="space-y-6">
            <VentasTab sales={sales} queryClient={queryClient} rate={latestRate} prefill={salePrefill} clearPrefill={() => setSalePrefill(null)} onExport={() => {
              exportToExcel(sales.map((s: any) => ({
                Fecha: s.date, Ref: s.invoice_ref, Cliente: s.contacts?.contact_name,
                'Subtotal USD': s.subtotal_usd, 'ITBIS USD': s.itbis_usd, 'Total USD': s.total_usd,
                Estado: s.payment_status,
              })), 'ventas', 'Ventas');
            }} />
            <TerritoryCoverageSection data={territoryData} />
          </div>
        )}
        {tab === 'Gastos' && <GastosTab expenses={expenses} queryClient={queryClient} rate={latestRate} prefill={expensePrefill} clearPrefill={() => setExpensePrefill(null)} onExport={() => {
          exportToExcel(expenses.map((e: any) => ({
            Fecha: e.date, Descripción: e.description, Categoría: e.category,
            Proveedor: e.vendor, 'Monto USD': e.amount_usd, 'Monto DOP': e.amount_dop,
          })), 'gastos', 'Gastos');
        }} />}
        {tab === 'Costos' && <CostosTab costs={costs} queryClient={queryClient} rate={latestRate} prefill={costPrefill} clearPrefill={() => setCostPrefill(null)} onExport={() => {
          exportToExcel(costs.map((c: any) => ({
            Fecha: c.date, Descripción: c.description, Categoría: c.category,
            Proveedor: c.vendor, 'Monto USD': c.amount_usd, 'Monto DOP': c.amount_dop,
          })), 'costos', 'Costos');
        }} />}
        {tab === 'P&L' && <PLTab sales={sales} saleItems={saleItems} expenses={expenses} costs={costs} />}
        {tab === 'Balance' && <BalanceComprobacionTab sales={sales} expenses={expenses} costs={costs} saleItems={saleItems} journalEntries={journalEntries} rate={Number(latestRate?.usd_sell || 60)} />}
        {tab === 'Reportes' && <ReportesTab sales={sales} saleItems={saleItems} expenses={expenses} costs={costs} rate={latestRate} rateForMonth={rateForMonth} />}
        {tab === 'Flujo Caja' && <CashFlowTab sales={sales} expenses={expenses} costs={costs} journalEntries={journalEntries} />}
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
  const { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, filterByDate } = useDatePeriodFilter();
  const filteredSales = filterByDate(sales);

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
    // Revert inventory for each sale item before deleting
    if (deleteSale.sale_items?.length) {
      for (const si of deleteSale.sale_items) {
        if (si.product_id && si.quantity) {
          const { data: inv } = await supabase.from('inventory').select('quantity_on_hand').eq('product_id', si.product_id).maybeSingle();
          if (inv) {
            await supabase.from('inventory').update({ quantity_on_hand: inv.quantity_on_hand + si.quantity }).eq('product_id', si.product_id);
          }
          // Create reversal movement
          await supabase.from('inventory_movements').insert({
            product_id: si.product_id,
            quantity: si.quantity,
            movement_type: 'adjustment' as any,
            unit_cost_usd: si.unit_cost_usd || 0,
            reference_id: deleteSale.id,
            reference_type: 'sale_reversal',
            notes: `Reversión por eliminación de venta ${deleteSale.invoice_ref || deleteSale.id.slice(0, 8)}`,
          });
        }
      }
    }
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
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={() => { setEditSale(null); setShowForm(true); }}>+ Nueva Venta</Button>
        <Button size="sm" variant="outline" onClick={onExport}><Download className="w-3.5 h-3.5 mr-1" /> Excel</Button>
        <div className="ml-auto"><DatePeriodFilter period={period} setPeriod={setPeriod} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} /></div>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden max-h-[calc(100vh-320px)] overflow-auto">
        <Table wrapperClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
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
            {filteredSales.map((s: any) => (
              <TableRow key={s.id}>
                <TableCell className="text-xs">{s.date}</TableCell>
                <TableCell className="text-xs font-medium">{s.contacts?.contact_name || '—'}</TableCell>
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
                    <button onClick={() => { setEditSale(s); setShowForm(true); }} title="Editar venta"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteSale(s)} title="Eliminar venta"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filteredSales.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No hay ventas registradas</p>}
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

  const { data: contacts = [] } = useQuery({ queryKey: ['sale-contacts'], queryFn: async () => { const { data } = await supabase.from('contacts').select('id, contact_name, company_name, price_tier'); return data || []; } });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: async () => { const { data } = await supabase.from('products').select('*').eq('is_active', true); return data || []; } });

  const getPriceForTier = (prod: any, tier: string) => {
    switch (tier) {
      case 'architect': return Number(prod?.price_architect_usd || prod?.price_list_usd || 0);
      case 'project': return Number(prod?.price_project_usd || prod?.price_list_usd || 0);
      case 'wholesale': return Number(prod?.price_wholesale_usd || prod?.price_list_usd || 0);
      default: return Number(prod?.price_list_usd || 0);
    }
  };

  const handleClientChange = (contactId: string) => {
    setContactId(contactId);
    const contact = contacts.find((c: any) => c.id === contactId);
    const tier = contact?.price_tier || 'list';
    setPriceTier(tier);
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
      total_dop: total * xr, exchange_rate: xr, payment_status: (isEdit ? editSale.payment_status : 'pending') as any,
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
                <SelectContent>{contacts.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.contact_name}{c.company_name ? ` — ${c.company_name}` : ''}</SelectItem>)}</SelectContent>
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
function GastosTab({ expenses, queryClient, rate, prefill, clearPrefill, onExport }: any) {
  const [showForm, setShowForm] = useState(false);
  const [editExpense, setEditExpense] = useState<any>(null);
  const [deleteExpense, setDeleteExpense] = useState<any>(null);
  const { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, filterByDate } = useDatePeriodFilter();
  const filteredExpenses = filterByDate(expenses);

  useEffect(() => {
    if (prefill) {
      setEditExpense(prefill);
      setShowForm(true);
      clearPrefill?.();
    }
  }, [prefill]);

  const handleDeleteExpense = async () => {
    if (!deleteExpense) return;
    const { error } = await supabase.from('expenses').delete().eq('id', deleteExpense.id);
    if (error) { toast.error('Error al eliminar gasto'); throw error; }
    toast.success('Gasto eliminado');
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={() => { setEditExpense(null); setShowForm(true); }}>+ Nuevo Gasto</Button>
        <Button size="sm" variant="outline" onClick={onExport}><Download className="w-3.5 h-3.5 mr-1" /> Excel</Button>
        <div className="ml-auto"><DatePeriodFilter period={period} setPeriod={setPeriod} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} /></div>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden max-h-[calc(100vh-320px)] overflow-auto">
        <Table wrapperClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
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
            {filteredExpenses.map((e: any) => {
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
                      <button onClick={() => { setEditExpense(e); setShowForm(true); }} title="Editar gasto"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteExpense(e)} title="Eliminar gasto"
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
        {filteredExpenses.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No hay gastos registrados</p>}
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
  const [form, setForm] = useState({ description: '', category: 'other', vendor: '', amount_usd: '', amount_dop: '', account_id: 'none' });
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
        account_id: editExpense.account_id || 'none',
      });
    } else {
      setForm({ description: '', category: 'other', vendor: '', amount_usd: '', amount_dop: '', account_id: 'none' });
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
      account_id: form.account_id && form.account_id !== 'none' ? form.account_id : null,
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
                  <SelectItem value="none">Sin asignar</SelectItem>
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
function CostosTab({ costs, queryClient, rate, prefill, clearPrefill, onExport }: any) {
  const [showForm, setShowForm] = useState(false);
  const [editCost, setEditCost] = useState<any>(null);
  const [deleteCost, setDeleteCost] = useState<any>(null);
  const { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, filterByDate } = useDatePeriodFilter();
  const filteredCosts = filterByDate(costs);

  useEffect(() => {
    if (prefill) {
      setEditCost(prefill);
      setShowForm(true);
      clearPrefill?.();
    }
  }, [prefill]);

  const handleDeleteCost = async () => {
    if (!deleteCost) return;
    const { error } = await supabase.from('costs').delete().eq('id', deleteCost.id);
    if (error) { toast.error('Error al eliminar costo'); throw error; }
    toast.success('Costo eliminado');
    queryClient.invalidateQueries({ queryKey: ['costs'] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" onClick={() => { setEditCost(null); setShowForm(true); }}>+ Nuevo Costo</Button>
        <Button size="sm" variant="outline" onClick={onExport}><Download className="w-3.5 h-3.5 mr-1" /> Excel</Button>
        <div className="ml-auto"><DatePeriodFilter period={period} setPeriod={setPeriod} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} /></div>
      </div>
      <div className="rounded-xl border border-border bg-card overflow-hidden max-h-[calc(100vh-320px)] overflow-auto">
        <Table wrapperClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
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
            {filteredCosts.map((c: any) => {
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
                    <ReceiptUpload expenseId={c.id} currentUrl={c.receipt_url} onUploaded={() => queryClient.invalidateQueries({ queryKey: ['costs'] })} tableName="costs" />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <button onClick={() => { setEditCost(c); setShowForm(true); }} title="Editar costo"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteCost(c)} title="Eliminar costo"
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
        {filteredCosts.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No hay costos registrados</p>}
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
  const [form, setForm] = useState({ description: '', category: 'other', vendor: '', amount_usd: '', amount_dop: '', account_id: 'none' });
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
        account_id: editCost.account_id || 'none',
      });
    } else {
      setForm({ description: '', category: 'other', vendor: '', amount_usd: '', amount_dop: '', account_id: 'none' });
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
      account_id: form.account_id && form.account_id !== 'none' ? form.account_id : null,
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
                  <SelectItem value="none">Sin asignar</SelectItem>
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
type PeriodTotals = { revenue: number; cogs: number; grossProfit: number; cogsByProduct: Record<string, number>; directCosts: number; costsByCategory: Record<string, number>; expensesByCategory: Record<string, number>; totalExpenses: number; netIncome: number };

function calcPeriodTotals(sales: any[], saleItems: any[], expenses: any[], startDate: string, endDate: string, costs: any[] = []): PeriodTotals {
  const filteredSales = sales.filter((s: any) => s.date >= startDate && s.date <= endDate);
  const saleIds = new Set(filteredSales.map((s: any) => s.id));
  const filteredItems = saleItems.filter((si: any) => saleIds.has(si.sale_id));
  const filteredExpenses = expenses.filter((e: any) => e.date >= startDate && e.date <= endDate);
  const filteredCosts = costs.filter((c: any) => c.date >= startDate && c.date <= endDate);
  const revenue = filteredSales.reduce((s: number, r: any) => s + Number(r.total_usd || 0), 0);
  const cogs = filteredItems.reduce((s: number, r: any) => s + Number(r.unit_cost_usd || 0) * Number(r.quantity || 0), 0);
  const cogsByProduct: Record<string, number> = {};
  filteredItems.forEach((si: any) => {
    const name = si.products?.name || 'Otro';
    cogsByProduct[name] = (cogsByProduct[name] || 0) + Number(si.unit_cost_usd || 0) * Number(si.quantity || 0);
  });
  const costsByCategory: Record<string, number> = {};
  filteredCosts.forEach((c: any) => {
    const label = COST_CATEGORIES[c.category]?.label || c.category;
    costsByCategory[label] = (costsByCategory[label] || 0) + Number(c.amount_usd || 0);
  });
  const directCosts = filteredCosts.reduce((s: number, r: any) => s + Number(r.amount_usd || 0), 0);
  const grossProfit = revenue - cogs - directCosts;
  const expensesByCategory: Record<string, number> = {};
  filteredExpenses.forEach((e: any) => {
    const label = EXPENSE_CATEGORIES[e.category]?.label || e.category;
    expensesByCategory[label] = (expensesByCategory[label] || 0) + Number(e.amount_usd || 0);
  });
  const totalExpenses = filteredExpenses.reduce((s: number, r: any) => s + Number(r.amount_usd || 0), 0);
  return { revenue, cogs, grossProfit, cogsByProduct, directCosts, costsByCategory, expensesByCategory, totalExpenses, netIncome: grossProfit - totalExpenses };
}

function getDateRange(period: string, now: Date, customFrom?: Date, customTo?: Date): { start: string; end: string; label: string } {
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  const y = now.getFullYear(), m = now.getMonth();
  switch (period) {
    case 'prev_month': { const s = new Date(y, m - 1, 1); const e = new Date(y, m, 0); return { start: fmt(s), end: fmt(e), label: s.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' }) }; }
    case 'ytd': return { start: `${y}-01-01`, end: fmt(now), label: `YTD ${y}` };
    case 'last_quarter': { const s = new Date(y, m - 3, 1); const e = new Date(y, m, 0); return { start: fmt(s), end: fmt(e), label: 'Últ. Trimestre' }; }
    case 'full_year': return { start: `${y}-01-01`, end: `${y}-12-31`, label: `Año ${y}` };
    case 'custom': {
      const s = customFrom ? fmt(customFrom) : '2000-01-01';
      const e = customTo ? fmt(customTo) : fmt(now);
      return { start: s, end: e, label: 'Personalizado' };
    }
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

function PLTab({ sales, saleItems, expenses, costs }: { sales: any[]; saleItems: any[]; expenses: any[]; costs: any[] }) {
  const [period, setPeriod] = useState('current_month');
  const [compareMode, setCompareMode] = useState<'both' | 'prev' | 'yoy'>('both');
  const [expandCogs, setExpandCogs] = useState(false);
  const [expandCosts, setExpandCosts] = useState(false);
  const [expandExpenses, setExpandExpenses] = useState(true);
  const [plCustomFrom, setPlCustomFrom] = useState<Date | undefined>(undefined);
  const [plCustomTo, setPlCustomTo] = useState<Date | undefined>(undefined);
  const now = useMemo(() => new Date(), []);
  const range = useMemo(() => getDateRange(period, now, plCustomFrom, plCustomTo), [period, now, plCustomFrom, plCustomTo]);
  const prevRange = useMemo(() => getPrevRange(range), [range]);
  const yoyRange = useMemo(() => getYoYRange(range), [range]);

  const current = useMemo(() => calcPeriodTotals(sales, saleItems, expenses, range.start, range.end, costs), [sales, saleItems, expenses, costs, range]);
  const prev = useMemo(() => calcPeriodTotals(sales, saleItems, expenses, prevRange.start, prevRange.end, costs), [sales, saleItems, expenses, costs, prevRange]);
  const yoy = useMemo(() => calcPeriodTotals(sales, saleItems, expenses, yoyRange.start, yoyRange.end, costs), [sales, saleItems, expenses, costs, yoyRange]);

  const trendData = useMemo(() => {
    const months: { month: string; revenue: number; cogs: number; directCosts: number; grossProfit: number; totalExpenses: number; profit: number; revenuePY: number; profitPY: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const dEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const f = (dt: Date) => dt.toISOString().split('T')[0];
      const t = calcPeriodTotals(sales, saleItems, expenses, f(d), f(dEnd), costs);
      const pyS = new Date(d); pyS.setFullYear(pyS.getFullYear() - 1);
      const pyE = new Date(dEnd); pyE.setFullYear(pyE.getFullYear() - 1);
      const py = calcPeriodTotals(sales, saleItems, expenses, f(pyS), f(pyE), costs);
      months.push({ month: d.toLocaleDateString('es-DO', { month: 'short' }), revenue: t.revenue, cogs: t.cogs, directCosts: t.directCosts, grossProfit: t.grossProfit, totalExpenses: t.totalExpenses, profit: t.netIncome, revenuePY: py.revenue, profitPY: py.netIncome });
    }
    return months;
  }, [sales, saleItems, expenses, costs, now]);

  const allExpCats = useMemo(() => {
    const cats = new Set<string>();
    [current, prev, yoy].forEach(p => Object.keys(p.expensesByCategory).forEach(k => cats.add(k)));
    return Array.from(cats).sort();
  }, [current, prev, yoy]);

  const allCostCats = useMemo(() => {
    const cats = new Set<string>();
    [current, prev, yoy].forEach(p => Object.keys(p.costsByCategory).forEach(k => cats.add(k)));
    return Array.from(cats).sort();
  }, [current, prev, yoy]);

  const allCogProducts = useMemo(() => {
    const prods = new Set<string>();
    [current, prev, yoy].forEach(p => Object.keys(p.cogsByProduct).forEach(k => prods.add(k)));
    return Array.from(prods).sort((a, b) => (current.cogsByProduct[b] || 0) - (current.cogsByProduct[a] || 0));
  }, [current, prev, yoy]);

  // Waterfall chart data
  const waterfallData = useMemo(() => {
    const categories = ['Ingresos', 'COGS', 'Costos Directos', ...allExpCats.filter(cat => (current.expensesByCategory[cat] || 0) > 0 || (prev.expensesByCategory[cat] || 0) > 0).sort((a, b) => (current.expensesByCategory[b] || 0) - (current.expensesByCategory[a] || 0)), 'Utilidad Neta'];

    return categories.map(name => {
      let curVal = 0, prvVal = 0;
      if (name === 'Ingresos') { curVal = current.revenue; prvVal = prev.revenue; }
      else if (name === 'COGS') { curVal = current.cogs; prvVal = prev.cogs; }
      else if (name === 'Costos Directos') { curVal = current.directCosts; prvVal = prev.directCosts; }
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
    const pctOf = (val: number, rev: number) => rev > 0 ? `${((val / rev) * 100).toFixed(1)}%` : '0.0%';
    const rows = [
      { Concepto: 'Ingresos', [range.label]: current.revenue, '% Ingreso': '100.0%', 'Período Ant.': prev.revenue, '% Ant.': '100.0%', 'Año Ant.': yoy.revenue, '% YoY': '100.0%', 'Δ vs Ant.': deltaStr(current.revenue, prev.revenue), 'Δ vs Año': deltaStr(current.revenue, yoy.revenue) },
      { Concepto: '', [range.label]: '', '% Ingreso': '', 'Período Ant.': '', '% Ant.': '', 'Año Ant.': '', '% YoY': '', 'Δ vs Ant.': '', 'Δ vs Año': '' },
      { Concepto: 'COGS', [range.label]: current.cogs, '% Ingreso': pctOf(current.cogs, current.revenue), 'Período Ant.': prev.cogs, '% Ant.': pctOf(prev.cogs, prev.revenue), 'Año Ant.': yoy.cogs, '% YoY': pctOf(yoy.cogs, yoy.revenue), 'Δ vs Ant.': deltaStr(current.cogs, prev.cogs), 'Δ vs Año': deltaStr(current.cogs, yoy.cogs) },
      ...allCogProducts.map(p => ({ Concepto: `  ${p}`, [range.label]: current.cogsByProduct[p] || 0, '% Ingreso': pctOf(current.cogsByProduct[p] || 0, current.revenue), 'Período Ant.': prev.cogsByProduct[p] || 0, '% Ant.': pctOf(prev.cogsByProduct[p] || 0, prev.revenue), 'Año Ant.': yoy.cogsByProduct[p] || 0, '% YoY': pctOf(yoy.cogsByProduct[p] || 0, yoy.revenue), 'Δ vs Ant.': '', 'Δ vs Año': '' })),
      { Concepto: '', [range.label]: '', '% Ingreso': '', 'Período Ant.': '', '% Ant.': '', 'Año Ant.': '', '% YoY': '', 'Δ vs Ant.': '', 'Δ vs Año': '' },
      { Concepto: 'Costos Directos', [range.label]: current.directCosts, '% Ingreso': pctOf(current.directCosts, current.revenue), 'Período Ant.': prev.directCosts, '% Ant.': pctOf(prev.directCosts, prev.revenue), 'Año Ant.': yoy.directCosts, '% YoY': pctOf(yoy.directCosts, yoy.revenue), 'Δ vs Ant.': deltaStr(current.directCosts, prev.directCosts), 'Δ vs Año': deltaStr(current.directCosts, yoy.directCosts) },
      ...allCostCats.map(cat => ({ Concepto: `  ${cat}`, [range.label]: current.costsByCategory[cat] || 0, '% Ingreso': pctOf(current.costsByCategory[cat] || 0, current.revenue), 'Período Ant.': prev.costsByCategory[cat] || 0, '% Ant.': pctOf(prev.costsByCategory[cat] || 0, prev.revenue), 'Año Ant.': yoy.costsByCategory[cat] || 0, '% YoY': pctOf(yoy.costsByCategory[cat] || 0, yoy.revenue), 'Δ vs Ant.': '', 'Δ vs Año': '' })),
      { Concepto: '', [range.label]: '', '% Ingreso': '', 'Período Ant.': '', '% Ant.': '', 'Año Ant.': '', '% YoY': '', 'Δ vs Ant.': '', 'Δ vs Año': '' },
      { Concepto: 'UTILIDAD BRUTA', [range.label]: current.grossProfit, '% Ingreso': pctOf(current.grossProfit, current.revenue), 'Período Ant.': prev.grossProfit, '% Ant.': pctOf(prev.grossProfit, prev.revenue), 'Año Ant.': yoy.grossProfit, '% YoY': pctOf(yoy.grossProfit, yoy.revenue), 'Δ vs Ant.': deltaStr(current.grossProfit, prev.grossProfit), 'Δ vs Año': deltaStr(current.grossProfit, yoy.grossProfit) },
      { Concepto: '', [range.label]: '', '% Ingreso': '', 'Período Ant.': '', '% Ant.': '', 'Año Ant.': '', '% YoY': '', 'Δ vs Ant.': '', 'Δ vs Año': '' },
      { Concepto: 'GASTOS OPERATIVOS', [range.label]: '', '% Ingreso': '', 'Período Ant.': '', '% Ant.': '', 'Año Ant.': '', '% YoY': '', 'Δ vs Ant.': '', 'Δ vs Año': '' },
      ...allExpCats.map(cat => ({ Concepto: `  ${cat}`, [range.label]: current.expensesByCategory[cat] || 0, '% Ingreso': pctOf(current.expensesByCategory[cat] || 0, current.revenue), 'Período Ant.': prev.expensesByCategory[cat] || 0, '% Ant.': pctOf(prev.expensesByCategory[cat] || 0, prev.revenue), 'Año Ant.': yoy.expensesByCategory[cat] || 0, '% YoY': pctOf(yoy.expensesByCategory[cat] || 0, yoy.revenue), 'Δ vs Ant.': deltaStr(current.expensesByCategory[cat] || 0, prev.expensesByCategory[cat] || 0), 'Δ vs Año': deltaStr(current.expensesByCategory[cat] || 0, yoy.expensesByCategory[cat] || 0) })),
      { Concepto: 'Total Gastos', [range.label]: current.totalExpenses, '% Ingreso': pctOf(current.totalExpenses, current.revenue), 'Período Ant.': prev.totalExpenses, '% Ant.': pctOf(prev.totalExpenses, prev.revenue), 'Año Ant.': yoy.totalExpenses, '% YoY': pctOf(yoy.totalExpenses, yoy.revenue), 'Δ vs Ant.': deltaStr(current.totalExpenses, prev.totalExpenses), 'Δ vs Año': deltaStr(current.totalExpenses, yoy.totalExpenses) },
      { Concepto: '', [range.label]: '', '% Ingreso': '', 'Período Ant.': '', '% Ant.': '', 'Año Ant.': '', '% YoY': '', 'Δ vs Ant.': '', 'Δ vs Año': '' },
      { Concepto: 'UTILIDAD NETA', [range.label]: current.netIncome, '% Ingreso': pctOf(current.netIncome, current.revenue), 'Período Ant.': prev.netIncome, '% Ant.': pctOf(prev.netIncome, prev.revenue), 'Año Ant.': yoy.netIncome, '% YoY': pctOf(yoy.netIncome, yoy.revenue), 'Δ vs Ant.': deltaStr(current.netIncome, prev.netIncome), 'Δ vs Año': deltaStr(current.netIncome, yoy.netIncome) },
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
            <SelectItem value="custom">Personalizado</SelectItem>
          </SelectContent>
        </Select>
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn('w-[130px] justify-start text-left text-xs font-normal', !plCustomFrom && 'text-muted-foreground')}>
                  <CalendarIcon className="w-3.5 h-3.5 mr-1" />
                  {plCustomFrom ? format(plCustomFrom, 'dd/MM/yyyy') : 'Desde'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={plCustomFrom} onSelect={setPlCustomFrom} initialFocus className={cn('p-3 pointer-events-auto')} />
              </PopoverContent>
            </Popover>
            <span className="text-xs text-muted-foreground">→</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn('w-[130px] justify-start text-left text-xs font-normal', !plCustomTo && 'text-muted-foreground')}>
                  <CalendarIcon className="w-3.5 h-3.5 mr-1" />
                  {plCustomTo ? format(plCustomTo, 'dd/MM/yyyy') : 'Hasta'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={plCustomTo} onSelect={setPlCustomTo} initialFocus className={cn('p-3 pointer-events-auto')} />
              </PopoverContent>
            </Popover>
          </div>
        )}
        <span className="text-xs text-muted-foreground">{range.start} → {range.end}</span>
        <Button size="sm" variant="outline" onClick={handleExport} className="ml-auto"><Download className="w-3.5 h-3.5 mr-1" /> Excel</Button>
      </div>

      {/* Comparison mode toggle */}
      <div className="flex items-center gap-1 rounded-xl bg-muted p-1 w-fit">
        {([['both', 'Completo'], ['prev', 'vs Mes Anterior'], ['yoy', 'vs Año Anterior']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setCompareMode(key)}
            className={cn('rounded-lg px-3 py-1 text-[11px] font-medium transition-colors',
              compareMode === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
            {label}
          </button>
        ))}
      </div>

      <div className="rounded-2xl bg-card border border-border overflow-hidden max-h-[calc(100vh-320px)] overflow-auto">
        <Table wrapperClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
            <TableRow>
              <TableHead className="text-xs w-[200px]">Concepto</TableHead>
              <TableHead className="text-xs text-right">{range.label}</TableHead>
              {compareMode === 'both' ? (
                <>
                  <TableHead className="text-xs text-right text-muted-foreground">Δ vs Ant.</TableHead>
                  <TableHead className="text-xs text-right">Período Ant.</TableHead>
                  <TableHead className="text-xs text-right text-muted-foreground">Δ vs Año Ant.</TableHead>
                  <TableHead className="text-xs text-right">Mismo Per. Año Ant.</TableHead>
                </>
              ) : (
                <>
                  <TableHead className="text-xs text-right">{compareMode === 'prev' ? 'Período Ant.' : 'Año Ant.'}</TableHead>
                  <TableHead className="text-xs text-right">% Cambio</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            <PLCompRow label="Ingresos" cur={current.revenue} prv={prev.revenue} yoy={yoy.revenue} bold mode={compareMode} />

            {/* COGS with expandable breakdown */}
            <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandCogs(!expandCogs)}>
              <TableCell className="text-xs">
                <span className="inline-flex items-center gap-1">
                  <span className="text-muted-foreground text-[10px]">{expandCogs ? '▼' : '▶'}</span>
                  (-) Costo de Ventas
                </span>
              </TableCell>
              <TableCell className="text-xs text-right font-mono">-{formatUSD(current.cogs)}</TableCell>
              {compareMode === 'both' ? (
                <>
                  <TableCell className={cn('text-xs text-right font-mono', current.cogs < prev.cogs ? 'text-success' : current.cogs > prev.cogs ? 'text-destructive' : 'text-muted-foreground')}>{deltaStr(current.cogs, prev.cogs)}</TableCell>
                  <TableCell className="text-xs text-right font-mono text-muted-foreground">-{formatUSD(prev.cogs)}</TableCell>
                  <TableCell className={cn('text-xs text-right font-mono', current.cogs < yoy.cogs ? 'text-success' : current.cogs > yoy.cogs ? 'text-destructive' : 'text-muted-foreground')}>{deltaStr(current.cogs, yoy.cogs)}</TableCell>
                  <TableCell className="text-xs text-right font-mono text-muted-foreground">-{formatUSD(yoy.cogs)}</TableCell>
                </>
              ) : (() => {
                const comp = compareMode === 'prev' ? prev.cogs : yoy.cogs;
                const pctChange = comp !== 0 ? ((current.cogs - comp) / comp * 100) : (current.cogs > 0 ? 100 : 0);
                const isGood = current.cogs < comp;
                return (
                  <>
                    <TableCell className="text-xs text-right font-mono text-muted-foreground">-{formatUSD(comp)}</TableCell>
                    <TableCell className={cn('text-xs text-right font-mono font-semibold', isGood ? 'text-success' : pctChange > 0 ? 'text-destructive' : 'text-muted-foreground')}>
                      {pctChange > 0 ? '+' : ''}{pctChange.toFixed(1)}%
                    </TableCell>
                  </>
                );
              })()}
            </TableRow>
            {expandCogs && allCogProducts.map(prod => (
              <PLCompRow key={prod} label={`    ${prod}`} cur={current.cogsByProduct[prod] || 0} prv={prev.cogsByProduct[prod] || 0} yoy={yoy.cogsByProduct[prod] || 0} negative sub mode={compareMode} />
            ))}

            {/* Direct Costs (from costs module) */}
            {(current.directCosts > 0 || prev.directCosts > 0 || yoy.directCosts > 0) && (
              <>
                <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandCosts(!expandCosts)}>
                  <TableCell className="text-xs">
                    <span className="inline-flex items-center gap-1">
                      <span className="text-muted-foreground text-[10px]">{expandCosts ? '▼' : '▶'}</span>
                      (-) Costos Directos
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-right font-mono">-{formatUSD(current.directCosts)}</TableCell>
                  {compareMode === 'both' ? (
                    <>
                      <TableCell className={cn('text-xs text-right font-mono', current.directCosts < prev.directCosts ? 'text-success' : current.directCosts > prev.directCosts ? 'text-destructive' : 'text-muted-foreground')}>{deltaStr(current.directCosts, prev.directCosts)}</TableCell>
                      <TableCell className="text-xs text-right font-mono text-muted-foreground">-{formatUSD(prev.directCosts)}</TableCell>
                      <TableCell className={cn('text-xs text-right font-mono', current.directCosts < yoy.directCosts ? 'text-success' : current.directCosts > yoy.directCosts ? 'text-destructive' : 'text-muted-foreground')}>{deltaStr(current.directCosts, yoy.directCosts)}</TableCell>
                      <TableCell className="text-xs text-right font-mono text-muted-foreground">-{formatUSD(yoy.directCosts)}</TableCell>
                    </>
                  ) : (() => {
                    const comp = compareMode === 'prev' ? prev.directCosts : yoy.directCosts;
                    const pctChange = comp !== 0 ? ((current.directCosts - comp) / comp * 100) : (current.directCosts > 0 ? 100 : 0);
                    const isGood = current.directCosts < comp;
                    return (
                      <>
                        <TableCell className="text-xs text-right font-mono text-muted-foreground">-{formatUSD(comp)}</TableCell>
                        <TableCell className={cn('text-xs text-right font-mono font-semibold', isGood ? 'text-success' : pctChange > 0 ? 'text-destructive' : 'text-muted-foreground')}>
                          {pctChange > 0 ? '+' : ''}{pctChange.toFixed(1)}%
                        </TableCell>
                      </>
                    );
                  })()}
                </TableRow>
                {expandCosts && allCostCats.map(cat => (
                  <PLCompRow key={cat} label={`    ${cat}`} cur={current.costsByCategory[cat] || 0} prv={prev.costsByCategory[cat] || 0} yoy={yoy.costsByCategory[cat] || 0} negative sub mode={compareMode} />
                ))}
              </>
            )}

            <TableRow><TableCell colSpan={compareMode === 'both' ? 6 : 4} className="p-0"><div className="border-t border-border" /></TableCell></TableRow>
            <PLCompRow label="Utilidad Bruta" cur={current.grossProfit} prv={prev.grossProfit} yoy={yoy.grossProfit} bold mode={compareMode} />
            <PLCompRow label="Margen Bruto" cur={current.revenue > 0 ? current.grossProfit / current.revenue * 100 : 0} prv={prev.revenue > 0 ? prev.grossProfit / prev.revenue * 100 : 0} yoy={yoy.revenue > 0 ? yoy.grossProfit / yoy.revenue * 100 : 0} pct mode={compareMode} />

            {/* Expenses with expandable breakdown */}
            <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => setExpandExpenses(!expandExpenses)}>
              <TableCell colSpan={compareMode === 'both' ? 6 : 4} className="py-1">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <span>{expandExpenses ? '▼' : '▶'}</span>
                  Gastos Operativos
                </span>
              </TableCell>
            </TableRow>
            {expandExpenses && allExpCats.map(cat => (
              <PLCompRow key={cat} label={`  ${cat}`} cur={current.expensesByCategory[cat] || 0} prv={prev.expensesByCategory[cat] || 0} yoy={yoy.expensesByCategory[cat] || 0} negative sub mode={compareMode} />
            ))}
            <TableRow><TableCell colSpan={compareMode === 'both' ? 6 : 4} className="p-0"><div className="border-t border-border" /></TableCell></TableRow>
            <PLCompRow label="(-) Total Gastos" cur={current.totalExpenses} prv={prev.totalExpenses} yoy={yoy.totalExpenses} negative bold mode={compareMode} />
            <TableRow><TableCell colSpan={compareMode === 'both' ? 6 : 4} className="p-0"><div className="border-t-2 border-border" /></TableCell></TableRow>
            <PLCompRow label="Utilidad Neta" cur={current.netIncome} prv={prev.netIncome} yoy={yoy.netIncome} bold highlight mode={compareMode} />
            <PLCompRow label="Margen Neto" cur={current.revenue > 0 ? current.netIncome / current.revenue * 100 : 0} prv={prev.revenue > 0 ? prev.netIncome / prev.revenue * 100 : 0} yoy={yoy.revenue > 0 ? yoy.netIncome / yoy.revenue * 100 : 0} pct mode={compareMode} />
          </TableBody>
        </Table>
      </div>

      {/* Waterfall Comparison Chart */}
      <div className="rounded-2xl bg-card border border-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Waterfall: Comparación por Categoría (RD$)</h2>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: 'hsl(217, 91%, 60%)' }} /> Actual</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: 'hsl(220, 12%, 40%)' }} /> Anterior</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={380}>
          <BarChart data={waterfallData} barGap={2} barCategoryGap="20%">
            <XAxis dataKey="name" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 10 }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={80} />
            <YAxis tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `RD$${(v * getGlobalExchangeRate() / 1000).toFixed(0)}K`} />
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
              <YAxis yAxisId="left" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `RD$${(v * getGlobalExchangeRate() / 1000).toFixed(0)}K`} />
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

      {/* Income vs Expenses Area Chart */}
      <div className="rounded-2xl bg-card border border-border p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">📊 Ingresos vs Gastos Totales — 12 Meses</h2>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={trendData.map(d => ({
            ...d,
            totalCosts: d.revenue - d.profit,
            margin: d.revenue > 0 ? (d.profit / d.revenue * 100) : 0,
          }))}>
            <defs>
              <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(217, 91%, 60%)" stopOpacity={0.05} />
              </linearGradient>
              <linearGradient id="gradCosts" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(0, 84%, 60%)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="left" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `RD$${(v * getGlobalExchangeRate() / 1000).toFixed(0)}K`} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: 'hsl(160, 84%, 39%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v.toFixed(0)}%`} domain={[-100, 100]} />
            <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number, name: string) => {
              if (name === 'margin') return [`${v.toFixed(1)}%`, 'Margen Neto'];
              return [formatUSD(v), name === 'revenue' ? 'Ingresos' : name === 'totalCosts' ? 'Gastos Totales' : name];
            }} />
            <Legend formatter={(value) => value === 'revenue' ? 'Ingresos' : value === 'totalCosts' ? 'Gastos Totales' : value === 'margin' ? 'Margen Neto %' : value} />
            <Area yAxisId="left" type="monotone" dataKey="revenue" fill="url(#gradRevenue)" stroke="hsl(217, 91%, 60%)" strokeWidth={2.5} />
            <Area yAxisId="left" type="monotone" dataKey="totalCosts" fill="url(#gradCosts)" stroke="hsl(0, 84%, 60%)" strokeWidth={2} strokeDasharray="4 2" />
            <Line yAxisId="right" type="monotone" dataKey="margin" stroke="hsl(160, 84%, 39%)" strokeWidth={2} dot={{ r: 3, fill: 'hsl(160, 84%, 39%)' }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Monthly P&L Grid */}
      <div className="rounded-2xl bg-card border border-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">📋 Estado de Resultados Mensual</h2>
          <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => {
            const concepts = ['Ingresos', 'COGS', 'Costos Directos', 'Utilidad Bruta', 'Gastos Operativos', 'Utilidad Neta', 'Margen Bruto %', 'Margen Neto %'];
            const exportData = concepts.map(concept => {
              const row: Record<string, any> = { Concepto: concept };
              let total = 0;
              trendData.forEach(m => {
                let val = 0;
                if (concept === 'Ingresos') val = m.revenue;
                else if (concept === 'COGS') val = m.cogs;
                else if (concept === 'Costos Directos') val = m.directCosts;
                else if (concept === 'Utilidad Bruta') val = m.grossProfit;
                else if (concept === 'Gastos Operativos') val = m.totalExpenses;
                else if (concept === 'Utilidad Neta') val = m.profit;
                else if (concept === 'Margen Bruto %') { row[m.month] = m.revenue > 0 ? `${(m.grossProfit / m.revenue * 100).toFixed(1)}%` : '0%'; return; }
                else if (concept === 'Margen Neto %') { row[m.month] = m.revenue > 0 ? `${(m.profit / m.revenue * 100).toFixed(1)}%` : '0%'; return; }
                row[m.month] = Number(val.toFixed(2));
                total += val;
              });
              if (!concept.includes('%')) row['Total'] = Number(total.toFixed(2));
              else {
                const totalRev = trendData.reduce((s, m) => s + m.revenue, 0);
                if (concept === 'Margen Bruto %') row['Total'] = totalRev > 0 ? `${(trendData.reduce((s, m) => s + m.grossProfit, 0) / totalRev * 100).toFixed(1)}%` : '0%';
                else row['Total'] = totalRev > 0 ? `${(trendData.reduce((s, m) => s + m.profit, 0) / totalRev * 100).toFixed(1)}%` : '0%';
              }
              return row;
            });
            exportToExcel(exportData, 'PL_Mensual', 'P&L Mensual');
          }}>
            <Download className="w-3 h-3" /> Excel
          </Button>
        </div>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs w-[140px] sticky left-0 bg-card z-10">Concepto</TableHead>
                {trendData.map(m => (
                  <TableHead key={m.month} className="text-xs text-right min-w-[90px]">{m.month}</TableHead>
                ))}
                <TableHead className="text-xs text-right font-bold min-w-[100px]">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* Revenue */}
              <TableRow className="font-semibold">
                <TableCell className="text-xs sticky left-0 bg-card z-10">Ingresos</TableCell>
                {trendData.map(m => <TableCell key={m.month} className="text-xs text-right font-mono text-primary">{formatUSD(m.revenue)}</TableCell>)}
                <TableCell className="text-xs text-right font-mono font-bold text-primary">{formatUSD(trendData.reduce((s, m) => s + m.revenue, 0))}</TableCell>
              </TableRow>
              {/* COGS */}
              <TableRow>
                <TableCell className="text-xs sticky left-0 bg-card z-10 text-muted-foreground">(-) COGS</TableCell>
                {trendData.map(m => <TableCell key={m.month} className="text-xs text-right font-mono text-destructive">{m.cogs > 0 ? `-${formatUSD(m.cogs)}` : '—'}</TableCell>)}
                <TableCell className="text-xs text-right font-mono font-bold text-destructive">-{formatUSD(trendData.reduce((s, m) => s + m.cogs, 0))}</TableCell>
              </TableRow>
              {/* Direct Costs */}
              <TableRow>
                <TableCell className="text-xs sticky left-0 bg-card z-10 text-muted-foreground">(-) Costos Directos</TableCell>
                {trendData.map(m => <TableCell key={m.month} className="text-xs text-right font-mono text-destructive">{m.directCosts > 0 ? `-${formatUSD(m.directCosts)}` : '—'}</TableCell>)}
                <TableCell className="text-xs text-right font-mono font-bold text-destructive">-{formatUSD(trendData.reduce((s, m) => s + m.directCosts, 0))}</TableCell>
              </TableRow>
              {/* Gross Profit */}
              <TableRow className="border-t border-border/50 font-semibold">
                <TableCell className="text-xs sticky left-0 bg-card z-10">Utilidad Bruta</TableCell>
                {trendData.map(m => <TableCell key={m.month} className={cn('text-xs text-right font-mono', m.grossProfit >= 0 ? 'text-success' : 'text-destructive')}>{formatUSD(m.grossProfit)}</TableCell>)}
                <TableCell className={cn('text-xs text-right font-mono font-bold', trendData.reduce((s, m) => s + m.grossProfit, 0) >= 0 ? 'text-success' : 'text-destructive')}>{formatUSD(trendData.reduce((s, m) => s + m.grossProfit, 0))}</TableCell>
              </TableRow>
              {/* Operating Expenses */}
              <TableRow>
                <TableCell className="text-xs sticky left-0 bg-card z-10 text-muted-foreground">(-) Gastos Operativos</TableCell>
                {trendData.map(m => <TableCell key={m.month} className="text-xs text-right font-mono text-destructive">{m.totalExpenses > 0 ? `-${formatUSD(m.totalExpenses)}` : '—'}</TableCell>)}
                <TableCell className="text-xs text-right font-mono font-bold text-destructive">-{formatUSD(trendData.reduce((s, m) => s + m.totalExpenses, 0))}</TableCell>
              </TableRow>
              {/* Net Income */}
              <TableRow className="border-t-2 border-border">
                <TableCell className="text-xs font-bold sticky left-0 bg-card z-10">Utilidad Neta</TableCell>
                {trendData.map(m => (
                  <TableCell key={m.month} className={cn('text-xs text-right font-mono font-bold', m.profit >= 0 ? 'text-success' : 'text-destructive')}>
                    {formatUSD(m.profit)}
                  </TableCell>
                ))}
                <TableCell className={cn('text-xs text-right font-mono font-bold', trendData.reduce((s, m) => s + m.profit, 0) >= 0 ? 'text-success' : 'text-destructive')}>
                  {formatUSD(trendData.reduce((s, m) => s + m.profit, 0))}
                </TableCell>
              </TableRow>
              {/* Margin % */}
              <TableRow className="bg-muted/20">
                <TableCell className="text-xs text-muted-foreground sticky left-0 bg-muted/20 z-10">Margen Neto %</TableCell>
                {trendData.map(m => {
                  const margin = m.revenue > 0 ? (m.profit / m.revenue * 100) : 0;
                  return (
                    <TableCell key={m.month} className={cn('text-xs text-right font-mono', margin >= 20 ? 'text-success' : margin >= 0 ? 'text-warning' : 'text-destructive')}>
                      {margin.toFixed(1)}%
                    </TableCell>
                  );
                })}
                {(() => {
                  const totalRev = trendData.reduce((s, m) => s + m.revenue, 0);
                  const totalProfit = trendData.reduce((s, m) => s + m.profit, 0);
                  const avgMargin = totalRev > 0 ? (totalProfit / totalRev * 100) : 0;
                  return <TableCell className={cn('text-xs text-right font-mono font-bold', avgMargin >= 20 ? 'text-success' : avgMargin >= 0 ? 'text-warning' : 'text-destructive')}>{avgMargin.toFixed(1)}%</TableCell>;
                })()}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Existing 12-month trend bar chart */}
      <div className="rounded-2xl bg-card border border-border p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Tendencia 12 Meses (vs Año Anterior)</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={trendData}>
            <XAxis dataKey="month" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `RD$${(v * getGlobalExchangeRate() / 1000).toFixed(0)}K`} />
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

function PLCompRow({ label, cur, prv, yoy, bold, negative, pct, highlight, sub, mode = 'both' }: { label: string; cur: number; prv: number; yoy: number; bold?: boolean; negative?: boolean; pct?: boolean; highlight?: boolean; sub?: boolean; mode?: 'both' | 'prev' | 'yoy' }) {
  const fmtVal = (v: number) => pct ? `${v.toFixed(1)}%` : (negative ? (v > 0 ? `-${formatUSD(v)}` : formatUSD(Math.abs(v))) : formatUSD(v));
  const deltaColor = (c: number, p: number) => {
    if (p === 0 && c === 0) return 'text-muted-foreground';
    const better = negative ? c < p : c > p;
    return better ? 'text-success' : c === p ? 'text-muted-foreground' : 'text-destructive';
  };
  const dPrev = pct ? `${(cur - prv).toFixed(1)}pp` : deltaStr(cur, prv);
  const dYoy = pct ? `${(cur - yoy).toFixed(1)}pp` : deltaStr(cur, yoy);

  if (mode !== 'both') {
    const comp = mode === 'prev' ? prv : yoy;
    const pctChange = pct
      ? `${(cur - comp).toFixed(1)}pp`
      : (comp !== 0 ? `${((cur - comp) / comp * 100) > 0 ? '+' : ''}${((cur - comp) / comp * 100).toFixed(1)}%` : (cur > 0 ? '+100.0%' : '0.0%'));
    return (
      <TableRow className={cn(highlight ? 'bg-muted/30' : '', sub && 'bg-muted/10')}>
        <TableCell className={cn('text-xs', bold && 'font-bold', sub && 'text-muted-foreground pl-6')}>{label}</TableCell>
        <TableCell className={cn('text-xs text-right font-mono', bold && 'font-bold', highlight && (cur >= 0 ? 'text-success' : 'text-destructive'), sub && 'text-muted-foreground')}>{fmtVal(cur)}</TableCell>
        <TableCell className="text-xs text-right font-mono text-muted-foreground">{fmtVal(comp)}</TableCell>
        <TableCell className={cn('text-xs text-right font-mono font-semibold', deltaColor(cur, comp))}>{pctChange}</TableCell>
      </TableRow>
    );
  }

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
  const [metric, setMetric] = useState<'ingresos' | 'margen' | 'gm_pct'>('ingresos');

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
        clientNames[cid] = s.contacts?.contact_name || 'Sin Cliente';
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
      // GM% matrix: margin / revenue * 100
      const gmPctMatrix: Record<string, Record<string, number>> = {};
      Object.keys(revenueMatrixFromItems).forEach(mk => {
        gmPctMatrix[mk] = {};
        Object.keys(revenueMatrixFromItems[mk] || {}).forEach(cid => {
          const rev = revenueMatrixFromItems[mk][cid] || 0;
          const mar = marginMatrix[mk]?.[cid] || 0;
          gmPctMatrix[mk][cid] = rev > 0 ? (mar / rev) * 100 : 0;
        });
      });
      const activeMatrix = metric === 'ingresos' ? revenueMatrix : metric === 'margen' ? marginMatrix : gmPctMatrix;
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
      // GM% matrix for products
      const gmPctMatrix: Record<string, Record<string, number>> = {};
      Object.keys(revMatrix).forEach(mk => {
        gmPctMatrix[mk] = {};
        Object.keys(revMatrix[mk] || {}).forEach(pid => {
          const rev = revMatrix[mk][pid] || 0;
          const mar = marginMatrix[mk]?.[pid] || 0;
          gmPctMatrix[mk][pid] = rev > 0 ? (mar / rev) * 100 : 0;
        });
      });
      const activeMatrix = metric === 'ingresos' ? revMatrix : metric === 'margen' ? marginMatrix : gmPctMatrix;
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
          <button
            onClick={() => setMetric('gm_pct')}
            className={cn('px-3 py-1 text-xs rounded-md transition-colors',
              metric === 'gm_pct' ? 'bg-background text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground')}
          >GM%</button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={trendData.rows}>
          <XAxis dataKey="month" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false}
            tickFormatter={metric === 'gm_pct' ? (v: number) => `${v.toFixed(0)}%` : (v: number) => `RD$${(v * getGlobalExchangeRate() / 1000).toFixed(0)}K`} />
          <Tooltip contentStyle={chartTooltipStyle}
            formatter={(v: number) => metric === 'gm_pct' ? `${v.toFixed(1)}%` : formatUSD(v)} />
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
function ReportesTab({ sales, saleItems, expenses, costs, rate, rateForMonth }: { sales: any[]; saleItems: any[]; expenses: any[]; costs: any[]; rate: any; rateForMonth: (ym: string) => number }) {
  const [view, setView] = useState<'pl_detail' | 'margin' | 'aging' | 'monthly' | 'clientes' | 'productos'>('pl_detail');
  const [periodFilter, setPeriodFilter] = useState('ytd');
  const [trendMode, setTrendMode] = useState<'bars' | 'margin'>('bars');
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);
  const now = useMemo(() => new Date(), []);
  const xr = Number(rate?.usd_sell) || 60.76;

  const dateRange = useMemo(() => {
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const y = now.getFullYear(), m = now.getMonth();
    switch (periodFilter) {
      case 'month': return { start: fmt(new Date(y, m, 1)), end: fmt(now) };
      case 'prev_month': return { start: fmt(new Date(y, m - 1, 1)), end: fmt(new Date(y, m, 0)) };
      case 'quarter': return { start: fmt(new Date(y, m - 3, 1)), end: fmt(now) };
      case 'ytd': return { start: `${y}-01-01`, end: fmt(now) };
      case 'year': return { start: `${y}-01-01`, end: `${y}-12-31` };
      case 'custom': return {
        start: customFrom ? fmt(customFrom) : '2000-01-01',
        end: customTo ? fmt(customTo) : fmt(now),
      };
      default: return { start: '2000-01-01', end: '2099-12-31' };
    }
  }, [periodFilter, now, customFrom, customTo]);

  const filteredSales = useMemo(() => sales.filter((s: any) => s.date >= dateRange.start && s.date <= dateRange.end), [sales, dateRange]);
  const filteredSaleIds = useMemo(() => new Set(filteredSales.map((s: any) => s.id)), [filteredSales]);
  const filteredItems = useMemo(() => saleItems.filter((si: any) => filteredSaleIds.has(si.sale_id)), [saleItems, filteredSaleIds]);
  const filteredExpenses = useMemo(() => expenses.filter((e: any) => e.date >= dateRange.start && e.date <= dateRange.end), [expenses, dateRange]);
  const filteredCosts = useMemo(() => costs.filter((c: any) => c.date >= dateRange.start && c.date <= dateRange.end), [costs, dateRange]);

  // ---- P&L Detallado ----
  const plData = useMemo(() => {
    const revenue = filteredSales.reduce((s: number, r: any) => s + Number(r.subtotal_usd || 0), 0);
    const itbis = filteredSales.reduce((s: number, r: any) => s + Number(r.itbis_usd || 0), 0);
    const totalRevenue = filteredSales.reduce((s: number, r: any) => s + Number(r.total_usd || 0), 0);
    const cogs = filteredItems.reduce((s: number, r: any) => s + Number(r.unit_cost_usd || 0) * Number(r.quantity || 0), 0);
    const directCosts = filteredCosts.reduce((s: number, r: any) => s + Number(r.amount_usd || 0), 0);
    const grossProfit = revenue - cogs - directCosts;

    const expByCat: Record<string, number> = {};
    filteredExpenses.forEach((e: any) => {
      const mr = rateForMonth(e.date?.substring(0, 7) || '');
      const usd = Number(e.amount_usd) || (Number(e.amount_dop) / mr);
      expByCat[e.category] = (expByCat[e.category] || 0) + usd;
    });
    const totalExpenses = Object.values(expByCat).reduce((s, v) => s + v, 0);

    const costByCat: Record<string, number> = {};
    filteredCosts.forEach((c: any) => { costByCat[c.category] = (costByCat[c.category] || 0) + Number(c.amount_usd || 0); });

    const netIncome = grossProfit - totalExpenses;
    return { revenue, itbis, totalRevenue, cogs, directCosts, costByCat, grossProfit, expByCat, totalExpenses, netIncome };
  }, [filteredSales, filteredItems, filteredExpenses, filteredCosts, rateForMonth]);

  // ---- Margen por Producto ----
  const marginData = useMemo(() => {
    const map: Record<string, { name: string; sku: string; revenue: number; cogs: number; units: number; targetList: number; targetArch: number; targetProj: number; targetWhole: number }> = {};
    filteredItems.forEach((si: any) => {
      const key = si.product_id || 'unknown';
      const prod = si.products || {};
      if (!map[key]) map[key] = { name: prod.name || '?', sku: prod.sku || '', revenue: 0, cogs: 0, units: 0,
        targetList: Number(prod.margin_list_pct || 0), targetArch: Number(prod.margin_architect_pct || 0),
        targetProj: Number(prod.margin_project_pct || 0), targetWhole: Number(prod.margin_wholesale_pct || 0) };
      map[key].revenue += Number(si.line_total_usd || 0);
      map[key].cogs += Number(si.unit_cost_usd || 0) * Number(si.quantity || 0);
      map[key].units += Number(si.quantity || 0);
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).map(p => {
      const gm = p.revenue - p.cogs;
      const gmPct = p.revenue > 0 ? gm / p.revenue * 100 : 0;
      const avgTarget = [p.targetList, p.targetArch, p.targetProj, p.targetWhole].filter(v => v > 0);
      const target = avgTarget.length > 0 ? avgTarget.reduce((a, b) => a + b, 0) / avgTarget.length : 0;
      return { ...p, gm, gmPct, target, diff: gmPct - target };
    });
  }, [filteredItems]);

  // ---- Aging Cuentas por Cobrar ----
  const agingData = useMemo(() => {
    const pending = sales.filter((s: any) => s.payment_status !== 'paid' && s.payment_status !== 'cancelled');
    const buckets = { current: [] as any[], d30: [] as any[], d60: [] as any[], d90: [] as any[], over90: [] as any[] };
    const today = new Date();
    pending.forEach((s: any) => {
      const days = Math.floor((today.getTime() - new Date(s.date).getTime()) / 86400000);
      const entry = { ...s, daysOutstanding: days, clientName: s.contacts?.contact_name || 'Sin Cliente' };
      if (days <= 0) buckets.current.push(entry);
      else if (days <= 30) buckets.d30.push(entry);
      else if (days <= 60) buckets.d60.push(entry);
      else if (days <= 90) buckets.d90.push(entry);
      else buckets.over90.push(entry);
    });
    const totals = {
      current: buckets.current.reduce((s: number, r: any) => s + Number(r.total_usd || 0), 0),
      d30: buckets.d30.reduce((s: number, r: any) => s + Number(r.total_usd || 0), 0),
      d60: buckets.d60.reduce((s: number, r: any) => s + Number(r.total_usd || 0), 0),
      d90: buckets.d90.reduce((s: number, r: any) => s + Number(r.total_usd || 0), 0),
      over90: buckets.over90.reduce((s: number, r: any) => s + Number(r.total_usd || 0), 0),
    };
    const total = Object.values(totals).reduce((s, v) => s + v, 0);
    return { buckets, totals, total, items: [...buckets.over90, ...buckets.d90, ...buckets.d60, ...buckets.d30, ...buckets.current] };
  }, [sales]);

  // ---- Comparativo Mensual ----
  const monthlyComparison = useMemo(() => {
    const months: { month: string; label: string; revenue: number; cogs: number; directCosts: number; expenses: number; grossProfit: number; netIncome: number; gmPct: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('es-DO', { month: 'short', year: '2-digit' });
      const mr = rateForMonth(key);
      const rev = sales.filter((s: any) => s.date?.startsWith(key)).reduce((s: number, r: any) => s + Number(r.total_usd || 0), 0);
      const cg = saleItems.filter((si: any) => si.sales?.date?.startsWith(key)).reduce((s: number, r: any) => s + Number(r.unit_cost_usd || 0) * Number(r.quantity || 0), 0);
      const dc = costs.filter((c: any) => c.date?.startsWith(key)).reduce((s: number, r: any) => s + Number(r.amount_usd || 0), 0);
      const exp = expenses.filter((e: any) => e.date?.startsWith(key)).reduce((s: number, r: any) => s + Number(r.amount_usd || 0) || Number(r.amount_dop || 0) / mr, 0);
      const gp = rev - cg - dc;
      const ni = gp - exp;
      months.push({ month: key, label, revenue: rev, cogs: cg, directCosts: dc, expenses: exp, grossProfit: gp, netIncome: ni, gmPct: rev > 0 ? gp / rev * 100 : 0 });
    }
    return months;
  }, [sales, saleItems, expenses, costs, rateForMonth, now]);

  // ---- Client/Product data (legacy) ----
  const clientData = useMemo(() => {
    const map: Record<string, { name: string; revenue: number; cogs: number; units: number; lastDate: string }> = {};
    filteredSales.forEach((s: any) => {
      const key = s.contact_id || 'sin_cliente';
      if (!map[key]) map[key] = { name: s.contacts?.contact_name || 'Sin Cliente', revenue: 0, cogs: 0, units: 0, lastDate: '' };
      map[key].revenue += Number(s.total_usd || 0);
      if (!map[key].lastDate || s.date > map[key].lastDate) map[key].lastDate = s.date;
      (s.sale_items || []).forEach((si: any) => {
        map[key].cogs += Number(si.unit_cost_usd || 0) * Number(si.quantity || 0);
        map[key].units += Number(si.quantity || 0);
      });
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [filteredSales]);

  const handleExport = () => {
    if (view === 'pl_detail') {
      const pctOf = (val: number, rev: number) => rev > 0 ? `${((val / rev) * 100).toFixed(1)}%` : '0.0%';
      const rev = plData.revenue;
      const rows = [
        { Concepto: 'Ingresos Netos', USD: plData.revenue, '% Ingreso': '100.0%' },
        { Concepto: 'ITBIS Cobrado', USD: plData.itbis, '% Ingreso': pctOf(plData.itbis, rev) },
        { Concepto: '', USD: '', '% Ingreso': '' },
        { Concepto: 'COGS', USD: -plData.cogs, '% Ingreso': pctOf(plData.cogs, rev) },
        ...Object.entries(plData.costByCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ Concepto: `  Costo: ${COST_CATEGORIES[k]?.label || k}`, USD: -(v as number), '% Ingreso': pctOf(v as number, rev) })),
        { Concepto: '', USD: '', '% Ingreso': '' },
        { Concepto: 'UTILIDAD BRUTA', USD: plData.grossProfit, '% Ingreso': pctOf(plData.grossProfit, rev) },
        { Concepto: '', USD: '', '% Ingreso': '' },
        { Concepto: 'GASTOS OPERATIVOS', USD: '', '% Ingreso': '' },
        ...Object.entries(plData.expByCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ Concepto: `  ${EXPENSE_CATEGORIES[k]?.label || k}`, USD: -(v as number), '% Ingreso': pctOf(v as number, rev) })),
        { Concepto: 'Total Gastos', USD: -plData.totalExpenses, '% Ingreso': pctOf(plData.totalExpenses, rev) },
        { Concepto: '', USD: '', '% Ingreso': '' },
        { Concepto: 'UTILIDAD NETA', USD: plData.netIncome, '% Ingreso': pctOf(plData.netIncome, rev) },
      ];
      exportToExcel(rows, 'pl_detallado', 'P&L Detallado');
    } else if (view === 'margin') {
      exportToExcel(marginData.map(p => ({ SKU: p.sku, Producto: p.name, Uds: p.units, Ingresos: p.revenue, COGS: p.cogs, 'GM $': p.gm, 'GM %': `${p.gmPct.toFixed(1)}%`, 'Target %': `${p.target.toFixed(1)}%`, 'Diff pp': `${p.diff.toFixed(1)}` })), 'margen_producto', 'Margen x Producto');
    } else if (view === 'aging') {
      exportToExcel(agingData.items.map((s: any) => ({ Cliente: s.clientName, Fecha: s.date, Total: s.total_usd, Días: s.daysOutstanding, Estado: s.payment_status })), 'aging_ar', 'Aging CxC');
    } else if (view === 'monthly') {
      exportToExcel(monthlyComparison.map(m => ({ Mes: m.label, Ingresos: m.revenue, COGS: m.cogs, 'Costos Dir.': m.directCosts, Gastos: m.expenses, 'U. Bruta': m.grossProfit, 'U. Neta': m.netIncome, 'GM %': `${m.gmPct.toFixed(1)}%` })), 'comparativo_mensual', 'Comparativo Mensual');
    } else {
      const data = view === 'clientes' ? clientData : marginData;
      exportToExcel(data.map((r: any) => ({ Nombre: r.name, Ingresos: r.revenue, COGS: r.cogs, 'GM $': r.revenue - r.cogs })), `reporte_${view}`, view === 'clientes' ? 'Por Cliente' : 'Por Producto');
    }
  };

  const VIEWS = [
    { key: 'pl_detail', label: 'P&L Detallado' },
    { key: 'margin', label: 'Margen x Producto' },
    { key: 'aging', label: 'Aging CxC' },
    { key: 'monthly', label: 'Comparativo Mensual' },
    { key: 'clientes', label: 'Por Cliente' },
    { key: 'productos', label: 'Por Producto' },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 rounded-lg bg-muted p-0.5 flex-wrap">
          {VIEWS.map(v => (
            <button key={v.key} onClick={() => setView(v.key as any)}
              className={cn('rounded-md px-3 py-1 text-xs font-medium transition-colors',
                view === v.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
              {v.label}
            </button>
          ))}
        </div>
        {view !== 'aging' && (
          <>
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo el Tiempo</SelectItem>
                <SelectItem value="month">Mes Actual</SelectItem>
                <SelectItem value="prev_month">Mes Anterior</SelectItem>
                <SelectItem value="quarter">Último Trimestre</SelectItem>
                <SelectItem value="ytd">YTD</SelectItem>
                <SelectItem value="year">Año Completo</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
            {periodFilter === 'custom' && (
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn('w-[130px] justify-start text-left text-xs font-normal', !customFrom && 'text-muted-foreground')}>
                      <CalendarIcon className="w-3.5 h-3.5 mr-1" />
                      {customFrom ? format(customFrom, 'dd/MM/yyyy') : 'Desde'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus className={cn('p-3 pointer-events-auto')} />
                  </PopoverContent>
                </Popover>
                <span className="text-xs text-muted-foreground">→</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn('w-[130px] justify-start text-left text-xs font-normal', !customTo && 'text-muted-foreground')}>
                      <CalendarIcon className="w-3.5 h-3.5 mr-1" />
                      {customTo ? format(customTo, 'dd/MM/yyyy') : 'Hasta'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus className={cn('p-3 pointer-events-auto')} />
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </>
        )}
        <Button size="sm" variant="outline" onClick={handleExport} className="ml-auto"><Download className="w-3.5 h-3.5 mr-1" /> Excel</Button>
      </div>

      {/* ======== P&L DETALLADO ======== */}
      {view === 'pl_detail' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Ingresos', value: formatUSD(plData.revenue), color: 'text-primary' },
              { label: 'Utilidad Bruta', value: formatUSD(plData.grossProfit), color: plData.grossProfit >= 0 ? 'text-success' : 'text-destructive' },
              { label: 'Gastos Operativos', value: formatUSD(plData.totalExpenses), color: 'text-warning' },
              { label: 'Utilidad Neta', value: formatUSD(plData.netIncome), color: plData.netIncome >= 0 ? 'text-success' : 'text-destructive' },
            ].map(k => (
              <div key={k.label} className="rounded-2xl bg-card border border-border p-4 text-center">
                <p className={cn('text-xl font-bold', k.color)}>{k.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{k.label}</p>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader><TableRow><TableHead className="text-xs">Concepto</TableHead><TableHead className="text-xs text-right">Monto USD</TableHead><TableHead className="text-xs text-right">% Ingresos</TableHead></TableRow></TableHeader>
              <TableBody>
                <TableRow className="bg-primary/5"><TableCell className="text-xs font-bold text-primary">Ingresos Netos</TableCell><TableCell className="text-xs text-right font-mono font-bold text-primary">{formatUSD(plData.revenue)}</TableCell><TableCell className="text-xs text-right font-mono">100.0%</TableCell></TableRow>
                <TableRow><TableCell className="text-xs text-muted-foreground pl-6">ITBIS Cobrado</TableCell><TableCell className="text-xs text-right font-mono">{formatUSD(plData.itbis)}</TableCell><TableCell className="text-xs text-right font-mono text-muted-foreground">{plData.revenue > 0 ? (plData.itbis / plData.revenue * 100).toFixed(1) : '0.0'}%</TableCell></TableRow>
                <TableRow className="bg-destructive/5"><TableCell className="text-xs font-semibold text-destructive">(-) COGS</TableCell><TableCell className="text-xs text-right font-mono font-semibold text-destructive">{formatUSD(plData.cogs)}</TableCell><TableCell className="text-xs text-right font-mono">{plData.revenue > 0 ? (plData.cogs / plData.revenue * 100).toFixed(1) : '0.0'}%</TableCell></TableRow>
                {Object.entries(plData.costByCat).map(([cat, val]) => (
                  <TableRow key={cat}><TableCell className="text-xs text-muted-foreground pl-6">(-) {COST_CATEGORIES[cat]?.icon} {COST_CATEGORIES[cat]?.label || cat}</TableCell><TableCell className="text-xs text-right font-mono text-destructive">{formatUSD(val)}</TableCell><TableCell className="text-xs text-right font-mono text-muted-foreground">{plData.revenue > 0 ? (val / plData.revenue * 100).toFixed(1) : '0.0'}%</TableCell></TableRow>
                ))}
                <TableRow className="bg-success/5 border-t-2"><TableCell className="text-xs font-bold text-success">= Utilidad Bruta</TableCell><TableCell className="text-xs text-right font-mono font-bold text-success">{formatUSD(plData.grossProfit)}</TableCell><TableCell className="text-xs text-right font-mono font-bold">{plData.revenue > 0 ? (plData.grossProfit / plData.revenue * 100).toFixed(1) : '0.0'}%</TableCell></TableRow>
                {Object.entries(plData.expByCat).sort((a, b) => b[1] - a[1]).map(([cat, val]) => (
                  <TableRow key={cat}><TableCell className="text-xs text-muted-foreground pl-6">(-) {EXPENSE_CATEGORIES[cat]?.icon} {EXPENSE_CATEGORIES[cat]?.label || cat}</TableCell><TableCell className="text-xs text-right font-mono text-warning">{formatUSD(val)}</TableCell><TableCell className="text-xs text-right font-mono text-muted-foreground">{plData.revenue > 0 ? (val / plData.revenue * 100).toFixed(1) : '0.0'}%</TableCell></TableRow>
                ))}
                <TableRow className="bg-muted/30 border-t-2"><TableCell className="text-xs font-bold">= Utilidad Neta</TableCell><TableCell className={cn('text-xs text-right font-mono font-bold', plData.netIncome >= 0 ? 'text-success' : 'text-destructive')}>{formatUSD(plData.netIncome)}</TableCell><TableCell className="text-xs text-right font-mono font-bold">{plData.revenue > 0 ? (plData.netIncome / plData.revenue * 100).toFixed(1) : '0.0'}%</TableCell></TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ======== MARGEN POR PRODUCTO ======== */}
      {view === 'margin' && (
        <div className="space-y-4">
          {marginData.length > 0 && (
            <div className="rounded-2xl bg-card border border-border p-6">
              <h3 className="text-sm font-semibold mb-4">Margen Real vs Objetivo</h3>
              <ResponsiveContainer width="100%" height={Math.max(200, Math.min(marginData.length * 45, 500))}>
                <BarChart data={marginData.slice(0, 15).map(p => ({ name: p.name.length > 25 ? p.name.slice(0, 22) + '...' : p.name, real: +p.gmPct.toFixed(1), objetivo: +p.target.toFixed(1) }))} layout="vertical">
                  <XAxis type="number" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                  <YAxis type="category" dataKey="name" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 10 }} axisLine={false} tickLine={false} width={160} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => `${v}%`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="real" name="Margen Real" fill="hsl(160, 84%, 39%)" radius={[0,4,4,0]} barSize={12} />
                  <Bar dataKey="objetivo" name="Objetivo" fill="hsl(220, 12%, 40%)" radius={[0,4,4,0]} barSize={12} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-xs">Producto</TableHead>
                <TableHead className="text-xs text-right">Uds</TableHead>
                <TableHead className="text-xs text-right">Ingresos</TableHead>
                <TableHead className="text-xs text-right">COGS</TableHead>
                <TableHead className="text-xs text-right">GM $</TableHead>
                <TableHead className="text-xs text-right">GM %</TableHead>
                <TableHead className="text-xs text-right">Objetivo</TableHead>
                <TableHead className="text-xs text-right">Δ pp</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {marginData.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs font-medium">{p.name}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{p.units}</TableCell>
                    <TableCell className="text-xs text-right font-mono text-primary">{formatUSD(p.revenue)}</TableCell>
                    <TableCell className="text-xs text-right font-mono text-destructive">{formatUSD(p.cogs)}</TableCell>
                    <TableCell className="text-xs text-right font-mono font-bold">{formatUSD(p.gm)}</TableCell>
                    <TableCell className={cn('text-xs text-right font-mono font-bold', p.gmPct >= 40 ? 'text-success' : p.gmPct >= 20 ? 'text-warning' : 'text-destructive')}>{p.gmPct.toFixed(1)}%</TableCell>
                    <TableCell className="text-xs text-right font-mono text-muted-foreground">{p.target > 0 ? `${p.target.toFixed(1)}%` : '—'}</TableCell>
                    <TableCell className={cn('text-xs text-right font-mono font-semibold', p.diff >= 0 ? 'text-success' : 'text-destructive')}>{p.target > 0 ? `${p.diff >= 0 ? '+' : ''}${p.diff.toFixed(1)}` : '—'}</TableCell>
                  </TableRow>
                ))}
                {marginData.length > 0 && (() => {
                  const tRev = marginData.reduce((s, p) => s + p.revenue, 0);
                  const tCogs = marginData.reduce((s, p) => s + p.cogs, 0);
                  const tGm = tRev - tCogs;
                  return (
                    <TableRow className="bg-muted/30 font-bold">
                      <TableCell className="text-xs font-bold">TOTAL</TableCell>
                      <TableCell className="text-xs text-right font-mono font-bold">{marginData.reduce((s, p) => s + p.units, 0)}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-bold text-primary">{formatUSD(tRev)}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-bold text-destructive">{formatUSD(tCogs)}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-bold">{formatUSD(tGm)}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-bold">{tRev > 0 ? (tGm / tRev * 100).toFixed(1) : '0.0'}%</TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  );
                })()}
              </TableBody>
            </Table>
            {marginData.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No hay ventas con productos en este período</p>}
          </div>
        </div>
      )}

      {/* ======== AGING CUENTAS POR COBRAR ======== */}
      {view === 'aging' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            {[
              { label: 'Vigente', value: agingData.totals.current, color: 'text-success', bg: 'bg-success/10' },
              { label: '1-30 días', value: agingData.totals.d30, color: 'text-primary', bg: 'bg-primary/10' },
              { label: '31-60 días', value: agingData.totals.d60, color: 'text-warning', bg: 'bg-warning/10' },
              { label: '61-90 días', value: agingData.totals.d90, color: 'text-orange-500', bg: 'bg-orange-500/10' },
              { label: '+90 días', value: agingData.totals.over90, color: 'text-destructive', bg: 'bg-destructive/10' },
              { label: 'Total CxC', value: agingData.total, color: 'text-foreground', bg: 'bg-muted' },
            ].map(b => (
              <div key={b.label} className={cn('rounded-2xl border border-border p-3 text-center', b.bg)}>
                <p className={cn('text-lg font-bold', b.color)}>{formatUSD(b.value)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{b.label}</p>
              </div>
            ))}
          </div>
          {agingData.total > 0 && (
            <div className="rounded-2xl bg-card border border-border p-6">
              <h3 className="text-sm font-semibold mb-4">Distribución por Antigüedad</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={[
                  { name: 'Vigente', value: agingData.totals.current },
                  { name: '1-30d', value: agingData.totals.d30 },
                  { name: '31-60d', value: agingData.totals.d60 },
                  { name: '61-90d', value: agingData.totals.d90 },
                  { name: '+90d', value: agingData.totals.over90 },
                ]}>
                  <XAxis dataKey="name" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `RD$${(v * getGlobalExchangeRate() / 1000).toFixed(0)}K`} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatUSD(v)} />
                  <Bar dataKey="value" name="Monto">
                    {[
                      'hsl(160, 84%, 39%)', 'hsl(217, 91%, 60%)', 'hsl(43, 96%, 56%)', 'hsl(27, 96%, 61%)', 'hsl(0, 84%, 60%)',
                    ].map((c, i) => <Cell key={i} fill={c} radius={[6,6,0,0] as any} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-xs">Cliente</TableHead>
                <TableHead className="text-xs">Fecha</TableHead>
                <TableHead className="text-xs">Ref</TableHead>
                <TableHead className="text-xs text-right">Total USD</TableHead>
                <TableHead className="text-xs text-right">Días</TableHead>
                <TableHead className="text-xs">Estado</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {agingData.items.map((s: any) => {
                  const daysColor = s.daysOutstanding > 90 ? 'text-destructive font-bold' : s.daysOutstanding > 60 ? 'text-orange-500' : s.daysOutstanding > 30 ? 'text-warning' : 'text-muted-foreground';
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="text-xs font-medium">{s.clientName}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.date}</TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">{s.invoice_ref || '—'}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-bold">{formatUSD(Number(s.total_usd))}</TableCell>
                      <TableCell className={cn('text-xs text-right font-mono', daysColor)}>{s.daysOutstanding}</TableCell>
                      <TableCell><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium',
                        s.payment_status === 'pending' ? 'bg-warning/15 text-warning' :
                        s.payment_status === 'partial' ? 'bg-primary/15 text-primary' :
                        s.payment_status === 'overdue' ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground'
                      )}>{s.payment_status}</span></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {agingData.items.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No hay cuentas por cobrar pendientes 🎉</p>}
          </div>
        </div>
      )}

      {/* ======== COMPARATIVO MENSUAL ======== */}
      {view === 'monthly' && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-card border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Tendencia 12 Meses (RD$)</h3>
              <div className="flex gap-1 rounded-lg bg-muted p-0.5">
                {(['bars', 'margin'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setTrendMode(mode)}
                    className={cn(
                      'rounded-md px-3 py-1 text-[11px] font-medium transition-colors',
                      trendMode === mode ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {mode === 'bars' ? 'Montos' : 'Margen'}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              {trendMode === 'bars' ? (
              <ComposedChart data={monthlyComparison}>
                <XAxis dataKey="label" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `RD$${(v * getGlobalExchangeRate() / 1000).toFixed(0)}K`} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatUSD(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="revenue" name="Ingresos" fill="hsl(217, 91%, 60%)" radius={[4,4,0,0]} />
                <Bar dataKey="cogs" name="COGS" fill="hsl(0, 84%, 60%)" radius={[4,4,0,0]} />
                <Bar dataKey="expenses" name="Gastos" fill="hsl(43, 96%, 56%)" radius={[4,4,0,0]} />
                <Line type="monotone" dataKey="netIncome" name="U. Neta" stroke="hsl(160, 84%, 39%)" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
              ) : (
              <ComposedChart data={monthlyComparison}>
                <XAxis dataKey="label" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="usd" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `RD$${(v * getGlobalExchangeRate() / 1000).toFixed(0)}K`} />
                <YAxis yAxisId="pct" orientation="right" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number, name: string) => name.includes('%') ? `${v.toFixed(1)}%` : formatUSD(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="revenue" name="Ingresos" fill="hsl(217, 91%, 60%)" radius={[4,4,0,0]} yAxisId="usd" />
                <Bar dataKey="grossProfit" name="U. Bruta" fill="hsl(160, 84%, 39%)" radius={[4,4,0,0]} yAxisId="usd" />
                <Line type="monotone" dataKey="gmPct" name="GM %" stroke="hsl(280, 70%, 55%)" strokeWidth={2.5} dot={{ r: 4, fill: 'hsl(280, 70%, 55%)' }} yAxisId="pct" />
              </ComposedChart>
              )}
            </ResponsiveContainer>
          </div>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-xs">Mes</TableHead>
                <TableHead className="text-xs text-right">Ingresos</TableHead>
                <TableHead className="text-xs text-right">COGS</TableHead>
                <TableHead className="text-xs text-right">Costos Dir.</TableHead>
                <TableHead className="text-xs text-right">U. Bruta</TableHead>
                <TableHead className="text-xs text-right">GM %</TableHead>
                <TableHead className="text-xs text-right">Gastos</TableHead>
                <TableHead className="text-xs text-right">U. Neta</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {monthlyComparison.map(m => (
                  <TableRow key={m.month} className={m.revenue === 0 ? 'opacity-40' : ''}>
                    <TableCell className="text-xs font-medium">{m.label}</TableCell>
                    <TableCell className="text-xs text-right font-mono text-primary">{formatUSD(m.revenue)}</TableCell>
                    <TableCell className="text-xs text-right font-mono text-destructive">{formatUSD(m.cogs)}</TableCell>
                    <TableCell className="text-xs text-right font-mono text-muted-foreground">{formatUSD(m.directCosts)}</TableCell>
                    <TableCell className="text-xs text-right font-mono font-semibold">{formatUSD(m.grossProfit)}</TableCell>
                    <TableCell className={cn('text-xs text-right font-mono', m.gmPct >= 40 ? 'text-success' : m.gmPct >= 20 ? 'text-warning' : 'text-destructive')}>{m.gmPct.toFixed(1)}%</TableCell>
                    <TableCell className="text-xs text-right font-mono text-warning">{formatUSD(m.expenses)}</TableCell>
                    <TableCell className={cn('text-xs text-right font-mono font-bold', m.netIncome >= 0 ? 'text-success' : 'text-destructive')}>{formatUSD(m.netIncome)}</TableCell>
                  </TableRow>
                ))}
                {(() => {
                  const active = monthlyComparison.filter(m => m.revenue > 0);
                  if (active.length === 0) return null;
                  const tRev = active.reduce((s, m) => s + m.revenue, 0);
                  const tCogs = active.reduce((s, m) => s + m.cogs, 0);
                  const tDc = active.reduce((s, m) => s + m.directCosts, 0);
                  const tGp = active.reduce((s, m) => s + m.grossProfit, 0);
                  const tExp = active.reduce((s, m) => s + m.expenses, 0);
                  const tNi = active.reduce((s, m) => s + m.netIncome, 0);
                  return (
                    <TableRow className="bg-muted/30 font-bold border-t-2">
                      <TableCell className="text-xs font-bold">TOTAL</TableCell>
                      <TableCell className="text-xs text-right font-mono font-bold text-primary">{formatUSD(tRev)}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-bold text-destructive">{formatUSD(tCogs)}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-bold">{formatUSD(tDc)}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-bold">{formatUSD(tGp)}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-bold">{tRev > 0 ? (tGp / tRev * 100).toFixed(1) : '0.0'}%</TableCell>
                      <TableCell className="text-xs text-right font-mono font-bold text-warning">{formatUSD(tExp)}</TableCell>
                      <TableCell className={cn('text-xs text-right font-mono font-bold', tNi >= 0 ? 'text-success' : 'text-destructive')}>{formatUSD(tNi)}</TableCell>
                    </TableRow>
                  );
                })()}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* ======== POR CLIENTE ======== */}
      {view === 'clientes' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-xs">Cliente</TableHead>
                <TableHead className="text-xs text-right">Unidades</TableHead>
                <TableHead className="text-xs text-right">Ingresos</TableHead>
                <TableHead className="text-xs text-right">COGS</TableHead>
                <TableHead className="text-xs text-right">GM %</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {clientData.map((c, i) => {
                  const gm = c.revenue - c.cogs;
                  const gmPct = c.revenue > 0 ? gm / c.revenue * 100 : 0;
                  return (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-medium">{c.name}</TableCell>
                      <TableCell className="text-xs text-right font-mono">{c.units}</TableCell>
                      <TableCell className="text-xs text-right font-mono text-primary font-bold">{formatUSD(c.revenue)}</TableCell>
                      <TableCell className="text-xs text-right font-mono text-destructive">{formatUSD(c.cogs)}</TableCell>
                      <TableCell className={cn('text-xs text-right font-mono', gmPct >= 40 ? 'text-success' : 'text-warning')}>{gmPct.toFixed(1)}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            {clientData.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No hay datos</p>}
          </div>
        </div>
      )}

      {/* ======== POR PRODUCTO ======== */}
      {view === 'productos' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-xs">Producto</TableHead>
                <TableHead className="text-xs text-right">Uds</TableHead>
                <TableHead className="text-xs text-right">Ingresos</TableHead>
                <TableHead className="text-xs text-right">GM %</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {marginData.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs font-medium">{p.name}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{p.units}</TableCell>
                    <TableCell className="text-xs text-right font-mono text-primary font-bold">{formatUSD(p.revenue)}</TableCell>
                    <TableCell className={cn('text-xs text-right font-mono', p.gmPct >= 40 ? 'text-success' : 'text-warning')}>{p.gmPct.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {marginData.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No hay datos</p>}
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
              <XAxis type="number" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 10 }} tickFormatter={v => `RD$${(v * getGlobalExchangeRate() / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
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
