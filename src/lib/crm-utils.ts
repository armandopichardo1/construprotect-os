import { supabase } from '@/integrations/supabase/client';

// Types
export interface Contact {
  id: string;
  company_name: string | null;
  contact_name: string;
  rnc: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  segment: string | null;
  priority: number;
  territory: string | null;
  address: string | null;
  source: string | null;
  price_tier: string;
  lifetime_revenue_usd: number;
  total_orders: number;
  last_order_date: string | null;
  last_activity_date: string | null;
  tags: string[];
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Deal {
  id: string;
  contact_id: string;
  title: string;
  stage: DealStage;
  value_usd: number;
  probability: number;
  expected_close_date: string | null;
  actual_close_date: string | null;
  loss_reason: string | null;
  assigned_to: string | null;
  products_of_interest: any;
  project_name: string | null;
  project_size_m2: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  contacts?: { contact_name: string; company_name: string | null } | null;
}

export interface Activity {
  id: string;
  contact_id: string | null;
  deal_id: string | null;
  activity_type: ActivityType;
  title: string;
  description: string | null;
  due_date: string | null;
  completed_at: string | null;
  is_completed: boolean;
  outcome: string | null;
  created_by: string | null;
  created_at: string;
  contacts?: { contact_name: string; company_name: string | null } | null;
  deals?: { title: string } | null;
}

export interface Quote {
  id: string;
  quote_number: string;
  contact_id: string;
  deal_id: string | null;
  status: QuoteStatus;
  subtotal_usd: number;
  itbis_usd: number;
  total_usd: number;
  total_dop: number;
  exchange_rate: number | null;
  valid_until: string | null;
  notes: string | null;
  created_by: string | null;
  sent_at: string | null;
  created_at: string;
  contacts?: { contact_name: string; company_name: string | null } | null;
}

export type DealStage = 'prospecting' | 'initial_contact' | 'demo_sample' | 'quote_sent' | 'negotiation' | 'closing' | 'won' | 'lost';
export type ActivityType = 'call' | 'whatsapp' | 'email' | 'visit' | 'meeting' | 'demo' | 'sample_sent' | 'quote_sent' | 'follow_up' | 'note' | 'delivery';
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';

export const DEAL_STAGES: Record<DealStage, { label: string; emoji: string; color: string }> = {
  prospecting: { label: 'Prospección', emoji: '🔍', color: 'bg-muted text-muted-foreground' },
  initial_contact: { label: 'Contacto Inicial', emoji: '👋', color: 'bg-primary/20 text-primary' },
  demo_sample: { label: 'Demo/Muestra', emoji: '🧪', color: 'bg-primary/30 text-primary' },
  quote_sent: { label: 'Cotización', emoji: '📋', color: 'bg-primary/40 text-primary' },
  negotiation: { label: 'Negociación', emoji: '🤝', color: 'bg-primary/50 text-primary' },
  closing: { label: 'Cierre', emoji: '🎯', color: 'bg-primary/60 text-primary' },
  won: { label: 'Ganado', emoji: '✅', color: 'bg-success/20 text-success' },
  lost: { label: 'Perdido', emoji: '❌', color: 'bg-destructive/20 text-destructive' },
};

export const ACTIVITY_TYPES: Record<ActivityType, { label: string; emoji: string }> = {
  call: { label: 'Llamada', emoji: '📞' },
  whatsapp: { label: 'WhatsApp', emoji: '💬' },
  email: { label: 'Email', emoji: '📧' },
  visit: { label: 'Visita', emoji: '🏢' },
  meeting: { label: 'Reunión', emoji: '👥' },
  demo: { label: 'Demo', emoji: '🧪' },
  sample_sent: { label: 'Muestra Enviada', emoji: '📦' },
  quote_sent: { label: 'Cotización Enviada', emoji: '📋' },
  follow_up: { label: 'Seguimiento', emoji: '🔄' },
  note: { label: 'Nota', emoji: '📝' },
  delivery: { label: 'Entrega', emoji: '🚚' },
};

export const SEGMENTS = ['Constructor', 'Ebanista', 'Arquitecto', 'Diseñador', 'Retail', 'Gobierno', 'Otro'];
export const PRICE_TIERS = ['list', 'architect', 'project', 'wholesale'];
export const PRICE_TIER_LABELS: Record<string, string> = {
  list: 'Lista', architect: 'Arquitecto', project: 'Proyecto', wholesale: 'Mayoreo'
};

export function daysInStage(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}

export function stageColor(days: number): string {
  if (days < 7) return 'text-success';
  if (days <= 14) return 'text-warning';
  return 'text-destructive';
}
