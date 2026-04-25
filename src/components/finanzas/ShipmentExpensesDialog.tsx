import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Truck, Sparkles, BookOpen, History, AlertTriangle, ShieldCheck, Wallet, Landmark, CheckCircle2, TrendingUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipment: any | null;
  onSaved?: () => void;
}

const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ShipmentExpensesDialog({ open, onOpenChange, shipment, onSaved }: Props) {
  const queryClient = useQueryClient();
  const [freight, setFreight] = useState<string>('');
  const [customs, setCustoms] = useState<string>('');
  const [other, setOther] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'cxp' | 'bank'>('cxp');
  const [bankAccountId, setBankAccountId] = useState<string>('');
  const [capitalize, setCapitalize] = useState<boolean>(true);

  // Load chart of accounts to pick bank / CxP / inventory
  const { data: accounts = [] } = useQuery({
    queryKey: ['shipment-expenses-accounts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('chart_of_accounts')
        .select('id, code, description, account_type, classification')
        .eq('is_active', true)
        .order('code');
      return data || [];
    },
  });

  // Load expense edit history for this shipment
  const { data: history = [] } = useQuery({
    queryKey: ['shipment-expense-history', shipment?.id],
    enabled: !!shipment?.id && open,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('shipment_expense_history')
        .select('*')
        .eq('shipment_id', shipment.id)
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  // Load journal entries previously linked to this shipment (via history)
  const { data: linkedJournals = [] } = useQuery({
    queryKey: ['shipment-linked-journals', shipment?.id],
    enabled: !!shipment?.id && open,
    queryFn: async () => {
      const ids = (history || []).map((h: any) => h.journal_entry_id).filter(Boolean);
      if (ids.length === 0) return [];
      const { data } = await supabase
        .from('journal_entries')
        .select('id, date, description, total_debit_usd')
        .in('id', ids);
      return data || [];
    },
  });

  const bankAccounts = useMemo(() =>
    accounts.filter((a: any) => a.account_type === 'Activo' && (a.classification === 'Banco' || a.classification === 'Caja')),
    [accounts]
  );

  // Helpers to find canonical accounts by code-prefix
  // Inventario en Tránsito (13200) si el envío NO ha sido recibido — NIC 2
  // Inventarios (13000) si ya fue recibido (corrección post-recepción)
  const isReceived_ = shipment?.status === 'received';
  const inventoryInTransitAcct = useMemo(() => accounts.find((a: any) => a.code === '13200') || accounts.find((a: any) => a.classification === 'Compras en Tránsito'), [accounts]);
  const inventoryFinalAcct = useMemo(() => accounts.find((a: any) => a.code === '13000') || accounts.find((a: any) => a.classification === 'Inventarios'), [accounts]);
  const inventoryAcct = isReceived_ ? inventoryFinalAcct : (inventoryInTransitAcct || inventoryFinalAcct);
  const cxpAcct = useMemo(() => accounts.find((a: any) => a.code === '20150') || accounts.find((a: any) => a.code === '20100') || accounts.find((a: any) => a.classification?.includes('Cuentas por Pagar')), [accounts]);

  // Modo de pago AUTOMÁTICO según estado de pago del envío:
  // - paid + payment_account_id → Banco (con esa cuenta)
  // - pending / partial → CxP
  const autoPaymentMode: 'bank' | 'cxp' = (shipment?.payment_status === 'paid' && shipment?.payment_account_id) ? 'bank' : 'cxp';
  const autoBankAccountId: string = shipment?.payment_account_id || '';

  const items: any[] = shipment?.shipment_items || [];

  const currentFreight = Number(shipment?.shipping_cost_usd || 0);
  const currentCustoms = Number(shipment?.customs_cost_usd || 0);
  // Fuente primaria: campo estructurado other_cost_usd. Fallback a regex de notes solo
  // para envíos antiguos donde aún no se haya migrado el dato.
  const currentOther = (() => {
    const structured = Number((shipment as any)?.other_cost_usd);
    if (Number.isFinite(structured) && structured > 0) return structured;
    const m = String(shipment?.notes || '').match(/Otros \$([0-9.]+)/);
    return m ? Number(m[1]) : 0;
  })();
  const currentAddons = currentFreight + currentCustoms + currentOther;

  const totalLanded = items.reduce((s, it) => s + Number(it.unit_cost_usd || 0) * Number(it.quantity_ordered || 0), 0);
  const factor = totalLanded > 0 && (totalLanded - currentAddons) > 0
    ? (totalLanded - currentAddons) / totalLanded
    : 1;
  const baselineFob = items.map(it => ({
    id: it.id,
    qty: Number(it.quantity_ordered || 0),
    productName: it.products?.name || '—',
    sku: it.products?.sku || '',
    fobUnit: Number(it.unit_cost_usd || 0) * factor,
  }));
  const totalFob = baselineFob.reduce((s, it) => s + it.fobUnit * it.qty, 0);

  useEffect(() => {
    if (open && shipment) {
      setFreight(currentFreight ? String(currentFreight) : '');
      setCustoms(currentCustoms ? String(currentCustoms) : '');
      setOther(currentOther ? String(currentOther) : '');
      setNotes(shipment.notes || '');
      // Precarga AUTOMÁTICA según estado de pago del envío
      setPaymentMode(autoPaymentMode);
      setBankAccountId(autoBankAccountId);
      setCapitalize(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shipment?.id]);

  const newFreight = Math.max(0, Number(freight) || 0);
  const newCustoms = Math.max(0, Number(customs) || 0);
  const newOther = Math.max(0, Number(other) || 0);
  const newAddons = newFreight + newCustoms + newOther;
  const deltaAddons = newAddons - currentAddons; // positive = more expense, negative = reversal
  const newLanded = totalFob + newAddons;

  const preview = useMemo(() => baselineFob.map(it => {
    const lineFobTotal = it.fobUnit * it.qty;
    const lineAddon = totalFob > 0 ? (lineFobTotal / totalFob) * newAddons : 0;
    const newUnitCost = it.qty > 0 ? it.fobUnit + lineAddon / it.qty : it.fobUnit;
    return { ...it, lineFobTotal, lineAddon, newUnitCost, newLineLanded: newUnitCost * it.qty };
  }), [baselineFob, totalFob, newAddons]);

  // Pre-flight: cuentas requeridas en el catálogo. Bloquea guardado si faltan.
  // Se evalúa siempre que se vaya a generar asiento (delta != 0).
  const willPostJournal = Math.abs(deltaAddons) > 0.001;
  const acct13000 = useMemo(() => accounts.find((a: any) => a.code === '13000'), [accounts]);
  const acct20150 = useMemo(() => accounts.find((a: any) => a.code === '20150'), [accounts]);
  const selectedBankAcct = useMemo(
    () => (bankAccountId ? accounts.find((a: any) => a.id === bankAccountId) : null),
    [accounts, bankAccountId]
  );
  const missingAccountErrors = useMemo(() => {
    const errs: string[] = [];
    if (!willPostJournal) return errs;
    if (!acct13000) errs.push('Cuenta 13000 (Inventarios) no encontrada en el catálogo de cuentas.');
    if (paymentMode === 'cxp' && !acct20150) errs.push('Cuenta 20150 (Cuentas por Pagar Proveedores) no encontrada en el catálogo de cuentas.');
    if (paymentMode === 'bank') {
      if (!bankAccountId) errs.push('Selecciona la cuenta bancaria de pago.');
      else if (!selectedBankAcct) errs.push('La cuenta bancaria seleccionada no existe en el catálogo de cuentas.');
    }
    return errs;
  }, [willPostJournal, acct13000, acct20150, paymentMode, bankAccountId, selectedBankAcct]);

  const [reversalConfirmOpen, setReversalConfirmOpen] = useState(false);

  const handleSave = async () => {
    if (!shipment) return;
    if (shipment.status === 'received' && !capitalize) {
      toast.error('Envío ya recibido — activa "Capitalizar como costo aterrizado" para recalcular WAC y márgenes, o cierra sin guardar.');
      return;
    }
    if (missingAccountErrors.length > 0) {
      toast.error(missingAccountErrors[0], {
        description: missingAccountErrors.length > 1 ? `Y ${missingAccountErrors.length - 1} validación(es) más. Revisa Maestras → Catálogo de Cuentas.` : 'Revisa Maestras → Catálogo de Cuentas.',
      });
      return;
    }
    // Paso de confirmación extra cuando el delta es negativo (se generará una reversa contable)
    if (deltaAddons < -0.001) {
      setReversalConfirmOpen(true);
      return;
    }
    await performSave();
  };

  const performSave = async () => {
    if (!shipment) return;

    // Verificación de consistencia: el total prorrateado en shipment_items debe cuadrar
    // con los addons (Flete + Aduana + Otros) y el delta contable que se asentará.
    // Si hay discrepancia (>$0.05) abortamos antes de escribir para no dejar inventario
    // y diario desalineados.
    const sumAddonLines = preview.reduce((s, p) => s + p.lineAddon, 0);
    const sumLandedLines = preview.reduce((s, p) => s + p.newLineLanded, 0);
    const expectedLanded = totalFob + newAddons;
    const addonDiff = Math.abs(sumAddonLines - newAddons);
    const landedDiff = Math.abs(sumLandedLines - expectedLanded);
    const deltaProratedDiff = Math.abs((sumAddonLines - currentAddons) - deltaAddons);
    const TOL = 0.05;
    if (addonDiff > TOL || landedDiff > TOL || deltaProratedDiff > TOL) {
      toast.error('Discrepancia en el prorrateo del costo aterrizado', {
        description: `Addons líneas: ${fmt(sumAddonLines)} vs total ${fmt(newAddons)} (Δ ${fmt(addonDiff)}). Aterrizado líneas: ${fmt(sumLandedLines)} vs esperado ${fmt(expectedLanded)} (Δ ${fmt(landedDiff)}). Delta contable vs prorrateado: ${fmt(deltaProratedDiff)}. No se guardó nada.`,
      });
      return;
    }

    setSaving(true);
    try {
      const userNotes = String(notes || '')
        .replace(/Costo aterrizado prorrateado por valor FOB[^·\n]*?(\.|·|$)/g, '')
        .replace(/[·\s]+$/g, '')
        .trim();
      const landedAnnotation = newAddons > 0
        ? `Costo aterrizado prorrateado por valor FOB — Flete $${newFreight.toFixed(2)} · Aduana $${newCustoms.toFixed(2)} · Otros $${newOther.toFixed(2)} (Total addons $${newAddons.toFixed(2)} sobre FOB $${totalFob.toFixed(2)})`
        : null;
      const finalNotes = [userNotes || null, landedAnnotation].filter(Boolean).join(' · ') || null;

      // 1) Update shipment header (incluye other_cost_usd estructurado)
      const { error: shipErr } = await supabase
        .from('shipments')
        .update({
          shipping_cost_usd: newFreight,
          customs_cost_usd: newCustoms,
          other_cost_usd: newOther,
          total_cost_usd: totalFob,
          notes: finalNotes,
        } as any)
        .eq('id', shipment.id);
      if (shipErr) throw shipErr;

      // 2) Update each shipment_item with new landed unit cost
      for (const p of preview) {
        const { error: itErr } = await supabase
          .from('shipment_items')
          .update({ unit_cost_usd: Number(p.newUnitCost.toFixed(4)) })
          .eq('id', p.id);
        if (itErr) throw itErr;
      }

      // 2.5) CAPITALIZACIÓN: si está activo, actualiza products.unit_cost_usd vía WAC
      // y recalcula márgenes. Aplica especialmente cuando el envío YA fue recibido.
      const capitalizedProducts: { sku: string; oldCost: number; newCost: number; newWAC: number }[] = [];
      if (capitalize) {
        for (const p of preview) {
          const item = items.find((i: any) => i.id === p.id);
          if (!item?.product_id) continue;
          const newItemCost = Number(p.newUnitCost.toFixed(4));

          // Cargar inventario y producto actuales
          const { data: prod } = await supabase
            .from('products')
            .select('unit_cost_usd, price_list_usd, price_architect_usd, price_project_usd, price_wholesale_usd, sku')
            .eq('id', item.product_id)
            .single();
          if (!prod) continue;

          const currentCost = Number(prod.unit_cost_usd || 0);
          let newCost = newItemCost;

          if (shipment.status === 'received') {
            // El envío ya fue recibido → aplicar WAC con stock actual
            const { data: inv } = await supabase
              .from('inventory')
              .select('quantity_on_hand')
              .eq('product_id', item.product_id)
              .maybeSingle();
            const stockQty = Number(inv?.quantity_on_hand || 0);
            const incomingQty = Number(item.quantity_received || item.quantity_ordered || 0);
            // WAC tradicional: el stock actual ya incluye la entrada anterior con el costo viejo,
            // así que reasignamos el delta del addon distribuido sobre el stock actual.
            const previousLanded = Number(item.unit_cost_usd || 0); // ya updated arriba? No: leemos baseline
            // Para el delta usamos: nuevo costo aterrizado de esta línea vs. costo previamente
            // contabilizado en stock. Si stockQty <= 0, simplemente fijamos newItemCost.
            if (stockQty > 0 && incomingQty > 0) {
              const deltaPerUnit = newItemCost - currentCost;
              const onHandValue = stockQty * currentCost;
              const adjustment = deltaPerUnit * Math.min(stockQty, incomingQty);
              newCost = stockQty > 0 ? (onHandValue + adjustment) / stockQty : newItemCost;
            } else {
              newCost = newItemCost;
            }
          } else {
            // Envío aún no recibido → fija unit_cost_usd al nuevo aterrizado para que al
            // momento de recibir, el WAC use el costo correcto.
            newCost = newItemCost;
          }

          const updates: Record<string, number> = {
            unit_cost_usd: Number(newCost.toFixed(4)),
            total_unit_cost_usd: Number(newCost.toFixed(4)),
          };
          // Recalcular márgenes
          [
            { price: Number(prod.price_list_usd), field: 'margin_list_pct' },
            { price: Number(prod.price_architect_usd), field: 'margin_architect_pct' },
            { price: Number(prod.price_project_usd), field: 'margin_project_pct' },
            { price: Number(prod.price_wholesale_usd), field: 'margin_wholesale_pct' },
          ].forEach(({ price, field }) => {
            if (price > 0) updates[field] = Number((((price - newCost) / price) * 100).toFixed(1));
          });

          const { error: prodErr } = await supabase
            .from('products')
            .update(updates as any)
            .eq('id', item.product_id);
          if (prodErr) throw prodErr;

          capitalizedProducts.push({ sku: prod.sku, oldCost: currentCost, newCost, newWAC: newCost });

          // 2.6) AUDITORÍA: registrar un movimiento de inventario tipo 'adjustment'
          // con quantity=0 para dejar rastro de la corrección de costo histórico.
          // No altera stock (qty=0) pero queda visible en el historial de movimientos
          // del producto y referenciado al envío que originó la corrección.
          const deltaPerUnit = Number((newCost - currentCost).toFixed(4));
          if (Math.abs(deltaPerUnit) > 0.0001) {
            const { error: movErr } = await supabase
              .from('inventory_movements')
              .insert({
                product_id: item.product_id,
                quantity: 0,
                movement_type: 'adjustment',
                unit_cost_usd: Number(newCost.toFixed(4)),
                reference_id: shipment.id,
                reference_type: 'shipment_expense_correction',
                notes: `Corrección de costo aterrizado — Envío ${shipment.po_number || shipment.id?.slice(0, 8)}: costo ${currentCost.toFixed(4)} → ${newCost.toFixed(4)} (Δ ${deltaPerUnit >= 0 ? '+' : ''}${deltaPerUnit.toFixed(4)} USD/u). ${shipment.status === 'received' ? 'WAC ajustado sobre stock disponible.' : 'Costo fijado para futura recepción.'}`,
              });
            if (movErr) console.warn('No se pudo registrar movimiento de ajuste:', movErr.message);
          }
        }
      }

      // 3) Create journal entry for the DELTA (if any)
      let journalEntryId: string | null = null;
      if (Math.abs(deltaAddons) > 0.001) {
        const today = new Date().toISOString().slice(0, 10);
        const credAcct = paymentMode === 'cxp' ? cxpAcct : bankAccounts.find((a: any) => a.id === bankAccountId);
        const description = `Capitalización de flete/aduana — Envío ${shipment.po_number || shipment.id?.slice(0, 8)}`;
        const debitAmt = deltaAddons > 0 ? deltaAddons : 0;
        const creditAmt = deltaAddons > 0 ? deltaAddons : 0;
        const isReversal = deltaAddons < 0;

        const { data: je, error: jeErr } = await supabase
          .from('journal_entries')
          .insert({
            date: today,
            description,
            total_debit_usd: Math.abs(deltaAddons),
            total_credit_usd: Math.abs(deltaAddons),
            notes: `Flete $${newFreight.toFixed(2)} · Aduana $${newCustoms.toFixed(2)} · Otros $${newOther.toFixed(2)} (delta ${deltaAddons >= 0 ? '+' : ''}${deltaAddons.toFixed(2)})`,
          })
          .select('id')
          .single();
        if (jeErr) throw jeErr;
        journalEntryId = je.id;

        const lines = isReversal
          ? [
              { journal_entry_id: je.id, account_id: credAcct!.id, debit_usd: Math.abs(deltaAddons), credit_usd: 0, description: `Reversa: ${credAcct!.description}` },
              { journal_entry_id: je.id, account_id: inventoryAcct!.id, debit_usd: 0, credit_usd: Math.abs(deltaAddons), description: `Reversa capitalización inventario` },
            ]
          : [
              { journal_entry_id: je.id, account_id: inventoryAcct!.id, debit_usd: debitAmt, credit_usd: 0, description: `Capitalización flete/aduana en inventario` },
              { journal_entry_id: je.id, account_id: credAcct!.id, debit_usd: 0, credit_usd: creditAmt, description: paymentMode === 'cxp' ? 'Cuentas por Pagar — flete/aduana' : `Pago desde ${credAcct!.description}` },
            ];

        const { error: linesErr } = await supabase.from('journal_entry_lines').insert(lines);
        if (linesErr) throw linesErr;
      }

      // 4) Insert history record (always, even if delta is 0 — captures who touched it and when)
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id || null;
      let userName: string | null = null;
      if (uid) {
        const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', uid).maybeSingle();
        userName = prof?.full_name || userRes?.user?.email || null;
      }
      const { error: histErr } = await (supabase as any)
        .from('shipment_expense_history')
        .insert({
          shipment_id: shipment.id,
          changed_by: uid,
          changed_by_name: userName,
          previous_freight_usd: currentFreight,
          previous_customs_usd: currentCustoms,
          previous_other_usd: currentOther,
          new_freight_usd: newFreight,
          new_customs_usd: newCustoms,
          new_other_usd: newOther,
          delta_total_usd: deltaAddons,
          payment_mode: Math.abs(deltaAddons) > 0.001 ? paymentMode : null,
          journal_entry_id: journalEntryId,
          notes: notes || null,
        });
      if (histErr) console.warn('No se pudo registrar el historial:', histErr.message);

      const capMsg = capitalize && capitalizedProducts.length > 0
        ? ` · ${capitalizedProducts.length} producto(s) capitalizados (WAC + márgenes actualizados)`
        : '';
      toast.success(`Gastos del envío actualizados${capMsg}`);
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['shipments-orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['libro-diario'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      queryClient.invalidateQueries({ queryKey: ['shipment-expense-history', shipment.id] });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Error al actualizar gastos del envío');
    } finally {
      setSaving(false);
    }
  };

  if (!shipment) return null;
  const isReceived = shipment.status === 'received';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Truck className="w-4 h-4 text-primary" />
            Editar gastos del envío — {shipment.po_number || shipment.id?.slice(0, 8)}
          </DialogTitle>
          <DialogDescription>
            Agrega o modifica flete, aduana y otros gastos capitalizables. El sistema los prorratea por valor FOB y actualiza el costo unitario aterrizado de cada producto (NIC 2). El delta se registra en el libro diario.
          </DialogDescription>
        </DialogHeader>

        {isReceived && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <div>
              <strong>Envío ya recibido.</strong> Para que el ajuste se aplique al catálogo de productos, mantén activado <strong>"Capitalizar como costo aterrizado"</strong>. Esto recalculará WAC y márgenes futuros usando el stock disponible actual. Las ventas pasadas NO se ajustan retroactivamente.
            </div>
          </div>
        )}
        <div className="space-y-4">
          <div className="rounded-lg bg-muted/30 p-3 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal FOB ({items.length} ítems)</span><span className="font-mono">{fmt(totalFob)}</span></div>
              {currentAddons > 0 && (
                <div className="flex justify-between text-muted-foreground/80 mt-1">
                  <span>Addons actuales</span><span className="font-mono">{fmt(currentAddons)}</span>
                </div>
              )}
            </div>

            {/* Consistency / accounting warnings */}
            {(() => {
              const warnings: { level: 'error' | 'warn' | 'info'; msg: string }[] = [];
              const okStatuses = ['ordered', 'in_transit', 'customs', 'arrived'];
              if (shipment.status && !okStatuses.includes(shipment.status) && shipment.status !== 'received') {
                warnings.push({ level: 'warn', msg: `Estado del envío "${shipment.status}" no es estándar. Verifica que sea correcto antes de contabilizar.` });
              }
              if (currentAddons > 0 && history.length === 0) {
                warnings.push({
                  level: 'error',
                  msg: `Inconsistencia detectada: este envío tiene ${fmt(currentAddons)} en addons (Flete/Aduana/Otros) pero NO existe historial ni asiento contable previo. Al guardar se generará un asiento por el delta total para regularizar el libro diario.`,
                });
              }
              if (currentAddons > 0 && history.length > 0 && linkedJournals.length === 0) {
                warnings.push({
                  level: 'error',
                  msg: 'Hay historial de cambios pero los asientos contables asociados no se encuentran en el libro diario (posiblemente eliminados). Esto afecta el Balance General y el Estado de Resultados.',
                });
              }
              if (!inventoryAcct) {
                warnings.push({ level: 'error', msg: 'Falta la cuenta "Inventarios" (código 13000) en el catálogo. Sin esta cuenta no se puede generar el asiento contable y el flete quedaría sin reflejarse en los Estados Financieros.' });
              }
              if (!cxpAcct) {
                warnings.push({ level: 'warn', msg: 'No se encontró la cuenta "Cuentas por Pagar Proveedores". El modo CxP no estará disponible.' });
              }
              if (Math.abs(deltaAddons) > 0.001 && paymentMode === 'bank' && !bankAccountId) {
                warnings.push({ level: 'warn', msg: 'Selecciona una cuenta bancaria de pago para que el asiento se registre correctamente.' });
              }
              if (warnings.length === 0 && currentAddons > 0 && history.length > 0 && linkedJournals.length > 0) {
                return (
                  <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-xs flex items-start gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-success">Contabilización consistente:</strong> Los addons actuales están reflejados en {linkedJournals.length} asiento(s) del libro diario.
                    </div>
                  </div>
                );
              }
              if (warnings.length === 0) return null;
              return (
                <div className="space-y-2">
                  {warnings.map((w, i) => (
                    <div key={i} className={`rounded-lg border p-3 text-xs flex items-start gap-2 ${
                      w.level === 'error' ? 'border-destructive/40 bg-destructive/10 text-destructive'
                      : w.level === 'warn' ? 'border-warning/40 bg-warning/10 text-warning'
                      : 'border-border bg-muted/30 text-muted-foreground'
                    }`}>
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <div>
                        <strong className="block mb-0.5">{w.level === 'error' ? 'Error contable' : w.level === 'warn' ? 'Advertencia' : 'Info'}</strong>
                        {w.msg}
                      </div>
                    </div>
                  ))}
                  <p className="text-[10px] text-muted-foreground pl-1">
                    El asiento generado afecta: <strong>Inventario (Activo)</strong> en el Balance General y, al recibir el envío y vender los productos, el <strong>Costo de Ventas</strong> en el Estado de Resultados.
                  </p>
                </div>
              );
            })()}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Flete USD</Label>
                <Input type="number" min={0} step={0.01} value={freight}
                  onChange={e => setFreight(e.target.value)} placeholder="0.00" className="h-8 text-xs font-mono mt-1" />
              </div>
              <div>
                <Label className="text-xs">Aduana USD</Label>
                <Input type="number" min={0} step={0.01} value={customs}
                  onChange={e => setCustoms(e.target.value)} placeholder="0.00" className="h-8 text-xs font-mono mt-1" />
              </div>
              <div>
                <Label className="text-xs">Otros USD</Label>
                <Input type="number" min={0} step={0.01} value={other}
                  onChange={e => setOther(e.target.value)} placeholder="0.00" className="h-8 text-xs font-mono mt-1" />
              </div>
            </div>

            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-1">
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Subtotal FOB</span><span className="font-mono">{fmt(totalFob)}</span></div>
              {newFreight > 0 && <div className="flex justify-between text-xs"><span className="text-muted-foreground">+ Flete</span><span className="font-mono">{fmt(newFreight)}</span></div>}
              {newCustoms > 0 && <div className="flex justify-between text-xs"><span className="text-muted-foreground">+ Aduana</span><span className="font-mono">{fmt(newCustoms)}</span></div>}
              {newOther > 0 && <div className="flex justify-between text-xs"><span className="text-muted-foreground">+ Otros</span><span className="font-mono">{fmt(newOther)}</span></div>}
              <div className="flex justify-between text-sm font-bold pt-1 border-t border-border/50">
                <span>Costo Aterrizado Total</span><span className="font-mono text-primary">{fmt(newLanded)}</span>
              </div>
              {Math.abs(deltaAddons) > 0.001 && (
                <div className="flex justify-between text-[11px] pt-1">
                  <span className="text-muted-foreground">Delta vs. addons actuales</span>
                  <span className={`font-mono ${deltaAddons > 0 ? 'text-warning' : 'text-success'}`}>{deltaAddons > 0 ? '+' : ''}{fmt(deltaAddons)}</span>
                </div>
              )}
            </div>

            {/* Toggle: Capitalizar como costo aterrizado (NIC 2) */}
            <div className={`rounded-lg border-2 p-3 transition-colors ${
              capitalize ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/20'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <TrendingUp className="w-3.5 h-3.5 text-primary" />
                    Capitalizar como costo aterrizado
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-tight">
                    {capitalize
                      ? <>Al guardar se actualizará <strong>products.unit_cost_usd</strong> con el nuevo costo aterrizado, se recalcularán <strong>WAC</strong> y <strong>márgenes</strong> (Lista, Arquitecto, Proyecto, Mayoreo), y se dejará un <strong>movimiento de inventario tipo "ajuste"</strong> (qty=0) por SKU para preservar el historial sin alterar el stock. {shipment.status === 'received' ? 'Como el envío YA fue recibido, el ajuste se distribuye sobre el stock actual.' : 'Al recibir este envío, el WAC usará automáticamente el costo aterrizado correcto.'}</>
                      : <>Solo se reprorratearán los <code>shipment_items</code>. <strong className="text-warning">No se actualizará</strong> el costo unitario en el catálogo de productos ni se recalcularán los márgenes — afecta reportería futura.</>
                    }
                  </p>
                </div>
                <Switch checked={capitalize} onCheckedChange={setCapitalize} />
              </div>
              {capitalize && shipment.status === 'received' && (
                <div className="mt-2 pt-2 border-t border-border/40 flex items-start gap-1.5 text-[10px] text-warning">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>Este envío ya está recibido. Los productos vendidos previamente NO se ajustarán retroactivamente; el WAC se actualiza con el stock disponible actual.</span>
                </div>
              )}
            </div>

            <div className={`rounded-lg border-2 p-3 space-y-3 transition-colors ${
              paymentMode === 'bank' && bankAccountId
                ? 'border-success/40 bg-success/5'
                : paymentMode === 'cxp'
                ? 'border-primary/30 bg-primary/5'
                : 'border-warning/40 bg-warning/5'
            }`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <BookOpen className="w-3.5 h-3.5 text-primary" />
                  Tratamiento contable (automático)
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className="text-[10px] gap-1">
                    Estado envío: <strong>{shipment.status}</strong>
                  </Badge>
                  <Badge variant="outline" className="text-[10px] gap-1">
                    Pago: <strong>{shipment.payment_status || 'pending'}</strong>
                  </Badge>
                  {paymentMode === autoPaymentMode && bankAccountId === autoBankAccountId ? (
                    <Badge variant="outline" className="text-[10px] gap-1 border-success/40 text-success">
                      <CheckCircle2 className="w-3 h-3" /> Auto
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] gap-1 border-warning/40 text-warning">
                      Manual
                    </Badge>
                  )}
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground leading-tight">
                Cuenta de inventario: <strong className="text-foreground">{inventoryAcct?.code} {inventoryAcct?.description}</strong> — se usa{' '}
                {isReceived_
                  ? <><strong>13000 Inventarios</strong> porque el envío ya fue recibido.</>
                  : <><strong>13200 Compras en Tránsito</strong> porque el envío aún no se ha recibido (NIC 2).</>
                }
                <br />
                Contrapartida: <strong className="text-foreground">{paymentMode === 'cxp' ? 'CxP Proveedores' : 'Banco / Caja'}</strong> — determinada por el estado de pago del envío.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMode('cxp')}
                  className={`rounded-lg border-2 p-2.5 text-left transition-all ${
                    paymentMode === 'cxp'
                      ? 'border-primary bg-primary/10 shadow-sm'
                      : 'border-border bg-background hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Wallet className={`w-4 h-4 ${paymentMode === 'cxp' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="text-xs font-semibold">CxP — A Crédito</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Genera deuda en {cxpAcct?.code || '20150'} Cuentas por Pagar.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMode('bank')}
                  className={`rounded-lg border-2 p-2.5 text-left transition-all ${
                    paymentMode === 'bank'
                      ? 'border-primary bg-primary/10 shadow-sm'
                      : 'border-border bg-background hover:border-primary/40'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Landmark className={`w-4 h-4 ${paymentMode === 'bank' ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="text-xs font-semibold">Banco / Caja</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Pagado de inmediato desde una cuenta de banco o caja.
                  </p>
                </button>
              </div>

              {paymentMode === 'bank' && (
                <div>
                  <Label className="text-[10px] text-muted-foreground">Cuenta bancaria</Label>
                  <Select value={bankAccountId} onValueChange={setBankAccountId}>
                    <SelectTrigger className={`h-8 text-xs mt-1 ${!bankAccountId ? 'border-warning/60' : ''}`}>
                      <SelectValue placeholder="Selecciona cuenta de banco / caja..." />
                    </SelectTrigger>
                    <SelectContent>
                      {bankAccounts.map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>{a.code} — {a.description}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!bankAccountId && (
                    <p className="text-[10px] text-warning mt-1">⚠️ Selecciona una cuenta para que el asiento se registre correctamente.</p>
                  )}
                </div>
              )}

              {/* Vista previa del asiento contable con LINKS al Libro Diario */}
              {Math.abs(deltaAddons) > 0.001 ? (
                <div className="text-[10px] space-y-0.5 pt-2 border-t border-border/40">
                  <div className="font-medium text-foreground mb-1">Asiento a generar (delta {fmt(Math.abs(deltaAddons))}):</div>
                  {(() => {
                    const credCode = paymentMode === 'cxp' ? cxpAcct?.code : bankAccounts.find((a: any) => a.id === bankAccountId)?.code;
                    const credDesc = paymentMode === 'cxp' ? cxpAcct?.description : bankAccounts.find((a: any) => a.id === bankAccountId)?.description;
                    const debitAcct = deltaAddons > 0 ? inventoryAcct : { code: credCode, description: credDesc };
                    const creditAcct = deltaAddons > 0 ? { code: credCode, description: credDesc } : inventoryAcct;
                    const linkClass = "font-mono underline decoration-dotted underline-offset-2 hover:text-primary cursor-pointer";
                    const openLD = (code?: string) => {
                      if (!code) return;
                      window.open(`/finanzas?tab=Libro%20Diario&q=${encodeURIComponent(code)}`, '_blank');
                    };
                    return (
                      <>
                        <div className="text-muted-foreground">
                          DR <a className={linkClass} onClick={() => openLD(debitAcct.code)} title="Ver en Libro Diario">{debitAcct.code} {debitAcct.description}</a> — {fmt(Math.abs(deltaAddons))}
                          {deltaAddons < 0 && <span className="italic ml-1">(reversa)</span>}
                        </div>
                        <div className="text-muted-foreground">
                          CR <a className={linkClass} onClick={() => openLD(creditAcct.code)} title="Ver en Libro Diario">{creditAcct.code || '—'} {creditAcct.description || 'Selecciona cuenta...'}</a> — {fmt(Math.abs(deltaAddons))}
                        </div>
                      </>
                    );
                  })()}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground pt-2 border-t border-border/40 italic">
                  Sin cambios en montos: no se generará asiento contable.
                </p>
              )}
            </div>


            {preview.length > 0 && (
              <div>
                <Label className="text-xs flex items-center gap-1.5 mb-1.5"><Sparkles className="w-3 h-3" /> Vista previa del nuevo costo unitario por producto</Label>
                <div className="rounded-lg border border-border overflow-hidden max-h-60 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 sticky top-0">
                      <tr>
                        <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Producto</th>
                        <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Qty</th>
                        <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">FOB unit</th>
                        <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">+ Addon</th>
                        <th className="text-right px-2 py-1.5 font-medium text-primary">Aterrizado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map(p => (
                        <tr key={p.id} className="border-t border-border/40">
                          <td className="px-2 py-1.5 truncate max-w-[180px]"><span className="font-mono text-[10px] text-muted-foreground">{p.sku}</span> {p.productName}</td>
                          <td className="text-right px-2 py-1.5 font-mono">{p.qty}</td>
                          <td className="text-right px-2 py-1.5 font-mono text-muted-foreground">{fmt(p.fobUnit)}</td>
                          <td className="text-right px-2 py-1.5 font-mono text-muted-foreground">{p.qty > 0 ? fmt(p.lineAddon / p.qty) : '—'}</td>
                          <td className="text-right px-2 py-1.5 font-mono text-primary font-semibold">{fmt(p.newUnitCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs">Notas (opcional)</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Notas adicionales sobre el envío..." className="min-h-[60px] text-xs mt-1" />
            </div>

            {/* Edit history */}
            <div>
              <Label className="text-xs flex items-center gap-1.5 mb-1.5">
                <History className="w-3 h-3" /> Historial de cambios ({history.length})
              </Label>
              {history.length === 0 ? (
                <div className="rounded-lg border border-border bg-muted/20 p-3 text-[11px] text-muted-foreground text-center">
                  Sin ediciones previas. El primer cambio quedará registrado aquí.
                </div>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead className="bg-muted/40 sticky top-0">
                      <tr>
                        <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Fecha</th>
                        <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Usuario</th>
                        <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Flete</th>
                        <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Aduana</th>
                        <th className="text-right px-2 py-1.5 font-medium text-muted-foreground">Otros</th>
                        <th className="text-right px-2 py-1.5 font-medium text-primary">Δ</th>
                        <th className="text-left px-2 py-1.5 font-medium text-muted-foreground">Pago</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h: any) => {
                        const d = new Date(h.created_at);
                        const dateStr = `${d.toLocaleDateString('es-DO')} ${d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}`;
                        const arrow = (prev: number, next: number) =>
                          Math.abs(next - prev) < 0.001 ? '—' : `${fmt(prev)} → ${fmt(next)}`;
                        return (
                          <tr key={h.id} className="border-t border-border/40 align-top">
                            <td className="px-2 py-1.5 font-mono text-muted-foreground whitespace-nowrap">{dateStr}</td>
                            <td className="px-2 py-1.5">{h.changed_by_name || <span className="italic text-muted-foreground">—</span>}</td>
                            <td className="text-right px-2 py-1.5 font-mono">{arrow(Number(h.previous_freight_usd), Number(h.new_freight_usd))}</td>
                            <td className="text-right px-2 py-1.5 font-mono">{arrow(Number(h.previous_customs_usd), Number(h.new_customs_usd))}</td>
                            <td className="text-right px-2 py-1.5 font-mono">{arrow(Number(h.previous_other_usd), Number(h.new_other_usd))}</td>
                            <td className={`text-right px-2 py-1.5 font-mono font-semibold ${Number(h.delta_total_usd) > 0 ? 'text-warning' : Number(h.delta_total_usd) < 0 ? 'text-success' : 'text-muted-foreground'}`}>
                              {Number(h.delta_total_usd) === 0 ? '—' : `${Number(h.delta_total_usd) > 0 ? '+' : ''}${fmt(Number(h.delta_total_usd))}`}
                            </td>
                            <td className="px-2 py-1.5 text-muted-foreground">
                              {h.payment_mode === 'cxp' ? 'CxP' : h.payment_mode === 'bank' ? 'Banco' : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
        </div>

        {missingAccountErrors.length > 0 && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="block">No se puede guardar: faltan cuentas en el catálogo.</strong>
              <ul className="list-disc pl-4 space-y-0.5">
                {missingAccountErrors.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
              <span className="block text-muted-foreground">Crea o reactiva las cuentas requeridas en Maestras → Catálogo de Cuentas e inténtalo de nuevo.</span>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || items.length === 0 || missingAccountErrors.length > 0}>
            {saving ? 'Guardando...' : (isReceived && capitalize ? 'Guardar y Capitalizar' : 'Guardar y Reprorratear')}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={reversalConfirmOpen} onOpenChange={setReversalConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              Se generará una reversa contable
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Estás reduciendo los gastos del envío en <strong className="text-destructive">{fmt(Math.abs(deltaAddons))}</strong> respecto a lo previamente capitalizado
                  ({fmt(currentAddons)} → {fmt(newAddons)}).
                </p>
                <div className="rounded-md border border-warning/40 bg-warning/10 p-2.5 text-xs space-y-1">
                  <p className="font-semibold text-foreground">Asiento de reversa que se creará:</p>
                  <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                    <li>
                      <strong className="text-foreground">Débito</strong> a {paymentMode === 'cxp' ? 'Cuentas por Pagar (20150)' : `${selectedBankAcct?.code || '—'} ${selectedBankAcct?.description || 'cuenta bancaria'}`} por {fmt(Math.abs(deltaAddons))}
                    </li>
                    <li>
                      <strong className="text-foreground">Crédito</strong> a {inventoryAcct?.code || '13000'} {inventoryAcct?.description || 'Inventarios'} por {fmt(Math.abs(deltaAddons))}
                    </li>
                  </ul>
                  <p className="text-[11px] text-muted-foreground pt-1">
                    Esto descapitalizará costo del inventario y {paymentMode === 'cxp' ? 'reducirá la deuda con el proveedor' : 'reflejará un reintegro/ajuste en la cuenta bancaria'}.
                    {capitalize && ' Además se recalculará el WAC y los márgenes de los productos afectados.'}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">¿Confirmas la reversa?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={async (e) => {
                e.preventDefault();
                setReversalConfirmOpen(false);
                await performSave();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sí, generar reversa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
