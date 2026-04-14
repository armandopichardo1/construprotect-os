import { useState, useEffect } from 'react';
import { parseNum } from '@/lib/format';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { type Contact } from '@/lib/crm-utils';
import { Plus, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface QuoteCreateDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contacts: Contact[];
  queryClient: any;
}

interface LineItem {
  product_id: string;
  quantity: number;
  unit_price_usd: number;
  discount_pct: number;
}

export function QuoteCreateDialog({ open, onOpenChange, contacts, queryClient }: QuoteCreateDialogProps) {
  const [contactId, setContactId] = useState('');
  const [notes, setNotes] = useState('');
  const [validDays, setValidDays] = useState('30');
  const [items, setItems] = useState<LineItem[]>([{ product_id: '', quantity: 1, unit_price_usd: 0, discount_pct: 0 }]);
  const [saving, setSaving] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ['products-for-quote'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, name, sku, price_list_usd, price_architect_usd, price_project_usd, price_wholesale_usd').eq('is_active', true).order('name');
      return data || [];
    },
    enabled: open,
  });

  const { data: rate } = useQuery({
    queryKey: ['latest-rate'],
    queryFn: async () => {
      const { data } = await supabase.from('exchange_rates').select('usd_sell').order('date', { ascending: false }).limit(1).maybeSingle();
      return Number(data?.usd_sell) || 60.75;
    },
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setContactId('');
      setNotes('');
      setValidDays('30');
      setItems([{ product_id: '', quantity: 1, unit_price_usd: 0, discount_pct: 0 }]);
    }
  }, [open]);

  const selectedContact = contacts.find(c => c.id === contactId);
  const priceTier = selectedContact?.price_tier || 'list';

  const getPrice = (p: any): number => {
    if (priceTier === 'architect') return Number(p.price_architect_usd) || Number(p.price_list_usd) || 0;
    if (priceTier === 'project') return Number(p.price_project_usd) || Number(p.price_list_usd) || 0;
    if (priceTier === 'wholesale') return Number(p.price_wholesale_usd) || Number(p.price_list_usd) || 0;
    return Number(p.price_list_usd) || 0;
  };

  const handleProductChange = (idx: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, product_id: productId, unit_price_usd: product ? getPrice(product) : 0 } : item));
  };

  const updateItem = (idx: number, field: string, value: any) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const addItem = () => setItems(prev => [...prev, { product_id: '', quantity: 1, unit_price_usd: 0, discount_pct: 0 }]);
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const lineTotal = (item: LineItem) => {
    const base = item.quantity * item.unit_price_usd;
    return base * (1 - (item.discount_pct || 0) / 100);
  };

  const subtotal = items.reduce((s, item) => s + lineTotal(item), 0);
  const itbis = subtotal * 0.18;
  const totalUsd = subtotal + itbis;
  const xr = rate || 60.75;
  const totalDop = totalUsd * xr;

  const handleSave = async () => {
    if (!contactId) { toast.error('Selecciona un contacto'); return; }
    if (items.length === 0 || !items[0].product_id) { toast.error('Agrega al menos un producto'); return; }
    setSaving(true);

    const quoteNumber = `COT-${Date.now().toString(36).toUpperCase()}`;
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + Number(validDays));

    const { data: quote, error } = await supabase.from('quotes').insert({
      quote_number: quoteNumber,
      contact_id: contactId,
      status: 'draft',
      subtotal_usd: subtotal,
      itbis_usd: itbis,
      total_usd: totalUsd,
      total_dop: totalDop,
      exchange_rate: xr,
      valid_until: validUntil.toISOString().split('T')[0],
      notes: notes.trim() || null,
    }).select('id').single();

    if (error || !quote) {
      toast.error('Error al crear cotización');
      setSaving(false);
      return;
    }

    const quoteItems = items.filter(i => i.product_id).map(i => ({
      quote_id: quote.id,
      product_id: i.product_id,
      quantity: i.quantity,
      unit_price_usd: i.unit_price_usd,
      discount_pct: i.discount_pct,
      line_total_usd: lineTotal(i),
    }));

    const { error: itemsError } = await supabase.from('quote_items').insert(quoteItems);
    setSaving(false);

    if (itemsError) {
      toast.error('Error al guardar ítems');
      return;
    }

    toast.success(`Cotización ${quoteNumber} creada`);
    queryClient.invalidateQueries({ queryKey: ['crm-quotes'] });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-base">Nueva Cotización</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Contacto *</Label>
            <Select value={contactId} onValueChange={setContactId}>
              <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
              <SelectContent className="max-h-48">
                {contacts.map(c => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">
                    {c.contact_name} {c.company_name ? `· ${c.company_name}` : ''} ({c.price_tier})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">Productos</Label>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-1.5 items-end">
                  <div className="col-span-5">
                    <Select value={item.product_id} onValueChange={v => handleProductChange(idx, v)}>
                      <SelectTrigger className="h-7 text-[10px]"><SelectValue placeholder="Producto" /></SelectTrigger>
                      <SelectContent className="max-h-48">
                        {products.map((p: any) => (
                          <SelectItem key={p.id} value={p.id} className="text-[10px]">{p.name} ({p.sku})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input type="number" min={1} value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseNum(e.target.value, 1))} className="h-7 text-[10px]" placeholder="Qty" />
                  </div>
                  <div className="col-span-2">
                    <Input type="number" step="0.01" value={item.unit_price_usd} onChange={e => updateItem(idx, 'unit_price_usd', parseNum(e.target.value))} className="h-7 text-[10px]" placeholder="Precio" />
                  </div>
                  <div className="col-span-2">
                    <Input type="number" value={item.discount_pct} onChange={e => updateItem(idx, 'discount_pct', parseNum(e.target.value))} className="h-7 text-[10px]" placeholder="Desc%" />
                  </div>
                  <div className="col-span-1">
                    {items.length > 1 && (
                      <button onClick={() => removeItem(idx)} className="p-1 text-destructive hover:bg-destructive/10 rounded">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={addItem}>
                <Plus className="w-3 h-3" /> Línea
              </Button>
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">ITBIS (18%)</span><span>${itbis.toFixed(2)}</span></div>
            <div className="flex justify-between font-bold text-sm"><span>Total USD</span><span>${totalUsd.toFixed(2)}</span></div>
            <div className="flex justify-between text-muted-foreground"><span>Total DOP (@ {xr})</span><span>RD$ {totalDop.toFixed(0)}</span></div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Validez (días)</Label><Input type="number" value={validDays} onChange={e => setValidDays(e.target.value)} className="h-8 text-xs mt-1" /></div>
          </div>
          <div><Label className="text-xs">Notas</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} className="text-xs mt-1" rows={2} /></div>

          <Button onClick={handleSave} disabled={saving} className="w-full rounded-xl text-xs">
            {saving ? 'Guardando...' : 'Crear Cotización'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
