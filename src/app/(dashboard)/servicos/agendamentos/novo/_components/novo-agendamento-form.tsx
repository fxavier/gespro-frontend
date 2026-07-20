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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { criarAgendamentoAction } from '@/server/actions/servicos.actions';
import {
  CreateAgendamentoServicoSchema,
  type CreateAgendamentoServicoInput,
} from '@/lib/validations/servicos';

type FormState =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; details?: unknown } }
  | null;

interface Props {
  servicos: { id: string; nome: string; preco: number }[];
}

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

export function NovoAgendamentoForm({ servicos }: Props) {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<FormState, CreateAgendamentoServicoInput>(
    (_prev, data) => criarAgendamentoAction(data),
    null,
  );

  const form = useForm<CreateAgendamentoServicoInput>({
    resolver: zodResolver(CreateAgendamentoServicoSchema),
    defaultValues: {
      servicoId: '',
      clienteId: '',
      clienteNome: '',
      clienteEmail: '',
      clienteTelefone: '',
      dataAgendamento: new Date(),
      horaInicio: '09:00',
      horaFim: '10:00',
      duracaoEstimada: 60,
      local: '',
      endereco: '',
      cidade: '',
      provincia: '',
      precoServico: 0,
      taxaIva: 0.16,
      observacoes: '',
    },
    mode: 'onBlur',
  });
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isDirty },
  } = form;

  useEffect(() => {
    if (state?.ok) {
      toast.success('Agendamento criado com sucesso.');
      router.push('/servicos/agendamentos');
    } else if (state && !state.ok) {
      toast.error(state.error.message);
    }
  }, [state, router]);

  const err = (name: keyof CreateAgendamentoServicoInput) =>
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
              onClick={() => router.push('/servicos/agendamentos')}
            >
              <X className="mr-2 h-4 w-4" /> Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              <Save className="mr-2 h-4 w-4" /> {isPending ? 'A guardar…' : 'Criar agendamento'}
            </Button>
          </>
        }
      >
        <FormSection title="Serviço e cliente">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Serviço</Label>
              <Select
                onValueChange={(v) => {
                  setValue('servicoId', v, { shouldDirty: true, shouldValidate: true });
                  const s = servicos.find((x) => x.id === v);
                  if (s) setValue('precoServico', s.preco, { shouldDirty: true });
                }}
              >
                <SelectTrigger aria-label="Serviço">
                  <SelectValue placeholder="Selecione um serviço" />
                </SelectTrigger>
                <SelectContent>
                  {servicos.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {err('servicoId')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="clienteId">ID do cliente</Label>
              <Input id="clienteId" {...register('clienteId')} placeholder="cmr…" />
              {err('clienteId')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="clienteNome">Nome do cliente</Label>
              <Input id="clienteNome" {...register('clienteNome')} />
              {err('clienteNome')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="clienteEmail">Email</Label>
              <Input id="clienteEmail" type="email" {...register('clienteEmail')} />
              {err('clienteEmail')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="clienteTelefone">Telefone</Label>
              <Input id="clienteTelefone" {...register('clienteTelefone')} placeholder="+258 …" />
              {err('clienteTelefone')}
            </div>
          </div>
        </FormSection>

        <FormSection title="Data e local">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="dataAgendamento">Data</Label>
              <Input
                id="dataAgendamento"
                type="date"
                defaultValue={hojeISO()}
                onChange={(e) =>
                  setValue('dataAgendamento', new Date(e.target.value), { shouldDirty: true })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="horaInicio">Hora início</Label>
              <Input id="horaInicio" type="time" {...register('horaInicio')} />
              {err('horaInicio')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="horaFim">Hora fim</Label>
              <Input id="horaFim" type="time" {...register('horaFim')} />
              {err('horaFim')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="duracaoEstimada">Duração (min)</Label>
              <Input
                id="duracaoEstimada"
                type="number"
                min={1}
                {...register('duracaoEstimada', { valueAsNumber: true })}
              />
              {err('duracaoEstimada')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="local">Local</Label>
              <Input id="local" {...register('local')} placeholder="Ex.: Instalações do cliente" />
              {err('local')}
            </div>
            <div className="space-y-2 sm:col-span-3">
              <Label htmlFor="endereco">Endereço</Label>
              <Input id="endereco" {...register('endereco')} />
              {err('endereco')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cidade">Cidade</Label>
              <Input id="cidade" {...register('cidade')} />
              {err('cidade')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="provincia">Província</Label>
              <Input id="provincia" {...register('provincia')} />
              {err('provincia')}
            </div>
          </div>
        </FormSection>

        <FormSection title="Preço">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="precoServico">Preço (MZN)</Label>
              <Input
                id="precoServico"
                type="number"
                step="0.01"
                {...register('precoServico', { valueAsNumber: true })}
              />
              {err('precoServico')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="desconto">Desconto (MZN)</Label>
              <Input
                id="desconto"
                type="number"
                step="0.01"
                {...register('desconto', { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxaIva">Taxa IVA</Label>
              <Input
                id="taxaIva"
                type="number"
                step="0.01"
                {...register('taxaIva', { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-2 sm:col-span-3">
              <Label htmlFor="observacoes">Observações</Label>
              <Textarea id="observacoes" rows={3} {...register('observacoes')} />
            </div>
          </div>
        </FormSection>
      </FormPage>
    </form>
  );
}
