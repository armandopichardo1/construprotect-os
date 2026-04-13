import { useState, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatUSD, formatDOP } from '@/lib/format';
import { getDefaultAccounts } from '@/lib/account-mapping';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Search, Download, Save, Trash2, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DatePeriodFilter, useDatePeriodFilter } from './DatePeriodFilter';
import { exportToExcel } from '@/lib/export-utils';

interface JournalEntry {
  id: string;
  date: string;
  type: 'sale' | 'expense' | 'cost' | 'journal';
  description: string;
  category: string;
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
};

type SortField = 'date' | 'type' | 'description' | 'account_name' | 'credit_account_name' | 'vendor_client' | 'debit_usd' | 'credit_usd' | 'debit_dop';
type SortDir = 'asc' | 'desc';

interface Props {
  sales: any[];
  expenses: any[];
  costs: any[];
  journalEntries?: any[];
  rate: number;
}

export function LibroDiarioTab({ sales, expenses, costs, journalEntries = [], rate }: Props) {
  const queryClient = useQueryClient();
  const { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, filterByDate } = useDatePeriodFilter();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [editEntry, setEditEntry] = useState<JournalEntry | null>(null);
  const [deleteEntry, setDeleteEntry] = useState<JournalEntry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editForm, setEditForm] = useState({ description: '', amount_usd: '', amount_dop: '', date: '', category: '' });
  const [saving, setSaving] = useState(false);
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

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

  const entries: JournalEntry[] = useMemo(() => {
    const all: JournalEntry[] = [];

    sales.forEach((s: any) => {
      const exRate = Number(s.exchange_rate) || rate;
      all.push({
        id: s.id,
        date: s.date,
        type: 'sale',
        description: `Venta ${s.invoice_ref || ''}`.trim(),
        category: 'Venta',
        account_code: s.chart_of_accounts?.code || '',
        account_name: s.chart_of_accounts?.description || 'Cuentas por Cobrar',
        credit_account_code: '',
        credit_account_name: 'Ingresos por Ventas',
        debit_usd: 0,
        credit_usd: Number(s.total_usd || 0),
        debit_dop: 0,
        credit_dop: Number(s.total_dop) || Number(s.total_usd || 0) * exRate,
        exchange_rate: exRate,
        vendor_client: s.contacts?.contact_name || '—',
        ref: s.invoice_ref || '',
        raw: s,
      });
    });

    expenses.forEach((e: any) => {
      const exRate = Number(e.exchange_rate) || rate;
      all.push({
        id: e.id,
        date: e.date,
        type: 'expense',
        description: e.description,
        category: e.category,
        account_code: e.chart_of_accounts?.code || '',
        account_name: e.chart_of_accounts?.description || e.category,
        credit_account_code: '',
        credit_account_name: 'Efectivo / Banco',
        debit_usd: Number(e.amount_usd || 0),
        credit_usd: 0,
        debit_dop: Number(e.amount_dop) || Number(e.amount_usd || 0) * exRate,
        credit_dop: 0,
        exchange_rate: exRate,
        vendor_client: e.vendor || '—',
        ref: '',
        raw: e,
      });
    });

    costs.forEach((c: any) => {
      const exRate = Number(c.exchange_rate) || rate;
      all.push({
        id: c.id,
        date: c.date,
        type: 'cost',
        description: c.description,
        category: c.category,
        account_code: c.chart_of_accounts?.code || '',
        account_name: c.chart_of_accounts?.description || c.category,
        credit_account_code: '',
        credit_account_name: 'Efectivo / Banco',
        debit_usd: Number(c.amount_usd || 0),
        credit_usd: 0,
        debit_dop: Number(c.amount_dop) || Number(c.amount_usd || 0) * exRate,
        credit_dop: 0,
        exchange_rate: exRate,
        vendor_client: c.vendor || '—',
        ref: '',
        raw: c,
      });
    });

    // Journal entries (manual)
    journalEntries.forEach((je: any) => {
      const totalDebit = Number(je.total_debit_usd || 0);
      const totalCredit = Number(je.total_credit_usd || 0);
      const exRate = Number(je.exchange_rate) || rate;
      const lines = je.journal_entry_lines || [];
      const debitLines = lines.filter((l: any) => Number(l.debit_usd) > 0);
      const creditLines = lines.filter((l: any) => Number(l.credit_usd) > 0);
      all.push({
        id: je.id,
        date: je.date,
        type: 'journal',
        description: je.description,
        category: 'Asiento Manual',
        account_code: debitLines.map((l: any) => l.chart_of_accounts?.code).filter(Boolean).join(', '),
        account_name: debitLines.map((l: any) => l.chart_of_accounts?.description).filter(Boolean).join(' / ') || 'Asiento',
        credit_account_code: creditLines.map((l: any) => l.chart_of_accounts?.code).filter(Boolean).join(', '),
        credit_account_name: creditLines.map((l: any) => l.chart_of_accounts?.description).filter(Boolean).join(' / ') || 'Asiento',
        debit_usd: totalDebit,
        credit_usd: totalCredit,
        debit_dop: totalDebit * exRate,
        credit_dop: totalCredit * exRate,
        exchange_rate: exRate,
        vendor_client: '—',
        ref: '',
        raw: je,
      });
    });

    return all;
  }, [sales, expenses, costs, journalEntries, rate]);

  const filtered = useMemo(() => {
    let items = filterByDate(entries);
    if (typeFilter !== 'all') items = items.filter(e => e.type === typeFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(e =>
        e.description.toLowerCase().includes(q) ||
        e.vendor_client.toLowerCase().includes(q) ||
        e.account_name.toLowerCase().includes(q) ||
        e.credit_account_name.toLowerCase().includes(q) ||
        e.ref.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q)
      );
    }
    // Sort
    items.sort((a, b) => {
      let cmp = 0;
      const fa = sortField;
      if (fa === 'date') cmp = a.date.localeCompare(b.date);
      else if (fa === 'type') cmp = a.type.localeCompare(b.type);
      else if (fa === 'description') cmp = a.description.localeCompare(b.description);
      else if (fa === 'account_name') cmp = a.account_name.localeCompare(b.account_name);
      else if (fa === 'credit_account_name') cmp = a.credit_account_name.localeCompare(b.credit_account_name);
      else if (fa === 'vendor_client') cmp = a.vendor_client.localeCompare(b.vendor_client);
      else if (fa === 'debit_usd') cmp = a.debit_usd - b.debit_usd;
      else if (fa === 'credit_usd') cmp = a.credit_usd - b.credit_usd;
      else if (fa === 'debit_dop') cmp = (a.debit_dop || a.credit_dop) - (b.debit_dop || b.credit_dop);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return items;
  }, [entries, typeFilter, searchQuery, filterByDate, sortField, sortDir]);

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

  const openEdit = (entry: JournalEntry) => {
    setEditEntry(entry);
    if (entry.type === 'sale') {
      setEditForm({
        description: entry.raw.invoice_ref || '',
        amount_usd: String(entry.raw.total_usd || 0),
        amount_dop: String(entry.raw.total_dop || 0),
        date: entry.date,
        category: '',
      });
    } else {
      setEditForm({
        description: entry.raw.description || '',
        amount_usd: String(entry.raw.amount_usd || 0),
        amount_dop: String(entry.raw.amount_dop || 0),
        date: entry.date,
        category: entry.raw.category || '',
      });
    }
  };

  const handleSave = async () => {
    if (!editEntry) return;
    setSaving(true);
    try {
      if (editEntry.type === 'sale') {
        const { error } = await supabase.from('sales').update({
          invoice_ref: editForm.description,
          date: editForm.date,
        }).eq('id', editEntry.id);
        if (error) throw error;
      } else if (editEntry.type === 'expense') {
        const { error } = await supabase.from('expenses').update({
          description: editForm.description,
          amount_usd: Number(editForm.amount_usd),
          amount_dop: Number(editForm.amount_dop),
          date: editForm.date,
          category: editForm.category as any,
        }).eq('id', editEntry.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('costs').update({
          description: editForm.description,
          amount_usd: Number(editForm.amount_usd),
          amount_dop: Number(editForm.amount_dop),
          date: editForm.date,
          category: editForm.category as any,
        }).eq('id', editEntry.id);
        if (error) throw error;
      }

      toast.success('Registro actualizado');
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['costs'] });
      setEditEntry(null);
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar');
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteEntry) return;
    setDeleting(true);
    try {
      if (deleteEntry.type === 'sale') {
        await supabase.from('sale_items').delete().eq('sale_id', deleteEntry.id);
        const { error } = await supabase.from('sales').delete().eq('id', deleteEntry.id);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ['sales'] });
        queryClient.invalidateQueries({ queryKey: ['sale-items'] });
      } else if (deleteEntry.type === 'expense') {
        const { error } = await supabase.from('expenses').delete().eq('id', deleteEntry.id);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ['expenses'] });
      } else if (deleteEntry.type === 'cost') {
        const { error } = await supabase.from('costs').delete().eq('id', deleteEntry.id);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ['costs'] });
      } else if (deleteEntry.type === 'journal') {
        await supabase.from('journal_entry_lines').delete().eq('journal_entry_id', deleteEntry.id);
        const { error } = await supabase.from('journal_entries').delete().eq('id', deleteEntry.id);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      }
      toast.success('Registro eliminado');
      setDeleteEntry(null);
    } catch (e: any) {
      toast.error(e.message || 'Error al eliminar');
    }
    setDeleting(false);
  };

  const handleExport = () => {
    exportToExcel(filtered.map(e => ({
      Fecha: e.date,
      Tipo: TYPE_LABELS[e.type].label,
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
      'Tasa Cambio': e.exchange_rate,
      Referencia: e.ref,
    })), 'libro-diario', 'Libro Diario');
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[160px] max-w-[280px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input placeholder="Buscar descripción, cuenta, proveedor..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="h-8 pl-8 text-xs rounded-lg" />
        </div>
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
          </SelectContent>
        </Select>
        <DatePeriodFilter period={period} setPeriod={setPeriod} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />
        <Button size="sm" variant="outline" onClick={handleExport} className="ml-auto">
          <Download className="w-3.5 h-3.5 mr-1" /> Excel
        </Button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl bg-card border border-border p-3 text-center">
          <p className="text-xs text-muted-foreground">Registros</p>
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
          <p className={cn('text-lg font-bold', (totals.debit_usd - totals.credit_usd) >= 0 ? 'text-warning' : 'text-success')}>
            {formatUSD(Math.abs(totals.debit_usd - totals.credit_usd))}
          </p>
        </div>
      </div>

      {/* Journal Table */}
      <div className="rounded-xl border border-border bg-card overflow-x-auto max-h-[calc(100vh-320px)] overflow-auto">
        <Table wrapperClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
            <TableRow>
              <SortableHead field="date">Fecha</SortableHead>
              <SortableHead field="type">Tipo</SortableHead>
              <SortableHead field="description">Descripción</SortableHead>
              <SortableHead field="vendor_client" className="hidden lg:table-cell">Proveedor/Cliente</SortableHead>
              <SortableHead field="account_name" className="hidden md:table-cell">Cta. Débito</SortableHead>
              <SortableHead field="credit_account_name" className="hidden md:table-cell">Cta. Crédito</SortableHead>
              <SortableHead field="debit_usd" className="text-right">Débito USD</SortableHead>
              <SortableHead field="credit_usd" className="text-right">Crédito USD</SortableHead>
              <SortableHead field="debit_dop" className="text-right hidden md:table-cell">DOP</SortableHead>
              <TableHead className="text-[10px] font-semibold w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(entry => {
              const cfg = TYPE_LABELS[entry.type];
              return (
                <TableRow key={`${entry.type}-${entry.id}`} className="group hover:bg-muted/30">
                  <TableCell className="text-xs py-1.5">{entry.date}</TableCell>
                  <TableCell className="py-1.5">
                    <span className={cn('text-[10px] font-medium', cfg.color)}>{cfg.emoji} {cfg.label}</span>
                  </TableCell>
                  <TableCell className="text-xs py-1.5 max-w-[200px] truncate">{entry.description}</TableCell>
                  <TableCell className="text-xs py-1.5 text-muted-foreground hidden lg:table-cell">{entry.vendor_client}</TableCell>
                  <TableCell className="text-xs py-1.5 text-muted-foreground hidden md:table-cell truncate max-w-[140px]">
                    {entry.account_code ? `${entry.account_code} · ` : ''}{entry.account_name}
                  </TableCell>
                  <TableCell className="text-xs py-1.5 text-muted-foreground hidden md:table-cell truncate max-w-[140px]">
                    {entry.credit_account_code ? `${entry.credit_account_code} · ` : ''}{entry.credit_account_name}
                  </TableCell>
                  <TableCell className="text-xs py-1.5 text-right font-mono">
                    {entry.debit_usd > 0 ? formatUSD(entry.debit_usd) : ''}
                  </TableCell>
                  <TableCell className="text-xs py-1.5 text-right font-mono">
                    {entry.credit_usd > 0 ? formatUSD(entry.credit_usd) : ''}
                  </TableCell>
                  <TableCell className="text-xs py-1.5 text-right font-mono text-muted-foreground hidden md:table-cell">
                    {formatDOP(entry.debit_dop || entry.credit_dop)}
                  </TableCell>
                  <TableCell className="py-1.5">
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEdit(entry)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={() => setDeleteEntry(entry)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length > 0 && (
              <TableRow className="bg-muted/30 font-semibold">
                <TableCell colSpan={4} className="text-xs py-2 text-right hidden lg:table-cell">TOTALES</TableCell>
                <TableCell colSpan={4} className="text-xs py-2 text-right lg:hidden">TOTALES</TableCell>
                <TableCell className="text-xs py-2 hidden md:table-cell" />
                <TableCell className="text-xs py-2 hidden md:table-cell" />
                <TableCell className="text-xs py-2 text-right font-mono">{formatUSD(totals.debit_usd)}</TableCell>
                <TableCell className="text-xs py-2 text-right font-mono">{formatUSD(totals.credit_usd)}</TableCell>
                <TableCell className="text-xs py-2 text-right font-mono text-muted-foreground hidden md:table-cell">
                  {formatDOP(totals.debit_dop + totals.credit_dop)}
                </TableCell>
                <TableCell />
              </TableRow>
            )}
          </TableBody>
        </Table>
        {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No hay registros en el período</p>}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editEntry} onOpenChange={v => { if (!v) setEditEntry(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Pencil className="w-4 h-4" />
              Editar {editEntry ? TYPE_LABELS[editEntry.type].label : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">{editEntry?.type === 'sale' ? 'Referencia' : 'Descripción'}</Label>
              <Input value={editForm.description} onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={editForm.date} onChange={e => setEditForm(p => ({ ...p, date: e.target.value }))} className="h-8 text-xs" />
            </div>
            {editEntry?.type !== 'sale' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Monto USD</Label>
                    <Input type="number" step="0.01" value={editForm.amount_usd} onChange={e => setEditForm(p => ({ ...p, amount_usd: e.target.value }))} className="h-8 text-xs" />
                  </div>
                  <div>
                    <Label className="text-xs">Monto DOP</Label>
                    <Input type="number" step="0.01" value={editForm.amount_dop} onChange={e => setEditForm(p => ({ ...p, amount_dop: e.target.value }))} className="h-8 text-xs" />
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setEditEntry(null)}>Cancelar</Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              <Save className="w-3.5 h-3.5 mr-1" /> {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteEntry} onOpenChange={v => { if (!v) setDeleteEntry(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este registro?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteEntry && (
                <>
                  <strong>{TYPE_LABELS[deleteEntry.type]?.emoji} {TYPE_LABELS[deleteEntry.type]?.label}</strong>: {deleteEntry.description}
                  <br />
                  Monto: {formatUSD(deleteEntry.debit_usd || deleteEntry.credit_usd)}
                  <br /><br />
                  Esta acción no se puede deshacer.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
