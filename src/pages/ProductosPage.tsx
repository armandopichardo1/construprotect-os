import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatUSD } from '@/lib/format';
import { ExcelImportDialog } from '@/components/ExcelImportDialog';
import { ProductDialog } from '@/components/ProductDialog';
import { ProductDeleteDialog } from '@/components/ProductDeleteDialog';
import { Pencil, Trash2, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { Tables } from '@/integrations/supabase/types';

type Product = Tables<'products'>;

const categories = ['Protección de Pisos', 'Protección de Superficies', 'Contención de Polvo', 'Cintas', 'Accesorios'];

const DEFAULT_MIN_MARGIN = 5;

function calcRealMargin(cost: number, price: number): number | null {
  if (!price || price === 0) return null;
  return ((price - cost) / price) * 100;
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

export default function ProductosPage() {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const queryClient = useQueryClient();

  const { data: minMargin = DEFAULT_MIN_MARGIN } = useQuery({
    queryKey: ['margin-threshold'],
    queryFn: async () => {
      const { data } = await supabase.from('settings').select('*').eq('key', 'min_margin_threshold').maybeSingle();
      return (data?.value as { value: number })?.value ?? DEFAULT_MIN_MARGIN;
    },
  });

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

  return (
    <AppLayout>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">SKU</TableHead>
                  <TableHead className="text-xs">Nombre</TableHead>
                  <TableHead className="text-xs">Marca</TableHead>
                  <TableHead className="text-xs">Categoría</TableHead>
                  <TableHead className="text-xs text-right">Costo</TableHead>
                  <TableHead className="text-xs text-right">P. Lista</TableHead>
                  <TableHead className="text-xs text-center">M. Lista</TableHead>
                  <TableHead className="text-xs text-center">M. Arq.</TableHead>
                  <TableHead className="text-xs text-center">M. Proy.</TableHead>
                  <TableHead className="text-xs">Dimensiones</TableHead>
                  <TableHead className="text-xs w-[80px]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs font-mono text-muted-foreground">{p.sku}</TableCell>
                    <TableCell className="text-xs font-medium">{p.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.brand || '—'}</TableCell>
                    <TableCell className="text-xs">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{p.category || '—'}</span>
                    </TableCell>
                    <TableCell className="text-xs text-right font-mono">{formatUSD(Number(p.unit_cost_usd))}</TableCell>
                    <TableCell className="text-xs text-right font-mono font-medium text-primary">{formatUSD(Number(p.price_list_usd))}</TableCell>
                    <TableCell className="text-xs text-center">
                      <MarginCell cost={Number(p.total_unit_cost_usd || p.unit_cost_usd)} price={Number(p.price_list_usd)} targetPct={Number(p.margin_list_pct || 30)} label="Margen Lista" minMargin={minMargin} />
                    </TableCell>
                    <TableCell className="text-xs text-center">
                      <MarginCell cost={Number(p.total_unit_cost_usd || p.unit_cost_usd)} price={Number(p.price_architect_usd)} targetPct={Number(p.margin_architect_pct || 25)} label="Margen Arquitecto" minMargin={minMargin} />
                    </TableCell>
                    <TableCell className="text-xs text-center">
                      <MarginCell cost={Number(p.total_unit_cost_usd || p.unit_cost_usd)} price={Number(p.price_project_usd)} targetPct={Number(p.margin_project_pct || 20)} label="Margen Proyecto" minMargin={minMargin} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.dimensions || '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <button
                          onClick={() => { setEditProduct(p); setDialogOpen(true); }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteProduct(p)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {(() => {
                const margins = filtered.reduce((acc, p) => {
                  const cost = Number(p.total_unit_cost_usd || p.unit_cost_usd);
                  const mList = calcRealMargin(cost, Number(p.price_list_usd));
                  const mArq = calcRealMargin(cost, Number(p.price_architect_usd));
                  const mProy = calcRealMargin(cost, Number(p.price_project_usd));
                  if (mList !== null) { acc.list.sum += mList; acc.list.count++; }
                  if (mArq !== null) { acc.arq.sum += mArq; acc.arq.count++; }
                  if (mProy !== null) { acc.proy.sum += mProy; acc.proy.count++; }
                  acc.costSum += Number(p.unit_cost_usd);
                  acc.priceSum += Number(p.price_list_usd);
                  return acc;
                }, { list: { sum: 0, count: 0 }, arq: { sum: 0, count: 0 }, proy: { sum: 0, count: 0 }, costSum: 0, priceSum: 0 });

                const avgList = margins.list.count ? margins.list.sum / margins.list.count : null;
                const avgArq = margins.arq.count ? margins.arq.sum / margins.arq.count : null;
                const avgProy = margins.proy.count ? margins.proy.sum / margins.proy.count : null;

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
      </div>
    </AppLayout>
  );
}
