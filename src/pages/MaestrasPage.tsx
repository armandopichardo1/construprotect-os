import { useState, useMemo, Fragment, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { cn } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, Download, ChevronRight, ChevronDown, FolderInput } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { exportToExcel } from '@/lib/export-utils';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { ProductosContent } from '@/pages/ProductosPage';

const tabs = ['Productos', 'Clientes', 'Proveedores', 'Marcas', 'Servicios', 'Reglas de Descuento', 'Cuentas Contables', 'Tasas de Cambio'];

const TAB_MAP: Record<string, string> = {
  productos: 'Productos',
  clientes: 'Clientes',
  proveedores: 'Proveedores',
  marcas: 'Marcas',
  servicios: 'Servicios',
  descuentos: 'Reglas de Descuento',
  cuentas: 'Cuentas Contables',
  tasas: 'Tasas de Cambio',
};

export default function MaestrasPage() {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => {
    const urlTab = searchParams.get('tab');
    return (urlTab && TAB_MAP[urlTab]) || 'Productos';
  });

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <span className="text-xl">📋</span>
          <h1 className="text-xl font-bold text-foreground">Maestras</h1>
        </div>

        <div className="flex gap-1 rounded-lg bg-muted p-0.5 flex-wrap">
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'Productos' && <ProductosContent />}
        {tab === 'Clientes' && <ClientesMaestra />}
        {tab === 'Proveedores' && <ProveedoresMaestra />}
        {tab === 'Marcas' && <MarcasMaestra />}
        {tab === 'Servicios' && <ServiciosMaestra />}
        {tab === 'Reglas de Descuento' && <ReglasDescuentoMaestra />}
        {tab === 'Cuentas Contables' && <CuentasMaestra />}
        {tab === 'Tasas de Cambio' && <TasasCambioMaestra />}
      </div>
    </AppLayout>
  );
}

// ============ GENERIC CRUD HELPERS ============

function useSearch(data: any[], keys: string[]) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(r => keys.some(k => String(r[k] || '').toLowerCase().includes(q)));
  }, [data, search, keys]);
  return { search, setSearch, filtered };
}




// ============ CLIENTES ============

function ClientesMaestra() {
  const queryClient = useQueryClient();
  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['maestras-contacts'],
    queryFn: async () => { const { data } = await supabase.from('contacts').select('*').order('contact_name'); return data || []; },
  });
  const { search, setSearch, filtered } = useSearch(contacts, ['contact_name', 'company_name', 'email', 'phone', 'segment', 'territory']);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);

  const handleSave = async (formData: any) => {
    const payload: any = {
      contact_name: formData.contact_name,
      company_name: formData.company_name || null,
      rnc: formData.rnc || null,
      email: formData.email || null,
      phone: formData.phone || null,
      whatsapp: formData.whatsapp || null,
      segment: formData.segment || null,
      territory: formData.territory || null,
      address: formData.address || null,
      source: formData.source || null,
      price_tier: formData.price_tier || 'list',
      notes: formData.notes || null,
      is_active: formData.is_active ?? true,
    };
    if (formData.id) {
      const { error } = await supabase.from('contacts').update(payload).eq('id', formData.id);
      if (error) { toast.error('Error al actualizar'); return; }
    } else {
      const { error } = await supabase.from('contacts').insert(payload);
      if (error) { toast.error('Error al crear'); return; }
    }
    toast.success(formData.id ? 'Cliente actualizado' : 'Cliente creado');
    queryClient.invalidateQueries({ queryKey: ['maestras-contacts'] });
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from('contacts').delete().eq('id', deleting.id);
    if (error) { toast.error('No se puede eliminar, tiene registros asociados'); return; }
    toast.success('Cliente eliminado');
    queryClient.invalidateQueries({ queryKey: ['maestras-contacts'] });
    setDeleting(null);
  };

  const newClient = () => setEditing({
    contact_name: '', company_name: '', rnc: '', email: '', phone: '', whatsapp: '',
    segment: '', territory: '', address: '', source: '', price_tier: 'list', notes: '', is_active: true,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente..." className="pl-9 h-9" />
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} registros</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportToExcel(contacts.map(c => ({
            Nombre: c.contact_name, Empresa: c.company_name || '', RNC: c.rnc || '',
            Email: c.email || '', Teléfono: c.phone || '', WhatsApp: c.whatsapp || '',
            Segmento: c.segment || '', Territorio: c.territory || '', 'Nivel Precio': c.price_tier || '',
            Estado: c.is_active ? 'Activo' : 'Inactivo',
          })), 'clientes', 'Clientes')}><Download className="w-3.5 h-3.5 mr-1" />Excel</Button>
          <Button size="sm" onClick={newClient}><Plus className="w-3.5 h-3.5 mr-1" />Nuevo</Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden max-h-[calc(100vh-320px)] overflow-auto">
        <Table wrapperClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
            <TableRow>
              <TableHead className="text-xs">Nombre / Empresa</TableHead>
              <TableHead className="text-xs">Teléfono</TableHead>
              <TableHead className="text-xs">Email</TableHead>
              <TableHead className="text-xs">Segmento</TableHead>
              <TableHead className="text-xs">Nivel Precio</TableHead>
              <TableHead className="text-xs">Estado</TableHead>
              <TableHead className="text-xs w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="text-xs">
                  <div className="font-medium">{c.contact_name}</div>
                  {c.company_name && <div className="text-muted-foreground text-[10px]">{c.company_name}</div>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.phone || '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.email || '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.segment || '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.price_tier || '—'}</TableCell>
                <TableCell>
                  <span className={cn('text-[10px] px-2 py-0.5 rounded-full',
                    c.is_active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground')}>
                    {c.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(c)} title="Editar categoría"><Pencil className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleting(c)} title="Eliminar categoría"><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">
                {isLoading ? 'Cargando...' : 'Sin registros'}
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <Dialog open onOpenChange={() => setEditing(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing.id ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle></DialogHeader>
            <ClientForm initial={editing} onSave={handleSave} onCancel={() => setEditing(null)} />
          </DialogContent>
        </Dialog>
      )}
      <DeleteConfirmDialog open={!!deleting} onOpenChange={() => setDeleting(null)} onConfirm={handleDelete}
        title="Eliminar Cliente" description={`¿Eliminar "${deleting?.contact_name}"? Esta acción no se puede deshacer.`} />
    </div>
  );
}

