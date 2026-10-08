'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
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
import { aprovarComissao, marcarComissaoPaga } from '@/server/actions/comissoes.actions';

interface Props {
  id: string;
  status: string;
  podeAprovar: boolean;
  podePagar: boolean;
}

/**
 * Avanço da comissão (#131): PENDENTE → «Aprovar», APROVADA → «Marcar como paga». Cada passo é
 * confirmado por AlertDialog (só confirma, não recolhe dados). Pagar não lança na contabilidade.
 */
export function ComissaoAcoes({ id, status, podeAprovar, podePagar }: Props) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();

  const passo =
    status === 'PENDENTE' && podeAprovar
      ? {
          rotulo: 'Aprovar',
          aCorrer: 'A aprovar…',
          titulo: 'Aprovar esta comissão?',
          descricao: 'A comissão passa a Aprovada e fica disponível para pagamento.',
          sucesso: 'Comissão aprovada.',
          action: aprovarComissao,
        }
      : status === 'APROVADA' && podePagar
        ? {
            rotulo: 'Marcar como paga',
            aCorrer: 'A registar…',
            titulo: 'Marcar esta comissão como paga?',
            descricao:
              'Regista o pagamento ao vendedor com a data de hoje. Não gera lançamento contabilístico.',
            sucesso: 'Comissão marcada como paga.',
            action: marcarComissaoPaga,
          }
        : null;

  if (!passo) return null;

  const executar = () => {
    iniciar(async () => {
      const r = await passo.action({ id });
      if (!r.ok) {
        toast.error(r.error.message ?? 'Não foi possível actualizar a comissão.');
        router.refresh();
        return;
      }
      toast.success(passo.sucesso);
      router.refresh();
    });
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" disabled={aCorrer}>
          {aCorrer ? passo.aCorrer : passo.rotulo}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{passo.titulo}</AlertDialogTitle>
          <AlertDialogDescription>{passo.descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={executar}>{passo.rotulo}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
