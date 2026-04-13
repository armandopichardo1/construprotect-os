import { useState } from 'react';
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

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  shipment: any;
}

export function ShipmentPaymentDialog({ open, onOpenChange, shipment }: Props) {
  const queryClient = useQueryClient();
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [accountId, setAccountId] = useState('');
  const [saving, setSaving] = useState(false);

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

  // Filter to bank/cash asset accounts for payment
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

  const totalCost = Number(shipment?.total_cost_usd || 0);

  const handlePay = async () => {
    if (!accountId) { toast.error('Selecciona la cuenta de pago'); return; }
    setSaving(true);
    try {
      // Update shipment payment status
      await supabase.from('shipments').update({
        payment_status: 'paid',
        payment_date: paymentDate,
        payment_account_id: accountId,
      } as any).eq('id', shipment.id);

      // Find CxP account
      const cxpAcct = accounts.find(a =>
        a.code?.startsWith('21') || a.code?.startsWith('20') ||
        (a.account_type === 'Pasivo' && a.description?.toLowerCase().includes('pagar'))
      );

      if (cxpAcct) {
        const desc = `Pago PO ${shipment.po_number || shipment.id.slice(0, 8)} — ${shipment.supplier_name}`;
        const { data: entry } = await supabase.from('journal_entries').insert({
          description: desc,
          total_debit_usd: totalCost,
          total_credit_usd: totalCost,
          notes: `Pago de orden de compra a proveedor`,
        }).select().single();

        if (entry) {
          await supabase.from('journal_entry_lines').insert([
            { journal_entry_id: entry.id, account_id: cxpAcct.id, debit_usd: totalCost, credit_usd: 0, description: 'Liquidación CxP proveedor' },
            { journal_entry_id: entry.id, account_id: accountId, debit_usd: 0, credit_usd: totalCost, description: 'Salida de fondos' },
          ]);
        }
      }

      toast.success('Pago registrado — asiento contable generado');
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Error al registrar pago');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Pago — {shipment?.po_number || ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl bg-muted/50 p-4 space-y-1">
            <p className="text-xs text-muted-foreground">Proveedor: <span className="text-foreground font-medium">{shipment?.supplier_name}</span></p>
            <p className="text-xs text-muted-foreground">Total PO: <span className="text-foreground font-bold">{formatUSD(totalCost)}</span></p>
          </div>
          <div>
            <Label className="text-xs">Fecha de Pago</Label>
            <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
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
          <div className="rounded-xl border border-border p-3 space-y-1 text-[11px] text-muted-foreground">
            <p className="font-semibold text-foreground text-xs mb-1">Asiento que se generará:</p>
            <p>📕 Débito: Cuentas por Pagar — {formatUSD(totalCost)}</p>
            <p>📗 Crédito: {bankAccounts.find(a => a.id === accountId)?.description || 'Cuenta seleccionada'} — {formatUSD(totalCost)}</p>
          </div>
          <Button onClick={handlePay} disabled={saving} className="w-full">
            {saving ? 'Procesando...' : 'Confirmar Pago'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
