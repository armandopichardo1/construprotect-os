import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { fetchAccounts, findTransitAccount, findCxPAccount } from '@/lib/accounting-utils';

interface ShipmentDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editShipment?: any;
}

const STATUSES = [
  { value: 'ordered', label: 'Ordenado' },
  { value: 'in_transit', label: 'En Tránsito' },
  { value: 'customs', label: 'Aduanas' },
  { value: 'warehouse', label: 'Almacén' },
  { value: 'received', label: 'Recibido' },
];

export function ShipmentDialog({ open, onOpenChange, editShipment }: ShipmentDialogProps) {
  const queryClient = useQueryClient();
  const isEdit = !!editShipment;

  const [supplierId, setSupplierId] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [status, setStatus] = useState('ordered');
  const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
  const [estimatedArrival, setEstimatedArrival] = useState('');
  const [notes, setNotes] = useState('');
  const [shippingCost, setShippingCost] = useState('0');
  const [customsCost, setCustomsCost] = useState('0');
  const [items, setItems] = useState<{ product_id: string; quantity_ordered: number; unit_cost_usd: number }[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers-active'],
    queryFn: async () => {
      const { data } = await supabase.from('suppliers').select('id, name').eq('is_active', true).order('name');
      return data || [];
    },
  });

  const { data: products = [] } = useQuery({
    queryKey: ['products-active'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, name, sku, unit_cost_usd').eq('is_active', true);
      return data || [];
    },
  });
  useEffect(() => {
    if (editShipment) {
      setSupplierId(editShipment.supplier_id || '');
      setPoNumber(editShipment.po_number || '');
      setStatus(editShipment.status || 'ordered');
      setOrderDate(editShipment.order_date || '');
      setEstimatedArrival(editShipment.estimated_arrival || '');
      setNotes(editShipment.notes || '');
      setShippingCost(String(editShipment.shipping_cost_usd || 0));
      setCustomsCost(String(editShipment.customs_cost_usd || 0));
      setItems(editShipment.shipment_items?.map((si: any) => ({
        product_id: si.product_id, quantity_ordered: si.quantity_ordered, unit_cost_usd: Number(si.unit_cost_usd),
      })) || []);
    } else {
      setSupplierId(''); setPoNumber(''); setStatus('ordered');
      setOrderDate(new Date().toISOString().split('T')[0]);
      setEstimatedArrival(''); setNotes(''); setShippingCost('0'); setCustomsCost('0'); setItems([]);
    }
  }, [editShipment, open]);

  const addItem = () => setItems([...items, { product_id: '', quantity_ordered: 1, unit_cost_usd: 0 }]);
  const removeItem = (i: number) => setItems(items.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: string, value: any) => {
    const copy = [...items];
    (copy[i] as any)[field] = value;
    if (field === 'product_id') {
      const p = products.find(pr => pr.id === value);
      if (p) copy[i].unit_cost_usd = Number(p.unit_cost_usd);
    }
    setItems(copy);
  };

  const productCost = items.reduce((s, i) => s + i.quantity_ordered * i.unit_cost_usd, 0);
  const totalCost = productCost + (Number(shippingCost) || 0) + (Number(customsCost) || 0);

  const handleSave = async () => {
    if (!supplierId) { toast.error('Selecciona un proveedor'); return; }
    const selectedSupplier = suppliers.find(s => s.id === supplierId);
    setSaving(true);
    try {
      const payload = {
        supplier_id: supplierId, supplier_name: selectedSupplier?.name || '', po_number: poNumber, status: status as any,
        order_date: orderDate, estimated_arrival: estimatedArrival || null,
        total_cost_usd: totalCost, notes: notes || null,
        shipping_cost_usd: Number(shippingCost) || 0,
        customs_cost_usd: Number(customsCost) || 0,
      };

      if (isEdit) {
        await supabase.from('shipments').update(payload).eq('id', editShipment.id);
        await supabase.from('shipment_items').delete().eq('shipment_id', editShipment.id);
        if (items.length > 0) {
          await supabase.from('shipment_items').insert(items.filter(i => i.product_id).map(i => ({
            shipment_id: editShipment.id, product_id: i.product_id,
            quantity_ordered: i.quantity_ordered, unit_cost_usd: i.unit_cost_usd,
          })));
        }
      } else {
        const { data: shipment, error } = await supabase.from('shipments').insert(payload).select('*, shipment_items(*, products(name, sku))').single();
        if (error) throw error;
        if (items.length > 0) {
          await supabase.from('shipment_items').insert(items.filter(i => i.product_id).map(i => ({
            shipment_id: shipment.id, product_id: i.product_id,
            quantity_ordered: i.quantity_ordered, unit_cost_usd: i.unit_cost_usd,
          })));
        }
        // Generate PO journal entry: Debit Inv-in-Transit, Credit CxP
        if (totalCost > 0) {
          try {
            const accounts = await fetchAccounts();
            const transitAcct = findTransitAccount(accounts);
            const cxpAcct = findCxPAccount(accounts);
            if (transitAcct && cxpAcct) {
              const desc = `Orden de compra — PO ${poNumber || shipment.id.slice(0, 8)} — ${selectedSupplier?.name}`;
              const { data: entry } = await supabase.from('journal_entries').insert({
                description: desc,
                total_debit_usd: totalCost,
                total_credit_usd: totalCost,
                notes: `Auto-generado al crear PO`,
              }).select().single();
              if (entry) {
                await supabase.from('journal_entry_lines').insert([
                  { journal_entry_id: entry.id, account_id: transitAcct.id, debit_usd: totalCost, credit_usd: 0, description: 'Compras en tránsito' },
                  { journal_entry_id: entry.id, account_id: cxpAcct.id, debit_usd: 0, credit_usd: totalCost, description: 'Obligación con proveedor' },
                ]);
              }
            }
            queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
          } catch (e) {
            console.error('Error creating PO journal entry:', e);
          }
        }
      }
      toast.success(isEdit ? 'Envío actualizado' : 'Envío creado');
      queryClient.invalidateQueries({ queryKey: ['shipments'] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar Envío' : 'Nuevo Envío'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label className="text-xs">Proveedor *</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar proveedor" /></SelectTrigger>
                <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">PO Number</Label><Input value={poNumber} onChange={e => setPoNumber(e.target.value)} /></div>
            <div><Label className="text-xs">Estado</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Fecha Orden</Label><Input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} /></div>
            <div><Label className="text-xs">ETA</Label><Input type="date" value={estimatedArrival} onChange={e => setEstimatedArrival(e.target.value)} /></div>
            <div><Label className="text-xs">Notas</Label><Input value={notes} onChange={e => setNotes(e.target.value)} /></div>
          </div>

          {/* Cost breakdown */}
          <div className="grid grid-cols-3 gap-4">
            <div><Label className="text-xs">Costo Envío (USD)</Label><Input type="number" step="0.01" value={shippingCost} onChange={e => setShippingCost(e.target.value)} /></div>
            <div><Label className="text-xs">Costo Aduanas (USD)</Label><Input type="number" step="0.01" value={customsCost} onChange={e => setCustomsCost(e.target.value)} /></div>
            <div className="flex items-end">
              <p className="text-xs text-muted-foreground pb-2">Productos: ${productCost.toFixed(2)}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Productos</Label>
              <Button size="sm" variant="outline" onClick={addItem}><Plus className="w-3 h-3 mr-1" /> Agregar</Button>
            </div>
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_100px_32px] gap-2 items-end">
                <Select value={item.product_id} onValueChange={v => updateItem(i, 'product_id', v)}>
                  <SelectTrigger className="text-xs"><SelectValue placeholder="Producto" /></SelectTrigger>
                  <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id} className="text-xs">{p.sku} — {p.name}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="number" min={1} value={item.quantity_ordered} onChange={e => updateItem(i, 'quantity_ordered', parseInt(e.target.value) || 1)} className="text-xs" />
                <Input type="number" step="0.01" value={item.unit_cost_usd} onChange={e => updateItem(i, 'unit_cost_usd', parseFloat(e.target.value) || 0)} className="text-xs" />
                <Button size="icon" variant="ghost" onClick={() => removeItem(i)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
              </div>
            ))}
            {items.length > 0 && (
              <p className="text-xs text-muted-foreground text-right">Total (productos + envío + aduanas): <span className="font-bold text-foreground">${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></p>
            )}
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">{saving ? 'Guardando...' : isEdit ? 'Actualizar' : 'Crear Envío'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
