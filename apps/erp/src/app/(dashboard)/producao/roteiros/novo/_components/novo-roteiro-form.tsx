'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormPage } from '@/components/patterns';
import { criarRoteiroAction } from '@/server/actions/producao.actions';

const OperacaoSchema = z.object({
  sequencia: z.number().int().positive(),
  nome: z.string().min(1, 'Nome obrigatório').max(200),
  descricao: z.string().max(1000).optional(),
  centroTrabalhoId: z.string().optional(),
  tempoPreparacao: z.coerce.number().int().nonnegative(),
  tempoOperacao: z.coerce.number().int().positive('Tempo de operação deve ser positivo'),
  tempoLimpeza: z.coerce.number().int().nonnegative(),
  custoHora: z.coerce.number().nonnegative(),
  eficienciaEsperada: z.coerce.number().min(0).max(100),
  paralela: z.boolean().default(false),
  obrigatoria: z.boolean().default(true),
  instrucoes: z.string().max(2000).optional(),
});

const Schema = z.object({
  codigo: z.string().min(1).max(30),
  nome: z.string().min(1).max(200),
  versao: z.string().min(1).max(20),
  estruturaProdutoId: z.string().optional(),
  categoria: z.string().max(100).optional(),
  observacoes: z.string().max(1000).optional(),
});

type FormData = z.infer<typeof Schema>;
type OperacaoLocal = z.infer<typeof OperacaoSchema>;

interface Estrutura { id: string; codigo: string; nome: string }
interface CentroTrabalho { id: string; codigo: string; nome: string }

interface Props {
  estruturas: Estrutura[];
  centrosTrabalho: CentroTrabalho[];
}

const OPERACAO_DEFAULT: Partial<OperacaoLocal> = {
  tempoPreparacao: 0,
  tempoOperacao: 60,
  tempoLimpeza: 0,
  custoHora: 0,
  eficienciaEsperada: 100,
  paralela: false,
  obrigatoria: true,
};

