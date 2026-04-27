/**
 * Bulk import library: parse Excel template, validate rows against catalog,
 * and execute creation of sales/expenses/shipments/journal entries with all
 * accounting effects (CxP/CxC, inventory, WAC) — same logic as manual flows.
 *
 * Excel format is defined in /mnt/documents/plantilla_carga_masiva.xlsx
 * Sheets: TASAS_CAMBIO, VENTAS, VENTAS_ITEMS, GASTOS, COMPRAS_PO, COMPRAS_ITEMS, MOVIMIENTOS_CAJA
 */
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchAccounts, findTransitAccount, findInventoryAccount, findCxPAccount,
  findFreightAccount, findCustomsAccount, type AccountMatch,
} from '@/lib/accounting-utils';
import { computeLanded } from '@/lib/landed-cost';

// ============ Types ============
export type RowStatus = 'valid' | 'warning' | 'error';
export interface ParsedRow<T = any> {
  rowNum: number; // 1-indexed inside the sheet (header excluded)
  data: T;
  status: RowStatus;
  errors: string[];
  warnings: string[];
}
export interface SheetResult<T = any> {
  sheet: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  warningRows: number;
  rows: ParsedRow<T>[];
}
export interface ImportPreview {
  sheets: Record<string, SheetResult>;
  globalErrors: string[];
  catalogActions: {
    productsToCreate: string[]; // SKUs that don't exist
    contactsMissing: string[];  // names that don't exist (we DO NOT auto-create)
    suppliersMissing: string[];
    accountsMissing: string[];
    ratesNeeded: string[]; // dates with no rate
  };
  ready: boolean; // true if no fatal errors
}
export interface ImportLog {
  type: string;
  ok: boolean;
  ref?: string;
  id?: string;
  error?: string;
}

// ============ Helpers ============
const trim = (v: any) => (v == null ? '' : String(v).trim());
const num = (v: any): number => {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,$\s]/g, ''));
  return isFinite(n) ? n : NaN;
};
const dateStr = (v: any): string => {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  // Excel serial date (number)
  if (typeof v === 'number') {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD/MM/YYYY or MM/DD/YYYY — assume DD/MM/YYYY (DR convention)
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s;
};

// Read all sheets into raw rows as objects keyed by header (header row = row 3 in template)
export function parseWorkbook(file: ArrayBuffer): Record<string, any[]> {
  const wb = XLSX.read(file, { type: 'array', cellDates: true });
  const out: Record<string, any[]> = {};
  for (const name of wb.SheetNames) {
    if (name === 'LEEME_PRIMERO' || name === 'CATALOGO_CUENTAS') continue;
    const ws = wb.Sheets[name];
    // Header on row 3 (1-indexed). Data starts at row 5 (row 4 is the example).
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
      header: 1, range: 2, defval: '', blankrows: false,
    });
    if (rows.length < 2) { out[name] = []; continue; }
    // Strip optional " *" suffix from headers (we use that to mark required visually)
    const headers = (rows[0] as any[]).map(h => String(h || '').replace(/\s*\*\s*$/, '').trim());
    const data: any[] = [];
    for (let i = 2; i < rows.length; i++) { // skip example row at index 1
      const r = rows[i] as any[];
      if (!r || r.every(c => c === '' || c == null)) continue;
      const obj: Record<string, any> = {};
      headers.forEach((h, j) => { obj[h] = r[j]; });
      obj.__row = i + 3; // original 1-indexed Excel row
      data.push(obj);
    }
    out[name] = data;
  }
  return out;
}

// ============ Catalog cache ============
interface Catalog {
  accountsByCode: Map<string, AccountMatch>;
  accounts: AccountMatch[];
  productsBySku: Map<string, { id: string; sku: string; name: string }>;
  contactsByName: Map<string, { id: string; name: string }>;
  suppliersByName: Map<string, { id: string; name: string }>;
  ratesByDate: Map<string, number>;
}
async function loadCatalog(): Promise<Catalog> {
  const [accounts, products, contacts, suppliers, rates] = await Promise.all([
    fetchAccounts(),
    supabase.from('products').select('id, sku, name').then(r => r.data || []),
    supabase.from('contacts').select('id, contact_name, company_name').then(r => r.data || []),
    supabase.from('suppliers').select('id, name').then(r => r.data || []),
    supabase.from('exchange_rates').select('date, usd_sell').then(r => r.data || []),
  ]);
  return {
    accounts,
    accountsByCode: new Map(accounts.filter(a => a.code).map(a => [a.code as string, a])),
    productsBySku: new Map(products.map((p: any) => [trim(p.sku).toLowerCase(), { id: p.id, sku: p.sku, name: p.name }])),
    contactsByName: (() => {
      const m = new Map<string, { id: string; name: string }>();
      contacts.forEach((c: any) => {
        if (c.contact_name) m.set(trim(c.contact_name).toLowerCase(), { id: c.id, name: c.contact_name });
        if (c.company_name) m.set(trim(c.company_name).toLowerCase(), { id: c.id, name: c.company_name });
      });
      return m;
    })(),
    suppliersByName: new Map(suppliers.map((s: any) => [trim(s.name).toLowerCase(), { id: s.id, name: s.name }])),
    ratesByDate: new Map(rates.map((r: any) => [r.date, Number(r.usd_sell)])),
  };
}

