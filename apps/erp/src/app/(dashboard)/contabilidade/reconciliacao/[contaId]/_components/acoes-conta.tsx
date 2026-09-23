'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { executarReconciliacaoAction } from '@/server/actions/reconciliacao.actions';

/** Projecta o razão e corre o motor. Idempotente: correr duas vezes não duplica nada. */
export function ExecutarReconciliacao({ contaBancariaId, desactivado }: { contaBancariaId: string; desactivado?: boolean }) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();

  const executar = () =>
    iniciar(async () => {
      const r = await executarReconciliacaoAction({ contaBancariaId });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      const m = r.data.matching;
      toast.success(
        `${r.data.projectados} lançamento(s) novos · ${m.confirmadas} reconciliado(s) · ` +
          `${m.sugeridas} sugestão(ões) · ${m.comDiferencaValor} com diferença de valor`,
      );
      router.refresh();
    });

  return (
    <Button size="sm" onClick={executar} disabled={aCorrer || desactivado}>
      <Play className="h-4 w-4 mr-2" />
      {aCorrer ? 'A reconciliar…' : 'Executar reconciliação'}
    </Button>
  );
}
