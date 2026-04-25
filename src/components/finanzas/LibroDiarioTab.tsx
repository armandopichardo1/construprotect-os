import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatUSD, formatDOP } from '@/lib/format';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Search, Download, Save, Trash2, ArrowUp, ArrowDown, ArrowUpDown, Copy, AlertTriangle } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DatePeriodFilter, useDatePeriodFilter } from './DatePeriodFilter';
import { exportToExcel, exportToCSV } from '@/lib/export-utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { JournalEntryDuplicateDialog } from './JournalEntryDuplicateDialog';
import { JournalEntryEditDialog } from './JournalEntryEditDialog';

interface JournalEntry {
  id: string;
  entry_number: string;
  document: string;
  date: string;
  type: 'sale' | 'expense' | 'cost' | 'journal' | 'purchase' | 'credit_note';
  description: string;
  account_code: string;
  account_name: string;
  credit_account_code: string;
  credit_account_name: string;
  debit_usd: number;
  credit_usd: number;
  debit_dop: number;
  credit_dop: number;
  exchange_rate: number;
  vendor_client: string;
  ref: string;
  raw: any;
}

const TYPE_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  sale: { label: 'Venta', emoji: '💰', color: 'text-success' },
  expense: { label: 'Gasto', emoji: '📤', color: 'text-destructive' },
  cost: { label: 'Costo', emoji: '🏭', color: 'text-warning' },
  journal: { label: 'Asiento', emoji: '📒', color: 'text-primary' },
  purchase: { label: 'Compra', emoji: '📦', color: 'text-blue-400' },
  credit_note: { label: 'NC', emoji: '📝', color: 'text-emerald-400' },
};

type SortField = 'date' | 'type' | 'description' | 'account_name' | 'credit_account_name' | 'vendor_client' | 'debit_usd' | 'credit_usd' | 'debit_dop';
type SortDir = 'asc' | 'desc';

/** Infer transaction type from journal entry description */
function inferType(desc: string): JournalEntry['type'] {
  const d = desc.toLowerCase();
  if (d.startsWith('venta')) return 'sale';
  if (d.startsWith('gasto')) return 'expense';
  if (d.startsWith('costo')) return 'cost';
  if (d.startsWith('compra')) return 'purchase';
  if (d.startsWith('nota de crédito') || d.startsWith('nota de credito')) return 'credit_note';
  return 'journal';
}

/** Extract vendor/client from description (format: "Type ... — Name") */
function extractVendorClient(desc: string): string {
  const parts = desc.split('—');
  if (parts.length > 1) {
    // Try the second part first (format: "Type ... — Name — Amount")
    for (let i = 1; i < parts.length; i++) {
      const candidate = parts[i].trim();
      // Skip if it looks like an amount (RD$, $, or purely numeric)
      if (candidate.startsWith('$') || candidate.startsWith('RD$') || /^[\d,.]+$/.test(candidate)) continue;
      return candidate;
    }
  }
  return '—';
}

/** Extract document/reference (factura, PO, NC, etc.) from description first segment */
function extractDocument(desc: string): string {
  // Patterns like "Venta INV-001 — ...", "Compra PO-123 — ...", "Nota de crédito NC-7 — ..."
  const m = desc.match(/^(?:Venta|Compra|Nota de cr[eé]dito|NC|Gasto|Costo|Asiento)\s+([^\s—]+)/i);
  if (m && m[1]) return m[1];
  return '';
}

interface Props {
  journalEntries?: any[];
  rate: number;
}

