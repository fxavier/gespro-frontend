'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { criarServicoAction, actualizarServicoAction } from '@/server/actions/servicos.actions';
import type { ServicoDetalhe } from '@/server/services/compras/servico.service.interface';
import { CreateServicoSchema, type CreateServicoInput } from '@/lib/validations/servicos';

const DEFAULT_VALUES: Partial<CreateServicoInput> = {
  codigo: '',
  nome: '',
  descricao: '',
  tipoServico: 'OUTRO',
  preco: 0,
  duracaoEstimada: 60,
  unidadeMedida: 'un',
  taxaIva: 0.16,
  disponivel: true,
  requerAgendamento: true,
  requerTecnico: false,
  incluiMaterial: false,
  diasDisponibilidade: [],
  observacoes: '',
};

/** Valores do formulário a partir de um serviço gravado (modo edição). */
function valoresDe(s: ServicoDetalhe): CreateServicoInput {
  return {
    codigo: s.codigo,
    nome: s.nome,
    descricao: s.descricao ?? '',
    tipoServico: s.tipoServico as CreateServicoInput['tipoServico'],
    preco: s.preco,
    duracaoEstimada: s.duracaoEstimada,
    unidadeMedida: s.unidadeMedida,
    taxaIva: s.taxaIva,
    disponivel: s.disponivel,
    requerAgendamento: s.requerAgendamento,
    requerTecnico: s.requerTecnico,
    incluiMaterial: s.incluiMaterial,
    diasDisponibilidade: s.diasDisponibilidade as CreateServicoInput['diasDisponibilidade'],
    observacoes: s.observacoes ?? '',
  };
}

interface Props {
  /** Em edição: o serviço a alterar. Omisso → criação. */
  servico?: ServicoDetalhe;
}

export function NovoServicoForm({ servico }: Props = {}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const emEdicao = servico !== undefined;
  const destino = servico ? `/servicos/lista/${servico.id}` : '/servicos/lista';

  const form = useForm<CreateServicoInput>({
    resolver: zodResolver(CreateServicoSchema),
    defaultValues: servico ? valoresDe(servico) : (DEFAULT_VALUES as CreateServicoInput),
    mode: 'onBlur',
  });

  const isDirty = form.formState.isDirty;

  const handleCancel = () => {
    if (isDirty) {
      const confirmed = window.confirm('Tem alterações não guardadas. Tem a certeza que pretende sair?');
      if (!confirmed) return;
    }
    router.push(destino);
  };

  // useTransition + router.push (padrão da casa): o callback do handleSubmit corre fora de
  // uma transição, e a página de destino muda com a gravação.
  const onSubmit = form.handleSubmit((data) => {
    startTransition(async () => {
      let result;
      if (servico) {
        // O código não se edita (UpdateServicoSchema não o aceita).
        const { codigo: _codigo, ...dados } = data;
        result = await actualizarServicoAction({ id: servico.id, dados });
      } else {
        result = await criarServicoAction(data);
      }
      if (result.ok) {
        toast.success(emEdicao ? 'Serviço actualizado com sucesso!' : 'Serviço criado com sucesso!');
        router.push(destino);
        return;
      }
      const details = result.error.details as
        | { fieldErrors?: Record<string, string[]> }
        | undefined;
      const campos = Object.entries(details?.fieldErrors ?? {}).filter(([campo]) => campo in data);
      if (campos.length > 0) {
        campos.forEach(([field, messages]) => {
          form.setError(field as keyof CreateServicoInput, { type: 'server', message: messages[0] });
        });
      } else {
        toast.error(
          result.error.message ??
            (emEdicao ? 'Ocorreu um erro ao actualizar o serviço.' : 'Ocorreu um erro ao criar o serviço.'),
        );
      }
    });
  });

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={isDirty && !form.formState.isSubmitSuccessful} />

      <form onSubmit={onSubmit}>
        <FormPage
          actions={
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCancel}
                disabled={isPending}
              >
                <X className="h-4 w-4 mr-1.5" />
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending} size="sm">
                <Save className="h-4 w-4 mr-1.5" />
                {isPending ? 'A guardar…' : 'Guardar Serviço'}
              </Button>
            </>
          }
        >
          <FormSection title="Informações básicas">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="codigo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código *</FormLabel>
                    <FormControl>
                      <Input placeholder="SRV001" readOnly={emEdicao} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tipoServico"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de serviço *</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar tipo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="INSTALACAO">Instalação</SelectItem>
                        <SelectItem value="MANUTENCAO">Manutenção</SelectItem>
                        <SelectItem value="REPARACAO">Reparação</SelectItem>
                        <SelectItem value="CONSULTORIA">Consultoria</SelectItem>
                        <SelectItem value="LIMPEZA">Limpeza</SelectItem>
                        <SelectItem value="TRANSPORTE">Transporte</SelectItem>
                        <SelectItem value="OUTRO">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do serviço *</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome do serviço" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="descricao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descrição detalhada do serviço"
                      rows={4}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>

          <FormSection title="Preços e duração">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <FormField
                control={form.control}
                name="preco"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Preço (MT) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="taxaIva"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Taxa IVA</FormLabel>
                    <Select
                      onValueChange={(v) => field.onChange(parseFloat(v))}
                      value={String(field.value)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="IVA" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="0">0%</SelectItem>
                        <SelectItem value="0.05">5%</SelectItem>
                        <SelectItem value="0.16">16%</SelectItem>
                        <SelectItem value="0.17">17%</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="duracaoEstimada"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Duração (minutos) *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        placeholder="60"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unidadeMedida"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unidade de medida</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Unidade" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="un">Unidade</SelectItem>
                        <SelectItem value="hora">Hora</SelectItem>
                        <SelectItem value="dia">Dia</SelectItem>
                        <SelectItem value="mes">Mês</SelectItem>
                        <SelectItem value="projeto">Projecto</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </FormSection>

          <FormSection title="Configurações">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="disponivel"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel>Disponível</FormLabel>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="requerAgendamento"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel>Requer agendamento</FormLabel>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="requerTecnico"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel>Requer técnico</FormLabel>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="observacoes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Observações adicionais"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </FormSection>
        </FormPage>
      </form>
    </Form>
  );
}
