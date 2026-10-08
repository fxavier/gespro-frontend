'use client';

/**
 * Acções disponíveis no detalhe de um payroll PENDENTE — CLIENT COMPONENT.
 * Recalcular: pede confirmação (AlertDialog) e recalcula os valores estatutários
 * (INSS, IRPS) sem tocar nos ajustes manuais. Adicionar ajuste: navega para a rota /ajuste.
 */
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { RefreshCw, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={isPending}>
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Recalcular
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recalcular payroll?</AlertDialogTitle>
            <AlertDialogDescription>
              Vai recalcular os valores estatutários (salário base, INSS e IRPS) com os dados
              actuais do funcionário. Os ajustes manuais são preservados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={recalcular} disabled={isPending}>
              Recalcular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Button size="sm" asChild>
        <Link href={`/rh/payroll/${payrollId}/ajuste`}>
          <Plus className="h-4 w-4 mr-1.5" />
          Adicionar ajuste
        </Link>
      </Button>
    </>
  );
}
