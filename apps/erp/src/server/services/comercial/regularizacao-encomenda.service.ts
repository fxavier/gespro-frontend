/**
 * Regularização das vendas convertidas de encomenda antes do #608 (#563, issue #612).
 *
 * Até ao #608, `converterEmVenda` criava a venda `FATURADA` e lançava D 411 / C 711 / C 44331 com
 * `documentoOrigemTipo 'Venda'` SEM `Fatura`: receita e IVA sem documento fiscal, e uma 411 que
 * `registarPagamento` nunca salda. Por venda, numa só transacção (decisão D1 da corrida 612):
 *
 *   1. `estornarLancamentoEmTx` do lançamento antigo;
 *   2. emissão pela via do POS — `emitirDocumentoVendaEncomendaEmTx`, o mesmo núcleo do
 *      `converterEmVenda` actual: Factura-Recibo se nenhum pagamento é CREDITO, senão Factura com
 *      vencimento pelo prazo do cliente; `Venda.faturaId` ↔ `Fatura.vendaId`. A caixa não se toca.
 *
 * Data (D2): estorno e documento levam a data do LANÇAMENTO antigo, não a `venda.createdAt`. É a
 * data que pôs a receita e o IVA num período; estornar e re-emitir nesse mesmo dia deixa cada
 * período (DRE, razão, base do IVA) com o mesmo efeito líquido de uma conversão feita já pela via
 * nova. As duas datas diferem de milissegundos (o código antigo usava `new Date()` nas duas), mas
 * só a do lançamento é a que a contabilidade conhece. O número sai da série do ano dessa data
 * (`emitirDocumentoEmTx` → `numerarDocumento`).
 *
 * Bloqueios (D3): período fechado, IVA apurado (#564) ou qualquer outra recusa de negócio fazem a
 * transacção dessa venda reverter — nada escrito — e a venda sai no relatório com o código do erro;
 * as outras continuam. Ficam também para decisão manual: venda CANCELADA/DEVOLVIDA (`VENDA_ANULADA`), com
 * factura viva já apontada a ela (`VENDA_JA_COM_DOCUMENTO`), com devolução não rejeitada
 * (`VENDA_COM_DEVOLUCAO`), ou com um lançamento antigo que não é exactamente um e `LANCADO`.
 *
 * Sem `exigirEmailConfirmadoParaEmitir`: é uma regularização administrativa, sem sessão; o travão
 * do e-mail é do chamador com sessão (ADR-0041), e aqui não há utilizador a emitir em nome próprio.
 * O emissor registado é o vendedor da venda (`Venda.vendedorId`), quem fez a conversão original.
 *
 * Dry-run: a mesma transacção corre até ao fim e é revertida de propósito — o relatório prevê
 * exactamente o que `aplicar` faria (documento, número, ou o motivo da recusa) sem escrever nada.
 */
import 'server-only';

import { Prisma } from '@prisma/client';
import { prismaBase } from '@/server/db/client';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { AppError, BusinessRuleError } from '@/lib/errors';
import { estornarLancamentoEmTx } from '@/server/services/financas/contabilidade.service';
import { faturacaoService } from '@/server/services/financas/faturacao.service';
import { emitirDocumentoVendaEncomendaEmTx } from './encomenda.service';

export type DocumentoARegularizar = 'FATURA' | 'FATURA_RECIBO';

export interface VendaEncomendaPorRegularizar {
  vendaId: string;
  numero: string;
  vendedorId: string;
  /** Data do lançamento antigo — a do estorno e do documento (D2). */
  data: Date;
  total: string;
  documento: DocumentoARegularizar;
}

export interface ResultadoRegularizacao extends VendaEncomendaPorRegularizar {
  /** SIMULADA = dry-run sem recusa; SALTADA = regularizada entretanto por outra corrida. */
  estado: 'SIMULADA' | 'REGULARIZADA' | 'BLOQUEADA' | 'SALTADA';
  faturaNumero?: string;
  motivo?: { codigo: string; mensagem: string };
}

