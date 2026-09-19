import { NextResponse, type NextRequest } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { logger } from '@/server/observability/logger';
import { prismaBase } from '@/server/db/client';
import {
  abrirExercicio,
  deveAbrirHoje,
  diaCivilEmMaputo,
} from '@/server/services/financas/contabilidade.service';

/**
 * GET /api/cron/abrir-exercicio — disparo diário da abertura do exercício (ADR-0033 §3).
 *
 * Corre **todos os dias** às 02:00 UTC (04:00 Africa/Maputo). Para cada tenant activo,
 * verifica a configuração do seu calendário contabilístico:
 *
 * 1. `aberturaExercicioAutomatica === false` → salta (conta em `nSaltouConfig`).
 * 2. Hoje (em Africa/Maputo) não é o dia/mês configurados → salta (conta em `nSaltouData`).
 * 3. Caso contrário, abre o exercício do **ano civil corrente em Maputo** E do **seguinte**.
 *
 * Por que se abrem dois anos:
 * Com a data fixa a 1 de Dezembro, «ano + 1» era óbvio — preparava só o próximo ano.
 * Agora que a data é configurável, um tenant que escolha 1 de Março de 2027 precisa de ter
 * o exercício de 2027 (corrente) aberto, e de ter o de 2028 (seguinte) preparado. Abrir os
 * dois garante ambos. `abrirExercicio` é idempotente: no caso normal (Dezembro, corrente já
 * aberto há um ano) a chamada para o ano corrente não cria nada — retorna seriesCriadas=0.
 *
 * O `?ano=YYYY` força a abertura de **um** ano específico para todos os tenants, ignorando
 * `aberturaExercicioAutomatica` e a data configurada. É o caminho de recuperação de quem
 * descobre em Janeiro que o automatismo não correu.
 *
 * Por que é diário e não fixo a 1 de Dezembro:
 * O cron era `0 2 1 12 *` porque havia uma só data, global. Agora cada tenant configura
 * o seu dia/mês; um crontab com uma data por tenant não escala. A rota corre todos os dias
 * e cada tenant decide, pela sua configuração, se hoje é o seu dia.
 *
 * Fuso: o cron corre às 02:00 UTC, que são 04:00 Africa/Maputo (UTC+2, sem DST).
 * `deveAbrirHoje` e `diaCivilEmMaputo` convertem para Maputo — não UTC.
 * Exemplo crítico: 31/Dez às 22:30 UTC = 1/Jan em Maputo; `getUTCFullYear()` diria 2026,
 * `diaCivilEmMaputo().ano` diz 2027 — é este que manda.
 *
 * Idempotente: @@unique([tenantId, codigo]) garante que reexecutar não duplica nem lança erro.
 *
 * Protecção: Authorization: Bearer <CRON_SECRET> verificado dentro do handler.
 * Agendamento: diário, 02:00 UTC — ver infra/local/cron/crontab e o runbook.
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

    // `?ano=YYYY` força a abertura de um ano específico, ignorando a configuração de cada tenant.
    // Sem validação, `?ano=abc` daria NaN e atravessaria o ciclo inteiro para falhar tenant a tenant.
    // Os limites são os mesmos do `AbrirExercicioSchema`.
    const paramAno = req.nextUrl.searchParams.get('ano');
    const forcar = !!paramAno;
    const anoForcado = paramAno ? Number(paramAno) : null;
    if (forcar && (!Number.isInteger(anoForcado) || anoForcado! < 2020 || anoForcado! > 2099)) {
      return NextResponse.json(
        { error: { code: 'ANO_INVALIDO', message: 'O ano tem de ser um inteiro entre 2020 e 2099.' } },
        { status: 400 },
      );
    }

    // A `Assinatura` liga-se ao `Tenant` por `tenantId` escalar, sem `@relation`
    // (regra de FK cross-domínio; está escrita no comentário de `tenant.prisma`).
    const assinaturas = await prismaBase.assinatura.findMany({
      where: { estado: { in: ['TRIAL', 'ATIVA', 'LEITURA'] } },
      select: { tenantId: true },
    });

    const tenantIds = assinaturas.map((a) => a.tenantId);

    const tenants = await prismaBase.tenant.findMany({
      where: { deletedAt: null, id: { in: tenantIds } },
      select: { id: true, slug: true },
    });

    // Lê a configuração de todos os tenants activos de uma só vez para evitar N+1.
    // Tenants sem `ConfiguracaoFiscal` recebem os valores por omissão do schema.
    const configs = await prismaBase.configuracaoFiscal.findMany({
      where: { tenantId: { in: tenantIds } },
      select: {
        tenantId: true,
        aberturaExercicioAutomatica: true,
        diaAberturaExercicio: true,
        mesAberturaExercicio: true,
      },
    });

    const configPorTenant = new Map(configs.map((c) => [c.tenantId, c]));

    // Defaults espelham os @default do schema (auto=true, dia=1, mes=12 = 1 de Dezembro).
    const configDefault = {
      aberturaExercicioAutomatica: true,
      diaAberturaExercicio: 1,
      mesAberturaExercicio: 12,
    };

    const agora = new Date();

    // O ano civil usa o fuso de Maputo, não UTC.
    // Exemplo: 31/Dez/2026 às 22:30 UTC = 1/Jan/2027 em Maputo.
    // getUTCFullYear() devolveria 2026; diaCivilEmMaputo().ano devolve 2027 — é este que manda.
    const { ano: anoMaputo } = diaCivilEmMaputo(agora);

    const resultados: Array<{
      tenantId: string;
      slug: string;
      seriesCriadas: number;
      saltou?: 'config' | 'data';
      erro?: string;
    }> = [];

    for (const tenant of tenants) {
      const cfg = configPorTenant.get(tenant.id) ?? configDefault;

      // Com `?ano=` forçamos um único ano para todos os tenants, independentemente da configuração.
      if (!forcar && !deveAbrirHoje(cfg, agora)) {
        const motivo = cfg.aberturaExercicioAutomatica ? 'data' : 'config';
        resultados.push({ tenantId: tenant.id, slug: tenant.slug, seriesCriadas: 0, saltou: motivo });
        continue;
      }

      try {
        let seriesCriadas = 0;

        if (forcar) {
          // Modo forçado: abre exactamente o ano pedido.
          const resultado = await abrirExercicio(
            { ano: anoForcado! },
            { tenantId: tenant.id, userId: 'cron' },
          );
          seriesCriadas = resultado.seriesCriadas;
        } else {
          // Modo automático: abre o ano corrente em Maputo E o seguinte.
          // A chamada para o ano corrente é idempotente — na maior parte dos casos (Dezembro,
          // exercício corrente já aberto há um ano) retorna seriesCriadas=0 sem custo.
          for (const ano of [anoMaputo, anoMaputo + 1]) {
            const resultado = await abrirExercicio(
              { ano },
              { tenantId: tenant.id, userId: 'cron' },
            );
            seriesCriadas += resultado.seriesCriadas;
          }
        }

        resultados.push({ tenantId: tenant.id, slug: tenant.slug, seriesCriadas });
      } catch (e) {
        const msg = (e as Error)?.message ?? 'Erro desconhecido';
        logger.error({ tenantId: tenant.id, err: msg }, '[cron] abrir-exercicio falhou para tenant');
        resultados.push({ tenantId: tenant.id, slug: tenant.slug, seriesCriadas: 0, erro: msg });
      }
    }

    const nOk = resultados.filter((r) => !r.saltou && !r.erro).length;
    const nErro = resultados.filter((r) => r.erro).length;
    const nSaltouConfig = resultados.filter((r) => r.saltou === 'config').length;
    const nSaltouData = resultados.filter((r) => r.saltou === 'data').length;

    logger.info(
      { anoForcado, anoMaputo, totalTenants: tenants.length, nOk, nErro, nSaltouConfig, nSaltouData },
      '[cron] abrir-exercicio concluído',
    );

    return NextResponse.json({
      data: {
        anoForcado,
        anoMaputo,
        totalTenants: tenants.length,
        nOk,
        nErro,
        nSaltouConfig,
        nSaltouData,
        resultados,
        timestamp: agora.toISOString(),
      },
    });
  },
  { public: true },
);
