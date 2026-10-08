'use client';

/**
 * «Processar amortização do mês» (#118) — chama `processarAmortizacaoTenantAction` para o mês
 * corrente de Maputo (calculado no servidor e recebido por props). Idempotente por mês: repetir
 * não duplica, só processa os ativos que ainda não tenham a amortização desse mês.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CalendarClock } from 'lucide-react';
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
import { processarAmortizacaoTenantAction } from '@/server/actions/inventario.actions';

const ROTULO = 'Processar amortização do mês';

export function ProcessarAmortizacaoMes({ ano, mes }: { ano: number; mes: number }) {
  const router = useRouter();
  const [aProcessar, iniciarTransicao] = useTransition();
  const periodo = `${String(mes).padStart(2, '0')}/${ano}`;

  const processar = () => {
    iniciarTransicao(async () => {
      const res = await processarAmortizacaoTenantAction({ ano, mes });
      if (!res.ok) {
        toast.error(res.error.message ?? 'Não foi possível processar a amortização.');
        return;
      }
      const { processados, erros } = res.data;
      if (erros.length > 0) {
        toast.warning(`Amortização de ${periodo}: ${processados} ativo(s) processado(s), ${erros.length} com erro.`);
      } else if (processados === 0) {
        toast.info(`A amortização de ${periodo} já estava processada.`);
      } else {
        toast.success(`Amortização de ${periodo}: ${processados} ativo(s) processado(s).`);
      }
      router.refresh();
    });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" disabled={aProcessar}>
          <CalendarClock className="h-4 w-4 mr-1.5" aria-hidden="true" />
          {ROTULO}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Processar a amortização de {periodo}?</AlertDialogTitle>
          <AlertDialogDescription>
            Calcula a amortização de {periodo} de todos os ativos em uso que ainda não a tenham.
            Os já processados neste mês não são alterados. Não gera lançamento contabilístico.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={processar} disabled={aProcessar}>
            {ROTULO}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
