'use client';

/**
 * Formulário de criação de utilizador.
 * Padrão: react-hook-form + zodResolver + useActionState.
 */

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Check, Copy, KeyRound, Mail, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
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
import { criarUtilizador } from '@/server/actions/plataforma.actions';
import { CreateUserSchema, type CreateUserInput } from '@/lib/validations/plataforma';
import type { RoleRow } from '@/server/services/plataforma/user-admin.interface';

type FormState = {
  ok: true;
  data: unknown;
} | {
  ok: false;
  error: { code: string; message: string; details?: unknown };
} | null;

interface CriarUtilizadorFormProps {
  roles: RoleRow[];
}

const DEFAULT_VALUES: CreateUserInput = {
  nome: '',
  email: '',
  roleIds: [],
  ativo: true,
  metodoAcesso: 'convite',
};

export function CriarUtilizadorForm({ roles }: CriarUtilizadorFormProps) {
  const router = useRouter();
  // Mostrada UMA vez, logo a seguir a criar (ADR-0030 §2): não é lida de lado
  // nenhum, não volta em nenhuma consulta.
  const [credenciais, setCredenciais] = useState<{ email: string; palavraPasse: string } | null>(
    null
  );
  const [state, dispatch, isPending] = useActionState<FormState, CreateUserInput>(
    (_prev, data) => criarUtilizador(data),
    null
  );

  const form = useForm<CreateUserInput>({
    resolver: zodResolver(CreateUserSchema),
    defaultValues: DEFAULT_VALUES,
    mode: 'onBlur',
  });

  useEffect(() => {
    if (!state) return;

    if (!state.ok) {
      const details = state.error.details as
        | { fieldErrors?: Record<string, string[]> }
        | undefined;

      if (details?.fieldErrors) {
        Object.entries(details.fieldErrors).forEach(([field, messages]) => {
          form.setError(field as keyof CreateUserInput, {
            type: 'server',
            message: messages[0],
          });
        });
      } else {
        toast.error(state.error.message ?? 'Erro ao criar o utilizador.');
      }
    } else {
      const dados = state.data as
        | { utilizador?: { email?: string }; palavraPasseInicial?: string | null }
        | undefined;

      if (dados?.palavraPasseInicial) {
        toast.success('Utilizador criado. Entregue a palavra-passe ao próprio.');
        setCredenciais({
          email: dados.utilizador?.email ?? '',
          palavraPasse: dados.palavraPasseInicial,
        });
        return; // fica no ecrã: sair daqui perde a palavra-passe para sempre
      }

      toast.success('Utilizador criado. O convite seguiu por e-mail.');
      router.push('/core-tenancy/utilizadores');
    }
  }, [state, form, router]);

  const onSubmit = form.handleSubmit((data) => dispatch(data));
  const isDirty = form.formState.isDirty;

  const handleCancel = () => {
    if (isDirty) {
      const confirmed = window.confirm('Tem alterações não guardadas. Pretende sair mesmo assim?');
      if (!confirmed) return;
    }
    router.push('/core-tenancy/utilizadores');
  };

  if (credenciais) {
    return <CredenciaisGeradas {...credenciais} />;
  }

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
              {isPending ? 'A guardar…' : 'Criar Utilizador'}
            </Button>
          </>
        }
      >
        <FormSection title="Dados de Acesso" description="Informações de identificação e autenticação">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome Completo</FormLabel>
                  <FormControl>
                    <Input placeholder="ex.: João Mahumane Silva" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Corporativo</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="ex.: joao@empresa.co.mz" {...field} />
                  </FormControl>
                  <FormDescription>
                    É o identificador com que a pessoa inicia sessão. Um endereço só pode
                    pertencer a uma empresa GestPro.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="metodoAcesso"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel>Como é que esta pessoa entra pela primeira vez?</FormLabel>
                <FormControl>
                  <RadioGroup
                    value={field.value}
                    onValueChange={field.onChange}
                    className="grid gap-3 sm:grid-cols-2"
                  >
                    <label
                      htmlFor="metodo-convite"
                      className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                    >
                      <RadioGroupItem value="convite" id="metodo-convite" className="mt-0.5" />
                      <span className="space-y-1">
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          <Mail className="h-4 w-4" aria-hidden="true" />
                          Convite por e-mail
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          Recebe uma mensagem onde confirma o endereço e escolhe a palavra-passe.
                        </span>
                      </span>
                    </label>

                    <label
                      htmlFor="metodo-palavra-passe"
                      className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                    >
                      <RadioGroupItem
                        value="palavra-passe"
                        id="metodo-palavra-passe"
                        className="mt-0.5"
                      />
                      <span className="space-y-1">
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          <KeyRound className="h-4 w-4" aria-hidden="true" />
                          Definir palavra-passe agora
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          O sistema gera uma provisória, mostra-a a si uma vez, e a pessoa é
                          obrigada a mudá-la ao entrar.
                        </span>
                      </span>
                    </label>
                  </RadioGroup>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="ativo"
            render={({ field }) => (
              <FormItem className="flex items-center gap-2">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormLabel className="font-normal">Utilizador activo</FormLabel>
              </FormItem>
            )}
          />
        </FormSection>

        <FormSection title="Papéis e Permissões" description="Seleccione os papéis a atribuir ao utilizador">
          <FormField
            control={form.control}
            name="roleIds"
            render={() => (
              <FormItem>
                <div className="space-y-2">
                  {roles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Não existem papéis disponíveis. Crie um papel em{' '}
                      <a href="/core-tenancy/roles/novo" className="text-primary hover:underline">
                        Papéis e Permissões
                      </a>.
                    </p>
                  ) : (
                    roles.map((role) => (
                      <FormField
                        key={role.id}
                        control={form.control}
                        name="roleIds"
                        render={({ field }) => (
                          <FormItem className="flex items-start gap-2">
                            <FormControl>
                              <Checkbox
                                checked={field.value.includes(role.id)}
                                onCheckedChange={(checked) => {
                                  const current = field.value;
                                  field.onChange(
                                    checked
                                      ? [...current, role.id]
                                      : current.filter((id) => id !== role.id)
                                  );
                                }}
                              />
                            </FormControl>
                            <div className="space-y-0.5">
                              <FormLabel className="font-medium cursor-pointer">{role.nome}</FormLabel>
                              {role.descricao && (
                                <p className="text-xs text-muted-foreground">{role.descricao}</p>
                              )}
                              <p className="text-xs text-muted-foreground tabular-nums">
                                {role.permissions.length} permissões
                              </p>
                            </div>
                          </FormItem>
                        )}
                      />
                    ))
                  )}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
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

/**
 * A palavra-passe provisória, mostrada uma única vez (ADR-0030 §2).
 *
 * Sair deste ecrã perde-a para sempre — não está guardada em lado nenhum e não
 * há leitura que a devolva. Quem a perder repõe-na na ficha do utilizador.
 */
function CredenciaisGeradas({ email, palavraPasse }: { email: string; palavraPasse: string }) {
  const router = useRouter();
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(`${email} · ${palavraPasse}`);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      toast.error('O navegador não deixou copiar. Anote a palavra-passe antes de sair.');
    }
  };

  return (
    <div className="max-w-xl space-y-4 rounded-lg border bg-card p-6">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">Utilizador criado</h2>
        <p className="text-sm text-muted-foreground">
          Entregue estes dados ao próprio. Esta palavra-passe <strong>não volta a ser
          mostrada</strong> — se sair deste ecrã sem a guardar, terá de a repor na ficha do
          utilizador.
        </p>
      </div>

      <dl className="space-y-3 rounded-lg border bg-muted/40 p-4">
        <div className="space-y-0.5">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">E-mail</dt>
          <dd className="font-mono text-sm">{email}</dd>
        </div>
        <div className="space-y-0.5">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
            Palavra-passe provisória
          </dt>
          <dd className="font-mono text-lg tracking-wide">{palavraPasse}</dd>
        </div>
      </dl>

      <p className="text-sm text-muted-foreground">
        No primeiro acesso é pedido que a troque por uma que só ela conheça.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copiar}>
          {copiado ? (
            <Check className="h-4 w-4 mr-1.5" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4 mr-1.5" aria-hidden="true" />
          )}
          {copiado ? 'Copiado' : 'Copiar'}
        </Button>
        <Button type="button" size="sm" onClick={() => router.push('/core-tenancy/utilizadores')}>
          Já anotei — concluir
        </Button>
      </div>
    </div>
  );
}
