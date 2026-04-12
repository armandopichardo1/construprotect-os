import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { exportToExcel } from '@/lib/export-utils';
import { Download, FileBarChart, TrendingUp, TrendingDown, Package, Search } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, AreaChart, Area, CartesianGrid, Legend, Line, ReferenceLine } from 'recharts';

const TYPE_MAP: Record<string, { label: string; icon: string; color: string }> = {
  receipt: { label: 'Entrada', icon: '📥', color: '#3b82f6' },
  sale: { label: 'Venta', icon: '💰', color: '#10b981' },
  adjustment: { label: 'Ajuste', icon: '📋', color: '#f59e0b' },
  sample: { label: 'Muestra', icon: '🧱', color: '#8b5cf6' },
  return: { label: 'Devolución', icon: '🔄', color: '#06b6d4' },
  damage: { label: 'Daño', icon: '💥', color: '#ef4444' },
};

const PERIOD_OPTIONS = [
  { value: '7', label: 'Últimos 7 días' },
  { value: '30', label: 'Últimos 30 días' },
  { value: '90', label: 'Últimos 90 días' },
  { value: '365', label: 'Último año' },
  { value: 'custom', label: 'Personalizado' },
];

export function MovimientosReportTab() {
  const [period, setPeriod] = useState('30');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [search, setSearch] = useState('');
  const [filterProduct, setFilterProduct] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');

  const dateRange = useMemo(() => {
    if (period === 'custom' && dateFrom && dateTo) {
      return { from: dateFrom, to: dateTo };
    }
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - Number(period || 30));
    return { from: from.toISOString().split('T')[0], to: now.toISOString().split('T')[0] };
  }, [period, dateFrom, dateTo]);

  const { data: rawMovements = [] } = useQuery({
    queryKey: ['inventory-movements-report', dateRange.from, dateRange.to],
    queryFn: async () => {
      const { data } = await supabase
        .from('inventory_movements')
        .select('*, products(name, sku, category)')
        .gte('created_at', `${dateRange.from}T00:00:00`)
        .lte('created_at', `${dateRange.to}T23:59:59`)
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  // Extract unique categories and products for filter dropdowns
  const { categories, products: productOptions } = useMemo(() => {
    const catSet = new Set<string>();
    const prodMap = new Map<string, string>();
    rawMovements.forEach((m: any) => {
      if (m.products?.category) catSet.add(m.products.category);
      if (m.product_id && m.products?.name) prodMap.set(m.product_id, `${m.products.sku} — ${m.products.name}`);
    });
    return {
      categories: Array.from(catSet).sort(),
      products: Array.from(prodMap.entries()).map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label)),
    };
  }, [rawMovements]);

  // Apply product/category filters
  const movements = useMemo(() => {
    let filtered = rawMovements;
    if (filterCategory !== 'all') {
      filtered = filtered.filter((m: any) => m.products?.category === filterCategory);
    }
    if (filterProduct !== 'all') {
      filtered = filtered.filter((m: any) => m.product_id === filterProduct);
    }
    return filtered;
  }, [rawMovements, filterCategory, filterProduct]);

  // === Totals by type ===
  const typeSummary = useMemo(() => {
    const map: Record<string, { count: number; totalQty: number; totalValue: number }> = {};
    movements.forEach((m: any) => {
      const t = m.movement_type;
      if (!map[t]) map[t] = { count: 0, totalQty: 0, totalValue: 0 };
      map[t].count++;
      map[t].totalQty += m.quantity;
      map[t].totalValue += Math.abs(m.quantity) * (Number(m.unit_cost_usd) || 0);
    });
    return Object.entries(map).map(([type, data]) => ({
      type,
      ...TYPE_MAP[type] || { label: type, icon: '📦', color: '#6b7280' },
      ...data,
    })).sort((a, b) => b.count - a.count);
  }, [movements]);

  // === Top products by movement volume ===
  const topProducts = useMemo(() => {
    const map: Record<string, { sku: string; name: string; totalIn: number; totalOut: number; totalValue: number; count: number }> = {};
    movements.forEach((m: any) => {
      const pid = m.product_id;
      if (!map[pid]) map[pid] = { sku: m.products?.sku || '', name: m.products?.name || '', totalIn: 0, totalOut: 0, totalValue: 0, count: 0 };
      map[pid].count++;
      if (m.quantity > 0) map[pid].totalIn += m.quantity;
      else map[pid].totalOut += Math.abs(m.quantity);
      map[pid].totalValue += Math.abs(m.quantity) * (Number(m.unit_cost_usd) || 0);
    });
    return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 15);
  }, [movements]);

  // Chart data
  const chartData = useMemo(() => typeSummary.map(s => ({
    name: s.label,
    count: s.count,
    value: s.totalValue,
    fill: s.color,
  })), [typeSummary]);

  // Daily trend data
  const dailyTrend = useMemo(() => {
    const map: Record<string, { date: string; entries: number; exits: number; net: number }> = {};
    movements.forEach((m: any) => {
      const day = new Date(m.created_at).toISOString().split('T')[0];
      if (!map[day]) map[day] = { date: day, entries: 0, exits: 0, net: 0 };
      if (m.quantity > 0) map[day].entries += m.quantity;
      else map[day].exits += Math.abs(m.quantity);
    });
    return Object.values(map)
      .map(d => ({ ...d, net: d.entries - d.exits }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [movements]);

  // Grand totals
  const totals = useMemo(() => {
    let entries = 0, exits = 0, totalValue = 0, netValue = 0;
    movements.forEach((m: any) => {
      const cost = Number(m.unit_cost_usd) || 0;
      if (m.quantity > 0) entries += m.quantity;
      else exits += Math.abs(m.quantity);
      totalValue += Math.abs(m.quantity) * cost;
      netValue += m.quantity * cost;
    });
    return { movements: movements.length, entries, exits, totalValue, netQty: entries - exits, netValue };
  }, [movements]);

  // Filtered detail
  const filteredMovements = useMemo(() => {
    if (!search) return movements;
    const q = search.toLowerCase();
    return movements.filter((m: any) =>
      m.products?.sku?.toLowerCase().includes(q) ||
      m.products?.name?.toLowerCase().includes(q) ||
      m.notes?.toLowerCase().includes(q)
    );
  }, [movements, search]);

  // === Export ===
  const handleExport = () => {
    if (movements.length === 0) return;

    const detailData = movements.map((m: any) => ({
      Fecha: new Date(m.created_at).toLocaleDateString('es-DO'),
      Tipo: TYPE_MAP[m.movement_type]?.label || m.movement_type,
      SKU: m.products?.sku || '',
      Producto: m.products?.name || '',
      Categoría: m.products?.category || '',
      Cantidad: m.quantity,
      'Costo Unit. USD': Number(m.unit_cost_usd) || 0,
      'Valor Total USD': Math.abs(m.quantity) * (Number(m.unit_cost_usd) || 0),
      Notas: m.notes || '',
    }));

    const summaryData = typeSummary.map(s => ({
      Tipo: s.label,
      Movimientos: s.count,
      'Cantidad Neta': s.totalQty,
      'Valor Total USD': Number(s.totalValue.toFixed(2)),
    }));

    const topData = topProducts.map(p => ({
      SKU: p.sku,
      Producto: p.name,
      Movimientos: p.count,
      Entradas: p.totalIn,
      Salidas: p.totalOut,
      'Valor Total USD': Number(p.totalValue.toFixed(2)),
    }));

    // Multi-sheet export
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.json_to_sheet(summaryData);
    ws1['!cols'] = [{ wch: 15 }, { wch: 14 }, { wch: 16 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Resumen por Tipo');

    const ws2 = XLSX.utils.json_to_sheet(topData);
    ws2['!cols'] = [{ wch: 14 }, { wch: 40 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Top Productos');

    const ws3 = XLSX.utils.json_to_sheet(detailData);
    ws3['!cols'] = [{ wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 40 }, { wch: 20 }, { wch: 10 }, { wch: 16 }, { wch: 18 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Detalle Movimientos');

    const fromLabel = dateRange.from.replace(/-/g, '');
    const toLabel = dateRange.to.replace(/-/g, '');
    XLSX.writeFile(wb, `Reporte_Movimientos_${fromLabel}_${toLabel}.xlsx`);
  };

  const tooltipStyle = { background: 'hsl(222,20%,10%)', border: '1px solid hsl(222,20%,20%)', borderRadius: 8, fontSize: 12 };

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex items-end gap-3 flex-wrap">
        <div>
          <Label className="text-xs text-muted-foreground">Período</Label>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="mt-1 w-[180px] h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {period === 'custom' && (
          <>
            <div>
              <Label className="text-xs text-muted-foreground">Desde</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="mt-1 h-9 text-xs w-[150px]" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Hasta</Label>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="mt-1 h-9 text-xs w-[150px]" />
            </div>
          </>
        )}
        <div>
          <Label className="text-xs text-muted-foreground">Categoría</Label>
          <Select value={filterCategory} onValueChange={v => { setFilterCategory(v); setFilterProduct('all'); }}>
            <SelectTrigger className="mt-1 w-[180px] h-9 text-xs"><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todas las categorías</SelectItem>
              {categories.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Producto</Label>
          <Select value={filterProduct} onValueChange={setFilterProduct}>
            <SelectTrigger className="mt-1 w-[220px] h-9 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">Todos los productos</SelectItem>
              {productOptions
                .filter(p => filterCategory === 'all' || rawMovements.some((m: any) => m.product_id === p.id && m.products?.category === filterCategory))
                .map(p => <SelectItem key={p.id} value={p.id} className="text-xs truncate">{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant="outline" onClick={handleExport} disabled={movements.length === 0} className="h-9">
          <Download className="w-3.5 h-3.5 mr-1" /> Exportar Excel
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiMini icon={<FileBarChart className="w-4 h-4" />} label="Movimientos" value={totals.movements} color="text-primary" />
        <KpiMini icon={<TrendingUp className="w-4 h-4" />} label="Entradas (uds)" value={`+${totals.entries}`} color="text-success" />
        <KpiMini icon={<TrendingDown className="w-4 h-4" />} label="Salidas (uds)" value={`-${totals.exits}`} color="text-destructive" />
        <KpiMini icon={<Package className="w-4 h-4" />} label="Neto Acumulado" value={`${totals.netQty >= 0 ? '+' : ''}${totals.netQty} uds · ${formatUSD(totals.netValue)}`} color={totals.netQty >= 0 ? 'text-success' : 'text-destructive'} />
        <KpiMini icon={<Package className="w-4 h-4" />} label="Valor Total" value={formatUSD(totals.totalValue)} color="text-warning" />
      </div>

      {/* Charts + Summary */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Bar chart */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Movimientos por Tipo</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(222,10%,55%)' }} />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 10, fill: 'hsl(222,10%,55%)' }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, 'Cantidad']} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {chartData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-8">Sin datos en este período</p>
          )}
        </div>

        {/* Summary table */}
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Resumen por Tipo</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Tipo</TableHead>
                <TableHead className="text-xs text-center">Movimientos</TableHead>
                <TableHead className="text-xs text-center">Cant. Neta</TableHead>
                <TableHead className="text-xs text-right">Valor USD</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {typeSummary.map(s => (
                <TableRow key={s.type}>
                  <TableCell className="text-xs"><Badge variant="secondary" className="text-[10px]">{s.icon} {s.label}</Badge></TableCell>
                  <TableCell className="text-xs text-center font-mono">{s.count}</TableCell>
                  <TableCell className={cn('text-xs text-center font-mono font-bold', s.totalQty > 0 ? 'text-success' : s.totalQty < 0 ? 'text-destructive' : '')}>
                    {s.totalQty > 0 ? '+' : ''}{s.totalQty}
                  </TableCell>
                  <TableCell className="text-xs text-right font-mono">{formatUSD(s.totalValue)}</TableCell>
                </TableRow>
              ))}
              {typeSummary.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground py-4">Sin datos</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Daily Trend Chart */}
      {dailyTrend.length > 1 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Tendencia Diaria — Entradas vs Salidas</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={dailyTrend}>
              <defs>
                <linearGradient id="gradIn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradOut" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(222,20%,18%)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: 'hsl(222,10%,55%)' }}
                tickFormatter={(v: string) => {
                  const d = new Date(v + 'T12:00:00');
                  return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' });
                }}
              />
              <YAxis tick={{ fontSize: 10, fill: 'hsl(222,10%,55%)' }} />
              <Tooltip
                contentStyle={{ background: 'hsl(222,20%,10%)', border: '1px solid hsl(222,20%,20%)', borderRadius: 8, fontSize: 12 }}
                labelFormatter={(v: string) => new Date(v + 'T12:00:00').toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' })}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="entries" name="Entradas" stroke="#10b981" fill="url(#gradIn)" strokeWidth={2} />
              <Area type="monotone" dataKey="exits" name="Salidas" stroke="#ef4444" fill="url(#gradOut)" strokeWidth={2} />
              <Line type="monotone" dataKey="net" name="Neto" stroke="hsl(217, 91%, 60%)" strokeWidth={2.5} dot={{ r: 3, fill: 'hsl(217, 91%, 60%)' }} strokeDasharray="none" />
              <ReferenceLine y={0} stroke="hsl(222, 10%, 35%)" strokeDasharray="4 4" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {topProducts.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Productos con Mayor Movimiento</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">SKU</TableHead>
                <TableHead className="text-xs">Producto</TableHead>
                <TableHead className="text-xs text-center">Movs.</TableHead>
                <TableHead className="text-xs text-center text-success">Entradas</TableHead>
                <TableHead className="text-xs text-center text-destructive">Salidas</TableHead>
                <TableHead className="text-xs text-right">Valor USD</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topProducts.map(p => (
                <TableRow key={p.sku}>
                  <TableCell className="text-xs font-mono text-muted-foreground">{p.sku}</TableCell>
                  <TableCell className="text-xs font-medium truncate max-w-[250px]">{p.name}</TableCell>
                  <TableCell className="text-xs text-center font-mono">{p.count}</TableCell>
                  <TableCell className="text-xs text-center font-mono text-success">+{p.totalIn}</TableCell>
                  <TableCell className="text-xs text-center font-mono text-destructive">-{p.totalOut}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{formatUSD(p.totalValue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Detail table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-3 border-b border-border flex items-center gap-3">
          <h3 className="text-sm font-semibold">Detalle de Movimientos</h3>
          <div className="relative flex-1 max-w-[250px]">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar SKU, producto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <span className="text-xs text-muted-foreground">{filteredMovements.length} registros</span>
        </div>
        <div className="max-h-[400px] overflow-auto">
          <Table wrapperClassName="overflow-visible">
            <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
              <TableRow>
                <TableHead className="text-xs">Fecha</TableHead>
                <TableHead className="text-xs">Tipo</TableHead>
                <TableHead className="text-xs">SKU</TableHead>
                <TableHead className="text-xs">Producto</TableHead>
                <TableHead className="text-xs text-right">Cantidad</TableHead>
                <TableHead className="text-xs text-right">Costo Unit.</TableHead>
                <TableHead className="text-xs text-right">Valor</TableHead>
                <TableHead className="text-xs">Notas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMovements.map((m: any) => {
                const typeInfo = TYPE_MAP[m.movement_type] || { label: m.movement_type, icon: '📦' };
                const value = Math.abs(m.quantity) * (Number(m.unit_cost_usd) || 0);
                return (
                  <TableRow key={m.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(m.created_at).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{typeInfo.icon} {typeInfo.label}</span>
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">{m.products?.sku || '—'}</TableCell>
                    <TableCell className="text-xs font-medium truncate max-w-[200px]">{m.products?.name || '—'}</TableCell>
                    <TableCell className={cn('text-xs text-right font-mono font-bold', m.quantity > 0 ? 'text-success' : 'text-destructive')}>
                      {m.quantity > 0 ? '+' : ''}{m.quantity}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-muted-foreground">
                      {m.unit_cost_usd ? formatUSD(Number(m.unit_cost_usd)) : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono text-muted-foreground">
                      {value > 0 ? formatUSD(value) : '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">{m.notes || '—'}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filteredMovements.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">Sin movimientos en este período</p>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiMini({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
      <div className={cn('p-2 rounded-lg bg-muted', color)}>{icon}</div>
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </div>
    </div>
  );
}
