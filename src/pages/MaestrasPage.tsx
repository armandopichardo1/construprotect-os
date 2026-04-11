import { useState, useMemo, Fragment, useRef, useEffect } from 'react';
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
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, Download, ChevronRight, ChevronDown } from 'lucide-react';
import { exportToExcel } from '@/lib/export-utils';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';

const tabs = ['Clientes', 'Proveedores', 'Productos', 'Marcas', 'Servicios', 'Cuentas Contables'];

export default function MaestrasPage() {
  const [tab, setTab] = useState('Clientes');

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

        {tab === 'Clientes' && <ClientesMaestra />}
        {tab === 'Proveedores' && <ProveedoresMaestra />}
        {tab === 'Productos' && <ProductosMaestra />}
        {tab === 'Marcas' && <MarcasMaestra />}
        {tab === 'Servicios' && <ServiciosMaestra />}
        {tab === 'Cuentas Contables' && <CuentasMaestra />}
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
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['maestras-clients'],
    queryFn: async () => { const { data } = await supabase.from('crm_clients').select('*').order('name'); return data || []; },
  });
  const { search, setSearch, filtered } = useSearch(clients, ['name', 'company', 'email', 'phone']);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);

  const handleSave = async (formData: any) => {
    if (formData.id) {
      const { error } = await supabase.from('crm_clients').update(formData).eq('id', formData.id);
      if (error) { toast.error('Error al actualizar'); return; }
      toast.success('Cliente actualizado');
    } else {
      const { error } = await supabase.from('crm_clients').insert(formData);
      if (error) { toast.error('Error al crear'); return; }
      toast.success('Cliente creado');
    }
    queryClient.invalidateQueries({ queryKey: ['maestras-clients'] });
    queryClient.invalidateQueries({ queryKey: ['crm-clients'] });
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase.from('crm_clients').delete().eq('id', deleting.id);
    if (error) { toast.error('Error al eliminar'); return; }
    toast.success('Cliente eliminado');
    queryClient.invalidateQueries({ queryKey: ['maestras-clients'] });
    queryClient.invalidateQueries({ queryKey: ['crm-clients'] });
    setDeleting(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cliente..." className="pl-9 h-9" />
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} registros</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportToExcel(clients.map(c => ({ Nombre: c.name, Empresa: c.company, Teléfono: c.phone, Email: c.email, Estado: c.status })), 'clientes', 'Clientes')}><Download className="w-3.5 h-3.5 mr-1" />Excel</Button>
          <Button size="sm" onClick={() => setEditing({ name: '', company: '', phone: '', email: '', status: 'active' })}><Plus className="w-3.5 h-3.5 mr-1" />Nuevo</Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Nombre</TableHead>
              <TableHead className="text-xs">Empresa</TableHead>
              <TableHead className="text-xs">Teléfono</TableHead>
              <TableHead className="text-xs">Email</TableHead>
              <TableHead className="text-xs">Estado</TableHead>
              <TableHead className="text-xs w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="text-xs font-medium">{c.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.company || '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.phone || '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{c.email || '—'}</TableCell>
                <TableCell><span className={cn('text-[10px] px-2 py-0.5 rounded-full', c.status === 'active' ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground')}>{c.status}</span></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(c)}><Pencil className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleting(c)}><Trash2 className="w-3 h-3" /></Button>
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
            <DialogHeader><DialogTitle>{editing.id ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle></DialogHeader>
            <ClienteForm initial={editing} onSave={handleSave} onCancel={() => setEditing(null)} />
          </DialogContent>
        </Dialog>
      )}

      <DeleteConfirmDialog open={!!deleting} onOpenChange={() => setDeleting(null)} onConfirm={handleDelete} title="Eliminar Cliente" description={`¿Eliminar "${deleting?.name}"? Esta acción no se puede deshacer.`} />
    </div>
  );
}

