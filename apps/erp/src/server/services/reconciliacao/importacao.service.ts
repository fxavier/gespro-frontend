import 'server-only';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { BusinessRuleError, NotFoundError, ValidationError } from '@/lib/errors';
import { FILTRO_LANCAMENTO_MAPA } from '../financas/contabilidade.service';
import type { Ctx } from '../types';
import { chaveIdempotenciaBanco, normalizarReferencia } from './reconciliacao.model';
import { interpretarGrelha, parserPara, type ErroLinhaExtracto } from './extracto.parser';

// ---------------------------------------------------------------------------
// Entrada de dados do motor (ADR-0038, nó IMPORT): extracto bancário → MovimentoBancario,
// razão → MovimentoContabilistico. Idempotente nas duas pontas (RF §19, CA08).
// ---------------------------------------------------------------------------

/** Tecto do ficheiro: um extracto mensal típico tem dezenas de KB. */
export const TAMANHO_MAXIMO_EXTRACTO = 5 * 1024 * 1024;
const LOTE_PROJECCAO = 1000;

export interface ImportarExtractoInput {
  contaBancariaId: string;
  nomeFicheiro: string;
  conteudo: Uint8Array;
}

export type ResultadoImportacao =
  | { estado: 'IMPORTADO'; importacaoId: string; totalLinhas: number; criados: number; ignorados: number }
  /** O mesmo ficheiro (mesmo SHA-256) já entrou nesta conta — nada foi escrito. */
  | { estado: 'JA_IMPORTADO'; importacaoId: string };

async function contaDoTenant(contaBancariaId: string, ctx: Ctx) {
  const conta = await prisma.contaBancaria.findFirst({
    where: { id: contaBancariaId, tenantId: ctx.tenantId },
    select: { id: true, contaContabilId: true, ativo: true },
  });
  if (!conta) throw new NotFoundError('Conta bancária não encontrada');
  return conta;
}

/**
 * Importa um extracto em CSV ou XLSX. Duas camadas de idempotência:
 *  1. o ficheiro — `hashFicheiro` (SHA-256 do conteúdo bruto) único por conta;
 *  2. a linha — `chaveIdempotencia` única por conta, com `skipDuplicates`, para
 *     que um extracto SOBREPOSTO (ficheiro diferente, linhas repetidas) não duplique.
 * All-or-nothing: uma linha inválida recusa o ficheiro inteiro, com todos os erros.
 */
