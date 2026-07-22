import { type ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface KpiCardProps {
  title: string;
  value: string | number;
  delta?: number;
  deltaLabel?: string;
  icon?: ReactNode;
  description?: string;
  sparkline?: ReactNode;
  className?: string;
  isLoading?: boolean;
}

/**
 * Cartão de KPI com valor, delta (variação) e sparkline opcional.
 * Números tabulares são aplicados por defeito.
 */
export function KpiCard({
  title,
  value,
  delta,
  deltaLabel,
  icon,
  description,
  sparkline,
  className,
  isLoading,
}: KpiCardProps) {
  const deltaPositive = delta !== undefined && delta > 0;
  const deltaNegative = delta !== undefined && delta < 0;
  const deltaZero = delta !== undefined && delta === 0;

  if (isLoading) {
    return (
      <Card className={cn('relative overflow-hidden', className)}>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-8 bg-muted rounded w-1/2" />
            <div className="h-3 bg-muted rounded w-1/3" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-muted-foreground truncate">{title}</p>
            <p
              className="text-2xl font-bold tracking-tight"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {value}
            </p>
            {(delta !== undefined || description) && (
              <div className="flex items-center gap-1.5 text-sm">
                {delta !== undefined && (
                  <span
                    className={cn(
                      'flex items-center gap-0.5 font-medium',
                      deltaPositive && 'text-success',
                      deltaNegative && 'text-destructive',
                      deltaZero && 'text-muted-foreground'
                    )}
                  >
                    {deltaPositive && <TrendingUp className="h-3.5 w-3.5" />}
                    {deltaNegative && <TrendingDown className="h-3.5 w-3.5" />}
                    {deltaZero && <Minus className="h-3.5 w-3.5" />}
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {deltaPositive && '+'}
                      {delta.toFixed(1)}%
                    </span>
                  </span>
                )}
                {deltaLabel && (
                  <span className="text-muted-foreground">{deltaLabel}</span>
                )}
                {description && !delta && (
                  <span className="text-muted-foreground">{description}</span>
                )}
              </div>
            )}
          </div>

          {icon && (
            <div className="flex-shrink-0 rounded-lg bg-primary/10 p-2.5 text-primary">
              {icon}
            </div>
          )}
        </div>

        {sparkline && (
          <div className="mt-4 -mx-2">
            {sparkline}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
