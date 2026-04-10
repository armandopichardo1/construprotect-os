import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Plus, Download } from 'lucide-react';
import { type Contact, type Deal, type Activity, type Quote } from '@/lib/crm-utils';
import { PipelineTab } from '@/components/crm/PipelineTab';
import { ContactsTab, ContactDialog } from '@/components/crm/ContactsTab';
import { AgendaTab } from '@/components/crm/AgendaTab';
import { QuotesTab } from '@/components/crm/QuotesTab';
import { DealDialog } from '@/components/crm/DealDialog';
import { ActivityDialog } from '@/components/crm/ActivityDialog';
import { CrmDeleteDialog } from '@/components/crm/CrmDeleteDialog';
import { ContactDetailDialog } from '@/components/crm/ContactDetailDialog';
import { ClientProjectsTab } from '@/components/crm/ClientProjectsTab';
import { exportToExcel } from '@/lib/export-utils';

type Tab = 'pipeline' | 'contacts' | 'agenda' | 'quotes' | 'projects';

export default function CrmPage() {
  const [tab, setTab] = useState<Tab>('pipeline');
  const queryClient = useQueryClient();

  const [showContactDialog, setShowContactDialog] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [viewContact, setViewContact] = useState<Contact | null>(null);
  const [showDealDialog, setShowDealDialog] = useState(false);
  const [editDeal, setEditDeal] = useState<Deal | null>(null);
  const [showActivityDialog, setShowActivityDialog] = useState(false);
  const [editActivity, setEditActivity] = useState<Activity | null>(null);
  const [deleteItem, setDeleteItem] = useState<{ type: 'contact' | 'deal' | 'activity' | 'quote'; item: any } | null>(null);

  const { data: contacts = [] } = useQuery({
    queryKey: ['crm-contacts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('contacts').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Contact[];
    },
  });

  const { data: deals = [] } = useQuery({
    queryKey: ['crm-deals'],
    queryFn: async () => {
      const { data, error } = await supabase.from('deals').select('*, contacts(contact_name, company_name)').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Deal[];
    },
  });

  const { data: activities = [] } = useQuery({
    queryKey: ['crm-activities'],
    queryFn: async () => {
      const { data, error } = await supabase.from('activities').select('*, contacts(contact_name, company_name), deals(title)').order('due_date', { ascending: true });
      if (error) throw error;
      return data as Activity[];
    },
  });

  const { data: quotes = [] } = useQuery({
    queryKey: ['crm-quotes'],
    queryFn: async () => {
      const { data, error } = await supabase.from('quotes').select('*, contacts(contact_name, company_name)').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Quote[];
    },
  });

  const handleNewForTab = () => {
    if (tab === 'contacts') { setEditContact(null); setShowContactDialog(true); }
    else if (tab === 'pipeline') { setEditDeal(null); setShowDealDialog(true); }
    else if (tab === 'agenda') { setEditActivity(null); setShowActivityDialog(true); }
  };

  const handleExport = () => {
    if (tab === 'contacts') {
      exportToExcel(contacts.map(c => ({
        Nombre: c.contact_name, Empresa: c.company_name, RNC: c.rnc, Email: c.email,
        Teléfono: c.phone, WhatsApp: c.whatsapp, Segmento: c.segment, Territorio: c.territory,
        'Revenue USD': c.lifetime_revenue_usd, Pedidos: c.total_orders,
      })), 'contactos_crm', 'Contactos');
    } else if (tab === 'pipeline') {
      exportToExcel(deals.map(d => ({
        Título: d.title, Contacto: d.contacts?.contact_name, Empresa: d.contacts?.company_name,
        Etapa: d.stage, 'Valor USD': d.value_usd, Probabilidad: d.probability,
        'Cierre Esperado': d.expected_close_date, Proyecto: d.project_name,
      })), 'deals_pipeline', 'Pipeline');
    }
  };

  const NEW_LABELS: Record<Tab, string> = { pipeline: 'Deal', contacts: 'Contacto', agenda: 'Actividad', quotes: 'Cotización', projects: 'Proyecto' };

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <div className="flex gap-1 rounded-xl bg-muted p-1">
            {([
              { key: 'pipeline' as Tab, label: 'Pipeline' },
              { key: 'contacts' as Tab, label: 'Contactos' },
              { key: 'agenda' as Tab, label: 'Agenda' },
              { key: 'quotes' as Tab, label: 'Cotizaciones' },
              { key: 'projects' as Tab, label: 'Proyectos' },
            ]).map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} className={cn(
                'rounded-lg px-4 py-1.5 text-xs font-medium transition-colors',
                tab === t.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              )}>
                {t.label}
              </button>
            ))}
          </div>
          {tab !== 'projects' && (
            <Button size="sm" onClick={handleNewForTab}>
              <Plus className="w-3.5 h-3.5 mr-1" /> {NEW_LABELS[tab]}
            </Button>
          )}
          {(tab === 'contacts' || tab === 'pipeline') && (
            <Button size="sm" variant="outline" onClick={handleExport}>
              <Download className="w-3.5 h-3.5 mr-1" /> Excel
            </Button>
          )}
        </div>

        {tab === 'pipeline' && (
          <PipelineTab
            deals={deals}
            onEdit={(d) => { setEditDeal(d); setShowDealDialog(true); }}
            onDelete={(d) => setDeleteItem({ type: 'deal', item: d })}
          />
        )}

        {tab === 'contacts' && (
          <ContactsTab
            contacts={contacts}
            onEdit={(c) => { setEditContact(c); setShowContactDialog(true); }}
            onDelete={(c) => setDeleteItem({ type: 'contact', item: c })}
            onNew={() => { setEditContact(null); setShowContactDialog(true); }}
            onView={(c) => setViewContact(c)}
          />
        )}

        {tab === 'agenda' && <AgendaTab activities={activities} />}

        {tab === 'quotes' && (
          <QuotesTab
            quotes={quotes}
            onNew={() => {}}
            onEdit={() => {}}
            onDelete={(q) => setDeleteItem({ type: 'quote', item: q })}
          />
        )}

        {tab === 'projects' && <ClientProjectsTab contacts={contacts} />}
      </div>

      <ContactDialog open={showContactDialog} onOpenChange={(v) => { setShowContactDialog(v); if (!v) setEditContact(null); }} queryClient={queryClient} editContact={editContact} />
      <DealDialog open={showDealDialog} onOpenChange={(v) => { setShowDealDialog(v); if (!v) setEditDeal(null); }} contacts={contacts} queryClient={queryClient} editDeal={editDeal} />
      <ActivityDialog open={showActivityDialog} onOpenChange={(v) => { setShowActivityDialog(v); if (!v) setEditActivity(null); }} contacts={contacts} deals={deals} queryClient={queryClient} editActivity={editActivity} />
      <CrmDeleteDialog open={!!deleteItem} onOpenChange={(v) => { if (!v) setDeleteItem(null); }} type={deleteItem?.type || 'contact'} item={deleteItem?.item} queryClient={queryClient} />
      <ContactDetailDialog open={!!viewContact} onOpenChange={(v) => { if (!v) setViewContact(null); }} contact={viewContact} />
    </AppLayout>
  );
}