// ============ Validation ============
export async function buildPreview(workbook: Record<string, any[]>): Promise<{ preview: ImportPreview; catalog: Catalog }> {
  const catalog = await loadCatalog();
  const sheets: Record<string, SheetResult> = {};
  const globalErrors: string[] = [];

  const productsToCreate = new Set<string>();
  const contactsMissing = new Set<string>();
  const suppliersMissing = new Set<string>();
  const accountsMissing = new Set<string>();
  const ratesNeeded = new Set<string>();

  // Collect dates needing rates (any sheet referencing 'date' or 'order_date')
  const collectDate = (d: string) => { if (d && !catalog.ratesByDate.has(d)) ratesNeeded.add(d); };

  // ---- TASAS_CAMBIO (process first; add to catalog so subsequent sheets see them) ----
  if (workbook.TASAS_CAMBIO?.length) {
    const rows = workbook.TASAS_CAMBIO.map((raw, i): ParsedRow => {
      const d = dateStr(raw.date);
      const sell = num(raw.usd_sell);
      const errors: string[] = [];
      if (!d) errors.push('date vacío');
      if (!sell || sell <= 0) errors.push('usd_sell inválido');
      if (!errors.length) catalog.ratesByDate.set(d, sell);
      return {
        rowNum: raw.__row, data: { date: d, usd_buy: num(raw.usd_buy) || sell, usd_sell: sell, source: trim(raw.source) || 'manual' },
        status: errors.length ? 'error' : 'valid', errors, warnings: [],
      };
    });
    sheets.TASAS_CAMBIO = summarize('TASAS_CAMBIO', rows);
  }

  // ---- VENTAS ----
  if (workbook.VENTAS?.length) {
    const rows = workbook.VENTAS.map((raw): ParsedRow => {
      const errors: string[] = [], warnings: string[] = [];
      const ref = trim(raw.invoice_ref);
      const date = dateStr(raw.date);
      const cname = trim(raw.contact_name);
      const subtotal = num(raw.subtotal_usd);
      const total = num(raw.total_usd);
      if (!ref) errors.push('invoice_ref vacío');
      if (!date) errors.push('date inválido');
      if (!cname) errors.push('contact_name vacío');
      if (!subtotal || subtotal <= 0) errors.push('subtotal_usd inválido');
      if (!total || total <= 0) errors.push('total_usd inválido');
      if (cname && !catalog.contactsByName.has(cname.toLowerCase())) {
        errors.push(`contacto "${cname}" no existe (créalo primero)`);
        contactsMissing.add(cname);
      }
      collectDate(date);
      const payStatus = trim(raw.payment_status) || 'pending';
      const payAcctCode = trim(raw.payment_account_code);
      if (payStatus === 'paid' && !payAcctCode) warnings.push('payment_status=paid pero sin payment_account_code → quedará en CxC');
      if (payAcctCode && !catalog.accountsByCode.has(payAcctCode)) {
        errors.push(`cuenta de cobro "${payAcctCode}" no existe`); accountsMissing.add(payAcctCode);
      }
      return {
        rowNum: raw.__row,
        data: {
          invoice_ref: ref, date, contact_name: cname, subtotal_usd: subtotal,
          itbis_usd: num(raw.itbis_usd), total_usd: total,
          payment_status: payStatus, payment_date: dateStr(raw.payment_date) || null,
          payment_account_code: payAcctCode || null, notes: trim(raw.notes) || null,
        },
        status: errors.length ? 'error' : warnings.length ? 'warning' : 'valid', errors, warnings,
      };
    });
    sheets.VENTAS = summarize('VENTAS', rows);
  }

  // ---- VENTAS_ITEMS ----
  if (workbook.VENTAS_ITEMS?.length) {
    const validInvoiceRefs = new Set((sheets.VENTAS?.rows.filter(r => r.status !== 'error').map(r => r.data.invoice_ref) || []));
    const rows = workbook.VENTAS_ITEMS.map((raw): ParsedRow => {
      const errors: string[] = [];
      const ref = trim(raw.invoice_ref);
      const sku = trim(raw.sku);
      const qty = num(raw.quantity);
      const price = num(raw.unit_price_usd);
      if (!ref) errors.push('invoice_ref vacío');
      else if (sheets.VENTAS && !validInvoiceRefs.has(ref)) errors.push(`invoice_ref "${ref}" no encontrada en VENTAS`);
      if (!sku) errors.push('sku vacío');
      if (!qty || qty <= 0) errors.push('quantity inválida');
      if (!price || price < 0) errors.push('unit_price_usd inválido');
      const skuKey = sku.toLowerCase();
      if (sku && !catalog.productsBySku.has(skuKey)) productsToCreate.add(sku); // auto-create
      return {
        rowNum: raw.__row,
        data: { invoice_ref: ref, sku, quantity: qty, unit_price_usd: price, discount_pct: num(raw.discount_pct) || 0, line_total_usd: num(raw.line_total_usd) || qty * price },
        status: errors.length ? 'error' : 'valid', errors, warnings: [],
      };
    });
    sheets.VENTAS_ITEMS = summarize('VENTAS_ITEMS', rows);
  }

  // ---- GASTOS ----
  if (workbook.GASTOS?.length) {
    const rows = workbook.GASTOS.map((raw): ParsedRow => {
      const errors: string[] = [], warnings: string[] = [];
      const date = dateStr(raw.date);
      const desc = trim(raw.description);
      const cat = trim(raw.category);
      const amt = num(raw.amount_usd);
      const expCode = trim(raw.expense_account_code);
      const payCode = trim(raw.payment_account_code);
      if (!date) errors.push('date inválido');
      if (!desc) errors.push('description vacía');
      if (!cat) errors.push('category vacía');
      if (!amt || amt <= 0) errors.push('amount_usd inválido');
      if (!expCode) errors.push('expense_account_code vacío');
      else if (!catalog.accountsByCode.has(expCode)) { errors.push(`cuenta gasto "${expCode}" no existe`); accountsMissing.add(expCode); }
      if (payCode && !catalog.accountsByCode.has(payCode)) { errors.push(`cuenta pago "${payCode}" no existe`); accountsMissing.add(payCode); }
      if (!payCode) warnings.push('sin payment_account_code → queda en CxP');
      collectDate(date);
      return {
        rowNum: raw.__row,
        data: {
          date, description: desc, category: cat, subcategory: trim(raw.subcategory) || null,
          vendor: trim(raw.vendor) || null, amount_usd: amt, itbis_usd: num(raw.itbis_usd),
          expense_account_code: expCode, payment_account_code: payCode || null, notes: trim(raw.notes) || null,
        },
        status: errors.length ? 'error' : warnings.length ? 'warning' : 'valid', errors, warnings,
      };
    });
    sheets.GASTOS = summarize('GASTOS', rows);
  }

  // ---- COMPRAS_PO ----
  if (workbook.COMPRAS_PO?.length) {
    const rows = workbook.COMPRAS_PO.map((raw): ParsedRow => {
      const errors: string[] = [], warnings: string[] = [];
      const po = trim(raw.po_number);
      const date = dateStr(raw.order_date);
      const supp = trim(raw.supplier_name);
      const status = trim(raw.status);
      const payCode = trim(raw.payment_account_code);
      if (!po) errors.push('po_number vacío');
      if (!date) errors.push('order_date inválido');
      if (!supp) errors.push('supplier_name vacío');
      else if (!catalog.suppliersByName.has(supp.toLowerCase())) {
        errors.push(`proveedor "${supp}" no existe (créalo primero)`); suppliersMissing.add(supp);
      }
      if (!['ordered','in_transit','customs','warehouse','received'].includes(status)) errors.push('status inválido');
      if (payCode && !catalog.accountsByCode.has(payCode)) { errors.push(`cuenta pago "${payCode}" no existe`); accountsMissing.add(payCode); }
      collectDate(date);
      return {
        rowNum: raw.__row,
        data: {
          po_number: po, order_date: date, supplier_name: supp, status,
          estimated_arrival: dateStr(raw.estimated_arrival) || null, actual_arrival: dateStr(raw.actual_arrival) || null,
          shipping_cost_usd: num(raw.shipping_cost_usd), customs_cost_usd: num(raw.customs_cost_usd), other_cost_usd: num(raw.other_cost_usd),
          payment_status: trim(raw.payment_status) || 'pending', amount_paid_usd: num(raw.amount_paid_usd),
          payment_date: dateStr(raw.payment_date) || null, payment_account_code: payCode || null, notes: trim(raw.notes) || null,
        },
        status: errors.length ? 'error' : warnings.length ? 'warning' : 'valid', errors, warnings,
      };
    });
    sheets.COMPRAS_PO = summarize('COMPRAS_PO', rows);
  }

  // ---- COMPRAS_ITEMS ----
  if (workbook.COMPRAS_ITEMS?.length) {
    const validPos = new Set((sheets.COMPRAS_PO?.rows.filter(r => r.status !== 'error').map(r => r.data.po_number) || []));
    const rows = workbook.COMPRAS_ITEMS.map((raw): ParsedRow => {
      const errors: string[] = [];
      const po = trim(raw.po_number);
      const sku = trim(raw.sku);
      const qty = num(raw.quantity_ordered);
      const cost = num(raw.unit_cost_fob_usd);
      if (!po) errors.push('po_number vacío');
      else if (sheets.COMPRAS_PO && !validPos.has(po)) errors.push(`po_number "${po}" no encontrado en COMPRAS_PO`);
      if (!sku) errors.push('sku vacío');
      if (!qty || qty <= 0) errors.push('quantity_ordered inválida');
      if (!cost || cost <= 0) errors.push('unit_cost_fob_usd inválido');
      if (sku && !catalog.productsBySku.has(sku.toLowerCase())) productsToCreate.add(sku);
      return {
        rowNum: raw.__row,
        data: { po_number: po, sku, quantity_ordered: qty, quantity_received: num(raw.quantity_received) || 0, unit_cost_fob_usd: cost },
        status: errors.length ? 'error' : 'valid', errors, warnings: [],
      };
    });
    sheets.COMPRAS_ITEMS = summarize('COMPRAS_ITEMS', rows);
  }

  // ---- MOVIMIENTOS_CAJA ----
  if (workbook.MOVIMIENTOS_CAJA?.length) {
    const rows = workbook.MOVIMIENTOS_CAJA.map((raw): ParsedRow => {
      const errors: string[] = [];
      const date = dateStr(raw.date);
      const desc = trim(raw.description);
      const from = trim(raw.from_account_code);
      const to = trim(raw.to_account_code);
      const amt = num(raw.amount_usd);
      if (!date) errors.push('date inválido');
      if (!desc) errors.push('description vacía');
      if (!from) errors.push('from_account_code vacío');
      else if (!catalog.accountsByCode.has(from)) { errors.push(`cuenta origen "${from}" no existe`); accountsMissing.add(from); }
      if (!to) errors.push('to_account_code vacío');
      else if (!catalog.accountsByCode.has(to)) { errors.push(`cuenta destino "${to}" no existe`); accountsMissing.add(to); }
      if (!amt || amt <= 0) errors.push('amount_usd inválido');
      collectDate(date);
      return {
        rowNum: raw.__row,
        data: { date, description: desc, from_account_code: from, to_account_code: to, amount_usd: amt, notes: trim(raw.notes) || null },
        status: errors.length ? 'error' : 'valid', errors, warnings: [],
      };
    });
    sheets.MOVIMIENTOS_CAJA = summarize('MOVIMIENTOS_CAJA', rows);
  }

  // Determine readiness
  const totalErrors = Object.values(sheets).reduce((s, x) => s + x.errorRows, 0);
  const fatalCatalogErrors = contactsMissing.size + suppliersMissing.size + accountsMissing.size;
  const ready = totalErrors === 0 && fatalCatalogErrors === 0 && Object.keys(sheets).length > 0;

  if (Object.keys(sheets).length === 0) globalErrors.push('La plantilla no contiene ninguna hoja válida con datos.');

  return {
    preview: {
      sheets, globalErrors,
      catalogActions: {
        productsToCreate: [...productsToCreate].sort(),
        contactsMissing: [...contactsMissing].sort(),
        suppliersMissing: [...suppliersMissing].sort(),
        accountsMissing: [...accountsMissing].sort(),
        ratesNeeded: [...ratesNeeded].sort(),
      },
      ready,
    },
    catalog,
  };
}

