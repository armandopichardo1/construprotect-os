/**
 * Shared accounting utilities for mapping transactions to chart of accounts.
 * Used by BalanceComprobacionTab, EstadoSituacionTab, and other financial reports.
 */

/** Map expense category to chart of accounts */
export function findExpenseAccount(accounts: any[], category: string) {
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
    const match = accounts.find((a: any) => a.code?.startsWith(prefix) && (a.account_type === 'Gasto' || a.account_type === 'Gastos No Operacionales'));
    if (match) return match;
  }
  return accounts.find((a: any) => a.account_type === 'Gasto');
}

/** Map cost category to chart of accounts */
export function findCostAccount(accounts: any[], category: string) {
  const map: Record<string, string> = {
    freight: '50', customs: '50', raw_materials: '50', packaging: '50',
    labor: '50', logistics: '50', warehousing: '50', insurance: '50', other: '50',
  };
  const prefix = map[category] || '50';
  return accounts.find((a: any) => a.code?.startsWith(prefix) && a.account_type === 'Costo') ||
    accounts.find((a: any) => a.account_type === 'Costo');
}

/** Find default account by code prefix */
export function findAccountByPrefix(accounts: any[], prefix: string) {
  return accounts.find((a: any) => a.code?.startsWith(prefix));
}

/** Standard default accounts used across financial reports */
export function getDefaultAccounts(accounts: any[]) {
  const find = (prefix: string) => findAccountByPrefix(accounts, prefix);
  return {
    incomeAccount: find('41') || find('40'),
    cxcAccount: find('121') || find('12'),
    cogsAccount: find('50') || accounts.find((a: any) => a.account_type === 'Costo'),
    inventoryAccount: find('131') || find('13'),
    cashAccount: find('103') || find('104') || find('10'),
    cxpAccount: find('201') || find('20'),
  };
}

/** Determine if account type has a natural debit balance */
export function isDebitNatural(accountType: string): boolean {
  return ['Activo', 'Costo', 'Gasto', 'Gastos No Operacionales'].includes(accountType);
}

/** Build a full debit/credit accumulator from all transaction sources */
export interface AccumulatorEntry { debits: number; credits: number; }

export function buildAccountAccumulator(
  accounts: any[],
  filteredSales: any[],
  filteredExpenses: any[],
  filteredCosts: any[],
  filteredSaleItems: any[],
  filteredJournals: any[],
) {
  const defaults = getDefaultAccounts(accounts);
  const accMap: Record<string, AccumulatorEntry> = {};
  const ensure = (id: string) => { if (!accMap[id]) accMap[id] = { debits: 0, credits: 0 }; };

  // VENTAS
  filteredSales.forEach((s: any) => {
    const incId = s.account_id || defaults.incomeAccount?.id;
    const amount = Number(s.total_usd || 0);
    if (!incId || amount === 0) return;
    ensure(incId);
    accMap[incId].credits += amount;
    if (['pending', 'overdue', 'partial'].includes(s.payment_status)) {
      if (defaults.cxcAccount) { ensure(defaults.cxcAccount.id); accMap[defaults.cxcAccount.id].debits += amount; }
    } else if (s.payment_status === 'paid') {
      if (defaults.cashAccount) { ensure(defaults.cashAccount.id); accMap[defaults.cashAccount.id].debits += amount; }
    }
  });

  // COGS
  filteredSaleItems.forEach((si: any) => {
    const cogsAmt = Number(si.unit_cost_usd || 0) * Number(si.quantity || 0);
    if (cogsAmt === 0) return;
    if (defaults.cogsAccount) { ensure(defaults.cogsAccount.id); accMap[defaults.cogsAccount.id].debits += cogsAmt; }
    if (defaults.inventoryAccount) { ensure(defaults.inventoryAccount.id); accMap[defaults.inventoryAccount.id].credits += cogsAmt; }
  });

  // GASTOS
  filteredExpenses.forEach((e: any) => {
    const accId = e.account_id || findExpenseAccount(accounts, e.category)?.id;
    const amount = Number(e.amount_usd || 0);
    if (!accId || amount === 0) return;
    ensure(accId);
    accMap[accId].debits += amount;
    if (defaults.cashAccount) { ensure(defaults.cashAccount.id); accMap[defaults.cashAccount.id].credits += amount; }
  });

  // COSTOS
  filteredCosts.forEach((c: any) => {
    const accId = c.account_id || findCostAccount(accounts, c.category)?.id;
    const amount = Number(c.amount_usd || 0);
    if (!accId || amount === 0) return;
    ensure(accId);
    accMap[accId].debits += amount;
    const counterAcct = defaults.cxpAccount || defaults.cashAccount;
    if (counterAcct) { ensure(counterAcct.id); accMap[counterAcct.id].credits += amount; }
  });

  // JOURNAL ENTRIES
  filteredJournals.forEach((je: any) => {
    je.journal_entry_lines?.forEach((line: any) => {
      if (!line.account_id) return;
      ensure(line.account_id);
      accMap[line.account_id].debits += Number(line.debit_usd || 0);
      accMap[line.account_id].credits += Number(line.credit_usd || 0);
    });
  });

  return accMap;
}
