import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

const categories = ['Protección de Pisos', 'Protección de Superficies', 'Contención de Polvo', 'Cintas', 'Accesorios'];

type Product = Tables<'products'>;

interface ProductDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product?: Product | null;
  onSuccess: () => void;
}

const defaultForm = {
  sku: '', name: '', brand: '', category: '',
  coverage_m2: '', reorder_point: '10', dimensions: '',
  units_per_pack: '1', lead_time_days: '21',
  cbm_per_unit: '', weight_kg_per_unit: '',
  min_order_qty: '1', reorder_qty: '50',
};

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
        coverage_m2: String(product.coverage_m2 ?? ''),
        reorder_point: String(product.reorder_point ?? '10'),
        dimensions: product.dimensions || '',
        units_per_pack: String(product.units_per_pack ?? '1'),
        lead_time_days: String(product.lead_time_days ?? '21'),
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

  const handleSave = async () => {
    if (!form.sku.trim() || !form.name.trim()) {
      toast.error('SKU y Nombre son requeridos');
      return;
    }
    setSaving(true);
    const payload: Record<string, any> = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      category: form.category || null,
      coverage_m2: Number(form.coverage_m2) || null,
      reorder_point: Number(form.reorder_point) || 10,
      dimensions: form.dimensions.trim() || null,
      units_per_pack: Number(form.units_per_pack) || 1,
      lead_time_days: Number(form.lead_time_days) || 21,
      cbm_per_unit: Number(form.cbm_per_unit) || 0,
      weight_kg_per_unit: Number(form.weight_kg_per_unit) || 0,
      min_order_qty: Number(form.min_order_qty) || 1,
      reorder_qty: Number(form.reorder_qty) || 50,
    };

    // New products start with 0 cost/prices
    if (!isEdit) {
      payload.unit_cost_usd = 0;
      payload.total_unit_cost_usd = 0;
      payload.price_list_usd = 0;
      payload.price_architect_usd = 0;
      payload.price_project_usd = 0;
      payload.price_wholesale_usd = 0;
      payload.margin_list_pct = 0;
      payload.margin_architect_pct = 0;
      payload.margin_project_pct = 0;
      payload.margin_wholesale_pct = 0;
    }

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
