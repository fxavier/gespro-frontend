// Serviço de Ativos (WS A — Wave 2)
import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { paginate } from '@/server/db/paginate';
import { getObjectStorage, urlRefParaKey, prefixoTenant } from '@/lib/storage/objeto';
import { logger } from '@/server/observability/logger';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type {
  AtivoCreate,
  AtivoFilter,
  AtivoUpdate,
  CategoriaAtivoCreate,
  CategoriaAtivoFilter,
  CategoriaAtivoUpdate,
  DocumentoAtivoCreate,
  MovimentacaoAtivoCreate,
} from '@/lib/validations/inventario-ativos';
import type { Ctx, PaginatedResult } from '@/server/services/types';
import {
  TRANSICOES_ATIVO,
  type AtivoDto,
  type CategoriaAtivoDto,
  type DocumentoAtivoDto,
  type IAtivoService,
  type MovimentacaoAtivoDto,
} from './ativos.interface';
import { transitar } from './state-machine';

// ─── Mapeadores ───────────────────────────────────────────────────────────────

const d = (v: { toString(): string } | null) => v?.toString() ?? null;

function mapCategoria(c: {
  id: string; tenantId: string; codigo: string; nome: string; descricao: string | null;
  categoriaPaiId: string | null; metodoAmortizacao: string; vidaUtilAnos: number;
  valorResidualPct: { toString(): string }; intervaloPreventivaDias: number | null;
  alertaManutencaoDias: number | null; ativa: boolean; createdAt: Date;
}): CategoriaAtivoDto {
  return {
    id: c.id, tenantId: c.tenantId, codigo: c.codigo, nome: c.nome, descricao: c.descricao,
    categoriaPaiId: c.categoriaPaiId, metodoAmortizacao: c.metodoAmortizacao,
    vidaUtilAnos: c.vidaUtilAnos, valorResidualPct: c.valorResidualPct.toString(),
    intervaloPreventivaDias: c.intervaloPreventivaDias,
    alertaManutencaoDias: c.alertaManutencaoDias, ativa: c.ativa, createdAt: c.createdAt,
  };
}

const CAT_SEL = {
  id: true, tenantId: true, codigo: true, nome: true, descricao: true,
  categoriaPaiId: true, metodoAmortizacao: true, vidaUtilAnos: true, valorResidualPct: true,
  intervaloPreventivaDias: true, alertaManutencaoDias: true, ativa: true, createdAt: true,
} as const;

const ATIVO_SEL = {
  id: true, tenantId: true, codigoInterno: true, nome: true, descricao: true,
  categoriaId: true, categoria: { select: { id: true, nome: true } },
  numeroSerie: true, modelo: true, marca: true, fornecedorId: true,
  dataAquisicao: true, valorCompra: true, valorResidual: true, vidaUtilAnos: true,
  dataSubstituicao: true, estado: true, localizacaoId: true, responsavelId: true,
  departamentoId: true, projetoId: true, metodoAmortizacao: true,
  qrCode: true, codigoBarras: true, rfidTag: true, observacoes: true,
  garantiaDataInicio: true, garantiaDataFim: true, garantiaFornecedor: true, garantiaTermos: true,
  imagens: true, criadoPor: true, createdAt: true, updatedAt: true,
  documentos: {
    select: { id: true, ativoId: true, nome: true, tipo: true, url: true, dataUpload: true },
  },
  amortizacoes: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { valorAmortizadoAcumulado: true, valorLiquidoContabilistico: true, valorInicial: true },
  },
} as const;

