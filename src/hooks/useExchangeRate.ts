import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface RateRow {
  date: string;
  usd_buy: number;
  usd_sell: number;
  source: string | null;
}

/**
 * Returns the latest rate (for header display) plus a rateForMonth() function
 * that looks up the closest rate for a given YYYY-MM key.
 */
export function useExchangeRate() {
  // Load ALL historical rates (sorted desc)
  const query = useQuery({
    queryKey: ['all-exchange-rates'],
    queryFn: async () => {
      const { data } = await supabase
        .from('exchange_rates')
        .select('date, usd_buy, usd_sell, source')
        .order('date', { ascending: false });
      return (data || []) as RateRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const rates = query.data || [];
  const latestRate = rates[0];
  const rate = Number(latestRate?.usd_sell || 60);

  /**
   * Get the sell rate for a specific month (YYYY-MM).
   * Finds the closest rate within that month, or the nearest prior month.
   */
  const rateForMonth = (yearMonth: string): number => {
    if (!rates.length) return rate;

    // Find rates in that month
    const monthRates = rates.filter(r => r.date.startsWith(yearMonth));
    if (monthRates.length > 0) {
      return Number(monthRates[0].usd_sell); // most recent in that month
    }

    // Fallback: find the closest rate before that month
    const targetDate = `${yearMonth}-01`;
    const prior = rates.find(r => r.date <= targetDate);
    if (prior) return Number(prior.usd_sell);

    // Last resort: latest available
    return rate;
  };

  return { rate, rateData: latestRate, rateForMonth, rates, isLoading: query.isLoading };
}
