'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { criarContratoServicoAction } from '@/server/actions/servicos.actions';
import {
  CreateContratoServicoSchema,
  type CreateContratoServicoInput,
} from '@/lib/validations/servicos';

type FormState =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; details?: unknown } }
  | null;

interface Props {
  servicos: { id: string; nome: string }[];
}

const PERIODICIDADES = [
  { value: 'MENSAL', label: 'Mensal' },
  { value: 'TRIMESTRAL', label: 'Trimestral' },
  { value: 'SEMESTRAL', label: 'Semestral' },
  { value: 'ANUAL', label: 'Anual' },
] as const;

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}
function daqui1AnoISO() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

export function NovoContratoForm({ servicos }: Props) {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<FormState, CreateContratoServicoInput>(
    (_prev, data) => criarContratoServicoAction(data),
    null,
  );

  const form = useForm<CreateContratoServicoInput>({
    resolver: zodResolver(CreateContratoServicoSchema),
    defaultValues: {
      codigo: '',
      clienteId: '',
      clienteNome: '',
      servicosIds: [],
      dataInicio: new Date(),
      dataFim: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
      renovacaoAutomatica: false,
      periodicidade: 'MENSAL',
      valorMensal: 0,
      observacoes: '',
    },
    mode: 'onBlur',
  });
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = form;

  const servicosSelecionados = watch('servicosIds') ?? [];

  useEffect(() => {
    if (state?.ok) {
      toast.success('Contrato criado com sucesso.');
      router.push('/servicos/contratos');
    } else if (state && !state.ok) {
      toast.error(state.error.message);
    }
  }, [state, router]);

  function toggleServico(id: string, checked: boolean) {
    const atual = new Set(watch('servicosIds') ?? []);
    if (checked) atual.add(id);
    else atual.delete(id);
    setValue('servicosIds', Array.from(atual), { shouldDirty: true, shouldValidate: true });
  }

  const err = (name: keyof CreateContratoServicoInput) =>
    errors[name] ? (
      <p className="text-sm text-destructive">{String(errors[name]?.message)}</p>
    ) : null;

  return (
    <form onSubmit={handleSubmit((data) => dispatch(data))}>
      <UnsavedChangesGuard isDirty={isDirty && !isPending} />
      <FormPage
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push('/servicos/contratos')}
            >
              <X className="mr-2 h-4 w-4" /> Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              <Save className="mr-2 h-4 w-4" /> {isPending ? 'A guardar…' : 'Criar contrato'}
            </Button>
          </>
        }
      >
        <FormSection title="Identificação">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="codigo">Código</Label>
              <Input id="codigo" {...register('codigo')} placeholder="CTR-0001" />
              {err('codigo')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="clienteId">ID do cliente</Label>
              <Input id="clienteId" {...register('clienteId')} placeholder="cmr…" />
              {err('clienteId')}
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="clienteNome">Nome do cliente</Label>
              <Input id="clienteNome" {...register('clienteNome')} />
              {err('clienteNome')}
            </div>
          </div>
        </FormSection>

        <FormSection title="Serviços incluídos">
          <div className="space-y-2">
            {servicos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum serviço disponível.</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {servicos.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={servicosSelecionados.includes(s.id)}
                      onCheckedChange={(c) => toggleServico(s.id, Boolean(c))}
                    />
                    {s.nome}
                  </label>
                ))}
              </div>
            )}
            {err('servicosIds')}
          </div>
        </FormSection>

        <FormSection title="Vigência e valor">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="dataInicio">Início</Label>
              <Input
                id="dataInicio"
                type="date"
                defaultValue={hojeISO()}
                onChange={(e) =>
                  setValue('dataInicio', new Date(e.target.value), { shouldDirty: true })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dataFim">Fim</Label>
              <Input
                id="dataFim"
                type="date"
                defaultValue={daqui1AnoISO()}
                onChange={(e) =>
                  setValue('dataFim', new Date(e.target.value), { shouldDirty: true })
                }
              />
              {err('dataFim')}
            </div>
            <div className="space-y-2">
              <Label>Periodicidade</Label>
              <Select
                defaultValue="MENSAL"
                onValueChange={(v) =>
                  setValue('periodicidade', v as CreateContratoServicoInput['periodicidade'], {
                    shouldDirty: true,
                  })
                }
              >
                <SelectTrigger aria-label="Periodicidade">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIODICIDADES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="valorMensal">Valor mensal (MZN)</Label>
              <Input
                id="valorMensal"
                type="number"
                step="0.01"
                {...register('valorMensal', { valueAsNumber: true })}
              />
              {err('valorMensal')}
            </div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox
                onCheckedChange={(c) =>
                  setValue('renovacaoAutomatica', Boolean(c), { shouldDirty: true })
                }
              />
              Renovação automática
            </label>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea id="observacoes" rows={3} {...register('observacoes')} />
            </div>
          </div>
        </FormSection>
      </FormPage>
    </form>
  );
}
