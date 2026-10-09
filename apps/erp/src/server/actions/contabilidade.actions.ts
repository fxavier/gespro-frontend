'use server';
import { createSafeAction } from '@/server/safe-action';
import {
  CriarContaPGCSchema,
  AtualizarContaPGCSchema,
  FiltroContaPGCSchema,
  CriarDiarioSchema,
  AtualizarDiarioSchema,
  CriarCentroCustoSchema,
  AtualizarCentroCustoSchema,
  FiltroCentroCustoSchema,
  CriarLancamentoSchema,
  EstornarLancamentoSchema,
  EditarLancamentoSchema,
  AnularLancamentoSchema,
  FiltroLancamentoSchema,
  CriarContaBancariaSchema,
  AtualizarContaBancariaSchema,
  DefinirContaBancariaActivaSchema,
  FiltroBalanceteSchema,
  FiltroRazaoSchema,
  FiltroDRESchema,
  FecharPeriodoSchema,
  ReabrirPeriodoSchema,
  ListarPeriodosSchema,
  AbrirExercicioSchema,
  EncerrarExercicioSchema,
  ReabrirExercicioSchema,
  EncerrarExercicioDefinitivoSchema,
  ArquivarEncerramentoSchema,
  AplicarResultadoSchema,
  AnularAplicacaoResultadoSchema,
  DefinirContaMeioPagamentoPOSSchema,
  DefinirContaNaturezaNotaDebitoSchema,
  ProcurarContasNaturezaNotaDebitoSchema,
  ProcurarContasLancamentoSchema,
  ProcurarContasMaeSchema,
} from '@/lib/validations/contabilidade';
import { CalendarioContabilisticoSchema } from '@/lib/validations/plataforma';
import * as contabilidade from '@/server/services/financas/contabilidade.service';
import * as meioPagamento from '@/server/services/financas/meio-pagamento.service';
import * as naturezaNotaDebito from '@/server/services/financas/natureza-nota-debito.service';
import { classeAdmitidaParaNatureza } from '@/lib/nota-debito';
import * as encerramento from '@/server/services/financas/encerramento-exercicio.service';
import * as aplicacaoResultado from '@/server/services/financas/aplicacao-resultado.service';
import { z } from 'zod';
import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { logger } from '@/server/observability/logger';
import { idEntidade } from '@/lib/validations/common';
import { diaIsoParaData } from '@/lib/format-date';

// --- Plano de contas ---

export const criarContaPGC = createSafeAction({
  schema: CriarContaPGCSchema,
  permission: 'financas:plano-contas:escrita',
  revalidate: { tags: ['contabilidade', 'contas-pgc'] },
  handler: (input, ctx) => contabilidade.criarConta(input, ctx),
});

export const atualizarContaPGC = createSafeAction({
  schema: AtualizarContaPGCSchema,
  permission: 'financas:plano-contas:escrita',
  revalidate: { tags: ['contabilidade', 'contas-pgc'] },
  handler: (input, ctx) => contabilidade.atualizarConta(input, ctx),
});

export const desativarContaPGC = createSafeAction({
  // `idEntidade` e não `cuid`: as contas PGC nascem com uuid (ver common.ts).
  schema: z.object({ id: idEntidade('ID de conta inválido') }),
  permission: 'financas:plano-contas:escrita',
  revalidate: { tags: ['contabilidade', 'contas-pgc'] },
  handler: (input, ctx) => contabilidade.desativarConta(input.id, ctx),
});

export const reativarContaPGC = createSafeAction({
  schema: z.object({ id: idEntidade('ID de conta inválido') }),
  permission: 'financas:plano-contas:escrita',
  revalidate: { tags: ['contabilidade', 'contas-pgc'] },
  handler: (input, ctx) => contabilidade.reativarConta(input.id, ctx),
});

export const listarContasPGC = createSafeAction({
  schema: FiltroContaPGCSchema,
  permission: 'financas:leitura',
  permiteEmLeitura: true,
  handler: (input, ctx) => contabilidade.listarContas(input, ctx),
});

export const arvoreContasPGC = createSafeAction({
  permission: 'financas:leitura',
  permiteEmLeitura: true,
  handler: (_, ctx) => contabilidade.arvoreContas(ctx),
});

