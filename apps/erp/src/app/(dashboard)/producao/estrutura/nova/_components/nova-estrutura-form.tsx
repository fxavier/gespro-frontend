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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FormPage } from '@/components/patterns';
import { criarEstruturaProdutoAction } from '@/server/actions/producao.actions';

const ComponenteSchema = z.object({
  componenteProdutoId: z.string().min(1, 'ID obrigatório'),
  codigoComponente: z.string().min(1).max(50),
  nomeComponente: z.string().min(1).max(200),
  categoria: z.enum(['MATERIA_PRIMA', 'COMPONENTE', 'SUBCONJUNTO', 'PRODUTO_ACABADO']),
  quantidade: z.coerce.number().positive('Quantidade deve ser positiva'),
  unidadeMedida: z.string().min(1).max(20),
  custoUnitario: z.coerce.number().nonnegative(),
  perdaPrevista: z.coerce.number().min(0).max(100).default(0),
});

const Schema = z.object({
  produtoId: z.string().min(1, 'ID do produto obrigatório'),
  codigo: z.string().min(1).max(30),
  nome: z.string().min(1).max(200),
  versao: z.string().min(1).max(20),
  unidadeProducao: z.string().min(1).max(20),
  nivelComplexidade: z.enum(['BAIXO', 'MEDIO', 'ALTO']).optional(),
  observacoes: z.string().max(1000).optional(),
});

type FormData = z.infer<typeof Schema>;
type ComponenteLocal = z.infer<typeof ComponenteSchema>;

const COMP_DEFAULT: Partial<ComponenteLocal> = {
  categoria: 'MATERIA_PRIMA' as const,
  custoUnitario: 0,
  perdaPrevista: 0,
  unidadeMedida: 'UN',
};