export default function NovoRoteiroForm({ estruturas, centrosTrabalho }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [operacoes, setOperacoes] = useState<OperacaoLocal[]>([]);
  const [showAddOp, setShowAddOp] = useState(false);
  const [novaOp, setNovaOp] = useState<Partial<OperacaoLocal>>({ ...OPERACAO_DEFAULT });

  const form = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: { versao: '1.0' },
  });

  const { formState: { errors } } = form;

  function adicionarOperacao() {
    const result = OperacaoSchema.safeParse({
      ...novaOp,
      sequencia: novaOp.sequencia ?? operacoes.length + 1,
      eficienciaEsperada: Number(novaOp.eficienciaEsperada ?? 100),
    });
    if (!result.success) {
      toast.error(result.error.errors[0]?.message ?? 'Preencha os campos obrigatórios.');
      return;
    }
    setOperacoes((prev) => [...prev, result.data]);
    setNovaOp({ ...OPERACAO_DEFAULT, sequencia: operacoes.length + 2 });
    setShowAddOp(false);
  }

  function removerOperacao(idx: number) {
    setOperacoes((prev) => prev.filter((_, i) => i !== idx));
  }

  function onSubmit(data: FormData) {
    startTransition(async () => {
      const result = await criarRoteiroAction({
        codigo: data.codigo,
        nome: data.nome,
        versao: data.versao,
        estruturaProdutoId: data.estruturaProdutoId || undefined,
        categoria: data.categoria || undefined,
        observacoes: data.observacoes || undefined,
        operacoes: operacoes.map((op) => ({
          sequencia: op.sequencia,
          nome: op.nome,
          descricao: op.descricao,
          centroTrabalhoId: op.centroTrabalhoId || undefined,
          tempoPreparacao: op.tempoPreparacao,
          tempoOperacao: op.tempoOperacao,
          tempoLimpeza: op.tempoLimpeza,
          custoHora: op.custoHora,
          eficienciaEsperada: op.eficienciaEsperada / 100,
          paralela: op.paralela,
          obrigatoria: op.obrigatoria,
          instrucoes: op.instrucoes,
          dependencias: [],
          ferramentasNecessarias: [],
          qualificacoesRequeridas: [],
        })),
      });

      if (!result.ok) {
        toast.error(result.error.message ?? 'Erro ao criar roteiro.');
        return;
      }

      toast.success('Roteiro criado com sucesso.');
      router.push('/producao/roteiros');
    });
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
    <FormPage
      actions={
        <>
          <Button type="button" variant="outline" onClick={() => router.push('/producao/roteiros')} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'A criar…' : 'Criar Roteiro'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Identificação */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Identificação</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Código *</Label>
              <Input placeholder="ROT-001" {...form.register('codigo')} />
              {errors.codigo && <p className="text-xs text-destructive">{errors.codigo.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input placeholder="Nome do roteiro" {...form.register('nome')} />
              {errors.nome && <p className="text-xs text-destructive">{errors.nome.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Versão *</Label>
              <Input placeholder="1.0" {...form.register('versao')} />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Input placeholder="Ex.: Montagem, Acabamento…" {...form.register('categoria')} />
            </div>
            <div className="space-y-2">
              <Label>Estrutura do Produto</Label>
              <Select
                value={form.watch('estruturaProdutoId') ?? ''}
                onValueChange={(v) => form.setValue('estruturaProdutoId', v || undefined)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {estruturas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.codigo} — {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea rows={2} {...form.register('observacoes')} />
          </div>
        </div>

        {/* Operações */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Operações ({operacoes.length})
            </h3>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAddOp((v) => !v)}>
              {showAddOp ? <ChevronUp className="h-3 w-3 mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
              {showAddOp ? 'Fechar' : 'Adicionar Operação'}
            </Button>
          </div>

          {operacoes.length > 0 && (
            <div className="border rounded-lg divide-y">
              {operacoes.map((op, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <span className="text-muted-foreground mr-2">#{op.sequencia}</span>
                    <span className="font-medium">{op.nome}</span>
                    {op.centroTrabalhoId && (
                      <span className="text-muted-foreground ml-2">
                        — {centrosTrabalho.find((c) => c.id === op.centroTrabalhoId)?.nome}
                      </span>
                    )}
                    <span className="text-muted-foreground ml-2">({op.tempoOperacao} min)</span>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removerOperacao(idx)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {showAddOp && (
            <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
              <h4 className="text-sm font-medium">Nova Operação</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome *</Label>
                  <Input
                    placeholder="Ex.: Corte, Soldagem…"
                    value={novaOp.nome ?? ''}
                    onChange={(e) => setNovaOp((p) => ({ ...p, nome: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Centro de Trabalho</Label>
                  <Select
                    value={novaOp.centroTrabalhoId ?? ''}
                    onValueChange={(v) => setNovaOp((p) => ({ ...p, centroTrabalhoId: v || undefined }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {centrosTrabalho.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.codigo} — {c.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sequência</Label>
                  <Input
                    type="number"
                    min={1}
                    value={novaOp.sequencia ?? operacoes.length + 1}
                    onChange={(e) => setNovaOp((p) => ({ ...p, sequencia: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tempo Operação (min) *</Label>
                  <Input
                    type="number"
                    min={1}
                    value={novaOp.tempoOperacao ?? ''}
                    onChange={(e) => setNovaOp((p) => ({ ...p, tempoOperacao: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tempo Preparação (min)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={novaOp.tempoPreparacao ?? 0}
                    onChange={(e) => setNovaOp((p) => ({ ...p, tempoPreparacao: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Custo/Hora (MZN)</Label>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={novaOp.custoHora ?? 0}
                    onChange={(e) => setNovaOp((p) => ({ ...p, custoHora: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Eficiência Esperada (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={novaOp.eficienciaEsperada ?? 100}
                    onChange={(e) => setNovaOp((p) => ({ ...p, eficienciaEsperada: Number(e.target.value) }))}
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox
                    checked={novaOp.paralela ?? false}
                    onCheckedChange={(v) => setNovaOp((p) => ({ ...p, paralela: Boolean(v) }))}
                  />
                  Paralela
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <Checkbox
                    checked={novaOp.obrigatoria ?? true}
                    onCheckedChange={(v) => setNovaOp((p) => ({ ...p, obrigatoria: Boolean(v) }))}
                  />
                  Obrigatória
                </label>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddOp(false)}>Cancelar</Button>
                <Button type="button" size="sm" onClick={adicionarOperacao}>
                  <Plus className="h-3 w-3 mr-1" />
                  Adicionar
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </FormPage>
    </form>
  );
}
