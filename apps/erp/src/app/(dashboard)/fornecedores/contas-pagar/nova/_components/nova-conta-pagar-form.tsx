'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ComboboxRemoto, FormPage, FormSection, UnsavedChangesGuard, type ComboboxOption } from '@/components/patterns';
import { criarContaPagarAction, procurarFornecedoresAction } from '@/server/actions/fornecedores.actions';
import { procurarContasLancamentoAction } from '@/server/actions/contabilidade.actions';
import { CreateContaPagarSchema, type CreateContaPagarInput } from '@/lib/validations/compras';
import { dataParaDiaIso, diaIsoParaData } from '@/lib/format-date';

interface Props {
  /** Dia civil de Maputo (`aaaa-mm-dd`), calculado no servidor. */
  hoje: string;
  fornecedoresIniciais: ComboboxOption[];
  contasIniciais: ComboboxOption[];
}

const procurarFornecedores = async (q: string): Promise<ComboboxOption[] | null> => {
  const r = await procurarFornecedoresAction({ q });
  return r.ok ? r.data.map((f) => ({ value: f.id, label: f.nuit ? `${f.nome} (${f.nuit})` : f.nome })) : null;
};

const procurarContas = async (q: string): Promise<ComboboxOption[] | null> => {
  const r = await procurarContasLancamentoAction({ q });
  return r.ok ? r.data.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nome}` })) : null;
};

/**
 * Conta a pagar manual (#111): o mesmo schema que a `criarContaPagarAction` valida. A conta
 * contabilística é obrigatória (o serviço recusa sem ela, CONTA_CONTABIL_OBRIGATORIA) — o
 * formulário avisa antes de submeter. Grava e leva ao detalhe da conta criada.
 */
export function NovaContaPagarForm({ hoje, fornecedoresIniciais, contasIniciais }: Props) {
  const router = useRouter();
  const [aGravar, iniciar] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isDirty },
  } = useForm<CreateContaPagarInput>({
    resolver: zodResolver(CreateContaPagarSchema) as unknown as Resolver<CreateContaPagarInput>,
    defaultValues: {
      fornecedorId: '',
      descricao: '',
      contaContabilId: '',
      dataEmissao: diaIsoParaData(hoje),
      observacoes: '',
    },
  });

  const onSubmit = handleSubmit((valores) => {
    if (!valores.contaContabilId) {
      setError('contaContabilId', { message: 'Escolha a conta contabilística a debitar.' });
      return;
    }
    iniciar(async () => {
      const r = await criarContaPagarAction({ ...valores, observacoes: valores.observacoes || undefined });
      if (!r.ok) {
        toast.error(r.error.message ?? 'Não foi possível criar a conta a pagar.');
        return;
      }
      toast.success('Conta a pagar criada.');
      router.push(`/fornecedores/contas-pagar/${r.data.id}`);
    });
  });

  const erro = (nome: keyof CreateContaPagarInput) =>
    errors[nome] ? <p className="text-sm text-destructive">{String(errors[nome]?.message)}</p> : null;

  const campoData = (nome: 'dataEmissao' | 'dataVencimento', rotulo: string) => (
    <div className="space-y-2">
      <Label htmlFor={nome}>{rotulo} *</Label>
      <Controller
        control={control}
        name={nome}
        render={({ field }) => (
          <Input
            id={nome}
            type="date"
            value={dataParaDiaIso(field.value)}
            onChange={(e) => field.onChange(e.target.value ? diaIsoParaData(e.target.value) : undefined)}
            onBlur={field.onBlur}
          />
        )}
      />
      {erro(nome)}
    </div>
  );

  return (
    <form onSubmit={onSubmit} noValidate>
      <UnsavedChangesGuard isDirty={isDirty && !aGravar} />
      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" onClick={() => router.push('/fornecedores/contas-pagar')}>
              <X className="mr-2 h-4 w-4" aria-hidden="true" /> Cancelar
            </Button>
            <Button type="submit" disabled={aGravar}>
              <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              {aGravar ? 'A criar…' : 'Criar conta a pagar'}
            </Button>
          </>
        }
      >
        <FormSection title="Dívida" description="A quem se deve, o quê e em que conta se reconhece o gasto">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="fornecedorId">Fornecedor *</Label>
              <Controller
                control={control}
                name="fornecedorId"
                render={({ field }) => (
                  <ComboboxRemoto
                    id="fornecedorId"
                    aria-label="Fornecedor"
                    opcoesIniciais={fornecedoresIniciais}
                    procurar={procurarFornecedores}
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Seleccionar fornecedor…"
                    searchPlaceholder="Pesquisar por nome, NUIT ou código…"
                  />
                )}
              />
              {errors.fornecedorId && <p className="text-sm text-destructive">Escolha o fornecedor.</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="contaContabilId">Conta contabilística (débito) *</Label>
              <Controller
                control={control}
                name="contaContabilId"
                render={({ field }) => (
                  <ComboboxRemoto
                    id="contaContabilId"
                    aria-label="Conta contabilística (débito)"
                    opcoesIniciais={contasIniciais}
                    procurar={procurarContas}
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    placeholder="Seleccionar conta…"
                    searchPlaceholder="Pesquisar por código ou nome…"
                  />
                )}
              />
              {erro('contaContabilId')}
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="descricao">Descrição *</Label>
              <Input id="descricao" maxLength={500} {...register('descricao')} />
              {erro('descricao')}
            </div>

            <div className="space-y-2">
              <Label htmlFor="valorOriginal">Valor (MZN) *</Label>
              <Input id="valorOriginal" type="number" step="0.01" min={0.01} {...register('valorOriginal', { valueAsNumber: true })} />
              {erro('valorOriginal')}
            </div>

            <div className="hidden sm:block" />

            {campoData('dataEmissao', 'Data de emissão')}
            {campoData('dataVencimento', 'Data de vencimento')}

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea id="observacoes" rows={3} maxLength={2000} {...register('observacoes')} />
              {erro('observacoes')}
            </div>
          </div>
        </FormSection>
      </FormPage>
    </form>
  );
}
