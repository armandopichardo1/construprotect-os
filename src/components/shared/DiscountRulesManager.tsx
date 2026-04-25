import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, Download, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { exportToExcel } from '@/lib/export-utils';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';

export function DiscountRulesManager() {
  const queryClient = useQueryClient();
  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['maestras-discount-rules'],
    queryFn: async () => {
      const { data } = await supabase.from('discount_rules').select('*').order('priority', { ascending: false });
      return data || [];
    },
  });
  const { data: contacts = [] } = useQuery({
    queryKey: ['maestras-contacts-for-rules'],
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('id, contact_name, company_name').eq('is_active', true).order('contact_name');
      return data || [];
    },
  });
  const { data: products = [] } = useQuery({
    queryKey: ['maestras-products-categories'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('category').not('category', 'is', null);
      return data || [];
    },
  });
  const categories = useMemo(() => Array.from(new Set(products.map((p: any) => p.category).filter(Boolean))).sort() as string[], [products]);

  const enriched = useMemo(() => rules.map((r: any) => ({
    ...r,
    contact_name: contacts.find((c: any) => c.id === r.contact_id)?.contact_name || (r.contact_id ? '—' : 'Todos'),
  })), [rules, contacts]);

  // Build conflict map: same (contact_id|category) scope among ACTIVE rules
  const scopeKey = (r: any) => `${r.contact_id || 'ALL'}::${r.category || 'ALL'}`;
  const conflictGroups = useMemo(() => {
    const groups: Record<string, any[]> = {};
    rules.filter((r: any) => r.is_active).forEach((r: any) => {
      const k = scopeKey(r);
      (groups[k] = groups[k] || []).push(r);
    });
    return Object.fromEntries(Object.entries(groups).filter(([, v]) => v.length > 1));
  }, [rules]);
  const conflictIds = useMemo(() => new Set(Object.values(conflictGroups).flat().map((r: any) => r.id)), [conflictGroups]);
  const conflictCount = Object.keys(conflictGroups).length;

  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search.trim()) return enriched;
    const q = search.toLowerCase();
    return enriched.filter((r: any) =>
      ['name', 'contact_name', 'category', 'notes'].some(k => String(r[k] || '').toLowerCase().includes(q))
    );
  }, [enriched, search]);

  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);

  const handleSave = async (form: any) => {
    if (!form.contact_id && !form.category) {
      toast.error('Selecciona al menos un cliente o una categoría');
      return;
    }
    const isPct = form.discount_type === 'pct';
    if (isPct) {
      const pct = Number(form.discount_pct || 0);
      if (pct <= 0 || pct > 100) { toast.error('El porcentaje debe estar entre 0 y 100'); return; }
    } else {
      const amt = Number(form.discount_amount_usd || 0);
      if (amt <= 0) { toast.error('El monto debe ser mayor a 0'); return; }
    }

    const payload: any = {
      name: form.name?.trim() || null,
      contact_id: form.contact_id || null,
      category: form.category || null,
      discount_type: form.discount_type,
      discount_pct: isPct ? Number(form.discount_pct) : 0,
      discount_amount_usd: !isPct ? Number(form.discount_amount_usd) : 0,
      priority: Number(form.priority || 0),
      is_active: form.is_active ?? true,
      notes: form.notes || null,
    };

    if (form.id) {
      const { error } = await supabase.from('discount_rules').update(payload).eq('id', form.id);
      if (error) { toast.error('Error al actualizar'); return; }
    } else {
      const { error } = await supabase.from('discount_rules').insert(payload);
      if (error) { toast.error('Error al crear'); return; }
    }
    toast.success(form.id ? 'Regla actualizada' : 'Regla creada');
    queryClient.invalidateQueries({ queryKey: ['maestras-discount-rules'] });
    queryClient.invalidateQueries({ queryKey: ['discount-rules'] });
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from('discount_rules').delete().eq('id', deleting.id);
    if (error) { toast.error('Error al eliminar'); return; }
    toast.success('Regla eliminada');
    queryClient.invalidateQueries({ queryKey: ['maestras-discount-rules'] });
    queryClient.invalidateQueries({ queryKey: ['discount-rules'] });
    setDeleting(null);
  };

  const newRule = () => setEditing({
    name: '', contact_id: '', category: '', discount_type: 'pct',
    discount_pct: 0, discount_amount_usd: 0, priority: 0, is_active: true, notes: '',
  });

  const formatRuleValue = (r: any) =>
    r.discount_type === 'amount' ? `US$ ${Number(r.discount_amount_usd).toFixed(2)}` : `${Number(r.discount_pct).toFixed(2)}%`;

  const ruleScope = (r: any) => {
    if (r.contact_id && r.category) return `Cliente + Categoría`;
    if (r.contact_id) return `Cliente`;
    if (r.category) return `Categoría`;
    return '—';
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <strong className="text-foreground">¿Cómo funciona?</strong> Al seleccionar un producto en una venta, el sistema busca la regla más específica (Cliente + Categoría &gt; Cliente &gt; Categoría) y aplica el descuento. El usuario puede sobrescribirlo manualmente en la línea.
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar regla..." className="pl-9 h-9" />
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} reglas</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportToExcel(enriched.map((r: any) => ({
            Nombre: r.name || '', Cliente: r.contact_name, Categoría: r.category || 'Todas',
            Alcance: ruleScope(r), Tipo: r.discount_type === 'amount' ? 'Monto USD' : 'Porcentaje',
            Valor: formatRuleValue(r), Prioridad: r.priority, Estado: r.is_active ? 'Activa' : 'Inactiva',
          })), 'reglas-descuento', 'Reglas')}><Download className="w-3.5 h-3.5 mr-1" />Excel</Button>
          <Button size="sm" onClick={newRule}><Plus className="w-3.5 h-3.5 mr-1" />Nueva Regla</Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden max-h-[calc(100vh-360px)] overflow-auto">
        <Table wrapperClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
            <TableRow>
              <TableHead className="text-xs">Nombre</TableHead>
              <TableHead className="text-xs">Cliente</TableHead>
              <TableHead className="text-xs">Categoría</TableHead>
              <TableHead className="text-xs">Alcance</TableHead>
              <TableHead className="text-xs">Descuento</TableHead>
              <TableHead className="text-xs text-center">Prioridad</TableHead>
              <TableHead className="text-xs">Estado</TableHead>
              <TableHead className="text-xs w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs font-medium">{r.name || <span className="text-muted-foreground italic">Sin nombre</span>}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.contact_name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.category || 'Todas'}</TableCell>
                <TableCell className="text-xs"><span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{ruleScope(r)}</span></TableCell>
                <TableCell className="text-xs font-mono font-semibold text-primary">{formatRuleValue(r)}</TableCell>
                <TableCell className="text-xs text-center">{r.priority}</TableCell>
                <TableCell>
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full',
                    r.is_active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground')}>
                    {r.is_active ? 'Activa' : 'Inactiva'}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(r)} title="Editar"><Pencil className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleting(r)} title="Eliminar"><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8">
                {isLoading ? 'Cargando...' : 'Sin reglas configuradas. Crea una nueva para aplicar descuentos automáticos.'}
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <Dialog open onOpenChange={() => setEditing(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing.id ? 'Editar Regla de Descuento' : 'Nueva Regla de Descuento'}</DialogTitle></DialogHeader>
            <DiscountRuleForm initial={editing} contacts={contacts} categories={categories} onSave={handleSave} onCancel={() => setEditing(null)} />
          </DialogContent>
        </Dialog>
      )}
      <DeleteConfirmDialog open={!!deleting} onOpenChange={() => setDeleting(null)} onConfirm={handleDelete}
        title="Eliminar Regla" description={`¿Eliminar esta regla de descuento? Las ventas futuras dejarán de aplicarla automáticamente.`} />
    </div>
  );
}

