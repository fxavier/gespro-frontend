'use client';

/**
 * Folhas mensais (lotes) com acções de ciclo de vida — CLIENT COMPONENT.
 * PENDENTE → Processar (lançamento SALARIOS) → PAGO (pagamento).
 * Cancelamento (com estorno se processada) confirma-se por AlertDialog —
 * a única excepção permitida à regra sem-modais.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { BookCheck, Banknote, Ban, FileDown } from 'lucide-react';
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
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge, EmptyState } from '@/components/patterns';
import {
  marcarProcessadaAction,
  marcarPagaAction,
  cancelarFolhaAction,
} from '@/server/actions/payroll.actions';

export interface FolhaRow {
  id: string;
  mesReferencia: number;
  anoReferencia: number;
  status: string;
  totalBruto: string;
  totalLiquido: string;
  totalCustoEntidade: string;
  totalColaboradores: number;
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function periodoLabel(f: FolhaRow) {
  return `${MESES[f.mesReferencia - 1]} ${f.anoReferencia}`;
}

export function FolhasSection({ folhas }: { folhas: FolhaRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [aCancelar, setACancelar] = useState<FolhaRow | null>(null);
  const [motivo, setMotivo] = useState('');

  function processar(folha: FolhaRow) {
    startTransition(async () => {
      const r = await marcarProcessadaAction({ folhaId: folha.id });
      if (r.ok) {
        toast.success(`Folha ${periodoLabel(folha)} processada — lançamento contabilístico gerado.`);
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  }

  function pagar(folha: FolhaRow) {
    startTransition(async () => {
      const r = await marcarPagaAction({ folhaId: folha.id });
      if (r.ok) {
        toast.success(`Folha ${periodoLabel(folha)} marcada como paga.`);
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  }

  function confirmarCancelamento() {
    const folha = aCancelar;
    if (!folha) return;
    startTransition(async () => {
      const r = await cancelarFolhaAction({ folhaId: folha.id, motivo: motivo || 'Cancelamento' });
      if (r.ok) {
        toast.success(`Folha ${periodoLabel(folha)} cancelada.`);
        setACancelar(null);
        setMotivo('');
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  }

  if (folhas.length === 0) {
    return (
      <EmptyState
        title="Sem folhas mensais"
        description="Processe a folha do mês para gerar os salários de todos os colaboradores activos."
      />
    );
  }

  return (
    <div className="rounded-lg border divide-y">
      {folhas.map((f) => (
        <div
          key={f.id}
          className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between"
        >
          <div className="flex items-center gap-3">
            <div>
              <p className="font-medium">{periodoLabel(f)}</p>
              <p className="text-sm text-muted-foreground tabular-nums">
                {f.totalColaboradores} colaborador(es) · Bruto MT {f.totalBruto} · Líquido MT{' '}
                {f.totalLiquido} · Custo total MT {f.totalCustoEntidade}
              </p>
            </div>
            <StatusBadge status={f.status} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {f.status === 'PENDENTE' && (
              <Button size="sm" onClick={() => processar(f)} disabled={isPending}>
                <BookCheck className="h-4 w-4 mr-1.5" />
                Processar na contabilidade
              </Button>
            )}
            {f.status === 'PROCESSADO' && (
              <Button size="sm" onClick={() => pagar(f)} disabled={isPending}>
                <Banknote className="h-4 w-4 mr-1.5" />
                Marcar como paga
              </Button>
            )}
            {['PROCESSADO', 'PAGO'].includes(f.status) && (
              <>
                <Button size="sm" variant="outline" asChild>
                  <a
                    href={`/api/rh/payroll/mapas/inss?mes=${f.mesReferencia}&ano=${f.anoReferencia}`}
                  >
                    <FileDown className="h-4 w-4 mr-1.5" />
                    Mapa INSS
                  </a>
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <a
                    href={`/api/rh/payroll/mapas/irps?mes=${f.mesReferencia}&ano=${f.anoReferencia}`}
                  >
                    <FileDown className="h-4 w-4 mr-1.5" />
                    Mapa IRPS
                  </a>
                </Button>
              </>
            )}
            {['PENDENTE', 'PROCESSADO'].includes(f.status) && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                onClick={() => setACancelar(f)}
                disabled={isPending}
              >
                <Ban className="h-4 w-4 mr-1.5" />
                Cancelar
              </Button>
            )}
          </div>
        </div>
      ))}

      <AlertDialog open={aCancelar !== null} onOpenChange={(open) => !open && setACancelar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Cancelar folha {aCancelar ? periodoLabel(aCancelar) : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {aCancelar?.status === 'PROCESSADO'
                ? 'A folha já foi processada: o lançamento contabilístico será estornado (append-only) e todos os payrolls ficam cancelados. Poderá reprocessar o mês depois.'
                : 'Todos os payrolls pendentes deste mês ficam cancelados. Poderá reprocessar o mês depois.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Motivo do cancelamento *"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarCancelamento}
              disabled={isPending || motivo.trim().length === 0}
            >
              Confirmar cancelamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