function summarize(name: string, rows: ParsedRow[]): SheetResult {
  return {
    sheet: name, totalRows: rows.length,
    validRows: rows.filter(r => r.status === 'valid').length,
    warningRows: rows.filter(r => r.status === 'warning').length,
    errorRows: rows.filter(r => r.status === 'error').length,
    rows,
  };
}

// ============ Execution ============
export async function executeImport(preview: ImportPreview, catalog: Catalog): Promise<ImportLog[]> {
  const log: ImportLog[] = [];
  const { sheets } = preview;

  // 1. Tasas de cambio (insert into exchange_rates)
  if (sheets.TASAS_CAMBIO) {
    for (const r of sheets.TASAS_CAMBIO.rows.filter(r => r.status !== 'error')) {
      const { error } = await supabase.from('exchange_rates').upsert({
        date: r.data.date, usd_buy: r.data.usd_buy, usd_sell: r.data.usd_sell, source: r.data.source,
      } as any, { onConflict: 'date' } as any);
      log.push({ type: 'tasa', ref: r.data.date, ok: !error, error: error?.message });
      if (!error) catalog.ratesByDate.set(r.data.date, r.data.usd_sell);
    }
  }

  // 2. Auto-create missing products (cost 0, name = sku)
  for (const sku of preview.catalogActions.productsToCreate) {
    const { data, error } = await supabase.from('products').insert({
      sku, name: sku, unit_cost_usd: 0, is_active: true,
    } as any).select('id, sku, name').single();
    log.push({ type: 'producto', ref: sku, ok: !error, error: error?.message, id: data?.id });
    if (data) catalog.productsBySku.set(sku.toLowerCase(), { id: data.id, sku: data.sku, name: data.name });
  }

  // 3. Compras PO (need to create shipments first, then items; then proration; then receive logic for received status)
  if (sheets.COMPRAS_PO && sheets.COMPRAS_ITEMS) {
    const itemsByPo = new Map<string, ParsedRow[]>();
    for (const it of sheets.COMPRAS_ITEMS.rows.filter(r => r.status !== 'error')) {
      const arr = itemsByPo.get(it.data.po_number) || [];
      arr.push(it); itemsByPo.set(it.data.po_number, arr);
    }
    for (const r of sheets.COMPRAS_PO.rows.filter(r => r.status !== 'error')) {
      try {
        await importOnePO(r.data, itemsByPo.get(r.data.po_number) || [], catalog, log);
      } catch (e: any) {
        log.push({ type: 'compra', ref: r.data.po_number, ok: false, error: e.message });
      }
    }
  }

  // 4. Ventas
  if (sheets.VENTAS) {
    const itemsByRef = new Map<string, ParsedRow[]>();
    for (const it of sheets.VENTAS_ITEMS?.rows.filter(r => r.status !== 'error') || []) {
      const arr = itemsByRef.get(it.data.invoice_ref) || [];
      arr.push(it); itemsByRef.set(it.data.invoice_ref, arr);
    }
    for (const r of sheets.VENTAS.rows.filter(r => r.status !== 'error')) {
      try { await importOneSale(r.data, itemsByRef.get(r.data.invoice_ref) || [], catalog, log); }
      catch (e: any) { log.push({ type: 'venta', ref: r.data.invoice_ref, ok: false, error: e.message }); }
    }
  }

  // 5. Gastos
  if (sheets.GASTOS) {
    for (const r of sheets.GASTOS.rows.filter(r => r.status !== 'error')) {
      try { await importOneExpense(r.data, catalog, log); }
      catch (e: any) { log.push({ type: 'gasto', ref: r.data.description, ok: false, error: e.message }); }
    }
  }

  // 6. Movimientos caja
  if (sheets.MOVIMIENTOS_CAJA) {
    for (const r of sheets.MOVIMIENTOS_CAJA.rows.filter(r => r.status !== 'error')) {
      try { await importOneCashMove(r.data, catalog, log); }
      catch (e: any) { log.push({ type: 'movimiento', ref: r.data.description, ok: false, error: e.message }); }
    }
  }

  return log;
}

