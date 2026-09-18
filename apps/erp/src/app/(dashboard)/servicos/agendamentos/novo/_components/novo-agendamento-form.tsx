'use client';

import { useActionState, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Combobox,
  ComboboxRemoto,
  FormPage,
  FormSection,
  UnsavedChangesGuard,
  type ComboboxOption,
} from '@/components/patterns';
import { procurarClientes } from '@/server/actions/clientes.actions';
import { criarAgendamentoAction } from '@/server/actions/servicos.actions';
import {
  CreateAgendamentoServicoSchema,
  type CreateAgendamentoServicoInput,
} from '@/lib/validations/servicos';

type FormState =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; details?: unknown } }
  | null;

export interface ClienteOpcao {
  id: string;
  codigo: string;
  nome: string;
  email: string;
  telefone: string;
}

interface Props {
  servicos: { id: string; nome: string; preco: number }[];
  /** Primeira página de clientes; a partir daí a combobox pesquisa no servidor. */
  clientesIniciais: ClienteOpcao[];
}

const rotulo = (c: { codigo: string; nome: string }) => `${c.codigo} — ${c.nome}`;

function hojeISO() {
  return new Date().toISOString().slice(0, 10);
}

export function NovoAgendamentoForm({ servicos, clientesIniciais }: Props) {
  const router = useRouter();

  // Os clientes conhecidos (iniciais + resultados de pesquisa) ficam num mapa
  // para, ao escolher um, preencher nome, e-mail e telefone — o agendamento
  // guarda esse instantâneo (schema), mas quem o cria não o dactilografa.
  const [conhecidos, setConhecidos] = useState<Map<string, ClienteOpcao>>(
    () => new Map(clientesIniciais.map((c) => [c.id, c])),
  );
  const opcoesClientes: ComboboxOption[] = clientesIniciais.map((c) => ({
    value: c.id,
    label: rotulo(c),
  }));
  const buscarClientes = useCallback(async (q: string): Promise<ComboboxOption[] | null> => {
    const res = await procurarClientes({ q });
    if (!res.ok) return null;
    setConhecidos((prev) => {
      const next = new Map(prev);
      for (const c of res.data) next.set(c.id, c);
      return next;
    });
    return res.data.map((c) => ({ value: c.id, label: rotulo(c) }));
  }, []);
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
    control,
    handleSubmit,
    setValue,
    formState: { errors, isDirty },
  } = form;
  const clienteId = useWatch({ control, name: 'clienteId' });

  const escolherCliente = (id: string) => {
    const opcoes = { shouldDirty: true, shouldValidate: true } as const;
    setValue('clienteId', id, opcoes);
    const c = conhecidos.get(id);
    if (!c) return;
    setValue('clienteNome', c.nome, opcoes);
    setValue('clienteEmail', c.email, opcoes);
    setValue('clienteTelefone', c.telefone, opcoes);
  };

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
              <Combobox
                aria-label="Serviço"
                placeholder="Selecione um serviço"
                options={servicos.map((s) => ({ value: s.id, label: s.nome }))}
                onChange={(v) => {
                  setValue('servicoId', v, { shouldDirty: true, shouldValidate: true });
                  const s = servicos.find((x) => x.id === v);
                  if (s) setValue('precoServico', s.preco, { shouldDirty: true });
                }}
              />
              {err('servicoId')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="cliente-id">Cliente *</Label>
              <ComboboxRemoto
                id="cliente-id"
                opcoesIniciais={opcoesClientes}
                procurar={buscarClientes}
                value={clienteId}
                onChange={escolherCliente}
                placeholder="Seleccione o cliente"
                searchPlaceholder="Pesquisar por código, nome ou NUIT…"
                emptyText="Nenhum cliente encontrado."
              />
              {err('clienteId')}
              {/* O nome vai no instantâneo do agendamento; vem da ficha, não se escreve. */}
              <input type="hidden" {...register('clienteNome')} />
              {err('clienteNome')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="clienteEmail">E-mail de contacto</Label>
              <Input id="clienteEmail" type="email" {...register('clienteEmail')} />
              {err('clienteEmail')}
            </div>
            <div className="space-y-2">
              <Label htmlFor="clienteTelefone">Telefone de contacto</Label>
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
