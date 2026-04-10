import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { exportToExcel } from '@/lib/export-utils';
import { Pencil, Save, X } from 'lucide-react';

export default function MasPage() {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [fetching, setFetching] = useState(false);
  const [editingCompany, setEditingCompany] = useState(false);
  const [companyForm, setCompanyForm] = useState({ name: '', rnc: '', address: '' });

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

  useEffect(() => {
    if (companySettings) {
      setCompanyForm({ name: companySettings.name || '', rnc: companySettings.rnc || '', address: companySettings.address || '' });
    } else {
      setCompanyForm({ name: 'ConstruProtect SRL', rnc: '130-45678-9', address: 'Av. 27 de Febrero #234' });
    }
  }, [companySettings]);

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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
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
    </AppLayout>
  );
}
