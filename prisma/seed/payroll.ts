/**
 * Seed — Payroll (Spec 06): tabelas paramétricas INSS/IRPS versionadas por
 * vigência + folha de demonstração (mês anterior, PENDENTE).
 *
 * FONTES OFICIAIS (obrigatório validar antes de alterar):
 *
 * INSS — taxa contributiva do sistema obrigatório: total 7% (entidade
 * empregadora 4%, trabalhador 3%). Lei 4/2007 de 7 de Fevereiro (Protecção
 * Social) e Decreto 51/2017 de 9 de Outubro (Regulamento da Segurança Social
 * Obrigatória). Confirmação: https://www.inss.gov.mz/taxa-contributiva-tco/
 *
 * IRPS — tabela progressiva do art. 54 do Código do IRPS (Lei 20/2013 de
 * 23 de Setembro, que republica o CIRPS aprovado pela Lei 33/2007), taxas
 * anuais mensalizadas (limites e parcelas a abater ÷ 12):
 *   até 42.000 MT/ano → 10% (parcela 0)
 *   42.001–168.000 → 15% (parcela 2.100)
 *   168.001–504.000 → 20% (parcela 10.500)
 *   504.001–1.512.000 → 25% (parcela 35.700)
 *   > 1.512.000 → 32% (parcela 141.540)
 * Confirmação: https://www.at.gov.mz/por/Processos-Fiscais/Imposto-sobre-o-Rendimento-de-Pessoas-Singulares-IRPS
 *
 * ⚠ REFORMA FISCAL 2026: a reforma altera o mínimo tributável e elimina a
 * isenção de 36 salários mínimos. Quando o diploma final for publicado no
 * Boletim da República, criar uma NOVA vigência (novos registos EscalaoIRPS
 * com vigenciaInicio na data de entrada em vigor) — NUNCA alterar código nem
 * os registos históricos. Ver docs/handoff/feat-06-payroll.md.
 *
 * Exporta: seedPayroll(prisma, tenantId)
 */
import { Prisma, type PrismaClient } from '@prisma/client';
// Motor puro (sem I/O, sem 'server-only') — partilhado com o serviço.
import {
  calcularPayroll,
  type EscalaoIRPSVigente,
  type TabelaINSSVigente,
} from '../../src/server/services/pessoas-projetos/payroll-calculo';

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

const VIGENCIA_INSS = new Date(Date.UTC(2018, 0, 1)); // Decreto 51/2017 em vigor
const VIGENCIA_IRPS = new Date(Date.UTC(2024, 0, 1)); // tabela art. 54 CIRPS (Lei 20/2013)

const ESCALOES_IRPS_MENSAL = [
  { ordem: 1, limiteInferior: '0.00', limiteSuperior: '3500.00', taxa: '0.10', parcelaAbater: '0.00' },
  { ordem: 2, limiteInferior: '3500.00', limiteSuperior: '14000.00', taxa: '0.15', parcelaAbater: '175.00' },
  { ordem: 3, limiteInferior: '14000.00', limiteSuperior: '42000.00', taxa: '0.20', parcelaAbater: '875.00' },
  { ordem: 4, limiteInferior: '42000.00', limiteSuperior: '126000.00', taxa: '0.25', parcelaAbater: '2975.00' },
  { ordem: 5, limiteInferior: '126000.00', limiteSuperior: null, taxa: '0.32', parcelaAbater: '11795.00' },
] as const;

