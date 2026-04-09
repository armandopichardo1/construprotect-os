import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { type Activity, type ActivityType, ACTIVITY_TYPES } from '@/lib/crm-utils';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Circle, AlertTriangle } from 'lucide-react';

interface AgendaTabProps {
  activities: Activity[];
}

export function AgendaTab({ activities }: AgendaTabProps) {
  const queryClient = useQueryClient();
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  const pending = activities.filter(a => !a.is_completed);
  const overdue = pending.filter(a => a.due_date && a.due_date < todayStr);
  const today = pending.filter(a => a.due_date && a.due_date.startsWith(todayStr));
  const thisWeek = pending.filter(a => a.due_date && a.due_date > todayStr && a.due_date <= weekEndStr);
  const upcoming = pending.filter(a => !a.due_date || a.due_date > weekEndStr);

  const toggleComplete = async (activity: Activity) => {
    const { error } = await supabase.from('activities').update({
      is_completed: !activity.is_completed,
      completed_at: !activity.is_completed ? new Date().toISOString() : null,
    }).eq('id', activity.id);
    if (error) { toast.error('Error'); return; }
    queryClient.invalidateQueries({ queryKey: ['crm-activities'] });
  };

  return (
    <div className="space-y-4">
      {/* AI Weekly Summary placeholder */}
      <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-3.5">
        <p className="text-xs font-semibold text-primary mb-1.5">🤖 Agenda Inteligente</p>
        <p className="text-[10px] text-muted-foreground">
          {overdue.length > 0 && `⚠️ ${overdue.length} actividades vencidas. `}
          {today.length > 0 && `📋 ${today.length} para hoy. `}
          {thisWeek.length > 0 && `📅 ${thisWeek.length} esta semana. `}
          {pending.length === 0 && '✅ No hay actividades pendientes.'}
        </p>
      </div>

      {/* Overdue */}
      {overdue.length > 0 && (
        <Section title="⚠️ Vencidas" count={overdue.length} variant="destructive">
          {overdue.map(a => <ActivityRow key={a.id} activity={a} onToggle={toggleComplete} />)}
        </Section>
      )}

      {/* Today */}
      <Section title="📋 Hoy" count={today.length}>
        {today.length === 0 && <p className="text-[10px] text-muted-foreground py-2">Sin actividades para hoy</p>}
        {today.map(a => <ActivityRow key={a.id} activity={a} onToggle={toggleComplete} />)}
      </Section>

      {/* This week */}
      {thisWeek.length > 0 && (
        <Section title="📅 Esta semana" count={thisWeek.length}>
          {thisWeek.map(a => <ActivityRow key={a.id} activity={a} onToggle={toggleComplete} />)}
        </Section>
      )}

      {/* Upcoming / no date */}
      {upcoming.length > 0 && (
        <Section title="🔮 Próximas" count={upcoming.length}>
          {upcoming.map(a => <ActivityRow key={a.id} activity={a} onToggle={toggleComplete} />)}
        </Section>
      )}
    </div>
  );
}

function Section({ title, count, variant, children }: { title: string; count: number; variant?: 'destructive'; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <h3 className={cn('text-xs font-semibold', variant === 'destructive' ? 'text-destructive' : 'text-foreground')}>{title}</h3>
        <span className={cn('px-1.5 py-0.5 rounded-full text-[9px] font-bold', variant === 'destructive' ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground')}>{count}</span>
      </div>
      {children}
    </div>
  );
}

function ActivityRow({ activity, onToggle }: { activity: Activity; onToggle: (a: Activity) => void }) {
  const cfg = ACTIVITY_TYPES[activity.activity_type] || { label: activity.activity_type, emoji: '📌' };
  const isOverdue = activity.due_date && activity.due_date < new Date().toISOString().split('T')[0] && !activity.is_completed;

  return (
    <div className={cn('rounded-xl bg-card border p-2.5 flex items-start gap-2.5', isOverdue ? 'border-destructive/30' : 'border-border')}>
      <button onClick={() => onToggle(activity)} className="mt-0.5 shrink-0">
        {activity.is_completed
          ? <CheckCircle2 className="w-4 h-4 text-success" />
          : <Circle className={cn('w-4 h-4', isOverdue ? 'text-destructive' : 'text-muted-foreground')} />
        }
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px]">{cfg.emoji}</span>
          <p className={cn('text-[11px] font-medium truncate', activity.is_completed ? 'line-through text-muted-foreground' : 'text-foreground')}>{activity.title}</p>
        </div>
        <div className="flex gap-2 mt-0.5 text-[9px] text-muted-foreground">
          {activity.contacts && <span>{activity.contacts.contact_name}</span>}
          {activity.due_date && <span>{new Date(activity.due_date).toLocaleDateString('es-DO', { month: 'short', day: 'numeric' })}</span>}
        </div>
      </div>
    </div>
  );
}