function mapAtivo(a: {
  id: string; tenantId: string; codigoInterno: string; nome: string; descricao: string | null;
  categoriaId: string; categoria: { id: string; nome: string } | null;
  numeroSerie: string | null; modelo: string | null; marca: string | null;
  fornecedorId: string | null; dataAquisicao: Date;
  valorCompra: { toString(): string }; valorResidual: { toString(): string } | null;
  vidaUtilAnos: number; dataSubstituicao: Date | null; estado: string; localizacaoId: string;
  responsavelId: string | null; departamentoId: string | null; projetoId: string | null;
  metodoAmortizacao: string; qrCode: string | null; codigoBarras: string | null;
  rfidTag: string | null; observacoes: string | null;
  garantiaDataInicio: Date | null; garantiaDataFim: Date | null;
  garantiaFornecedor: string | null; garantiaTermos: string | null; imagens: string[];
  criadoPor: string; createdAt: Date; updatedAt: Date;
  documentos: Array<{ id: string; ativoId: string; nome: string; tipo: string; url: string; dataUpload: Date }>;
  amortizacoes: Array<{ valorAmortizadoAcumulado: { toString(): string }; valorLiquidoContabilistico: { toString(): string }; valorInicial: { toString(): string } }>;
}): AtivoDto {
  const ult = a.amortizacoes[0];
  let percentual: string | null = null;
  if (ult) {
    const vi = new Prisma.Decimal(ult.valorInicial.toString());
    const ac = new Prisma.Decimal(ult.valorAmortizadoAcumulado.toString());
    percentual = vi.isZero() ? '0' : ac.div(vi).times(100).toFixed(2);
  }
  return {
    id: a.id, tenantId: a.tenantId, codigoInterno: a.codigoInterno, nome: a.nome,
    descricao: a.descricao, categoriaId: a.categoriaId, categoria: a.categoria,
    numeroSerie: a.numeroSerie, modelo: a.modelo, marca: a.marca, fornecedorId: a.fornecedorId,
    dataAquisicao: a.dataAquisicao, valorCompra: a.valorCompra.toString(),
    valorResidual: d(a.valorResidual), vidaUtilAnos: a.vidaUtilAnos,
    dataSubstituicao: a.dataSubstituicao, estado: a.estado, localizacaoId: a.localizacaoId,
    responsavelId: a.responsavelId, departamentoId: a.departamentoId, projetoId: a.projetoId,
    metodoAmortizacao: a.metodoAmortizacao, qrCode: a.qrCode, codigoBarras: a.codigoBarras,
    rfidTag: a.rfidTag, observacoes: a.observacoes,
    garantiaDataInicio: a.garantiaDataInicio, garantiaDataFim: a.garantiaDataFim,
    garantiaFornecedor: a.garantiaFornecedor, garantiaTermos: a.garantiaTermos,
    imagens: a.imagens, documentos: a.documentos.map((doc) => ({
      id: doc.id, ativoId: doc.ativoId, nome: doc.nome, tipo: doc.tipo, url: doc.url, dataUpload: doc.dataUpload,
    })),
    valorAmortizadoAcumulado: ult ? ult.valorAmortizadoAcumulado.toString() : null,
    valorLiquidoContabilistico: ult ? ult.valorLiquidoContabilistico.toString() : null,
    percentualAmortizado: percentual,
    criadoPor: a.criadoPor, createdAt: a.createdAt, updatedAt: a.updatedAt,
  };
}

function mapMovimentacao(m: {
  id: string; tenantId: string; ativoId: string; tipo: string;
  localizacaoOrigemId: string | null; localizacaoDestinoId: string | null;
  responsavelOrigemId: string | null; responsavelDestinoId: string | null;
  dataMovimentacao: Date; dataPrevisaoDevolucao: Date | null; motivo: string;
  observacoes: string | null; guiaMovimentacao: string | null;
  confirmada: boolean; dataConfirmacao: Date | null; confirmadaPor: string | null;
  criadoPor: string; createdAt: Date;
}): MovimentacaoAtivoDto {
  return {
    id: m.id, tenantId: m.tenantId, ativoId: m.ativoId, tipo: m.tipo,
    localizacaoOrigemId: m.localizacaoOrigemId, localizacaoDestinoId: m.localizacaoDestinoId,
    responsavelOrigemId: m.responsavelOrigemId, responsavelDestinoId: m.responsavelDestinoId,
    dataMovimentacao: m.dataMovimentacao, dataPrevisaoDevolucao: m.dataPrevisaoDevolucao,
    motivo: m.motivo, observacoes: m.observacoes, guiaMovimentacao: m.guiaMovimentacao,
    confirmada: m.confirmada, dataConfirmacao: m.dataConfirmacao,
    confirmadaPor: m.confirmadaPor, criadoPor: m.criadoPor, createdAt: m.createdAt,
  };
}

