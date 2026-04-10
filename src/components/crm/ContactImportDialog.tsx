import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { parseContactExcel, CONTACT_COLUMNS, downloadContactTemplate, type ContactImportResult, type ContactRow } from '@/lib/contact-import';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Upload, Download, FileSpreadsheet, CheckCircle2, Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'upload' | 'preview' | 'importing' | 'done';

export function ContactImportDialog({ open, onOpenChange }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [result, setResult] = useState<ContactImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [importStats, setImportStats] = useState({ inserted: 0, skipped: 0, failed: 0 });
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const reset = () => { setStep('upload'); setResult(null); setImportStats({ inserted: 0, skipped: 0, failed: 0 }); };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.match(/\.xlsx?$/i)) { toast.error('Solo se aceptan archivos .xlsx o .xls'); return; }
    try {
      const parsed = await parseContactExcel(file);
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
    const batches: ContactRow[][] = [];
    for (let i = 0; i < result.valid.length; i += 20) batches.push(result.valid.slice(i, i + 20));

    for (const batch of batches) {
      const rows = batch.map(c => ({
        contact_name: c.contact_name,
        company_name: c.company_name || null,
        rnc: c.rnc || null,
        email: c.email || null,
        phone: c.phone || null,
        whatsapp: c.whatsapp || null,
        segment: c.segment || null,
        priority: c.priority || 3,
        territory: c.territory || null,
        address: c.address || null,
        source: c.source || null,
        price_tier: c.price_tier || 'list',
        notes: c.notes || null,
        tags: c.tags ? c.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      }));

      const { error, data } = await supabase.from('contacts').insert(rows).select('id');
      if (error) {
        for (const row of rows) {
          const { error: sErr } = await supabase.from('contacts').insert(row);
          if (sErr) failed++; else inserted++;
        }
      } else {
        inserted += data?.length || rows.length;
      }
    }

    setImportStats({ inserted, skipped, failed });
    setStep('done');
    setImporting(false);
    queryClient.invalidateQueries({ queryKey: ['crm-contacts'] });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!importing) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            {step === 'upload' && 'Importar Contactos desde Excel'}
            {step === 'preview' && 'Vista Previa de Importación'}
            {step === 'importing' && 'Importando...'}
            {step === 'done' && 'Importación Completa'}
          </DialogTitle>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <div onClick={() => fileRef.current?.click()} className="border-2 border-dashed border-border rounded-2xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors">
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">Arrastra o haz clic para seleccionar</p>
              <p className="text-xs text-muted-foreground mt-1">Archivos .xlsx o .xls</p>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
            </div>
            <div className="rounded-xl bg-muted p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground">Columnas esperadas:</p>
              <div className="flex flex-wrap gap-1.5">
                {CONTACT_COLUMNS.map(c => (
                  <span key={c.field} className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', c.required ? 'bg-primary/15 text-primary' : 'bg-card text-muted-foreground border border-border')}>
                    {c.header}{c.required ? ' *' : ''}
                  </span>
                ))}
              </div>
              <Button variant="outline" size="sm" className="w-full mt-2 text-xs rounded-xl" onClick={downloadContactTemplate}>
                <Download className="w-3.5 h-3.5 mr-1" /> Descargar plantilla Excel
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && result && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-muted p-2"><p className="text-lg font-bold text-foreground">{result.totalRows}</p><p className="text-[10px] text-muted-foreground">Total filas</p></div>
              <div className="rounded-xl bg-success/10 p-2"><p className="text-lg font-bold text-success">{result.valid.length}</p><p className="text-[10px] text-muted-foreground">Válidas</p></div>
              <div className="rounded-xl bg-destructive/10 p-2"><p className="text-lg font-bold text-destructive">{result.errors.length}</p><p className="text-[10px] text-muted-foreground">Errores</p></div>
            </div>
            {result.errors.length > 0 && (
              <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-3 space-y-1.5 max-h-40 overflow-y-auto">
                <p className="text-xs font-semibold text-destructive">Errores encontrados:</p>
                {result.errors.slice(0, 20).map((err, i) => (
                  <p key={i} className="text-[10px] text-muted-foreground">Fila {err.row}{err.field ? `, "${err.field}"` : ''}: {err.message}</p>
                ))}
              </div>
            )}
            {result.valid.length > 0 && (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="overflow-x-auto max-h-48">
                  <table className="w-full text-xs">
                    <thead className="bg-muted"><tr>
                      <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Nombre</th>
                      <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Empresa</th>
                      <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Segmento</th>
                      <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Teléfono</th>
                      <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Email</th>
                    </tr></thead>
                    <tbody>{result.valid.slice(0, 10).map((c, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-2 py-1.5 text-foreground">{c.contact_name}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{c.company_name || '—'}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{c.segment || '—'}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{c.phone || '—'}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{c.email || '—'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                {result.valid.length > 10 && <p className="text-[10px] text-muted-foreground text-center py-1 bg-muted">...y {result.valid.length - 10} contactos más</p>}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={reset}>Cancelar</Button>
              <Button className="flex-1" onClick={handleImport} disabled={result.valid.length === 0}>Importar {result.valid.length} contactos</Button>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="py-8 text-center space-y-3">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Importando contactos...</p>
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-4">
            <div className="py-4 text-center">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-success" />
              <p className="text-sm font-medium text-foreground">Importación completada</p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-success/10 p-2"><p className="text-lg font-bold text-success">{importStats.inserted}</p><p className="text-[10px] text-muted-foreground">Insertados</p></div>
              <div className="rounded-xl bg-warning/10 p-2"><p className="text-lg font-bold text-warning">{importStats.skipped}</p><p className="text-[10px] text-muted-foreground">Omitidos</p></div>
              <div className="rounded-xl bg-destructive/10 p-2"><p className="text-lg font-bold text-destructive">{importStats.failed}</p><p className="text-[10px] text-muted-foreground">Fallidos</p></div>
            </div>
            <Button className="w-full" onClick={() => { onOpenChange(false); reset(); }}>Cerrar</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
