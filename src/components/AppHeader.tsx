import { SidebarTrigger } from '@/components/ui/sidebar';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTheme } from '@/hooks/useTheme';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GlobalSearch } from '@/components/GlobalSearch';
import { NotificationCenter } from '@/components/NotificationCenter';

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
  const { theme, toggle } = useTheme();

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
      <GlobalSearch />
      {rate && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>USD/DOP</span>
          <span className="text-foreground font-medium">C: {Number(rate.usd_buy).toFixed(2)}</span>
          <span className="text-foreground font-medium">V: {Number(rate.usd_sell).toFixed(2)}</span>
        </div>
      )}
      <NotificationCenter />
      <Button variant="ghost" size="icon" onClick={toggle} className="h-8 w-8 shrink-0">
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
    </header>
  );
}