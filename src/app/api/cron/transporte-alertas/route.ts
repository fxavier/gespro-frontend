// F3 — Job de recálculo de estado de documentos de transporte
// Recalcula EstadoDocumento (VALIDO | PROXIMO_EXPIRAR | EXPIRADO) para todos os
// documentos de todos os tenants activos.
//
// Chamada: GET /api/cron/transporte-alertas
// Protecção: Authorization: Bearer <CRON_SECRET>
// Agendamento recomendado: diariamente às 02:00 UTC (via cron externo ou Vercel Cron Jobs).
//
// Nota: cron-safe — idempotente; pode ser re-executado sem efeitos secundários.

import { NextRequest, NextResponse } from 'next/server';
import { prismaBase } from '@/server/db/client';
import { recalcularEstadosDocumentos } from '@/server/services/operacoes/alertas.service';

// ============================================================
// Protecção por token
// ============================================================

function verificarToken(request: NextRequest): boolean {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  const esperado = process.env.CRON_SECRET;
  if (!esperado) return false;
  return token === esperado;
}

// ============================================================
// Handler
// ============================================================

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verificarToken(request)) {
    return NextResponse.json(
      { error: { code: 'NAO_AUTENTICADO', message: 'Token inválido.' } },
      { status: 401 },
    );
  }

  try {
    // Obter todos os tenants activos
    const tenants = await prismaBase.tenant.findMany({
      select: { id: true, slug: true },
    });

    const resultados: Array<{
      tenantId: string;
      slug: string;
      viaturasActualizadas: number;
      motoistasActualizados: number;
    }> = [];

    for (const tenant of tenants) {
      const resultado = await recalcularEstadosDocumentos({ tenantId: tenant.id });
      resultados.push({
        tenantId: tenant.id,
        slug: tenant.slug,
        ...resultado,
      });
    }

    const totalViatura = resultados.reduce((s, r) => s + r.viaturasActualizadas, 0);
    const totalMotorista = resultados.reduce((s, r) => s + r.motoistasActualizados, 0);

    console.log(
      `[cron] transporte-alertas: ${tenants.length} tenants processados. ` +
      `Documentos actualizados: viatura=${totalViatura}, motorista=${totalMotorista}`,
    );

    return NextResponse.json({
      data: {
        tenants: tenants.length,
        totalViaturasActualizadas: totalViatura,
        totalMotoistasActualizados: totalMotorista,
        resultados,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[cron] transporte-alertas error:', err);
    return NextResponse.json(
      { error: { code: 'ERRO_INTERNO', message: 'Erro no processamento do cron.' } },
      { status: 500 },
    );
  }
}
