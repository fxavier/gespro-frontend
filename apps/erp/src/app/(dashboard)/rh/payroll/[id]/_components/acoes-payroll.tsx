'use client';

/**
 * Acções disponíveis no detalhe de um payroll PENDENTE — CLIENT COMPONENT.
 * Recalcular: recalcula os valores estatutários (INSS, IRPS) sem tocar nos
 * ajustes manuais. Adicionar ajuste: navega para a rota /ajuste.
 */
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { RefreshCw, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { recalcularPayrollAction } from '@/server/actions/payroll.actions';

interface AcoesPayrollProps {
  payrollId: string;
}

export function AcoesPayroll({ payrollId }: AcoesPayrollProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function recalcular() {
    startTransition(async () => {
      const r = await recalcularPayrollAction({ payrollId });
      if (r.ok) {
        toast.success('Payroll recalculado');
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={recalcular} disabled={isPending}>
        <RefreshCw className="h-4 w-4 mr-1.5" />
        Recalcular
      </Button>
      <Button size="sm" asChild>
        <Link href={`/rh/payroll/${payrollId}/ajuste`}>
          <Plus className="h-4 w-4 mr-1.5" />
          Adicionar ajuste
        </Link>
      </Button>
    </>
  );
}
