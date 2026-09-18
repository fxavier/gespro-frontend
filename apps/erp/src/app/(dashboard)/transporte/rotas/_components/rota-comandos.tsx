'use client';

/**
 * Comandos operacionais da Rota — Client Component (folha).
 * Liga a transitarRotaAction (iniciar/pausar/concluir) e atribuirRecursosRotaAction.
 * Transições válidas via TRANSICOES_ROTA (client-safe).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Play, Pause, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { TRANSICOES_ROTA } from '@/lib/state-machines';
import { STATUS_LABELS, Combobox } from '@/components/patterns';
import { transitarRotaAction, atribuirRecursosRotaAction } from '@/server/actions/transporte.actions';

interface Opcao {
  id: string;
  label: string;
}

interface RotaComandosProps {
  rotaId: string;
  estado: string;
  viaturaId: string | null;
  motoristaId: string | null;
  viaturas: Opcao[];
  motoristas: Opcao[];
}

const SEM = '__sem__';

const ICONE: Record<string, typeof Play> = {
  ATIVA: Play,
  PAUSADA: Pause,
  CONCLUIDA: CheckCircle,
  CANCELADA: XCircle,
};

export function RotaComandos({ rotaId, estado, viaturaId, motoristaId, viaturas, motoristas }: RotaComandosProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [motivo, setMotivo] = useState('');
  const [alvoConfirm, setAlvoConfirm] = useState<string | null>(null);

  const transicoes = TRANSICOES_ROTA[estado] ?? [];
  const permiteAtribuir = estado === 'PLANEADA' || estado === 'PAUSADA';

  function transitar(alvo: string, comMotivo: string | undefined) {
    startTransition(async () => {
      const result = await transitarRotaAction({
        rotaId,
        estadoAlvo: alvo as 'PLANEADA' | 'ATIVA' | 'PAUSADA' | 'CONCLUIDA' | 'CANCELADA',
        motivo: comMotivo,
      });
      if (result.ok) {
        toast.success(`Rota em estado ${STATUS_LABELS[alvo] ?? alvo}.`);
        setAlvoConfirm(null);
        setMotivo('');
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Transição inválida.');
      }
    });
  }

  function atribuir(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const v = data.get('viaturaId') as string;
    const m = data.get('motoristaId') as string;
    startTransition(async () => {
      const result = await atribuirRecursosRotaAction({
        rotaId,
        viaturaId: v && v !== SEM ? v : null,
        motoristaId: m && m !== SEM ? m : null,
      });
      if (result.ok) {
        toast.success('Recursos atribuídos.');
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao atribuir recursos.');
      }
    });
  }

  return (
    <div className="space-y-4">
      {permiteAtribuir && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <p className="font-medium text-sm">Atribuir Viatura e Motorista</p>
            <form onSubmit={atribuir} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="r-viatura">Viatura</Label>
                  <Combobox
                    id="r-viatura"
                    name="viaturaId"
                    defaultValue={viaturaId ?? SEM}
                    placeholder="Sem viatura"
                    options={[{ value: SEM, label: 'Sem viatura' }, ...viaturas.map((v) => ({ value: v.id, label: v.label }))]}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="r-motorista">Motorista</Label>
                  <Combobox
                    id="r-motorista"
                    name="motoristaId"
                    defaultValue={motoristaId ?? SEM}
                    placeholder="Sem motorista"
                    options={[{ value: SEM, label: 'Sem motorista' }, ...motoristas.map((m) => ({ value: m.id, label: m.label }))]}
                  />
                </div>
              </div>
              <Button type="submit" size="sm" variant="outline" disabled={pending}>Guardar Recursos</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {transicoes.length > 0 && (
        <Card>
          <CardContent className="p-5 space-y-4">
            <p className="font-medium text-sm">Mudar Estado</p>
            <div className="flex flex-wrap gap-2">
              {transicoes.map((t) => {
                const Icon = ICONE[t];
                const cancelavel = t === 'CANCELADA';
                return (
                  <Button
                    key={t}
                    type="button"
                    size="sm"
                    variant={cancelavel ? 'outline' : 'default'}
                    disabled={pending}
                    onClick={() => (cancelavel ? setAlvoConfirm(alvoConfirm === t ? null : t) : transitar(t, undefined))}
                  >
                    {Icon && <Icon className="h-3.5 w-3.5 mr-1.5" />}
                    {STATUS_LABELS[t] ?? t}
                  </Button>
                );
              })}
            </div>
            {alvoConfirm === 'CANCELADA' && (
              <div className="space-y-3 rounded-md border p-4">
                <div className="space-y-1.5">
                  <Label htmlFor="rota-motivo">Motivo do Cancelamento</Label>
                  <Textarea id="rota-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} rows={2} />
                </div>
                <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={() => transitar('CANCELADA', motivo.trim() || undefined)}>
                  Confirmar Cancelamento
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
