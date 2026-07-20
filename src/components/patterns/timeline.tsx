import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TimelineItem {
  id: string;
  title: string;
  description?: string;
  date?: Date | string;
  icon?: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'destructive' | 'info';
}

interface TimelineProps {
  items: TimelineItem[];
  className?: string;
}

const variantClasses = {
  default: 'bg-muted text-muted-foreground border-border',
  success: 'bg-success/10 text-success border-success/20',
  warning: 'bg-warning/10 text-warning-foreground border-warning/20',
  destructive: 'bg-destructive/10 text-destructive border-destructive/20',
  info: 'bg-info/10 text-info-foreground border-info/20',
};

function formatDate(date: Date | string) {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('pt-MZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Componente de linha de tempo para histórico e auditoria.
 */
export function Timeline({ items, className }: TimelineProps) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        Sem histórico disponível.
      </p>
    );
  }

  return (
    <ol className={cn('relative space-y-4', className)} aria-label="Linha de tempo">
      {items.map((item, index) => {
        const variant = item.variant ?? 'default';
        return (
          <li key={item.id} className="relative flex gap-4">
            {/* Linha vertical (excepto no último item) */}
            {index < items.length - 1 && (
              <div
                className="absolute left-4 top-8 bottom-0 w-px bg-border"
                aria-hidden="true"
              />
            )}

            {/* Ícone / marcador */}
            <div
              className={cn(
                'relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border',
                variantClasses[variant]
              )}
              aria-hidden="true"
            >
              {item.icon ?? (
                <span className="h-2 w-2 rounded-full bg-current" />
              )}
            </div>

            {/* Conteúdo */}
            <div className="min-w-0 flex-1 pb-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                {item.date && (
                  <time
                    dateTime={
                      typeof item.date === 'string'
                        ? item.date
                        : item.date.toISOString()
                    }
                    className="flex-shrink-0 text-xs text-muted-foreground"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {formatDate(item.date)}
                  </time>
                )}
              </div>
              {item.description && (
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {item.description}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
