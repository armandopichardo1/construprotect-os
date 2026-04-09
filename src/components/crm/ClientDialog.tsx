import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface ClientDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  queryClient: any;
  editClient?: any | null;
}

export function ClientDialog({ open, onOpenChange, queryClient, editClient }: ClientDialogProps) {
  const [form, setForm] = useState({ name: '', company: '', email: '', phone: '', status: 'prospect' });
  const [saving, setSaving] = useState(false);
  const isEdit = !!editClient;

  useEffect(() => {
    if (editClient) {
      setForm({
        name: editClient.name || '',
        company: editClient.company || '',
        email: editClient.email || '',
        phone: editClient.phone || '',
        status: editClient.status || 'prospect',
      });
    } else {
      setForm({ name: '', company: '', email: '', phone: '', status: 'prospect' });
    }
  }, [editClient, open]);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('El nombre es requerido'); return; }
    setSaving(true);

    const payload = {
      name: form.name.trim(),
      company: form.company.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      status: form.status,
    };

    const { error } = isEdit
      ? await supabase.from('crm_clients').update(payload).eq('id', editClient.id)
      : await supabase.from('crm_clients').insert(payload);

    setSaving(false);
    if (error) { toast.error(`Error al ${isEdit ? 'actualizar' : 'guardar'} cliente`); return; }
    toast.success(isEdit ? 'Cliente actualizado' : 'Cliente creado');
    queryClient.invalidateQueries({ queryKey: ['crm-clients'] });
    queryClient.invalidateQueries({ queryKey: ['crm-opportunities'] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-base">{isEdit ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Nombre *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-9 text-sm mt-1" /></div>
          <div><Label className="text-xs">Empresa</Label><Input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} className="h-9 text-sm mt-1" /></div>
          <div><Label className="text-xs">Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="h-9 text-sm mt-1" /></div>
          <div><Label className="text-xs">Teléfono</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="h-9 text-sm mt-1" /></div>
          <div>
            <Label className="text-xs">Estado</Label>
            <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
              <SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="prospect">Prospecto</SelectItem>
                <SelectItem value="active">Activo</SelectItem>
                <SelectItem value="inactive">Inactivo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-full rounded-xl">
            {saving ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Crear Cliente'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
