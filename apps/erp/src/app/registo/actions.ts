'use server';

/**
 * Registo público com entrada imediata — ADR-0031, tarefas 3.2, 3.3 e 7.
 *
 * NÃO passa pelo `createSafeAction`, e não é esquecimento: aquele começa por
 * exigir `auth()` e por resolver um tenant, e aqui não há sessão nem tenant —
 * é esse o ponto do ecrã. O precedente da casa para uma action sem sessão é
 * `/auth/mudar-palavra-passe/actions.ts` (ADR-0030), e este segue-o.
 *
 * A validação, o captcha, a limitação de tráfego, a idempotência e a ordem
 * Keycloak→Postgres NÃO estão aqui: vivem em `registarTenant()`, a função
 * partilhada com `POST /api/publico/registo` (Requisito 1.5). Esta action é a
 * camada de apresentação e mais nada — sessão, e-mail, medição, encaminhamento.
 * É também o que mantém o ADR-0031 reversível: se o formulário voltar um dia
 * ao site, volta contido aqui.
 *
 * A PALAVRA-PASSE atravessa este ficheiro uma vez, do corpo do pedido para
 * `registarTenant()` e para o `signIn`. Nunca em log, nunca em URL, nunca no
 * estado devolvido ao cliente.
 */

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { randomUUID } from 'node:crypto';
import { signIn } from '@/lib/auth';
import { registarTenant } from '@/server/provisioning/registo-publico';
import { enviarEmailVerificacao } from '@/server/auth/keycloak';
import { logger } from '@/server/observability/logger';
import { newRequestId, runWithRequestContext } from '@/server/observability/context';
import {
  EVENTOS_PLAUSIBLE,
  normalizarUtm,
  registarEventoPlausible,
  urlEventoRegisto,
  type Utm,
} from '@/server/analytics/plausible';
import type { RegistoTenantInput } from '@/lib/validations/onboarding';
import { PLANO_IDS } from '@/lib/planos';

export interface EntradaRegistoPublico {
  dados: RegistoTenantInput;
  /**
   * Gerada no cliente, uma por TENTATIVA (ver `registo-form.tsx`). Protege o
   * duplo envio da mesma tentativa; uma tentativa corrigida traz chave nova,
   * porque o corpo mudou e a mesma chave com corpo diferente é — por contrato
   * publicado — `IDEMPOTENCY_KEY_REUTILIZADA`.
   */
  idempotencyKey: string;
  /**
   * `utm_*` que vieram do site na *query string*. **Vêm do cliente**, portanto
   * são re-normalizados aqui antes de saírem para o fornecedor de medição —
   * o que a página normalizou não é prova de nada sobre o que a action recebe.
   */
  utm?: Utm;
}

export type EstadoRegisto =
  | { fase: 'inicial' }
  | {
      fase: 'erro';
      mensagem: string;
      code?: string;
      /** `fieldErrors` do Zod do servidor, para o formulário os mostrar no campo. */
      fieldErrors?: Record<string, string[]>;
      traceId?: string;
    }
  /**
   * O provisionamento concluiu e o `signIn` não. É o caso que o design §7
   * manda vigiar: fica um tenant válido e uma pessoa sem perceber o que
   * aconteceu. Nunca se mostra aqui um erro genérico — a conta EXISTE.
   */
  | { fase: 'sem-sessao'; mensagem: string; email: string };

const MENSAGEM_SEM_SESSAO =
  'A sua conta foi criada, mas não foi possível iniciar a sessão automaticamente. Inicie sessão com o e-mail e a palavra-passe que acabou de escolher.';

function ipDosCabecalhos(h: Headers): string {
  const encaminhado = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return encaminhado || h.get('x-real-ip')?.trim() || 'unknown';
}

/**
 * O plano, reduzido a uma das três constantes do catálogo — ou a string vazia.
 *
 * Entra no log e na propriedade do evento de medição ANTES de o Zod da
 * fronteira partilhada correr, e vem do cliente: sem isto, quem chamasse a
 * action directamente escrevia o que quisesse no nosso log estruturado e no
 * fornecedor de analítica.
 */
function planoSeguro(valor: unknown): string {
  return typeof valor === 'string' && (PLANO_IDS as readonly string[]).includes(valor)
    ? valor
    : '';
}

/**
 * O `signIn` recusou?
 *
 * Lido do parâmetro `error`, não por procura de substring: um `callbackUrl`
 * que traga `error=` na sua própria *query string* dava um falso negativo e
 * mandava para o ecrã de «inicie sessão» quem tinha acabado de entrar.
 * A base falsa serve só para aceitar destinos relativos (`/dashboard`).
 */
