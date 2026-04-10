import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { exportToExcel } from '@/lib/export-utils';
import { formatUSD } from '@/lib/format';
import { Pencil, Save, X, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const chartTooltipStyle = { background: 'hsl(222, 20%, 10%)', border: '1px solid hsl(222, 20%, 20%)', borderRadius: 8, fontSize: 12 };
const PIE_COLORS = ['hsl(217, 91%, 60%)', 'hsl(160, 84%, 39%)', 'hsl(38, 92%, 50%)', 'hsl(280, 60%, 55%)', 'hsl(0, 84%, 60%)', 'hsl(190, 70%, 50%)', 'hsl(330, 70%, 55%)'];

const REQUEST_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendiente', color: 'bg-warning/15 text-warning' },
  sourcing: { label: 'Buscando', color: 'bg-primary/15 text-primary' },
  available: { label: 'Disponible', color: 'bg-success/15 text-success' },
  declined: { label: 'Declinado', color: 'bg-destructive/15 text-destructive' },
};

type Tab = 'general' | 'requests' | 'alerts';

export default function MasPage() {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('general');
  const [fetching, setFetching] = useState(false);
  const [editingCompany, setEditingCompany] = useState(false);
  const [companyForm, setCompanyForm] = useState({ name: '', rnc: '', address: '' });

  // ---- Queries ----
  const { data: exchangeRate } = useQuery({
    queryKey: ['exchange-rate'],
    queryFn: async () => {
      const { data } = await supabase.from('exchange_rates').select('*').order('date', { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*');
      if (error) throw error;
      return data;
    },
  });

  const { data: companySettings } = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => {
      const { data } = await supabase.from('settings').select('*').eq('key', 'company_info').maybeSingle();
      return data?.value as { name: string; rnc: string; address: string } | null;
    },
  });

  const { data: productRequests = [], refetch: refetchRequests } = useQuery({
    queryKey: ['product-requests'],
    queryFn: async () => {
      const { data } = await supabase.from('product_requests').select('*, contacts(contact_name, company_name)').order('created_at', { ascending: false });
      return data || [];
    },
  });


  useEffect(() => {
    if (companySettings) {
      setCompanyForm({ name: companySettings.name || '', rnc: companySettings.rnc || '', address: companySettings.address || '' });
    } else {
      setCompanyForm({ name: 'ConstruProtect SRL', rnc: '130-45678-9', address: 'Av. 27 de Febrero #234' });
    }
  }, [companySettings]);

  // ---- Handlers ----
  const handleFetchRate = async () => {
    setFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-exchange-rate', { method: 'POST', body: {} });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Error desconocido');
      toast.success(`Tasa actualizada: Compra ${data.data.usd_buy.toFixed(4)} / Venta ${data.data.usd_sell.toFixed(4)}`);
      queryClient.invalidateQueries({ queryKey: ['exchange-rate'] });
      queryClient.invalidateQueries({ queryKey: ['latest-rate'] });
    } catch (err: any) {
      toast.error(err.message || 'Error al obtener tasa de cambio');
    } finally {
      setFetching(false);
    }
  };

  const handleSaveCompany = async () => {
    const { error } = await supabase.from('settings').upsert({ key: 'company_info', value: companyForm as any }, { onConflict: 'key' });
    if (error) { toast.error('Error al guardar'); return; }
    toast.success('Información actualizada');
    queryClient.invalidateQueries({ queryKey: ['company-settings'] });
    setEditingCompany(false);
  };

  const handleExportProducts = async () => {
    const { data } = await supabase.from('products').select('*').eq('is_active', true);
    if (!data?.length) { toast.error('Sin datos'); return; }
    exportToExcel(data.map(p => ({
      SKU: p.sku, Nombre: p.name, Marca: p.brand, Categoría: p.category,
      'Costo USD': p.unit_cost_usd, 'Precio Lista USD': p.price_list_usd,
      'Precio Proyecto USD': p.price_project_usd, 'Precio Arquitecto USD': p.price_architect_usd,
      'Precio Mayoreo USD': p.price_wholesale_usd,
    })), 'productos', 'Productos');
    toast.success('Exportado');
  };

  const handleExportContacts = async () => {
    const { data } = await supabase.from('contacts').select('*');
    if (!data?.length) { toast.error('Sin datos'); return; }
    exportToExcel(data.map(c => ({
      Nombre: c.contact_name, Empresa: c.company_name, RNC: c.rnc, Email: c.email,
      Teléfono: c.phone, WhatsApp: c.whatsapp, Segmento: c.segment, Territorio: c.territory,
    })), 'contactos', 'Contactos');
    toast.success('Exportado');
  };

  const handleExportSales = async () => {
    const { data } = await supabase.from('sales').select('*');
    if (!data?.length) { toast.error('Sin datos'); return; }
    exportToExcel(data.map(s => ({
      Fecha: s.date, Ref: s.invoice_ref, 'Subtotal USD': s.subtotal_usd,
      'ITBIS USD': s.itbis_usd, 'Total USD': s.total_usd, 'Total DOP': s.total_dop,
      Estado: s.payment_status,
    })), 'ventas', 'Ventas');
    toast.success('Exportado');
  };

  const handleExportExpenses = async () => {
    const { data } = await supabase.from('expenses').select('*');
    if (!data?.length) { toast.error('Sin datos'); return; }
    exportToExcel(data.map(e => ({
      Fecha: e.date, Descripción: e.description, Categoría: e.category,
      Proveedor: e.vendor, 'Monto USD': e.amount_usd, 'Monto DOP': e.amount_dop,
    })), 'gastos', 'Gastos');
    toast.success('Exportado');
  };

  const company = companySettings || { name: 'ConstruProtect SRL', rnc: '130-45678-9', address: 'Av. 27 de Febrero #234' };

  return (
    <AppLayout>
      <div className="space-y-5 max-w-5xl">
        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-muted p-1 w-fit">
          {([
            { key: 'general' as Tab, label: 'General' },
            { key: 'alerts' as Tab, label: '🔔 Alertas' },
            { key: 'requests' as Tab, label: 'Solicitudes Producto' },
          ]).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={cn(
              'rounded-lg px-4 py-1.5 text-xs font-medium transition-colors',
              tab === t.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
            )}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'general' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Company */}
            <div className="rounded-2xl bg-card border border-border p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">Empresa</h2>
                {!editingCompany ? (
                  <Button variant="ghost" size="sm" onClick={() => setEditingCompany(true)}><Pencil className="w-3.5 h-3.5" /></Button>
                ) : (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditingCompany(false)}><X className="w-3.5 h-3.5" /></Button>
                    <Button size="sm" onClick={handleSaveCompany}><Save className="w-3.5 h-3.5 mr-1" /> Guardar</Button>
                  </div>
                )}
              </div>
              {editingCompany ? (
                <div className="space-y-2.5">
                  <div><Label className="text-xs">Nombre</Label><Input value={companyForm.name} onChange={e => setCompanyForm(f => ({ ...f, name: e.target.value }))} className="h-8 text-xs mt-1" /></div>
                  <div><Label className="text-xs">RNC</Label><Input value={companyForm.rnc} onChange={e => setCompanyForm(f => ({ ...f, rnc: e.target.value }))} className="h-8 text-xs mt-1" /></div>
                  <div><Label className="text-xs">Dirección</Label><Input value={companyForm.address} onChange={e => setCompanyForm(f => ({ ...f, address: e.target.value }))} className="h-8 text-xs mt-1" /></div>
                </div>
              ) : (
                <div className="space-y-3 text-sm text-muted-foreground">
                  <div className="flex justify-between"><span>Nombre</span><span className="text-foreground font-medium">{company.name}</span></div>
                  <div className="flex justify-between"><span>RNC</span><span className="text-foreground font-medium">{company.rnc}</span></div>
                  <div className="flex justify-between"><span>Dirección</span><span className="text-foreground text-right font-medium">{company.address}</span></div>
                </div>
              )}
            </div>

            {/* Exchange Rate */}
            <div className="rounded-2xl bg-card border border-border p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Tasa de Cambio</h2>
                  <p className="text-xs text-muted-foreground">Fuente: Banco Central RD</p>
                </div>
                <Button variant="outline" size="sm" onClick={handleFetchRate} disabled={fetching}>
                  {fetching ? '⏳ Actualizando...' : '🔄 Actualizar'}
                </Button>
              </div>
              {exchangeRate ? (
                <>
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="rounded-xl bg-muted p-4">
                      <p className="text-2xl font-bold text-foreground">{Number(exchangeRate.usd_buy).toFixed(4)}</p>
                      <p className="text-xs text-muted-foreground mt-1">Compra USD</p>
                    </div>
                    <div className="rounded-xl bg-muted p-4">
                      <p className="text-2xl font-bold text-foreground">{Number(exchangeRate.usd_sell).toFixed(4)}</p>
                      <p className="text-xs text-muted-foreground mt-1">Venta USD</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Fecha: {exchangeRate.date} · Fuente: {exchangeRate.source}
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Sin datos. Presiona "Actualizar".</p>
              )}
            </div>

            {/* Users */}
            <div className="rounded-2xl bg-card border border-border p-6 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Usuarios</h2>
              <div className="space-y-2">
                {profiles.map(p => (
                  <div key={p.id} className="flex items-center justify-between rounded-xl bg-muted px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{p.full_name}</p>
                      <p className="text-xs text-muted-foreground">{p.role}</p>
                    </div>
                    <span className="h-2.5 w-2.5 rounded-full bg-success" />
                  </div>
                ))}
                {profiles.length === 0 && <p className="text-sm text-muted-foreground">No hay usuarios registrados aún</p>}
              </div>
            </div>

            {/* Data Export */}
            <div className="rounded-2xl bg-card border border-border p-6 space-y-4">
              <h2 className="text-sm font-semibold text-foreground">Exportar Datos</h2>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={handleExportProducts}>📦 Productos</Button>
                <Button variant="outline" size="sm" onClick={handleExportContacts}>👥 Contactos</Button>
                <Button variant="outline" size="sm" onClick={handleExportSales}>💰 Ventas</Button>
                <Button variant="outline" size="sm" onClick={handleExportExpenses}>💸 Gastos</Button>
              </div>
            </div>

            {/* Session */}
            <div className="rounded-2xl bg-card border border-border p-6 lg:col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{user?.email}</p>
                  <p className="text-xs text-muted-foreground">Sesión activa</p>
                </div>
                <Button variant="destructive" onClick={signOut}>Cerrar sesión</Button>
              </div>
            </div>
          </div>
        )}

        {tab === 'alerts' && <AlertsConfigSection />}
        {tab === 'requests' && <ProductRequestsSection requests={productRequests} refetch={refetchRequests} />}
      </div>
    </AppLayout>
  );
}

