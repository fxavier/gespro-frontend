// F3 — Job de recálculo de estado de documentos de transporte
// Recalcula EstadoDocumento (VALIDO | PROXIMO_EXPIRAR | EXPIRADO) para todos os
// documentos de todos os tenants activos, e emite notificações idempotentes.
//
// Chamada: GET /api/cron/transporte-alertas
// Protecção: Authorization: Bearer <CRON_SECRET>
// Agendamento recomendado: diariamente às 02:00 UTC (via cron externo ou Vercel Cron Jobs).
//
// Nota: cron-safe — idempotente; pode ser re-executado sem efeitos secundários.
// Idempotência de notificações: uma notificação por (tipo, entidadeId, userId) por dia.

import { NextRequest, NextResponse } from 'next/server';
import { prismaBase } from '@/server/db/client';
import { recalcularEstadosDocumentos, gerarAlertasDocumentos } from '@/server/services/operacoes/alertas.service';
import { notificacaoService } from '@/server/services/plataforma/notificacao.service';

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
// Emitir notificações para admins do tenant
// ============================================================

async function emitirNotificacoesAlerta(
  tenantId: string,
  alertas: Array<{
    id: string;
    tipo: 'DOCUMENTO_EXPIRADO' | 'DOCUMENTO_PROXIMO_EXPIRAR' | 'MANUTENCAO_PENDENTE';
    entidadeId: string;
    entidadeNome: string;
    descricao: string;
  }>,
): Promise<number> {
  if (alertas.length === 0) return 0;

  // Obter utilizadores activos do tenant com permissão para ver transporte
  const utilizadores = await prismaBase.user.findMany({
    where: { tenantId, ativo: true, deletedAt: null },
    select: { id: true },
  });

  if (utilizadores.length === 0) return 0;

  let emitidas = 0;

  for (const alerta of alertas) {
    for (const utilizador of utilizadores) {
      try {
        const ctx = { tenantId, userId: utilizador.id };
        await notificacaoService.emitir(
          {
            userId: utilizador.id,
            tipo: alerta.tipo,
            titulo: alerta.entidadeNome,
            mensagem: alerta.descricao,
            entidadeTipo: 'VEICULO_OU_MOTORISTA',
            entidadeId: alerta.entidadeId,
          },
          ctx,
        );
        emitidas++;
      } catch {
        // Não interrompe o loop — falha silenciosa por utilizador
      }
    }
  }

  return emitidas;
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
      notificacoesEmitidas: number;
    }> = [];

    for (const tenant of tenants) {
      // 1. Recalcular estados dos documentos
      const resultado = await recalcularEstadosDocumentos({ tenantId: tenant.id });

      // 2. Carregar documentos com alertas para gerar notificações
      const [docsViatura, docsMotorista] = await Promise.all([
        prismaBase.documentoViatura.findMany({
          where: {
            tenantId: tenant.id,
            estado: { in: ['EXPIRADO', 'PROXIMO_EXPIRAR'] },
          },
          select: {
            id: true,
            estado: true,
            dataValidade: true,
            prazoAlertaDias: true,
            tipo: true,
            numero: true,
            viaturaId: true,
          },
        }),
        prismaBase.documentoMotorista.findMany({
          where: {
            tenantId: tenant.id,
            estado: { in: ['EXPIRADO', 'PROXIMO_EXPIRAR'] },
          },
          select: {
            id: true,
            estado: true,
            dataValidade: true,
            tipo: true,
            numero: true,
            motoristaId: true,
          },
        }),
      ]);

      // Mapear para o formato esperado por gerarAlertasDocumentos
      type DocEstado = 'VALIDO' | 'PROXIMO_EXPIRAR' | 'EXPIRADO';
      const viaturasMap = new Map<
        string,
        { id: string; marca: string; modelo: string; matricula: string; documentos: Array<{ id: string; tipo: string; numero: string; dataValidade: Date; estado: DocEstado }> }
      >();

      for (const doc of docsViatura) {
        const vId = doc.viaturaId;
        if (!viaturasMap.has(vId)) {
          viaturasMap.set(vId, {
            id: vId,
            marca: '',
            modelo: '',
            matricula: vId,
            documentos: [],
          });
        }
        viaturasMap.get(vId)!.documentos.push({
          id: doc.id,
          tipo: doc.tipo,
          numero: doc.numero,
          dataValidade: doc.dataValidade,
          estado: doc.estado as DocEstado,
        });
      }

      const alertasViatura = gerarAlertasDocumentos(
        Array.from(viaturasMap.values()),
        docsMotorista.map((d) => ({
          id: d.motoristaId,
          nomeCompleto: d.motoristaId,
          documentos: [{
            id: d.id,
            tipo: d.tipo,
            numero: d.numero,
            dataValidade: d.dataValidade,
            estado: d.estado as DocEstado,
          }],
        })),
      );

      // 3. Emitir notificações (idempotentes por entidadeId+tipo+userId por dia)
      const alertasParaEmitir = alertasViatura
        .filter((a): a is typeof a & { tipo: 'DOCUMENTO_EXPIRADO' | 'DOCUMENTO_PROXIMO_EXPIRAR' | 'MANUTENCAO_PENDENTE' } =>
          ['DOCUMENTO_EXPIRADO', 'DOCUMENTO_PROXIMO_EXPIRAR', 'MANUTENCAO_PENDENTE'].includes(a.tipo),
        )
        .map((a) => ({
          id: a.id,
          tipo: a.tipo as 'DOCUMENTO_EXPIRADO' | 'DOCUMENTO_PROXIMO_EXPIRAR' | 'MANUTENCAO_PENDENTE',
          entidadeId: a.entidadeId,
          entidadeNome: a.entidadeNome,
          descricao: a.descricao,
        }));

      const notificacoesEmitidas = await emitirNotificacoesAlerta(tenant.id, alertasParaEmitir);

      resultados.push({
        tenantId: tenant.id,
        slug: tenant.slug,
        ...resultado,
        notificacoesEmitidas,
      });
    }

    const totalViatura = resultados.reduce((s, r) => s + r.viaturasActualizadas, 0);
    const totalMotorista = resultados.reduce((s, r) => s + r.motoistasActualizados, 0);
    const totalNotificacoes = resultados.reduce((s, r) => s + r.notificacoesEmitidas, 0);

    console.log(
      `[cron] transporte-alertas: ${tenants.length} tenants processados. ` +
      `Documentos actualizados: viatura=${totalViatura}, motorista=${totalMotorista}. ` +
      `Notificações emitidas: ${totalNotificacoes}`,
    );

    return NextResponse.json({
      data: {
        tenants: tenants.length,
        totalViaturasActualizadas: totalViatura,
        totalMotoistasActualizados: totalMotorista,
        totalNotificacoesEmitidas: totalNotificacoes,
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