/**
 * A consulta da issue #612: vendas `origem ENCOMENDA`, sem `faturaId`, com um lançamento
 * `documentoOrigemTipo 'Venda'` cuja origem é a venda. Ordenadas pela data do lançamento.
 */
export async function vendasEncomendaPorRegularizar(tenantId: string): Promise<VendaEncomendaPorRegularizar[]> {
  const lancamentos = await prismaBase.lancamento.findMany({
    where: { tenantId, documentoOrigemTipo: 'Venda', documentoOrigemId: { not: null } },
    select: { documentoOrigemId: true, data: true },
    orderBy: { data: 'asc' },
  });
  if (lancamentos.length === 0) return [];
  const dataDe = new Map<string, Date>();
  for (const l of lancamentos) if (!dataDe.has(l.documentoOrigemId!)) dataDe.set(l.documentoOrigemId!, l.data);

  const vendas = await prismaBase.venda.findMany({
    where: { tenantId, origem: 'ENCOMENDA', faturaId: null, id: { in: [...dataDe.keys()] } },
    select: { id: true, numero: true, vendedorId: true, total: true, pagamentos: { select: { tipo: true } } },
  });
  return vendas
    .map((v) => ({
      vendaId: v.id,
      numero: v.numero,
      vendedorId: v.vendedorId,
      data: dataDe.get(v.id)!,
      total: v.total.toFixed(2),
      documento: (v.pagamentos.some((p) => p.tipo === 'CREDITO') ? 'FATURA' : 'FATURA_RECIBO') as DocumentoARegularizar,
    }))
    .sort((a, b) => a.data.getTime() - b.data.getTime() || a.numero.localeCompare(b.numero));
}

/** Reverte a transacção do dry-run depois de ela ter corrido inteira. */
class Simulacao extends Error {
  constructor(readonly faturaNumero: string) {
    super('simulação');
  }
}

/**
 * Uma venda, numa só `prismaBase.$transaction`: estorno do lançamento antigo + documento pela via
 * do POS. Lança o erro de negócio que a impedir (a tx reverte); `Simulacao` no dry-run.
 */
