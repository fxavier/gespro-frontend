import { NextResponse, type NextRequest } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { buildCorsHeaders } from '@/lib/api/cors';
import { registoLimiter } from '@/server/security/rate-limiter';
import { verificarCaptcha } from '@/server/security/captcha';
import { RegistoTenantSchema } from '@/lib/validations/onboarding';
import { AppError } from '@/lib/errors';
import { logger } from '@/server/observability/logger';
import { getRequestContext } from '@/server/observability/context';
import { type PlanoId } from '@/lib/planos';
import { provisionarTenant } from '@/server/services/plataforma/tenant-provisioning.service';
import { criarSubscricaoTrial } from '@/server/services/plataforma/assinatura.service';
import { dispararEmailAccoes } from '@/server/auth/keycloak';
import {
  concluirChave,
  falharChave,
  fingerprintDe,
  reservarChave,
} from '@/server/provisioning/idempotencia';

/**
 * POST /api/publico/registo — registo self-service (público, sem sessão).
 *
 * Reescrito pelo ADR-0013: SEM campo `senha` e SEM `handoffToken`. O registo
 * cria a identidade no Keycloak (VERIFY_EMAIL + UPDATE_PASSWORD pendentes),
 * provisiona o tenant em Postgres, e dispara o `execute-actions-email` — é
 * esse e-mail, e só ele, que dá entrada no produto. Resposta 201
 * `{ tenantSlug, mensagem }`; erros `{ traceId, erro }` — sem stack.
 * Contrato com o site actualizado em `docs/handoff/site-provisionamento.md` §2.
 *
 * Defesas, por ordem: rate-limit (IP) → `Idempotency-Key` obrigatória → Zod
 * estrito → rate-limit (e-mail) → captcha → provisionamento. O captcha vem
 * SEMPRE antes de tocar no Keycloak (execução paralela W8 §6-quater: este
 * endpoint faz o nosso servidor mandar correio para um endereço à escolha de
 * quem chama — amplificação), e depois do Zod de propósito (não se gasta uma
 * chamada ao fornecedor com um corpo inválido). A reentrega idempotente
 * responde antes do captcha porque não tem efeitos: devolve o corpo gravado.
 *
 * PONTO DE EXTENSÃO w8-anti-abuso (ADR-0016): quando o Turnstile ficar fixado,
 * a verificação vive em `verificarCaptcha` (CAPTCHA_PROVIDER) — a chamada
 * abaixo é o gancho; endurecê-la não deve reordenar o Keycloak para antes dela.
 *
 * Escreve tudo via `prismaBase` (sem contexto de tenant — o tenant é criado
 * aqui) e nunca aceita `tenantId` ou `slug` do cliente.
 */

const ENDPOINT = 'POST /api/publico/registo';
export const runtime = 'nodejs';

function ipDe(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  );
}

function traceId(): string {
  return getRequestContext()?.requestId ?? 'sem-trace';
}

function erro(
  status: number,
  codigo: string,
  mensagem: string,
  cors: Record<string, string>,
): Response {
  return NextResponse.json(
    {
      traceId: traceId(),
      erro: mensagem,
      error: { code: codigo, message: mensagem },
    },
    { status, headers: cors },
  );
}

const MENSAGEM_SUCESSO =
  'Conta criada. Verifique a sua caixa de correio: o e-mail de activação é onde confirma o endereço e define a palavra-passe.';