// ============ Per-row creators (replicate manual flows + accounting) ============
async function importOnePO(po: any, items: ParsedRow[], catalog: Catalog, log: ImportLog[]) {
  const supplier = catalog.suppliersByName.get(po.supplier_name.toLowerCase());
  const itemsTotal = items.reduce((s, it) => s + it.data.quantity_ordered * it.data.unit_cost_fob_usd, 0);
  const totalCost = itemsTotal + po.shipping_cost_usd + po.customs_cost_usd + po.other_cost_usd;

  // Insert shipment
  const { data: ship, error: sErr } = await supabase.from('shipments').insert({
    po_number: po.po_number, order_date: po.order_date, supplier_name: po.supplier_name, supplier_id: supplier?.id,
    status: po.status, estimated_arrival: po.estimated_arrival, actual_arrival: po.actual_arrival,
    shipping_cost_usd: po.shipping_cost_usd, customs_cost_usd: po.customs_cost_usd, other_cost_usd: po.other_cost_usd,
    total_cost_usd: totalCost,
    payment_status: po.payment_status, amount_paid_usd: po.amount_paid_usd, payment_date: po.payment_date,
    payment_account_id: po.payment_account_code ? catalog.accountsByCode.get(po.payment_account_code)?.id : null,
    notes: po.notes,
  } as any).select().single();
  if (sErr || !ship) throw new Error(`shipment: ${sErr?.message}`);

  // Compute landed cost (proration of freight + customs + other onto items by FOB)
  const itemInputs = items.map(it => {
    const product = catalog.productsBySku.get(it.data.sku.toLowerCase());
    return {
      id: it.data.sku, product_id: product?.id, quantity: it.data.quantity_ordered,
      unit_cost_usd: it.data.unit_cost_fob_usd,
      weight_kg_per_unit: 0, cbm_per_unit: 0,
    };
  });
  const calc = computeLanded(
    { shipping_cost_usd: po.shipping_cost_usd, customs_cost_usd: po.customs_cost_usd, other_cost_usd: po.other_cost_usd },
    itemInputs,
    { freight: po.shipping_cost_usd, customs: po.customs_cost_usd, other: po.other_cost_usd },
    'fob',
  );

  // Insert shipment_items with landed cost
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const product = catalog.productsBySku.get(it.data.sku.toLowerCase());
    if (!product) { log.push({ type: 'compra_item', ref: `${po.po_number}/${it.data.sku}`, ok: false, error: 'producto no creado' }); continue; }
    await supabase.from('shipment_items').insert({
      shipment_id: ship.id, product_id: product.id,
      quantity_ordered: it.data.quantity_ordered, quantity_received: it.data.quantity_received,
      unit_cost_usd: calc.items[i]?.landed_unit_cost_usd ?? it.data.unit_cost_fob_usd,
    } as any);
  }

  // Journal entries: Compra (Compras en Tránsito DR / CxP CR), Flete, Aduanas
  const transit = findTransitAccount(catalog.accounts);
  const cxp = findCxPAccount(catalog.accounts);
  const freight = findFreightAccount(catalog.accounts);
  const customs = findCustomsAccount(catalog.accounts);
  const inv = findInventoryAccount(catalog.accounts);

  const tag = po.po_number;
  if (transit && cxp && itemsTotal > 0) {
    const { data: je } = await supabase.from('journal_entries').insert({
      date: po.order_date, description: `Compra — PO ${tag} — ${po.supplier_name}`,
      total_debit_usd: itemsTotal, total_credit_usd: itemsTotal,
      reference_id: ship.id, reference_type: 'shipment',
      notes: 'Generado por importación masiva.',
    } as any).select().single();
    if (je) await supabase.from('journal_entry_lines').insert([
      { journal_entry_id: je.id, account_id: transit.id, debit_usd: itemsTotal, credit_usd: 0, description: 'Compras en tránsito' },
      { journal_entry_id: je.id, account_id: cxp.id, debit_usd: 0, credit_usd: itemsTotal, description: 'CxP proveedor' },
    ] as any);
  }
  if (freight && cxp && po.shipping_cost_usd > 0 && transit) {
    const { data: je } = await supabase.from('journal_entries').insert({
      date: po.order_date, description: `Freight — PO ${tag} — ${po.supplier_name}`,
      total_debit_usd: po.shipping_cost_usd, total_credit_usd: po.shipping_cost_usd,
      reference_id: ship.id, reference_type: 'shipment', notes: 'Flete capitalizado en tránsito.',
    } as any).select().single();
    if (je) await supabase.from('journal_entry_lines').insert([
      { journal_entry_id: je.id, account_id: transit.id, debit_usd: po.shipping_cost_usd, credit_usd: 0, description: 'Compras en tránsito (flete)' },
      { journal_entry_id: je.id, account_id: cxp.id, debit_usd: 0, credit_usd: po.shipping_cost_usd, description: 'CxP flete' },
    ] as any);
  }
  if (customs && cxp && po.customs_cost_usd > 0 && transit) {
    const { data: je } = await supabase.from('journal_entries').insert({
      date: po.order_date, description: `Gastos aduanales — PO ${tag} — ${po.supplier_name}`,
      total_debit_usd: po.customs_cost_usd, total_credit_usd: po.customs_cost_usd,
      reference_id: ship.id, reference_type: 'shipment', notes: 'Aduanas capitalizadas en tránsito.',
    } as any).select().single();
    if (je) await supabase.from('journal_entry_lines').insert([
      { journal_entry_id: je.id, account_id: transit.id, debit_usd: po.customs_cost_usd, credit_usd: 0, description: 'Compras en tránsito (aduanas)' },
      { journal_entry_id: je.id, account_id: cxp.id, debit_usd: 0, credit_usd: po.customs_cost_usd, description: 'CxP aduanas' },
    ] as any);
  }

  // If status=received, do receipt: update inventory, WAC, close transit
  if (po.status === 'received' && inv && transit) {
    const totalLanded = calc.items.reduce((s, it) => s + it.landed_unit_cost_usd * it.quantity, 0);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const product = catalog.productsBySku.get(it.data.sku.toLowerCase());
      if (!product) continue;
      const qty = it.data.quantity_ordered;
      const newCost = calc.items[i]?.landed_unit_cost_usd ?? it.data.unit_cost_fob_usd;
      const { data: invRow } = await supabase.from('inventory').select('id, quantity_on_hand').eq('product_id', product.id).maybeSingle();
      const existingQty = invRow?.quantity_on_hand || 0;
      const { data: prod } = await supabase.from('products').select('unit_cost_usd').eq('id', product.id).single();
      const currentCost = Number(prod?.unit_cost_usd || 0);
      const totalQty = existingQty + qty;
      const wac = totalQty > 0 ? ((existingQty * currentCost) + (qty * newCost)) / totalQty : newCost;
      await supabase.from('products').update({ unit_cost_usd: Number(wac.toFixed(4)), total_unit_cost_usd: Number(wac.toFixed(4)) } as any).eq('id', product.id);
      if (invRow) await supabase.from('inventory').update({ quantity_on_hand: existingQty + qty } as any).eq('id', invRow.id);
      else await supabase.from('inventory').insert({ product_id: product.id, quantity_on_hand: qty } as any);
      await supabase.from('inventory_movements').insert({
        product_id: product.id, quantity: qty, movement_type: 'receipt' as any,
        unit_cost_usd: newCost, reference_id: ship.id, reference_type: 'shipment',
        notes: `Recepción importación PO ${tag}`,
      } as any);
      await supabase.from('shipment_items').update({ quantity_received: qty } as any).eq('shipment_id', ship.id).eq('product_id', product.id);
    }
    if (totalLanded > 0) {
      const { data: je } = await supabase.from('journal_entries').insert({
        date: po.actual_arrival || po.order_date, description: `Recepción inventario — PO ${tag} — ${po.supplier_name}`,
        total_debit_usd: totalLanded, total_credit_usd: totalLanded,
        reference_id: ship.id, reference_type: 'shipment', notes: 'Cierre compras en tránsito por importación masiva.',
      } as any).select().single();
      if (je) await supabase.from('journal_entry_lines').insert([
        { journal_entry_id: je.id, account_id: inv.id, debit_usd: totalLanded, credit_usd: 0, description: 'Inventario recibido' },
        { journal_entry_id: je.id, account_id: transit.id, debit_usd: 0, credit_usd: totalLanded, description: 'Cierre compras en tránsito' },
      ] as any);
    }
  }

  // Payment if paid
  if ((po.payment_status === 'paid' || po.payment_status === 'partial') && po.amount_paid_usd > 0 && po.payment_account_code) {
    const payAcct = catalog.accountsByCode.get(po.payment_account_code);
    if (payAcct && cxp) {
      const { data: je } = await supabase.from('journal_entries').insert({
        date: po.payment_date || po.order_date, description: `Pago PO ${tag} — ${po.supplier_name}`,
        total_debit_usd: po.amount_paid_usd, total_credit_usd: po.amount_paid_usd,
        reference_id: ship.id, reference_type: 'shipment_payment',
      } as any).select().single();
      if (je) await supabase.from('journal_entry_lines').insert([
        { journal_entry_id: je.id, account_id: cxp.id, debit_usd: po.amount_paid_usd, credit_usd: 0, description: 'Cancelación CxP' },
        { journal_entry_id: je.id, account_id: payAcct.id, debit_usd: 0, credit_usd: po.amount_paid_usd, description: 'Salida de banco/caja' },
      ] as any);
      await supabase.from('shipment_payments').insert({
        shipment_id: ship.id, payment_date: po.payment_date || po.order_date,
        account_id: payAcct.id, amount_usd: po.amount_paid_usd,
      } as any);
    }
  }

  log.push({ type: 'compra', ref: po.po_number, ok: true, id: ship.id });
}

