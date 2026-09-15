import 'server-only';
import { randomUUID } from 'node:crypto';
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
import { garantirUtilizador } from '@/server/auth/keycloak';

/**
 * Provisionamento self-service de tenants — spec 19, Requisito 1, revisto
 * pelo ADR-0013 (Keycloak).
 *
 * FRONTEIRA PÚBLICA: corre **sem sessão e sem contexto de tenant** (o tenant
 * ainda não existe). Por isso usa `prismaBase` (cliente cru, sem a extensão
 * multi-tenant) e escreve `tenantId` EXPLICITAMENTE em todas as linhas.
 *
 * Criar um tenant deixou de ser UMA transacção: são dois sistemas com estado.
 * A ordem é deliberada (ADR-0013 §2) — **Keycloak primeiro, Postgres depois**,
 * porque o lado sem transacção vai à frente:
 *   1. Identidade no Keycloak, SEM palavra-passe, com VERIFY_EMAIL +
 *      UPDATE_PASSWORD pendentes (idempotente por e-mail).
 *   2. Tenant/User/RBAC/PGC numa `$transaction` — falha reverte tudo.
 *   3. `execute-actions-email` (no route handler, fora da tx): é este e-mail
 *      — e só ele — que dá entrada no produto.
 * Se o passo 1 falhar, nada foi escrito e o pedido repete-se. Se o passo 2
 * falhar, fica um utilizador Keycloak órfão — detectável, reparável e
 * inofensivo (sem `User` local não há autorização nenhuma, ADR-0011). O
 * contrário — tenant sem identidade — seria um cliente pago sem forma de
 * entrar. A reconciliação diária (§3) reporta divergências.
 *
 * Efeitos externos (e-mail de acções, Stripe) ficam FORA da transacção: o
 * padrão "persistir-depois-enviar" da spec 13.
 */

export interface ProvisionarTenantInput {
  empresa: { nome: string; nuit: string };
  /** SEM senha (ADR-0013 §5): a palavra-passe é definida no Keycloak. */
  admin: { nome: string; email: string };
  planoId: PlanoId;
  provincia: string;
}

export interface ResultadoProvisionamento {
  tenantId: string;
  tenantSlug: string;
  userId: string;
  /** `sub` do admin no Keycloak — para o route handler disparar o e-mail de acções. */
  keycloakSub: string;
  adminEmail: string;
  adminNome: string;
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
 * Provisiona o tenant: identidade no Keycloak primeiro (fora de qualquer
 * transacção — ADR-0013 §2), depois a `$transaction` Postgres com
 * Tenant → ConfiguracaoFiscal → Assinatura (TRIAL) → RBAC → User admin
 * (com `keycloakSub`) + role ADMIN → plano de contas PGC-NIRF + diários +
 * séries → Notificacao de boas-vindas (in-app). Nada do lado Postgres é
 * observável se um passo falhar.
 */
export async function provisionarTenant(
  input: ProvisionarTenantInput,
): Promise<ResultadoProvisionamento> {
  const email = input.admin.email.toLowerCase().trim();

  // NUIT é único por Tenant.
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

  // O e-mail é único em TODO o sistema (CONTEXT.md): uma Identidade pertence a
  // exactamente um Tenant. A mensagem tem de o dizer com estas palavras — não
  // com «e-mail inválido» (ADR-0013, Consequências).
  const emailExistente = await prismaBase.user.findFirst({
    where: { email },
    select: { id: true },
  });
  if (emailExistente) {
    throw new BusinessRuleError(
      'EMAIL_JA_REGISTADO',
      'Este endereço de e-mail já está associado a uma conta GestPro. Cada pessoa tem uma única identidade, numa única empresa — quem gere duas empresas precisa de dois endereços de e-mail distintos.',
    );
  }

  // Catálogo global de permissões fora da tx: é partilhado por todos os
  // tenants, e escrevê-lo dentro da tx punha dois registos concorrentes a
  // disputar o mesmo índice único (deadlock possível num endpoint público).
  await garantirCatalogoPermissoes(prismaBase);

  // KEYCLOAK PRIMEIRO (ADR-0013 §2): identidade sem palavra-passe, acções
  // pendentes. Idempotente por e-mail — repetir o pedido reutiliza o `sub`.
  const { sub: keycloakSub } = await garantirUtilizador({ email, nome: input.admin.nome });

  let ultimoErro: unknown;
  for (let tentativa = 0; tentativa < MAX_TENTATIVAS_SLUG; tentativa++) {
    const slug = await sugerirSlug(input.empresa.nome);
    try {
      return await executarProvisionamento({ ...input, admin: { ...input.admin, email } }, slug, keycloakSub);
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
  keycloakSub: string,
): Promise<ResultadoProvisionamento> {
  const agora = new Date();
  const trialFim = new Date(agora.getTime() + TRIAL_DIAS * 24 * 60 * 60 * 1000);

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

      // 5. Utilizador administrador — espelho local da identidade Keycloak.
      //    A verificação de e-mail e a definição de palavra-passe são acções
      //    pendentes NO KEYCLOAK; o login só fecha depois de cumpridas.
      const user = await tx.user.create({
        data: {
          tenantId,
          keycloakSub,
          nome: input.admin.nome,
          email: input.admin.email,
          ativo: true,
        },
        select: { id: true },
      });
      await tx.userRole.create({ data: { userId: user.id, roleId: roleAdmin.id } });

      // 6. Plano de contas PGC-NIRF, diários e séries de documento
      await bootstrapContabilidade(tx, tenantId);

      // 7. Notificação de boas-vindas — in-app (o único e-mail do registo é o
      //    de acções do Keycloak, ADR-0013 §5; um segundo e-mail nosso seria
      //    ruído a competir com o único clique que interessa).
      const notificacao = await tx.notificacao.create({
        data: {
          tenantId,
          userId: user.id,
          tipo: 'ALERTA_SISTEMA',
          canal: 'IN_APP',
          titulo: 'Bem-vindo ao GestPro',
          mensagem: `A conta de ${input.empresa.nome} está pronta. Tem ${TRIAL_DIAS} dias de teste gratuito.`,
          entidadeTipo: 'ASSINATURA',
          entidadeId: tenantId,
        },
        select: { id: true },
      });

      return {
        tenantId,
        tenantSlug: tenant.slug,
        userId: user.id,
        keycloakSub,
        adminEmail: input.admin.email,
        adminNome: input.admin.nome,
        notificacaoBoasVindasId: notificacao.id,
      };
    },
    { timeout: TIMEOUT_TX_MS, maxWait: 10_000 },
  );
}

export const tenantProvisioningService = {
  provisionarTenant,
  slugificar,
  sugerirSlug,
};
