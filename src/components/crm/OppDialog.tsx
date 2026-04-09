import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { STAGE_CONFIG } from './OppCard';

interface OppDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clients: any[];
  queryClient: any;
  editOpp?: any | null;
}

export function OppDialog({ open, onOpenChange, clients, queryClient, editOpp }: OppDialogProps) {
  const [form, setForm] = useState({ client_id: '', title: '', stage: 'prospecto', value_usd: '', probability_pct: '50', notes: '' });
  const [saving, setSaving] = useState(false);
  const isEdit = !!editOpp;

  useEffect(() => {
    if (editOpp) {
      setForm({
        client_id: editOpp.client_id || '',
        title: editOpp.title || '',
        stage: editOpp.stage || 'prospecto',
        value_usd: String(editOpp.value_usd || ''),
        probability_pct: String(editOpp.probability_pct ?? '50'),
        notes: editOpp.notes || '',
      });
    } else {
      setForm({ client_id: '', title: '', stage: 'prospecto', value_usd: '', probability_pct: '50', notes: '' });
    }
  }, [editOpp, open]);

  const handleSave = async () => {
    if (!form.client_id) { toast.error('Selecciona un cliente'); return; }
    if (!form.title.trim()) { toast.error('El título es requerido'); return; }
    setSaving(true);

    const payload = {
      client_id: form.client_id,
      title: form.title.trim(),
      stage: form.stage as "prospecto" | "contactado" | "cotizado" | "negociacion" | "cerrado_ganado" | "cerrado_perdido",
      value_usd: Number(form.value_usd) || 0,
      probability_pct: Number(form.probability_pct) || 50,
      notes: form.notes.trim() || null,
    };

    const { error } = isEdit
      ? await supabase.from('crm_opportunities').update(payload).eq('id', editOpp.id)
      : await supabase.from('crm_opportunities').insert(payload);

    setSaving(false);
    if (error) { toast.error(`Error al ${isEdit ? 'actualizar' : 'guardar'} oportunidad`); return; }
    toast.success(isEdit ? 'Oportunidad actualizada' : 'Oportunidad creada');
    queryClient.invalidateQueries({ queryKey: ['crm-opportunities'] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-base">{isEdit ? 'Editar Oportunidad' : 'Nueva Oportunidad'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Cliente *</Label>
            <Select value={form.client_id} onValueChange={v => setForm(f => ({ ...f, client_id: v }))}>
              <SelectTrigger className="h-9 text-sm mt-1"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent>
                {clients.map((c: any) => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">{c.name} {c.company ? `· ${c.company}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">Título *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="h-9 text-sm mt-1" placeholder="Ej: Piso porcelanato oficina" /></div>
          <div>
            <Label className="text-xs">Etapa</Label>
            <Select value={form.stage} onValueChange={v => setForm(f => ({ ...f, stage: v }))}>
              <SelectTrigger className="h-9 text-sm mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STAGE_CONFIG).map(([key, s]) => (
                  <SelectItem key={key} value={key} className="text-xs">{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Valor USD</Label><Input type="number" value={form.value_usd} onChange={e => setForm(f => ({ ...f, value_usd: e.target.value }))} className="h-9 text-sm mt-1" /></div>
            <div><Label className="text-xs">Probabilidad %</Label><Input type="number" value={form.probability_pct} onChange={e => setForm(f => ({ ...f, probability_pct: e.target.value }))} className="h-9 text-sm mt-1" /></div>
          </div>
          <div><Label className="text-xs">Notas</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="text-sm mt-1" rows={2} /></div>
          <Button onClick={handleSave} disabled={saving} className="w-full rounded-xl">
            {saving ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Crear Oportunidad'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
