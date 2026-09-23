'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Ban, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cancelarPeriodoAction, fecharPeriodoAction } from '@/server/actions/reconciliacao.actions';

/**
 * Fecho (RF §17): com diferença residual zero fecha directamente; com
 * diferença, só com justificação — o campo aparece e é obrigatório. O fecho é
 * terminal, por isso pede confirmação (AlertDialog: confirmar, não recolher).
 */
export function FecharPeriodo({ periodoId, contaId, comDiferenca }: { periodoId: string; contaId: string; comDiferenca: boolean }) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();
  const [justificacao, setJustificacao] = useState('');
  const valida = !comDiferenca || justificacao.trim().length >= 10;

  const fechar = () =>
    iniciar(async () => {
      const r = await fecharPeriodoAction({ periodoId, ...(justificacao.trim() && { justificacao: justificacao.trim() }) });
      if (!r.ok) return void toast.error(r.error.message);
      toast.success('Período reconciliado e fechado.');
      router.refresh();
    });

  const cancelar = () =>
    iniciar(async () => {
      const r = await cancelarPeriodoAction({ periodoId });
      if (!r.ok) return void toast.error(r.error.message);
      toast.success('Período cancelado.');
      router.push(`/contabilidade/reconciliacao/${contaId}/periodos`);
      router.refresh();
    });

  return (
    <div className="space-y-4 rounded-lg border p-4">
      {comDiferenca && (
        <div className="space-y-1">
          <Label htmlFor="justificacao-fecho">Justificação da diferença residual</Label>
          <Textarea
            id="justificacao-fecho"
            value={justificacao}
            onChange={(e) => setJustificacao(e.target.value)}
            placeholder="Porque fecha com esta diferença (mínimo 10 caracteres)"
            aria-invalid={!valida}
          />
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={aCorrer}>
              <Ban className="h-4 w-4 mr-1.5" /> Cancelar período
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar este período?</AlertDialogTitle>
              <AlertDialogDescription>
                Os movimentos e as correspondências não são afectados. Um período cancelado não se reabre: abre-se outro.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction onClick={cancelar}>Cancelar período</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" disabled={aCorrer || !valida}>
              <Lock className="h-4 w-4 mr-1.5" /> {aCorrer ? 'A fechar…' : 'Fechar período'}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Fechar o período?</AlertDialogTitle>
              <AlertDialogDescription>
                O mapa fica gravado e as reconciliações deste período deixam de poder ser revertidas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction onClick={fechar}>Fechar período</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
