import 'server-only';
import { createHash } from 'node:crypto';
import { Prisma, type MetodoPagamentoTipo, type TipoSerieDocumento as TipoSeriePrisma } from '@prisma/client';
import { prisma, prismaBase } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { paginate } from '@/server/db/paginate';
import {
  FORMATO_NUMERO_SERIE,
  ROTULO_TIPO_SERIE,
  anosPermitidos,
  formatarNumero,
  serieUsada,
} from '@/lib/series-documento';
import type { IFaturacaoService } from './faturacao.interface';
import {
  diaCivilEmMaputo,
  estornarLancamentoEmTx,
  periodoFiscalDe,
  registarLancamentoContabilistico,
} from './contabilidade.service';
import { resolverContaMeioPagamento, resolverContasPagamentoPOS } from './meio-pagamento.service';
import { SERIES_INICIAIS } from '@/server/provisioning/tenant-bootstrap';
import { resolverContaNaturezaNotaDebito, validarContaParaNatureza } from './natureza-nota-debito.service';
import { registarMovimentoCaixa } from './caixa.service';
import { registarHistoricoTransacaoEmTx } from '@/server/services/comercial/historico-transacao';
import type { RegistarLancamentoContabilisticoInput } from './contabilidade.interface';
import type {
  CriarSerieDocumentoInput,
  LiquidarNotaCreditoInput,
  EditarSerieDocumentoInput,
  IdSerieDocumentoInput,
  EmitirFaturaInput,
  RegistarPagamentoFaturaInput,
  FiltroFaturaInput,
  EmitirNotaCreditoInput,
  FiltroNotaCreditoInput,
  EmitirNotaDebitoInput,
  FiltroNotaDebitoInput,
  CriarProformaInput,
  FiltroProformaInput,
  CriarCotacaoComercialInput,
  FiltroCotacaoComercialInput,
} from '@/lib/validations/faturacao';
import { TipoSerieDocumentoEnum } from '@/lib/validations/faturacao';
import { formatarData } from '@/lib/format-date';
import { vencimentoJaPassou } from '@/lib/periodo-fiscal';
import { exigirClienteAtivoParaCredito } from '@/lib/cliente-credito';
import { motivoIsencaoEmFalta } from '@/lib/nota-debito';
import {
  motivoIsencaoAutomatico,
  serializarDocumentoParaHash,
  type FaturaInput,
} from '@/lib/documents/fatura-model';
import {
  TRANSICOES_FATURA,
  TRANSICOES_NOTA_CREDITO,
  TRANSICOES_NOTA_DEBITO,
  TRANSICOES_PROFORMA,
  TRANSICOES_COTACAO_COMERCIAL,
  ESTADOS_FATURA_COMPENSAVEL,
  ESTADOS_FATURA_CREDITAVEL,
  ESTADOS_FATURA_PAGAVEL,
  type StatusFatura,
  type StatusNotaCredito,
  type StatusNotaDebito,
  type StatusProforma,
  type StatusCotacaoComercial,
  type TipoSerieDocumento,
  type SerieDocumento,
  type Fatura,
  type FaturaCompleta,
  type FaturaEmitida,
  type NotaCredito,
  type NotaCreditoCompleta,
  type NotaDebito,
  type NotaDebitoCompleta,
  type Proforma,
  type ProformaCompleta,
  type CotacaoComercial,
  type CotacaoComercialCompleta,
  type PaginacaoFaturacao,
  type Ctx,
  type OpcoesEmissaoDocumento,
} from './faturacao.interface';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TabelaTrancavel = 'Fatura' | 'NotaCredito' | 'Proforma' | 'CotacaoComercial';

/**
 * Tranca a linha (`FOR UPDATE`, id + tenant) ANTES de a ler: o estado que decide vem
 * da leitura trancada, e um read-modify-write concorrente espera pelo commit deste.
 * Só faz sentido dentro de uma `$transaction`. `tabela` é uma lista fechada — nunca input.
 */
async function trancarLinha(
  tx: Prisma.TransactionClient,
  tabela: TabelaTrancavel,
  id: string,
  tenantId: string,
): Promise<void> {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM ${Prisma.raw(`"${tabela}"`)} WHERE id = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`,
  );
}

function transitarFatura(atual: StatusFatura, alvo: StatusFatura): void {
  const permitidas = TRANSICOES_FATURA[atual];
  if (!permitidas.includes(alvo)) {
    throw new BusinessRuleError('TRANSICAO_INVALIDA', `Transição inválida de factura: ${atual} → ${alvo}`);
  }
}

function transitarNC(atual: StatusNotaCredito, alvo: StatusNotaCredito): void {
  const permitidas = TRANSICOES_NOTA_CREDITO[atual];
  if (!permitidas.includes(alvo)) {
    throw new BusinessRuleError('TRANSICAO_INVALIDA', `Transição inválida de nota de crédito: ${atual} → ${alvo}`);
  }
}

function transitarND(atual: StatusNotaDebito, alvo: StatusNotaDebito): void {
  const permitidas = TRANSICOES_NOTA_DEBITO[atual];
  if (!permitidas.includes(alvo)) {
    throw new BusinessRuleError('TRANSICAO_INVALIDA', `Transição inválida de nota de débito: ${atual} → ${alvo}`);
  }
}

function transitarProforma(atual: StatusProforma, alvo: StatusProforma): void {
  const permitidas = TRANSICOES_PROFORMA[atual];
  if (!permitidas.includes(alvo)) {
    throw new BusinessRuleError('TRANSICAO_INVALIDA', `Transição inválida de proforma: ${atual} → ${alvo}`);
  }
}

function transitarCotacao(atual: StatusCotacaoComercial, alvo: StatusCotacaoComercial): void {
  const permitidas = TRANSICOES_COTACAO_COMERCIAL[atual];
  if (!permitidas.includes(alvo)) {
    throw new BusinessRuleError('TRANSICAO_INVALIDA', `Transição inválida de cotação: ${atual} → ${alvo}`);
  }
}

/** Calcula subtotais de linhas (input já transformado pelo Zod) */
function calcularTotaisLinhas(linhas: EmitirFaturaInput['linhas']) {
  let subtotal = new Prisma.Decimal(0);
  let ivaTotal = new Prisma.Decimal(0);

  for (const l of linhas) {
    subtotal = subtotal.plus(new Prisma.Decimal(l.subtotal.toFixed(2)));
    ivaTotal = ivaTotal.plus(new Prisma.Decimal(l.ivaItem.toFixed(2)));
  }

  return {
    subtotal,
    descontoTotal: new Prisma.Decimal(0), // ponytail: descontos já absorvidos no subtotal por linha
    baseIva: subtotal,
    ivaTotal,
    total: subtotal.plus(ivaTotal),
  };
}

// ---------------------------------------------------------------------------
// Wave 3 — integração fatura → contabilidade
//
// Códigos PGC-NIRF de fallback (Decreto 70/2009).
// Quando ConfiguracaoContabil.contasPadrao existir, estes são substituídos.
// ---------------------------------------------------------------------------

/** Códigos PGC padrão para lançamentos automáticos de faturação */
export const PGC_FATURACAO = {
  /** 4.1.1 — Clientes c/c (natureza devedora) */
  CLIENTES_CC: '411',
  /** 7.1.1 — Vendas - Mercadorias (natureza credora em contas de rendimento) */
  RECEITA_VENDAS: '711',
  /** 4.4.3.3.1 — IVA liquidado - Operações gerais */
  IVA_LIQUIDADO: '44331',
} as const;

/**
 * Constrói o input de lançamento contabilístico para uma fatura emitida.
 * Pure function — testável sem DB.
 * Invariante: sum(débitos) = sum(créditos) = fatura.total
 */
export function construirLancamentoFatura(fatura: {
  id: string;
  numero: string;
  total: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  ivaTotal: Prisma.Decimal;
  dataEmissao: Date;
}): RegistarLancamentoContabilisticoInput {
  const partidas: RegistarLancamentoContabilisticoInput['partidas'] = [
    {
      contaCodigo: PGC_FATURACAO.CLIENTES_CC,
      tipo: 'DEBITO',
      valor: fatura.total.toFixed(2),
      historico: `Fatura ${fatura.numero} — clientes a receber`,
    },
    {
      contaCodigo: PGC_FATURACAO.RECEITA_VENDAS,
      tipo: 'CREDITO',
      valor: fatura.subtotal.toFixed(2),
      historico: `Fatura ${fatura.numero} — receita de vendas`,
    },
  ];

  if (fatura.ivaTotal.greaterThan(0)) {
    partidas.push({
      contaCodigo: PGC_FATURACAO.IVA_LIQUIDADO,
      tipo: 'CREDITO',
      valor: fatura.ivaTotal.toFixed(2),
      historico: `Fatura ${fatura.numero} — IVA liquidado`,
    });
  }

  return {
    data: fatura.dataEmissao,
    diarioTipo: 'VENDAS',
    origem: 'VENDA',
    documentoOrigemId: fatura.id,
    documentoOrigemTipo: 'Fatura',
    historico: `Fatura ${fatura.numero}`,
    partidas,
  };
}

/**
 * Constrói o input de lançamento de estorno para uma nota de crédito.
 * Pure function — partidas inversas à fatura original.
 */
export function construirLancamentoNotaCredito(nc: {
  id: string;
  numero: string;
  total: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  ivaTotal: Prisma.Decimal;
  dataEmissao: Date;
}): RegistarLancamentoContabilisticoInput {
  const partidas: RegistarLancamentoContabilisticoInput['partidas'] = [
    {
      contaCodigo: PGC_FATURACAO.RECEITA_VENDAS,
      tipo: 'DEBITO',
      valor: nc.subtotal.toFixed(2),
      historico: `NC ${nc.numero} — estorno receita`,
    },
    {
      contaCodigo: PGC_FATURACAO.CLIENTES_CC,
      tipo: 'CREDITO',
      valor: nc.total.toFixed(2),
      historico: `NC ${nc.numero} — redução clientes`,
    },
  ];

  if (nc.ivaTotal.greaterThan(0)) {
    partidas.push({
      contaCodigo: PGC_FATURACAO.IVA_LIQUIDADO,
      tipo: 'DEBITO',
      valor: nc.ivaTotal.toFixed(2),
      historico: `NC ${nc.numero} — estorno IVA`,
    });
  }

  return {
    data: nc.dataEmissao,
    diarioTipo: 'VENDAS',
    origem: 'VENDA',
    documentoOrigemId: nc.id,
    documentoOrigemTipo: 'NotaCredito',
    historico: `Nota de crédito ${nc.numero}`,
    partidas,
  };
}

/** Conta a débito, por omissão, de cada meio de pagamento da venda POS (ADR-0041 §4). */
export const CONTA_MEIO_PAGAMENTO_POS: Record<MetodoPagamentoTipo, string> = {
  /** 1.1.1 — Caixa */
  DINHEIRO: '111',
  /** 1.2.1 — Depósitos à ordem */
  CARTAO: '121',
  TRANSFERENCIA: '121',
  MPESA: '121',
  EMOLA: '121',
  CREDITO: PGC_FATURACAO.CLIENTES_CC,
};

/**
 * Lançamento do documento da venda POS (ADR-0041 §3, §4). Pure function.
 * Uma partida a débito por linha de pagamento, na conta do meio (`contas` sobrepõe-se
 * à omissão meio a meio); C 711 = subtotal; C 44331 = IVA (se > 0).
 * Invariante: Σ débitos = Σ créditos = total — senão PAGAMENTOS_NAO_BATEM_TOTAL.
 */
export function construirLancamentoVendaPOS(
  doc: {
    id: string;
    numero: string;
    total: Prisma.Decimal;
    subtotal: Prisma.Decimal;
    ivaTotal: Prisma.Decimal;
    dataEmissao: Date;
  },
  pagamentos: ReadonlyArray<{ tipo: MetodoPagamentoTipo; valor: Prisma.Decimal }>,
  contas: Partial<Record<MetodoPagamentoTipo, string>> = {},
): RegistarLancamentoContabilisticoInput {
  const pago = pagamentos.reduce((a, p) => a.plus(p.valor), new Prisma.Decimal(0));
  if (!pago.equals(doc.total)) {
    throw new BusinessRuleError(
      'PAGAMENTOS_NAO_BATEM_TOTAL',
      `A soma dos pagamentos (${pago.toFixed(2)}) não coincide com o total da venda (${doc.total.toFixed(2)}).`,
    );
  }

  const partidas: RegistarLancamentoContabilisticoInput['partidas'] = pagamentos.map((p) => ({
    contaCodigo: contas[p.tipo] ?? CONTA_MEIO_PAGAMENTO_POS[p.tipo],
    tipo: 'DEBITO' as const,
    valor: p.valor.toFixed(2),
    historico: `${doc.numero} — recebimento (${p.tipo})`,
  }));
  partidas.push({
    contaCodigo: PGC_FATURACAO.RECEITA_VENDAS,
    tipo: 'CREDITO',
    valor: doc.subtotal.toFixed(2),
    historico: `${doc.numero} — receita de vendas`,
  });
  if (doc.ivaTotal.greaterThan(0)) {
    partidas.push({
      contaCodigo: PGC_FATURACAO.IVA_LIQUIDADO,
      tipo: 'CREDITO',
      valor: doc.ivaTotal.toFixed(2),
      historico: `${doc.numero} — IVA liquidado`,
    });
  }

  return {
    data: doc.dataEmissao,
    diarioTipo: 'VENDAS',
    origem: 'VENDA',
    documentoOrigemId: doc.id,
    documentoOrigemTipo: 'Fatura',
    historico: `Venda POS ${doc.numero}`,
    partidas,
  };
}

export function construirLancamentoNotaDebito(nd: {
  id: string;
  numero: string;
  total: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  ivaTotal: Prisma.Decimal;
  dataEmissao: Date;
  /** Conta creditada pelo subtotal, decidida pela natureza (ADR-0039 §1); omissão 711. */
  contaCreditoCodigo?: string;
}): RegistarLancamentoContabilisticoInput {
  // Nota de débito: o cliente passa a dever mais → D Clientes, C conta da natureza (+IVA)
  // É o espelho contabilístico da nota de crédito.
  const partidas: RegistarLancamentoContabilisticoInput['partidas'] = [
    {
      contaCodigo: PGC_FATURACAO.CLIENTES_CC,
      tipo: 'DEBITO',
      valor: nd.total.toFixed(2),
      historico: `ND ${nd.numero} — débito clientes`,
    },
    {
      contaCodigo: nd.contaCreditoCodigo ?? PGC_FATURACAO.RECEITA_VENDAS,
      tipo: 'CREDITO',
      valor: nd.subtotal.toFixed(2),
      historico: `ND ${nd.numero} — débito adicional`,
    },
  ];

  if (nd.ivaTotal.greaterThan(0)) {
    partidas.push({
      contaCodigo: PGC_FATURACAO.IVA_LIQUIDADO,
      tipo: 'CREDITO',
      valor: nd.ivaTotal.toFixed(2),
      historico: `ND ${nd.numero} — IVA adicional`,
    });
  }

  return {
    data: nd.dataEmissao,
    diarioTipo: 'VENDAS',
    origem: 'VENDA',
    documentoOrigemId: nd.id,
    documentoOrigemTipo: 'NotaDebito',
    historico: `Nota de débito ${nd.numero}`,
    partidas,
  };
}

// ---------------------------------------------------------------------------
// proximoNumeroSerie — UPDATE...RETURNING atómico (sem lacunas)
// Chamado por todos os WS via $transaction.
// ---------------------------------------------------------------------------

/**
 * Devolve o ano civil do documento em Africa/Maputo.
 *
 * Necessário porque o servidor corre em UTC: um documento emitido a 1 de
 * Janeiro de 2027 às 00:30 de Maputo (= 2026-12-31T22:30Z) tem ano 2027
 * em Maputo mas 2026 em UTC. Usar getFullYear() aqui escolheria a série de
 * 2026 para um documento de 2027.
 */
function anoFiscalDe(data: Date): number {
  const partes = new Intl.DateTimeFormat('pt-MZ', {
    timeZone: 'Africa/Maputo',
    year: 'numeric',
  }).formatToParts(data);
  return parseInt(partes.find((p) => p.type === 'year')!.value, 10);
}

/**
 * Numera um documento e devolve também a série que o numerou (#93).
 *
 * A série de um documento não se escolhe: é a activa do tipo no ano (Maputo)
 * da data do documento — com a #149 há no máximo uma. Quem emite grava
 * `serieDocumentoId` = o id devolvido aqui, nunca um id vindo do input.
 */
export async function numerarDocumento(
  tx: Prisma.TransactionClient,
  tipo: TipoSerieDocumento,
  ctx: Ctx,
  data: Date,
): Promise<{ numero: string; serieDocumentoId: string }> {
  // ADR-0033 §4: filtra pelo ano do documento (em Africa/Maputo) em vez de ORDER BY ano DESC.
  // O modo de falha anterior era silencioso: a 1 de Janeiro de 2027, com só a série de 2026
  // activa, continuava a emitir FAT/2026/000487 para documentos de 2027. Agora lança
  // SERIE_NAO_ENCONTRADA — um erro que pára a emissão e se repara em 5 minutos.
  const anoDocumento = anoFiscalDe(data);

  // Incrementa atomicamente e devolve o número anterior (que irá usar o documento).
  // FOR UPDATE na subquery garante serialização sem lacunas mesmo com transacções concorrentes.
  const rows = await tx.$queryRaw<
    Array<{ id: string; numero: number; prefixo: string; ano: number; formatoNumero: string }>
  >`
    UPDATE "SerieDocumento"
    SET "proximoNumero" = "proximoNumero" + 1
    WHERE id = (
      SELECT id FROM "SerieDocumento"
      WHERE "tenantId" = ${ctx.tenantId}
        AND tipo::text = ${tipo as string}
        AND ativo = true
        AND ano = ${anoDocumento}
      ORDER BY "createdAt" DESC
      LIMIT 1
      FOR UPDATE
    )
    RETURNING id, "proximoNumero" - 1 AS numero, prefixo, ano, "formatoNumero"
  `;

  if (!rows.length) {
    throw new BusinessRuleError(
      'SERIE_NAO_ENCONTRADA',
      `Série activa para tipo "${tipo}" no ano ${anoDocumento} não encontrada. Crie a série ${anoDocumento} primeiro.`,
    );
  }

  const { id, numero, prefixo, ano, formatoNumero } = rows[0];
  return { numero: formatarNumero(formatoNumero, { prefixo, ano, numero }), serieDocumentoId: id };
}

/** Contrato dos outros domínios: só o número (a série fica por conta de `numerarDocumento`). */
export async function proximoNumeroSerie(
  tx: Prisma.TransactionClient,
  tipo: TipoSerieDocumento,
  ctx: Ctx,
  data: Date,
): Promise<string> {
  return (await numerarDocumento(tx, tipo, ctx, data)).numero;
}

// ---------------------------------------------------------------------------
// Séries de documento
// ---------------------------------------------------------------------------

// Invariantes (#149): S1 uma activa por tenant+tipo+ano · S2/S3 usada ⇔
// proximoNumero > numeroInicial, e usada não se edita nem elimina · S4 formato
// fixo · S5 criação só no ano corrente ou no seguinte (Africa/Maputo).
//
// Tudo corre no cliente ESTENDIDO (a auditoria só vê o que passa por ele) e com
// escritas singulares. O estado que decide é lido DEPOIS da tranca. Um P2002
// aborta a transacção no Postgres: traduz-se fora do `$transaction`.

type TxSeries = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

const rotuloTipo = (tipo: TipoSeriePrisma): string =>
  (ROTULO_TIPO_SERIE as Partial<Record<TipoSeriePrisma, string>>)[tipo] ?? tipo;

function erroActivaExistente(tipo: TipoSeriePrisma, ano: number): BusinessRuleError {
  return new BusinessRuleError(
    'SERIE_ACTIVA_EXISTENTE',
    `Já existe uma série activa de ${rotuloTipo(tipo)} para ${ano}. Desactive-a primeiro.`,
  );
}

function erroDuplicada(): BusinessRuleError {
  return new BusinessRuleError(
    'SERIE_DUPLICADA',
    'Já existe uma série com este prefixo para o mesmo tipo e ano. Escolha outro prefixo.',
  );
}

function erroUsada(): BusinessRuleError {
  return new BusinessRuleError(
    'SERIE_USADA',
    'Esta série já numerou documentos: não pode ser alterada nem eliminada. Desactive-a e crie uma nova.',
  );
}

const erroPrisma = (e: unknown, code: string): e is Prisma.PrismaClientKnownRequestError =>
  e instanceof Prisma.PrismaClientKnownRequestError && e.code === code;

const eUnicidade = (e: unknown) => erroPrisma(e, 'P2002');

const INDICE_ACTIVA_UNICA = 'SerieDocumento_activa_unica';
const CAMPOS_ACTIVA_UNICA = 'ano,tenantId,tipo';

/**
 * O P2002 veio do índice parcial `SerieDocumento_activa_unica`?
 *
 * Forma REAL no Prisma 7 + `@prisma/adapter-pg` (observada contra o Postgres
 * local): sem `meta.target`; o nome só aparece em
 * `meta.driverAdapterError.cause.originalMessage` («…violates unique constraint
 * "SerieDocumento_activa_unica"») e os campos em
 * `meta.driverAdapterError.cause.constraint.fields` (`['"tenantId"','tipo','ano']`,
 * com aspas quando o identificador as exige). Aceita-se também `meta.target`
 * (nome ou lista de campos) e o nome na mensagem. O `@@unique` concorrente
 * inclui `prefixo`, por isso o conjunto exacto {tenantId,tipo,ano} só pode ser
 * o índice parcial.
 */
function eActivaUnica(e: Prisma.PrismaClientKnownRequestError): boolean {
  const meta = (e.meta ?? {}) as Record<string, unknown>;
  const causa = (meta.driverAdapterError as { cause?: Record<string, unknown> } | undefined)?.cause;
  const textos = [e.message, meta.target, causa?.originalMessage, (causa?.constraint as { index?: unknown } | undefined)?.index];
  if (textos.some((t) => typeof t === 'string' && t.includes(INDICE_ACTIVA_UNICA))) return true;
  const campos = [meta.target, (causa?.constraint as { fields?: unknown } | undefined)?.fields].find(Array.isArray);
  if (!campos) return false;
  const norm = (campos as unknown[]).map((c) => String(c).replace(/"/g, '')).sort().join(',');
  return norm === CAMPOS_ACTIVA_UNICA;
}

/** Tipos operacionais (VENDA, ENCOMENDA…) não se gerem pelo ecrã: são 404. */
const eTipoGerivel = (tipo: TipoSeriePrisma): boolean => TipoSerieDocumentoEnum.safeParse(tipo).success;

/** Serializa quem cria ou activa séries do mesmo tenant+tipo+ano (S1). */
async function trancarTipoAno(tx: TxSeries, tenantId: string, tipo: TipoSeriePrisma, ano: number): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('series:' || ${tenantId}::text || ':' || ${tipo}::text || ':' || ${String(ano)}::text, 0))`;
}

