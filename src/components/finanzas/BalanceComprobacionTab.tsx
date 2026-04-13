import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatUSD, getGlobalExchangeRate } from '@/lib/format';
import { exportToExcel } from '@/lib/export-utils';
import {
  getDefaultAccounts, buildAccountAccumulator,
  accumulateSales, accumulateCOGS, accumulateExpenses, accumulateCosts, accumulateJournalEntries,
  findExpenseAccount, findCostAccount,
} from '@/lib/account-mapping';
import { DatePeriodFilter, useDatePeriodFilter } from './DatePeriodFilter';
import { KpiCard } from '@/components/KpiCard';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Download, DollarSign, ArrowLeftRight, AlertTriangle, BookOpen } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { cn } from '@/lib/utils';

const TOOLTIP_STYLE = { background: 'hsl(222, 20%, 10%)', border: '1px solid hsl(222, 20%, 20%)', borderRadius: 8, fontSize: 12 };

const TYPE_COLORS: Record<string, string> = {
  'Activo': 'hsl(217, 91%, 60%)',
  'Pasivo': 'hsl(25, 95%, 53%)',
  'Capital': 'hsl(270, 60%, 55%)',
  'Ingreso': 'hsl(160, 84%, 39%)',
  'Ingresos No Operacionales': 'hsl(160, 60%, 50%)',
  'Gasto': 'hsl(0, 84%, 60%)',
  'Gastos No Operacionales': 'hsl(0, 60%, 50%)',
  'Costo': 'hsl(45, 93%, 47%)',
};

const TYPE_ORDER = ['Activo', 'Pasivo', 'Capital', 'Ingreso', 'Ingresos No Operacionales', 'Costo', 'Gasto', 'Gastos No Operacionales'];

interface BalanceComprobacionTabProps {
  sales: any[];
  expenses: any[];
  costs: any[];
  saleItems: any[];
  journalEntries?: any[];
  rate: number;
}

interface AccountRow {
  id: string;
  code: string;
  description: string;
  account_type: string;
  debits: number;
  credits: number;
  saldo_deudor: number;
  saldo_acreedor: number;
}

