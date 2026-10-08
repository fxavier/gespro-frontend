'use client';

/**
 * Confirmar encomenda (#129) — escolher a localização onde o stock é reservado.
 * Mesmo schema que a Server Action (`ConfirmarEncomendaSchema`).
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
import { Combobox } from '@/components/patterns';
import { confirmarEncomenda } from '@/server/actions/vendas.actions';
import {
  ConfirmarEncomendaSchema,
  type ConfirmarEncomendaInput,
} from '@/lib/validations/vendas';

export interface LocalizacaoOpcao {
  id: string;
  codigo: string;
  nome: string;
}

interface Props {
  encomendaId: string;
  localizacoes: LocalizacaoOpcao[];
}

export function ConfirmarEncomendaForm({ encomendaId, localizacoes }: Props) {
  const router = useRouter();
  const [aConfirmar, startTransition] = useTransition();
  const destino = `/vendas/pedidos/${encomendaId}`;

  const form = useForm<ConfirmarEncomendaInput>({
    resolver: zodResolver(ConfirmarEncomendaSchema),
    defaultValues: { encomendaId, localizacaoId: '' },
  });
  const localizacaoId = form.watch('localizacaoId');
  const erro = form.formState.errors.localizacaoId?.message;

  function onSubmit(data: ConfirmarEncomendaInput) {
    startTransition(async () => {
      const result = await confirmarEncomenda(data);
      if (result.ok) {
        toast.success('Encomenda confirmada; stock reservado.');
        router.push(destino);
      } else {
        toast.error(result.error.message);
      }
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Reserva de stock</CardTitle>
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
            Cada linha da encomenda fica reservada nesta localização até ser convertida em venda ou
            cancelada.
          </p>
        </CardContent>
      </Card>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={() => router.push(destino)}>
          Voltar
        </Button>
        <Button type="submit" disabled={aConfirmar}>
          {aConfirmar && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Confirmar Encomenda
        </Button>
      </div>
    </form>
  );
}
