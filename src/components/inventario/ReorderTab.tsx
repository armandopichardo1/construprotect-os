import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Bot, RefreshCw, Check, AlertTriangle, TrendingUp, TrendingDown, Minus, Settings2, Sparkles, Save, Clock, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/lib/format';
import { streamBusinessAI } from '@/lib/business-ai';
import { toast } from 'sonner';

type Recommendation = {
  sku: string;
  product_name: string;
  current_reorder_point: number;
  suggested_reorder_point: number;
  current_reorder_qty: number;
  suggested_reorder_qty: number;
  reason: string;
  urgency: 'high' | 'medium' | 'low';
  velocity_trend: 'increasing' | 'stable' | 'decreasing';
  days_of_supply: number;
  avg_monthly_sales: number;
};

type AIResponse = {
  recommendations: Recommendation[];
  summary: string;
  alerts: string[];
};

type EditingRow = {
  productId: string;
  reorderPoint: number;
  reorderQty: number;
};

export function ReorderTab() {
  const queryClient = useQueryClient();
  const [aiData, setAiData] = useState<AIResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [editingRows, setEditingRows] = useState<Record<string, EditingRow>>({});
  const [showConfigAll, setShowConfigAll] = useState(false);

  const { data: products } = useQuery({
    queryKey: ['reorder-products'],
    queryFn: async () => {
      const [{ data: inv }, { data: prods }, { data: movements }] = await Promise.all([
        supabase.from('inventory').select('*'),
        supabase.from('products').select('id, sku, name, category, unit_cost_usd, reorder_point, reorder_qty, lead_time_days, brand, min_order_qty').eq('is_active', true),
        supabase.from('inventory_movements').select('product_id, quantity, movement_type, created_at').order('created_at'),
      ]);
      if (!prods) return [];
      const invMap = Object.fromEntries((inv || []).map(i => [i.product_id, i]));
      const now = new Date();
      const salesByProduct: Record<string, { total: number; months: number[] }> = {};
      (movements || []).forEach(m => {
        if (m.movement_type !== 'sale') return;
        const date = new Date(m.created_at);
        const monthsAgo = (now.getFullYear() - date.getFullYear()) * 12 + now.getMonth() - date.getMonth();
        if (monthsAgo > 5 || monthsAgo < 0) return;
        if (!salesByProduct[m.product_id]) salesByProduct[m.product_id] = { total: 0, months: [0,0,0,0,0,0] };
        salesByProduct[m.product_id].total += Math.abs(m.quantity);
        salesByProduct[m.product_id].months[5 - monthsAgo] += Math.abs(m.quantity);
      });

      return prods.map(p => {
        const inv = invMap[p.id];
        const sales = salesByProduct[p.id];
        const avgMonthly = sales ? sales.total / 6 : 0;
        const recentAvg = sales ? sales.months.slice(3).reduce((a, b) => a + b, 0) / 3 : 0;
        const olderAvg = sales ? sales.months.slice(0, 3).reduce((a, b) => a + b, 0) / 3 : 0;
        const trendPct = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;
        const daysOfSupply = avgMonthly > 0 ? Math.round(((inv?.quantity_on_hand || 0) / avgMonthly) * 30) : 999;
        const dailyVelocity = avgMonthly / 30;
        const leadTime = Number(p.lead_time_days) || 21;
        const minBatch = Number((p as any).min_order_qty) || 1;
        const safetyStock = Math.ceil(dailyVelocity * leadTime * 1.5);
        const reorderPointCalc = safetyStock + Math.ceil(dailyVelocity * leadTime);
        const daysToStockout = dailyVelocity > 0 ? Math.round((inv?.quantity_on_hand || 0) / dailyVelocity) : 999;
        const arrivalDay = daysToStockout - leadTime;
        return {
          ...p,
          qty: inv?.quantity_on_hand || 0,
          avgMonthly,
          recentAvg,
          trendPct,
          daysOfSupply,
          reorder_point: Number(p.reorder_point) || 0,
          reorder_qty: Number(p.reorder_qty) || 0,
          lead_time_days: leadTime,
          min_order_qty: minBatch,
          safetyStock,
          reorderPointCalc,
          daysToStockout,
          arrivalDay, // negative = will stockout before order arrives
          dailyVelocity,
        };
      });
    },
  });

  const updateProduct = useMutation({
    mutationFn: async ({ id, reorder_point, reorder_qty }: { id: string; reorder_point: number; reorder_qty: number }) => {
      const { error } = await supabase.from('products').update({ reorder_point, reorder_qty }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reorder-products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      toast.success('Punto de reorden actualizado');
    },
    onError: () => toast.error('Error al actualizar'),
  });

  const applyAISuggestion = async (rec: Recommendation) => {
    const product = products?.find(p => p.sku === rec.sku);
    if (!product) return;
    await updateProduct.mutateAsync({
      id: product.id,
      reorder_point: rec.suggested_reorder_point,
      reorder_qty: rec.suggested_reorder_qty,
    });
  };

  const applyAllSuggestions = async () => {
    if (!aiData?.recommendations) return;
    const changed = aiData.recommendations.filter(r => 
      r.suggested_reorder_point !== r.current_reorder_point || r.suggested_reorder_qty !== r.current_reorder_qty
    );
    for (const rec of changed) {
      await applyAISuggestion(rec);
    }
    toast.success(`${changed.length} productos actualizados`);
  };

  const runAI = async () => {
    setAiLoading(true);
    setAiData(null);
    let fullText = '';
    try {
      await streamBusinessAI({
        action: 'reorder-recommendations',
        onDelta: (chunk) => { fullText += chunk; },
        onDone: () => {
          try {
            // Try to extract JSON from the response
            let jsonStr = fullText.trim();
            const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
            if (jsonMatch) jsonStr = jsonMatch[0];
            const parsed = JSON.parse(jsonStr) as AIResponse;
            setAiData(parsed);
          } catch (e) {
            console.error('Failed to parse AI response:', fullText);
            toast.error('Error al procesar respuesta de IA');
          }
          setAiLoading(false);
        },
      });
    } catch (e: any) {
      toast.error(e.message || 'Error');
      setAiLoading(false);
    }
  };

  const startEdit = (p: any) => {
    setEditingRows(prev => ({
      ...prev,
      [p.id]: { productId: p.id, reorderPoint: p.reorder_point, reorderQty: p.reorder_qty },
    }));
  };

  const saveEdit = (id: string) => {
    const row = editingRows[id];
    if (!row) return;
    updateProduct.mutate({ id, reorder_point: row.reorderPoint, reorder_qty: row.reorderQty });
    setEditingRows(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const cancelEdit = (id: string) => {
    setEditingRows(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const items = products || [];
  const needsAttention = items.filter(p => p.daysOfSupply < p.lead_time_days || p.qty <= p.reorder_point);
  const criticalItems = items.filter(p => p.arrivalDay < 0 && p.avgMonthly > 0);
  const highVelocity = items.filter(p => p.trendPct > 30);

  const urgencyStyle = (urgency: string) => {
    if (urgency === 'high') return 'bg-destructive/15 text-destructive';
    if (urgency === 'medium') return 'bg-warning/15 text-warning';
    return 'bg-success/15 text-success';
  };

  const trendIcon = (pct: number) => {
    if (pct > 15) return <TrendingUp className="w-3.5 h-3.5 text-success" />;
    if (pct < -15) return <TrendingDown className="w-3.5 h-3.5 text-destructive" />;
    return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  };

  return (
    <div className="space-y-5">
      {/* Critical stockout simulation alert */}
      {criticalItems.length > 0 && (
        <div className="rounded-2xl bg-destructive/5 border border-destructive/20 p-4 space-y-2">
          <h3 className="text-xs font-semibold text-destructive flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5" /> Simulación de Agotamiento — {criticalItems.length} producto(s) en riesgo
          </h3>
          <p className="text-[10px] text-muted-foreground">
            Estos productos se agotarán antes de que llegue un nuevo pedido si ordenas hoy (basado en velocidad de rotación + lead time).
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
            {criticalItems.slice(0, 6).map(p => (
              <div key={p.id} className="rounded-lg bg-card border border-destructive/20 p-2.5 space-y-1">
                <p className="text-[11px] font-semibold text-foreground truncate">{p.name}</p>
                <div className="flex gap-3 text-[10px]">
                  <span className="text-muted-foreground">Stock: <span className="font-mono text-foreground">{p.qty}</span></span>
                  <span className="text-muted-foreground">Vel: <span className="font-mono text-foreground">{p.avgMonthly.toFixed(1)}/mes</span></span>
                </div>
                <div className="flex gap-3 text-[10px]">
                  <span className="text-destructive flex items-center gap-0.5">
                    <Clock className="w-3 h-3" /> Agotado en {p.daysToStockout >= 999 ? '∞' : `${p.daysToStockout}d`}
                  </span>
                  <span className="text-muted-foreground">Lead: {p.lead_time_days}d</span>
                </div>
                <p className="text-[9px] text-destructive/80">
                  ⚠️ Déficit de {Math.abs(p.arrivalDay)}d — el pedido llega {Math.abs(p.arrivalDay)} días después del agotamiento
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="rounded-xl bg-card border border-border p-4 space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Requieren Atención</p>
          <p className="text-2xl font-bold text-destructive">{needsAttention.length}</p>
          <p className="text-[10px] text-muted-foreground">Stock ≤ reorden o días &lt; lead time</p>
        </div>
        <div className="rounded-xl bg-card border border-border p-4 space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Riesgo Agotamiento</p>
          <p className="text-2xl font-bold text-destructive">{criticalItems.length}</p>
          <p className="text-[10px] text-muted-foreground">Se agotan antes de reposición</p>
        </div>
        <div className="rounded-xl bg-card border border-border p-4 space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Velocidad Creciente</p>
          <p className="text-2xl font-bold text-success">{highVelocity.length}</p>
          <p className="text-[10px] text-muted-foreground">Tendencia &gt; +30% últimos 3 meses</p>
        </div>
        <div className="rounded-xl bg-card border border-border p-4 space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Vel. Promedio</p>
          <p className="text-2xl font-bold text-foreground">{items.length > 0 ? (items.reduce((s, p) => s + p.avgMonthly, 0) / items.length).toFixed(1) : '0'}</p>
          <p className="text-[10px] text-muted-foreground">Unidades/mes promedio</p>
        </div>
        <div className="rounded-xl bg-card border border-border p-4 space-y-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Días Prom. de Stock</p>
          <p className="text-2xl font-bold text-foreground">{items.length > 0 ? Math.round(items.filter(p => p.daysOfSupply < 999).reduce((s, p) => s + p.daysOfSupply, 0) / Math.max(items.filter(p => p.daysOfSupply < 999).length, 1)) : '∞'}</p>
          <p className="text-[10px] text-muted-foreground">Promedio de productos activos</p>
        </div>
      </div>

      {/* AI Button */}
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={runAI} disabled={aiLoading} className="gap-1.5">
          <Sparkles className={cn('w-3.5 h-3.5', aiLoading && 'animate-spin')} />
          {aiLoading ? 'Analizando...' : '🤖 Recomendaciones IA'}
        </Button>
        {aiData && (
          <Button size="sm" variant="outline" onClick={applyAllSuggestions} className="gap-1.5">
            <Check className="w-3.5 h-3.5" /> Aplicar todas las sugerencias
          </Button>
        )}
      </div>

      {/* AI Results */}
      {aiData && (
        <div className="space-y-3">
          <div className="rounded-xl bg-primary/5 border border-primary/20 p-4 space-y-2">
            <p className="text-xs font-semibold text-primary flex items-center gap-1.5"><Bot className="w-3.5 h-3.5" /> Análisis IA</p>
            <p className="text-xs text-foreground">{aiData.summary}</p>
          </div>
          {aiData.alerts?.length > 0 && (
            <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-4 space-y-1">
              <p className="text-xs font-semibold text-destructive flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Alertas</p>
              {aiData.alerts.map((a, i) => (
                <p key={i} className="text-xs text-foreground">• {a}</p>
              ))}
            </div>
          )}

          {/* AI Recommendations table */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">SKU</TableHead>
                  <TableHead className="text-[10px]">Producto</TableHead>
                  <TableHead className="text-[10px] text-right">Vel/mes</TableHead>
                  <TableHead className="text-[10px] text-center">Tendencia</TableHead>
                  <TableHead className="text-[10px] text-right">Reorden Actual</TableHead>
                  <TableHead className="text-[10px] text-right">Reorden Sugerido</TableHead>
                  <TableHead className="text-[10px] text-right">Qty Actual</TableHead>
                  <TableHead className="text-[10px] text-right">Qty Sugerida</TableHead>
                  <TableHead className="text-[10px]">Urgencia</TableHead>
                  <TableHead className="text-[10px]">Razón</TableHead>
                  <TableHead className="text-[10px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aiData.recommendations
                  .filter(r => r.suggested_reorder_point !== r.current_reorder_point || r.suggested_reorder_qty !== r.current_reorder_qty)
                  .sort((a, b) => { const o: Record<string, number> = { high: 0, medium: 1, low: 2 }; return (o[a.urgency] ?? 3) - (o[b.urgency] ?? 3); })
                  .map(rec => (
                    <TableRow key={rec.sku}>
                      <TableCell className="text-[10px] font-mono">{rec.sku}</TableCell>
                      <TableCell className="text-[10px]">{rec.product_name}</TableCell>
                      <TableCell className="text-[10px] text-right font-mono">{rec.avg_monthly_sales?.toFixed(1)}</TableCell>
                      <TableCell className="text-center">
                        {rec.velocity_trend === 'increasing' ? <TrendingUp className="w-3.5 h-3.5 text-success mx-auto" /> :
                         rec.velocity_trend === 'decreasing' ? <TrendingDown className="w-3.5 h-3.5 text-destructive mx-auto" /> :
                         <Minus className="w-3.5 h-3.5 text-muted-foreground mx-auto" />}
                      </TableCell>
                      <TableCell className="text-[10px] text-right font-mono">{rec.current_reorder_point}</TableCell>
                      <TableCell className="text-[10px] text-right font-mono font-bold text-primary">{rec.suggested_reorder_point}</TableCell>
                      <TableCell className="text-[10px] text-right font-mono">{rec.current_reorder_qty}</TableCell>
                      <TableCell className="text-[10px] text-right font-mono font-bold text-primary">{rec.suggested_reorder_qty}</TableCell>
                      <TableCell><span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold', urgencyStyle(rec.urgency))}>{rec.urgency === 'high' ? '🔴 Alta' : rec.urgency === 'medium' ? '🟡 Media' : '🟢 Baja'}</span></TableCell>
                      <TableCell className="text-[10px] max-w-[200px] truncate" title={rec.reason}>{rec.reason}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={() => applyAISuggestion(rec)}>
                          <Check className="w-3 h-3 mr-1" /> Aplicar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Current Configuration table */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Settings2 className="w-4 h-4" /> Configuración Actual de Puntos de Reorden
        </h2>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">SKU</TableHead>
                <TableHead className="text-xs">Producto</TableHead>
                <TableHead className="text-xs text-right">Stock</TableHead>
                <TableHead className="text-xs text-right">Vel/mes</TableHead>
                <TableHead className="text-xs text-center">Tendencia</TableHead>
                <TableHead className="text-xs text-right">Días Stock</TableHead>
                <TableHead className="text-xs text-right">Agotam.</TableHead>
                <TableHead className="text-xs text-right">Lead</TableHead>
                <TableHead className="text-xs text-right">Safety</TableHead>
                <TableHead className="text-xs text-right">Min Batch</TableHead>
                <TableHead className="text-xs text-right">Pto. Reorden</TableHead>
                <TableHead className="text-xs text-right">Qty Reorden</TableHead>
                <TableHead className="text-xs"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.sort((a, b) => a.daysOfSupply - b.daysOfSupply).map(p => {
                const editing = editingRows[p.id];
                const isWarning = p.daysOfSupply < p.lead_time_days || p.qty <= p.reorder_point;
                const isCritical = p.arrivalDay < 0 && p.avgMonthly > 0;
                return (
                  <TableRow key={p.id} className={cn(isCritical ? 'bg-destructive/10' : isWarning && 'bg-destructive/5')}>
                    <TableCell className="text-xs font-mono text-muted-foreground">{p.sku}</TableCell>
                    <TableCell className="text-xs font-medium">{p.name}</TableCell>
                    <TableCell className="text-xs text-right font-mono font-bold">{p.qty}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{p.avgMonthly.toFixed(1)}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {trendIcon(p.trendPct)}
                        <span className={cn('text-[10px] font-mono', p.trendPct > 15 ? 'text-success' : p.trendPct < -15 ? 'text-destructive' : 'text-muted-foreground')}>
                          {p.trendPct > 0 ? '+' : ''}{p.trendPct.toFixed(0)}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className={cn('text-xs text-right font-mono', p.daysOfSupply < p.lead_time_days ? 'text-destructive font-bold' : '')}>
                      {p.daysOfSupply >= 999 ? '∞' : `${p.daysOfSupply}d`}
                    </TableCell>
                    <TableCell className={cn('text-xs text-right font-mono', isCritical ? 'text-destructive font-bold' : 'text-muted-foreground')}>
                      {p.daysToStockout >= 999 ? '∞' : `${p.daysToStockout}d`}
                      {isCritical && <span className="text-[8px] block text-destructive">⚠️ -{Math.abs(p.arrivalDay)}d</span>}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-muted-foreground">{p.lead_time_days}d</TableCell>
                    <TableCell className="text-xs text-right font-mono text-muted-foreground">{p.safetyStock}</TableCell>
                    <TableCell className="text-xs text-right font-mono text-muted-foreground">{p.min_order_qty}</TableCell>
                    <TableCell className="text-xs text-right">
                      {editing ? (
                        <Input type="number" className="w-16 h-6 text-xs p-1 text-right" value={editing.reorderPoint}
                          onChange={e => setEditingRows(prev => ({ ...prev, [p.id]: { ...prev[p.id], reorderPoint: Number(e.target.value) } }))} />
                      ) : (
                        <span className="font-mono">{p.reorder_point}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-right">
                      {editing ? (
                        <Input type="number" className="w-16 h-6 text-xs p-1 text-right" value={editing.reorderQty}
                          onChange={e => setEditingRows(prev => ({ ...prev, [p.id]: { ...prev[p.id], reorderQty: Number(e.target.value) } }))} />
                      ) : (
                        <span className="font-mono">{p.reorder_qty}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editing ? (
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => saveEdit(p.id)}><Save className="w-3 h-3" /></Button>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground" onClick={() => cancelEdit(p.id)}>✕</Button>
                        </div>
                      ) : (
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => startEdit(p)}><Settings2 className="w-3 h-3" /></Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