const MOV_SEL = {
  id: true, tenantId: true, ativoId: true, tipo: true,
  localizacaoOrigemId: true, localizacaoDestinoId: true,
  responsavelOrigemId: true, responsavelDestinoId: true,
  dataMovimentacao: true, dataPrevisaoDevolucao: true, motivo: true,
  observacoes: true, guiaMovimentacao: true,
  confirmada: true, dataConfirmacao: true, confirmadaPor: true,
  criadoPor: true, createdAt: true,
} as const;

// ─── Categorias ───────────────────────────────────────────────────────────────

async function listarCategorias(filter: CategoriaAtivoFilter, ctx: Ctx): Promise<PaginatedResult<CategoriaAtivoDto>> {
  const page = await paginate(
    (args) => prisma.categoriaAtivo.findMany({
      ...args,
      where: {
        ...(filter.search ? { OR: [{ nome: { contains: filter.search, mode: 'insensitive' } }, { codigo: { contains: filter.search, mode: 'insensitive' } }] } : {}),
        ...(filter.ativa !== undefined ? { ativa: filter.ativa } : {}),
        deletedAt: null,
      },
      select: CAT_SEL, orderBy: { nome: 'asc' },
    }),
    { cursor: filter.cursor, take: filter.take },
  );
  return { items: page.items.map(mapCategoria), nextCursor: page.nextCursor };
}

async function obterCategoria(id: string, ctx: Ctx): Promise<CategoriaAtivoDto> {
  const c = await prisma.categoriaAtivo.findFirst({ where: { id, deletedAt: null }, select: CAT_SEL });
  if (!c) throw new NotFoundError('Categoria de ativo não encontrada');
  return mapCategoria(c);
}

async function criarCategoria(data: CategoriaAtivoCreate, ctx: Ctx): Promise<CategoriaAtivoDto> {
  const c = await prisma.categoriaAtivo.create({
    data: { ...data, tenantId: ctx.tenantId, metodoAmortizacao: data.metodoAmortizacao as never },
    select: CAT_SEL,
  });
  return mapCategoria(c);
}

async function actualizarCategoria(id: string, data: CategoriaAtivoUpdate, ctx: Ctx): Promise<CategoriaAtivoDto> {
  await obterCategoria(id, ctx);
  const c = await prisma.categoriaAtivo.update({
    where: { id },
    data: { ...data, ...(data.metodoAmortizacao ? { metodoAmortizacao: data.metodoAmortizacao as never } : {}) },
    select: CAT_SEL,
  });
  return mapCategoria(c);
}

async function arquivarCategoria(id: string, ctx: Ctx): Promise<void> {
  await obterCategoria(id, ctx);
  await prisma.categoriaAtivo.update({ where: { id }, data: { ativa: false, deletedAt: new Date() } });
}

// ─── Ativos ───────────────────────────────────────────────────────────────────

async function obterAtivo(id: string, ctx: Ctx): Promise<AtivoDto> {
  const a = await prisma.ativo.findFirst({ where: { id, deletedAt: null }, select: ATIVO_SEL });
  if (!a) throw new NotFoundError('Ativo não encontrado');
  return mapAtivo(a as Parameters<typeof mapAtivo>[0]);
}

async function obterAtivoPorCodigo(codigoInterno: string, ctx: Ctx): Promise<AtivoDto> {
  const a = await prisma.ativo.findFirst({ where: { codigoInterno, deletedAt: null }, select: ATIVO_SEL });
  if (!a) throw new NotFoundError('Ativo não encontrado');
  return mapAtivo(a as Parameters<typeof mapAtivo>[0]);
}

