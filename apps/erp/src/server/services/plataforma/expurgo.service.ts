import 'server-only';
import { prismaBase } from '@/server/db/client';
import { logger } from '@/server/observability/logger';
import { eliminarUtilizador } from '@/server/auth/keycloak';

/**
 * Expurgo de registos não verificados (ADR-0016 Camada 4).
 *
 * Um utilizador "não verificado" é aquele que completou o formulário de registo
 * mas nunca clicou no link de activação do Keycloak — `primeiroAcessoEm` é
 * `null`, o que significa que nunca entrou no ERP.
 *
 * Ao fim de 7 dias sem verificação:
 *   1. Elimina o utilizador do realm Keycloak (best-effort, idempotente).
 *   2. Elimina o tenant de Postgres numa transacção (cascade apaga tudo).
 *
 * O critério para o tenant ser elegível: NENHUM dos seus utilizadores tem
 * `primeiroAcessoEm != null`. Se alguém do tenant já entrou (convite aceite ou
 * outro utilizador), o tenant não é expurgado.
 *
 * Idempotente: correr duas vezes não tem efeito na segunda corrida.
 *
 * Aviso: este serviço usa `prismaBase` (sem contexto de tenant) porque opera
 * transversalmente a vários tenants — é uma operação de plataforma.
 */

const DIAS_EXPURGO = 7;

export interface ResultadoExpurgo {
  elegiveisEncontrados: number;
  expurgados: number;
  falhas: number;
  timestamp: string;
}

export async function expurgarRegistosNaoVerificados(): Promise<ResultadoExpurgo> {
  const limiar = new Date(Date.now() - DIAS_EXPURGO * 24 * 60 * 60 * 1000);

  // Encontrar tenants elegíveis: criados há mais de 7 dias e SEM nenhum
  // utilizador que já tenha entrado (primeiroAcessoEm IS NOT NULL).
  const tenantsCandidatos = await prismaBase.tenant.findMany({
    where: {
      createdAt: { lt: limiar },
      // Só tenants onde TODOS os utilizadores têm primeiroAcessoEm null.
      // "none" = não existe nenhum user com primeiroAcessoEm não-null.
      users: { none: { primeiroAcessoEm: { not: null } } },
    },
    select: {
      id: true,
      slug: true,
      users: {
        select: { id: true, keycloakSub: true, email: true },
      },
    },
  });

  if (tenantsCandidatos.length === 0) {
    logger.info({}, '[expurgo] nenhum registo não verificado elegível para expurgo');
    return {
      elegiveisEncontrados: 0,
      expurgados: 0,
      falhas: 0,
      timestamp: new Date().toISOString(),
    };
  }

  logger.info(
    { elegiveisEncontrados: tenantsCandidatos.length },
    '[expurgo] registos não verificados encontrados',
  );

  let expurgados = 0;
  let falhas = 0;

  for (const tenant of tenantsCandidatos) {
    try {
      // 1. Eliminar cada utilizador do Keycloak (best-effort, não lança em 404).
      for (const user of tenant.users) {
        try {
          await eliminarUtilizador(user.keycloakSub);
        } catch (e) {
          // Falha no Keycloak não impede a eliminação local: o Keycloak sem
          // User local é inofensivo (sem autorização possível — ADR-0011).
          // A reconciliação diária reporta o órfão.
          logger.warn(
            {
              err: (e as Error)?.message,
              sub: user.keycloakSub,
              tenantSlug: tenant.slug,
            },
            '[expurgo] falha ao eliminar utilizador do Keycloak — a continuar',
          );
        }
      }

      // 2. Eliminar o tenant de Postgres (cascade apaga User, UserRole,
      //    Assinatura, ConfiguracaoFiscal, PGC, Notificacao, etc.).
      await prismaBase.tenant.delete({ where: { id: tenant.id } });

      logger.info(
        { tenantId: tenant.id, tenantSlug: tenant.slug, utilizadores: tenant.users.length },
        '[expurgo] tenant não verificado eliminado',
      );
      expurgados++;
    } catch (e) {
      falhas++;
      logger.error(
        { err: { message: (e as Error)?.message }, tenantId: tenant.id, tenantSlug: tenant.slug },
        '[expurgo] falha ao expurgar tenant — a continuar para o seguinte',
      );
    }
  }

  logger.info(
    { elegiveisEncontrados: tenantsCandidatos.length, expurgados, falhas },
    '[expurgo] ciclo concluído',
  );

  return {
    elegiveisEncontrados: tenantsCandidatos.length,
    expurgados,
    falhas,
    timestamp: new Date().toISOString(),
  };
}
