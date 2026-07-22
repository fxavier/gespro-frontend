'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormPage } from '@/components/patterns';
import { criarOrdemProducaoAction } from '@/server/actions/producao.actions';

const Schema = z.object({
  produtoId: z.string().min(1, 'ID do produto obrigatório'),
  codigoProduto: z.string().min(1).max(50),
  nomeProduto: z.string().min(1).max(200),
  quantidade: z.coerce.number().positive('Quantidade deve ser positiva'),
  unidadeMedida: z.string().min(1).max(20),
  prioridade: z.enum(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']),
  roteiroId: z.string().optional(),
  dataPrevisaoInicio: z.string().min(1, 'Data início obrigatória'),
  dataPrevisaoFim: z.string().min(1, 'Data fim obrigatória'),
  observacoes: z.string().max(2000).optional(),
});

type FormData = z.infer<typeof Schema>;

interface Roteiro { id: string; codigo: string; nome: string }
interface Props { roteiros: Roteiro[] }

export default function NovaOrdemForm({ roteiros }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: {
      prioridade: 'MEDIA',
      unidadeMedida: 'UN',
      dataPrevisaoInicio: new Date().toISOString().split('T')[0],
      dataPrevisaoFim: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
    },
  });

  const { formState: { errors } } = form;

  function onSubmit(data: FormData) {
    startTransition(async () => {
      const result = await criarOrdemProducaoAction({
        produtoId: data.produtoId,
        codigoProduto: data.codigoProduto,
        nomeProduto: data.nomeProduto,
        quantidade: data.quantidade,
        unidadeMedida: data.unidadeMedida,
        prioridade: data.prioridade,
        roteiroId: data.roteiroId || undefined,
        dataPrevisaoInicio: new Date(data.dataPrevisaoInicio),
        dataPrevisaoFim: new Date(data.dataPrevisaoFim),
        observacoes: data.observacoes,
      });

      if (!result.ok) {
        toast.error(result.error.message ?? 'Erro ao criar ordem de produção.');
        return;
      }

      toast.success('Ordem de produção criada com sucesso.');
      router.push('/producao/ordens');
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => router.push('/producao/ordens')} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'A criar…' : 'Criar Ordem'}
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Produto</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>ID do Produto *</Label>
                <Input placeholder="ID do produto" {...form.register('produtoId')} />
                {errors.produtoId && <p className="text-xs text-destructive">{errors.produtoId.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Código *</Label>
                <Input placeholder="PROD-001" {...form.register('codigoProduto')} />
                {errors.codigoProduto && <p className="text-xs text-destructive">{errors.codigoProduto.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Nome do Produto *</Label>
                <Input placeholder="Nome do produto" {...form.register('nomeProduto')} />
                {errors.nomeProduto && <p className="text-xs text-destructive">{errors.nomeProduto.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantidade *</Label>
                <Input type="number" min={0.01} step={0.01} {...form.register('quantidade')} />
                {errors.quantidade && <p className="text-xs text-destructive">{errors.quantidade.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Unidade de Medida *</Label>
                <Input placeholder="UN" {...form.register('unidadeMedida')} />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Planificação</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Data Início Prevista *</Label>
                <Input type="date" {...form.register('dataPrevisaoInicio')} />
                {errors.dataPrevisaoInicio && <p className="text-xs text-destructive">{errors.dataPrevisaoInicio.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Data Fim Prevista *</Label>
                <Input type="date" {...form.register('dataPrevisaoFim')} />
                {errors.dataPrevisaoFim && <p className="text-xs text-destructive">{errors.dataPrevisaoFim.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Prioridade *</Label>
                <Select
                  value={form.watch('prioridade')}
                  onValueChange={(v) => form.setValue('prioridade', v as FormData['prioridade'])}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BAIXA">Baixa</SelectItem>
                    <SelectItem value="MEDIA">Média</SelectItem>
                    <SelectItem value="ALTA">Alta</SelectItem>
                    <SelectItem value="URGENTE">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Roteiro (opcional)</Label>
              <Select
                value={form.watch('roteiroId') ?? ''}
                onValueChange={(v) => form.setValue('roteiroId', v || undefined)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione roteiro" />
                </SelectTrigger>
                <SelectContent>
                  {roteiros.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.codigo} — {r.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea rows={3} placeholder="Notas adicionais…" {...form.register('observacoes')} />
          </div>
        </div>
      </FormPage>
    </form>
  );
}
