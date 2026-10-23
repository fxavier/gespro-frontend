'use server';

/**
 * Início de sessão por palavra-passe, no servidor (ADR-0029, #657).
 *
 * O `signIn` do cliente (`next-auth/react`) faz `GET /api/auth/csrf` e depois
 * `POST /api/auth/callback/credentials` com o token no corpo e no cookie. O
 * cookie é partilhado com todos os pedidos ao Auth.js — e no mount o
 * `SessionProvider` faz `GET /api/auth/session`, que também o emite. Duas
 * respostas concorrentes sem cookie emitem tokens diferentes, a mais lenta
 * ganha, e o `POST` seguia com corpo ≠ cookie: `MissingCSRF` com as
 * credenciais certas (#657).
 *
 * Aqui não há token de cliente nenhum: o `signIn` do servidor chama o Auth.js
 * por dentro, sem a verificação CSRF do Auth.js (é uma Server Action — a
 * protecção de origem é a do Next) e escreve o cookie de sessão na resposta.
 * O resto é o mesmo de antes: o `authorize` (Keycloak, limite de tentativas
 * por IP e por conta, resolução do `User`) recebe os cabeçalhos do pedido
 * original, `x-forwarded-for` incluído.
 *
 * Como `/registo/actions.ts` e `/auth/mudar-palavra-passe/actions.ts`, não
 * passa pelo `createSafeAction`: ainda não há sessão — é esse o ponto.
 *
 * A palavra-passe atravessa esta função uma vez, para o `signIn`. Nunca em
 * log, nunca em URL, nunca no resultado.
 */

import { AuthError, CredentialsSignin } from 'next-auth';
import { signIn } from '@/lib/auth';

/**
 * `codigo` é o `MotivoRecusaLogin` do `authorize` quando o há; sem ele, o
 * ecrã mostra a mensagem de omissão.
 */
export type ResultadoEntrada = { ok: true } | { ok: false; codigo?: string };

export async function entrarComPalavraPasse(
  identificador: string,
  palavraPasse: string,
): Promise<ResultadoEntrada> {
  try {
    const destino = await signIn('credentials', {
      identificador: String(identificador ?? ''),
      palavraPasse: String(palavraPasse ?? ''),
      redirect: false,
    });
    // Numa recusa o Auth.js tanto pode lançar como devolver um URL com
    // `error=` — a pergunta é «ficou com sessão?», e lêem-se as duas.
    const erro = lerErro(destino);
    return erro ? { ok: false, ...(erro.codigo ? { codigo: erro.codigo } : {}) } : { ok: true };
  } catch (e) {
    if (e instanceof CredentialsSignin) return { ok: false, codigo: e.code };
    if (e instanceof AuthError) return { ok: false };
    throw e;
  }
}

function lerErro(destino: unknown): { codigo?: string } | null {
  if (typeof destino !== 'string') return {};
  try {
    const params = new URL(destino, 'http://gespro.invalid').searchParams;
    if (!params.has('error')) return null;
    return { codigo: params.get('code') ?? undefined };
  } catch {
    // Destino ilegível não é prova de sessão. Fail-closed.
    return {};
  }
}
