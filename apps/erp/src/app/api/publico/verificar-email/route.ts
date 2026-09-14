import { NextResponse, type NextRequest } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { auth } from '@/lib/auth';
import { verificacaoEmailLimiter } from '@/server/security/rate-limiter';
import { marcarEmailVerificado } from '@/server/auth/keycloak';
import { validarTokenVerificacao } from '@/server/auth/ligacao-verificacao';
import { logger } from '@/server/observability/logger';

/**
 * GET /api/publico/verificar-email?t=<token> — confirmação de endereço.
 *
 * Reposto pelo ADR-0031 §5, que inverte o ADR-0013 §4 (a verificação era do
 * Keycloak, por `execute-actions-email`). Não pode continuar a ser: quem se
 * regista pelo ADR-0031 já tem palavra-passe e já tem sessão, e uma acção
 * `VERIFY_EMAIL` pendente faria o *direct grant* recusar — trancava a conta
 * em vez de a abrir.
 *
 * ── Porque é que esta ligação não leva tabela, `jti` nem consumo atómico ──
 *
 * Não é descuido, e a pergunta é legítima: um *token* num e-mail costuma
 * levar tudo isso. A diferença é o que ele faz.
 *
 * O efeito desta ligação é **pôr um booleano a `true` no Keycloak**. É
 * idempotente (a segunda visita escreve o mesmo valor e responde igual), não
 * é reversível para um valor pior, e — o que decide — **não concede sessão
 * nenhuma**. Quem a abrir sem ser o destinatário não fica com acesso a coisa
 * alguma: fica com um endereço confirmado que já era do destinatário.
 *
 * É literalmente o critério que o ADR-0013 §5 usou para dispensar o aparato
 * do `TokenHandoff` — «um *token* que não concede nada não precisa de ser
 * protegido» — aplicado a um caso onde é verdadeiro. O simétrico também vale,
 * e é por isso que o handoff continua morto: um *token* que **concede** uma
 * sessão obriga a `jti`, consumo atómico, TTL de segundos e tabela.
 *
 * O que esta ligação precisa é do que tem: assinatura HMAC-SHA256 com um
 * segredo próprio (`EMAIL_VERIFY_SECRET`, distinto do `AUTH_SECRET`) e um
 * prazo de 24 h dentro da carga assinada. Sem tabela não há migração, não há
 * expurgo, não há linha órfã — e não há um segundo sítio onde o estado de
 * verificação possa divergir do Keycloak, que é a fonte de verdade da
 * identidade (ADR-0013 §2, intacto).
 *
 * ── Prazo expirado ──
 *
 * Leva ao REENVIO, nunca a um beco sem saída (ADR-0030 §4). O destino carrega
 * `?verificacao=expirada`, e o aviso do painel tem o botão que gera outra.
 *
 * ── Respostas ──
 *
 * Sempre 303 (See Other), nunca JSON: quem abre isto é um browser vindo de um
 * cliente de e-mail, e o 303 troca o GET por uma navegação limpa para uma
 * página que a pessoa percebe. Com sessão vai para `/dashboard`; sem sessão,
 * para `/auth/login`.
 */

export const runtime = 'nodejs';

function ipDe(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

type Desfecho = 'ok' | 'expirada' | 'invalida' | 'erro' | 'limitada';

/**
 * Destino da navegação. `/dashboard` para quem já tem sessão — mandá-lo para
 * o ecrã de login depois de confirmar o e-mail seria pedir-lhe as credenciais
 * que ele acabou de usar.
 */
async function destino(req: NextRequest, desfecho: Desfecho): Promise<string> {
  let base = '/auth/login';
  try {
    const sessao = await auth();
    if (sessao?.user) base = '/dashboard';
  } catch {
    // Sessão ilegível não é motivo para falhar uma confirmação — segue para
    // o ecrã de login, que é o destino seguro.
  }
  return new URL(`${base}?verificacao=${desfecho}`, req.nextUrl.origin).toString();
}

async function redireccionar(req: NextRequest, desfecho: Desfecho): Promise<Response> {
  return NextResponse.redirect(await destino(req, desfecho), 303);
}

export const GET = withApi(
  async (req: NextRequest) => {
    // 1. Limite por IP. Não protege o segredo (isso é a assinatura); trava o
    //    ruído de quem tenta adivinhar e o custo das chamadas ao Keycloak.
    const rl = await verificacaoEmailLimiter.consume(`${ipDe(req)}::verificar-email`);
    if (rl.limited) {
      return redireccionar(req, 'limitada');
    }

    const token = req.nextUrl.searchParams.get('t')?.trim();
    if (!token) return redireccionar(req, 'invalida');

    const validacao = validarTokenVerificacao(token);
    if (!validacao.ok) {
      if (validacao.motivo === 'expirada') {
        logger.info({ evento: 'verificacao.expirada' }, '[verificacao] ligação fora do prazo');
        return redireccionar(req, 'expirada');
      }
      logger.warn(
        { evento: 'verificacao.expirada', motivo: validacao.motivo },
        '[verificacao] ligação recusada',
      );
      return redireccionar(req, 'invalida');
    }

    // 2. Escrita idempotente no Keycloak. Uma segunda visita dentro do prazo
    //    volta a passar aqui e volta a responder `ok` — é o comportamento
    //    pretendido, não um efeito colateral tolerado.
    try {
      await marcarEmailVerificado(validacao.sub);
    } catch (e) {
      logger.error(
        { sub: validacao.sub, err: (e as Error)?.message },
        '[verificacao] marcação no Keycloak falhou',
      );
      return redireccionar(req, 'erro');
    }

    // Sem PII: o `sub` é opaco; o endereço vai na carga assinada e fica lá.
    logger.info(
      { evento: 'verificacao.concluida', sub: validacao.sub },
      '[verificacao] endereço confirmado',
    );

    // A sessão em curso só dá por isto na re-resolução seguinte (ADR-0011,
    // 15 min): o estado vive no Keycloak e viaja no access token (ADR-0031
    // §6). O aviso do painel di-lo a quem acabou de confirmar.
    return redireccionar(req, 'ok');
  },
  { public: true },
);