/** Tranca a linha da série (só se for do tenant) e lê-a depois da tranca. */
async function trancarSerie(tx: TxSeries, id: string, tenantId: string) {
  await tx.$queryRaw`SELECT id FROM "SerieDocumento" WHERE id = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
  const serie = await tx.serieDocumento.findFirst({ where: { id, tenantId } });
  // Outro tenant ou tipo fora do ecrã: para quem pede, a série não existe.
  if (!serie || !eTipoGerivel(serie.tipo)) throw new NotFoundError('Série de documento não encontrada.');
  return serie;
}

async function outraActiva(tx: TxSeries, tenantId: string, tipo: TipoSeriePrisma, ano: number, excluirId?: string) {
  return tx.serieDocumento.findFirst({
    where: {
      tenantId,
      tipo,
      ano,
      ativo: true,
      ...(excluirId ? { id: { not: excluirId } } : {}),
    },
    select: { id: true },
  });
}

export async function criarSerie(input: CriarSerieDocumentoInput, ctx: Ctx): Promise<SerieDocumento> {
  if (!anosPermitidos(new Date()).includes(input.ano)) {
    const [corrente, seguinte] = anosPermitidos(new Date());
    throw new BusinessRuleError(
      'SERIE_ANO_INVALIDO',
      `Só é possível criar séries para ${corrente} ou ${seguinte}.`,
    );
  }
  const prefixo = input.prefixo.toUpperCase();
  try {
    return (await prisma.$transaction(async (tx) => {
      await trancarTipoAno(tx, ctx.tenantId, input.tipo, input.ano);
      if (await outraActiva(tx, ctx.tenantId, input.tipo, input.ano)) {
        throw erroActivaExistente(input.tipo, input.ano);
      }
      return tx.serieDocumento.create({
        data: {
          tenantId: ctx.tenantId,
          tipo: input.tipo,
          prefixo,
          ano: input.ano,
          formatoNumero: FORMATO_NUMERO_SERIE,
          numeroInicial: input.numeroInicial,
          proximoNumero: input.numeroInicial,
          ativo: true,
        },
      });
    })) as unknown as SerieDocumento;
  } catch (e) {
    if (eUnicidade(e)) throw eActivaUnica(e) ? erroActivaExistente(input.tipo, input.ano) : erroDuplicada();
    throw e;
  }
}

export async function editarSerie(input: EditarSerieDocumentoInput, ctx: Ctx): Promise<SerieDocumento> {
  try {
    return (await prisma.$transaction(async (tx) => {
      const serie = await trancarSerie(tx, input.id, ctx.tenantId);
      if (serieUsada(serie)) throw erroUsada();
      return tx.serieDocumento.update({
        where: { id: serie.id, tenantId: ctx.tenantId },
        data: {
          prefixo: input.prefixo.toUpperCase(),
          numeroInicial: input.numeroInicial,
          proximoNumero: input.numeroInicial,
        },
      });
    })) as unknown as SerieDocumento;
  } catch (e) {
    if (eUnicidade(e)) throw erroDuplicada();
    throw e;
  }
}

export async function activarSerie(input: IdSerieDocumentoInput, ctx: Ctx): Promise<SerieDocumento> {
  // Guardado para traduzir o P2002 fora da transacção com o rótulo do tipo.
  let alvo: { tipo: TipoSeriePrisma; ano: number } | undefined;
  try {
    return (await prisma.$transaction(async (tx) => {
      const serie = await trancarSerie(tx, input.id, ctx.tenantId);
      alvo = { tipo: serie.tipo, ano: serie.ano };
      if (serie.ativo) return serie;
      // A chave da tranca depende do tipo+ano, que só se conhece lendo a linha já trancada.
      await trancarTipoAno(tx, ctx.tenantId, serie.tipo, serie.ano);
      if (await outraActiva(tx, ctx.tenantId, serie.tipo, serie.ano, serie.id)) {
        throw erroActivaExistente(serie.tipo, serie.ano);
      }
      // S5 só limita a criação: reactivar uma série de um ano antigo é permitido.
      return tx.serieDocumento.update({
        where: { id: serie.id, tenantId: ctx.tenantId },
        data: { ativo: true },
      });
    })) as unknown as SerieDocumento;
  } catch (e) {
    // Só o índice parcial `SerieDocumento_activa_unica` pode recusar este update.
    if (eUnicidade(e) && alvo) throw erroActivaExistente(alvo.tipo, alvo.ano);
    throw e;
  }
}

export async function desactivarSerie(input: IdSerieDocumentoInput, ctx: Ctx): Promise<SerieDocumento> {
  return (await prisma.$transaction(async (tx) => {
    const serie = await trancarSerie(tx, input.id, ctx.tenantId);
    if (!serie.ativo) return serie;
    return tx.serieDocumento.update({
      where: { id: serie.id, tenantId: ctx.tenantId },
      data: { ativo: false },
    });
  })) as unknown as SerieDocumento;
}

export async function eliminarSerie(input: IdSerieDocumentoInput, ctx: Ctx): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const serie = await trancarSerie(tx, input.id, ctx.tenantId);
      if (serieUsada(serie)) throw erroUsada();
      await tx.serieDocumento.delete({ where: { id: serie.id, tenantId: ctx.tenantId } });
    });
  } catch (e) {
    // FK Restrict: há documentos a apontar para a série, mesmo sem S2 a dizer
    // «usada» (p.ex. emitidos por outra via). Aborta a tx: traduz-se aqui fora.
    if (erroPrisma(e, 'P2003')) throw erroUsada();
    throw e;
  }
}

/**
 * #235: cria as séries do ano seguinte (Africa/Maputo) a partir da UI — uma activa por tipo
 * de `SERIES_INICIAIS` (prefixo e formato do bootstrap) que ainda não tenha série NENHUMA
 * nesse ano: activa ou inactiva, com qualquer prefixo. Um tipo já configurado não é tocado
 * (nem outra série, nem reactivação, nem numeração); nunca cria o ano a seguir.
 * Idempotente: a tranca tenant+ano serializa dois cliques e a de tipo+ano (a mesma de
 * `criarSerie`) exclui uma criação manual concorrente. Escritas singulares no cliente
 * estendido, como as outras séries: cada criação fica no trilho de auditoria.
 */
export async function criarSeriesAnoSeguinte(ctx: Ctx): Promise<{ ano: number; criadas: number }> {
  const ano = anosPermitidos(new Date())[1];
  const criadas = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('series-ano:' || ${ctx.tenantId}::text || ':' || ${String(ano)}::text, 0))`;
    let n = 0;
    for (const s of SERIES_INICIAIS) {
      const tipo = s.tipo as TipoSeriePrisma;
      await trancarTipoAno(tx, ctx.tenantId, tipo, ano);
      const existe = await tx.serieDocumento.findFirst({
        where: { tenantId: ctx.tenantId, tipo, ano },
        select: { id: true },
      });
      if (existe) continue;
      await tx.serieDocumento.create({
        data: {
          tenantId: ctx.tenantId,
          tipo,
          prefixo: s.prefixo,
          ano,
          formatoNumero: FORMATO_NUMERO_SERIE,
          numeroInicial: 1,
          proximoNumero: 1,
          ativo: true,
        },
      });
      n += 1;
    }
    return n;
  });
  return { ano, criadas };
}

