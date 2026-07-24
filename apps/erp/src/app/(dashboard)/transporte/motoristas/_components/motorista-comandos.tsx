'use client';

/**
 * Comandos do Motorista — Client Component (folha).
 * Liga a atualizarDisponibilidadeAction. Sem Dialog.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { atualizarDisponibilidadeAction } from '@/server/actions/transporte.actions';

interface MotoristaComandosProps {
  motoristaId: string;
  disponivelActual: boolean;
}

const MOTIVOS = [
  { value: 'FERIAS', label: 'Férias' },
  { value: 'AUSENCIA', label: 'Ausência' },
  { value: 'SUSPENSAO', label: 'Suspensão' },
  { value: 'MANUAL', label: 'Manual' },
  { value: 'CONFLITO_AGENDA', label: 'Conflito de Agenda' },
];

export function MotoristaComandos({ motoristaId, disponivelActual }: MotoristaComandosProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [disponivel, setDisponivel] = useState(disponivelActual);
  const [motivo, setMotivo] = useState('MANUAL');

  function submeter(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const dataFimRaw = data.get('dataFim') as string;

    startTransition(async () => {
      const result = await atualizarDisponibilidadeAction({
        motoristaId,
        disponivel,
        motivo: disponivel ? undefined : (motivo as 'FERIAS' | 'AUSENCIA' | 'SUSPENSAO' | 'MANUAL' | 'CONFLITO_AGENDA'),
        dataFim: dataFimRaw ? new Date(dataFimRaw) : undefined,
        fonte: 'MANUAL',
      });
      if (result.ok) {
        toast.success('Disponibilidade atualizada.');
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Erro ao atualizar disponibilidade.');
      }
    });
  }

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <p className="font-medium text-sm">Gerir Disponibilidade</p>
        <form onSubmit={submeter} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="disp-estado">Estado</Label>
              <Select value={disponivel ? 'sim' : 'nao'} onValueChange={(v) => setDisponivel(v === 'sim')}>
                <SelectTrigger id="disp-estado"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sim">Disponível</SelectItem>
                  <SelectItem value="nao">Indisponível</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!disponivel && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="disp-motivo">Motivo</Label>
                  <Select value={motivo} onValueChange={setMotivo}>
                    <SelectTrigger id="disp-motivo"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MOTIVOS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="disp-fim">Até (opcional)</Label>
                  <Input id="disp-fim" name="dataFim" type="date" />
                </div>
              </>
            )}
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? 'A guardar…' : 'Atualizar Disponibilidade'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
