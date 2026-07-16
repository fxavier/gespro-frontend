'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
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
import { criarAvaliacaoAction } from '@/server/actions/rh.actions';

const CriterioSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório').max(100),
  descricao: z.string().max(500).default(''),
  peso: z.coerce.number().min(0).max(100),
  nota: z.coerce.number().min(0).max(10),
  comentario: z.string().max(1000).optional(),
});

const Schema = z.object({
  colaboradorId: z.string().min(1, 'Seleccione o colaborador avaliado'),
  periodo: z.string().min(1, 'Período obrigatório').max(20),
  tipo: z.enum(['DESEMPENHO', 'COMPETENCIAS', 'TREZENTOS_SESSENTA', 'PROBATORIO']),
  dataInicio: z.string().min(1, 'Data obrigatória'),
  pontosFortes: z.string().max(1000).optional(),
  pontosDesenvolvimento: z.string().max(1000).optional(),
  planoAcao: z.string().max(1000).optional(),
  comentarios: z.string().max(2000).optional(),
});

type FormData = z.infer<typeof Schema>;
type CriterioLocal = z.infer<typeof CriterioSchema>;

interface Colaborador { id: string; nome: string; codigo: string }
interface Props { colaboradores: Colaborador[]; avaliadorId: string }

const CRITERIO_DEFAULT: Partial<CriterioLocal> = { peso: 10, nota: 5, descricao: '' };

function linesToArray(text: string | undefined): string[] {
  if (!text) return [];
  return text.split('\n').map((l) => l.trim()).filter(Boolean);
}