export async function listarSeries(ctx: Ctx): Promise<SerieDocumento[]> {
  return prisma.serieDocumento.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: [{ tipo: 'asc' }, { ano: 'desc' }],
  }) as unknown as SerieDocumento[];
}

// ---------------------------------------------------------------------------
// Travão de emissão sem e-mail confirmado (ADR-0031, «O que a verificação
// pendente trava»)
// ---------------------------------------------------------------------------

/**
 * Recusa emitir um documento fiscal enquanto o endereço de e-mail da conta não
 * estiver confirmado.
 *
 * Porque vive AQUI, e não no pipeline nem no formulário:
 *
 *  - **No serviço, não no formulário.** Um botão desactivado não é defesa — a
 *    Server Action aceita o que lhe mandarem, venha de onde vier. É a mesma
 *    regra já aplicada às contas com lançamentos.
 *  - **Neste serviço, não numa abstracção partilhada.** São dois travões em
 *    todo o produto (este e o de criar/reactivar `User`); dois sítios não
 *    justificam um mecanismo. Mesma escolha e mesmo racional do ADR-0027 §3
 *    para os limites de plano. Se um dia forem seis, aí discute-se.
 *  - **Não em `safe-action.ts`/`with-api.ts`.** Um travão global no pipeline é
 *    precisamente o que este spec NÃO faz: só dois actos são recusados, e o
 *    resto do produto — configurar, importar, explorar, pagar, exportar — tem
 *    de continuar a passar.
 *
 * A leitura é a sessão (ADR-0031 §6): o claim `email_verified` do *access
 * token* já viaja para o JWT e para a sessão na emissão e na re-resolução de
 * 15 minutos do ADR-0011. Sem coluna local e sem uma chamada ao Keycloak por
 * operação.
 *
 * **Fail-closed**: sessão ausente, utilizador ausente ou campo ausente contam
 * como não confirmado. É o que a propagação da L4 já faz com o claim em falta,
 * e é o lado seguro para o acto irreversível e com efeito para terceiros.
 *
 * A mensagem trata a janela dos 15 minutos sem chamar o Keycloak: quem
 * confirmou há pouco continua a bater no travão até à re-resolução seguinte, e
 * uma mensagem que dissesse apenas «o seu e-mail não está confirmado» estaria a
 * afirmar-lhe uma coisa falsa. Diz o que é verdade nos dois casos e dá a saída
 * imediata (reiniciar a sessão).
 *
 * **Se estás aqui a construir facturação recorrente, um cron ou qualquer outro
 * chamador SEM sessão: pára.** Este travão é fail-closed, portanto essa
 * chamada será recusada — e a correcção NÃO é abrir excepção ao travão. É
 * decidir primeiro o que significa «e-mail confirmado» para um processo sem
 * pessoa, e registá-lo. Hoje não existe nenhum chamador nessa situação: as
 * rotas de cron não emitem, e os seeds só mencionam esta função num comentário.
 *
 * Os núcleos `emitirDocumentoEmTx`/`emitirNotaCreditoEmTx` NÃO chamam o travão:
 * são a porta para quem já tem a sua própria transacção (POS, devolução,
 * troca). O travão continua a ser obrigação do chamador com sessão — no POS
 * aplica-se na abertura da sessão (ADR-0041 §6). Um chamador sem pessoa
 * continua proibido pelas mesmas razões.
 */
export async function exigirEmailConfirmadoParaEmitir(): Promise<void> {
  // `await import` e não import estático: `@/lib/auth` arrasta o next-auth
  // inteiro, e este ficheiro é importado por todo o lado onde se lê facturação
  // — inclusive por caminhos que nunca emitem nada. Assim o custo só existe
  // quando se emite. (Mesmo motivo por que a L4 importa o transporte de e-mail
  // desta maneira em `keycloak.ts`.)
  const { auth } = await import('@/lib/auth');
  const sessao = await auth();
  if (sessao?.user?.emailVerificado === true) return;

  throw new BusinessRuleError(
    'EMAIL_POR_CONFIRMAR_EMISSAO',
    'Para emitir documentos fiscais é preciso confirmar o endereço de e-mail da conta — ' +
      'um documento fiscal é irreversível e tem efeito para terceiros. Abra a ligação de ' +
      'confirmação que lhe enviámos; o aviso no painel reenvia-a se precisar de outra. ' +
      'Se já confirmou há pouco, a sessão só o reflecte na actualização seguinte (até 15 ' +
      'minutos) — terminar e iniciar sessão outra vez aplica a confirmação de imediato.',
  );
}

// ---------------------------------------------------------------------------
// Facturas
// ---------------------------------------------------------------------------

export async function emitirFatura(input: EmitirFaturaInput, ctx: Ctx): Promise<FaturaEmitida> {
  await exigirEmailConfirmadoParaEmitir();
  return prismaBase.$transaction(async (tx) => {
    const fatura = await emitirDocumentoEmTx(tx, input, ctx);
    return { ...fatura, avisos: await avisosLimiteCreditoEmTx(tx, input.clienteId, ctx) };
  });
}

// ---------------------------------------------------------------------------
// Crédito utilizado (#318) — derivado das facturas, sem contador armazenado
// ---------------------------------------------------------------------------

/** Estados em que a factura ainda é dívida do cliente. */
const STATUS_FATURA_EM_ABERTO = ['EMITIDA', 'PARCIALMENTE_PAGA', 'VENCIDA'] as const;

/**
 * Crédito utilizado por cliente: o saldo em aberto na 411 —
 * Σ (total − totalPago) das facturas EMITIDA/PARCIALMENTE_PAGA/VENCIDA
 * − Σ total das NC ainda EMITIDAS sobre essas facturas (a NC cancelada foi estornada; a
 * liquidada por compensação já está no `totalPago`). Clientes sem dívida não aparecem.
 * `clienteIds` omisso = todos os clientes do tenant.
 */
export async function creditoUtilizadoPorCliente(
  tx: Prisma.TransactionClient,
  ctx: Pick<Ctx, 'tenantId'>,
  clienteIds?: string[],
): Promise<Map<string, Prisma.Decimal>> {
  const filtroFatura = {
    tenantId: ctx.tenantId,
    status: { in: [...STATUS_FATURA_EM_ABERTO] },
    ...(clienteIds ? { clienteId: { in: clienteIds } } : {}),
  };
  const [faturas, ncs] = await Promise.all([
    tx.fatura.groupBy({ by: ['clienteId'], where: filtroFatura, _sum: { total: true, totalPago: true } }),
    tx.notaCredito.findMany({
      where: { tenantId: ctx.tenantId, status: 'EMITIDA', faturaOriginal: filtroFatura },
      select: { total: true, faturaOriginal: { select: { clienteId: true } } },
    }),
  ]);
  const saldo = new Map<string, Prisma.Decimal>();
  const somar = (clienteId: string, v: Prisma.Decimal) =>
    saldo.set(clienteId, (saldo.get(clienteId) ?? new Prisma.Decimal(0)).plus(v));
  for (const f of faturas) {
    somar(f.clienteId, new Prisma.Decimal(f._sum.total ?? 0).minus(f._sum.totalPago ?? 0));
  }
  for (const nc of ncs) somar(nc.faturaOriginal.clienteId, nc.total.negated());
  for (const [id, v] of saldo) if (!v.greaterThan(0)) saldo.delete(id);
  return saldo;
}

/** Crédito utilizado de um cliente (0 sem dívida em aberto) — ver `creditoUtilizadoPorCliente`. */
export async function creditoUtilizadoDoCliente(
  tx: Prisma.TransactionClient,
  clienteId: string,
  ctx: Pick<Ctx, 'tenantId'>,
): Promise<Prisma.Decimal> {
  const saldo = await creditoUtilizadoPorCliente(tx, ctx, [clienteId]);
  return saldo.get(clienteId) ?? new Prisma.Decimal(0);
}

/**
 * Avisos (não bloqueia) a emitir depois de dar crédito ao cliente na tx: o crédito utilizado
 * excede o limite de crédito? Limite 0 = sem limite definido; igualar o limite não avisa.
 */
export async function avisosLimiteCreditoEmTx(
  tx: Prisma.TransactionClient,
  clienteId: string,
  ctx: Ctx,
): Promise<string[]> {
  const cliente = await tx.cliente.findFirst({
    where: { id: clienteId, tenantId: ctx.tenantId },
    select: { nome: true, limiteCreditoMT: true },
  });
  const limite = new Prisma.Decimal(cliente?.limiteCreditoMT ?? 0);
  if (!limite.greaterThan(0)) return [];
  const utilizado = await creditoUtilizadoDoCliente(tx, clienteId, ctx);
  if (!utilizado.greaterThan(limite)) return [];
  return [
    `O cliente ${cliente!.nome} passa a ter ${utilizado.toFixed(2)} MT de crédito utilizado, ` +
      `acima do limite de crédito de ${limite.toFixed(2)} MT.`,
  ];
}

/**
 * #329 (ADR-0039 §4): uma linha a 0% de Factura/NC/ND tem de dizer porquê. Vive nos núcleos
 * de emissão (não no schema, que Proforma/Cotação partilham) e corre antes de qualquer escrita.
 */
function exigirMotivoIsencao(linhas: ReadonlyArray<{ taxaIva: number; motivoIsencao?: string | null }>): void {
  const em = linhas.findIndex((l) => motivoIsencaoEmFalta(l));
  if (em >= 0) {
    throw new BusinessRuleError(
      'MOTIVO_ISENCAO_EM_FALTA',
      `A linha ${em + 1} tem IVA a 0%: indique o motivo de isenção ou de não sujeição.`,
    );
  }
}

/** O motivo só se grava na linha a 0%; numa tributada não tem sentido e fica `null`. */
function motivoIsencaoDaLinha(l: { taxaIva: number; motivoIsencao?: string | null }): string | null {
  return l.taxaIva === 0 ? l.motivoIsencao?.trim() || null : null;
}

/**
 * Motivo de isenção das linhas a 0% emitidas sem ninguém que o escreva (POS, anulação, devolução,
 * troca, conversão de proforma): texto legal fixo, derivado do regime de IVA do tenant (#329).
 */
export async function motivoIsencaoAutomaticoEmTx(tx: Prisma.TransactionClient, ctx: Ctx): Promise<string> {
  const cfg = await tx.configuracaoFiscal.findUnique({
    where: { tenantId: ctx.tenantId },
    select: { regimeIva: true },
  });
  return motivoIsencaoAutomatico(cfg?.regimeIva);
}

/**
 * #336 — sha256(serialização determinística do documento + hash do último documento da
 * MESMA série). Chamar depois de `numerarDocumento`, que tranca a série até ao commit.
 * O primeiro documento de uma série encadeia com a string vazia.
 */
async function calcularHashIntegridade(
  tx: Prisma.TransactionClient,
  ctx: Ctx,
  serieDocumentoId: string,
  documento: FaturaInput,
  nuitAdquirente: string | null,
): Promise<string> {
  const [emitente, anterior] = await Promise.all([
    // `$queryRaw` (e não `tx.tenant`): os duplos de tx dos testes unitários só expõem os
    // delegados que a emissão já usava.
    tx.$queryRaw<Array<{ nuit: string }>>`SELECT nuit FROM "Tenant" WHERE id = ${ctx.tenantId}`,
    tx.fatura.findFirst({
      where: { tenantId: ctx.tenantId, serieDocumentoId },
      orderBy: { numero: 'desc' },
      select: { hashValidacao: true },
    }),
  ]);
  const serializacao = serializarDocumentoParaHash(documento, {
    nuitEmitente: emitente[0]?.nuit ?? '',
    nuitAdquirente,
  });
  return createHash('sha256')
    .update(serializacao + (anterior?.hashValidacao ?? ''))
    .digest('hex');
}

/**
 * Núcleo da emissão de factura (ADR-0041 §3): corre na transacção do chamador e
 * NÃO consulta a sessão — o travão de e-mail é de quem chama (`emitirFatura`,
 * `converterProformaEmFatura`; o POS aplica-o na abertura da sessão, §6).
 */
