import { NextResponse, type NextRequest } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { buildCorsHeaders, corsPreflightResponse } from '@/lib/api/cors';
import { registoLimiter } from '@/server/security/rate-limiter';
import { verificarCaptcha } from '@/server/security/captcha';
import { RegistoTenantSchema } from '@/lib/validations/onboarding';
import { AppError } from '@/lib/errors';
import { logger } from '@/server/observability/logger';
import { getRequestContext } from '@/server/observability/context';
import { emailProvider } from '@/server/email';
import { boasVindasTemplate } from '@/server/email/templates/boas-vindas';
import { prismaBase } from '@/server/db/client';
import { TRIAL_DIAS, type PlanoId } from '@/lib/planos';
import { provisionarTenant } from '@/server/services/plataforma/tenant-provisioning.service';
import { criarSubscricaoTrial } from '@/server/services/plataforma/assinatura.service';
import {
  concluirChave,
  falharChave,
  fingerprintDe,
  reservarChave,
} from '@/server/provisioning/idempotencia';

/**
 * POST /api/publico/registo — registo self-service (público, sem sessão).
 *
 * Contrato congelado com o site de marketing (spec 18):
 * `docs/handoff/site-provisionamento.md` §2. Resposta 201
 * `{ tenantSlug, handoffToken }`; erros `{ traceId, erro }` — sem stack.
 *
 * Defesas, por ordem: rate-limit (IP) → `Idempotency-Key` obrigatória → Zod
 * estrito → captcha → provisionamento atómico. O captcha vem depois do Zod de
 * propósito: não se gasta uma chamada ao provedor de captcha com um corpo que
 * nem sequer é válido.
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

function urlBase(): string {
  return (process.env.APP_URL ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000').replace(
    /\/$/,
    '',
  );
}

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

    // 5. Rate-limit por email + captcha (só depois de o corpo ser válido).
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
      await falharChave(chave);
      return erro(
        403,
        'CAPTCHA_INVALIDO',
        'Verificação anti-robô falhou. Actualize a página e tente de novo.',
        cors,
      );
    }

    // 6. Provisionamento atómico.
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

    const resposta = {
      tenantSlug: resultado.tenantSlug,
      handoffToken: resultado.handoffToken,
    };
    await concluirChave(chave, resposta, resultado.tenantId);

    // 7. Efeitos externos — FORA da transacção (persistir-depois-enviar).
    await enviarBoasVindas(resultado);

    // Subscrição de trial no Stripe: best-effort, não bloqueia a resposta nem o
    // acesso ao trial local. O cron de fallback cobre a falha.
    void criarSubscricaoTrial(resultado.tenantId, dados.planoId as PlanoId).catch(() => {});

    return NextResponse.json(resposta, { status: 201, headers: cors });
  },
  { public: true },
);

async function enviarBoasVindas(resultado: {
  tenantId: string;
  adminEmail: string;
  adminNome: string;
  tokenVerificacaoEmail: string;
  notificacaoBoasVindasId: string;
}): Promise<void> {
  const link = `${urlBase()}/api/publico/verificar-email?token=${encodeURIComponent(
    resultado.tokenVerificacaoEmail,
  )}`;

  const tenant = await prismaBase.tenant.findFirst({
    where: { id: resultado.tenantId },
    select: { nome: true },
  });

  const { html, texto } = boasVindasTemplate({
    nomeUtilizador: resultado.adminNome,
    nomeEmpresa: tenant?.nome ?? 'a sua empresa',
    linkVerificacao: link,
    trialDias: TRIAL_DIAS,
  });

  try {
    await emailProvider.enviar({
      para: resultado.adminEmail,
      assunto: 'Bem-vindo ao GestPro — confirme o seu email',
      html,
      texto,
    });
    await prismaBase.notificacao.updateMany({
      where: { id: resultado.notificacaoBoasVindasId, tenantId: resultado.tenantId },
      data: { estadoEnvio: 'ENVIADO', enviadoEm: new Date() },
    });
  } catch (e) {
    // O tenant existe e o token é válido: a falha de email não invalida o
    // registo. Fica FALHA para reenvio manual/job.
    logger.error(
      { tenantId: resultado.tenantId, err: (e as Error)?.message },
      '[registo] falha ao enviar email de boas-vindas',
    );
    await prismaBase.notificacao.updateMany({
      where: { id: resultado.notificacaoBoasVindasId, tenantId: resultado.tenantId },
      data: { estadoEnvio: 'FALHA', erroEnvio: 'Falha no envio do email de boas-vindas' },
    });
  }
}

export function OPTIONS(req: NextRequest): Response {
  return corsPreflightResponse(req);
}
