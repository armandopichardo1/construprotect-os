import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { type Contact, SEGMENTS, PRICE_TIERS, PRICE_TIER_LABELS } from '@/lib/crm-utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Pencil, Trash2, Star, Search, Upload, Plus, Eye } from 'lucide-react';

interface ContactsTabProps {
  contacts: Contact[];
  onEdit: (c: Contact) => void;
  onDelete: (c: Contact) => void;
  onNew: () => void;
  onView?: (c: Contact) => void;
}

export function ContactsTab({ contacts, onEdit, onDelete, onNew, onView }: ContactsTabProps) {
  const [search, setSearch] = useState('');
  const [segFilter, setSegFilter] = useState('all');

  const filtered = contacts.filter(c => {
    const matchSearch = !search || c.contact_name.toLowerCase().includes(search.toLowerCase()) || (c.company_name || '').toLowerCase().includes(search.toLowerCase());
    const matchSeg = segFilter === 'all' || c.segment === segFilter;
    return matchSearch && matchSeg;
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="h-8 text-xs pl-8 rounded-xl" />
        </div>
        <Select value={segFilter} onValueChange={setSegFilter}>
          <SelectTrigger className="h-8 text-xs w-auto min-w-[100px] rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Todos</SelectItem>
            {SEGMENTS.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <p className="text-[10px] text-muted-foreground">{filtered.length} contactos</p>

      {filtered.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No hay contactos</p>}
      {filtered.map(c => (
        <div key={c.id} className="rounded-xl bg-card border border-border p-3">
          <div className="flex justify-between items-start">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium text-foreground truncate">{c.contact_name}</p>
                {Array.from({ length: Math.min(c.priority || 0, 5) }).map((_, i) => (
                  <Star key={i} className="w-2.5 h-2.5 text-warning fill-warning" />
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground truncate">{c.company_name || '—'}</p>
            </div>
            <div className="flex items-center gap-1 ml-2">
              {c.segment && (
                <span className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-primary/15 text-primary">{c.segment}</span>
              )}
              {onView && <button onClick={() => onView(c)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"><Eye className="w-3 h-3" /></button>}
              <button onClick={() => onEdit(c)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"><Pencil className="w-3 h-3" /></button>
              <button onClick={() => onDelete(c)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-3 h-3" /></button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted-foreground">
            {c.phone && <span>📞 {c.phone}</span>}
            {c.email && <span>📧 {c.email}</span>}
            <span className="text-foreground font-medium">${Number(c.lifetime_revenue_usd).toLocaleString()}</span>
            <span>{c.total_orders} pedidos</span>
          </div>
          {c.tags && c.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {c.tags.map(t => <span key={t} className="px-1.5 py-0.5 rounded-full text-[8px] bg-muted text-muted-foreground">{t}</span>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Contact Dialog (create/edit)
interface ContactDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  queryClient: any;
  editContact?: Contact | null;
}

export function ContactDialog({ open, onOpenChange, queryClient, editContact }: ContactDialogProps) {
  const [form, setForm] = useState({
    contact_name: '', company_name: '', rnc: '', email: '', phone: '', whatsapp: '',
    segment: '', priority: '3', territory: '', address: '', source: '', price_tier: 'list', notes: ''
  });
  const [saving, setSaving] = useState(false);
  const isEdit = !!editContact;

  useEffect(() => {
    if (editContact) {
      setForm({
        contact_name: editContact.contact_name || '',
        company_name: editContact.company_name || '',
        rnc: editContact.rnc || '',
        email: editContact.email || '',
        phone: editContact.phone || '',
        whatsapp: editContact.whatsapp || '',
        segment: editContact.segment || '',
        priority: String(editContact.priority || 3),
        territory: editContact.territory || '',
        address: editContact.address || '',
        source: editContact.source || '',
        price_tier: editContact.price_tier || 'list',
        notes: editContact.notes || '',
      });
    } else {
      setForm({ contact_name: '', company_name: '', rnc: '', email: '', phone: '', whatsapp: '', segment: '', priority: '3', territory: '', address: '', source: '', price_tier: 'list', notes: '' });
    }
  }, [editContact, open]);

  const handleSave = async () => {
    if (!form.contact_name.trim()) { toast.error('El nombre es requerido'); return; }
    setSaving(true);
    const payload: any = {
      contact_name: form.contact_name.trim(),
      company_name: form.company_name.trim() || null,
      rnc: form.rnc.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      segment: form.segment || null,
      priority: Number(form.priority) || 3,
      territory: form.territory.trim() || null,
      address: form.address.trim() || null,
      source: form.source.trim() || null,
      price_tier: form.price_tier,
      notes: form.notes.trim() || null,
    };
    const { error } = isEdit
      ? await supabase.from('contacts').update(payload).eq('id', editContact!.id)
      : await supabase.from('contacts').insert(payload);
    setSaving(false);
    if (error) { toast.error('Error al guardar contacto'); return; }
    toast.success(isEdit ? 'Contacto actualizado' : 'Contacto creado');
    queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-base">{isEdit ? 'Editar Contacto' : 'Nuevo Contacto'}</DialogTitle></DialogHeader>
        <div className="space-y-2.5">
          <div><Label className="text-xs">Nombre *</Label><Input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} className="h-8 text-xs mt-1" /></div>
          <div><Label className="text-xs">Empresa</Label><Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} className="h-8 text-xs mt-1" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">RNC</Label><Input value={form.rnc} onChange={e => setForm(f => ({ ...f, rnc: e.target.value }))} className="h-8 text-xs mt-1" /></div>
            <div>
              <Label className="text-xs">Segmento</Label>
              <Select value={form.segment} onValueChange={v => setForm(f => ({ ...f, segment: v }))}>
                <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{SEGMENTS.map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Teléfono</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="h-8 text-xs mt-1" /></div>
            <div><Label className="text-xs">WhatsApp</Label><Input value={form.whatsapp} onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))} className="h-8 text-xs mt-1" /></div>
          </div>
          <div><Label className="text-xs">Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="h-8 text-xs mt-1" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Prioridad (1-5)</Label>
              <Input type="number" min={1} max={5} value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} className="h-8 text-xs mt-1" />
            </div>
            <div>
              <Label className="text-xs">Tier Precio</Label>
              <Select value={form.price_tier} onValueChange={v => setForm(f => ({ ...f, price_tier: v }))}>
                <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{PRICE_TIERS.map(t => <SelectItem key={t} value={t} className="text-xs">{PRICE_TIER_LABELS[t]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label className="text-xs">Territorio</Label><Input value={form.territory} onChange={e => setForm(f => ({ ...f, territory: e.target.value }))} className="h-8 text-xs mt-1" /></div>
          <div><Label className="text-xs">Notas</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="text-xs mt-1" rows={2} /></div>
          <Button onClick={handleSave} disabled={saving} className="w-full rounded-xl text-xs">
            {saving ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Crear Contacto'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