function ClienteForm({ initial, onSave, onCancel }: any) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm((p: any) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!form.name?.trim()) { toast.error('Nombre es requerido'); return; }
    setSaving(true);
    const payload: any = { name: form.name, company: form.company || null, phone: form.phone || null, email: form.email || null, status: form.status || 'active' };
    if (form.id) payload.id = form.id;
    await onSave(payload);
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <div><Label className="text-xs">Nombre *</Label><Input value={form.name} onChange={e => set('name', e.target.value)} className="mt-1" /></div>
      <div><Label className="text-xs">Empresa</Label><Input value={form.company || ''} onChange={e => set('company', e.target.value)} className="mt-1" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label className="text-xs">Teléfono</Label><Input value={form.phone || ''} onChange={e => set('phone', e.target.value)} className="mt-1" /></div>
        <div><Label className="text-xs">Email</Label><Input value={form.email || ''} onChange={e => set('email', e.target.value)} className="mt-1" /></div>
      </div>
      <div><Label className="text-xs">Estado</Label>
        <Select value={form.status} onValueChange={v => set('status', v)}>
          <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Activo</SelectItem>
            <SelectItem value="prospect">Prospecto</SelectItem>
            <SelectItem value="inactive">Inactivo</SelectItem>
          </SelectContent>
        </Select>
      </div>
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

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
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
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(s)}><Pencil className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleting(s)}><Trash2 className="w-3 h-3" /></Button>
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

// ============ PRODUCTOS (redirect to existing page info) ============