async function importOneSale(s: any, items: ParsedRow[], catalog: Catalog, log: ImportLog[]) {
  const contact = catalog.contactsByName.get(s.contact_name.toLowerCase());
  if (!contact) throw new Error(`contacto no encontrado: ${s.contact_name}`);
  const rate = catalog.ratesByDate.get(s.date);
  const total_dop = rate ? s.total_usd * rate : 0;
  const payAcct = s.payment_account_code ? catalog.accountsByCode.get(s.payment_account_code) : null;

  const { data: sale, error } = await supabase.from('sales').insert({
    invoice_ref: s.invoice_ref, date: s.date, contact_id: contact.id,
    subtotal_usd: s.subtotal_usd, itbis_usd: s.itbis_usd, total_usd: s.total_usd,
    total_dop, exchange_rate: rate || null,
    payment_status: s.payment_status, payment_date: s.payment_date,
    account_id: payAcct?.id || null, notes: s.notes,
  } as any).select().single();
  if (error || !sale) throw new Error(`sale: ${error?.message}`);

  // Items + COGS calc
  let cogsTotal = 0;
  for (const it of items) {
    const p = catalog.productsBySku.get(it.data.sku.toLowerCase());
    if (!p) continue;
    const { data: prod } = await supabase.from('products').select('unit_cost_usd').eq('id', p.id).single();
    const cost = Number(prod?.unit_cost_usd || 0);
    cogsTotal += cost * it.data.quantity;
    await supabase.from('sale_items').insert({
      sale_id: sale.id, product_id: p.id, quantity: it.data.quantity,
      gross_unit_price_usd: it.data.unit_price_usd, unit_price_usd: it.data.unit_price_usd,
      discount_pct: it.data.discount_pct, discount_amount_usd: 0, discount_type: 'pct',
      line_total_usd: it.data.line_total_usd, unit_cost_usd: cost,
      margin_pct: it.data.unit_price_usd > 0 ? ((it.data.unit_price_usd - cost) / it.data.unit_price_usd) * 100 : 0,
    } as any);
    // Trigger handle_sale_item_inventory will deduct inventory & create movement
  }

  // Journal entry: revenue + ITBIS + COGS
  const accCxC = catalog.accountsByCode.get('12100') || catalog.accountsByCode.get('12000');
  const accRev = catalog.accountsByCode.get('40100') || catalog.accountsByCode.get('40000');
  const accItbis = s.itbis_usd > 0 ? catalog.accountsByCode.get('24100') : null;
  const accCogs = catalog.accountsByCode.get('50000');
  const accInv = findInventoryAccount(catalog.accounts);
  const debitAcct = payAcct || accCxC;
  if (debitAcct && accRev) {
    const lines: any[] = [
      { account_id: debitAcct.id, debit_usd: s.total_usd, credit_usd: 0, description: payAcct ? 'Cobro venta' : 'CxC venta' },
      { account_id: accRev.id, debit_usd: 0, credit_usd: s.subtotal_usd, description: 'Ingreso por ventas' },
    ];
    if (s.itbis_usd > 0 && accItbis) lines.push({ account_id: accItbis.id, debit_usd: 0, credit_usd: s.itbis_usd, description: 'ITBIS por pagar' });
    const { data: je } = await supabase.from('journal_entries').insert({
      date: s.date, description: `Venta ${s.invoice_ref} — ${contact.name}`,
      total_debit_usd: s.total_usd, total_credit_usd: s.total_usd,
      exchange_rate: rate || null, reference_id: sale.id, reference_type: 'sale',
    } as any).select().single();
    if (je) await supabase.from('journal_entry_lines').insert(lines.map(l => ({ ...l, journal_entry_id: je.id })));
  }
  if (cogsTotal > 0 && accCogs && accInv) {
    const { data: je } = await supabase.from('journal_entries').insert({
      date: s.date, description: `COGS ${s.invoice_ref}`,
      total_debit_usd: cogsTotal, total_credit_usd: cogsTotal,
      reference_id: sale.id, reference_type: 'sale_cogs',
    } as any).select().single();
    if (je) await supabase.from('journal_entry_lines').insert([
      { journal_entry_id: je.id, account_id: accCogs.id, debit_usd: cogsTotal, credit_usd: 0, description: 'Costo de venta' },
      { journal_entry_id: je.id, account_id: accInv.id, debit_usd: 0, credit_usd: cogsTotal, description: 'Salida de inventario' },
    ] as any);
  }
  log.push({ type: 'venta', ref: s.invoice_ref, ok: true, id: sale.id });
}