export default function NovaAvaliacaoForm({ colaboradores, avaliadorId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [criterios, setCriterios] = useState<CriterioLocal[]>([]);
  const [showAddCrit, setShowAddCrit] = useState(false);
  const [novoCrit, setNovoCrit] = useState<Partial<CriterioLocal>>({ ...CRITERIO_DEFAULT });

  const form = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: {
      tipo: 'DESEMPENHO',
      dataInicio: new Date().toISOString().split('T')[0],
    },
  });

  const { formState: { errors } } = form;

  function adicionarCriterio() {
    const result = CriterioSchema.safeParse(novoCrit);
    if (!result.success) {
      toast.error(result.error.errors[0]?.message ?? 'Preencha os campos obrigatórios.');
      return;
    }
    setCriterios((prev) => [...prev, result.data]);
    setNovoCrit({ ...CRITERIO_DEFAULT });
    setShowAddCrit(false);
  }

  function removerCriterio(idx: number) {
    setCriterios((prev) => prev.filter((_, i) => i !== idx));
  }

  function onSubmit(data: FormData) {
    if (criterios.length === 0) {
      toast.error('Adicione pelo menos um critério de avaliação.');
      return;
    }

    startTransition(async () => {
      const result = await criarAvaliacaoAction({
        colaboradorId: data.colaboradorId,
        avaliadorId,
        periodo: data.periodo,
        tipo: data.tipo,
        dataInicio: new Date(data.dataInicio),
        criterios,
        pontosFortes: linesToArray(data.pontosFortes),
        pontosDesenvolvimento: linesToArray(data.pontosDesenvolvimento),
        planoAcao: linesToArray(data.planoAcao),
        comentarios: data.comentarios || undefined,
      });

      if (!result.ok) {
        toast.error(result.error.message ?? 'Erro ao criar avaliação.');
        return;
      }

      toast.success('Avaliação criada com sucesso.');
      router.push('/rh/avaliacoes');
    });
  }

  const pesoTotal = criterios.reduce((sum, c) => sum + c.peso, 0);

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
    <FormPage
      actions={
        <>
          <Button type="button" variant="outline" onClick={() => router.push('/rh/avaliacoes')} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? 'A criar…' : 'Criar Avaliação'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        {/* Cabeçalho */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Identificação</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Colaborador Avaliado *</Label>
              <Select
                value={form.watch('colaboradorId') ?? ''}
                onValueChange={(v) => form.setValue('colaboradorId', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione colaborador" />
                </SelectTrigger>
                <SelectContent>
                  {colaboradores.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.codigo} — {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.colaboradorId && <p className="text-xs text-destructive">{errors.colaboradorId.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Tipo *</Label>
              <Select
                value={form.watch('tipo')}
                onValueChange={(v) => form.setValue('tipo', v as FormData['tipo'])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DESEMPENHO">Desempenho</SelectItem>
                  <SelectItem value="COMPETENCIAS">Competências</SelectItem>
                  <SelectItem value="TREZENTOS_SESSENTA">360°</SelectItem>
                  <SelectItem value="PROBATORIO">Probatório</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Período *</Label>
              <Input placeholder="Ex.: 2026-S1" {...form.register('periodo')} />
              {errors.periodo && <p className="text-xs text-destructive">{errors.periodo.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Data de Início *</Label>
              <Input type="date" {...form.register('dataInicio')} />
              {errors.dataInicio && <p className="text-xs text-destructive">{errors.dataInicio.message}</p>}
            </div>
          </div>
        </div>

        {/* Critérios */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Critérios ({criterios.length})
              {criterios.length > 0 && (
                <span className={`ml-2 text-xs ${pesoTotal === 100 ? 'text-green-600' : 'text-amber-600'}`}>
                  Peso total: {pesoTotal}%
                </span>
              )}
            </h3>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowAddCrit((v) => !v)}>
              {showAddCrit ? <ChevronUp className="h-3 w-3 mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
              {showAddCrit ? 'Fechar' : 'Adicionar Critério'}
            </Button>
          </div>

          {criterios.length > 0 && (
            <div className="border rounded-lg divide-y">
              {criterios.map((c, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 text-sm">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{c.nome}</span>
                    <span className="text-muted-foreground ml-2">Nota: {c.nota}/10</span>
                    <span className="text-muted-foreground ml-2">Peso: {c.peso}%</span>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removerCriterio(idx)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {showAddCrit && (
            <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
              <h4 className="text-sm font-medium">Novo Critério</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label>Nome *</Label>
                  <Input
                    placeholder="Ex.: Qualidade do trabalho"
                    value={novoCrit.nome ?? ''}
                    onChange={(e) => setNovoCrit((p) => ({ ...p, nome: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Descrição</Label>
                  <Textarea
                    rows={2}
                    value={novoCrit.descricao ?? ''}
                    onChange={(e) => setNovoCrit((p) => ({ ...p, descricao: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nota (0–10) *</Label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    step={0.5}
                    value={novoCrit.nota ?? 5}
                    onChange={(e) => setNovoCrit((p) => ({ ...p, nota: Number(e.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Peso (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={novoCrit.peso ?? 10}
                    onChange={(e) => setNovoCrit((p) => ({ ...p, peso: Number(e.target.value) }))}
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => setShowAddCrit(false)}>Cancelar</Button>
                <Button type="button" size="sm" onClick={adicionarCriterio}>
                  <Plus className="h-3 w-3 mr-1" />
                  Adicionar
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Síntese */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Síntese</h3>
          <p className="text-xs text-muted-foreground">Um ponto por linha.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Pontos Fortes</Label>
              <Textarea rows={3} placeholder="Um ponto forte por linha…" {...form.register('pontosFortes')} />
            </div>
            <div className="space-y-2">
              <Label>Pontos a Desenvolver</Label>
              <Textarea rows={3} placeholder="Um ponto por linha…" {...form.register('pontosDesenvolvimento')} />
            </div>
            <div className="space-y-2">
              <Label>Plano de Acção</Label>
              <Textarea rows={3} placeholder="Uma acção por linha…" {...form.register('planoAcao')} />
            </div>
            <div className="space-y-2">
              <Label>Comentários Gerais</Label>
              <Textarea rows={3} {...form.register('comentarios')} />
            </div>
          </div>
        </div>
      </div>

    </FormPage>
    </form>
  );
}
