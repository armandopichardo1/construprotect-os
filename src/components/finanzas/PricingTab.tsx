import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatUSD } from '@/lib/format';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Pencil, TrendingDown, TrendingUp, AlertTriangle, Lock } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type Product = Tables<'products'>;

const categories = ['Protección de Pisos', 'Protección de Superficies', 'Contención de Polvo', 'Cintas', 'Accesorios'];
const DEFAULT_MIN_MARGIN = 5;

function calcRealMargin(cost: number, price: number): number | null {
  if (!price || price === 0) return null;
  return ((price - cost) / price) * 100;
}

function calcPriceFromMargin(cost: number, margin: number): number | null {
  if (margin >= 100 || !cost) return null;
  return cost / (1 - margin / 100);
}

function MarginCell({ cost, price, targetPct, label, minMargin }: { cost: number; price: number; targetPct: number; label: string; minMargin: number }) {
  const real = calcRealMargin(cost, price);
  if (real === null) return <span className="text-muted-foreground">—</span>;
  const belowTarget = real < targetPct;
  const critical = real < minMargin;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center gap-1 font-mono ${critical ? 'text-destructive font-semibold' : belowTarget ? 'text-amber-500' : 'text-emerald-500'}`}>
            {critical ? <AlertTriangle className="w-3 h-3 shrink-0" /> : belowTarget ? <TrendingDown className="w-3 h-3 shrink-0" /> : <TrendingUp className="w-3 h-3 shrink-0 opacity-60" />}
            {real.toFixed(1)}%
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <p className="font-medium">{label}</p>
          <p>Real: {real.toFixed(1)}% — Objetivo: {targetPct.toFixed(1)}%</p>
          {belowTarget && <p className="text-amber-400">⚠ {(targetPct - real).toFixed(1)} pts debajo del objetivo</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

type EditableCellType = 'text' | 'number' | 'currency' | 'margin';

interface EditableCellProps {
  value: string | number | null;
  type: EditableCellType;
  field: string;
  productId: string;
  onSave: (productId: string, field: string, value: string) => Promise<void>;
  className?: string;
  linkedField?: string;
  cost?: number;
  displayValue?: React.ReactNode;
  minMargin?: number;
}

function EditableCell({ value, type, field, productId, onSave, className, linkedField, cost, displayValue, minMargin }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select(); }
  }, [editing]);

  const startEdit = () => { setEditValue(String(value ?? '')); setEditing(true); };
  const cancel = () => setEditing(false);

  const isBelowMin = (() => {
    if (minMargin == null || !editing) return false;
    const num = Number(editValue);
    if (isNaN(num)) return false;
    if (type === 'margin') return num < minMargin;
    if (type === 'currency' && cost && cost > 0) {
      const m = calcRealMargin(cost, num);
      return m !== null && m < minMargin;
    }
    return false;
  })();

  const save = async () => {
    if (editValue === String(value ?? '')) { setEditing(false); return; }
    setSaving(true);
    try {
      if (type === 'margin' && linkedField && cost) {
        const newMargin = Number(editValue);
        const newPrice = calcPriceFromMargin(cost, newMargin);
        if (newPrice !== null) {
          await onSave(productId, field, editValue);
          await onSave(productId, linkedField, newPrice.toFixed(2));
        } else {
          await onSave(productId, field, editValue);
        }
      } else if (type === 'currency' && linkedField && cost) {
        const newPrice = Number(editValue);
        const newMargin = calcRealMargin(cost, newPrice);
        await onSave(productId, field, editValue);
        if (newMargin !== null) await onSave(productId, linkedField, newMargin.toFixed(1));
      } else {
        await onSave(productId, field, editValue);
      }
    } finally { setSaving(false); setEditing(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') cancel();
  };

  if (editing) {
    return (
      <div className="relative">
        <input ref={inputRef} type={type === 'text' ? 'text' : 'number'} step={type === 'margin' ? '0.1' : '0.01'}
          value={editValue} onChange={e => setEditValue(e.target.value)} onKeyDown={handleKeyDown} onBlur={save} disabled={saving}
          className={cn("w-full h-6 px-1.5 text-xs rounded border bg-background text-foreground outline-none focus:ring-1", type !== 'text' && 'text-right font-mono',
            isBelowMin ? 'border-destructive focus:ring-destructive text-destructive' : 'border-primary focus:ring-primary')} />
        {isBelowMin && <span className="absolute -bottom-4 right-0 text-[9px] text-destructive font-medium whitespace-nowrap animate-in fade-in">⚠ Margen &lt; {minMargin}%</span>}
      </div>
    );
  }

  const formattedDisplay = displayValue ?? (type === 'currency' ? formatUSD(Number(value)) : type === 'number' ? String(value ?? '—') : String(value || '—'));
  return (
    <span onClick={startEdit} className={cn("cursor-pointer rounded px-1 -mx-1 py-0.5 transition-colors hover:bg-muted/60 hover:ring-1 hover:ring-border", className)} title="Click para editar">
      {formattedDisplay}
    </span>
  );
}

export function PricingTab() {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const queryClient = useQueryClient();

  const { data: minMargin = DEFAULT_MIN_MARGIN } = useQuery({
    queryKey: ['margin-threshold'],
    queryFn: async () => {
      const { data } = await supabase.from('settings').select('*').eq('key', 'min_margin_threshold').maybeSingle();
      return (data?.value as { value: number })?.value ?? DEFAULT_MIN_MARGIN;
    },
  });

  const { data: targetMargins } = useQuery({
    queryKey: ['target-margins'],
    queryFn: async () => {
      const { data } = await supabase.from('settings').select('*').eq('key', 'target_margins').maybeSingle();
      return (data?.value as { list: number; architect: number; project: number; wholesale: number }) ?? null;
    },
  });
  const defaultList = targetMargins?.list ?? 30;
  const defaultArchitect = targetMargins?.architect ?? 25;
  const defaultProject = targetMargins?.project ?? 20;
  const defaultWholesale = targetMargins?.wholesale ?? 15;

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').eq('is_active', true).order('name');
      if (error) throw error;
      return data;
    },
  });

  const filtered = products.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
    const matchCat = !catFilter || p.category === catFilter;
    return matchSearch && matchCat;
  });

  const handleInlineSave = useCallback(async (productId: string, field: string, value: string) => {
    const numericFields = [
      'price_list_usd', 'price_architect_usd', 'price_project_usd', 'price_wholesale_usd',
      'margin_list_pct', 'margin_architect_pct', 'margin_project_pct', 'margin_wholesale_pct',
    ];
    const payload: Record<string, any> = {};
    if (numericFields.includes(field)) {
      payload[field] = Number(value) || 0;
    } else {
      payload[field] = value.trim() || null;
    }

    const { error } = await supabase.from('products').update(payload as any).eq('id', productId);
    if (error) { toast.error(`Error: ${error.message}`); throw error; }
    queryClient.setQueryData(['products'], (old: Product[] | undefined) =>
      old?.map(p => p.id === productId ? { ...p, ...payload } : p) ?? []
    );
  }, [queryClient]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Input placeholder="Buscar por nombre o SKU..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
        <div className="flex gap-2 overflow-x-auto">
          <button onClick={() => setCatFilter('')}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${!catFilter ? 'bg-primary/15 text-primary border-primary/30' : 'bg-card text-muted-foreground border-border'}`}>
            Todos ({products.length})
          </button>
          {categories.map(c => (
            <button key={c} onClick={() => setCatFilter(c)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${catFilter === c ? 'bg-primary/15 text-primary border-primary/30' : 'bg-card text-muted-foreground border-border'}`}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-sm text-muted-foreground py-12">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-12">No hay productos</div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="text-[10px] text-muted-foreground px-4 py-1.5 bg-muted/30 border-b border-border flex items-center gap-1.5">
            <Pencil className="w-3 h-3" /> Haz click en precios o márgenes para editar · <Lock className="w-3 h-3" /> Costo = promedio ponderado de compras (automático)
          </div>
          <div className="max-h-[calc(100vh-320px)] overflow-auto">
            <Table wrapperClassName="overflow-visible">
              <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                <TableRow>
                  <TableHead className="text-xs">SKU</TableHead>
                  <TableHead className="text-xs">Producto</TableHead>
                  <TableHead className="text-xs text-right">Costo WAC 🔒</TableHead>
                  <TableHead className="text-xs text-right border-l border-border/50">Precio Lista</TableHead>
                  <TableHead className="text-xs text-center">% Lista</TableHead>
                  <TableHead className="text-xs text-right border-l border-border/50">Precio Arq.</TableHead>
                  <TableHead className="text-xs text-center">% Arq.</TableHead>
                  <TableHead className="text-xs text-right border-l border-border/50">Precio Proy.</TableHead>
                  <TableHead className="text-xs text-center">% Proy.</TableHead>
                  <TableHead className="text-xs text-right border-l border-border/50">Precio May.</TableHead>
                  <TableHead className="text-xs text-center">% May.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => {
                  const cost = Number(p.total_unit_cost_usd || p.unit_cost_usd);
                  const tiers = [
                    { priceField: 'price_list_usd', marginField: 'margin_list_pct', priceVal: p.price_list_usd, marginVal: p.margin_list_pct, target: defaultList, label: 'Lista' },
                    { priceField: 'price_architect_usd', marginField: 'margin_architect_pct', priceVal: p.price_architect_usd, marginVal: p.margin_architect_pct, target: defaultArchitect, label: 'Arquitecto' },
                    { priceField: 'price_project_usd', marginField: 'margin_project_pct', priceVal: p.price_project_usd, marginVal: p.margin_project_pct, target: defaultProject, label: 'Proyecto' },
                    { priceField: 'price_wholesale_usd', marginField: 'margin_wholesale_pct', priceVal: p.price_wholesale_usd, marginVal: p.margin_wholesale_pct, target: defaultWholesale, label: 'Mayorista' },
                  ];
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs font-mono text-muted-foreground">{p.sku}</TableCell>
                      <TableCell className="text-xs font-medium max-w-[140px] truncate" title={p.name}>{p.name}</TableCell>
                      <TableCell className="text-xs text-right font-mono">
                        <span className="inline-flex items-center gap-1 text-muted-foreground" title="Calculado automáticamente por recepciones">
                          <Lock className="w-3 h-3 opacity-50" />
                          {formatUSD(cost)}
                        </span>
                      </TableCell>
                      {tiers.map(t => (
                        <>
                          <TableCell key={`${t.priceField}`} className="text-xs text-right font-mono font-medium text-primary border-l border-border/50">
                            <EditableCell value={t.priceVal} type="currency" field={t.priceField} productId={p.id}
                              onSave={handleInlineSave} linkedField={t.marginField} cost={cost}
                              displayValue={formatUSD(Number(t.priceVal))} minMargin={minMargin} />
                          </TableCell>
                          <TableCell key={`${t.marginField}`} className="text-xs text-center">
                            <EditableCell value={Number(t.marginVal)} type="margin" field={t.marginField} productId={p.id}
                              onSave={handleInlineSave} linkedField={t.priceField} cost={cost} minMargin={minMargin}
                              displayValue={<MarginCell cost={cost} price={Number(t.priceVal)} targetPct={Number(t.marginVal || t.target)} label={`Margen ${t.label}`} minMargin={minMargin} />} />
                          </TableCell>
                        </>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
              {(() => {
                const margins = filtered.reduce((acc, p) => {
                  const cost = Number(p.total_unit_cost_usd || p.unit_cost_usd);
                  const tiers = [
                    { price: Number(p.price_list_usd), key: 'list' as const },
                    { price: Number(p.price_architect_usd), key: 'arq' as const },
                    { price: Number(p.price_project_usd), key: 'proy' as const },
                    { price: Number(p.price_wholesale_usd), key: 'may' as const },
                  ];
                  for (const t of tiers) {
                    const m = calcRealMargin(cost, t.price);
                    if (m !== null) { acc[t.key].sum += m; acc[t.key].count++; }
                    acc[`${t.key}Price` as any] = (acc[`${t.key}Price` as any] || 0) + t.price;
                  }
                  acc.costSum += Number(p.unit_cost_usd);
                  return acc;
                }, { list: { sum: 0, count: 0 }, arq: { sum: 0, count: 0 }, proy: { sum: 0, count: 0 }, may: { sum: 0, count: 0 }, costSum: 0, listPrice: 0, arqPrice: 0, proyPrice: 0, mayPrice: 0 } as any);

                const n = filtered.length || 1;
                const formatAvg = (val: number | null) => {
                  if (val === null) return <span className="text-muted-foreground">—</span>;
                  return <span className={`font-mono font-semibold ${val < minMargin ? 'text-destructive' : val < 20 ? 'text-amber-500' : 'text-emerald-500'}`}>{val.toFixed(1)}%</span>;
                };
                const avg = (obj: { sum: number; count: number }) => obj.count ? obj.sum / obj.count : null;

                return (
                  <TableFooter>
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={2} className="text-xs font-semibold text-foreground">Promedio ({filtered.length} productos)</TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold">{formatUSD(margins.costSum / n)}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold text-primary border-l border-border/50">{formatUSD(margins.listPrice / n)}</TableCell>
                      <TableCell className="text-xs text-center">{formatAvg(avg(margins.list))}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold text-primary border-l border-border/50">{formatUSD(margins.arqPrice / n)}</TableCell>
                      <TableCell className="text-xs text-center">{formatAvg(avg(margins.arq))}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold text-primary border-l border-border/50">{formatUSD(margins.proyPrice / n)}</TableCell>
                      <TableCell className="text-xs text-center">{formatAvg(avg(margins.proy))}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold text-primary border-l border-border/50">{formatUSD(margins.mayPrice / n)}</TableCell>
                      <TableCell className="text-xs text-center">{formatAvg(avg(margins.may))}</TableCell>
                    </TableRow>
                  </TableFooter>
                );
              })()}
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
