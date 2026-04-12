import { useState, useRef, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatUSD } from '@/lib/format';
import { ExcelImportDialog } from '@/components/ExcelImportDialog';
import { ProductDialog } from '@/components/ProductDialog';
import { ProductDeleteDialog } from '@/components/ProductDeleteDialog';
import { Pencil, Trash2, TrendingDown, TrendingUp, AlertTriangle, Box, Check, X } from 'lucide-react';
import { BulkLogisticsDialog } from '@/components/BulkLogisticsDialog';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
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
          <span className={`inline-flex items-center gap-1 font-mono ${
            critical ? 'text-destructive font-semibold' : belowTarget ? 'text-amber-500' : 'text-emerald-500'
          }`}>
            {critical ? (
              <AlertTriangle className="w-3 h-3 shrink-0" />
            ) : belowTarget ? (
              <TrendingDown className="w-3 h-3 shrink-0" />
            ) : (
              <TrendingUp className="w-3 h-3 shrink-0 opacity-60" />
            )}
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

// ──────────── Inline Editable Cell ────────────

type EditableCellType = 'text' | 'number' | 'currency' | 'margin';

interface EditableCellProps {
  value: string | number | null;
  type: EditableCellType;
  field: string;
  productId: string;
  onSave: (productId: string, field: string, value: string) => Promise<void>;
  className?: string;
  // For margin cells: linked price/cost fields
  linkedField?: string;
  cost?: number;
  displayValue?: React.ReactNode;
}

function EditableCell({ value, type, field, productId, onSave, className, linkedField, cost, displayValue }: EditableCellProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEdit = () => {
    setEditValue(String(value ?? ''));
    setEditing(true);
  };

  const cancel = () => setEditing(false);

  const save = async () => {
    if (editValue === String(value ?? '')) { setEditing(false); return; }
    setSaving(true);
    try {
      if (type === 'margin' && linkedField && cost) {
        // When editing a margin, also update the linked price
        const newMargin = Number(editValue);
        const newPrice = calcPriceFromMargin(cost, newMargin);
        if (newPrice !== null) {
          await onSave(productId, field, editValue);
          await onSave(productId, linkedField, newPrice.toFixed(2));
        } else {
          await onSave(productId, field, editValue);
        }
      } else if (type === 'currency' && linkedField && cost) {
        // When editing a price, also update the linked margin
        const newPrice = Number(editValue);
        const newMargin = calcRealMargin(cost, newPrice);
        await onSave(productId, field, editValue);
        if (newMargin !== null) {
          await onSave(productId, linkedField, newMargin.toFixed(1));
        }
      } else {
        await onSave(productId, field, editValue);
      }
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') cancel();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-0.5">
        <input
          ref={inputRef}
          type={type === 'text' ? 'text' : 'number'}
          step={type === 'margin' ? '0.1' : '0.01'}
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={save}
          disabled={saving}
          className={cn(
            "w-full h-6 px-1.5 text-xs rounded border border-primary bg-background text-foreground outline-none focus:ring-1 focus:ring-primary",
            type !== 'text' && 'text-right font-mono'
          )}
        />
      </div>
    );
  }

  const formattedDisplay = displayValue ?? (
    type === 'currency' ? formatUSD(Number(value)) :
    type === 'number' ? String(value ?? '—') :
    String(value || '—')
  );

  return (
    <span
      onClick={startEdit}
      className={cn(
        "cursor-pointer rounded px-1 -mx-1 py-0.5 transition-colors hover:bg-muted/60 hover:ring-1 hover:ring-border",
        className
      )}
      title="Click para editar"
    >
      {formattedDisplay}
    </span>
  );
}

// ──────────── Main Component ────────────

