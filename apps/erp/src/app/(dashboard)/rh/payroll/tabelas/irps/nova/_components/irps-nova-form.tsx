'use client';

/**
 * Formulário de nova vigência IRPS — CLIENT COMPONENT.
 * D3: só tabela geral (numeroDependentes = 0).
 * D4: pré-preenchido com os escalões da vigência em vigor.
 * D2: taxas em % → fracção antes de chamar a action.
 * D6: parseDecimalPt — parser estrito (sem separador de milhares, sem negativos).
 *
 * Mês: <select name="mes"> não-controlado — lido via FormData no onSubmit.
 * Razão: com useFieldArray e 5 itens, a hidratação é mais lenta e o
 * selectOption do Playwright dispara antes de o React montar os handlers.
 * Um controlled <select> reporia o DOM para defaultValues ao hidratar.
 * FormData lê o valor real do DOM, ignorando o estado interno do RHF.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Save, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { criarEscaloesIRPSAction } from '@/server/actions/payroll.actions';
import { inicioDeVigencia, percentagemParaFraccao, fraccaoParaPercentagem, parseDecimalPt } from '@/lib/payroll-vigencia';

// ─── mensagem de erro padrão ──────────────────────────────────────────────────

const MSG_INVALIDO =
  'Valor inválido — use, por exemplo, 50000,50 (sem separador de milhares)';

// ─── schema do formulário ─────────────────────────────────────────────────────

// valueAsNumber:true no register entrega NaN → invalid_type_error captura "Obrigatório"
const EscalaoFormSchema = z.object({
  limiteInferior: z
    .number({ invalid_type_error: 'Obrigatório' })
    .min(0, 'Não pode ser negativo'),
  // text input para não repor 0 ao perder foco (CLAUDE.md); '' = último escalão
  // D6: parseDecimalPt — estrito, sem separador de milhares, sem negativos
  limiteSuperior: z.string().superRefine((s, ctx) => {
    const t = s.trim();
    if (!t) return; // último escalão — vazio aceite
    if (parseDecimalPt(t) === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: MSG_INVALIDO });
    }
  }),
  taxaPct: z
    .number({ invalid_type_error: 'Obrigatório' })
    .min(0, 'Não pode ser negativo')
    .max(100, 'Máximo 100 %'),
  parcelaAbater: z
    .number({ invalid_type_error: 'Obrigatório' })
    .min(0, 'Não pode ser negativo'),
});

// mes é lido do DOM via FormData no onSubmit; não entra no FormSchema.
const FormSchema = z
  .object({
    ano: z
      .number({ invalid_type_error: 'Obrigatório' })
      .int('Ano inválido')
      .min(2020, 'Mínimo 2020')
      .max(2100, 'Máximo 2100'),
    descricao: z.string().max(255, 'Máximo 255 caracteres').optional(),
    escaloes: z.array(EscalaoFormSchema).min(1),
  })
  .superRefine((data, ctx) => {
    // Valida limites por linha: igual ao refine do servidor, mas com
    // mensagens por campo para feedback imediato.
    // D6: parseDecimalPt — sem separador de milhares, sem negativos.
    data.escaloes.forEach((e, i) => {
      const isLast = i === data.escaloes.length - 1;
      const s = e.limiteSuperior.trim();
      const ls = s === '' ? null : parseDecimalPt(s); // null se vazio ou inválido
      const li = e.limiteInferior;

      if (!isLast) {
        if (s === '') {
          // Truly empty — obrigatório para linha não-última
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Obrigatório e deve ser maior que De',
            path: ['escaloes', i, 'limiteSuperior'],
          });
        } else if (ls !== null && ls <= li) {
          // Valid number but not strictly greater than limiteInferior
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Deve ser maior que De',
            path: ['escaloes', i, 'limiteSuperior'],
          });
        }
        // If s !== '' and parseDecimalPt null → field-level error covers it
      } else {
        if (ls !== null && ls <= li) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Se preenchido, deve ser maior que De',
            path: ['escaloes', i, 'limiteSuperior'],
          });
        }
      }
    });
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

export interface EscalaoInicial {
  limiteInferior: string;   // Decimal→string
  limiteSuperior: string | null;
  taxa: string;             // fracção, ex.: '0.1'
  parcelaAbater: string;
}

export interface IRPSNovaFormProps {
  escaloesIniciais: EscalaoInicial[];
  /** Mês e ano por omissão calculados no Server Component (dia civil Maputo). */
  defaultMes: number;
  defaultAno: number;
}

// ─── componente ──────────────────────────────────────────────────────────────

