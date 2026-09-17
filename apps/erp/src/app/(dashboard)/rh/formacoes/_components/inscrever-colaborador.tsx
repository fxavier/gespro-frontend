'use client';

/**
 * Inscrição de colaborador numa formação — CLIENT COMPONENT.
 * O serviço valida as regras (vagas esgotadas, estado que aceita inscrições).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/patterns';
import { inscreverColaboradorFormacaoAction } from '@/server/actions/rh.actions';

interface Colaborador {
  id: string;
  nome: string;
  codigo: string;
}

interface Props {
  formacaoId: string;
  colaboradores: Colaborador[];
}

export function InscreverColaborador({ formacaoId, colaboradores }: Props) {
  const router = useRouter();
  const [colaboradorId, setColaboradorId] = useState<string>('');
  const [isPending, startTransition] = useTransition();

  const inscrever = () => {
    if (!colaboradorId) {
      toast.error('Seleccione um colaborador para inscrever.');
      return;
    }
    startTransition(async () => {
      const result = await inscreverColaboradorFormacaoAction({ formacaoId, colaboradorId });
      if (result.ok) {
        toast.success('Colaborador inscrito com sucesso.');
        setColaboradorId('');
        router.refresh();
      } else {
        toast.error(result.error?.message ?? 'Erro ao inscrever colaborador.');
      }
    });
  };

  if (colaboradores.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Não há colaboradores activos disponíveis para inscrever.
      </p>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2 border rounded-lg p-3 bg-muted/20">
      <div className="flex-1 space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Inscrever colaborador</label>
        <Combobox
          value={colaboradorId}
          onChange={setColaboradorId}
          placeholder="Seleccionar colaborador"
          options={colaboradores.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nome}` }))}
        />
      </div>
      <Button type="button" size="sm" onClick={inscrever} disabled={isPending}>
        <UserPlus className="h-4 w-4 mr-1.5" />
        {isPending ? 'A inscrever...' : 'Inscrever'}
      </Button>
    </div>
  );
}
