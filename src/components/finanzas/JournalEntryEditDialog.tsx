import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatUSD } from '@/lib/format';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditLine {
  id?: string;
  account_id: string;
  debit_usd: number;
  credit_usd: number;
  description: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  journalEntry: any; // raw journal entry with journal_entry_lines
}

export function JournalEntryEditDialog({ open, onOpenChange, journalEntry }: Props) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  // Header fields
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [lines, setLines] = useState<EditLine[]>([]);

  // Load accounts
  const { data: accounts = [] } = useQuery({
    queryKey: ['chart-of-accounts-edit'],
    queryFn: async () => {
      const { data } = await supabase.from('chart_of_accounts').select('id, code, description, account_type').eq('is_active', true).order('code');
      return data || [];
    },
  });

  // Initialize form from journalEntry
  useEffect(() => {
    if (!journalEntry || !open) return;
    setDate(journalEntry.date || '');
    setDescription(journalEntry.description || '');
    setNotes(journalEntry.notes || '');
    setExchangeRate(journalEntry.exchange_rate ? String(journalEntry.exchange_rate) : '');
    const entryLines = (journalEntry.journal_entry_lines || []).map((l: any) => ({
      id: l.id,
      account_id: l.account_id || '',
      debit_usd: Number(l.debit_usd || 0),
      credit_usd: Number(l.credit_usd || 0),
      description: l.description || '',
    }));
    setLines(entryLines.length ? entryLines : [{ account_id: '', debit_usd: 0, credit_usd: 0, description: '' }]);
  }, [journalEntry, open]);

  const totalDebit = useMemo(() => lines.reduce((s, l) => s + l.debit_usd, 0), [lines]);
  const totalCredit = useMemo(() => lines.reduce((s, l) => s + l.credit_usd, 0), [lines]);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const updateLine = (idx: number, field: keyof EditLine, value: any) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const addLine = () => {
    setLines(prev => [...prev, { account_id: '', debit_usd: 0, credit_usd: 0, description: '' }]);
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 2) return;
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!journalEntry) return;
    if (!isBalanced) { toast.error('El asiento no está cuadrado'); return; }
    if (lines.some(l => !l.account_id)) { toast.error('Todas las líneas necesitan una cuenta'); return; }
    if (totalDebit === 0) { toast.error('El asiento no puede estar en cero'); return; }

    setSaving(true);
    try {
      // Update header
      const { error: headerErr } = await supabase.from('journal_entries').update({
        date,
        description,
        notes: notes || null,
        exchange_rate: exchangeRate ? Number(exchangeRate) : null,
        total_debit_usd: Math.round(totalDebit * 100) / 100,
        total_credit_usd: Math.round(totalCredit * 100) / 100,
      }).eq('id', journalEntry.id);
      if (headerErr) throw headerErr;

      // Delete old lines and insert new ones
      await supabase.from('journal_entry_lines').delete().eq('journal_entry_id', journalEntry.id);
      const { error: linesErr } = await supabase.from('journal_entry_lines').insert(
        lines.map(l => ({
          journal_entry_id: journalEntry.id,
          account_id: l.account_id,
          debit_usd: Math.round(l.debit_usd * 100) / 100,
          credit_usd: Math.round(l.credit_usd * 100) / 100,
          description: l.description || description,
        }))
      );
      if (linesErr) throw linesErr;

      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      toast.success('Asiento actualizado');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar');
    }
    setSaving(false);
  };

  const accountLabel = (id: string) => {
    const a = accounts.find((a: any) => a.id === id);
    return a ? `${a.code} — ${a.description}` : '';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Asiento Contable</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Header fields */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Descripción</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Tasa Cambio</Label>
              <Input type="number" step="0.01" value={exchangeRate} onChange={e => setExchangeRate(e.target.value)} placeholder="Ej: 60.50" className="h-8 text-xs" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Notas</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="text-xs min-h-[48px]" rows={2} />
          </div>

          {/* Lines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Líneas del Asiento</Label>
              <Button size="sm" variant="outline" onClick={addLine} className="h-7 text-xs">
                <Plus className="w-3 h-3 mr-1" /> Agregar Línea
              </Button>
            </div>

            <div className="rounded-xl border border-border overflow-hidden">
              <div className="grid grid-cols-[1fr_100px_100px_32px] gap-0 bg-muted/40 px-3 py-1.5">
                <span className="text-[10px] font-semibold text-muted-foreground">Cuenta</span>
                <span className="text-[10px] font-semibold text-muted-foreground text-right">Débito USD</span>
                <span className="text-[10px] font-semibold text-muted-foreground text-right">Crédito USD</span>
                <span />
              </div>
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_100px_100px_32px] gap-0 px-3 py-1 border-t border-border/50 items-center">
                  <Select value={line.account_id} onValueChange={v => updateLine(idx, 'account_id', v)}>
                    <SelectTrigger className="h-7 text-xs border-0 bg-transparent px-0 shadow-none">
                      <SelectValue placeholder="Seleccionar cuenta..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {accounts.map((a: any) => (
                        <SelectItem key={a.id} value={a.id} className="text-xs">
                          <span className="font-mono text-muted-foreground">{a.code}</span> {a.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number" step="0.01" min="0"
                    value={line.debit_usd || ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value) || 0;
                      updateLine(idx, 'debit_usd', val);
                      if (val > 0) updateLine(idx, 'credit_usd', 0);
                    }}
                    className="h-7 text-xs text-right border-0 bg-transparent shadow-none"
                    placeholder="0.00"
                  />
                  <Input
                    type="number" step="0.01" min="0"
                    value={line.credit_usd || ''}
                    onChange={e => {
                      const val = parseFloat(e.target.value) || 0;
                      updateLine(idx, 'credit_usd', val);
                      if (val > 0) updateLine(idx, 'debit_usd', 0);
                    }}
                    className="h-7 text-xs text-right border-0 bg-transparent shadow-none"
                    placeholder="0.00"
                  />
                  <button
                    onClick={() => removeLine(idx)}
                    disabled={lines.length <= 2}
                    className="p-1 rounded text-muted-foreground hover:text-destructive disabled:opacity-30"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              {/* Totals row */}
              <div className="grid grid-cols-[1fr_100px_100px_32px] gap-0 px-3 py-1.5 border-t border-border bg-muted/30 font-semibold">
                <span className="text-xs">TOTAL</span>
                <span className="text-xs text-right font-mono">{formatUSD(totalDebit)}</span>
                <span className="text-xs text-right font-mono">{formatUSD(totalCredit)}</span>
                <span />
              </div>
            </div>
            {!isBalanced && (
              <p className="text-xs text-destructive flex items-center gap-1">
                ⚠️ El asiento no cuadra. Diferencia: {formatUSD(Math.abs(totalDebit - totalCredit))}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !isBalanced}>
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
