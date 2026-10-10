'use client';

/**
 * Formulário de benefício (criar e editar, #162) — CLIENT COMPONENT.
 * react-hook-form + zodResolver; submete pela Server Action dentro de `startTransition`.
 * Editar só mexe no catálogo: as atribuições já feitas guardam os seus próprios valores.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { criarBeneficioAction, actualizarBeneficioAction } from '@/server/actions/beneficios.actions';
import { Button } from '@/components/ui/button';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import {
  BeneficioSchema,
  PeriodicidadeBeneficioEnum,
  TipoBeneficioEnum,
} from '@/lib/validations/beneficios';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const TIPOS = [
  ['SEGURO_SAUDE', 'Seguro de Saúde'],
  ['SEGURO_VIDA', 'Seguro de Vida'],
  ['SUBSIDIO_ALIMENTACAO', 'Subsídio Alimentação'],
  ['SUBSIDIO_TRANSPORTE', 'Subsídio Transporte'],
  ['SUBSIDIO_HABITACAO', 'Subsídio Habitação'],
  ['SUBSIDIO_COMUNICACOES', 'Subsídio Comunicações'],
  ['PLANO_PENSOES', 'Plano de Pensões'],
  ['OUTRO', 'Outro'],
] as const;

const PERIODICIDADES = [
  ['MENSAL', 'Mensal'],
  ['TRIMESTRAL', 'Trimestral'],
  ['ANUAL', 'Anual'],
  ['PONTUAL', 'Pontual'],
] as const;

const TRIBUTAVEL = [
  ['false', 'Não tributável'],
  ['true', 'Tributável (integra base IRPS)'],
] as const;

const rotulo = (opcoes: readonly (readonly [string, string])[], v: string | undefined) =>
  opcoes.find(([valor]) => valor === v)?.[1];

// O schema do servidor (`BeneficioSchema`), com o que o HTML não dá como o servidor quer: os enums
// com mensagem de «obrigatório» em PT e `tributavel` como string (valor de um <Select>).
const FormSchema = BeneficioSchema.pick({
  nome: true,
  descricao: true,
  fornecedor: true,
  custoTotal: true,
  comparticipacaoEmpresa: true,
  descontoColaborador: true,
}).extend({
  tipo: z.enum(TipoBeneficioEnum.options, { required_error: 'Tipo é obrigatório' }),
  periodicidade: z.enum(PeriodicidadeBeneficioEnum.options, {
    required_error: 'Periodicidade é obrigatória',
  }),
  tributavel: z.enum(['true', 'false']).default('false'),
});

export type BeneficioFormValues = z.infer<typeof FormSchema>;

interface BeneficioFormProps {
  /** Presente ⇒ edição do benefício com este id; ausente ⇒ criação. */
  beneficioId?: string;
  defaultValues?: Partial<BeneficioFormValues>;
}

