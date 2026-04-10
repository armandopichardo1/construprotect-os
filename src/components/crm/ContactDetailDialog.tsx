import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { type Contact, type Deal, type Activity, type Quote, DEAL_STAGES, ACTIVITY_TYPES, PRICE_TIER_LABELS } from '@/lib/crm-utils';
import { formatUSD } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Star, Phone, Mail, MapPin, MessageCircle, Building2, Calendar, FileText, TrendingUp, Clock } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contact: Contact | null;
}

export function ContactDetailDialog({ open, onOpenChange, contact }: Props) {
  if (!contact) return null;

  const { data: deals = [] } = useQuery({
    queryKey: ['contact-deals', contact.id],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from('deals').select('*').eq('contact_id', contact.id).order('created_at', { ascending: false });
      return (data || []) as Deal[];
    },
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['contact-activities', contact.id],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from('activities').select('*, deals(title)').eq('contact_id', contact.id).order('created_at', { ascending: false });
      return (data || []) as Activity[];
    },
  });

  const { data: quotes = [] } = useQuery({
    queryKey: ['contact-quotes', contact.id],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from('quotes').select('*').eq('contact_id', contact.id).order('created_at', { ascending: false });
      return (data || []) as Quote[];
    },
  });

  const { data: sales = [] } = useQuery({
    queryKey: ['contact-sales', contact.id],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from('sales').select('*').eq('contact_id', contact.id).order('date', { ascending: false });
      return data || [];
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Building2 className="w-4 h-4 text-primary" />
            {contact.contact_name}
          </DialogTitle>
        </DialogHeader>

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
            <TabsTrigger value="timeline" className="text-xs">Timeline</TabsTrigger>
            <TabsTrigger value="deals" className="text-xs">Deals ({deals.length})</TabsTrigger>
            <TabsTrigger value="quotes" className="text-xs">Cotizaciones ({quotes.length})</TabsTrigger>
            <TabsTrigger value="sales" className="text-xs">Ventas ({sales.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="mt-3 space-y-2 max-h-[300px] overflow-y-auto">
            {activities.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Sin actividades</p>}
            {activities.map(a => {
              const typeInfo = ACTIVITY_TYPES[a.activity_type] || { label: a.activity_type, emoji: '📌' };
              return (
                <div key={a.id} className="flex gap-3 items-start">
                  <div className="flex flex-col items-center">
                    <span className="text-sm">{typeInfo.emoji}</span>
                    <div className="w-px h-full bg-border min-h-[20px]" />
                  </div>
                  <div className="flex-1 pb-3">
                    <p className="text-xs font-medium text-foreground">{a.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{typeInfo.label}</span>
                      {a.deals?.title && <span className="text-[10px] text-primary">→ {a.deals.title}</span>}
                      {a.is_completed && <Badge variant="secondary" className="text-[8px] h-3.5">✓</Badge>}
                    </div>
                    {a.description && <p className="text-[10px] text-muted-foreground mt-0.5">{a.description}</p>}
                    <p className="text-[9px] text-muted-foreground mt-1">
                      {new Date(a.created_at).toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                </div>
              );
            })}
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
              <div key={s.id} className="rounded-lg bg-muted/50 p-3 flex justify-between items-center">
                <div>
                  <p className="text-xs font-medium text-foreground">{s.invoice_ref || s.date}</p>
                  <Badge variant="outline" className="text-[9px] mt-1">{s.payment_status}</Badge>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-primary">{formatUSD(Number(s.total_usd))}</p>
                  <p className="text-[10px] text-muted-foreground">{s.date}</p>
                </div>
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
      </DialogContent>
    </Dialog>
  );
}
