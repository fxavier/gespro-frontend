import 'server-only';
import { randomUUID } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { Prisma } from '@prisma/client';
import { prismaBase } from '@/server/db/client';
import { BusinessRuleError } from '@/lib/errors';
import { logger } from '@/server/observability/logger';
import { TRIAL_DIAS, type PlanoId } from '@/lib/planos';
import {
  bootstrapRbac,
  bootstrapContabilidade,
  garantirCatalogoPermissoes,
} from '@/server/provisioning/tenant-bootstrap';
import { emitirToken } from './handoff.service';

/**
 * Provisionamento self-service de tenants — spec 19, Requisito 1.
 *
 * FRONTEIRA PÚBLICA: corre **sem sessão e sem contexto de tenant** (o tenant
 * ainda não existe). Por isso usa `prismaBase` (cliente cru, sem a extensão
 * multi-tenant) e escreve `tenantId` EXPLICITAMENTE em todas as linhas.
 *
 * Tudo o que constitui o tenant acontece numa única `$transaction`: falha em
 * qualquer passo reverte tudo. Nunca fica um tenant parcial (sem plano de
 * contas, sem admin ou sem séries) — um estado desses seria invisível e só
 * apareceria à primeira factura.
 *
 * Efeitos externos (email, Stripe) ficam FORA da transacção: o padrão
 * "persistir-depois-enviar" da spec 13.
 */

export interface ProvisionarTenantInput {
  empresa: { nome: string; nuit: string };
  admin: { nome: string; email: string; senha: string };
  planoId: PlanoId;
  provincia: string;
}

export interface ResultadoProvisionamento {
  tenantId: string;
  tenantSlug: string;
  userId: string;
  adminEmail: string;
  adminNome: string;
  handoffToken: string;
  tokenVerificacaoEmail: string;
  notificacaoBoasVindasId: string;
}

const MAX_TENTATIVAS_SLUG = 5;
const TIMEOUT_TX_MS = 60_000;

// ---------------------------------------------------------------------------
// Slug — derivado do nome da empresa, NUNCA fornecido pelo cliente
// ---------------------------------------------------------------------------

/** Normaliza o nome da empresa num slug URL-safe (sem acentos, minúsculas). */
export function slugificar(nome: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacríticos (ã → a)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');

  // Um nome só com símbolos ("«»") degeneraria em slug vazio.
  return base.length >= 2 ? base : `empresa-${randomUUID().slice(0, 8)}`;
}

/**
 * Devolve um slug livre a partir do nome, acrescentando sufixo numérico em
 * colisão. É uma *sugestão*: a unicidade real é garantida pelo índice único e
 * pelo retry em P2002 — duas inscrições simultâneas com o mesmo nome não podem
 * ambas ganhar o mesmo slug só porque leram a DB ao mesmo tempo.
 */
export async function sugerirSlug(nome: string): Promise<string> {
  const base = slugificar(nome);
  const existentes = await prismaBase.tenant.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });
  const usados = new Set(existentes.map((t) => t.slug));
  if (!usados.has(base)) return base;

  for (let i = 2; i < 1000; i++) {
    const candidato = `${base}-${i}`;
    if (!usados.has(candidato)) return candidato;
  }
  return `${base}-${randomUUID().slice(0, 6)}`;
}

// ---------------------------------------------------------------------------
// Provisionamento
// ---------------------------------------------------------------------------

function isUniqueViolation(e: unknown, campo?: string): boolean {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== 'P2002') return false;
  if (!campo) return true;
  const alvo = e.meta?.target;
  const alvos = Array.isArray(alvo) ? alvo : typeof alvo === 'string' ? [alvo] : [];
  return alvos.some((a) => String(a).includes(campo));
}

/**
 * Cria o tenant completo numa única transacção atómica.
 *
 * Ordem: Tenant → ConfiguracaoFiscal → Assinatura (TRIAL) → RBAC → User admin
 * + role ADMIN → plano de contas PGC-NIRF + diários + séries → token de
 * verificação de email → Notificacao de boas-vindas (PENDENTE) → token de
 * handoff. Nada disto é observável se um passo falhar.
 */