export default function NovaEstruturaForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [componentes, setComponentes] = useState<ComponenteLocal[]>([]);
  const [showAddComp, setShowAddComp] = useState(false);
  const [novoComp, setNovoComp] = useState<Partial<ComponenteLocal>>({ ...COMP_DEFAULT });
  const [deleteIdx, setDeleteIdx] = useState<number | null>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(Schema),
    defaultValues: { versao: '1.0', unidadeProducao: 'UN' },
  });

  const { formState: { errors } } = form;

  function adicionarComponente() {
    const result = ComponenteSchema.safeParse({
      ...novoComp,
      perdaPrevista: Number(novoComp.perdaPrevista ?? 0),
    });
    if (!result.success) {
      toast.error(result.error.errors[0]?.message ?? 'Preencha os campos obrigatórios.');
      return;
    }
    setComponentes((prev) => [...prev, result.data]);
    setNovoComp({ ...COMP_DEFAULT });
    setShowAddComp(false);
  }

  function confirmarRemocao() {
    if (deleteIdx === null) return;
    setComponentes((prev) => prev.filter((_, i) => i !== deleteIdx));
    setDeleteIdx(null);
  }

  function onSubmit(data: FormData) {
    startTransition(async () => {
      const result = await criarEstruturaProdutoAction({
        produtoId: data.produtoId,
        codigo: data.codigo,
        nome: data.nome,
        versao: data.versao,
        unidadeProducao: data.unidadeProducao,
        nivelComplexidade: data.nivelComplexidade,
        observacoes: data.observacoes || undefined,
        componentes: componentes.map((c) => ({
          componenteProdutoId: c.componenteProdutoId,
          codigoComponente: c.codigoComponente,
          nomeComponente: c.nomeComponente,
          categoria: c.categoria,
          quantidade: c.quantidade,
          unidadeMedida: c.unidadeMedida,
          custoUnitario: c.custoUnitario,
          perdaPrevista: c.perdaPrevista / 100,
        })),
      });

      if (!result.ok) {
        toast.error(result.error.message ?? 'Erro ao criar estrutura.');
        return;
      }

      toast.success('Estrutura de produto criada com sucesso.');
      router.push('/producao/estrutura');
    });
  }

  return (
    <>
      <form onSubmit={form.handleSubmit(onSubmit)}>
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => router.push('/producao/estrutura')} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'A criar…' : 'Criar Estrutura'}
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Identificação</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>ID do Produto *</Label>
                <Input placeholder="ID do produto" {...form.register('produtoId')} />
                {errors.produtoId && <p className="text-xs text-destructive">{errors.produtoId.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Código *</Label>
                <Input placeholder="BOM-001" {...form.register('codigo')} />
                {errors.codigo && <p className="text-xs text-destructive">{errors.codigo.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input placeholder="Nome da estrutura" {...form.register('nome')} />
                {errors.nome && <p className="text-xs text-destructive">{errors.nome.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Versão *</Label>
                <Input placeholder="1.0" {...form.register('versao')} />
              </div>
              <div className="space-y-2">
                <Label>Unidade de Produção *</Label>
                <Input placeholder="UN" {...form.register('unidadeProducao')} />
              </div>
              <div className="space-y-2">
                <Label>Complexidade</Label>
                <Select
                  value={form.watch('nivelComplexidade') ?? ''}
                  onValueChange={(v) => form.setValue('nivelComplexidade', (v as FormData['nivelComplexidade']) || undefined)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BAIXO">Baixo</SelectItem>
                    <SelectItem value="MEDIO">Médio</SelectItem>
                    <SelectItem value="ALTO">Alto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea rows={2} {...form.register('observacoes')} />
            </div>
          </div>

          {/* Componentes BOM */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Componentes ({componentes.length})
              </h3>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowAddComp((v) => !v)}>
                {showAddComp ? <ChevronUp className="h-3 w-3 mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                {showAddComp ? 'Fechar' : 'Adicionar Componente'}
              </Button>
            </div>

            {componentes.length > 0 && (
              <div className="border rounded-lg divide-y">
                {componentes.map((c, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 text-sm">
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{c.nomeComponente}</span>
                      <span className="text-muted-foreground ml-2">({c.codigoComponente})</span>
                      <span className="text-muted-foreground ml-2">× {c.quantidade} {c.unidadeMedida}</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteIdx(idx)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {showAddComp && (
              <div className="border rounded-lg p-4 space-y-4 bg-muted/20">
                <h4 className="text-sm font-medium">Novo Componente</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>ID do Componente *</Label>
                    <Input
                      placeholder="ID do produto/componente"
                      value={novoComp.componenteProdutoId ?? ''}
                      onChange={(e) => setNovoComp((p) => ({ ...p, componenteProdutoId: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Código *</Label>
                    <Input
                      placeholder="COMP-001"
                      value={novoComp.codigoComponente ?? ''}
                      onChange={(e) => setNovoComp((p) => ({ ...p, codigoComponente: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Nome *</Label>
                    <Input
                      placeholder="Nome do componente"
                      value={novoComp.nomeComponente ?? ''}
                      onChange={(e) => setNovoComp((p) => ({ ...p, nomeComponente: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Select
                      value={novoComp.categoria ?? 'MATERIA_PRIMA'}
                      onValueChange={(v) => setNovoComp((p) => ({ ...p, categoria: v as 'MATERIA_PRIMA' | 'COMPONENTE' | 'SUBCONJUNTO' | 'PRODUTO_ACABADO' }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MATERIA_PRIMA">Matéria-Prima</SelectItem>
                        <SelectItem value="COMPONENTE">Componente</SelectItem>
                        <SelectItem value="SUBCONJUNTO">Subconjunto</SelectItem>
                        <SelectItem value="PRODUTO_ACABADO">Produto Acabado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Unidade</Label>
                    <Input
                      placeholder="UN"
                      value={novoComp.unidadeMedida ?? 'UN'}
                      onChange={(e) => setNovoComp((p) => ({ ...p, unidadeMedida: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Quantidade *</Label>
                    <Input
                      type="number"
                      min={0.001}
                      step={0.001}
                      value={novoComp.quantidade ?? ''}
                      onChange={(e) => setNovoComp((p) => ({ ...p, quantidade: Number(e.target.value) }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Custo Unitário (MZN)</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={novoComp.custoUnitario ?? 0}
                      onChange={(e) => setNovoComp((p) => ({ ...p, custoUnitario: Number(e.target.value) }))}
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowAddComp(false)}>Cancelar</Button>
                  <Button type="button" size="sm" onClick={adicionarComponente}>
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

      {/* AlertDialog para confirmação de remoção (destrutivo) */}
      <AlertDialog open={deleteIdx !== null} onOpenChange={(open) => { if (!open) setDeleteIdx(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover componente?</AlertDialogTitle>
            <AlertDialogDescription>
              O componente será removido da lista. Esta acção não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarRemocao} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
