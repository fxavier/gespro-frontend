'use client';

/**
 * Formulário de nova vigência INSS — CLIENT COMPONENT.
 * D2: taxas em % → fracção antes de chamar a action.
 * D4: pré-preenchido com os valores da vigência em vigor.
 * D6: parseDecimalPt — parser estrito (sem separador de milhares, sem negativos).
 *
 * Mês: <select name="mes"> não-controlado (sem register/Controller).
 * Lido via FormData(e.currentTarget) no onSubmit para evitar a corrida de
 * hidratação onde selectOption do Playwright dispara antes de o React montar
 * os event handlers — um controlled <select> reporia o valor ao hidratar.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { criarTabelaINSSAction } from '@/server/actions/payroll.actions';
import { inicioDeVigencia, percentagemParaFraccao, parseDecimalPt } from '@/lib/payroll-vigencia';

// ─── mensagem de erro padrão ──────────────────────────────────────────────────

const MSG_INVALIDO =
  'Valor inválido — use, por exemplo, 50000,50 (sem separador de milhares)';

// ─── schema do formulário (campos em %) ──────────────────────────────────────

// mes é lido do DOM via FormData no onSubmit; não entra no FormSchema.
// valueAsNumber:true no register entrega NaN → invalid_type_error captura "Obrigatório"
const FormSchema = z.object({
  ano: z
    .number({ invalid_type_error: 'Obrigatório' })
    .int('Ano inválido')
    .min(2020, 'Mínimo 2020')
    .max(2100, 'Máximo 2100'),
  // M2: taxas INSS > 0 — 0 % seria gravado e irrecuperável para esse mês
  taxaTrabalhadorPct: z
    .number({ invalid_type_error: 'Obrigatório' })
    .gt(0, 'Deve ser maior que zero')
    .max(100, 'Máximo 100 %'),
  taxaEntidadePct: z
    .number({ invalid_type_error: 'Obrigatório' })
    .gt(0, 'Deve ser maior que zero')
    .max(100, 'Máximo 100 %'),
  // text input (não number) para não repor 0 ao perder o foco (CLAUDE.md)
  // D6: parseDecimalPt — estrito, sem separador de milhares, sem negativos
  tetoIncidencia: z
    .string()
    .superRefine((s, ctx) => {
      const t = s.trim();
      if (!t) return; // opcional — vazio aceite
      const n = parseDecimalPt(t);
      if (n === null) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: MSG_INVALIDO });
        return;
      }
      if (n === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Deve ser maior que zero' });
      }
    })
    .optional(),
  descricao: z.string().max(255, 'Máximo 255 caracteres').optional(),
});
type FormValues = z.infer<typeof FormSchema>;

// ─── meses ────────────────────────────────────────────────────────────────────

const MESES = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
] as const;

// ─── props ────────────────────────────────────────────────────────────────────

export interface INSSNovaFormProps {
  /** Taxas da vigência em vigor, já em %. */
  taxaTrabalhadorPct: number;
  taxaEntidadePct: number;
  /** Mês e ano por omissão calculados no Server Component (dia civil Maputo). */
  defaultMes: number;
  defaultAno: number;
}

// ─── componente ──────────────────────────────────────────────────────────────

