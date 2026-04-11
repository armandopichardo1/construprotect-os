import { useState, useMemo, useCallback } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { type Deal, type Contact, DEAL_STAGES, type DealStage, daysInStage, stageColor } from '@/lib/crm-utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Pencil, Trash2, Bot, RefreshCw, Megaphone, LayoutGrid, List, Phone, MessageCircle, Mail, Search, Filter, ChevronDown, ChevronRight } from 'lucide-react';
import { SwipeableRow } from '@/components/ui/swipeable-row';
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
  const [view, setView] = useState<'board' | 'table'>('board');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
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
      {/* KPI row + view toggle */}
      <div className="flex items-center gap-2">
        <div className="grid grid-cols-3 gap-2 flex-1">
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
        <div className="flex gap-1 rounded-xl bg-muted p-1">
          <button onClick={() => setView('board')} className={cn('p-1.5 rounded-lg transition-colors', view === 'board' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setView('table')} className={cn('p-1.5 rounded-lg transition-colors', view === 'table' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
            <List className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Board view (drag & drop) */}
      {view === 'board' && (
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
                                  <div ref={dragProvided.innerRef} {...dragProvided.draggableProps} {...dragProvided.dragHandleProps} style={{ ...dragProvided.draggableProps.style, touchAction: 'none' }}>
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
      )}

      {/* Table view */}
      {view === 'table' && (() => {
        const filteredDeals = deals.filter(d => {
          const matchesStage = stageFilter === 'all' || d.stage === stageFilter;
          const q = searchQuery.toLowerCase();
          const matchesSearch = !q || d.title.toLowerCase().includes(q) || (d.contacts?.contact_name || '').toLowerCase().includes(q) || (d.contacts?.company_name || '').toLowerCase().includes(q) || (d.project_name || '').toLowerCase().includes(q);
          return matchesStage && matchesSearch;
        });
        return (<>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[140px] max-w-[260px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input placeholder="Buscar deal, contacto..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="h-8 pl-8 text-xs rounded-lg" />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="h-8 text-[11px] w-auto min-w-[120px] rounded-lg">
              <Filter className="w-3 h-3 mr-1.5" /><SelectValue placeholder="Etapa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[11px]">Todas las etapas</SelectItem>
              {PIPELINE_STAGES.map(s => (<SelectItem key={s} value={s} className="text-[11px]">{DEAL_STAGES[s].emoji} {DEAL_STAGES[s].label}</SelectItem>))}
            </SelectContent>
          </Select>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{filteredDeals.length} de {deals.length}</span>
        </div>
        <div className="rounded-xl border border-border overflow-x-auto">
            <table className="w-full caption-bottom text-sm min-w-[480px]">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-[10px] font-semibold">Deal</TableHead>
                  <TableHead className="text-[10px] font-semibold hidden sm:table-cell">Contacto</TableHead>
                  <TableHead className="text-[10px] font-semibold hidden sm:table-cell">Etapa</TableHead>
                  <TableHead className="text-[10px] font-semibold text-right">Valor</TableHead>
                  <TableHead className="text-[10px] font-semibold text-center hidden md:table-cell">Prob.</TableHead>
                  <TableHead className="text-[10px] font-semibold text-center">Días</TableHead>
                  <TableHead className="text-[10px] font-semibold hidden lg:table-cell">Proyecto</TableHead>
                  <TableHead className="text-[10px] font-semibold text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDeals.map(deal => {
                  const days = daysInStage(deal.updated_at);
                  const dayColor = stageColor(days);
                  const stageCfg = DEAL_STAGES[deal.stage];
                  return (
                    <SwipeableRow
                      key={deal.id}
                      rightActions={[
                        {
                          icon: <Pencil className="w-4 h-4" />,
                          label: 'Editar',
                          color: 'bg-warning',
                          onClick: () => onEdit(deal),
                        },
                        {
                          icon: <Trash2 className="w-4 h-4" />,
                          label: 'Eliminar',
                          color: 'bg-destructive',
                          onClick: () => onDelete(deal),
                        },
                      ]}
                    >
                    <TableRow className="group hover:bg-muted/30 cursor-pointer sm:cursor-default" onClick={() => onEdit(deal)}>
                      <TableCell className="py-1.5">
                        <p className="text-xs font-medium text-foreground truncate max-w-[160px]">{deal.title}</p>
                        <p className="text-[9px] text-muted-foreground truncate sm:hidden">{deal.contacts?.contact_name || ''}</p>
                      </TableCell>
                      <TableCell className="py-1.5 hidden sm:table-cell">
                        <div>
                          <p className="text-[11px] text-foreground truncate">{deal.contacts?.contact_name || '—'}</p>
                          <p className="text-[9px] text-muted-foreground truncate">{deal.contacts?.company_name || ''}</p>
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5 hidden sm:table-cell" onClick={e => e.stopPropagation()}>
                        <Select value={deal.stage} onValueChange={(v) => updateStage(deal.id, v as DealStage)}>
                          <SelectTrigger className="h-6 text-[10px] w-auto min-w-[110px] rounded-lg border-0 bg-muted px-2">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PIPELINE_STAGES.map(s => (
                              <SelectItem key={s} value={s} className="text-[10px]">{DEAL_STAGES[s].emoji} {DEAL_STAGES[s].label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="py-1.5 text-right">
                        <span className="text-xs font-bold text-foreground">${Number(deal.value_usd || 0).toLocaleString()}</span>
                      </TableCell>
                      <TableCell className="py-1.5 text-center hidden md:table-cell">
                        <span className="text-[11px] text-muted-foreground">{deal.probability}%</span>
                      </TableCell>
                      <TableCell className="py-1.5 text-center hidden md:table-cell">
                        <span className={cn('text-[11px] font-medium', dayColor)}>{days}d</span>
                      </TableCell>
                      <TableCell className="py-1.5 hidden lg:table-cell">
                        <span className="text-[11px] text-muted-foreground truncate">{deal.project_name || '—'}</span>
                      </TableCell>
                      <TableCell className="py-1.5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <button onClick={() => onEdit(deal)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"><Pencil className="w-3 h-3" /></button>
                          <button onClick={() => onDelete(deal)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-3 h-3" /></button>
                        </div>
                      </TableCell>
                    </TableRow>
                    </SwipeableRow>
                  );
                })}
                {filteredDeals.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-6 text-xs text-muted-foreground">{searchQuery || stageFilter !== 'all' ? 'Sin resultados' : 'No hay deals'}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </table>
        </div>
        </>);
      })()}

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
    setShowPlan(true); setPlanContent(''); setPlanLoading(true);
    try {
      await streamBusinessAI({ action: 'deal-plan', payload: { deal, contact }, onDelta: (chunk) => setPlanContent(prev => prev + chunk), onDone: () => setPlanLoading(false) });
    } catch (e: any) { toast.error(e.message || 'Error'); setPlanLoading(false); }
  };

  const generatePitch = async () => {
    setShowPitch(true); setPitchContent(''); setPitchLoading(true);
    try {
      await streamBusinessAI({ action: 'pitch', payload: { deal, contact }, onDelta: (chunk) => setPitchContent(prev => prev + chunk), onDone: () => setPitchLoading(false) });
    } catch (e: any) { toast.error(e.message || 'Error'); setPitchLoading(false); }
  };

  return (
    <>
      <div className={cn('group/card rounded-lg bg-card border p-2.5 space-y-1.5 shadow-sm transition-all', rottingBorder, isDragging && 'shadow-lg ring-2 ring-primary/40')}>
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-foreground truncate">{deal.title}</p>
            <p className="text-[9px] text-muted-foreground truncate">{deal.contacts?.contact_name} · {deal.contacts?.company_name || ''}</p>
          </div>
          <div className="flex gap-0.5 shrink-0">
            <button onClick={() => onEdit(deal)} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"><Pencil className="w-3 h-3" /></button>
            <button onClick={() => onDelete(deal)} className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"><Trash2 className="w-3 h-3" /></button>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-foreground">${Number(deal.value_usd).toLocaleString()}</span>
          <span className={cn('text-[9px] font-medium', dayColor)}>{days}d</span>
        </div>
        {/* Contact + AI actions — visible on hover */}
        <div className="flex items-center justify-between opacity-0 group-hover/card:opacity-100 transition-opacity h-0 group-hover/card:h-auto overflow-hidden group-hover/card:pt-1 border-t border-transparent group-hover/card:border-border/50">
          <div className="flex gap-0.5">
            {deal.contacts?.phone && (
              <a href={`tel:${deal.contacts.phone.replace(/\D/g, '')}`} className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" onClick={(e) => e.stopPropagation()} title="Llamar"><Phone className="w-3 h-3" /></a>
            )}
            {deal.contacts?.phone && (
              <a href={`https://wa.me/${deal.contacts.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="p-1 rounded text-muted-foreground hover:text-success hover:bg-success/10 transition-colors" onClick={(e) => e.stopPropagation()} title="WhatsApp"><MessageCircle className="w-3 h-3" /></a>
            )}
            {deal.contacts?.email && (
              <a href={`mailto:${deal.contacts.email}`} className="p-1 rounded text-muted-foreground hover:text-warning hover:bg-warning/10 transition-colors" onClick={(e) => e.stopPropagation()} title="Email"><Mail className="w-3 h-3" /></a>
            )}
          </div>
          <div className="flex gap-0.5">
            <button onClick={generatePlan} className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10" title="AI Game Plan"><Bot className="w-3 h-3" /></button>
            <button onClick={generatePitch} className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10" title="AI Pitch"><Megaphone className="w-3 h-3" /></button>
          </div>
        </div>
      </div>

      <Dialog open={showPlan} onOpenChange={setShowPlan}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="w-4 h-4" /> Game Plan: {deal.title}
              <Button size="sm" variant="ghost" onClick={generatePlan} disabled={planLoading} className="ml-auto"><RefreshCw className={`w-3.5 h-3.5 ${planLoading ? 'animate-spin' : ''}`} /></Button>
            </DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm prose-invert max-w-none">
            {planContent ? <ReactMarkdown>{planContent}</ReactMarkdown> : (
              <div className="text-center text-muted-foreground py-8">{planLoading ? <p className="animate-pulse">Generando plan de acción...</p> : <p>Generando...</p>}</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showPitch} onOpenChange={setShowPitch}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="w-4 h-4" /> AI Pitch: {deal.title}
              <Button size="sm" variant="ghost" onClick={generatePitch} disabled={pitchLoading} className="ml-auto"><RefreshCw className={`w-3.5 h-3.5 ${pitchLoading ? 'animate-spin' : ''}`} /></Button>
            </DialogTitle>
          </DialogHeader>
          <div className="prose prose-sm prose-invert max-w-none">
            {pitchContent ? <ReactMarkdown>{pitchContent}</ReactMarkdown> : (
              <div className="text-center text-muted-foreground py-8">{pitchLoading ? <p className="animate-pulse">Generando pitch...</p> : <p>Generando...</p>}</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
