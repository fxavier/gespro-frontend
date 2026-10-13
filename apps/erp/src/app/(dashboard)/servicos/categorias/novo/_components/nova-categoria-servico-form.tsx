'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import {
  criarCategoriaServicoAction,
  actualizarCategoriaServicoAction,
} from '@/server/actions/servicos.actions';
import type { CategoriaServicoDto } from '@/server/services/compras/servico.service.interface';

const FormSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório').max(100),
  descricao: z.string().max(500).optional(),
  icone: z.string().max(50).optional(),
  ativo: z.boolean().default(true),
  ordem: z.coerce.number().int().optional(),
});
type FormValues = z.infer<typeof FormSchema>;

interface Props {
  /** Em edição: a categoria a alterar. Omisso → criação. */
  categoria?: CategoriaServicoDto;
}

export function NovaCategoriaServicoForm({ categoria }: Props = {}) {
  const emEdicao = categoria !== undefined;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: categoria
      ? {
          nome: categoria.nome,
          descricao: categoria.descricao ?? '',
          icone: categoria.icone ?? '',
          ativo: categoria.ativo,
          ordem: categoria.ordem ?? undefined,
        }
      : { nome: '', descricao: '', icone: '', ativo: true },
  });

  const onSubmit = handleSubmit((values) => {
    const dados = {
      nome: values.nome,
      descricao: values.descricao || undefined,
      icone: values.icone || undefined,
      ativo: values.ativo,
      ordem: values.ordem,
    };
    startTransition(async () => {
      const result = categoria
        ? await actualizarCategoriaServicoAction({ id: categoria.id, dados: { ...dados, cor: categoria.cor } })
        : await criarCategoriaServicoAction(dados as any);
      if (result?.ok) {
        toast.success(emEdicao ? 'Categoria actualizada com sucesso.' : 'Categoria criada com sucesso.');
        router.push('/servicos/categorias');
      } else {
        toast.error(
          (result as any)?.error?.message ?? (emEdicao ? 'Erro ao actualizar categoria.' : 'Erro ao criar categoria.'),
        );
      }
    });
  });

  return (
    <>
      <UnsavedChangesGuard isDirty={isDirty} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="ghost" onClick={() => router.push('/servicos/categorias')}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button type="button" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-2" />
              {emEdicao
                ? isPending
                  ? 'A guardar…'
                  : 'Guardar Categoria'
                : isPending
                  ? 'A criar…'
                  : 'Criar Categoria'}
            </Button>
          </>
        }
      >
        <FormSection title="Categoria" description="Identificação da categoria de serviço">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome *</Label>
            <Input id="nome" {...register('nome')} placeholder="Ex.: Manutenção" />
            {errors.nome && <p className="text-sm text-destructive">{errors.nome.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea id="descricao" {...register('descricao')} placeholder="Descrição (opcional)" rows={3} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ordem">Ordem</Label>
              <Input id="ordem" type="number" {...register('ordem')} placeholder="Ordem de apresentação" />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch id="ativo" checked={watch('ativo')} onCheckedChange={(v) => setValue('ativo', v)} />
              <Label htmlFor="ativo">Ativa</Label>
            </div>
          </div>
        </FormSection>
      </FormPage>
    </>
  );
}
