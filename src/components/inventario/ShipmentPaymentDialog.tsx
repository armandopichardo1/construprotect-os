import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatUSD } from '@/lib/format';
import { fetchAccounts, findCxPAccount } from '@/lib/accounting-utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shipment: any;
}

export function ShipmentPaymentDialog({ open, onOpenChange, shipment }: Props) {
  const queryClient = useQueryClient();
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const totalCost = Number(shipment?.total_cost_usd || 0);
  const amountPaid = Number(shipment?.amount_paid_usd || 0);
  const balance = totalCost - amountPaid;

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setPaymentDate(new Date().toISOString().split('T')[0]);
      setAccountId('');
      setAmount(balance.toFixed(2));
      setNotes('');
    }
  }, [open, balance]);

  const { data: accounts = [] } = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: async () => {
      const { data } = await supabase.from('chart_of_accounts')
        .select('id, code, description, account_type')
        .eq('is_active', true)
        .order('code');
      return data || [];
    },
  });

  // Payment history for this shipment
  const { data: payments = [] } = useQuery({
    queryKey: ['shipment-payments', shipment?.id],
    enabled: !!shipment?.id,
    queryFn: async () => {
      const { data } = await supabase.from('shipment_payments' as any)
        .select('*, chart_of_accounts:account_id(code, description)')
        .eq('shipment_id', shipment.id)
        .order('created_at', { ascending: true });
      return (data || []) as any[];
    },
  });

  const bankAccounts = accounts.filter(a =>
    a.account_type === 'Activo' && (
      a.code?.startsWith('11') || a.code?.startsWith('10') ||
      a.description?.toLowerCase().includes('banco') ||
      a.description?.toLowerCase().includes('caja') ||
      a.description?.toLowerCase().includes('efectivo')
    )
  );

  const accountOptions = bankAccounts.map(a => ({
    value: a.id,
    label: `${a.code || ''} — ${a.description}`,
  }));

  const payAmount = Number(amount) || 0;

  const handlePay = async () => {
    if (!accountId) { toast.error('Selecciona la cuenta de pago'); return; }
    if (payAmount <= 0) { toast.error('Ingresa un monto válido'); return; }
    if (payAmount > balance + 0.01) { toast.error(`El monto excede el saldo pendiente (${formatUSD(balance)})`); return; }

    setSaving(true);
    try {
      // 1. Insert payment record
      await supabase.from('shipment_payments' as any).insert({
        shipment_id: shipment.id,
        amount_usd: payAmount,
        payment_date: paymentDate,
        account_id: accountId,
        notes: notes || null,
      } as any);

      // 2. Update shipment totals
      const newTotalPaid = amountPaid + payAmount;
      const isFullyPaid = newTotalPaid >= totalCost - 0.01;
      await supabase.from('shipments').update({
        amount_paid_usd: newTotalPaid,
        payment_status: isFullyPaid ? 'paid' : 'partial',
        payment_date: paymentDate,
        payment_account_id: accountId,
      } as any).eq('id', shipment.id);

      // 3. Generate journal entry
      const allAccounts = await fetchAccounts();
      const cxpAcct = findCxPAccount(allAccounts);

      if (cxpAcct) {
        const payNum = payments.length + 1;
        const desc = `Pago ${isFullyPaid ? 'total' : `parcial #${payNum}`} PO ${shipment.po_number || shipment.id.slice(0, 8)} — ${shipment.supplier_name}`;
        const { data: entry } = await supabase.from('journal_entries').insert({
          description: desc,
          total_debit_usd: payAmount,
          total_credit_usd: payAmount,
          notes: notes ? `${desc}. ${notes}` : desc,
        }).select().single();

        if (entry) {
          await supabase.from('journal_entry_lines').insert([
            { journal_entry_id: entry.id, account_id: cxpAcct.id, debit_usd: payAmount, credit_usd: 0, description: 'Abono CxP proveedor' },
            { journal_entry_id: entry.id, account_id: accountId, debit_usd: 0, credit_usd: payAmount, description: 'Salida de fondos' },
          ]);
        }
      }

      toast.success(isFullyPaid ? 'PO pagada en su totalidad' : `Abono de ${formatUSD(payAmount)} registrado`);
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['shipment-payments', shipment.id] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Error al registrar pago');
    } finally {
      setSaving(false);
    }
  };

  const selectedAcctName = bankAccounts.find(a => a.id === accountId)?.description || 'Cuenta seleccionada';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar Pago — {shipment?.po_number || ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Summary */}
          <div className="rounded-xl bg-muted/50 p-4 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] text-muted-foreground">Total PO</p>
              <p className="text-sm font-bold text-foreground">{formatUSD(totalCost)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Pagado</p>
              <p className="text-sm font-bold text-emerald-400">{formatUSD(amountPaid)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Saldo</p>
              <p className="text-sm font-bold text-amber-400">{formatUSD(balance)}</p>
            </div>
          </div>

          {/* Payment history */}
          {payments.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">Historial de pagos</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px]">#</TableHead>
                    <TableHead className="text-[10px]">Fecha</TableHead>
                    <TableHead className="text-[10px]">Cuenta</TableHead>
                    <TableHead className="text-[10px] text-right">Monto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p: any, i: number) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-[10px]">{i + 1}</TableCell>
                      <TableCell className="text-[10px]">{p.payment_date}</TableCell>
                      <TableCell className="text-[10px]">{p.chart_of_accounts?.code} — {p.chart_of_accounts?.description}</TableCell>
                      <TableCell className="text-[10px] text-right font-mono">{formatUSD(Number(p.amount_usd))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {balance > 0.01 ? (
            <>
              {/* New payment form */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Fecha de Pago</Label>
                  <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Monto (USD) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={balance}
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder={balance.toFixed(2)}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Cuenta de Pago (Banco/Caja) *</Label>
                <SearchableSelect
                  options={accountOptions}
                  value={accountId}
                  onValueChange={setAccountId}
                  placeholder="Seleccionar cuenta..."
                  searchPlaceholder="Buscar cuenta..."
                />
              </div>
              <div>
                <Label className="text-xs">Notas (opcional)</Label>
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Ej: Abono crédito 30 días, transferencia #1234..."
                  className="text-xs h-16"
                />
              </div>
              {/* Journal preview */}
              <div className="rounded-xl border border-border p-3 space-y-1 text-[11px] text-muted-foreground">
                <p className="font-semibold text-foreground text-xs mb-1">Asiento que se generará:</p>
                <p>📕 Débito: Cuentas por Pagar — {formatUSD(payAmount)}</p>
                <p>📗 Crédito: {selectedAcctName} — {formatUSD(payAmount)}</p>
                {payAmount < balance - 0.01 && (
                  <p className="text-amber-400 mt-1">⚠ Pago parcial — quedará saldo de {formatUSD(balance - payAmount)}</p>
                )}
              </div>
              <Button onClick={handlePay} disabled={saving} className="w-full">
                {saving ? 'Procesando...' : payAmount >= balance - 0.01 ? 'Pagar Total' : `Registrar Abono de ${formatUSD(payAmount)}`}
              </Button>
            </>
          ) : (
            <p className="text-center text-sm text-emerald-400 font-medium py-2">✓ Esta PO está completamente pagada</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