async function listarAtivos(filter: AtivoFilter, ctx: Ctx): Promise<PaginatedResult<AtivoDto>> {
  const page = await paginate(
    (args) => prisma.ativo.findMany({
      ...args,
      where: {
        ...(filter.search ? { OR: [
          { nome: { contains: filter.search, mode: 'insensitive' } },
          { codigoInterno: { contains: filter.search, mode: 'insensitive' } },
          { numeroSerie: { contains: filter.search, mode: 'insensitive' } },
        ] } : {}),
        ...(filter.categoriaId ? { categoriaId: filter.categoriaId } : {}),
        ...(filter.localizacaoId ? { localizacaoId: filter.localizacaoId } : {}),
        ...(filter.responsavelId ? { responsavelId: filter.responsavelId } : {}),
        ...(filter.estado ? { estado: filter.estado as never } : {}),
        ...(filter.fornecedorId ? { fornecedorId: filter.fornecedorId } : {}),
        ...(filter.dataAquisicaoInicio || filter.dataAquisicaoFim ? {
          dataAquisicao: {
            ...(filter.dataAquisicaoInicio ? { gte: filter.dataAquisicaoInicio } : {}),
            ...(filter.dataAquisicaoFim ? { lte: filter.dataAquisicaoFim } : {}),
          },
        } : {}),
        deletedAt: null,
      },
      select: ATIVO_SEL,
      orderBy: { [filter.orderBy]: filter.orderDir },
    }),
    { cursor: filter.cursor, take: filter.take },
  );
  return { items: page.items.map((a) => mapAtivo(a as Parameters<typeof mapAtivo>[0])), nextCursor: page.nextCursor };
}

async function criarAtivo(data: AtivoCreate, ctx: Ctx): Promise<AtivoDto> {
  const { garantia, ...rest } = data;
  const a = await prisma.ativo.create({
    data: {
      ...rest,
      tenantId: ctx.tenantId,
      criadoPor: ctx.userId,
      estado: (rest.estado ?? 'NOVO') as never,
      metodoAmortizacao: rest.metodoAmortizacao as never,
      valorCompra: new Prisma.Decimal(rest.valorCompra),
      ...(rest.valorResidual !== undefined ? { valorResidual: new Prisma.Decimal(rest.valorResidual) } : {}),
      ...(garantia ? {
        garantiaDataInicio: garantia.dataInicio,
        garantiaDataFim: garantia.dataFim,
        garantiaFornecedor: garantia.fornecedor,
        garantiaTermos: garantia.termos ?? null,
      } : {}),
    },
    select: ATIVO_SEL,
  });
  return mapAtivo(a as Parameters<typeof mapAtivo>[0]);
}

async function actualizarAtivo(id: string, data: AtivoUpdate, ctx: Ctx): Promise<AtivoDto> {
  await obterAtivo(id, ctx);
  const { garantia, ...rest } = data;
  const a = await prisma.ativo.update({
    where: { id },
    data: {
      ...rest,
      atualizadoPor: ctx.userId,
      ...(rest.estado ? { estado: rest.estado as never } : {}),
      ...(rest.metodoAmortizacao ? { metodoAmortizacao: rest.metodoAmortizacao as never } : {}),
      ...(rest.valorCompra !== undefined ? { valorCompra: new Prisma.Decimal(rest.valorCompra) } : {}),
      ...(rest.valorResidual !== undefined ? { valorResidual: new Prisma.Decimal(rest.valorResidual) } : {}),
      ...(garantia ? {
        garantiaDataInicio: garantia.dataInicio,
        garantiaDataFim: garantia.dataFim,
        garantiaFornecedor: garantia.fornecedor,
        garantiaTermos: garantia.termos ?? null,
      } : {}),
    },
    select: ATIVO_SEL,
  });
  return mapAtivo(a as Parameters<typeof mapAtivo>[0]);
}

