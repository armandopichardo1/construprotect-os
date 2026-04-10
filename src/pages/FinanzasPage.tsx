import { useState, useMemo, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/lib/format';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell, Tooltip, LineChart, Line } from 'recharts';
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
import { Bot, Send, X, Check, Pencil, Trash2, Download } from 'lucide-react';
import { exportToExcel } from '@/lib/export-utils';

const tabs = ['Resumen', 'Ventas', 'Gastos', 'P&L', 'AI Asesor'];
const chartTooltipStyle = { background: 'hsl(222, 20%, 10%)', border: '1px solid hsl(222, 20%, 20%)', borderRadius: 8, fontSize: 12 };

const EXPENSE_CATEGORIES: Record<string, { label: string; icon: string }> = {
  warehouse: { label: 'Almacén', icon: '🏭' },
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

export default function FinanzasPage() {
  const [tab, setTab] = useState('Resumen');
  const [aiOpen, setAiOpen] = useState(false);
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
      const { data, error } = await supabase.from('expenses').select('*').order('date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: saleItems = [] } = useQuery({
    queryKey: ['sale-items'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sale_items').select('*, sales(date), products(name)');
      if (error) throw error;
      return data;
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
  const revenueMTD = mtdSales.reduce((s: number, r: any) => s + Number(r.total_usd || 0), 0);
  const expensesMTD = mtdExpenses.reduce((s: number, r: any) => s + Number(r.amount_usd || 0), 0);
  const cogsMTD = saleItems.filter((si: any) => si.sales?.date?.startsWith(thisMonth))
    .reduce((s: number, r: any) => s + Number(r.unit_cost_usd || 0) * Number(r.quantity || 0), 0);
  const grossMargin = revenueMTD > 0 ? ((revenueMTD - cogsMTD) / revenueMTD * 100) : 0;
  const netIncome = revenueMTD - cogsMTD - expensesMTD;

  const monthlyData = useMemo(() => {
    const months: { month: string; revenue: number; cogs: number; expenses: number; profit: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('es-DO', { month: 'short' });
      const rev = sales.filter((s: any) => s.date?.startsWith(key)).reduce((s: number, r: any) => s + Number(r.total_usd || 0), 0);
      const cogs = saleItems.filter((si: any) => si.sales?.date?.startsWith(key))
        .reduce((s: number, r: any) => s + Number(r.unit_cost_usd || 0) * Number(r.quantity || 0), 0);
      const exp = expenses.filter((e: any) => e.date?.startsWith(key)).reduce((s: number, r: any) => s + Number(r.amount_usd || 0), 0);
      months.push({ month: label, revenue: rev, cogs, expenses: exp, profit: rev - cogs - exp });
    }
    return months;
  }, [sales, expenses, saleItems]);

  const expenseByCategory = useMemo(() => {
    const cats: Record<string, number> = {};
    expenses.forEach((e: any) => { cats[e.category] = (cats[e.category] || 0) + Number(e.amount_usd || 0); });
    return Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([key, value], i) => ({
      name: EXPENSE_CATEGORIES[key]?.label || key, value, color: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [expenses]);

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
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAiOpen(true)}>
            <Bot className="w-3.5 h-3.5" /> AI Asistente
          </Button>
        </div>

        {tab === 'Resumen' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Ingresos MTD', value: formatUSD(revenueMTD), color: 'text-primary' },
                { label: 'Margen Bruto', value: `${grossMargin.toFixed(1)}%`, color: grossMargin > 40 ? 'text-success' : 'text-warning' },
                { label: 'Gastos MTD', value: formatUSD(expensesMTD), color: 'text-destructive' },
                { label: 'Ingreso Neto', value: formatUSD(netIncome), color: netIncome >= 0 ? 'text-success' : 'text-destructive' },
              ].map(kpi => (
                <div key={kpi.label} className="rounded-2xl bg-card border border-border p-5 text-center">
                  <p className={cn('text-2xl font-bold', kpi.color)}>{kpi.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 rounded-2xl bg-card border border-border p-5 space-y-4">
                <h2 className="text-sm font-semibold text-foreground">Ingresos vs Costos vs Gastos</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyData}>
                    <XAxis dataKey="month" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatUSD(v)} />
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
                    </Pie><Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatUSD(v)} /></PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5">
                    {expenseByCategory.slice(0,6).map((c: any) => (
                      <div key={c.name} className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                        <span className="text-xs text-foreground truncate">{c.name}</span>
                        <span className="text-xs text-muted-foreground ml-auto shrink-0">{formatUSD(c.value)}</span>
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
                  <YAxis tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatUSD(v)} />
                  <Line type="monotone" dataKey="profit" stroke="hsl(160, 84%, 39%)" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {tab === 'Ventas' && <VentasTab sales={sales} queryClient={queryClient} rate={latestRate} onExport={() => {
          exportToExcel(sales.map((s: any) => ({
            Fecha: s.date, Ref: s.invoice_ref, Cliente: s.crm_clients?.name,
            'Subtotal USD': s.subtotal_usd, 'ITBIS USD': s.itbis_usd, 'Total USD': s.total_usd,
            Estado: s.payment_status,
          })), 'ventas', 'Ventas');
        }} />}
        {tab === 'Gastos' && <GastosTab expenses={expenses} queryClient={queryClient} rate={latestRate} onExport={() => {
          exportToExcel(expenses.map((e: any) => ({
            Fecha: e.date, Descripción: e.description, Categoría: e.category,
            Proveedor: e.vendor, 'Monto USD': e.amount_usd, 'Monto DOP': e.amount_dop,
          })), 'gastos', 'Gastos');
        }} />}
        {tab === 'P&L' && <PLTab monthlyData={monthlyData} revenueMTD={revenueMTD} cogsMTD={cogsMTD} expensesMTD={expensesMTD} expenses={expenses} onExport={() => {
          exportToExcel(monthlyData.map((m: any) => ({
            Mes: m.month, 'Ingresos USD': m.revenue, 'COGS USD': m.cogs,
            'Gastos USD': m.expenses, 'Utilidad USD': m.profit,
          })), 'estado_resultados', 'P&L');
        }} />}
        {tab === 'AI Asesor' && <AIAsesorTab sales={sales} expenses={expenses} revenueMTD={revenueMTD} grossMargin={grossMargin} />}
      </div>

      <AIAssistantDialog open={aiOpen} onOpenChange={setAiOpen} queryClient={queryClient} rate={latestRate} />
    </AppLayout>
  );
}

// ============ VENTAS TAB ============
function VentasTab({ sales, queryClient, rate, onExport }: any) {
  const [showForm, setShowForm] = useState(false);
  const [editSale, setEditSale] = useState<any>(null);
  const [deleteSale, setDeleteSale] = useState<any>(null);

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
              <TableHead className="text-xs text-right">Total USD</TableHead>
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
                <TableCell className="text-xs text-right font-mono">{formatUSD(Number(s.subtotal_usd))}</TableCell>
                <TableCell className="text-xs text-right font-mono text-muted-foreground">{formatUSD(Number(s.itbis_usd))}</TableCell>
                <TableCell className="text-xs text-right font-mono font-bold text-primary">{formatUSD(Number(s.total_usd))}</TableCell>
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
      <SaleFormDialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditSale(null); }} queryClient={queryClient} rate={rate} editSale={editSale} />
      <DeleteConfirmDialog
        open={!!deleteSale}
        onOpenChange={(v) => { if (!v) setDeleteSale(null); }}
        title="Eliminar venta"
        description={`¿Eliminar la venta <strong>${deleteSale?.invoice_ref || deleteSale?.date || ''}</strong> por <strong>${formatUSD(Number(deleteSale?.total_usd || 0))}</strong>? Se eliminarán todos los ítems asociados. Esta acción no se puede deshacer.`}
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

function SaleFormDialog({ open, onOpenChange, queryClient, rate, editSale }: any) {
  const [contactId, setContactId] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [items, setItems] = useState([{ product_id: '', quantity: 1, unit_price_usd: 0 }]);
  const [saving, setSaving] = useState(false);
  const isEdit = !!editSale;

  const { data: clients = [] } = useQuery({ queryKey: ['crm-clients'], queryFn: async () => { const { data } = await supabase.from('crm_clients').select('*'); return data || []; } });
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: async () => { const { data } = await supabase.from('products').select('*').eq('is_active', true); return data || []; } });

  useEffect(() => {
    if (editSale) {
      setContactId(editSale.contact_id || '');
      setInvoiceRef(editSale.invoice_ref || '');
      if (editSale.sale_items?.length) {
        setItems(editSale.sale_items.map((si: any) => ({
          product_id: si.product_id || '', quantity: si.quantity, unit_price_usd: Number(si.unit_price_usd),
        })));
      }
    } else {
      setContactId(''); setInvoiceRef('');
      setItems([{ product_id: '', quantity: 1, unit_price_usd: 0 }]);
    }
  }, [editSale, open]);

  const subtotal = items.reduce((s, i) => s + i.unit_price_usd * i.quantity, 0);
  const itbis = subtotal * 0.18;
  const total = subtotal + itbis;
  const xr = Number(rate?.usd_sell) || 60.76;

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
      // Delete old items and re-insert
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

    if (!isEdit) {
      for (const item of items) {
        const { data: inv } = await supabase.from('inventory').select('*').eq('product_id', item.product_id).limit(1).single();
        if (inv) await supabase.from('inventory').update({ quantity_on_hand: Math.max(0, inv.quantity_on_hand - item.quantity) }).eq('id', inv.id);
        await supabase.from('inventory_movements').insert({
          product_id: item.product_id, movement_type: 'sale' as any, quantity: -item.quantity,
          unit_cost_usd: Number(products.find((p: any) => p.id === item.product_id)?.unit_cost_usd || 0),
          reference_id: saleId, reference_type: 'sale',
        });
      }
    }

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
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>{clients.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Ref. Factura</Label><Input value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} className="mt-1" /></div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Productos</Label>
            {items.map((item, idx) => (
              <div key={idx} className="flex gap-2 items-end">
                <Select value={item.product_id} onValueChange={v => {
                  const prod = products.find((p: any) => p.id === v);
                  setItems(prev => prev.map((it, i) => i === idx ? { ...it, product_id: v, unit_price_usd: Number(prod?.price_list_usd || 0) } : it));
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
            ))}
            <Button variant="ghost" size="sm" onClick={() => setItems(prev => [...prev, { product_id: '', quantity: 1, unit_price_usd: 0 }])}>+ Línea</Button>
          </div>
          <div className="rounded-lg bg-muted p-3 space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatUSD(subtotal)}</span></div>
            <div className="flex justify-between"><span>ITBIS (18%)</span><span>{formatUSD(itbis)}</span></div>
            <div className="flex justify-between font-bold"><span>Total USD</span><span>{formatUSD(total)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Total DOP</span><span>RD${(total * xr).toLocaleString('es-DO', { minimumFractionDigits: 0 })}</span></div>
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
              <TableHead className="text-xs">Proveedor</TableHead>
              <TableHead className="text-xs text-right">USD</TableHead>
              <TableHead className="text-xs text-right">DOP</TableHead>
              <TableHead className="text-xs w-[80px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {expenses.map((e: any) => {
              const cat = EXPENSE_CATEGORIES[e.category] || EXPENSE_CATEGORIES.other;
              return (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">{e.date}</TableCell>
                  <TableCell className="text-xs"><span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{cat.icon} {cat.label}</span></TableCell>
                  <TableCell className="text-xs font-medium">{e.description}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{e.vendor || '—'}</TableCell>
                  <TableCell className="text-xs text-right font-mono font-bold text-destructive">{formatUSD(Number(e.amount_usd))}</TableCell>
                  <TableCell className="text-xs text-right font-mono text-muted-foreground">RD${Number(e.amount_dop).toLocaleString()}</TableCell>
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
        description={`¿Eliminar el gasto <strong>${deleteExpense?.description || ''}</strong> por <strong>${formatUSD(Number(deleteExpense?.amount_usd || 0))}</strong>? Esta acción no se puede deshacer.`}
        onConfirm={handleDeleteExpense}
      />
    </div>
  );
}

function ExpenseFormDialog({ open, onOpenChange, queryClient, rate, editExpense }: any) {
  const [form, setForm] = useState({ description: '', category: 'other', vendor: '', amount_usd: '', amount_dop: '' });
  const [saving, setSaving] = useState(false);
  const xr = Number(rate?.usd_sell) || 60.76;
  const isEdit = !!editExpense;

  useEffect(() => {
    if (editExpense) {
      setForm({
        description: editExpense.description || '',
        category: editExpense.category || 'other',
        vendor: editExpense.vendor || '',
        amount_usd: String(editExpense.amount_usd || ''),
        amount_dop: String(editExpense.amount_dop || ''),
      });
    } else {
      setForm({ description: '', category: 'other', vendor: '', amount_usd: '', amount_dop: '' });
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
          <div><Label className="text-xs">Proveedor</Label><Input value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} className="mt-1" /></div>
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

// ============ P&L TAB ============
function PLTab({ monthlyData, revenueMTD, cogsMTD, expensesMTD, expenses, onExport }: any) {
  const grossProfit = revenueMTD - cogsMTD;
  const grossMarginPct = revenueMTD > 0 ? (grossProfit / revenueMTD * 100) : 0;
  const netIncome = grossProfit - expensesMTD;
  const netMarginPct = revenueMTD > 0 ? (netIncome / revenueMTD * 100) : 0;

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const expByCat: Record<string, number> = {};
  expenses.forEach((e: any) => {
    if (e.date?.startsWith(thisMonth)) {
      const label = EXPENSE_CATEGORIES[e.category]?.label || e.category;
      expByCat[label] = (expByCat[label] || 0) + Number(e.amount_usd || 0);
    }
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-2xl bg-card border border-border p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Estado de Resultados — Mes Actual</h2>
          <Button size="sm" variant="outline" onClick={onExport}><Download className="w-3.5 h-3.5 mr-1" /> Excel</Button>
        </div>
        <div className="space-y-2">
          <PLRow label="Ingresos" value={revenueMTD} bold />
          <PLRow label="(-) Costo de Ventas" value={cogsMTD} negative />
          <div className="border-t border-border my-2" />
          <PLRow label="Utilidad Bruta" value={grossProfit} bold color={grossProfit >= 0 ? 'text-success' : 'text-destructive'} />
          <PLRow label="Margen Bruto" value={grossMarginPct} pct />
          <div className="mt-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Gastos Operativos</div>
          {Object.entries(expByCat).sort((a, b) => b[1] - a[1]).map(([label, amt]) => (
            <PLRow key={label} label={`  ${label}`} value={amt} negative />
          ))}
          <div className="border-t border-border my-2" />
          <PLRow label="(-) Total Gastos" value={expensesMTD} negative />
          <div className="border-t-2 border-border my-2" />
          <PLRow label="Utilidad Neta" value={netIncome} bold color={netIncome >= 0 ? 'text-success' : 'text-destructive'} />
          <PLRow label="Margen Neto" value={netMarginPct} pct />
        </div>
      </div>
      <div className="rounded-2xl bg-card border border-border p-6 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Tendencia 6 Meses</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={monthlyData}>
            <XAxis dataKey="month" tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'hsl(220, 12%, 55%)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}K`} />
            <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatUSD(v)} />
            <Bar dataKey="revenue" name="Ingresos" fill="hsl(217, 91%, 60%)" radius={[6,6,0,0]} />
            <Bar dataKey="profit" name="Utilidad" fill="hsl(160, 84%, 39%)" radius={[6,6,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PLRow({ label, value, bold, negative, color, pct }: { label: string; value: number; bold?: boolean; negative?: boolean; color?: string; pct?: boolean }) {
  return (
    <div className={cn('flex justify-between text-sm', bold ? 'font-bold' : '')}>
      <span className="text-foreground">{label}</span>
      <span className={color || (negative ? 'text-destructive' : 'text-foreground')}>
        {pct ? `${value.toFixed(1)}%` : (negative ? `-${formatUSD(value)}` : formatUSD(value))}
      </span>
    </div>
  );
}

// ============ AI ASESOR TAB ============
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
function AIAssistantDialog({ open, onOpenChange, queryClient, rate }: any) {
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
