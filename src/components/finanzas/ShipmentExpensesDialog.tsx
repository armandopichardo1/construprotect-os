import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Truck, Sparkles, BookOpen, History, AlertTriangle, ShieldCheck, Wallet, Landmark, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

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
  const inventoryAcct = useMemo(() => accounts.find((a: any) => a.code === '13000') || accounts.find((a: any) => a.classification === 'Inventarios'), [accounts]);
  const cxpAcct = useMemo(() => accounts.find((a: any) => a.code === '20150') || accounts.find((a: any) => a.code === '20100') || accounts.find((a: any) => a.classification?.includes('Cuentas por Pagar')), [accounts]);

  const items: any[] = shipment?.shipment_items || [];

  const currentFreight = Number(shipment?.shipping_cost_usd || 0);
  const currentCustoms = Number(shipment?.customs_cost_usd || 0);
  const currentOther = (() => {
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
      // Precarga modo de pago desde el envío:
      // si ya tiene payment_account_id definido → Banco con esa cuenta; si no → CxP
      if (shipment.payment_account_id) {
        setPaymentMode('bank');
        setBankAccountId(shipment.payment_account_id);
      } else {
        setPaymentMode('cxp');
        setBankAccountId('');
      }
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

  const handleSave = async () => {
    if (!shipment) return;
    if (shipment.status === 'received') {
      toast.error('No se puede editar gastos de un envío ya recibido — afectaría WAC e inventario.');
      return;
    }
    if (paymentMode === 'bank' && !bankAccountId && Math.abs(deltaAddons) > 0.001) {
      toast.error('Selecciona la cuenta bancaria de pago.');
      return;
    }
    if (Math.abs(deltaAddons) > 0.001 && !inventoryAcct) {
      toast.error('No se encontró la cuenta de Inventarios (13000) en el catálogo. Revisa Maestras.');
      return;
    }
    if (Math.abs(deltaAddons) > 0.001 && paymentMode === 'cxp' && !cxpAcct) {
      toast.error('No se encontró la cuenta de Cuentas por Pagar Proveedores. Revisa Maestras.');
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

      // 1) Update shipment header
      const { error: shipErr } = await supabase
        .from('shipments')
        .update({
          shipping_cost_usd: newFreight,
          customs_cost_usd: newCustoms,
          total_cost_usd: totalFob,
          notes: finalNotes,
        })
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

      toast.success('Gastos del envío actualizados — costos aterrizados reprorrateados y asiento contable registrado');
      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['shipments-orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['libro-diario'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
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

        {isReceived ? (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs text-warning-foreground">
            ⚠️ Este envío ya fue recibido. No se pueden editar los gastos porque afectaría el inventario, el WAC y los asientos contables ya registrados. Si necesitas corregir, registra una nota de crédito o un ajuste contable.
          </div>
        ) : (
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

            {/* Selector de cuenta de pago — SIEMPRE visible */}
            <div className={`rounded-lg border-2 p-3 space-y-3 transition-colors ${
              paymentMode === 'bank' && bankAccountId
                ? 'border-success/40 bg-success/5'
                : paymentMode === 'cxp'
                ? 'border-primary/30 bg-primary/5'
                : 'border-warning/40 bg-warning/5'
            }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <BookOpen className="w-3.5 h-3.5 text-primary" />
                  Cuenta de pago del envío
                </div>
                {shipment.payment_account_id ? (
                  <Badge variant="outline" className="text-[10px] gap-1 border-success/40 text-success">
                    <CheckCircle2 className="w-3 h-3" /> Cuenta de pago ya definida en el envío
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] gap-1 border-warning/40 text-warning">
                    <AlertTriangle className="w-3 h-3" /> Sin cuenta de pago previa
                  </Badge>
                )}
              </div>

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
                    No se ha pagado aún. Genera deuda en {cxpAcct?.code || '20150'} Cuentas por Pagar.
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

              {/* Vista previa del asiento contable */}
              {Math.abs(deltaAddons) > 0.001 ? (
                <div className="text-[10px] text-muted-foreground space-y-0.5 pt-2 border-t border-border/40">
                  <div className="font-medium text-foreground mb-1">Asiento a generar (delta {fmt(Math.abs(deltaAddons))}):</div>
                  {deltaAddons > 0 ? (
                    <>
                      <div>DR <span className="font-mono">{inventoryAcct?.code} {inventoryAcct?.description}</span> — {fmt(deltaAddons)}</div>
                      <div>CR <span className="font-mono">
                        {paymentMode === 'cxp'
                          ? `${cxpAcct?.code} ${cxpAcct?.description}`
                          : (bankAccounts.find((a: any) => a.id === bankAccountId)?.description || 'Selecciona cuenta...')}
                      </span> — {fmt(deltaAddons)}</div>
                    </>
                  ) : (
                    <>
                      <div>DR <span className="font-mono">{paymentMode === 'cxp' ? `${cxpAcct?.code} ${cxpAcct?.description}` : (bankAccounts.find((a: any) => a.id === bankAccountId)?.description || '...')}</span> — {fmt(Math.abs(deltaAddons))} <span className="italic">(reversa)</span></div>
                      <div>CR <span className="font-mono">{inventoryAcct?.code} {inventoryAcct?.description}</span> — {fmt(Math.abs(deltaAddons))}</div>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-muted-foreground pt-2 border-t border-border/40 italic">
                  Sin cambios en montos: no se generará asiento contable. La cuenta seleccionada se usará si editas los gastos.
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
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          {!isReceived && (
            <Button onClick={handleSave} disabled={saving || items.length === 0}>
              {saving ? 'Guardando...' : 'Guardar y Reprorratear'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
