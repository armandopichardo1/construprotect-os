import { useMemo } from 'react';
import { formatDOP, formatRawUSD } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ArrowRight, TrendingUp, TrendingDown, Scale, BookOpen } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface JournalLine {
  accountCode?: string;
  accountName: string;
  accountType?: string;
  debit: number;
  credit: number;
  accountId?: string;
}

interface Account {
  id: string;
  code: string | null;
  description: string;
  parent_id: string | null;
  account_type: string;
}

interface AccountingPreviewProps {
  lines: JournalLine[];
  description?: string;
  accounts?: Account[];
  onAccountChange?: (lineIndex: number, accountId: string) => void;
  exchangeRate?: number;
}

const IMPACT_ICONS: Record<string, React.ReactNode> = {
  'Activo': <TrendingUp className="w-3.5 h-3.5" />,
  'Pasivo': <TrendingDown className="w-3.5 h-3.5" />,
  'Capital': <Scale className="w-3.5 h-3.5" />,
  'Ingreso': <TrendingUp className="w-3.5 h-3.5" />,
  'Gasto': <TrendingDown className="w-3.5 h-3.5" />,
  'Costo': <TrendingDown className="w-3.5 h-3.5" />,
};

const IMPACT_COLORS: Record<string, string> = {
  'Activo': 'text-primary',
  'Pasivo': 'text-warning',
  'Capital': 'text-purple-400',
  'Ingreso': 'text-success',
  'Gasto': 'text-destructive',
  'Costo': 'text-warning',
};

