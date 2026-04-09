import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { type Deal, DEAL_STAGES, type DealStage, daysInStage, stageColor, ACTIVITY_TYPES } from '@/lib/crm-utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Trash2, GripVertical } from 'lucide-react';

interface PipelineTabProps {
  deals: Deal[];
  onEdit: (deal: Deal) => void;
  onDelete: (deal: Deal) => void;
}

const PIPELINE_STAGES: DealStage[] = ['prospecting', 'initial_contact', 'demo_sample', 'quote_sent', 'negotiation', 'closing', 'won', 'lost'];

export function PipelineTab({ deals, onEdit, onDelete }: PipelineTabProps) {
  const queryClient = useQueryClient();
  const activeStages = PIPELINE_STAGES.filter(s => s !== 'won' && s !== 'lost');

  const updateStage = async (dealId: string, newStage: DealStage) => {
    const payload: any = { stage: newStage };
    if (newStage === 'won') payload.actual_close_date = new Date().toISOString().split('T')[0];
    const { error } = await supabase.from('deals').update(payload).eq('id', dealId);
    if (error) { toast.error('Error al mover deal'); return; }
    queryClient.invalidateQueries({ queryKey: ['crm-deals'] });
    toast.success('Deal actualizado');
  };

  // Stats
  const activeDeals = deals.filter(d => d.stage !== 'won' && d.stage !== 'lost');
  const totalPipeline = activeDeals.reduce((s, d) => s + Number(d.value_usd || 0), 0);
  const weightedPipeline = activeDeals.reduce((s, d) => s + Number(d.value_usd || 0) * (d.probability / 100), 0);
  const wonDeals = deals.filter(d => d.stage === 'won');
  const wonValue = wonDeals.reduce((s, d) => s + Number(d.value_usd || 0), 0);

  return (
    <div className="space-y-3">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-card border border-border p-2.5 text-center">
          <p className="text-lg font-bold text-foreground">{activeDeals.length}</p>
          <p className="text-[9px] text-muted-foreground">Deals activos</p>
        </div>
        <div className="rounded-xl bg-card border border-border p-2.5 text-center">
          <p className="text-lg font-bold text-primary">${totalPipeline >= 1000 ? (totalPipeline / 1000).toFixed(0) + 'K' : totalPipeline}</p>
          <p className="text-[9px] text-muted-foreground">Pipeline total</p>
        </div>
        <div className="rounded-xl bg-card border border-border p-2.5 text-center">
          <p className="text-lg font-bold text-success">${wonValue >= 1000 ? (wonValue / 1000).toFixed(0) + 'K' : wonValue}</p>
          <p className="text-[9px] text-muted-foreground">Ganados</p>
        </div>
      </div>

      {/* Horizontal Kanban */}
      <div className="overflow-x-auto -mx-4 px-4 pb-2">
        <div className="flex gap-2.5" style={{ minWidth: `${activeStages.length * 220}px` }}>
          {activeStages.map(stage => {
            const cfg = DEAL_STAGES[stage];
            const stageDeals = deals.filter(d => d.stage === stage);
            const stageValue = stageDeals.reduce((s, d) => s + Number(d.value_usd || 0), 0);
            return (
              <div key={stage} className="flex-shrink-0 w-[210px]">
                <div className="rounded-xl bg-muted/50 p-2 space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-semibold text-foreground">{cfg.emoji} {cfg.label}</span>
                    <span className="text-[10px] text-muted-foreground">{stageDeals.length} · ${stageValue >= 1000 ? (stageValue / 1000).toFixed(0) + 'K' : stageValue}</span>
                  </div>
                  <div className="space-y-1.5 min-h-[60px]">
                    {stageDeals.map(deal => (
                      <DealCard key={deal.id} deal={deal} onEdit={onEdit} onDelete={onDelete} onStageChange={updateStage} />
                    ))}
                    {stageDeals.length === 0 && (
                      <div className="rounded-lg border border-dashed border-border p-3 text-center text-[10px] text-muted-foreground">
                        Sin deals
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Won / Lost summary */}
      {(wonDeals.length > 0 || deals.filter(d => d.stage === 'lost').length > 0) && (
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-success/5 border border-success/20 p-2.5">
            <p className="text-[10px] font-semibold text-success">✅ Ganados ({wonDeals.length})</p>
            <p className="text-sm font-bold text-foreground">${wonValue.toLocaleString()}</p>
          </div>
          <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-2.5">
            <p className="text-[10px] font-semibold text-destructive">❌ Perdidos ({deals.filter(d => d.stage === 'lost').length})</p>
            <p className="text-sm font-bold text-foreground">${deals.filter(d => d.stage === 'lost').reduce((s, d) => s + Number(d.value_usd || 0), 0).toLocaleString()}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function DealCard({ deal, onEdit, onDelete, onStageChange }: { deal: Deal; onEdit: (d: Deal) => void; onDelete: (d: Deal) => void; onStageChange: (id: string, stage: DealStage) => void }) {
  const days = daysInStage(deal.updated_at);
  const dayColor = stageColor(days);

  return (
    <div className="rounded-lg bg-card border border-border p-2.5 space-y-1.5 shadow-sm">
      <div className="flex items-start justify-between gap-1">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold text-foreground truncate">{deal.title}</p>
          <p className="text-[9px] text-muted-foreground truncate">{deal.contacts?.contact_name} · {deal.contacts?.company_name || ''}</p>
        </div>
        <div className="flex gap-0.5 shrink-0">
          <button onClick={() => onEdit(deal)} className="p-1 rounded text-muted-foreground hover:text-foreground"><Pencil className="w-3 h-3" /></button>
          <button onClick={() => onDelete(deal)} className="p-1 rounded text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-foreground">${Number(deal.value_usd).toLocaleString()}</span>
        <span className={cn('text-[9px] font-medium', dayColor)}>{days}d</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Select value={deal.stage} onValueChange={(v) => onStageChange(deal.id, v as DealStage)}>
          <SelectTrigger className="h-5 text-[9px] w-auto min-w-[80px] rounded border-0 bg-muted px-1.5">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PIPELINE_STAGES.map(s => (
              <SelectItem key={s} value={s} className="text-[10px]">{DEAL_STAGES[s].emoji} {DEAL_STAGES[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-[9px] text-muted-foreground">{deal.probability}%</span>
      </div>
    </div>
  );
}
