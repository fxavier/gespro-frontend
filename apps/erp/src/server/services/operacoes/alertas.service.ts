// Serviço de Alertas — WS F (Wave 2)
// Porta src/services/transporte-alertas.service.ts para a nova camada Prisma.
// gerarAlertasDocumentos + gerarAlertasManutencao são funções puras.
// recalcularEstadosDocumentos usa Prisma (F3 — agendado por cron).

import 'server-only';
import { prisma } from '@/server/db/client';
import { calcularEstadoDocumento } from './alocacao.service';
import type {
  IAlertasService,
  Alerta,
  ViaturaComDocumentos,
  MotoristaComDocumentos,
  ManutencaoViaturaRef,
} from './alertas.interface';

// ============================================================
// gerarAlertasDocumentos (pure)
// ============================================================

export function gerarAlertasDocumentos(
  viaturas: ViaturaComDocumentos[],
  motoristas: MotoristaComDocumentos[],
): Alerta[] {
  const alertas: Alerta[] = [];
  const agora = new Date();

  for (const viatura of viaturas) {
    for (const doc of viatura.documentos) {
      if (doc.estado === 'VALIDO') continue;

      const urgencia = doc.estado === 'EXPIRADO' ? 'CRITICO' : 'AVISO';
      const descricao =
        doc.estado === 'EXPIRADO'
          ? `Viatura ${viatura.matricula}: ${doc.tipo} (nº ${doc.numero}) expirou em ${formatarData(doc.dataValidade)}.`
          : `Viatura ${viatura.matricula}: ${doc.tipo} (nº ${doc.numero}) expira em ${formatarData(doc.dataValidade)}.`;

      alertas.push({
        id: `alerta-viat-doc-${viatura.id}-${doc.id}`,
        tipo: doc.estado === 'EXPIRADO' ? 'DOCUMENTO_EXPIRADO' : 'DOCUMENTO_PROXIMO_EXPIRAR',
        urgencia,
        entidade: 'VIATURA',
        entidadeId: viatura.id,
        entidadeNome: `${viatura.marca} ${viatura.modelo} (${viatura.matricula})`,
        descricao,
        dataAlerta: agora,
      });
    }
  }

  for (const motorista of motoristas) {
    for (const doc of motorista.documentos) {
      if (doc.estado === 'VALIDO') continue;

      const urgencia = doc.estado === 'EXPIRADO' ? 'CRITICO' : 'AVISO';
      const descricao =
        doc.estado === 'EXPIRADO'
          ? `Motorista ${motorista.nomeCompleto}: ${doc.tipo} (nº ${doc.numero}) expirou em ${formatarData(doc.dataValidade)}.`
          : `Motorista ${motorista.nomeCompleto}: ${doc.tipo} (nº ${doc.numero}) expira em ${formatarData(doc.dataValidade)}.`;

      alertas.push({
        id: `alerta-mot-doc-${motorista.id}-${doc.id}`,
        tipo: doc.estado === 'EXPIRADO' ? 'DOCUMENTO_EXPIRADO' : 'DOCUMENTO_PROXIMO_EXPIRAR',
        urgencia,
        entidade: 'MOTORISTA',
        entidadeId: motorista.id,
        entidadeNome: motorista.nomeCompleto,
        descricao,
        dataAlerta: agora,
      });
    }
  }

  return alertas;
}

// ============================================================
// gerarAlertasManutencao (pure)
// ============================================================

export function gerarAlertasManutencao(
  viaturas: ViaturaComDocumentos[],
  manutencoes: ManutencaoViaturaRef[],
): Alerta[] {
  const alertas: Alerta[] = [];
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const viaturasPorId = new Map(viaturas.map((v) => [v.id, v]));

  for (const m of manutencoes) {
    if (m.tipo !== 'PREVENTIVA') continue;
    if (!m.proximaManutencaoData) continue;

    const proxData = new Date(m.proximaManutencaoData);
    proxData.setHours(0, 0, 0, 0);

    if (proxData > hoje) continue;

    const viatura = viaturasPorId.get(m.viaturaId);
    const entidadeNome = viatura
      ? `${viatura.marca} ${viatura.modelo} (${viatura.matricula})`
      : m.viaturaId;

    const descricao = viatura
      ? `Viatura ${viatura.matricula}: manutenção preventiva prevista para ${formatarData(proxData)} está em atraso.`
      : `Viatura ${m.viaturaId}: manutenção preventiva prevista para ${formatarData(proxData)} está em atraso.`;

    alertas.push({
      id: `alerta-manut-${m.id}`,
      tipo: 'MANUTENCAO_PENDENTE',
      urgencia: 'AVISO',
      entidade: 'VIATURA',
      entidadeId: m.viaturaId,
      entidadeNome,
      descricao,
      dataAlerta: new Date(),
    });
  }

  return alertas;
}

// ============================================================
// recalcularEstadosDocumentos (F3 — efeito de lado DB)
// ============================================================

export async function recalcularEstadosDocumentos(ctx: {
  tenantId: string;
}): Promise<{ viaturasActualizadas: number; motoistasActualizados: number }> {
  const { tenantId } = ctx;

  // Carregar todos os documentos do tenant
  const [docsViatura, docsMotorista] = await Promise.all([
    prisma.documentoViatura.findMany({
      where: { tenantId },
      select: { id: true, dataValidade: true, prazoAlertaDias: true, estado: true },
    }),
    prisma.documentoMotorista.findMany({
      where: { tenantId },
      select: { id: true, dataValidade: true, estado: true },
    }),
  ]);

  let viaturasActualizadas = 0;
  let motoistasActualizados = 0;

  // Actualizar documentos de viatura com estado desactualizado
  for (const doc of docsViatura) {
    const estadoCalculado = calcularEstadoDocumento(doc.dataValidade, doc.prazoAlertaDias);
    // Mapear para enum Prisma
    const estadoPrisma =
      estadoCalculado === 'EXPIRADO'
        ? ('EXPIRADO' as const)
        : estadoCalculado === 'PROXIMO_EXPIRAR'
          ? ('PROXIMO_EXPIRAR' as const)
          : ('VALIDO' as const);

    if (doc.estado !== estadoPrisma) {
      await prisma.documentoViatura.update({
        where: { id: doc.id },
        data: { estado: estadoPrisma },
      });
      viaturasActualizadas++;
    }
  }

  // Actualizar documentos de motorista (prazoAlertaDias = 30 por defeito)
  for (const doc of docsMotorista) {
    const estadoCalculado = calcularEstadoDocumento(doc.dataValidade, 30);
    const estadoPrisma =
      estadoCalculado === 'EXPIRADO'
        ? ('EXPIRADO' as const)
        : estadoCalculado === 'PROXIMO_EXPIRAR'
          ? ('PROXIMO_EXPIRAR' as const)
          : ('VALIDO' as const);

    if (doc.estado !== estadoPrisma) {
      await prisma.documentoMotorista.update({
        where: { id: doc.id },
        data: { estado: estadoPrisma },
      });
      motoistasActualizados++;
    }
  }

  return { viaturasActualizadas, motoistasActualizados };
}

// ============================================================
// Instância do serviço (singleton)
// ============================================================

export const alertasService: IAlertasService = {
  gerarAlertasDocumentos,
  gerarAlertasManutencao,
  recalcularEstadosDocumentos,
};

// ============================================================
// Utilitário interno
// ============================================================

function formatarData(data: Date): string {
  return new Date(data).toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