async function importOneExpense(e: any, catalog: Catalog, log: ImportLog[]) {
  const rate = catalog.ratesByDate.get(e.date);
  const amount_dop = rate ? e.amount_usd * rate : 0;
  const expAcct = catalog.accountsByCode.get(e.expense_account_code)!;
  const payAcct = e.payment_account_code ? catalog.accountsByCode.get(e.payment_account_code) : null;
  const cxp = findCxPAccount(catalog.accounts);
  const accItbis = e.itbis_usd > 0 ? catalog.accountsByCode.get('24100') : null;

  const { data: exp, error } = await supabase.from('expenses').insert({
    date: e.date, description: e.description, category: e.category as any, subcategory: e.subcategory,
    vendor: e.vendor, amount_usd: e.amount_usd, amount_dop, exchange_rate: rate || null,
    account_id: expAcct.id,
  } as any).select().single();
  if (error || !exp) throw new Error(`expense: ${error?.message}`);

  const credAcct = payAcct || cxp;
  if (credAcct) {
    const totalDebit = e.amount_usd + e.itbis_usd;
    const lines: any[] = [
      { account_id: expAcct.id, debit_usd: e.amount_usd, credit_usd: 0, description: e.description },
    ];
    if (e.itbis_usd > 0 && accItbis) lines.push({ account_id: accItbis.id, debit_usd: e.itbis_usd, credit_usd: 0, description: 'ITBIS adelantado' });
    lines.push({ account_id: credAcct.id, debit_usd: 0, credit_usd: totalDebit, description: payAcct ? 'Pago' : 'CxP gasto' });
    const { data: je } = await supabase.from('journal_entries').insert({
      date: e.date, description: `Gasto: ${e.description}`,
      total_debit_usd: totalDebit, total_credit_usd: totalDebit,
      reference_id: exp.id, reference_type: 'expense', exchange_rate: rate || null,
    } as any).select().single();
    if (je) await supabase.from('journal_entry_lines').insert(lines.map(l => ({ ...l, journal_entry_id: je.id })));
  }
  log.push({ type: 'gasto', ref: e.description, ok: true, id: exp.id });
}

async function importOneCashMove(m: any, catalog: Catalog, log: ImportLog[]) {
  const from = catalog.accountsByCode.get(m.from_account_code)!;
  const to = catalog.accountsByCode.get(m.to_account_code)!;
  const rate = catalog.ratesByDate.get(m.date);
  const { data: je, error } = await supabase.from('journal_entries').insert({
    date: m.date, description: m.description,
    total_debit_usd: m.amount_usd, total_credit_usd: m.amount_usd,
    exchange_rate: rate || null, notes: m.notes, reference_type: 'cash_move',
  } as any).select().single();
  if (error || !je) throw new Error(`cash move: ${error?.message}`);
  await supabase.from('journal_entry_lines').insert([
    { journal_entry_id: je.id, account_id: to.id, debit_usd: m.amount_usd, credit_usd: 0, description: `→ ${to.description}` },
    { journal_entry_id: je.id, account_id: from.id, debit_usd: 0, credit_usd: m.amount_usd, description: `← ${from.description}` },
  ] as any);
  log.push({ type: 'movimiento', ref: m.description, ok: true, id: je.id });
}
