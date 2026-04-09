import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

const tabs = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/inventario', label: 'Inventario', icon: '📦' },
  { path: '/crm', label: 'CRM', icon: '🤝' },
  { path: '/finanzas', label: 'Finanzas', icon: '💰' },
  { path: '/mas', label: 'Más', icon: '⚙️' },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-lg">
      <div className="mx-auto flex max-w-[480px] items-center justify-around py-1.5">
        {tabs.map((tab) => {
          const active = tab.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(tab.path);
          return (
            <button
              key={tab.path}
              onClick={() => navigate(tab.path)}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors min-w-[56px]',
                active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <span className="text-xl">{tab.icon}</span>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