export function ProductosContent() {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
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

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['products'] });

  const handleInlineSave = useCallback(async (productId: string, field: string, value: string) => {
    const numericFields = [
      'unit_cost_usd', 'price_list_usd', 'price_architect_usd', 'price_project_usd', 'price_wholesale_usd',
      'margin_list_pct', 'margin_architect_pct', 'margin_project_pct', 'margin_wholesale_pct',
    ];
    const payload: Record<string, any> = {};

    if (numericFields.includes(field)) {
      payload[field] = Number(value) || 0;
    } else {
      payload[field] = value.trim() || null;
    }

    // If cost changed, recalculate all margins
    if (field === 'unit_cost_usd') {
      const product = products.find(p => p.id === productId);
      if (product) {
        const newCost = Number(value) || 0;
        const prices = [
          { price: Number(product.price_list_usd), marginField: 'margin_list_pct' },
          { price: Number(product.price_architect_usd), marginField: 'margin_architect_pct' },
          { price: Number(product.price_project_usd), marginField: 'margin_project_pct' },
          { price: Number(product.price_wholesale_usd), marginField: 'margin_wholesale_pct' },
        ];
        for (const { price, marginField } of prices) {
          if (price > 0) {
            const m = calcRealMargin(newCost, price);
            if (m !== null) payload[marginField] = Number(m.toFixed(1));
          }
        }
      }
    }

    const { error } = await supabase.from('products').update(payload).eq('id', productId);
    if (error) {
      toast.error(`Error: ${error.message}`);
      throw error;
    }
    // Optimistic: update cache
    queryClient.setQueryData(['products'], (old: Product[] | undefined) =>
      old?.map(p => p.id === productId ? { ...p, ...payload } : p) ?? []
    );
  }, [products, queryClient]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
          <Input
            placeholder="Buscar por nombre o SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <div className="flex gap-2 overflow-x-auto">
            <button
              onClick={() => setCatFilter('')}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${!catFilter ? 'bg-primary/15 text-primary border-primary/30' : 'bg-card text-muted-foreground border-border'}`}
            >
              Todos ({products.length})
            </button>
            {categories.map(c => (
              <button
                key={c}
                onClick={() => setCatFilter(c)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${catFilter === c ? 'bg-primary/15 text-primary border-primary/30' : 'bg-card text-muted-foreground border-border'}`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)} className="gap-1.5">
              <Box className="w-3.5 h-3.5" /> CBM & Peso
            </Button>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>📥 Importar Excel</Button>
            <Button size="sm" onClick={() => { setEditProduct(null); setDialogOpen(true); }}>+ Nuevo Producto</Button>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center text-sm text-muted-foreground py-12">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-12">No hay productos</div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="text-[10px] text-muted-foreground px-4 py-1.5 bg-muted/30 border-b border-border flex items-center gap-1.5">
              <Pencil className="w-3 h-3" /> Haz click en cualquier celda para editar directamente
            </div>
            <Table>
              <TableHeader>
                 <TableRow>
                   <TableHead className="text-xs">SKU</TableHead>
                   <TableHead className="text-xs">Nombre</TableHead>
                   <TableHead className="text-xs">Marca</TableHead>
                   <TableHead className="text-xs">Categoría</TableHead>
                   <TableHead className="text-xs text-right">Costo Unitario</TableHead>
                   <TableHead className="text-xs text-right">Precio Lista</TableHead>
                   <TableHead className="text-xs text-center">Margen Lista</TableHead>
                   <TableHead className="text-xs text-center">Margen Arquitecto</TableHead>
                   <TableHead className="text-xs text-center">Margen Proyecto</TableHead>
                   <TableHead className="text-xs text-right">Precio Mayorista</TableHead>
                   <TableHead className="text-xs text-center">Margen Mayorista</TableHead>
                   <TableHead className="text-xs">Dimensiones</TableHead>
                   <TableHead className="text-xs w-[60px]"></TableHead>
                 </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => {
                  const cost = Number(p.total_unit_cost_usd || p.unit_cost_usd);
                  return (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      <EditableCell value={p.sku} type="text" field="sku" productId={p.id} onSave={handleInlineSave} />
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                      <EditableCell value={p.name} type="text" field="name" productId={p.id} onSave={handleInlineSave} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <EditableCell value={p.brand} type="text" field="brand" productId={p.id} onSave={handleInlineSave} />
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{p.category || '—'}</span>
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      <EditableCell
                        value={p.unit_cost_usd}
                        type="currency"
                        field="unit_cost_usd"
                        productId={p.id}
                        onSave={handleInlineSave}
                        displayValue={formatUSD(Number(p.unit_cost_usd))}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono font-medium text-primary">
                      <EditableCell
                        value={p.price_list_usd}
                        type="currency"
                        field="price_list_usd"
                        productId={p.id}
                        onSave={handleInlineSave}
                        linkedField="margin_list_pct"
                        cost={cost}
                        displayValue={formatUSD(Number(p.price_list_usd))}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-center">
                      <EditableCell
                        value={Number(p.margin_list_pct)}
                        type="margin"
                        field="margin_list_pct"
                        productId={p.id}
                        onSave={handleInlineSave}
                        linkedField="price_list_usd"
                        cost={cost}
                        displayValue={
                          <MarginCell cost={cost} price={Number(p.price_list_usd)} targetPct={Number(p.margin_list_pct || defaultList)} label="Margen Lista" minMargin={minMargin} />
                        }
                      />
                    </TableCell>
                    <TableCell className="text-xs text-center">
                      <EditableCell
                        value={Number(p.margin_architect_pct)}
                        type="margin"
                        field="margin_architect_pct"
                        productId={p.id}
                        onSave={handleInlineSave}
                        linkedField="price_architect_usd"
                        cost={cost}
                        displayValue={
                          <MarginCell cost={cost} price={Number(p.price_architect_usd)} targetPct={Number(p.margin_architect_pct || defaultArchitect)} label="Margen Arquitecto" minMargin={minMargin} />
                        }
                      />
                    </TableCell>
                    <TableCell className="text-xs text-center">
                      <EditableCell
                        value={Number(p.margin_project_pct)}
                        type="margin"
                        field="margin_project_pct"
                        productId={p.id}
                        onSave={handleInlineSave}
                        linkedField="price_project_usd"
                        cost={cost}
                        displayValue={
                          <MarginCell cost={cost} price={Number(p.price_project_usd)} targetPct={Number(p.margin_project_pct || defaultProject)} label="Margen Proyecto" minMargin={minMargin} />
                        }
                      />
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">
                      <EditableCell
                        value={p.price_wholesale_usd}
                        type="currency"
                        field="price_wholesale_usd"
                        productId={p.id}
                        onSave={handleInlineSave}
                        linkedField="margin_wholesale_pct"
                        cost={cost}
                        displayValue={formatUSD(Number(p.price_wholesale_usd))}
                      />
                    </TableCell>
                    <TableCell className="text-xs text-center">
                      <EditableCell
                        value={Number(p.margin_wholesale_pct)}
                        type="margin"
                        field="margin_wholesale_pct"
                        productId={p.id}
                        onSave={handleInlineSave}
                        linkedField="price_wholesale_usd"
                        cost={cost}
                        displayValue={
                          <MarginCell cost={cost} price={Number(p.price_wholesale_usd)} targetPct={Number(p.margin_wholesale_pct || defaultWholesale)} label="Margen Mayorista" minMargin={minMargin} />
                        }
                      />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <EditableCell value={p.dimensions} type="text" field="dimensions" productId={p.id} onSave={handleInlineSave} />
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => setDeleteProduct(p)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                  );
                })}
              </TableBody>
              {(() => {
                const margins = filtered.reduce((acc, p) => {
                  const cost = Number(p.total_unit_cost_usd || p.unit_cost_usd);
                  const mList = calcRealMargin(cost, Number(p.price_list_usd));
                  const mArq = calcRealMargin(cost, Number(p.price_architect_usd));
                  const mProy = calcRealMargin(cost, Number(p.price_project_usd));
                  const mMay = calcRealMargin(cost, Number(p.price_wholesale_usd));
                  if (mList !== null) { acc.list.sum += mList; acc.list.count++; }
                  if (mArq !== null) { acc.arq.sum += mArq; acc.arq.count++; }
                  if (mProy !== null) { acc.proy.sum += mProy; acc.proy.count++; }
                  if (mMay !== null) { acc.may.sum += mMay; acc.may.count++; }
                  acc.costSum += Number(p.unit_cost_usd);
                  acc.priceSum += Number(p.price_list_usd);
                  acc.wholesaleSum += Number(p.price_wholesale_usd);
                  return acc;
                }, { list: { sum: 0, count: 0 }, arq: { sum: 0, count: 0 }, proy: { sum: 0, count: 0 }, may: { sum: 0, count: 0 }, costSum: 0, priceSum: 0, wholesaleSum: 0 });

                const avgList = margins.list.count ? margins.list.sum / margins.list.count : null;
                const avgArq = margins.arq.count ? margins.arq.sum / margins.arq.count : null;
                const avgProy = margins.proy.count ? margins.proy.sum / margins.proy.count : null;
                const avgMay = margins.may.count ? margins.may.sum / margins.may.count : null;

                const formatAvg = (val: number | null) => {
                  if (val === null) return <span className="text-muted-foreground">—</span>;
                  return (
                    <span className={`font-mono font-semibold ${val < minMargin ? 'text-destructive' : val < 20 ? 'text-amber-500' : 'text-emerald-500'}`}>
                      {val.toFixed(1)}%
                    </span>
                  );
                };

                return (
                  <TableFooter>
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={4} className="text-xs font-semibold text-foreground">
                        Resumen ({filtered.length} productos{catFilter ? ` · ${catFilter}` : ''})
                      </TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold">{formatUSD(margins.costSum / (filtered.length || 1))}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold text-primary">{formatUSD(margins.priceSum / (filtered.length || 1))}</TableCell>
                      <TableCell className="text-xs text-center">{formatAvg(avgList)}</TableCell>
                      <TableCell className="text-xs text-center">{formatAvg(avgArq)}</TableCell>
                      <TableCell className="text-xs text-center">{formatAvg(avgProy)}</TableCell>
                      <TableCell className="text-xs text-right font-mono font-semibold">{formatUSD(margins.wholesaleSum / (filtered.length || 1))}</TableCell>
                      <TableCell className="text-xs text-center">{formatAvg(avgMay)}</TableCell>
                      <TableCell colSpan={2} className="text-xs text-muted-foreground">Promedios</TableCell>
                    </TableRow>
                  </TableFooter>
                );
              })()}
            </Table>
          </div>
        )}

        <ExcelImportDialog open={importOpen} onOpenChange={setImportOpen} />
        <ProductDialog
          open={dialogOpen}
          onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditProduct(null); }}
          product={editProduct}
          onSuccess={refresh}
        />
        <ProductDeleteDialog
          open={!!deleteProduct}
          onOpenChange={(v) => { if (!v) setDeleteProduct(null); }}
          product={deleteProduct}
          onSuccess={refresh}
        />
        <BulkLogisticsDialog
          open={bulkOpen}
          onOpenChange={setBulkOpen}
          products={products}
          onSuccess={refresh}
        />
    </div>
  );
}

export default function ProductosPage() {
  return (
    <AppLayout>
      <ProductosContent />
    </AppLayout>
  );
}
