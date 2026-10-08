'use client';

/**
 * Formulário dos dados da empresa (#177): react-hook-form + zodResolver com o MESMO schema
 * da action (`DadosEmpresaSchema`). A província usa a sentinela `SEM_PROVINCIA` (o
 * `SelectItem` descarta `value=""`) e chega à action como `undefined`, que apaga o campo.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { DadosEmpresaSchema, type DadosEmpresaInput } from '@/lib/validations/plataforma';
import { getProvincias } from '@/lib/provincias-mocambique';
import { actualizarDadosEmpresa } from '@/server/actions/plataforma.actions';

const SEM_PROVINCIA = 'sem-provincia';

const REGIMES: { value: DadosEmpresaInput['regimeIva']; label: string }[] = [
  { value: 'NORMAL', label: 'Normal' },
  { value: 'SIMPLIFICADO', label: 'Simplificado' },
  { value: 'ISENTO', label: 'Isento' },
];

type CampoTexto = 'nome' | 'nuit' | 'endereco' | 'cidade' | 'codigoPostal' | 'email' | 'telefone';

export function DadosEmpresaForm({ valoresIniciais }: { valoresIniciais: DadosEmpresaInput }) {
  const router = useRouter();
  const [aCorrer, iniciarTransicao] = useTransition();

  const form = useForm<DadosEmpresaInput>({
    resolver: zodResolver(DadosEmpresaSchema),
    defaultValues: valoresIniciais,
  });

  const onSubmit = form.handleSubmit((valores) => {
    iniciarTransicao(async () => {
      const res = await actualizarDadosEmpresa(valores);
      if (!res.ok) {
        const details = res.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        const erros = Object.entries(details?.fieldErrors ?? {});
        for (const [campo, mensagens] of erros) {
          form.setError(campo as keyof DadosEmpresaInput, { type: 'server', message: mensagens[0] });
        }
        if (res.error.code === 'NUIT_DUPLICADO') {
          form.setError('nuit', { type: 'server', message: res.error.message });
        } else if (erros.length === 0) {
          toast.error(res.error.message ?? 'Não foi possível guardar os dados da empresa.');
        }
        return;
      }
      toast.success('Dados da empresa guardados.');
      form.reset(valores);
      router.refresh();
    });
  });

  const texto = (name: CampoTexto, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input {...props} {...field} value={field.value ?? ''} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty} />
      <form onSubmit={onSubmit} className="space-y-6" noValidate>
        <FormSection title="Identificação" description="O nome e o NUIT do emitente nos documentos fiscais.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {texto('nome', 'Nome da empresa')}
            {texto('nuit', 'NUIT', { inputMode: 'numeric', maxLength: 9 })}
            <FormField
              control={form.control}
              name="regimeIva"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Regime de IVA</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Escolha o regime">
                          {REGIMES.find((r) => r.value === field.value)?.label}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {REGIMES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </FormSection>

        <FormSection title="Morada" description="A morada que aparece no cabeçalho das facturas.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">{texto('endereco', 'Endereço')}</div>
            {texto('cidade', 'Cidade')}
            <FormField
              control={form.control}
              name="provincia"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Província</FormLabel>
                  <Select
                    value={field.value ?? SEM_PROVINCIA}
                    onValueChange={(v) => field.onChange(v === SEM_PROVINCIA ? undefined : v)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Sem província">{field.value ?? 'Sem província'}</SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={SEM_PROVINCIA}>Sem província</SelectItem>
                      {getProvincias().map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {texto('codigoPostal', 'Código postal')}
          </div>
        </FormSection>

        <FormSection title="Contactos">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {texto('email', 'E-mail', { type: 'email' })}
            {texto('telefone', 'Telefone', { type: 'tel' })}
          </div>
        </FormSection>

        <div className="flex justify-end">
          <Button type="submit" disabled={aCorrer || !form.formState.isDirty}>
            <Save className="h-4 w-4 mr-1.5" aria-hidden="true" />
            {aCorrer ? 'A guardar…' : 'Guardar'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