// --- Diários ---

export const criarDiario = createSafeAction({
  schema: CriarDiarioSchema,
  permission: 'financas:diarios:escrita',
  revalidate: { tags: ['contabilidade', 'diarios'] },
  handler: (input, ctx) => contabilidade.criarDiario(input, ctx),
});

export const atualizarDiario = createSafeAction({
  schema: AtualizarDiarioSchema,
  permission: 'financas:diarios:escrita',
  revalidate: { tags: ['contabilidade', 'diarios'] },
  handler: (input, ctx) => contabilidade.atualizarDiario(input, ctx),
});

export const listarDiarios = createSafeAction({
  permission: 'financas:leitura',
  permiteEmLeitura: true,
  handler: (_, ctx) => contabilidade.listarDiarios(ctx),
});

// --- Centros de custo ---

export const criarCentroCusto = createSafeAction({
  schema: CriarCentroCustoSchema,
  permission: 'financas:centros-custo:escrita',
  revalidate: { tags: ['contabilidade', 'centros-custo'] },
  handler: (input, ctx) => contabilidade.criarCentroCusto(input, ctx),
});

export const atualizarCentroCusto = createSafeAction({
  schema: AtualizarCentroCustoSchema,
  permission: 'financas:centros-custo:escrita',
  revalidate: { tags: ['contabilidade', 'centros-custo'] },
  handler: (input, ctx) => contabilidade.atualizarCentroCusto(input, ctx),
});

export const listarCentrosCusto = createSafeAction({
  schema: FiltroCentroCustoSchema,
  permission: 'financas:leitura',
  permiteEmLeitura: true,
  handler: (input, ctx) => contabilidade.listarCentrosCusto(input, ctx),
});

// --- Lançamentos ---

export const criarLancamento = createSafeAction({
  schema: CriarLancamentoSchema,
  permission: 'financas:lancamentos:escrita',
  revalidate: { tags: ['contabilidade', 'lancamentos'] },
  handler: (input, ctx) => contabilidade.criarLancamento(input, ctx),
});

export const confirmarLancamento = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'financas:lancamentos:confirmar',
  revalidate: { tags: ['contabilidade', 'lancamentos'] },
  handler: (input, ctx) => contabilidade.confirmarLancamento(input.id, ctx),
});

export const estornarLancamento = createSafeAction({
  schema: EstornarLancamentoSchema,
  permission: 'financas:lancamentos:estornar',
  revalidate: { tags: ['contabilidade', 'lancamentos'] },
  handler: (input, ctx) => contabilidade.estornarLancamento(input, ctx),
});

export const editarLancamento = createSafeAction({
  schema: EditarLancamentoSchema,
  permission: 'financas:lancamentos:escrita',
  revalidate: { tags: ['contabilidade', 'lancamentos'] },
  handler: (input, ctx) => contabilidade.editarLancamentoRascunho(input, ctx),
});

export const anularLancamento = createSafeAction({
  schema: AnularLancamentoSchema,
  permission: 'financas:lancamentos:escrita',
  revalidate: { tags: ['contabilidade', 'lancamentos'] },
  handler: (input, ctx) => contabilidade.anularLancamentoRascunho(input, ctx),
});

export const listarLancamentos = createSafeAction({
  schema: FiltroLancamentoSchema,
  permission: 'financas:leitura',
  permiteEmLeitura: true,
  handler: (input, ctx) => contabilidade.listarLancamentos(input, ctx),
});

// --- Relatórios ---

export const gerarBalancete = createSafeAction({
  schema: FiltroBalanceteSchema,
  permission: 'financas:relatorios:leitura',
  permiteEmLeitura: true,
  handler: (input, ctx) => contabilidade.gerarBalancete(input, ctx),
});

export const razaoConta = createSafeAction({
  schema: FiltroRazaoSchema,
  permission: 'financas:relatorios:leitura',
  permiteEmLeitura: true,
  handler: (input, ctx) => contabilidade.razaoConta(input, ctx),
});

export const gerarDRE = createSafeAction({
  schema: FiltroDRESchema,
  permission: 'financas:relatorios:leitura',
  permiteEmLeitura: true,
  handler: (input, ctx) => contabilidade.gerarDRE(input, ctx),
});