export async function emitirDocumentoEmTx(
  tx: Prisma.TransactionClient,
  input: EmitirFaturaInput,
  ctx: Ctx,
  opcoes: OpcoesEmissaoDocumento = {},
): Promise<FaturaCompleta> {
  const { tipoSerie = 'FATURA', pagamentos } = opcoes;
  exigirMotivoIsencao(input.linhas);
  const totais = calcularTotaisLinhas(input.linhas);
  const ZERO = new Prisma.Decimal(0);
  if (pagamentos) {
    const pago = pagamentos.reduce((a, p) => a.plus(p.valor), ZERO);
    if (!pago.equals(totais.total)) {
      throw new BusinessRuleError(
        'PAGAMENTOS_NAO_BATEM_TOTAL',
        `A soma dos pagamentos (${pago.toFixed(2)}) não coincide com o total do documento (${totais.total.toFixed(2)}).`,
      );
    }
  }
  // Factura-Recibo ⇔ PAGA (ADR-0041 §1); factura com parte recebida ⇔ PARCIALMENTE_PAGA (§4).
  // O estado deriva da série e dos pagamentos: recebido = Σ dos meios que não são CREDITO.
  const recebido =
    tipoSerie === 'FATURA_RECIBO'
      ? totais.total
      : (pagamentos ?? []).filter((p) => p.tipo !== 'CREDITO').reduce((a, p) => a.plus(p.valor), ZERO);
  if (tipoSerie !== 'FATURA_RECIBO' && !recebido.isZero() && !recebido.lessThan(totais.total)) {
    throw new BusinessRuleError(
      'OPCOES_EMISSAO_INCOERENTES',
      `Um documento da série ${tipoSerie} recebido por inteiro (${recebido.toFixed(2)}) tem de ser Factura-Recibo.`,
    );
  }
  const status = tipoSerie === 'FATURA_RECIBO' ? 'PAGA' : recebido.greaterThan(0) ? 'PARCIALMENTE_PAGA' : 'EMITIDA';
  // Conta a débito por meio (configuração do tenant, ADR-0041 §4) — lida antes de qualquer escrita.
  const contasMeio = pagamentos ? await resolverContasPagamentoPOS(tx, ctx) : {};
  // W9: validar FKs cross-domínio contra tenant
  const cliente = await tx.cliente.findFirst({
    where: { id: input.clienteId, tenantId: ctx.tenantId },
    select: { id: true, nuit: true, status: true, deletedAt: true },
  });
  if (!cliente) throw new NotFoundError('Cliente não encontrado');
  // Factura não paga = crédito ao cliente (#317); a Factura-Recibo (pronto) não é afectada.
  if (tipoSerie === 'FATURA') exigirClienteAtivoParaCredito(cliente);

  if (input.vendaId) {
    const venda = await tx.venda.findFirst({
      where: { id: input.vendaId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!venda) throw new NotFoundError('Venda não encontrada');
  }

  const { numero, serieDocumentoId } = await numerarDocumento(tx, tipoSerie, ctx, input.dataEmissao);

  const linhas = input.linhas.map((l, i) => ({
    produtoId: l.produtoId ?? null,
    descricao: l.descricao,
    quantidade: new Prisma.Decimal(l.quantidade.toFixed(4)),
    precoUnitario: new Prisma.Decimal(l.precoUnitario.toFixed(2)),
    desconto: new Prisma.Decimal(l.desconto.toFixed(2)),
    taxaIva: new Prisma.Decimal(l.taxaIva.toFixed(4)),
    subtotal: new Prisma.Decimal(l.subtotal.toFixed(2)),
    ivaItem: new Prisma.Decimal(l.ivaItem.toFixed(2)),
    total: new Prisma.Decimal(l.total.toFixed(2)),
    motivoIsencao: motivoIsencaoDaLinha(l),
    ordemLinha: l.ordemLinha ?? i,
  }));
  const moeda = input.moeda ?? 'MZN';

  // #336 — hash de integridade encadeado por série. A série já está trancada por
  // `numerarDocumento` (FOR UPDATE até ao commit), logo o «último» lido aqui é estável.
  const hashValidacao = await calcularHashIntegridade(tx, ctx, serieDocumentoId, {
    numero,
    serieTipo: tipoSerie,
    moeda,
    dataEmissao: input.dataEmissao,
    dataVencimento: input.dataVencimento,
    ...totais,
    linhas,
  }, cliente.nuit ?? null);

  const fatura = await tx.fatura.create({
    data: {
      tenantId: ctx.tenantId,
      serieDocumentoId,
      numero,
      hashValidacao,
      qrCode: null,
      clienteId: input.clienteId,
      // NUIT congelado na emissão: o mapa de IVA reproduz-se mesmo que o cliente mude (§8).
      nuitCliente: cliente.nuit ?? null,
      vendaId: input.vendaId ?? null,
      moeda,
      ...totais,
      totalPago: recebido,
      status,
      dataEmissao: input.dataEmissao,
      dataVencimento: input.dataVencimento,
      observacoes: input.observacoes ?? null,
      emitidoPorId: ctx.userId,
    },
  });

  await Promise.all(
    linhas.map((l) => tx.linhaFatura.create({ data: { tenantId: ctx.tenantId, faturaId: fatura.id, ...l } })),
  );

  // Wave 3: lançamento contabilístico automático na MESMA transacção.
  // O retorno é guardado para ligar Fatura.lancamentoId — sem esta ligação
  // a pré-condição DOCUMENTO_SEM_LANCAMENTO impede o apuramento de IVA e o
  // fecho do período em TODOS os meses com actividade (verificado em prod).
  const lancavel = {
    id: fatura.id,
    numero: fatura.numero,
    total: totais.total,
    subtotal: totais.subtotal,
    ivaTotal: totais.ivaTotal,
    dataEmissao: input.dataEmissao,
  };
  const lancamentoFatura = await registarLancamentoContabilistico(
    tx,
    pagamentos ? construirLancamentoVendaPOS(lancavel, pagamentos, contasMeio) : construirLancamentoFatura(lancavel),
    ctx,
  );
  await tx.fatura.update({
    where: { id: fatura.id },
    data: { lancamentoId: lancamentoFatura.id },
  });

  // #134 — a ficha do cliente: uma entrada por documento, no estado com que nasce.
  await registarHistoricoTransacaoEmTx(
    tx,
    {
      clienteId: input.clienteId,
      tipo: 'VENDA',
      referencia: numero,
      descricao: `${tipoSerie === 'FATURA_RECIBO' ? 'Factura-Recibo' : 'Factura'} ${numero}`,
      valor: totais.total,
      moeda,
      dataTransacao: input.dataEmissao,
      status: status === 'PAGA' ? 'CONCLUIDO' : 'PENDENTE',
    },
    ctx,
  );

  return tx.fatura.findFirst({
    where: { id: fatura.id },
    include: {
      linhas: { orderBy: { ordemLinha: 'asc' } },
      serieDocumento: { select: { id: true, tipo: true, prefixo: true, ano: true } },
    },
  }) as unknown as FaturaCompleta;
}

export async function obterFatura(id: string, ctx: Ctx): Promise<FaturaCompleta | null> {
  return prisma.fatura.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      linhas: { orderBy: { ordemLinha: 'asc' } },
      serieDocumento: { select: { id: true, tipo: true, prefixo: true, ano: true } },
    },
  }) as unknown as FaturaCompleta | null;
}

export async function listarFaturas(filtro: FiltroFaturaInput, ctx: Ctx): Promise<PaginacaoFaturacao<FaturaCompleta>> {
  return paginate(
    (a) =>
      prisma.fatura.findMany({
        ...a,
        where: {
          tenantId: ctx.tenantId,
          ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
          ...(filtro.status ? { status: filtro.status } : {}),
          ...(filtro.dataEmissaoInicio || filtro.dataEmissaoFim
            ? { dataEmissao: { ...(filtro.dataEmissaoInicio ? { gte: filtro.dataEmissaoInicio } : {}), ...(filtro.dataEmissaoFim ? { lte: filtro.dataEmissaoFim } : {}) } }
            : {}),
          ...(filtro.search ? { OR: [{ numero: { contains: filtro.search } }] } : {}),
        },
        include: {
          linhas: { orderBy: { ordemLinha: 'asc' } },
          serieDocumento: { select: { id: true, tipo: true, prefixo: true, ano: true } },
        },
        orderBy: { dataEmissao: 'desc' },
      }),
    { cursor: filtro.cursor, take: filtro.take },
  ) as unknown as Promise<PaginacaoFaturacao<FaturaCompleta>>;
}

/**
 * O dinheiro de um recebimento ou de uma devolução passa pelo caixa (numerário) ou pela
 * banca (o resto): a permissão do meio confere-se ANTES de tudo o resto.
 */
function exigirPermissaoDoMeio(
  forma: RegistarPagamentoFaturaInput['formaPagamento'],
  permissions: ReadonlySet<string> | undefined,
  operacao: string,
): void {
  const numerario = forma === 'NUMERARIO';
  if (!permissions?.has(numerario ? 'caixa:operar' : 'financas:banca:escrita')) {
    throw new BusinessRuleError(
      'MEIO_PAGAMENTO_SEM_PERMISSAO',
      numerario
        ? `Não tem permissão para operar o caixa: ${operacao} em numerário não é possível.`
        : `Não tem permissão para movimentar contas bancárias: ${operacao} por esta forma não é possível.`,
    );
  }
}

/**
 * Recebimento de uma factura (P2, fatura-pdf-pagamento). O lançamento é o registo do
 * pagamento: D conta do meio / C 411 pelo valor, no diário do meio; em numerário também
 * entra na sessão de caixa aberta do utilizador. Qualquer recusa desfaz tudo.
 */
export async function registarPagamento(
  input: RegistarPagamentoFaturaInput,
  ctx: Ctx & { permissions?: ReadonlySet<string> },
): Promise<FaturaCompleta> {
  exigirPermissaoDoMeio(input.formaPagamento, ctx.permissions, 'o recebimento');

  return prisma.$transaction(async (rawTx) => {
    const tx = rawTx as unknown as Prisma.TransactionClient;
    // Tranca antes de ler: uma compensação de NC concorrente não se perde (#148).
    await trancarLinha(tx, 'Fatura', input.faturaId, ctx.tenantId);
    const fatura = await tx.fatura.findFirst({
      where: { id: input.faturaId, tenantId: ctx.tenantId },
    });
    if (!fatura) throw new NotFoundError('Factura não encontrada');
    if (!ESTADOS_FATURA_PAGAVEL.includes(fatura.status as StatusFatura)) {
      throw new BusinessRuleError('FATURA_NAO_PAGAVEL', `Factura no estado ${fatura.status} não pode ser paga`);
    }

    const valorPagamento = new Prisma.Decimal(input.valor.toFixed(2));
    const total = new Prisma.Decimal(String(fatura.total));
    const totalPago = new Prisma.Decimal(String(fatura.totalPago));
    const pendenteAntes = total.minus(totalPago);
    if (valorPagamento.greaterThan(pendenteAntes)) {
      throw new BusinessRuleError(
        'PAGAMENTO_EXCEDE_SALDO',
        `O valor (${valorPagamento.toFixed(2)}) excede o saldo em aberto da factura ${fatura.numero} (${pendenteAntes.toFixed(2)}).`,
      );
    }
    // Dias civis de Maputo, não instantes: receber no próprio dia da emissão é válido.
    if (diaMaputo(input.dataPagamento) < diaMaputo(fatura.dataEmissao)) {
      throw new BusinessRuleError(
        'PAGAMENTO_DATA_ANTERIOR_EMISSAO',
        `A data do pagamento não pode ser anterior à data de emissão da factura ${fatura.numero}.`,
      );
    }

    const novoTotalPago = totalPago.plus(valorPagamento);
    const novoStatus: StatusFatura = total.minus(novoTotalPago).lessThanOrEqualTo(0) ? 'PAGA' : 'PARCIALMENTE_PAGA';
    // Um segundo pagamento parcial mantém PARCIALMENTE_PAGA — não é transição.
    if (novoStatus !== fatura.status) transitarFatura(fatura.status as StatusFatura, novoStatus);

    const meio = await resolverContaMeioPagamento(
      tx,
      { forma: input.formaPagamento, contaBancariaId: input.contaBancariaId },
      ctx,
    );
    const valor = valorPagamento.toFixed(2);
    const descricao = `Recebimento da factura ${fatura.numero}`;

    await registarLancamentoContabilistico(
      tx,
      {
        data: input.dataPagamento,
        diarioTipo: meio.diarioTipo,
        origem: 'PAGAMENTO',
        documentoOrigemId: fatura.id,
        documentoOrigemTipo: 'Fatura',
        historico: descricao,
        partidas: [
          { contaCodigo: meio.contaCodigo, tipo: 'DEBITO', valor },
          { contaCodigo: PGC_FATURACAO.CLIENTES_CC, tipo: 'CREDITO', valor },
        ],
      },
      ctx,
    );

    if (meio.sessaoCaixaId) {
      await registarMovimentoCaixa(
        tx,
        {
          sessaoCaixaId: meio.sessaoCaixaId,
          tipo: 'RECEBIMENTO',
          valor,
          descricao,
          documentoOrigemId: fatura.id,
          documentoOrigemTipo: 'Fatura',
        },
        ctx,
      );
    }

    await tx.fatura.update({
      where: { id: fatura.id },
      data: {
        totalPago: novoTotalPago,
        status: novoStatus,
        dataPagamento: novoStatus === 'PAGA' ? input.dataPagamento : null,
      },
    });

    // #134 — cada recebimento é uma entrada nova; a da factura não se altera.
    await registarHistoricoTransacaoEmTx(
      tx,
      {
        clienteId: fatura.clienteId,
        tipo: 'PAGAMENTO',
        referencia: fatura.numero,
        descricao,
        valor: valorPagamento,
        moeda: fatura.moeda,
        dataTransacao: input.dataPagamento,
        status: 'CONCLUIDO',
      },
      ctx,
    );

    return tx.fatura.findFirst({
      where: { id: fatura.id },
      include: {
        linhas: { orderBy: { ordemLinha: 'asc' } },
        serieDocumento: { select: { id: true, tipo: true, prefixo: true, ano: true } },
      },
    }) as unknown as FaturaCompleta;
  });
}

/** Predicado partilhado com as contas a pagar (#79) — vive em `@/lib/periodo-fiscal`. */
export { vencimentoJaPassou };

