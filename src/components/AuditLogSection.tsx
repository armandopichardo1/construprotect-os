import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Eye, FileText, Users, Boxes, DollarSign, Database, Clock } from 'lucide-react';

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  create: { label: 'Creado', color: 'bg-success/15 text-success' },
  update: { label: 'Editado', color: 'bg-primary/15 text-primary' },
  delete: { label: 'Eliminado', color: 'bg-destructive/15 text-destructive' },
};

const MODULE_ICONS: Record<string, React.ReactNode> = {
  Inventario: <Boxes className="w-3.5 h-3.5" />,
  CRM: <Users className="w-3.5 h-3.5" />,
  Finanzas: <DollarSign className="w-3.5 h-3.5" />,
  Maestras: <Database className="w-3.5 h-3.5" />,
  Sistema: <FileText className="w-3.5 h-3.5" />,
};

const TABLE_LABELS: Record<string, string> = {
  products: 'Producto',
  inventory_movements: 'Movimiento Inv.',
  shipments: 'Envío',
  contacts: 'Contacto',
  deals: 'Deal',
  activities: 'Actividad',
  quotes: 'Cotización',
  client_projects: 'Proyecto',
  expenses: 'Gasto',
  costs: 'Costo',
  sales: 'Venta',
  journal_entries: 'Asiento Contable',
  brands: 'Marca',
  suppliers: 'Proveedor',
  services: 'Servicio',
  locations: 'Ubicación',
  competitor_entries: 'Competencia',
  product_requests: 'Solicitud Producto',
  crm_clients: 'Cliente CRM',
  crm_opportunities: 'Oportunidad',
};

const FIELD_LABELS: Record<string, string> = {
  name: 'Nombre', contact_name: 'Contacto', title: 'Título', description: 'Descripción',
  sku: 'SKU', category: 'Categoría', brand: 'Marca', stage: 'Etapa', status: 'Estado',
  quantity: 'Cantidad', unit_cost_usd: 'Costo Unit.', movement_type: 'Tipo Mov.',
  amount_usd: 'Monto USD', amount_dop: 'Monto DOP', total_usd: 'Total USD',
  email: 'Email', phone: 'Teléfono', notes: 'Notas', date: 'Fecha',
  value_usd: 'Valor USD', probability: 'Probabilidad', segment: 'Segmento',
  price_list_usd: 'Precio Lista', is_active: 'Activo', vendor: 'Proveedor',
  quote_number: 'No. Cotización', invoice_ref: 'Ref. Factura',
  supplier_name: 'Proveedor', po_number: 'No. PO', project_name: 'Proyecto',
  payment_status: 'Estado Pago', exchange_rate: 'Tasa Cambio',
  total_debit_usd: 'Total Débito', total_credit_usd: 'Total Crédito',
  quantity_on_hand: 'Stock', reorder_point: 'Punto Reorden',
};

const SKIP_FIELDS = new Set(['id', 'created_at', 'updated_at', 'created_by']);

interface AuditRow {
  id: string;
  created_at: string;
  user_id: string | null;
  user_name: string | null;
  module: string;
  table_name: string;
  action: string;
  record_id: string | null;
  summary: string;
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
}

