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
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { criarArtigoBaseConhecimentoAction } from '@/server/actions/tickets.actions';

const FormSchema = z.object({
  titulo: z.string().min(3, 'Título deve ter pelo menos 3 caracteres').max(300),
  conteudo: z.string().min(10, 'Conteúdo obrigatório (mínimo 10 caracteres)'),
  resumo: z.string().max(500).optional(),
  categoria: z.string().min(1, 'Categoria obrigatória').max(100),
  tags: z.string().optional(),
});
type FormValues = z.infer<typeof FormSchema>;

export function NovoArtigoBaseConhecimentoForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { titulo: '', conteudo: '', resumo: '', categoria: '', tags: '' },
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const tags = (values.tags ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      const result = await criarArtigoBaseConhecimentoAction({
        titulo: values.titulo,
        conteudo: values.conteudo,
        resumo: values.resumo || undefined,
        categoria: values.categoria,
        tags,
      } as never);
      if (result?.ok) {
        toast.success('Artigo criado com sucesso.');
        router.push('/tickets/base-conhecimento');
      } else {
        toast.error(result?.error?.message ?? 'Erro ao criar artigo.');
      }
    });
  });

  return (
    <>
      <UnsavedChangesGuard isDirty={isDirty} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="ghost" onClick={() => router.push('/tickets/base-conhecimento')}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button type="button" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-2" />
              {isPending ? 'A criar…' : 'Criar Artigo'}
            </Button>
          </>
        }
      >
        <FormSection title="Artigo" description="Conteúdo do artigo da base de conhecimento">
          <div className="space-y-2">
            <Label htmlFor="titulo">Título *</Label>
            <Input id="titulo" {...register('titulo')} placeholder="Ex.: Como redefinir a palavra-passe" />
            {errors.titulo && <p className="text-sm text-destructive">{errors.titulo.message}</p>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="categoria">Categoria *</Label>
              <Input id="categoria" {...register('categoria')} placeholder="Ex.: Conta e Acesso" />
              {errors.categoria && <p className="text-sm text-destructive">{errors.categoria.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="tags">Tags</Label>
              <Input id="tags" {...register('tags')} placeholder="Separadas por vírgula (opcional)" />
              <p className="text-xs text-muted-foreground">Ex.: palavra-passe, login, segurança</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="resumo">Resumo</Label>
            <Textarea id="resumo" {...register('resumo')} placeholder="Resumo breve (opcional)" rows={2} />
            {errors.resumo && <p className="text-sm text-destructive">{errors.resumo.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="conteudo">Conteúdo *</Label>
            <Textarea
              id="conteudo"
              {...register('conteudo')}
              placeholder="Escreva o conteúdo do artigo…"
              rows={12}
            />
            {errors.conteudo && <p className="text-sm text-destructive">{errors.conteudo.message}</p>}
          </div>
        </FormSection>
      </FormPage>
    </>
  );
}
