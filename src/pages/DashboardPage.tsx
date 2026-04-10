import { useState, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { KpiCard } from '@/components/KpiCard';
import { useAuth } from '@/hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatUSD, formatDOP } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useExchangeRate } from '@/hooks/useExchangeRate';
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  LineChart, Line, ComposedChart, Legend, LabelList,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Bot, RefreshCw, Plus, AlertTriangle, Clock, DollarSign, Package, TrendingUp, BarChart3, Warehouse, Bell, Settings, Users, ShieldAlert } from 'lucide-react';
import { streamBusinessAI } from '@/lib/business-ai';
import { useAlerts } from '@/hooks/useAlerts';
import { useAlertLogger } from '@/hooks/useAlertHistory';
import ReactMarkdown from 'react-markdown';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { daysInStage } from '@/lib/crm-utils';

const chartTooltipStyle = { background: 'hsl(222, 20%, 10%)', border: '1px solid hsl(222, 20%, 20%)', borderRadius: 8, fontSize: 12 };
const axisTick = { fill: 'hsl(220, 12%, 55%)', fontSize: 11 };

const CATEGORY_COLORS: Record<string, string> = {
  'Protección de Pisos': 'hsl(217, 91%, 60%)',
  'Cintas': 'hsl(160, 84%, 39%)',
  'Accesorios': 'hsl(38, 92%, 50%)',
  'Contención de Polvo': 'hsl(0, 84%, 60%)',
  'Protección de Superficies': 'hsl(190, 70%, 50%)',
};
const PIE_COLORS = ['hsl(217, 91%, 60%)', 'hsl(160, 84%, 39%)', 'hsl(38, 92%, 50%)', 'hsl(280, 60%, 55%)', 'hsl(0, 84%, 60%)', 'hsl(190, 70%, 50%)', 'hsl(330, 70%, 55%)'];

