import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { streamFinancialAI } from '@/lib/financial-ai';
import { formatUSD, formatDOP } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Bot, Send, Check, Pencil, X, Sparkles, Loader2, FileText, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';

const EXAMPLES = [
  'Pagué flete DHL $350 USD',
  'Vendí 20 cajas Ram Board a Pedralbes',
  'Compré materiales por RD$15,000',
  'Nómina almacén RD$45,000',
  'Aduanas contenedor $1,200 USD',
];

const TYPE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  sale: { label: 'Venta', icon: '💰', color: 'bg-success/15 text-success border-success/30' },
  expense: { label: 'Gasto', icon: '💸', color: 'bg-warning/15 text-warning border-warning/30' },
  cost: { label: 'Costo', icon: '🏗️', color: 'bg-primary/15 text-primary border-primary/30' },
};

const EXPENSE_CATEGORIES: Record<string, string> = {
  purchases: '🛒 Compras', warehouse: '🏭 Almacén', payroll: '👥 Nómina', rent: '🏠 Alquiler',
  utilities: '💡 Servicios', insurance: '🛡️ Seguros', maintenance: '🔧 Mantenimiento',
  software: '💻 Software', accounting: '📊 Contabilidad', marketing: '📣 Marketing',
  shipping: '🚚 Envíos', customs: '🛃 Aduanas', travel: '✈️ Viajes', samples: '🧱 Muestras',
  office: '🏢 Oficina', bank_fees: '🏦 Comisiones', other: '📎 Otro',
};

const COST_CATEGORIES: Record<string, string> = {
  freight: '🚢 Flete', customs: '🛃 Aduanas', raw_materials: '🧱 Materiales',
  packaging: '📦 Empaque', labor: '👷 Mano de Obra', logistics: '🚚 Logística',
  warehousing: '🏭 Almacenaje', insurance: '🛡️ Seguro', other: '📎 Otro',
};

interface SessionEntry {
  type: string;
  description: string;
  amount: string;
  timestamp: Date;
}

type Mode = 'ai' | 'manual';

// ---- Manual form defaults ----
const defaultManual = {
  type: 'expense' as 'expense' | 'cost',
  description: '',
  category: '',
  vendor: '',
  amountUsd: '',
  amountDop: '',
  date: undefined as Date | undefined,
};

