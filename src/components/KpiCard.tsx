import { cn } from '@/lib/utils';
import { type LucideIcon } from 'lucide-react';

interface KpiCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: { value: number; label: string };
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'destructive';
}

const variantStyles = {
  default: 'bg-card',
  primary: 'bg-primary/10',
  success: 'bg-success/10',
  warning: 'bg-warning/10',
  destructive: 'bg-destructive/10',
};

const iconVariantStyles = {
  default: 'text-muted-foreground',
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
};

export function KpiCard({ title, value, subtitle, icon: Icon, trend, variant = 'default' }: KpiCardProps) {
  return (
    <div className={cn('rounded-2xl p-5 border border-border', variantStyles[variant])}>
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold text-foreground">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className={cn('w-10 h-10 flex items-center justify-center rounded-xl bg-muted/50 shrink-0', iconVariantStyles[variant])}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1">
          <span className={cn(
            'text-xs font-semibold',
            trend.value >= 0 ? 'text-success' : 'text-destructive'
          )}>
            {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}%
          </span>
          <span className="text-xs text-muted-foreground">{trend.label}</span>
        </div>
      )}
    </div>
  );
}