export function BeneficioForm({ beneficioId, defaultValues }: BeneficioFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const destinoCancelar = beneficioId ? `/rh/beneficios/${beneficioId}` : '/rh/beneficios';

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    reset,
    getValues,
    control,
    formState: { errors, isDirty },
  } = useForm<BeneficioFormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      custoTotal: '0',
      comparticipacaoEmpresa: '0',
      descontoColaborador: '0',
      tributavel: 'false',
      ...defaultValues,
    },
  });

  const tipo = useWatch({ control, name: 'tipo' });
  const periodicidade = useWatch({ control, name: 'periodicidade' });
  const tributavel = useWatch({ control, name: 'tributavel' });

  /** Erros de validação do servidor nos campos (como o molde); o que não for de um campo vai a toast. */
  const mostrarErro = (error: { message: string; details?: unknown }) => {
    const fieldErrors = (error.details as { fieldErrors?: Record<string, string[]> } | undefined)
      ?.fieldErrors;
    let marcados = 0;
    for (const [campo, mensagens] of Object.entries(fieldErrors ?? {})) {
      if (!(campo in FormSchema.shape) || !mensagens?.[0]) continue;
      setError(campo as keyof BeneficioFormValues, { type: 'server', message: mensagens[0] });
      marcados += 1;
    }
    if (marcados === 0) toast.error(error.message);
  };

  /** Desarma o guard (o form deixa de estar «sujo») antes de sair da página. */
  const sair = (destino: string) => {
    reset(getValues());
    router.push(destino);
  };

  const cancelar = () => {
    if (isDirty && !window.confirm('Tem alterações não guardadas. Tem a certeza que pretende sair?')) {
      return;
    }
    router.push(destinoCancelar);
  };

  const submeter = async (values: BeneficioFormValues) => {
    const dados = {
      nome: values.nome,
      tipo: values.tipo,
      descricao: values.descricao || undefined,
      fornecedor: values.fornecedor || undefined,
      custoTotal: values.custoTotal,
      comparticipacaoEmpresa: values.comparticipacaoEmpresa,
      descontoColaborador: values.descontoColaborador,
      periodicidade: values.periodicidade,
      tributavel: values.tributavel === 'true',
    };

    if (beneficioId) {
      // Na edição, um campo de texto esvaziado grava-se vazio (não «fica como estava»).
      const result = await actualizarBeneficioAction({
        id: beneficioId,
        data: { ...dados, descricao: values.descricao ?? '', fornecedor: values.fornecedor ?? '' },
      });
      if (!result.ok) {
        mostrarErro(result.error);
        return;
      }
      toast.success('Benefício actualizado com sucesso');
      sair(`/rh/beneficios/${beneficioId}`);
      return;
    }

    const result = await criarBeneficioAction({
      ...dados,
      ativo: true,
      departamentosElegiveis: [],
      cargosElegiveis: [],
    });
    if (!result.ok) {
      mostrarErro(result.error);
      return;
    }
    toast.success('Benefício criado com sucesso');
    sair(`/rh/beneficios/${result.data.id}`);
  };

  const onSubmit = handleSubmit((values) => {
    startTransition(() => submeter(values));
  });

  return (
    <form onSubmit={onSubmit}>
      <UnsavedChangesGuard isDirty={isDirty} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" onClick={cancelar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'A guardar…' : 'Guardar'}
            </Button>
          </>
        }
      >
      <FormSection title="Benefício">
      {/* Nome */}
      <div className="space-y-2">
        <Label htmlFor="nome">Nome *</Label>
        <Input id="nome" {...register('nome')} placeholder="ex: Seguro de Saúde Família" />
        {errors.nome && <p className="text-destructive text-sm">{errors.nome.message}</p>}
      </div>

      {/* Tipo + Periodicidade */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="tipo">Tipo *</Label>
          <Select
            value={tipo ?? ''}
            onValueChange={(v) => setValue('tipo', v as BeneficioFormValues['tipo'], { shouldValidate: true })}
          >
            <SelectTrigger id="tipo">
              <SelectValue placeholder="Seleccionar tipo">{rotulo(TIPOS, tipo)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {TIPOS.map(([valor, texto]) => (
                <SelectItem key={valor} value={valor}>{texto}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.tipo && <p className="text-destructive text-sm">{errors.tipo.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="periodicidade">Periodicidade *</Label>
          <Select
            value={periodicidade ?? ''}
            onValueChange={(v) =>
              setValue('periodicidade', v as BeneficioFormValues['periodicidade'], { shouldValidate: true })
            }
          >
            <SelectTrigger id="periodicidade">
              <SelectValue placeholder="Seleccionar periodicidade">
                {rotulo(PERIODICIDADES, periodicidade)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PERIODICIDADES.map(([valor, texto]) => (
                <SelectItem key={valor} value={valor}>{texto}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.periodicidade && (
            <p className="text-destructive text-sm">{errors.periodicidade.message}</p>
          )}
        </div>
      </div>

      {/* Fornecedor */}
      <div className="space-y-2">
        <Label htmlFor="fornecedor">Fornecedor / Seguradora</Label>
        <Input id="fornecedor" {...register('fornecedor')} placeholder="ex: Seguradora X" />
      </div>

      {/* Valores */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="custoTotal">Custo Total (MZN) *</Label>
          <Input
            id="custoTotal"
            type="number"
            step="0.01"
            min="0"
            {...register('custoTotal')}
          />
          {errors.custoTotal && (
            <p className="text-destructive text-sm">{errors.custoTotal.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="comparticipacaoEmpresa">Empresa (MZN)</Label>
          <Input
            id="comparticipacaoEmpresa"
            type="number"
            step="0.01"
            min="0"
            {...register('comparticipacaoEmpresa')}
          />
          {errors.comparticipacaoEmpresa && (
            <p className="text-destructive text-sm">{errors.comparticipacaoEmpresa.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="descontoColaborador">Desconto Colaborador (MZN)</Label>
          <Input
            id="descontoColaborador"
            type="number"
            step="0.01"
            min="0"
            {...register('descontoColaborador')}
          />
          {errors.descontoColaborador && (
            <p className="text-destructive text-sm">{errors.descontoColaborador.message}</p>
          )}
        </div>
      </div>

      {/* Tributável */}
      <div className="space-y-2">
        <Label htmlFor="tributavel">Tributável (IRPS)</Label>
        <Select
          value={tributavel}
          onValueChange={(v) => setValue('tributavel', v as 'true' | 'false')}
        >
          <SelectTrigger id="tributavel">
            <SelectValue>{rotulo(TRIBUTAVEL, tributavel)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TRIBUTAVEL.map(([valor, texto]) => (
              <SelectItem key={valor} value={valor}>{texto}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Descrição */}
      <div className="space-y-2">
        <Label htmlFor="descricao">Descrição</Label>
        <Textarea
          id="descricao"
          {...register('descricao')}
          placeholder="Descrição detalhada do benefício…"
          rows={3}
        />
      </div>

      </FormSection>
      </FormPage>
    </form>
  );
}
