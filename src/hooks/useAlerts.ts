import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AlertRule {
  id: string;
  label: string;
  description: string;
  category: 'margin' | 'concentration' | 'inventory' | 'crm' | 'finance';
  enabled: boolean;
  threshold: number;
  unit: '%' | 'days' | 'units' | 'USD';
}

export const DEFAULT_ALERT_RULES: AlertRule[] = [
  { id: 'low_margin', label: 'Margen bajo por producto', description: 'Alerta cuando un producto tiene margen real menor al umbral', category: 'margin', enabled: true, threshold: 20, unit: '%' },
  { id: 'client_concentration', label: 'Concentración de cliente', description: 'Alerta cuando un cliente concentra más del umbral del ingreso total', category: 'concentration', enabled: true, threshold: 40, unit: '%' },
  { id: 'low_stock', label: 'Stock bajo', description: 'Alerta cuando el inventario está en o debajo del punto de reorden', category: 'inventory', enabled: true, threshold: 0, unit: 'units' },
  { id: 'out_of_stock', label: 'Sin stock', description: 'Alerta cuando el inventario llega a cero', category: 'inventory', enabled: true, threshold: 0, unit: 'units' },
  { id: 'reorder_needed', label: 'Reorden necesario', description: 'Alerta cuando un producto alcanza exactamente su punto de reorden', category: 'inventory', enabled: true, threshold: 0, unit: 'units' },
  { id: 'shipment_delayed', label: 'Envío retrasado', description: 'Alerta cuando un envío supera su ETA sin ser recibido', category: 'inventory', enabled: true, threshold: 0, unit: 'days' },
  { id: 'stale_deals', label: 'Deals estancados', description: 'Alerta cuando un deal no se mueve en X días', category: 'crm', enabled: true, threshold: 7, unit: 'days' },
  { id: 'overdue_activities', label: 'Actividades vencidas', description: 'Alerta cuando hay actividades pasadas de su fecha límite', category: 'crm', enabled: true, threshold: 0, unit: 'days' },
  { id: 'overdue_payments', label: 'Pagos vencidos', description: 'Alerta cuando hay ventas con estado vencido', category: 'finance', enabled: true, threshold: 0, unit: 'USD' },
  { id: 'high_expense_month', label: 'Gasto mensual elevado', description: 'Alerta cuando los gastos del mes superan el umbral en USD', category: 'finance', enabled: true, threshold: 5000, unit: 'USD' },
  { id: 'negative_cashflow', label: 'Flujo de caja negativo', description: 'Alerta cuando el flujo neto mensual es negativo', category: 'finance', enabled: true, threshold: 0, unit: 'USD' },
  { id: 'client_declining', label: 'Cliente sin compras recientes', description: 'Alerta cuando un cliente activo no compra en X días', category: 'crm', enabled: true, threshold: 30, unit: 'days' },
];

export interface AlertItem {
  ruleId: string;
  label: string;
  category: string;
  severity: 'warning' | 'critical';
  message: string;
  count: number;
  navigateTo?: string;
}

export function useAlertRules() {
  const query = useQuery({
    queryKey: ['alert-rules'],
    queryFn: async () => {
      const { data } = await supabase.from('settings').select('*').eq('key', 'alert_rules').maybeSingle();
      if (data?.value && Array.isArray(data.value)) {
        // Merge saved with defaults to pick up new rules
        const saved = data.value as unknown as AlertRule[];
        const savedMap = Object.fromEntries(saved.map(r => [r.id, r]));
        return DEFAULT_ALERT_RULES.map(d => savedMap[d.id] ? { ...d, ...savedMap[d.id] } : d);
      }
      return DEFAULT_ALERT_RULES;
    },
  });
  return query;
}

