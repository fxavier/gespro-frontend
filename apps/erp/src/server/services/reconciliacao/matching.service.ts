import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type { Ctx } from '../types';
import {
  classificarSemCorrespondencia,
  transitarMovimento,
  type EstadoMovimento,
} from './reconciliacao.model';
import {
  ESTADOS_LIVRES,
  PASSAGENS,
  decidirDesfecho,
  emparelhar,
  regraLigada,
  type RegraAutomatica,
  type MovimentoParaMatch,
  type Proposta,
} from './matching';

// ---------------------------------------------------------------------------
// Motor de correspondência (ADR-0038 §5) — orquestração com a base de dados.
// Candidatos recuperados POR ÍNDICE, lote a lote (RF §19); cada correspondência
// numa $transaction própria que reclama os dois lados só se estiverem livres (RF §14).
// ---------------------------------------------------------------------------

const LOTE_BANCO = 200;
const LOTE_CLASSIFICACAO = 1000;
const MS_POR_DIA = 86_400_000;

export interface ResultadoMatching {
  propostas: number;
  confirmadas: number;
  sugeridas: number;
  comDiferencaValor: number;
  /** Propostas perdidas porque um dos lados foi reclamado entretanto (outra corrida, outro utilizador). */
  conflitos: number;
  /** Propostas descartadas porque o utilizador já rejeitou (reverteu) esse mesmo par. */
  jaRejeitadas: number;
  classificados: number;
}

const CONFLITO = 'MOVIMENTO_JA_CORRESPONDIDO';

const selectMovimento = {
  id: true,
  valor: true,
  natureza: true,
  referencia: true,
  referenciaNormalizada: true,
  descricao: true,
  estado: true,
} as const;

/**
 * Corre as seis passagens sobre todos os movimentos livres da conta, grava as
 * correspondências e classifica o que ficou sem par (RF §8, §9, §22).
 * Idempotente: um movimento com correspondência activa não volta a entrar.
 */
export async function executarMatching(contaBancariaId: string, ctx: Ctx): Promise<ResultadoMatching> {
  const conta = await prisma.contaBancaria.findFirst({
    where: { id: contaBancariaId, tenantId: ctx.tenantId },
    select: {
      id: true,
      toleranciaDias: true,
      toleranciaValor: true,
      permitirMatchPorReferencia: true,
      permitirMatchPorValor: true,
      permitirMatchPorDescricao: true,
      autoReconciliacao: true,
      limiarConfianca: true,
    },
  });
  if (!conta) throw new NotFoundError('Conta bancária não encontrada');

  const livres = {
    tenantId: ctx.tenantId,
    contaBancariaId,
    estado: { in: [...ESTADOS_LIVRES] },
    correspondenciaAtivaId: null,
  };
  const resultado: ResultadoMatching = {
    propostas: 0, confirmadas: 0, sugeridas: 0, comDiferencaValor: 0, conflitos: 0, jaRejeitadas: 0, classificados: 0,
  };

  // Passagem por fora, lotes por dentro: a prioridade da RF §6 é GLOBAL à conta.
  // Com os lotes por fora, uma regra fraca num lote reclamaria o par que uma
  // regra forte encontraria no lote seguinte.
  for (const regra of PASSAGENS) {
    if (!regraLigada(regra, conta)) continue;
    // Keyset por (dataMovimento, id): os movimentos reclamados saem do filtro, por
    // isso não se usa o cursor do Prisma (que precisaria da linha-cursor a casar).
    let ultimo: { data: Date; id: string } | null = null;
    for (;;) {
      const depois: Prisma.MovimentoBancarioWhereInput = ultimo
        ? { OR: [{ dataMovimento: { gt: ultimo.data } }, { dataMovimento: ultimo.data, id: { gt: ultimo.id } }] }
        : {};
      const lote = await prisma.movimentoBancario.findMany({
        where: { ...livres, ...depois },
        select: { ...selectMovimento, dataMovimento: true },
        orderBy: [{ dataMovimento: 'asc' }, { id: 'asc' }],
        take: LOTE_BANCO,
      });
      if (lote.length === 0) break;
      const fim = lote[lote.length - 1];
      ultimo = { data: fim.dataMovimento, id: fim.id };

      const bancos: MovimentoParaMatch[] = lote.map((m) => ({
        ...m, data: m.dataMovimento, documento: null, estado: m.estado as EstadoMovimento,
      }));
      const contabs = await candidatosContabilisticos(regra, bancos, livres, conta);
      const porId = new Map([...bancos, ...contabs].map((m) => [m.id, m]));

      for (const p of emparelhar(bancos, contabs, conta, [regra])) {
        resultado.propostas++;
        try {
          const desfecho = await gravarCorrespondencia(p, porId.get(p.bancoId)!, porId.get(p.contabilisticoId)!, conta, ctx);
          if (desfecho === 'JA_REJEITADA') resultado.jaRejeitadas++;
          else if (desfecho === 'DIFERENCA_VALOR') resultado.comDiferencaValor++;
          else if (desfecho === 'CONFIRMADA') resultado.confirmadas++;
          else resultado.sugeridas++;
        } catch (e) {
          if (e instanceof BusinessRuleError && e.code === CONFLITO) resultado.conflitos++;
          else throw e;
        }
      }
      if (lote.length < LOTE_BANCO) break;
    }
  }

  resultado.classificados = await classificarLivres(contaBancariaId, conta.toleranciaDias, ctx);
  return resultado;
}

