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
import { Pencil, Trash2 } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type Product = Tables<'products'>;

const categories = ['Pisos', 'Revestimientos', 'Mosaicos', 'Accesorios', 'Adhesivos', 'Herramientas'];

export default function ProductosPage() {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const queryClient = useQueryClient();

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
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-foreground flex-1">Productos</h1>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="text-xs">📥 Excel</Button>
          <Button size="sm" onClick={() => { setEditProduct(null); setDialogOpen(true); }}>+ Nuevo</Button>
        </div>

        <Input
          placeholder="Buscar por nombre o SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setCatFilter('')}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${!catFilter ? 'bg-primary/15 text-primary border-primary/30' : 'bg-card text-muted-foreground border-border'}`}
          >
            Todos
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

        {isLoading ? (
          <div className="text-center text-sm text-muted-foreground py-8">Cargando...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">No hay productos</div>
        ) : (
          <div className="space-y-2">
            {filtered.map(p => (
              <div key={p.id} className="rounded-xl bg-card border border-border p-3">
                <div className="flex justify-between items-start">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground">{p.sku} · {p.brand || '—'} · {p.category || '—'}</p>
                  </div>
                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    <p className="text-sm font-bold text-primary mr-1">{formatUSD(Number(p.price_list_usd))}</p>
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
                </div>
                <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground">
                  <span>Costo: {formatUSD(Number(p.unit_cost_usd))}</span>
                  <span>Arq: {formatUSD(Number(p.price_architect_usd))}</span>
                  <span>Proy: {formatUSD(Number(p.price_project_usd))}</span>
                  {p.dimensions && <span>📐 {p.dimensions}</span>}
                </div>
              </div>
            ))}
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
