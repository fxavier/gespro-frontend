'use client';

import { useTransition, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
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
import { arquivarAtivoAction, transitarEstadoAtivoAction } from '@/server/actions/inventario.actions';
import { TRANSICOES_ATIVO } from '@/lib/state-machines';

interface AtivoAcoesProps {
  id: string;
  estado: string;
  modoCompacto?: boolean;
}

const ESTADO_LABELS: Record<string, string> = {
  NOVO: 'Novo',
  EM_USO: 'Em Uso',
  EM_MANUTENCAO: 'Em Manutenção',
  EM_TRANSFERENCIA: 'Em Transferência',
  OBSOLETO: 'Obsoleto',
  BAIXADO: 'Baixado',
};

/**
 * Acções de estado de um ativo.
 * Padrão canónico: useTransition + AlertDialog para acções destrutivas.
 */
export function AtivoAcoes({ id, estado, modoCompacto = false }: AtivoAcoesProps) {
  const router = useRouter();
  const [transitarPending, startTransitar] = useTransition();
  const [arquivarPending, startArquivar] = useTransition();
  const [dialogAberto, setDialogAberto] = useState(false);
  const [observacoes, setObservacoes] = useState('');

  const transicoesValidas = TRANSICOES_ATIVO[estado] ?? [];
  const podeArquivar = estado === 'BAIXADO';

  const handleTransitar = (novoEstado: string) => {
    startTransitar(async () => {
      const result = await transitarEstadoAtivoAction({ id, novoEstado, observacoes: observacoes || undefined });
      if (result.ok) {
        toast.success(`Ativo transitado para ${ESTADO_LABELS[novoEstado] ?? novoEstado}.`);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao transitar estado do ativo.');
      }
    });
  };

  const handleArquivar = () => {
    startArquivar(async () => {
      const result = await arquivarAtivoAction({ id });
      if (result.ok) {
        toast.success('Ativo arquivado com sucesso.');
        setDialogAberto(false);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao arquivar o ativo.');
      }
    });
  };

  if (transicoesValidas.length === 0 && !podeArquivar) return null;

  return (
    <div className={modoCompacto ? 'flex gap-1 flex-wrap' : 'flex items-center gap-2 flex-wrap'}>
      {transicoesValidas.map((novoEstado) => {
        const isDestrutivoEstado = novoEstado === 'BAIXADO';

        if (isDestrutivoEstado) {
          return (
            <AlertDialog key={novoEstado}>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                  disabled={transitarPending}
                >
                  {ESTADO_LABELS[novoEstado] ?? novoEstado}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirmar baixa do ativo?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta acção moverá o ativo para o estado Baixado. Este estado é terminal
                    e não pode ser revertido.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-2 space-y-1.5">
                  <Label htmlFor={`obs-baixa-${id}`} className="text-sm font-medium">
                    Observações <span className="text-muted-foreground text-xs">(opcional)</span>
                  </Label>
                  <Textarea
                    id={`obs-baixa-${id}`}
                    className="resize-none"
                    placeholder="Motivo da baixa…"
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    rows={3}
                    maxLength={500}
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel onClick={() => setObservacoes('')}>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => handleTransitar(novoEstado)}
                    disabled={transitarPending}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {transitarPending ? 'A processar…' : 'Confirmar Baixa'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          );
        }

        return (
          <Button
            key={novoEstado}
            size="sm"
            variant="outline"
            disabled={transitarPending}
            onClick={() => handleTransitar(novoEstado)}
          >
            {transitarPending ? 'A processar…' : (ESTADO_LABELS[novoEstado] ?? novoEstado)}
          </Button>
        );
      })}

      {podeArquivar && (
        <AlertDialog open={dialogAberto} onOpenChange={setDialogAberto}>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
              disabled={arquivarPending}
            >
              Arquivar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Arquivar ativo?</AlertDialogTitle>
              <AlertDialogDescription>
                O ativo será marcado como eliminado (soft delete). Esta acção é irreversível.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleArquivar}
                disabled={arquivarPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {arquivarPending ? 'A arquivar…' : 'Arquivar Ativo'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
