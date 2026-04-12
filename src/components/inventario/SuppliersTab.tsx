import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { formatUSD } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Building2 } from 'lucide-react';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';

export function SuppliersTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editSupplier, setEditSupplier] = useState<any>(null);
  const [deleteSupplier, setDeleteSupplier] = useState<any>(null);

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data } = await supabase.from('suppliers').select('*').order('name');
      return data || [];
    },
  });

  // Get shipment stats per supplier
  const { data: shipments = [] } = useQuery({
    queryKey: ['shipments'],
    queryFn: async () => {
      const { data } = await supabase.from('shipments').select('supplier_name, total_cost_usd, status, created_at');
      return data || [];
    },
  });

  const supplierStats = suppliers.map((s: any) => {
    const sShipments = shipments.filter((sh: any) => sh.supplier_name === s.name);
    const totalSpent = sShipments.reduce((sum: number, sh: any) => sum + Number(sh.total_cost_usd || 0), 0);
    const orderCount = sShipments.length;
    return { ...s, totalSpent, orderCount };
  });

  const handleDelete = async () => {
    if (!deleteSupplier) return;
    const { error } = await supabase.from('suppliers').delete().eq('id', deleteSupplier.id);
    if (error) { toast.error('Error al eliminar'); throw error; }
    toast.success('Proveedor eliminado');
    queryClient.invalidateQueries({ queryKey: ['suppliers'] });
  };

  return (
    <div className="space-y-4">
      <Button size="sm" onClick={() => { setEditSupplier(null); setShowForm(true); }}>
        <Plus className="w-3.5 h-3.5 mr-1" /> Nuevo Proveedor
      </Button>

      <div className="rounded-xl border border-border bg-card overflow-hidden max-h-[calc(100vh-280px)] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
            <TableRow>
              <TableHead className="text-xs">Proveedor</TableHead>
              <TableHead className="text-xs">Contacto</TableHead>
              <TableHead className="text-xs">Email</TableHead>
              <TableHead className="text-xs">Teléfono</TableHead>
              <TableHead className="text-xs text-right">Órdenes</TableHead>
              <TableHead className="text-xs text-right">Total Compras</TableHead>
              <TableHead className="text-xs">Estado</TableHead>
              <TableHead className="text-xs w-[80px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {supplierStats.map((s: any) => (
              <TableRow key={s.id}>
                <TableCell className="text-xs font-medium">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                    {s.name}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{s.contact_name || '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{s.email || '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{s.phone || '—'}</TableCell>
                <TableCell className="text-xs text-right font-mono">{s.orderCount}</TableCell>
                <TableCell className="text-xs text-right font-mono font-bold text-primary">{formatUSD(s.totalSpent)}</TableCell>
                <TableCell>
                  <span className={cn('px-2 py-0.5 rounded-full text-[10px] font-semibold',
                    s.is_active ? 'bg-success/15 text-success' : 'bg-muted text-muted-foreground')}>
                    {s.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditSupplier(s); setShowForm(true); }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setDeleteSupplier(s)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {suppliers.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Sin proveedores registrados</p>}
      </div>

      <SupplierFormDialog open={showForm} onOpenChange={v => { setShowForm(v); if (!v) setEditSupplier(null); }} editSupplier={editSupplier} />
      <DeleteConfirmDialog open={!!deleteSupplier} onOpenChange={v => { if (!v) setDeleteSupplier(null); }}
        title="Eliminar proveedor" description={`¿Eliminar ${deleteSupplier?.name}? Esta acción no se puede deshacer.`}
        onConfirm={handleDelete} />
    </div>
  );
}

function SupplierFormDialog({ open, onOpenChange, editSupplier }: { open: boolean; onOpenChange: (v: boolean) => void; editSupplier: any }) {
  const queryClient = useQueryClient();
  const isEdit = !!editSupplier;
  const [form, setForm] = useState({ name: '', contact_name: '', email: '', phone: '', address: '', notes: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editSupplier) {
      setForm({
        name: editSupplier.name || '', contact_name: editSupplier.contact_name || '',
        email: editSupplier.email || '', phone: editSupplier.phone || '',
        address: editSupplier.address || '', notes: editSupplier.notes || '',
      });
    } else {
      setForm({ name: '', contact_name: '', email: '', phone: '', address: '', notes: '' });
    }
  }, [editSupplier, open]);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Nombre requerido'); return; }
    setSaving(true);
    const payload = { ...form, name: form.name.trim() };
    const { error } = isEdit
      ? await supabase.from('suppliers').update(payload).eq('id', editSupplier.id)
      : await supabase.from('suppliers').insert(payload);
    setSaving(false);
    if (error) { toast.error('Error'); return; }
    toast.success(isEdit ? 'Proveedor actualizado' : 'Proveedor creado');
    queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{isEdit ? 'Editar Proveedor' : 'Nuevo Proveedor'}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label className="text-xs">Nombre *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1" /></div>
            <div><Label className="text-xs">Contacto</Label><Input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} className="mt-1" /></div>
            <div><Label className="text-xs">Email</Label><Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="mt-1" /></div>
            <div><Label className="text-xs">Teléfono</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="mt-1" /></div>
          </div>
          <div><Label className="text-xs">Dirección</Label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="mt-1" /></div>
          <div><Label className="text-xs">Notas</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="mt-1" /></div>
          <Button onClick={handleSave} disabled={saving} className="w-full">{saving ? 'Guardando...' : isEdit ? 'Actualizar' : 'Crear Proveedor'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
