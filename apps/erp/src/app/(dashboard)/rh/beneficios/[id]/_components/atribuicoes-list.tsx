'use client';

/**
 * Lista das atribuições activas e suspensas de um benefício, com as acções de cada uma
 * (#162) — CLIENT COMPONENT.
 */

import Link from 'next/link';
import { UserCheck, UserX, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/patterns';
import { formatarData } from '@/lib/format-date';
import { AtribuicaoAcoes } from './atribuicao-acoes';

export interface AtribuicaoRow {
  id: string;
  colaboradorId: string;
  dataInicio: string;
  dataFim: string | null;
  comparticipacaoEmpresa: string;
  descontoColaborador: string;
  status: string;
}

interface AtribuicoesListProps {
  atribuicoes: AtribuicaoRow[];
  beneficioId: string;
}

export function AtribuicoesList({ atribuicoes, beneficioId }: AtribuicoesListProps) {
  if (atribuicoes.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Sem atribuições activas ou suspensas. <Link href={`/rh/beneficios/atribuir?beneficioId=${beneficioId}`} className="text-primary underline">Atribuir a um colaborador</Link>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {atribuicoes.map((at) => (
        <div key={at.id} className="py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <UserCheck className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                Colaborador: {at.colaboradorId.slice(0, 8)}…
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                Início: {formatarData(at.dataInicio)}
                {at.dataFim && ` · Fim: ${formatarData(at.dataFim)}`}
              </p>
              <p className="text-xs text-muted-foreground tabular-nums">
                Empresa: {Number(at.comparticipacaoEmpresa).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} MZN
                {' · '}
                Desconto: {Number(at.descontoColaborador).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} MZN
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={at.status} />
            <AtribuicaoAcoes atribuicaoId={at.id} status={at.status} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AtribuicoesListEmpty({ beneficioId }: { beneficioId: string }) {
  return (
    <div className="text-center py-12 space-y-3">
      <UserX className="h-12 w-12 text-muted-foreground mx-auto" />
      <p className="text-muted-foreground">Nenhuma atribuição encontrada.</p>
      <Button asChild size="sm" variant="outline">
        <Link href={`/rh/beneficios/atribuir?beneficioId=${beneficioId}`}>
          <Pause className="h-4 w-4 mr-2" />
          Atribuir a colaborador
        </Link>
      </Button>
    </div>
  );
}
