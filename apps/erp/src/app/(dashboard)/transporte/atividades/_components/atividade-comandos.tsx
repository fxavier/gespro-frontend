'use client';

/**
 * Comandos da Atividade — Client Component (folha).
 * Liga a transitarAtividadeAction (descrição obrigatória por transição).
 * Transições válidas via TRANSICOES_ATIVIDADE (client-safe).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { TRANSICOES_ATIVIDADE } from '@/lib/state-machines';
import { STATUS_LABELS } from '@/components/patterns';
import { transitarAtividadeAction } from '@/server/actions/transporte.actions';

export function AtividadeComandos({ atividadeId, estado }: { atividadeId: string; estado: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [alvo, setAlvo] = useState<string | null>(null);
  const [descricao, setDescricao] = useState('');

  const transicoes = TRANSICOES_ATIVIDADE[estado] ?? [];

  if (transicoes.length === 0) {
    return <p className="text-sm text-muted-foreground">Atividade em estado terminal — sem transições.</p>;
  }

  function confirmar() {
    if (!descricao.trim()) {
      toast.error('Descrição da transição obrigatória.');
      return;
    }
    startTransition(async () => {
      const result = await transitarAtividadeAction({
        atividadeId,
        estadoAlvo: alvo as 'PLANEADA' | 'EM_CURSO' | 'SUSPENSA' | 'CONCLUIDA' | 'CANCELADA',
        descricao: descricao.trim(),
      });
      if (result.ok) {
        toast.success(`Atividade em estado ${STATUS_LABELS[alvo!] ?? alvo}.`);
        setAlvo(null);
        setDescricao('');
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Transição inválida.');
      }
    });
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <p className="font-medium text-sm">Mudar Estado</p>
        <div className="flex flex-wrap gap-2">
          {transicoes.map((t) => (
            <Button
              key={t}
              type="button"
              size="sm"
              variant={alvo === t ? 'default' : 'outline'}
              disabled={pending}
              onClick={() => setAlvo(alvo === t ? null : t)}
            >
              {STATUS_LABELS[t] ?? t}
            </Button>
          ))}
        </div>
        {alvo && (
          <div className="space-y-3 rounded-md border p-4">
            <div className="space-y-1.5">
              <Label htmlFor="at-descricao">Descrição da transição para {STATUS_LABELS[alvo] ?? alvo} *</Label>
              <Textarea id="at-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={500} rows={2} />
            </div>
            <Button type="button" size="sm" disabled={pending} onClick={confirmar}>
              {pending ? 'A guardar…' : 'Confirmar Transição'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
