'use client';

/**
 * Formulário de calendário contabilístico.
 *
 * Padrão: react-hook-form + zodResolver com o MESMO schema do servidor
 * (CalendarioContabilisticoSchema). Submit via useTransition para que o
 * redirect() potencial do servidor seja aplicado (CLAUDE.md, «Server Action
 * que redirecciona, chamada pelo handleSubmit»).
 *
 * Nota sobre fechoPeriodoAutomatico: o campo é mostrado mas desactivado.
 * O apuramento do IVA (ADR-0034) está implementado e é pré-condição de fecho.
 * O que ainda não existe é o cron que executaria o fecho automático —
 * a preferência fica guardada e será activada quando o agendador for configurado.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { CalendarioContabilisticoSchema } from '@/lib/validations/plataforma';
import type { CalendarioContabilisticoInput } from '@/lib/validations/plataforma';
import { atualizarCalendarioContabilistico } from '@/server/actions/contabilidade.actions';

// Espelha CalendarioContabilisticoRow do serviço (campos com valores por omissão)
interface InitialData {
  aberturaExercicioAutomatica: boolean;
  diaAberturaExercicio: number;
  mesAberturaExercicio: number;
  fechoPeriodoAutomatico: boolean;
  diasAposFimDoMesParaFechoAutomatico: number;
}

const NOMES_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function CalendarioForm({ initialData }: { initialData: InitialData }) {
  const router = useRouter();
  const [aCorrer, iniciarTransicao] = useTransition();

  const form = useForm<CalendarioContabilisticoInput>({
    resolver: zodResolver(CalendarioContabilisticoSchema),
    defaultValues: {
      aberturaExercicioAutomatica: initialData.aberturaExercicioAutomatica,
      diaAberturaExercicio: initialData.diaAberturaExercicio,
      mesAberturaExercicio: initialData.mesAberturaExercicio,
      fechoPeriodoAutomatico: initialData.fechoPeriodoAutomatico,
      diasAposFimDoMesParaFechoAutomatico: initialData.diasAposFimDoMesParaFechoAutomatico,
    },
    mode: 'onBlur',
  });

  const aberturaAutomatica = form.watch('aberturaExercicioAutomatica');
  // A descrição tem de seguir os campos: um texto fixo a dizer «1 de Dezembro»
  // com o campo logo abaixo a marcar outra data faz o ecrã contradizer-se.
  const diaEscolhido = form.watch('diaAberturaExercicio') ?? 1;
  const mesEscolhido = form.watch('mesAberturaExercicio') ?? 12;

  const onSubmit = form.handleSubmit((valores) => {
    iniciarTransicao(async () => {
      const res = await atualizarCalendarioContabilistico(valores);

      if (!res.ok) {
        const details = res.error.details as
          | { fieldErrors?: Record<string, string[]> }
          | undefined;
        if (details?.fieldErrors) {
          Object.entries(details.fieldErrors).forEach(([campo, erros]) => {
            form.setError(campo as keyof CalendarioContabilisticoInput, {
              type: 'server',
              message: erros[0],
            });
          });
        } else {
          toast.error(res.error.message ?? 'Não foi possível guardar as configurações.');
        }
        return;
      }

      toast.success('Configurações guardadas com sucesso.');
      router.refresh();
    });
  });

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty} />

      <FormPage
        actions={
          <Button
            type="submit"
            size="sm"
            disabled={aCorrer}
            onClick={onSubmit}
          >
            <Save className="h-4 w-4 mr-1.5" />
            {aCorrer ? 'A guardar…' : 'Guardar configurações'}
          </Button>
        }
      >
        {/* ── Abertura automática do exercício ── */}
        <FormSection
          title="Calendário contabilístico"
          description="Configuração do ciclo de abertura e fecho do exercício contabilístico"
        >
          <FormField
            control={form.control}
            name="aberturaExercicioAutomatica"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between max-w-lg">
                <div className="space-y-0.5">
                  <FormLabel>Abertura automática do exercício</FormLabel>
                  <FormDescription>
                    Abre o exercício do ano seguinte automaticamente a{' '}
                    {diaEscolhido} de {NOMES_MESES[mesEscolhido - 1] ?? 'Dezembro'}{' '}
                    (cron diário). Pode sempre abrir manualmente em Exercícios.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value ?? true}
                    onCheckedChange={field.onChange}
                    aria-label="Abertura automática do exercício"
                  />
                </FormControl>
              </FormItem>
            )}
          />

          {aberturaAutomatica && (
            <div className="grid grid-cols-2 gap-4 max-w-sm mt-4">
              <FormField
                control={form.control}
                name="diaAberturaExercicio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dia</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={28}
                        {...field}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormDescription>
                      1–28. Limite imposto pelo Fevereiro: um dia 29–31 nunca
                      dispararia nesse mês.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mesAberturaExercicio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mês</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={12}
                        {...field}
                        onChange={(e) => field.onChange(e.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormDescription>
                      {field.value !== undefined && field.value >= 1 && field.value <= 12
                        ? NOMES_MESES[field.value - 1]
                        : '1–12'}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          )}
        </FormSection>

        {/* ── Fecho automático de períodos ── */}
        <FormSection
          title="Fecho automático de períodos"
          description="Configuração do fecho mensal automático após o fim do período"
        >
          <div className="rounded-lg border border-muted bg-muted/20 p-4 text-sm mb-4">
            <p className="font-medium text-foreground">
              Fecho automático ainda sem agendador
            </p>
            <p className="mt-1 text-muted-foreground">
              A pré-condição de apuramento do IVA (ADR-0034) já existe e está
              implementada — o que ainda não existe é o processo agendado (cron)
              que executaria o fecho automático. A preferência fica guardada e
              será activada quando o agendador for configurado (ver
              docs/runbooks/agendador.md).
            </p>
          </div>

          <FormField
            control={form.control}
            name="fechoPeriodoAutomatico"
            render={({ field }) => (
              <FormItem className="flex flex-row items-center justify-between max-w-lg">
                <div className="space-y-0.5">
                  <FormLabel>Fecho automático de períodos</FormLabel>
                  <FormDescription>
                    Fecha os períodos mensais automaticamente após os dias configurados.
                    Inactivo até o agendador automático estar configurado.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value ?? false}
                    onCheckedChange={field.onChange}
                    disabled
                    aria-label="Fecho automático de períodos (indisponível)"
                  />
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="diasAposFimDoMesParaFechoAutomatico"
            render={({ field }) => (
              <FormItem className="max-w-xs mt-4">
                <FormLabel>Dias após o fim do mês</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    max={60}
                    disabled
                    {...field}
                    onChange={(e) => field.onChange(e.target.valueAsNumber)}
                  />
                </FormControl>
                <FormDescription>
                  0–60 dias. Zero significa que o período fecha no próprio último dia do
                  mês; 60 cobre os prazos mais longos do PGC-NIRF.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>
      </FormPage>
    </Form>
  );
}
