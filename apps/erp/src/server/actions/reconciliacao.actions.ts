'use server';
import { Prisma } from '@prisma/client';
import { createSafeAction } from '@/server/safe-action';
import { BusinessRuleError } from '@/lib/errors';
import { extractoLimiter } from '@/server/security/rate-limiter';
import {
  AbrirPeriodoSchema,
  ConfirmarCorrespondenciasSchema,
  ContaBancariaIdSchema,
  DefinirIgnoradoSchema,
  EditarRegraSugestaoSchema,
  FecharPeriodoSchema,
  ImportarExtractoSchema,
  MovimentoBancarioIdSchema,
  PeriodoIdSchema,
  ProcurarContrapartidaSchema,
  ReconciliarManualmenteSchema,
  RegraSugestaoIdSchema,
  RegraSugestaoSchema,
  ReverterCorrespondenciaSchema,
} from '@/lib/validations/reconciliacao';
import { importarExtracto } from '@/server/services/reconciliacao/importacao.service';
import * as reconciliacao from '@/server/services/reconciliacao/reconciliacao.service';
import * as regrasSugestao from '@/server/services/reconciliacao/regras-sugestao.service';
import { listarContas } from '@/server/services/financas/contabilidade.service';

// ADR-0038 — Server Actions da reconciliação bancária automática. Todas com
// `financas:banca:reconciliacao` (RF §19 «Segurança»); as leituras declaram
// `permiteEmLeitura`. O ecrã novo nasce no nó UI; até lá revalida-se a rota actual.

const PERMISSAO = 'financas:banca:reconciliacao';
const REVALIDATE = { tags: ['reconciliacao'], paths: ['/contabilidade/reconciliacao'] };

/** Dia de `<input type="date">` → meio-dia local: o dia civil sobrevive ao fuso. */
function dataDoDia(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d, 12);
}

export const importarExtractoAction = createSafeAction({
  schema: ImportarExtractoSchema,
  permission: PERMISSAO,
  revalidate: REVALIDATE,
  handler: async ({ contaBancariaId, ficheiro }, ctx) => {
    // O tecto de 5 MB é do ficheiro comprimido: um XLSX pode expandir muito mais
    // em memória. Limitar o ritmo por utilizador fecha o que o tecto não fecha.
    const rl = await extractoLimiter.consume(`${ctx.userId}::extracto`);
    if (rl.limited) {
      throw new BusinessRuleError('LIMITE_PEDIDOS', `Demasiadas importações seguidas. Tente de novo dentro de ${rl.retryAfterSec} s.`);
    }
    return importarExtracto(
      { contaBancariaId, nomeFicheiro: ficheiro.name, conteudo: new Uint8Array(await ficheiro.arrayBuffer()) },
      ctx,
    );
  },
});

export const executarReconciliacaoAction = createSafeAction({
  schema: ContaBancariaIdSchema,
  permission: PERMISSAO,
  revalidate: REVALIDATE,
  handler: ({ contaBancariaId }, ctx) => reconciliacao.executarReconciliacao(contaBancariaId, ctx),
});

export const abrirPeriodoAction = createSafeAction({
  schema: AbrirPeriodoSchema,
  permission: PERMISSAO,
  revalidate: REVALIDATE,
  handler: (input, ctx) =>
    reconciliacao.abrirPeriodo(
      {
        contaBancariaId: input.contaBancariaId,
        dataInicio: dataDoDia(input.dataInicio),
        dataFim: dataDoDia(input.dataFim),
        saldoInicialBanco: new Prisma.Decimal(input.saldoInicialBanco),
        saldoFinalBanco: new Prisma.Decimal(input.saldoFinalBanco),
      },
      ctx,
    ),
});

export const fecharPeriodoAction = createSafeAction({
  schema: FecharPeriodoSchema,
  permission: PERMISSAO,
  revalidate: REVALIDATE,
  handler: (input, ctx) => reconciliacao.fecharPeriodoReconciliacao(input, ctx),
});

