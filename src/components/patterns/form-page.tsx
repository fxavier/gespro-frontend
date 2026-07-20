import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

// ──────────────────────────────────────────────────────────────
// FormSection — secção individual do formulário
// ──────────────────────────────────────────────────────────────

interface FormSectionProps {
  id?: string;
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  variant?: 'card' | 'plain';
}

/**
 * Secção de formulário com título e descrição opcionais.
 * Variante 'card': envolve em Card. Variante 'plain': sem envelope.
 */
export function FormSection({
  id,
  title,
  description,
  children,
  className,
  variant = 'card',
}: FormSectionProps) {
  if (variant === 'plain') {
    return (
      <div id={id} className={cn('space-y-4', className)}>
        {(title || description) && (
          <div>
            {title && <h3 className="text-base font-semibold">{title}</h3>}
            {description && (
              <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>
        )}
        {children}
      </div>
    );
  }

  return (
    <Card id={id} className={cn('', className)}>
      {(title || description) && (
        <CardHeader className="pb-4">
          {title && <CardTitle className="text-base">{title}</CardTitle>}
          {description && (
            <CardDescription>{description}</CardDescription>
          )}
        </CardHeader>
      )}
      <CardContent className={cn(!title && !description && 'pt-6')}>
        <div className="space-y-4">{children}</div>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────
// FormPage — página de formulário com footer sticky
// ──────────────────────────────────────────────────────────────

interface FormPageProps {
  children: ReactNode;
  /** Botões de acção (Guardar / Cancelar) — renderizados no footer sticky */
  actions: ReactNode;
  className?: string;
}

/**
 * Shell de página de formulário com footer sticky Guardar/Cancelar.
 * Os filhos são as FormSections.
 */
export function FormPage({ children, actions, className }: FormPageProps) {
  return (
    <div className={cn('flex flex-col min-h-full', className)}>
      {/* Conteúdo do formulário */}
      <div className="flex-1 p-6 space-y-6 pb-24">
        {children}
      </div>

      {/* Footer sticky */}
      <div className="sticky bottom-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Separator />
        <div className="px-6 py-3 flex items-center justify-end gap-3">
          {actions}
        </div>
      </div>
    </div>
  );
}
