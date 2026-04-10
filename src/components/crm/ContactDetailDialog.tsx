import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type Contact, type Deal, type Activity, type Quote, DEAL_STAGES, ACTIVITY_TYPES, PRICE_TIER_LABELS, type ActivityType } from '@/lib/crm-utils';
import { formatUSD } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Star, Phone, Mail, MapPin, MessageCircle, Building2, CheckCircle2, AlertTriangle, RefreshCw, Bot } from 'lucide-react';
import { streamBusinessAI } from '@/lib/business-ai';
import ReactMarkdown from 'react-markdown';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contact: Contact | null;
}

const QUICK_ACTIONS: { type: ActivityType; label: string; emoji: string }[] = [
  { type: 'call', label: 'Llamada', emoji: '📞' },
  { type: 'email', label: 'Email', emoji: '📧' },
  { type: 'whatsapp', label: 'WhatsApp', emoji: '💬' },
  { type: 'visit', label: 'Visita', emoji: '🏢' },
  { type: 'meeting', label: 'Reunión', emoji: '👥' },
  { type: 'note', label: 'Nota', emoji: '📝' },
];

export function ContactDetailDialog({ open, onOpenChange, contact }: Props) {
  const queryClient = useQueryClient();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickType, setQuickType] = useState<ActivityType>('call');
  const [quickTitle, setQuickTitle] = useState('');
  const [quickDesc, setQuickDesc] = useState('');
  const [quickOutcome, setQuickOutcome] = useState('');
  const [saving, setSaving] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showCrossSell, setShowCrossSell] = useState(false);
  const [crossSellContent, setCrossSellContent] = useState('');
  const [crossSellLoading, setCrossSellLoading] = useState(false);

  const contactId = contact?.id;

  const { data: deals = [] } = useQuery({
    queryKey: ['contact-deals', contactId],
    enabled: open && !!contactId,
    queryFn: async () => {
      const { data } = await supabase.from('deals').select('*').eq('contact_id', contactId!).order('created_at', { ascending: false });
      return (data || []) as Deal[];
    },
  });

  const { data: activities = [], refetch: refetchActivities } = useQuery({
    queryKey: ['contact-activities', contactId],
    enabled: open && !!contactId,
    queryFn: async () => {
      const { data } = await supabase.from('activities').select('*, deals(title)').eq('contact_id', contactId!).order('created_at', { ascending: false });
      return (data || []) as Activity[];
    },
  });

  const { data: quotes = [] } = useQuery({
    queryKey: ['contact-quotes', contactId],
    enabled: open && !!contactId,
    queryFn: async () => {
      const { data } = await supabase.from('quotes').select('*').eq('contact_id', contactId!).order('created_at', { ascending: false });
      return (data || []) as Quote[];
    },
  });

  const { data: sales = [] } = useQuery({
    queryKey: ['contact-sales', contactId],
    enabled: open && !!contactId,
    queryFn: async () => {
      const { data } = await supabase.from('sales').select('*, sale_items(*, products(name, sku))').eq('contact_id', contactId!).order('date', { ascending: false });
      return data || [];
    },
  });

  if (!contact) return null;

  // Reorder reminder: check if client is recurring and hasn't ordered in a while
  const lastOrderDate = contact.last_order_date ? new Date(contact.last_order_date) : null;
  const daysSinceOrder = lastOrderDate ? Math.floor((Date.now() - lastOrderDate.getTime()) / 86400000) : null;
  const isRecurring = (contact.total_orders || 0) >= 3;
  const needsReorder = isRecurring && daysSinceOrder !== null && daysSinceOrder > 45;

  const handleQuickAdd = async () => {
    if (!quickTitle.trim()) { toast.error('El título es requerido'); return; }
    setSaving(true);
    const { error } = await supabase.from('activities').insert({
      contact_id: contact.id,
      activity_type: quickType,
      title: quickTitle.trim(),
      description: quickDesc.trim() || null,
      outcome: quickOutcome.trim() || null,
      is_completed: true,
      completed_at: new Date().toISOString(),
    });
    setSaving(false);
    if (error) { toast.error('Error al registrar'); return; }
    toast.success('Actividad registrada');
    setQuickTitle(''); setQuickDesc(''); setQuickOutcome('');
    setShowQuickAdd(false);
    refetchActivities();
    queryClient.invalidateQueries({ queryKey: ['crm-activities'] });
    await supabase.from('contacts').update({ last_activity_date: new Date().toISOString() }).eq('id', contact.id);
  };

  const handleToggleComplete = async (activity: Activity) => {
    const newCompleted = !activity.is_completed;
    await supabase.from('activities').update({
      is_completed: newCompleted,
      completed_at: newCompleted ? new Date().toISOString() : null,
    }).eq('id', activity.id);
    refetchActivities();
  };

  const generateCrossSell = async () => {
    setShowCrossSell(true);
    setCrossSellContent('');
    setCrossSellLoading(true);
    const purchaseHistory = sales.map((s: any) =>
      `${s.date}: $${Number(s.total_usd).toFixed(0)} — ${(s.sale_items || []).map((si: any) => `${si.products?.name || '?'} x${si.quantity}`).join(', ')}`
    ).join('\n');
    try {
      await streamBusinessAI({
        action: 'cross-sell',
        payload: { contact, purchaseHistory },
        onDelta: (chunk) => setCrossSellContent(prev => prev + chunk),
        onDone: () => setCrossSellLoading(false),
      });
    } catch (e: any) {
      toast.error(e.message || 'Error');
      setCrossSellLoading(false);
    }
  };

  const filteredActivities = typeFilter === 'all'
    ? activities
    : activities.filter(a => a.activity_type === typeFilter);

  const groupedActivities: Record<string, Activity[]> = {};
  filteredActivities.forEach(a => {
    const date = new Date(a.created_at).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });
    if (!groupedActivities[date]) groupedActivities[date] = [];
    groupedActivities[date].push(a);
  });

  const typeCounts: Record<string, number> = {};
  activities.forEach(a => { typeCounts[a.activity_type] = (typeCounts[a.activity_type] || 0) + 1; });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Building2 className="w-4 h-4 text-primary" />
            {contact.contact_name}
          </DialogTitle>
        </DialogHeader>

        {/* Reorder reminder */}
        {needsReorder && (
          <div className="rounded-xl bg-warning/10 border border-warning/30 p-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
            <div>
              <p className="text-xs font-semibold text-warning">⏰ Recordatorio de Reorden</p>
              <p className="text-[10px] text-muted-foreground">
                Este cliente tiene {contact.total_orders} pedidos pero no ordena hace {daysSinceOrder} días.
                Considera hacer seguimiento.
              </p>
            </div>
            <Button size="sm" variant="outline" className="shrink-0 text-[10px] h-7" onClick={generateCrossSell}>
              <Bot className="w-3 h-3 mr-1" /> Cross-sell
            </Button>
          </div>
        )}

        {/* Header info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-muted/50 p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground">Información</p>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              {contact.company_name && <div className="flex items-center gap-1.5"><Building2 className="w-3 h-3" /> {contact.company_name}</div>}
              {contact.phone && <div className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> {contact.phone}</div>}
              {contact.email && <div className="flex items-center gap-1.5"><Mail className="w-3 h-3" /> {contact.email}</div>}
              {contact.whatsapp && <div className="flex items-center gap-1.5"><MessageCircle className="w-3 h-3" /> {contact.whatsapp}</div>}
              {contact.address && <div className="flex items-center gap-1.5"><MapPin className="w-3 h-3" /> {contact.address}</div>}
            </div>
          </div>
          <div className="rounded-xl bg-muted/50 p-3 space-y-2">
            <p className="text-xs font-semibold text-foreground">Métricas</p>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div>
                <p className="text-lg font-bold text-primary">{formatUSD(Number(contact.lifetime_revenue_usd))}</p>
                <p className="text-[10px] text-muted-foreground">Revenue Total</p>
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">{contact.total_orders}</p>
                <p className="text-[10px] text-muted-foreground">Pedidos</p>
              </div>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {contact.segment && <Badge variant="secondary" className="text-[10px]">{contact.segment}</Badge>}
              <Badge variant="outline" className="text-[10px]">{PRICE_TIER_LABELS[contact.price_tier] || contact.price_tier}</Badge>
              <div className="flex items-center gap-0.5">
                {Array.from({ length: Math.min(contact.priority || 0, 5) }).map((_, i) => (
                  <Star key={i} className="w-2.5 h-2.5 text-warning fill-warning" />
                ))}
              </div>
            </div>
          </div>
        </div>

        <Tabs defaultValue="timeline" className="mt-2">
          <TabsList className="grid grid-cols-4 h-8">
            <TabsTrigger value="timeline" className="text-xs">Timeline ({activities.length})</TabsTrigger>
            <TabsTrigger value="deals" className="text-xs">Deals ({deals.length})</TabsTrigger>
            <TabsTrigger value="quotes" className="text-xs">Cotizaciones ({quotes.length})</TabsTrigger>
            <TabsTrigger value="sales" className="text-xs">Ventas ({sales.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="mt-3 space-y-3">
            {/* Quick action buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {QUICK_ACTIONS.map(qa => (
                <Button key={qa.type} size="sm" variant="outline"
                  className="h-7 text-[10px] gap-1 rounded-full"
                  onClick={() => { setQuickType(qa.type); setQuickTitle(`${qa.label} con ${contact.contact_name}`); setShowQuickAdd(true); }}>
                  <span>{qa.emoji}</span> {qa.label}
                </Button>
              ))}
              <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 rounded-full" onClick={generateCrossSell}>
                <Bot className="w-3 h-3" /> Cross-sell AI
              </Button>
            </div>

            {/* Activity type summary */}
            {Object.keys(typeCounts).length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setTypeFilter('all')}
                  className={cn('px-2 py-0.5 rounded-full text-[9px] font-medium transition-colors',
                    typeFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}>
                  Todas ({activities.length})
                </button>
                {Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
                  const info = ACTIVITY_TYPES[type as ActivityType];
                  return (
                    <button key={type}
                      onClick={() => setTypeFilter(type === typeFilter ? 'all' : type)}
                      className={cn('px-2 py-0.5 rounded-full text-[9px] font-medium transition-colors',
                        typeFilter === type ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground')}>
                      {info?.emoji} {info?.label} ({count})
                    </button>
                  );
                })}
              </div>
            )}

            {/* Quick add form */}
            {showQuickAdd && (
              <div className="rounded-xl border-2 border-primary/20 bg-card p-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{ACTIVITY_TYPES[quickType]?.emoji}</span>
                  <p className="text-xs font-semibold text-foreground">Registrar {ACTIVITY_TYPES[quickType]?.label}</p>
                </div>
                <Input value={quickTitle} onChange={e => setQuickTitle(e.target.value)}
                  placeholder="Título de la actividad" className="h-7 text-xs" />
                <Textarea value={quickDesc} onChange={e => setQuickDesc(e.target.value)}
                  placeholder="Descripción (opcional)" className="text-xs min-h-[50px]" rows={2} />
                <Input value={quickOutcome} onChange={e => setQuickOutcome(e.target.value)}
                  placeholder="Resultado / Outcome (opcional)" className="h-7 text-xs" />
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleQuickAdd} disabled={saving}>
                    {saving ? 'Guardando...' : 'Registrar'}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowQuickAdd(false)}>Cancelar</Button>
                </div>
              </div>
            )}

            {/* Timeline */}
            <div className="max-h-[280px] overflow-y-auto space-y-0 pr-1">
              {filteredActivities.length === 0 && (
                <div className="text-center py-6">
                  <p className="text-xs text-muted-foreground">Sin actividades registradas</p>
                  <p className="text-[10px] text-muted-foreground mt-1">Usa los botones de arriba para registrar una</p>
                </div>
              )}
              {Object.entries(groupedActivities).map(([date, acts]) => (
                <div key={date}>
                  <div className="sticky top-0 bg-background/90 backdrop-blur-sm py-1 z-10">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{date}</p>
                  </div>
                  {acts.map((a, idx) => {
                    const typeInfo = ACTIVITY_TYPES[a.activity_type] || { label: a.activity_type, emoji: '📌' };
                    const isLast = idx === acts.length - 1;
                    return (
                      <div key={a.id} className="flex gap-3 items-stretch">
                        <div className="flex flex-col items-center w-6 shrink-0">
                          <button
                            onClick={() => handleToggleComplete(a)}
                            className={cn(
                              'w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 transition-all border-2',
                              a.is_completed
                                ? 'bg-success/20 border-success text-success'
                                : 'bg-muted border-border text-muted-foreground hover:border-primary'
                            )}>
                            {a.is_completed ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span className="text-[10px]">{typeInfo.emoji}</span>}
                          </button>
                          {!isLast && <div className="w-px flex-1 bg-border min-h-[12px]" />}
                        </div>
                        <div className={cn('flex-1 pb-3 min-w-0', a.is_completed && 'opacity-70')}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className={cn('text-xs font-medium text-foreground truncate', a.is_completed && 'line-through')}>{a.title}</p>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className={cn(
                                  'px-1.5 py-0.5 rounded-full text-[8px] font-semibold',
                                  a.activity_type === 'call' ? 'bg-primary/15 text-primary' :
                                  a.activity_type === 'email' ? 'bg-blue-500/15 text-blue-500' :
                                  a.activity_type === 'whatsapp' ? 'bg-green-500/15 text-green-500' :
                                  a.activity_type === 'visit' || a.activity_type === 'meeting' ? 'bg-purple-500/15 text-purple-500' :
                                  'bg-muted text-muted-foreground'
                                )}>
                                  {typeInfo.emoji} {typeInfo.label}
                                </span>
                                {a.deals?.title && <span className="text-[9px] text-primary">→ {a.deals.title}</span>}
                              </div>
                            </div>
                            <span className="text-[9px] text-muted-foreground shrink-0">
                              {new Date(a.created_at).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          {a.description && <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{a.description}</p>}
                          {a.outcome && (
                            <div className="mt-1 rounded-md bg-success/5 border border-success/10 px-2 py-1">
                              <p className="text-[9px] text-success font-medium">Resultado: {a.outcome}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="deals" className="mt-3 space-y-2 max-h-[300px] overflow-y-auto">
            {deals.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Sin deals</p>}
            {deals.map(d => {
              const stageInfo = DEAL_STAGES[d.stage];
              return (
                <div key={d.id} className="rounded-lg bg-muted/50 p-3 flex justify-between items-center">
                  <div>
                    <p className="text-xs font-medium text-foreground">{d.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge className={cn('text-[9px]', stageInfo?.color)}>{stageInfo?.emoji} {stageInfo?.label}</Badge>
                      {d.project_name && <span className="text-[10px] text-muted-foreground">{d.project_name}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-primary">{formatUSD(Number(d.value_usd))}</p>
                    <p className="text-[10px] text-muted-foreground">{d.probability}%</p>
                  </div>
                </div>
              );
            })}
          </TabsContent>

          <TabsContent value="quotes" className="mt-3 space-y-2 max-h-[300px] overflow-y-auto">
            {quotes.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Sin cotizaciones</p>}
            {quotes.map(q => (
              <div key={q.id} className="rounded-lg bg-muted/50 p-3 flex justify-between items-center">
                <div>
                  <p className="text-xs font-medium text-foreground">{q.quote_number}</p>
                  <Badge variant="outline" className="text-[9px] mt-1">{q.status}</Badge>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-foreground">{formatUSD(Number(q.total_usd))}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(q.created_at).toLocaleDateString('es-DO')}</p>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="sales" className="mt-3 space-y-2 max-h-[300px] overflow-y-auto">
            {sales.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Sin ventas</p>}
            {sales.map((s: any) => (
              <div key={s.id} className="rounded-lg bg-muted/50 p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs font-medium text-foreground">{s.invoice_ref || s.date}</p>
                    <Badge variant="outline" className="text-[9px] mt-1">{s.payment_status}</Badge>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-primary">{formatUSD(Number(s.total_usd))}</p>
                    <p className="text-[10px] text-muted-foreground">{s.date}</p>
                  </div>
                </div>
                {/* Product details for this sale */}
                {(s.sale_items || []).length > 0 && (
                  <div className="pl-2 border-l-2 border-primary/20 space-y-0.5">
                    {(s.sale_items || []).map((si: any) => (
                      <div key={si.id} className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">{si.products?.name || si.products?.sku || 'Producto'} × {si.quantity}</span>
                        <span className="text-foreground">{formatUSD(Number(si.line_total_usd))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </TabsContent>
        </Tabs>

        {contact.notes && (
          <div className="rounded-lg bg-muted/30 p-3 mt-2">
            <p className="text-[10px] font-semibold text-muted-foreground mb-1">Notas</p>
            <p className="text-xs text-foreground">{contact.notes}</p>
          </div>
        )}

        {/* Cross-sell AI Dialog */}
        <Dialog open={showCrossSell} onOpenChange={setShowCrossSell}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bot className="w-4 h-4" /> Cross-sell: {contact.contact_name}
                <Button size="sm" variant="ghost" onClick={generateCrossSell} disabled={crossSellLoading} className="ml-auto">
                  <RefreshCw className={`w-3.5 h-3.5 ${crossSellLoading ? 'animate-spin' : ''}`} />
                </Button>
              </DialogTitle>
            </DialogHeader>
            <div className="prose prose-sm prose-invert max-w-none">
              {crossSellContent ? <ReactMarkdown>{crossSellContent}</ReactMarkdown> : (
                <div className="text-center text-muted-foreground py-8">
                  {crossSellLoading ? <p className="animate-pulse">Analizando historial...</p> : <p>Generando...</p>}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
