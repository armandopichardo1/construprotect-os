import { useState, useMemo, Fragment, useRef, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { cn } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Search, Download, ChevronRight, ChevronDown, FolderInput } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { exportToExcel } from '@/lib/export-utils';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';

const tabs = ['Proveedores', 'Productos', 'Marcas', 'Servicios', 'Cuentas Contables'];

export default function MaestrasPage() {
  const [tab, setTab] = useState('Proveedores');

  return (
    <AppLayout>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <span className="text-xl">📋</span>
          <h1 className="text-xl font-bold text-foreground">Maestras</h1>
        </div>

        <div className="flex gap-1 rounded-lg bg-muted p-0.5 flex-wrap">
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {t}
            </button>
          ))}
        </div>

        {tab === 'Proveedores' && <ProveedoresMaestra />}
        {tab === 'Productos' && <ProductosMaestra />}
        {tab === 'Marcas' && <MarcasMaestra />}
        {tab === 'Servicios' && <ServiciosMaestra />}
        {tab === 'Cuentas Contables' && <CuentasMaestra />}
      </div>
    </AppLayout>
  );
}

// ============ GENERIC CRUD HELPERS ============

function useSearch(data: any[], keys: string[]) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(r => keys.some(k => String(r[k] || '').toLowerCase().includes(q)));
  }, [data, search, keys]);
  return { search, setSearch, filtered };
}
// ============ PROVEEDORES ============
  const renderRow = (a: any, depth: number, hasChildren: boolean, isCollapsed: boolean) => {
    const balance = hasChildren ? getSubtreeBalance(a.id) : getAccountBalance(a.id);
    const isInline = inlineEdit?.id === a.id;
    const hasKids = hasChildren;
    return (
    <TableRow key={a.id} className={cn(hasKids && 'bg-muted/40 font-semibold', selected.has(a.id) && 'bg-primary/5')}>
      <TableCell className="w-8 px-2">
        <Checkbox checked={selected.has(a.id)} onCheckedChange={() => toggleSelect(a.id)} className="h-3.5 w-3.5" />
      </TableCell>
      <TableCell className="text-xs font-mono font-medium">
        <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 20}px` }}>
          {hasChildren ? (
            <button onClick={() => toggleCollapse(a.id)} className="w-5 h-5 rounded flex items-center justify-center hover:bg-muted transition-colors">
              {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
            </button>
          ) : (
            <span className="w-5" />
          )}
          {depth > 0 && <span className="w-4 border-l-2 border-b-2 border-border h-3 mr-1 rounded-bl-sm" />}
          {isInline ? (
            <Input
              ref={inlineCodeRef}
              value={inlineEdit.code}
              onChange={e => setInlineEdit(prev => prev ? { ...prev, code: e.target.value } : prev)}
              onKeyDown={handleInlineKeyDown}
              className="h-7 w-24 text-xs font-mono px-1.5"
              placeholder="Código"
            />
          ) : (
            <span onDoubleClick={() => hasKids && setInlineEdit({ id: a.id, code: a.code || '', description: a.description })} className={cn(hasKids && 'cursor-text')}>
              {a.code || '—'}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className={cn('text-xs', hasKids ? 'font-semibold' : '')}>
        {isInline ? (
          <div className="flex items-center gap-1.5">
            <Input
              value={inlineEdit.description}
              onChange={e => setInlineEdit(prev => prev ? { ...prev, description: e.target.value } : prev)}
              onKeyDown={handleInlineKeyDown}
              className="h-7 text-xs px-1.5 flex-1"
              placeholder="Descripción *"
            />
            <Button size="sm" className="h-7 text-[10px] px-2" onClick={handleInlineSave}>✓</Button>
            <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2" onClick={() => setInlineEdit(null)}>✕</Button>
          </div>
        ) : (
          <div className="flex flex-col">
            <span className="inline-flex items-center gap-1.5" onDoubleClick={() => hasKids && setInlineEdit({ id: a.id, code: a.code || '', description: a.description })}>
              {a.description}
              {hasKids && (
                <span className="inline-flex items-center justify-center rounded-full bg-primary/10 text-primary text-[9px] font-semibold min-w-[18px] h-[18px] px-1">
                  {(childrenMap[a.id] || []).length}
                </span>
              )}
            </span>
            {depth > 0 && (() => {
              const crumbs = getBreadcrumb(a);
              const tooltipText = crumbs.length > 0
                ? [...crumbs.map(c => `${c.code ? c.code + ' · ' : ''}${c.description}`), `${a.code ? a.code + ' · ' : ''}${a.description}`].join(' → ')
                : '';
              return crumbs.length > 0 ? (
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-[10px] text-muted-foreground/60 mt-0.5 flex items-center gap-0.5 cursor-help">
                        {crumbs.map((c, i) => (
                          <Fragment key={i}>
                            {i > 0 && <span className="text-muted-foreground/40">›</span>}
                            <span>{c.code || c.description}</span>
                          </Fragment>
                        ))}
                        <span className="text-muted-foreground/40">›</span>
                        <span className="text-muted-foreground/80">{a.code || a.description}</span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="start" className="max-w-xs text-xs">
                      {tooltipText}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null;
            })()}
          </div>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{a.classification || '—'}</TableCell>
      <TableCell><span className={cn('text-[10px] px-2 py-0.5 rounded-full', typeColors[a.account_type] || 'bg-muted text-muted-foreground')}>{a.account_type}</span></TableCell>
      <TableCell className="text-xs text-muted-foreground">{a.currency || '—'}</TableCell>
      <TableCell className={cn('text-xs text-right font-mono', balance > 0 ? (hasKids ? 'font-bold text-foreground' : 'text-muted-foreground') : 'text-muted-foreground/50')}>
        {balance > 0 ? `$${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing({ ...a, parent_id: a.parent_id || '' })}><Pencil className="w-3 h-3" /></Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleting(a)}><Trash2 className="w-3 h-3" /></Button>
        </div>
      </TableCell>
    </TableRow>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cuenta..." className="pl-9 h-9" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {accountTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="ghost" onClick={expandAll} className="text-xs">Expandir</Button>
        <Button size="sm" variant="ghost" onClick={collapseAll} className="text-xs">Colapsar</Button>
        <span className="text-xs text-muted-foreground">{filtered.length} cuentas</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportToExcel(accounts.map(a => ({ Código: a.code, Descripción: a.description, Clasificación: a.classification, Tipo: a.account_type, Moneda: a.currency })), 'catalogo_cuentas', 'Cuentas')}><Download className="w-3.5 h-3.5 mr-1" />Excel</Button>
          <Button size="sm" onClick={() => setEditing({ code: '', description: '', classification: '', account_type: 'Gasto', currency: '', parent_id: '' })}><Plus className="w-3.5 h-3.5 mr-1" />Nueva</Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="w-8 px-2">
              <Checkbox checked={allChildIds.length > 0 && selected.size === allChildIds.length} onCheckedChange={toggleSelectAll} className="h-3.5 w-3.5" />
            </TableHead>
            <TableHead className="text-xs w-28">Código</TableHead>
            <TableHead className="text-xs">Descripción</TableHead>
            <TableHead className="text-xs">Clasificación</TableHead>
            <TableHead className="text-xs">Tipo</TableHead>
            <TableHead className="text-xs">Moneda</TableHead>
            <TableHead className="text-xs text-right">Saldo (USD)</TableHead>
            <TableHead className="text-xs w-20"></TableHead>
          </TableRow></TableHeader>
          <TableBody>
             {(() => {
               const renderTree = (items: any[], depth: number): React.ReactNode[] => {
                 return items.flatMap((a: any) => {
                   const children = childrenMap[a.id] || [];
                   const hasChildren = children.length > 0;
                   const isCollapsed = !!collapsed[a.id];
                   const rows: React.ReactNode[] = [renderRow(a, depth, hasChildren, isCollapsed)];
                   if (hasChildren && !isCollapsed) {
                     rows.push(...renderTree(children, depth + 1));
                   }
                   return rows;
                 });
               };
               return renderTree(rootAccounts, 0);
             })()}
             {rootAccounts.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-xs text-muted-foreground py-8">{isLoading ? 'Cargando...' : 'Sin registros'}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5">
          <span className="text-xs font-medium text-foreground">{selected.size} cuenta(s) seleccionada(s)</span>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => { setBulkTargetParent('none'); setBulkMoveOpen(true); }}>
            <FolderInput className="w-3.5 h-3.5" />Mover a otra madre
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setBulkDeleteOpen(true)}>
            <Trash2 className="w-3.5 h-3.5" />Eliminar
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelected(new Set())}>Deseleccionar</Button>
        </div>
      )}

      {bulkMoveOpen && (
        <Dialog open onOpenChange={() => setBulkMoveOpen(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle className="text-base">Mover {selected.size} cuenta(s)</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Cuenta madre destino</Label>
                <Select value={bulkTargetParent} onValueChange={setBulkTargetParent}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin cuenta madre (raíz)</SelectItem>
                    {bulkMoveTargets.map((p: any) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">{p.code ? `${p.code} · ` : ''}{p.description}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="rounded-lg bg-muted/50 p-2.5 max-h-32 overflow-y-auto">
                <p className="text-[10px] font-medium text-muted-foreground mb-1">Cuentas a mover:</p>
                {Array.from(selected).map(id => {
                  const acc = accountById[id];
                  return acc ? <p key={id} className="text-xs text-muted-foreground">{acc.code ? `${acc.code} · ` : ''}{acc.description}</p> : null;
                })}
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={handleBulkMove} disabled={bulkMoving} className="flex-1 text-xs">{bulkMoving ? 'Moviendo...' : 'Mover'}</Button>
                <Button variant="outline" onClick={() => setBulkMoveOpen(false)} className="text-xs">Cancelar</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {editing && (
        <Dialog open onOpenChange={() => setEditing(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>{editing.id ? 'Editar Cuenta' : 'Nueva Cuenta'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Código</Label><Input value={editing.code || ''} onChange={e => setEditing((p: any) => ({ ...p, code: e.target.value }))} className="mt-1" /></div>
                <div><Label className="text-xs">Tipo *</Label>
                  <Select value={editing.account_type} onValueChange={v => setEditing((p: any) => ({ ...p, account_type: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Activo','Pasivo','Capital','Ingreso','Costo','Gasto','Ingresos No Operacionales','Gastos No Operacionales'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label className="text-xs">Descripción *</Label><Input value={editing.description} onChange={e => setEditing((p: any) => ({ ...p, description: e.target.value }))} className="mt-1" /></div>
              <div><Label className="text-xs">Cuenta Madre</Label>
                {!creatingParent ? (
                  <div className="flex gap-1.5 mt-1">
                    <Select value={editing.parent_id || 'none'} onValueChange={v => setEditing((p: any) => ({ ...p, parent_id: v === 'none' ? '' : v }))}>
                      <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sin cuenta madre</SelectItem>
                        {possibleParents.filter((p: any) => p.id !== editing.id).map((p: any) => (
                          <SelectItem key={p.id} value={p.id} className="text-xs">{p.code} · {p.description}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="sm" className="h-9 px-2 shrink-0" onClick={() => { setCreatingParent(true); setNewParent({ code: '', description: '', account_type: editing.account_type || 'Activo' }); }}>
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="mt-1 rounded-lg border border-border bg-muted/30 p-2.5 space-y-2">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Nueva cuenta madre</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Código (ej: 14000)" value={newParent.code} onChange={e => setNewParent(p => ({ ...p, code: e.target.value }))} className="h-8 text-xs" />
                      <Select value={newParent.account_type} onValueChange={v => setNewParent(p => ({ ...p, account_type: v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {['Activo','Pasivo','Capital','Ingreso','Costo','Gasto','Ingresos No Operacionales','Gastos No Operacionales'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input placeholder="Descripción *" value={newParent.description} onChange={e => setNewParent(p => ({ ...p, description: e.target.value }))} className="h-8 text-xs" />
                    <div className="flex gap-1.5">
                      <Button type="button" size="sm" className="h-7 text-xs flex-1" onClick={async () => {
                        if (!newParent.description.trim()) { toast.error('Descripción requerida'); return; }
                        const { data, error } = await supabase.from('chart_of_accounts').insert({
                          code: newParent.code || null,
                          description: newParent.description,
                          account_type: newParent.account_type,
                          parent_id: null,
                        }).select('id').single();
                        if (error) { toast.error('Error al crear cuenta madre'); return; }
                        toast.success('Cuenta madre creada');
                        queryClient.invalidateQueries({ queryKey: ['maestras-accounts'] });
                        setEditing((p: any) => ({ ...p, parent_id: data.id }));
                        setCreatingParent(false);
                      }}>Crear y asignar</Button>
                      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setCreatingParent(false)}>Cancelar</Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Clasificación</Label><Input value={editing.classification || ''} onChange={e => setEditing((p: any) => ({ ...p, classification: e.target.value }))} className="mt-1" /></div>
                <div><Label className="text-xs">Moneda</Label>
                  <Select value={editing.currency || 'none'} onValueChange={v => setEditing((p: any) => ({ ...p, currency: v === 'none' ? null : v }))}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin especificar</SelectItem>
                      <SelectItem value="DOP">DOP</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Button onClick={() => { if (!editing.description) { toast.error('Descripción requerida'); return; } handleSave(editing); }} className="flex-1">Guardar</Button>
                <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
      <DeleteConfirmDialog open={!!deleting} onOpenChange={() => setDeleting(null)} onConfirm={handleDelete} title="Eliminar Cuenta" description={`¿Eliminar "${deleting?.code} - ${deleting?.description}"?`} />

      {bulkDeleteOpen && (
        <Dialog open onOpenChange={() => setBulkDeleteOpen(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle className="text-base text-destructive">Eliminar {selected.size} cuenta(s)</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Esta acción es irreversible. Las siguientes cuentas serán eliminadas permanentemente:</p>
              <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-2.5 max-h-40 overflow-y-auto">
                {Array.from(selected).map(id => {
                  const acc = accountById[id];
                  return acc ? <p key={id} className="text-xs text-muted-foreground">{acc.code ? `${acc.code} · ` : ''}{acc.description}</p> : null;
                })}
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting} className="flex-1 text-xs">{bulkDeleting ? 'Eliminando...' : 'Eliminar'}</Button>
                <Button variant="outline" onClick={() => setBulkDeleteOpen(false)} className="text-xs">Cancelar</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
