import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Upload, Download, Loader2, Check } from 'lucide-react';
import * as XLSX from 'xlsx';
import { z } from 'zod';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exchangeRate: number;
}

type TxType = 'expense' | 'cost' | 'sale' | 'purchase';
type Step = 'config' | 'preview' | 'importing' | 'done';

const TX_LABELS: Record<TxType, { label: string; icon: string }> = {
  expense: { label: 'Gastos', icon: '💸' },
  cost: { label: 'Costos', icon: '🏗️' },
  sale: { label: 'Ventas', icon: '💰' },
  purchase: { label: 'Compras', icon: '📦' },
};

const EXPENSE_HEADERS = ['Fecha', 'Descripción', 'Categoría', 'Proveedor', 'Monto USD', 'Monto DOP'];
const COST_HEADERS = ['Fecha', 'Descripción', 'Categoría', 'Proveedor', 'Monto USD', 'Monto DOP'];
const SALE_HEADERS = ['Fecha', 'Cliente', 'Ref Factura', 'Subtotal USD', 'ITBIS USD', 'Total USD', 'Estado Pago'];
const PURCHASE_HEADERS = ['Fecha', 'Proveedor', 'Producto SKU', 'Cantidad', 'Costo Unitario USD', 'Notas'];

const EXPENSE_CATS = ['purchases', 'warehouse', 'payroll', 'rent', 'utilities', 'insurance', 'maintenance', 'software', 'accounting', 'marketing', 'shipping', 'customs', 'travel', 'samples', 'office', 'bank_fees', 'other'];
const COST_CATS = ['freight', 'customs', 'raw_materials', 'packaging', 'labor', 'logistics', 'warehousing', 'insurance', 'other'];

interface ParsedRow {
  raw: Record<string, unknown>;
  valid: boolean;
  error?: string;
}

function normalizeKey(h: string): string {
  return h.toLowerCase().trim().replace(/[\s\-]+/g, '_').replace(/[^a-z0-9_áéíóúñü]/g, '');
}