export async function importarExtracto(input: ImportarExtractoInput, ctx: Ctx): Promise<ResultadoImportacao> {
  const conta = await contaDoTenant(input.contaBancariaId, ctx);
  if (input.conteudo.byteLength > TAMANHO_MAXIMO_EXTRACTO) {
    throw new BusinessRuleError('EXTRACTO_DEMASIADO_GRANDE', 'O extracto excede o tamanho máximo de 5 MB.');
  }
  const parser = parserPara(input.nomeFicheiro);
  const hashFicheiro = createHash('sha256').update(input.conteudo).digest('hex');

  const anterior = await prisma.importacaoExtracto.findFirst({
    where: { tenantId: ctx.tenantId, contaBancariaId: conta.id, hashFicheiro },
    select: { id: true },
  });
  if (anterior) return { estado: 'JA_IMPORTADO', importacaoId: anterior.id };

  let grelha: string[][];
  try {
    grelha = await parser.ler(input.conteudo);
  } catch {
    throw new ValidationError('O ficheiro não pôde ser lido como ' + parser.origem + '.');
  }
  const { linhas, erros } = interpretarGrelha(grelha);
  if (erros.length > 0) {
    throw new ValidationError('O extracto tem linhas inválidas; nada foi importado.', { erros } satisfies { erros: ErroLinhaExtracto[] });
  }

  // Ordinal dentro do tuplo (dia, valor, natureza, descrição): duas comissões
  // iguais no mesmo dia são dois movimentos, não um (ADR-0038 §7).
  const ocorrencias = new Map<string, number>();
  const movimentos = linhas.map((l) => {
    // Só as linhas SEM referência contam para o ordinal — é só nelas que a chave o
    // usa. Se contassem todas, um banco que acrescente a referência a uma linha
    // entre dois extractos deslocaria os ordinais das vizinhas e a reimportação duplicaria.
    let ordinal = 0;
    if (!normalizarReferencia(l.referencia)) {
      const tuplo = [l.dataMovimento.toDateString(), l.valor.toFixed(2), l.natureza, normalizarReferencia(l.descricao)].join('|');
      ordinal = ocorrencias.get(tuplo) ?? 0;
      ocorrencias.set(tuplo, ordinal + 1);
    }
    return {
      tenantId: ctx.tenantId,
      contaBancariaId: conta.id,
      dataMovimento: l.dataMovimento,
      dataValor: l.dataValor,
      referencia: l.referencia,
      referenciaNormalizada: normalizarReferencia(l.referencia),
      descricao: l.descricao,
      valor: l.valor,
      natureza: l.natureza,
      saldoAposMovimento: l.saldoAposMovimento,
      origem: parser.origem,
      chaveIdempotencia: chaveIdempotenciaBanco({
        referenciaBanco: l.referencia,
        dataMovimento: l.dataMovimento,
        valor: l.valor,
        natureza: l.natureza,
        descricao: l.descricao,
        ordinal,
      }),
    };
  });
  const datas = linhas.map((l) => l.dataMovimento.getTime());

  try {
    return await prisma.$transaction(async (tx) => {
      const importacao = await tx.importacaoExtracto.create({
        data: {
          tenantId: ctx.tenantId,
          contaBancariaId: conta.id,
          origem: parser.origem,
          nomeFicheiro: input.nomeFicheiro,
          hashFicheiro,
          totalLinhas: linhas.length,
          periodoInicio: new Date(Math.min(...datas)),
          periodoFim: new Date(Math.max(...datas)),
          importadoPorId: ctx.userId,
        },
        select: { id: true },
      });
      const { count } = await tx.movimentoBancario.createMany({
        data: movimentos.map((m) => ({ ...m, importacaoId: importacao.id })),
        skipDuplicates: true,
      });
      await tx.importacaoExtracto.update({
        where: { id: importacao.id },
        data: { criados: count, ignorados: linhas.length - count },
      });
      return {
        estado: 'IMPORTADO' as const,
        importacaoId: importacao.id,
        totalLinhas: linhas.length,
        criados: count,
        ignorados: linhas.length - count,
      };
    });
  } catch (e) {
    // Dois uploads simultâneos do mesmo ficheiro: o segundo perde no @@unique do hash.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const vencedor = await prisma.importacaoExtracto.findFirst({
        where: { tenantId: ctx.tenantId, contaBancariaId: conta.id, hashFicheiro },
        select: { id: true },
      });
      if (vencedor) return { estado: 'JA_IMPORTADO', importacaoId: vencedor.id };
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Projecção do razão
// ---------------------------------------------------------------------------

/**
 * Tipos de documento de origem cujo número se resolve dentro do domínio de
 * finanças. `Recebimento` aponta para a factura recebida (demo-contabilidade.ts).
 * O resto (Venda, FolhaPagamento…) é de outros domínios e cai no número do
 * lançamento — ir buscá-los seria furar a fronteira sem contrato.
 */
const MODELO_DO_DOCUMENTO = {
  Fatura: 'fatura',
  Recebimento: 'fatura',
  Pagamento: 'pagamento',
  ContaPagar: 'contaPagar',
  NotaCredito: 'notaCredito',
  NotaDebito: 'notaDebito',
} as const;
type ModeloDocumento = (typeof MODELO_DO_DOCUMENTO)[keyof typeof MODELO_DO_DOCUMENTO];

async function numerosDeDocumento(
  origens: { tipo: string | null; id: string | null }[],
  ctx: Ctx,
): Promise<Map<string, string>> {
  const porModelo = new Map<ModeloDocumento, Set<string>>();
  for (const o of origens) {
    const modelo = o.tipo ? MODELO_DO_DOCUMENTO[o.tipo as keyof typeof MODELO_DO_DOCUMENTO] : undefined;
    if (modelo && o.id) porModelo.set(modelo, (porModelo.get(modelo) ?? new Set()).add(o.id));
  }
  const numeros = new Map<string, string>();
  for (const [modelo, ids] of porModelo) {
    const delegate = prisma[modelo] as unknown as {
      findMany(a: { where: object; select: object }): Promise<{ id: string; numero: string }[]>;
    };
    const linhas = await delegate.findMany({
      where: { tenantId: ctx.tenantId, id: { in: [...ids] } },
      select: { id: true, numero: true },
    });
    for (const l of linhas) numeros.set(l.id, l.numero);
  }
  return numeros;
}

