import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Truck, Sparkles } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shipment: any | null;
  onSaved?: () => void;
}

const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ShipmentExpensesDialog({ open, onOpenChange, shipment, onSaved }: Props) {
  const [freight, setFreight] = useState<string>('');
  const [customs, setCustoms] = useState<string>('');
  const [other, setOther] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Read original FOB cost from shipment_items (their unit_cost_usd may already include prorrated addons; we recompute from FOB baseline if available, else current unit_cost minus existing prorrated portion)
  const items: any[] = shipment?.shipment_items || [];

  // Current addons stored on shipment
  const currentFreight = Number(shipment?.shipping_cost_usd || 0);
  const currentCustoms = Number(shipment?.customs_cost_usd || 0);
  // "Other" is not a column — derive from notes if previously stored, else 0
  const currentOther = (() => {
    const m = String(shipment?.notes || '').match(/Otros \$([0-9.]+)/);
    return m ? Number(m[1]) : 0;
  })();
  const currentAddons = currentFreight + currentCustoms + currentOther;

  // Compute baseline FOB per item: current unit_cost_usd is "landed" (FOB + prorrated addon).
  // Reverse-engineer: lineFob_i = lineLanded_i - prorrated_addon_i
  // prorrated_addon_i = (lineFob_i / totalFob) * currentAddons → solve linearly
  // Simpler: lineLanded_i = lineFob_i * (1 + currentAddons/totalFob)
  // → lineFob_i = lineLanded_i / (1 + currentAddons/totalFob)
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shipment?.id]);

  const newFreight = Math.max(0, Number(freight) || 0);
  const newCustoms = Math.max(0, Number(customs) || 0);
  const newOther = Math.max(0, Number(other) || 0);
  const newAddons = newFreight + newCustoms + newOther;
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
    setSaving(true);
    try {
      // Build new notes string preserving user notes; strip previous landed-cost annotation
      const userNotes = String(notes || '')
        .replace(/Costo aterrizado prorrateado por valor FOB[^·\n]*?(\.|·|$)/g, '')
        .replace(/[·\s]+$/g, '')
        .trim();
      const landedAnnotation = newAddons > 0
        ? `Costo aterrizado prorrateado por valor FOB — Flete $${newFreight.toFixed(2)} · Aduana $${newCustoms.toFixed(2)} · Otros $${newOther.toFixed(2)} (Total addons $${newAddons.toFixed(2)} sobre FOB $${totalFob.toFixed(2)})`
        : null;
      const finalNotes = [userNotes || null, landedAnnotation].filter(Boolean).join(' · ') || null;

      // Update shipment
      const { error: shipErr } = await supabase
        .from('shipments')
        .update({
          shipping_cost_usd: newFreight,
          customs_cost_usd: newCustoms,
          total_cost_usd: totalFob, // keep as FOB; addons live in their own columns
          notes: finalNotes,
        })
        .eq('id', shipment.id);
      if (shipErr) throw shipErr;

      // Update each shipment_item with new landed unit cost
      for (const p of preview) {
        const { error: itErr } = await supabase
          .from('shipment_items')
          .update({ unit_cost_usd: Number(p.newUnitCost.toFixed(4)) })
          .eq('id', p.id);
        if (itErr) throw itErr;
      }

      toast.success('Gastos del envío actualizados — costos aterrizados reprorrateados');
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
            Agrega o modifica flete, aduana y otros gastos capitalizables. El sistema los prorratea por valor FOB y actualiza el costo unitario aterrizado de cada producto (NIC 2).
          </DialogDescription>
        </DialogHeader>

        {isReceived ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
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
