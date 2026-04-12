import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';

const categories = ['Protección de Pisos', 'Protección de Superficies', 'Contención de Polvo', 'Cintas', 'Accesorios'];

type Product = Tables<'products'>;

interface ProductDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product?: Product | null;
  onSuccess: () => void;
}

const tiers = [
  { price: 'price_list_usd', margin: 'margin_list_pct', labelPrice: 'Precio Lista', labelMargin: 'Margen Lista %' },
  { price: 'price_architect_usd', margin: 'margin_architect_pct', labelPrice: 'Precio Arquitecto', labelMargin: 'Margen Arq %' },
  { price: 'price_project_usd', margin: 'margin_project_pct', labelPrice: 'Precio Proyecto', labelMargin: 'Margen Proy %' },
  { price: 'price_wholesale_usd', margin: 'margin_wholesale_pct', labelPrice: 'Precio Mayoreo', labelMargin: 'Margen May %' },
] as const;

const defaultForm = {
  sku: '', name: '', brand: '', category: '',
  unit_cost_usd: '', price_list_usd: '', price_architect_usd: '',
  price_project_usd: '', price_wholesale_usd: '', coverage_m2: '',
  reorder_point: '10', dimensions: '', units_per_pack: '1', lead_time_days: '21',
  margin_list_pct: '', margin_architect_pct: '', margin_project_pct: '', margin_wholesale_pct: '',
  cbm_per_unit: '', weight_kg_per_unit: '', min_order_qty: '1', reorder_qty: '50',
};

function calcMargin(cost: number, price: number): string {
  if (!price || price <= 0) return '';
  const m = ((price - cost) / price) * 100;
  return m.toFixed(1);
}

function calcPrice(cost: number, margin: number): string {
  if (margin >= 100 || margin < 0) return '';
  if (!cost) return '';
  return (cost / (1 - margin / 100)).toFixed(2);
}

