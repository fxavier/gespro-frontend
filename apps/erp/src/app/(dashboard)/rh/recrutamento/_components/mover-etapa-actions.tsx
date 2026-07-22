'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { TRANSICOES_CANDIDATURA } from '@/lib/state-machines';
import { moverEtapaAction } from '@/server/actions/recrutamento.actions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';

const ETAPA_LABELS: Record<string, string> = {
  TRIAGEM: 'Mover para Triagem',
  ENTREVISTA: 'Mover para Entrevista',
  PROPOSTA: 'Mover para Proposta',
  CONTRATADO: 'Marcar como Contratado',
  REJEITADO: 'Rejeitar Candidato',
  DESISTIU: 'Registar Desistência',
};

interface MoverEtapaActionsProps {
  candidaturaId: string;
  etapaActual: string;
}

export function MoverEtapaActions({ candidaturaId, etapaActual }: MoverEtapaActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const proximasTransicoes = TRANSICOES_CANDIDATURA[etapaActual] ?? [];

  if (proximasTransicoes.length === 0) return null;

  // Separar transições positivas das negativas
  const terminais = ['REJEITADO', 'DESISTIU'];
  const positivas = proximasTransicoes.filter((e) => !terminais.includes(e));
  const negativas = proximasTransicoes.filter((e) => terminais.includes(e));

  function mover(novaEtapa: string) {
    startTransition(async () => {
      const result = await moverEtapaAction({
        candidaturaId,
        novaEtapa: novaEtapa as Parameters<typeof moverEtapaAction>[0]['novaEtapa'],
      });
      if (result.ok) {
        toast.success(`Candidatura movida para ${ETAPA_LABELS[novaEtapa]?.replace('Mover para ', '') ?? novaEtapa}`);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao mover candidatura');
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" disabled={isPending}>
          Mover Etapa
          <ChevronDown className="h-4 w-4 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {positivas.map((etapa) => (
          <DropdownMenuItem key={etapa} onClick={() => mover(etapa)}>
            {ETAPA_LABELS[etapa] ?? etapa}
          </DropdownMenuItem>
        ))}
        {positivas.length > 0 && negativas.length > 0 && <DropdownMenuSeparator />}
        {negativas.map((etapa) => (
          <DropdownMenuItem
            key={etapa}
            onClick={() => mover(etapa)}
            className="text-destructive"
          >
            {ETAPA_LABELS[etapa] ?? etapa}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
