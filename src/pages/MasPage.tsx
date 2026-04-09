import { AppLayout } from '@/components/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export default function MasPage() {
  const { user, signOut } = useAuth();

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

  return (
    <AppLayout>
      <div className="space-y-5">
        <h1 className="text-lg font-bold text-foreground">Configuración</h1>

        {/* Company */}
        <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Empresa</h2>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Nombre</span>
              <span className="text-foreground">ConstruProtect SRL</span>
            </div>
            <div className="flex justify-between">
              <span>RNC</span>
              <span className="text-foreground">130-45678-9</span>
            </div>
            <div className="flex justify-between">
              <span>Dirección</span>
              <span className="text-foreground text-right">Av. 27 de Febrero #234</span>
            </div>
          </div>
        </div>

        {/* Exchange Rate */}
        <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Tasa de Cambio</h2>
            <Button variant="outline" size="sm" className="text-xs h-7">
              Actualizar ahora
            </Button>
          </div>
          {exchangeRate ? (
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-muted p-3">
                <p className="text-lg font-bold text-foreground">{Number(exchangeRate.usd_buy).toFixed(2)}</p>
                <p className="text-[10px] text-muted-foreground">Compra USD</p>
              </div>
              <div className="rounded-xl bg-muted p-3">
                <p className="text-lg font-bold text-foreground">{Number(exchangeRate.usd_sell).toFixed(2)}</p>
                <p className="text-[10px] text-muted-foreground">Venta USD</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Sin datos de tasa. Presiona "Actualizar ahora".</p>
          )}
        </div>

        {/* Users */}
        <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Usuarios</h2>
          <div className="space-y-2">
            {profiles.map(p => (
              <div key={p.id} className="flex items-center justify-between rounded-xl bg-muted px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-foreground">{p.full_name}</p>
                  <p className="text-[10px] text-muted-foreground">{p.role}</p>
                </div>
                <span className="h-2 w-2 rounded-full bg-success" />
              </div>
            ))}
            {profiles.length === 0 && (
              <p className="text-xs text-muted-foreground">No hay usuarios registrados aún</p>
            )}
          </div>
        </div>

        {/* Import/Export */}
        <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
          <h2 className="text-sm font-semibold text-foreground">Datos</h2>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1 text-xs">
              📥 Importar Excel
            </Button>
            <Button variant="outline" size="sm" className="flex-1 text-xs">
              📤 Exportar CSV
            </Button>
          </div>
        </div>

        {/* Sign out */}
        <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{user?.email}</p>
              <p className="text-[10px] text-muted-foreground">Sesión activa</p>
            </div>
            <Button variant="destructive" size="sm" onClick={signOut} className="text-xs">
              Cerrar sesión
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