export function IRPSNovaForm({ escaloesIniciais, defaultMes, defaultAno }: IRPSNovaFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverFormErrors, setServerFormErrors] = useState<string[]>([]);
  // Mês não-controlado não marca isDirty — rastreia com estado local
  const [mesAlterado, setMesAlterado] = useState(false);

  const defaultEscaloes: FormValues['escaloes'] =
    escaloesIniciais.length > 0
      ? escaloesIniciais.map((e) => ({
          limiteInferior: Number(e.limiteInferior),
          limiteSuperior: e.limiteSuperior ?? '',
          taxaPct: fraccaoParaPercentagem(Number(e.taxa)),
          parcelaAbater: Number(e.parcelaAbater),
        }))
      : [{ limiteInferior: 0, limiteSuperior: '', taxaPct: 0, parcelaAbater: 0 }];

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      ano: defaultAno,
      descricao: '',
      escaloes: defaultEscaloes,
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'escaloes' });

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
    setServerFormErrors([]);
    startTransition(async () => {
      const escaloes = values.escaloes.map((e, i) => {
        // D6: trim antes do teste !== '' para tratar espaços como vazio
        const lsTrimmed = e.limiteSuperior.trim();
        return {
          ordem: i + 1,
          limiteInferior: e.limiteInferior,
          limiteSuperior: lsTrimmed !== '' ? parseDecimalPt(lsTrimmed) : null,
          taxa: percentagemParaFraccao(e.taxaPct),
          parcelaAbater: e.parcelaAbater,
          numeroDependentes: 0,
        };
      });

      const r = await criarEscaloesIRPSAction({
        vigenciaInicio: new Date(inicioDeVigencia(values.ano, mes)),
        descricao: values.descricao || undefined,
        escaloes,
      });

      if (r.ok) {
        router.push('/rh/payroll/tabelas');
      } else {
        setServerError(r.error.message);
        // Surfaça a mensagem do refine do servidor (ex.: «Escalões inválidos…»)
        const d = r.error.details as { formErrors?: string[] } | undefined;
        setServerFormErrors(d?.formErrors ?? []);
      }
    });
  }

  const hasError = serverError || serverFormErrors.length > 0;

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
        {hasError && (
          <div
            role="alert"
            className="rounded-md bg-destructive/10 p-3 text-sm text-destructive border border-destructive/20"
          >
            {serverError}
            {serverFormErrors.map((m, i) => (
              <p key={i} className="mt-1 text-xs">{m}</p>
            ))}
          </div>
        )}

        <FormSection
          title="Vigência"
          description="A nova vigência fecha automaticamente a anterior no dia anterior ao início"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

        <FormSection
          title="Escalões IRPS"
          description="Tabela geral (sem dependentes). O último escalão deve ter Até vazio."
        >
          <div className="space-y-2">
            {/* cabeçalho */}
            <div className="grid grid-cols-[1fr_1fr_1fr_1fr_2rem] gap-2 text-xs font-medium text-muted-foreground px-1">
              <span>De (MZN)</span>
              <span>Até (MZN, vazio = último)</span>
              <span>Taxa (%)</span>
              <span>Parcela a abater</span>
              <span />
            </div>

            {fields.map((field, index) => (
              <div
                key={field.id}
                data-escalao-linha
                className="grid grid-cols-[1fr_1fr_1fr_1fr_2rem] gap-2 items-start"
              >
                <div>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    aria-label={`Escalão ${index + 1} limite inferior`}
                    {...register(`escaloes.${index}.limiteInferior`, { valueAsNumber: true })}
                  />
                  {errors.escaloes?.[index]?.limiteInferior && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.escaloes[index].limiteInferior?.message}
                    </p>
                  )}
                </div>
                <div>
                  {/* type="text" inputMode="decimal" evita reset para 0 ao perder foco */}
                  <Input
                    type="text"
                    inputMode="decimal"
                    aria-label={`Escalão ${index + 1} limite superior`}
                    placeholder="—"
                    {...register(`escaloes.${index}.limiteSuperior`)}
                  />
                  {errors.escaloes?.[index]?.limiteSuperior && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.escaloes[index].limiteSuperior?.message}
                    </p>
                  )}
                </div>
                <div>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.001}
                    aria-label={`Escalão ${index + 1} taxa`}
                    {...register(`escaloes.${index}.taxaPct`, { valueAsNumber: true })}
                  />
                  {errors.escaloes?.[index]?.taxaPct && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.escaloes[index].taxaPct?.message}
                    </p>
                  )}
                </div>
                <div>
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    aria-label={`Escalão ${index + 1} parcela a abater`}
                    {...register(`escaloes.${index}.parcelaAbater`, { valueAsNumber: true })}
                  />
                  {errors.escaloes?.[index]?.parcelaAbater && (
                    <p className="text-xs text-destructive mt-1">
                      {errors.escaloes[index].parcelaAbater?.message}
                    </p>
                  )}
                </div>
                <div className="pt-1">
                  {fields.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => remove(index)}
                      aria-label={`Remover escalão ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {typeof errors.escaloes?.message === 'string' && (
              <p className="text-sm text-destructive">{errors.escaloes.message}</p>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({ limiteInferior: 0, limiteSuperior: '', taxaPct: 0, parcelaAbater: 0 })
              }
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar escalão
            </Button>
          </div>
        </FormSection>
      </FormPage>
    </form>
  );
}