export const cancelarPeriodoAction = createSafeAction({
  schema: PeriodoIdSchema,
  permission: PERMISSAO,
  revalidate: REVALIDATE,
  handler: ({ periodoId }, ctx) => reconciliacao.cancelarPeriodoReconciliacao(periodoId, ctx),
});

export const confirmarCorrespondenciasAction = createSafeAction({
  schema: ConfirmarCorrespondenciasSchema,
  permission: PERMISSAO,
  revalidate: REVALIDATE,
  handler: (input, ctx) => reconciliacao.confirmarCorrespondencias(input, ctx),
});

export const reconciliarManualmenteAction = createSafeAction({
  schema: ReconciliarManualmenteSchema,
  permission: PERMISSAO,
  revalidate: REVALIDATE,
  handler: (input, ctx) => reconciliacao.reconciliarManualmente(input, ctx),
});

export const reverterCorrespondenciaAction = createSafeAction({
  schema: ReverterCorrespondenciaSchema,
  permission: PERMISSAO,
  revalidate: REVALIDATE,
  handler: ({ id }, ctx) => reconciliacao.reverterCorrespondencia(id, ctx),
});

export const definirIgnoradoAction = createSafeAction({
  schema: DefinirIgnoradoSchema,
  permission: PERMISSAO,
  revalidate: REVALIDATE,
  handler: (input, ctx) => reconciliacao.definirIgnorado(input, ctx),
});

// --- Leituras ---------------------------------------------------------------

export const obterMapaFechoAction = createSafeAction({
  schema: PeriodoIdSchema,
  permission: PERMISSAO,
  permiteEmLeitura: true,
  handler: ({ periodoId }, ctx) => reconciliacao.obterMapaFecho(periodoId, ctx),
});

export const sugerirLancamentoAction = createSafeAction({
  schema: MovimentoBancarioIdSchema,
  permission: PERMISSAO,
  permiteEmLeitura: true,
  handler: ({ movimentoBancarioId }, ctx) => reconciliacao.sugerirLancamento(movimentoBancarioId, ctx),
});

// --- Regras de sugestão de lançamento (issue #140) ---------------------------
// Escrita só com `financas:banca:reconciliacao`; não há eliminar (só desactivar).

const REVALIDATE_REGRAS = {
  tags: ['reconciliacao'],
  paths: ['/contabilidade/reconciliacao/regras', '/contabilidade/reconciliacao'],
};

export const criarRegraSugestaoAction = createSafeAction({
  schema: RegraSugestaoSchema,
  permission: PERMISSAO,
  revalidate: REVALIDATE_REGRAS,
  handler: (input, ctx) => regrasSugestao.criarRegraSugestao(input, ctx),
});

export const editarRegraSugestaoAction = createSafeAction({
  schema: EditarRegraSugestaoSchema,
  permission: PERMISSAO,
  revalidate: REVALIDATE_REGRAS,
  handler: (input, ctx) => regrasSugestao.editarRegraSugestao(input, ctx),
});

export const activarRegraSugestaoAction = createSafeAction({
  schema: RegraSugestaoIdSchema,
  permission: PERMISSAO,
  revalidate: REVALIDATE_REGRAS,
  handler: ({ id }, ctx) => regrasSugestao.activarRegraSugestao(id, ctx),
});

export const desactivarRegraSugestaoAction = createSafeAction({
  schema: RegraSugestaoIdSchema,
  permission: PERMISSAO,
  revalidate: REVALIDATE_REGRAS,
  handler: ({ id }, ctx) => regrasSugestao.desactivarRegraSugestao(id, ctx),
});

/** Pesquisa da contrapartida no formulário da regra: o plano tem mais folhas do que cabe numa lista. */
export const procurarContrapartidaRegraAction = createSafeAction({
  schema: ProcurarContrapartidaSchema,
  permission: PERMISSAO,
  permiteEmLeitura: true,
  handler: async ({ q }, ctx) => {
    const pagina = await listarContas({ search: q, aceitaLancamento: true, ativo: true, take: 30 }, ctx);
    return pagina.items.map((c) => ({ id: c.id, codigo: c.codigo, nome: c.nome }));
  },
});
