import { supabase } from '@/integrations/supabase/client';

/**
 * Shared account mapping logic for financial reports.
 * Used by: BalanceComprobacionTab, EstadoSituacionTab, LibroDiarioTab,
 *          CrearTransaccionTab, FinanzasPage (form dialogs)
 *
 * IMPORTANT: All financial reports (Balance, Situación) source ONLY from
 * journal_entries. Raw transactions (sales, expenses, costs) are the
 * operational record; journal entries are the accounting record.
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

/** Accumulate journal entry lines — THE SINGLE SOURCE OF TRUTH for reports */
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

// ============================================================
// Journal Entry Creation Helpers
// ============================================================

interface JournalLine {
  accountId: string;
  debit: number;
  credit: number;
}

/** Create an auto-generated journal entry with lines */
export async function createAutoJournal(
  description: string,
  lines: JournalLine[],
  options?: { date?: string; exchangeRate?: number; notes?: string },
) {
  const validLines = lines.filter(l => l.accountId && (l.debit > 0 || l.credit > 0));
  if (validLines.length < 2) return null;

  const totalDebit = validLines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = validLines.reduce((s, l) => s + l.credit, 0);

  const payload: any = {
    description,
    total_debit_usd: Math.round(totalDebit * 100) / 100,
    total_credit_usd: Math.round(totalCredit * 100) / 100,
    exchange_rate: options?.exchangeRate || null,
    notes: options?.notes || null,
  };
  if (options?.date) payload.date = options.date;

  const { data: entry, error } = await supabase
    .from('journal_entries')
    .insert(payload)
    .select()
    .single();
  if (error || !entry) throw error || new Error('Error creando asiento');

  await supabase.from('journal_entry_lines').insert(
    validLines.map(l => ({
      journal_entry_id: entry.id,
      account_id: l.accountId,
      debit_usd: Math.round(l.debit * 100) / 100,
      credit_usd: Math.round(l.credit * 100) / 100,
      description,
    })),
  );

  return entry;
}

/** Build journal lines for a Sale transaction */
export function buildSaleJournalLines(
  accounts: any[],
  total: number,
  subtotal: number,
  itbis: number,
  paymentStatus: string,
): JournalLine[] {
  const defaults = getDefaultAccounts(accounts);
  const counterAcct = paymentStatus === 'paid' ? defaults.cash : defaults.cxc;

  const lines: JournalLine[] = [];
  if (counterAcct) lines.push({ accountId: counterAcct.id, debit: total, credit: 0 });
  if (defaults.income) lines.push({ accountId: defaults.income.id, debit: 0, credit: subtotal });
  if (itbis > 0 && defaults.itbis) lines.push({ accountId: defaults.itbis.id, debit: 0, credit: itbis });
  return lines;
}

/** Build journal lines for an Expense transaction */
export function buildExpenseJournalLines(
  accounts: any[],
  accountId: string | null,
  category: string,
  amountUsd: number,
): JournalLine[] {
  const defaults = getDefaultAccounts(accounts);
  const expAcct = accountId
    ? accounts.find((a: any) => a.id === accountId)
    : findExpenseAccount(accounts, category);

  const lines: JournalLine[] = [];
  if (expAcct) lines.push({ accountId: expAcct.id, debit: amountUsd, credit: 0 });
  if (defaults.cash) lines.push({ accountId: defaults.cash.id, debit: 0, credit: amountUsd });
  return lines;
}

/** Build journal lines for a Cost transaction */
export function buildCostJournalLines(
  accounts: any[],
  accountId: string | null,
  category: string,
  amountUsd: number,
): JournalLine[] {
  const defaults = getDefaultAccounts(accounts);
  const costAcct = accountId
    ? accounts.find((a: any) => a.id === accountId)
    : findCostAccount(accounts, category);
  const counterAcct = defaults.cxp || defaults.cash;

  const lines: JournalLine[] = [];
  if (costAcct) lines.push({ accountId: costAcct.id, debit: amountUsd, credit: 0 });
  if (counterAcct) lines.push({ accountId: counterAcct.id, debit: 0, credit: amountUsd });
  return lines;
}