// ========== Product Requests Tracker ==========
function ProductRequestsSection({ requests, refetch }: { requests: any[]; refetch: () => void }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ product_description: '', category: '', notes: '', priority: 3 });
  const [saving, setSaving] = useState(false);

  const statusCounts = requests.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {} as Record<string, number>);

  const handleAdd = async () => {
    if (!form.product_description.trim()) { toast.error('Descripción requerida'); return; }
    setSaving(true);
    const { error } = await supabase.from('product_requests').insert({
      product_description: form.product_description.trim(),
      category: form.category.trim() || null,
      notes: form.notes.trim() || null,
      priority: form.priority,
    });
    setSaving(false);
    if (error) { toast.error('Error al crear solicitud'); return; }
    toast.success('Solicitud creada');
    setForm({ product_description: '', category: '', notes: '', priority: 3 });
    setShowAdd(false);
    refetch();
  };

  const updateStatus = async (id: string, status: string) => {
    await supabase.from('product_requests').update({ status: status as any }).eq('id', id);
    refetch();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold text-foreground">Solicitudes de Productos</h2>
        <div className="flex gap-2 ml-auto">
          {Object.entries(statusCounts).map(([status, count]) => {
            const cfg = REQUEST_STATUS_LABELS[status];
            return <Badge key={status} variant="outline" className={cn('text-[10px]', cfg?.color)}>{cfg?.label || status}: {count as number}</Badge>;
          })}
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="w-3.5 h-3.5 mr-1" /> Solicitud</Button>
      </div>

      {showAdd && (
        <div className="rounded-2xl bg-card border-2 border-primary/20 p-4 space-y-3 animate-in fade-in slide-in-from-top-2">
          <p className="text-xs font-semibold text-foreground">Nueva Solicitud</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-xs">Descripción del producto *</Label>
              <Input value={form.product_description} onChange={e => setForm(f => ({ ...f, product_description: e.target.value }))} className="h-8 text-xs mt-1" placeholder="Ej: Membrana impermeabilizante 1.5mm..." />
            </div>
            <div>
              <Label className="text-xs">Categoría</Label>
              <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="h-8 text-xs mt-1" placeholder="Pisos, Protección..." />
            </div>
            <div>
              <Label className="text-xs">Prioridad</Label>
              <Select value={String(form.priority)} onValueChange={v => setForm(f => ({ ...f, priority: Number(v) }))}>
                <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map(p => <SelectItem key={p} value={String(p)} className="text-xs">{p} {'⭐'.repeat(p)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Notas</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="text-xs mt-1" rows={2} placeholder="Contexto adicional..." />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleAdd} disabled={saving} className="text-xs">{saving ? 'Guardando...' : 'Crear Solicitud'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)} className="text-xs">Cancelar</Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {requests.map((r: any) => {
          const cfg = REQUEST_STATUS_LABELS[r.status] || { label: r.status, color: '' };
          return (
            <div key={r.id} className="rounded-xl bg-card border border-border p-4 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-semibold text-foreground">{r.product_description}</p>
                  <Badge className={cn('text-[9px]', cfg.color)}>{cfg.label}</Badge>
                  {r.category && <Badge variant="outline" className="text-[9px]">{r.category}</Badge>}
                </div>
                {r.contacts && <p className="text-[10px] text-muted-foreground mt-0.5">Solicitado por: {r.contacts.contact_name} · {r.contacts.company_name}</p>}
                {r.notes && <p className="text-[10px] text-muted-foreground mt-1">{r.notes}</p>}
                <p className="text-[9px] text-muted-foreground mt-1">{new Date(r.created_at).toLocaleDateString('es-DO')}</p>
              </div>
              <Select value={r.status} onValueChange={v => updateStatus(r.id, v)}>
                <SelectTrigger className="h-7 text-[10px] w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending" className="text-xs">Pendiente</SelectItem>
                  <SelectItem value="sourcing" className="text-xs">Buscando</SelectItem>
                  <SelectItem value="available" className="text-xs">Disponible</SelectItem>
                  <SelectItem value="declined" className="text-xs">Declinado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          );
        })}
        {requests.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">Sin solicitudes de productos</p>}
      </div>
    </div>
  );
}




// ========== Alerts Configuration ==========
function AlertsConfigSection() {
  const queryClient = useQueryClient();
  const { data: rules = [] } = useQuery({
    queryKey: ['alert-rules'],
    queryFn: async () => {
      const { data } = await supabase.from('settings').select('*').eq('key', 'alert_rules').maybeSingle();
      if (data?.value && Array.isArray(data.value)) {
        const saved = data.value as unknown as any[];
        const defaults = [
          { id: 'low_margin', label: 'Margen bajo por producto', description: 'Alerta cuando un producto tiene margen real menor al umbral', category: 'margin', enabled: true, threshold: 20, unit: '%' },
          { id: 'client_concentration', label: 'Concentración de cliente', description: 'Alerta cuando un cliente concentra más del umbral del ingreso total', category: 'concentration', enabled: true, threshold: 40, unit: '%' },
          { id: 'low_stock', label: 'Stock bajo', description: 'Alerta cuando el inventario está en o debajo del punto de reorden', category: 'inventory', enabled: true, threshold: 0, unit: 'units' },
          { id: 'out_of_stock', label: 'Sin stock', description: 'Alerta cuando el inventario llega a cero', category: 'inventory', enabled: true, threshold: 0, unit: 'units' },
          { id: 'stale_deals', label: 'Deals estancados', description: 'Alerta cuando un deal no se mueve en X días', category: 'crm', enabled: true, threshold: 7, unit: 'days' },
          { id: 'overdue_activities', label: 'Actividades vencidas', description: 'Alerta cuando hay actividades pasadas de su fecha límite', category: 'crm', enabled: true, threshold: 0, unit: 'days' },
          { id: 'overdue_payments', label: 'Pagos vencidos', description: 'Alerta cuando hay ventas con estado vencido', category: 'finance', enabled: true, threshold: 0, unit: 'USD' },
          { id: 'high_expense_month', label: 'Gasto mensual elevado', description: 'Alerta cuando los gastos del mes superan el umbral en USD', category: 'finance', enabled: true, threshold: 5000, unit: 'USD' },
          { id: 'negative_cashflow', label: 'Flujo de caja negativo', description: 'Alerta cuando el flujo neto mensual es negativo', category: 'finance', enabled: true, threshold: 0, unit: 'USD' },
        ];
        const savedMap = Object.fromEntries(saved.map((r: any) => [r.id, r]));
        return defaults.map(d => savedMap[d.id] ? { ...d, ...savedMap[d.id] } : d);
      }
      return [
        { id: 'low_margin', label: 'Margen bajo por producto', description: 'Alerta cuando un producto tiene margen real menor al umbral', category: 'margin', enabled: true, threshold: 20, unit: '%' },
        { id: 'client_concentration', label: 'Concentración de cliente', description: 'Alerta cuando un cliente concentra más del umbral del ingreso total', category: 'concentration', enabled: true, threshold: 40, unit: '%' },
        { id: 'low_stock', label: 'Stock bajo', description: 'Alerta cuando el inventario está en o debajo del punto de reorden', category: 'inventory', enabled: true, threshold: 0, unit: 'units' },
        { id: 'out_of_stock', label: 'Sin stock', description: 'Alerta cuando el inventario llega a cero', category: 'inventory', enabled: true, threshold: 0, unit: 'units' },
        { id: 'stale_deals', label: 'Deals estancados', description: 'Alerta cuando un deal no se mueve en X días', category: 'crm', enabled: true, threshold: 7, unit: 'days' },
        { id: 'overdue_activities', label: 'Actividades vencidas', description: 'Alerta cuando hay actividades pasadas de su fecha límite', category: 'crm', enabled: true, threshold: 0, unit: 'days' },
        { id: 'overdue_payments', label: 'Pagos vencidos', description: 'Alerta cuando hay ventas con estado vencido', category: 'finance', enabled: true, threshold: 0, unit: 'USD' },
        { id: 'high_expense_month', label: 'Gasto mensual elevado', description: 'Alerta cuando los gastos del mes superan el umbral en USD', category: 'finance', enabled: true, threshold: 5000, unit: 'USD' },
        { id: 'negative_cashflow', label: 'Flujo de caja negativo', description: 'Alerta cuando el flujo neto mensual es negativo', category: 'finance', enabled: true, threshold: 0, unit: 'USD' },
      ];
    },
  });

  const [localRules, setLocalRules] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (rules.length > 0 && localRules.length === 0) setLocalRules(rules);
  }, [rules]);

  const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
    margin: { label: 'Márgenes', icon: '📊' },
    concentration: { label: 'Concentración', icon: '⚖️' },
    inventory: { label: 'Inventario', icon: '📦' },
    crm: { label: 'CRM', icon: '🤝' },
    finance: { label: 'Finanzas', icon: '💰' },
  };

  const categories = [...new Set(localRules.map(r => r.category))];

  const toggleRule = (id: string) => {
    setLocalRules(prev => prev.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const updateThreshold = (id: string, value: number) => {
    setLocalRules(prev => prev.map(r => r.id === id ? { ...r, threshold: value } : r));
  };

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('settings').upsert(
      { key: 'alert_rules', value: localRules as any },
      { onConflict: 'key' }
    );
    setSaving(false);
    if (error) { toast.error('Error al guardar'); return; }
    toast.success('Configuración de alertas guardada');
    queryClient.invalidateQueries({ queryKey: ['alert-rules'] });
    queryClient.invalidateQueries({ queryKey: ['computed-alerts'] });
  };

  const hasThreshold = (rule: any) => !['out_of_stock', 'overdue_activities', 'overdue_payments', 'negative_cashflow'].includes(rule.id);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Configuración de Alertas</h2>
          <p className="text-xs text-muted-foreground">Activa/desactiva alertas y ajusta los umbrales según tu operación</p>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          <Save className="w-3.5 h-3.5 mr-1" /> {saving ? 'Guardando...' : 'Guardar'}
        </Button>
      </div>

      {categories.map(cat => {
        const cfg = CATEGORY_LABELS[cat] || { label: cat, icon: '⚙️' };
        const catRules = localRules.filter(r => r.category === cat);
        return (
          <div key={cat} className="rounded-2xl bg-card border border-border p-5 space-y-3">
            <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
              <span>{cfg.icon}</span> {cfg.label}
            </h3>
            <div className="space-y-2">
              {catRules.map(rule => (
                <div key={rule.id} className={cn(
                  'rounded-xl border px-4 py-3 flex items-center gap-4 transition-colors',
                  rule.enabled ? 'border-border bg-muted/20' : 'border-border/50 bg-muted/5 opacity-60'
                )}>
                  <button
                    onClick={() => toggleRule(rule.id)}
                    className={cn(
                      'w-10 h-5 rounded-full transition-colors relative shrink-0',
                      rule.enabled ? 'bg-primary' : 'bg-muted-foreground/30'
                    )}
                  >
                    <span className={cn(
                      'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                      rule.enabled ? 'left-5' : 'left-0.5'
                    )} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground">{rule.label}</p>
                    <p className="text-[10px] text-muted-foreground">{rule.description}</p>
                  </div>
                  {hasThreshold(rule) && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Input
                        type="number"
                        value={rule.threshold}
                        onChange={e => updateThreshold(rule.id, Number(e.target.value))}
                        className="w-20 h-7 text-xs text-right"
                        disabled={!rule.enabled}
                      />
                      <span className="text-[10px] text-muted-foreground w-8">{rule.unit}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
