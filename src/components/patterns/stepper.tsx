import { type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StepperStep {
  key: string;
  label: string;
  description?: string;
}

interface StepperProps {
  steps: StepperStep[];
  currentStep: string;
  className?: string;
}

/**
 * Indicador de progresso para wizards multi-passo.
 * Cada passo é uma página separada — o stepper é apenas visual.
 */
export function Stepper({ steps, currentStep, className }: StepperProps) {
  const currentIndex = steps.findIndex((s) => s.key === currentStep);

  return (
    <nav
      aria-label="Progresso"
      className={cn('flex items-center justify-center', className)}
    >
      <ol className="flex items-center gap-2 w-full max-w-2xl">
        {steps.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isPending = index > currentIndex;

          return (
            <li
              key={step.key}
              className={cn('flex items-center', index < steps.length - 1 && 'flex-1')}
            >
              <div className="flex flex-col items-center gap-1">
                {/* Círculo de estado */}
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-medium transition-all',
                    isCompleted &&
                      'border-primary bg-primary text-primary-foreground',
                    isCurrent &&
                      'border-primary bg-background text-primary',
                    isPending &&
                      'border-border bg-background text-muted-foreground'
                  )}
                  aria-current={isCurrent ? 'step' : undefined}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                {/* Label */}
                <span
                  className={cn(
                    'text-xs font-medium whitespace-nowrap',
                    isCurrent && 'text-primary',
                    isPending && 'text-muted-foreground',
                    isCompleted && 'text-foreground'
                  )}
                >
                  {step.label}
                </span>
                {step.description && isCurrent && (
                  <span className="text-xs text-muted-foreground">
                    {step.description}
                  </span>
                )}
              </div>

              {/* Linha de ligação */}
              {index < steps.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-2 transition-colors',
                    isCompleted ? 'bg-primary' : 'bg-border'
                  )}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

interface StepperContentProps {
  children: ReactNode;
  steps: StepperStep[];
  currentStep: string;
  className?: string;
}

/**
 * Wrapper de página de wizard que inclui o Stepper e o conteúdo do passo actual.
 */
export function StepperContent({
  children,
  steps,
  currentStep,
  className,
}: StepperContentProps) {
  return (
    <div className={cn('space-y-8', className)}>
      <Stepper steps={steps} currentStep={currentStep} />
      <div>{children}</div>
    </div>
  );
}
