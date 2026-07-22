'use client';

/**
 * Lista de atribuições activas de um benefício — CLIENT COMPONENT.
 */

import Link from 'next/link';
import { UserCheck, UserX, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/patterns';

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
        Sem atribuições activas. <Link href={`/rh/beneficios/atribuir?beneficioId=${beneficioId}`} className="text-primary underline">Atribuir a um colaborador</Link>
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
                Início: {new Date(at.dataInicio).toLocaleDateString('pt-PT')}
                {at.dataFim && ` · Fim: ${new Date(at.dataFim).toLocaleDateString('pt-PT')}`}
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
