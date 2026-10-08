'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Power, PowerOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  transitarStatusBOMAction,
  transitarStatusRoteiroAction,
} from '@/server/actions/producao.actions';

interface ActivarDesactivarProps {
  entidade: 'bom' | 'roteiro';
  id: string;
  /** Alvo que o detalhe (servidor) já validou contra o mapa de transições; `null` → sem botão. */
  alvo: 'ATIVO' | 'INATIVO' | null;
}

/**
 * #165 — liga as transições existentes de BOM e roteiro ao detalhe. Sem confirmação: as duas
 * acções são reversíveis (INATIVO → ATIVO). Fica no detalhe e faz `router.refresh()`.
 */
export function ActivarDesactivar({ entidade, id, alvo }: ActivarDesactivarProps) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();

  if (!alvo) return null;

  const accionar = () => {
    iniciar(async () => {
      const action = entidade === 'bom' ? transitarStatusBOMAction : transitarStatusRoteiroAction;
      const r = await action({ id, novoStatus: alvo });
      if (r.ok) {
        toast.success(alvo === 'ATIVO' ? 'Activado.' : 'Desactivado.');
        router.refresh();
      } else {
        toast.error(r.error.message ?? 'Não foi possível mudar o estado.');
      }
    });
  };

  return alvo === 'ATIVO' ? (
    <Button size="sm" onClick={accionar} disabled={aCorrer}>
      <Power className="h-4 w-4 mr-1.5" aria-hidden="true" />
      Activar
    </Button>
  ) : (
    <Button size="sm" variant="outline" onClick={accionar} disabled={aCorrer}>
      <PowerOff className="h-4 w-4 mr-1.5" aria-hidden="true" />
      Desactivar
    </Button>
  );
}