export async function provisionarTenant(
  input: ProvisionarTenantInput,
): Promise<ResultadoProvisionamento> {
  // NUIT é único por Tenant — verificar antes de gastar CPU no hash de argon2.
  const nuitExistente = await prismaBase.tenant.findFirst({
    where: { nuit: input.empresa.nuit },
    select: { id: true },
  });
  if (nuitExistente) {
    throw new BusinessRuleError(
      'NUIT_JA_REGISTADO',
      'Já existe uma conta registada com este NUIT. Inicie sessão ou recupere a palavra-passe.',
    );
  }

  // Hash fora da transacção: argon2 demora ~100 ms e não deve segurar locks.
  const passwordHash = await hash(input.admin.senha);

  // Catálogo global de permissões também fora: é partilhado por todos os
  // tenants, e escrevê-lo dentro da tx punha dois registos concorrentes a
  // disputar o mesmo índice único (deadlock possível num endpoint público).
  await garantirCatalogoPermissoes(prismaBase);

  let ultimoErro: unknown;
  for (let tentativa = 0; tentativa < MAX_TENTATIVAS_SLUG; tentativa++) {
    const slug = await sugerirSlug(input.empresa.nome);
    try {
      return await executarProvisionamento(input, slug, passwordHash);
    } catch (e) {
      // Corrida no slug: outro registo apanhou-o entre a sugestão e o commit.
      if (isUniqueViolation(e, 'slug')) {
        ultimoErro = e;
        continue;
      }
      if (isUniqueViolation(e, 'nuit')) {
        throw new BusinessRuleError(
          'NUIT_JA_REGISTADO',
          'Já existe uma conta registada com este NUIT.',
        );
      }
      throw e;
    }
  }

  logger.error({ err: (ultimoErro as Error)?.message }, '[provisionamento] slug esgotado');
  throw new BusinessRuleError(
    'SLUG_INDISPONIVEL',
    'Não foi possível reservar um identificador para a empresa. Tente novamente.',
  );
}

