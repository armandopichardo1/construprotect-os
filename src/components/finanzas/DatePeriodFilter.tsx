import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function useDatePeriodFilter() {
  const [period, setPeriod] = useState('all');
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);
  const now = useMemo(() => new Date(), []);

  const dateRange = useMemo(() => {
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const y = now.getFullYear(), m = now.getMonth();
    switch (period) {
      case 'month': return { start: fmt(new Date(y, m, 1)), end: fmt(now) };
      case 'prev_month': return { start: fmt(new Date(y, m - 1, 1)), end: fmt(new Date(y, m, 0)) };
      case 'quarter': return { start: fmt(new Date(y, m - 3, 1)), end: fmt(now) };
      case 'ytd': return { start: `${y}-01-01`, end: fmt(now) };
      case 'custom': return {
        start: customFrom ? fmt(customFrom) : '2000-01-01',
        end: customTo ? fmt(customTo) : fmt(now),
      };
      default: return { start: '2000-01-01', end: '2099-12-31' };
    }
  }, [period, now, customFrom, customTo]);

  const filterByDate = <T extends { date?: string }>(items: T[]): T[] => {
    if (period === 'all') return items;
    return items.filter(item => item.date && item.date >= dateRange.start && item.date <= dateRange.end);
  };

  return { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, dateRange, filterByDate };
}

interface DatePeriodFilterProps {
  period: string;
  setPeriod: (v: string) => void;
  customFrom?: Date;
  setCustomFrom: (d: Date | undefined) => void;
  customTo?: Date;
  setCustomTo: (d: Date | undefined) => void;
}

export function DatePeriodFilter({ period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo }: DatePeriodFilterProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={period} onValueChange={setPeriod}>
        <SelectTrigger className="w-[150px] h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todo</SelectItem>
          <SelectItem value="month">Este Mes</SelectItem>
          <SelectItem value="prev_month">Mes Anterior</SelectItem>
          <SelectItem value="quarter">Últimos 3 Meses</SelectItem>
          <SelectItem value="ytd">Año en Curso</SelectItem>
          <SelectItem value="custom">Personalizado</SelectItem>
        </SelectContent>
      </Select>
      {period === 'custom' && (
        <>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn('h-8 text-xs gap-1', !customFrom && 'text-muted-foreground')}>
                <CalendarIcon className="w-3.5 h-3.5" />
                {customFrom ? format(customFrom, 'dd/MM/yyyy') : 'Desde'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn('h-8 text-xs gap-1', !customTo && 'text-muted-foreground')}>
                <CalendarIcon className="w-3.5 h-3.5" />
                {customTo ? format(customTo, 'dd/MM/yyyy') : 'Hasta'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </>
      )}
    </div>
  );
}
