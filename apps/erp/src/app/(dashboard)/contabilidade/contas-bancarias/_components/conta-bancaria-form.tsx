'use client';

/**
 * Formulário de conta bancária (criar/editar) — mesmo schema Zod do servidor.
 * saldoAtual não é editável (derivado dos movimentos — Requisito 1.3).
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FormPage, FormSection, UnsavedChangesGuard, Combobox } from '@/components/patterns';
import { criarContaBancaria, atualizarContaBancaria } from '@/server/actions/contabilidade.actions';
import {
  CriarContaBancariaSchema,
  type CriarContaBancariaInput,
} from '@/lib/validations/contabilidade';

export type ContaPGCOption = { id: string; label: string };

/**
 * Omissões da BD para a configuração de reconciliação (schema `ContaBancaria`,
 * ADR-0038). Só servem para a conta nova: a edição mostra os valores actuais.
 */
const OMISSOES_RECONCILIACAO = {
  toleranciaDias: 5,
  toleranciaValor: '0.00',
  permitirMatchPorReferencia: true,
  permitirMatchPorValor: true,
  permitirMatchPorDescricao: false,
  autoReconciliacao: false,
  limiarConfianca: 90,
  permitirAgregacao: false,
  maxMovimentosAgregacao: 5,
} as const;

type CampoNumerico = 'toleranciaDias' | 'toleranciaValor' | 'limiarConfianca' | 'maxMovimentosAgregacao';
type CampoInterruptor =
  | 'permitirMatchPorReferencia'
  | 'permitirMatchPorValor'
  | 'permitirMatchPorDescricao'
  | 'autoReconciliacao'
  | 'permitirAgregacao';

const CAMPOS_NUMERICOS: { name: CampoNumerico; label: string; descricao: string; min: number; max?: number; step: string }[] = [
  {
    name: 'toleranciaDias',
    label: 'Tolerância de dias',
    descricao: 'Diferença máxima entre a data contabilística e a do extracto (0 a 60).',
    min: 0,
    max: 60,
    step: '1',
  },
  {
    name: 'toleranciaValor',
    label: 'Tolerância de valor',
    descricao: 'Diferença de valor aceite sem justificação. 0 = qualquer diferença impede o match automático.',
    min: 0,
    step: '0.01',
  },
  {
    name: 'limiarConfianca',
    label: 'Limiar de confiança',
    descricao: 'Confiança mínima (50 a 100) para a reconciliação automática.',
    min: 50,
    max: 100,
    step: '1',
  },
  {
    name: 'maxMovimentosAgregacao',
    label: 'Máximo de movimentos agregados',
    descricao: 'Número máximo de movimentos numa correspondência agregada, contando o lado do banco e o da contabilidade (3 a 20).',
    min: 2,
    max: 20,
    step: '1',
  },
];

const INTERRUPTORES: { name: CampoInterruptor; label: string; descricao: string }[] = [
  { name: 'permitirMatchPorReferencia', label: 'Correspondência por referência', descricao: 'Propor pares com a mesma referência.' },
  { name: 'permitirMatchPorValor', label: 'Correspondência por valor', descricao: 'Propor pares com o mesmo valor e datas próximas.' },
  { name: 'permitirMatchPorDescricao', label: 'Correspondência por descrição', descricao: 'Propor pares com descrições semelhantes.' },
  { name: 'autoReconciliacao', label: 'Reconciliação automática', descricao: 'Confirmar sozinhas as sugestões acima do limiar.' },
  { name: 'permitirAgregacao', label: 'Permitir agregação', descricao: 'Propor correspondências de vários movimentos para um.' },
];

const TIPOS_CONTA = [
  { value: 'CORRENTE', label: 'Corrente' },
  { value: 'POUPANCA', label: 'Poupança' },
  { value: 'DEPOSITO_PRAZO', label: 'Depósito a prazo' },
  { value: 'CARTEIRA_MOVEL', label: 'Carteira móvel (M-Pesa, e-Mola)' },
] as const;

