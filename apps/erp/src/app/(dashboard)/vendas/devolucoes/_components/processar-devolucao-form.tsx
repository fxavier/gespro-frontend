'use client';

/**
 * Processar devolução (#130) — escolher a localização onde o stock devolvido entra.
 * Mesmo schema que a Server Action, com a localização obrigatória (`ProcessarDevolucaoFormSchema`).
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox, UnsavedChangesGuard } from '@/components/patterns';
import { processarDevolucao } from '@/server/actions/vendas.actions';
import {
  ProcessarDevolucaoFormSchema,
  type ProcessarDevolucaoFormInput,
} from '@/lib/validations/vendas';

export interface LocalizacaoOpcao {
  id: string;
  codigo: string;
  nome: string;
}

interface Props {
  devolucaoId: string;
  /** A devolução reembolsa o cliente: o dinheiro sai da sessão de caixa aberta e liquida a NC. */
  reembolso?: boolean;
  /** Sessão de caixa aberta do utilizador; sem ela, uma devolução com reembolso não se processa. */
  sessaoCaixaId?: string;
  localizacoes: LocalizacaoOpcao[];
}

export function ProcessarDevolucaoForm({
  devolucaoId,
  reembolso = false,
  sessaoCaixaId,
  localizacoes,
}: Props) {
  const router = useRouter();
  const [aProcessar, startTransition] = useTransition();
  const destino = `/vendas/devolucoes/${devolucaoId}`;

  const form = useForm<ProcessarDevolucaoFormInput>({
    resolver: zodResolver(ProcessarDevolucaoFormSchema),
    defaultValues: {
      id: devolucaoId,
      localizacaoId: '',
      sessaoCaixaId: reembolso ? sessaoCaixaId : undefined,
    },
  });
  const localizacaoId = form.watch('localizacaoId');
  const erro = form.formState.errors.localizacaoId?.message;
  // Processar sem sessão saltaria o reembolso e deixaria a devolução PROCESSADA sem pagar ao cliente.
  const semSessaoParaReembolso = reembolso && !sessaoCaixaId;

  function onSubmit(data: ProcessarDevolucaoFormInput) {
    if (semSessaoParaReembolso) return;
    startTransition(async () => {
      const result = await processarDevolucao(data);
      if (result.ok) {
        toast.success('Devolução processada.');
        router.push(destino);
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <UnsavedChangesGuard isDirty={form.formState.isDirty && !aProcessar} />
      <Card>
        <CardHeader>
          <CardTitle>Entrada do stock devolvido</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 max-w-md">
          <Label htmlFor="localizacaoId">Localização *</Label>
          <Combobox
            id="localizacaoId"
            options={localizacoes.map((l) => ({ value: l.id, label: `${l.nome} (${l.codigo})` }))}
            value={localizacaoId}
            onChange={(v) =>
              form.setValue('localizacaoId', v, { shouldDirty: true, shouldValidate: true })
            }
            placeholder="Seleccione a localização"
            searchPlaceholder="Pesquisar localização…"
            emptyText="Nenhuma localização activa."
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? 'localizacaoId-erro' : undefined}
          />
          {erro && (
            <p id="localizacaoId-erro" role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Cada artigo devolvido dá entrada nesta localização. A nota de crédito é numerada pela
            série activa.
          </p>
          {reembolso && sessaoCaixaId && (
            <p className="text-xs text-muted-foreground">
              O reembolso ao cliente sai da sua sessão de caixa aberta e liquida a nota de crédito.
            </p>
          )}
          {semSessaoParaReembolso && (
            <p role="alert" className="text-sm text-destructive">
              Esta devolução reembolsa o cliente em dinheiro: abra uma sessão de caixa antes de a
              processar.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={() => router.push(destino)}>
          Voltar
        </Button>
        <Button type="submit" disabled={aProcessar || semSessaoParaReembolso}>
          {aProcessar && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Processar Devolução
        </Button>
      </div>
    </form>
  );
}
