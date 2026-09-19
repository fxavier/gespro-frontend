import { NextResponse, type NextRequest } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { logger } from '@/server/observability/logger';
import { prismaBase } from '@/server/db/client';
import { abrirExercicio } from '@/server/services/financas/contabilidade.service';

/**
 * GET /api/cron/abrir-exercicio — disparo automático da abertura do exercício (ADR-0033 §3).
 *
 * A 1 de Dezembro de cada ano, chama `abrirExercicio` para todos os tenants activos,
 * criando o ExercicioContabil + 13 PeriodoContabil + séries de documento para o
 * ano seguinte. Sem este passo, `proximoNumeroSerie` lançaria SERIE_NAO_ENCONTRADA
 * em todos os documentos de 1 de Janeiro em diante (ADR-0033 §4).
 *
 * Este endpoint é o **disparo automático** (cron). O disparo manual com RBAC está
 * na Server Action `abrirExercicio` em `contabilidade.actions.ts`, que verifica a
 * permissão `financas:exercicio:abrir` e é o **escritor** dessa permissão.
 *
 * Idempotente: @@unique([tenantId, codigo]) e skipDuplicates garantem que reexecutar
 * não duplica nem lança erro.
 *
 * Protecção: Authorization: Bearer <CRON_SECRET> verificado dentro do handler.
 * Agendamento: 1 de Dezembro, 02:00 UTC — ver infra/local/cron/crontab e o runbook.
 */
export const runtime = 'nodejs';

export const GET = withApi(
  async (req: NextRequest) => {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    const esperado = process.env.CRON_SECRET;
    if (!esperado || token !== esperado) {
      return NextResponse.json(
        { error: { code: 'NAO_AUTENTICADO', message: 'Token inválido.' } },
        { status: 401 },
      );
    }

    // Aceita ?ano=YYYY para abertura manual/forçada; caso contrário abre o ano seguinte.
    // Sem validação, `?ano=abc` dá NaN e atravessa o ciclo inteiro para falhar
    // tenant a tenant. Os limites são os mesmos do `AbrirExercicioSchema`.
    const paramAno = req.nextUrl.searchParams.get('ano');
    const anoAlvo = paramAno ? Number(paramAno) : new Date().getUTCFullYear() + 1;
    if (!Number.isInteger(anoAlvo) || anoAlvo < 2020 || anoAlvo > 2099) {
      return NextResponse.json(
        { error: { code: 'ANO_INVALIDO', message: 'O ano tem de ser um inteiro entre 2020 e 2099.' } },
        { status: 400 },
      );
    }

    // A `Assinatura` liga-se ao `Tenant` por `tenantId` escalar, sem `@relation`
    // (regra de FK cross-domínio; está escrita no comentário de `tenant.prisma`).
    // Não há filtro por relação para usar: lêem-se as assinaturas e filtram-se os
    // tenants pelos ids que sobram.
    const assinaturas = await prismaBase.assinatura.findMany({
      where: { estado: { in: ['TRIAL', 'ATIVA', 'LEITURA'] } },
      select: { tenantId: true },
    });

    const tenants = await prismaBase.tenant.findMany({
      where: {
        deletedAt: null,
        id: { in: assinaturas.map((a) => a.tenantId) },
      },
      select: { id: true, slug: true },
    });

    const resultados: Array<{
      tenantId: string;
      slug: string;
      seriesCriadas: number;
      erro?: string;
    }> = [];

    for (const tenant of tenants) {
      try {
        const resultado = await abrirExercicio(
          { ano: anoAlvo },
          { tenantId: tenant.id, userId: 'cron' },
        );
        resultados.push({ tenantId: tenant.id, slug: tenant.slug, seriesCriadas: resultado.seriesCriadas });
      } catch (e) {
        const msg = (e as Error)?.message ?? 'Erro desconhecido';
        logger.error({ tenantId: tenant.id, err: msg }, '[cron] abrir-exercicio falhou para tenant');
        resultados.push({ tenantId: tenant.id, slug: tenant.slug, seriesCriadas: 0, erro: msg });
      }
    }

    const nOk = resultados.filter((r) => !r.erro).length;
    const nErro = resultados.filter((r) => r.erro).length;

    logger.info({ anoAlvo, totalTenants: tenants.length, nOk, nErro }, '[cron] abrir-exercicio concluído');

    return NextResponse.json({
      data: { anoAlvo, totalTenants: tenants.length, nOk, nErro, resultados, timestamp: new Date().toISOString() },
    });
  },
  { public: true },
);