function destinoTemErro(destino: string): boolean {
  try {
    return new URL(destino, 'http://gespro.invalid').searchParams.has('error');
  } catch {
    // Destino ilegível não é prova de sessão. Fail-closed.
    return true;
  }
}

export async function registarTenantPublico(
  entrada: EntradaRegistoPublico,
): Promise<EstadoRegisto> {
  const traceId = newRequestId();
  return runWithRequestContext({ requestId: traceId }, () => executar(entrada, traceId));
}

async function executar(
  entrada: EntradaRegistoPublico,
  traceId: string,
): Promise<EstadoRegisto> {
  const { dados } = entrada;
  const plano = planoSeguro(dados?.planoId);
  // Re-normalizado aqui, e não só na página: o `utm` chega no corpo da Server
  // Action, logo é entrada de cliente como qualquer outra. Descarta o que não
  // é chave conhecida, o que é comprido de mais e o que tem forma de endereço.
  const utm = normalizarUtm(entrada.utm ?? {});

  const h = await headers();
  const ip = ipDosCabecalhos(h);

  // Sem PII: o plano é uma de três constantes e não identifica ninguém.
  logger.info({ evento: 'registo.iniciado', plano }, '[registo] submissão recebida');

  const resultado = await registarTenant(dados, {
    ip,
    idempotencyKey: entrada.idempotencyKey ?? randomUUID(),
  });

  if (!resultado.ok) {
    logger.warn(
      { evento: 'registo.falhado', code: resultado.code, traceId },
      '[registo] submissão recusada',
    );
    const detalhes = resultado.detalhes as
      | { fieldErrors?: Record<string, string[]> }
      | undefined;
    return {
      fase: 'erro',
      mensagem: resultado.mensagem,
      code: resultado.code,
      ...(detalhes?.fieldErrors ? { fieldErrors: detalhes.fieldErrors } : {}),
      traceId,
    };
  }

  logger.info(
    { evento: 'registo.concluido', plano, repetido: resultado.repetido },
    '[registo] tenant provisionado',
  );

  // --- Sessão na mesma submissão (ADR-0029, Direct Access Grant) ------------
  //
  // O `signIn` do Auth.js v5 com `redirect: false` devolve a URL de destino e
  // escreve o cookie; numa recusa pode lançar OU devolver uma URL com
  // `error=`. Tratam-se os dois — a pergunta a que isto responde é «a pessoa
  // ficou com sessão?», e uma só das duas leituras deixava-a passar por
  // engano.
  let sessaoOk = false;
  try {
    const destino = await signIn('credentials', {
      identificador: resultado.email,
      palavraPasse: dados.senha,
      redirect: false,
    });
    sessaoOk = typeof destino === 'string' && !destinoTemErro(destino);
  } catch (e) {
    logger.error({ err: (e as Error)?.message }, '[registo] signIn lançou');
  }

  // --- Efeitos externos: nenhum deles trava a entrada -----------------------
  //
  // O e-mail de verificação vai DEPOIS da sessão de propósito (ADR-0031): a
  // entrada no produto deixou de depender do correio, e o SMTP em baixo já não
  // tranca ninguém. `enviarEmailVerificacao` não lança — devolve booleano.
  if (resultado.sub) {
    void enviarEmailVerificacao(resultado.sub, resultado.email);
  }

  // Medição do funil através da fronteira de domínio (Requisito 7). Só na
  // primeira entrega: a reentrega idempotente é o mesmo registo, e contá-la
  // duas vezes inflacionava a conversão.
  if (!resultado.repetido) {
    void registarEventoPlausible(EVENTOS_PLAUSIBLE.registoConcluido, {
      url: urlEventoRegisto(utm),
      props: { plano },
    });
  }

  if (!sessaoOk) {
    // O alerta que o design §7 manda vigiar. `sub` é opaco e é a chave de
    // correlação do trilho de autenticação; o endereço não entra no log.
    logger.error(
      { evento: 'entrada.imediata.falhou', sub: resultado.sub, traceId },
      '[registo] tenant criado mas a sessão não foi estabelecida',
    );
    return { fase: 'sem-sessao', mensagem: MENSAGEM_SEM_SESSAO, email: resultado.email };
  }

  // Fora de qualquer try/catch: `redirect()` funciona lançando, e apanhá-lo
  // transformava a entrada no produto num erro silencioso.
  redirect('/dashboard?onboarding=1');
}