async function transitarEstado(
  id: string,
  novoEstado: string,
  ctx: Ctx,
  opts?: { observacoes?: string },
): Promise<AtivoDto> {
  const ativo = await obterAtivo(id, ctx);
  transitar(TRANSICOES_ATIVO as never, ativo.estado as never, novoEstado as never, 'Ativo');

  // Regista movimentação de estado
  await prisma.movimentacaoAtivo.create({
    data: {
      tenantId: ctx.tenantId,
      ativoId: id,
      tipo: novoEstado === 'BAIXADO' ? 'BAIXA' : 'AJUSTE' as never,
      dataMovimentacao: new Date(),
      motivo: opts?.observacoes ?? `Transição para ${novoEstado}`,
      criadoPor: ctx.userId,
    },
  });

  const a = await prisma.ativo.update({
    where: { id },
    data: { estado: novoEstado as never, atualizadoPor: ctx.userId },
    select: ATIVO_SEL,
  });
  return mapAtivo(a as Parameters<typeof mapAtivo>[0]);
}

async function arquivarAtivo(id: string, ctx: Ctx): Promise<void> {
  await obterAtivo(id, ctx);
  await prisma.ativo.update({ where: { id }, data: { deletedAt: new Date(), atualizadoPor: ctx.userId } });
}

// ─── Documentos ───────────────────────────────────────────────────────────────

async function adicionarDocumento(data: DocumentoAtivoCreate, ctx: Ctx): Promise<DocumentoAtivoDto> {
  // Isolamento multi-tenant (B1): a key/urlRef vem do cliente (derivada no
  // presign server-side, mas reenviada). Nunca persistir uma key que aponte
  // para fora do prefixo do tenant — senão o delete/download apagaria/lería
  // objetos de outro tenant. Rejeita na ESCRITA para que nunca entre na BD.
  const keyCandidata = data.storageKey ?? urlRefParaKey(data.url);
  if (keyCandidata && !keyCandidata.startsWith(prefixoTenant(ctx.tenantId))) {
    throw new BusinessRuleError(
      'KEY_FORA_DO_TENANT',
      'A referência do documento não pertence ao tenant',
    );
  }

  const doc = await prisma.documentoAtivo.create({
    data: {
      tenantId: ctx.tenantId,
      ativoId: data.ativoId,
      nome: data.nome,
      tipo: data.tipo as never,
      url: data.url,
      dataUpload: data.dataUpload ?? new Date(),
      // Delta WS-DOC-CORE: guarda a key/metadados do objeto para download e remoção.
      ...(data.storageKey !== undefined ? { storageKey: data.storageKey } : {}),
      ...(data.contentType !== undefined ? { contentType: data.contentType } : {}),
      ...(data.tamanhoBytes !== undefined ? { tamanhoBytes: data.tamanhoBytes } : {}),
    },
    select: { id: true, ativoId: true, nome: true, tipo: true, url: true, dataUpload: true },
  });
  return { id: doc.id, ativoId: doc.ativoId, nome: doc.nome, tipo: doc.tipo, url: doc.url, dataUpload: doc.dataUpload };
}

async function removerDocumento(documentoId: string, ctx: Ctx): Promise<void> {
  const doc = await prisma.documentoAtivo.findFirst({
    where: { id: documentoId, tenantId: ctx.tenantId },
    select: { id: true, storageKey: true, url: true },
  });
  if (!doc) throw new NotFoundError('Documento não encontrado');

  // WS-DOC-CORE (gap 3): apaga o objeto no storage antes do metadado.
  // A key vem de `storageKey`; em falta, extrai-se da ref opaca em `url`
  // (http legada / não-ref → null, sem objeto a apagar).
  const key = doc.storageKey ?? (doc.url ? urlRefParaKey(doc.url) : null);

  // Defesa em profundidade (B1): mesmo que uma key forjada tivesse entrado na
  // BD, nunca apagar um objeto fora do prefixo do tenant.
  if (key && key.startsWith(prefixoTenant(ctx.tenantId))) {
    try {
      await getObjectStorage().delete(key);
    } catch (err) {
      // Best-effort/idempotente: não bloqueia a remoção do metadado, mas
      // regista para não deixar objetos órfãos sem rasto.
      logger.warn({ err, key }, 'falha ao remover objeto de storage do documento de ativo');
    }
  }

  await prisma.documentoAtivo.delete({ where: { id: documentoId } });
}