export function TransactionImportDialog({ open, onOpenChange, exchangeRate }: Props) {
  const [txType, setTxType] = useState<TxType>('expense');
  const [step, setStep] = useState<Step>('config');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [stats, setStats] = useState({ inserted: 0, failed: 0 });
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const reset = () => { setStep('config'); setRows([]); setStats({ inserted: 0, failed: 0 }); };

  const downloadTemplate = () => {
    let headers: string[] = [];
    let example: (string | number)[] = [];

    switch (txType) {
      case 'expense':
        headers = EXPENSE_HEADERS;
        example = ['2025-01-15', 'Pago internet oficina', 'utilities', 'Claro', 50, 3000];
        break;
      case 'cost':
        headers = COST_HEADERS;
        example = ['2025-01-15', 'Flete contenedor China', 'freight', 'Maersk', 1200, 72000];
        break;
      case 'sale':
        headers = SALE_HEADERS;
        example = ['2025-01-15', 'Juan Pérez', 'FAC-001', 500, 90, 590, 'paid'];
        break;
      case 'purchase':
        headers = PURCHASE_HEADERS;
        example = ['2025-01-15', 'Porcelanosa', 'PIR-6060-BG', 100, 12.5, 'Contenedor marzo'];
        break;
    }

    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 2, 14) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, TX_LABELS[txType].label);
    XLSX.writeFile(wb, `plantilla_${txType}.xlsx`);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.match(/\.xlsx?$/i)) { toast.error('Solo .xlsx o .xls'); return; }

    try {
      const data = new Uint8Array(await file.arrayBuffer());
      const wb = XLSX.read(data, { type: 'array' });
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      if (raw.length === 0) { toast.error('Archivo vacío'); return; }

      const parsed: ParsedRow[] = raw.map(row => {
        const mapped: Record<string, unknown> = {};
        Object.entries(row).forEach(([k, v]) => { mapped[normalizeKey(k)] = v; });
        return validateRow(mapped, txType);
      });

      setRows(parsed);
      setStep('preview');
    } catch {
      toast.error('Error al leer el archivo');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const validateRow = (m: Record<string, unknown>, type: TxType): ParsedRow => {
    try {
      switch (type) {
        case 'expense':
        case 'cost': {
          const desc = String(m.descripción || m.descripcion || m.description || '').trim();
          const cat = String(m.categoría || m.categoria || m.category || '').trim().toLowerCase();
          const amtUsd = Number(m.monto_usd || m.amount_usd || 0);
          const amtDop = Number(m.monto_dop || m.amount_dop || 0);
          if (!desc) return { raw: m, valid: false, error: 'Falta descripción' };
          const validCats = type === 'expense' ? EXPENSE_CATS : COST_CATS;
          if (cat && !validCats.includes(cat)) return { raw: m, valid: false, error: `Categoría inválida: ${cat}` };
          if (amtUsd <= 0 && amtDop <= 0) return { raw: m, valid: false, error: 'Falta monto' };
          return { raw: { ...m, _desc: desc, _cat: cat || 'other', _vendor: String(m.proveedor || m.vendor || ''), _usd: amtUsd || amtDop / exchangeRate, _dop: amtDop || amtUsd * exchangeRate, _date: String(m.fecha || m.date || '') }, valid: true };
        }
        case 'sale': {
          const cliente = String(m.cliente || m.client || '').trim();
          const subtotal = Number(m.subtotal_usd || m.subtotal || 0);
          const itbis = Number(m.itbis_usd || m.itbis || 0);
          const total = Number(m.total_usd || m.total || 0);
          if (subtotal <= 0 && total <= 0) return { raw: m, valid: false, error: 'Falta subtotal o total' };
          const finalSubtotal = subtotal || (total / 1.18);
          const finalItbis = itbis || (finalSubtotal * 0.18);
          const finalTotal = total || (finalSubtotal + finalItbis);
          return { raw: { ...m, _cliente: cliente, _ref: String(m.ref_factura || m.invoice_ref || ''), _subtotal: finalSubtotal, _itbis: finalItbis, _total: finalTotal, _dop: finalTotal * exchangeRate, _status: String(m.estado_pago || m.payment_status || 'pending'), _date: String(m.fecha || m.date || '') }, valid: true };
        }
        case 'purchase': {
          const supplier = String(m.proveedor || m.supplier || '').trim();
          const sku = String(m.producto_sku || m.sku || m.product_sku || '').trim();
          const qty = Number(m.cantidad || m.quantity || 0);
          const cost = Number(m.costo_unitario_usd || m.unit_cost_usd || m.cost || 0);
          if (!supplier) return { raw: m, valid: false, error: 'Falta proveedor' };
          if (!sku) return { raw: m, valid: false, error: 'Falta SKU producto' };
          if (qty <= 0) return { raw: m, valid: false, error: 'Cantidad inválida' };
          if (cost <= 0) return { raw: m, valid: false, error: 'Falta costo unitario' };
          return { raw: { ...m, _supplier: supplier, _sku: sku, _qty: qty, _cost: cost, _notes: String(m.notas || m.notes || ''), _date: String(m.fecha || m.date || '') }, valid: true };
        }
      }
    } catch {
      return { raw: m, valid: false, error: 'Error de validación' };
    }
  };

  const validRows = rows.filter(r => r.valid);
  const errorRows = rows.filter(r => !r.valid);

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setStep('importing');
    setImporting(true);
    let inserted = 0, failed = 0;

    for (const row of validRows) {
      try {
        const d = row.raw;
        const dateStr = String(d._date || '').trim();
        const dateVal = dateStr ? dateStr : undefined;

        switch (txType) {
          case 'expense': {
            const payload: any = { description: d._desc, category: d._cat, vendor: d._vendor || null, amount_usd: d._usd, amount_dop: d._dop, exchange_rate: exchangeRate };
            if (dateVal) payload.date = dateVal;
            const { error } = await supabase.from('expenses').insert(payload);
            if (error) throw error;
            break;
          }
          case 'cost': {
            const payload: any = { description: d._desc, category: d._cat, vendor: d._vendor || null, amount_usd: d._usd, amount_dop: d._dop, exchange_rate: exchangeRate };
            if (dateVal) payload.date = dateVal;
            const { error } = await supabase.from('costs').insert(payload);
            if (error) throw error;
            break;
          }
          case 'sale': {
            const payload: any = { subtotal_usd: d._subtotal, itbis_usd: d._itbis, total_usd: d._total, total_dop: d._dop, exchange_rate: exchangeRate, payment_status: d._status || 'pending', invoice_ref: d._ref || null };
            if (dateVal) payload.date = dateVal;
            const { error } = await supabase.from('sales').insert(payload);
            if (error) throw error;
            break;
          }
          case 'purchase': {
            const { data: prod } = await supabase.from('products').select('id').eq('sku', d._sku).maybeSingle();
            if (!prod) { failed++; continue; }
            const totalCost = Number(d._qty) * Number(d._cost);
            const shipPayload: any = { supplier_name: d._supplier, po_number: `PO-IMP-${Date.now().toString(36).toUpperCase()}`, total_cost_usd: totalCost, status: 'ordered' as any, notes: d._notes || null };
            if (dateVal) shipPayload.order_date = dateVal;
            const { data: ship, error: se } = await supabase.from('shipments').insert(shipPayload).select('id').single();
            if (se || !ship) throw se;
            await supabase.from('shipment_items').insert({ shipment_id: ship.id, product_id: prod.id, quantity_ordered: d._qty, quantity_received: 0, unit_cost_usd: d._cost });
            break;
          }
        }
        inserted++;
      } catch {
        failed++;
      }
    }

    setStats({ inserted, failed });
    setStep('done');
    setImporting(false);
    qc.invalidateQueries({ queryKey: ['expenses'] });
    qc.invalidateQueries({ queryKey: ['costs'] });
    qc.invalidateQueries({ queryKey: ['sales'] });
    qc.invalidateQueries({ queryKey: ['shipments'] });
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!importing) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 'config' && 'Carga Masiva de Transacciones'}
            {step === 'preview' && `Vista Previa — ${TX_LABELS[txType].label}`}
            {step === 'importing' && 'Importando...'}
            {step === 'done' && 'Importación Completa'}
          </DialogTitle>
        </DialogHeader>

        {step === 'config' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Tipo de Transacción</label>
              <Select value={txType} onValueChange={v => setTxType(v as TxType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TX_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.icon} {v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-border rounded-2xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            >
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">Arrastra o haz clic para seleccionar</p>
              <p className="text-xs text-muted-foreground mt-1">Archivos .xlsx o .xls</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
            </div>

            <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={downloadTemplate}>
              <Download className="w-3.5 h-3.5" /> Descargar plantilla {TX_LABELS[txType].label}
            </Button>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-muted p-2">
                <p className="text-lg font-bold">{rows.length}</p>
                <p className="text-[10px] text-muted-foreground">Total filas</p>
              </div>
              <div className="rounded-xl bg-success/10 p-2">
                <p className="text-lg font-bold text-success">{validRows.length}</p>
                <p className="text-[10px] text-muted-foreground">Válidas</p>
              </div>
              <div className="rounded-xl bg-destructive/10 p-2">
                <p className="text-lg font-bold text-destructive">{errorRows.length}</p>
                <p className="text-[10px] text-muted-foreground">Errores</p>
              </div>
            </div>

            {errorRows.length > 0 && (
              <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-3 space-y-1 max-h-32 overflow-y-auto">
                <p className="text-xs font-semibold text-destructive">Errores:</p>
                {errorRows.slice(0, 10).map((r, i) => (
                  <p key={i} className="text-[10px] text-muted-foreground">Fila {rows.indexOf(r) + 2}: {r.error}</p>
                ))}
              </div>
            )}

            {validRows.length > 0 && (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="overflow-x-auto max-h-48">
                  <table className="w-full text-xs">
                    <thead className="bg-muted">
                      <tr>
                        {txType === 'expense' || txType === 'cost' ? (
                          <>
                            <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Descripción</th>
                            <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Cat.</th>
                            <th className="px-2 py-1.5 text-right text-muted-foreground font-medium">USD</th>
                          </>
                        ) : txType === 'sale' ? (
                          <>
                            <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Cliente</th>
                            <th className="px-2 py-1.5 text-right text-muted-foreground font-medium">Total USD</th>
                            <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Estado</th>
                          </>
                        ) : (
                          <>
                            <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Proveedor</th>
                            <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">SKU</th>
                            <th className="px-2 py-1.5 text-right text-muted-foreground font-medium">Cant.</th>
                            <th className="px-2 py-1.5 text-right text-muted-foreground font-medium">Costo</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {validRows.slice(0, 8).map((r, i) => (
                        <tr key={i} className="border-t border-border">
                          {txType === 'expense' || txType === 'cost' ? (
                            <>
                              <td className="px-2 py-1.5 truncate max-w-[150px]">{String(r.raw._desc)}</td>
                              <td className="px-2 py-1.5 text-muted-foreground">{String(r.raw._cat)}</td>
                              <td className="px-2 py-1.5 text-right font-mono">${Number(r.raw._usd).toFixed(2)}</td>
                            </>
                          ) : txType === 'sale' ? (
                            <>
                              <td className="px-2 py-1.5 truncate max-w-[150px]">{String(r.raw._cliente) || '—'}</td>
                              <td className="px-2 py-1.5 text-right font-mono">${Number(r.raw._total).toFixed(2)}</td>
                              <td className="px-2 py-1.5 text-muted-foreground">{String(r.raw._status)}</td>
                            </>
                          ) : (
                            <>
                              <td className="px-2 py-1.5 truncate max-w-[100px]">{String(r.raw._supplier)}</td>
                              <td className="px-2 py-1.5 font-mono">{String(r.raw._sku)}</td>
                              <td className="px-2 py-1.5 text-right">{String(r.raw._qty)}</td>
                              <td className="px-2 py-1.5 text-right font-mono">${Number(r.raw._cost).toFixed(2)}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {validRows.length > 8 && (
                  <p className="text-[10px] text-muted-foreground text-center py-1 bg-muted">...y {validRows.length - 8} más</p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={reset}>Cancelar</Button>
              <Button className="flex-1" onClick={handleImport} disabled={validRows.length === 0}>
                Importar {validRows.length} {TX_LABELS[txType].label.toLowerCase()}
              </Button>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="py-8 text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">Importando {TX_LABELS[txType].label.toLowerCase()}...</p>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-4">
            <div className="py-4 text-center">
              <Check className="w-10 h-10 mx-auto text-success mb-2" />
              <p className="text-sm font-medium">Importación completada</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-success/10 p-3">
                <p className="text-xl font-bold text-success">{stats.inserted}</p>
                <p className="text-[10px] text-muted-foreground">Insertados</p>
              </div>
              <div className="rounded-xl bg-destructive/10 p-3">
                <p className="text-xl font-bold text-destructive">{stats.failed}</p>
                <p className="text-[10px] text-muted-foreground">Fallidos</p>
              </div>
            </div>
            <Button className="w-full" onClick={() => { onOpenChange(false); reset(); }}>Cerrar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
