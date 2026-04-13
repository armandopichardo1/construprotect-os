import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { getGlobalExchangeRate } from '@/lib/format';

interface SaleEditDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sale: any;
}

const PAYMENT_STATUSES = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'paid', label: 'Pagado' },
  { value: 'partial', label: 'Parcial' },
  { value: 'overdue', label: 'Vencido' },
  { value: 'cancelled', label: 'Cancelado' },
];

export function SaleEditDialog({ open, onOpenChange, sale }: SaleEditDialogProps) {
  const queryClient = useQueryClient();
  const rate = getGlobalExchangeRate();

  const [invoiceRef, setInvoiceRef] = useState('');
  const [date, setDate] = useState('');
  const [contactId, setContactId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('pending');
  const [paymentDate, setPaymentDate] = useState('');
  const [notes, setNotes] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [items, setItems] = useState<{ product_id: string; quantity: number; unit_price_usd: number; unit_cost_usd: number }[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: contacts = [] } = useQuery({
    queryKey: ['contacts-sale-edit'],
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('id, contact_name, company_name').eq('is_active', true).order('contact_name');
      return data || [];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products-sale-edit'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, name, sku, unit_cost_usd, price_list_usd').eq('is_active', true);
      return data || [];
    },
  });

  useEffect(() => {
    if (sale && open) {
      setInvoiceRef(sale.invoice_ref || '');
      setDate(sale.date || '');
      setContactId(sale.contact_id || '');
      setPaymentStatus(sale.payment_status || 'pending');
      setPaymentDate(sale.payment_date || '');
      setNotes(sale.notes || '');
      setExchangeRate(String(sale.exchange_rate || rate));
      setItems(
        (sale.sale_items || []).map((si: any) => ({
          product_id: si.product_id || '',
          quantity: si.quantity || 1,
          unit_price_usd: Number(si.unit_price_usd || 0),
          unit_cost_usd: Number(si.unit_cost_usd || 0),
        }))
      );
    }
  }, [sale, open]);

  const addItem = () => setItems([...items, { product_id: '', quantity: 1, unit_price_usd: 0, unit_cost_usd: 0 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, value: any) => {
    const copy = [...items];
    (copy[i] as any)[field] = value;
    if (field === 'product_id') {
      const p = products.find(pr => pr.id === value);
      if (p) {
        copy[i].unit_price_usd = Number(p.price_list_usd || 0);
        copy[i].unit_cost_usd = Number(p.unit_cost_usd || 0);
      }
    }
    setItems(copy);
  };

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price_usd, 0);
  const itbis = subtotal * 0.18;
  const totalUsd = subtotal + itbis;
  const xr = Number(exchangeRate) || rate;
  const totalDop = totalUsd * xr;

  const handleSave = async () => {
    if (!sale) return;
    setSaving(true);
    try {
      // Update the sale record
      await supabase.from('sales').update({
        invoice_ref: invoiceRef || null,
        date,
        contact_id: contactId || null,
        payment_status: paymentStatus as any,
        payment_date: paymentDate || null,
        notes: notes || null,
        exchange_rate: xr,
        subtotal_usd: subtotal,
        itbis_usd: itbis,
        total_usd: totalUsd,
        total_dop: totalDop,
      }).eq('id', sale.id);

      // Replace sale items
      await supabase.from('sale_items').delete().eq('sale_id', sale.id);
      if (items.length > 0) {
        await supabase.from('sale_items').insert(
          items.filter(i => i.product_id).map(i => ({
            sale_id: sale.id,
            product_id: i.product_id,
            quantity: i.quantity,
            unit_price_usd: i.unit_price_usd,
            unit_cost_usd: i.unit_cost_usd,
            line_total_usd: i.quantity * i.unit_price_usd,
            margin_pct: i.unit_price_usd > 0 ? Number((((i.unit_price_usd - i.unit_cost_usd) / i.unit_price_usd) * 100).toFixed(1)) : 0,
          }))
        );
      }

      toast.success('Orden de venta actualizada');
      queryClient.invalidateQueries({ queryKey: ['sales-orders'] });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Orden de Venta</DialogTitle>
          <DialogDescription>Modifica los datos de la venta y sus ítems.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs">Factura #</Label>
              <Input value={invoiceRef} onChange={e => setInvoiceRef(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Cliente</Label>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
                <SelectContent>
                  {contacts.map(c => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.company_name || c.contact_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Estado Pago</Label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Fecha Pago</Label>
              <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Tasa de Cambio</Label>
              <Input type="number" step="0.01" value={exchangeRate} onChange={e => setExchangeRate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="text-xs">Notas</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>

          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Productos</Label>
              <Button size="sm" variant="outline" onClick={addItem}>
                <Plus className="w-3 h-3 mr-1" /> Agregar
              </Button>
            </div>
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-[1fr_60px_90px_90px_32px] gap-2 items-end">
                <Select value={item.product_id} onValueChange={v => updateItem(i, 'product_id', v)}>
                  <SelectTrigger className="text-xs"><SelectValue placeholder="Producto" /></SelectTrigger>
                  <SelectContent>
                    {products.map(p => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.sku} — {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="number" min={1} value={item.quantity}
                  onChange={e => updateItem(i, 'quantity', parseInt(e.target.value) || 1)} className="text-xs" />
                <Input type="number" step="0.01" value={item.unit_price_usd}
                  onChange={e => updateItem(i, 'unit_price_usd', parseFloat(e.target.value) || 0)} className="text-xs" placeholder="Precio" />
                <Input type="number" step="0.01" value={item.unit_cost_usd}
                  onChange={e => updateItem(i, 'unit_cost_usd', parseFloat(e.target.value) || 0)} className="text-xs" placeholder="Costo" />
                <Button size="icon" variant="ghost" onClick={() => removeItem(i)}>
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="rounded-xl bg-muted/30 p-3 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-mono">${subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">ITBIS (18%)</span>
              <span className="font-mono">${itbis.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs font-semibold border-t border-border pt-1">
              <span>Total USD</span>
              <span className="font-mono">${totalUsd.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs font-semibold">
              <span>Total DOP</span>
              <span className="font-mono">RD${totalDop.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Guardando...' : 'Actualizar Venta'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
