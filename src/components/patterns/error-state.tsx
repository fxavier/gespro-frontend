'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Estado de erro padronizado com botão de retry.
 */
export function ErrorState({
  title = 'Ocorreu um erro',
  message = 'Não foi possível carregar os dados. Tente novamente.',
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 py-16 px-4 text-center',
        className
      )}
      role="alert"
    >
      <div className="rounded-full bg-destructive/10 p-5 text-destructive">
        <AlertTriangle className="h-8 w-8" aria-hidden="true" />
      </div>

      <div className="space-y-1 max-w-sm">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>

      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Tentar novamente
        </Button>
      )}
    </div>
  );
}