function ClientForm({ initial, onSave, onCancel }: { initial: any; onSave: (d: any) => Promise<void>; onCancel: () => void }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));
  const submit = async () => {
    if (!form.contact_name?.trim()) { toast.error('Nombre es requerido'); return; }
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-xs">Nombre *</Label><Input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} className="mt-1" /></div>
        <div><Label className="text-xs">Empresa</Label><Input value={form.company_name || ''} onChange={e => set('company_name', e.target.value)} className="mt-1" /></div>
      </div>
      <div><Label className="text-xs">RNC</Label><Input value={form.rnc || ''} onChange={e => set('rnc', e.target.value)} className="mt-1" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-xs">Email</Label><Input type="email" value={form.email || ''} onChange={e => set('email', e.target.value)} className="mt-1" /></div>
        <div><Label className="text-xs">Teléfono</Label><Input value={form.phone || ''} onChange={e => set('phone', e.target.value)} className="mt-1" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-xs">WhatsApp</Label><Input value={form.whatsapp || ''} onChange={e => set('whatsapp', e.target.value)} className="mt-1" /></div>
        <div>
          <Label className="text-xs">Nivel de Precio</Label>
          <Select value={form.price_tier || 'list'} onValueChange={v => set('price_tier', v)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="list">Lista</SelectItem>
              <SelectItem value="architect">Arquitecto</SelectItem>
              <SelectItem value="project">Proyecto</SelectItem>
              <SelectItem value="wholesale">Mayorista</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-xs">Segmento</Label><Input value={form.segment || ''} onChange={e => set('segment', e.target.value)} className="mt-1" /></div>
        <div><Label className="text-xs">Territorio</Label><Input value={form.territory || ''} onChange={e => set('territory', e.target.value)} className="mt-1" /></div>
      </div>
      <div><Label className="text-xs">Dirección</Label><Input value={form.address || ''} onChange={e => set('address', e.target.value)} className="mt-1" /></div>
      <div><Label className="text-xs">Fuente</Label><Input value={form.source || ''} onChange={e => set('source', e.target.value)} className="mt-1" placeholder="Referido, web, feria..." /></div>
      <div><Label className="text-xs">Notas</Label><Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} className="mt-1" rows={2} /></div>
      <div className="flex gap-2 pt-2">
        <Button onClick={submit} disabled={saving} className="flex-1">{saving ? 'Guardando...' : 'Guardar'}</Button>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}

// ============ PROVEEDORES ============

function ProveedoresMaestra() {
  const queryClient = useQueryClient();
  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['maestras-suppliers'],
    queryFn: async () => { const { data } = await supabase.from('suppliers').select('*').order('name'); return data || []; },
  });
  const { search, setSearch, filtered } = useSearch(suppliers, ['name', 'contact_name', 'email', 'phone']);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);

  const handleSave = async (formData: any) => {
    const table = supabase.from('suppliers');
    if (formData.id) {
      const { error } = await table.update(formData).eq('id', formData.id);
      if (error) { toast.error('Error'); return; }
    } else {
      const { error } = await table.insert(formData);
      if (error) { toast.error('Error'); return; }
    }
    toast.success(formData.id ? 'Actualizado' : 'Creado');
    queryClient.invalidateQueries({ queryKey: ['maestras-suppliers'] });
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    await supabase.from('suppliers').delete().eq('id', deleting.id);
    toast.success('Eliminado');
    queryClient.invalidateQueries({ queryKey: ['maestras-suppliers'] });
    setDeleting(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar proveedor..." className="pl-9 h-9" />
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} registros</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportToExcel(suppliers.map(s => ({ Nombre: s.name, Contacto: s.contact_name, Teléfono: s.phone, Email: s.email })), 'proveedores', 'Proveedores')}><Download className="w-3.5 h-3.5 mr-1" />Excel</Button>
          <Button size="sm" onClick={() => setEditing({ name: '', contact_name: '', phone: '', email: '', address: '' })}><Plus className="w-3.5 h-3.5 mr-1" />Nuevo</Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden max-h-[calc(100vh-320px)] overflow-auto">
        <Table wrapperClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
            <TableRow>
              <TableHead className="text-xs">Razón Social</TableHead>
              <TableHead className="text-xs">Contacto</TableHead>
              <TableHead className="text-xs">Teléfono</TableHead>
              <TableHead className="text-xs">Email</TableHead>
              <TableHead className="text-xs">Estado</TableHead>
              <TableHead className="text-xs w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((s: any) => (
              <TableRow key={s.id}>
                <TableCell className="text-xs font-medium">{s.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{s.contact_name || '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{s.phone || '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{s.email || '—'}</TableCell>
                <TableCell><span className={cn('text-[10px] px-2 py-0.5 rounded-full', s.is_active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground')}>{s.is_active ? 'Activo' : 'Inactivo'}</span></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(s)} title="Editar servicio"><Pencil className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleting(s)} title="Eliminar servicio"><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-8">{isLoading ? 'Cargando...' : 'Sin registros'}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <Dialog open onOpenChange={() => setEditing(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editing.id ? 'Editar Proveedor' : 'Nuevo Proveedor'}</DialogTitle></DialogHeader>
            <SupplierForm initial={editing} onSave={handleSave} onCancel={() => setEditing(null)} />
          </DialogContent>
        </Dialog>
      )}
      <DeleteConfirmDialog open={!!deleting} onOpenChange={() => setDeleting(null)} onConfirm={handleDelete} title="Eliminar Proveedor" description={`¿Eliminar "${deleting?.name}"?`} />
    </div>
  );
}

function SupplierForm({ initial, onSave, onCancel }: any) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));
  const submit = async () => {
    if (!form.name?.trim()) { toast.error('Nombre requerido'); return; }
    setSaving(true);
    const payload: any = { name: form.name, contact_name: form.contact_name || null, phone: form.phone || null, email: form.email || null, address: form.address || null };
    if (form.id) payload.id = form.id;
    await onSave(payload);
    setSaving(false);
  };
  return (
    <div className="space-y-3">
      <div><Label className="text-xs">Razón Social *</Label><Input value={form.name} onChange={e => set('name', e.target.value)} className="mt-1" /></div>
      <div><Label className="text-xs">Contacto</Label><Input value={form.contact_name || ''} onChange={e => set('contact_name', e.target.value)} className="mt-1" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-xs">Teléfono</Label><Input value={form.phone || ''} onChange={e => set('phone', e.target.value)} className="mt-1" /></div>
        <div><Label className="text-xs">Email</Label><Input value={form.email || ''} onChange={e => set('email', e.target.value)} className="mt-1" /></div>
      </div>
      <div><Label className="text-xs">Dirección</Label><Input value={form.address || ''} onChange={e => set('address', e.target.value)} className="mt-1" /></div>
      <div className="flex gap-2 pt-2">
        <Button onClick={submit} disabled={saving} className="flex-1">{saving ? 'Guardando...' : 'Guardar'}</Button>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
      </div>
    </div>
  );
}


