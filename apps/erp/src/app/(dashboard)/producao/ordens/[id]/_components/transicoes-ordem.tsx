'use client';

/**
 * #164 — transições da ordem de produção no detalhe. Cada botão pede confirmação num
 * `AlertDialog` sem campos («Confirmar» / «Voltar») e chama a action existente
 * `transitarStatusOrdemProducaoAction`, que faz numa só transacção o efeito de stock da
 * transição (liberar reserva a BOM, concluir confirma consumos e dá entrada do produto
 * acabado, cancelar liberta as reservas). As regras ficam no servidor; aqui só se desenha.
 * Só montado quando a sessão tem `producao:ordens:update`.
 */

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Ban, CheckCircle2, PackageMinus, Play, Send } from 'lucide-react';
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
} from '@/components/ui/alert-dialog';
import { transitarStatusOrdemProducaoAction } from '@/server/actions/producao.actions';

type Alvo = 'LIBERADA' | 'EM_PRODUCAO' | 'CONCLUIDA' | 'CANCELADA';

const ACCAO: Record<Alvo, { rotulo: string; titulo: string; descricao: string; icone: typeof Play }> = {
  LIBERADA: {
    rotulo: 'Liberar ordem',
    titulo: 'Liberar a ordem',
    descricao: 'Os materiais da estrutura de produto activa ficam reservados no armazém de matérias-primas.',
    icone: Send,
  },
  EM_PRODUCAO: {
    rotulo: 'Iniciar produção',
    titulo: 'Iniciar a produção da ordem',
    descricao: 'Fica registada a data de início real.',
    icone: Play,
  },
  CONCLUIDA: {
    rotulo: 'Concluir ordem',
    titulo: 'Concluir a ordem',
    descricao:
      'Os materiais reservados saem do armazém de matérias-primas e o produto acabado dá entrada no armazém de produto acabado pela quantidade da ordem.',
    icone: CheckCircle2,
  },
  CANCELADA: {
    rotulo: 'Cancelar ordem',
    titulo: 'Cancelar a ordem',
    descricao: 'As reservas de material são libertadas. Uma ordem cancelada já não se retoma.',
    icone: Ban,
  },
};

/** Botões por estado — o contrato do #164 (pausar/retomar ficam de fora). */
const ALVOS_POR_ESTADO: Record<string, Alvo[]> = {
  PLANEADA: ['LIBERADA', 'CANCELADA'],
  LIBERADA: ['EM_PRODUCAO', 'CANCELADA'],
  EM_PRODUCAO: ['CONCLUIDA', 'CANCELADA'],
  PAUSADA: ['CANCELADA'],
};

interface Props {
  id: string;
  numero: string;
  status: string;
}

export function TransicoesOrdem({ id, numero, status }: Props) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();
  const [alvo, setAlvo] = useState<Alvo | null>(null);

  const alvos = ALVOS_POR_ESTADO[status] ?? [];
  const podeConsumir = status === 'EM_PRODUCAO';
  if (alvos.length === 0 && !podeConsumir) return null;

  const confirmar = () => {
    if (!alvo) return;
    const novoStatus = alvo;
    iniciar(async () => {
      const r = await transitarStatusOrdemProducaoAction({ id, novoStatus });
      if (r.ok) {
        toast.success(`Ordem ${numero}: ${ACCAO[novoStatus].rotulo.toLowerCase()} — feito.`);
        setAlvo(null);
        router.refresh();
      } else {
        toast.error(r.error.message ?? 'Não foi possível mudar o estado da ordem.');
      }
    });
  };

  const accao = alvo ? ACCAO[alvo] : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {podeConsumir && (
        <Button variant="outline" size="sm" asChild>
          <Link href={`/producao/ordens/${id}/registar-consumo`}>
            <PackageMinus className="h-4 w-4 mr-1.5" aria-hidden="true" />
            Registar consumo
          </Link>
        </Button>
      )}
      {alvos.map((a) => {
        const Icone = ACCAO[a].icone;
        return (
          <Button
            key={a}
            size="sm"
            variant={a === 'CANCELADA' ? 'destructive' : 'default'}
            disabled={aCorrer}
            onClick={() => setAlvo(a)}
          >
            <Icone className="h-4 w-4 mr-1.5" aria-hidden="true" />
            {ACCAO[a].rotulo}
          </Button>
        );
      })}

      <AlertDialog open={alvo !== null} onOpenChange={(aberto) => !aberto && !aCorrer && setAlvo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {accao?.titulo} {numero}?
            </AlertDialogTitle>
            <AlertDialogDescription>{accao?.descricao}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={aCorrer}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmar();
              }}
              disabled={aCorrer}
            >
              {aCorrer ? 'A gravar…' : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