async function regularizarVendaEmTx(
  tx: Prisma.TransactionClient,
  alvo: VendaEncomendaPorRegularizar,
  tenantId: string,
): Promise<{ faturaNumero: string } | null> {
  // Tranca a venda: duas corridas em paralelo não emitem dois documentos pela mesma venda.
  const [trancada] = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Venda"
    WHERE id = ${alvo.vendaId} AND "tenantId" = ${tenantId} AND "faturaId" IS NULL
    FOR UPDATE
  `;
  if (!trancada) return null;

  const venda = await tx.venda.findFirst({
    where: { id: alvo.vendaId, tenantId },
    include: { itens: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }, pagamentos: true },
  });
  if (!venda) return null;

  // Uma factura viva já apontada a esta venda (ligação só num sentido): emitir outra duplicaria a receita.
  const documento = await tx.fatura.findFirst({
    where: { tenantId, vendaId: venda.id, status: { not: 'CANCELADA' } },
    select: { numero: true },
  });
  if (documento) {
    throw new BusinessRuleError(
      'VENDA_JA_COM_DOCUMENTO',
      `A venda ${venda.numero} já tem o documento ${documento.numero} sem estar ligado na venda. Decisão manual.`,
    );
  }
  // Uma devolução (mesmo parcial) já mexeu na venda: o documento a emitir já não é o da venda inteira.
  const devolucao = await tx.devolucao.findFirst({
    where: { tenantId, vendaId: venda.id, status: { not: 'REJEITADA' } },
    select: { numero: true },
  });
  if (devolucao) {
    throw new BusinessRuleError(
      'VENDA_COM_DEVOLUCAO',
      `A venda ${venda.numero} tem a devolução ${devolucao.numero}. Decisão manual.`,
    );
  }
  if (venda.status === 'CANCELADA' || venda.status === 'DEVOLVIDA') {
    throw new BusinessRuleError(
      'VENDA_ANULADA',
      `A venda ${venda.numero} está ${venda.status}: emitir-lhe documento seria facturar uma venda desfeita. Decisão manual.`,
    );
  }
  if (!venda.clienteId) {
    throw new BusinessRuleError('VENDA_SEM_CLIENTE', `A venda ${venda.numero} não tem cliente.`);
  }

  const antigos = await tx.lancamento.findMany({
    where: { tenantId, documentoOrigemTipo: 'Venda', documentoOrigemId: venda.id },
    select: { id: true, data: true, status: true },
  });
  if (antigos.length !== 1) {
    throw new BusinessRuleError(
      'LANCAMENTOS_ANTIGOS_MULTIPLOS',
      `A venda ${venda.numero} tem ${antigos.length} lançamentos com origem na venda; esperava-se um. Decisão manual.`,
    );
  }
  const [antigo] = antigos;
  if (antigo.status !== 'LANCADO') {
    throw new BusinessRuleError(
      'LANCAMENTO_ANTIGO_NAO_LANCADO',
      `O lançamento da venda ${venda.numero} está ${antigo.status}, não LANCADO. Decisão manual.`,
    );
  }

  const ctx = { tenantId, userId: venda.vendedorId };
  const data = antigo.data;

  await estornarLancamentoEmTx(
    tx,
    {
      lancamentoId: antigo.id,
      motivo: `Regularização #612: a venda ${venda.numero} passa a ter documento fiscal pela via do POS.`,
      data,
    },
    ctx,
  );

  let diasPagamentoCredito: number | null = null;
  if (venda.pagamentos.some((p) => p.tipo === 'CREDITO')) {
    const cliente = await tx.cliente.findFirst({
      where: { id: venda.clienteId, tenantId },
      select: { diasPagamento: true },
    });
    diasPagamentoCredito = cliente?.diasPagamento ?? 0;
  }

  const fatura = await emitirDocumentoVendaEncomendaEmTx(
    tx,
    faturacaoService,
    {
      vendaId: venda.id,
      clienteId: venda.clienteId,
      dataVenda: data,
      diasPagamentoCredito,
      itens: venda.itens,
      pagamentos: venda.pagamentos,
    },
    ctx,
  );
  return { faturaNumero: fatura.numero };
}

/**
 * Regulariza (ou, por omissão, simula) as vendas do tenant. Cada venda é independente: uma
 * recusa reverte só a sua transacção e fica no relatório; as outras continuam (D3).
 */
export async function regularizarVendasEncomenda(
  tenantId: string,
  opcoes: { aplicar: boolean },
): Promise<ResultadoRegularizacao[]> {
  const alvos = await vendasEncomendaPorRegularizar(tenantId);
  const resultados: ResultadoRegularizacao[] = [];

  for (const alvo of alvos) {
    const ctx = { tenantId, userId: alvo.vendedorId };
    try {
      const r = await runWithTenantContext(ctx, () =>
        prismaBase.$transaction(
          async (tx) => {
            const feito = await regularizarVendaEmTx(tx, alvo, tenantId);
            if (feito && !opcoes.aplicar) throw new Simulacao(feito.faturaNumero);
            return feito;
          },
          { timeout: 30_000 },
        ),
      );
      resultados.push(
        r ? { ...alvo, estado: 'REGULARIZADA', faturaNumero: r.faturaNumero } : { ...alvo, estado: 'SALTADA' },
      );
    } catch (e) {
      if (e instanceof Simulacao) {
        resultados.push({ ...alvo, estado: 'SIMULADA', faturaNumero: e.faturaNumero });
        continue;
      }
      const codigo = e instanceof AppError ? e.code : 'ERRO_INESPERADO';
      const mensagem = e instanceof Error ? e.message : String(e);
      resultados.push({ ...alvo, estado: 'BLOQUEADA', motivo: { codigo, mensagem } });
    }
  }
  return resultados;
}