/**
 * Uma query por lote e por passagem, servida por índice:
 *  - REFERENCIA_EXACTA: `referenciaNormalizada IN (…)` — índice [tenantId, contaBancariaId, referenciaNormalizada];
 *  - restantes: blocking key — um ramo OR por (natureza, valor) do lote, com faixa de valor
 *    ± toleranciaValor (0 em VALOR_NATUREZA_DATA) e janela de datas ± toleranciaDias —
 *    índice [tenantId, contaBancariaId, estado, natureza, valor, dataContabilistica].
 */
async function candidatosContabilisticos(
  regra: RegraAutomatica,
  bancos: MovimentoParaMatch[],
  livres: Prisma.MovimentoContabilisticoWhereInput,
  conta: { toleranciaDias: number; toleranciaValor: Prisma.Decimal },
): Promise<MovimentoParaMatch[]> {
  const folga = conta.toleranciaDias * MS_POR_DIA;
  const janela = (datas: Date[]) => ({
    gte: new Date(Math.min(...datas.map((d) => d.getTime())) - folga),
    lte: new Date(Math.max(...datas.map((d) => d.getTime())) + folga),
  });
  const select = { ...selectMovimento, dataContabilistica: true, documento: true };

  let where: Prisma.MovimentoContabilisticoWhereInput;
  if (regra === 'REFERENCIA_EXACTA') {
    const refs = [...new Set(bancos.map((b) => b.referenciaNormalizada).filter((r): r is string => r !== null))];
    if (refs.length === 0) return [];
    where = { ...livres, referenciaNormalizada: { in: refs }, dataContabilistica: janela(bancos.map((b) => b.data)) };
  } else {
    const tol = regra === 'VALOR_NATUREZA_DATA' ? new Prisma.Decimal(0) : conta.toleranciaValor;
    const grupos = new Map<string, MovimentoParaMatch[]>();
    for (const b of bancos) {
      const k = `${b.natureza}|${b.valor.toFixed(2)}`;
      grupos.set(k, [...(grupos.get(k) ?? []), b]);
    }
    const ramos = [...grupos.values()].map((g) => ({
      natureza: g[0].natureza,
      valor: { gte: g[0].valor.minus(tol), lte: g[0].valor.plus(tol) },
      dataContabilistica: janela(g.map((b) => b.data)),
    }));
    where = { ...livres, OR: ramos };
  }

  const linhas = await prisma.movimentoContabilistico.findMany({ where, select });
  return linhas.map((c) => ({ ...c, data: c.dataContabilistica, estado: c.estado as EstadoMovimento }));
}

