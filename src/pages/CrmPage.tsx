import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { cn } from '@/lib/utils';

const pipelineStages = [
  { name: 'Prospecto', count: 12, value: 45000, color: 'bg-muted' },
  { name: 'Contactado', count: 8, value: 32000, color: 'bg-primary/30' },
  { name: 'Cotizado', count: 5, value: 28000, color: 'bg-primary/50' },
  { name: 'Negociación', count: 3, value: 18000, color: 'bg-primary/70' },
  { name: 'Cerrado', count: 2, value: 12400, color: 'bg-primary' },
];

const clients = [
  { name: 'Arq. María Santos', company: 'Santos Diseño', deals: 3, value: 24500, status: 'active' },
  { name: 'Ing. Carlos Pérez', company: 'Constructora CPR', deals: 2, value: 18300, status: 'active' },
  { name: 'Laura Méndez', company: 'Méndez Interiors', deals: 1, value: 8200, status: 'prospect' },
  { name: 'Roberto Acosta', company: 'Acosta Builders', deals: 4, value: 45000, status: 'active' },
  { name: 'Diana Flores', company: 'DF Arquitectura', deals: 1, value: 5600, status: 'prospect' },
];

export default function CrmPage() {
  const [tab, setTab] = useState<'pipeline' | 'clients'>('pipeline');

  return (
    <AppLayout>
      <div className="space-y-4">
        <h1 className="text-lg font-bold text-foreground">CRM</h1>

        <div className="flex gap-1 rounded-xl bg-muted p-1">
          {(['pipeline', 'clients'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
              )}
            >
              {t === 'pipeline' ? 'Pipeline' : 'Clientes'}
            </button>
          ))}
        </div>

        {tab === 'pipeline' && (
          <div className="space-y-3">
            {/* Funnel */}
            <div className="rounded-2xl bg-card border border-border p-4 space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Embudo de Ventas</h2>
              {pipelineStages.map((s, i) => (
                <div key={s.name} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-foreground">{s.name} ({s.count})</span>
                    <span className="text-muted-foreground">${(s.value / 1000).toFixed(0)}K</span>
                  </div>
                  <div className="h-3 rounded-full bg-muted overflow-hidden" style={{ width: `${100 - i * 15}%` }}>
                    <div className={cn('h-full rounded-full', s.color)} style={{ width: '100%' }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-card border border-border p-3 text-center">
                <p className="text-xl font-bold text-foreground">30</p>
                <p className="text-[10px] text-muted-foreground">Oportunidades activas</p>
              </div>
              <div className="rounded-xl bg-card border border-border p-3 text-center">
                <p className="text-xl font-bold text-primary">$135K</p>
                <p className="text-[10px] text-muted-foreground">Valor total pipeline</p>
              </div>
            </div>
          </div>
        )}

        {tab === 'clients' && (
          <div className="space-y-2">
            {clients.map(c => (
              <div key={c.name} className="rounded-xl bg-card border border-border p-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.name}</p>
                    <p className="text-[10px] text-muted-foreground">{c.company}</p>
                  </div>
                  <span className={cn(
                    'px-2 py-0.5 rounded-full text-[10px] font-semibold',
                    c.status === 'active' ? 'bg-success/15 text-success' : 'bg-primary/15 text-primary'
                  )}>
                    {c.status === 'active' ? 'Activo' : 'Prospecto'}
                  </span>
                </div>
                <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                  <span>{c.deals} oportunidades</span>
                  <span className="text-foreground font-medium">${(c.value / 1000).toFixed(1)}K</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
