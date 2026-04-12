import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ExcelImportDialog } from '@/components/ExcelImportDialog';
import { ProductDialog } from '@/components/ProductDialog';
import { ProductDeleteDialog } from '@/components/ProductDeleteDialog';
import { Pencil, Trash2, Box } from 'lucide-react';
import { BulkLogisticsDialog } from '@/components/BulkLogisticsDialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';

type Product = Tables<'products'>;

const categories = ['Protección de Pisos', 'Protección de Superficies', 'Contención de Polvo', 'Cintas', 'Accesorios'];

export function ProductosContent() {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
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
    <div className="space-y-5">
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
          <div className="max-h-[calc(100vh-280px)] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                <TableRow>
                  <TableHead className="text-xs">SKU</TableHead>
                  <TableHead className="text-xs">Nombre</TableHead>
                  <TableHead className="text-xs">Marca</TableHead>
                  <TableHead className="text-xs">Categoría</TableHead>
                  <TableHead className="text-xs">Dimensiones</TableHead>
                  <TableHead className="text-xs text-right">Uds/Caja</TableHead>
                  <TableHead className="text-xs text-right">Lead Time</TableHead>
                  <TableHead className="text-xs w-[60px]"></TableHead>
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
                    <TableCell className="text-xs text-muted-foreground">{p.dimensions || '—'}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{p.units_per_pack || 1}</TableCell>
                    <TableCell className="text-xs text-right font-mono">{p.lead_time_days || 21}d</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        <button onClick={() => { setEditProduct(p); setDialogOpen(true); }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10" title="Editar producto">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteProduct(p)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="Eliminar producto">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <ExcelImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <ProductDialog open={dialogOpen} onOpenChange={v => { setDialogOpen(v); if (!v) setEditProduct(null); }} product={editProduct} onSuccess={refresh} />
      <ProductDeleteDialog open={!!deleteProduct} onOpenChange={v => { if (!v) setDeleteProduct(null); }} product={deleteProduct} onSuccess={refresh} />
      <BulkLogisticsDialog open={bulkOpen} onOpenChange={setBulkOpen} products={products} onSuccess={refresh} />
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