export async function marcarVencida(faturaId: string, ctx: Ctx): Promise<Fatura> {
  // A recusa por estado sai DEPOIS da transacção (só leu, nada a desfazer): quem a
  // decidiu foi a leitura trancada, que pode já ver o commit de um pagamento concorrente.
  const r = await prisma.$transaction(async (rawTx) => {
    const tx = rawTx as unknown as Prisma.TransactionClient;
    await trancarLinha(tx, 'Fatura', faturaId, ctx.tenantId);
    const fatura = await tx.fatura.findFirst({ where: { id: faturaId, tenantId: ctx.tenantId } });
    if (!fatura) throw new NotFoundError('Factura não encontrada');
    if (!TRANSICOES_FATURA[fatura.status as StatusFatura].includes('VENCIDA')) {
      return { recusa: new BusinessRuleError('TRANSICAO_INVALIDA', `Fatura: transição inválida ${fatura.status} → VENCIDA`) };
    }
    if (!vencimentoJaPassou(fatura.dataVencimento)) {
      return {
        recusa: new BusinessRuleError(
          'FATURA_NAO_VENCIDA',
          `A factura vence a ${formatarData(fatura.dataVencimento)}: só pode ser marcada como vencida a partir do dia seguinte.`,
        ),
      };
    }
    return { fatura: (await tx.fatura.update({ where: { id: faturaId }, data: { status: 'VENCIDA' } })) as unknown as Fatura };
  });
  if ('recusa' in r) throw r.recusa;
  return r.fatura;
}

// ---------------------------------------------------------------------------
// Notas de crédito
// ---------------------------------------------------------------------------

/**
 * Crédito já concedido sobre a factura de alias `f`: Σ total das NC sobre ela que não estão
 * `CANCELADA` (EMITIDA e LIQUIDADA contam). Fonte única da guarda `NC_EXCEDE_FATURA` e do
 * saldo creditável da procura (#86, #266) — as duas contas não podem divergir.
 */
const SQL_CREDITADO_FATURA = Prisma.sql`(SELECT COALESCE(SUM(nc.total), 0)
     FROM "NotaCredito" nc
    WHERE nc."faturaOriginalId" = f.id AND nc."tenantId" = f."tenantId" AND nc.status <> 'CANCELADA')`;

/**
 * Pesquisa da combobox «Factura a creditar» (#258): as 20 creditáveis mais
 * recentes, filtradas por parte do número sem distinguir maiúsculas. Só as que
 * ainda têm saldo creditável (total − crédito já concedido > 0, #86/#266) — as
 * creditadas por inteiro não voltam nem gastam lugares no top-20.
 */
export async function procurarFaturasCreditaveis(
  q: string | undefined,
  ctx: Ctx,
  /** Só as deste cliente — a factura de referência de uma ND (#85). */
  clienteId?: string,
): Promise<
  Array<{ id: string; numero: string; dataEmissao: Date; total: Prisma.Decimal; saldoCreditavel: Prisma.Decimal }>
