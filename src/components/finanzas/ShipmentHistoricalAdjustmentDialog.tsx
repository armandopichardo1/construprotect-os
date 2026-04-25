import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarIcon, History, AlertTriangle, BookOpen } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipment: any | null;
  onSaved?: () => void;
}

type Category = 'freight' | 'customs' | 'other';

const fmt = (n: number) =>
  `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Diálogo de "Ajuste de costo histórico" — registra un cargo adicional de
 * flete/aduana/otros con FECHA EFECTIVA en el pasado (por ejemplo, una factura
 * del courier que llegó tarde).
 *
 * Diferencias vs. la edición normal de gastos:
 *   - Permite elegir la fecha del asiento (no necesariamente hoy).
 *   - Trabaja con un DELTA en USD por categoría (suma a los addons existentes),
 *     en vez de pedir el nuevo total.
 *   - NO reprorratea el costo unitario por producto ni recalcula WAC; el ajuste
 *     se asienta directamente contra Inventarios / CxP / Banco como corrección
 *     histórica auditable.
 */
export function ShipmentHistoricalAdjustmentDialog({ open, onOpenChange, shipment, onSaved }: Props) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [category, setCategory] = useState<Category>('freight');
  const [amount, setAmount] = useState<string>('');
  const [effectiveDate, setEffectiveDate] = useState<Date>(new Date());
  const [paymentMode, setPaymentMode] = useState<'cxp' | 'bank'>('cxp');
  const [bankAccountId, setBankAccountId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [updateWac, setUpdateWac] = useState<boolean>(true);
  const [saving, setSaving] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: ['historical-adj-accounts'],
    queryFn: async () => {
      const { data } = await supabase
        .from('chart_of_accounts')
        .select('id, code, description, account_type, classification')
        .eq('is_active', true)
        .order('code');
      return data || [];
    },
  });

  const bankAccounts = useMemo(
    () =>
      accounts.filter(
        (a: any) =>
          a.account_type === 'Activo' &&
          (a.classification === 'Banco' || a.classification === 'Caja')
      ),
    [accounts]
  );

  const inventoryFinalAcct = useMemo(
    () => accounts.find((a: any) => a.code === '13000'),
    [accounts]
  );
  const inventoryInTransitAcct = useMemo(
    () => accounts.find((a: any) => a.code === '13200'),
    [accounts]
  );
  const isReceived = shipment?.status === 'received';
  const debitAcct = isReceived
    ? inventoryFinalAcct
    : inventoryInTransitAcct || inventoryFinalAcct;
  const cxpAcct = useMemo(
    () =>
      accounts.find((a: any) => a.code === '20150') ||
      accounts.find((a: any) => a.code === '20100'),
    [accounts]
  );

  useEffect(() => {
    if (open && shipment) {
      setCategory('freight');
      setAmount('');
      setEffectiveDate(new Date());
      setPaymentMode(
        shipment.payment_status === 'paid' && shipment.payment_account_id ? 'bank' : 'cxp'
      );
      setBankAccountId(shipment.payment_account_id || '');
      setNotes('');
      setUpdateWac(true);
    }
  }, [open, shipment?.id]);

  const amountUsd = Math.max(0, Number(amount) || 0);

  const credAcct = paymentMode === 'cxp' ? cxpAcct : bankAccounts.find((a: any) => a.id === bankAccountId);

  const validationErrors = useMemo(() => {
    const errs: string[] = [];
    if (amountUsd <= 0) errs.push('Ingresa un monto USD mayor a 0.');
    if (!debitAcct)
      errs.push(
        `Cuenta ${isReceived ? '13000 (Inventarios)' : '13200 (Compras en Tránsito)'} no encontrada en el catálogo.`
      );
    if (paymentMode === 'cxp' && !cxpAcct)
      errs.push('Cuenta 20150 (Cuentas por Pagar) no encontrada en el catálogo.');
    if (paymentMode === 'bank' && !bankAccountId) errs.push('Selecciona la cuenta bancaria.');
    return errs;
  }, [amountUsd, debitAcct, isReceived, paymentMode, cxpAcct, bankAccountId]);

  const categoryLabel = category === 'freight' ? 'Flete' : category === 'customs' ? 'Aduana' : 'Otros';

  const performSave = async () => {
    if (!shipment) return;
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0]);
      return;
    }
    setSaving(true);
    try {
      const dateStr = format(effectiveDate, 'yyyy-MM-dd');
      const poRef = shipment.po_number || shipment.id?.slice(0, 8);

      // 1) Sumar el ajuste al campo correspondiente del envío (acumulado)
      const currentFreight = Number(shipment.shipping_cost_usd || 0);
      const currentCustoms = Number(shipment.customs_cost_usd || 0);
      const currentOther = Number((shipment as any).other_cost_usd || 0);
      const newFreight = category === 'freight' ? currentFreight + amountUsd : currentFreight;
      const newCustoms = category === 'customs' ? currentCustoms + amountUsd : currentCustoms;
      const newOther = category === 'other' ? currentOther + amountUsd : currentOther;

      const { error: shipErr } = await supabase
        .from('shipments')
        .update({
          shipping_cost_usd: newFreight,
          customs_cost_usd: newCustoms,
          other_cost_usd: newOther,
        } as any)
        .eq('id', shipment.id);
      if (shipErr) throw shipErr;

      // 2) Crear asiento contable con la FECHA EFECTIVA elegida
      const description = `Ajuste histórico ${categoryLabel} — Envío ${poRef}`;
      const { data: je, error: jeErr } = await supabase
        .from('journal_entries')
        .insert({
          date: dateStr,
          description,
          total_debit_usd: amountUsd,
          total_credit_usd: amountUsd,
          notes: `Ajuste de costo histórico · ${categoryLabel} +${fmt(amountUsd)} · ${notes || 's/n'}`,
          reference_type: 'shipment_expense_historical_adjustment',
          reference_id: shipment.id,
        } as any)
        .select('id')
        .single();
      if (jeErr) throw jeErr;

      const lines = [
        {
          journal_entry_id: je.id,
          account_id: debitAcct!.id,
          debit_usd: amountUsd,
          credit_usd: 0,
          description: `Capitalización ${categoryLabel.toLowerCase()} (ajuste histórico)`,
        },
        {
          journal_entry_id: je.id,
          account_id: credAcct!.id,
          debit_usd: 0,
          credit_usd: amountUsd,
          description:
            paymentMode === 'cxp'
              ? `Cuentas por Pagar — ${categoryLabel.toLowerCase()} histórico`
              : `Pago desde ${credAcct!.description}`,
        },
      ];
      const { error: linesErr } = await supabase.from('journal_entry_lines').insert(lines);
      if (linesErr) throw linesErr;

      // 2.5) ACTUALIZACIÓN VERSIONADA DEL WAC (forward-only)
      // Distribuye el ajuste por valor FOB entre los items del envío y, para cada
      // producto, calcula un nuevo WAC sobre el stock disponible HOY. NO se tocan
      // movimientos pasados; solo se inserta un movimiento "adjustment" de qty=0
      // como marcador de versión y se actualiza products.unit_cost_usd /
      // total_unit_cost_usd hacia adelante.
      const wacUpdates: { sku: string; oldCost: number; newCost: number; deltaPerUnit: number }[] = [];
      if (updateWac) {
        const items: any[] = shipment.shipment_items || [];
        const itemFobTotals = items.map((it: any) => ({
          item: it,
          base: Number(it.unit_cost_usd || 0) * Number(it.quantity_ordered || 0),
        }));
        const sumBase = itemFobTotals.reduce((s, x) => s + x.base, 0);
        const useUnits = sumBase <= 0;
        const sumUnits = items.reduce((s: number, it: any) => s + Number(it.quantity_ordered || 0), 0);

        for (const { item, base } of itemFobTotals) {
          if (!item.product_id) continue;
          const qtyOrdered = Number(item.quantity_ordered || 0);
          const share = useUnits
            ? (sumUnits > 0 ? qtyOrdered / sumUnits : 0)
            : (sumBase > 0 ? base / sumBase : 0);
          const lineAddon = amountUsd * share;
          if (lineAddon <= 0 || qtyOrdered <= 0) continue;
          const addonPerUnit = lineAddon / qtyOrdered;

          const { data: prod } = await supabase
            .from('products')
            .select('sku, unit_cost_usd, total_unit_cost_usd, price_list_usd, price_architect_usd, price_project_usd, price_wholesale_usd')
            .eq('id', item.product_id)
            .single();
          if (!prod) continue;

          const currentCost = Number(prod.unit_cost_usd || 0);
          let newCost = currentCost;
          let deltaPerUnit = 0;

          if (isReceived) {
            // WAC forward-only sobre stock disponible HOY:
            // newWAC = (stockOnHand × currentWAC + addonPerUnit × min(stockOnHand, qtyOrdered)) / stockOnHand
            // Las unidades ya vendidas no se reajustan: su COGS pasado queda intacto.
            const { data: inv } = await supabase
              .from('inventory')
              .select('quantity_on_hand')
              .eq('product_id', item.product_id)
              .maybeSingle();
            const stockQty = Number(inv?.quantity_on_hand || 0);
            if (stockQty > 0) {
              const applicableUnits = Math.min(stockQty, qtyOrdered);
              const applicableAddon = addonPerUnit * applicableUnits;
              const onHandValue = stockQty * currentCost;
              newCost = (onHandValue + applicableAddon) / stockQty;
              deltaPerUnit = newCost - currentCost;
            } else {
              continue;
            }
          } else {
            // Envío aún no recibido: sumamos el addon al unit_cost del item para
            // que cuando se reciba, el WAC use el costo correcto.
            newCost = currentCost + addonPerUnit;
            deltaPerUnit = addonPerUnit;
            const newItemCost = Number(item.unit_cost_usd || 0) + addonPerUnit;
            await supabase
              .from('shipment_items')
              .update({ unit_cost_usd: Number(newItemCost.toFixed(4)) })
              .eq('id', item.id);
          }

          // Versionado del WAC en products (solo unit_cost_usd / total_unit_cost_usd)
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
          const { error: prodErr } = await supabase
            .from('products')
            .update(updates as any)
            .eq('id', item.product_id);
          if (prodErr) throw prodErr;

          // Marcador de versión en inventory_movements: qty=0, no altera stock.
          // Los movimientos previos quedan INTACTOS con su unit_cost_usd original.
          if (Math.abs(deltaPerUnit) > 0.0001) {
            await supabase.from('inventory_movements').insert({
              product_id: item.product_id,
              quantity: 0,
              movement_type: 'adjustment',
              unit_cost_usd: Number(newCost.toFixed(4)),
              reference_id: je.id,
              reference_type: 'shipment_expense_historical_adjustment',
              notes: `Versión WAC por ajuste histórico — Envío ${poRef} · ${categoryLabel} +${fmt(amountUsd)} (fecha efectiva ${dateStr}) · WAC ${currentCost.toFixed(4)} → ${newCost.toFixed(4)} (Δ ${deltaPerUnit >= 0 ? '+' : ''}${deltaPerUnit.toFixed(4)} USD/u). Movimientos previos no alterados.`,
            });
          }

          wacUpdates.push({ sku: prod.sku, oldCost: currentCost, newCost, deltaPerUnit });
        }
      }


      // 3) Registrar en el historial del envío
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id || null;
      let userName: string | null = null;
      if (uid) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', uid)
          .maybeSingle();
        userName = prof?.full_name || userRes?.user?.email || null;
      }
      const histNote = `[Ajuste histórico · ${format(effectiveDate, "d MMM yyyy", { locale: es })}] ${categoryLabel} +${fmt(amountUsd)}${notes ? ` — ${notes}` : ''}`;
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
          delta_total_usd: amountUsd,
          payment_mode: paymentMode,
          journal_entry_id: je.id,
          notes: histNote,
        });
      if (histErr) console.warn('No se pudo registrar el historial:', histErr.message);

      const wacMsg = updateWac && wacUpdates.length > 0
        ? ` · WAC versionado en ${wacUpdates.length} producto(s)`
        : (updateWac ? ' · sin productos con stock para versionar WAC' : '');
      toast.success(`Ajuste histórico registrado (${fmt(amountUsd)}) con fecha ${format(effectiveDate, "d MMM yyyy", { locale: es })}${wacMsg}`, {
        description: updateWac
          ? 'WAC actualizado hacia adelante. Movimientos previos quedan intactos.'
          : 'Solo asiento contable. WAC y costo unitario no modificados.',
      });

      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['shipments-orders'] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['libro-diario'] });
      queryClient.invalidateQueries({ queryKey: ['shipment-expense-history', shipment.id] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Error al registrar el ajuste histórico');
    } finally {
      setSaving(false);
    }
  };

  if (!shipment) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            Ajuste de costo histórico
          </DialogTitle>
          <DialogDescription className="text-xs">
            Registra un cargo de flete/aduana/otros que llegó después con una fecha efectiva en el pasado.
            Se contabiliza directamente sin reprorratear el costo unitario por producto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-xs">
          {/* Envío */}
          <div className="rounded-lg border border-border bg-muted/20 p-2.5 space-y-0.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Envío:</span>
              <span className="font-mono">{shipment.po_number || shipment.id?.slice(0, 8)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Estado:</span>
              <span>{isReceived ? 'Recibido (cargo a 13000)' : 'En tránsito (cargo a 13200)'}</span>
            </div>
          </div>

          {/* Categoría */}
          <div>
            <Label className="text-xs">Categoría del ajuste</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
              <SelectTrigger className="h-9 text-xs mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="freight">Flete</SelectItem>
                <SelectItem value="customs">Aduana</SelectItem>
                <SelectItem value="other">Otros</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Monto + Fecha */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Monto USD</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="h-9 text-xs mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Fecha efectiva</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full h-9 text-xs mt-1 justify-start font-normal',
                      !effectiveDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="w-3 h-3 mr-1.5" />
                    {effectiveDate ? format(effectiveDate, "d MMM yyyy", { locale: es }) : 'Elige fecha'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={effectiveDate}
                    onSelect={(d) => d && setEffectiveDate(d)}
                    disabled={(d) => d > new Date()}
                    initialFocus
                    className={cn('p-3 pointer-events-auto')}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Modo de pago */}
          <div>
            <Label className="text-xs">Modo de pago</Label>
            <Select value={paymentMode} onValueChange={(v) => setPaymentMode(v as 'cxp' | 'bank')}>
              <SelectTrigger className="h-9 text-xs mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cxp">Cuentas por Pagar (20150)</SelectItem>
                <SelectItem value="bank">Pago desde banco/caja</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {paymentMode === 'bank' && (
            <div>
              <Label className="text-xs">Cuenta bancaria</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger className="h-9 text-xs mt-1">
                  <SelectValue placeholder="Selecciona cuenta..." />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} — {a.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Notas */}
          <div>
            <Label className="text-xs">Notas / referencia (opcional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ej: Factura #1234 del courier recibida tarde"
              className="min-h-[60px] text-xs mt-1"
            />
          </div>

          {/* Toggle: actualizar WAC versionado */}
          <div className="flex items-start justify-between gap-3 rounded-lg border border-border bg-muted/20 p-2.5">
            <div className="space-y-0.5">
              <Label htmlFor="update-wac" className="text-xs font-medium cursor-pointer">
                Actualizar WAC versionado
              </Label>
              <p className="text-[10px] text-muted-foreground leading-snug">
                {isReceived
                  ? 'Recalcula unit_cost_usd y total_unit_cost_usd sobre el stock disponible HOY. Los movimientos previos en inventory_movements no se modifican; se inserta un movimiento qty=0 como marcador de versión.'
                  : 'Suma el ajuste al unit_cost del item. El WAC se aplicará correctamente cuando se reciba el envío.'}
              </p>
            </div>
            <Switch id="update-wac" checked={updateWac} onCheckedChange={setUpdateWac} />
          </div>

          {/* Vista previa contable */}
          {amountUsd > 0 && debitAcct && credAcct && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                <BookOpen className="w-3 h-3" /> Asiento que se generará
              </div>
              <div className="text-[11px] font-mono space-y-0.5">
                <div className="flex justify-between">
                  <span>DR {debitAcct.code} — {debitAcct.description}</span>
                  <span>{fmt(amountUsd)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span className="pl-3">CR {credAcct.code} — {credAcct.description}</span>
                  <span>{fmt(amountUsd)}</span>
                </div>
              </div>
              <div className="text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                Fecha del asiento: {format(effectiveDate, "d MMM yyyy", { locale: es })}
                {updateWac && <> · WAC versionado activo</>}
              </div>
            </div>
          )}

          {validationErrors.length > 0 && amountUsd > 0 && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2.5 text-[11px] text-destructive flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <ul className="space-y-0.5">
                {validationErrors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          <div className="text-[10px] text-muted-foreground italic">
            Forward-only: las unidades ya vendidas conservan su COGS pasado. Si necesitas
            redistribuir todo el costo aterrizado del envío, usa "Editar gastos".
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            size="sm"
            onClick={performSave}
            disabled={saving || amountUsd <= 0 || validationErrors.length > 0}
          >
            {saving ? 'Guardando...' : `Registrar ajuste (${fmt(amountUsd)})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
