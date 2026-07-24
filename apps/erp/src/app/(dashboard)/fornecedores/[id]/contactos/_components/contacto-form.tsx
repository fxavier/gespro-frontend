'use client';

/**
 * Formulário de contacto de fornecedor — criação e edição.
 * Reutilizado nas sub-rotas `contactos/novo` e `contactos/[contactoId]/editar`.
 * react-hook-form + zodResolver com o MESMO schema de validação partilhado.
 */
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { z } from 'zod';
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
import {
  adicionarContactoFornecedorAction,
  actualizarContactoFornecedorAction,
} from '@/server/actions/fornecedores.actions';
import { CreateContactoFornecedorSchema } from '@/lib/validations/fornecedores';
import type { ContactoFornecedorDto } from '@/server/services/compras/fornecedor.service.interface';

const ContactoFormSchema = CreateContactoFornecedorSchema.omit({ fornecedorId: true });
type ContactoFormInput = z.infer<typeof ContactoFormSchema>;

const TIPOS: { value: ContactoFormInput['tipo']; label: string }[] = [
  { value: 'PRINCIPAL', label: 'Principal' },
  { value: 'SECUNDARIO', label: 'Secundário' },
  { value: 'TECNICO', label: 'Técnico' },
  { value: 'FINANCEIRO', label: 'Financeiro' },
];

interface Props {
  fornecedorId: string;
  contacto?: ContactoFornecedorDto;
}

export function ContactoForm({ fornecedorId, contacto }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const modoEdicao = Boolean(contacto);
  const voltar = `/fornecedores/${fornecedorId}/contactos`;

  const form = useForm<ContactoFormInput>({
    resolver: zodResolver(ContactoFormSchema),
    defaultValues: {
      nome: contacto?.nome ?? '',
      cargo: contacto?.cargo ?? undefined,
      email: contacto?.email ?? undefined,
      telefone: contacto?.telefone ?? undefined,
      telefoneSec: undefined,
      tipo: (contacto?.tipo as ContactoFormInput['tipo']) ?? 'PRINCIPAL',
      ativo: contacto?.ativo ?? true,
    },
    mode: 'onBlur',
  });

  const onSubmit = form.handleSubmit((values) => {
    startTransition(async () => {
      const result = modoEdicao
        ? await actualizarContactoFornecedorAction({ contactoId: contacto!.id, dados: values })
        : await adicionarContactoFornecedorAction({
            fornecedorId,
            dados: { ...values, fornecedorId },
          });

      if (result.ok) {
        toast.success(modoEdicao ? 'Contacto actualizado.' : 'Contacto adicionado.');
        router.push(voltar);
        router.refresh();
      } else {
        toast.error(result.error.message ?? 'Não foi possível guardar o contacto.');
      }
    });
  });

  return (
    <Form {...form}>
      <UnsavedChangesGuard isDirty={form.formState.isDirty && !isPending} />

      <FormPage
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push(voltar)}
              disabled={isPending}
            >
              <X className="h-4 w-4 mr-1.5" />
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={isPending} onClick={onSubmit}>
              <Save className="h-4 w-4 mr-1.5" />
              {isPending ? 'A guardar…' : 'Guardar Contacto'}
            </Button>
          </>
        }
      >
        <FormSection title="Contacto" description="Dados da pessoa de contacto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input placeholder="Nome do contacto" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cargo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cargo</FormLabel>
                  <FormControl>
                    <Input placeholder="ex.: Gestor de conta" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tipo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TIPOS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="email@empresa.co.mz"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="telefone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefone</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="+258 84 000 0000"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ativo"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 sm:col-span-2">
                  <div className="space-y-0.5">
                    <FormLabel>Contacto activo</FormLabel>
                    <FormDescription>
                      Contactos inactivos deixam de aparecer como preferenciais.
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch checked={field.value ?? true} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </FormSection>
      </FormPage>
    </Form>
  );
}
