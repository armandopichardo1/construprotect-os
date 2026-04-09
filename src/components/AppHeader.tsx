import { SidebarTrigger } from '@/components/ui/sidebar';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/inventario': 'Inventario',
  '/productos': 'Productos',
  '/crm': 'CRM',
  '/finanzas': 'Finanzas',
  '/mas': 'Configuración',
};

export function AppHeader() {
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] || 'ConstruProtect OS';

  const { data: rate } = useQuery({
    queryKey: ['latest-rate'],
    queryFn: async () => {
      const { data } = await supabase.from('exchange_rates').select('*').order('date', { ascending: false }).limit(1).maybeSingle();
      return data;
    },
  });

  return (
    <header className="h-12 flex items-center gap-3 border-b border-border bg-card/50 backdrop-blur-sm px-4 shrink-0">
      <SidebarTrigger className="shrink-0" />
      <h1 className="text-sm font-semibold text-foreground">{title}</h1>
      <div className="flex-1" />
      {rate && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>USD/DOP</span>
          <span className="text-foreground font-medium">C: {Number(rate.usd_buy).toFixed(2)}</span>
          <span className="text-foreground font-medium">V: {Number(rate.usd_sell).toFixed(2)}</span>
        </div>
      )}
    </header>
  );
}
