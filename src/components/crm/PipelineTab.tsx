import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { type Deal, type Contact, DEAL_STAGES, type DealStage, daysInStage, stageColor } from '@/lib/crm-utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pencil, Trash2, Bot, RefreshCw, Megaphone } from 'lucide-react';
import { streamBusinessAI } from '@/lib/business-ai';
import ReactMarkdown from 'react-markdown';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';

interface PipelineTabProps {
  deals: Deal[];
  onEdit: (deal: Deal) => void;
  onDelete: (deal: Deal) => void;
}

const PIPELINE_STAGES: DealStage[] = ['prospecting', 'initial_contact', 'demo_sample', 'quote_sent', 'negotiation', 'closing', 'delivered', 'won', 'lost'];

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

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const dealId = result.draggableId;
    const newStage = result.destination.droppableId as DealStage;
    const deal = deals.find(d => d.id === dealId);
    if (!deal || deal.stage === newStage) return;
    updateStage(dealId, newStage);
  };

  const activeDeals = deals.filter(d => d.stage !== 'won' && d.stage !== 'lost');
  const totalPipeline = activeDeals.reduce((s, d) => s + Number(d.value_usd || 0), 0);
  const wonDeals = deals.filter(d => d.stage === 'won');
  const wonValue = wonDeals.reduce((s, d) => s + Number(d.value_usd || 0), 0);

  return (
    <div className="space-y-3">
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

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="overflow-x-auto -mx-4 px-4 pb-2">
          <div className="flex gap-2.5" style={{ minWidth: `${activeStages.length * 220}px` }}>
            {activeStages.map(stage => {
              const cfg = DEAL_STAGES[stage];
              const stageDeals = deals.filter(d => d.stage === stage);
              const stageValue = stageDeals.reduce((s, d) => s + Number(d.value_usd || 0), 0);
              return (
                <Droppable droppableId={stage} key={stage}>
                  {(provided, snapshot) => (
                    <div className="flex-shrink-0 w-[210px]" ref={provided.innerRef} {...provided.droppableProps}>
                      <div className={cn('rounded-xl bg-muted/50 p-2 space-y-2 min-h-[120px] transition-colors', snapshot.isDraggingOver && 'bg-primary/10 ring-1 ring-primary/30')}>
                        <div className="flex items-center justify-between px-1">
                          <span className="text-[11px] font-semibold text-foreground">{cfg.emoji} {cfg.label}</span>
                          <span className="text-[10px] text-muted-foreground">{stageDeals.length} · ${stageValue >= 1000 ? (stageValue / 1000).toFixed(0) + 'K' : stageValue}</span>
                        </div>
                        <div className="space-y-1.5 min-h-[60px]">
                          {stageDeals.map((deal, index) => (
                            <Draggable key={deal.id} draggableId={deal.id} index={index}>
                              {(dragProvided, dragSnapshot) => (
                                <div ref={dragProvided.innerRef} {...dragProvided.draggableProps} {...dragProvided.dragHandleProps}>
                                  <DealCard deal={deal} onEdit={onEdit} onDelete={onDelete} onStageChange={updateStage} isDragging={dragSnapshot.isDragging} />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {stageDeals.length === 0 && (
                            <div className="rounded-lg border border-dashed border-border p-3 text-center text-[10px] text-muted-foreground">Sin deals</div>
                          )}
                          {provided.placeholder}
                        </div>
                      </div>
                    </div>
                  )}
                </Droppable>
              );
            })}
          </div>
        </div>
      </DragDropContext>

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

function DealCard({ deal, onEdit, onDelete, onStageChange, isDragging }: { deal: Deal; onEdit: (d: Deal) => void; onDelete: (d: Deal) => void; onStageChange: (id: string, stage: DealStage) => void; isDragging?: boolean }) {
  const [showPlan, setShowPlan] = useState(false);
  const [showPitch, setShowPitch] = useState(false);
  const [planContent, setPlanContent] = useState('');
  const [planLoading, setPlanLoading] = useState(false);
  const [pitchContent, setPitchContent] = useState('');
  const [pitchLoading, setPitchLoading] = useState(false);
  const days = daysInStage(deal.updated_at);
  const dayColor = stageColor(days);

  // Rotting visual: border color based on days stale
  const rottingBorder = days >= 21
    ? 'border-destructive/60 bg-destructive/5'
    : days >= 14
    ? 'border-warning/60 bg-warning/5'
    : days >= 7
    ? 'border-yellow-500/30'
    : 'border-border';

  const { data: contact } = useQuery({
    queryKey: ['contact-for-deal', deal.contact_id],
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('*').eq('id', deal.contact_id).single();
      return data;
    },
    enabled: showPlan || showPitch,
  });

  const generatePlan = async () => {
    setShowPlan(true);
    setPlanContent('');
    setPlanLoading(true);
    try {
      await streamBusinessAI({
        action: 'deal-plan',
        payload: { deal, contact },
        onDelta: (chunk) => setPlanContent(prev => prev + chunk),
        onDone: () => setPlanLoading(false),
      });
    } catch (e: any) {
      toast.error(e.message || 'Error');
      setPlanLoading(false);
    }
  };

  const generatePitch = async () => {
    setShowPitch(true);
    setPitchContent('');
    setPitchLoading(true);
    try {
      await streamBusinessAI({
        action: 'pitch',
        payload: { deal, contact },
        onDelta: (chunk) => setPitchContent(prev => prev + chunk),
        onDone: () => setPitchLoading(false),
      });
    } catch (e: any) {
      toast.error(e.message || 'Error');
      setPitchLoading(false);
    }
  };

  return (
    <>
      <div className={cn(
        'rounded-lg bg-card border p-2.5 space-y-1.5 shadow-sm transition-all',
        rottingBorder,
        isDragging && 'shadow-lg ring-2 ring-primary/40'
      )}>
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-foreground truncate">{deal.title}</p>
            <p className="text-[9px] text-muted-foreground truncate">{deal.contacts?.contact_name} · {deal.contacts?.company_name || ''}</p>
          </div>
          <div className="flex gap-0.5 shrink-0">
            <button onClick={generatePlan} className="p-1 rounded text-primary hover:text-primary/80" title="AI Game Plan">
              <Bot className="w-3 h-3" />
            </button>
            <button onClick={generatePitch} className="p-1 rounded text-accent-foreground hover:text-primary" title="AI Pitch">
              <Megaphone className="w-3 h-3" />
            </button>
            <button onClick={() => onEdit(deal)} className="p-1 rounded text-muted-foreground hover:text-foreground"><Pencil className="w-3 h-3" /></button>
            <button onClick={() => onDelete(deal)} className="p-1 rounded text-muted-foreground hover:text-destructive"><Trash2 className="w-3 h-3" /></button>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-foreground">${Number(deal.value_usd).toLocaleString()}</span>
          <span className={cn('text-[9px] font-medium', dayColor)}>
            {days >= 21 ? '🔴' : days >= 14 ? '🟡' : days >= 7 ? '🟠' : ''} {days}d
          </span>
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

      {/* AI Game Plan Dialog */}
      <Dialog open={showPlan} onOpenChange={setShowPlan}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="w-4 h-4" /> Game Plan: {deal.title}
              <Button size="sm" variant="ghost" onClick={generatePlan} disabled={planLoading} className="ml-auto">
                <RefreshCw className={`w-3.5 h-3.5 ${planLoading ? 'animate-spin' : ''}`} />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm prose-invert max-w-none">
            {planContent ? <ReactMarkdown>{planContent}</ReactMarkdown> : (
              <div className="text-center text-muted-foreground py-8">
                {planLoading ? <p className="animate-pulse">Generando plan de acción...</p> : <p>Generando...</p>}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Pitch Dialog */}
      <Dialog open={showPitch} onOpenChange={setShowPitch}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="w-4 h-4" /> AI Pitch: {deal.title}
              <Button size="sm" variant="ghost" onClick={generatePitch} disabled={pitchLoading} className="ml-auto">
                <RefreshCw className={`w-3.5 h-3.5 ${pitchLoading ? 'animate-spin' : ''}`} />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm prose-invert max-w-none">
            {pitchContent ? <ReactMarkdown>{pitchContent}</ReactMarkdown> : (
              <div className="text-center text-muted-foreground py-8">
                {pitchLoading ? <p className="animate-pulse">Generando pitch...</p> : <p>Generando...</p>}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
