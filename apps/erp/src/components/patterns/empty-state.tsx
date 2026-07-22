import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { InboxIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Estado vazio padronizado com ilustração leve e CTA opcional.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 py-16 px-4 text-center',
        className
      )}
      role="status"
      aria-label={title}
    >
      <div className="rounded-full bg-muted p-5 text-muted-foreground">
        {icon ?? <InboxIcon className="h-8 w-8" aria-hidden="true" />}
      </div>

      <div className="space-y-1 max-w-sm">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>

      {action && <div>{action}</div>}
    </div>
  );
}
