import { supabase } from '@/integrations/supabase/client';

export interface AccountMatch {
  id: string;
  code: string | null;
  description: string;
  account_type: string;
}

/** Fetch active chart of accounts */
export async function fetchAccounts(): Promise<AccountMatch[]> {
  const { data } = await supabase.from('chart_of_accounts')
    .select('id, code, description, account_type')
    .eq('is_active', true).order('code');
  return data || [];
}

/** Find the "Compras en Tránsito" account (13200 or similar) */
export function findTransitAccount(accounts: AccountMatch[]): AccountMatch | undefined {
  // Priority 1: exact code 13200
  return accounts.find(a => a.code === '13200')
    // Priority 2: any account with "tránsito"/"transito" in name
    || accounts.find(a =>
      a.account_type === 'Activo' && (
        a.description?.toLowerCase().includes('tránsito') ||
        a.description?.toLowerCase().includes('transito')
      )
    );
}

/** Find the "Inventarios" account (13000 or similar, NOT transit) */
export function findInventoryAccount(accounts: AccountMatch[]): AccountMatch | undefined {
  // Priority 1: exact code 13000
  return accounts.find(a => a.code === '13000')
    // Priority 2: asset account with "inventar" but NOT "tránsito"
    || accounts.find(a =>
      a.account_type === 'Activo' &&
      a.description?.toLowerCase().includes('inventar') &&
      !a.description?.toLowerCase().includes('tránsito') &&
      !a.description?.toLowerCase().includes('transito')
    );
}

/** Find "Cuentas por Pagar" account (20000 or similar) */
export function findCxPAccount(accounts: AccountMatch[]): AccountMatch | undefined {
  return accounts.find(a => a.code === '20000')
    || accounts.find(a =>
      a.code?.startsWith('21') || a.code?.startsWith('20') ||
      (a.account_type === 'Pasivo' && a.description?.toLowerCase().includes('pagar'))
    );
}
