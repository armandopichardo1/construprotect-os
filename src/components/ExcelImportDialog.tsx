import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { parseExcelFile, EXPECTED_COLUMNS, downloadProductTemplate, type ImportResult, type ProductRow } from '@/lib/excel-import';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'upload' | 'preview' | 'importing' | 'done';

export function ExcelImportDialog({ open, onOpenChange }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importStats, setImportStats] = useState({ inserted: 0, skipped: 0, failed: 0 });
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const reset = () => {
    setStep('upload');
    setResult(null);
    setImportStats({ inserted: 0, skipped: 0, failed: 0 });
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.match(/\.xlsx?$/i)) {
      toast.error('Solo se aceptan archivos .xlsx o .xls');
      return;
    }
    try {
      const parsed = await parseExcelFile(file);
      setResult(parsed);
      setStep('preview');
    } catch (err: any) {
      toast.error(err.message || 'Error al procesar el archivo');
    }
  };

  const handleImport = async () => {
    if (!result || result.valid.length === 0) return;
    setStep('importing');
    setImporting(true);

    let inserted = 0, skipped = 0, failed = 0;

    // Insert in batches of 20
    const batches: ProductRow[][] = [];
    for (let i = 0; i < result.valid.length; i += 20) {
      batches.push(result.valid.slice(i, i + 20));
    }

    for (const batch of batches) {
      const rows = batch.map(p => ({
        sku: p.sku,
        name: p.name,
        brand: p.brand || null,
        category: p.category || null,
        unit_cost_usd: p.unit_cost_usd,
        total_unit_cost_usd: p.total_unit_cost_usd,
        price_list_usd: p.price_list_usd,
        price_architect_usd: p.price_architect_usd,
        price_project_usd: p.price_project_usd,
        price_wholesale_usd: p.price_wholesale_usd,
        margin_list_pct: p.margin_list_pct,
        margin_architect_pct: p.margin_architect_pct,
        margin_project_pct: p.margin_project_pct,
        margin_wholesale_pct: p.margin_wholesale_pct,
        coverage_m2: p.coverage_m2 ?? null,
        dimensions: p.dimensions || null,
        units_per_pack: p.units_per_pack,
        reorder_point: p.reorder_point,
        reorder_qty: p.reorder_qty,
        lead_time_days: p.lead_time_days,
      }));

      const { error, data } = await supabase.from('products').upsert(rows, { onConflict: 'sku', ignoreDuplicates: false }).select('id');
      if (error) {
        // Try one by one for this batch
        for (const row of rows) {
          const { error: singleErr } = await supabase.from('products').upsert(row, { onConflict: 'sku' });
          if (singleErr) {
            if (singleErr.message.includes('duplicate')) skipped++;
            else failed++;
          } else {
            inserted++;
          }
        }
      } else {
        inserted += data?.length || rows.length;
      }
    }

    setImportStats({ inserted, skipped, failed });
    setStep('done');
    setImporting(false);
    queryClient.invalidateQueries({ queryKey: ['products'] });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!importing) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === 'upload' && 'Importar Productos desde Excel'}
            {step === 'preview' && 'Vista Previa de Importación'}
            {step === 'importing' && 'Importando...'}
            {step === 'done' && 'Importación Completa'}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-border rounded-2xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            >
              <p className="text-3xl mb-2">📄</p>
              <p className="text-sm font-medium text-foreground">Arrastra o haz clic para seleccionar</p>
              <p className="text-xs text-muted-foreground mt-1">Archivos .xlsx o .xls</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
            </div>

            <div className="rounded-xl bg-muted p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground">Columnas esperadas:</p>
              <div className="flex flex-wrap gap-1.5">
                {EXPECTED_COLUMNS.map(c => (
                  <span key={c.field} className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-medium',
                    c.required ? 'bg-primary/15 text-primary' : 'bg-card text-muted-foreground border border-border'
                  )}>
                    {c.header}{c.required ? ' *' : ''}
                  </span>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                Las columnas con * son obligatorias. SKUs duplicados se actualizarán.
              </p>
            </div>
          </div>
        )}

        {step === 'preview' && result && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-muted p-2">
                <p className="text-lg font-bold text-foreground">{result.totalRows}</p>
                <p className="text-[10px] text-muted-foreground">Total filas</p>
              </div>
              <div className="rounded-xl bg-success/10 p-2">
                <p className="text-lg font-bold text-success">{result.valid.length}</p>
                <p className="text-[10px] text-muted-foreground">Válidas</p>
              </div>
              <div className="rounded-xl bg-destructive/10 p-2">
                <p className="text-lg font-bold text-destructive">{result.errors.length}</p>
                <p className="text-[10px] text-muted-foreground">Errores</p>
              </div>
            </div>

            {/* Errors */}
            {result.errors.length > 0 && (
              <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-3 space-y-1.5 max-h-40 overflow-y-auto">
                <p className="text-xs font-semibold text-destructive">Errores encontrados:</p>
                {result.errors.slice(0, 20).map((err, i) => (
                  <p key={i} className="text-[10px] text-muted-foreground">
                    Fila {err.row}{err.field ? `, campo "${err.field}"` : ''}: {err.message}
                  </p>
                ))}
                {result.errors.length > 20 && (
                  <p className="text-[10px] text-muted-foreground">...y {result.errors.length - 20} errores más</p>
                )}
              </div>
            )}

            {/* Preview table */}
            {result.valid.length > 0 && (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="overflow-x-auto max-h-48">
                  <table className="w-full text-xs">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">SKU</th>
                        <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Nombre</th>
                        <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Marca</th>
                        <th className="px-2 py-1.5 text-right text-muted-foreground font-medium">Costo</th>
                        <th className="px-2 py-1.5 text-right text-muted-foreground font-medium">P. Lista</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.valid.slice(0, 10).map((p, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-2 py-1.5 text-foreground font-mono">{p.sku}</td>
                          <td className="px-2 py-1.5 text-foreground truncate max-w-[120px]">{p.name}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{p.brand || '—'}</td>
                          <td className="px-2 py-1.5 text-right text-muted-foreground">${p.unit_cost_usd.toFixed(2)}</td>
                          <td className="px-2 py-1.5 text-right text-primary">${p.price_list_usd.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {result.valid.length > 10 && (
                  <p className="text-[10px] text-muted-foreground text-center py-1 bg-muted">
                    ...y {result.valid.length - 10} productos más
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={reset}>Cancelar</Button>
              <Button className="flex-1" onClick={handleImport} disabled={result.valid.length === 0}>
                Importar {result.valid.length} productos
              </Button>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="py-8 text-center space-y-3">
            <div className="text-4xl animate-pulse-slow">⏳</div>
            <p className="text-sm text-muted-foreground">Importando productos...</p>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-4">
            <div className="py-4 text-center">
              <div className="text-4xl mb-2">✅</div>
              <p className="text-sm font-medium text-foreground">Importación completada</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-success/10 p-2">
                <p className="text-lg font-bold text-success">{importStats.inserted}</p>
                <p className="text-[10px] text-muted-foreground">Insertados</p>
              </div>
              <div className="rounded-xl bg-warning/10 p-2">
                <p className="text-lg font-bold text-warning">{importStats.skipped}</p>
                <p className="text-[10px] text-muted-foreground">Omitidos</p>
              </div>
              <div className="rounded-xl bg-destructive/10 p-2">
                <p className="text-lg font-bold text-destructive">{importStats.failed}</p>
                <p className="text-[10px] text-muted-foreground">Fallidos</p>
              </div>
            </div>
            <Button className="w-full" onClick={() => { onOpenChange(false); reset(); }}>Cerrar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