// --- Banca ---

// Conta a débito por meio de pagamento do POS (ADR-0041 §4)
export const definirContaMeioPagamentoPOS = createSafeAction({
  schema: DefinirContaMeioPagamentoPOSSchema,
  permission: 'financas:configurar',
  revalidate: { paths: ['/contabilidade/configuracoes/meios-pagamento-pos'] },
  handler: (input, ctx) => meioPagamento.definirContaMeioPagamentoPOS(input, ctx),
});

// Conta a crédito por natureza de nota de débito (ADR-0039 §1, issue #139)
export const definirContaNaturezaNotaDebitoAction = createSafeAction({
  schema: DefinirContaNaturezaNotaDebitoSchema,
  permission: 'financas:configurar',
  revalidate: { paths: ['/contabilidade/configuracoes/naturezas-nota-debito'] },
  handler: async (input, ctx) => {
    await naturezaNotaDebito.definirContaNaturezaNotaDebito(input, ctx);
    return { natureza: input.natureza, contaId: input.contaId };
  },
});

/**
 * Pesquisa para o `ComboboxRemoto` de cada natureza: só contas de movimento
 * activas da classe que a natureza admite (6 para despesas repercutidas, 7
 * para as outras). Leitura (ADR-0032); nunca é chamada com termo vazio.
 */
export const procurarContasNaturezaNotaDebitoAction = createSafeAction({
  schema: ProcurarContasNaturezaNotaDebitoSchema,
  permission: 'financas:configurar',
  permiteEmLeitura: true,
  handler: async (input, ctx) => {
    const pagina = await contabilidade.listarContas(
      {
        search: input.q,
        classe: classeAdmitidaParaNatureza(input.natureza),
        aceitaLancamento: true,
        ativo: true,
        take: 30,
      },
      ctx,
    );
    return pagina.items.map((c) => ({ id: c.id, codigo: c.codigo, nome: c.nome }));
  },
});

export const criarContaBancaria = createSafeAction({
  schema: CriarContaBancariaSchema,
  permission: 'financas:banca:contas:escrita',
  revalidate: { tags: ['contabilidade', 'contas-bancarias'], paths: ['/contabilidade/contas-bancarias'] },
  handler: (input, ctx) => contabilidade.criarContaBancaria(input, ctx),
});

export const atualizarContaBancaria = createSafeAction({
  schema: AtualizarContaBancariaSchema,
  permission: 'financas:banca:contas:escrita',
  revalidate: { tags: ['contabilidade', 'contas-bancarias'], paths: ['/contabilidade/contas-bancarias'] },
  handler: (input, ctx) => contabilidade.atualizarContaBancaria(input, ctx),
});

export const definirContaBancariaActiva = createSafeAction({
  schema: DefinirContaBancariaActivaSchema,
  permission: 'financas:banca:contas:escrita',
  revalidate: { tags: ['contabilidade', 'contas-bancarias'], paths: ['/contabilidade/contas-bancarias'] },
  handler: (input, ctx) => contabilidade.definirContaBancariaActiva(input.id, input.ativo, ctx),
});

export const listarContasBancarias = createSafeAction({
  permission: 'financas:leitura',
  permiteEmLeitura: true,
  handler: (_, ctx) => contabilidade.listarContasBancarias(ctx),
});

// --- Períodos e Exercícios (ADR-0033 §5, §6, §7) ---

export const listarPeriodos = createSafeAction({
  schema: ListarPeriodosSchema,
  permission: 'financas:ver',
  permiteEmLeitura: true,
  handler: (input, ctx) => contabilidade.listarPeriodos(input, ctx),
});

export const listarExercicios = createSafeAction({
  permission: 'financas:ver',
  permiteEmLeitura: true,
  handler: (_, ctx) => contabilidade.listarExercicios(ctx),
});

export const fecharPeriodo = createSafeAction({
  schema: FecharPeriodoSchema,
  permission: 'financas:fechar_periodo',
  revalidate: { tags: ['contabilidade', 'periodos'], paths: ['/contabilidade/periodos'] },
  handler: (input, ctx) => contabilidade.fecharPeriodo(input, ctx),
});

