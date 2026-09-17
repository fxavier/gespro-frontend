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
import { cancelarContaPagarAction } from '@/server/actions/fornecedores.actions';

// O mesmo contrato da action (id + motivo), sem o id no ecrã.
const Schema = z.object({
  motivo: z.string().min(1, 'Indique o motivo').max(500, 'Máximo 500 caracteres'),
});
type Valores = z.infer<typeof Schema>;

export function CancelarContaForm({ contaPagarId, numero }: { contaPagarId: string; numero: string }) {
  const router = useRouter();
  const detalhe = `/fornecedores/contas-pagar/${contaPagarId}`;
  const [isPending, iniciarTransicao] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<Valores>({
    resolver: zodResolver(Schema),
    defaultValues: { motivo: '' },
    mode: 'onBlur',
  });

  // A action chama-se directamente e navega-se logo a seguir — e não por
  // `useActionState` + efeito: a action revalida a rota, esta página volta a
  // renderizar já com a conta cancelada (ramo «já está cancelada»), o
  // formulário é desmontado e um efeito sobre o `state` nunca chegava a correr.
  const onSubmit = handleSubmit((valores) => {
    iniciarTransicao(async () => {
      const res = await cancelarContaPagarAction({ id: contaPagarId, motivo: valores.motivo });
      if (!res.ok) {
        toast.error(res.error.message ?? 'Não foi possível cancelar a conta.');
        return;
      }
      toast.success(`Conta ${numero} cancelada.`);
      router.push(detalhe);
    });
  });

  return (
    <form onSubmit={onSubmit}>
      <UnsavedChangesGuard isDirty={isDirty && !isPending} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => router.push(detalhe)}>
              <X className="mr-2 h-4 w-4" /> Voltar
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending}>
              <Ban className="mr-2 h-4 w-4" /> {isPending ? 'A cancelar…' : 'Cancelar conta'}
            </Button>
          </>
        }
      >
        <FormSection title="Motivo do cancelamento">
          <div className="space-y-2">
            <Label htmlFor="motivo">Motivo *</Label>
            <Textarea
              id="motivo"
              rows={4}
              placeholder="Ex.: factura emitida em duplicado pelo fornecedor"
              aria-invalid={errors.motivo ? true : undefined}
              {...register('motivo')}
            />
            {errors.motivo && <p className="text-sm text-destructive">{errors.motivo.message}</p>}
          </div>
        </FormSection>
      </FormPage>
    </form>
  );
}
