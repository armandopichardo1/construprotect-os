import { useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { History, Search, Undo2, ExternalLink, AlertTriangle, ShieldCheck, RefreshCw, ChevronRight, ChevronDown, ChevronsDown, ChevronsUp, Package, BookOpen } from 'lucide-react';

const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type FilterStatus = 'all' | 'active' | 'reversed';
type FilterType = 'all' | 'edit' | 'historical_adjustment' | 'reversal';

const TYPE_LABELS: Record<string, string> = {
  edit: 'Edición',
  historical_adjustment: 'Ajuste histórico',
  reversal: 'Reverso',
};
const TYPE_COLORS: Record<string, string> = {
  edit: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  historical_adjustment: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  reversal: 'bg-red-500/15 text-red-400 border-red-500/30',
};

export function AjustesAuditoriaTab() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [reverseTarget, setReverseTarget] = useState<any | null>(null);
  const [reversing, setReversing] = useState(false);
  const [resyncTarget, setResyncTarget] = useState<any | null>(null);
  const [resyncing, setResyncing] = useState(false);
  const [resyncResult, setResyncResult] = useState<{ sku: string; oldCost: number; newCost: number }[] | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['shipment-expense-history-all'],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('shipment_expense_history')
        .select('*, shipments(id, po_number, supplier_name, status, shipment_items(id, product_id, quantity_ordered, unit_cost_usd, products(sku, name)))')
        .order('created_at', { ascending: false })
        .limit(500);
      return data || [];
    },
  });

  const journalIds = useMemo(
    () => Array.from(new Set([
      ...history.map((h: any) => h.journal_entry_id).filter(Boolean),
      ...history.map((h: any) => h.reversal_journal_entry_id).filter(Boolean),
    ])) as string[],
    [history]
  );
  const { data: journals = [] } = useQuery({
    queryKey: ['shipment-expense-history-journals', journalIds.join(',')],
    enabled: journalIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('journal_entries')
        .select('id, date, description, total_debit_usd')
        .in('id', journalIds);
      return data || [];
    },
  });
  const journalById = useMemo(() => {
    const m: Record<string, any> = {};
    (journals || []).forEach((j: any) => { m[j.id] = j; });
    return m;
  }, [journals]);

  // Detalles de los registros expandidos (uno o varios)
  const expandedRows = useMemo(
    () => history.filter((h: any) => expandedIds.has(h.id)),
    [history, expandedIds]
  );
  const expandedJeIds = useMemo(() => {
    const ids = new Set<string>();
    expandedRows.forEach((r: any) => {
      if (r.journal_entry_id) ids.add(r.journal_entry_id);
      if (r.reversal_journal_entry_id) ids.add(r.reversal_journal_entry_id);
    });
    return Array.from(ids);
  }, [expandedRows]);
  const expandedProductIds = useMemo(() => {
    const ids = new Set<string>();
    expandedRows.forEach((r: any) => {
      (r?.shipments?.shipment_items || []).forEach((it: any) => {
        if (it.product_id) ids.add(it.product_id);
      });
    });
    return Array.from(ids);
  }, [expandedRows]);

  const { data: expandedJeLines = [] } = useQuery({
    queryKey: ['shipment-expense-history-je-lines', expandedJeIds.join(',')],
    enabled: expandedJeIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('journal_entry_lines')
        .select('journal_entry_id, debit_usd, credit_usd, description, account_id, chart_of_accounts(code, description)')
        .in('journal_entry_id', expandedJeIds);
      return data || [];
    },
  });

  const { data: expandedProductsState = [] } = useQuery({
    queryKey: ['shipment-expense-history-products-state', expandedProductIds.join(',')],
    enabled: expandedProductIds.length > 0,
    queryFn: async () => {
      const [{ data: prods }, { data: invs }] = await Promise.all([
        supabase.from('products').select('id, sku, name, unit_cost_usd').in('id', expandedProductIds),
        supabase.from('inventory').select('product_id, quantity_on_hand').in('product_id', expandedProductIds),
      ]);
      const invMap: Record<string, number> = {};
      (invs || []).forEach((i: any) => { invMap[i.product_id] = Number(i.quantity_on_hand || 0); });
      return (prods || []).map((p: any) => ({
        ...p,
        stock_on_hand: invMap[p.id] || 0,
      }));
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return history.filter((h: any) => {
      if (filterStatus === 'active' && h.reversed_at) return false;
      if (filterStatus === 'reversed' && !h.reversed_at) return false;
      const t = h.adjustment_type || 'edit';
      if (filterType !== 'all' && t !== filterType) return false;
      if (!q) return true;
      const po = h.shipments?.po_number || '';
      const sup = h.shipments?.supplier_name || '';
      const usr = h.changed_by_name || '';
      return [po, sup, usr, h.notes || ''].some(v => String(v).toLowerCase().includes(q));
    });
  }, [history, search, filterStatus, filterType]);

  const stats = useMemo(() => {
    const active = history.filter((h: any) => !h.reversed_at);
    const reversed = history.filter((h: any) => h.reversed_at);
    const totalActive = active.reduce((s: number, h: any) => s + Number(h.delta_total_usd || 0), 0);
    return { count: history.length, active: active.length, reversed: reversed.length, totalActive };
  }, [history]);

  const openJournal = (jeId: string) => {
    const short = String(jeId).slice(0, 8);
    navigate(`/finanzas?tab=${encodeURIComponent('Libro Diario')}&q=${short}`);
  };

  const handleReverse = async () => {
    if (!reverseTarget) return;
    if (reverseTarget.reversed_at) {
      toast.error('Este ajuste ya fue reversado.');
      return;
    }
    setReversing(true);
    try {
      const h = reverseTarget;
      const shipment = h.shipments;
      if (!shipment) throw new Error('Envío no encontrado');
      const poRef = shipment.po_number || String(shipment.id).slice(0, 8);

      // 1) Cargar asiento original para reproducir cuentas (DR ↔ CR)
      const { data: origLines } = await supabase
        .from('journal_entry_lines')
        .select('account_id, debit_usd, credit_usd, description')
        .eq('journal_entry_id', h.journal_entry_id);
      if (!origLines || origLines.length === 0) throw new Error('Asiento original no encontrado o vacío');

      const today = new Date().toISOString().slice(0, 10);
      const total = Number(h.delta_total_usd || 0);
      const absTotal = Math.abs(total);

      // 2) Crear contra-asiento (debit ↔ credit invertidos)
      const { data: revJe, error: revErr } = await supabase
        .from('journal_entries')
        .insert({
          date: today,
          description: `Reverso de ajuste — Envío ${poRef}`,
          total_debit_usd: absTotal,
          total_credit_usd: absTotal,
          notes: `Reverso del asiento ${String(h.journal_entry_id).slice(0, 8)} (historial ${String(h.id).slice(0, 8)})`,
          reference_type: 'shipment_expense_reversal',
          reference_id: shipment.id,
        } as any)
        .select('id')
        .single();
      if (revErr) throw revErr;

      const revLines = origLines.map((l: any) => ({
        journal_entry_id: revJe.id,
        account_id: l.account_id,
        debit_usd: Number(l.credit_usd || 0),
        credit_usd: Number(l.debit_usd || 0),
        description: `Reverso: ${l.description || ''}`.trim(),
      }));
      const { error: revLinesErr } = await supabase.from('journal_entry_lines').insert(revLines);
      if (revLinesErr) throw revLinesErr;

      // 3) Revertir totales del envío (restar el delta)
      const newFreight = Math.max(0, Number(h.new_freight_usd || 0) - (Number(h.new_freight_usd || 0) - Number(h.previous_freight_usd || 0)));
      const newCustoms = Math.max(0, Number(h.new_customs_usd || 0) - (Number(h.new_customs_usd || 0) - Number(h.previous_customs_usd || 0)));
      const newOther = Math.max(0, Number(h.new_other_usd || 0) - (Number(h.new_other_usd || 0) - Number(h.previous_other_usd || 0)));
      // Lo anterior = restablecer a previous_*; usamos los valores previos directamente:
      const restoredFreight = Number(h.previous_freight_usd || 0);
      const restoredCustoms = Number(h.previous_customs_usd || 0);
      const restoredOther = Number(h.previous_other_usd || 0);
      await supabase
        .from('shipments')
        .update({
          shipping_cost_usd: restoredFreight,
          customs_cost_usd: restoredCustoms,
          other_cost_usd: restoredOther,
        } as any)
        .eq('id', shipment.id);

      // 4) Re-sincronizar WAC y márgenes — forward-only
      // Aplica el inverso del addon por unidad sobre el stock disponible HOY.
      // Movimientos previos quedan INTACTOS; solo se inserta un movimiento qty=0.
      const wacResynced: { sku: string; oldCost: number; newCost: number }[] = [];
      const items: any[] = shipment.shipment_items || [];
      const itemFobTotals = items.map((it: any) => ({
        item: it,
        base: Number(it.unit_cost_usd || 0) * Number(it.quantity_ordered || 0),
      }));
      const sumBase = itemFobTotals.reduce((s, x) => s + x.base, 0);
      const sumUnits = items.reduce((s: number, it: any) => s + Number(it.quantity_ordered || 0), 0);

      for (const { item, base } of itemFobTotals) {
        if (!item.product_id) continue;
        const qtyOrdered = Number(item.quantity_ordered || 0);
        if (qtyOrdered <= 0) continue;
        const share = sumBase > 0
          ? base / sumBase
          : (sumUnits > 0 ? qtyOrdered / sumUnits : 0);
        const lineAddon = total * share;
        if (Math.abs(lineAddon) < 0.0001) continue;
        const addonPerUnit = lineAddon / qtyOrdered;

        const { data: prod } = await supabase
          .from('products')
          .select('sku, unit_cost_usd, price_list_usd, price_architect_usd, price_project_usd, price_wholesale_usd')
          .eq('id', item.product_id)
          .single();
        if (!prod) continue;

        const currentCost = Number(prod.unit_cost_usd || 0);
        let newCost = currentCost;
        const { data: inv } = await supabase
          .from('inventory')
          .select('quantity_on_hand')
          .eq('product_id', item.product_id)
          .maybeSingle();
        const stockQty = Number(inv?.quantity_on_hand || 0);

        if (stockQty > 0) {
          const applicableUnits = Math.min(stockQty, qtyOrdered);
          const reverseAddon = -addonPerUnit * applicableUnits;
          const onHandValue = stockQty * currentCost;
          newCost = (onHandValue + reverseAddon) / stockQty;
          newCost = Math.max(0, newCost);
        } else {
          // Sin stock: simplemente restamos el addon del unit_cost del item
          const newItemCost = Math.max(0, Number(item.unit_cost_usd || 0) - addonPerUnit);
          await supabase
            .from('shipment_items')
            .update({ unit_cost_usd: Number(newItemCost.toFixed(4)) })
            .eq('id', item.id);
        }

        const updates: Record<string, number> = {
          unit_cost_usd: Number(newCost.toFixed(4)),
          total_unit_cost_usd: Number(newCost.toFixed(4)),
        };
        [
          { price: Number(prod.price_list_usd), field: 'margin_list_pct' },
          { price: Number(prod.price_architect_usd), field: 'margin_architect_pct' },
          { price: Number(prod.price_project_usd), field: 'margin_project_pct' },
          { price: Number(prod.price_wholesale_usd), field: 'margin_wholesale_pct' },
        ].forEach(({ price, field }) => {
          if (price > 0) updates[field] = Number((((price - newCost) / price) * 100).toFixed(1));
        });
        await supabase.from('products').update(updates as any).eq('id', item.product_id);

        if (Math.abs(newCost - currentCost) > 0.0001) {
          await supabase.from('inventory_movements').insert({
            product_id: item.product_id,
            quantity: 0,
            movement_type: 'adjustment',
            unit_cost_usd: Number(newCost.toFixed(4)),
            reference_id: revJe.id,
            reference_type: 'shipment_expense_reversal',
            notes: `Reverso de ajuste · Asiento ${String(revJe.id).slice(0, 8)} · Envío ${poRef} · WAC ${currentCost.toFixed(4)} → ${newCost.toFixed(4)}. Movimientos previos no alterados.`,
          });
        }

        wacResynced.push({ sku: prod.sku, oldCost: currentCost, newCost });
      }

      // 5) Marcar historial original como reversado
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id || null;
      let userName: string | null = null;
      if (uid) {
        const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', uid).maybeSingle();
        userName = prof?.full_name || userRes?.user?.email || null;
      }
      await (supabase as any)
        .from('shipment_expense_history')
        .update({
          reversed_at: new Date().toISOString(),
          reversed_by: uid,
          reversed_by_name: userName,
          reversal_journal_entry_id: revJe.id,
        })
        .eq('id', h.id);

      // 6) Insertar fila de tipo "reversal" para auditoría
      await (supabase as any)
        .from('shipment_expense_history')
        .insert({
          shipment_id: shipment.id,
          changed_by: uid,
          changed_by_name: userName,
          previous_freight_usd: Number(h.new_freight_usd || 0),
          previous_customs_usd: Number(h.new_customs_usd || 0),
          previous_other_usd: Number(h.new_other_usd || 0),
          new_freight_usd: restoredFreight,
          new_customs_usd: restoredCustoms,
          new_other_usd: restoredOther,
          delta_total_usd: -total,
          payment_mode: h.payment_mode,
          journal_entry_id: revJe.id,
          adjustment_type: 'reversal',
          reversal_of_history_id: h.id,
          notes: `Reverso de ajuste ${String(h.id).slice(0, 8)} — WAC re-sincronizado en ${wacResynced.length} producto(s).`,
        });

      toast.success(`Ajuste reversado · WAC re-sincronizado en ${wacResynced.length} producto(s)`, {
        description: 'Contra-asiento generado y movimiento de inventario registrado.',
      });
      queryClient.invalidateQueries({ queryKey: ['shipment-expense-history-all'] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['libro-diario'] });
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['shipments-orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      setReverseTarget(null);
    } catch (e: any) {
      toast.error(e.message || 'Error al reversar el ajuste');
    } finally {
      setReversing(false);
    }
  };

  // Re-sincronizar WAC y márgenes desde un ajuste específico (forward-only).
  // Re-aplica el addon por unidad de ESE ajuste sobre el stock actual,
  // actualiza products.unit_cost_usd / total_unit_cost_usd / márgenes,
  // y registra un marcador qty=0 en inventory_movements. No toca asientos.
  const handleResync = async () => {
    if (!resyncTarget) return;
    setResyncing(true);
    try {
      const h = resyncTarget;
      const shipment = h.shipments;
      if (!shipment) throw new Error('Envío no encontrado');
      const poRef = shipment.po_number || String(shipment.id).slice(0, 8);

      // Si el ajuste fue reversado, re-sincronizar implica aplicar 0 (no tiene sentido).
      if (h.reversed_at) throw new Error('Este ajuste está reversado; no aplica re-sincronizar.');

      const t = h.adjustment_type || 'edit';
      // Para reversos no re-sincronizamos desde aquí (ya lo hace el flujo de reverso).
      if (t === 'reversal') throw new Error('No se puede re-sincronizar desde un contra-asiento.');

      const total = Number(h.delta_total_usd || 0);
      if (Math.abs(total) < 0.0001) throw new Error('El ajuste tiene Δ = 0; no hay nada que re-sincronizar.');

      const items: any[] = shipment.shipment_items || [];
      const itemFobTotals = items.map((it: any) => ({
        item: it,
        base: Number(it.unit_cost_usd || 0) * Number(it.quantity_ordered || 0),
      }));
      const sumBase = itemFobTotals.reduce((s, x) => s + x.base, 0);
      const sumUnits = items.reduce((s: number, it: any) => s + Number(it.quantity_ordered || 0), 0);

      const results: { sku: string; oldCost: number; newCost: number }[] = [];

      for (const { item, base } of itemFobTotals) {
        if (!item.product_id) continue;
        const qtyOrdered = Number(item.quantity_ordered || 0);
        if (qtyOrdered <= 0) continue;
        const share = sumBase > 0
          ? base / sumBase
          : (sumUnits > 0 ? qtyOrdered / sumUnits : 0);
        const lineAddon = total * share;
        if (Math.abs(lineAddon) < 0.0001) continue;
        const addonPerUnit = lineAddon / qtyOrdered;

        const { data: prod } = await supabase
          .from('products')
          .select('sku, unit_cost_usd, price_list_usd, price_architect_usd, price_project_usd, price_wholesale_usd')
          .eq('id', item.product_id)
          .single();
        if (!prod) continue;

        const currentCost = Number(prod.unit_cost_usd || 0);
        const { data: inv } = await supabase
          .from('inventory')
          .select('quantity_on_hand')
          .eq('product_id', item.product_id)
          .maybeSingle();
        const stockQty = Number(inv?.quantity_on_hand || 0);

        let newCost = currentCost;
        if (stockQty > 0) {
          const applicableUnits = Math.min(stockQty, qtyOrdered);
          const applicableAddon = addonPerUnit * applicableUnits;
          newCost = (stockQty * currentCost + applicableAddon) / stockQty;
          newCost = Math.max(0, newCost);
        } else {
          // Sin stock: ajustar el costo del item del envío para futuras recepciones
          const newItemCost = Math.max(0, Number(item.unit_cost_usd || 0) + addonPerUnit);
          await supabase
            .from('shipment_items')
            .update({ unit_cost_usd: Number(newItemCost.toFixed(4)) })
            .eq('id', item.id);
        }

        const updates: Record<string, number> = {
          unit_cost_usd: Number(newCost.toFixed(4)),
          total_unit_cost_usd: Number(newCost.toFixed(4)),
        };
        [
          { price: Number(prod.price_list_usd), field: 'margin_list_pct' },
          { price: Number(prod.price_architect_usd), field: 'margin_architect_pct' },
          { price: Number(prod.price_project_usd), field: 'margin_project_pct' },
          { price: Number(prod.price_wholesale_usd), field: 'margin_wholesale_pct' },
        ].forEach(({ price, field }) => {
          if (price > 0) updates[field] = Number((((price - newCost) / price) * 100).toFixed(1));
        });
        await supabase.from('products').update(updates as any).eq('id', item.product_id);

        if (Math.abs(newCost - currentCost) > 0.0001) {
          await supabase.from('inventory_movements').insert({
            product_id: item.product_id,
            quantity: 0,
            movement_type: 'adjustment',
            unit_cost_usd: Number(newCost.toFixed(4)),
            reference_id: h.id,
            reference_type: 'shipment_expense_resync',
            notes: `Re-sincronización WAC desde ajuste ${String(h.id).slice(0, 8)} · Envío ${poRef} · WAC ${currentCost.toFixed(4)} → ${newCost.toFixed(4)}. Forward-only; movimientos previos no alterados.`,
          });
        }

        results.push({ sku: prod.sku, oldCost: currentCost, newCost });
      }

      setResyncResult(results);
      toast.success(`WAC re-sincronizado en ${results.length} producto(s)`, {
        description: 'Márgenes recalculados. Movimientos pasados no fueron modificados.',
      });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['shipments-orders'] });
    } catch (e: any) {
      toast.error(e.message || 'Error al re-sincronizar WAC');
    } finally {
      setResyncing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header + stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] uppercase text-muted-foreground tracking-wide">Total registros</div>
          <div className="text-xl font-bold">{stats.count}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] uppercase text-muted-foreground tracking-wide">Activos</div>
          <div className="text-xl font-bold text-success">{stats.active}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] uppercase text-muted-foreground tracking-wide">Reversados</div>
          <div className="text-xl font-bold text-warning">{stats.reversed}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] uppercase text-muted-foreground tracking-wide">Σ Δ activos</div>
          <div className="text-xl font-bold font-mono">{fmt(stats.totalActive)}</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por PO, proveedor, usuario, notas..."
            className="pl-8 h-9 text-xs"
          />
        </div>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as FilterStatus)}>
          <SelectTrigger className="h-9 text-xs w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="active">Solo activos</SelectItem>
            <SelectItem value="reversed">Solo reversados</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={(v) => setFilterType(v as FilterType)}>
          <SelectTrigger className="h-9 text-xs w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="edit">Edición</SelectItem>
            <SelectItem value="historical_adjustment">Ajuste histórico</SelectItem>
            <SelectItem value="reversal">Reverso</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="h-9 text-xs gap-1.5"
          onClick={() => setExpandedIds(new Set(filtered.map((h: any) => h.id)))}
          disabled={filtered.length === 0 || filtered.every((h: any) => expandedIds.has(h.id))}
          title="Abrir el panel de impacto de todos los ajustes visibles"
        >
          <ChevronsDown className="w-3 h-3" /> Expandir todo
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 text-xs gap-1.5"
          onClick={() => setExpandedIds(new Set())}
          disabled={expandedIds.size === 0}
          title="Cerrar todos los paneles de impacto"
        >
          <ChevronsUp className="w-3 h-3" /> Contraer todo
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 text-xs gap-1.5"
          onClick={() => queryClient.invalidateQueries({ queryKey: ['shipment-expense-history-all'] })}
        >
          <RefreshCw className="w-3 h-3" /> Refrescar
        </Button>
      </div>

      {/* Tabla */}
      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-xs">Fecha</TableHead>
              <TableHead className="text-xs">Tipo</TableHead>
              <TableHead className="text-xs">Envío</TableHead>
              <TableHead className="text-xs">Usuario</TableHead>
              <TableHead className="text-xs text-right">Δ Total</TableHead>
              <TableHead className="text-xs">Pago</TableHead>
              <TableHead className="text-xs">Asiento</TableHead>
              <TableHead className="text-xs">Estado</TableHead>
              <TableHead className="text-xs text-center w-24">Acción</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-8">Cargando…</TableCell></TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center text-xs text-muted-foreground py-8">Sin registros</TableCell></TableRow>
            )}
            {filtered.map((h: any) => {
              const d = new Date(h.created_at);
              const dateStr = `${d.toLocaleDateString('es-DO')} ${d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}`;
              const t = h.adjustment_type || 'edit';
              const ship = h.shipments;
              const po = ship?.po_number || String(h.shipment_id).slice(0, 8);
              const sup = ship?.supplier_name || '';
              const jeId: string | null = h.journal_entry_id || null;
              const revJeId: string | null = h.reversal_journal_entry_id || null;
              const isReversed = !!h.reversed_at;
              const isReversal = t === 'reversal';
              const canReverse = !isReversed && !isReversal && Math.abs(Number(h.delta_total_usd || 0)) > 0.001;
              const canResync = !isReversed && !isReversal && Math.abs(Number(h.delta_total_usd || 0)) > 0.001;
              const isExpanded = expandedIds.has(h.id);
              return (
                <>
                <TableRow key={h.id} className={`${isReversed ? 'opacity-60' : ''} ${isExpanded ? 'bg-muted/20' : ''}`}>
                  <TableCell className="text-[11px] font-mono whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(h.id)}
                      className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                      title={isExpanded ? 'Ocultar impacto' : 'Ver impacto'}
                    >
                      {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      {dateStr}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`text-[10px] ${TYPE_COLORS[t] || ''}`}>
                      {TYPE_LABELS[t] || t}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="font-mono">{po}</div>
                    {sup && <div className="text-[10px] text-muted-foreground truncate max-w-[160px]">{sup}</div>}
                  </TableCell>
                  <TableCell className="text-xs">{h.changed_by_name || <span className="italic text-muted-foreground">—</span>}</TableCell>
                  <TableCell className={`text-right text-xs font-mono font-semibold ${Number(h.delta_total_usd) > 0 ? 'text-warning' : Number(h.delta_total_usd) < 0 ? 'text-success' : 'text-muted-foreground'}`}>
                    {Number(h.delta_total_usd) === 0 ? '—' : `${Number(h.delta_total_usd) > 0 ? '+' : ''}${fmt(Number(h.delta_total_usd))}`}
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">
                    {h.payment_mode === 'cxp' ? 'CxP' : h.payment_mode === 'bank' ? 'Banco' : '—'}
                  </TableCell>
                  <TableCell className="text-[11px]">
                    {jeId && (
                      <button
                        type="button"
                        onClick={() => openJournal(jeId)}
                        className="font-mono text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {String(jeId).slice(0, 8)} <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    )}
                    {revJeId && (
                      <div className="text-[10px] text-warning mt-0.5">
                        Reverso:{' '}
                        <button onClick={() => openJournal(revJeId)} className="font-mono hover:underline">
                          {String(revJeId).slice(0, 8)}
                        </button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {isReversed ? (
                      <Badge variant="outline" className="text-[10px] bg-warning/15 text-warning border-warning/30">
                        Reversado
                      </Badge>
                    ) : isReversal ? (
                      <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-400 border-red-500/30">
                        Contra-asiento
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] bg-success/15 text-success border-success/30">
                        Activo
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      {canResync && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] gap-1 px-2"
                          onClick={() => { setResyncResult(null); setResyncTarget(h); }}
                          title="Re-sincronizar WAC y márgenes desde este ajuste (forward-only)"
                        >
                          <RefreshCw className="w-3 h-3" /> Sync
                        </Button>
                      )}
                      {canReverse ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] gap-1 px-2"
                          onClick={() => setReverseTarget(h)}
                        >
                          <Undo2 className="w-3 h-3" /> Reversar
                        </Button>
                      ) : !canResync ? (
                        <span className="text-[10px] text-muted-foreground italic">—</span>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow key={`${h.id}-detail`} className="bg-muted/10 hover:bg-muted/10">
                    <TableCell colSpan={9} className="p-0">
                      <ExpandedImpactPanel
                        row={h}
                        jeLines={expandedJeLines.filter((l: any) => l.journal_entry_id === h.journal_entry_id)}
                        revJeLines={expandedJeLines.filter((l: any) => l.journal_entry_id === h.reversal_journal_entry_id)}
                        productsState={expandedProductsState}
                        openJournal={openJournal}
                      />
                    </TableCell>
                  </TableRow>
                )}
                </>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Confirmación de reverso */}
      <AlertDialog open={!!reverseTarget} onOpenChange={v => !v && setReverseTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Undo2 className="w-4 h-4 text-warning" /> Reversar ajuste
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-xs">
                <p>Se ejecutarán las siguientes acciones de forma <strong>forward-only</strong> (los movimientos pasados no se modifican):</p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li>Generar un <strong>contra-asiento</strong> con DR/CR invertidos en el Libro Diario.</li>
                  <li>Restaurar los totales del envío al estado anterior al ajuste.</li>
                  <li>Re-sincronizar <strong>WAC y márgenes</strong> de cada producto sobre el stock disponible HOY.</li>
                  <li>Insertar un movimiento <code className="text-[10px]">adjustment</code> (qty=0) como marcador de versión.</li>
                  <li>Marcar el registro original como reversado y crear una fila de tipo <strong>reversal</strong>.</li>
                </ul>
                {reverseTarget && (
                  <div className="rounded-lg border border-border bg-muted/20 p-2 mt-2 space-y-0.5">
                    <div className="flex justify-between"><span className="text-muted-foreground">Envío:</span><span className="font-mono">{reverseTarget.shipments?.po_number || String(reverseTarget.shipment_id).slice(0, 8)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Δ a reversar:</span><span className="font-mono font-semibold">{fmt(Math.abs(Number(reverseTarget.delta_total_usd || 0)))}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Asiento original:</span><span className="font-mono">{reverseTarget.journal_entry_id ? String(reverseTarget.journal_entry_id).slice(0, 8) : '—'}</span></div>
                  </div>
                )}
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-2 mt-2 flex gap-1.5 items-start">
                  <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                  <span className="text-[11px]">Las unidades ya vendidas conservan su COGS pasado (no se recalcula). Esto es contablemente correcto.</span>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reversing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleReverse} disabled={reversing}>
              {reversing ? 'Reversando…' : 'Confirmar reverso'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmación de re-sincronización WAC */}
      <AlertDialog open={!!resyncTarget} onOpenChange={v => { if (!v) { setResyncTarget(null); setResyncResult(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-primary" /> Re-sincronizar WAC y márgenes
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-xs">
                <p>Recalcula el WAC y los márgenes de los productos del envío a partir de <strong>este ajuste</strong>, de forma <strong>forward-only</strong>:</p>
                <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                  <li>Reaplica el addon por unidad de este ajuste sobre el <strong>stock disponible HOY</strong>.</li>
                  <li>Actualiza <code className="text-[10px]">unit_cost_usd</code>, <code className="text-[10px]">total_unit_cost_usd</code> y márgenes en cada producto afectado.</li>
                  <li>Inserta un movimiento <code className="text-[10px]">adjustment</code> (qty=0) como marcador de versión.</li>
                  <li><strong>No</strong> genera asientos contables ni modifica movimientos pasados.</li>
                </ul>
                {resyncTarget && !resyncResult && (
                  <div className="rounded-lg border border-border bg-muted/20 p-2 mt-2 space-y-0.5">
                    <div className="flex justify-between"><span className="text-muted-foreground">Envío:</span><span className="font-mono">{resyncTarget.shipments?.po_number || String(resyncTarget.shipment_id).slice(0, 8)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Δ del ajuste:</span><span className="font-mono font-semibold">{fmt(Math.abs(Number(resyncTarget.delta_total_usd || 0)))}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Productos del envío:</span><span className="font-mono">{(resyncTarget.shipments?.shipment_items || []).length}</span></div>
                  </div>
                )}
                {resyncResult && (
                  <div className="rounded-lg border border-success/30 bg-success/10 p-2 mt-2 space-y-1">
                    <div className="flex items-center gap-1.5 text-success">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span className="font-semibold text-[11px]">Re-sincronización completada — {resyncResult.length} producto(s)</span>
                    </div>
                    {resyncResult.length > 0 && (
                      <div className="max-h-40 overflow-auto mt-1 space-y-0.5">
                        {resyncResult.map((r, i) => (
                          <div key={i} className="flex justify-between text-[10px] font-mono">
                            <span className="text-muted-foreground">{r.sku}</span>
                            <span>${r.oldCost.toFixed(4)} → <strong>${r.newCost.toFixed(4)}</strong></span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="rounded-lg border border-warning/30 bg-warning/10 p-2 mt-2 flex gap-1.5 items-start">
                  <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                  <span className="text-[11px]">Las unidades ya vendidas conservan su COGS pasado. Esto puede generar un nuevo WAC si el stock actual cambió respecto al momento del ajuste.</span>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resyncing}>{resyncResult ? 'Cerrar' : 'Cancelar'}</AlertDialogCancel>
            {!resyncResult && (
              <AlertDialogAction onClick={(e) => { e.preventDefault(); handleResync(); }} disabled={resyncing}>
                {resyncing ? 'Re-sincronizando…' : 'Confirmar re-sync'}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Panel de impacto expandido por fila
// Muestra:
//   1) Impacto en totales del envío (flete/aduana/otros) antes ↔ después
//   2) Impacto en valor de inventario / WAC esperado por producto
//      (delta por unidad aplicado al stock actual = exposición de re-sync)
//   3) Estado contable del Libro Diario (líneas DR/CR del asiento + reverso)
// ----------------------------------------------------------------------------
function ExpandedImpactPanel({
  row,
  jeLines,
  revJeLines,
  productsState,
  openJournal,
}: {
  row: any;
  jeLines: any[];
  revJeLines: any[];
  productsState: any[];
  openJournal: (id: string) => void;
}) {
  const fmt = (n: number) =>
    `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const ship = row.shipments || {};
  const items: any[] = ship.shipment_items || [];

  // ---- 1) Totales del envío (antes / después + delta) ----
  const prevFreight = Number(row.previous_freight_usd || 0);
  const newFreight = Number(row.new_freight_usd || 0);
  const prevCustoms = Number(row.previous_customs_usd || 0);
  const newCustoms = Number(row.new_customs_usd || 0);
  const prevOther = Number(row.previous_other_usd || 0);
  const newOther = Number(row.new_other_usd || 0);
  const prevAddon = prevFreight + prevCustoms + prevOther;
  const newAddon = newFreight + newCustoms + newOther;
  const deltaTotal = Number(row.delta_total_usd || 0);

  // ---- 2) Impacto en costo unitario / valor de inventario ----
  // Reproducimos el mismo prorrateo por valor FOB que usa el ajuste/reverso.
  const itemFobTotals = items.map(it => ({
    item: it,
    base: Number(it.unit_cost_usd || 0) * Number(it.quantity_ordered || 0),
  }));
  const sumBase = itemFobTotals.reduce((s, x) => s + x.base, 0);
  const sumUnits = items.reduce((s, it: any) => s + Number(it.quantity_ordered || 0), 0);

  const productMap: Record<string, any> = {};
  productsState.forEach(p => { productMap[p.id] = p; });

  const productImpact = itemFobTotals
    .map(({ item, base }) => {
      const qtyOrdered = Number(item.quantity_ordered || 0);
      if (qtyOrdered <= 0 || !item.product_id) return null;
      const share = sumBase > 0 ? base / sumBase : (sumUnits > 0 ? qtyOrdered / sumUnits : 0);
      const lineAddon = deltaTotal * share;
      const addonPerUnit = qtyOrdered > 0 ? lineAddon / qtyOrdered : 0;
      const ps = productMap[item.product_id];
      const stock = ps?.stock_on_hand ?? 0;
      const currentCost = Number(ps?.unit_cost_usd ?? item.unit_cost_usd ?? 0);
      const applicableUnits = Math.min(stock, qtyOrdered);
      const exposedAmount = addonPerUnit * applicableUnits; // valor de inv. impactado
      const projectedNewCost =
        stock > 0 ? Math.max(0, (stock * currentCost + exposedAmount) / stock) : currentCost;
      return {
        sku: item.products?.sku || ps?.sku || '—',
        name: item.products?.name || ps?.name || '',
        qtyOrdered,
        stock,
        addonPerUnit,
        currentCost,
        projectedNewCost,
        deltaCost: projectedNewCost - currentCost,
        exposedAmount,
      };
    })
    .filter(Boolean) as any[];

  const totalExposedInv = productImpact.reduce((s, p) => s + p.exposedAmount, 0);
  // COGS futuro estimado = Δ costo unitario × stock que aún queda por vender
  const cogsFutureImpact = productImpact.reduce((s, p) => s + p.deltaCost * p.stock, 0);
  // COGS pasado preservado = Δ que NO pudo aplicarse al stock actual
  const cogsPastPreserved = deltaTotal - totalExposedInv;

  // ---- 3) Estado contable ----
  const jeId: string | null = row.journal_entry_id || null;
  const revJeId: string | null = row.reversal_journal_entry_id || null;
  const jeBalanced =
    jeLines.length > 0 &&
    Math.abs(
      jeLines.reduce((s, l) => s + Number(l.debit_usd || 0), 0) -
      jeLines.reduce((s, l) => s + Number(l.credit_usd || 0), 0)
    ) < 0.01;
  const revBalanced =
    revJeLines.length > 0 &&
    Math.abs(
      revJeLines.reduce((s, l) => s + Number(l.debit_usd || 0), 0) -
      revJeLines.reduce((s, l) => s + Number(l.credit_usd || 0), 0)
    ) < 0.01;

  const renderJeLines = (lines: any[]) => (
    <div className="rounded-md border border-border bg-card overflow-hidden">
      <table className="w-full text-[10px]">
        <thead className="bg-muted/40">
          <tr>
            <th className="text-left px-2 py-1 font-medium">Cuenta</th>
            <th className="text-right px-2 py-1 font-medium">Débito</th>
            <th className="text-right px-2 py-1 font-medium">Crédito</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l: any, i: number) => (
            <tr key={i} className="border-t border-border">
              <td className="px-2 py-1">
                <span className="font-mono text-muted-foreground">{l.chart_of_accounts?.code || '—'}</span>{' '}
                <span>{l.chart_of_accounts?.description || '—'}</span>
                {l.description && (
                  <div className="text-[9px] text-muted-foreground italic truncate">{l.description}</div>
                )}
              </td>
              <td className="px-2 py-1 text-right font-mono">
                {Number(l.debit_usd || 0) > 0 ? fmt(Number(l.debit_usd)) : '—'}
              </td>
              <td className="px-2 py-1 text-right font-mono">
                {Number(l.credit_usd || 0) > 0 ? fmt(Number(l.credit_usd)) : '—'}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-border bg-muted/20 font-semibold">
            <td className="px-2 py-1 text-right">Totales</td>
            <td className="px-2 py-1 text-right font-mono">
              {fmt(lines.reduce((s, l) => s + Number(l.debit_usd || 0), 0))}
            </td>
            <td className="px-2 py-1 text-right font-mono">
              {fmt(lines.reduce((s, l) => s + Number(l.credit_usd || 0), 0))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="px-4 py-3 space-y-4 border-t border-border">
      {/* === BLOQUE 1: TOTALES DEL ENVÍO === */}
      <div>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
          <Package className="w-3 h-3" /> Impacto en totales del envío
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          {[
            { label: 'Flete', prev: prevFreight, next: newFreight },
            { label: 'Aduana', prev: prevCustoms, next: newCustoms },
            { label: 'Otros', prev: prevOther, next: newOther },
            { label: 'Add-on total', prev: prevAddon, next: newAddon, bold: true },
          ].map((c, i) => {
            const d = c.next - c.prev;
            return (
              <div key={i} className={`rounded-md border bg-card p-2 ${c.bold ? 'border-primary/40' : 'border-border'}`}>
                <div className="text-[9px] uppercase text-muted-foreground tracking-wide">{c.label}</div>
                <div className="flex items-center gap-1 text-[11px] font-mono mt-0.5">
                  <span className="text-muted-foreground">{fmt(c.prev)}</span>
                  <ChevronRight className="w-2.5 h-2.5 text-muted-foreground" />
                  <span className={c.bold ? 'font-semibold' : ''}>{fmt(c.next)}</span>
                </div>
                <div className={`text-[10px] font-mono mt-0.5 ${d > 0 ? 'text-warning' : d < 0 ? 'text-success' : 'text-muted-foreground'}`}>
                  Δ {d > 0 ? '+' : ''}{fmt(d)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* === BLOQUE 2: IMPACTO EN INVENTARIO Y COGS === */}
      <div>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
          <Package className="w-3 h-3" /> Impacto en inventario y COGS (proyectado)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
          <div className="rounded-md border border-border bg-card p-2">
            <div className="text-[9px] uppercase text-muted-foreground tracking-wide">Δ Valor de inventario expuesto</div>
            <div className={`text-sm font-mono font-semibold ${totalExposedInv > 0 ? 'text-warning' : totalExposedInv < 0 ? 'text-success' : ''}`}>
              {totalExposedInv > 0 ? '+' : ''}{fmt(totalExposedInv)}
            </div>
            <div className="text-[9px] text-muted-foreground">Aplicable al stock disponible HOY</div>
          </div>
          <div className="rounded-md border border-border bg-card p-2">
            <div className="text-[9px] uppercase text-muted-foreground tracking-wide">COGS futuro estimado</div>
            <div className={`text-sm font-mono font-semibold ${cogsFutureImpact > 0 ? 'text-warning' : cogsFutureImpact < 0 ? 'text-success' : ''}`}>
              {cogsFutureImpact > 0 ? '+' : ''}{fmt(cogsFutureImpact)}
            </div>
            <div className="text-[9px] text-muted-foreground">Δ que se reflejará en ventas futuras</div>
          </div>
          <div className="rounded-md border border-border bg-card p-2">
            <div className="text-[9px] uppercase text-muted-foreground tracking-wide">COGS pasado preservado</div>
            <div className="text-sm font-mono font-semibold text-muted-foreground">
              {cogsPastPreserved > 0 ? '+' : ''}{fmt(cogsPastPreserved)}
            </div>
            <div className="text-[9px] text-muted-foreground">Δ que NO se aplicó (unidades ya vendidas)</div>
          </div>
        </div>
        {productImpact.length > 0 ? (
          <div className="rounded-md border border-border bg-card overflow-hidden max-h-56 overflow-y-auto">
            <table className="w-full text-[10px]">
              <thead className="bg-muted/40 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1 font-medium">SKU</th>
                  <th className="text-right px-2 py-1 font-medium">Pedido</th>
                  <th className="text-right px-2 py-1 font-medium">Stock</th>
                  <th className="text-right px-2 py-1 font-medium">Add-on/u</th>
                  <th className="text-right px-2 py-1 font-medium">WAC actual</th>
                  <th className="text-right px-2 py-1 font-medium">WAC proy.</th>
                  <th className="text-right px-2 py-1 font-medium">Δ Valor inv.</th>
                </tr>
              </thead>
              <tbody>
                {productImpact.map((p: any, i: number) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-2 py-1 font-mono">{p.sku}</td>
                    <td className="px-2 py-1 text-right font-mono">{p.qtyOrdered}</td>
                    <td className="px-2 py-1 text-right font-mono">{p.stock}</td>
                    <td className={`px-2 py-1 text-right font-mono ${p.addonPerUnit > 0 ? 'text-warning' : p.addonPerUnit < 0 ? 'text-success' : ''}`}>
                      {p.addonPerUnit > 0 ? '+' : ''}${p.addonPerUnit.toFixed(4)}
                    </td>
                    <td className="px-2 py-1 text-right font-mono">${p.currentCost.toFixed(4)}</td>
                    <td className="px-2 py-1 text-right font-mono font-semibold">${p.projectedNewCost.toFixed(4)}</td>
                    <td className={`px-2 py-1 text-right font-mono ${p.exposedAmount > 0 ? 'text-warning' : p.exposedAmount < 0 ? 'text-success' : ''}`}>
                      {p.exposedAmount > 0 ? '+' : ''}{fmt(p.exposedAmount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-[10px] text-muted-foreground italic">Sin productos asociados al envío.</div>
        )}
      </div>

      {/* === BLOQUE 3: ESTADO CONTABLE === */}
      <div>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
          <BookOpen className="w-3 h-3" /> Estado contable — Libro Diario
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] font-semibold">
                Asiento original{' '}
                {jeId && (
                  <button onClick={() => openJournal(jeId)} className="font-mono text-primary hover:underline ml-1 inline-flex items-center gap-0.5">
                    {String(jeId).slice(0, 8)} <ExternalLink className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
              {jeId && (
                jeBalanced ? (
                  <Badge variant="outline" className="text-[9px] bg-success/15 text-success border-success/30">
                    <ShieldCheck className="w-2.5 h-2.5 mr-0.5" /> Balanceado
                  </Badge>
                ) : jeLines.length === 0 ? (
                  <Badge variant="outline" className="text-[9px] bg-muted text-muted-foreground">Sin líneas</Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] bg-destructive/15 text-destructive border-destructive/30">
                    <AlertTriangle className="w-2.5 h-2.5 mr-0.5" /> Descuadrado
                  </Badge>
                )
              )}
            </div>
            {jeId && jeLines.length > 0 ? renderJeLines(jeLines) : (
              <div className="text-[10px] text-muted-foreground italic rounded-md border border-dashed border-border p-2">
                {jeId ? 'Cargando líneas…' : 'Sin asiento contable asociado.'}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[10px] font-semibold">
                Contra-asiento (reverso){' '}
                {revJeId && (
                  <button onClick={() => openJournal(revJeId)} className="font-mono text-warning hover:underline ml-1 inline-flex items-center gap-0.5">
                    {String(revJeId).slice(0, 8)} <ExternalLink className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
              {revJeId && (
                revBalanced ? (
                  <Badge variant="outline" className="text-[9px] bg-success/15 text-success border-success/30">
                    <ShieldCheck className="w-2.5 h-2.5 mr-0.5" /> Balanceado
                  </Badge>
                ) : revJeLines.length === 0 ? (
                  <Badge variant="outline" className="text-[9px] bg-muted text-muted-foreground">Sin líneas</Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] bg-destructive/15 text-destructive border-destructive/30">
                    <AlertTriangle className="w-2.5 h-2.5 mr-0.5" /> Descuadrado
                  </Badge>
                )
              )}
            </div>
            {revJeId && revJeLines.length > 0 ? renderJeLines(revJeLines) : (
              <div className="text-[10px] text-muted-foreground italic rounded-md border border-dashed border-border p-2">
                {revJeId ? 'Cargando líneas…' : 'Este ajuste no ha sido reversado.'}
              </div>
            )}
          </div>
        </div>
        {row.notes && (
          <div className="mt-2 text-[10px] text-muted-foreground italic">📝 {row.notes}</div>
        )}
      </div>
    </div>
  );
}