export function LibroDiarioTab({ journalEntries = [], rate }: Props) {
  const queryClient = useQueryClient();
  const { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, filterByDate } = useDatePeriodFilter();
  const [urlParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(urlParams.get('q') || '');
  // Sincronizar con cambios en el query param (deep-link desde otras pantallas)
  useEffect(() => {
    const q = urlParams.get('q');
    if (q) setSearchQuery(q);
  }, [urlParams]);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [deleteEntry, setDeleteEntry] = useState<JournalEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [duplicateEntry, setDuplicateEntry] = useState<any>(null);
  const [editEntry, setEditEntry] = useState<any>(null);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Fetch sales w/ items to enrich export with discount info per sale
  const { data: salesWithItems = [] } = useQuery({
    queryKey: ['sales-discount-map'],
    queryFn: async () => {
      const { data } = await supabase
        .from('sales')
        .select('id, invoice_ref, sale_items(quantity, unit_price_usd, gross_unit_price_usd, discount_pct, discount_amount_usd)');
      return data || [];
    },
  });

  // Map: short id (first 8 chars) and invoice_ref → discount totals
  const discountBySaleKey = useMemo(() => {
    const map = new Map<string, { discount_usd: number; gross_usd: number; discount_pct: number }>();
    (salesWithItems as any[]).forEach((s: any) => {
      const items = s.sale_items || [];
      const discountUsd = items.reduce((sum: number, it: any) => sum + Number(it.discount_amount_usd || 0), 0);
      const grossUsd = items.reduce((sum: number, it: any) => sum + Number(it.gross_unit_price_usd || it.unit_price_usd || 0) * Number(it.quantity || 0), 0);
      const pct = grossUsd > 0 ? (discountUsd / grossUsd) * 100 : 0;
      const payload = { discount_usd: discountUsd, gross_usd: grossUsd, discount_pct: pct };
      map.set(s.id.slice(0, 8), payload);
      if (s.invoice_ref) map.set(String(s.invoice_ref), payload);
    });
    return map;
  }, [salesWithItems]);

  /** For a sale journal entry, find discount via invoice_ref or short id parsed from description "Venta XXXXXXXX — ..." */
  const getSaleDiscount = useCallback((desc: string) => {
    const m = desc.match(/Venta\s+([^\s—]+)/i);
    if (!m) return null;
    return discountBySaleKey.get(m[1]) || null;
  }, [discountBySaleKey]);


  const toggleSort = useCallback((field: SortField) => {
    setSortField(prev => {
      if (prev === field) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return field;
      }
      setSortDir('desc');
      return field;
    });
  }, []);

  // Build entries from ONLY journal_entries — single source of truth
  const entries: JournalEntry[] = useMemo(() => {
    const all: JournalEntry[] = [];

    // Sort ASC first to assign correlative entry numbers per year, then we will display DESC
    const ascending = [...journalEntries].sort((a: any, b: any) => {
      const dateCmp = (a.date || '').localeCompare(b.date || '');
      if (dateCmp !== 0) return dateCmp;
      return (a.created_at || '').localeCompare(b.created_at || '');
    });

    const yearCounters = new Map<string, number>();
    const numberById = new Map<string, string>();
    ascending.forEach((je: any) => {
      const year = (je.date || '').slice(0, 4) || '----';
      const next = (yearCounters.get(year) || 0) + 1;
      yearCounters.set(year, next);
      numberById.set(je.id, `AS-${year}-${String(next).padStart(5, '0')}`);
    });

    // Display order: DESC by date, then created_at
    const sorted = [...journalEntries].sort((a: any, b: any) => {
      const dateCmp = (b.date || '').localeCompare(a.date || '');
      if (dateCmp !== 0) return dateCmp;
      return (b.created_at || '').localeCompare(a.created_at || '');
    });

    sorted.forEach((je: any) => {
      const lines = je.journal_entry_lines || [];
      const debitLines = lines.filter((l: any) => Number(l.debit_usd) > 0);
      const creditLines = lines.filter((l: any) => Number(l.credit_usd) > 0);
      const totalDebit = Number(je.total_debit_usd || 0);
      const totalCredit = Number(je.total_credit_usd || 0);
      const exRate = Number(je.exchange_rate) || rate;
      const type = inferType(je.description);
      const vendorClient = extractVendorClient(je.description);
      const document = extractDocument(je.description);

      all.push({
        id: je.id,
        entry_number: numberById.get(je.id) || '',
        document,
        date: je.date,
        type,
        description: je.description,
        account_code: debitLines.map((l: any) => l.chart_of_accounts?.code).filter(Boolean).join(', '),
        account_name: debitLines.map((l: any) => l.chart_of_accounts?.description).filter(Boolean).join(' / ') || 'Sin cuenta',
        credit_account_code: creditLines.map((l: any) => l.chart_of_accounts?.code).filter(Boolean).join(', '),
        credit_account_name: creditLines.map((l: any) => l.chart_of_accounts?.description).filter(Boolean).join(' / ') || 'Sin cuenta',
        debit_usd: totalDebit,
        credit_usd: totalCredit,
        debit_dop: totalDebit * exRate,
        credit_dop: totalCredit * exRate,
        exchange_rate: exRate,
        vendor_client: vendorClient,
        ref: document,
        raw: je,
      });
    });

    return all;
  }, [journalEntries, rate]);

  // Pre-filtered set: respects month/year/type/period but NOT the search box.
  // Used to feed autocomplete suggestions so they stay scoped to current filters.
  const preFiltered = useMemo(() => {
    let items = filterByDate(entries);
    if (typeFilter !== 'all') items = items.filter(e => e.type === typeFilter);
    if (yearFilter !== 'all') items = items.filter(e => e.date?.slice(0, 4) === yearFilter);
    if (monthFilter !== 'all') items = items.filter(e => e.date?.slice(5, 7) === monthFilter);
    return items;
  }, [entries, filterByDate, typeFilter, yearFilter, monthFilter]);

  const filtered = useMemo(() => {
    let items = preFiltered;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(e =>
        e.description.toLowerCase().includes(q) ||
        e.vendor_client.toLowerCase().includes(q) ||
        e.account_name.toLowerCase().includes(q) ||
        e.credit_account_name.toLowerCase().includes(q) ||
        e.entry_number.toLowerCase().includes(q) ||
        e.document.toLowerCase().includes(q)
      );
    }
    items = [...items];
    items.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'date') cmp = a.date.localeCompare(b.date);
      else if (sortField === 'type') cmp = a.type.localeCompare(b.type);
      else if (sortField === 'description') cmp = a.description.localeCompare(b.description);
      else if (sortField === 'account_name') cmp = a.account_name.localeCompare(b.account_name);
      else if (sortField === 'credit_account_name') cmp = a.credit_account_name.localeCompare(b.credit_account_name);
      else if (sortField === 'vendor_client') cmp = a.vendor_client.localeCompare(b.vendor_client);
      else if (sortField === 'debit_usd') cmp = a.debit_usd - b.debit_usd;
      else if (sortField === 'credit_usd') cmp = a.credit_usd - b.credit_usd;
      else if (sortField === 'debit_dop') cmp = (a.debit_dop || a.credit_dop) - (b.debit_dop || b.credit_dop);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return items;
  }, [preFiltered, searchQuery, sortField, sortDir]);

  // Build autocomplete suggestions from preFiltered (so they respect mes/año/tipo/período)
  const [searchOpen, setSearchOpen] = useState(false);
  const suggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matches = (s: string) => !q || s.toLowerCase().includes(q);

    const entriesGroup: { value: string; label: string; sub: string }[] = [];
    const documentsMap = new Map<string, string>();
    const clientsMap = new Map<string, number>();

    preFiltered.forEach(e => {
      if (matches(e.entry_number) || matches(e.description)) {
        entriesGroup.push({
          value: e.entry_number,
          label: e.entry_number,
          sub: `${e.date} · ${TYPE_LABELS[e.type]?.label || e.type} · ${e.vendor_client}`,
        });
      }
      if (e.document && (matches(e.document) || matches(e.vendor_client))) {
        if (!documentsMap.has(e.document)) {
          documentsMap.set(e.document, `${TYPE_LABELS[e.type]?.label || e.type} · ${e.vendor_client}`);
        }
      }
      if (e.vendor_client && e.vendor_client !== '—' && matches(e.vendor_client)) {
        clientsMap.set(e.vendor_client, (clientsMap.get(e.vendor_client) || 0) + 1);
      }
    });

    return {
      entries: entriesGroup.slice(0, 8),
      documents: Array.from(documentsMap.entries()).slice(0, 8).map(([value, sub]) => ({ value, sub })),
      clients: Array.from(clientsMap.entries()).slice(0, 8).map(([value, count]) => ({ value, count })),
    };
  }, [preFiltered, searchQuery]);


  const availableYears = useMemo(() => {
    const years = new Set<string>();
    entries.forEach(e => { if (e.date) years.add(e.date.slice(0, 4)); });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [entries]);

  const totals = useMemo(() => ({
    debit_usd: filtered.reduce((s, e) => s + e.debit_usd, 0),
    credit_usd: filtered.reduce((s, e) => s + e.credit_usd, 0),
    debit_dop: filtered.reduce((s, e) => s + e.debit_dop, 0),
    credit_dop: filtered.reduce((s, e) => s + e.credit_dop, 0),
  }), [filtered]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-2.5 h-2.5 ml-0.5 opacity-30" />;
    return sortDir === 'asc' ? <ArrowUp className="w-2.5 h-2.5 ml-0.5" /> : <ArrowDown className="w-2.5 h-2.5 ml-0.5" />;
  };

  const SortableHead = ({ field, children, className }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <TableHead
      className={cn('text-[10px] font-semibold cursor-pointer select-none hover:text-foreground transition-colors', className)}
      onClick={() => toggleSort(field)}
    >
      <span className="inline-flex items-center gap-0.5">
        {children}
        <SortIcon field={field} />
      </span>
    </TableHead>
  );

  const handleDelete = async () => {
    if (!deleteEntry) return;
    setDeleting(true);
    try {
      await supabase.from('journal_entry_lines').delete().eq('journal_entry_id', deleteEntry.id);
      const { error } = await supabase.from('journal_entries').delete().eq('id', deleteEntry.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      toast.success('Asiento eliminado');
      setDeleteEntry(null);
    } catch (e: any) {
      toast.error(e.message || 'Error al eliminar');
    }
    setDeleting(false);
  };

  const buildExportRows = () => filtered.map(e => {
    const disc = e.type === 'sale' ? getSaleDiscount(e.description) : null;
    return {
      'N° Asiento': e.entry_number,
      'Documento': e.document || '',
      Fecha: e.date,
      Tipo: TYPE_LABELS[e.type]?.label || e.type,
      Descripción: e.description,
      'Proveedor/Cliente': e.vendor_client,
      'Cuenta Débito': e.account_name,
      'Código Débito': e.account_code,
      'Cuenta Crédito': e.credit_account_name,
      'Código Crédito': e.credit_account_code,
      'Débito USD': e.debit_usd || '',
      'Crédito USD': e.credit_usd || '',
      'Débito DOP': e.debit_dop || '',
      'Crédito DOP': e.credit_dop || '',
      'Bruto USD (s/desc.)': disc ? Number(disc.gross_usd.toFixed(2)) : '',
      'Descuento USD': disc && disc.discount_usd > 0 ? Number(disc.discount_usd.toFixed(2)) : '',
      'Descuento %': disc && disc.discount_usd > 0 ? Number(disc.discount_pct.toFixed(2)) : '',
      'Tasa Cambio': e.exchange_rate,
    };
  });

  const exportFilename = () => {
    const parts = ['libro-diario'];
    if (yearFilter !== 'all') parts.push(yearFilter);
    if (monthFilter !== 'all') parts.push(monthFilter);
    if (typeFilter !== 'all') parts.push(typeFilter);
    return parts.join('-');
  };

  const handleExportExcel = () => {
    const rows = buildExportRows();
    if (rows.length === 0) { toast.error('Sin asientos para exportar'); return; }
    exportToExcel(rows, exportFilename(), 'Libro Diario');
    toast.success(`${rows.length} asientos exportados a Excel`);
  };

  const handleExportCSV = () => {
    const rows = buildExportRows();
    if (rows.length === 0) { toast.error('Sin asientos para exportar'); return; }
    exportToCSV(rows, exportFilename());
    toast.success(`${rows.length} asientos exportados a CSV`);
  };


  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Popover open={searchOpen} onOpenChange={setSearchOpen}>
          <PopoverTrigger asChild>
            <div className="relative flex-1 min-w-[160px] max-w-[320px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Buscar # asiento, documento, cliente…"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); if (!searchOpen) setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                className="h-8 pl-8 text-xs rounded-lg"
              />
            </div>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-[320px]" align="start" onOpenAutoFocus={e => e.preventDefault()}>
            <Command shouldFilter={false}>
              <CommandList>
                <CommandEmpty className="text-xs py-4 text-center text-muted-foreground">Sin coincidencias</CommandEmpty>
                {suggestions.entries.length > 0 && (
                  <CommandGroup heading="Asientos">
                    {suggestions.entries.map(s => (
                      <CommandItem key={`e-${s.value}`} value={`e-${s.value}`} onSelect={() => { setSearchQuery(s.value); setSearchOpen(false); }} className="text-xs">
                        <div className="flex flex-col">
                          <span className="font-mono font-medium">{s.label}</span>
                          <span className="text-[10px] text-muted-foreground">{s.sub}</span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {suggestions.documents.length > 0 && (
                  <CommandGroup heading="Documentos / Referencias">
                    {suggestions.documents.map(s => (
                      <CommandItem key={`d-${s.value}`} value={`d-${s.value}`} onSelect={() => { setSearchQuery(s.value); setSearchOpen(false); }} className="text-xs">
                        <div className="flex flex-col">
                          <span className="font-mono font-medium">{s.value}</span>
                          <span className="text-[10px] text-muted-foreground">{s.sub}</span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {suggestions.clients.length > 0 && (
                  <CommandGroup heading="Clientes / Proveedores">
                    {suggestions.clients.map(s => (
                      <CommandItem key={`c-${s.value}`} value={`c-${s.value}`} onSelect={() => { setSearchQuery(s.value); setSearchOpen(false); }} className="text-xs">
                        <div className="flex justify-between w-full">
                          <span>{s.value}</span>
                          <span className="text-[10px] text-muted-foreground">{s.count} mov.</span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 text-xs w-auto min-w-[120px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Todos</SelectItem>
            <SelectItem value="sale" className="text-xs">💰 Ventas</SelectItem>
            <SelectItem value="expense" className="text-xs">📤 Gastos</SelectItem>
            <SelectItem value="cost" className="text-xs">🏭 Costos</SelectItem>
            <SelectItem value="journal" className="text-xs">📒 Asientos</SelectItem>
            <SelectItem value="purchase" className="text-xs">📦 Compras</SelectItem>
            <SelectItem value="credit_note" className="text-xs">📝 NC</SelectItem>
          </SelectContent>
        </Select>
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="h-8 text-xs w-auto min-w-[110px]">
            <SelectValue placeholder="Mes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Todos los meses</SelectItem>
            {[
              ['01', 'Enero'], ['02', 'Febrero'], ['03', 'Marzo'], ['04', 'Abril'],
              ['05', 'Mayo'], ['06', 'Junio'], ['07', 'Julio'], ['08', 'Agosto'],
              ['09', 'Septiembre'], ['10', 'Octubre'], ['11', 'Noviembre'], ['12', 'Diciembre'],
            ].map(([v, l]) => (
              <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="h-8 text-xs w-auto min-w-[90px]">
            <SelectValue placeholder="Año" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Todos los años</SelectItem>
            {availableYears.map(y => (
              <SelectItem key={y} value={y} className="text-xs">{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DatePeriodFilter period={period} setPeriod={setPeriod} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="ml-auto">
              <Download className="w-3.5 h-3.5 mr-1" /> Exportar ({filtered.length})
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleExportExcel} className="text-xs">
              <Download className="w-3.5 h-3.5 mr-2" /> Excel (.xlsx)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportCSV} className="text-xs">
              <Download className="w-3.5 h-3.5 mr-2" /> CSV (.csv)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl bg-card border border-border p-3 text-center">
          <p className="text-xs text-muted-foreground">Asientos</p>
          <p className="text-lg font-bold text-foreground">{filtered.length}</p>
        </div>
        <div className="rounded-xl bg-card border border-border p-3 text-center">
          <p className="text-xs text-muted-foreground">Total Débitos</p>
          <p className="text-lg font-bold text-warning">{formatUSD(totals.debit_usd)}</p>
        </div>
        <div className="rounded-xl bg-card border border-border p-3 text-center">
          <p className="text-xs text-muted-foreground">Total Créditos</p>
          <p className="text-lg font-bold text-success">{formatUSD(totals.credit_usd)}</p>
        </div>
        <div className="rounded-xl bg-card border border-border p-3 text-center">
          <p className="text-xs text-muted-foreground">Balance</p>
          <p className={cn('text-lg font-bold', Math.abs(totals.debit_usd - totals.credit_usd) < 0.01 ? 'text-success' : 'text-destructive')}>
            {Math.abs(totals.debit_usd - totals.credit_usd) < 0.01 ? '✓ Cuadrado' : formatUSD(totals.debit_usd - totals.credit_usd)}
          </p>
        </div>
      </div>

      {/* Table */}
      <TooltipProvider delayDuration={200}>
      <div className="rounded-2xl bg-card border border-border overflow-auto max-h-[calc(100vh-320px)]">
        <Table wrapperClassName="overflow-auto">
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
            <TableRow>
              <SortableHead field="date">Fecha</SortableHead>
              <SortableHead field="type">Tipo</SortableHead>
              <SortableHead field="description">Descripción</SortableHead>
              <SortableHead field="vendor_client">Prov./Cliente</SortableHead>
              <TableHead className="text-[10px] font-semibold">Cód. D</TableHead>
              <SortableHead field="account_name">Cuenta Débito</SortableHead>
              <TableHead className="text-[10px] font-semibold">Cód. C</TableHead>
              <SortableHead field="credit_account_name">Cuenta Crédito</SortableHead>
              <SortableHead field="debit_usd" className="text-right">Débito USD</SortableHead>
              <SortableHead field="credit_usd" className="text-right">Crédito USD</SortableHead>
              <SortableHead field="debit_dop" className="text-right">DOP</SortableHead>
              <TableHead className="text-[10px] w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(e => {
              const tl = TYPE_LABELS[e.type] || TYPE_LABELS.journal;
              const unbalanced = Math.abs(e.debit_usd - e.credit_usd) >= 0.01;
              return (
                <TableRow key={e.id} className={cn(unbalanced && 'bg-destructive/5 border-l-2 border-l-destructive')}>
                  <TableCell className="text-xs font-mono text-muted-foreground whitespace-nowrap">{e.date}</TableCell>
                  <TableCell>
                    <span className={cn('text-[10px] font-medium', tl.color)}>
                      {unbalanced && <Tooltip><TooltipTrigger asChild><AlertTriangle className="w-3 h-3 text-destructive inline mr-0.5" /></TooltipTrigger><TooltipContent className="text-xs">Descuadre: {formatUSD(Math.abs(e.debit_usd - e.credit_usd))}</TooltipContent></Tooltip>}
                      {tl.emoji} {tl.label}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs max-w-[200px]">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="block truncate">{e.description}</span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">{e.description}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[120px]">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="block truncate">{e.vendor_client}</span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">{e.vendor_client}</TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">{e.account_code || '—'}</TableCell>
                  <TableCell className="text-xs max-w-[130px]">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="block truncate">{e.account_name}</span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        {e.account_code && <span className="font-mono text-muted-foreground">{e.account_code} — </span>}
                        {e.account_name}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-[10px] font-mono text-muted-foreground whitespace-nowrap">{e.credit_account_code || '—'}</TableCell>
                  <TableCell className="text-xs max-w-[130px]">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="block truncate">{e.credit_account_name}</span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        {e.credit_account_code && <span className="font-mono text-muted-foreground">{e.credit_account_code} — </span>}
                        {e.credit_account_name}
                      </TooltipContent>
                    </Tooltip>
                  </TableCell>
                  <TableCell className="text-xs text-right font-mono">{e.debit_usd > 0 ? formatUSD(e.debit_usd) : '—'}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{e.credit_usd > 0 ? formatUSD(e.credit_usd) : '—'}</TableCell>
                  <TableCell className="text-xs text-right font-mono text-muted-foreground">{formatDOP(e.debit_dop || e.credit_dop)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => setEditEntry(e.raw)} title="Editar asiento"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDuplicateEntry(e.raw)} title="Duplicar asiento"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteEntry(e)} title="Eliminar asiento"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-sm text-muted-foreground py-8">
                  No hay asientos contables registrados
                </TableCell>
              </TableRow>
            )}
            {filtered.length > 0 && (
              <TableRow className="font-bold bg-muted/30">
                <TableCell colSpan={8} className="text-xs font-bold">TOTALES</TableCell>
                <TableCell className="text-xs text-right font-bold font-mono">{formatUSD(totals.debit_usd)}</TableCell>
                <TableCell className="text-xs text-right font-bold font-mono">{formatUSD(totals.credit_usd)}</TableCell>
                <TableCell className="text-xs text-right font-bold font-mono text-muted-foreground">{formatDOP(totals.debit_dop)}</TableCell>
                <TableCell />
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      </TooltipProvider>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteEntry} onOpenChange={(v) => { if (!v) setDeleteEntry(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar Asiento Contable</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar el asiento "<strong>{deleteEntry?.description}</strong>" por <strong>{formatUSD(deleteEntry?.debit_usd || 0)}</strong>?
              <br /><span className="text-destructive text-xs">Esto eliminará la partida contable. La transacción original (venta/gasto/costo) no se afecta.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate Dialog */}
      <JournalEntryDuplicateDialog
        open={!!duplicateEntry}
        onOpenChange={(v) => { if (!v) setDuplicateEntry(null); }}
        sourceEntry={duplicateEntry}
        rate={rate}
      />

      {/* Edit Dialog */}
      <JournalEntryEditDialog
        open={!!editEntry}
        onOpenChange={(v) => { if (!v) setEditEntry(null); }}
        entry={editEntry}
        rate={rate}
      />
    </div>
  );
}
