import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { type Deal, type DealStage, DEAL_STAGES, type Contact } from '@/lib/crm-utils';

interface DealDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contacts: Contact[];
  queryClient: any;
  editDeal?: Deal | null;
}

const STAGES = Object.keys(DEAL_STAGES) as DealStage[];

export function DealDialog({ open, onOpenChange, contacts, queryClient, editDeal }: DealDialogProps) {
  const [form, setForm] = useState({
    contact_id: '', title: '', stage: 'prospecting' as string, value_usd: '', probability: '50',
    expected_close_date: '', project_name: '', project_size_m2: '', notes: ''
  });
  const [saving, setSaving] = useState(false);
  const isEdit = !!editDeal;

  useEffect(() => {
    if (editDeal) {
      setForm({
        contact_id: editDeal.contact_id, title: editDeal.title,
        stage: editDeal.stage, value_usd: String(editDeal.value_usd || ''),
        probability: String(editDeal.probability ?? 50),
        expected_close_date: editDeal.expected_close_date || '',
        project_name: editDeal.project_name || '',
        project_size_m2: String(editDeal.project_size_m2 || ''),
        notes: editDeal.notes || '',
      });
    } else {
      setForm({ contact_id: '', title: '', stage: 'prospecting', value_usd: '', probability: '50', expected_close_date: '', project_name: '', project_size_m2: '', notes: '' });
    }
  }, [editDeal, open]);

  const handleSave = async () => {
    if (!form.contact_id) { toast.error('Selecciona un contacto'); return; }
    if (!form.title.trim()) { toast.error('El título es requerido'); return; }
    setSaving(true);
    const payload: any = {
      contact_id: form.contact_id, title: form.title.trim(),
      stage: form.stage, value_usd: Number(form.value_usd) || 0,
      probability: Number(form.probability) || 50,
      expected_close_date: form.expected_close_date || null,
      project_name: form.project_name.trim() || null,
      project_size_m2: Number(form.project_size_m2) || null,
      notes: form.notes.trim() || null,
    };
    const { error } = isEdit
      ? await supabase.from('deals').update(payload).eq('id', editDeal!.id)
      : await supabase.from('deals').insert(payload);
    setSaving(false);
    if (error) { toast.error('Error al guardar deal'); return; }
    toast.success(isEdit ? 'Deal actualizado' : 'Deal creado');
    queryClient.invalidateQueries({ queryKey: ['crm-deals'] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-base">{isEdit ? 'Editar Deal' : 'Nuevo Deal'}</DialogTitle></DialogHeader>
        <div className="space-y-2.5">
          <div>
            <Label className="text-xs">Contacto *</Label>
            <Select value={form.contact_id} onValueChange={v => setForm(f => ({ ...f, contact_id: v }))}>
              <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent>{contacts.map(c => <SelectItem key={c.id} value={c.id} className="text-xs">{c.contact_name} {c.company_name ? `· ${c.company_name}` : ''}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Título *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="h-8 text-xs mt-1" placeholder="Ej: Piso porcelanato oficina" /></div>
          <div>
            <Label className="text-xs">Etapa</Label>
            <Select value={form.stage} onValueChange={v => setForm(f => ({ ...f, stage: v }))}>
              <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{STAGES.map(s => <SelectItem key={s} value={s} className="text-xs">{DEAL_STAGES[s].emoji} {DEAL_STAGES[s].label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Valor USD</Label><Input type="number" value={form.value_usd} onChange={e => setForm(f => ({ ...f, value_usd: e.target.value }))} className="h-8 text-xs mt-1" /></div>
            <div><Label className="text-xs">Probabilidad %</Label><Input type="number" value={form.probability} onChange={e => setForm(f => ({ ...f, probability: e.target.value }))} className="h-8 text-xs mt-1" /></div>
          </div>
          <div><Label className="text-xs">Cierre esperado</Label><Input type="date" value={form.expected_close_date} onChange={e => setForm(f => ({ ...f, expected_close_date: e.target.value }))} className="h-8 text-xs mt-1" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Proyecto</Label><Input value={form.project_name} onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))} className="h-8 text-xs mt-1" /></div>
            <div><Label className="text-xs">Tamaño m²</Label><Input type="number" value={form.project_size_m2} onChange={e => setForm(f => ({ ...f, project_size_m2: e.target.value }))} className="h-8 text-xs mt-1" /></div>
          </div>
          <div><Label className="text-xs">Notas</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="text-xs mt-1" rows={2} /></div>
          <Button onClick={handleSave} disabled={saving} className="w-full rounded-xl text-xs">{saving ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Crear Deal'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