const DEAL_STAGE_LABELS: Record<string, string> = {
  prospecting: 'Prospección', initial_contact: 'Contacto', demo_sample: 'Demo',
  quote_sent: 'Cotización', negotiation: 'Negociación', closing: 'Cierre', delivered: 'Entregado',
};
const FUNNEL_COLORS = ['hsl(217, 91%, 65%)', 'hsl(217, 91%, 58%)', 'hsl(217, 91%, 52%)', 'hsl(217, 91%, 46%)', 'hsl(217, 91%, 40%)', 'hsl(217, 91%, 34%)', 'hsl(217, 91%, 28%)'];

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { rate } = useExchangeRate();
  const fmt = (usd: number) => formatDOP(usd * rate);
  const [showReview, setShowReview] = useState(false);
  const [reviewContent, setReviewContent] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const alertsNotifiedRef = useRef(false);

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
        .map(([name, value], i) => ({ name, value, color: PIE_COLORS[i] || PIE_COLORS[PIE_COLORS.length - 1] }));
      return { totalUnits, totalValue, alerts, categoryData, stockItems };
    },
  });

  const { data: revenueData } = useQuery({
    queryKey: ['dashboard-revenue'],
    queryFn: async () => {
      const [{ data: saleItems }, { data: expenses }, { data: directCosts }] = await Promise.all([
        supabase.from('sale_items').select('*, sales(date), products(name, category)'),
        supabase.from('expenses').select('date, amount_usd'),
        supabase.from('costs').select('date, amount_usd'),
      ]);
      if (!saleItems) return { monthly: [], totalRevenue: 0, totalCogs: 0, totalExpenses: 0, totalDirectCosts: 0, topProducts: [], revByCategory: [] };

      const months: Record<string, { revenue: number; cogs: number; expenses: number; directCosts: number }> = {};
      const productRevenue: Record<string, { name: string; revenue: number }> = {};
      const catRevenue: Record<string, number> = {};
      let totalRevenue = 0, totalCogs = 0, totalExpenses = 0, totalDirectCosts = 0;

      saleItems.forEach(si => {
        const lineTotal = Number(si.line_total_usd || 0);
        const lineCogs = Number(si.unit_cost_usd || 0) * Number(si.quantity || 0);
        totalRevenue += lineTotal;
        totalCogs += lineCogs;

        const date = si.sales?.date;
        if (date) {
          const key = date.substring(0, 7);
          if (!months[key]) months[key] = { revenue: 0, cogs: 0, expenses: 0, directCosts: 0 };
          months[key].revenue += lineTotal;
          months[key].cogs += lineCogs;
        }

        const cat = si.products?.category || 'Otros';
        catRevenue[cat] = (catRevenue[cat] || 0) + lineTotal;

        const pName = si.products?.name || 'Desconocido';
        if (!productRevenue[pName]) productRevenue[pName] = { name: pName, revenue: 0 };
        productRevenue[pName].revenue += lineTotal;
      });

      // Add expenses by month
      (expenses || []).forEach(e => {
        const amt = Number(e.amount_usd || 0);
        totalExpenses += amt;
        if (e.date) {
          const key = e.date.substring(0, 7);
          if (!months[key]) months[key] = { revenue: 0, cogs: 0, expenses: 0, directCosts: 0 };
          months[key].expenses += amt;
        }
      });

      // Add direct costs by month
      (directCosts || []).forEach(c => {
        const amt = Number(c.amount_usd || 0);
        totalDirectCosts += amt;
        if (c.date) {
          const key = c.date.substring(0, 7);
          if (!months[key]) months[key] = { revenue: 0, cogs: 0, expenses: 0, directCosts: 0 };
          months[key].directCosts += amt;
        }
      });

      const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      
      // Build last 12 months
      const now = new Date();
      const last12: { key: string; month: string }[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        last12.push({ key, month: monthNames[d.getMonth()] });
      }

      const monthly = last12.map(({ key, month }) => {
        const val = months[key] || { revenue: 0, cogs: 0, expenses: 0, directCosts: 0 };
        const grossMargin = val.revenue > 0 ? ((val.revenue - val.cogs - val.directCosts) / val.revenue * 100) : 0;
        const netMargin = val.revenue > 0 ? ((val.revenue - val.cogs - val.directCosts - val.expenses) / val.revenue * 100) : 0;
        return {
          month,
          revenue: Math.round(val.revenue),
          cogs: Math.round(val.cogs),
          grossMargin: Math.round(grossMargin * 10) / 10,
          netMargin: Math.round(netMargin * 10) / 10,
        };
      });

      const topProducts = Object.values(productRevenue).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
      const maxRev = topProducts[0]?.revenue || 1;
      const topNormalized = topProducts.map(p => ({ ...p, pct: Math.round((p.revenue / maxRev) * 100) }));

      const revByCategory = Object.entries(catRevenue).sort((a, b) => b[1] - a[1]).map(([name, value], i) => ({
        name, value, color: CATEGORY_COLORS[name] || PIE_COLORS[i] || PIE_COLORS[PIE_COLORS.length - 1],
      }));

      return { monthly, totalRevenue, totalCogs, totalExpenses, totalDirectCosts, topProducts: topNormalized, revByCategory };
    },
  });

  const { data: pipelineData } = useQuery({
    queryKey: ['dashboard-pipeline'],
    queryFn: async () => {
      const { data: deals } = await supabase.from('deals').select('stage, value_usd');
      if (!deals) return [];
      const stages = ['prospecting', 'initial_contact', 'demo_sample', 'quote_sent', 'negotiation', 'closing', 'delivered'];
      return stages.map((stage, i) => {
        const stageDeals = deals.filter(d => d.stage === stage);
        return {
          name: DEAL_STAGE_LABELS[stage] || stage,
          value: stageDeals.length,
          amount: stageDeals.reduce((s, d) => s + Number(d.value_usd || 0), 0),
          fill: FUNNEL_COLORS[i],
        };
      }).filter(s => s.value > 0);
    },
  });

  const { data: clientTrends } = useQuery({
    queryKey: ['dashboard-client-trends'],
    queryFn: async () => {
      const { data: sales } = await supabase.from('sales').select('contact_id, total_usd, date, crm_clients(name)').order('date');
      if (!sales) return [];
      const now = new Date();
      const byClient: Record<string, { name: string; months: number[]; lastDate: string }> = {};
      sales.forEach((s: any) => {
        const cid = s.contact_id;
        if (!cid) return;
        if (!byClient[cid]) byClient[cid] = { name: s.crm_clients?.name || '?', months: [0, 0, 0, 0, 0, 0], lastDate: '' };
        if (!byClient[cid].lastDate || s.date > byClient[cid].lastDate) byClient[cid].lastDate = s.date;
        const d = new Date(s.date);
        const monthsAgo = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
        if (monthsAgo >= 0 && monthsAgo < 6) byClient[cid].months[5 - monthsAgo] += Number(s.total_usd || 0);
      });
      return Object.values(byClient)
        .map(c => {
          const daysSince = c.lastDate ? Math.floor((Date.now() - new Date(c.lastDate).getTime()) / 86400000) : 999;
          return { ...c, daysSince };
        })
        .sort((a, b) => b.months.reduce((s, v) => s + v, 0) - a.months.reduce((s, v) => s + v, 0)).slice(0, 8);
    },
  });

  const margin = revenueData && revenueData.totalRevenue > 0
    ? ((revenueData.totalRevenue - revenueData.totalCogs) / revenueData.totalRevenue * 100) : 0;
  const netMargin = revenueData && revenueData.totalRevenue > 0
    ? ((revenueData.totalRevenue - revenueData.totalCogs - (revenueData.totalExpenses || 0)) / revenueData.totalRevenue * 100) : 0;

  const lowStockItems = inventoryStats?.stockItems.filter(i => i.status === 'low' || i.status === 'out') || [];

  // Dynamic alerts from configurable rules
  const { data: computedAlerts = [] } = useAlerts();
  useAlertLogger(computedAlerts.length > 0 ? computedAlerts : undefined);

  // Toast notifications for critical inventory/shipment alerts
  useEffect(() => {
    if (!computedAlerts.length || alertsNotifiedRef.current) return;
    alertsNotifiedRef.current = true;
    const inventoryAlerts = computedAlerts.filter(a => ['reorder_needed', 'low_stock', 'out_of_stock', 'shipment_delayed', 'client_declining'].includes(a.ruleId));
    inventoryAlerts.forEach(alert => {
      if (alert.severity === 'critical') {
        toast.error(alert.message, { duration: 8000 });
      } else {
        toast.warning(alert.message, { duration: 6000 });
      }
    });
  }, [computedAlerts]);

  const generateReview = async () => {
    setShowReview(true);
    setReviewContent('');
    setReviewLoading(true);
    try {
      await streamBusinessAI({
        action: 'review',
        onDelta: (chunk) => setReviewContent(prev => prev + chunk),
        onDone: () => setReviewLoading(false),
      });
    } catch (e: any) {
      toast.error(e.message || 'Error');
      setReviewLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Quick Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <p className="text-sm text-muted-foreground">Hola, {user?.user_metadata?.full_name || 'usuario'} 👋</p>
          <div className="flex gap-2 ml-auto">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={generateReview}>
              <Bot className="w-3.5 h-3.5" /> AI Business Review
            </Button>
          </div>
        </div>

        {/* Alerts Banner */}
        {computedAlerts.length > 0 && (
          <div className="rounded-2xl bg-destructive/5 border border-destructive/20 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-destructive flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Alertas que requieren atención ({computedAlerts.length})</h3>
              <Button size="sm" variant="ghost" className="text-[10px] text-muted-foreground h-6 gap-1" onClick={() => navigate('/mas')}><Settings className="w-3 h-3" /> Configurar</Button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {computedAlerts.map(alert => (
                <div key={alert.ruleId} className="rounded-xl bg-card p-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => alert.navigateTo && navigate(alert.navigateTo)}>
                  <div className="flex items-start justify-between">
                    <p className={cn('text-lg font-bold', alert.severity === 'critical' ? 'text-destructive' : 'text-warning')}>
                      {alert.count}
                    </p>
                    {(() => {
                      const iconMap: Record<string, typeof Package> = { inventory: Package, finance: DollarSign, margin: TrendingUp, crm: Users, concentration: ShieldAlert };
                      const colorMap: Record<string, string> = { inventory: 'text-primary', finance: 'text-warning', margin: 'text-destructive', crm: 'text-success', concentration: 'text-destructive' };
                      const Icon = iconMap[alert.category] || Bell;
                      return (
                        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center bg-muted/50', colorMap[alert.category] || 'text-muted-foreground')}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                      );
                    })()}
                  </div>
                  <p className="text-[10px] text-muted-foreground font-medium mt-1">{alert.label}</p>
                  <p className="text-[9px] text-muted-foreground/70 mt-0.5 line-clamp-2">{alert.message}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <KpiCard title="Ingresos Total" value={fmt(revenueData?.totalRevenue || 0)} icon={DollarSign} variant="primary" />
          <KpiCard title="Margen Bruto" value={`${margin.toFixed(1)}%`} icon={TrendingUp} variant="success" />
          <KpiCard title="Margen Neto" value={`${netMargin.toFixed(1)}%`} icon={BarChart3} variant={netMargin >= 0 ? 'success' : 'destructive'} subtitle={`Gastos: ${fmt(revenueData?.totalExpenses || 0)}`} />
          <KpiCard title="Valor Inventario" value={fmt(inventoryStats?.totalValue || 0)} icon={Warehouse} />
          <KpiCard title="Alertas Stock" value={`${inventoryStats?.alerts || 0}`} icon={Bell}
            variant={inventoryStats?.alerts ? 'warning' : 'default'}
            subtitle={`${(inventoryStats?.totalUnits || 0).toLocaleString()} unidades total`} />
        </div>

        {/* Row 2: Revenue chart + Revenue by Category donut */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-2xl bg-card border border-border p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Ingresos vs Costos (12 meses)</h2>
            {revenueData && revenueData.monthly.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <ComposedChart data={revenueData.monthly} barGap={2}>
                  <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" tick={axisTick} axisLine={false} tickLine={false} width={60} tickFormatter={(v) => `RD$${(v * rate / 1000).toFixed(0)}k`} />
                  <YAxis yAxisId="right" orientation="right" tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number, name: string) => {
                    if (name === 'Margen Bruto' || name === 'Margen Neto') return `${v}%`;
                    return fmt(v);
                  }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="revenue" fill="hsl(217, 91%, 60%)" radius={[6, 6, 0, 0]} name="Ingresos">
                    <LabelList dataKey="revenue" position="top" formatter={(v: number) => v > 0 ? `RD$${(v * rate / 1000).toFixed(1)}k` : ''} style={{ fill: 'hsl(220, 12%, 60%)', fontSize: 9 }} />
                  </Bar>
                  <Bar yAxisId="left" dataKey="cogs" fill="hsl(222, 20%, 25%)" radius={[6, 6, 0, 0]} name="Costos" />
                  <Line yAxisId="right" type="monotone" dataKey="grossMargin" stroke="hsl(160, 84%, 39%)" strokeWidth={2} dot={{ r: 3, fill: 'hsl(160, 84%, 39%)' }} name="Margen Bruto">
                    <LabelList dataKey="grossMargin" position="top" formatter={(v: number) => v > 0 ? `${v}%` : ''} style={{ fill: 'hsl(160, 84%, 50%)', fontSize: 9 }} />
                  </Line>
                  <Line yAxisId="right" type="monotone" dataKey="netMargin" stroke="hsl(38, 92%, 50%)" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: 'hsl(38, 92%, 50%)' }} name="Margen Neto">
                    <LabelList dataKey="netMargin" position="bottom" formatter={(v: number) => v !== 0 ? `${v}%` : ''} style={{ fill: 'hsl(38, 92%, 60%)', fontSize: 9 }} />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[320px] text-sm text-muted-foreground">Sin datos de ventas</div>
            )}
          </div>

          {/* Revenue by Category donut */}
          <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Ingresos por Categoría</h2>
            {revenueData && revenueData.revByCategory.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={revenueData.revByCategory} innerRadius={45} outerRadius={70} dataKey="value" stroke="none">
                      {revenueData.revByCategory.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(v: number) => formatUSD(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5">
                  {revenueData.revByCategory.map((c) => (
                    <div key={c.name} className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                      <span className="text-xs text-foreground truncate">{c.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto shrink-0">{formatUSD(c.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-[160px] text-sm text-muted-foreground">Sin datos</div>
            )}
          </div>
        </div>

        {/* Row 3: Pipeline funnel + Client sparklines + Stock alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Pipeline Funnel */}
          <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Embudo de Pipeline</h2>
            {pipelineData && pipelineData.length > 0 ? (
              <div className="space-y-2">
                {pipelineData.map((stage, i) => {
                  const maxVal = pipelineData[0]?.value || 1;
                  const widthPct = Math.max(20, (stage.value / maxVal) * 100);
                  return (
                    <div key={stage.name} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-foreground font-medium">{stage.name}</span>
                        <span className="text-muted-foreground">{stage.value} deals · {fmt(stage.amount)}</span>
                      </div>
                      <div className="h-6 rounded-lg overflow-hidden" style={{ width: `${widthPct}%`, background: FUNNEL_COLORS[i] || FUNNEL_COLORS[5], opacity: 0.8 + (i * 0.04) }} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center justify-center h-[180px] text-sm text-muted-foreground">Sin deals activos</div>
            )}
          </div>

          {/* Client Sparklines */}
          <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Tendencia por Cliente</h2>
            <div className="space-y-2.5">
              {(clientTrends || []).map((client) => {
                const total = client.months.reduce((s: number, v: number) => s + v, 0);
                const recent = client.months[5] + client.months[4];
                const older = client.months[0] + client.months[1];
                const trending = recent >= older;
                const isInactive = client.daysSince > 30;
                return (
                  <div key={client.name} className={cn('flex items-center gap-3', isInactive && 'opacity-80')}>
                    <span className={cn('text-xs truncate w-24', isInactive ? 'text-destructive font-semibold' : 'text-foreground')}>{client.name}</span>
                    <ClientSparkline data={client.months} trending={trending} />
                    <span className="text-xs text-muted-foreground font-mono shrink-0">{formatUSD(total)}</span>
                    {isInactive ? (
                      <span className="text-[10px] font-semibold text-destructive shrink-0" title={`Última compra: ${client.lastDate}`}>
                        {client.daysSince}d
                      </span>
                    ) : (
                      <span className={`text-[10px] font-semibold ${trending ? 'text-success' : 'text-destructive'}`}>
                        {trending ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                );
              })}
              {(!clientTrends || clientTrends.length === 0) && (
                <p className="text-xs text-muted-foreground text-center py-4">Sin datos de clientes</p>
              )}
            </div>
          </div>

          {/* Stock alerts */}
          <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Alertas de Stock</h2>
            {lowStockItems.length > 0 ? (
              <div className="space-y-2">
                {lowStockItems.slice(0, 8).map((item, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2">
                    <span className="text-sm">{item.status === 'out' ? '🔴' : '🟡'}</span>
                    <span className="text-xs text-foreground flex-1 truncate">{item.name}</span>
                    <span className="text-xs text-muted-foreground font-mono">{item.qty} uds</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-6">✅ Sin alertas de stock</p>
            )}
          </div>
        </div>

        {/* Top products */}
        {revenueData && revenueData.topProducts.length > 0 && (
          <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Top 5 Productos (por venta)</h2>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              {revenueData.topProducts.map((p) => (
                <div key={p.name} className="space-y-2">
                  <p className="text-xs text-foreground truncate">{p.name}</p>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${p.pct}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground">{fmt(p.revenue)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* AI Business Review Dialog */}
      <Dialog open={showReview} onOpenChange={setShowReview}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="w-4 h-4" /> AI Business Review
              <Button size="sm" variant="ghost" onClick={generateReview} disabled={reviewLoading} className="ml-auto">
                <RefreshCw className={`w-3.5 h-3.5 ${reviewLoading ? 'animate-spin' : ''}`} />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm prose-invert max-w-none">
            {reviewContent ? <ReactMarkdown>{reviewContent}</ReactMarkdown> : (
              <div className="text-center text-muted-foreground py-8">
                {reviewLoading ? <p className="animate-pulse">Generando reporte...</p> : <p>Haz clic en el botón para generar</p>}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

function ClientSparkline({ data, trending }: { data: number[]; trending: boolean }) {
  if (!data.length) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => `${(i / Math.max(data.length - 1, 1)) * 60},${20 - ((v - min) / range) * 18}`).join(' ');
  return (
    <svg width="60" height="22" className="shrink-0">
      <polyline points={points} fill="none" stroke={trending ? 'hsl(160, 84%, 39%)' : 'hsl(0, 84%, 60%)'} strokeWidth="1.5" />
    </svg>
  );
}