export function ProductDialog({ open, onOpenChange, product, onSuccess }: ProductDialogProps) {
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const isEdit = !!product;

  useEffect(() => {
    if (product) {
      setForm({
        sku: product.sku || '',
        name: product.name || '',
        brand: product.brand || '',
        category: product.category || '',
        unit_cost_usd: String(product.unit_cost_usd ?? ''),
        price_list_usd: String(product.price_list_usd ?? ''),
        price_architect_usd: String(product.price_architect_usd ?? ''),
        price_project_usd: String(product.price_project_usd ?? ''),
        price_wholesale_usd: String(product.price_wholesale_usd ?? ''),
        coverage_m2: String(product.coverage_m2 ?? ''),
        reorder_point: String(product.reorder_point ?? '10'),
        dimensions: product.dimensions || '',
        units_per_pack: String(product.units_per_pack ?? '1'),
        lead_time_days: String(product.lead_time_days ?? '21'),
        margin_list_pct: String(product.margin_list_pct ?? ''),
        margin_architect_pct: String(product.margin_architect_pct ?? ''),
        margin_project_pct: String(product.margin_project_pct ?? ''),
        margin_wholesale_pct: String(product.margin_wholesale_pct ?? ''),
        cbm_per_unit: String(product.cbm_per_unit ?? ''),
        weight_kg_per_unit: String(product.weight_kg_per_unit ?? ''),
        min_order_qty: String(product.min_order_qty ?? '1'),
        reorder_qty: String(product.reorder_qty ?? '50'),
      });
    } else {
      setForm(defaultForm);
    }
  }, [product, open]);

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }));

  const handleCostChange = (newCostStr: string) => {
    const cost = Number(newCostStr);
    const updates: Record<string, string> = { unit_cost_usd: newCostStr };
    if (cost > 0) {
      for (const t of tiers) {
        const price = Number(form[t.price]);
        if (price > 0) {
          updates[t.margin] = calcMargin(cost, price);
        }
      }
    }
    setForm(f => ({ ...f, ...updates }));
  };

  const handlePriceChange = (priceKey: string, marginKey: string, newPriceStr: string) => {
    const cost = Number(form.unit_cost_usd);
    const price = Number(newPriceStr);
    const updates: Record<string, string> = { [priceKey]: newPriceStr };
    if (cost > 0 && price > 0) {
      updates[marginKey] = calcMargin(cost, price);
    }
    setForm(f => ({ ...f, ...updates }));
  };

  const handleMarginChange = (priceKey: string, marginKey: string, newMarginStr: string) => {
    const cost = Number(form.unit_cost_usd);
    const margin = Number(newMarginStr);
    const updates: Record<string, string> = { [marginKey]: newMarginStr };
    if (cost > 0 && margin < 100) {
      const p = calcPrice(cost, margin);
      if (p) updates[priceKey] = p;
    }
    setForm(f => ({ ...f, ...updates }));
  };

  const marginWarning = (val: string) => {
    const n = Number(val);
    return val !== '' && (n < 5 || n < 0);
  };

  const handleSave = async () => {
    if (!form.sku.trim() || !form.name.trim()) {
      toast.error('SKU y Nombre son requeridos');
      return;
    }
    setSaving(true);
    const payload = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      category: form.category || null,
      unit_cost_usd: Number(form.unit_cost_usd) || 0,
      price_list_usd: Number(form.price_list_usd) || 0,
      price_architect_usd: Number(form.price_architect_usd) || 0,
      price_project_usd: Number(form.price_project_usd) || 0,
      price_wholesale_usd: Number(form.price_wholesale_usd) || 0,
      coverage_m2: Number(form.coverage_m2) || null,
      reorder_point: Number(form.reorder_point) || 10,
      dimensions: form.dimensions.trim() || null,
      units_per_pack: Number(form.units_per_pack) || 1,
      lead_time_days: Number(form.lead_time_days) || 21,
      margin_list_pct: Number(form.margin_list_pct) || 0,
      margin_architect_pct: Number(form.margin_architect_pct) || 0,
      margin_project_pct: Number(form.margin_project_pct) || 0,
      margin_wholesale_pct: Number(form.margin_wholesale_pct) || 0,
      cbm_per_unit: Number(form.cbm_per_unit) || 0,
      weight_kg_per_unit: Number(form.weight_kg_per_unit) || 0,
      min_order_qty: Number(form.min_order_qty) || 1,
      reorder_qty: Number(form.reorder_qty) || 50,
    };

    const { error } = isEdit
      ? await supabase.from('products').update(payload).eq('id', product!.id)
      : await supabase.from('products').insert(payload);

    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(isEdit ? 'Producto actualizado' : 'Producto creado');
    onSuccess();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{isEdit ? 'Editar Producto' : 'Nuevo Producto'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5">
          <div><Label className="text-xs">SKU *</Label><Input value={form.sku} onChange={e => set('sku', e.target.value)} className="h-8 text-xs mt-1" /></div>
          <div><Label className="text-xs">Nombre *</Label><Input value={form.name} onChange={e => set('name', e.target.value)} className="h-8 text-xs mt-1" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Marca</Label><Input value={form.brand} onChange={e => set('brand', e.target.value)} className="h-8 text-xs mt-1" /></div>
            <div>
              <Label className="text-xs">Categoría</Label>
              <Select value={form.category} onValueChange={v => set('category', v)}>
                <SelectTrigger className="h-8 text-xs mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{categories.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-[10px] font-semibold text-muted-foreground pt-1">💰 Costo y Precios (USD)</p>
          <div>
            <Label className="text-xs">Costo Unitario</Label>
            <Input type="number" step="0.01" value={form.unit_cost_usd} onChange={e => handleCostChange(e.target.value)} className="h-8 text-xs mt-1" />
          </div>

          {tiers.map(t => (
            <div key={t.price} className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">{t.labelPrice}</Label>
                <Input
                  type="number" step="0.01"
                  value={form[t.price]}
                  onChange={e => handlePriceChange(t.price, t.margin, e.target.value)}
                  className="h-8 text-xs mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">{t.labelMargin}</Label>
                <Input
                  type="number" step="0.1"
                  value={form[t.margin]}
                  onChange={e => handleMarginChange(t.price, t.margin, e.target.value)}
                  className={cn("h-8 text-xs mt-1", marginWarning(form[t.margin]) && "border-destructive text-destructive")}
                />
              </div>
            </div>
          ))}

          <p className="text-[10px] font-semibold text-muted-foreground pt-1">📦 Inventario & Specs</p>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Cobertura m²</Label><Input type="number" step="0.01" value={form.coverage_m2} onChange={e => set('coverage_m2', e.target.value)} className="h-8 text-xs mt-1" /></div>
            <div><Label className="text-xs">Punto Reorden</Label><Input type="number" value={form.reorder_point} onChange={e => set('reorder_point', e.target.value)} className="h-8 text-xs mt-1" /></div>
            <div><Label className="text-xs">Dimensiones</Label><Input value={form.dimensions} onChange={e => set('dimensions', e.target.value)} className="h-8 text-xs mt-1" placeholder="38x100'" /></div>
            <div><Label className="text-xs">Uds/Caja</Label><Input type="number" value={form.units_per_pack} onChange={e => set('units_per_pack', e.target.value)} className="h-8 text-xs mt-1" /></div>
            <div><Label className="text-xs">Lead Time (días)</Label><Input type="number" value={form.lead_time_days} onChange={e => set('lead_time_days', e.target.value)} className="h-8 text-xs mt-1" /></div>
            <div><Label className="text-xs">Qty Reorden</Label><Input type="number" value={form.reorder_qty} onChange={e => set('reorder_qty', e.target.value)} className="h-8 text-xs mt-1" /></div>
            <div><Label className="text-xs">Min Order Qty</Label><Input type="number" value={form.min_order_qty} onChange={e => set('min_order_qty', e.target.value)} className="h-8 text-xs mt-1" /></div>
          </div>

          <p className="text-[10px] font-semibold text-muted-foreground pt-1">🚢 Logística (Contenedor)</p>
          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">CBM por unidad</Label><Input type="number" step="0.001" value={form.cbm_per_unit} onChange={e => set('cbm_per_unit', e.target.value)} className="h-8 text-xs mt-1" placeholder="0.035" /></div>
            <div><Label className="text-xs">Peso por unidad (kg)</Label><Input type="number" step="0.1" value={form.weight_kg_per_unit} onChange={e => set('weight_kg_per_unit', e.target.value)} className="h-8 text-xs mt-1" placeholder="2.5" /></div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full rounded-xl text-xs mt-2">
            {saving ? 'Guardando...' : isEdit ? 'Guardar Cambios' : 'Crear Producto'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
