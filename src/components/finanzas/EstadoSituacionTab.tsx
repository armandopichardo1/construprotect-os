import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatUSD, getGlobalExchangeRate } from '@/lib/format';
import { exportToExcel } from '@/lib/export-utils';
import { DatePeriodFilter, useDatePeriodFilter } from './DatePeriodFilter';
import { KpiCard } from '@/components/KpiCard';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download, Building2, Scale, TrendingUp, Landmark } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';

const TOOLTIP_STYLE = { background: 'hsl(222, 20%, 10%)', border: '1px solid hsl(222, 20%, 20%)', borderRadius: 8, fontSize: 12 };

interface EstadoSituacionTabProps {
  sales: any[];
  expenses: any[];
  costs: any[];
  saleItems: any[];
  journalEntries?: any[];
  rate: number;
}

interface AccountBalance {
  id: string;
  code: string;
  description: string;
  account_type: string;
  classification: string;
  balance: number; // positive = natural direction
}

// Helpers reused from BalanceComprobacionTab logic
function findExpenseAccount(accounts: any[], category: string) {
  const map: Record<string, string[]> = {
    payroll: ['601', '600'], rent: ['631', '630'], utilities: ['632', '633'],
    insurance: ['640'], maintenance: ['636', '637'], warehouse: ['631', '630'],
    software: ['642', '643', '644', '645'], accounting: ['641'],
    marketing: ['621', '622', '620'], shipping: ['635'], customs: ['635'],
    travel: ['623', '610'], samples: ['625'], office: ['634', '630'],
    bank_fees: ['639'], purchases: ['500'], other: ['639', '630'],
  };
  const prefixes = map[category] || ['630'];
  for (const prefix of prefixes) {
    const match = accounts.find((a: any) => a.code?.startsWith(prefix) && (a.account_type === 'Gasto' || a.account_type === 'Gastos No Operacionales'));
    if (match) return match;
  }
  return accounts.find((a: any) => a.account_type === 'Gasto');
}

function findCostAccount(accounts: any[], category: string) {
  const prefix = '50';
  return accounts.find((a: any) => a.code?.startsWith(prefix) && a.account_type === 'Costo') ||
    accounts.find((a: any) => a.account_type === 'Costo');
}

