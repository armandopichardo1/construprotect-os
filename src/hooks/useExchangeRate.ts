import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useExchangeRate() {
  const query = useQuery({
    queryKey: ['latest-rate'],
    queryFn: async () => {
      const { data } = await supabase
        .from('exchange_rates')
        .select('*')
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 min cache
  });

  const rate = Number(query.data?.usd_sell || 60);
  return { rate, rateData: query.data, isLoading: query.isLoading };
}
