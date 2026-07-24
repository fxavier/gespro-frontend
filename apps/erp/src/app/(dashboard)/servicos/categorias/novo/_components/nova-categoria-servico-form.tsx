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
import { criarCategoriaServicoAction } from '@/server/actions/servicos.actions';

const FormSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório').max(100),
  descricao: z.string().max(500).optional(),
  icone: z.string().max(50).optional(),
  ativo: z.boolean().default(true),
  ordem: z.coerce.number().int().optional(),
});
type FormValues = z.infer<typeof FormSchema>;

export function NovaCategoriaServicoForm() {
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
    defaultValues: { nome: '', descricao: '', icone: '', ativo: true },
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const result = await criarCategoriaServicoAction({
        nome: values.nome,
        descricao: values.descricao || undefined,
        icone: values.icone || undefined,
        ativo: values.ativo,
        ordem: values.ordem,
      } as any);
      if (result?.ok) {
        toast.success('Categoria criada com sucesso.');
        router.push('/servicos/categorias');
      } else {
        toast.error((result as any)?.error?.message ?? 'Erro ao criar categoria.');
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
              {isPending ? 'A criar…' : 'Criar Categoria'}
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
