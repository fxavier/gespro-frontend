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
import { criarCategoriaTicketAction } from '@/server/actions/tickets.actions';

const FormSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório').max(100),
  descricao: z.string().max(500).optional(),
  icone: z.string().max(50).optional(),
  cor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve ser hex válido (ex: #3b82f6)')
    .optional()
    .or(z.literal('')),
  subcategorias: z.string().optional(),
  slaTempoResposta: z.coerce.number().int().positive('Tempo de resposta deve ser positivo'),
  slaTempoResolucao: z.coerce.number().int().positive('Tempo de resolução deve ser positivo'),
});
type FormValues = z.infer<typeof FormSchema>;

export function NovaCategoriaTicketForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { nome: '', descricao: '', icone: '', cor: '', subcategorias: '' },
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const subcategorias = (values.subcategorias ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const result = await criarCategoriaTicketAction({
        nome: values.nome,
        descricao: values.descricao || undefined,
        icone: values.icone || undefined,
        cor: values.cor || undefined,
        subcategorias,
        slaTempoResposta: Number(values.slaTempoResposta),
        slaTempoResolucao: Number(values.slaTempoResolucao),
      } as never);
      if (result?.ok) {
        toast.success('Categoria criada com sucesso.');
        router.push('/tickets/categorias');
      } else {
        toast.error(result?.error?.message ?? 'Erro ao criar categoria.');
      }
    });
  });

  return (
    <>
      <UnsavedChangesGuard isDirty={isDirty} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="ghost" onClick={() => router.push('/tickets/categorias')}>
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
        <FormSection title="Categoria" description="Identificação da categoria de suporte">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome *</Label>
            <Input id="nome" {...register('nome')} placeholder="Ex.: Suporte Técnico" />
            {errors.nome && <p className="text-sm text-destructive">{errors.nome.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea id="descricao" {...register('descricao')} placeholder="Descrição (opcional)" rows={3} />
            {errors.descricao && <p className="text-sm text-destructive">{errors.descricao.message}</p>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="icone">Ícone</Label>
              <Input id="icone" {...register('icone')} placeholder="Nome do ícone (opcional)" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cor">Cor</Label>
              <Input id="cor" {...register('cor')} placeholder="#3b82f6" />
              {errors.cor && <p className="text-sm text-destructive">{errors.cor.message}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="subcategorias">Subcategorias</Label>
            <Input
              id="subcategorias"
              {...register('subcategorias')}
              placeholder="Separadas por vírgula (opcional)"
            />
            <p className="text-xs text-muted-foreground">Ex.: Hardware, Software, Rede</p>
          </div>
        </FormSection>

        <FormSection title="SLA" description="Tempos de resposta e resolução (em minutos)">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="slaTempoResposta">Tempo de Resposta *</Label>
              <Input
                id="slaTempoResposta"
                type="number"
                min="1"
                {...register('slaTempoResposta')}
                placeholder="Ex.: 60"
              />
              {errors.slaTempoResposta && (
                <p className="text-sm text-destructive">{errors.slaTempoResposta.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="slaTempoResolucao">Tempo de Resolução *</Label>
              <Input
                id="slaTempoResolucao"
                type="number"
                min="1"
                {...register('slaTempoResolucao')}
                placeholder="Ex.: 480"
              />
              {errors.slaTempoResolucao && (
                <p className="text-sm text-destructive">{errors.slaTempoResolucao.message}</p>
              )}
            </div>
          </div>
        </FormSection>
      </FormPage>
    </>
  );
}
