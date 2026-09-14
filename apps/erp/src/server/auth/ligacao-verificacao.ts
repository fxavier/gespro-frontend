import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * A ligação de verificação de e-mail — ADR-0031 §5.
 *
 * Assinada e **sem estado**: `base64url({ sub, email, exp })` + HMAC-SHA256
 * com `EMAIL_VERIFY_SECRET`. Não há tabela, não há `jti`, não há consumo
 * atómico — e não é descuido (o racional completo está no cabeçalho de
 * `src/app/api/publico/verificar-email/route.ts`, que é onde quem investiga
 * um incidente vai primeiro).
 *
 * O segredo é DISTINTO do `AUTH_SECRET` de propósito: o `AUTH_SECRET` cifra
 * os JWT de sessão, que concedem acesso. Partilhar a chave entre um segredo
 * que concede sessão e um que só valida uma ligação de um e-mail é alargar o
 * raio de uma fuga sem ganho nenhum.
 */

/** Prazo da ligação: 24 h (ADR-0031 §5). */
export const PRAZO_VERIFICACAO_SEGUNDOS = 24 * 60 * 60;

interface CargaVerificacao {
  sub: string;
  email: string;
  /** Epoch em SEGUNDOS — mesma unidade do `exp` de um JWT. */
  exp: number;
}

export type ResultadoValidacao =
  | { ok: true; sub: string; email: string }
  /**
   * `malformada` — não tem a forma `<carga>.<assinatura>`, ou a carga não é
   * JSON com os campos esperados. Quase sempre uma ligação truncada pelo
   * cliente de e-mail.
   *
   * `assinatura` — a assinatura não confere: ou o segredo mudou, ou alguém
   * mexeu na carga. Nunca se distingue uma da outra para quem chama.
   *
   * `expirada` — passaram as 24 h. Leva ao REENVIO, nunca a um beco sem
   * saída (ADR-0030 §4, reafirmado pelo ADR-0031 §5).
   */
  | { ok: false; motivo: 'malformada' | 'assinatura' | 'expirada' };

/**
 * Lê o segredo de assinatura. Mesma política do `KEYCLOAK_CLIENT_SECRET` em
 * `keycloak.ts`: em produção a ausência é erro de configuração e lança-se no
 * RUNTIME (o `next build` não tem segredos e partiria); em dev há um
 * marcador de lugar, que nunca serve em produção.
 */
function segredo(): string {
  const valor = process.env.EMAIL_VERIFY_SECRET;
  if (valor && valor.length > 0) return valor;

  const emBuild = process.env.NEXT_PHASE === 'phase-production-build';
  if (process.env.NODE_ENV === 'production' && !emBuild) {
    throw new Error('[verificacao] Variável de ambiente obrigatória em produção: EMAIL_VERIFY_SECRET');
  }
  return 'gespro-email-verify-dev-secret';
}

function assinar(carga: string): string {
  return createHmac('sha256', segredo()).update(carga).digest('base64url');
}

/** Base pública da aplicação — a mesma que o `execute-actions-email` já usa. */
export function baseAplicacao(): string {
  return (process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(
    /\/$/,
    '',
  );
}

/**
 * Assina uma ligação para `sub`/`email`, válida 24 h.
 * `agoraSegundos` existe para os testes poderem fixar o relógio.
 */
export function assinarTokenVerificacao(
  sub: string,
  email: string,
  agoraSegundos: number = Math.floor(Date.now() / 1000),
): string {
  const payload: CargaVerificacao = {
    sub,
    email,
    exp: agoraSegundos + PRAZO_VERIFICACAO_SEGUNDOS,
  };
  const carga = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${carga}.${assinar(carga)}`;
}

/** URL completo a colocar no e-mail. */
export function urlVerificacao(token: string): string {
  return `${baseAplicacao()}/api/publico/verificar-email?t=${encodeURIComponent(token)}`;
}

/**
 * Valida assinatura e prazo. A ordem importa: assinatura PRIMEIRO, prazo
 * depois — sem isso, o `exp` de uma carga forjada decidiria a resposta.
 */
export function validarTokenVerificacao(
  token: string,
  agoraSegundos: number = Math.floor(Date.now() / 1000),
): ResultadoValidacao {
  const separador = token.lastIndexOf('.');
  if (separador <= 0 || separador === token.length - 1) return { ok: false, motivo: 'malformada' };

  const carga = token.slice(0, separador);
  const recebida = token.slice(separador + 1);

  const esperada = assinar(carga);
  const a = Buffer.from(recebida, 'utf8');
  const b = Buffer.from(esperada, 'utf8');
  // `timingSafeEqual` exige comprimentos iguais — a comparação de comprimento
  // é pública (a assinatura tem sempre 43 caracteres em base64url).
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, motivo: 'assinatura' };

  let payload: Partial<CargaVerificacao>;
  try {
    payload = JSON.parse(Buffer.from(carga, 'base64url').toString('utf8')) as Partial<CargaVerificacao>;
  } catch {
    return { ok: false, motivo: 'malformada' };
  }

  if (
    typeof payload.sub !== 'string' ||
    payload.sub.length === 0 ||
    typeof payload.email !== 'string' ||
    payload.email.length === 0 ||
    typeof payload.exp !== 'number' ||
    !Number.isFinite(payload.exp)
  ) {
    return { ok: false, motivo: 'malformada' };
  }

  if (agoraSegundos >= payload.exp) return { ok: false, motivo: 'expirada' };

  return { ok: true, sub: payload.sub, email: payload.email };
}
