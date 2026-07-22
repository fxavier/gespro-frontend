'use client';

/**
 * Formulário de criação de colaborador.
 * Padrão: react-hook-form + zodResolver + useActionState + UnsavedChangesGuard.
 */

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { criarColaboradorAction } from '@/server/actions/rh.actions';
import { CreateColaboradorSchema, type CreateColaboradorInput } from '@/lib/validations/rh';

type FormState =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string; details?: unknown } }
  | null;

const DEFAULT_VALUES: Partial<CreateColaboradorInput> = {
  nacionalidade: 'Moçambicana',
  status: 'ACTIVO',
  tipoContrato: 'EFECTIVO',
  regimeTrabalho: 'TEMPO_INTEGRAL',
  nivelAcesso: 'USUARIO',
  genero: 'MASCULINO',
  estadoCivil: 'SOLTEIRO',
};

export function NovoColaboradorForm() {
  const router = useRouter();
  const [state, dispatch, isPending] = useActionState<FormState, CreateColaboradorInput>(
    (_prev, data) => criarColaboradorAction(data),
    null
  );

  const form = useForm<CreateColaboradorInput>({
    resolver: zodResolver(CreateColaboradorSchema),
    defaultValues: DEFAULT_VALUES as CreateColaboradorInput,
    mode: 'onBlur',
  });

  useEffect(() => {
    if (!state) return;
    if (!state.ok) {
      const details = state.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
      if (details?.fieldErrors) {
        Object.entries(details.fieldErrors).forEach(([field, messages]) => {
          form.setError(field as keyof CreateColaboradorInput, {
            type: 'server',
            message: messages[0],
          });
        });
      } else {
        toast.error(state.error.message ?? 'Erro ao criar o colaborador.');
      }
    } else {
      toast.success('Colaborador criado com sucesso!');
      router.push('/rh/colaboradores');
    }
  }, [state, form, router]);

  const onSubmit = form.handleSubmit((data) => dispatch(data));
  const isDirty = form.formState.isDirty;

  const handleCancel = () => {
    router.push('/rh/colaboradores');
  };

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={isDirty} />

      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={handleCancel} disabled={isPending}>
              <X className="h-4 w-4 mr-1.5" />
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-1.5" />
              {isPending ? 'A guardar…' : 'Guardar Colaborador'}
            </Button>
          </>
        }
      >
        {/* Dados Básicos */}
        <FormSection title="Dados Básicos" description="Informações essenciais do colaborador">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField control={form.control} name="codigo" render={({ field }) => (
              <FormItem>
                <FormLabel>Código *</FormLabel>
                <FormControl><Input placeholder="COL-001" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="nome" render={({ field }) => (
              <FormItem>
                <FormLabel>Nome Completo *</FormLabel>
                <FormControl><Input placeholder="Nome completo" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="dataNascimento" render={({ field }) => (
              <FormItem>
                <FormLabel>Data de Nascimento *</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                    onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="genero" render={({ field }) => (
              <FormItem>
                <FormLabel>Género *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="MASCULINO">Masculino</SelectItem>
                    <SelectItem value="FEMININO">Feminino</SelectItem>
                    <SelectItem value="OUTRO">Outro</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="estadoCivil" render={({ field }) => (
              <FormItem>
                <FormLabel>Estado Civil *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Seleccione" /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="SOLTEIRO">Solteiro(a)</SelectItem>
                    <SelectItem value="CASADO">Casado(a)</SelectItem>
                    <SelectItem value="DIVORCIADO">Divorciado(a)</SelectItem>
                    <SelectItem value="VIUVO">Viúvo(a)</SelectItem>
                    <SelectItem value="UNIAO_FACTO">União de Facto</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="nacionalidade" render={({ field }) => (
              <FormItem>
                <FormLabel>Nacionalidade *</FormLabel>
                <FormControl><Input placeholder="Moçambicana" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </FormSection>

        {/* Documentos */}
        <FormSection title="Documentos de Identificação" description="BI, NUIT e NISS">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField control={form.control} name="bi" render={({ field }) => (
              <FormItem>
                <FormLabel>BI/DIRE *</FormLabel>
                <FormControl><Input placeholder="12 dígitos + letra" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="nuit" render={({ field }) => (
              <FormItem>
                <FormLabel>NUIT *</FormLabel>
                <FormControl><Input placeholder="9 dígitos" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="niss" render={({ field }) => (
              <FormItem>
                <FormLabel>NISS</FormLabel>
                <FormControl><Input placeholder="11 dígitos (opcional)" {...field} value={field.value ?? ''} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </FormSection>

        {/* Contactos */}
        <FormSection title="Contactos" description="Email, telefone e endereço">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField control={form.control} name="email" render={({ field }) => (
              <FormItem>
                <FormLabel>Email *</FormLabel>
                <FormControl><Input type="email" placeholder="email@empresa.co.mz" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="telefone" render={({ field }) => (
              <FormItem>
                <FormLabel>Telefone *</FormLabel>
                <FormControl><Input placeholder="+258 84 000 0000" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="enderecoRua" render={({ field }) => (
              <FormItem>
                <FormLabel>Rua *</FormLabel>
                <FormControl><Input placeholder="Nome da rua" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="enderecoNumero" render={({ field }) => (
              <FormItem>
                <FormLabel>Número</FormLabel>
                <FormControl><Input placeholder="Número" {...field} value={field.value ?? ''} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="enderecoBairro" render={({ field }) => (
              <FormItem>
                <FormLabel>Bairro *</FormLabel>
                <FormControl><Input placeholder="Bairro" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="enderecoCidade" render={({ field }) => (
              <FormItem>
                <FormLabel>Cidade *</FormLabel>
                <FormControl><Input placeholder="Cidade" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="enderecoProvincia" render={({ field }) => (
              <FormItem>
                <FormLabel>Província *</FormLabel>
                <FormControl><Input placeholder="Província" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="naturalidadeProvincia" render={({ field }) => (
              <FormItem>
                <FormLabel>Província de Naturalidade *</FormLabel>
                <FormControl><Input placeholder="Província" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="naturalidadeDistrito" render={({ field }) => (
              <FormItem>
                <FormLabel>Distrito de Naturalidade *</FormLabel>
                <FormControl><Input placeholder="Distrito" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </FormSection>

        {/* Contacto de Emergência */}
        <FormSection title="Contacto de Emergência">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <FormField control={form.control} name="emergenciaNome" render={({ field }) => (
              <FormItem>
                <FormLabel>Nome *</FormLabel>
                <FormControl><Input placeholder="Nome completo" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="emergenciaParentesco" render={({ field }) => (
              <FormItem>
                <FormLabel>Parentesco *</FormLabel>
                <FormControl><Input placeholder="Ex: Cônjuge, Pai/Mãe" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="emergenciaTelefone" render={({ field }) => (
              <FormItem>
                <FormLabel>Telefone *</FormLabel>
                <FormControl><Input placeholder="+258 84 000 0000" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </FormSection>

        {/* Dados Profissionais */}
        <FormSection title="Dados Profissionais" description="Contrato, regime e remuneração">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField control={form.control} name="dataAdmissao" render={({ field }) => (
              <FormItem>
                <FormLabel>Data de Admissão *</FormLabel>
                <FormControl>
                  <Input
                    type="date"
                    value={field.value ? new Date(field.value).toISOString().split('T')[0] : ''}
                    onChange={(e) => field.onChange(e.target.value ? new Date(e.target.value) : undefined)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="tipoContrato" render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo de Contrato *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="EFECTIVO">Efectivo</SelectItem>
                    <SelectItem value="TERMO_CERTO">Termo Certo</SelectItem>
                    <SelectItem value="ESTAGIO">Estágio</SelectItem>
                    <SelectItem value="TEMPORARIO">Temporário</SelectItem>
                    <SelectItem value="PRESTACAO_SERVICOS">Prestação de Serviços</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="regimeTrabalho" render={({ field }) => (
              <FormItem>
                <FormLabel>Regime de Trabalho *</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="TEMPO_INTEGRAL">Tempo Integral</SelectItem>
                    <SelectItem value="TEMPO_PARCIAL">Tempo Parcial</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="salarioBase" render={({ field }) => (
              <FormItem>
                <FormLabel>Salário Base (MZN) *</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="tabular-nums"
                    placeholder="0.00"
                    {...field}
                    onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>
        </FormSection>

        {state && !state.ok && !state.error.details && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {state.error.message}
          </div>
        )}
      </FormPage>
    </Form>
  );
}
