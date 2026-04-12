import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { streamFinancialAI } from '@/lib/financial-ai';
import { formatUSD, formatDOP } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Bot, Send, Check, Pencil, X, Sparkles, Loader2, FileText, CalendarIcon, Plus, Trash2, BookOpen } from 'lucide-react';
import { format } from 'date-fns';
import { AccountingPreview } from './AccountingPreview';

const EXAMPLES = [
  'Pagué flete DHL $350 USD',
  'Vendí 20 cajas Ram Board a Pedralbes',
  'Compré materiales por RD$15,000',
  'Nómina almacén RD$45,000',
  'Aduanas contenedor $1,200 USD',
];

const TYPE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  sale: { label: 'Venta', icon: '💰', color: 'bg-success/15 text-success border-success/30' },
  expense: { label: 'Gasto', icon: '💸', color: 'bg-warning/15 text-warning border-warning/30' },
  cost: { label: 'Costo', icon: '🏗️', color: 'bg-primary/15 text-primary border-primary/30' },
  purchase: { label: 'Compra', icon: '📦', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  credit_note: { label: 'Nota Crédito', icon: '📝', color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  journal: { label: 'Asiento', icon: '📖', color: 'bg-purple-500/15 text-purple-400 border-purple-500/30' },
};

const EXPENSE_CATEGORIES: Record<string, string> = {
  purchases: '🛒 Compras', warehouse: '🏭 Almacén', payroll: '👥 Nómina', rent: '🏠 Alquiler',
  utilities: '💡 Servicios', insurance: '🛡️ Seguros', maintenance: '🔧 Mantenimiento',
  software: '💻 Software', accounting: '📊 Contabilidad', marketing: '📣 Marketing',
  shipping: '🚚 Envíos', customs: '🛃 Aduanas', travel: '✈️ Viajes', samples: '🧱 Muestras',
  office: '🏢 Oficina', bank_fees: '🏦 Comisiones', other: '📎 Otro',
};

const COST_CATEGORIES: Record<string, string> = {
  freight: '🚢 Flete', customs: '🛃 Aduanas', raw_materials: '🧱 Materiales',
  packaging: '📦 Empaque', labor: '👷 Mano de Obra', logistics: '🚚 Logística',
  warehousing: '🏭 Almacenaje', insurance: '🛡️ Seguro', other: '📎 Otro',
};

const PAYMENT_STATUSES: Record<string, string> = {
  pending: '⏳ Pendiente', paid: '✅ Pagado', partial: '🔄 Parcial', overdue: '⚠️ Vencido',
};

interface SessionEntry {
  type: string;
  description: string;
  amount: string;
  timestamp: Date;
}

type Mode = 'ai' | 'manual';
type TxType = 'expense' | 'cost' | 'sale' | 'journal' | 'purchase' | 'credit_note';

interface SaleItem {
  product_id: string;
  quantity: number;
  unit_price_usd: number;
}

interface PurchaseItem {
  product_id: string;
  quantity: number;
  unit_cost_usd: number;
}

interface JournalLine {
  account_id: string;
  debit: number;
  credit: number;
  description: string;
}

export function CrearTransaccionTab({ rate, onEditSale, onEditExpense, onEditCost }: {
  rate: any;
  onEditSale?: (data: any) => void;
  onEditExpense?: (data: any) => void;
  onEditCost?: (data: any) => void;
}) {
  const queryClient = useQueryClient();
  const xr = Number(rate?.usd_sell) || 60.76;
  const [mode, setMode] = useState<Mode>('manual');

  // Shared data queries
  const { data: accounts = [] } = useQuery({
    queryKey: ['chart-of-accounts'],
    queryFn: async () => {
      const { data } = await supabase.from('chart_of_accounts').select('id, code, description, parent_id, account_type').eq('is_active', true).order('code');
      return data || [];
    },
  });
  const leafAccounts = accounts.filter(a => !accounts.some(b => b.parent_id === a.id));

  const { data: contacts = [] } = useQuery({
    queryKey: ['sale-contacts'],
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('id, contact_name, company_name, price_tier');
      return data || [];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('*').eq('is_active', true).order('name');
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

  // AI state
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [history, setHistory] = useState<SessionEntry[]>([]);

  // Manual form state
  const [manualType, setManualType] = useState<TxType>('journal');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [vendor, setVendor] = useState('');
  const [amountUsd, setAmountUsd] = useState('');
  const [amountDop, setAmountDop] = useState('');
  const [manualDate, setManualDate] = useState<Date | undefined>();
  const [accountId, setAccountId] = useState('');
  const [manualSaving, setManualSaving] = useState(false);

  // Sale-specific manual state
  const [contactId, setContactId] = useState('');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [priceTier, setPriceTier] = useState('list');
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [saleItems, setSaleItems] = useState<SaleItem[]>([{ product_id: '', quantity: 1, unit_price_usd: 0 }]);

  // Purchase-specific state
  const [purchaseSupplierId, setPurchaseSupplierId] = useState('');
  const [purchaseSupplierName, setPurchaseSupplierName] = useState('');
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([{ product_id: '', quantity: 1, unit_cost_usd: 0 }]);
  const [purchaseNotes, setPurchaseNotes] = useState('');

  // Credit note state
  const [cnSupplierId, setCnSupplierId] = useState('');
  const [cnSupplierName, setCnSupplierName] = useState('');
  const [cnAmountUsd, setCnAmountUsd] = useState('');
  const [cnReason, setCnReason] = useState('');
  const [cnNotes, setCnNotes] = useState('');

  // Journal entry state
  const [journalLines, setJournalLines] = useState<JournalLine[]>([
    { account_id: '', debit: 0, credit: 0, description: '' },
    { account_id: '', debit: 0, credit: 0, description: '' },
  ]);
  const [journalDescription, setJournalDescription] = useState('');
  const [journalNotes, setJournalNotes] = useState('');

  const addJournalLine = () => setJournalLines(prev => [...prev, { account_id: '', debit: 0, credit: 0, description: '' }]);
  const removeJournalLine = (i: number) => setJournalLines(prev => prev.filter((_, idx) => idx !== i));
  const updateJournalLine = (i: number, field: string, value: any) => {
    setJournalLines(prev => prev.map((line, idx) => idx === i ? { ...line, [field]: value } : line));
  };

  const journalTotalDebit = journalLines.reduce((s, l) => s + (l.debit || 0), 0);
  const journalTotalCredit = journalLines.reduce((s, l) => s + (l.credit || 0), 0);
  const journalIsBalanced = Math.abs(journalTotalDebit - journalTotalCredit) < 0.01;

  // Purchase computed
  const purchaseTotal = purchaseItems.reduce((s, i) => s + i.unit_cost_usd * i.quantity, 0);

  const addPurchaseItem = () => setPurchaseItems(prev => [...prev, { product_id: '', quantity: 1, unit_cost_usd: 0 }]);
  const removePurchaseItem = (i: number) => setPurchaseItems(prev => prev.filter((_, idx) => idx !== i));
  const updatePurchaseItem = (i: number, field: string, value: any) => {
    setPurchaseItems(prev => prev.map((item, idx) => {
      if (idx !== i) return item;
      const updated = { ...item, [field]: value };
      if (field === 'product_id') {
        const prod = products.find((p: any) => p.id === value);
        updated.unit_cost_usd = Number(prod?.unit_cost_usd || 0);
      }
      return updated;
    }));
  };

  const handlePurchaseSupplier = (id: string) => {
    setPurchaseSupplierId(id);
    const s = suppliers.find((s: any) => s.id === id);
    setPurchaseSupplierName(s?.name || '');
  };

  const handleCnSupplier = (id: string) => {
    setCnSupplierId(id);
    const s = suppliers.find((s: any) => s.id === id);
    setCnSupplierName(s?.name || '');
  };

  const getPriceForTier = (prod: any, tier: string) => {
    switch (tier) {
      case 'architect': return Number(prod?.price_architect_usd || prod?.price_list_usd || 0);
      case 'project': return Number(prod?.price_project_usd || prod?.price_list_usd || 0);
      case 'wholesale': return Number(prod?.price_wholesale_usd || prod?.price_list_usd || 0);
      default: return Number(prod?.price_list_usd || 0);
    }
  };

  // Currency auto-conversion
  const handleUsdChange = (v: string) => {
    setAmountUsd(v);
    const n = parseFloat(v);
    if (!isNaN(n) && n > 0) setAmountDop((n * xr).toFixed(0));
  };
  const handleDopChange = (v: string) => {
    setAmountDop(v);
    const n = parseFloat(v);
    if (!isNaN(n) && n > 0) setAmountUsd((n / xr).toFixed(2));
  };

  const handleClientChange = (id: string) => {
    setContactId(id);
    const contact = contacts.find((c: any) => c.id === id);
    const tier = contact?.price_tier || 'list';
    setPriceTier(tier);
    setSaleItems(prev => prev.map(item => {
      if (!item.product_id) return item;
      const prod = products.find((p: any) => p.id === item.product_id);
      return { ...item, unit_price_usd: getPriceForTier(prod, tier) };
    }));
  };

  const addSaleItem = () => setSaleItems(prev => [...prev, { product_id: '', quantity: 1, unit_price_usd: 0 }]);
  const removeSaleItem = (i: number) => setSaleItems(prev => prev.filter((_, idx) => idx !== i));
  const updateSaleItem = (i: number, field: string, value: any) => {
    setSaleItems(prev => prev.map((item, idx) => {
      if (idx !== i) return item;
      const updated = { ...item, [field]: value };
      if (field === 'product_id') {
        const prod = products.find((p: any) => p.id === value);
        updated.unit_price_usd = getPriceForTier(prod, priceTier);
      }
      return updated;
    }));
  };

  const subtotal = saleItems.reduce((s, i) => s + i.unit_price_usd * i.quantity, 0);
  const itbis = subtotal * 0.18;
  const totalSale = subtotal + itbis;

  // Account overrides from preview editing
  const [previewAccountOverrides, setPreviewAccountOverrides] = useState<Record<number, string>>({});

  // Reset overrides when type changes
  const handleTypeChange = (t: TxType) => {
    setManualType(t);
    setCategory('');
    setPreviewAccountOverrides({});
  };

  // === Accounting Preview Lines ===
  const previewLines = useMemo(() => {
    const getAcct = (id: string) => accounts.find((a: any) => a.id === id);
    const lines: { accountCode?: string; accountName: string; accountType?: string; debit: number; credit: number; accountId?: string }[] = [];

    if (manualType === 'journal') {
      journalLines.forEach(jl => {
        if (!jl.account_id || (jl.debit === 0 && jl.credit === 0)) return;
        const acct = getAcct(jl.account_id);
        lines.push({
          accountCode: acct?.code || '',
          accountName: acct?.description || 'Sin asignar',
          accountType: acct?.account_type || '',
          accountId: acct?.id,
          debit: jl.debit || 0,
          credit: jl.credit || 0,
        });
      });
    } else if (manualType === 'purchase' && purchaseTotal > 0) {
      const invAcct = accounts.find((a: any) => a.code?.startsWith('14') || a.code?.startsWith('13') || (a.account_type === 'Activo' && a.description?.toLowerCase().includes('inventar')));
      const cxpAcct = accounts.find((a: any) => a.code?.startsWith('21') || a.code?.startsWith('20') || (a.account_type === 'Pasivo' && a.description?.toLowerCase().includes('pagar')));
      if (invAcct) lines.push({ accountCode: invAcct.code, accountName: invAcct.description, accountType: invAcct.account_type, accountId: invAcct.id, debit: purchaseTotal, credit: 0 });
      else lines.push({ accountName: 'Inventario / Mercancía', accountType: 'Activo', debit: purchaseTotal, credit: 0 });
      if (cxpAcct) lines.push({ accountCode: cxpAcct.code, accountName: cxpAcct.description, accountType: cxpAcct.account_type, accountId: cxpAcct.id, debit: 0, credit: purchaseTotal });
      else lines.push({ accountName: 'Cuentas por Pagar Proveedores', accountType: 'Pasivo', debit: 0, credit: purchaseTotal });
    } else if (manualType === 'credit_note' && parseFloat(cnAmountUsd) > 0) {
      const amt = parseFloat(cnAmountUsd);
      const cxpAcct = accounts.find((a: any) => a.code?.startsWith('21') || a.code?.startsWith('20') || (a.account_type === 'Pasivo' && a.description?.toLowerCase().includes('pagar')));
      const invAcct = accounts.find((a: any) => a.code?.startsWith('14') || a.code?.startsWith('13') || (a.account_type === 'Activo' && a.description?.toLowerCase().includes('inventar')));
      if (cxpAcct) lines.push({ accountCode: cxpAcct.code, accountName: cxpAcct.description, accountType: cxpAcct.account_type, accountId: cxpAcct.id, debit: amt, credit: 0 });
      else lines.push({ accountName: 'Cuentas por Pagar Proveedores', accountType: 'Pasivo', debit: amt, credit: 0 });
      if (invAcct) lines.push({ accountCode: invAcct.code, accountName: invAcct.description, accountType: invAcct.account_type, accountId: invAcct.id, debit: 0, credit: amt });
      else lines.push({ accountName: 'Inventario / Mercancía', accountType: 'Activo', debit: 0, credit: amt });
    } else if (manualType === 'sale' && totalSale > 0) {
      const incomeAcct = accounts.find((a: any) => a.code?.startsWith('41') || a.code?.startsWith('40'));
      const cashAcct = accounts.find((a: any) => a.code?.startsWith('103') || a.code?.startsWith('104') || a.code?.startsWith('10'));
      const cxcAcct = accounts.find((a: any) => a.code?.startsWith('121') || a.code?.startsWith('12'));
      const counterAcct = paymentStatus === 'paid' ? cashAcct : cxcAcct;
      if (counterAcct) lines.push({ accountCode: counterAcct.code, accountName: counterAcct.description, accountType: counterAcct.account_type, accountId: counterAcct.id, debit: totalSale, credit: 0 });
      if (incomeAcct) lines.push({ accountCode: incomeAcct.code, accountName: incomeAcct.description, accountType: incomeAcct.account_type, accountId: incomeAcct.id, debit: 0, credit: totalSale });
    } else if ((manualType === 'expense' || manualType === 'cost') && (parseFloat(amountUsd) > 0 || parseFloat(amountDop) > 0)) {
      const amt = parseFloat(amountUsd) || (parseFloat(amountDop) || 0) / xr;
      const expAcct = accountId ? getAcct(accountId) : null;
      const cashAcct = accounts.find((a: any) => a.code?.startsWith('103') || a.code?.startsWith('104') || a.code?.startsWith('10'));
      if (expAcct) lines.push({ accountCode: expAcct.code, accountName: expAcct.description, accountType: expAcct.account_type, accountId: expAcct.id, debit: amt, credit: 0 });
      else lines.push({ accountName: manualType === 'expense' ? 'Cuenta de Gasto' : 'Cuenta de Costo', accountType: manualType === 'expense' ? 'Gasto' : 'Costo', debit: amt, credit: 0 });
      if (cashAcct) lines.push({ accountCode: cashAcct.code, accountName: cashAcct.description, accountType: cashAcct.account_type, accountId: cashAcct.id, debit: 0, credit: amt });
    }

    // Apply overrides
    return lines.map((line, idx) => {
      const overrideId = previewAccountOverrides[idx];
      if (!overrideId) return line;
      const overrideAcct = accounts.find(a => a.id === overrideId);
      if (!overrideAcct) return line;
      return {
        ...line,
        accountCode: overrideAcct.code || '',
        accountName: overrideAcct.description,
        accountType: overrideAcct.account_type,
        accountId: overrideAcct.id,
      };
    });
  }, [manualType, journalLines, totalSale, paymentStatus, amountUsd, amountDop, accountId, accounts, xr, purchaseTotal, cnAmountUsd, previewAccountOverrides]);

  const handlePreviewAccountChange = (lineIndex: number, newAccountId: string) => {
    setPreviewAccountOverrides(prev => ({ ...prev, [lineIndex]: newAccountId }));
  };

  const resetManualForm = () => {
    setDescription(''); setCategory(''); setVendor('');
    setAmountUsd(''); setAmountDop(''); setManualDate(undefined);
    setAccountId(''); setContactId(''); setInvoiceRef('');
    setPriceTier('list'); setPaymentStatus('pending');
    setSaleItems([{ product_id: '', quantity: 1, unit_price_usd: 0 }]);
    setPurchaseSupplierId(''); setPurchaseSupplierName('');
    setPurchaseItems([{ product_id: '', quantity: 1, unit_cost_usd: 0 }]);
    setPurchaseNotes('');
    setCnSupplierId(''); setCnSupplierName('');
    setCnAmountUsd(''); setCnReason(''); setCnNotes('');
    setJournalLines([
      { account_id: '', debit: 0, credit: 0, description: '' },
      { account_id: '', debit: 0, credit: 0, description: '' },
    ]);
    setJournalDescription('');
    setJournalNotes('');
  };

  // Helper to create journal entry from computed preview lines
  const createJournalFromPreview = async (desc: string, notes?: string) => {
    if (previewLines.length < 2) return;
    const totalD = previewLines.reduce((s, l) => s + l.debit, 0);
    const totalC = previewLines.reduce((s, l) => s + l.credit, 0);
    
    const entryPayload: any = {
      description: desc,
      total_debit_usd: totalD,
      total_credit_usd: totalC,
      exchange_rate: xr,
      notes: notes || null,
    };
    const dateStr = manualDate ? format(manualDate, 'yyyy-MM-dd') : undefined;
    if (dateStr) entryPayload.date = dateStr;

    const { data: entry, error } = await supabase.from('journal_entries').insert(entryPayload).select().single();
    if (error || !entry) throw error || new Error('Error creando asiento');

    // Match preview lines to accounts
    const linesData = previewLines.map(pl => {
      const acct = pl.accountCode
        ? accounts.find(a => a.code === pl.accountCode)
        : accounts.find(a => a.description === pl.accountName);
      return {
        journal_entry_id: entry.id,
        account_id: acct?.id || accounts[0]?.id,
        debit_usd: pl.debit || 0,
        credit_usd: pl.credit || 0,
        description: desc,
      };
    }).filter(l => l.account_id);

    if (linesData.length > 0) {
      await supabase.from('journal_entry_lines').insert(linesData);
    }

    queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
  };

  // ===== MANUAL SAVE =====
  const saveManual = async () => {
    // ===== JOURNAL ENTRY =====
    if (manualType === 'journal') {
      if (!journalDescription.trim()) { toast.error('Descripción requerida'); return; }
      const validLines = journalLines.filter(l => l.account_id && (l.debit > 0 || l.credit > 0));
      if (validLines.length < 2) { toast.error('Se requieren al menos 2 líneas con cuentas y montos'); return; }
      if (!journalIsBalanced) { toast.error('Los débitos y créditos deben cuadrar'); return; }

      setManualSaving(true);
      const dateStr = manualDate ? format(manualDate, 'yyyy-MM-dd') : undefined;
      try {
        const entryPayload: any = {
          description: journalDescription.trim(),
          total_debit_usd: journalTotalDebit,
          total_credit_usd: journalTotalCredit,
          exchange_rate: xr,
          notes: journalNotes.trim() || null,
        };
        if (dateStr) entryPayload.date = dateStr;

        const { data: entry, error } = await supabase.from('journal_entries').insert(entryPayload).select().single();
        if (error || !entry) throw error || new Error('Error creando asiento');

        const linesData = validLines.map(l => ({
          journal_entry_id: entry.id,
          account_id: l.account_id,
          debit_usd: l.debit || 0,
          credit_usd: l.credit || 0,
          description: l.description || null,
        }));
        await supabase.from('journal_entry_lines').insert(linesData);

        toast.success('Asiento contable registrado');
        queryClient.invalidateQueries({ queryKey: ['journal-entries'] });

        setHistory(prev => [{ type: 'journal', description: journalDescription, amount: formatUSD(journalTotalDebit), timestamp: new Date() }, ...prev].slice(0, 5));
        resetManualForm();
      } catch (e: any) {
        toast.error(e.message || 'Error al registrar asiento');
      }
      setManualSaving(false);
      return;
    }

    // ===== PURCHASE =====
    if (manualType === 'purchase') {
      if (!purchaseSupplierName.trim() && !purchaseSupplierId) { toast.error('Selecciona un proveedor'); return; }
      if (purchaseItems.some(i => !i.product_id)) { toast.error('Selecciona productos para todos los ítems'); return; }
      if (purchaseTotal <= 0) { toast.error('El total debe ser mayor a 0'); return; }

      setManualSaving(true);
      try {
        const desc = `Compra inventario — ${purchaseSupplierName || 'Proveedor'} — ${formatUSD(purchaseTotal)}`;
        
        // Create shipment record
        const dateStr = manualDate ? format(manualDate, 'yyyy-MM-dd') : new Date().toISOString().split('T')[0];
        const { data: shipment, error: shipErr } = await supabase.from('shipments').insert({
          supplier_id: purchaseSupplierId || null,
          supplier_name: purchaseSupplierName || 'Proveedor',
          po_number: `PO-${Date.now().toString(36).toUpperCase()}`,
          order_date: dateStr,
          total_cost_usd: purchaseTotal,
          status: 'ordered' as any,
          notes: purchaseNotes || null,
        }).select().single();
        if (shipErr || !shipment) throw shipErr || new Error('Error creando envío');

        // Create shipment items
        const itemsData = purchaseItems.map(i => ({
          shipment_id: shipment.id,
          product_id: i.product_id,
          quantity_ordered: i.quantity,
          quantity_received: 0,
          unit_cost_usd: i.unit_cost_usd,
        }));
        await supabase.from('shipment_items').insert(itemsData);

        // Create journal entry
        await createJournalFromPreview(desc, purchaseNotes || null);

        toast.success('Compra de inventario registrada — envío creado en estado "Ordenado"');
        queryClient.invalidateQueries({ queryKey: ['shipments'] });

        setHistory(prev => [{ type: 'purchase', description: desc, amount: formatUSD(purchaseTotal), timestamp: new Date() }, ...prev].slice(0, 5));
        resetManualForm();
      } catch (e: any) {
        toast.error(e.message || 'Error al registrar compra');
      }
      setManualSaving(false);
      return;
    }

    // ===== CREDIT NOTE =====
    if (manualType === 'credit_note') {
      if (!cnSupplierName.trim() && !cnSupplierId) { toast.error('Selecciona un proveedor'); return; }
      const amt = parseFloat(cnAmountUsd);
      if (!amt || amt <= 0) { toast.error('Ingresa el monto de la nota de crédito'); return; }
      if (!cnReason.trim()) { toast.error('Ingresa la razón de la nota de crédito'); return; }

      setManualSaving(true);
      try {
        const desc = `Nota de crédito proveedor — ${cnSupplierName || 'Proveedor'} — ${formatUSD(amt)} — ${cnReason}`;

        // Create journal entry (Debit CxP, Credit Inventario)
        await createJournalFromPreview(desc, cnNotes || null);

        toast.success('Nota de crédito registrada en contabilidad');

        setHistory(prev => [{ type: 'credit_note', description: desc, amount: formatUSD(amt), timestamp: new Date() }, ...prev].slice(0, 5));
        resetManualForm();
      } catch (e: any) {
        toast.error(e.message || 'Error al registrar nota de crédito');
      }
      setManualSaving(false);
      return;
    }

    if (manualType === 'sale') {
      // Validate sale
      if (!contactId) { toast.error('Selecciona un cliente'); return; }
      if (saleItems.some(i => !i.product_id)) { toast.error('Selecciona productos para todos los ítems'); return; }

      setManualSaving(true);
      const dateStr = manualDate ? format(manualDate, 'yyyy-MM-dd') : undefined;
      try {
        const salePayload: any = {
          contact_id: contactId,
          invoice_ref: invoiceRef || null,
          subtotal_usd: subtotal,
          itbis_usd: itbis,
          total_usd: totalSale,
          total_dop: totalSale * xr,
          exchange_rate: xr,
          payment_status: paymentStatus as any,
        };
        if (dateStr) salePayload.date = dateStr;
        if (paymentStatus === 'paid') salePayload.payment_date = dateStr || new Date().toISOString().split('T')[0];

        const { data: sale, error } = await supabase.from('sales').insert(salePayload).select().single();
        if (error || !sale) throw error || new Error('Error creando venta');

        const itemsData = saleItems.map(i => {
          const prod = products.find((p: any) => p.id === i.product_id);
          const costUsd = Number(prod?.unit_cost_usd || 0);
          return {
            sale_id: sale.id, product_id: i.product_id, quantity: i.quantity,
            unit_price_usd: i.unit_price_usd, unit_cost_usd: costUsd,
            line_total_usd: i.unit_price_usd * i.quantity,
            margin_pct: i.unit_price_usd > 0 ? Math.round((i.unit_price_usd - costUsd) / i.unit_price_usd * 100) : 0,
          };
        });
        await supabase.from('sale_items').insert(itemsData);

        toast.success('Venta registrada');
        queryClient.invalidateQueries({ queryKey: ['sales'] });
        queryClient.invalidateQueries({ queryKey: ['sale-items'] });
        queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });

        setHistory(prev => [{ type: 'sale', description: contacts.find(c => c.id === contactId)?.contact_name || 'Venta', amount: formatUSD(totalSale), timestamp: new Date() }, ...prev].slice(0, 5));
        resetManualForm();
      } catch (e: any) {
        toast.error(e.message || 'Error al registrar venta');
      }
      setManualSaving(false);
      return;
    }

    // Expense / Cost
    if (!description.trim()) { toast.error('Descripción requerida'); return; }
    if (!category) { toast.error('Selecciona una categoría'); return; }
    const usd = parseFloat(amountUsd) || 0;
    const dop = parseFloat(amountDop) || 0;
    if (usd <= 0 && dop <= 0) { toast.error('Ingresa un monto'); return; }

    setManualSaving(true);
    const finalUsd = usd > 0 ? usd : dop / xr;
    const finalDop = dop > 0 ? dop : usd * xr;
    const dateStr = manualDate ? format(manualDate, 'yyyy-MM-dd') : undefined;

    try {
      const table = manualType === 'expense' ? 'expenses' : 'costs';
      const row: any = {
        description: description.trim(),
        category,
        vendor: vendor.trim() || null,
        amount_usd: finalUsd,
        amount_dop: finalDop,
        exchange_rate: xr,
        account_id: accountId || null,
      };
      if (dateStr) row.date = dateStr;

      const { error } = await supabase.from(table).insert(row);
      if (error) throw error;

      toast.success(manualType === 'expense' ? 'Gasto registrado' : 'Costo registrado');
      queryClient.invalidateQueries({ queryKey: [table] });

      setHistory(prev => [{ type: manualType, description, amount: formatUSD(finalUsd), timestamp: new Date() }, ...prev].slice(0, 5));
      resetManualForm();
    } catch (e: any) {
      toast.error(e.message || 'Error al registrar');
    }
    setManualSaving(false);
  };

  // ===== AI CLASSIFY =====
  const classify = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setPreview(null);

    let fullResponse = '';
    try {
      await streamFinancialAI({
        messages: [{ role: 'user', content: input }],
        action: 'classify',
        onDelta: (chunk) => { fullResponse += chunk; },
        onDone: () => {
          setLoading(false);
          try {
            const cleaned = fullResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(cleaned);
            if (parsed.type && parsed.data) {
              setPreview(parsed);
            } else {
              toast.error('La IA no pudo clasificar esta transacción');
            }
          } catch {
            toast.error('Error al procesar respuesta de IA');
          }
        },
      });
    } catch (e: any) {
      toast.error(e.message || 'Error de IA');
      setLoading(false);
    }
  };

  // ===== AI APPROVE =====
  const approve = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      if (preview.type === 'expense') {
        const { error } = await supabase.from('expenses').insert({
          description: preview.data.description,
          category: preview.data.category as any,
          vendor: preview.data.vendor || null,
          amount_usd: preview.data.amount_usd,
          amount_dop: preview.data.amount_dop,
          exchange_rate: preview.data.exchange_rate || xr,
          account_id: preview.data.account_id || null,
        });
        if (error) throw error;
        toast.success('Gasto registrado');
        queryClient.invalidateQueries({ queryKey: ['expenses'] });
      } else if (preview.type === 'cost') {
        const { error } = await supabase.from('costs').insert({
          description: preview.data.description,
          category: preview.data.category as any,
          vendor: preview.data.vendor || null,
          amount_usd: preview.data.amount_usd,
          amount_dop: preview.data.amount_dop,
          exchange_rate: preview.data.exchange_rate || xr,
          account_id: preview.data.account_id || null,
        });
        if (error) throw error;
        toast.success('Costo registrado');
        queryClient.invalidateQueries({ queryKey: ['costs'] });
      } else if (preview.type === 'sale') {
        const salePayload: any = {
          contact_id: preview.data.contact_id || null,
          subtotal_usd: preview.data.subtotal_usd,
          itbis_usd: preview.data.itbis_usd,
          total_usd: preview.data.total_usd,
          total_dop: preview.data.total_dop,
          exchange_rate: preview.data.exchange_rate || xr,
          payment_status: 'pending' as any,
        };
        const { data: sale, error } = await supabase.from('sales').insert(salePayload).select().single();
        if (error || !sale) throw error || new Error('Error creando venta');
        if (preview.data.items) {
          await supabase.from('sale_items').insert(preview.data.items.map((i: any) => ({
            sale_id: sale.id, product_id: i.product_id || null, quantity: i.quantity,
            unit_price_usd: i.unit_price_usd, unit_cost_usd: i.unit_cost_usd || 0,
            line_total_usd: i.line_total_usd, margin_pct: i.margin_pct || 0,
          })));
        }
        toast.success('Venta registrada');
        queryClient.invalidateQueries({ queryKey: ['sales'] });
        queryClient.invalidateQueries({ queryKey: ['sale-items'] });
        queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      }

      setHistory(prev => [{
        type: preview.type,
        description: preview.data.description || preview.data.contact_name || input,
        amount: preview.type === 'sale' ? formatUSD(preview.data.total_usd) : formatUSD(preview.data.amount_usd),
        timestamp: new Date(),
      }, ...prev].slice(0, 5));

      setPreview(null);
      setInput('');
    } catch (e: any) {
      toast.error(e.message || 'Error al registrar');
    }
    setLoading(false);
  };

  const edit = () => {
    if (!preview) return;
    if (preview.type === 'sale' && onEditSale) {
      onEditSale({
        contact_id: preview.data.contact_id, invoice_ref: '',
        items: preview.data.items?.map((i: any) => ({
          product_id: i.product_id || '', quantity: i.quantity, unit_price_usd: i.unit_price_usd,
        })),
      });
    } else if (preview.type === 'expense' && onEditExpense) {
      onEditExpense({
        description: preview.data.description, category: preview.data.category,
        vendor: preview.data.vendor || '', amount_usd: String(preview.data.amount_usd),
        amount_dop: String(preview.data.amount_dop || 0), account_id: preview.data.account_id || '',
      });
    } else if (preview.type === 'cost' && onEditCost) {
      onEditCost({
        description: preview.data.description, category: preview.data.category,
        vendor: preview.data.vendor || '', amount_usd: String(preview.data.amount_usd),
        amount_dop: String(preview.data.amount_dop || 0), account_id: preview.data.account_id || '',
      });
    }
    setPreview(null);
  };

  const typeConfig = preview ? TYPE_CONFIG[preview.type] || TYPE_CONFIG.expense : null;
  const catLabel = preview?.type === 'expense'
    ? EXPENSE_CATEGORIES[preview.data.category] || preview.data.category
    : preview?.type === 'cost'
    ? COST_CATEGORIES[preview.data.category] || preview.data.category
    : null;

  const currentCategories = manualType === 'expense' ? EXPENSE_CATEGORIES : COST_CATEGORIES;

  const canSaveManual = () => {
    if (manualType === 'journal') return journalIsBalanced && journalDescription.trim().length > 0;
    if (manualType === 'purchase') return purchaseTotal > 0 && (purchaseSupplierId || purchaseSupplierName.trim());
    if (manualType === 'credit_note') return parseFloat(cnAmountUsd) > 0 && cnReason.trim().length > 0 && (cnSupplierId || cnSupplierName.trim());
    return true;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main input area */}
      <div className="lg:col-span-2 space-y-5">
        {/* Mode toggle */}
        <div className="flex gap-1 rounded-xl bg-muted p-0.5 w-fit">
          <button onClick={() => setMode('manual')}
            className={cn('rounded-lg px-4 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5',
              mode === 'manual' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
            <FileText className="w-3.5 h-3.5" /> Manual
          </button>
          <button onClick={() => setMode('ai')}
            className={cn('rounded-lg px-4 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5',
              mode === 'ai' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
            <Sparkles className="w-3.5 h-3.5" /> Con IA
          </button>
        </div>

        {/* ========== AI MODE ========== */}
        {mode === 'ai' && (
          <>
            <div className="rounded-2xl bg-card border border-border p-6 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-5 h-5 text-primary" />
                <h2 className="text-base font-semibold text-foreground">Crear Transacción con IA</h2>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">Describe qué pasó en lenguaje natural y la IA clasificará automáticamente.</p>

              <Textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Describe qué pasó... Ej: Pagué $200 USD de flete a DHL"
                className="min-h-[100px] text-sm resize-none"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); classify(); } }}
              />

              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map(ex => (
                  <button key={ex} onClick={() => setInput(ex)}
                    className="rounded-full px-3 py-1 text-[11px] bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                    {ex}
                  </button>
                ))}
              </div>

              <Button onClick={classify} disabled={loading || !input.trim()} className="w-full gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                {loading ? 'Clasificando...' : 'Clasificar con IA'}
              </Button>
            </div>

            {/* Preview card */}
            {preview && typeConfig && (
              <div className="rounded-2xl border-2 border-primary/20 bg-card p-6 space-y-4 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between">
                  <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase', typeConfig.color)}>
                    {typeConfig.icon} {typeConfig.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Confianza</span>
                    <Progress value={(preview.confidence || 0) * 100} className="w-20 h-2" />
                    <span className="text-xs font-mono font-medium">{((preview.confidence || 0) * 100).toFixed(0)}%</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  {(preview.type === 'expense' || preview.type === 'cost') && (
                    <>
                      <div><span className="text-muted-foreground text-xs">Categoría</span><p className="font-medium">{catLabel}</p></div>
                      <div><span className="text-muted-foreground text-xs">Proveedor</span><p className="font-medium">{preview.data.vendor || '—'}</p></div>
                      <div><span className="text-muted-foreground text-xs">Descripción</span><p className="font-medium">{preview.data.description}</p></div>
                      <div><span className="text-muted-foreground text-xs">Cuenta Contable</span>
                        <p className="font-medium">{preview.data.account_code ? `${preview.data.account_code} - ${preview.data.account_name}` : 'Sin asignar'}</p>
                      </div>
                      <div><span className="text-muted-foreground text-xs">Monto USD</span><p className="font-bold text-lg">{formatUSD(preview.data.amount_usd)}</p></div>
                      <div><span className="text-muted-foreground text-xs">Monto DOP</span><p className="font-bold text-lg">{formatDOP(preview.data.amount_dop)}</p></div>
                    </>
                  )}
                  {preview.type === 'sale' && (
                    <>
                      <div className="col-span-2">
                        <span className="text-muted-foreground text-xs">Cliente</span>
                        <p className="font-medium">{preview.data.contact_name || 'Sin asignar'}</p>
                      </div>
                      {preview.data.items?.map((it: any, i: number) => (
                        <div key={i} className="col-span-2 flex justify-between items-center py-1 border-b border-border/50 last:border-0">
                          <span className="text-sm">{it.product_name} <span className="text-muted-foreground">×{it.quantity}</span></span>
                          <span className="font-mono text-sm">{formatUSD(it.line_total_usd)}</span>
                        </div>
                      ))}
                      <div><span className="text-muted-foreground text-xs">Subtotal</span><p className="font-medium">{formatUSD(preview.data.subtotal_usd)}</p></div>
                      <div><span className="text-muted-foreground text-xs">ITBIS (18%)</span><p className="font-medium">{formatUSD(preview.data.itbis_usd)}</p></div>
                      <div><span className="text-muted-foreground text-xs">Total USD</span><p className="font-bold text-lg">{formatUSD(preview.data.total_usd)}</p></div>
                      <div><span className="text-muted-foreground text-xs">Total DOP</span><p className="font-bold text-lg">{formatDOP(preview.data.total_dop)}</p></div>
                    </>
                  )}
                </div>

                {preview.explanation && (
                  <p className="text-xs text-muted-foreground italic bg-muted/50 rounded-lg px-3 py-2">{preview.explanation}</p>
                )}

                <div className="flex gap-2 pt-1">
                  <Button className="flex-1 gap-1.5" onClick={approve} disabled={loading}>
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Aprobar y Registrar
                  </Button>
                  {(preview.type === 'sale' || preview.type === 'expense' || preview.type === 'cost') && (
                    <Button variant="outline" className="gap-1.5" onClick={edit}>
                      <Pencil className="w-3.5 h-3.5" /> Editar
                    </Button>
                  )}
                  <Button variant="destructive" size="icon" onClick={() => setPreview(null)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ========== MANUAL MODE ========== */}
        {mode === 'manual' && (
          <div className="rounded-2xl bg-card border border-border p-6 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-5 h-5 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Registrar Transacción Manual</h2>
            </div>

            {/* Type selector - scrollable row */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(['journal', 'expense', 'cost', 'sale', 'purchase', 'credit_note'] as const).map(t => (
                <button key={t} onClick={() => handleTypeChange(t)}
                  className={cn(
                    'shrink-0 rounded-xl border-2 px-3 py-3 text-sm font-medium transition-all whitespace-nowrap',
                    manualType === t
                      ? TYPE_CONFIG[t].color + ' border-current'
                      : 'border-border text-muted-foreground hover:border-primary/30'
                  )}>
                  {TYPE_CONFIG[t].icon} {TYPE_CONFIG[t].label}
                </button>
              ))}
            </div>

            {/* ===== SALE FORM ===== */}
            {manualType === 'sale' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Cliente *</Label>
                  <Select value={contactId} onValueChange={handleClientChange}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
                    <SelectContent>
                      {contacts.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.contact_name}{c.company_name ? ` — ${c.company_name}` : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Ref. Factura</Label>
                    <Input value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} placeholder="Ej: FAC-001" maxLength={50} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tier de Precio</Label>
                    <Select value={priceTier} onValueChange={v => {
                      setPriceTier(v);
                      setSaleItems(prev => prev.map(item => {
                        if (!item.product_id) return item;
                        const prod = products.find((p: any) => p.id === item.product_id);
                        return { ...item, unit_price_usd: getPriceForTier(prod, v) };
                      }));
                    }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="list">Lista</SelectItem>
                        <SelectItem value="architect">Arquitecto</SelectItem>
                        <SelectItem value="project">Proyecto</SelectItem>
                        <SelectItem value="wholesale">Mayorista</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Productos *</Label>
                  {saleItems.map((item, i) => (
                    <div key={i} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Select value={item.product_id} onValueChange={v => updateSaleItem(i, 'product_id', v)}>
                          <SelectTrigger className="text-xs"><SelectValue placeholder="Producto" /></SelectTrigger>
                          <SelectContent>
                            {products.map((p: any) => (
                              <SelectItem key={p.id} value={p.id} className="text-xs">{p.sku} — {p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Input type="number" min={1} value={item.quantity}
                        onChange={e => updateSaleItem(i, 'quantity', parseInt(e.target.value) || 1)}
                        className="w-16 text-xs" />
                      <div className="relative w-24">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">$</span>
                        <Input type="number" min={0} step={0.01} value={item.unit_price_usd}
                          onChange={e => updateSaleItem(i, 'unit_price_usd', parseFloat(e.target.value) || 0)}
                          className="pl-5 text-xs" />
                      </div>
                      <span className="text-xs font-mono w-20 text-right shrink-0">{formatUSD(item.unit_price_usd * item.quantity)}</span>
                      {saleItems.length > 1 && (
                        <button onClick={() => removeSaleItem(i)} className="p-1 text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addSaleItem} className="gap-1 text-xs">
                    <Plus className="w-3 h-3" /> Agregar Producto
                  </Button>
                </div>

                <div className="rounded-xl bg-muted/50 p-4 space-y-1">
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">Subtotal</span><span className="font-mono">{formatUSD(subtotal)}</span></div>
                  <div className="flex justify-between text-xs"><span className="text-muted-foreground">ITBIS (18%)</span><span className="font-mono">{formatUSD(itbis)}</span></div>
                  <div className="flex justify-between text-sm font-bold pt-1 border-t border-border/50">
                    <span>Total</span>
                    <span className="text-primary">{formatUSD(totalSale)} / {formatDOP(totalSale * xr)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Estado de Pago</Label>
                    <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(PAYMENT_STATUSES).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Fecha (por defecto hoy)</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm"
                          className={cn('w-full justify-start text-left text-sm font-normal', !manualDate && 'text-muted-foreground')}>
                          <CalendarIcon className="w-4 h-4 mr-2" />
                          {manualDate ? format(manualDate, 'dd/MM/yyyy') : 'Hoy'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={manualDate} onSelect={setManualDate} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </div>
            )}

            {/* ===== PURCHASE FORM ===== */}
            {manualType === 'purchase' && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground -mt-2">Registra una compra de inventario. Se crea el envío en estado "Ordenado" y el asiento contable automáticamente.</p>
                
                {/* Supplier */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Proveedor *</Label>
                  {suppliers.length > 0 ? (
                    <Select value={purchaseSupplierId} onValueChange={handlePurchaseSupplier}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar proveedor" /></SelectTrigger>
                      <SelectContent>
                        {suppliers.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={purchaseSupplierName} onChange={e => setPurchaseSupplierName(e.target.value)} placeholder="Nombre del proveedor" />
                  )}
                </div>

                {/* Products */}
                <div className="space-y-2">
                  <Label className="text-xs">Productos *</Label>
                  {purchaseItems.map((item, i) => (
                    <div key={i} className="flex gap-2 items-end">
                      <div className="flex-1">
                        <Select value={item.product_id} onValueChange={v => updatePurchaseItem(i, 'product_id', v)}>
                          <SelectTrigger className="text-xs"><SelectValue placeholder="Producto" /></SelectTrigger>
                          <SelectContent>
                            {products.map((p: any) => (
                              <SelectItem key={p.id} value={p.id} className="text-xs">{p.sku} — {p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Input type="number" min={1} value={item.quantity}
                        onChange={e => updatePurchaseItem(i, 'quantity', parseInt(e.target.value) || 1)}
                        className="w-16 text-xs" placeholder="Cant." />
                      <div className="relative w-24">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">$</span>
                        <Input type="number" min={0} step={0.01} value={item.unit_cost_usd}
                          onChange={e => updatePurchaseItem(i, 'unit_cost_usd', parseFloat(e.target.value) || 0)}
                          className="pl-5 text-xs" placeholder="Costo" />
                      </div>
                      <span className="text-xs font-mono w-20 text-right shrink-0">{formatUSD(item.unit_cost_usd * item.quantity)}</span>
                      {purchaseItems.length > 1 && (
                        <button onClick={() => removePurchaseItem(i)} className="p-1 text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addPurchaseItem} className="gap-1 text-xs">
                    <Plus className="w-3 h-3" /> Agregar Producto
                  </Button>
                </div>

                {/* Total */}
                <div className="rounded-xl bg-muted/50 p-4">
                  <div className="flex justify-between text-sm font-bold">
                    <span>Total Compra</span>
                    <span className="text-primary">{formatUSD(purchaseTotal)} / {formatDOP(purchaseTotal * xr)}</span>
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Notas (opcional)</Label>
                  <Textarea value={purchaseNotes} onChange={e => setPurchaseNotes(e.target.value)}
                    placeholder="Referencia de orden, comentarios..." className="min-h-[60px] text-sm resize-none" />
                </div>

                {/* Date */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Fecha de Orden (por defecto hoy)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm"
                        className={cn('w-full justify-start text-left text-sm font-normal', !manualDate && 'text-muted-foreground')}>
                        <CalendarIcon className="w-4 h-4 mr-2" />
                        {manualDate ? format(manualDate, 'dd/MM/yyyy') : 'Hoy'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={manualDate} onSelect={setManualDate} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}

            {/* ===== CREDIT NOTE FORM ===== */}
            {manualType === 'credit_note' && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground -mt-2">Registra una nota de crédito del proveedor. Reduce la cuenta por pagar y ajusta el costo de inventario.</p>

                {/* Supplier */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Proveedor *</Label>
                  {suppliers.length > 0 ? (
                    <Select value={cnSupplierId} onValueChange={handleCnSupplier}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar proveedor" /></SelectTrigger>
                      <SelectContent>
                        {suppliers.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input value={cnSupplierName} onChange={e => setCnSupplierName(e.target.value)} placeholder="Nombre del proveedor" />
                  )}
                </div>

                {/* Amount */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Monto USD *</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                    <Input type="number" min="0" step="0.01" value={cnAmountUsd}
                      onChange={e => setCnAmountUsd(e.target.value)} placeholder="0.00" className="pl-7" />
                  </div>
                  {parseFloat(cnAmountUsd) > 0 && (
                    <p className="text-[10px] text-muted-foreground">≈ {formatDOP(parseFloat(cnAmountUsd) * xr)}</p>
                  )}
                </div>

                {/* Reason */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Razón / Concepto *</Label>
                  <Input value={cnReason} onChange={e => setCnReason(e.target.value)}
                    placeholder="Ej: Descuento por volumen, producto defectuoso, ajuste de precio" maxLength={200} />
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Notas (opcional)</Label>
                  <Textarea value={cnNotes} onChange={e => setCnNotes(e.target.value)}
                    placeholder="Detalles adicionales..." className="min-h-[60px] text-sm resize-none" />
                </div>

                {/* Date */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Fecha (por defecto hoy)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm"
                        className={cn('w-full justify-start text-left text-sm font-normal', !manualDate && 'text-muted-foreground')}>
                        <CalendarIcon className="w-4 h-4 mr-2" />
                        {manualDate ? format(manualDate, 'dd/MM/yyyy') : 'Hoy'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={manualDate} onSelect={setManualDate} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}

            {/* ===== EXPENSE / COST FORM ===== */}
            {(manualType === 'expense' || manualType === 'cost') && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Descripción *</Label>
                  <Input value={description} onChange={e => setDescription(e.target.value)}
                    placeholder="Ej: Pago de flete contenedor marzo" maxLength={200} />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Categoría *</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar categoría" /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(currentCategories).map(([k, label]) => (
                        <SelectItem key={k} value={k}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Proveedor / Fuente</Label>
                  <Input value={vendor} onChange={e => setVendor(e.target.value)}
                    placeholder="Ej: DHL, Aduanas, etc." maxLength={100} />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Cuenta Contable</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar cuenta contable" /></SelectTrigger>
                    <SelectContent>
                      {leafAccounts.map(a => (
                        <SelectItem key={a.id} value={a.id}>{a.code} — {a.description}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Monto USD *</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                      <Input type="number" min="0" step="0.01" value={amountUsd}
                        onChange={e => handleUsdChange(e.target.value)} placeholder="0.00" className="pl-7" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Monto DOP</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">RD$</span>
                      <Input type="number" min="0" step="1" value={amountDop}
                        onChange={e => handleDopChange(e.target.value)} placeholder="0" className="pl-10" />
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground -mt-3">Tasa: 1 USD = RD${xr.toFixed(2)} — se auto-convierte al llenar un campo</p>

                <div className="space-y-1.5">
                  <Label className="text-xs">Fecha (por defecto hoy)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm"
                        className={cn('w-full justify-start text-left text-sm font-normal', !manualDate && 'text-muted-foreground')}>
                        <CalendarIcon className="w-4 h-4 mr-2" />
                        {manualDate ? format(manualDate, 'dd/MM/yyyy') : 'Hoy'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={manualDate} onSelect={setManualDate} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}

            {/* ===== JOURNAL ENTRY FORM ===== */}
            {manualType === 'journal' && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Descripción del Asiento *</Label>
                  <Input value={journalDescription} onChange={e => setJournalDescription(e.target.value)}
                    placeholder="Ej: Ingreso de efectivo por accionista" maxLength={200} />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Líneas del Asiento</Label>
                  <div className="rounded-xl border border-border overflow-hidden">
                    <div className="grid grid-cols-[1fr_100px_100px_32px] gap-2 p-2 bg-muted/50 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      <span>Cuenta</span><span className="text-right">Débito</span><span className="text-right">Crédito</span><span />
                    </div>
                    {journalLines.map((line, i) => (
                      <div key={i} className="grid grid-cols-[1fr_100px_100px_32px] gap-2 p-2 border-t border-border/50 items-center">
                        <Select value={line.account_id} onValueChange={v => updateJournalLine(i, 'account_id', v)}>
                          <SelectTrigger className="text-xs h-8"><SelectValue placeholder="Seleccionar cuenta" /></SelectTrigger>
                          <SelectContent>
                            {leafAccounts.map(a => (
                              <SelectItem key={a.id} value={a.id} className="text-xs">{a.code} — {a.description}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input type="number" min={0} step={0.01} value={line.debit || ''}
                          onChange={e => updateJournalLine(i, 'debit', parseFloat(e.target.value) || 0)}
                          className="text-xs h-8 text-right" placeholder="0.00" />
                        <Input type="number" min={0} step={0.01} value={line.credit || ''}
                          onChange={e => updateJournalLine(i, 'credit', parseFloat(e.target.value) || 0)}
                          className="text-xs h-8 text-right" placeholder="0.00" />
                        {journalLines.length > 2 && (
                          <button onClick={() => removeJournalLine(i)} className="p-1 text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                    <div className="grid grid-cols-[1fr_100px_100px_32px] gap-2 p-2 border-t border-border bg-muted/30 font-bold">
                      <span className="text-xs">Totales</span>
                      <span className={cn('text-xs text-right font-mono', !journalIsBalanced && 'text-destructive')}>{formatUSD(journalTotalDebit)}</span>
                      <span className={cn('text-xs text-right font-mono', !journalIsBalanced && 'text-destructive')}>{formatUSD(journalTotalCredit)}</span>
                      <span />
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={addJournalLine} className="gap-1 text-xs">
                    <Plus className="w-3 h-3" /> Agregar Línea
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Notas (opcional)</Label>
                  <Textarea value={journalNotes} onChange={e => setJournalNotes(e.target.value)}
                    placeholder="Notas adicionales..." className="min-h-[60px] text-sm resize-none" />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Fecha (por defecto hoy)</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm"
                        className={cn('w-full justify-start text-left text-sm font-normal', !manualDate && 'text-muted-foreground')}>
                        <CalendarIcon className="w-4 h-4 mr-2" />
                        {manualDate ? format(manualDate, 'dd/MM/yyyy') : 'Hoy'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={manualDate} onSelect={setManualDate} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}

            {/* Accounting Preview */}
            {mode === 'manual' && previewLines.length > 0 && (
              <AccountingPreview
                lines={previewLines}
                accounts={accounts}
                onAccountChange={handlePreviewAccountChange}
                description={
                  manualType === 'journal' ? journalDescription
                  : manualType === 'purchase' ? `Compra inventario — ${purchaseSupplierName}`
                  : manualType === 'credit_note' ? `NC — ${cnSupplierName} — ${cnReason}`
                  : description
                }
              />
            )}

            {/* Submit */}
            <Button onClick={saveManual} disabled={manualSaving || !canSaveManual()} className="w-full gap-2">
              {manualSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {manualSaving ? 'Registrando...' : `Registrar ${TYPE_CONFIG[manualType].label}`}
            </Button>
          </div>
        )}
      </div>

      {/* Sidebar: session history */}
      <div className="space-y-4">
        <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Registradas esta sesión</h3>
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Aún no has registrado transacciones</p>
          ) : (
            <div className="space-y-2">
              {history.map((h, i) => {
                const cfg = TYPE_CONFIG[h.type] || TYPE_CONFIG.expense;
                return (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold border', cfg.color)}>{cfg.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{h.description}</p>
                      <p className="text-[10px] text-muted-foreground">{h.timestamp.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <span className="text-xs font-mono font-medium shrink-0">{h.amount}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-muted/30 border border-border p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            {mode === 'ai' ? 'Cómo funciona' : 'Modo Manual'}
          </h3>
          <div className="space-y-2 text-xs text-muted-foreground">
            {mode === 'ai' ? (
              <>
                <p>1️⃣ Escribe qué pasó en tus palabras</p>
                <p>2️⃣ La IA clasifica: venta, gasto o costo</p>
                <p>3️⃣ Asigna cuenta contable y calcula montos</p>
                <p>4️⃣ Revisa y aprueba con un click</p>
              </>
            ) : (
              <>
                <p>📦 <strong>Compra:</strong> Registra compra + crea envío + asiento contable</p>
                <p>📝 <strong>Nota Crédito:</strong> Reduce deuda con proveedor</p>
                <p>💰 <strong>Venta:</strong> Registra ingreso + deduce inventario</p>
                <p>📖 <strong>Asiento:</strong> Partida libre débito/crédito</p>
                <p className="text-[10px] text-muted-foreground/70 pt-1">Todas las transacciones generan un preview contable antes de registrar.</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
