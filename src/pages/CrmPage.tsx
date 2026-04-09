import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { ClientCard } from '@/components/crm/ClientCard';
import { ClientDialog } from '@/components/crm/ClientDialog';
import { OppCard, STAGE_CONFIG } from '@/components/crm/OppCard';
import { OppDialog } from '@/components/crm/OppDialog';
import { DeleteConfirmDialog } from '@/components/crm/DeleteConfirmDialog';

export default function CrmPage() {
  const [tab, setTab] = useState<'pipeline' | 'clients'>('pipeline');
  const [showClientDialog, setShowClientDialog] = useState(false);
  const [showOppDialog, setShowOppDialog] = useState(false);
  const [editClient, setEditClient] = useState<any>(null);
  const [editOpp, setEditOpp] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<{ type: 'client' | 'opportunity'; item: any } | null>(null);
  const queryClient = useQueryClient();

  const { data: clients = [] } = useQuery({
    queryKey: ['crm-clients'],
    queryFn: async () => {
      const { data, error } = await supabase.from('crm_clients').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: opportunities = [] } = useQuery({
    queryKey: ['crm-opportunities'],
    queryFn: async () => {
      const { data, error } = await supabase.from('crm_opportunities').select('*, crm_clients(name, company)').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const pipelineStages = Object.entries(STAGE_CONFIG)
    .filter(([key]) => key !== 'cerrado_perdido')
    .map(([key, cfg]) => {
      const stageOpps = opportunities.filter((o: any) => o.stage === key);
      return { key, name: cfg.label, color: cfg.color, count: stageOpps.length, value: stageOpps.reduce((sum: number, o: any) => sum + Number(o.value_usd || 0), 0) };
    });

  const activeOpps = opportunities.filter((o: any) => o.stage !== 'cerrado_perdido');
  const totalPipelineValue = activeOpps.reduce((sum: number, o: any) => sum + Number(o.value_usd || 0), 0);

  const clientsWithStats = clients.map((c: any) => {
    const clientOpps = opportunities.filter((o: any) => o.client_id === c.id);
    return { ...c, deals: clientOpps.length, totalValue: clientOpps.reduce((sum: number, o: any) => sum + Number(o.value_usd || 0), 0) };
  });

  const handleEditClient = (c: any) => { setEditClient(c); setShowClientDialog(true); };
  const handleEditOpp = (o: any) => { setEditOpp(o); setShowOppDialog(true); };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-foreground">CRM</h1>
          <Button size="sm" className="h-8 text-xs rounded-xl" onClick={() => {
            if (tab === 'clients') { setEditClient(null); setShowClientDialog(true); }
            else { setEditOpp(null); setShowOppDialog(true); }
          }}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            {tab === 'clients' ? 'Cliente' : 'Oportunidad'}
          </Button>
        </div>

        <div className="flex gap-1 rounded-xl bg-muted p-1">
          {(['pipeline', 'clients'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={cn(
              'flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            )}>
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
                <p className="text-xl font-bold text-primary">${totalPipelineValue >= 1000 ? (totalPipelineValue / 1000).toFixed(0) + 'K' : totalPipelineValue}</p>
                <p className="text-[10px] text-muted-foreground">Valor total pipeline</p>
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">Oportunidades</h2>
              {opportunities.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No hay oportunidades aún</p>}
              {opportunities.map((o: any) => (
                <OppCard key={o.id} opp={o} queryClient={queryClient} onEdit={handleEditOpp} onDelete={(o) => setDeleteItem({ type: 'opportunity', item: o })} />
              ))}
            </div>
          </div>
        )}

        {tab === 'clients' && (
          <div className="space-y-2">
            {clientsWithStats.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No hay clientes aún</p>}
            {clientsWithStats.map((c: any) => (
              <ClientCard key={c.id} client={c} onEdit={handleEditClient} onDelete={(c) => setDeleteItem({ type: 'client', item: c })} />
            ))}
          </div>
        )}
      </div>

      <ClientDialog open={showClientDialog} onOpenChange={(v) => { setShowClientDialog(v); if (!v) setEditClient(null); }} queryClient={queryClient} editClient={editClient} />
      <OppDialog open={showOppDialog} onOpenChange={(v) => { setShowOppDialog(v); if (!v) setEditOpp(null); }} clients={clients} queryClient={queryClient} editOpp={editOpp} />
      <DeleteConfirmDialog open={!!deleteItem} onOpenChange={(v) => { if (!v) setDeleteItem(null); }} type={deleteItem?.type || 'client'} item={deleteItem?.item} queryClient={queryClient} />
    </AppLayout>
  );
}