export function INSSNovaForm({
  taxaTrabalhadorPct,
  taxaEntidadePct,
  defaultMes,
  defaultAno,
}: INSSNovaFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  // Mês não-controlado não marca isDirty — rastreia com estado local
  const [mesAlterado, setMesAlterado] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      ano: defaultAno,
      taxaTrabalhadorPct,
      taxaEntidadePct,
      tetoIncidencia: '',
      descricao: '',
    },
  });

  const isDirtyOuMes = isDirty || mesAlterado;

  const handleCancel = () => {
    if (isDirtyOuMes) {
      const confirmed = window.confirm(
        'Tem alterações não guardadas. Tem a certeza que pretende sair?'
      );
      if (!confirmed) return;
    }
    router.push('/rh/payroll/tabelas');
  };

  function submeter(values: FormValues, mes: number) {
    setServerError(null);
    // D6: parseDecimalPt já rejeita negativos e não-numéricos via schema;
    // aqui converte directamente sem fallback teto > 0.
    const tetoRaw = values.tetoIncidencia?.trim();
    const teto = tetoRaw ? parseDecimalPt(tetoRaw) : undefined;
    startTransition(async () => {
      const r = await criarTabelaINSSAction({
        vigenciaInicio: new Date(inicioDeVigencia(values.ano, mes)),
        taxaTrabalhador: percentagemParaFraccao(values.taxaTrabalhadorPct),
        taxaEntidade: percentagemParaFraccao(values.taxaEntidadePct),
        tetoIncidencia: teto ?? undefined,
        descricao: values.descricao || undefined,
      });
      if (r.ok) {
        router.push('/rh/payroll/tabelas');
      } else {
        setServerError(r.error.message);
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        const mes = Number(new FormData(e.currentTarget).get('mes') ?? defaultMes);
        return handleSubmit((v) => submeter(v, mes))(e);
      }}
    >
      <UnsavedChangesGuard isDirty={isDirtyOuMes && !isPending} />
      <FormPage
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={handleCancel}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              <Save className="h-4 w-4 mr-2" />
              {isPending ? 'A guardar…' : 'Guardar vigência'}
            </Button>
          </>
        }
      >
        {serverError && (
          <div
            role="alert"
            className="rounded-md bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20"
          >
            {serverError}
          </div>
        )}

        <FormSection
          title="Nova vigência INSS"
          description="A nova vigência fecha automaticamente a anterior no dia anterior ao início"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="mes">Mês</Label>
              {/* Não controlado — FormData lê o valor DOM no submit */}
              <select
                id="mes"
                name="mes"
                defaultValue={defaultMes}
                onChange={(e) =>
                  setMesAlterado(Number(e.target.value) !== defaultMes)
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
              >
                {MESES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ano">Ano</Label>
              <Input
                id="ano"
                type="number"
                min={2020}
                max={2100}
                {...register('ano', { valueAsNumber: true })}
              />
              {errors.ano && (
                <p className="text-sm text-destructive">{errors.ano.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="taxaTrabalhadorPct">Taxa do trabalhador (%)</Label>
              <Input
                id="taxaTrabalhadorPct"
                type="number"
                min={0}
                max={100}
                step={0.001}
                {...register('taxaTrabalhadorPct', { valueAsNumber: true })}
              />
              {errors.taxaTrabalhadorPct && (
                <p className="text-sm text-destructive">
                  {errors.taxaTrabalhadorPct.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="taxaEntidadePct">Taxa da entidade (%)</Label>
              <Input
                id="taxaEntidadePct"
                type="number"
                min={0}
                max={100}
                step={0.001}
                {...register('taxaEntidadePct', { valueAsNumber: true })}
              />
              {errors.taxaEntidadePct && (
                <p className="text-sm text-destructive">
                  {errors.taxaEntidadePct.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tetoIncidencia">Teto de incidência</Label>
              {/* type="text" inputMode="decimal" evita o reset para 0 em blur (CLAUDE.md) */}
              <Input
                id="tetoIncidencia"
                type="text"
                inputMode="decimal"
                placeholder="Sem teto (opcional)"
                {...register('tetoIncidencia')}
              />
              {errors.tetoIncidencia && (
                <p className="text-sm text-destructive">
                  {errors.tetoIncidencia.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição</Label>
              <Input
                id="descricao"
                placeholder="Decreto/diploma de origem (opcional)"
                {...register('descricao')}
              />
              {errors.descricao && (
                <p className="text-sm text-destructive">{errors.descricao.message}</p>
              )}
            </div>
          </div>
        </FormSection>
      </FormPage>
    </form>
  );
}
