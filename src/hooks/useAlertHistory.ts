import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { type AlertItem } from './useAlerts';

/**
 * Logs fired alerts to alert_history table for auditing.
 * Deduplicates: only logs a given ruleId once per hour.
 */
export function useAlertLogger(alerts: AlertItem[] | undefined) {
  const loggedRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!alerts?.length) return;

    const criticalAlerts = alerts.filter(a => a.severity === 'critical');
    if (criticalAlerts.length === 0) return;

    const now = Date.now();
    const ONE_HOUR = 3600000;

    const toLog = criticalAlerts.filter(a => {
      const lastLogged = loggedRef.current[a.ruleId] || 0;
      return now - lastLogged > ONE_HOUR;
    });

    if (toLog.length === 0) return;

    const rows = toLog.map(a => ({
      rule_id: a.ruleId,
      label: a.label,
      category: a.category,
      severity: a.severity,
      message: a.message,
      alert_count: a.count,
    }));

    supabase.from('alert_history').insert(rows).then(() => {
      toLog.forEach(a => {
        loggedRef.current[a.ruleId] = now;
      });
    });
  }, [alerts]);
}

export interface AlertHistoryRow {
  id: string;
  rule_id: string;
  label: string;
  category: string;
  severity: string;
  message: string;
  alert_count: number;
  fired_at: string;
}

export function useAlertHistory(limit = 100) {
  return useQuery({
    queryKey: ['alert-history', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alert_history')
        .select('*')
        .order('fired_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as AlertHistoryRow[];
    },
  });
}
