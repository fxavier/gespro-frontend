'use client';

/**
 * Formulário de diário (criar/editar) — mesmo schema Zod do servidor.
 * Mesma forma do ContaBancariaForm: `diarioId` presente = modo edição.
 */

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
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
import { FormPage, FormSection, UnsavedChangesGuard } from '@/components/patterns';
import { criarDiario, atualizarDiario } from '@/server/actions/contabilidade.actions';
import { CriarDiarioSchema, type CriarDiarioInput } from '@/lib/validations/contabilidade';
import { TIPO_DIARIO_LABEL } from './tipos';

const LISTA = '/contabilidade/diarios';

// `ativo` só existe no formulário de edição; o schema do servidor trata-o como opcional.
const FormSchema = CriarDiarioSchema.extend({ ativo: z.boolean() });
type FormValues = z.infer<typeof FormSchema>;

export function DiarioForm({
  diarioId,
  valoresIniciais,
}: {
  /** Presente em modo edição. */
  diarioId?: string;
  valoresIniciais?: Partial<CriarDiarioInput> & { ativo?: boolean };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const emEdicao = Boolean(diarioId);

  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      codigo: valoresIniciais?.codigo ?? '',
      nome: valoresIniciais?.nome ?? '',
      tipo: valoresIniciais?.tipo ?? 'VENDAS',
      ativo: valoresIniciais?.ativo ?? true,
    },
    mode: 'onBlur',
  });

  const onSubmit = form.handleSubmit((data) => {
    startTransition(async () => {
      const { ativo, ...campos } = data;
      const res = diarioId
        ? await atualizarDiario({ id: diarioId, ...campos, ativo })
        : await criarDiario(campos);

      if (!res.ok) {
        const details = res.error.details as { fieldErrors?: Record<string, string[]> } | undefined;
        if (details?.fieldErrors) {
          Object.entries(details.fieldErrors).forEach(([field, messages]) => {
            form.setError(field as keyof CriarDiarioInput, {
              type: 'server',
              message: messages[0],
            });
          });
        } else {
          toast.error(res.error.message);
        }
        return;
      }

      toast.success(emEdicao ? 'Diário actualizado.' : 'Diário criado.');
      form.reset(data);
      router.push(diarioId ? `${LISTA}/${diarioId}` : LISTA);
      router.refresh();
    });
  });

  const isDirty = form.formState.isDirty;
  const voltar = () => router.push(diarioId ? `${LISTA}/${diarioId}` : LISTA);

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={isDirty} />

      <FormPage
        actions={
          <>
            <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={voltar}>
              <X className="h-4 w-4 mr-1.5" />
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-1.5" />
              {isPending ? 'A guardar…' : 'Guardar Diário'}
            </Button>
          </>
        }
      >
        <FormSection
          title="Informações do Diário"
          description="Dados principais do diário contabilístico"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="codigo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código</FormLabel>
                  <FormControl>
                    <Input placeholder="ex.: VD" maxLength={10} {...field} />
                  </FormControl>
                  <FormDescription>Máximo 10 caracteres</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tipo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Natureza</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar natureza" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(TIPO_DIARIO_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
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
                <FormLabel>Nome</FormLabel>
                <FormControl>
                  <Input placeholder="ex.: Diário de Vendas" maxLength={100} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {emEdicao && (
            <FormField
              control={form.control}
              name="ativo"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel>Activo</FormLabel>
                    <FormDescription>
                      Um diário inactivo deixa de estar disponível para novos lançamentos.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          )}
        </FormSection>
      </FormPage>
    </Form>
  );
}