export function BalanceComprobacionTab({ sales, expenses, costs, saleItems, journalEntries = [], rate }: BalanceComprobacionTabProps) {
  const { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, filterByDate } = useDatePeriodFilter();
  const [showEmpty, setShowEmpty] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: ['chart-of-accounts-balance'],
    queryFn: async () => {
      const { data, error } = await supabase.from('chart_of_accounts').select('*').eq('is_active', true).order('code');
      if (error) throw error;
      return data;
    },
  });

  const filteredSales = filterByDate(sales);
  const filteredExpenses = filterByDate(expenses);
  const filteredCosts = filterByDate(costs);
  const filteredSaleItems = useMemo(() => {
    if (period === 'all') return saleItems;
    return saleItems.filter((si: any) => {
      const d = si.sales?.date;
      return d && filterByDate([{ date: d }]).length > 0;
    });
  }, [saleItems, period, filterByDate]);

  // Find default accounts by code prefix
  const findAccount = (prefix: string) => accounts.find((a: any) => a.code?.startsWith(prefix));
  const incomeAccount = findAccount('41') || findAccount('40');
  const cxcAccount = findAccount('121') || findAccount('12');
  const cogsAccount = findAccount('50') || accounts.find((a: any) => a.account_type === 'Costo');
  const inventoryAccount = findAccount('131') || findAccount('13');
  const cashAccount = findAccount('103') || findAccount('104') || findAccount('10');
  const cxpAccount = findAccount('201') || findAccount('20');

  const rows = useMemo(() => {
    const accMap: Record<string, { debits: number; credits: number }> = {};
    const ensure = (id: string) => { if (!accMap[id]) accMap[id] = { debits: 0, credits: 0 }; };

    // === VENTAS (partida doble completa) ===
    filteredSales.forEach((s: any) => {
      const incId = s.account_id || incomeAccount?.id;
      const amount = Number(s.total_usd || 0);
      if (!incId || amount === 0) return;

      // Credit: Ingreso
      ensure(incId);
      accMap[incId].credits += amount;

      if (['pending', 'overdue', 'partial'].includes(s.payment_status)) {
        // Debit: CxC (venta pendiente de cobro)
        if (cxcAccount) {
          ensure(cxcAccount.id);
          accMap[cxcAccount.id].debits += amount;
        }
      } else if (s.payment_status === 'paid') {
        // Debit: Caja/Banco (venta cobrada)
        if (cashAccount) {
          ensure(cashAccount.id);
          accMap[cashAccount.id].debits += amount;
        }
      }
    });

    // === COGS / Inventario (partida doble) ===
    filteredSaleItems.forEach((si: any) => {
      const cogsAmt = Number(si.unit_cost_usd || 0) * Number(si.quantity || 0);
      if (cogsAmt === 0) return;
      // Debit: Costo de Ventas
      if (cogsAccount) {
        ensure(cogsAccount.id);
        accMap[cogsAccount.id].debits += cogsAmt;
      }
      // Credit: Inventarios
      if (inventoryAccount) {
        ensure(inventoryAccount.id);
        accMap[inventoryAccount.id].credits += cogsAmt;
      }
    });

    // === GASTOS (partida doble: Debit Gasto, Credit Caja/Banco) ===
    filteredExpenses.forEach((e: any) => {
      const accId = e.account_id || findExpenseAccount(accounts, e.category)?.id;
      const amount = Number(e.amount_usd || 0);
      if (!accId || amount === 0) return;
      // Debit: Gasto
      ensure(accId);
      accMap[accId].debits += amount;
      // Credit: Caja/Banco (salida de efectivo)
      if (cashAccount) {
        ensure(cashAccount.id);
        accMap[cashAccount.id].credits += amount;
      }
    });

    // === COSTOS (partida doble: Debit Costo, Credit CxP o Caja) ===
    filteredCosts.forEach((c: any) => {
      const accId = c.account_id || findCostAccount(accounts, c.category)?.id;
      const amount = Number(c.amount_usd || 0);
      if (!accId || amount === 0) return;
      // Debit: Costo
      ensure(accId);
      accMap[accId].debits += amount;
      // Credit: Cuentas por Pagar o Caja/Banco
      const counterAcct = cxpAccount || cashAccount;
      if (counterAcct) {
        ensure(counterAcct.id);
        accMap[counterAcct.id].credits += amount;
      }
    });

    // === ASIENTOS MANUALES (journal entries) ===
    const filteredJournals = filterByDate(journalEntries.map((je: any) => ({ ...je, date: je.date })));
    filteredJournals.forEach((je: any) => {
      je.journal_entry_lines?.forEach((line: any) => {
        if (!line.account_id) return;
        ensure(line.account_id);
        accMap[line.account_id].debits += Number(line.debit_usd || 0);
        accMap[line.account_id].credits += Number(line.credit_usd || 0);
      });
    });

    // Build rows
    const result: AccountRow[] = accounts
      .map((a: any) => {
        const entry = accMap[a.id] || { debits: 0, credits: 0 };
        const diff = entry.debits - entry.credits;
        return {
          id: a.id,
          code: a.code || '',
          description: a.description,
          account_type: a.account_type,
          debits: entry.debits,
          credits: entry.credits,
          saldo_deudor: diff > 0 ? diff : 0,
          saldo_acreedor: diff < 0 ? Math.abs(diff) : 0,
        };
      })
      .filter(r => showEmpty || r.debits > 0 || r.credits > 0);

    // Sort by type order then code
    result.sort((a, b) => {
      const ta = TYPE_ORDER.indexOf(a.account_type);
      const tb = TYPE_ORDER.indexOf(b.account_type);
      if (ta !== tb) return (ta === -1 ? 99 : ta) - (tb === -1 ? 99 : tb);
      return a.code.localeCompare(b.code);
    });

    return result;
  }, [accounts, filteredSales, filteredExpenses, filteredCosts, filteredSaleItems, showEmpty, incomeAccount, cxcAccount, cogsAccount, inventoryAccount, cashAccount, cxpAccount]);

  // Unmapped count
  const unmappedCount = useMemo(() => {
    let count = 0;
    filteredSales.forEach((s: any) => { if (!s.account_id && !incomeAccount) count++; });
    filteredExpenses.forEach((e: any) => { if (!e.account_id && !findExpenseAccount(accounts, e.category)) count++; });
    filteredCosts.forEach((c: any) => { if (!c.account_id && !findCostAccount(accounts, c.category)) count++; });
    return count;
  }, [filteredSales, filteredExpenses, filteredCosts, accounts, incomeAccount]);

  const totalDebits = rows.reduce((s, r) => s + r.debits, 0);
  const totalCredits = rows.reduce((s, r) => s + r.credits, 0);
  const difference = Math.abs(totalDebits - totalCredits);
  const isBalanced = difference < 0.01;

  // Group totals by type
  const byType = useMemo(() => {
    const map: Record<string, { debits: number; credits: number; saldo_deudor: number; saldo_acreedor: number }> = {};
    rows.forEach(r => {
      if (!map[r.account_type]) map[r.account_type] = { debits: 0, credits: 0, saldo_deudor: 0, saldo_acreedor: 0 };
      map[r.account_type].debits += r.debits;
      map[r.account_type].credits += r.credits;
      map[r.account_type].saldo_deudor += r.saldo_deudor;
      map[r.account_type].saldo_acreedor += r.saldo_acreedor;
    });
    return TYPE_ORDER.filter(t => map[t]).map(t => ({ type: t, ...map[t] }));
  }, [rows]);

  // Chart data
  const barChartData = byType.map(t => ({ name: t.type, Débitos: t.debits, Créditos: t.credits }));
  const donutData = [
    { name: 'Débitos', value: totalDebits, color: 'hsl(217, 91%, 60%)' },
    { name: 'Créditos', value: totalCredits, color: 'hsl(160, 84%, 39%)' },
  ];
  const compositionData = byType.map(t => ({ name: t.type, value: t.saldo_deudor + t.saldo_acreedor }));

  const handleExport = () => {
    const data = rows.map(r => ({
      Código: r.code, Cuenta: r.description, Tipo: r.account_type,
      'Débitos USD': r.debits, 'Créditos USD': r.credits,
      'Saldo Deudor': r.saldo_deudor, 'Saldo Acreedor': r.saldo_acreedor,
    }));
    data.push({ Código: '', Cuenta: 'TOTALES', Tipo: '', 'Débitos USD': totalDebits, 'Créditos USD': totalCredits, 'Saldo Deudor': rows.reduce((s, r) => s + r.saldo_deudor, 0), 'Saldo Acreedor': rows.reduce((s, r) => s + r.saldo_acreedor, 0) });
    exportToExcel(data, 'balance_comprobacion', 'Balance');
  };

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Débitos" value={formatUSD(totalDebits)} icon={DollarSign} variant="primary" />
        <KpiCard title="Total Créditos" value={formatUSD(totalCredits)} icon={DollarSign} variant="success" />
        <KpiCard title="Diferencia" value={formatUSD(difference)} icon={ArrowLeftRight}
          variant={isBalanced ? 'success' : 'destructive'}
          subtitle={isBalanced ? '✓ Cuadrado' : '⚠ Descuadre'} />
        <KpiCard title="Cuentas Activas" value={String(rows.length)} icon={BookOpen}
          subtitle={unmappedCount > 0 ? `${unmappedCount} sin mapear` : 'Todo mapeado'} />
      </div>

      {/* Warnings */}
      {!isBalanced && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/30 p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
          <p className="text-sm text-destructive">Débitos y Créditos no cuadran. Diferencia: {formatUSD(difference)}</p>
        </div>
      )}
      {unmappedCount > 0 && (
        <div className="rounded-xl bg-warning/10 border border-warning/30 p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
          <p className="text-sm text-warning">{unmappedCount} transacciones sin cuenta contable asignada</p>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Grouped Bar: Debits vs Credits */}
        <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Débitos vs Créditos por Tipo</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={barChartData} layout="vertical">
              <XAxis type="number" tick={{ fill: 'hsl(220,12%,55%)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `RD$${(v * getGlobalExchangeRate() / 1000).toFixed(0)}K`} />
              <YAxis type="category" dataKey="name" tick={{ fill: 'hsl(220,12%,55%)', fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatUSD(v)} />
              <Legend />
              <Bar dataKey="Débitos" fill="hsl(217, 91%, 60%)" radius={[0, 4, 4, 0]} />
              <Bar dataKey="Créditos" fill="hsl(160, 84%, 39%)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Composition by type */}
        <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Composición por Tipo</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={compositionData}>
              <XAxis dataKey="name" tick={{ fill: 'hsl(220,12%,55%)', fontSize: 9 }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" height={60} />
              <YAxis tick={{ fill: 'hsl(220,12%,55%)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `RD$${(v * getGlobalExchangeRate() / 1000).toFixed(0)}K`} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatUSD(v)} />
              <Bar dataKey="value" name="Saldo" radius={[6, 6, 0, 0]}>
                {compositionData.map((d, i) => (
                  <Cell key={i} fill={TYPE_COLORS[d.name] || 'hsl(220,12%,55%)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Donut verification */}
        <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Verificación de Balance</h3>
          <div className="relative">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={donutData} innerRadius={55} outerRadius={80} dataKey="value" stroke="none">
                  {donutData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatUSD(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className={cn('text-lg font-bold', isBalanced ? 'text-success' : 'text-destructive')}>
                  {isBalanced ? '✓' : formatUSD(difference)}
                </p>
                <p className="text-[10px] text-muted-foreground">{isBalanced ? 'Cuadrado' : 'Diferencia'}</p>
              </div>
            </div>
          </div>
          <div className="flex justify-center gap-6">
            {donutData.map(d => (
              <div key={d.name} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                <span className="text-xs text-muted-foreground">{d.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filters & Export */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <DatePeriodFilter period={period} setPeriod={setPeriod} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />
          <div className="flex items-center gap-2">
            <Switch id="show-empty" checked={showEmpty} onCheckedChange={setShowEmpty} />
            <Label htmlFor="show-empty" className="text-xs text-muted-foreground">Mostrar cuentas vacías</Label>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
          <Download className="w-3.5 h-3.5" /> Excel
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-card border border-border overflow-hidden max-h-[calc(100vh-320px)] overflow-auto">
        <Table wrapperClassName="overflow-visible">
          <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
            <TableRow>
              <TableHead className="text-xs">Código</TableHead>
              <TableHead className="text-xs">Cuenta</TableHead>
              <TableHead className="text-xs">Tipo</TableHead>
              <TableHead className="text-xs text-right">Débitos USD</TableHead>
              <TableHead className="text-xs text-right">Créditos USD</TableHead>
              <TableHead className="text-xs text-right">Saldo Deudor</TableHead>
              <TableHead className="text-xs text-right">Saldo Acreedor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(() => {
              const elements: React.ReactNode[] = [];
              let currentType = '';
              rows.forEach((r, i) => {
                if (r.account_type !== currentType) {
                  // Subtotal for previous group
                  if (currentType) {
                    const group = byType.find(t => t.type === currentType);
                    if (group) {
                      elements.push(
                        <TableRow key={`sub-${currentType}`} className="bg-muted/30 font-semibold">
                          <TableCell colSpan={3} className="text-xs">Subtotal {currentType}</TableCell>
                          <TableCell className="text-xs text-right">{formatUSD(group.debits)}</TableCell>
                          <TableCell className="text-xs text-right">{formatUSD(group.credits)}</TableCell>
                          <TableCell className="text-xs text-right">{formatUSD(group.saldo_deudor)}</TableCell>
                          <TableCell className="text-xs text-right">{formatUSD(group.saldo_acreedor)}</TableCell>
                        </TableRow>
                      );
                    }
                  }
                  // Type header
                  elements.push(
                    <TableRow key={`hdr-${r.account_type}`} className="bg-muted/50">
                      <TableCell colSpan={7} className="text-xs font-bold uppercase tracking-wider" style={{ color: TYPE_COLORS[r.account_type] }}>
                        {r.account_type}
                      </TableCell>
                    </TableRow>
                  );
                  currentType = r.account_type;
                }
                elements.push(
                  <TableRow key={r.id}>
                    <TableCell className="text-xs font-mono text-muted-foreground">{r.code}</TableCell>
                    <TableCell className="text-xs">{r.description}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.account_type}</TableCell>
                    <TableCell className="text-xs text-right">{r.debits > 0 ? formatUSD(r.debits) : '—'}</TableCell>
                    <TableCell className="text-xs text-right">{r.credits > 0 ? formatUSD(r.credits) : '—'}</TableCell>
                    <TableCell className="text-xs text-right">{r.saldo_deudor > 0 ? formatUSD(r.saldo_deudor) : '—'}</TableCell>
                    <TableCell className="text-xs text-right">{r.saldo_acreedor > 0 ? formatUSD(r.saldo_acreedor) : '—'}</TableCell>
                  </TableRow>
                );
                // Last group subtotal
                if (i === rows.length - 1) {
                  const group = byType.find(t => t.type === currentType);
                  if (group) {
                    elements.push(
                      <TableRow key={`sub-${currentType}-end`} className="bg-muted/30 font-semibold">
                        <TableCell colSpan={3} className="text-xs">Subtotal {currentType}</TableCell>
                        <TableCell className="text-xs text-right">{formatUSD(group.debits)}</TableCell>
                        <TableCell className="text-xs text-right">{formatUSD(group.credits)}</TableCell>
                        <TableCell className="text-xs text-right">{formatUSD(group.saldo_deudor)}</TableCell>
                        <TableCell className="text-xs text-right">{formatUSD(group.saldo_acreedor)}</TableCell>
                      </TableRow>
                    );
                  }
                }
              });
              return elements;
            })()}
            {/* Grand total */}
            <TableRow className={cn('font-bold text-sm', isBalanced ? 'bg-success/10' : 'bg-destructive/10')}>
              <TableCell colSpan={3} className="text-xs font-bold">TOTALES</TableCell>
              <TableCell className="text-xs text-right font-bold">{formatUSD(totalDebits)}</TableCell>
              <TableCell className="text-xs text-right font-bold">{formatUSD(totalCredits)}</TableCell>
              <TableCell className="text-xs text-right font-bold">{formatUSD(rows.reduce((s, r) => s + r.saldo_deudor, 0))}</TableCell>
              <TableCell className="text-xs text-right font-bold">{formatUSD(rows.reduce((s, r) => s + r.saldo_acreedor, 0))}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

  // Maps to actual chart of accounts codes (6xxxx series)
  const map: Record<string, string[]> = {
    payroll: ['601', '600'],
    rent: ['631', '630'],
    utilities: ['632', '633'],
    insurance: ['640'],
    maintenance: ['636', '637'],
    warehouse: ['631', '630'],
    software: ['642', '643', '644', '645'],
    accounting: ['641'],
    marketing: ['621', '622', '620'],
    shipping: ['635'],
    customs: ['635'],
    travel: ['623', '610'],
    samples: ['625'],
    office: ['634', '630'],
    bank_fees: ['639'],
    purchases: ['500'],
    other: ['639', '630'],
  };
  const prefixes = map[category] || ['630'];
  for (const prefix of prefixes) {
    const match = accounts.find((a: any) => a.code?.startsWith(prefix) && a.account_type === 'Gasto');
    if (match) return match;
  }
  return accounts.find((a: any) => a.account_type === 'Gasto');
}

function findCostAccount(accounts: any[], category: string) {
  const map: Record<string, string> = {
    freight: '50', customs: '50', raw_materials: '50', packaging: '50',
    labor: '50', logistics: '50', warehousing: '50', insurance: '50', other: '50',
  };
  const prefix = map[category] || '50';
  return accounts.find((a: any) => a.code?.startsWith(prefix) && a.account_type === 'Costo') ||
    accounts.find((a: any) => a.account_type === 'Costo');
}
