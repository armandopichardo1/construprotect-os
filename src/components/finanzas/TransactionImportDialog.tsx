import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Upload, Download, Loader2, Check } from 'lucide-react';
import * as XLSX from 'xlsx';

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

// Excel columns are LINE-ITEM fields only. Transaction-level fields go in the dialog.
const EXPENSE_HEADERS = ['Descripción', 'Categoría', 'Monto'];
const COST_HEADERS = ['Descripción', 'Categoría', 'Monto'];
const SALE_HEADERS = ['Producto SKU', 'Cantidad', 'Precio Unitario USD'];
const PURCHASE_HEADERS = ['Producto SKU', 'Cantidad', 'Costo Unitario USD'];

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

  // Transaction-level fields (not in Excel)
  const [txDate, setTxDate] = useState(new Date().toISOString().split('T')[0]);
  const [txVendor, setTxVendor] = useState('');
  const [txClient, setTxClient] = useState('');
  const [txInvoiceRef, setTxInvoiceRef] = useState('');
  const [txPaymentStatus, setTxPaymentStatus] = useState('pending');
  const [txNotes, setTxNotes] = useState('');
  const [txCurrency, setTxCurrency] = useState<'USD' | 'DOP'>('USD');

  const reset = () => {
    setStep('config'); setRows([]); setStats({ inserted: 0, failed: 0 });
    setTxDate(new Date().toISOString().split('T')[0]);
    setTxVendor(''); setTxClient(''); setTxInvoiceRef('');
    setTxPaymentStatus('pending'); setTxNotes(''); setTxCurrency('USD');
  };

  const downloadTemplate = () => {
    let headers: string[] = [];
    let example: (string | number)[] = [];

    switch (txType) {
      case 'expense':
        headers = EXPENSE_HEADERS;
        example = ['Pago internet oficina', 'utilities', 50];
        break;
      case 'cost':
        headers = COST_HEADERS;
        example = ['Flete contenedor China', 'freight', 1200];
        break;
      case 'sale':
        headers = SALE_HEADERS;
        example = ['PIR-6060-BG', 100, 28.0];
        break;
      case 'purchase':
        headers = PURCHASE_HEADERS;
        example = ['PIR-6060-BG', 100, 12.5];
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
          const amt = Number(m.monto || m.amount || m.monto_usd || m.monto_dop || m.amount_usd || m.amount_dop || 0);
          if (!desc) return { raw: m, valid: false, error: 'Falta descripción' };
          const validCats = type === 'expense' ? EXPENSE_CATS : COST_CATS;
          if (cat && !validCats.includes(cat)) return { raw: m, valid: false, error: `Categoría inválida: ${cat}` };
          if (amt <= 0) return { raw: m, valid: false, error: 'Falta monto' };
          return { raw: { ...m, _desc: desc, _cat: cat || 'other', _amt: amt }, valid: true };
        }
        case 'sale':
        case 'purchase': {
          const sku = String(m.producto_sku || m.sku || m.product_sku || '').trim();
          const qty = Number(m.cantidad || m.quantity || 0);
          const price = Number(m.precio_unitario_usd || m.costo_unitario_usd || m.unit_price_usd || m.unit_cost_usd || m.precio || m.costo || m.cost || m.price || 0);
          if (!sku) return { raw: m, valid: false, error: 'Falta SKU producto' };
          if (qty <= 0) return { raw: m, valid: false, error: 'Cantidad inválida' };
          if (price <= 0) return { raw: m, valid: false, error: type === 'sale' ? 'Falta precio unitario' : 'Falta costo unitario' };
          return { raw: { ...m, _sku: sku, _qty: qty, _price: price }, valid: true };
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

    try {
      switch (txType) {
        case 'expense':
        case 'cost': {
          const table = txType === 'expense' ? 'expenses' : 'costs';
          for (const row of validRows) {
            const d = row.raw;
            const amt = Number(d._amt);
            const amtUsd = txCurrency === 'USD' ? amt : amt / exchangeRate;
            const amtDop = txCurrency === 'DOP' ? amt : amt * exchangeRate;
            const payload: any = {
              description: d._desc,
              category: d._cat,
              vendor: txVendor || null,
              amount_usd: amtUsd,
              amount_dop: amtDop,
              exchange_rate: exchangeRate,
              date: txDate,
            };
            const { error } = await supabase.from(table).insert(payload);
            if (error) { failed++; } else { inserted++; }
          }
          break;
        }
        case 'sale': {
          // All lines belong to ONE sale
          let subtotal = 0;
          const lineItems: { sku: string; qty: number; price: number }[] = [];
          for (const row of validRows) {
            const d = row.raw;
            const qty = Number(d._qty);
            const price = Number(d._price);
            subtotal += qty * price;
            lineItems.push({ sku: String(d._sku), qty, price });
          }
          const itbis = subtotal * 0.18;
          const total = subtotal + itbis;
          const salePayload: any = {
            date: txDate,
            subtotal_usd: subtotal,
            itbis_usd: itbis,
            total_usd: total,
            total_dop: total * exchangeRate,
            exchange_rate: exchangeRate,
            payment_status: txPaymentStatus || 'pending',
            invoice_ref: txInvoiceRef || null,
          };
          const { data: sale, error: se } = await supabase.from('sales').insert(salePayload).select('id').single();
          if (se || !sale) { failed += lineItems.length; break; }

          for (const item of lineItems) {
            const { data: prod } = await supabase.from('products').select('id, unit_cost_usd').eq('sku', item.sku).maybeSingle();
            const lineTotal = item.qty * item.price;
            const unitCost = prod?.unit_cost_usd || 0;
            const margin = item.price > 0 ? ((item.price - unitCost) / item.price) * 100 : 0;
            const itemPayload: any = {
              sale_id: sale.id,
              product_id: prod?.id || null,
              quantity: item.qty,
              unit_price_usd: item.price,
              unit_cost_usd: unitCost,
              line_total_usd: lineTotal,
              margin_pct: margin,
            };
            const { error } = await supabase.from('sale_items').insert(itemPayload);
            if (error) { failed++; } else { inserted++; }
          }
          break;
        }
        case 'purchase': {
          // All lines belong to ONE shipment/PO
          let totalCost = 0;
          const lineItems: { sku: string; qty: number; cost: number }[] = [];
          for (const row of validRows) {
            const d = row.raw;
            const qty = Number(d._qty);
            const cost = Number(d._price);
            totalCost += qty * cost;
            lineItems.push({ sku: String(d._sku), qty, cost });
          }
          const shipPayload: any = {
            supplier_name: txVendor || 'Importación masiva',
            po_number: `PO-IMP-${Date.now().toString(36).toUpperCase()}`,
            total_cost_usd: totalCost,
            status: 'ordered' as any,
            notes: txNotes || null,
            order_date: txDate,
          };
          const { data: ship, error: shipErr } = await supabase.from('shipments').insert(shipPayload).select('id').single();
          if (shipErr || !ship) { failed += lineItems.length; break; }

          for (const item of lineItems) {
            const { data: prod } = await supabase.from('products').select('id').eq('sku', item.sku).maybeSingle();
            if (!prod) { failed++; continue; }
            const itemPayload: any = {
              shipment_id: ship.id,
              product_id: prod.id,
              quantity_ordered: item.qty,
              quantity_received: 0,
              unit_cost_usd: item.cost,
            };
            const { error } = await supabase.from('shipment_items').insert(itemPayload);
            if (error) { failed++; } else { inserted++; }
          }
          break;
        }
      }
    } catch {
      failed += validRows.length - inserted;
    }

    setStats({ inserted, failed });
    setStep('done');
    setImporting(false);
    qc.invalidateQueries({ queryKey: ['expenses'] });
    qc.invalidateQueries({ queryKey: ['costs'] });
    qc.invalidateQueries({ queryKey: ['sales'] });
    qc.invalidateQueries({ queryKey: ['shipments'] });
  };

  const getHeaders = () => txType === 'expense' ? EXPENSE_HEADERS : txType === 'cost' ? COST_HEADERS : txType === 'sale' ? SALE_HEADERS : PURCHASE_HEADERS;

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

            {/* Transaction-level fields */}
            <div className="rounded-xl bg-muted/50 border border-border p-3 space-y-3">
              <p className="text-xs font-semibold text-foreground">Datos de la transacción (aplica a todas las líneas):</p>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Fecha</label>
                  <Input type="date" value={txDate} onChange={e => setTxDate(e.target.value)} className="h-8 text-xs" />
                </div>

                {(txType === 'expense' || txType === 'cost') && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">Proveedor</label>
                      <Input value={txVendor} onChange={e => setTxVendor(e.target.value)} placeholder="Nombre del proveedor" className="h-8 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">Moneda del monto</label>
                      <Select value={txCurrency} onValueChange={v => setTxCurrency(v as 'USD' | 'DOP')}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD ($)</SelectItem>
                          <SelectItem value="DOP">DOP (RD$)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {txType === 'sale' && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">Ref. Factura</label>
                      <Input value={txInvoiceRef} onChange={e => setTxInvoiceRef(e.target.value)} placeholder="FAC-001" className="h-8 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">Cliente</label>
                      <Input value={txClient} onChange={e => setTxClient(e.target.value)} placeholder="Nombre del cliente" className="h-8 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">Estado de Pago</label>
                      <Select value={txPaymentStatus} onValueChange={setTxPaymentStatus}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['pending', 'paid', 'partial', 'overdue', 'cancelled'].map(s => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {txType === 'purchase' && (
                  <>
                    <div className="space-y-1">
                      <label className="text-[10px] text-muted-foreground">Proveedor</label>
                      <Input value={txVendor} onChange={e => setTxVendor(e.target.value)} placeholder="Nombre del proveedor" className="h-8 text-xs" />
                    </div>
                  </>
                )}
              </div>

              {txType === 'purchase' && (
                <div className="space-y-1">
                  <label className="text-[10px] text-muted-foreground">Notas</label>
                  <Textarea value={txNotes} onChange={e => setTxNotes(e.target.value)} placeholder="Notas de la orden..." className="text-xs min-h-[40px]" rows={2} />
                </div>
              )}
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

            {/* Format guide */}
            <div className="rounded-xl bg-muted p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground">Columnas del archivo Excel — solo líneas:</p>
              <div className="flex flex-wrap gap-1.5">
                {getHeaders().map(h => (
                  <span key={h} className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-primary/15 text-primary">{h}</span>
                ))}
              </div>

              {(txType === 'expense' || txType === 'cost') && (
                <>
                  <p className="text-[10px] text-muted-foreground">
                    La columna <strong>Monto</strong> se interpreta según la moneda seleccionada arriba ({txCurrency}). El sistema convierte automáticamente a la otra moneda usando la tasa del día.
                  </p>
                  <div className="space-y-1">
                    <p className="text-[10px] text-muted-foreground font-medium">Categorías válidas:</p>
                    <div className="flex flex-wrap gap-1">
                      {(txType === 'expense' ? EXPENSE_CATS : COST_CATS).map(c => (
                        <span key={c} className="rounded-full px-1.5 py-0.5 text-[9px] bg-card text-muted-foreground border border-border">{c}</span>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {(txType === 'sale' || txType === 'purchase') && (
                <p className="text-[10px] text-muted-foreground">
                  Cada fila es un producto. Todas las filas pertenecen a una sola {txType === 'sale' ? 'venta' : 'orden de compra'}. El SKU debe existir en el catálogo.
                </p>
              )}
            </div>

            <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={downloadTemplate}>
              <Download className="w-3.5 h-3.5" /> Descargar plantilla {TX_LABELS[txType].label}
            </Button>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            {/* Summary of tx-level fields */}
            <div className="rounded-xl bg-muted/50 border border-border p-2.5 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Fecha:</span><span className="font-medium">{txDate}</span></div>
              {(txType === 'expense' || txType === 'cost') && txVendor && (
                <div className="flex justify-between"><span className="text-muted-foreground">Proveedor:</span><span className="font-medium">{txVendor}</span></div>
              )}
              {txType === 'sale' && txInvoiceRef && (
                <div className="flex justify-between"><span className="text-muted-foreground">Factura:</span><span className="font-medium">{txInvoiceRef}</span></div>
              )}
              {txType === 'purchase' && txVendor && (
                <div className="flex justify-between"><span className="text-muted-foreground">Proveedor:</span><span className="font-medium">{txVendor}</span></div>
              )}
            </div>

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
                            <th className="px-2 py-1.5 text-right text-muted-foreground font-medium">Monto ({txCurrency})</th>
                          </>
                        ) : (
                          <>
                            <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">SKU</th>
                            <th className="px-2 py-1.5 text-right text-muted-foreground font-medium">Cant.</th>
                            <th className="px-2 py-1.5 text-right text-muted-foreground font-medium">{txType === 'sale' ? 'Precio' : 'Costo'} USD</th>
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
                              <td className="px-2 py-1.5 text-right font-mono">{Number(r.raw._amt).toFixed(2)}</td>
                            </>
                          ) : (
                            <>
                              <td className="px-2 py-1.5 font-mono">{String(r.raw._sku)}</td>
                              <td className="px-2 py-1.5 text-right">{String(r.raw._qty)}</td>
                              <td className="px-2 py-1.5 text-right font-mono">${Number(r.raw._price).toFixed(2)}</td>
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
                Importar {validRows.length} líneas
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
