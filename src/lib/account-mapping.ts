import type { AccountMatch } from './accounting-utils';

/**
 * Shared account mapping logic for financial reports.
 * Used by: BalanceComprobacionTab, EstadoSituacionTab, LibroDiarioTab
 */

/** Map expense category → account code prefixes */
const EXPENSE_CODE_MAP: Record<string, string[]> = {
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
  bank_fees: ['80100', '80700', '639'],
  purchases: ['500'],
  other: ['639', '630'],
};

const COST_CODE_MAP: Record<string, string[]> = {
  freight: ['502', '500'],
  customs: ['503', '504', '500'],
  raw_materials: ['501', '500'],
  packaging: ['505', '500'],
  labor: ['506', '500'],
  logistics: ['507', '502', '500'],
  warehousing: ['505', '500'],
  insurance: ['505', '500'],
  other: ['500'],
};

/** Find the best matching expense account by category */
export function findExpenseAccount(accounts: any[], category: string): any | undefined {
  const prefixes = EXPENSE_CODE_MAP[category] || ['630'];
  for (const prefix of prefixes) {
    const match = accounts.find((a: any) =>
      a.code?.startsWith(prefix) &&
      (a.account_type === 'Gasto' || a.account_type === 'Gastos No Operacionales')
    );
    if (match) return match;
  }
  return accounts.find((a: any) => a.account_type === 'Gasto');
}

/** Find the best matching cost account by category */
export function findCostAccount(accounts: any[], category: string): any | undefined {
  const prefixes = COST_CODE_MAP[category] || ['500'];
  for (const prefix of prefixes) {
    const match = accounts.find((a: any) =>
      a.code?.startsWith(prefix) && a.account_type === 'Costo'
    );
    if (match) return match;
  }
  return accounts.find((a: any) => a.account_type === 'Costo');
}

/** Whether an account type has debit as its natural balance */
export function isDebitNatural(accountType: string): boolean {
  return ['Activo', 'Costo', 'Gasto', 'Gastos No Operacionales'].includes(accountType);
}

/** Find common default accounts by code prefix */
export function getDefaultAccounts(accounts: any[]) {
  const find = (prefix: string) => accounts.find((a: any) => a.code?.startsWith(prefix));

  return {
    income: find('41') || find('40'),
    cxc: find('121') || find('12'),
    cogs: find('50') || accounts.find((a: any) => a.account_type === 'Costo'),
    inventory: find('131') || find('13'),
    cash: find('103') || find('104') || find('10'),
    cxp: find('201') || find('20'),
    itbis: find('241') || accounts.find((a: any) => a.code?.startsWith('24') && a.account_type === 'Pasivo'),
  };
}

/** Build an account accumulator map (debit/credit by account ID) */
export function buildAccountAccumulator() {
  const accMap: Record<string, { debits: number; credits: number }> = {};
  const ensure = (id: string) => { if (!accMap[id]) accMap[id] = { debits: 0, credits: 0 }; };
  return { accMap, ensure };
}

/** Accumulate sales into the account map */
export function accumulateSales(
  sales: any[],
  defaults: ReturnType<typeof getDefaultAccounts>,
  acc: ReturnType<typeof buildAccountAccumulator>,
) {
  const { ensure, accMap } = acc;
  sales.forEach((s: any) => {
    const incId = s.account_id || defaults.income?.id;
    const amount = Number(s.total_usd || 0);
    if (!incId || amount === 0) return;

    ensure(incId);
    accMap[incId].credits += amount;

    if (['pending', 'overdue', 'partial'].includes(s.payment_status)) {
      if (defaults.cxc) { ensure(defaults.cxc.id); accMap[defaults.cxc.id].debits += amount; }
    } else if (s.payment_status === 'paid') {
      if (defaults.cash) { ensure(defaults.cash.id); accMap[defaults.cash.id].debits += amount; }
    }
  });
}

/** Accumulate COGS from sale items */
export function accumulateCOGS(
  saleItems: any[],
  defaults: ReturnType<typeof getDefaultAccounts>,
  acc: ReturnType<typeof buildAccountAccumulator>,
) {
  const { ensure, accMap } = acc;
  saleItems.forEach((si: any) => {
    const cogsAmt = Number(si.unit_cost_usd || 0) * Number(si.quantity || 0);
    if (cogsAmt === 0) return;
    if (defaults.cogs) { ensure(defaults.cogs.id); accMap[defaults.cogs.id].debits += cogsAmt; }
    if (defaults.inventory) { ensure(defaults.inventory.id); accMap[defaults.inventory.id].credits += cogsAmt; }
  });
}

/** Accumulate expenses */
export function accumulateExpenses(
  expenses: any[],
  accounts: any[],
  defaults: ReturnType<typeof getDefaultAccounts>,
  acc: ReturnType<typeof buildAccountAccumulator>,
) {
  const { ensure, accMap } = acc;
  expenses.forEach((e: any) => {
    const accId = e.account_id || findExpenseAccount(accounts, e.category)?.id;
    const amount = Number(e.amount_usd || 0);
    if (!accId || amount === 0) return;
    ensure(accId);
    accMap[accId].debits += amount;
    if (defaults.cash) { ensure(defaults.cash.id); accMap[defaults.cash.id].credits += amount; }
  });
}

/** Accumulate costs */
export function accumulateCosts(
  costs: any[],
  accounts: any[],
  defaults: ReturnType<typeof getDefaultAccounts>,
  acc: ReturnType<typeof buildAccountAccumulator>,
) {
  const { ensure, accMap } = acc;
  costs.forEach((c: any) => {
    const accId = c.account_id || findCostAccount(accounts, c.category)?.id;
    const amount = Number(c.amount_usd || 0);
    if (!accId || amount === 0) return;
    ensure(accId);
    accMap[accId].debits += amount;
    const counterAcct = defaults.cxp || defaults.cash;
    if (counterAcct) { ensure(counterAcct.id); accMap[counterAcct.id].credits += amount; }
  });
}

/** Accumulate journal entry lines */
export function accumulateJournalEntries(
  journalEntries: any[],
  acc: ReturnType<typeof buildAccountAccumulator>,
) {
  const { ensure, accMap } = acc;
  journalEntries.forEach((je: any) => {
    je.journal_entry_lines?.forEach((line: any) => {
      if (!line.account_id) return;
      ensure(line.account_id);
      accMap[line.account_id].debits += Number(line.debit_usd || 0);
      accMap[line.account_id].credits += Number(line.credit_usd || 0);
    });
  });
}
