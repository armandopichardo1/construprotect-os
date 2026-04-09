import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { type Activity, type ActivityType, ACTIVITY_TYPES, type Contact, type Deal } from '@/lib/crm-utils';

interface ActivityDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contacts: Contact[];
  deals: Deal[];
  queryClient: any;
  editActivity?: Activity | null;
}

const TYPES = Object.keys(ACTIVITY_TYPES) as ActivityType[];

export function ActivityDialog({ open, onOpenChange, contacts, deals, queryClient, editActivity }: ActivityDialogProps) {
  const [form, setForm] = useState({
    contact_id: '', deal_id: '', activity_type: 'call' as string, title: '', description: '', due_date: ''
  });
  const [saving, setSaving] = useState(false);
  const isEdit = !!editActivity;

  useEffect(() => {
    if (editActivity) {
      setForm({
        contact_id: editActivity.contact_id || '',
        deal_id: editActivity.deal_id || '',
        activity_type: editActivity.activity_type,
        title: editActivity.title || '',
        description: editActivity.description || '',
        due_date: editActivity.due_date ? editActivity.due_date.split('T')[0] : '',
      });
    } else {
      const today = new Date().toISOString().split('T')[0];
      setForm({ contact_id: '', deal_id: '', activity_type: 'call', title: '', description: '', due_date: today });
    }
  }, [editActivity, open]);

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('El título es requerido'); return; }
    setSaving(true);
    const payload: any = {
      contact_id: form.contact_id || null,
      deal_id: form.deal_id || null,
      activity_type: form.activity_type,
      title: form.title.trim(),
      description: form.description.trim() || null,
      due_date: form.due_date ? new Date(form.due_date).toISOString() : null,
    };
    const { error } = isEdit
      ? await supabase.from('activities').update(payload).eq('id', editActivity!.id)
      : await supabase.from('activities').insert(payload);
    setSaving(false);
    if (error) { toast.error('Error al guardar actividad'); return; }
    toast.success(isEdit ? 'Actividad actualizada' : 'Actividad creada');
    queryClient.invalidateQueries({ queryKey: ['crm-activities'] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-base">{isEdit ? 'Editar Actividad' : 'Nueva Actividad'}</DialogTitle></DialogHeader>
        <div className="space-y-2.5">
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={form.activity_type} onValueChange={v => setForm(f => ({ ...f, activity_type: v }))}>
              <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{ACTIVITY_TYPES[t].emoji} {ACTIVITY_TYPES[t].label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Título *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="h-8 text-xs mt-1" placeholder="Ej: Llamar para seguimiento" /></div>
          <div>
            <Label className="text-xs">Contacto</Label>
            <Select value={form.contact_id} onValueChange={v => setForm(f => ({ ...f, contact_id: v }))}>
              <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Opcional" /></SelectTrigger>
              <SelectContent>{contacts.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.contact_name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Fecha</Label><Input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} className="h-8 text-xs mt-1" /></div>
          <div><Label className="text-xs">Descripción</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="text-xs mt-1" rows={2} /></div>
          <Button onClick={handleSave} disabled={saving} className="w-full rounded-xl text-xs">{saving ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Crear Actividad'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
