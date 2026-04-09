import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function MasPage() {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [fetching, setFetching] = useState(false);

  const { data: exchangeRate } = useQuery({
    queryKey: ['exchange-rate'],
    queryFn: async () => {
      const { data } = await supabase
        .from('exchange_rates')
        .select('*')
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();
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

  const handleFetchRate = async () => {
    setFetching(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-exchange-rate', {
        method: 'POST',
        body: {},
      });
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

  return (
    <AppLayout>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl">
        {/* Company */}
        <div className="rounded-2xl bg-card border border-border p-6 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Empresa</h2>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div className="flex justify-between">
              <span>Nombre</span>
              <span className="text-foreground font-medium">ConstruProtect SRL</span>
            </div>
            <div className="flex justify-between">
              <span>RNC</span>
              <span className="text-foreground font-medium">130-45678-9</span>
            </div>
            <div className="flex justify-between">
              <span>Dirección</span>
              <span className="text-foreground text-right font-medium">Av. 27 de Febrero #234</span>
            </div>
          </div>
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
            {profiles.length === 0 && (
              <p className="text-sm text-muted-foreground">No hay usuarios registrados aún</p>
            )}
          </div>
        </div>

        {/* Data Import/Export */}
        <div className="rounded-2xl bg-card border border-border p-6 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Datos</h2>
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1">📥 Importar Excel</Button>
            <Button variant="outline" className="flex-1">📤 Exportar CSV</Button>
          </div>
        </div>

        {/* Session */}
        <div className="rounded-2xl bg-card border border-border p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{user?.email}</p>
              <p className="text-xs text-muted-foreground">Sesión activa</p>
            </div>
            <Button variant="destructive" onClick={signOut}>
              Cerrar sesión
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
