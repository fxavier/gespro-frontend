'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { FormSection } from '@/components/patterns';
import {
  ReprovarQualidadeOrdemSchema,
  type ReprovarQualidadeOrdemInput,
} from '@/lib/validations/producao';
import { reprovarQualidadeOrdemAction } from '@/server/actions/producao.actions';

/**
 * Motivo obrigatório da reprovação (#166). react-hook-form + zodResolver com o mesmo schema
 * da action; a action recusa também um motivo vazio, por isso o cliente é só conforto.
 */
export function ReprovarQualidadeForm({ id }: { id: string }) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();
  const detalhe = `/producao/ordens/${id}`;

  const form = useForm<ReprovarQualidadeOrdemInput>({
    resolver: zodResolver(ReprovarQualidadeOrdemSchema),
    defaultValues: { id, motivo: '' },
  });

  const onSubmit = form.handleSubmit(({ motivo }) => {
    iniciar(async () => {
      const r = await reprovarQualidadeOrdemAction({ id, motivo });
      if (!r.ok) {
        if (r.error.code === 'MOTIVO_OBRIGATORIO') {
          form.setError('motivo', { type: 'server', message: r.error.message });
        } else {
          toast.error(r.error.message ?? 'Não foi possível reprovar a qualidade.');
        }
        return;
      }
      toast.success('Qualidade reprovada. A ordem continua em produção.');
      router.push(detalhe);
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <FormSection
          title="Motivo da reprovação"
          description="Fica registado na ordem e é o que a produção lê para o retrabalho."
        >
          <FormField
            control={form.control}
            name="motivo"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Motivo</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    rows={4}
                    maxLength={1000}
                    className="resize-none"
                    placeholder="Ex.: fissura no encosto em 2 das 5 unidades"
                    aria-required="true"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        <div className="flex items-center justify-end gap-3">
          <Button variant="outline" size="sm" asChild>
            <Link href={detalhe}>Cancelar</Link>
          </Button>
          <Button type="submit" size="sm" variant="destructive" disabled={aCorrer}>
            <XCircle className="h-4 w-4 mr-1.5" aria-hidden="true" />
            {aCorrer ? 'A reprovar…' : 'Reprovar qualidade'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
