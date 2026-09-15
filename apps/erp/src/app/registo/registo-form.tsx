'use client';

/**
 * Folha cliente de `/registo` (ADR-0031, tarefas 3.1 e 3.3).
 *
 * Usa o MESMO schema do servidor (`RegistoTenantSchema`) — não há aqui uma
 * segunda regra de validação a divergir da primeira.
 *
 * Duas armadilhas conhecidas deste repositório, fechadas de propósito:
 *
 *  1. **Um `zodResolver` que recusa sem o campo mostrar o erro dá um botão que
 *     não faz nada.** Todos os campos, `captchaToken` incluído, têm
 *     `<FormMessage />`. É a metade visível da issue #44.
 *  2. **O widget anti-robô não se remonta a cada tecla** (issue #43): o
 *     `WidgetTurnstile` monta uma vez por chave e repõe-se por contador.
 *
 * Sem modais: o ecrã inteiro é a rota (ui-conventions).
 */

import { useActionState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  WidgetTurnstile,
  type ManipuladorTurnstile,
} from '@/components/seguranca/turnstile';
import { RegistoTenantSchema, type RegistoTenantInput } from '@/lib/validations/onboarding';
import type { PlanoId, Preco } from '@/lib/planos';
import { registarTenantPublico, type EstadoRegisto } from './actions';
import { captchaConfigurado, valorInicialCaptcha } from './captcha';
import { CAMPO_POR_CODIGO, DESTINO_DO_ERRO } from './erros-campo';

export interface PlanoResumo {
  id: PlanoId;
  nome: string;
  descricao: string;
  preco: Preco;
}

export interface RegistoFormProps {
  planos: PlanoResumo[];
  planoInicial: PlanoId;
  provincias: string[];
  utm: Record<string, string>;
  turnstileSiteKey: string;
}

