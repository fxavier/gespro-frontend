'use client';

/**
 * Formulário de criação de benefício — CLIENT COMPONENT.
 * react-hook-form + zodResolver + Server Action com useActionState.
 */

import { useActionState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { criarBeneficioAction } from '@/server/actions/beneficios.actions';
import { Button } from '@/components/ui/button';
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

// Schema simplificado para o formulário (valores são strings no HTML)
const FormSchema = z.object({
  nome: z.string().min(1, 'Nome é obrigatório').max(100),
  tipo: z.enum([
    'SEGURO_SAUDE', 'SEGURO_VIDA', 'SUBSIDIO_ALIMENTACAO', 'SUBSIDIO_TRANSPORTE',
    'SUBSIDIO_HABITACAO', 'SUBSIDIO_COMUNICACOES', 'PLANO_PENSOES', 'OUTRO',
  ], { required_error: 'Tipo é obrigatório' }),
  descricao: z.string().max(500).optional(),
  fornecedor: z.string().max(200).optional(),
  custoTotal: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Valor inválido'),
  comparticipacaoEmpresa: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Valor inválido').default('0'),
  descontoColaborador: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Valor inválido').default('0'),
  periodicidade: z.enum(['MENSAL', 'TRIMESTRAL', 'ANUAL', 'PONTUAL'], {
    required_error: 'Periodicidade é obrigatória',
  }),
  tributavel: z.enum(['true', 'false']).default('false'),
});

type FormValues = z.infer<typeof FormSchema>;

export function NovoBeneficioForm() {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      custoTotal: '0',
      comparticipacaoEmpresa: '0',
      descontoColaborador: '0',
      tributavel: 'false',
    },
  });

  const [, formAction] = useActionState(
    async (_prev: unknown, data: FormData) => {
      const values = Object.fromEntries(data.entries());
      const result = await criarBeneficioAction({
        nome: values.nome as string,
        tipo: values.tipo as never,
        descricao: values.descricao as string || undefined,
        fornecedor: values.fornecedor as string || undefined,
        custoTotal: values.custoTotal as string,
        comparticipacaoEmpresa: values.comparticipacaoEmpresa as string,
        descontoColaborador: values.descontoColaborador as string,
        periodicidade: values.periodicidade as never,
        tributavel: values.tributavel === 'true',
        ativo: true,
        departamentosElegiveis: [],
        cargosElegiveis: [],
      });

      if (result.ok) {
        toast.success('Benefício criado com sucesso');
        router.push(`/rh/beneficios/${result.data.id}`);
      } else {
        toast.error(result.error.message);
      }
      return result;
    },
    null,
  );

  const onSubmit = handleSubmit(async (data) => {
    const formData = new FormData();
    Object.entries(data).forEach(([k, v]) => {
      if (v !== undefined && v !== null) formData.append(k, String(v));
    });
    await formAction(formData);
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6 max-w-2xl">
      {/* Nome */}
      <div className="space-y-2">
        <Label htmlFor="nome">Nome *</Label>
        <Input id="nome" {...register('nome')} placeholder="ex: Seguro de Saúde Família" />
        {errors.nome && <p className="text-destructive text-sm">{errors.nome.message}</p>}
      </div>

      {/* Tipo + Periodicidade */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="tipo">Tipo *</Label>
          <Select onValueChange={(v) => setValue('tipo', v as never)}>
            <SelectTrigger id="tipo">
              <SelectValue placeholder="Seleccionar tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SEGURO_SAUDE">Seguro de Saúde</SelectItem>
              <SelectItem value="SEGURO_VIDA">Seguro de Vida</SelectItem>
              <SelectItem value="SUBSIDIO_ALIMENTACAO">Subsídio Alimentação</SelectItem>
              <SelectItem value="SUBSIDIO_TRANSPORTE">Subsídio Transporte</SelectItem>
              <SelectItem value="SUBSIDIO_HABITACAO">Subsídio Habitação</SelectItem>
              <SelectItem value="SUBSIDIO_COMUNICACOES">Subsídio Comunicações</SelectItem>
              <SelectItem value="PLANO_PENSOES">Plano de Pensões</SelectItem>
              <SelectItem value="OUTRO">Outro</SelectItem>
            </SelectContent>
          </Select>
          {errors.tipo && <p className="text-destructive text-sm">{errors.tipo.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="periodicidade">Periodicidade *</Label>
          <Select onValueChange={(v) => setValue('periodicidade', v as never)}>
            <SelectTrigger id="periodicidade">
              <SelectValue placeholder="Seleccionar periodicidade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MENSAL">Mensal</SelectItem>
              <SelectItem value="TRIMESTRAL">Trimestral</SelectItem>
              <SelectItem value="ANUAL">Anual</SelectItem>
              <SelectItem value="PONTUAL">Pontual</SelectItem>
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
          onValueChange={(v) => setValue('tributavel', v as 'true' | 'false')}
          defaultValue="false"
        >
          <SelectTrigger id="tributavel">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="false">Não tributável</SelectItem>
            <SelectItem value="true">Tributável (integra base IRPS)</SelectItem>
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

      {/* Footer sticky */}
      <div className="sticky bottom-0 bg-background border-t pt-4 pb-2 flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'A guardar…' : 'Guardar'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push('/rh/beneficios')}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