export function CrearTransaccionTab({ rate, onEditSale, onEditExpense, onEditCost }: {
  rate: any;
  onEditSale?: (data: any) => void;
  onEditExpense?: (data: any) => void;
  onEditCost?: (data: any) => void;
}) {
  const queryClient = useQueryClient();
  const xr = Number(rate?.usd_sell) || 60.76;
  const [mode, setMode] = useState<Mode>('ai');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [history, setHistory] = useState<SessionEntry[]>([]);

  // Manual form state
  const [manual, setManual] = useState(defaultManual);
  const [manualSaving, setManualSaving] = useState(false);

  const updateManual = (field: string, value: any) => setManual(prev => ({ ...prev, [field]: value }));

  // Auto-calculate the other currency
  const manualUsd = parseFloat(manual.amountUsd) || 0;
  const manualDop = parseFloat(manual.amountDop) || 0;

  const handleUsdChange = (v: string) => {
    updateManual('amountUsd', v);
    const n = parseFloat(v);
    if (!isNaN(n) && n > 0) updateManual('amountDop', (n * xr).toFixed(0));
  };
  const handleDopChange = (v: string) => {
    updateManual('amountDop', v);
    const n = parseFloat(v);
    if (!isNaN(n) && n > 0) updateManual('amountUsd', (n / xr).toFixed(2));
  };

  const saveManual = async () => {
    if (!manual.description.trim()) { toast.error('Descripción requerida'); return; }
    if (!manual.category) { toast.error('Selecciona una categoría'); return; }
    if (manualUsd <= 0 && manualDop <= 0) { toast.error('Ingresa un monto'); return; }

    setManualSaving(true);
    const finalUsd = manualUsd > 0 ? manualUsd : manualDop / xr;
    const finalDop = manualDop > 0 ? manualDop : manualUsd * xr;
    const dateStr = manual.date ? format(manual.date, 'yyyy-MM-dd') : undefined;

    try {
      const table = manual.type === 'expense' ? 'expenses' : 'costs';
      const row: any = {
        description: manual.description.trim(),
        category: manual.category,
        vendor: manual.vendor.trim() || null,
        amount_usd: finalUsd,
        amount_dop: finalDop,
        exchange_rate: xr,
      };
      if (dateStr) row.date = dateStr;

      const { error } = await supabase.from(table).insert(row);
      if (error) throw error;

      toast.success(manual.type === 'expense' ? 'Gasto registrado' : 'Costo registrado');
      queryClient.invalidateQueries({ queryKey: [table === 'expenses' ? 'expenses' : 'costs'] });

      setHistory(prev => [{
        type: manual.type,
        description: manual.description,
        amount: formatUSD(finalUsd),
        timestamp: new Date(),
      }, ...prev].slice(0, 5));

      setManual(defaultManual);
    } catch (e: any) {
      toast.error(e.message || 'Error al registrar');
    }
    setManualSaving(false);
  };

  const classify = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setPreview(null);

    let fullResponse = '';
    try {
      await streamFinancialAI({
        messages: [{ role: 'user', content: input }],
        action: 'classify',
        onDelta: (chunk) => { fullResponse += chunk; },
        onDone: () => {
          setLoading(false);
          try {
            const cleaned = fullResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(cleaned);
            if (parsed.type && parsed.data) {
              setPreview(parsed);
            } else {
              toast.error('La IA no pudo clasificar esta transacción');
            }
          } catch {
            toast.error('Error al procesar respuesta de IA');
          }
        },
      });
    } catch (e: any) {
      toast.error(e.message || 'Error de IA');
      setLoading(false);
    }
  };

  const approve = async () => {
    if (!preview) return;
    setLoading(true);
    try {
      if (preview.type === 'expense') {
        await supabase.from('expenses').insert({
          description: preview.data.description,
          category: preview.data.category as any,
          vendor: preview.data.vendor || null,
          amount_usd: preview.data.amount_usd,
          amount_dop: preview.data.amount_dop,
          exchange_rate: preview.data.exchange_rate || xr,
          account_id: preview.data.account_id || null,
        });
        toast.success('Gasto registrado');
        queryClient.invalidateQueries({ queryKey: ['expenses'] });
      } else if (preview.type === 'cost') {
        await supabase.from('costs').insert({
          description: preview.data.description,
          category: preview.data.category as any,
          vendor: preview.data.vendor || null,
          amount_usd: preview.data.amount_usd,
          amount_dop: preview.data.amount_dop,
          exchange_rate: preview.data.exchange_rate || xr,
          account_id: preview.data.account_id || null,
        });
        toast.success('Costo registrado');
        queryClient.invalidateQueries({ queryKey: ['costs'] });
      } else if (preview.type === 'sale') {
        const { data: sale } = await supabase.from('sales').insert({
          contact_id: preview.data.contact_id || null,
          subtotal_usd: preview.data.subtotal_usd,
          itbis_usd: preview.data.itbis_usd,
          total_usd: preview.data.total_usd,
          total_dop: preview.data.total_dop,
          exchange_rate: preview.data.exchange_rate || xr,
          payment_status: 'pending' as any,
        }).select().single();
        if (sale && preview.data.items) {
          await supabase.from('sale_items').insert(preview.data.items.map((i: any) => ({
            sale_id: sale.id, product_id: i.product_id || null, quantity: i.quantity,
            unit_price_usd: i.unit_price_usd, unit_cost_usd: i.unit_cost_usd || 0,
            line_total_usd: i.line_total_usd, margin_pct: i.margin_pct || 0,
          })));
        }
        toast.success('Venta registrada');
        queryClient.invalidateQueries({ queryKey: ['sales'] });
        queryClient.invalidateQueries({ queryKey: ['sale-items'] });
      }

      setHistory(prev => [{
        type: preview.type,
        description: preview.data.description || preview.data.contact_name || input,
        amount: preview.type === 'sale' ? formatUSD(preview.data.total_usd) : formatUSD(preview.data.amount_usd),
        timestamp: new Date(),
      }, ...prev].slice(0, 5));

      setPreview(null);
      setInput('');
    } catch {
      toast.error('Error al registrar');
    }
    setLoading(false);
  };

  const edit = () => {
    if (!preview) return;
    if (preview.type === 'sale' && onEditSale) {
      onEditSale({
        contact_id: preview.data.contact_id, invoice_ref: '',
        items: preview.data.items?.map((i: any) => ({
          product_id: i.product_id || '', quantity: i.quantity, unit_price_usd: i.unit_price_usd,
        })),
      });
    } else if (preview.type === 'expense' && onEditExpense) {
      onEditExpense({
        description: preview.data.description, category: preview.data.category,
        vendor: preview.data.vendor || '', amount_usd: String(preview.data.amount_usd),
        amount_dop: String(preview.data.amount_dop || 0), account_id: preview.data.account_id || '',
      });
    } else if (preview.type === 'cost' && onEditCost) {
      onEditCost({
        description: preview.data.description, category: preview.data.category,
        vendor: preview.data.vendor || '', amount_usd: String(preview.data.amount_usd),
        amount_dop: String(preview.data.amount_dop || 0), account_id: preview.data.account_id || '',
      });
    }
    setPreview(null);
  };

  const typeConfig = preview ? TYPE_CONFIG[preview.type] || TYPE_CONFIG.expense : null;
  const catLabel = preview?.type === 'expense'
    ? EXPENSE_CATEGORIES[preview.data.category] || preview.data.category
    : preview?.type === 'cost'
    ? COST_CATEGORIES[preview.data.category] || preview.data.category
    : null;

  const categories = manual.type === 'expense' ? EXPENSE_CATEGORIES : COST_CATEGORIES;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main input area */}
      <div className="lg:col-span-2 space-y-5">
        {/* Mode toggle */}
        <div className="flex gap-1 rounded-xl bg-muted p-0.5 w-fit">
          <button onClick={() => setMode('ai')}
            className={cn('rounded-lg px-4 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5',
              mode === 'ai' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
            <Sparkles className="w-3.5 h-3.5" /> Con IA
          </button>
          <button onClick={() => setMode('manual')}
            className={cn('rounded-lg px-4 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5',
              mode === 'manual' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}>
            <FileText className="w-3.5 h-3.5" /> Manual
          </button>
        </div>

        {/* ========== AI MODE ========== */}
        {mode === 'ai' && (
          <>
            <div className="rounded-2xl bg-card border border-border p-6 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-5 h-5 text-primary" />
                <h2 className="text-base font-semibold text-foreground">Crear Transacción con IA</h2>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">Describe qué pasó en lenguaje natural y la IA clasificará automáticamente.</p>

              <Textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Describe qué pasó... Ej: Pagué $200 USD de flete a DHL"
                className="min-h-[100px] text-sm resize-none"
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); classify(); } }}
              />

              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map(ex => (
                  <button key={ex} onClick={() => setInput(ex)}
                    className="rounded-full px-3 py-1 text-[11px] bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors">
                    {ex}
                  </button>
                ))}
              </div>

              <Button onClick={classify} disabled={loading || !input.trim()} className="w-full gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
                {loading ? 'Clasificando...' : 'Clasificar con IA'}
              </Button>
            </div>

            {/* Preview card */}
            {preview && typeConfig && (
              <div className="rounded-2xl border-2 border-primary/20 bg-card p-6 space-y-4 animate-in fade-in-50 slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between">
                  <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold uppercase', typeConfig.color)}>
                    {typeConfig.icon} {typeConfig.label}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Confianza</span>
                    <Progress value={(preview.confidence || 0) * 100} className="w-20 h-2" />
                    <span className="text-xs font-mono font-medium">{((preview.confidence || 0) * 100).toFixed(0)}%</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  {(preview.type === 'expense' || preview.type === 'cost') && (
                    <>
                      <div><span className="text-muted-foreground text-xs">Categoría</span><p className="font-medium">{catLabel}</p></div>
                      <div><span className="text-muted-foreground text-xs">Proveedor</span><p className="font-medium">{preview.data.vendor || '—'}</p></div>
                      <div><span className="text-muted-foreground text-xs">Descripción</span><p className="font-medium">{preview.data.description}</p></div>
                      <div><span className="text-muted-foreground text-xs">Cuenta Contable</span>
                        <p className="font-medium">{preview.data.account_code ? `${preview.data.account_code} - ${preview.data.account_name}` : 'Sin asignar'}</p>
                      </div>
                      <div><span className="text-muted-foreground text-xs">Monto USD</span><p className="font-bold text-lg">{formatUSD(preview.data.amount_usd)}</p></div>
                      <div><span className="text-muted-foreground text-xs">Monto DOP</span><p className="font-bold text-lg">{formatDOP(preview.data.amount_dop)}</p></div>
                    </>
                  )}
                  {preview.type === 'sale' && (
                    <>
                      <div className="col-span-2">
                        <span className="text-muted-foreground text-xs">Cliente</span>
                        <p className="font-medium">{preview.data.contact_name || 'Sin asignar'}</p>
                      </div>
                      {preview.data.items?.map((it: any, i: number) => (
                        <div key={i} className="col-span-2 flex justify-between items-center py-1 border-b border-border/50 last:border-0">
                          <span className="text-sm">{it.product_name} <span className="text-muted-foreground">×{it.quantity}</span></span>
                          <span className="font-mono text-sm">{formatUSD(it.line_total_usd)}</span>
                        </div>
                      ))}
                      <div><span className="text-muted-foreground text-xs">Subtotal</span><p className="font-medium">{formatUSD(preview.data.subtotal_usd)}</p></div>
                      <div><span className="text-muted-foreground text-xs">ITBIS (18%)</span><p className="font-medium">{formatUSD(preview.data.itbis_usd)}</p></div>
                      <div><span className="text-muted-foreground text-xs">Total USD</span><p className="font-bold text-lg">{formatUSD(preview.data.total_usd)}</p></div>
                      <div><span className="text-muted-foreground text-xs">Total DOP</span><p className="font-bold text-lg">{formatDOP(preview.data.total_dop)}</p></div>
                    </>
                  )}
                </div>

                {preview.explanation && (
                  <p className="text-xs text-muted-foreground italic bg-muted/50 rounded-lg px-3 py-2">{preview.explanation}</p>
                )}

                <div className="flex gap-2 pt-1">
                  <Button className="flex-1 gap-1.5" onClick={approve} disabled={loading}>
                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Aprobar y Registrar
                  </Button>
                  {(preview.type === 'sale' || preview.type === 'expense' || preview.type === 'cost') && (
                    <Button variant="outline" className="gap-1.5" onClick={edit}>
                      <Pencil className="w-3.5 h-3.5" /> Editar
                    </Button>
                  )}
                  <Button variant="destructive" size="icon" onClick={() => setPreview(null)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ========== MANUAL MODE ========== */}
        {mode === 'manual' && (
          <div className="rounded-2xl bg-card border border-border p-6 space-y-5">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-5 h-5 text-primary" />
              <h2 className="text-base font-semibold text-foreground">Registrar Transacción Manual</h2>
            </div>

            {/* Type selector */}
            <div className="flex gap-2">
              {(['expense', 'cost'] as const).map(t => (
                <button key={t} onClick={() => { updateManual('type', t); updateManual('category', ''); }}
                  className={cn(
                    'flex-1 rounded-xl border-2 px-4 py-3 text-sm font-medium transition-all',
                    manual.type === t
                      ? TYPE_CONFIG[t].color + ' border-current'
                      : 'border-border text-muted-foreground hover:border-primary/30'
                  )}>
                  {TYPE_CONFIG[t].icon} {TYPE_CONFIG[t].label}
                </button>
              ))}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-xs">Descripción *</Label>
              <Input
                value={manual.description}
                onChange={e => updateManual('description', e.target.value)}
                placeholder="Ej: Pago de flete contenedor marzo"
                maxLength={200}
              />
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label className="text-xs">Categoría *</Label>
              <Select value={manual.category} onValueChange={v => updateManual('category', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar categoría" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(categories).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Vendor */}
            <div className="space-y-1.5">
              <Label className="text-xs">Proveedor / Fuente</Label>
              <Input
                value={manual.vendor}
                onChange={e => updateManual('vendor', e.target.value)}
                placeholder="Ej: DHL, Aduanas, etc."
                maxLength={100}
              />
            </div>

            {/* Amounts side by side */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Monto USD *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={manual.amountUsd}
                    onChange={e => handleUsdChange(e.target.value)}
                    placeholder="0.00"
                    className="pl-7"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Monto DOP</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">RD$</span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={manual.amountDop}
                    onChange={e => handleDopChange(e.target.value)}
                    placeholder="0"
                    className="pl-10"
                  />
                </div>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground -mt-3">Tasa: 1 USD = RD${xr.toFixed(2)} — se auto-convierte al llenar un campo</p>

            {/* Date */}
            <div className="space-y-1.5">
              <Label className="text-xs">Fecha (por defecto hoy)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm"
                    className={cn('w-full justify-start text-left text-sm font-normal', !manual.date && 'text-muted-foreground')}>
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    {manual.date ? format(manual.date, 'dd/MM/yyyy') : 'Hoy'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={manual.date} onSelect={d => updateManual('date', d)} initialFocus className={cn('p-3 pointer-events-auto')} />
                </PopoverContent>
              </Popover>
            </div>

            {/* Submit */}
            <Button onClick={saveManual} disabled={manualSaving} className="w-full gap-2">
              {manualSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {manualSaving ? 'Registrando...' : `Registrar ${TYPE_CONFIG[manual.type].label}`}
            </Button>
          </div>
        )}
      </div>

      {/* Sidebar: session history */}
      <div className="space-y-4">
        <div className="rounded-2xl bg-card border border-border p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Registradas esta sesión</h3>
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Aún no has registrado transacciones</p>
          ) : (
            <div className="space-y-2">
              {history.map((h, i) => {
                const cfg = TYPE_CONFIG[h.type] || TYPE_CONFIG.expense;
                return (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold border', cfg.color)}>{cfg.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{h.description}</p>
                      <p className="text-[10px] text-muted-foreground">{h.timestamp.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <span className="text-xs font-mono font-medium shrink-0">{h.amount}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-muted/30 border border-border p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            {mode === 'ai' ? 'Cómo funciona' : 'Modo Manual'}
          </h3>
          <div className="space-y-2 text-xs text-muted-foreground">
            {mode === 'ai' ? (
              <>
                <p>1️⃣ Escribe qué pasó en tus palabras</p>
                <p>2️⃣ La IA clasifica: venta, gasto o costo</p>
                <p>3️⃣ Asigna cuenta contable y calcula montos</p>
                <p>4️⃣ Revisa y aprueba con un click</p>
              </>
            ) : (
              <>
                <p>1️⃣ Selecciona tipo: Gasto o Costo</p>
                <p>2️⃣ Llena descripción, categoría y monto</p>
                <p>3️⃣ El monto se convierte automáticamente</p>
                <p>4️⃣ Click en "Registrar" para guardar</p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