async function gravarCorrespondencia(
  p: Proposta,
  banco: MovimentoParaMatch,
  contab: MovimentoParaMatch,
  conta: { id: string; autoReconciliacao: boolean; limiarConfianca: number; toleranciaValor: Prisma.Decimal },
  ctx: Ctx,
): Promise<'CONFIRMADA' | 'SUGERIDA' | 'DIFERENCA_VALOR' | 'JA_REJEITADA'> {
  // Rejeitar uma sugestão é revertê-la antes de confirmada; sem isto, a corrida seguinte
  // propunha-a outra vez. Uma reconciliação CONFIRMADA e depois desfeita não conta: pode
  // ter sido engano, e o motor pode voltar a propô-la. Fora da transacção de escrita: o
  // pior caso de uma corrida é uma sugestão repetida, que o utilizador rejeita outra vez.
  const rejeitada = await prisma.correspondenciaBancaria.count({
    where: {
      tenantId: ctx.tenantId,
      contaBancariaId: conta.id,
      revertida: true,
      confirmadaEm: null,
      linhasBanco: { some: { movimentoBancarioId: banco.id } },
      linhasContabilidade: { some: { movimentoContabilisticoId: contab.id } },
    },
  });
  if (rejeitada > 0) return 'JA_REJEITADA';

  const { confirmar, estadoAlvo } = decidirDesfecho(p, conta);
  for (const lado of [banco, contab]) {
    if (estadoAlvo && lado.estado !== estadoAlvo) transitarMovimento(lado.estado, estadoAlvo);
  }
  const agora = new Date();

  await prisma.$transaction(async (tx) => {
    const corr = await tx.correspondenciaBancaria.create({
      data: {
        tenantId: ctx.tenantId,
        contaBancariaId: conta.id,
        tipo: p.tipo,
        regra: p.regra,
        confianca: p.confianca,
        automatica: true,
        valorBanco: banco.valor,
        valorContabilistico: contab.valor,
        diferencaValor: p.diferencaValor,
        diferencaDias: p.diferencaDias,
        justificacao:
          confirmar && !p.diferencaValor.isZero()
            ? `Confirmada automaticamente: diferença de ${p.diferencaValor.toFixed(2)} dentro da tolerância da conta.`
            : null,
        confirmadaPorId: confirmar ? ctx.userId : null,
        confirmadaEm: confirmar ? agora : null,
        linhasBanco: { create: { tenantId: ctx.tenantId, movimentoBancarioId: banco.id } },
        linhasContabilidade: { create: { tenantId: ctx.tenantId, movimentoContabilisticoId: contab.id } },
      },
      select: { id: true },
    });

    // RF §14: reclama cada lado só se continuar livre e no estado lido. Qualquer
    // contagem ≠ 1 desfaz a transacção inteira, correspondência incluída.
    const data = { correspondenciaAtivaId: corr.id, ...(estadoAlvo && { estado: estadoAlvo }) };
    const b = await tx.movimentoBancario.updateMany({
      where: { id: banco.id, tenantId: ctx.tenantId, contaBancariaId: conta.id, estado: banco.estado, correspondenciaAtivaId: null },
      data,
    });
    const c = await tx.movimentoContabilistico.updateMany({
      where: { id: contab.id, tenantId: ctx.tenantId, contaBancariaId: conta.id, estado: contab.estado, correspondenciaAtivaId: null },
      data,
    });
    if (b.count !== 1 || c.count !== 1) {
      throw new BusinessRuleError(CONFLITO, 'Um dos movimentos já foi correspondido entretanto.');
    }
  });

  if (estadoAlvo === 'DIFERENCA_VALOR') return 'DIFERENCA_VALOR';
  return confirmar ? 'CONFIRMADA' : 'SUGERIDA';
}

/**
 * Classifica os movimentos que continuam sem correspondência. A data de
 * referência é o extracto mais recente da conta: sem extracto nenhum, nada foi
 * observado e o lado contabilístico não se classifica.
 */
async function classificarLivres(contaBancariaId: string, toleranciaDias: number, ctx: Ctx): Promise<number> {
  const base = { tenantId: ctx.tenantId, contaBancariaId, correspondenciaAtivaId: null };
  const { _max } = await prisma.movimentoBancario.aggregate({
    where: { tenantId: ctx.tenantId, contaBancariaId },
    _max: { dataMovimento: true },
  });
  const dataReferencia = _max.dataMovimento;
  if (!dataReferencia) return 0;

  const alvoBanco = classificarSemCorrespondencia({ lado: 'BANCO', dataMovimento: dataReferencia, dataReferencia, toleranciaDias });
  transitarMovimento('PENDENTE', alvoBanco);
  const { count } = await prisma.movimentoBancario.updateMany({
    where: { ...base, estado: 'PENDENTE' },
    data: { estado: alvoBanco },
  });
  let total = count;

  const aClassificar: EstadoMovimento[] = ['PENDENTE', 'EM_TRANSITO', 'CONTABILIDADE_SEM_BANCO'];
  let depoisDe: string | undefined;
  for (;;) {
    const lote = await prisma.movimentoContabilistico.findMany({
      where: { ...base, estado: { in: aClassificar }, ...(depoisDe && { id: { gt: depoisDe } }) },
      select: { id: true, estado: true, dataContabilistica: true },
      orderBy: { id: 'asc' },
      take: LOTE_CLASSIFICACAO,
    });
    if (lote.length === 0) break;
    depoisDe = lote[lote.length - 1].id;

    const mudancas = new Map<string, { atual: EstadoMovimento; alvo: EstadoMovimento; ids: string[] }>();
    for (const m of lote) {
      const atual = m.estado as EstadoMovimento;
      // Um lançamento posterior ao último extracto ainda não pôde ser observado pelo
      // banco: a idade conta-se a partir dele próprio, logo fica EM_TRANSITO.
      const referencia = m.dataContabilistica > dataReferencia ? m.dataContabilistica : dataReferencia;
      const alvo = classificarSemCorrespondencia({
        lado: 'CONTABILIDADE', dataMovimento: m.dataContabilistica, dataReferencia: referencia, toleranciaDias,
      });
      if (alvo === atual) continue;
      transitarMovimento(atual, alvo);
      const k = `${atual}>${alvo}`;
      const g = mudancas.get(k) ?? { atual, alvo, ids: [] };
      g.ids.push(m.id);
      mudancas.set(k, g);
    }
    for (const g of mudancas.values()) {
      const r = await prisma.movimentoContabilistico.updateMany({
        where: { ...base, id: { in: g.ids }, estado: g.atual },
        data: { estado: g.alvo },
      });
      total += r.count;
    }
    if (lote.length < LOTE_CLASSIFICACAO) break;
  }
  return total;
}
