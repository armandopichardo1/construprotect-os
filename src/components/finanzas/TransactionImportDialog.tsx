import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Upload, Download, Loader2, Check, Pencil, Trash2, X, Save, Plus } from 'lucide-react';
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

  const { data: contacts = [] } = useQuery({
    queryKey: ['sale-contacts'],
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('id, contact_name, company_name');
      return data || [];
    },
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data } = await supabase.from('suppliers').select('id, name').eq('is_active', true).order('name');
      return data || [];
    },
  });

  // Editing state for preview
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, any>>({});

  const startEdit = (globalIdx: number) => {
    const row = rows[globalIdx];
    setEditDraft({ ...row.raw });
    setEditingIdx(globalIdx);
  };

  const saveEdit = (globalIdx: number) => {
    setRows(prev => prev.map((r, i) => i === globalIdx ? { ...r, raw: { ...r.raw, ...editDraft } } : r));
    setEditingIdx(null);
    setEditDraft({});
  };

  const deleteRow = (globalIdx: number) => {
    setRows(prev => prev.filter((_, i) => i !== globalIdx));
    if (editingIdx === globalIdx) setEditingIdx(null);
  };

  const addNewRow = () => {
    const newRow: ParsedRow = (txType === 'expense' || txType === 'cost')
      ? { raw: { _desc: '', _cat: 'other', _amt: 0 }, valid: true }
      : { raw: { _sku: '', _qty: 1, _price: 0 }, valid: true };
    setRows(prev => [...prev, newRow]);
    // Auto-enter edit mode on the new row
    const newIdx = rows.length;
    setEditDraft({ ...newRow.raw });
    setEditingIdx(newIdx);
  };

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
            contact_id: txClient || null,
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
                      {suppliers.length > 0 ? (
                        <SearchableSelect
                          options={suppliers.map((s: any) => ({ value: s.name, label: s.name }))}
                          value={txVendor}
                          onValueChange={setTxVendor}
                          placeholder="Seleccionar proveedor"
                          searchPlaceholder="Buscar proveedor..."
                          emptyMessage="No encontrado"
                          className="h-8 text-xs"
                        />
                      ) : (
                        <Input value={txVendor} onChange={e => setTxVendor(e.target.value)} placeholder="Nombre del proveedor" className="h-8 text-xs" />
                      )}
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
                      <SearchableSelect
                        options={contacts.map((c: any) => ({ value: c.id, label: c.contact_name + (c.company_name ? ` — ${c.company_name}` : '') }))}
                        value={txClient}
                        onValueChange={setTxClient}
                        placeholder="Seleccionar cliente"
                        searchPlaceholder="Buscar cliente..."
                        emptyMessage="No encontrado"
                        className="h-8 text-xs"
                      />
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
                      {suppliers.length > 0 ? (
                        <SearchableSelect
                          options={suppliers.map((s: any) => ({ value: s.name, label: s.name }))}
                          value={txVendor}
                          onValueChange={setTxVendor}
                          placeholder="Seleccionar proveedor"
                          searchPlaceholder="Buscar proveedor..."
                          emptyMessage="No encontrado"
                          className="h-8 text-xs"
                        />
                      ) : (
                        <Input value={txVendor} onChange={e => setTxVendor(e.target.value)} placeholder="Nombre del proveedor" className="h-8 text-xs" />
                      )}
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

            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" onClick={downloadTemplate}>
                <Download className="w-3.5 h-3.5" /> Descargar plantilla
              </Button>
              <Button variant="outline" size="sm" className="flex-1 gap-1.5 text-xs" onClick={() => setStep('preview')}>
                <Plus className="w-3.5 h-3.5" /> Crear manualmente
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && (() => {
          // Compute totals for preview
          let totalAmtRaw = 0;
          let totalUsd = 0;
          let totalDop = 0;

          if (txType === 'expense' || txType === 'cost') {
            totalAmtRaw = validRows.reduce((s, r) => s + Number(r.raw._amt || 0), 0);
            totalUsd = txCurrency === 'USD' ? totalAmtRaw : totalAmtRaw / exchangeRate;
            totalDop = txCurrency === 'DOP' ? totalAmtRaw : totalAmtRaw * exchangeRate;
          } else {
            // sale/purchase: sum qty * price
            totalUsd = validRows.reduce((s, r) => s + (Number(r.raw._qty || 0) * Number(r.raw._price || 0)), 0);
            totalDop = totalUsd * exchangeRate;
          }
          const itbisUsd = txType === 'sale' ? totalUsd * 0.18 : 0;
          const grandTotalUsd = totalUsd + itbisUsd;
          const grandTotalDop = grandTotalUsd * exchangeRate;

          return (
          <div className="space-y-4">
            {/* Receipt-style header */}
            <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{TX_LABELS[txType].icon}</span>
                <p className="text-sm font-bold text-foreground">{TX_LABELS[txType].label}</p>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div className="flex justify-between col-span-2 sm:col-span-1">
                  <span className="text-muted-foreground">Fecha:</span>
                  <span className="font-medium">{txDate}</span>
                </div>
                {(txType === 'expense' || txType === 'cost') && txVendor && (
                  <div className="flex justify-between col-span-2 sm:col-span-1">
                    <span className="text-muted-foreground">Proveedor:</span>
                    <span className="font-medium">{txVendor}</span>
                  </div>
                )}
                {(txType === 'expense' || txType === 'cost') && (
                  <div className="flex justify-between col-span-2 sm:col-span-1">
                    <span className="text-muted-foreground">Moneda:</span>
                    <span className="font-medium">{txCurrency}</span>
                  </div>
                )}
                {txType === 'sale' && (
                  <>
                    {txClient && <div className="flex justify-between col-span-2 sm:col-span-1"><span className="text-muted-foreground">Cliente:</span><span className="font-medium">{txClient}</span></div>}
                    {txInvoiceRef && <div className="flex justify-between col-span-2 sm:col-span-1"><span className="text-muted-foreground">Factura:</span><span className="font-medium">{txInvoiceRef}</span></div>}
                    <div className="flex justify-between col-span-2 sm:col-span-1"><span className="text-muted-foreground">Estado pago:</span><span className="font-medium">{txPaymentStatus}</span></div>
                  </>
                )}
                {txType === 'purchase' && (
                  <>
                    {txVendor && <div className="flex justify-between col-span-2 sm:col-span-1"><span className="text-muted-foreground">Proveedor:</span><span className="font-medium">{txVendor}</span></div>}
                    {txNotes && <div className="flex justify-between col-span-2"><span className="text-muted-foreground">Notas:</span><span className="font-medium truncate ml-2">{txNotes}</span></div>}
                  </>
                )}
                <div className="flex justify-between col-span-2 sm:col-span-1">
                  <span className="text-muted-foreground">Tasa cambio:</span>
                  <span className="font-medium">{exchangeRate.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Validation counts */}
            {errorRows.length > 0 && (
              <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-3 space-y-1 max-h-28 overflow-y-auto">
                <p className="text-xs font-semibold text-destructive">{errorRows.length} fila(s) con error (no se importarán):</p>
                {errorRows.slice(0, 10).map((r, i) => (
                  <p key={i} className="text-[10px] text-muted-foreground">Fila {rows.indexOf(r) + 2}: {r.error}</p>
                ))}
              </div>
            )}

            {/* Editable line items */}
            {validRows.length > 0 ? (
              <div className="space-y-2">
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="overflow-x-auto max-h-60">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="px-1.5 py-1.5 text-left text-muted-foreground font-medium w-6">#</th>
                        {txType === 'expense' || txType === 'cost' ? (
                          <>
                            <th className="px-1.5 py-1.5 text-left text-muted-foreground font-medium">Descripción</th>
                            <th className="px-1.5 py-1.5 text-left text-muted-foreground font-medium w-24">Cat.</th>
                            <th className="px-1.5 py-1.5 text-right text-muted-foreground font-medium w-24">Monto</th>
                          </>
                        ) : (
                          <>
                            <th className="px-1.5 py-1.5 text-left text-muted-foreground font-medium">SKU</th>
                            <th className="px-1.5 py-1.5 text-right text-muted-foreground font-medium w-16">Cant.</th>
                            <th className="px-1.5 py-1.5 text-right text-muted-foreground font-medium w-24">{txType === 'sale' ? 'Precio' : 'Costo'}</th>
                            <th className="px-1.5 py-1.5 text-right text-muted-foreground font-medium w-24">Subtotal</th>
                          </>
                        )}
                        <th className="px-1 py-1.5 w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {validRows.map((r, i) => {
                        const globalIdx = rows.indexOf(r);
                        const isEditing = editingIdx === globalIdx;
                        
                        if (isEditing) {
                          return (
                            <tr key={i} className="border-t border-primary/30 bg-primary/5">
                              <td className="px-1.5 py-1 text-muted-foreground">{i + 1}</td>
                              {txType === 'expense' || txType === 'cost' ? (
                                <>
                                  <td className="px-1 py-1"><Input value={String(editDraft._desc || '')} onChange={e => setEditDraft(d => ({ ...d, _desc: e.target.value }))} className="h-6 text-xs px-1.5" /></td>
                                  <td className="px-1 py-1">
                                    <Select value={String(editDraft._cat || 'other')} onValueChange={v => setEditDraft(d => ({ ...d, _cat: v }))}>
                                      <SelectTrigger className="h-6 text-xs px-1.5"><SelectValue /></SelectTrigger>
                                      <SelectContent>{(txType === 'expense' ? EXPENSE_CATS : COST_CATS).map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
                                    </Select>
                                  </td>
                                  <td className="px-1 py-1"><Input type="number" step="0.01" value={editDraft._amt ?? ''} onChange={e => setEditDraft(d => ({ ...d, _amt: e.target.value === '' ? '' : Number(e.target.value) }))} className="h-6 text-xs px-1.5 text-right font-mono" /></td>
                                </>
                              ) : (
                                <>
                                  <td className="px-1 py-1"><Input value={String(editDraft._sku || '')} onChange={e => setEditDraft(d => ({ ...d, _sku: e.target.value }))} className="h-6 text-xs px-1.5 font-mono" /></td>
                                  <td className="px-1 py-1"><Input type="number" value={editDraft._qty ?? ''} onChange={e => setEditDraft(d => ({ ...d, _qty: e.target.value === '' ? '' : Number(e.target.value) }))} className="h-6 text-xs px-1.5 text-right" /></td>
                                  <td className="px-1 py-1"><Input type="number" step="0.01" value={editDraft._price ?? ''} onChange={e => setEditDraft(d => ({ ...d, _price: e.target.value === '' ? '' : Number(e.target.value) }))} className="h-6 text-xs px-1.5 text-right font-mono" /></td>
                                  <td className="px-1 py-1 text-right font-mono font-medium text-muted-foreground">${((Number(editDraft._qty) || 0) * (Number(editDraft._price) || 0)).toFixed(2)}</td>
                                </>
                              )}
                              <td className="px-1 py-1">
                                <div className="flex gap-0.5">
                                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => saveEdit(globalIdx)}><Save className="w-3 h-3 text-success" /></Button>
                                  <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditingIdx(null)}><X className="w-3 h-3" /></Button>
                                </div>
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr key={i} className="border-t border-border group hover:bg-muted/30">
                            <td className="px-1.5 py-1 text-muted-foreground">{i + 1}</td>
                            {txType === 'expense' || txType === 'cost' ? (
                              <>
                                <td className="px-1.5 py-1 truncate max-w-[180px]">{String(r.raw._desc)}</td>
                                <td className="px-1.5 py-1 text-muted-foreground">{String(r.raw._cat)}</td>
                                <td className="px-1.5 py-1 text-right font-mono">{Number(r.raw._amt).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              </>
                            ) : (
                              <>
                                <td className="px-1.5 py-1 font-mono">{String(r.raw._sku)}</td>
                                <td className="px-1.5 py-1 text-right">{Number(r.raw._qty)}</td>
                                <td className="px-1.5 py-1 text-right font-mono">${Number(r.raw._price).toFixed(2)}</td>
                                <td className="px-1.5 py-1 text-right font-mono font-medium">${(Number(r.raw._qty) * Number(r.raw._price)).toFixed(2)}</td>
                              </>
                            )}
                            <td className="px-1 py-1">
                              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => startEdit(globalIdx)}><Pencil className="w-3 h-3" /></Button>
                                <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => deleteRow(globalIdx)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                </div>
              <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={addNewRow}>
                <Plus className="w-3.5 h-3.5" /> Añadir línea
              </Button>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-xs text-muted-foreground mb-2">No hay líneas cargadas</p>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={addNewRow}>
                  <Plus className="w-3.5 h-3.5" /> Añadir línea manualmente
                </Button>
              </div>
            )}
            {/* Totals summary */}
            <div className="rounded-xl bg-muted/70 border border-border p-3 space-y-1.5">
              <p className="text-xs font-semibold text-foreground mb-2">Resumen a registrar:</p>
              {txType === 'sale' && (
                <>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Subtotal:</span><span className="font-mono">${totalUsd.toFixed(2)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">ITBIS (18%):</span><span className="font-mono">${itbisUsd.toFixed(2)}</span></div>
                  <div className="border-t border-border my-1" />
                  <div className="flex justify-between text-sm font-bold"><span>Total USD:</span><span className="font-mono">${grandTotalUsd.toFixed(2)}</span></div>
                  <div className="flex justify-between text-xs text-muted-foreground"><span>Equivalente RD$:</span><span className="font-mono">RD${grandTotalDop.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></div>
                </>
              )}
              {txType === 'purchase' && (
                <>
                  <div className="flex justify-between text-sm font-bold"><span>Total compra USD:</span><span className="font-mono">${totalUsd.toFixed(2)}</span></div>
                  <div className="flex justify-between text-xs text-muted-foreground"><span>Equivalente RD$:</span><span className="font-mono">RD${totalDop.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></div>
                  <p className="text-[10px] text-muted-foreground mt-1">Se creará 1 orden de compra con {validRows.length} producto(s)</p>
                </>
              )}
              {(txType === 'expense' || txType === 'cost') && (
                <>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Líneas:</span><span className="font-medium">{validRows.length}</span></div>
                  <div className="flex justify-between text-sm font-bold"><span>Total ({txCurrency}):</span><span className="font-mono">{txCurrency === 'USD' ? '$' : 'RD$'}{totalAmtRaw.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></div>
                  <div className="flex justify-between text-xs text-muted-foreground"><span>Equivalente {txCurrency === 'USD' ? 'RD$' : 'USD'}:</span><span className="font-mono">{txCurrency === 'USD' ? `RD$${totalDop.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : `$${totalUsd.toFixed(2)}`}</span></div>
                  <p className="text-[10px] text-muted-foreground mt-1">Se registrarán {validRows.length} {txType === 'expense' ? 'gasto(s)' : 'costo(s)'} individuales</p>
                </>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={reset}>Cancelar</Button>
              <Button className="flex-1 gap-1.5" onClick={handleImport} disabled={validRows.length === 0}>
                <Check className="w-3.5 h-3.5" /> Aprobar y Registrar
              </Button>
            </div>
          </div>
          );
        })()}

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
