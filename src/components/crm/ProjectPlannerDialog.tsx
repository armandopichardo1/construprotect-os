import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatUSD } from '@/lib/format';
import { Ruler, Calculator, ShoppingCart } from 'lucide-react';

interface ProjectPlannerDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function ProjectPlannerDialog({ open, onOpenChange }: ProjectPlannerDialogProps) {
  const [areaM2, setAreaM2] = useState('');
  const [projectType, setProjectType] = useState('floor');
  const [wastePercent, setWastePercent] = useState('10');

  const { data: products = [] } = useQuery({
    queryKey: ['products-planner'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('id, name, sku, category, coverage_m2, price_list_usd, units_per_pack').eq('is_active', true).order('name');
      return data || [];
    },
    enabled: open,
  });

  const area = Number(areaM2) || 0;
  const waste = Number(wastePercent) || 10;
  const totalArea = area * (1 + waste / 100);

  const applicableProducts = products.filter((p: any) => {
    const cov = Number(p.coverage_m2);
    if (!cov || cov <= 0) return false;
    if (projectType === 'floor') return p.category?.toLowerCase().includes('piso') || p.category?.toLowerCase().includes('porcelan') || true;
    return true;
  }).filter((p: any) => Number(p.coverage_m2) > 0);

  const recommendations = applicableProducts.map((p: any) => {
    const coverage = Number(p.coverage_m2) || 1;
    const unitsPerPack = Number(p.units_per_pack) || 1;
    const packsNeeded = Math.ceil(totalArea / (coverage * unitsPerPack));
    const unitsNeeded = packsNeeded * unitsPerPack;
    const totalCost = packsNeeded * Number(p.price_list_usd);
    return { ...p, packsNeeded, unitsNeeded, totalCost, coveragePerPack: coverage * unitsPerPack };
  }).sort((a, b) => a.totalCost - b.totalCost);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Calculator className="w-4 h-4 text-primary" /> Planificador de Proyecto (m²)
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Área (m²) *</Label>
            <Input type="number" value={areaM2} onChange={e => setAreaM2(e.target.value)} className="h-8 text-xs mt-1" placeholder="150" />
          </div>
          <div>
            <Label className="text-xs">Tipo de proyecto</Label>
            <Select value={projectType} onValueChange={setProjectType}>
              <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="floor" className="text-xs">Piso</SelectItem>
                <SelectItem value="wall" className="text-xs">Pared</SelectItem>
                <SelectItem value="protection" className="text-xs">Protección</SelectItem>
                <SelectItem value="other" className="text-xs">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Desperdicio %</Label>
            <Input type="number" value={wastePercent} onChange={e => setWastePercent(e.target.value)} className="h-8 text-xs mt-1" />
          </div>
        </div>

        {area > 0 && (
          <div className="rounded-xl bg-primary/5 border border-primary/20 p-3">
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5"><Ruler className="w-3.5 h-3.5 text-primary" /> <span>Área neta: <b>{area} m²</b></span></div>
              <div>+ {waste}% desperdicio = <b>{totalArea.toFixed(1)} m²</b></div>
            </div>
          </div>
        )}

        {area > 0 && recommendations.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><ShoppingCart className="w-3.5 h-3.5" /> Productos recomendados</p>
            {recommendations.slice(0, 10).map((r: any) => (
              <div key={r.id} className="rounded-lg bg-card border border-border p-3 flex justify-between items-center">
                <div>
                  <p className="text-xs font-medium text-foreground">{r.name}</p>
                  <p className="text-[10px] text-muted-foreground">{r.sku} · Cobertura: {Number(r.coverage_m2).toFixed(2)} m²/u · {r.units_per_pack || 1} u/pack</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-primary">{r.packsNeeded} packs</p>
                  <p className="text-[10px] text-muted-foreground">{formatUSD(r.totalCost)}</p>
                </div>
              </div>
            ))}
            {recommendations.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No hay productos con cobertura m² definida</p>
            )}
          </div>
        )}

        {area === 0 && (
          <p className="text-xs text-muted-foreground text-center py-6">Ingresa el área del proyecto para ver recomendaciones</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