export const reabrirPeriodo = createSafeAction({
  schema: ReabrirPeriodoSchema,
  permission: 'financas:periodo:reabrir',
  revalidate: { tags: ['contabilidade', 'periodos'], paths: ['/contabilidade/periodos'] },
  handler: (input, ctx) => contabilidade.reabrirPeriodo(input, ctx),
});

export const abrirExercicio = createSafeAction({
  schema: AbrirExercicioSchema,
  permission: 'financas:exercicio:abrir',
  revalidate: { tags: ['contabilidade', 'periodos', 'exercicios'], paths: ['/contabilidade/periodos'] },
  handler: (input, ctx) => contabilidade.abrirExercicio(input, ctx),
});

// --- Encerramento do exercício (ADR-0035, #138) ---

/** Encerramento provisório: devolve `{ ok:false, impedimentos }` sem escrever, ou o encerramento. */
export const encerrarExercicio = createSafeAction({
  schema: EncerrarExercicioSchema,
  permission: 'financas:exercicio:encerrar',
  revalidate: { tags: ['contabilidade', 'periodos', 'exercicios'], paths: ['/contabilidade/exercicios'] },
  handler: async (input, ctx) => {
    const resultado = await encerramento.encerrarExercicio(input, ctx);
    // Arquivo em PDF (ADR-0035 §8, #365) DEPOIS do commit e da resposta (`after`): três PDF são
    // segundos de CPU que o utilizador não espera. Uma falha não desfaz o encerramento — fica
    // registada e a lista de exercícios oferece «Arquivar documentos» para repetir.
    if (resultado.ok) {
      const encerramentoId = resultado.encerramento.id;
      after(() => arquivarSemFalhar(encerramentoId, { tenantId: ctx.tenantId, userId: ctx.userId }));
    }
    return resultado;
  },
});

/** Corre o arquivo do encerramento e engole a falha (log `warn`): o encerramento já está feito. */
async function arquivarSemFalhar(encerramentoId: string, ctx: { tenantId: string; userId: string }) {
  try {
    await encerramento.arquivarEncerramento(encerramentoId, ctx);
  } catch (e) {
    logger.warn(
      { tenantId: ctx.tenantId, encerramentoId, erro: e instanceof Error ? e.message : String(e) },
      '[encerramento] arquivo dos documentos falhou — o encerramento mantém-se',
    );
  }
  // Corre em `after()`, depois da revalidação da action: a lista tem de ver as keys novas.
  revalidatePath('/contabilidade/exercicios');
}

/** Repete o arquivo em PDF do encerramento em vigor (quando falhou depois do commit). */
export const arquivarEncerramento = createSafeAction({
  schema: ArquivarEncerramentoSchema,
  permission: 'financas:exercicio:encerrar',
  revalidate: { tags: ['exercicios'], paths: ['/contabilidade/exercicios'] },
  handler: (input, ctx) => encerramento.arquivarEncerramento(input.encerramentoId, ctx),
});

export const reabrirExercicio = createSafeAction({
  schema: ReabrirExercicioSchema,
  permission: 'financas:exercicio:reabrir',
  revalidate: { tags: ['contabilidade', 'periodos', 'exercicios'], paths: ['/contabilidade/exercicios'] },
  handler: (input, ctx) => encerramento.reabrirExercicio(input, ctx),
});

/** Irreversível: ENCERRADO_PROVISORIO → ENCERRADO. */
export const encerrarExercicioDefinitivo = createSafeAction({
  schema: EncerrarExercicioDefinitivoSchema,
  permission: 'financas:exercicio:encerrar-definitivo',
  revalidate: { tags: ['contabilidade', 'periodos', 'exercicios'], paths: ['/contabilidade/exercicios'] },
  handler: (input, ctx) => encerramento.encerrarExercicioDefinitivo(input, ctx),
});

// --- Aplicação do resultado (ADR-0035 §5, #364) — só ADMIN ---