> {
  const termo = q?.trim();
  // Mesmo `contains` insensível do Prisma: os curingas do LIKE no termo são literais.
  const padrao = termo ? `%${termo.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  return prisma.$queryRaw<
    Array<{ id: string; numero: string; dataEmissao: Date; total: Prisma.Decimal; saldoCreditavel: Prisma.Decimal }>
  >(
    Prisma.sql`SELECT f.id, f.numero, f."dataEmissao", f.total,
                      f.total - ${SQL_CREDITADO_FATURA} AS "saldoCreditavel"
                 FROM "Fatura" f
                WHERE f."tenantId" = ${ctx.tenantId}
                  AND f.status::text IN (${Prisma.join([...ESTADOS_FATURA_CREDITAVEL])})
                  ${clienteId ? Prisma.sql`AND f."clienteId" = ${clienteId}` : Prisma.empty}
                  ${padrao ? Prisma.sql`AND f.numero ILIKE ${padrao}` : Prisma.empty}
                  AND f.total - ${SQL_CREDITADO_FATURA} > 0
                ORDER BY f."dataEmissao" DESC
                LIMIT 20`,
  );
}

export async function emitirNotaCredito(input: EmitirNotaCreditoInput, ctx: Ctx): Promise<NotaCreditoCompleta> {
  await exigirEmailConfirmadoParaEmitir();
  return prismaBase.$transaction((tx) => emitirNotaCreditoEmTx(tx, input, ctx));
}

/** Núcleo da emissão de nota de crédito — idem a `emitirDocumentoEmTx`: sem sessão, na tx do chamador. */
export async function emitirNotaCreditoEmTx(
  tx: Prisma.TransactionClient,
  input: EmitirNotaCreditoInput,
  ctx: Ctx,
): Promise<NotaCreditoCompleta> {
  exigirMotivoIsencao(input.linhas);
  // Tranca a factura ANTES de a ler: o estado e o crédito já concedido que decidem vêm da
  // leitura trancada, e outra NC sobre a mesma factura espera pelo commit desta.
  await trancarLinha(tx, 'Fatura', input.faturaOriginalId, ctx.tenantId);
  const faturaOriginal = await tx.fatura.findFirst({
    where: { id: input.faturaOriginalId, tenantId: ctx.tenantId },
  });
  if (!faturaOriginal) throw new NotFoundError('Factura original não encontrada');
  if (faturaOriginal.status === 'CANCELADA') {
    throw new BusinessRuleError('FATURA_CANCELADA', 'Não é possível emitir NC para factura cancelada');
  }

  let subtotal = new Prisma.Decimal(0);
  let ivaTotal = new Prisma.Decimal(0);
  for (const l of input.linhas) {
    subtotal = subtotal.plus(new Prisma.Decimal(l.subtotal.toFixed(2)));
    ivaTotal = ivaTotal.plus(new Prisma.Decimal(l.ivaItem.toFixed(2)));
  }

  // Nunca se credita mais do que a factura: Σ NC não canceladas + esta ≤ total. Com a factura
  // trancada acima, duas NC concorrentes não passam ambas esta verificação (ADR-0041 §8).
  const [credito] = await tx.$queryRaw<Array<{ excede: boolean; total: Prisma.Decimal; creditado: Prisma.Decimal }>>(
    Prisma.sql`SELECT f.total,
                      ${SQL_CREDITADO_FATURA} AS creditado,
                      ${SQL_CREDITADO_FATURA} + ${subtotal.plus(ivaTotal).toFixed(2)}::numeric > f.total AS excede
                 FROM "Fatura" f
                WHERE f.id = ${input.faturaOriginalId} AND f."tenantId" = ${ctx.tenantId}`,
  );
  if (credito?.excede === true) {
    throw new BusinessRuleError(
      'NC_EXCEDE_FATURA',
      `A factura ${faturaOriginal.numero} (${new Prisma.Decimal(String(credito.total)).toFixed(2)}) já tem ` +
        `${new Prisma.Decimal(String(credito.creditado)).toFixed(2)} creditados: uma nota de crédito de ` +
        `${subtotal.plus(ivaTotal).toFixed(2)} excede o total.`,
    );
  }

  const { numero, serieDocumentoId } = await numerarDocumento(tx, 'NOTA_CREDITO', ctx, input.dataEmissao);

  const nc = await tx.notaCredito.create({
    data: {
      tenantId: ctx.tenantId,
      serieDocumentoId,
      numero,
      faturaOriginalId: input.faturaOriginalId,
      motivo: input.motivo,
      moeda: input.moeda ?? 'MZN',
      subtotal,
      descontoTotal: new Prisma.Decimal(0),
      ivaTotal,
      total: subtotal.plus(ivaTotal),
      status: 'EMITIDA',
      dataEmissao: input.dataEmissao,
      observacoes: input.observacoes ?? null,
      emitidoPorId: ctx.userId,
    },
  });

  await Promise.all(
    input.linhas.map((l, i) =>
      tx.linhaNotaCredito.create({
        data: {
          tenantId: ctx.tenantId,
          notaCreditoId: nc.id,
          produtoId: l.produtoId ?? null,
          descricao: l.descricao,
          quantidade: new Prisma.Decimal(l.quantidade.toFixed(4)),
          precoUnitario: new Prisma.Decimal(l.precoUnitario.toFixed(2)),
          desconto: new Prisma.Decimal(l.desconto.toFixed(2)),
          taxaIva: new Prisma.Decimal(l.taxaIva.toFixed(4)),
          subtotal: new Prisma.Decimal(l.subtotal.toFixed(2)),
          ivaItem: new Prisma.Decimal(l.ivaItem.toFixed(2)),
          total: new Prisma.Decimal(l.total.toFixed(2)),
          motivoIsencao: motivoIsencaoDaLinha(l),
          ordemLinha: l.ordemLinha ?? i,
        },
      }),
    ),
  );

  // Wave 3: lançamento de estorno contabilístico na MESMA transacção.
  // Guarda lancamentoId — idem à factura: sem ligação o apuramento fica bloqueado.
  const lancamentoNC = await registarLancamentoContabilistico(
    tx,
    construirLancamentoNotaCredito({
      id: nc.id,
      numero,
      total: subtotal.plus(ivaTotal),
      subtotal,
      ivaTotal,
      dataEmissao: input.dataEmissao,
    }),
    ctx,
  );
  await tx.notaCredito.update({
    where: { id: nc.id },
    data: { lancamentoId: lancamentoNC.id },
  });

  return tx.notaCredito.findFirst({
    where: { id: nc.id },
    include: {
      linhas: { orderBy: { ordemLinha: 'asc' } },
      faturaOriginal: { select: { id: true, numero: true, total: true } },
    },
  }) as unknown as NotaCreditoCompleta;
}

export async function obterNotaCredito(id: string, ctx: Ctx): Promise<NotaCreditoCompleta | null> {
  return prisma.notaCredito.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      linhas: { orderBy: { ordemLinha: 'asc' } },
      faturaOriginal: { select: { id: true, numero: true, total: true } },
    },
  }) as unknown as NotaCreditoCompleta | null;
}

export async function listarNotasCredito(filtro: FiltroNotaCreditoInput, ctx: Ctx): Promise<PaginacaoFaturacao<NotaCreditoCompleta>> {
  return paginate(
    (a) =>
      prisma.notaCredito.findMany({
        ...a,
        where: {
          tenantId: ctx.tenantId,
          ...(filtro.faturaOriginalId ? { faturaOriginalId: filtro.faturaOriginalId } : {}),
          ...(filtro.status ? { status: filtro.status } : {}),
          ...(filtro.dataInicio || filtro.dataFim
            ? { dataEmissao: { ...(filtro.dataInicio ? { gte: filtro.dataInicio } : {}), ...(filtro.dataFim ? { lte: filtro.dataFim } : {}) } }
            : {}),
        },
        include: {
          linhas: { orderBy: { ordemLinha: 'asc' } },
          // `clienteId`: a nota de crédito não tem cliente próprio — herda o da
          // factura que corrige, e a listagem precisa dele para mostrar o nome.
          faturaOriginal: { select: { id: true, numero: true, total: true, clienteId: true } },
        },
        orderBy: { dataEmissao: 'desc' },
      }),
    { cursor: filtro.cursor, take: filtro.take },
  ) as unknown as Promise<PaginacaoFaturacao<NotaCreditoCompleta>>;
}

/** Dia civil de Maputo como número comparável (aaaammdd). */
function diaMaputo(data: Date): number {
  const { ano, mes, dia } = diaCivilEmMaputo(data);
  return ano * 10_000 + mes * 100 + dia;
}


/**
 * Compensação de `valor` da NC contra o saldo em aberto da factura original: abate ao
 * `totalPago`, sem lançamento — a 411 já foi creditada na emissão da NC.
 * Recusa: FATURA_NAO_COMPENSAVEL, NC_COMPENSACAO_EXCEDE_SALDO.
 */
async function compensarNaFaturaOriginalEmTx(
  tx: Prisma.TransactionClient,
  nc: { faturaOriginalId: string },
  valor: Prisma.Decimal,
  data: Date,
  ctx: Ctx,
): Promise<void> {
  await trancarLinha(tx, 'Fatura', nc.faturaOriginalId, ctx.tenantId);
  const fatura = await tx.fatura.findFirst({ where: { id: nc.faturaOriginalId, tenantId: ctx.tenantId } });
  if (!fatura) throw new NotFoundError('Factura original não encontrada');
  if (!ESTADOS_FATURA_COMPENSAVEL.includes(fatura.status as StatusFatura)) {
    throw new BusinessRuleError(
      'FATURA_NAO_COMPENSAVEL',
      `A factura ${fatura.numero} está no estado ${fatura.status} e não admite compensação.`,
    );
  }

  const totalPago = new Prisma.Decimal(String(fatura.totalPago));
  const saldo = new Prisma.Decimal(String(fatura.total)).minus(totalPago);
  if (saldo.lessThan(valor)) {
    throw new BusinessRuleError(
      'NC_COMPENSACAO_EXCEDE_SALDO',
      `O saldo em aberto da factura ${fatura.numero} (${saldo.toFixed(2)}) é inferior ao valor a compensar da nota de crédito (${valor.toFixed(2)}).`,
    );
  }

  // Mesma regra de estado do registarPagamento.
  const novoStatus: StatusFatura = saldo.minus(valor).lessThanOrEqualTo(0) ? 'PAGA' : 'PARCIALMENTE_PAGA';
  if (novoStatus !== fatura.status) transitarFatura(fatura.status as StatusFatura, novoStatus);

  await tx.fatura.update({
    where: { id: fatura.id },
    data: {
      totalPago: totalPago.plus(valor),
      status: novoStatus,
      dataPagamento: novoStatus === 'PAGA' ? data : null,
    },
  });
}

/**
 * #325 — Plano de liquidação TOTAL de uma NC (EMITIDA → LIQUIDADA). As três entradas públicas
 * (`liquidarNotaCredito`, `devolverNotaCreditoPelosMeiosOriginaisEmTx`, `liquidarNotaCreditoEmTx`)
 * só montam o plano; quem o executa — e o único que grava a NC como liquidada — é
 * `liquidarNotaCreditoNucleoEmTx`.
 *
 * O enum gravado `FormaLiquidacaoNC.COMPENSACAO` cobre DUAS coisas distintas, que aqui têm nome:
 *   - `ABATE_FATURA_ORIGINAL`: o valor abate-se ao saldo em aberto da factura que a NC credita
 *     (`compensarNaFaturaOriginalEmTx`, sem lançamento — a NC já creditou a 411);
 *   - `ABATE_DOCUMENTO_TROCA`: o valor abate-se ao documento novo da troca (a nova Factura-Recibo
 *     debita a 411 no seu próprio lançamento) → aqui não se escreve nada.
 * Havendo abate (de qualquer tipo), grava-se COMPENSACAO; senão DEVOLUCAO.
 */
type AbateNC = { destino: 'ABATE_FATURA_ORIGINAL' | 'ABATE_DOCUMENTO_TROCA'; valor: Prisma.Decimal };

/** Saída de dinheiro: D 411 por `valor` / C em cada conta de `creditos` (caixa/banca). */
type ReembolsoNC = {
  valor: Prisma.Decimal;
  creditos: Array<{ contaCodigo: string; valor: Prisma.Decimal }>;
  diarioTipo: 'CAIXA' | 'BANCO';
  historico: string;
  /** Só a liquidação manual escreve o movimento de caixa; nos núcleos POS é do chamador. */
  sessaoCaixaId?: string;
};

type PlanoLiquidacaoNC = { data: Date; abate?: AbateNC; reembolso?: ReembolsoNC };

type NotaCreditoTrancada = NonNullable<Awaited<ReturnType<Prisma.TransactionClient['notaCredito']['findFirst']>>>;

/**
 * Núcleo único da liquidação de NC (#325): tranca a NC, valida a transição para LIQUIDADA, pede o
 * plano à variante (`planear`, que valida e lê o que precisar dentro da tx) e executa-o — abate,
 * lançamento de reembolso, movimento de caixa e, por fim, a gravação da NC.
 */
async function liquidarNotaCreditoNucleoEmTx(
  tx: Prisma.TransactionClient,
  notaCreditoId: string,
  ctx: Ctx,
  planear: (nc: NotaCreditoTrancada) => Promise<PlanoLiquidacaoNC>,
): Promise<NotaCredito> {
  await trancarLinha(tx, 'NotaCredito', notaCreditoId, ctx.tenantId);
  const nc = await tx.notaCredito.findFirst({ where: { id: notaCreditoId, tenantId: ctx.tenantId } });
  if (!nc) throw new NotFoundError('Nota de crédito não encontrada');
  transitarNC(nc.status as StatusNotaCredito, 'LIQUIDADA');

  const plano = await planear(nc);

  if (plano.abate?.destino === 'ABATE_FATURA_ORIGINAL') {
    await compensarNaFaturaOriginalEmTx(tx, nc, plano.abate.valor, plano.data, ctx);
  }

  let lancamentoLiquidacaoId: string | null = null;
  const reembolso = plano.reembolso;
  if (reembolso) {
    const lancamento = await registarLancamentoContabilistico(
      tx,
      {
        data: plano.data,
        diarioTipo: reembolso.diarioTipo,
        origem: 'PAGAMENTO',
        documentoOrigemId: nc.id,
        documentoOrigemTipo: 'NotaCredito',
        historico: reembolso.historico,
        partidas: [
          { contaCodigo: PGC_FATURACAO.CLIENTES_CC, tipo: 'DEBITO', valor: reembolso.valor.toFixed(2) },
          ...reembolso.creditos.map((c) => ({ contaCodigo: c.contaCodigo, tipo: 'CREDITO' as const, valor: c.valor.toFixed(2) })),
        ],
      },
      ctx,
    );
    lancamentoLiquidacaoId = lancamento.id;

    if (reembolso.sessaoCaixaId) {
      await registarMovimentoCaixa(
        tx,
        {
          sessaoCaixaId: reembolso.sessaoCaixaId,
          tipo: 'DEVOLUCAO',
          valor: reembolso.valor.toFixed(2),
          descricao: reembolso.historico,
          documentoOrigemId: nc.id,
          documentoOrigemTipo: 'NotaCredito',
        },
        ctx,
      );
    }
  }

  return tx.notaCredito.update({
    where: { id: nc.id },
    data: {
      status: 'LIQUIDADA',
      formaLiquidacao: plano.abate ? 'COMPENSACAO' : 'DEVOLUCAO',
      dataLiquidacao: plano.data,
      lancamentoLiquidacaoId,
    },
  }) as unknown as NotaCredito;
}

/**
 * #325 — meios por que um documento foi recebido, lidos das partidas do seu lançamento (função
 * pura). Soma por conta os DÉBITOS (os CRÉDITOS ignoram-se): o débito na 411 (parte a crédito)
 * não se devolve — é o `compensado`; as outras contas são os `creditos` do lançamento de
 * devolução, pela ordem em que aparecem.
 */
export function meiosOriginaisDe(
  partidas: ReadonlyArray<{
    tipo: string;
    valor: Prisma.Decimal | string | number;
    conta?: { codigo: string };
    contaCodigo?: string;
  }>,
): { creditos: Array<{ contaCodigo: string; valor: Prisma.Decimal }>; compensado: Prisma.Decimal } {
  const porConta = new Map<string, Prisma.Decimal>();
  for (const p of partidas) {
    if (p.tipo !== 'DEBITO') continue;
    const codigo = p.contaCodigo ?? p.conta?.codigo;
    if (!codigo) continue;
    porConta.set(codigo, (porConta.get(codigo) ?? new Prisma.Decimal(0)).plus(new Prisma.Decimal(String(p.valor))));
  }
  const compensado = porConta.get(PGC_FATURACAO.CLIENTES_CC) ?? new Prisma.Decimal(0);
  const creditos = [...porConta]
    .filter(([contaCodigo]) => contaCodigo !== PGC_FATURACAO.CLIENTES_CC)
    .map(([contaCodigo, valor]) => ({ contaCodigo, valor }));
  return { creditos, compensado };
}

/**
 * #148 — liquidação TOTAL da NC (EMITIDA → LIQUIDADA).
 * DEVOLUCAO: 411 D / conta do meio C pelo total (e saída de caixa em numerário);
 * COMPENSACAO: abate ao `totalPago` da factura original, sem lançamento — a 411 já
 * foi creditada na emissão da NC.
 */
export async function liquidarNotaCredito(
  input: LiquidarNotaCreditoInput,
  ctx: Ctx & { permissions?: ReadonlySet<string> },
): Promise<NotaCredito> {
  // A devolução mexe em caixa/banca: a permissão confere-se antes de tudo o resto.
  if (input.forma === 'DEVOLUCAO') exigirPermissaoDoMeio(input.formaPagamento, ctx.permissions, 'a devolução');

  return prisma.$transaction(async (rawTx) => {
    const tx = rawTx as unknown as Prisma.TransactionClient;

    return liquidarNotaCreditoNucleoEmTx(tx, input.id, ctx, async (nc) => {
      // Dias civis de Maputo, não instantes: liquidar no próprio dia da emissão é válido.
      if (diaMaputo(input.data) < diaMaputo(nc.dataEmissao)) {
        throw new BusinessRuleError(
          'NC_DATA_ANTERIOR_EMISSAO',
          `A data da liquidação não pode ser anterior à data de emissão da nota de crédito ${nc.numero}.`,
        );
      }
      const total = new Prisma.Decimal(String(nc.total));

      if (input.forma === 'COMPENSACAO') {
        return { data: input.data, abate: { destino: 'ABATE_FATURA_ORIGINAL', valor: total } };
      }
      const meio = await resolverContaMeioPagamento(
        tx,
        { forma: input.formaPagamento, contaBancariaId: input.contaBancariaId },
        ctx,
      );
      return {
        data: input.data,
        reembolso: {
          valor: total,
          creditos: [{ contaCodigo: meio.contaCodigo, valor: total }],
          diarioTipo: meio.diarioTipo,
          historico: `Devolução da nota de crédito ${nc.numero}`,
          sessaoCaixaId: meio.sessaoCaixaId,
        },
      };
    });
  });
}

/**
 * Liquidação por devolução de uma NC que credita o documento original INTEIRO, pelos mesmos
 * meios com que ele foi recebido (ADR-0041 §8 — anulação da venda POS). Núcleo em transacção:
 * corre na tx do chamador, não consulta a sessão nem `ctx.permissions` (a permissão é da action).
 *
 * Um só lançamento: D 411 pelo total / C em cada conta que o lançamento do documento original
 * debitou, pelo mesmo valor — a devolução sai por onde a receita entrou. O movimento de caixa da
 * parte em numerário NÃO é daqui: é do chamador, pelo contrato `registarMovimentoCaixa`, na
 * sessão de caixa que o chamador escolhe (na anulação, a aberta de quem anula — #327).
 *
 * Venda mista (numerário + cartão/transferência): continua a ser UM só lançamento de liquidação,
 * no diário CAIXA, que credita também a(s) conta(s) bancária(s) — não há um lançamento por meio
 * nem um no diário de bancos.
 *
 * Documento com parte a crédito (#322 — venda POS a crédito ou mista): o que a factura debitou
 * na 411 não se «devolve» — compensa-se contra o saldo em aberto da factura (sem lançamento);
 * só o resto (D 411 / C contas dos meios) vai ao lançamento de liquidação, que não existe se a
 * venda foi toda a crédito. `formaLiquidacao` é COMPENSACAO quando há parte compensada.
 *
 * Recusa: NC não EMITIDA (transição), documento original sem lançamento, NC parcial
 * (`NC_DEVOLUCAO_PARCIAL`), factura já (parcialmente) recebida em Facturação
 * (`NC_COMPENSACAO_EXCEDE_SALDO`) ou não compensável (`FATURA_NAO_COMPENSAVEL`).
 */
export async function devolverNotaCreditoPelosMeiosOriginaisEmTx(
  tx: Prisma.TransactionClient,
  input: { notaCreditoId: string; data: Date },
  ctx: Ctx,
): Promise<NotaCredito> {
  return liquidarNotaCreditoNucleoEmTx(tx, input.notaCreditoId, ctx, async (nc) => {
    const fatura = await tx.fatura.findFirst({
      where: { id: nc.faturaOriginalId, tenantId: ctx.tenantId },
      select: { numero: true, total: true, lancamentoId: true },
    });
    if (!fatura) throw new NotFoundError('Factura original não encontrada');
    if (!fatura.lancamentoId) {
      throw new BusinessRuleError(
        'DOCUMENTO_SEM_LANCAMENTO',
        `A factura ${fatura.numero} não tem lançamento: não se sabe por que meios foi recebida.`,
      );
    }
    const total = new Prisma.Decimal(String(nc.total));
    if (!total.equals(new Prisma.Decimal(String(fatura.total)))) {
      throw new BusinessRuleError(
        'NC_DEVOLUCAO_PARCIAL',
        `A nota de crédito ${nc.numero} não credita a factura ${fatura.numero} inteira: a devolução pelos meios originais só cobre o documento todo.`,
      );
    }

    const partidas = await tx.partidaLancamento.findMany({
      where: { lancamentoId: fatura.lancamentoId, tenantId: ctx.tenantId, tipo: 'DEBITO' },
      select: { tipo: true, valor: true, conta: { select: { codigo: true } } },
      orderBy: { id: 'asc' },
    });
    // Parte a crédito (#322): a 411 que a factura debitou não se devolve — compensa-se contra o
    // saldo em aberto da própria factura, sem lançamento (a NC já creditou a 411). Se a factura já
    // recebeu pagamentos em Facturação, o saldo não chega e recusa (NC_COMPENSACAO_EXCEDE_SALDO).
    const { creditos, compensado } = meiosOriginaisDe(partidas);

    // Parte paga: devolve-se por onde entrou.
    const devolvido = total.minus(compensado);
    return {
      data: input.data,
      abate: compensado.greaterThan(0) ? { destino: 'ABATE_FATURA_ORIGINAL', valor: compensado } : undefined,
      reembolso: devolvido.greaterThan(0)
        ? {
            valor: devolvido,
            creditos,
            // Há sempre caixa ou banco do outro lado; com numerário, o diário é o de caixa.
            diarioTipo: creditos.some((c) => c.contaCodigo === CONTA_MEIO_PAGAMENTO_POS.DINHEIRO) ? 'CAIXA' : 'BANCO',
            historico: `Devolução da nota de crédito ${nc.numero} (anulação de ${fatura.numero})`,
          }
        : undefined,
    };
  });
}

/**
 * Liquidação TOTAL da NC emitida por uma devolução ou troca de balcão (ADR-0041 §8), na
 * transacção do chamador — sem sessão e sem `ctx.permissions` (são da action). O valor da NC
 * reparte-se em duas partes que têm de somar o total:
 *
 *   - `numerario`: dinheiro devolvido da gaveta → lançamento D 411 / C 111 (diário CAIXA). O
 *     `MovimentoCaixa` é do chamador, na sessão de caixa que só ele conhece;
 *   - `compensado`: crédito abatido ao documento da troca (a nova Factura-Recibo debita a 411
 *     por esse valor no seu próprio lançamento) → sem lançamento aqui.
 *
 * `formaLiquidacao` é COMPENSACAO quando há parte compensada, senão DEVOLUCAO; o lançamento da
 * parte em numerário, havendo, fica em `lancamentoLiquidacaoId`.
 * Recusa: NC_LIQUIDACAO_INCOMPLETA (partes negativas ou que não somam o total), transição inválida.
 */
export async function liquidarNotaCreditoEmTx(
  tx: Prisma.TransactionClient,
  input: { notaCreditoId: string; data: Date; numerario: Prisma.Decimal; compensado: Prisma.Decimal },
  ctx: Ctx,
): Promise<NotaCredito> {
  return liquidarNotaCreditoNucleoEmTx(tx, input.notaCreditoId, ctx, async (nc) => {
    const total = new Prisma.Decimal(String(nc.total));
    const { numerario, compensado } = input;
    if (numerario.isNegative() || compensado.isNegative() || !numerario.plus(compensado).equals(total)) {
      throw new BusinessRuleError(
        'NC_LIQUIDACAO_INCOMPLETA',
        `A liquidação da nota de crédito ${nc.numero} (${numerario.toFixed(2)} em numerário + ` +
          `${compensado.toFixed(2)} compensados) não cobre o total ${total.toFixed(2)}.`,
      );
    }
    return {
      data: input.data,
      abate: compensado.greaterThan(0) ? { destino: 'ABATE_DOCUMENTO_TROCA', valor: compensado } : undefined,
      reembolso: numerario.greaterThan(0)
        ? {
            valor: numerario,
            creditos: [{ contaCodigo: CONTA_MEIO_PAGAMENTO_POS.DINHEIRO, valor: numerario }],
            diarioTipo: 'CAIXA',
            historico: `Devolução em numerário da nota de crédito ${nc.numero}`,
          }
        : undefined,
    };
  });
}

/**
 * O IVA é apurado pelos documentos: cancelar uma NC cujo período de emissão (dia de
 * Maputo) já tem apuramento activo, ou está fechado, mudaria para trás a base de um
 * mês encerrado. O período fica trancado `FOR SHARE` até ao commit.
 */
async function exigirPeriodoDaNCSemIvaApurado(
  tx: Prisma.TransactionClient,
  dataEmissao: Date,
  numero: string,
  tenantId: string,
): Promise<void> {
  const codigo = periodoFiscalDe(dataEmissao);
  const [periodo] = await tx.$queryRaw<Array<{ id: string; estado: string }>>`
    SELECT id, estado FROM "PeriodoContabil"
    WHERE "tenantId" = ${tenantId} AND codigo = ${codigo}
    FOR SHARE
  `;
  if (!periodo) return;

  const apurado =
    periodo.estado !== 'ABERTO' ||
    (await tx.apuramentoIva.findFirst({
      where: { tenantId, periodoId: periodo.id, estado: { in: ['APURADO', 'DECLARADO'] } },
      select: { id: true },
    })) !== null;
  if (apurado) {
    throw new BusinessRuleError(
      'NC_PERIODO_IVA_APURADO',
      `A nota de crédito ${numero} pertence ao período ${codigo}, que já tem o IVA apurado ou está fechado. ` +
        'Não pode ser cancelada: corrija-a emitindo uma nota de débito.',
    );
  }
}

/**
 * #148 — cancela a NC (só EMITIDA) e estorna o lançamento dela na MESMA transacção,
 * com a data do cancelamento. Período fechado ⇒ PERIODO_FECHADO e nada escrito.
 */
export async function cancelarNotaCredito(id: string, motivo: string, ctx: Ctx): Promise<NotaCredito> {
  return prisma.$transaction(async (rawTx) => {
    const tx = rawTx as unknown as Prisma.TransactionClient;

    await trancarLinha(tx, 'NotaCredito', id, ctx.tenantId);
    const nc = await tx.notaCredito.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!nc) throw new NotFoundError('Nota de crédito não encontrada');
    transitarNC(nc.status as StatusNotaCredito, 'CANCELADA');

    let lancamentoEstornoId: string | null = null;
    // Sem lançamento, o período da NC nunca pôde ser apurado nem fechado
    // (DOCUMENTO_SEM_LANCAMENTO): só há verificação e estorno quando ele existe.
    if (nc.lancamentoId) {
      await exigirPeriodoDaNCSemIvaApurado(tx, nc.dataEmissao, nc.numero, ctx.tenantId);

      const lancamento = await tx.lancamento.findFirst({
        where: { id: nc.lancamentoId, tenantId: ctx.tenantId },
        select: { id: true, status: true },
      });
      if (lancamento?.status === 'ESTORNADO') {
        // Já estornado à mão na contabilidade: adopta-se esse estorno em vez de estornar outra vez.
        const existente = await tx.lancamento.findFirst({
          where: { tenantId: ctx.tenantId, lancamentoEstornoId: nc.lancamentoId },
          select: { id: true },
        });
        lancamentoEstornoId = existente?.id ?? null;
      } else {
        const estorno = await estornarLancamentoEmTx(
          tx,
          { lancamentoId: nc.lancamentoId, motivo: `Cancelamento da nota de crédito ${nc.numero}: ${motivo}`, data: new Date() },
          ctx,
        );
        lancamentoEstornoId = estorno.id;
      }
    }

    return tx.notaCredito.update({
      where: { id: nc.id },
      // NC legada sem lançamento: nada a estornar, a coluna fica como está (null).
      data: { status: 'CANCELADA', motivoCancelamento: motivo, ...(lancamentoEstornoId ? { lancamentoEstornoId } : {}) },
    }) as unknown as NotaCredito;
  });
}

// ---------------------------------------------------------------------------
// Notas de débito
// ---------------------------------------------------------------------------

/**
 * Conta a crédito da ND: a escolhida no acto, senão a omissão do tenant para a
 * natureza; validada pela mesma regra da configuração. Nenhuma → recusa.
 */
async function resolverContaCreditoNotaDebito(
  tx: Prisma.TransactionClient,
  input: Pick<EmitirNotaDebitoInput, 'natureza' | 'contaCreditoId'>,
  ctx: Ctx,
): Promise<{ id: string; codigo: string }> {
  const contaId = input.contaCreditoId ?? (await resolverContaNaturezaNotaDebito(tx, input.natureza, ctx))?.id;
  if (!contaId) {
    throw new BusinessRuleError(
      'CONTA_CREDITO_OBRIGATORIA',
      'Esta natureza não tem conta a crédito por omissão: escolha a conta na nota de débito.',
    );
  }
  // A omissão também passa pela regra: uma conta configurada e depois desactivada não serve.
  return validarContaParaNatureza(tx, contaId, input.natureza, ctx);
}

/** Factura de referência: do tenant, do mesmo cliente, e já emitida (não rascunho nem cancelada). */
async function validarFaturaReferenciaNotaDebito(
  tx: Prisma.TransactionClient,
  faturaId: string,
  clienteId: string,
  ctx: Ctx,
): Promise<void> {
  const fatura = await tx.fatura.findFirst({
    where: { id: faturaId, tenantId: ctx.tenantId },
    select: { numero: true, clienteId: true, status: true },
  });
  if (!fatura) throw new NotFoundError('Factura de referência não encontrada');
  if (fatura.clienteId !== clienteId) {
    throw new BusinessRuleError('FATURA_DE_OUTRO_CLIENTE', `A factura ${fatura.numero} é de outro cliente.`);
  }
  // Referenciável = o mesmo conjunto que a NC credita: emitida, nunca rascunho nem cancelada.
  if (!ESTADOS_FATURA_CREDITAVEL.includes(fatura.status)) {
    throw new BusinessRuleError(
      'FATURA_NAO_REFERENCIAVEL',
      `A factura ${fatura.numero} está ${fatura.status === 'RASCUNHO' ? 'em rascunho' : 'cancelada'} e não pode ser referenciada.`,
    );
  }
}

export async function emitirNotaDebito(input: EmitirNotaDebitoInput, ctx: Ctx): Promise<NotaDebitoCompleta> {
  await exigirEmailConfirmadoParaEmitir();
  exigirMotivoIsencao(input.linhas);
  return prismaBase.$transaction(async (tx) => {
    // W9: validar clienteId pertence ao tenant
    const cliente = await tx.cliente.findFirst({ where: { id: input.clienteId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!cliente) throw new NotFoundError('Cliente não encontrado');

    // Tudo o que pode recusar vem ANTES da numeração (ADR-0039 §1).
    const contaCredito = await resolverContaCreditoNotaDebito(tx, input, ctx);
    if (input.faturaReferenciaId) await validarFaturaReferenciaNotaDebito(tx, input.faturaReferenciaId, input.clienteId, ctx);

    const { numero, serieDocumentoId } = await numerarDocumento(tx, 'NOTA_DEBITO', ctx, input.dataEmissao);

    let subtotal = new Prisma.Decimal(0);
    let ivaTotal = new Prisma.Decimal(0);
    for (const l of input.linhas) {
      subtotal = subtotal.plus(new Prisma.Decimal(l.subtotal.toFixed(2)));
      ivaTotal = ivaTotal.plus(new Prisma.Decimal(l.ivaItem.toFixed(2)));
    }

    const nd = await tx.notaDebito.create({
      data: {
        tenantId: ctx.tenantId,
        serieDocumentoId,
        numero,
        clienteId: input.clienteId,
        faturaReferenciaId: input.faturaReferenciaId ?? null,
        motivo: input.motivo,
        natureza: input.natureza,
        contaCreditoId: contaCredito.id,
        moeda: input.moeda ?? 'MZN',
        subtotal,
        descontoTotal: new Prisma.Decimal(0),
        ivaTotal,
        total: subtotal.plus(ivaTotal),
        status: 'EMITIDA',
        dataEmissao: input.dataEmissao,
        observacoes: input.observacoes ?? null,
        emitidoPorId: ctx.userId,
      },
    });

    await Promise.all(
      input.linhas.map((l, i) =>
        tx.linhaNotaDebito.create({
          data: {
            tenantId: ctx.tenantId,
            notaDebitoId: nd.id,
            produtoId: l.produtoId ?? null,
            descricao: l.descricao,
            quantidade: new Prisma.Decimal(l.quantidade.toFixed(4)),
            precoUnitario: new Prisma.Decimal(l.precoUnitario.toFixed(2)),
            desconto: new Prisma.Decimal(l.desconto.toFixed(2)),
            taxaIva: new Prisma.Decimal(l.taxaIva.toFixed(4)),
            subtotal: new Prisma.Decimal(l.subtotal.toFixed(2)),
            ivaItem: new Prisma.Decimal(l.ivaItem.toFixed(2)),
            total: new Prisma.Decimal(l.total.toFixed(2)),
            motivoIsencao: motivoIsencaoDaLinha(l),
            ordemLinha: l.ordemLinha ?? i,
          },
        }),
      ),
    );

    // Lançamento contabilístico da nota de débito na MESMA transacção.
    // A ND não tinha este lançamento — adicionado em conjunto com a ligação
    // lancamentoId que o apuramento de IVA e o fecho de período exigem.
    const lancamentoND = await registarLancamentoContabilistico(
      tx,
      construirLancamentoNotaDebito({
        id: nd.id,
        numero,
        total: subtotal.plus(ivaTotal),
        subtotal,
        ivaTotal,
        dataEmissao: input.dataEmissao,
        contaCreditoCodigo: contaCredito.codigo,
      }),
      ctx,
    );
    await tx.notaDebito.update({
      where: { id: nd.id },
      data: { lancamentoId: lancamentoND.id },
    });

    return tx.notaDebito.findFirst({
      where: { id: nd.id },
      include: {
        linhas: { orderBy: { ordemLinha: 'asc' } },
        faturaReferencia: { select: { id: true, numero: true, total: true } },
      },
    }) as unknown as NotaDebitoCompleta;
  });
}

export async function obterNotaDebito(id: string, ctx: Ctx): Promise<NotaDebitoCompleta | null> {
  return prisma.notaDebito.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      linhas: { orderBy: { ordemLinha: 'asc' } },
      faturaReferencia: { select: { id: true, numero: true, total: true } },
    },
  }) as unknown as NotaDebitoCompleta | null;
}

export async function listarNotasDebito(filtro: FiltroNotaDebitoInput, ctx: Ctx): Promise<PaginacaoFaturacao<NotaDebitoCompleta>> {
  return paginate(
    (a) =>
      prisma.notaDebito.findMany({
        ...a,
        where: {
          tenantId: ctx.tenantId,
          ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
          ...(filtro.status ? { status: filtro.status } : {}),
        },
        include: {
          linhas: { orderBy: { ordemLinha: 'asc' } },
          faturaReferencia: { select: { id: true, numero: true, total: true } },
        },
        orderBy: { dataEmissao: 'desc' },
      }),
    { cursor: filtro.cursor, take: filtro.take },
  ) as unknown as Promise<PaginacaoFaturacao<NotaDebitoCompleta>>;
}

export async function liquidarNotaDebito(id: string, ctx: Ctx): Promise<NotaDebito> {
  const nd = await prisma.notaDebito.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!nd) throw new NotFoundError('Nota de débito não encontrada');
  transitarND(nd.status as StatusNotaDebito, 'LIQUIDADA');
  return prisma.notaDebito.update({ where: { id }, data: { status: 'LIQUIDADA' } }) as unknown as NotaDebito;
}

export async function cancelarNotaDebito(id: string, motivo: string, ctx: Ctx): Promise<NotaDebito> {
  const nd = await prisma.notaDebito.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!nd) throw new NotFoundError('Nota de débito não encontrada');
  transitarND(nd.status as StatusNotaDebito, 'CANCELADA');
  return prisma.notaDebito.update({ where: { id }, data: { status: 'CANCELADA', motivoCancelamento: motivo } }) as unknown as NotaDebito;
}

// ---------------------------------------------------------------------------
// Proformas
// ---------------------------------------------------------------------------

export async function criarProforma(input: CriarProformaInput, ctx: Ctx): Promise<ProformaCompleta> {
  return prismaBase.$transaction(async (tx) => {
    // W9: validar clienteId pertence ao tenant
    const cliente = await tx.cliente.findFirst({ where: { id: input.clienteId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!cliente) throw new NotFoundError('Cliente não encontrado');

    const { numero, serieDocumentoId } = await numerarDocumento(tx, 'PROFORMA', ctx, input.dataEmissao);

    let subtotal = new Prisma.Decimal(0);
    let ivaTotal = new Prisma.Decimal(0);
    for (const l of input.linhas) {
      subtotal = subtotal.plus(new Prisma.Decimal(l.subtotal.toFixed(2)));
      ivaTotal = ivaTotal.plus(new Prisma.Decimal(l.ivaItem.toFixed(2)));
    }

    const proforma = await tx.proforma.create({
      data: {
        tenantId: ctx.tenantId,
        serieDocumentoId,
        numero,
        clienteId: input.clienteId,
        moeda: input.moeda ?? 'MZN',
        subtotal,
        descontoTotal: new Prisma.Decimal(0),
        ivaTotal,
        total: subtotal.plus(ivaTotal),
        status: 'RASCUNHO',
        dataEmissao: input.dataEmissao,
        dataValidade: input.dataValidade,
        observacoes: input.observacoes ?? null,
        criadoPorId: ctx.userId,
      },
    });

    await Promise.all(
      input.linhas.map((l, i) =>
        tx.linhaProforma.create({
          data: {
            tenantId: ctx.tenantId,
            proformaId: proforma.id,
            produtoId: l.produtoId ?? null,
            descricao: l.descricao,
            quantidade: new Prisma.Decimal(l.quantidade.toFixed(4)),
            precoUnitario: new Prisma.Decimal(l.precoUnitario.toFixed(2)),
            desconto: new Prisma.Decimal(l.desconto.toFixed(2)),
            taxaIva: new Prisma.Decimal(l.taxaIva.toFixed(4)),
            subtotal: new Prisma.Decimal(l.subtotal.toFixed(2)),
            ivaItem: new Prisma.Decimal(l.ivaItem.toFixed(2)),
            total: new Prisma.Decimal(l.total.toFixed(2)),
            ordemLinha: l.ordemLinha ?? i,
          },
        }),
      ),
    );

    return tx.proforma.findFirst({
      where: { id: proforma.id },
      include: { linhas: { orderBy: { ordemLinha: 'asc' } } },
    }) as unknown as ProformaCompleta;
  });
}

export async function enviarProforma(id: string, ctx: Ctx): Promise<Proforma> {
  const p = await prisma.proforma.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!p) throw new NotFoundError('Proforma não encontrada');
  transitarProforma(p.status as StatusProforma, 'ENVIADA');
  return prisma.proforma.update({ where: { id }, data: { status: 'ENVIADA' } }) as unknown as Proforma;
}

export async function aceitarProforma(id: string, ctx: Ctx): Promise<Proforma> {
  const p = await prisma.proforma.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!p) throw new NotFoundError('Proforma não encontrada');
  transitarProforma(p.status as StatusProforma, 'ACEITE');
  return prisma.proforma.update({ where: { id }, data: { status: 'ACEITE' } }) as unknown as Proforma;
}

export async function converterProformaEmFatura(id: string, ctx: Ctx): Promise<FaturaCompleta> {
  // Converter uma proforma cria uma Factura já EMITIDA — é emissão de
  // documento fiscal por outra porta, e o travão tem de a cobrir também.
  await exigirEmailConfirmadoParaEmitir();
  return prismaBase.$transaction(async (tx) => {
    await trancarLinha(tx, 'Proforma', id, ctx.tenantId);
    const proforma = await tx.proforma.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { linhas: true },
    });
    if (!proforma) throw new NotFoundError('Proforma não encontrada');
    transitarProforma(proforma.status as StatusProforma, 'CONVERTIDA');

    // Mesmo núcleo que `emitirFatura`: numera, congela o NUIT e lança D 411 / C 711 / C 44331
    // (antes a factura convertida ficava sem lançamento ⇒ DOCUMENTO_SEM_LANCAMENTO).
    // As linhas da proforma já vêm calculadas pelo mesmo Zod — os totais coincidem.
    const dataEmissao = new Date();
    // A proforma não guarda motivo de isenção: a linha a 0% leva o texto legal do tenant (#329).
    const motivoIsencao = proforma.linhas.some((l) => l.taxaIva.isZero())
      ? await motivoIsencaoAutomaticoEmTx(tx, ctx)
      : undefined;
    const fatura = await emitirDocumentoEmTx(
      tx,
      {
        clienteId: proforma.clienteId,
        moeda: proforma.moeda,
        dataEmissao,
        dataVencimento: new Date(dataEmissao.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 dias
        linhas: proforma.linhas.map((l) => ({
          produtoId: l.produtoId ?? undefined,
          descricao: l.descricao,
          quantidade: l.quantidade.toNumber(),
          precoUnitario: l.precoUnitario.toNumber(),
          desconto: l.desconto.toNumber(),
          taxaIva: l.taxaIva.toNumber(),
          subtotal: l.subtotal.toNumber(),
          ivaItem: l.ivaItem.toNumber(),
          total: l.total.toNumber(),
          ...(l.taxaIva.isZero() ? { motivoIsencao } : {}),
          ordemLinha: l.ordemLinha,
        })),
      },
      ctx,
    );

    await tx.proforma.update({
      where: { id },
      data: { status: 'CONVERTIDA', faturaId: fatura.id },
    });

    return fatura;
  });
}

export async function cancelarProforma(id: string, motivo: string, ctx: Ctx): Promise<Proforma> {
  return prisma.$transaction(async (rawTx) => {
    const tx = rawTx as unknown as Prisma.TransactionClient;
    await trancarLinha(tx, 'Proforma', id, ctx.tenantId);
    const p = await tx.proforma.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!p) throw new NotFoundError('Proforma não encontrada');
    transitarProforma(p.status as StatusProforma, 'CANCELADA');
    return tx.proforma.update({ where: { id }, data: { status: 'CANCELADA', motivoCancelamento: motivo } }) as unknown as Proforma;
  });
}

export async function obterProforma(id: string, ctx: Ctx): Promise<ProformaCompleta | null> {
  return prisma.proforma.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { linhas: { orderBy: { ordemLinha: 'asc' } } },
  }) as unknown as Promise<ProformaCompleta | null>;
}

export async function listarProformas(filtro: FiltroProformaInput, ctx: Ctx): Promise<PaginacaoFaturacao<ProformaCompleta>> {
  return paginate(
    (a) =>
      prisma.proforma.findMany({
        ...a,
        where: {
          tenantId: ctx.tenantId,
          ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
          ...(filtro.status ? { status: filtro.status } : {}),
        },
        include: { linhas: { orderBy: { ordemLinha: 'asc' } } },
        orderBy: { dataEmissao: 'desc' },
      }),
    { cursor: filtro.cursor, take: filtro.take },
  ) as unknown as Promise<PaginacaoFaturacao<ProformaCompleta>>;
}

// ---------------------------------------------------------------------------
// Cotações comerciais
// ---------------------------------------------------------------------------

export async function criarCotacaoComercial(input: CriarCotacaoComercialInput, ctx: Ctx): Promise<CotacaoComercialCompleta> {
  return prismaBase.$transaction(async (tx) => {
    // W9: validar clienteId pertence ao tenant
    const cliente = await tx.cliente.findFirst({ where: { id: input.clienteId, tenantId: ctx.tenantId }, select: { id: true } });
    if (!cliente) throw new NotFoundError('Cliente não encontrado');

    const { numero, serieDocumentoId } = await numerarDocumento(tx, 'COTACAO_COMERCIAL', ctx, input.dataEmissao);

    let subtotal = new Prisma.Decimal(0);
    let ivaTotal = new Prisma.Decimal(0);
    for (const l of input.linhas) {
      subtotal = subtotal.plus(new Prisma.Decimal(l.subtotal.toFixed(2)));
      ivaTotal = ivaTotal.plus(new Prisma.Decimal(l.ivaItem.toFixed(2)));
    }

    const cotacao = await tx.cotacaoComercial.create({
      data: {
        tenantId: ctx.tenantId,
        serieDocumentoId,
        numero,
        clienteId: input.clienteId,
        moeda: input.moeda ?? 'MZN',
        subtotal,
        descontoTotal: new Prisma.Decimal(0),
        ivaTotal,
        total: subtotal.plus(ivaTotal),
        status: 'RASCUNHO',
        dataEmissao: input.dataEmissao,
        dataValidade: input.dataValidade,
        condicoesComerciais: input.condicoesComerciais ?? null,
        observacoes: input.observacoes ?? null,
        criadoPorId: ctx.userId,
      },
    });

    await Promise.all(
      input.linhas.map((l, i) =>
        tx.linhaCotacaoComercial.create({
          data: {
            tenantId: ctx.tenantId,
            cotacaoComercialId: cotacao.id,
            produtoId: l.produtoId ?? null,
            descricao: l.descricao,
            quantidade: new Prisma.Decimal(l.quantidade.toFixed(4)),
            precoUnitario: new Prisma.Decimal(l.precoUnitario.toFixed(2)),
            desconto: new Prisma.Decimal(l.desconto.toFixed(2)),
            taxaIva: new Prisma.Decimal(l.taxaIva.toFixed(4)),
            subtotal: new Prisma.Decimal(l.subtotal.toFixed(2)),
            ivaItem: new Prisma.Decimal(l.ivaItem.toFixed(2)),
            total: new Prisma.Decimal(l.total.toFixed(2)),
            ordemLinha: l.ordemLinha ?? i,
          },
        }),
      ),
    );

    return tx.cotacaoComercial.findFirst({
      where: { id: cotacao.id },
      include: { linhas: { orderBy: { ordemLinha: 'asc' } } },
    }) as unknown as CotacaoComercialCompleta;
  });
}

export async function enviarCotacaoComercial(id: string, ctx: Ctx): Promise<CotacaoComercial> {
  const c = await prisma.cotacaoComercial.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!c) throw new NotFoundError('Cotação não encontrada');
  transitarCotacao(c.status as StatusCotacaoComercial, 'ENVIADA');
  return prisma.cotacaoComercial.update({ where: { id }, data: { status: 'ENVIADA' } }) as unknown as CotacaoComercial;
}

export async function aceitarCotacaoComercial(id: string, ctx: Ctx): Promise<CotacaoComercial> {
  const c = await prisma.cotacaoComercial.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!c) throw new NotFoundError('Cotação não encontrada');
  transitarCotacao(c.status as StatusCotacaoComercial, 'ACEITE');
  return prisma.cotacaoComercial.update({ where: { id }, data: { status: 'ACEITE' } }) as unknown as CotacaoComercial;
}

export async function rejeitarCotacaoComercial(id: string, motivo: string, ctx: Ctx): Promise<CotacaoComercial> {
  const c = await prisma.cotacaoComercial.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!c) throw new NotFoundError('Cotação não encontrada');
  transitarCotacao(c.status as StatusCotacaoComercial, 'REJEITADA');
  return prisma.cotacaoComercial.update({ where: { id }, data: { status: 'REJEITADA', observacoes: motivo } }) as unknown as CotacaoComercial;
}

/** #148 — só RASCUNHO → CANCELADA (depois de enviada, o caminho é «Rejeitar»). */
export async function cancelarCotacaoComercial(id: string, motivo: string, ctx: Ctx): Promise<CotacaoComercial> {
  return prisma.$transaction(async (rawTx) => {
    const tx = rawTx as unknown as Prisma.TransactionClient;
    await trancarLinha(tx, 'CotacaoComercial', id, ctx.tenantId);
    const c = await tx.cotacaoComercial.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!c) throw new NotFoundError('Cotação não encontrada');
    transitarCotacao(c.status as StatusCotacaoComercial, 'CANCELADA');
    return tx.cotacaoComercial.update({
      where: { id },
      data: { status: 'CANCELADA', motivoCancelamento: motivo },
    }) as unknown as CotacaoComercial;
  });
}

export async function converterCotacaoEmProforma(id: string, ctx: Ctx): Promise<ProformaCompleta> {
  return prismaBase.$transaction(async (tx) => {
    const cotacao = await tx.cotacaoComercial.findFirst({
      where: { id, tenantId: ctx.tenantId },
      include: { linhas: true },
    });
    if (!cotacao) throw new NotFoundError('Cotação não encontrada');
    transitarCotacao(cotacao.status as StatusCotacaoComercial, 'CONVERTIDA');

    const dataEmissao = new Date();
    const { numero, serieDocumentoId } = await numerarDocumento(tx, 'PROFORMA', ctx, dataEmissao);

    const proforma = await tx.proforma.create({
      data: {
        tenantId: ctx.tenantId,
        serieDocumentoId,
        numero,
        clienteId: cotacao.clienteId,
        moeda: cotacao.moeda,
        subtotal: cotacao.subtotal,
        descontoTotal: cotacao.descontoTotal,
        ivaTotal: cotacao.ivaTotal,
        total: cotacao.total,
        status: 'RASCUNHO',
        dataEmissao,
        dataValidade: cotacao.dataValidade,
        criadoPorId: ctx.userId,
      },
    });

    await Promise.all(
      cotacao.linhas.map((l) =>
        tx.linhaProforma.create({
          data: {
            tenantId: ctx.tenantId,
            proformaId: proforma.id,
            produtoId: l.produtoId,
            descricao: l.descricao,
            quantidade: l.quantidade,
            precoUnitario: l.precoUnitario,
            desconto: l.desconto,
            taxaIva: l.taxaIva,
            subtotal: l.subtotal,
            ivaItem: l.ivaItem,
            total: l.total,
            ordemLinha: l.ordemLinha,
          },
        }),
      ),
    );

    await tx.cotacaoComercial.update({
      where: { id },
      data: { status: 'CONVERTIDA', proformaId: proforma.id },
    });

    return tx.proforma.findFirst({
      where: { id: proforma.id },
      include: { linhas: { orderBy: { ordemLinha: 'asc' } } },
    }) as unknown as ProformaCompleta;
  });
}

export async function obterCotacaoComercial(
  id: string,
  ctx: Ctx,
): Promise<CotacaoComercialCompleta | null> {
  return prisma.cotacaoComercial.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: { linhas: { orderBy: { ordemLinha: 'asc' } } },
  }) as unknown as Promise<CotacaoComercialCompleta | null>;
}

export async function listarCotacoesComerciais(filtro: FiltroCotacaoComercialInput, ctx: Ctx): Promise<PaginacaoFaturacao<CotacaoComercialCompleta>> {
  return paginate(
    (a) =>
      prisma.cotacaoComercial.findMany({
        ...a,
        where: {
          tenantId: ctx.tenantId,
          ...(filtro.clienteId ? { clienteId: filtro.clienteId } : {}),
          ...(filtro.status ? { status: filtro.status } : {}),
        },
        include: { linhas: { orderBy: { ordemLinha: 'asc' } } },
        orderBy: { dataEmissao: 'desc' },
      }),
    { cursor: filtro.cursor, take: filtro.take },
  ) as unknown as Promise<PaginacaoFaturacao<CotacaoComercialCompleta>>;
}

// ---------------------------------------------------------------------------
// Export tipado
// ---------------------------------------------------------------------------

export const faturacaoService = {
  criarSerie,
  listarSeries,
  proximoNumeroSerie,
  numerarDocumento,
  emitirFatura,
  emitirDocumentoEmTx,
  avisosLimiteCreditoEmTx,
  obterFatura,
  listarFaturas,
  registarPagamento,
  marcarVencida,
  emitirNotaCredito,
  emitirNotaCreditoEmTx,
  motivoIsencaoAutomaticoEmTx,
  obterNotaCredito,
  listarNotasCredito,
  liquidarNotaCredito,
  devolverNotaCreditoPelosMeiosOriginaisEmTx,
  liquidarNotaCreditoEmTx,
  cancelarNotaCredito,
  emitirNotaDebito,
  obterNotaDebito,
  listarNotasDebito,
  liquidarNotaDebito,
  cancelarNotaDebito,
  criarProforma,
  enviarProforma,
  aceitarProforma,
  converterProformaEmFatura,
  obterProforma,
  cancelarProforma,
  listarProformas,
  criarCotacaoComercial,
  enviarCotacaoComercial,
  aceitarCotacaoComercial,
  rejeitarCotacaoComercial,
  cancelarCotacaoComercial,
  converterCotacaoEmProforma,
  obterCotacaoComercial,
  listarCotacoesComerciais,
  editarSerie,
  activarSerie,
  desactivarSerie,
  eliminarSerie,
} satisfies IFaturacaoService;