/**
 * Projecta as partidas da conta PGC da conta bancária em MovimentoContabilistico.
 * SEM janela de datas: é esse filtro que, no modelo antigo, deixava de fora o
 * pagamento de 28/09 que o banco só mostra a 02/10 (CA04). Idempotente pelo
 * `@@unique([tenantId, partidaId])`; lançamentos estornados continuam projectados
 * (ADR-0038 §Riscos b) — o estorno traz as suas próprias partidas.
 */
export async function projetarMovimentosContabilisticos(
  contaBancariaId: string,
  ctx: Ctx,
): Promise<{ criados: number }> {
  const conta = await contaDoTenant(contaBancariaId, ctx);
  // Uma conta inactiva ficaria fora da contagem de baixo e disputaria as partidas
  // com a activa da mesma conta PGC — quem corresse primeiro ficava com elas.
  if (!conta.ativo) {
    throw new BusinessRuleError('CONTA_BANCARIA_INATIVA', 'A conta bancária está inactiva: não se projectam lançamentos para ela.');
  }

  // Uma partida só pode pertencer a UMA conta bancária. Se duas partilham a conta
  // PGC, a partida não diz de qual é — recusar é melhor do que adivinhar.
  const partilhas = await prisma.contaBancaria.count({
    where: { tenantId: ctx.tenantId, contaContabilId: conta.contaContabilId, ativo: true },
  });
  if (partilhas > 1) {
    throw new BusinessRuleError(
      'CONTA_PGC_PARTILHADA',
      `Há ${partilhas} contas bancárias activas na mesma conta contabilística: não é possível saber a qual ` +
        'pertence cada lançamento. Atribua a cada conta bancária a sua própria subconta do PGC.',
    );
  }

  let criados = 0;
  let depoisDe: string | undefined;
  // ponytail: percorre todas as partidas da conta PGC em cada corrida (indexado, sem
  // janela); uma marca de água por createdAt falharia com lançamentos que passam de
  // RASCUNHO a LANCADO depois. Se o volume o pedir, marcar a partida projectada.
  for (;;) {
    const partidas = await prisma.partidaLancamento.findMany({
      where: {
        tenantId: ctx.tenantId,
        contaId: conta.contaContabilId,
        lancamento: { status: FILTRO_LANCAMENTO_MAPA },
        ...(depoisDe && { id: { gt: depoisDe } }),
      },
      select: {
        id: true,
        lancamentoId: true,
        tipo: true,
        valor: true,
        historico: true,
        lancamento: {
          select: { data: true, numero: true, historico: true, documentoOrigemTipo: true, documentoOrigemId: true },
        },
      },
      orderBy: { id: 'asc' },
      take: LOTE_PROJECCAO,
    });
    if (partidas.length === 0) break;
    depoisDe = partidas[partidas.length - 1].id;

    const numeros = await numerosDeDocumento(
      partidas.map((p) => ({ tipo: p.lancamento.documentoOrigemTipo, id: p.lancamento.documentoOrigemId })),
      ctx,
    );
    const { count } = await prisma.movimentoContabilistico.createMany({
      data: partidas.map((p) => {
        const documento =
          (p.lancamento.documentoOrigemId && numeros.get(p.lancamento.documentoOrigemId)) || p.lancamento.numero;
        return {
          tenantId: ctx.tenantId,
          contaBancariaId: conta.id,
          lancamentoId: p.lancamentoId,
          partidaId: p.id,
          dataContabilistica: p.lancamento.data,
          documento,
          // O banco mostra o número do documento como referência: é o que a
          // passagem REFERENCIA_EXACTA do motor procura.
          referencia: documento,
          referenciaNormalizada: normalizarReferencia(documento),
          descricao: p.historico ?? p.lancamento.historico,
          valor: p.valor,
          // Partida a débito numa conta de banco (classe 1) = dinheiro que entra.
          natureza: p.tipo,
        };
      }),
      skipDuplicates: true,
    });
    criados += count;
    if (partidas.length < LOTE_PROJECCAO) break;
  }
  return { criados };
}