export function EstadoSituacionTab({ sales, expenses, costs, saleItems, journalEntries = [], rate }: EstadoSituacionTabProps) {
  const { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, filterByDate } = useDatePeriodFilter();

  const { data: accounts = [] } = useQuery({
    queryKey: ['chart-of-accounts-situacion'],
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

  const findAccount = (prefix: string) => accounts.find((a: any) => a.code?.startsWith(prefix));
  const incomeAccount = findAccount('41') || findAccount('40');
  const cxcAccount = findAccount('121') || findAccount('12');
  const cogsAccount = findAccount('50') || accounts.find((a: any) => a.account_type === 'Costo');
  const inventoryAccount = findAccount('131') || findAccount('13');
  const cashAccount = findAccount('103') || findAccount('104') || findAccount('10');
  const cxpAccount = findAccount('201') || findAccount('20');

  // Compute balances same as BalanceComprobacion but only for Balance General accounts
  const { balanceRows, totalActivos, totalPasivos, totalCapital, netIncome } = useMemo(() => {
    const accMap: Record<string, { debits: number; credits: number }> = {};
    const ensure = (id: string) => { if (!accMap[id]) accMap[id] = { debits: 0, credits: 0 }; };

    // VENTAS
    filteredSales.forEach((s: any) => {
      const incId = s.account_id || incomeAccount?.id;
      const amount = Number(s.total_usd || 0);
      if (!incId || amount === 0) return;
      ensure(incId);
      accMap[incId].credits += amount;
      if (['pending', 'overdue', 'partial'].includes(s.payment_status)) {
        if (cxcAccount) { ensure(cxcAccount.id); accMap[cxcAccount.id].debits += amount; }
      } else if (s.payment_status === 'paid') {
        if (cashAccount) { ensure(cashAccount.id); accMap[cashAccount.id].debits += amount; }
      }
    });

    // COGS
    filteredSaleItems.forEach((si: any) => {
      const cogsAmt = Number(si.unit_cost_usd || 0) * Number(si.quantity || 0);
      if (cogsAmt === 0) return;
      if (cogsAccount) { ensure(cogsAccount.id); accMap[cogsAccount.id].debits += cogsAmt; }
      if (inventoryAccount) { ensure(inventoryAccount.id); accMap[inventoryAccount.id].credits += cogsAmt; }
    });

    // GASTOS
    filteredExpenses.forEach((e: any) => {
      const accId = e.account_id || findExpenseAccount(accounts, e.category)?.id;
      const amount = Number(e.amount_usd || 0);
      if (!accId || amount === 0) return;
      ensure(accId);
      accMap[accId].debits += amount;
      if (cashAccount) { ensure(cashAccount.id); accMap[cashAccount.id].credits += amount; }
    });

    // COSTOS
    filteredCosts.forEach((c: any) => {
      const accId = c.account_id || findCostAccount(accounts, c.category)?.id;
      const amount = Number(c.amount_usd || 0);
      if (!accId || amount === 0) return;
      ensure(accId);
      accMap[accId].debits += amount;
      const counterAcct = cxpAccount || cashAccount;
      if (counterAcct) { ensure(counterAcct.id); accMap[counterAcct.id].credits += amount; }
    });

    // JOURNAL ENTRIES
    const filteredJournals = filterByDate(journalEntries.map((je: any) => ({ ...je, date: je.date })));
    filteredJournals.forEach((je: any) => {
      je.journal_entry_lines?.forEach((line: any) => {
        if (!line.account_id) return;
        ensure(line.account_id);
        accMap[line.account_id].debits += Number(line.debit_usd || 0);
        accMap[line.account_id].credits += Number(line.credit_usd || 0);
      });
    });

    // Calculate net balance per account
    const rows: AccountBalance[] = accounts
      .map((a: any) => {
        const entry = accMap[a.id] || { debits: 0, credits: 0 };
        const isDebitNatural = ['Activo', 'Costo', 'Gasto', 'Gastos No Operacionales'].includes(a.account_type);
        const balance = isDebitNatural ? entry.debits - entry.credits : entry.credits - entry.debits;
        return {
          id: a.id,
          code: a.code || '',
          description: a.description,
          account_type: a.account_type,
          classification: a.classification || '',
          balance,
        };
      })
      .filter(r => Math.abs(r.balance) > 0.005);

    // Activos
    const activos = rows.filter(r => r.account_type === 'Activo');
    const pasivos = rows.filter(r => r.account_type === 'Pasivo');
    const capital = rows.filter(r => r.account_type === 'Capital');

    // Net income = ingresos - costos - gastos (for Estado de Resultados accounts)
    const ingresos = rows.filter(r => r.account_type === 'Ingreso' || r.account_type === 'Ingresos No Operacionales');
    const gastosYCostos = rows.filter(r => ['Costo', 'Gasto', 'Gastos No Operacionales'].includes(r.account_type));
    const ni = ingresos.reduce((s, r) => s + r.balance, 0) - gastosYCostos.reduce((s, r) => s + r.balance, 0);

    const tActivos = activos.reduce((s, r) => s + r.balance, 0);
    const tPasivos = pasivos.reduce((s, r) => s + r.balance, 0);
    const tCapital = capital.reduce((s, r) => s + r.balance, 0);

    return {
      balanceRows: { activos, pasivos, capital },
      totalActivos: tActivos,
      totalPasivos: tPasivos,
      totalCapital: tCapital,
      netIncome: ni,
    };
  }, [accounts, filteredSales, filteredExpenses, filteredCosts, filteredSaleItems, journalEntries, incomeAccount, cxcAccount, cogsAccount, inventoryAccount, cashAccount, cxpAccount, filterByDate]);

  const patrimonio = totalCapital + netIncome;
  const pasivoPlusPatrimonio = totalPasivos + patrimonio;
  const isBalanced = Math.abs(totalActivos - pasivoPlusPatrimonio) < 0.01;

  // Group activos by classification
  const groupByClassification = (items: AccountBalance[]) => {
    const groups: Record<string, AccountBalance[]> = {};
    items.forEach(r => {
      const key = r.classification || 'Sin clasificar';
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  };

  const activoGroups = groupByClassification(balanceRows.activos);
  const pasivoGroups = groupByClassification(balanceRows.pasivos);
  const capitalGroups = groupByClassification(balanceRows.capital);

  // Charts
  const compositionData = [
    { name: 'Activos', value: totalActivos, color: 'hsl(217, 91%, 60%)' },
    { name: 'Pasivos', value: totalPasivos, color: 'hsl(0, 84%, 60%)' },
    { name: 'Patrimonio', value: patrimonio, color: 'hsl(160, 84%, 39%)' },
  ];

  const activoBreakdown = activoGroups.map(([name, items]) => ({
    name: name.length > 18 ? name.slice(0, 16) + '…' : name,
    value: items.reduce((s, r) => s + r.balance, 0),
  })).filter(d => d.value > 0);

  const handleExport = () => {
    const rows: any[] = [];
    const addSection = (title: string, items: AccountBalance[]) => {
      rows.push({ Sección: title, Código: '', Cuenta: '', Clasificación: '', 'Saldo USD': '' });
      items.forEach(r => rows.push({ Sección: '', Código: r.code, Cuenta: r.description, Clasificación: r.classification, 'Saldo USD': r.balance }));
    };
    addSection('ACTIVOS', balanceRows.activos);
    rows.push({ Sección: '', Código: '', Cuenta: 'TOTAL ACTIVOS', Clasificación: '', 'Saldo USD': totalActivos });
    addSection('PASIVOS', balanceRows.pasivos);
    rows.push({ Sección: '', Código: '', Cuenta: 'TOTAL PASIVOS', Clasificación: '', 'Saldo USD': totalPasivos });
    addSection('CAPITAL', balanceRows.capital);
    rows.push({ Sección: '', Código: '', Cuenta: 'Resultado del Período', Clasificación: '', 'Saldo USD': netIncome });
    rows.push({ Sección: '', Código: '', Cuenta: 'TOTAL PATRIMONIO', Clasificación: '', 'Saldo USD': patrimonio });
    rows.push({ Sección: '', Código: '', Cuenta: 'PASIVO + PATRIMONIO', Clasificación: '', 'Saldo USD': pasivoPlusPatrimonio });
    exportToExcel(rows, 'estado_situacion', 'Balance General');
  };

  const renderSection = (title: string, groups: [string, AccountBalance[]][], total: number, color: string, extraRow?: { label: string; value: number }) => (
    <div className="space-y-1">
      <div className="px-4 py-2 bg-muted/60 rounded-t-lg">
        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color }}>{title}</h3>
      </div>
      <Table wrapperClassName="overflow-visible">
        <TableBody>
          {groups.map(([classification, items]) => (
            <>
              <TableRow key={`g-${classification}`} className="bg-muted/20">
                <TableCell colSpan={3} className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground py-1.5">{classification}</TableCell>
              </TableRow>
              {items.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs font-mono text-muted-foreground w-24 pl-6">{r.code}</TableCell>
                  <TableCell className="text-xs">{r.description}</TableCell>
                  <TableCell className="text-xs text-right font-mono">{formatUSD(r.balance)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/10">
                <TableCell colSpan={2} className="text-[10px] font-medium text-muted-foreground pl-6">Subtotal {classification}</TableCell>
                <TableCell className="text-xs text-right font-mono font-medium">{formatUSD(items.reduce((s, r) => s + r.balance, 0))}</TableCell>
              </TableRow>
            </>
          ))}
          {extraRow && (
            <TableRow className="bg-muted/20">
              <TableCell colSpan={2} className="text-xs font-medium pl-4">{extraRow.label}</TableCell>
              <TableCell className="text-xs text-right font-mono font-medium">{formatUSD(extraRow.value)}</TableCell>
            </TableRow>
          )}
          <TableRow className="font-bold border-t-2 border-border">
            <TableCell colSpan={2} className="text-xs font-bold">TOTAL {title.toUpperCase()}</TableCell>
            <TableCell className="text-xs text-right font-bold font-mono">{formatUSD(total)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard title="Total Activos" value={formatUSD(totalActivos)} icon={Building2} variant="primary" />
        <KpiCard title="Total Pasivos" value={formatUSD(totalPasivos)} icon={Landmark} variant="destructive" />
        <KpiCard title="Patrimonio" value={formatUSD(patrimonio)} icon={TrendingUp} variant="success" />
        <KpiCard title="A = P + Pat" value={isBalanced ? '✓ Cuadrado' : `Δ ${formatUSD(Math.abs(totalActivos - pasivoPlusPatrimonio))}`} icon={Scale}
          variant={isBalanced ? 'success' : 'destructive'}
          subtitle={`Activos: ${formatUSD(totalActivos)} | P+Pat: ${formatUSD(pasivoPlusPatrimonio)}`} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Estructura del Balance</h3>
          <div className="relative">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={compositionData} innerRadius={55} outerRadius={85} dataKey="value" stroke="none">
                  {compositionData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatUSD(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <p className={cn('text-lg font-bold', isBalanced ? 'text-success' : 'text-destructive')}>
                  {isBalanced ? '✓' : '⚠'}
                </p>
                <p className="text-[10px] text-muted-foreground">{isBalanced ? 'Cuadrado' : 'Descuadre'}</p>
              </div>
            </div>
          </div>
          <div className="flex justify-center gap-6">
            {compositionData.map(d => (
              <div key={d.name} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                <span className="text-xs text-muted-foreground">{d.name}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Composición de Activos</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={activoBreakdown} layout="vertical">
              <XAxis type="number" tick={{ fill: 'hsl(220,12%,55%)', fontSize: 10 }} axisLine={false} tickLine={false}
                tickFormatter={v => `$${(v / 1000).toFixed(0)}K`} />
              <YAxis type="category" dataKey="name" tick={{ fill: 'hsl(220,12%,55%)', fontSize: 10 }} axisLine={false} tickLine={false} width={120} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => formatUSD(v)} />
              <Bar dataKey="value" fill="hsl(217, 91%, 60%)" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filters & Export */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <DatePeriodFilter period={period} setPeriod={setPeriod} customFrom={customFrom} setCustomFrom={setCustomFrom} customTo={customTo} setCustomTo={setCustomTo} />
        <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
          <Download className="w-3.5 h-3.5" /> Excel
        </Button>
      </div>

      {/* Balance Sheet */}
      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-bold text-foreground">Estado de Situación Financiera</h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">ConstruProtect SRL • Cifras en USD</p>
        </div>

        <div className="divide-y divide-border">
          {renderSection('Activos', activoGroups, totalActivos, 'hsl(217, 91%, 60%)')}
          {renderSection('Pasivos', pasivoGroups, totalPasivos, 'hsl(0, 84%, 60%)')}
          {renderSection('Patrimonio', capitalGroups, patrimonio, 'hsl(160, 84%, 39%)', { label: 'Resultado del Período', value: netIncome })}
        </div>

        {/* Equation check */}
        <div className={cn('p-4 flex items-center justify-between', isBalanced ? 'bg-success/10' : 'bg-destructive/10')}>
          <div>
            <p className="text-xs font-bold">{isBalanced ? '✓ Ecuación contable cuadrada' : '⚠ Ecuación contable descuadrada'}</p>
            <p className="text-[10px] text-muted-foreground">Activos = Pasivos + Patrimonio</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-mono">{formatUSD(totalActivos)} = {formatUSD(totalPasivos)} + {formatUSD(patrimonio)}</p>
            {!isBalanced && <p className="text-[10px] text-destructive font-mono">Δ {formatUSD(Math.abs(totalActivos - pasivoPlusPatrimonio))}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