export function ContaBancariaForm({
  contasPGC,
  contaId,
  valoresIniciais,
}: {
  contasPGC: ContaPGCOption[];
  /** Presente em modo edição. */
  contaId?: string;
  valoresIniciais?: Partial<CriarContaBancariaInput>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const form = useForm<CriarContaBancariaInput>({
    resolver: zodResolver(CriarContaBancariaSchema),
    defaultValues: {
      banco: valoresIniciais?.banco ?? '',
      agencia: valoresIniciais?.agencia ?? '',
      numeroConta: valoresIniciais?.numeroConta ?? '',
      tipoConta: valoresIniciais?.tipoConta ?? 'CORRENTE',
      moeda: valoresIniciais?.moeda ?? 'MZN',
      contaContabilId: valoresIniciais?.contaContabilId ?? '',
      toleranciaDias: valoresIniciais?.toleranciaDias ?? OMISSOES_RECONCILIACAO.toleranciaDias,
      toleranciaValor: valoresIniciais?.toleranciaValor ?? OMISSOES_RECONCILIACAO.toleranciaValor,
      permitirMatchPorReferencia:
        valoresIniciais?.permitirMatchPorReferencia ?? OMISSOES_RECONCILIACAO.permitirMatchPorReferencia,
      permitirMatchPorValor: valoresIniciais?.permitirMatchPorValor ?? OMISSOES_RECONCILIACAO.permitirMatchPorValor,
      permitirMatchPorDescricao:
        valoresIniciais?.permitirMatchPorDescricao ?? OMISSOES_RECONCILIACAO.permitirMatchPorDescricao,
      autoReconciliacao: valoresIniciais?.autoReconciliacao ?? OMISSOES_RECONCILIACAO.autoReconciliacao,
      limiarConfianca: valoresIniciais?.limiarConfianca ?? OMISSOES_RECONCILIACAO.limiarConfianca,
      permitirAgregacao: valoresIniciais?.permitirAgregacao ?? OMISSOES_RECONCILIACAO.permitirAgregacao,
      maxMovimentosAgregacao:
        valoresIniciais?.maxMovimentosAgregacao ?? OMISSOES_RECONCILIACAO.maxMovimentosAgregacao,
    },
    mode: 'onBlur',
  });

  const onSubmit = form.handleSubmit((data) => {
    startTransition(async () => {
      const res = contaId
        ? await atualizarContaBancaria({ id: contaId, ...data })
        : await criarContaBancaria(data);
      if (!res.ok) {
        const details = res.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        if (details?.fieldErrors) {
          Object.entries(details.fieldErrors).forEach(([field, messages]) => {
            form.setError(field as keyof CriarContaBancariaInput, {
              type: 'server',
              message: messages[0],
            });
          });
        } else {
          toast.error(res.error.message);
        }
        return;
      }
      toast.success(contaId ? 'Conta bancária actualizada.' : 'Conta bancária criada.');
      router.push('/contabilidade/contas-bancarias');
      router.refresh();
    });
  });

  const isDirty = form.formState.isDirty;

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={isDirty} />
      <FormPage
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => router.push('/contabilidade/contas-bancarias')}
            >
              <X className="h-4 w-4 mr-1.5" />
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-1.5" />
              {isPending ? 'A guardar…' : 'Guardar'}
            </Button>
          </>
        }
      >
        <FormSection title="Identificação" description="Dados da conta no banco">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="banco"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Banco</FormLabel>
                  <FormControl>
                    <Input placeholder="ex.: BIM, BCI, Standard Bank" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="agencia"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Agência</FormLabel>
                  <FormControl>
                    <Input placeholder="ex.: 001 — Maputo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="numeroConta"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de Conta</FormLabel>
                  <FormControl>
                    <Input className="font-mono" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tipoConta"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Conta</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TIPOS_CONTA.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="moeda"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Moeda</FormLabel>
                  <FormControl>
                    <Input maxLength={3} className="uppercase font-mono" {...field} />
                  </FormControl>
                  <FormDescription>Código ISO de 3 letras (ex.: MZN)</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormSection
          title="Ligação Contabilística"
          description="Conta folha do PGC (classe 1) onde os movimentos bancários são lançados"
        >
          <FormField
            control={form.control}
            name="contaContabilId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Conta PGC</FormLabel>
                <FormControl>
                  <Combobox
                    value={field.value || undefined}
                    onChange={field.onChange}
                    placeholder="Seleccionar conta PGC"
                    options={contasPGC.map((c) => ({ value: c.id, label: c.label }))}
                  />
                </FormControl>
                <FormDescription>
                  O saldo contabilístico da reconciliação é calculado a partir do razão desta conta.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </FormSection>

        {/* Sem `title` no FormSection: o CardTitle é uma <div>, e a secção tem de
            ser um cabeçalho navegável (leitores de ecrã, E2E da #140). */}
        <FormSection>
          <div className="space-y-1.5">
            <h2 className="text-base font-semibold leading-none tracking-tight">Reconciliação</h2>
            <p className="text-sm text-muted-foreground">
              Tolerâncias e critérios que a reconciliação automática usa nesta conta
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {CAMPOS_NUMERICOS.map((c) => (
              <FormField
                key={c.name}
                control={form.control}
                name={c.name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{c.label}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode={c.step === '1' ? 'numeric' : 'decimal'}
                        min={c.min}
                        max={c.max}
                        step={c.step}
                        className="font-mono"
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormDescription>{c.descricao}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {INTERRUPTORES.map((c) => (
              <FormField
                key={c.name}
                control={form.control}
                name={c.name}
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4 rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>{c.label}</FormLabel>
                      <FormDescription>{c.descricao}</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value ?? false} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            ))}
          </div>
        </FormSection>
      </FormPage>
    </Form>
  );
}
