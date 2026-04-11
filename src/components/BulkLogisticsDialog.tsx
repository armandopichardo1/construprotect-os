import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Save, Box, Weight } from 'lucide-react';
import type { Tables } from '@/integrations/supabase/types';

type Product = Tables<'products'>;

interface BulkLogisticsDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: Product[];
  onSuccess: () => void;
}

type EditRow = { id: string; sku: string; name: string; cbm: string; weight: string; origCbm: string; origWeight: string };

export function BulkLogisticsDialog({ open, onOpenChange, products, onSuccess }: BulkLogisticsDialogProps) {
  const [rows, setRows] = useState<EditRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setRows(products.map(p => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        cbm: String(p.cbm_per_unit ?? 0),
        weight: String(p.weight_kg_per_unit ?? 0),
        origCbm: String(p.cbm_per_unit ?? 0),
        origWeight: String(p.weight_kg_per_unit ?? 0),
      })));
    }
  }, [open, products]);

  const setField = (id: string, field: 'cbm' | 'weight', val: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r));
  };

  const changedRows = rows.filter(r => r.cbm !== r.origCbm || r.weight !== r.origWeight);

  const handleSave = async () => {
    if (changedRows.length === 0) { toast.info('No hay cambios'); return; }
    setSaving(true);
    let errors = 0;
    for (const r of changedRows) {
      const { error } = await supabase.from('products').update({
        cbm_per_unit: Number(r.cbm) || 0,
        weight_kg_per_unit: Number(r.weight) || 0,
      }).eq('id', r.id);
      if (error) errors++;
    }
    setSaving(false);
    if (errors > 0) {
      toast.error(`${errors} producto(s) fallaron al actualizar`);
    } else {
      toast.success(`${changedRows.length} producto(s) actualizados`);
      onSuccess();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Box className="w-4 h-4" /> Actualización Masiva — CBM & Peso
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[10px]">SKU</TableHead>
                <TableHead className="text-[10px]">Producto</TableHead>
                <TableHead className="text-[10px] text-center w-[110px]">
                  <span className="flex items-center justify-center gap-1"><Box className="w-3 h-3" /> CBM/ud</span>
                </TableHead>
                <TableHead className="text-[10px] text-center w-[110px]">
                  <span className="flex items-center justify-center gap-1"><Weight className="w-3 h-3" /> Kg/ud</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => {
                const changed = r.cbm !== r.origCbm || r.weight !== r.origWeight;
                return (
                  <TableRow key={r.id} className={changed ? 'bg-primary/5' : ''}>
                    <TableCell className="text-[10px] font-mono text-muted-foreground">{r.sku}</TableCell>
                    <TableCell className="text-[10px] font-medium max-w-[200px] truncate">{r.name}</TableCell>
                    <TableCell className="p-1">
                      <Input
                        type="number" step="0.001" min="0"
                        value={r.cbm}
                        onChange={e => setField(r.id, 'cbm', e.target.value)}
                        className="h-7 text-xs text-center font-mono"
                      />
                    </TableCell>
                    <TableCell className="p-1">
                      <Input
                        type="number" step="0.1" min="0"
                        value={r.weight}
                        onChange={e => setField(r.id, 'weight', e.target.value)}
                        className="h-7 text-xs text-center font-mono"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between pt-2">
          <p className="text-[10px] text-muted-foreground">
            {changedRows.length > 0
              ? `${changedRows.length} producto(s) modificados`
              : 'Sin cambios'}
          </p>
          <Button onClick={handleSave} disabled={saving || changedRows.length === 0} className="gap-1.5 text-xs rounded-xl">
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Guardando...' : `Guardar ${changedRows.length} cambio(s)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