function novaChave(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Ambientes sem `crypto.randomUUID` (contexto não seguro). A chave só tem de
  // ser única por tentativa; não é um segredo.
  return `reg-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function RegistoForm({
  planos,
  planoInicial,
  provincias,
  utm,
  turnstileSiteKey,
}: RegistoFormProps) {
  const temCaptcha = captchaConfigurado(turnstileSiteKey);

  // Uma chave de idempotência por TENTATIVA. Estável enquanto a tentativa
  // durar (protege o duplo envio), renovada quando a tentativa falha — o
  // `captchaToken` é de uso único e entra no `fingerprint` do corpo, portanto
  // uma tentativa corrigida com a chave anterior receberia, por contrato
  // publicado, `IDEMPOTENCY_KEY_REUTILIZADA`.
  const chaveRef = useRef<string>(novaChave());
  const captchaRef = useRef<ManipuladorTurnstile | null>(null);

  const [estado, submeter, aSubmeter] = useActionState<EstadoRegisto, RegistoTenantInput>(
    (_anterior, dados) =>
      registarTenantPublico({ dados, idempotencyKey: chaveRef.current, utm }),
    { fase: 'inicial' },
  );

  const form = useForm<RegistoTenantInput>({
    resolver: zodResolver(RegistoTenantSchema),
    mode: 'onBlur',
    defaultValues: {
      empresa: { nome: '', nuit: '' },
      admin: { nome: '', email: '' },
      senha: '',
      confirmacao: '',
      planoId: planoInicial,
      provincia: '',
      captchaToken: valorInicialCaptcha(turnstileSiteKey),
    },
  });

  // `useWatch` e não `form.watch()`: o segundo devolve uma função que o React
  // Compiler não consegue memoizar, e o lint recusa-a.
  const planoId = useWatch({ control: form.control, name: 'planoId' });
  const planoActual = planos.find((p) => p.id === planoId);

  useEffect(() => {
    if (estado.fase !== 'erro') return;

    chaveRef.current = novaChave();
    if (temCaptcha) {
      form.setValue('captchaToken', '', { shouldValidate: false });
      captchaRef.current?.repor();
    }

    for (const [campo, mensagens] of Object.entries(estado.fieldErrors ?? {})) {
      const destino = DESTINO_DO_ERRO[campo];
      if (!destino || !mensagens?.[0]) continue;
      form.setError(destino, { type: 'server', message: mensagens[0] });
    }

    const culpado = estado.code ? CAMPO_POR_CODIGO[estado.code] : undefined;
    if (culpado) {
      form.setError(culpado, { type: 'server', message: estado.mensagem });
    }
  }, [estado, form, temCaptcha]);

  // Conta criada, sessão por estabelecer: o ecrã muda de assunto. Mostrar de
  // novo o formulário convidaria a submeter uma segunda vez uma empresa que já
  // existe (design §8).
  if (estado.fase === 'sem-sessao') {
    return (
      <div className="space-y-5" role="status">
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-3 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p>{estado.mensagem}</p>
        </div>
        <Button asChild className="w-full">
          <Link href={`/auth/login?identificador=${encodeURIComponent(estado.email)}`}>
            Iniciar sessão
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    );
  }

  const aoSubmeter = form.handleSubmit((dados) => submeter(dados));

  return (
    <Form {...form}>
      <form onSubmit={aoSubmeter} className="space-y-6" noValidate>
        {estado.fase === 'erro' && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{estado.mensagem}</span>
          </div>
        )}

        <fieldset className="space-y-4" disabled={aSubmeter}>
          <legend className="sr-only">Dados da empresa</legend>

          <FormField
            control={form.control}
            name="empresa.nome"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome da empresa</FormLabel>
                <FormControl>
                  <Input autoComplete="organization" placeholder="Empresa, Lda." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="empresa.nuit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>NUIT</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="numeric"
                      maxLength={9}
                      className="tabular-nums"
                      placeholder="000000000"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="provincia"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Província</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        {/* O Radix só resolve o texto do item depois de a lista
                            abrir: sem o filho, o campo aparece vazio apesar de
                            haver valor escolhido (CLAUDE.md). */}
                        <SelectValue placeholder="Seleccionar província">
                          {field.value}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {provincias.map((nome) => (
                        <SelectItem key={nome} value={nome}>
                          {nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-4" disabled={aSubmeter}>
          <legend className="sr-only">Administrador da conta</legend>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="admin.nome"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>O seu nome</FormLabel>
                  <FormControl>
                    <Input autoComplete="name" placeholder="Nome completo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="admin.email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="username"
                      placeholder="nome@empresa.mz"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="senha"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Palavra-passe</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormDescription>Pelo menos 10 caracteres.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmacao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirmar palavra-passe</FormLabel>
                  <FormControl>
                    <Input type="password" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-4" disabled={aSubmeter}>
          <legend className="sr-only">Plano</legend>

          <FormField
            control={form.control}
            name="planoId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Plano</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccionar plano">
                        {planoActual?.nome}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {planos.map((plano) => (
                      <SelectItem key={plano.id} value={plano.id}>
                        {plano.nome} — {plano.preco.valor} {plano.preco.moeda}/mês
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {planoActual && <FormDescription>{planoActual.descricao}</FormDescription>}
                <FormMessage />
              </FormItem>
            )}
          />
        </fieldset>

        {/* Anti-robô. O campo existe sempre — é o erro dele que explica um
            botão que não avança; o widget é que só existe com chave. */}
        <FormField
          control={form.control}
          name="captchaToken"
          render={() => (
            <FormItem>
              {temCaptcha ? (
                <>
                  <FormLabel>Verificação anti-robô</FormLabel>
                  <WidgetTurnstile
                    siteKey={turnstileSiteKey}
                    ref={captchaRef}
                    onToken={(token) =>
                      form.setValue('captchaToken', token, { shouldValidate: true })
                    }
                    onExpirado={() =>
                      form.setValue('captchaToken', '', { shouldValidate: false })
                    }
                    onErro={() =>
                      form.setValue('captchaToken', '', { shouldValidate: false })
                    }
                  />
                </>
              ) : (
                <FormDescription>
                  Verificação anti-robô desactivada neste ambiente.
                </FormDescription>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={aSubmeter}>
          {aSubmeter ? 'A criar a conta…' : 'Criar conta e entrar'}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Ao criar a conta aceita os termos do serviço. Enviamos uma ligação para confirmar o
          seu e-mail — é necessária para emitir documentos e convidar colegas.
        </p>
      </form>
    </Form>
  );
}