export function AccountingPreview({ lines, description, accounts = [], onAccountChange, exchangeRate }: AccountingPreviewProps) {
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
  const hasData = totalDebit > 0 || totalCredit > 0;
  const xr = exchangeRate || 0;

  const getSubAccounts = (line: JournalLine): Account[] => {
    if (accounts.length === 0) return [];
    const currentAcct = line.accountCode
      ? accounts.find(a => a.code === line.accountCode)
      : accounts.find(a => a.description === line.accountName);
    if (!currentAcct) return [];
    const parentId = currentAcct.parent_id;
    if (!parentId) {
      const children = accounts.filter(a => a.parent_id === currentAcct.id);
      return children.length > 0 ? [currentAcct, ...children] : [];
    }
    const siblings = accounts.filter(a => a.parent_id === parentId);
    const parent = accounts.find(a => a.id === parentId);
    return parent ? [parent, ...siblings] : siblings;
  };

  const impacts = useMemo(() => {
    const result: { label: string; effect: string; type: string; amount: number }[] = [];
    lines.forEach(l => {
      const type = l.accountType || '';
      const net = l.debit - l.credit;
      if (Math.abs(net) < 0.01) return;
      if (type === 'Activo') {
        result.push({ label: l.accountName, effect: net > 0 ? 'Aumenta' : 'Disminuye', type: 'Activo', amount: Math.abs(net) });
      } else if (type === 'Pasivo' || type === 'Capital') {
        result.push({ label: l.accountName, effect: net < 0 ? 'Aumenta' : 'Disminuye', type, amount: Math.abs(net) });
      } else if (type === 'Ingreso' || type === 'Ingresos No Operacionales') {
        result.push({ label: l.accountName, effect: net < 0 ? 'Aumenta ingreso' : 'Disminuye ingreso', type: 'Ingreso', amount: Math.abs(net) });
      } else if (type === 'Gasto' || type === 'Gastos No Operacionales') {
        result.push({ label: l.accountName, effect: net > 0 ? 'Aumenta gasto' : 'Disminuye gasto', type: 'Gasto', amount: Math.abs(net) });
      } else if (type === 'Costo') {
        result.push({ label: l.accountName, effect: net > 0 ? 'Aumenta costo' : 'Disminuye costo', type: 'Costo', amount: Math.abs(net) });
      }
    });
    return result;
  }, [lines]);

  const statementEffects = useMemo(() => {
    const effects: string[] = [];
    const hasIncome = lines.some(l => ['Ingreso', 'Ingresos No Operacionales'].includes(l.accountType || '') && l.credit > 0);
    const hasExpense = lines.some(l => ['Gasto', 'Gastos No Operacionales'].includes(l.accountType || '') && l.debit > 0);
    const hasCost = lines.some(l => l.accountType === 'Costo' && l.debit > 0);
    const hasAsset = lines.some(l => l.accountType === 'Activo');
    const hasLiability = lines.some(l => l.accountType === 'Pasivo');
    const hasEquity = lines.some(l => l.accountType === 'Capital');
    if (hasIncome || hasExpense || hasCost) effects.push('📊 Estado de Resultados (P&L)');
    if (hasAsset || hasLiability || hasEquity) effects.push('📋 Balance General');
    if (lines.some(l => l.accountType === 'Activo' && (l.accountCode?.startsWith('10') || l.accountCode?.startsWith('11')))) {
      effects.push('💵 Flujo de Caja');
    }
    return effects;
  }, [lines]);

  if (!hasData) return null;

  const canEdit = accounts.length > 0 && onAccountChange;

  const renderAccountLine = (l: JournalLine, i: number, side: 'debit' | 'credit') => {
    const amount = side === 'debit' ? l.debit : l.credit;
    const subAccounts = canEdit ? getSubAccounts(l) : [];
    const currentAcct = l.accountCode
      ? accounts.find(a => a.code === l.accountCode)
      : accounts.find(a => a.description === l.accountName);
    const lineIndex = lines.indexOf(l);

    return (
      <div key={i} className="flex items-center justify-between gap-2">
        {canEdit && subAccounts.length > 1 ? (
          <Select
            value={currentAcct?.id || ''}
            onValueChange={(val) => onAccountChange(lineIndex, val)}
          >
            <SelectTrigger className="h-auto py-0.5 px-1.5 text-xs border-none bg-transparent hover:bg-muted/50 shadow-none flex-1 min-w-0">
              <SelectValue>
                <span className="truncate">{l.accountCode ? `${l.accountCode} ` : ''}{l.accountName}</span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {subAccounts.map(sa => (
                <SelectItem key={sa.id} value={sa.id} className="text-xs">
                  {sa.code} — {sa.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs truncate">{l.accountCode ? `${l.accountCode} ` : ''}{l.accountName}</span>
        )}
        <div className="flex flex-col items-end shrink-0">
          <span className="text-xs font-mono font-medium">{xr > 0 ? formatDOP(amount * xr) : formatRawUSD(amount)}</span>
          {xr > 0 && <span className="text-[9px] text-muted-foreground font-mono">{formatRawUSD(amount)}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3 animate-in fade-in-50 duration-200">
      <div className="flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-primary" />
        <h4 className="text-xs font-semibold text-foreground">Vista Previa Contable</h4>
        {canEdit && (
          <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            Click en cuenta para cambiar
          </span>
        )}
        {!isBalanced && (
          <span className="ml-auto text-[10px] font-medium text-destructive bg-destructive/10 px-2 py-0.5 rounded-full">
            ⚠ Descuadre: {formatUSD(Math.abs(totalDebit - totalCredit))}
          </span>
        )}
        {isBalanced && (
          <span className="ml-auto text-[10px] font-medium text-success bg-success/10 px-2 py-0.5 rounded-full">
            ✓ Cuadrado
          </span>
        )}
      </div>

      {/* T-account visual */}
      <div className="grid grid-cols-2 gap-0 rounded-lg overflow-hidden border border-border">
        <div className="bg-card p-3 space-y-1 border-r border-border">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Débito</p>
          {lines.filter(l => l.debit > 0).map((l, i) => renderAccountLine(l, i, 'debit'))}
          <div className="border-t border-border pt-1 mt-1 flex justify-between">
            <span className="text-[10px] font-bold text-muted-foreground">Total</span>
            <div className="flex flex-col items-end">
              <span className="text-xs font-mono font-bold">{formatUSD(totalDebit)}</span>
              {xr > 0 && <span className="text-[9px] text-muted-foreground font-mono">{formatDOP(totalDebit * xr)}</span>}
            </div>
          </div>
        </div>
        <div className="bg-card p-3 space-y-1">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Crédito</p>
          {lines.filter(l => l.credit > 0).map((l, i) => renderAccountLine(l, i, 'credit'))}
          <div className="border-t border-border pt-1 mt-1 flex justify-between">
            <span className="text-[10px] font-bold text-muted-foreground">Total</span>
            <div className="flex flex-col items-end">
              <span className="text-xs font-mono font-bold">{formatUSD(totalCredit)}</span>
              {xr > 0 && <span className="text-[9px] text-muted-foreground font-mono">{formatDOP(totalCredit * xr)}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Impact on accounts */}
      {impacts.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Impacto en Cuentas</p>
          {impacts.map((imp, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className={cn('shrink-0', IMPACT_COLORS[imp.type] || 'text-muted-foreground')}>
                {IMPACT_ICONS[imp.type] || <ArrowRight className="w-3.5 h-3.5" />}
              </span>
              <span className="truncate">{imp.label}</span>
              <span className={cn(
                'ml-auto shrink-0 font-medium',
                imp.effect.includes('Aumenta') ? 'text-success' : 'text-destructive'
              )}>
                {imp.effect} {formatUSD(imp.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Affected financial statements */}
      {statementEffects.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/50">
          <span className="text-[10px] text-muted-foreground">Afecta:</span>
          {statementEffects.map(e => (
            <span key={e} className="text-[10px] bg-muted px-2 py-0.5 rounded-full">{e}</span>
          ))}
        </div>
      )}
    </div>
  );
}