async function executarProvisionamento(
  input: ProvisionarTenantInput,
  slug: string,
  passwordHash: string,
): Promise<ResultadoProvisionamento> {
  const agora = new Date();
  const trialFim = new Date(agora.getTime() + TRIAL_DIAS * 24 * 60 * 60 * 1000);
  const tokenVerificacao = randomUUID();
  const expiraVerificacao = new Date(agora.getTime() + 48 * 60 * 60 * 1000);

  return prismaBase.$transaction(
    async (tx) => {
      // 1. Tenant
      const tenant = await tx.tenant.create({
        data: { nome: input.empresa.nome, slug, nuit: input.empresa.nuit },
        select: { id: true, slug: true },
      });
      const tenantId = tenant.id;

      // 2. Configuração fiscal — moeda e fuso do tenant são sempre MZ.
      await tx.configuracaoFiscal.create({
        data: {
          tenantId,
          planoAssinatura: input.planoId as never,
          statusAtivo: true,
          email: input.admin.email,
          provincia: input.provincia,
          moedaBase: 'MZN',
          timezone: 'Africa/Maputo',
        },
      });

      // 3. Assinatura em TRIAL (sem cartão). Sem montantes: o Stripe é a fonte
      //    de verdade do valor cobrado (ADR-0009).
      await tx.assinatura.create({
        data: {
          tenantId,
          planoAssinatura: input.planoId as never,
          estado: 'TRIAL',
          trialInicio: agora,
          trialFim,
        },
      });

      // 4. RBAC do tenant (catálogo global + roles de sistema)
      const roles = await bootstrapRbac(tx, tenantId);
      const roleAdmin = roles.find((r) => r.nome === 'ADMIN');
      if (!roleAdmin) {
        throw new BusinessRuleError(
          'RBAC_INCOMPLETO',
          'Falha ao preparar os perfis de acesso do tenant.',
        );
      }

      // 5. Utilizador administrador — emailVerificado=false bloqueia o login
      //    até o link de verificação ser usado (Requisito 1.6).
      const user = await tx.user.create({
        data: {
          tenantId,
          nome: input.admin.nome,
          email: input.admin.email,
          passwordHash,
          ativo: true,
          emailVerificado: false,
        },
        select: { id: true },
      });
      await tx.userRole.create({ data: { userId: user.id, roleId: roleAdmin.id } });

      // 6. Plano de contas PGC-NIRF, diários e séries de documento
      await bootstrapContabilidade(tx, tenantId);

      // 7. Token de verificação de email (consumo atómico no endpoint público)
      await tx.tokenVerificacaoEmail.create({
        data: {
          token: tokenVerificacao,
          tenantId,
          userId: user.id,
          expiraEm: expiraVerificacao,
        },
      });

      // 8. Notificação de boas-vindas — persistida PENDENTE; o email sai fora
      //    da transacção (padrão persistir-depois-enviar, spec 13).
      const notificacao = await tx.notificacao.create({
        data: {
          tenantId,
          userId: user.id,
          tipo: 'ALERTA_SISTEMA',
          canal: 'EMAIL',
          titulo: 'Bem-vindo ao GestPro',
          mensagem: `A conta de ${input.empresa.nome} está pronta. Tem ${TRIAL_DIAS} dias de teste gratuito.`,
          entidadeTipo: 'ASSINATURA',
          entidadeId: tenantId,
          estadoEnvio: 'PENDENTE',
        },
        select: { id: true },
      });

      // 9. Token de handoff (uso único, TTL ~60s) — emitido dentro da tx para
      //    que um rollback não deixe um `jti` órfão utilizável.
      const handoffToken = await emitirToken({ tenantId, userId: user.id }, tx);

      return {
        tenantId,
        tenantSlug: tenant.slug,
        userId: user.id,
        adminEmail: input.admin.email,
        adminNome: input.admin.nome,
        handoffToken,
        tokenVerificacaoEmail: tokenVerificacao,
        notificacaoBoasVindasId: notificacao.id,
      };
    },
    { timeout: TIMEOUT_TX_MS, maxWait: 10_000 },
  );
}

// ---------------------------------------------------------------------------
// Verificação de email — consumo atómico
// ---------------------------------------------------------------------------

export interface ResultadoVerificacao {
  tenantId: string;
  userId: string;
  tenantSlug: string;
}

/**
 * Consome o token de verificação e marca o email como verificado.
 *
 * `updateMany ... WHERE token = ? AND usadoEm IS NULL AND expiraEm > now()` é um
 * único statement: dois cliques no link não verificam duas vezes.
 * Devolve `null` em token inválido/expirado/já usado — sem revelar o motivo.
 */
export async function verificarEmail(token: string): Promise<ResultadoVerificacao | null> {
  const registo = await prismaBase.tokenVerificacaoEmail.findUnique({
    where: { token },
    select: { tenantId: true, userId: true },
  });
  if (!registo) return null;

  const { count } = await prismaBase.tokenVerificacaoEmail.updateMany({
    where: { token, usadoEm: null, expiraEm: { gt: new Date() } },
    data: { usadoEm: new Date() },
  });
  if (count !== 1) return null;

  const agora = new Date();
  await prismaBase.user.updateMany({
    where: { id: registo.userId, tenantId: registo.tenantId },
    data: { emailVerificado: true, emailVerificadoEm: agora },
  });

  const tenant = await prismaBase.tenant.findFirst({
    where: { id: registo.tenantId },
    select: { slug: true },
  });

  return {
    tenantId: registo.tenantId,
    userId: registo.userId,
    tenantSlug: tenant?.slug ?? '',
  };
}

export const tenantProvisioningService = {
  provisionarTenant,
  verificarEmail,
  slugificar,
  sugerirSlug,
};
