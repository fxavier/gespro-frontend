'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { TRANSICOES_VAGA } from '@/lib/state-machines';
import { transitarStatusVagaAction } from '@/server/actions/recrutamento.actions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown } from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  ABERTA: 'Abrir Vaga',
  EM_TRIAGEM: 'Iniciar Triagem',
  FECHADA: 'Fechar Vaga',
  CANCELADA: 'Cancelar Vaga',
};

interface VagaStatusActionsProps {
  vagaId: string;
  statusActual: string;
}

export function VagaStatusActions({ vagaId, statusActual }: VagaStatusActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const proximasTransicoes = TRANSICOES_VAGA[statusActual] ?? [];

  if (proximasTransicoes.length === 0) return null;

  function transitar(novoStatus: string) {
    startTransition(async () => {
      const result = await transitarStatusVagaAction({ vagaId, novoStatus: novoStatus as 'ABERTA' | 'EM_TRIAGEM' | 'FECHADA' | 'CANCELADA' | 'RASCUNHO' });
      if (result.ok) {
        toast.success(`Estado alterado para ${novoStatus.replace(/_/g, ' ')}`);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao alterar estado');
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isPending}>
          Alterar Estado
          <ChevronDown className="h-4 w-4 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {proximasTransicoes.map((estado) => (
          <DropdownMenuItem
            key={estado}
            onClick={() => transitar(estado)}
            className={estado === 'CANCELADA' ? 'text-destructive' : ''}
          >
            {STATUS_LABELS[estado] ?? estado}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