export function useAlerts() {
  const { data: rules = DEFAULT_ALERT_RULES } = useAlertRules();

  return useQuery({
    queryKey: ['computed-alerts', rules],
    queryFn: async () => {
      const alerts: AlertItem[] = [];
      const enabledRules = rules.filter(r => r.enabled);
      if (enabledRules.length === 0) return alerts;

      // Fetch data in parallel
      const [
        { data: products },
        { data: inventory },
        { data: saleItems },
        { data: sales },
        { data: deals },
        { data: activities },
        { data: expenses },
        { data: shipments },
      ] = await Promise.all([
        supabase.from('products').select('id, name, margin_list_pct, margin_wholesale_pct, margin_project_pct, margin_architect_pct'),
        supabase.from('inventory').select('product_id, quantity_on_hand, products(name, reorder_point)'),
        supabase.from('sale_items').select('product_id, quantity, unit_price_usd, unit_cost_usd, line_total_usd, sales(date, contact_id, crm_clients(name))'),
        supabase.from('sales').select('id, invoice_ref, total_usd, date, payment_status, crm_clients(name)'),
        supabase.from('deals').select('id, title, value_usd, stage, updated_at, contacts(contact_name)').not('stage', 'in', '("won","lost")'),
        supabase.from('activities').select('id, title, due_date, contacts(contact_name)').eq('is_completed', false),
        supabase.from('expenses').select('date, amount_usd'),
        supabase.from('shipments').select('id, po_number, supplier_name, status, estimated_arrival, actual_arrival').not('status', 'eq', 'received'),
      ]);

      const ruleMap = Object.fromEntries(enabledRules.map(r => [r.id, r]));

      // 1. Low margin products
      if (ruleMap['low_margin'] && saleItems?.length) {
        const threshold = ruleMap['low_margin'].threshold;
        const productMargins: Record<string, { name: string; revenue: number; cost: number }> = {};
        saleItems.forEach((si: any) => {
          const pid = si.product_id;
          if (!pid) return;
          if (!productMargins[pid]) {
            const p = products?.find(pp => pp.id === pid);
            productMargins[pid] = { name: p?.name || '?', revenue: 0, cost: 0 };
          }
          productMargins[pid].revenue += Number(si.line_total_usd || 0);
          productMargins[pid].cost += Number(si.unit_cost_usd || 0) * Number(si.quantity || 0);
        });
        const lowMarginProducts = Object.values(productMargins).filter(p => {
          if (p.revenue === 0) return false;
          const margin = ((p.revenue - p.cost) / p.revenue) * 100;
          return margin < threshold;
        });
        if (lowMarginProducts.length > 0) {
          alerts.push({
            ruleId: 'low_margin',
            label: 'Margen bajo',
            category: 'margin',
            severity: 'warning',
            count: lowMarginProducts.length,
            message: `${lowMarginProducts.length} producto(s) con margen < ${threshold}%: ${lowMarginProducts.slice(0, 3).map(p => p.name).join(', ')}`,
            navigateTo: '/finanzas',
          });
        }
      }

      // 2. Client concentration
      if (ruleMap['client_concentration'] && saleItems?.length) {
        const threshold = ruleMap['client_concentration'].threshold;
        const clientRevenue: Record<string, { name: string; total: number }> = {};
        let grandTotal = 0;
        saleItems.forEach((si: any) => {
          const cid = si.sales?.contact_id;
          if (!cid) return;
          const amt = Number(si.line_total_usd || 0);
          grandTotal += amt;
          if (!clientRevenue[cid]) clientRevenue[cid] = { name: si.sales?.crm_clients?.name || '?', total: 0 };
          clientRevenue[cid].total += amt;
        });
        if (grandTotal > 0) {
          const concentrated = Object.values(clientRevenue).filter(c => (c.total / grandTotal) * 100 > threshold);
          if (concentrated.length > 0) {
            alerts.push({
              ruleId: 'client_concentration',
              label: 'Concentración de ingreso',
              category: 'concentration',
              severity: 'critical',
              count: concentrated.length,
              message: `${concentrated.map(c => `${c.name} (${((c.total / grandTotal) * 100).toFixed(0)}%)`).join(', ')} concentra(n) > ${threshold}% del ingreso`,
              navigateTo: '/crm',
            });
          }
        }
      }

      // 3. Low stock & out of stock
      if (inventory?.length) {
        if (ruleMap['out_of_stock']) {
          const oos = inventory.filter((i: any) => i.quantity_on_hand === 0);
          if (oos.length > 0) {
            alerts.push({
              ruleId: 'out_of_stock',
              label: 'Sin stock',
              category: 'inventory',
              severity: 'critical',
              count: oos.length,
              message: `${oos.length} producto(s) agotados: ${oos.slice(0, 3).map((i: any) => i.products?.name).join(', ')}`,
              navigateTo: '/inventario',
            });
          }
        }
        if (ruleMap['low_stock']) {
          const low = inventory.filter((i: any) => i.quantity_on_hand > 0 && i.quantity_on_hand <= Number(i.products?.reorder_point || 0));
          if (low.length > 0) {
            alerts.push({
              ruleId: 'low_stock',
              label: 'Stock bajo',
              category: 'inventory',
              severity: 'warning',
              count: low.length,
              message: `${low.length} producto(s) bajo punto de reorden: ${low.slice(0, 3).map((i: any) => i.products?.name).join(', ')}`,
              navigateTo: '/inventario',
            });
          }
        }
        if (ruleMap['reorder_needed']) {
          const reorder = inventory.filter((i: any) => {
            const rp = Number(i.products?.reorder_point || 0);
            return rp > 0 && i.quantity_on_hand > 0 && i.quantity_on_hand <= rp;
          });
          if (reorder.length > 0) {
            alerts.push({
              ruleId: 'reorder_needed',
              label: 'Reorden necesario',
              category: 'inventory',
              severity: 'warning',
              count: reorder.length,
              message: `${reorder.length} producto(s) alcanzaron su punto de reorden: ${reorder.slice(0, 3).map((i: any) => `${i.products?.name} (${i.quantity_on_hand} uds)`).join(', ')}`,
              navigateTo: '/inventario',
            });
          }
        }
      }

      // 3b. Delayed shipments
      if (ruleMap['shipment_delayed'] && shipments?.length) {
        const todayStr = new Date().toISOString().split('T')[0];
        const delayed = shipments.filter((s: any) => s.estimated_arrival && s.estimated_arrival < todayStr && s.status !== 'received');
        if (delayed.length > 0) {
          const details = delayed.slice(0, 3).map((s: any) => {
            const daysLate = Math.floor((Date.now() - new Date(s.estimated_arrival).getTime()) / 86400000);
            return `${s.po_number || s.supplier_name} (${daysLate}d tarde)`;
          });
          alerts.push({
            ruleId: 'shipment_delayed',
            label: 'Envíos retrasados',
            category: 'inventory',
            severity: 'critical',
            count: delayed.length,
            message: `${delayed.length} envío(s) pasaron su ETA: ${details.join(', ')}`,
            navigateTo: '/inventario',
          });
        }
      }

      // 4. Stale deals
      if (ruleMap['stale_deals'] && deals?.length) {
        const threshold = ruleMap['stale_deals'].threshold;
        const now = Date.now();
        const stale = deals.filter((d: any) => {
          const days = (now - new Date(d.updated_at).getTime()) / 86400000;
          return days > threshold;
        });
        if (stale.length > 0) {
          alerts.push({
            ruleId: 'stale_deals',
            label: 'Deals estancados',
            category: 'crm',
            severity: 'warning',
            count: stale.length,
            message: `${stale.length} deal(s) sin movimiento en ${threshold}+ días`,
            navigateTo: '/crm',
          });
        }
      }

      // 5. Overdue activities
      if (ruleMap['overdue_activities'] && activities?.length) {
        const todayStr = new Date().toISOString().split('T')[0];
        const overdue = activities.filter((a: any) => a.due_date && a.due_date < todayStr);
        if (overdue.length > 0) {
          alerts.push({
            ruleId: 'overdue_activities',
            label: 'Actividades vencidas',
            category: 'crm',
            severity: 'critical',
            count: overdue.length,
            message: `${overdue.length} actividad(es) pasadas de fecha`,
            navigateTo: '/crm',
          });
        }
      }

      // 6. Overdue payments
      if (ruleMap['overdue_payments'] && sales?.length) {
        const overdue = sales.filter((s: any) => s.payment_status === 'overdue');
        if (overdue.length > 0) {
          const total = overdue.reduce((s: number, r: any) => s + Number(r.total_usd || 0), 0);
          alerts.push({
            ruleId: 'overdue_payments',
            label: 'Pagos vencidos',
            category: 'finance',
            severity: 'critical',
            count: overdue.length,
            message: `${overdue.length} factura(s) vencida(s) por $${total.toLocaleString('en-US', { minimumFractionDigits: 0 })}`,
            navigateTo: '/finanzas',
          });
        }
      }

      // 7. High expense month
      if (ruleMap['high_expense_month'] && expenses?.length) {
        const threshold = ruleMap['high_expense_month'].threshold;
        const now = new Date();
        const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const monthTotal = expenses.filter((e: any) => e.date?.startsWith(currentKey)).reduce((s: number, e: any) => s + Number(e.amount_usd || 0), 0);
        if (monthTotal > threshold) {
          alerts.push({
            ruleId: 'high_expense_month',
            label: 'Gasto mensual elevado',
            category: 'finance',
            severity: 'warning',
            count: 1,
            message: `Gastos este mes: $${monthTotal.toLocaleString('en-US', { minimumFractionDigits: 0 })} (umbral: $${threshold.toLocaleString()})`,
            navigateTo: '/finanzas',
          });
        }
      }

      // 8. Negative cashflow
      if (ruleMap['negative_cashflow'] && sales?.length && expenses?.length) {
        const now = new Date();
        const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const monthInflows = sales.filter((s: any) => s.date?.startsWith(currentKey) && s.payment_status === 'paid').reduce((s: number, r: any) => s + Number(r.total_usd || 0), 0);
        const monthOutflows = expenses.filter((e: any) => e.date?.startsWith(currentKey)).reduce((s: number, e: any) => s + Number(e.amount_usd || 0), 0);
        if (monthInflows - monthOutflows < 0) {
          alerts.push({
            ruleId: 'negative_cashflow',
            label: 'Flujo de caja negativo',
            category: 'finance',
            severity: 'critical',
            count: 1,
            message: `Flujo neto este mes: -$${Math.abs(monthInflows - monthOutflows).toLocaleString('en-US', { minimumFractionDigits: 0 })}`,
            navigateTo: '/finanzas',
          });
        }
      }

      // 9. Client declining — no purchases in X days
      if (ruleMap['client_declining'] && sales?.length) {
        const threshold = ruleMap['client_declining'].threshold;
        const now = Date.now();
        // Group sales by contact_id → find last purchase date
        const lastPurchase: Record<string, { name: string; lastDate: string }> = {};
        sales.forEach((s: any) => {
          const cid = s.contact_id;
          if (!cid) return;
          if (!lastPurchase[cid] || s.date > lastPurchase[cid].lastDate) {
            lastPurchase[cid] = { name: s.crm_clients?.name || '?', lastDate: s.date };
          }
        });
        const inactive = Object.values(lastPurchase).filter(c => {
          const daysSince = (now - new Date(c.lastDate).getTime()) / 86400000;
          return daysSince > threshold;
        });
        if (inactive.length > 0) {
          const sorted = inactive.sort((a, b) => a.lastDate.localeCompare(b.lastDate));
          alerts.push({
            ruleId: 'client_declining',
            label: 'Clientes inactivos',
            category: 'crm',
            severity: 'warning',
            count: inactive.length,
            message: `${inactive.length} cliente(s) sin compras en ${threshold}+ días: ${sorted.slice(0, 3).map(c => c.name).join(', ')}`,
            navigateTo: '/finanzas',
          });
        }
      }

      alerts.sort((a, b) => (a.severity === 'critical' ? 0 : 1) - (b.severity === 'critical' ? 0 : 1));
      return alerts;
    },
    refetchInterval: 60000, // re-check every minute
  });
}
