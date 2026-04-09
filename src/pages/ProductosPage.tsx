import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatUSD } from '@/lib/format';
import { ExcelImportDialog } from '@/components/ExcelImportDialog';

const categories = ['Pisos', 'Revestimientos', 'Mosaicos', 'Accesorios', 'Adhesivos', 'Herramientas'];

export default function ProductosPage() {
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('*').eq('is_active', true).order('name');
      if (error) throw error;
      return data;
    },
  });

  const addMutation = useMutation({
    mutationFn: async (product: any) => {
      const { error } = await supabase.from('products').insert(product);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setDialogOpen(false);
      toast.success('Producto creado');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const filtered = products.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
    const matchCat = !catFilter || p.category === catFilter;
    return matchSearch && matchCat;
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    addMutation.mutate({
      sku: fd.get('sku'),
      name: fd.get('name'),
      brand: fd.get('brand'),
      category: fd.get('category'),
      unit_cost_usd: Number(fd.get('unit_cost_usd')) || 0,
      price_list_usd: Number(fd.get('price_list_usd')) || 0,
      price_architect_usd: Number(fd.get('price_architect_usd')) || 0,
      price_project_usd: Number(fd.get('price_project_usd')) || 0,
      price_wholesale_usd: Number(fd.get('price_wholesale_usd')) || 0,
      reorder_point: Number(fd.get('reorder_point')) || 10,
      coverage_m2: Number(fd.get('coverage_m2')) || null,
    });
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-foreground flex-1">Productos</h1>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)} className="text-xs">📥 Excel</Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">+ Nuevo</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nuevo Producto</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3">
                <Input name="sku" placeholder="SKU *" required />
                <Input name="name" placeholder="Nombre *" required />
                <Input name="brand" placeholder="Marca" />
                <select name="category" className="w-full rounded-lg bg-input border border-border px-3 py-2 text-sm text-foreground">
                  <option value="">Categoría</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <Input name="unit_cost_usd" type="number" step="0.01" placeholder="Costo USD" />
                  <Input name="price_list_usd" type="number" step="0.01" placeholder="Precio Lista" />
                  <Input name="price_architect_usd" type="number" step="0.01" placeholder="Precio Arquitecto" />
                  <Input name="price_project_usd" type="number" step="0.01" placeholder="Precio Proyecto" />
                  <Input name="price_wholesale_usd" type="number" step="0.01" placeholder="Precio Mayoreo" />
                  <Input name="coverage_m2" type="number" step="0.01" placeholder="Cobertura m²" />
                  <Input name="reorder_point" type="number" placeholder="Punto reorden" />
                </div>
                <Button type="submit" className="w-full" disabled={addMutation.isPending}>
                  {addMutation.isPending ? 'Guardando...' : 'Guardar'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
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
                  <div>
                    <p className="text-sm font-medium text-foreground">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground">{p.sku} · {p.brand || '—'} · {p.category || '—'}</p>
                  </div>
                  <p className="text-sm font-bold text-primary">{formatUSD(Number(p.price_list_usd))}</p>
                </div>
                <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground">
                  <span>Costo: {formatUSD(Number(p.unit_cost_usd))}</span>
                  <span>Arq: {formatUSD(Number(p.price_architect_usd))}</span>
                  <span>Proy: {formatUSD(Number(p.price_project_usd))}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