export const POST = withApi(
  async (req: NextRequest) => {
    const cors = buildCorsHeaders(req, {
      methods: 'POST, OPTIONS',
      allowedHeaders: 'Content-Type, Idempotency-Key',
      credentials: false,
    }) as Record<string, string>;

    // 1. Rate-limit por IP.
    const ip = ipDe(req);
    const rl = await registoLimiter.consume(`${ip}::registo`);
    if (rl.limited) {
      return NextResponse.json(
        { traceId: traceId(), erro: 'Demasiados pedidos. Tente mais tarde.' },
        { status: 429, headers: { ...cors, 'Retry-After': String(Math.max(1, rl.retryAfterSec)) } },
      );
    }

    // 2. Idempotency-Key obrigatória.
    const chave = req.headers.get('idempotency-key')?.trim();
    if (!chave || chave.length < 8 || chave.length > 200) {
      return erro(
        400,
        'IDEMPOTENCY_KEY_OBRIGATORIA',
        'Cabeçalho Idempotency-Key obrigatório.',
        cors,
      );
    }

    // 3. Corpo + validação Zod estrita.
    let corpo: unknown;
    try {
      corpo = await req.json();
    } catch {
      return erro(400, 'JSON_INVALIDO', 'Corpo do pedido inválido.', cors);
    }

    const parsed = RegistoTenantSchema.safeParse(corpo);
    if (!parsed.success) {
      return NextResponse.json(
        {
          traceId: traceId(),
          erro: 'Dados de registo inválidos.',
          error: {
            code: 'VALIDACAO',
            message: 'Dados de registo inválidos.',
            details: parsed.error.flatten(),
          },
        },
        { status: 422, headers: cors },
      );
    }
    const dados = parsed.data;

    // 4. Idempotência — reserva antes de qualquer efeito duradouro.
    const fingerprint = fingerprintDe(dados);
    const reserva = await reservarChave(chave, ENDPOINT, fingerprint);

    if (reserva.tipo === 'REPETIDA') {
      return NextResponse.json(reserva.resposta as object, { status: 201, headers: cors });
    }
    if (reserva.tipo === 'EM_CURSO') {
      return erro(
        409,
        'REGISTO_EM_CURSO',
        'Já existe um registo em curso com esta chave. Aguarde.',
        cors,
      );
    }
    if (reserva.tipo === 'CONFLITO') {
      return erro(
        409,
        'IDEMPOTENCY_KEY_REUTILIZADA',
        'Esta chave de idempotência já foi usada com dados diferentes.',
        cors,
      );
    }

    // 5. Rate-limit por email + captcha — OBRIGATORIAMENTE antes de qualquer
    //    toque no Keycloak (§6-quater): sem isto, a Admin API e o correio de
    //    activação passam a ser a superfície exposta de um endpoint anónimo.
    const rlEmail = await registoLimiter.consume(`${dados.admin.email}::registo`);
    if (rlEmail.limited) {
      await falharChave(chave);
      return NextResponse.json(
        { traceId: traceId(), erro: 'Demasiados pedidos para este email.' },
        {
          status: 429,
          headers: { ...cors, 'Retry-After': String(Math.max(1, rlEmail.retryAfterSec)) },
        },
      );
    }

    const captcha = await verificarCaptcha(dados.captchaToken, ip);
    if (!captcha.valido) {
      if (captcha.motivo === 'captcha_indisponivel') {
        // Modo degradado (ADR-0016 §modo degradado): Turnstile inacessível →
        // aceitar o registo com alerta. Um verificador em baixa não pode fechar
        // o funil comercial — as camadas 2 (rate-limit) e 4 (verificação de
        // e-mail) continuam de pé. O alerta deve ser monitorizado (ADR-0019).
        logger.warn({ ip, motivo: captcha.motivo }, '[registo] captcha indisponível — aceitar em modo degradado (ADR-0016)');
      } else {
        // 'captcha_invalido' ou 'captcha_nao_configurado': rejeitar.
        await falharChave(chave);
        return erro(
          403,
          'CAPTCHA_INVALIDO',
          'Verificação anti-robô falhou. Actualize a página e tente de novo.',
          cors,
        );
      }
    }

    // 6. Provisionamento: Keycloak primeiro, Postgres depois (ADR-0013 §2).
    let resultado;
    try {
      resultado = await provisionarTenant({
        empresa: dados.empresa,
        admin: dados.admin,
        planoId: dados.planoId as PlanoId,
        provincia: dados.provincia,
      });
    } catch (e) {
      await falharChave(chave);
      if (e instanceof AppError) {
        return erro(e.status, e.code, e.message, cors);
      }
      logger.error(
        { err: { message: (e as Error)?.message, stack: (e as Error)?.stack } },
        '[registo] falha inesperada no provisionamento',
      );
      return erro(500, 'ERRO_INTERNO', 'Não foi possível concluir o registo.', cors);
    }

    const resposta = { tenantSlug: resultado.tenantSlug, mensagem: MENSAGEM_SUCESSO };
    await concluirChave(chave, resposta, resultado.tenantId);

    // 7. Efeitos externos — FORA da transacção (persistir-depois-enviar).
    //    O e-mail de acções do Keycloak é a porta de entrada; a falha não
    //    desfaz o registo (o tenant existe e é reparável — reconciliação
    //    ADR-0013 §3 e reenvio por suporte), mas fica gritada no log.
    const enviado = await dispararEmailAccoes(resultado.keycloakSub);
    if (!enviado) {
      logger.error(
        { tenantId: resultado.tenantId, keycloakSub: resultado.keycloakSub },
        '[registo] e-mail de activação NÃO enviado — tenant sem porta de entrada até reenvio',
      );
    }

    // Subscrição de trial no Stripe: best-effort, não bloqueia a resposta nem o
    // acesso ao trial local. O cron de fallback cobre a falha.
    void criarSubscricaoTrial(resultado.tenantId, dados.planoId as PlanoId).catch(() => {});

    return NextResponse.json(resposta, { status: 201, headers: cors });
  },
  { public: true },
);

/**
 * Preflight. Tem de anunciar `Idempotency-Key` em `Access-Control-Allow-Headers`
 * — sem isso o browser recusa o POST antes sequer de o enviar, porque o header
 * obrigatório deste endpoint não consta da lista de omissão de `cors.ts`.
 */
export function OPTIONS(req: NextRequest): Response {
  return new Response(null, {
    status: 204,
    headers: buildCorsHeaders(req, {
      methods: 'POST, OPTIONS',
      allowedHeaders: 'Content-Type, Idempotency-Key',
      credentials: false,
    }),
  });
}