// ─── Movimentações ────────────────────────────────────────────────────────────

async function listarMovimentacoes(ativoId: string, ctx: Ctx): Promise<MovimentacaoAtivoDto[]> {
  const movs = await prisma.movimentacaoAtivo.findMany({
    where: { ativoId, tenantId: ctx.tenantId },
    select: MOV_SEL,
    orderBy: { createdAt: 'desc' },
  });
  return movs.map(mapMovimentacao);
}

async function registarMovimentacao(data: MovimentacaoAtivoCreate, ctx: Ctx): Promise<MovimentacaoAtivoDto> {
  const mov = await prisma.movimentacaoAtivo.create({
    data: {
      tenantId: ctx.tenantId,
      ativoId: data.ativoId,
      tipo: data.tipo as never,
      localizacaoOrigemId: data.localizacaoOrigemId ?? null,
      localizacaoDestinoId: data.localizacaoDestinoId ?? null,
      responsavelOrigemId: data.responsavelOrigemId ?? null,
      responsavelDestinoId: data.responsavelDestinoId ?? null,
      dataMovimentacao: data.dataMovimentacao,
      dataPrevisaoDevolucao: data.dataPrevisaoDevolucao ?? null,
      motivo: data.motivo,
      observacoes: data.observacoes ?? null,
      guiaMovimentacao: data.guiaMovimentacao ?? null,
      criadoPor: ctx.userId,
    },
    select: MOV_SEL,
  });
  return mapMovimentacao(mov);
}

async function confirmarMovimentacao(movimentacaoId: string, confirmadaPor: string, ctx: Ctx): Promise<MovimentacaoAtivoDto> {
  const m = await prisma.movimentacaoAtivo.findFirst({ where: { id: movimentacaoId, tenantId: ctx.tenantId } });
  if (!m) throw new NotFoundError('Movimentação não encontrada');
  if (m.confirmada) throw new BusinessRuleError('JA_CONFIRMADA', 'Movimentação já foi confirmada');
  const updated = await prisma.movimentacaoAtivo.update({
    where: { id: movimentacaoId },
    data: { confirmada: true, dataConfirmacao: new Date(), confirmadaPor },
    select: MOV_SEL,
  });
  return mapMovimentacao(updated);
}

// ─── Exportação ───────────────────────────────────────────────────────────────

async function exportarRelatorioAtivos(filter: AtivoFilter, ctx: Ctx): Promise<string> {
  const { items } = await listarAtivos({ ...filter, take: 1000 }, ctx);
  const header = 'Código,Nome,Categoria,Estado,Localização,Valor Compra,Data Aquisição\n';
  const rows = items.map((a) =>
    [a.codigoInterno, `"${a.nome}"`, a.categoria?.nome ?? '', a.estado, a.localizacaoId, a.valorCompra, a.dataAquisicao.toISOString().slice(0, 10)].join(','),
  );
  return header + rows.join('\n');
}

// ─── Exportação como objecto ──────────────────────────────────────────────────

export const ativosService: IAtivoService = {
  listarCategorias, obterCategoria, criarCategoria, actualizarCategoria, arquivarCategoria,
  listarAtivos, obterAtivo, obterAtivoPorCodigo, criarAtivo, actualizarAtivo, transitarEstado, arquivarAtivo,
  adicionarDocumento, removerDocumento,
  listarMovimentacoes, registarMovimentacao, confirmarMovimentacao,
  exportarRelatorioAtivos,
};
