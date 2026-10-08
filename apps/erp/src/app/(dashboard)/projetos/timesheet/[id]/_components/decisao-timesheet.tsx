'use client';

/**
 * Aprovar ou rejeitar um registo de tempo por aprovar (#167). Rejeitar recolhe o motivo, logo
 * é formulário na própria página (regra sem modais), com o schema de
 * `RejeitarTimesheetSchema`. As duas acções mudam o ramo que a página desenha: chama-se a
 * action dentro de `startTransition` e refresca-se de imediato.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Ban, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormSection } from '@/components/patterns';
import { RejeitarTimesheetSchema } from '@/lib/validations/projetos';
import { aprovarTimesheetAction, rejeitarTimesheetAction } from '@/server/actions/projetos.actions';

const FormSchema = RejeitarTimesheetSchema.pick({ motivoRejeicao: true });
type FormValues = { motivoRejeicao: string };

export function DecisaoTimesheet({ id }: { id: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: { motivoRejeicao: '' },
  });

  function aprovar() {
    startTransition(async () => {
      const r = await aprovarTimesheetAction({ id });
      if (r.ok) {
        toast.success('Registo aprovado.');
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  }

  const rejeitar = handleSubmit((values) => {
    startTransition(async () => {
      const r = await rejeitarTimesheetAction({ id, motivoRejeicao: values.motivoRejeicao });
      if (r.ok) {
        toast.success('Registo rejeitado.');
        router.refresh();
      } else {
        toast.error(r.error.message);
      }
    });
  });

  return (
    <div className="space-y-4">
      <FormSection title="Aprovar" description="As horas aprovadas somam-se à tarefa associada">
        <Button type="button" disabled={isPending} onClick={aprovar}>
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Aprovar
        </Button>
      </FormSection>
      <FormSection title="Rejeitar" description="A rejeição é definitiva e fica registada com o motivo">
        <div className="space-y-2">
          <Label htmlFor="motivoRejeicao">Motivo da rejeição *</Label>
          <Textarea id="motivoRejeicao" rows={3} aria-invalid={!!errors.motivoRejeicao} {...register('motivoRejeicao')} />
          {errors.motivoRejeicao && <p className="text-sm text-destructive">{errors.motivoRejeicao.message}</p>}
        </div>
        <Button type="button" variant="destructive" disabled={isPending} onClick={rejeitar}>
          <Ban className="h-4 w-4 mr-2" />
          Rejeitar
        </Button>
      </FormSection>
    </div>
  );
}