function DiscountRuleForm({ initial, contacts, categories, onSave, onCancel }: { initial: any; contacts: any[]; categories: string[]; onSave: (d: any) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));
  const submit = async () => { setSaving(true); await onSave(form); setSaving(false); };

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-xs">Nombre de la regla (opcional)</Label>
        <Input value={form.name || ''} onChange={e => set('name', e.target.value)} className="mt-1" placeholder="Ej: Descuento mayorista por volumen" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Cliente</Label>
          <Select value={form.contact_id || 'all'} onValueChange={v => set('contact_id', v === 'all' ? '' : v)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Todos los clientes" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">— Todos los clientes —</SelectItem>
              {contacts.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.contact_name}{c.company_name ? ` (${c.company_name})` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Categoría</Label>
          <Select value={form.category || 'all'} onValueChange={v => set('category', v === 'all' ? '' : v)}>
            <SelectTrigger className="mt-1"><SelectValue placeholder="Todas las categorías" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">— Todas las categorías —</SelectItem>
              {categories.map((c: string) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">Debes seleccionar al menos cliente o categoría. Si dejas ambos en "Todos", la regla no se aplicará.</p>

      <div>
        <Label className="text-xs">Tipo de descuento</Label>
        <Select value={form.discount_type || 'pct'} onValueChange={v => set('discount_type', v)}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pct">Porcentaje (%)</SelectItem>
            <SelectItem value="amount">Monto fijo (USD)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {form.discount_type === 'pct' ? (
        <div>
          <Label className="text-xs">Porcentaje de descuento (%)</Label>
          <Input type="number" step="0.01" min="0" max="100" value={form.discount_pct || ''}
            onChange={e => set('discount_pct', e.target.value)} className="mt-1" placeholder="Ej: 10" />
        </div>
      ) : (
        <div>
          <Label className="text-xs">Monto fijo de descuento por línea (USD)</Label>
          <Input type="number" step="0.01" min="0" value={form.discount_amount_usd || ''}
            onChange={e => set('discount_amount_usd', e.target.value)} className="mt-1" placeholder="Ej: 25.00" />
          <p className="text-[10px] text-muted-foreground mt-1">Se aplicará como descuento total de la línea (no por unidad).</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Prioridad</Label>
          <Input type="number" value={form.priority || 0} onChange={e => set('priority', e.target.value)} className="mt-1" />
          <p className="text-[10px] text-muted-foreground mt-1">Mayor número gana cuando hay empate.</p>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox checked={form.is_active ?? true} onCheckedChange={v => set('is_active', !!v)} />
            <span>Regla activa</span>
          </label>
        </div>
      </div>

      <div>
        <Label className="text-xs">Notas</Label>
        <Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} className="mt-1" rows={2} />
      </div>

      <div className="flex gap-2 pt-2">
        <Button onClick={submit} disabled={saving} className="flex-1">{saving ? 'Guardando...' : 'Guardar'}</Button>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}