/** 88 → 59 no exercício seguinte, com a data da deliberação (meio-dia de Maputo) e a acta. */
export const aplicarResultado = createSafeAction({
  schema: AplicarResultadoSchema,
  permission: 'financas:exercicio:aplicar-resultado',
  revalidate: { tags: ['contabilidade', 'periodos', 'exercicios'], paths: ['/contabilidade/exercicios'] },
  handler: (input, ctx) =>
    aplicacaoResultado.aplicarResultado(
      {
        exercicioId: input.exercicioId,
        dataDeliberacao: diaIsoParaData(input.dataDeliberacao),
        referenciaActa: input.referenciaActa,
      },
      ctx,
    ),
});

/** Estorna o lançamento da aplicação no período dele; depois disso pode aplicar-se de novo. */
export const anularAplicacaoResultado = createSafeAction({
  schema: AnularAplicacaoResultadoSchema,
  permission: 'financas:exercicio:aplicar-resultado',
  revalidate: { tags: ['contabilidade', 'periodos', 'exercicios'], paths: ['/contabilidade/exercicios'] },
  handler: (input, ctx) => aplicacaoResultado.anularAplicacaoResultado(input, ctx),
});

// --- Calendário contabilístico (ADR-0033 §3) ---

/**
 * Lê as preferências do calendário contabilístico do tenant.
 * Permitido em modo de Leitura: um cliente em modo de Leitura tem de conseguir
 * ver o que configurou (ADR-0032 §2, bandeira explícita).
 */
export const obterCalendarioContabilistico = createSafeAction({
  permission: 'financas:leitura',
  permiteEmLeitura: true,
  handler: (_, ctx) => contabilidade.obterCalendarioContabilistico(ctx),
});

/**
 * Actualiza as preferências do calendário contabilístico do tenant.
 * Usa a permissão de configuração do módulo financeiro.
 * NÃO permitido em modo de Leitura — configurar o automatismo é escrita.
 */
export const atualizarCalendarioContabilistico = createSafeAction({
  schema: CalendarioContabilisticoSchema,
  permission: 'financas:configurar',
  revalidate: { tags: ['contabilidade', 'configuracoes'], paths: ['/contabilidade/configuracoes'] },
  handler: (input, ctx) => contabilidade.atualizarCalendarioContabilistico(input, ctx),
});

/**
 * Pesquisa de contas PGC folha para o `ComboboxRemoto` do formulário de
 * lançamento contabilístico (issue #87). Leitura: corre em modo de Leitura
 * (ADR-0032). Nota: `ComboboxRemoto` nunca chama esta action com termo vazio —
 * quando o campo está limpo mostra `opcoesIniciais` (carregadas pelo Server
 * Component). Esta action só é invocada quando o utilizador escreve algo.
 */
export const procurarContasLancamentoAction = createSafeAction({
  schema: ProcurarContasLancamentoSchema,
  permission: 'financas:leitura',
  permiteEmLeitura: true,
  handler: async (input, ctx) => {
    const pagina = await contabilidade.listarContas(
      { search: input.q, aceitaLancamento: true, ativo: true, take: 30 },
      ctx,
    );
    return pagina.items.map((c) => ({ id: c.id, codigo: c.codigo, nome: c.nome }));
  },
});

/**
 * Pesquisa de contas PGC (todas, não só folhas) para o `ComboboxRemoto` do
 * campo «Conta Mãe» no formulário de plano de contas (issue #344).
 *
 * Aceita um `excluirId` opcional para que o formulário de edição exclua a
 * própria conta e as suas descendentes (criariam um ciclo — #296).
 *
 * Leitura: corre em modo de Leitura (ADR-0032). Esta action só é invocada
 * quando o utilizador escreve algo — quando o campo está limpo o
 * `ComboboxRemoto` mostra `opcoesIniciais` (carregadas pelo Server Component).
 */
export const procurarContasMaeAction = createSafeAction({
  schema: ProcurarContasMaeSchema,
  permission: 'financas:leitura',
  permiteEmLeitura: true,
  handler: async (input, ctx) => {
    // Em edição, nem a própria conta nem as descendentes podem ser mãe (#296).
    const excluirIds = input.excluirId
      ? [input.excluirId, ...(await contabilidade.idsDescendentes(input.excluirId, ctx))]
      : undefined;
    const pagina = await contabilidade.listarContas({ search: input.q, take: 30 }, ctx, { excluirIds });
    return pagina.items.map((c) => ({ id: c.id, codigo: c.codigo, nome: c.nome }));
  },
});
