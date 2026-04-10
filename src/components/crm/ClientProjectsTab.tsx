import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { type Contact } from '@/lib/crm-utils';
import { formatUSD } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, MapPin, Ruler, Calendar } from 'lucide-react';

const STATUS_MAP: Record<string, { label: string; style: string }> = {
  planning: { label: 'Planificación', style: 'bg-muted text-muted-foreground' },
  active: { label: 'Activo', style: 'bg-primary/15 text-primary' },
  completed: { label: 'Completado', style: 'bg-success/15 text-success' },
  cancelled: { label: 'Cancelado', style: 'bg-destructive/15 text-destructive' },
};

interface ClientProjectsTabProps {
  contacts: Contact[];
}

export function ClientProjectsTab({ contacts }: ClientProjectsTabProps) {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editProject, setEditProject] = useState<any>(null);
  const [deleteProject, setDeleteProject] = useState<any>(null);

  const { data: projects = [] } = useQuery({
    queryKey: ['client-projects'],
    queryFn: async () => {
      const { data, error } = await supabase.from('client_projects').select('*, contacts(contact_name, company_name)').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const handleDelete = async () => {
    if (!deleteProject) return;
    const { error } = await supabase.from('client_projects').delete().eq('id', deleteProject.id);
    if (error) { toast.error('Error al eliminar'); return; }
    toast.success('Proyecto eliminado');
    queryClient.invalidateQueries({ queryKey: ['client-projects'] });
    setDeleteProject(null);
  };

  return (
    <div className="space-y-3">
      <Button size="sm" onClick={() => { setEditProject(null); setShowDialog(true); }}>
        <Plus className="w-3.5 h-3.5 mr-1" /> Proyecto
      </Button>

      {projects.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Sin proyectos de clientes</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {projects.map((p: any) => {
          const statusInfo = STATUS_MAP[p.status] || STATUS_MAP.planning;
          return (
            <div key={p.id} className="rounded-xl bg-card border border-border p-4 space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-foreground">{p.project_name}</p>
                  <p className="text-[10px] text-muted-foreground">{p.contacts?.contact_name} · {p.contacts?.company_name || '—'}</p>
                </div>
                <div className="flex items-center gap-1">
                  <Badge className={`text-[9px] ${statusInfo.style}`}>{statusInfo.label}</Badge>
                  <button onClick={() => { setEditProject(p); setShowDialog(true); }} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"><Pencil className="w-3 h-3" /></button>
                  <button onClick={() => setDeleteProject(p)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                {p.location && <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" /> {p.location}</span>}
                {p.area_m2 && <span className="flex items-center gap-0.5"><Ruler className="w-2.5 h-2.5" /> {p.area_m2} m²</span>}
                {p.estimated_value_usd > 0 && <span className="font-medium text-foreground">{formatUSD(Number(p.estimated_value_usd))}</span>}
                {p.start_date && <span className="flex items-center gap-0.5"><Calendar className="w-2.5 h-2.5" /> {p.start_date}</span>}
              </div>
              {p.notes && <p className="text-[10px] text-muted-foreground line-clamp-2">{p.notes}</p>}
            </div>
          );
        })}
      </div>

      <ProjectDialog
        open={showDialog}
        onOpenChange={(v) => { setShowDialog(v); if (!v) setEditProject(null); }}
        contacts={contacts}
        editProject={editProject}
        queryClient={queryClient}
      />

      {deleteProject && (
        <Dialog open={!!deleteProject} onOpenChange={(v) => { if (!v) setDeleteProject(null); }}>
          <DialogContent className="max-w-xs">
            <DialogHeader><DialogTitle className="text-sm">¿Eliminar proyecto?</DialogTitle></DialogHeader>
            <p className="text-xs text-muted-foreground">Se eliminará "{deleteProject.project_name}". Esta acción no se puede deshacer.</p>
            <div className="flex gap-2 mt-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setDeleteProject(null)}>Cancelar</Button>
              <Button variant="destructive" size="sm" className="flex-1" onClick={handleDelete}>Eliminar</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function ProjectDialog({ open, onOpenChange, contacts, editProject, queryClient }: any) {
  const [form, setForm] = useState({
    project_name: '', contact_id: '', location: '', area_m2: '', estimated_value_usd: '',
    status: 'planning', start_date: '', end_date: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const isEdit = !!editProject;

  useEffect(() => {
    if (editProject) {
      setForm({
        project_name: editProject.project_name || '',
        contact_id: editProject.contact_id || '',
        location: editProject.location || '',
        area_m2: String(editProject.area_m2 || ''),
        estimated_value_usd: String(editProject.estimated_value_usd || ''),
        status: editProject.status || 'planning',
        start_date: editProject.start_date || '',
        end_date: editProject.end_date || '',
        notes: editProject.notes || '',
      });
    } else {
      setForm({ project_name: '', contact_id: '', location: '', area_m2: '', estimated_value_usd: '', status: 'planning', start_date: '', end_date: '', notes: '' });
    }
  }, [editProject, open]);

  const handleSave = async () => {
    if (!form.project_name.trim() || !form.contact_id) { toast.error('Nombre y contacto requeridos'); return; }
    setSaving(true);
    const payload: any = {
      project_name: form.project_name.trim(),
      contact_id: form.contact_id,
      location: form.location.trim() || null,
      area_m2: form.area_m2 ? Number(form.area_m2) : null,
      estimated_value_usd: form.estimated_value_usd ? Number(form.estimated_value_usd) : 0,
      status: form.status as any,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      notes: form.notes.trim() || null,
    };
    const { error } = isEdit
      ? await supabase.from('client_projects').update(payload).eq('id', editProject.id)
      : await supabase.from('client_projects').insert(payload);
    setSaving(false);
    if (error) { toast.error('Error al guardar'); return; }
    toast.success(isEdit ? 'Proyecto actualizado' : 'Proyecto creado');
    queryClient.invalidateQueries({ queryKey: ['client-projects'] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-base">{isEdit ? 'Editar Proyecto' : 'Nuevo Proyecto'}</DialogTitle></DialogHeader>
        <div className="space-y-2.5">
          <div><Label className="text-xs">Nombre del Proyecto *</Label><Input value={form.project_name} onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))} className="h-8 text-xs mt-1" /></div>
          <div>
            <Label className="text-xs">Contacto *</Label>
            <Select value={form.contact_id} onValueChange={v => setForm(f => ({ ...f, contact_id: v }))}>
              <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent className="max-h-48">
                {contacts.map((c: any) => <SelectItem key={c.id} value={c.id} className="text-xs">{c.contact_name} — {c.company_name || '—'}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Ubicación</Label><Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className="h-8 text-xs mt-1" /></div>
            <div><Label className="text-xs">Área (m²)</Label><Input type="number" value={form.area_m2} onChange={e => setForm(f => ({ ...f, area_m2: e.target.value }))} className="h-8 text-xs mt-1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Valor Estimado USD</Label><Input type="number" value={form.estimated_value_usd} onChange={e => setForm(f => ({ ...f, estimated_value_usd: e.target.value }))} className="h-8 text-xs mt-1" /></div>
            <div>
              <Label className="text-xs">Estado</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_MAP).map(([k, v]) => <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Fecha Inicio</Label><Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="h-8 text-xs mt-1" /></div>
            <div><Label className="text-xs">Fecha Fin</Label><Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="h-8 text-xs mt-1" /></div>
          </div>
          <div><Label className="text-xs">Notas</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="text-xs mt-1" rows={2} /></div>
          <Button onClick={handleSave} disabled={saving} className="w-full rounded-xl text-xs">
            {saving ? 'Guardando...' : isEdit ? 'Guardar' : 'Crear Proyecto'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
