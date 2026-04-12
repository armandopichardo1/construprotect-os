import { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatUSD, formatDOP } from '@/lib/format';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Search, Download, Save } from 'lucide-react';
import { DatePeriodFilter, useDatePeriodFilter } from './DatePeriodFilter';
import { exportToExcel } from '@/lib/export-utils';

interface JournalEntry {
  id: string;
  date: string;
  type: 'sale' | 'expense' | 'cost';
  description: string;
  category: string;
  account_code: string;
  account_name: string;
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
};

interface Props {
  sales: any[];
  expenses: any[];
  costs: any[];
  rate: number;
}

export function LibroDiarioTab({ sales, expenses, costs, rate }: Props) {
  const queryClient = useQueryClient();
  const { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, filterByDate } = useDatePeriodFilter();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [editEntry, setEditEntry] = useState<JournalEntry | null>(null);
  const [editForm, setEditForm] = useState({ description: '', amount_usd: '', amount_dop: '', date: '', category: '' });
  const [saving, setSaving] = useState(false);

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
        account_name: s.chart_of_accounts?.description || 'Ingresos por Ventas',
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

    return all.sort((a, b) => b.date.localeCompare(a.date));
  }, [sales, expenses, costs, rate]);

  const filtered = useMemo(() => {
    let items = filterByDate(entries);
    if (typeFilter !== 'all') items = items.filter(e => e.type === typeFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(e =>
        e.description.toLowerCase().includes(q) ||
        e.vendor_client.toLowerCase().includes(q) ||
        e.account_name.toLowerCase().includes(q) ||
        e.ref.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q)
      );
    }
    return items;
  }, [entries, typeFilter, searchQuery, filterByDate]);

  const totals = useMemo(() => ({
    debit_usd: filtered.reduce((s, e) => s + e.debit_usd, 0),
    credit_usd: filtered.reduce((s, e) => s + e.credit_usd, 0),
    debit_dop: filtered.reduce((s, e) => s + e.debit_dop, 0),
    credit_dop: filtered.reduce((s, e) => s + e.credit_dop, 0),
  }), [filtered]);

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

  const handleExport = () => {
    exportToExcel(filtered.map(e => ({
      Fecha: e.date,
      Tipo: TYPE_LABELS[e.type].label,
      Descripción: e.description,
      Cuenta: e.account_name,
      'Código Cuenta': e.account_code,
      'Débito USD': e.debit_usd || '',
      'Crédito USD': e.credit_usd || '',
      'Débito DOP': e.debit_dop || '',
      'Crédito DOP': e.credit_dop || '',
      'Tasa Cambio': e.exchange_rate,
      'Proveedor/Cliente': e.vendor_client,
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
          <p className="text-xs text-muted-foreground">Total Débitos USD</p>
          <p className="text-lg font-bold text-warning">{formatUSD(totals.debit_usd)}</p>
        </div>
        <div className="rounded-xl bg-card border border-border p-3 text-center">
          <p className="text-xs text-muted-foreground">Total Créditos USD</p>
          <p className="text-lg font-bold text-success">{formatUSD(totals.credit_usd)}</p>
        </div>
        <div className="rounded-xl bg-card border border-border p-3 text-center">
          <p className="text-xs text-muted-foreground">Balance USD</p>
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
              <TableHead className="text-[10px] font-semibold">Fecha</TableHead>
              <TableHead className="text-[10px] font-semibold">Tipo</TableHead>
              <TableHead className="text-[10px] font-semibold">Descripción</TableHead>
              <TableHead className="text-[10px] font-semibold hidden md:table-cell">Cuenta</TableHead>
              <TableHead className="text-[10px] font-semibold hidden lg:table-cell">Proveedor/Cliente</TableHead>
              <TableHead className="text-[10px] font-semibold text-right">Débito USD</TableHead>
              <TableHead className="text-[10px] font-semibold text-right">Crédito USD</TableHead>
              <TableHead className="text-[10px] font-semibold text-right hidden md:table-cell">DOP</TableHead>
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
                  <TableCell className="text-xs py-1.5 text-muted-foreground hidden md:table-cell truncate max-w-[150px]">
                    {entry.account_code ? `${entry.account_code} · ` : ''}{entry.account_name}
                  </TableCell>
                  <TableCell className="text-xs py-1.5 text-muted-foreground hidden lg:table-cell">{entry.vendor_client}</TableCell>
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
                    <button onClick={() => openEdit(entry)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition-opacity">
                      <Pencil className="w-3 h-3" />
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length > 0 && (
              <TableRow className="bg-muted/30 font-semibold">
                <TableCell colSpan={5} className="text-xs py-2 text-right">TOTALES</TableCell>
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
    </div>
  );
}
