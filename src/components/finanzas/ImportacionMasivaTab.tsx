import { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle, AlertTriangle, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { parseWorkbook, buildPreview, executeImport, type ImportPreview, type ImportLog } from '@/lib/bulk-import';

const SHEET_LABELS: Record<string, { icon: string; label: string }> = {
  TASAS_CAMBIO: { icon: '💱', label: 'Tasas de cambio' },
  VENTAS: { icon: '🧾', label: 'Ventas' },
  VENTAS_ITEMS: { icon: '📋', label: 'Ítems de ventas' },
  GASTOS: { icon: '💸', label: 'Gastos' },
  COMPRAS_PO: { icon: '📦', label: 'Compras / POs' },
  COMPRAS_ITEMS: { icon: '🧱', label: 'Ítems de compras' },
  MOVIMIENTOS_CAJA: { icon: '🏦', label: 'Movimientos de caja' },
};

export function ImportacionMasivaTab() {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [catalog, setCatalog] = useState<any>(null);
  const [logs, setLogs] = useState<ImportLog[] | null>(null);
  const [expandedSheet, setExpandedSheet] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setParsing(true); setPreview(null); setLogs(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = parseWorkbook(buf);
      const { preview, catalog } = await buildPreview(wb);
      setPreview(preview); setCatalog(catalog);
      const total = Object.values(preview.sheets).reduce((s, x) => s + x.totalRows, 0);
      toast.success(`Plantilla parseada: ${total} filas en ${Object.keys(preview.sheets).length} hojas`);
    } catch (e: any) {
      toast.error('Error al parsear plantilla', { description: e.message });
    } finally { setParsing(false); }
  };

  const handleExecute = async () => {
    if (!preview || !catalog) return;
    setExecuting(true);
    try {
      const result = await executeImport(preview, catalog);
      setLogs(result);
      const ok = result.filter(r => r.ok).length;
      const fail = result.filter(r => !r.ok).length;
      toast[fail === 0 ? 'success' : 'warning'](`Importación completa: ${ok} ok · ${fail} errores`);
      queryClient.invalidateQueries();
    } catch (e: any) {
      toast.error('Error en importación', { description: e.message });
    } finally { setExecuting(false); }
  };

  const downloadTemplate = () => {
    toast.info('Descarga la plantilla desde el chat (mensaje anterior)', {
      description: 'Archivo: plantilla_carga_masiva.xlsx',
    });
  };

  const totalRows = preview ? Object.values(preview.sheets).reduce((s, x) => s + x.totalRows, 0) : 0;
  const totalErrors = preview ? Object.values(preview.sheets).reduce((s, x) => s + x.errorRows, 0) : 0;
  const totalWarnings = preview ? Object.values(preview.sheets).reduce((s, x) => s + x.warningRows, 0) : 0;

  return (
    <div className="space-y-5">
      {/* Header / actions */}
      <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-semibold text-foreground">Importación Masiva</h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              Sube la plantilla Excel con ventas, gastos, compras y movimientos. El sistema valida todo,
              te muestra preview con errores fila por fila y crea las transacciones + asientos contables + efectos en inventario al confirmar.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="w-3.5 h-3.5 mr-1.5" /> Plantilla
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
              onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={parsing}>
              {parsing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
              {parsing ? 'Parseando…' : 'Subir Excel'}
            </Button>
          </div>
        </div>
      </div>

      {/* Preview summary */}
      {preview && (
        <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
              <div>
                <p className="text-sm font-semibold">Vista previa</p>
                <p className="text-xs text-muted-foreground">
                  {totalRows} filas · {totalErrors} con error · {totalWarnings} con warning · {Object.keys(preview.sheets).length} hojas
                </p>
              </div>
            </div>
            <Button size="sm" disabled={!preview.ready || executing} onClick={handleExecute}
              className={cn(preview.ready ? 'bg-primary' : 'bg-muted text-muted-foreground')}>
              {executing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1.5" />}
              {executing ? 'Creando todo…' : preview.ready ? 'Confirmar e importar todo' : 'Corrige errores antes de importar'}
            </Button>
          </div>

          {/* Catalog actions banner */}
          {(preview.catalogActions.productsToCreate.length > 0 || preview.catalogActions.contactsMissing.length > 0
            || preview.catalogActions.suppliersMissing.length > 0 || preview.catalogActions.accountsMissing.length > 0
            || preview.catalogActions.ratesNeeded.length > 0) && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5 text-[11px]">
              <p className="font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Acciones sobre el catálogo
              </p>
              {preview.catalogActions.productsToCreate.length > 0 && (
                <p className="text-amber-700 dark:text-amber-300">
                  ✅ Auto-crearé <span className="font-mono">{preview.catalogActions.productsToCreate.length}</span> productos nuevos (con costo $0): {preview.catalogActions.productsToCreate.slice(0, 8).join(', ')}{preview.catalogActions.productsToCreate.length > 8 ? '…' : ''}
                </p>
              )}
              {preview.catalogActions.contactsMissing.length > 0 && (
                <p className="text-destructive">
                  ⚠️ Faltan crear <span className="font-mono">{preview.catalogActions.contactsMissing.length}</span> contactos: {preview.catalogActions.contactsMissing.slice(0, 5).join(', ')}{preview.catalogActions.contactsMissing.length > 5 ? '…' : ''}
                </p>
              )}
              {preview.catalogActions.suppliersMissing.length > 0 && (
                <p className="text-destructive">
                  ⚠️ Faltan crear <span className="font-mono">{preview.catalogActions.suppliersMissing.length}</span> proveedores: {preview.catalogActions.suppliersMissing.join(', ')}
                </p>
              )}
              {preview.catalogActions.accountsMissing.length > 0 && (
                <p className="text-destructive">
                  ⚠️ Códigos de cuenta no existen: {preview.catalogActions.accountsMissing.join(', ')}
                </p>
              )}
              {preview.catalogActions.ratesNeeded.length > 0 && (
                <p className="text-amber-700 dark:text-amber-300">
                  💱 Faltan tasas para {preview.catalogActions.ratesNeeded.length} fechas: {preview.catalogActions.ratesNeeded.slice(0, 5).join(', ')}{preview.catalogActions.ratesNeeded.length > 5 ? '…' : ''} (puedes incluirlas en hoja TASAS_CAMBIO)
                </p>
              )}
            </div>
          )}

          {/* Sheets table */}
          <div className="space-y-2">
            {Object.values(preview.sheets).map(s => {
              const meta = SHEET_LABELS[s.sheet] || { icon: '📄', label: s.sheet };
              const expanded = expandedSheet === s.sheet;
              return (
                <div key={s.sheet} className="rounded-lg border border-border overflow-hidden">
                  <button onClick={() => setExpandedSheet(expanded ? null : s.sheet)}
                    className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-base">{meta.icon}</span>
                      <span className="font-medium">{meta.label}</span>
                      <span className="text-xs text-muted-foreground">({s.totalRows} filas)</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      {s.validRows > 0 && <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> {s.validRows}</span>}
                      {s.warningRows > 0 && <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {s.warningRows}</span>}
                      {s.errorRows > 0 && <span className="text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {s.errorRows}</span>}
                    </div>
                  </button>
                  {expanded && s.rows.length > 0 && (
                    <div className="max-h-96 overflow-auto border-t border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-[10px]">Fila</TableHead>
                            <TableHead className="text-[10px]">Estado</TableHead>
                            <TableHead className="text-[10px]">Datos clave</TableHead>
                            <TableHead className="text-[10px]">Mensajes</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {s.rows.slice(0, 200).map(r => (
                            <TableRow key={r.rowNum} className={cn(
                              r.status === 'error' && 'bg-destructive/5',
                              r.status === 'warning' && 'bg-amber-500/5',
                            )}>
                              <TableCell className="text-[10px] font-mono">#{r.rowNum}</TableCell>
                              <TableCell className="text-[10px]">
                                {r.status === 'valid' && <span className="text-emerald-600 dark:text-emerald-400">✓ Válido</span>}
                                {r.status === 'warning' && <span className="text-amber-600 dark:text-amber-400">⚠ Warn</span>}
                                {r.status === 'error' && <span className="text-destructive">✗ Error</span>}
                              </TableCell>
                              <TableCell className="text-[10px] font-mono max-w-md truncate">
                                {Object.entries(r.data).filter(([k]) => !k.startsWith('__')).slice(0, 4).map(([k, v]) => (
                                  <span key={k} className="mr-2"><span className="text-muted-foreground">{k}:</span> {String(v)}</span>
                                ))}
                              </TableCell>
                              <TableCell className="text-[10px]">
                                {r.errors.map((e, i) => <div key={'e' + i} className="text-destructive">{e}</div>)}
                                {r.warnings.map((w, i) => <div key={'w' + i} className="text-amber-600 dark:text-amber-400">{w}</div>)}
                              </TableCell>
                            </TableRow>
                          ))}
                          {s.rows.length > 200 && (
                            <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground">…y {s.rows.length - 200} filas más</TableCell></TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Logs */}
      {logs && (
        <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Resultado de la importación</p>
              <p className="text-xs text-muted-foreground">
                {logs.filter(l => l.ok).length} creados · {logs.filter(l => !l.ok).length} errores
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => {
              const csv = ['type,ref,ok,id,error', ...logs.map(l => `${l.type},"${l.ref || ''}",${l.ok},${l.id || ''},"${l.error || ''}"`)].join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
              a.download = `import-log-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
            }}>
              <Download className="w-3.5 h-3.5 mr-1.5" /> Descargar log
            </Button>
          </div>
          <div className="max-h-96 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Tipo</TableHead>
                  <TableHead className="text-[10px]">Referencia</TableHead>
                  <TableHead className="text-[10px]">Estado</TableHead>
                  <TableHead className="text-[10px]">Detalle</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l, i) => (
                  <TableRow key={i} className={cn(!l.ok && 'bg-destructive/5')}>
                    <TableCell className="text-[10px]">{l.type}</TableCell>
                    <TableCell className="text-[10px] font-mono truncate max-w-xs">{l.ref}</TableCell>
                    <TableCell className="text-[10px]">{l.ok ? <span className="text-emerald-600 dark:text-emerald-400">✓ OK</span> : <span className="text-destructive">✗ Error</span>}</TableCell>
                    <TableCell className="text-[10px] text-muted-foreground">{l.error || l.id?.slice(0, 8)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