// ============ MARCAS ============

function MarcasMaestra() {
  const queryClient = useQueryClient();
  const { data: brands = [], isLoading } = useQuery({
    queryKey: ['maestras-brands'],
    queryFn: async () => { const { data } = await supabase.from('brands').select('*').order('name'); return data || []; },
  });
  const { search, setSearch, filtered } = useSearch(brands, ['name']);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);

  const handleSave = async (formData: any) => {
    if (formData.id) {
      const { error } = await supabase.from('brands').update({ name: formData.name, is_active: formData.is_active }).eq('id', formData.id);
      if (error) { toast.error('Error'); return; }
    } else {
      const { error } = await supabase.from('brands').insert({ name: formData.name });
      if (error) { toast.error(error.message?.includes('unique') ? 'Marca ya existe' : 'Error'); return; }
    }
    toast.success(formData.id ? 'Actualizada' : 'Creada');
    queryClient.invalidateQueries({ queryKey: ['maestras-brands'] });
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    await supabase.from('brands').delete().eq('id', deleting.id);
    toast.success('Eliminada');
    queryClient.invalidateQueries({ queryKey: ['maestras-brands'] });
    setDeleting(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar marca..." className="pl-9 h-9" />
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} registros</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportToExcel(brands.map(b => ({ Marca: b.name, Estado: b.is_active ? 'Activa' : 'Inactiva' })), 'marcas', 'Marcas')}><Download className="w-3.5 h-3.5 mr-1" />Excel</Button>
          <Button size="sm" onClick={() => setEditing({ name: '', is_active: true })}><Plus className="w-3.5 h-3.5 mr-1" />Nueva</Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden max-h-[calc(100vh-320px)] overflow-auto">
        <Table wrapperClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><TableRow>
            <TableHead className="text-xs">Marca</TableHead>
            <TableHead className="text-xs">Estado</TableHead>
            <TableHead className="text-xs w-20"></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((b: any) => (
              <TableRow key={b.id}>
                <TableCell className="text-xs font-medium">{b.name}</TableCell>
                <TableCell><span className={cn('text-[10px] px-2 py-0.5 rounded-full', b.is_active ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground')}>{b.is_active ? 'Activa' : 'Inactiva'}</span></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(b)} title="Editar marca"><Pencil className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleting(b)} title="Eliminar marca"><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-8">{isLoading ? 'Cargando...' : 'Sin registros'}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <Dialog open onOpenChange={() => setEditing(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>{editing.id ? 'Editar Marca' : 'Nueva Marca'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label className="text-xs">Nombre *</Label><Input value={editing.name} onChange={e => setEditing((p: any) => ({ ...p, name: e.target.value }))} className="mt-1" /></div>
              <div className="flex gap-2 pt-2">
                <Button onClick={() => handleSave(editing)} className="flex-1">Guardar</Button>
                <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
      <DeleteConfirmDialog open={!!deleting} onOpenChange={() => setDeleting(null)} onConfirm={handleDelete} title="Eliminar Marca" description={`¿Eliminar "${deleting?.name}"?`} />
    </div>
  );
}

// ============ SERVICIOS ============

function ServiciosMaestra() {
  const queryClient = useQueryClient();
  const { data: services = [], isLoading } = useQuery({
    queryKey: ['maestras-services'],
    queryFn: async () => { const { data } = await supabase.from('services').select('*').order('sku'); return data || []; },
  });
  const { search, setSearch, filtered } = useSearch(services, ['sku', 'description', 'business_line']);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);

  const handleSave = async (formData: any) => {
    const payload = { sku: formData.sku, description: formData.description, business_line: formData.business_line || null, family: formData.family || null };
    if (formData.id) {
      const { error } = await supabase.from('services').update(payload).eq('id', formData.id);
      if (error) { toast.error('Error'); return; }
    } else {
      const { error } = await supabase.from('services').insert(payload);
      if (error) { toast.error('Error'); return; }
    }
    toast.success(formData.id ? 'Actualizado' : 'Creado');
    queryClient.invalidateQueries({ queryKey: ['maestras-services'] });
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    await supabase.from('services').delete().eq('id', deleting.id);
    toast.success('Eliminado');
    queryClient.invalidateQueries({ queryKey: ['maestras-services'] });
    setDeleting(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar servicio..." className="pl-9 h-9" />
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} registros</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportToExcel(services.map(s => ({ SKU: s.sku, Descripción: s.description, 'Línea de Negocio': s.business_line || '', Familia: s.family || '' })), 'servicios', 'Servicios')}><Download className="w-3.5 h-3.5 mr-1" />Excel</Button>
          <Button size="sm" onClick={() => setEditing({ sku: '', description: '', business_line: '', family: '' })}><Plus className="w-3.5 h-3.5 mr-1" />Nuevo</Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden max-h-[calc(100vh-320px)] overflow-auto">
        <Table wrapperClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><TableRow>
            <TableHead className="text-xs">SKU</TableHead>
            <TableHead className="text-xs">Descripción</TableHead>
            <TableHead className="text-xs">Línea de Negocio</TableHead>
            <TableHead className="text-xs">Familia</TableHead>
            <TableHead className="text-xs w-20"></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((s: any) => (
              <TableRow key={s.id}>
                <TableCell className="text-xs font-mono font-medium">{s.sku}</TableCell>
                <TableCell className="text-xs">{s.description}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{s.business_line || '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{s.family || '—'}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(s)} title="Editar suplidor"><Pencil className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleting(s)} title="Eliminar suplidor"><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-8">{isLoading ? 'Cargando...' : 'Sin registros'}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {editing && (
        <Dialog open onOpenChange={() => setEditing(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editing.id ? 'Editar Servicio' : 'Nuevo Servicio'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">SKU *</Label><Input value={editing.sku} onChange={e => setEditing((p: any) => ({ ...p, sku: e.target.value }))} className="mt-1" /></div>
                <div><Label className="text-xs">Línea de Negocio</Label><Input value={editing.business_line || ''} onChange={e => setEditing((p: any) => ({ ...p, business_line: e.target.value }))} className="mt-1" /></div>
              </div>
              <div><Label className="text-xs">Descripción *</Label><Input value={editing.description} onChange={e => setEditing((p: any) => ({ ...p, description: e.target.value }))} className="mt-1" /></div>
              <div><Label className="text-xs">Familia</Label><Input value={editing.family || ''} onChange={e => setEditing((p: any) => ({ ...p, family: e.target.value }))} className="mt-1" /></div>
              <div className="flex gap-2 pt-2">
                <Button onClick={() => { if (!editing.sku || !editing.description) { toast.error('SKU y Descripción requeridos'); return; } handleSave(editing); }} className="flex-1">Guardar</Button>
                <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
      <DeleteConfirmDialog open={!!deleting} onOpenChange={() => setDeleting(null)} onConfirm={handleDelete} title="Eliminar Servicio" description={`¿Eliminar "${deleting?.description}"?`} />
    </div>
  );
}

// ============ CUENTAS CONTABLES ============

function CuentasMaestra() {
  const queryClient = useQueryClient();
  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ['maestras-accounts'],
    queryFn: async () => { const { data } = await supabase.from('chart_of_accounts').select('*').order('code'); return data || []; },
  });

  // Fetch balances from expenses, costs, and sales linked to accounts
  const { data: accountBalances = {} } = useQuery({
    queryKey: ['account-balances'],
    queryFn: async () => {
      const [{ data: expenses }, { data: costs }, { data: sales }] = await Promise.all([
        supabase.from('expenses').select('account_id, amount_usd').not('account_id', 'is', null),
        supabase.from('costs').select('account_id, amount_usd').not('account_id', 'is', null),
        supabase.from('sales').select('account_id, total_usd').not('account_id', 'is', null),
      ]);
      const balances: Record<string, number> = {};
      (expenses || []).forEach(e => { balances[e.account_id!] = (balances[e.account_id!] || 0) + Number(e.amount_usd); });
      (costs || []).forEach(c => { balances[c.account_id!] = (balances[c.account_id!] || 0) + Number(c.amount_usd); });
      (sales || []).forEach(s => { balances[(s as any).account_id!] = (balances[(s as any).account_id!] || 0) + Number(s.total_usd); });
      return balances;
    },
  });
  const [typeFilter, setTypeFilter] = useState('all');
  const { search, setSearch, filtered: searched } = useSearch(accounts, ['code', 'description', 'classification']);
  const filtered = useMemo(() => typeFilter === 'all' ? searched : searched.filter((a: any) => a.account_type === typeFilter), [searched, typeFilter]);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [creatingParent, setCreatingParent] = useState(false);
  const [newParent, setNewParent] = useState({ code: '', description: '', account_type: 'Activo' });
  const [inlineEdit, setInlineEdit] = useState<{ id: string; code: string; description: string } | null>(null);
  const inlineCodeRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkTargetParent, setBulkTargetParent] = useState<string>('none');
  const [bulkMoving, setBulkMoving] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const accountTypes = useMemo(() => [...new Set(accounts.map((a: any) => a.account_type))].sort(), [accounts]);

  useEffect(() => {
    if (inlineEdit && inlineCodeRef.current) inlineCodeRef.current.focus();
  }, [inlineEdit]);

  // Build hierarchy: recursive tree from parent_id relationships
  const { rootAccounts, childrenMap } = useMemo(() => {
    const children: Record<string, any[]> = {};
    const roots: any[] = [];
    const allIds = new Set(filtered.map((a: any) => a.id));
    
    filtered.forEach((a: any) => {
      if (a.parent_id) {
        if (!children[a.parent_id]) children[a.parent_id] = [];
        children[a.parent_id].push(a);
      }
    });
    
    filtered.forEach((a: any) => {
      // Root if no parent, or parent is not in filtered set
      if (!a.parent_id || !allIds.has(a.parent_id)) {
        roots.push(a);
      }
    });
    
    return { rootAccounts: roots, childrenMap: children };
  }, [filtered]);

  // Build ancestor breadcrumb path for any account
  const accountById = useMemo(() => {
    const map: Record<string, any> = {};
    accounts.forEach((a: any) => { map[a.id] = a; });
    return map;
  }, [accounts]);

  const getBreadcrumb = (account: any): { code: string; description: string }[] => {
    const path: { code: string; description: string }[] = [];
    let current = account.parent_id ? accountById[account.parent_id] : null;
    while (current) {
      path.unshift({ code: current.code || '', description: current.description });
      current = current.parent_id ? accountById[current.parent_id] : null;
    }
    return path;
  };

  const getAccountBalance = (id: string): number => accountBalances[id] || 0;
  const getSubtreeBalance = (accountId: string): number => {
    const own = getAccountBalance(accountId);
    const children = childrenMap[accountId] || [];
    const childrenTotal = children.reduce((sum: number, child: any) => sum + getSubtreeBalance(child.id), 0);
    return own + childrenTotal;
  };

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const collapseAll = () => {
    const all: Record<string, boolean> = {};
    const markCollapse = (list: any[]) => {
      list.forEach(a => {
        if (childrenMap[a.id]?.length) {
          all[a.id] = true;
          markCollapse(childrenMap[a.id]);
        }
      });
    };
    markCollapse(rootAccounts);
    setCollapsed(all);
  };

  const expandAll = () => setCollapsed({});

  // Get all descendant IDs of a given account to prevent circular references
  const getDescendantIds = (accountId: string): Set<string> => {
    const descendants = new Set<string>();
    const queue = [accountId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const children = accounts.filter((a: any) => a.parent_id === current);
      for (const child of children) {
        if (!descendants.has(child.id)) {
          descendants.add(child.id);
          queue.push(child.id);
        }
      }
    }
    return descendants;
  };

  const handleSave = async (formData: any) => {
    // Circular reference validation
    if (formData.id && formData.parent_id) {
      const descendants = getDescendantIds(formData.id);
      if (descendants.has(formData.parent_id) || formData.parent_id === formData.id) {
        toast.error('No se puede asignar como madre una cuenta que es subcuenta de esta cuenta (referencia circular)');
        return;
      }
    }
    const fsMap: Record<string, string> = { Activo: 'Balance General', Pasivo: 'Balance General', Capital: 'Balance General', Ingreso: 'Estado de Resultados', 'Ingresos No Operacionales': 'Estado de Resultados', Costo: 'Estado de Resultados', Gasto: 'Estado de Resultados', 'Gastos No Operacionales': 'Estado de Resultados' };
    const nbMap: Record<string, string> = { Activo: 'Débito', Pasivo: 'Crédito', Capital: 'Crédito', Ingreso: 'Crédito', 'Ingresos No Operacionales': 'Crédito', Costo: 'Débito', Gasto: 'Débito', 'Gastos No Operacionales': 'Débito' };
    const payload = { 
      code: formData.code || null, 
      description: formData.description, 
      classification: formData.classification || null, 
      account_type: formData.account_type, 
      currency: formData.currency || null,
      parent_id: formData.parent_id || null,
      financial_statement: fsMap[formData.account_type] || 'Sin asignar',
      normal_balance: nbMap[formData.account_type] || 'Sin asignar',
    };
    if (formData.id) {
      const { error } = await supabase.from('chart_of_accounts').update(payload).eq('id', formData.id);
      if (error) { toast.error('Error'); return; }
    } else {
      const { error } = await supabase.from('chart_of_accounts').insert(payload);
      if (error) { toast.error('Error'); return; }
    }
    toast.success(formData.id ? 'Actualizada' : 'Creada');
    queryClient.invalidateQueries({ queryKey: ['maestras-accounts'] });
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    await supabase.from('chart_of_accounts').delete().eq('id', deleting.id);
    toast.success('Eliminada');
    queryClient.invalidateQueries({ queryKey: ['maestras-accounts'] });
    setDeleting(null);
  };

  const typeColors: Record<string, string> = {
    'Activo': 'bg-primary/10 text-primary',
    'Pasivo': 'bg-destructive/10 text-destructive',
    'Capital': 'bg-success/10 text-success',
    'Ingreso': 'bg-success/10 text-success',
    'Costo': 'bg-warning/10 text-warning',
    'Gasto': 'bg-destructive/10 text-destructive',
  };

  // Possible parents for the dropdown (any account except self and descendants)
  const possibleParents = useMemo(() => {
    if (!editing?.id) return accounts;
    const descendants = getDescendantIds(editing.id);
    return accounts.filter((a: any) => a.id !== editing.id && !descendants.has(a.id));
  }, [accounts, editing]);

  const handleInlineSave = async () => {
    if (!inlineEdit) return;
    if (!inlineEdit.description.trim()) { toast.error('Descripción requerida'); return; }
    const { error } = await supabase.from('chart_of_accounts').update({ code: inlineEdit.code.trim() || null, description: inlineEdit.description.trim() }).eq('id', inlineEdit.id);
    if (error) { toast.error('Error al actualizar'); return; }
    toast.success('Cuenta actualizada');
    queryClient.invalidateQueries({ queryKey: ['maestras-accounts'] });
    setInlineEdit(null);
  };

  const handleInlineKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleInlineSave(); }
    if (e.key === 'Escape') setInlineEdit(null);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allChildIds = useMemo(() => {
    const ids: string[] = [];
    Object.values(childrenMap).forEach((children: any[]) => children.forEach(c => ids.push(c.id)));
    // Also include parent accounts that have a parent_id (are subcuentas themselves)
    filtered.forEach((a: any) => { if (a.parent_id) ids.push(a.id); });
    return [...new Set(ids)];
  }, [childrenMap, filtered]);

  const toggleSelectAll = () => {
    if (selected.size === allChildIds.length && allChildIds.length > 0) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allChildIds));
    }
  };

  const bulkMoveTargets = useMemo(() => {
    return accounts.filter((a: any) => !selected.has(a.id));
  }, [accounts, selected]);

  const handleBulkMove = async () => {
    if (selected.size === 0) return;
    setBulkMoving(true);
    const targetId = bulkTargetParent === 'none' ? null : bulkTargetParent;
    const ids = Array.from(selected);
    
    // Validate no cycles
    if (targetId) {
      for (const id of ids) {
        const descendants = getDescendantIds(id);
        if (descendants.has(targetId) || id === targetId) {
          toast.error('Referencia circular detectada. Algunas cuentas seleccionadas no pueden moverse a ese destino.');
          setBulkMoving(false);
          return;
        }
      }
    }

    const { error } = await supabase.from('chart_of_accounts').update({ parent_id: targetId }).in('id', ids);
    setBulkMoving(false);
    if (error) { toast.error('Error al mover cuentas'); return; }
    toast.success(`${ids.length} cuenta(s) movida(s)`);
    queryClient.invalidateQueries({ queryKey: ['maestras-accounts'] });
    setSelected(new Set());
    setBulkMoveOpen(false);
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    setBulkDeleting(true);
    const ids = Array.from(selected);
    // Check if any selected account has children that are NOT also selected
    for (const id of ids) {
      const children = childrenMap[id] || [];
      const unselectedChildren = children.filter((c: any) => !selected.has(c.id));
      if (unselectedChildren.length > 0) {
        const acc = accountById[id];
        toast.error(`"${acc?.code || ''} ${acc?.description}" tiene subcuentas no seleccionadas. Elimina o mueve las subcuentas primero.`);
        setBulkDeleting(false);
        return;
      }
    }
    const { error } = await supabase.from('chart_of_accounts').delete().in('id', ids);
    setBulkDeleting(false);
    if (error) { toast.error('Error al eliminar cuentas'); return; }
    toast.success(`${ids.length} cuenta(s) eliminada(s)`);
    queryClient.invalidateQueries({ queryKey: ['maestras-accounts'] });
    setSelected(new Set());
    setBulkDeleteOpen(false);
  };


  const renderRow = (a: any, depth: number, hasChildren: boolean, isCollapsed: boolean) => {
    const balance = hasChildren ? getSubtreeBalance(a.id) : getAccountBalance(a.id);
    const isInline = inlineEdit?.id === a.id;
    const hasKids = hasChildren;
    return (
    <TableRow key={a.id} className={cn(hasKids && 'bg-muted/40 font-semibold', selected.has(a.id) && 'bg-primary/5')}>
      <TableCell className="w-8 px-2">
        <Checkbox checked={selected.has(a.id)} onCheckedChange={() => toggleSelect(a.id)} className="h-3.5 w-3.5" />
      </TableCell>
      <TableCell className="text-xs font-mono font-medium">
        <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 20}px` }}>
          {hasChildren ? (
            <button onClick={() => toggleCollapse(a.id)} className="w-5 h-5 rounded flex items-center justify-center hover:bg-muted transition-colors">
              {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
          ) : (
            <span className="w-5" />
          )}
          {depth > 0 && <span className="w-4 border-l-2 border-b-2 border-border h-3 mr-1 rounded-bl-sm" />}
          {isInline ? (
            <Input
              ref={inlineCodeRef}
              value={inlineEdit.code}
              onChange={e => setInlineEdit(prev => prev ? { ...prev, code: e.target.value } : prev)}
              onKeyDown={handleInlineKeyDown}
              className="h-7 w-24 text-xs font-mono px-1.5"
              placeholder="Código"
            />
          ) : (
            <span onDoubleClick={() => hasKids && setInlineEdit({ id: a.id, code: a.code || '', description: a.description })} className={cn(hasKids && 'cursor-text')}>
              {a.code || '—'}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className={cn('text-xs', hasKids ? 'font-semibold' : '')}>
        {isInline ? (
          <div className="flex items-center gap-1.5">
            <Input
              value={inlineEdit.description}
              onChange={e => setInlineEdit(prev => prev ? { ...prev, description: e.target.value } : prev)}
              onKeyDown={handleInlineKeyDown}
              className="h-7 text-xs px-1.5 flex-1"
              placeholder="Descripción *"
            />
            <Button size="sm" className="h-7 text-[10px] px-2" onClick={handleInlineSave}>✓</Button>
            <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2" onClick={() => setInlineEdit(null)}>✕</Button>
          </div>
        ) : (
          <div className="flex flex-col">
            <span className="inline-flex items-center gap-1.5" onDoubleClick={() => hasKids && setInlineEdit({ id: a.id, code: a.code || '', description: a.description })}>
              {a.description}
              {hasKids && (
                <span className="inline-flex items-center justify-center rounded-full bg-primary/10 text-primary text-[9px] font-semibold min-w-[18px] h-[18px] px-1">
                  {(childrenMap[a.id] || []).length}
                </span>
              )}
            </span>
            {depth > 0 && (() => {
              const crumbs = getBreadcrumb(a);
              const tooltipText = crumbs.length > 0
                ? [...crumbs.map(c => `${c.code ? c.code + ' · ' : ''}${c.description}`), `${a.code ? a.code + ' · ' : ''}${a.description}`].join(' → ')
                : '';
              return crumbs.length > 0 ? (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-[10px] text-muted-foreground/60 mt-0.5 flex items-center gap-0.5 cursor-help">
                        {crumbs.map((c, i) => (
                          <Fragment key={i}>
                            {i > 0 && <span className="text-muted-foreground/40">›</span>}
                            <span>{c.code || c.description}</span>
                          </Fragment>
                        ))}
                        <span className="text-muted-foreground/40">›</span>
                        <span className="text-muted-foreground/80">{a.code || a.description}</span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="start" className="max-w-xs text-xs">
                      {tooltipText}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null;
            })()}
          </div>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{a.classification || '—'}</TableCell>
      <TableCell><span className={cn('text-[10px] px-2 py-0.5 rounded-full', typeColors[a.account_type] || 'bg-muted text-muted-foreground')}>{a.account_type}</span></TableCell>
      <TableCell className="text-xs text-muted-foreground">{a.financial_statement || '—'}</TableCell>
      <TableCell className="text-xs text-muted-foreground">
        <span className={cn('text-[10px] px-2 py-0.5 rounded-full', a.normal_balance === 'Débito' ? 'bg-primary/10 text-primary' : a.normal_balance === 'Crédito' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground')}>
          {a.normal_balance || '—'}
        </span>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{a.currency || '—'}</TableCell>
      <TableCell className={cn('text-xs text-right font-mono', balance > 0 ? (hasKids ? 'font-bold text-foreground' : 'text-muted-foreground') : 'text-muted-foreground/50')}>
        {balance > 0 ? `$${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing({ ...a, parent_id: a.parent_id || '' })} title="Editar cuenta"><Pencil className="w-3 h-3" /></Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleting(a)} title="Eliminar cuenta"><Trash2 className="w-3 h-3" /></Button>
        </div>
      </TableCell>
    </TableRow>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cuenta..." className="pl-9 h-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {accountTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="ghost" onClick={expandAll} className="text-xs">Expandir</Button>
        <Button size="sm" variant="ghost" onClick={collapseAll} className="text-xs">Colapsar</Button>
        <span className="text-xs text-muted-foreground">{filtered.length} cuentas</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportToExcel(accounts.map(a => ({ Código: a.code, Descripción: a.description, Clasificación: a.classification, Tipo: a.account_type, 'Estado Financiero': (a as any).financial_statement, Efecto: (a as any).normal_balance, Moneda: a.currency })), 'catalogo_cuentas', 'Cuentas')}><Download className="w-3.5 h-3.5 mr-1" />Excel</Button>
          <Button size="sm" onClick={() => setEditing({ code: '', description: '', classification: '', account_type: 'Gasto', currency: '', parent_id: '' })}><Plus className="w-3.5 h-3.5 mr-1" />Nueva</Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card max-h-[calc(100vh-320px)] overflow-auto">
        <Table wrapperClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]"><TableRow>
            <TableHead className="w-8 px-2">
              <Checkbox checked={allChildIds.length > 0 && selected.size === allChildIds.length} onCheckedChange={toggleSelectAll} className="h-3.5 w-3.5" />
            </TableHead>
            <TableHead className="text-xs w-28">Código</TableHead>
            <TableHead className="text-xs">Descripción</TableHead>
            <TableHead className="text-xs">Clasificación</TableHead>
            <TableHead className="text-xs">Tipo</TableHead>
            <TableHead className="text-xs">Estado Financiero</TableHead>
            <TableHead className="text-xs">Efecto</TableHead>
            <TableHead className="text-xs">Moneda</TableHead>
            <TableHead className="text-xs text-right">Saldo (RD$)</TableHead>
            <TableHead className="text-xs w-20"></TableHead>
          </TableRow></TableHeader>
          <TableBody>
             {(() => {
               const renderTree = (items: any[], depth: number): React.ReactNode[] => {
                 return items.flatMap((a: any) => {
                   const children = childrenMap[a.id] || [];
                   const hasChildren = children.length > 0;
                   const isCollapsed = !!collapsed[a.id];
                   const rows: React.ReactNode[] = [renderRow(a, depth, hasChildren, isCollapsed)];
                   if (hasChildren && !isCollapsed) {
                     rows.push(...renderTree(children, depth + 1));
                   }
                   return rows;
                 });
               };
               return renderTree(rootAccounts, 0);
             })()}
             {rootAccounts.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8">{isLoading ? 'Cargando...' : 'Sin registros'}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5">
          <span className="text-xs font-medium text-foreground">{selected.size} cuenta(s) seleccionada(s)</span>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => { setBulkTargetParent('none'); setBulkMoveOpen(true); }}>
            <FolderInput className="w-3.5 h-3.5" />Mover a otra madre
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setBulkDeleteOpen(true)}>
            <Trash2 className="w-3.5 h-3.5" />Eliminar
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelected(new Set())}>Deseleccionar</Button>
        </div>
      )}

      {bulkMoveOpen && (
        <Dialog open onOpenChange={() => setBulkMoveOpen(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle className="text-base">Mover {selected.size} cuenta(s)</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Cuenta madre destino</Label>
                <Select value={bulkTargetParent} onValueChange={setBulkTargetParent}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin cuenta madre (raíz)</SelectItem>
                    {bulkMoveTargets.map((p: any) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">{p.code ? `${p.code} · ` : ''}{p.description}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-lg bg-muted/50 p-2.5 max-h-32 overflow-y-auto">
                <p className="text-[10px] font-medium text-muted-foreground mb-1">Cuentas a mover:</p>
                {Array.from(selected).map(id => {
                  const acc = accountById[id];
                  return acc ? <p key={id} className="text-xs text-muted-foreground">{acc.code ? `${acc.code} · ` : ''}{acc.description}</p> : null;
                })}
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={handleBulkMove} disabled={bulkMoving} className="flex-1 text-xs">{bulkMoving ? 'Moviendo...' : 'Mover'}</Button>
                <Button variant="outline" onClick={() => setBulkMoveOpen(false)} className="text-xs">Cancelar</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {editing && (
        <Dialog open onOpenChange={() => setEditing(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editing.id ? 'Editar Cuenta' : 'Nueva Cuenta'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Código</Label><Input value={editing.code || ''} onChange={e => setEditing((p: any) => ({ ...p, code: e.target.value }))} className="mt-1" /></div>
                <div><Label className="text-xs">Tipo *</Label>
                  <Select value={editing.account_type} onValueChange={v => setEditing((p: any) => ({ ...p, account_type: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Activo','Pasivo','Capital','Ingreso','Costo','Gasto','Ingresos No Operacionales','Gastos No Operacionales'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label className="text-xs">Descripción *</Label><Input value={editing.description} onChange={e => setEditing((p: any) => ({ ...p, description: e.target.value }))} className="mt-1" /></div>
              <div><Label className="text-xs">Cuenta Madre</Label>
                {!creatingParent ? (
                  <div className="flex gap-1.5 mt-1">
                    <Select value={editing.parent_id || 'none'} onValueChange={v => setEditing((p: any) => ({ ...p, parent_id: v === 'none' ? '' : v }))}>
                      <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin cuenta madre</SelectItem>
                        {possibleParents.filter((p: any) => p.id !== editing.id).map((p: any) => (
                          <SelectItem key={p.id} value={p.id} className="text-xs">{p.code} · {p.description}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="sm" className="h-9 px-2 shrink-0" onClick={() => { setCreatingParent(true); setNewParent({ code: '', description: '', account_type: editing.account_type || 'Activo' }); }}>
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="mt-1 rounded-lg border border-border bg-muted/30 p-2.5 space-y-2">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Nueva cuenta madre</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Código (ej: 14000)" value={newParent.code} onChange={e => setNewParent(p => ({ ...p, code: e.target.value }))} className="h-8 text-xs" />
                      <Select value={newParent.account_type} onValueChange={v => setNewParent(p => ({ ...p, account_type: v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['Activo','Pasivo','Capital','Ingreso','Costo','Gasto','Ingresos No Operacionales','Gastos No Operacionales'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input placeholder="Descripción *" value={newParent.description} onChange={e => setNewParent(p => ({ ...p, description: e.target.value }))} className="h-8 text-xs" />
                    <div className="flex gap-1.5">
                      <Button type="button" size="sm" className="h-7 text-xs flex-1" onClick={async () => {
                        if (!newParent.description.trim()) { toast.error('Descripción requerida'); return; }
                        const { data, error } = await supabase.from('chart_of_accounts').insert({
                          code: newParent.code || null,
                          description: newParent.description,
                          account_type: newParent.account_type,
                          parent_id: null,
                        }).select('id').single();
                        if (error) { toast.error('Error al crear cuenta madre'); return; }
                        toast.success('Cuenta madre creada');
                        queryClient.invalidateQueries({ queryKey: ['maestras-accounts'] });
                        setEditing((p: any) => ({ ...p, parent_id: data.id }));
                        setCreatingParent(false);
                      }}>Crear y asignar</Button>
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setCreatingParent(false)}>Cancelar</Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Clasificación</Label><Input value={editing.classification || ''} onChange={e => setEditing((p: any) => ({ ...p, classification: e.target.value }))} className="mt-1" /></div>
                <div><Label className="text-xs">Moneda</Label>
                  <Select value={editing.currency || 'none'} onValueChange={v => setEditing((p: any) => ({ ...p, currency: v === 'none' ? null : v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin especificar</SelectItem>
                      <SelectItem value="DOP">DOP</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={() => { if (!editing.description) { toast.error('Descripción requerida'); return; } handleSave(editing); }} className="flex-1">Guardar</Button>
                <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
      <DeleteConfirmDialog open={!!deleting} onOpenChange={() => setDeleting(null)} onConfirm={handleDelete} title="Eliminar Cuenta" description={`¿Eliminar "${deleting?.code} - ${deleting?.description}"?`} />

      {bulkDeleteOpen && (
        <Dialog open onOpenChange={() => setBulkDeleteOpen(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle className="text-base text-destructive">Eliminar {selected.size} cuenta(s)</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Esta acción es irreversible. Las siguientes cuentas serán eliminadas permanentemente:</p>
              <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-2.5 max-h-40 overflow-y-auto">
                {Array.from(selected).map(id => {
                  const acc = accountById[id];
                  return acc ? <p key={id} className="text-xs text-muted-foreground">{acc.code ? `${acc.code} · ` : ''}{acc.description}</p> : null;
                })}
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting} className="flex-1 text-xs">{bulkDeleting ? 'Eliminando...' : 'Eliminar'}</Button>
                <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} className="text-xs">Cancelar</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ============ TASAS DE CAMBIO ============

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function TasasCambioMaestra() {
  const qc = useQueryClient();
  const [editRow, setEditRow] = useState<{ id?: string; date: string; usd_buy: string; usd_sell: string; source: string } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: rates = [], isLoading } = useQuery({
    queryKey: ['exchange-rates-all'],
    queryFn: async () => {
      const { data } = await supabase
        .from('exchange_rates')
        .select('*')
        .order('date', { ascending: false });
      return data || [];
    },
  });

  // Group by year
  const grouped = useMemo(() => {
    const map: Record<string, typeof rates> = {};
    rates.forEach(r => {
      const year = r.date.slice(0, 4);
      if (!map[year]) map[year] = [];
      map[year].push(r);
    });
    return Object.entries(map).sort(([a], [b]) => b.localeCompare(a));
  }, [rates]);

  const handleSave = async () => {
    if (!editRow) return;
    const buy = parseFloat(editRow.usd_buy);
    const sell = parseFloat(editRow.usd_sell);
    if (isNaN(buy) || isNaN(sell) || buy <= 0 || sell <= 0) {
      toast.error('Ingresa tasas válidas');
      return;
    }
    if (editRow.id) {
      const { error } = await supabase.from('exchange_rates').update({
        date: editRow.date, usd_buy: buy, usd_sell: sell, source: editRow.source || 'manual',
      }).eq('id', editRow.id);
      if (error) { toast.error('Error actualizando'); return; }
      toast.success('Tasa actualizada');
    } else {
      const { error } = await supabase.from('exchange_rates').insert({
        date: editRow.date, usd_buy: buy, usd_sell: sell, source: editRow.source || 'manual',
      });
      if (error) { toast.error('Error creando'); return; }
      toast.success('Tasa registrada');
    }
    setEditRow(null);
    qc.invalidateQueries({ queryKey: ['exchange-rates-all'] });
    qc.invalidateQueries({ queryKey: ['all-exchange-rates'] });
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    await supabase.from('exchange_rates').delete().eq('id', deleteId);
    toast.success('Tasa eliminada');
    setDeleteId(null);
    qc.invalidateQueries({ queryKey: ['exchange-rates-all'] });
    qc.invalidateQueries({ queryKey: ['all-exchange-rates'] });
  };

  const openNew = () => {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    setEditRow({ date: dateStr, usd_buy: '', usd_sell: '', source: 'manual' });
  };

  if (isLoading) return <p className="text-xs text-muted-foreground py-8 text-center">Cargando tasas...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Historial de Tasas USD/DOP</h2>
          <p className="text-xs text-muted-foreground">Tasas mensuales para transacciones históricas. Al registrar transacciones pasadas se usará la tasa del período correspondiente.</p>
        </div>
        <Button size="sm" className="h-8 text-xs gap-1" onClick={openNew}>
          <Plus className="w-3.5 h-3.5" /> Agregar Tasa
        </Button>
      </div>

      {grouped.map(([year, yearRates]) => (
        <div key={year} className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{year}</h3>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="max-h-[calc(100vh-350px)] overflow-auto">
              <Table wrapperClassName="overflow-visible">
                <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                  <TableRow>
                    <TableHead className="text-xs">Mes</TableHead>
                    <TableHead className="text-xs">Fecha</TableHead>
                    <TableHead className="text-xs text-right">Compra (USD)</TableHead>
                    <TableHead className="text-xs text-right">Venta (USD)</TableHead>
                    <TableHead className="text-xs">Fuente</TableHead>
                    <TableHead className="text-xs w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {yearRates.map(r => {
                    const month = parseInt(r.date.slice(5, 7), 10);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs font-medium">{MONTHS_ES[month - 1]} {year}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono">{r.date}</TableCell>
                        <TableCell className="text-xs text-right font-mono font-semibold">{Number(r.usd_buy).toFixed(2)}</TableCell>
                        <TableCell className="text-xs text-right font-mono font-semibold">{Number(r.usd_sell).toFixed(2)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.source || '—'}</TableCell>
                        <TableCell className="text-xs">
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditRow({
                              id: r.id, date: r.date, usd_buy: String(r.usd_buy), usd_sell: String(r.usd_sell), source: r.source || 'manual',
                            })}>
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive" onClick={() => setDeleteId(r.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      ))}

      {rates.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">No hay tasas registradas. Agrega la primera tasa.</p>
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={!!editRow} onOpenChange={() => setEditRow(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{editRow?.id ? 'Editar Tasa' : 'Nueva Tasa de Cambio'}</DialogTitle>
          </DialogHeader>
          {editRow && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Fecha (primer día del mes)</Label>
                <Input type="date" value={editRow.date} onChange={e => setEditRow({ ...editRow, date: e.target.value })} className="text-xs h-8" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Compra (RD$ por 1 USD)</Label>
                  <Input type="number" step="0.01" value={editRow.usd_buy} onChange={e => setEditRow({ ...editRow, usd_buy: e.target.value })}
                    placeholder="59.00" className="text-xs h-8 font-mono" />
                </div>
                <div>
                  <Label className="text-xs">Venta (RD$ por 1 USD)</Label>
                  <Input type="number" step="0.01" value={editRow.usd_sell} onChange={e => setEditRow({ ...editRow, usd_sell: e.target.value })}
                    placeholder="60.00" className="text-xs h-8 font-mono" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Fuente</Label>
                <Input value={editRow.source} onChange={e => setEditRow({ ...editRow, source: e.target.value })}
                  placeholder="BanReservas, manual, etc." className="text-xs h-8" />
              </div>
              <Button onClick={handleSave} className="w-full text-xs h-8">{editRow.id ? 'Actualizar' : 'Guardar'}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <DeleteConfirmDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Eliminar Tasa"
        description="¿Estás seguro de eliminar esta tasa de cambio? Las transacciones que la usen podrían verse afectadas."
      />
    </div>
  );
}

// ============ REGLAS DE DESCUENTO ============

function ReglasDescuentoMaestra() {
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
    queryFn: async () => { const { data } = await supabase.from('contacts').select('id, contact_name, company_name').eq('is_active', true).order('contact_name'); return data || []; },
  });
  const { data: products = [] } = useQuery({
    queryKey: ['maestras-products-categories'],
    queryFn: async () => { const { data } = await supabase.from('products').select('category').not('category', 'is', null); return data || []; },
  });
  const categories = useMemo(() => Array.from(new Set(products.map((p: any) => p.category).filter(Boolean))).sort(), [products]);

  const enriched = useMemo(() => rules.map((r: any) => ({
    ...r,
    contact_name: contacts.find((c: any) => c.id === r.contact_id)?.contact_name || (r.contact_id ? '—' : 'Todos'),
  })), [rules, contacts]);

  const { search, setSearch, filtered } = useSearch(enriched, ['name', 'contact_name', 'category', 'notes']);
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
        <strong className="text-foreground">¿Cómo funciona?</strong> Al seleccionar un producto en una venta, el sistema busca automáticamente la regla más específica (Cliente + Categoría &gt; Cliente &gt; Categoría) y aplica el descuento. El usuario puede sobrescribirlo manualmente en la línea.
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
