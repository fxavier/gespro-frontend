'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Ban, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { aprovarFeriasAction } from '@/server/actions/rh.actions';

// O schema da action aceita motivo opcional (serve também o APROVAR); aqui é obrigatório.
const FormSchema = z.object({
  motivoRejeicao: z.string().trim().min(1, 'Motivo de rejeição é obrigatório').max(500),
});
type FormValues = z.infer<typeof FormSchema>;

export function RejeitarFeriasForm({ solicitacaoId }: { solicitacaoId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { motivoRejeicao: '' },
  });

  const onSubmit = handleSubmit((values) => {
    startTransition(async () => {
      const r = await aprovarFeriasAction({
        solicitacaoId,
        status: 'REJEITADA',
        motivoRejeicao: values.motivoRejeicao,
      });
      if (r.ok) {
        toast.success('Pedido de férias rejeitado.');
        router.push('/rh/ferias');
      } else {
        toast.error(r.error.message);
      }
    });
  });

  return (
    <>
      <UnsavedChangesGuard isDirty={isDirty && !isPending} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="ghost" onClick={() => router.push('/rh/ferias')}>
              <X className="h-4 w-4 mr-2" />
              Cancelar
            </Button>
            <Button type="button" variant="destructive" disabled={isPending} onClick={onSubmit}>
              <Ban className="h-4 w-4 mr-2" />
              {isPending ? 'A rejeitar…' : 'Rejeitar pedido'}
            </Button>
          </>
        }
      >
        <FormSection title="Motivo" description="Fica registado no pedido de férias">
          <div className="space-y-2">
            <Label htmlFor="motivoRejeicao">Motivo da rejeição *</Label>
            <Textarea id="motivoRejeicao" rows={4} {...register('motivoRejeicao')} />
            {errors.motivoRejeicao && (
              <p className="text-sm text-destructive">{errors.motivoRejeicao.message}</p>
            )}
          </div>
        </FormSection>
      </FormPage>
    </>
  );
}
