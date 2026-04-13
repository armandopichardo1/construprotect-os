import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatUSD } from '@/lib/format';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Line {
  account_id: string;
  debit_usd: number;
  credit_usd: number;
  description: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The raw journal entry to duplicate (with journal_entry_lines + chart_of_accounts) */
  sourceEntry: any;
  rate: number;
}

export function JournalEntryDuplicateDialog({ open, onOpenChange, sourceEntry, rate }: Props) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [exchangeRate, setExchangeRate] = useState(rate);
  const [lines, setLines] = useState<Line[]>([]);

  const { data: accounts = [] } = useQuery({
    queryKey: ['chart-of-accounts-active'],
    queryFn: async () => {
      const { data } = await supabase.from('chart_of_accounts').select('id, code, description').eq('is_active', true).order('code');
      return data || [];
    },
  });

  // Populate from source when dialog opens
  useEffect(() => {
    if (!open || !sourceEntry) return;
    const today = new Date().toISOString().slice(0, 10);
    setDate(today);
    setDescription(`(Copia) ${sourceEntry.description}`);
    setNotes(sourceEntry.notes || '');
    setExchangeRate(Number(sourceEntry.exchange_rate) || rate);
    const srcLines = sourceEntry.journal_entry_lines || [];
    setLines(srcLines.map((l: any) => ({
      account_id: l.account_id,
      debit_usd: Number(l.debit_usd) || 0,
      credit_usd: Number(l.credit_usd) || 0,
      description: l.description || '',
    })));
  }, [open, sourceEntry, rate]);

  const totalDebit = useMemo(() => lines.reduce((s, l) => s + l.debit_usd, 0), [lines]);
  const totalCredit = useMemo(() => lines.reduce((s, l) => s + l.credit_usd, 0), [lines]);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
  const allAccountsSet = lines.every(l => l.account_id);
  const canSave = isBalanced && allAccountsSet && lines.length >= 2 && date && description.trim();

  const updateLine = (idx: number, field: keyof Line, value: any) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  const removeLine = (idx: number) => {
    if (lines.length <= 2) return;
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  const addLine = () => {
    setLines(prev => [...prev, { account_id: '', debit_usd: 0, credit_usd: 0, description: '' }]);
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const { data: je, error: jeErr } = await supabase.from('journal_entries').insert({
        date,
        description: description.trim(),
        notes: notes.trim() || null,
        exchange_rate: exchangeRate,
        total_debit_usd: totalDebit,
        total_credit_usd: totalCredit,
      }).select('id').single();
      if (jeErr) throw jeErr;

      const newLines = lines.map(l => ({
        journal_entry_id: je.id,
        account_id: l.account_id,
        debit_usd: l.debit_usd,
        credit_usd: l.credit_usd,
        description: l.description || null,
      }));
      const { error: lErr } = await supabase.from('journal_entry_lines').insert(newLines);
      if (lErr) throw lErr;

      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      toast.success('Asiento duplicado exitosamente');
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Error al duplicar');
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Duplicar Asiento Contable</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">Tasa de Cambio</Label>
              <Input type="number" step="0.01" value={exchangeRate} onChange={e => setExchangeRate(Number(e.target.value))} className="h-8 text-xs" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Descripción</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} className="h-8 text-xs" />
          </div>
          <div>
            <Label className="text-xs">Notas</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="text-xs min-h-[50px]" />
          </div>

          {/* Lines */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Líneas del Asiento</Label>
              <Button variant="outline" size="sm" onClick={addLine} className="h-6 text-[10px] gap-1">
                <Plus className="w-3 h-3" /> Línea
              </Button>
            </div>
            <div className="space-y-1.5">
              {lines.map((line, idx) => (
                <div key={idx} className="flex items-center gap-1.5 p-1.5 rounded-lg bg-muted/30 border border-border">
                  <Select value={line.account_id} onValueChange={v => updateLine(idx, 'account_id', v)}>
                    <SelectTrigger className="h-7 text-[10px] flex-1 min-w-0">
                      <SelectValue placeholder="Cuenta..." />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map(a => (
                        <SelectItem key={a.id} value={a.id} className="text-[10px]">
                          {a.code} — {a.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input type="number" step="0.01" min="0" placeholder="Débito" value={line.debit_usd || ''}
                    onChange={e => updateLine(idx, 'debit_usd', Number(e.target.value) || 0)}
                    className="h-7 w-20 text-[10px] text-right" />
                  <Input type="number" step="0.01" min="0" placeholder="Crédito" value={line.credit_usd || ''}
                    onChange={e => updateLine(idx, 'credit_usd', Number(e.target.value) || 0)}
                    className="h-7 w-20 text-[10px] text-right" />
                  <button onClick={() => removeLine(idx)} disabled={lines.length <= 2}
                    className="p-1 rounded text-muted-foreground hover:text-destructive disabled:opacity-30">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            {/* Totals */}
            <div className="flex justify-end gap-4 text-[10px] font-mono pt-1">
              <span className={cn(!isBalanced && 'text-destructive')}>
                Débitos: {formatUSD(totalDebit)}
              </span>
              <span className={cn(!isBalanced && 'text-destructive')}>
                Créditos: {formatUSD(totalCredit)}
              </span>
              {isBalanced ? (
                <span className="text-success font-semibold">✓ Cuadrado</span>
              ) : (
                <span className="text-destructive font-semibold">Descuadre: {formatUSD(Math.abs(totalDebit - totalCredit))}</span>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!canSave || saving} className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Guardando...' : 'Crear Duplicado'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