export function AuditLogSection() {
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [selectedRow, setSelectedRow] = useState<AuditRow | null>(null);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['audit-log'],
    queryFn: async () => {
      const { data } = await supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      return (data || []) as AuditRow[];
    },
    refetchInterval: 30000,
  });

  const filtered = useMemo(() => {
    return logs.filter(r => {
      if (moduleFilter !== 'all' && r.module !== moduleFilter) return false;
      if (actionFilter !== 'all' && r.action !== actionFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          r.summary.toLowerCase().includes(s) ||
          r.user_name?.toLowerCase().includes(s) ||
          r.table_name.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [logs, moduleFilter, actionFilter, search]);

  const modules = useMemo(() => [...new Set(logs.map(r => r.module))].sort(), [logs]);

  if (isLoading) {
    return <p className="text-xs text-muted-foreground py-8 text-center">Cargando historial de actividad...</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Historial de Actividad</h2>
        <p className="text-xs text-muted-foreground">{filtered.length} registro(s) — Todas las operaciones del sistema</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder="Buscar por descripción, usuario..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8 h-8 text-xs"
          />
        </div>
        <Select value={moduleFilter} onValueChange={setModuleFilter}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue placeholder="Módulo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los módulos</SelectItem>
            {modules.map(m => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue placeholder="Acción" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="create">Creado</SelectItem>
            <SelectItem value="update">Editado</SelectItem>
            <SelectItem value="delete">Eliminado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden max-h-[calc(100vh-320px)] overflow-auto">
        <Table wrapperClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
            <TableRow>
              <TableHead className="text-xs w-[130px]">Fecha</TableHead>
              <TableHead className="text-xs w-[100px]">Módulo</TableHead>
              <TableHead className="text-xs w-[80px]">Acción</TableHead>
              <TableHead className="text-xs">Descripción</TableHead>
              <TableHead className="text-xs w-[100px]">Tipo</TableHead>
              <TableHead className="text-xs w-[130px]">Usuario</TableHead>
              <TableHead className="text-xs w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(row => {
              const actionInfo = ACTION_LABELS[row.action] || { label: row.action, color: 'bg-muted text-muted-foreground' };
              return (
                <TableRow
                  key={row.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setSelectedRow(row)}
                >
                  <TableCell className="text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      {new Date(row.created_at).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: '2-digit' })}
                      {' '}
                      <span className="text-[10px]">{new Date(row.created_at).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-1.5">
                      {MODULE_ICONS[row.module]}
                      {row.module}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn('text-[10px] font-medium', actionInfo.color)}>
                      {actionInfo.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-medium max-w-[250px] truncate">{row.summary}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{TABLE_LABELS[row.table_name] || row.table_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground truncate">{row.user_name || '—'}</TableCell>
                  <TableCell>
                    <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">
            {logs.length === 0 ? 'Aún no hay registros de actividad' : 'No se encontraron registros con esos filtros'}
          </p>
        )}
      </div>

      {/* Detail Dialog */}
      <AuditDetailDialog row={selectedRow} onClose={() => setSelectedRow(null)} />
    </div>
  );
}

function AuditDetailDialog({ row, onClose }: { row: AuditRow | null; onClose: () => void }) {
  if (!row) return null;

  const actionInfo = ACTION_LABELS[row.action] || { label: row.action, color: '' };

  // Compute changes for updates
  const changes = useMemo(() => {
    if (row.action !== 'update' || !row.old_data || !row.new_data) return null;
    const diffs: { field: string; old: any; new: any }[] = [];
    for (const key of Object.keys(row.new_data)) {
      if (SKIP_FIELDS.has(key)) continue;
      const oldVal = row.old_data[key];
      const newVal = row.new_data[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        diffs.push({ field: key, old: oldVal, new: newVal });
      }
    }
    return diffs;
  }, [row]);

  const displayData = row.action === 'delete' ? row.old_data : row.new_data;

  return (
    <Dialog open={!!row} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            {MODULE_ICONS[row.module]}
            Detalle de Registro
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Header info */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-muted-foreground">Módulo:</span>{' '}
              <span className="font-medium">{row.module}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Tipo:</span>{' '}
              <span className="font-medium">{TABLE_LABELS[row.table_name] || row.table_name}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Acción:</span>{' '}
              <Badge variant="outline" className={cn('text-[10px]', actionInfo.color)}>{actionInfo.label}</Badge>
            </div>
            <div>
              <span className="text-muted-foreground">Usuario:</span>{' '}
              <span className="font-medium">{row.user_name || 'Sistema'}</span>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Fecha:</span>{' '}
              <span className="font-medium">
                {new Date(row.created_at).toLocaleDateString('es-DO', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                {' '}
                {new Date(row.created_at).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          </div>

          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold mb-2">
              {row.action === 'update' ? 'Cambios realizados' : row.action === 'delete' ? 'Datos eliminados' : 'Datos creados'}
            </p>

            {/* For updates, show diff */}
            {row.action === 'update' && changes && changes.length > 0 ? (
              <div className="space-y-2">
                {changes.map(c => (
                  <div key={c.field} className="rounded-lg bg-muted/50 p-2.5">
                    <p className="text-[10px] font-semibold text-muted-foreground mb-1">{FIELD_LABELS[c.field] || c.field}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-[9px] text-muted-foreground block">Antes</span>
                        <span className="text-destructive line-through">{formatValue(c.old)}</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-muted-foreground block">Después</span>
                        <span className="text-success font-medium">{formatValue(c.new)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* For create/delete, show key fields */
              displayData && (
                <div className="space-y-1">
                  {Object.entries(displayData)
                    .filter(([k]) => !SKIP_FIELDS.has(k))
                    .filter(([, v]) => v !== null && v !== '' && v !== 0)
                    .slice(0, 15)
                    .map(([k, v]) => (
                      <div key={k} className="flex justify-between text-xs py-1 border-b border-border/50 last:border-0">
                        <span className="text-muted-foreground">{FIELD_LABELS[k] || k}</span>
                        <span className="font-medium text-right max-w-[60%] truncate">{formatValue(v)}</span>
                      </div>
                    ))}
                </div>
              )
            )}

            {row.action === 'update' && changes && changes.length === 0 && (
              <p className="text-xs text-muted-foreground italic">Sin cambios significativos detectados</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function formatValue(val: any): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'boolean') return val ? 'Sí' : 'No';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}
