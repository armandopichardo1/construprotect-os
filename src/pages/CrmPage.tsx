import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Users, TrendingUp } from 'lucide-react';

const STAGE_CONFIG: Record<string, { label: string; color: string; order: number }> = {
  prospecto: { label: 'Prospecto', color: 'bg-muted', order: 0 },
  contactado: { label: 'Contactado', color: 'bg-primary/30', order: 1 },
  cotizado: { label: 'Cotizado', color: 'bg-primary/50', order: 2 },
  negociacion: { label: 'Negociación', color: 'bg-primary/70', order: 3 },
  cerrado_ganado: { label: 'Cerrado ✅', color: 'bg-success', order: 4 },
  cerrado_perdido: { label: 'Perdido ❌', color: 'bg-destructive/50', order: 5 },
};

export default function CrmPage() {
  const [tab, setTab] = useState<'pipeline' | 'clients'>('pipeline');
  const [showClientDialog, setShowClientDialog] = useState(false);
  const [showOppDialog, setShowOppDialog] = useState(false);
  const queryClient = useQueryClient();

  // Fetch clients
  const { data: clients = [] } = useQuery({
    queryKey: ['crm-clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_clients')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch opportunities with client info
  const { data: opportunities = [] } = useQuery({
    queryKey: ['crm-opportunities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_opportunities')
        .select('*, crm_clients(name, company)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Pipeline stats
  const pipelineStages = Object.entries(STAGE_CONFIG)
    .filter(([key]) => key !== 'cerrado_perdido')
    .map(([key, cfg]) => {
      const stageOpps = opportunities.filter((o: any) => o.stage === key);
      return {
        key,
        name: cfg.label,
        color: cfg.color,
        count: stageOpps.length,
        value: stageOpps.reduce((sum: number, o: any) => sum + Number(o.value_usd || 0), 0),
      };
    });

  const activeOpps = opportunities.filter((o: any) => o.stage !== 'cerrado_perdido');
  const totalPipelineValue = activeOpps.reduce((sum: number, o: any) => sum + Number(o.value_usd || 0), 0);

  // Client stats
  const clientsWithStats = clients.map((c: any) => {
    const clientOpps = opportunities.filter((o: any) => o.client_id === c.id);
    return {
      ...c,
      deals: clientOpps.length,
      totalValue: clientOpps.reduce((sum: number, o: any) => sum + Number(o.value_usd || 0), 0),
    };
  });

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-foreground">CRM</h1>
          <Button
            size="sm"
            className="h-8 text-xs rounded-xl"
            onClick={() => tab === 'clients' ? setShowClientDialog(true) : setShowOppDialog(true)}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            {tab === 'clients' ? 'Cliente' : 'Oportunidad'}
          </Button>
        </div>

        <div className="flex gap-1 rounded-xl bg-muted p-1">
          {(['pipeline', 'clients'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              )}
            >
              {t === 'pipeline' ? 'Pipeline' : 'Clientes'}
            </button>
          ))}
        </div>

        {tab === 'pipeline' && (
          <div className="space-y-3">
            <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Embudo de Ventas</h2>
              {pipelineStages.map((s, i) => (
                <div key={s.key} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-foreground">{s.name} ({s.count})</span>
                    <span className="text-muted-foreground">${s.value >= 1000 ? (s.value / 1000).toFixed(0) + 'K' : s.value}</span>
                  </div>
                  <div className="h-3 rounded-full bg-muted overflow-hidden" style={{ width: `${100 - i * 15}%` }}>
                    <div className={cn('h-full rounded-full', s.color)} style={{ width: '100%' }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-card border border-border p-3 text-center">
                <p className="text-xl font-bold text-foreground">{activeOpps.length}</p>
                <p className="text-[10px] text-muted-foreground">Oportunidades activas</p>
              </div>
              <div className="rounded-xl bg-card border border-border p-3 text-center">
                <p className="text-xl font-bold text-primary">
                  ${totalPipelineValue >= 1000 ? (totalPipelineValue / 1000).toFixed(0) + 'K' : totalPipelineValue}
                </p>
                <p className="text-[10px] text-muted-foreground">Valor total pipeline</p>
              </div>
            </div>

            {/* Opportunities list */}
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">Oportunidades</h2>
              {opportunities.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">No hay oportunidades aún</p>
              )}
              {opportunities.map((o: any) => (
                <OppCard key={o.id} opp={o} queryClient={queryClient} />
              ))}
            </div>
          </div>
        )}

        {tab === 'clients' && (
          <div className="space-y-2">
            {clientsWithStats.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">No hay clientes aún</p>
            )}
            {clientsWithStats.map((c: any) => (
              <div key={c.id} className="rounded-xl bg-card border border-border p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.name}</p>
                    <p className="text-[10px] text-muted-foreground">{c.company || '—'}</p>
                  </div>
                  <span className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-semibold',
                    c.status === 'active' ? 'bg-success/15 text-success' :
                    c.status === 'inactive' ? 'bg-destructive/15 text-destructive' :
                    'bg-primary/15 text-primary'
                  )}>
                    {c.status === 'active' ? 'Activo' : c.status === 'inactive' ? 'Inactivo' : 'Prospecto'}
                  </span>
                </div>
                <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                  <span>{c.deals} oportunidades</span>
                  <span className="text-foreground font-medium">
                    ${c.totalValue >= 1000 ? (c.totalValue / 1000).toFixed(1) + 'K' : c.totalValue}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <NewClientDialog open={showClientDialog} onOpenChange={setShowClientDialog} queryClient={queryClient} />
      <NewOppDialog open={showOppDialog} onOpenChange={setShowOppDialog} clients={clients} queryClient={queryClient} />
    </AppLayout>
  );
}

function OppCard({ opp, queryClient }: { opp: any; queryClient: any }) {
  const cfg = STAGE_CONFIG[opp.stage] || STAGE_CONFIG.prospecto;

  const updateStage = async (newStage: string) => {
    const { error } = await supabase
      .from('crm_opportunities')
      .update({ stage: newStage })
      .eq('id', opp.id);
    if (error) { toast.error('Error al actualizar'); return; }
    queryClient.invalidateQueries({ queryKey: ['crm-opportunities'] });
    toast.success('Etapa actualizada');
  };

  return (
    <div className="rounded-xl bg-card border border-border p-3 space-y-2">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-medium text-foreground">{opp.title}</p>
          <p className="text-[10px] text-muted-foreground">
            {opp.crm_clients?.name} · {opp.crm_clients?.company || ''}
          </p>
        </div>
        <span className="text-sm font-bold text-foreground">${Number(opp.value_usd).toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-2">
        <Select value={opp.stage} onValueChange={updateStage}>
          <SelectTrigger className="h-7 text-[10px] w-auto min-w-[120px] rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STAGE_CONFIG).map(([key, s]) => (
              <SelectItem key={key} value={key} className="text-xs">{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {opp.probability_pct != null && (
          <span className="text-[10px] text-muted-foreground">{opp.probability_pct}% prob.</span>
        )}
      </div>
    </div>
  );
}

function NewClientDialog({ open, onOpenChange, queryClient }: { open: boolean; onOpenChange: (v: boolean) => void; queryClient: any }) {
  const [form, setForm] = useState({ name: '', company: '', email: '', phone: '', status: 'prospect' });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('El nombre es requerido'); return; }
    setSaving(true);
    const { error } = await supabase.from('crm_clients').insert({
      name: form.name.trim(),
      company: form.company.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      status: form.status,
    });
    setSaving(false);
    if (error) { toast.error('Error al guardar cliente'); return; }
    toast.success('Cliente creado');
    queryClient.invalidateQueries({ queryKey: ['crm-clients'] });
    setForm({ name: '', company: '', email: '', phone: '', status: 'prospect' });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-base">Nuevo Cliente</DialogTitle></DialogHeader>
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
          <Button onClick={handleSave} disabled={saving} className="w-full rounded-xl">{saving ? 'Guardando...' : 'Crear Cliente'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewOppDialog({ open, onOpenChange, clients, queryClient }: { open: boolean; onOpenChange: (v: boolean) => void; clients: any[]; queryClient: any }) {
  const [form, setForm] = useState({ client_id: '', title: '', stage: 'prospecto', value_usd: '', probability_pct: '50', notes: '' });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.client_id) { toast.error('Selecciona un cliente'); return; }
    if (!form.title.trim()) { toast.error('El título es requerido'); return; }
    setSaving(true);
    const { error } = await supabase.from('crm_opportunities').insert({
      client_id: form.client_id,
      title: form.title.trim(),
      stage: form.stage as "prospecto" | "contactado" | "cotizado" | "negociacion" | "cerrado_ganado" | "cerrado_perdido",
      value_usd: Number(form.value_usd) || 0,
      probability_pct: Number(form.probability_pct) || 50,
      notes: form.notes.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error('Error al guardar oportunidad'); return; }
    toast.success('Oportunidad creada');
    queryClient.invalidateQueries({ queryKey: ['crm-opportunities'] });
    setForm({ client_id: '', title: '', stage: 'prospecto', value_usd: '', probability_pct: '50', notes: '' });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle className="text-base">Nueva Oportunidad</DialogTitle></DialogHeader>
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
          <Button onClick={handleSave} disabled={saving} className="w-full rounded-xl">{saving ? 'Guardando...' : 'Crear Oportunidad'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