function ProductosMaestra() {
  return (
    <div className="rounded-2xl bg-card border border-border p-8 text-center space-y-3">
      <p className="text-4xl">📦</p>
      <h2 className="text-lg font-semibold text-foreground">Catálogo de Productos</h2>
      <p className="text-sm text-muted-foreground">Los productos se gestionan desde la página de Productos con todas las funciones de costos, precios y márgenes.</p>
      <Button variant="outline" onClick={() => window.location.href = '/productos'}>Ir a Productos →</Button>
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
        <Button size="sm" className="ml-auto" onClick={() => setEditing({ name: '', is_active: true })}><Plus className="w-3.5 h-3.5 mr-1" />Nueva</Button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader><TableRow>
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
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(b)}><Pencil className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleting(b)}><Trash2 className="w-3 h-3" /></Button>
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
        <Button size="sm" className="ml-auto" onClick={() => setEditing({ sku: '', description: '', business_line: '', family: '' })}><Plus className="w-3.5 h-3.5 mr-1" />Nuevo</Button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader><TableRow>
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
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(s)}><Pencil className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleting(s)}><Trash2 className="w-3 h-3" /></Button>
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

  const accountTypes = useMemo(() => [...new Set(accounts.map((a: any) => a.account_type))].sort(), [accounts]);

  // Build hierarchy: parent accounts (no parent_id) and their children
  const { parentAccounts, childrenMap, parentMap } = useMemo(() => {
    const parents: any[] = [];
    const children: Record<string, any[]> = {};
    const pMap: Record<string, any> = {};
    
    filtered.forEach((a: any) => {
      if (!a.parent_id) {
        parents.push(a);
        pMap[a.id] = a;
      }
    });
    
    filtered.forEach((a: any) => {
      if (a.parent_id) {
        if (!children[a.parent_id]) children[a.parent_id] = [];
        children[a.parent_id].push(a);
      }
    });

    // Accounts whose parent is filtered out → show as standalone
    const orphans = filtered.filter((a: any) => a.parent_id && !pMap[a.parent_id] && !parents.find(p => p.id === a.parent_id));
    
    return { parentAccounts: [...parents, ...orphans], childrenMap: children, parentMap: pMap };
  }, [filtered]);

  // Compute balances: own + accumulated for parents
  const getAccountBalance = (id: string): number => accountBalances[id] || 0;
  const getParentBalance = (parentId: string): number => {
    const children = childrenMap[parentId] || [];
    const ownBalance = getAccountBalance(parentId);
    const childrenTotal = children.reduce((sum: number, child: any) => sum + getAccountBalance(child.id), 0);
    return ownBalance + childrenTotal;
  };

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const collapseAll = () => {
    const all: Record<string, boolean> = {};
    parentAccounts.forEach(p => { if (childrenMap[p.id]?.length) all[p.id] = true; });
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
    const payload = { 
      code: formData.code || null, 
      description: formData.description, 
      classification: formData.classification || null, 
      account_type: formData.account_type, 
      currency: formData.currency || null,
      parent_id: formData.parent_id || null,
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

  // Possible parents for the dropdown (only accounts that have no parent themselves)
  const possibleParents = useMemo(() => {
    const roots = accounts.filter((a: any) => !a.parent_id);
    if (!editing?.id) return roots;
    const descendants = getDescendantIds(editing.id);
    return roots.filter((a: any) => a.id !== editing.id && !descendants.has(a.id));
  }, [accounts, editing]);

  const renderRow = (a: any, isChild: boolean, hasChildren: boolean, isCollapsed: boolean) => {
    const balance = !isChild && hasChildren ? getParentBalance(a.id) : getAccountBalance(a.id);
    return (
    <TableRow key={a.id} className={cn(!isChild && hasChildren && 'bg-muted/40 font-semibold')}>
      <TableCell className="text-xs font-mono font-medium">
        <div className="flex items-center gap-1">
          {!isChild && hasChildren ? (
            <button onClick={() => toggleCollapse(a.id)} className="w-5 h-5 rounded flex items-center justify-center hover:bg-muted transition-colors">
              {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
          ) : (
            <span className="w-5" />
          )}
          {isChild && <span className="w-4 border-l-2 border-b-2 border-border h-3 ml-2 mr-1 rounded-bl-sm" />}
          {a.code || '—'}
        </div>
      </TableCell>
      <TableCell className={cn('text-xs', !isChild && hasChildren ? 'font-semibold' : '')}>
        <span className="inline-flex items-center gap-1.5">
          {a.description}
          {!isChild && hasChildren && (
            <span className="inline-flex items-center justify-center rounded-full bg-primary/10 text-primary text-[9px] font-semibold min-w-[18px] h-[18px] px-1">
              {(childrenMap[a.id] || []).length}
            </span>
          )}
        </span>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{a.classification || '—'}</TableCell>
      <TableCell><span className={cn('text-[10px] px-2 py-0.5 rounded-full', typeColors[a.account_type] || 'bg-muted text-muted-foreground')}>{a.account_type}</span></TableCell>
      <TableCell className="text-xs text-muted-foreground">{a.currency || '—'}</TableCell>
      <TableCell className={cn('text-xs text-right font-mono', balance > 0 ? (!isChild && hasChildren ? 'font-bold text-foreground' : 'text-muted-foreground') : 'text-muted-foreground/50')}>
        {balance > 0 ? `$${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing({ ...a, parent_id: a.parent_id || '' })}><Pencil className="w-3 h-3" /></Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleting(a)}><Trash2 className="w-3 h-3" /></Button>
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
          <Button size="sm" variant="outline" onClick={() => exportToExcel(accounts.map(a => ({ Código: a.code, Descripción: a.description, Clasificación: a.classification, Tipo: a.account_type, Moneda: a.currency })), 'catalogo_cuentas', 'Cuentas')}><Download className="w-3.5 h-3.5 mr-1" />Excel</Button>
          <Button size="sm" onClick={() => setEditing({ code: '', description: '', classification: '', account_type: 'Gasto', currency: '', parent_id: '' })}><Plus className="w-3.5 h-3.5 mr-1" />Nueva</Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="text-xs w-28">Código</TableHead>
            <TableHead className="text-xs">Descripción</TableHead>
            <TableHead className="text-xs">Clasificación</TableHead>
            <TableHead className="text-xs">Tipo</TableHead>
            <TableHead className="text-xs">Moneda</TableHead>
            <TableHead className="text-xs text-right">Saldo (USD)</TableHead>
            <TableHead className="text-xs w-20"></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {parentAccounts.map((a: any) => {
              const children = childrenMap[a.id] || [];
              const hasChildren = children.length > 0;
              const isCollapsed = !!collapsed[a.id];
              return (
                <Fragment key={a.id}>
                  {renderRow(a, false, hasChildren, isCollapsed)}
                  {!isCollapsed && children.map((child: any) => renderRow(child, true, false, false))}
                </Fragment>
              );
            })}
            {parentAccounts.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-8">{isLoading ? 'Cargando...' : 'Sin registros'}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

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
    </div>
  );
}