export async function seedPayroll(prisma: PrismaClient, tenantId: string): Promise<void> {
  // ─── TabelaINSS (idempotente por tenant + vigenciaInicio) ──────────────────
  let tabelaInss = await prisma.tabelaINSS.findFirst({
    where: { tenantId, vigenciaInicio: VIGENCIA_INSS },
  });
  if (!tabelaInss) {
    tabelaInss = await prisma.tabelaINSS.create({
      data: {
        tenantId,
        vigenciaInicio: VIGENCIA_INSS,
        vigenciaFim: null,
        taxaTrabalhador: D('0.03'),
        taxaEntidade: D('0.04'),
        tetoIncidencia: null,
        descricao:
          'Lei 4/2007 + Decreto 51/2017 — taxa contributiva 7% (entidade 4%, trabalhador 3%). Fonte: inss.gov.mz/taxa-contributiva-tco',
      },
    });
  }
  console.log('Payroll: TabelaINSS vigente (3% / 4%)');

  // ─── EscalaoIRPS (idempotente por tenant + vigenciaInicio + ordem) ─────────
  for (const e of ESCALOES_IRPS_MENSAL) {
    const existente = await prisma.escalaoIRPS.findFirst({
      where: { tenantId, vigenciaInicio: VIGENCIA_IRPS, ordem: e.ordem, numeroDependentes: 0 },
    });
    if (!existente) {
      await prisma.escalaoIRPS.create({
        data: {
          tenantId,
          vigenciaInicio: VIGENCIA_IRPS,
          vigenciaFim: null,
          ordem: e.ordem,
          limiteInferior: D(e.limiteInferior),
          limiteSuperior: e.limiteSuperior !== null ? D(e.limiteSuperior) : null,
          taxa: D(e.taxa),
          parcelaAbater: D(e.parcelaAbater),
          numeroDependentes: 0,
          descricao:
            'Art. 54 CIRPS (Lei 20/2013) mensalizado — REVER com a reforma fiscal 2026 (nova vigência, não editar)',
        },
      });
    }
  }
  console.log(`Payroll: ${ESCALOES_IRPS_MENSAL.length} escalões IRPS vigentes`);

  // ─── Folha de demonstração (mês anterior, PENDENTE) ────────────────────────
  const agora = new Date();
  const mesAnterior = agora.getUTCMonth() === 0 ? 12 : agora.getUTCMonth();
  const anoRef = agora.getUTCMonth() === 0 ? agora.getUTCFullYear() - 1 : agora.getUTCFullYear();

  const jaExiste = await prisma.folhaPagamento.findFirst({
    where: { tenantId, anoReferencia: anoRef, mesReferencia: mesAnterior },
  });
  if (jaExiste) {
    console.log(`Payroll: folha demo ${mesAnterior}/${anoRef} já existe`);
    return;
  }

  const colaboradores = await prisma.colaborador.findMany({
    where: { tenantId, status: 'ACTIVO', deletedAt: null },
    select: {
      id: true,
      salarioBase: true,
      subsidioAlimentacao: true,
      subsidioTransporte: true,
      subsidioHabitacao: true,
      subsidiosOutros: true,
    },
  });
  if (colaboradores.length === 0) {
    console.log('Payroll: sem colaboradores activos — folha demo não criada');
    return;
  }

  const tabelaInssVigente: TabelaINSSVigente = {
    taxaTrabalhador: tabelaInss.taxaTrabalhador,
    taxaEntidade: tabelaInss.taxaEntidade,
    tetoIncidencia: tabelaInss.tetoIncidencia,
  };
  const escaloesVigentes: EscalaoIRPSVigente[] = ESCALOES_IRPS_MENSAL.map((e) => ({
    ordem: e.ordem,
    limiteInferior: D(e.limiteInferior),
    limiteSuperior: e.limiteSuperior !== null ? D(e.limiteSuperior) : null,
    taxa: D(e.taxa),
    parcelaAbater: D(e.parcelaAbater),
  }));

  const folha = await prisma.folhaPagamento.create({
    data: {
      tenantId,
      anoReferencia: anoRef,
      mesReferencia: mesAnterior,
      status: 'PENDENTE',
    },
  });

  const ZERO = D(0);
  let totalBruto = ZERO;
  let totalInssTrab = ZERO;
  let totalInssEnt = ZERO;
  let totalIrps = ZERO;
  let totalLiquido = ZERO;
  let totalCusto = ZERO;

  for (const col of colaboradores) {
    const r = calcularPayroll({
      salarioBase: col.salarioBase,
      subsidios: {
        alimentacao: col.subsidioAlimentacao ?? ZERO,
        transporte: col.subsidioTransporte ?? ZERO,
        habitacao: col.subsidioHabitacao ?? ZERO,
        outros: col.subsidiosOutros ?? ZERO,
      },
      variaveis: { horasExtras: ZERO, comissoes: ZERO, bonus: ZERO, outros: ZERO },
      descontosDiversos: [],
      tabelaInss: tabelaInssVigente,
      escaloesIrps: escaloesVigentes,
    });

    const payroll = await prisma.payroll.create({
      data: {
        tenantId,
        colaboradorId: col.id,
        mesReferencia: mesAnterior,
        anoReferencia: anoRef,
        folhaId: folha.id,
        salarioBruto: r.bruto,
        descontoInss: r.inssTrabalhador,
        descontoIrps: r.irps,
        descontoOutros: r.outrosDescontos,
        proventoSubAlimentacao: col.subsidioAlimentacao ?? ZERO,
        proventoSubTransporte: col.subsidioTransporte ?? ZERO,
        proventoSubHabitacao: col.subsidioHabitacao ?? ZERO,
        proventoOutros: col.subsidiosOutros ?? ZERO,
        salarioLiquido: r.liquido,
        encargoInssEntidade: r.inssEntidade,
        custoTotalEntidade: r.custoTotalEntidade,
        status: 'PENDENTE',
      },
    });
    await prisma.linhaPayroll.createMany({
      data: r.linhas.map((l) => ({
        tenantId,
        payrollId: payroll.id,
        tipo: l.tipo,
        natureza: l.natureza,
        descricao: l.descricao,
        valor: l.valor,
        manual: false,
      })),
    });

    totalBruto = totalBruto.plus(r.bruto);
    totalInssTrab = totalInssTrab.plus(r.inssTrabalhador);
    totalInssEnt = totalInssEnt.plus(r.inssEntidade);
    totalIrps = totalIrps.plus(r.irps);
    totalLiquido = totalLiquido.plus(r.liquido);
    totalCusto = totalCusto.plus(r.custoTotalEntidade);
  }

  await prisma.folhaPagamento.update({
    where: { id: folha.id },
    data: {
      totalBruto,
      totalInssTrabalhador: totalInssTrab,
      totalInssEntidade: totalInssEnt,
      totalIrps,
      totalOutrosDescontos: ZERO,
      totalLiquido,
      totalCustoEntidade: totalCusto,
    },
  });

  console.log(
    `Payroll: folha demo ${mesAnterior}/${anoRef} criada (${colaboradores.length} colaboradores, PENDENTE)`,
  );
}
