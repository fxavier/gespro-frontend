/**
 * Implementação do serviço de Fornecedores — WS B (Wave 2)
 */
import 'server-only';

import { PrismaClient } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import { paginate } from '@/server/db/paginate';
import { getObjectStorage, urlRefParaKey, prefixoTenant } from '@/lib/storage/objeto';
import { logger } from '@/server/observability/logger';
import type {
  IFornecedorService,
  FornecedorResumo,
  FornecedorDetalhe,
  ContactoFornecedorDto,
  DocumentoFornecedorDto,
  ScoreFornecedor,
  AgingContasPagar,
} from './fornecedor.service.interface';
import type {
  CreateFornecedorInput,
  UpdateFornecedorInput,
  FilterFornecedorInput,
} from '@/lib/validations/fornecedores';
import type { Ctx } from '@/server/services/types';
import type { z } from 'zod';
import type {
  CreateContactoFornecedorSchema,
  UpdateContactoFornecedorSchema,
  CreateDocumentoFornecedorSchema,
  CreateAvaliacaoFornecedorSchema,
} from '@/lib/validations/fornecedores';

const db = prisma as unknown as PrismaClient;

// =====================================================================
// Funções puras (testáveis sem BD)
// =====================================================================

export function calcularScoreSupplier(avaliacoes: Array<{
  qualidade: number;
  prazo: number;
  preco: number;
  comunicacao: number;
}>): { ratingCalculado: number; qualidadeMedia: number; prazoMedia: number; precoMedia: number; comunicacaoMedia: number } {
  if (avaliacoes.length === 0) {
    return { ratingCalculado: 0, qualidadeMedia: 0, prazoMedia: 0, precoMedia: 0, comunicacaoMedia: 0 };
  }
  const n = avaliacoes.length;
  const qualidadeMedia = avaliacoes.reduce((s, a) => s + a.qualidade, 0) / n;
  const prazoMedia = avaliacoes.reduce((s, a) => s + a.prazo, 0) / n;
  const precoMedia = avaliacoes.reduce((s, a) => s + a.preco, 0) / n;
  const comunicacaoMedia = avaliacoes.reduce((s, a) => s + a.comunicacao, 0) / n;
  // Ponderação: qualidade 35%, prazo 30%, preço 20%, comunicação 15%
  const ratingCalculado = qualidadeMedia * 0.35 + prazoMedia * 0.30 + precoMedia * 0.20 + comunicacaoMedia * 0.15;
  return { ratingCalculado: Math.round(ratingCalculado * 10) / 10, qualidadeMedia, prazoMedia, precoMedia, comunicacaoMedia };
}

// =====================================================================
// Mappers BD → DTO
// =====================================================================

function toFornecedorResumo(f: any): FornecedorResumo {
  return {
    id: f.id,
    codigo: f.codigo,
    nome: f.nome,
    nuit: f.nuit,
    email: f.email,
    status: f.status,
    classificacao: f.classificacao,
    rating: f.rating ? Number(f.rating) : null,
    saldoDevedor: Number(f.saldoDevedor ?? 0),
    totalCompras: Number(f.totalCompras ?? 0),
    ultimaCompra: f.ultimaCompra ?? null,
    createdAt: f.createdAt,
  };
}

function toFornecedorDetalhe(f: any): FornecedorDetalhe {
  return {
    ...toFornecedorResumo(f),
    tipo: f.tipo,
    bi: f.bi ?? null,
    telefone: f.telefone ?? null,
    categoria: f.categoria ?? null,
    limiteCredito: f.limiteCredito ? Number(f.limiteCredito) : null,
    diasPagamento: f.diasPagamento ?? 30,
    prazoMedioPagamento: f.prazoMedioPagamento ?? 0,
    condicoesPagamento: f.condicoesPagamento ?? null,
    formasPagamento: f.formasPagamento ?? [],
    condicoesComerciaisDesconto: f.condicoesComerciaisDesconto ? Number(f.condicoesComerciaisDesconto) : null,
    avaliacaoQualidade: f.avaliacaoQualidade ? Number(f.avaliacaoQualidade) : null,
    observacoes: f.observacoes ?? null,
    tags: f.tags ?? [],
    enderecos: (f.enderecos ?? []).map((e: any) => ({
      id: e.id, tipo: e.tipo, rua: e.rua, numero: e.numero,
      bairro: e.bairro, cidade: e.cidade, provincia: e.provincia,
      codigoPostal: e.codigoPostal ?? null, referencia: e.referencia ?? null,
      principal: e.principal,
    })),
    contactos: (f.contactos ?? []).map((c: any) => ({
      id: c.id, nome: c.nome, cargo: c.cargo ?? null, email: c.email ?? null,
      telefone: c.telefone ?? null, tipo: c.tipo, ativo: c.ativo,
    })),
    documentos: (f.documentos ?? []).map((d: any) => ({
      id: d.id, tipo: d.tipo, nome: d.nome,
      dataUpload: d.dataUpload, dataValidade: d.dataValidade ?? null, url: d.url,
    })),
  };
}

async function gerarCodigoFornecedor(ctx: Ctx): Promise<string> {
  const count = await db.fornecedor.count({ where: { tenantId: ctx.tenantId } });
  return `FOR-${String(count + 1).padStart(4, '0')}`;
}

// =====================================================================
// Implementação
// =====================================================================

export const fornecedorService: IFornecedorService = {
  async criar(input: CreateFornecedorInput, ctx: Ctx): Promise<FornecedorDetalhe> {
    // Verificar NUIT único no tenant
    const existe = await db.fornecedor.findFirst({ where: { tenantId: ctx.tenantId, nuit: input.nuit } });
    if (existe) throw new BusinessRuleError('NUIT_DUPLICADO', `NUIT ${input.nuit} já registado neste tenant`);

    const codigo = await gerarCodigoFornecedor(ctx);

    const { enderecos, contactos, ...campos } = input as any;

    const fornecedor = await db.fornecedor.create({
      data: {
        ...campos,
        codigo,
        saldoDevedor: 0,
        totalCompras: 0,
        enderecos: enderecos?.length
          ? { create: enderecos.map((e: any) => ({ ...e, tenantId: ctx.tenantId })) }
          : undefined,
        contactos: contactos?.length
          ? { create: contactos.map((c: any) => ({ ...c, tenantId: ctx.tenantId })) }
          : undefined,
      },
      include: { enderecos: true, contactos: true, documentos: true },
    });
    return toFornecedorDetalhe(fornecedor);
  },

  async actualizar(id: string, input: UpdateFornecedorInput, ctx: Ctx): Promise<FornecedorDetalhe> {
    const fornecedor = await db.fornecedor.findUnique({ where: { id } });
    if (!fornecedor || fornecedor.tenantId !== ctx.tenantId) throw new NotFoundError('Fornecedor não encontrado');

    if (input.nuit && input.nuit !== fornecedor.nuit) {
      const existe = await db.fornecedor.findFirst({ where: { tenantId: ctx.tenantId, nuit: input.nuit, NOT: { id } } });
      if (existe) throw new BusinessRuleError('NUIT_DUPLICADO', `NUIT ${input.nuit} já registado`);
    }

    const updated = await db.fornecedor.update({
      where: { id },
      data: input,
      include: { enderecos: true, contactos: true, documentos: true },
    });
    return toFornecedorDetalhe(updated);
  },

  async arquivar(id: string, ctx: Ctx): Promise<void> {
    const fornecedor = await db.fornecedor.findUnique({ where: { id } });
    if (!fornecedor || fornecedor.tenantId !== ctx.tenantId) throw new NotFoundError('Fornecedor não encontrado');
    await db.fornecedor.update({ where: { id }, data: { deletedAt: new Date(), status: 'INATIVO' } });
  },

  async obter(id: string, ctx: Ctx): Promise<FornecedorDetalhe> {
    const fornecedor = await db.fornecedor.findUnique({
      where: { id },
      include: { enderecos: true, contactos: true, documentos: true },
    });
    if (!fornecedor || fornecedor.tenantId !== ctx.tenantId) throw new NotFoundError('Fornecedor não encontrado');
    return toFornecedorDetalhe(fornecedor);
  },

  async listar(filtros: FilterFornecedorInput, ctx: Ctx) {
    const { status, classificacao, tipo, termo, cursor, take = 25 } = filtros as any;
    const where: any = {
      tenantId: ctx.tenantId,
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(classificacao ? { classificacao } : {}),
      ...(tipo ? { tipo } : {}),
      ...(termo ? {
        OR: [
          { nome: { contains: termo, mode: 'insensitive' } },
          { nuit: { contains: termo } },
          { codigo: { contains: termo, mode: 'insensitive' } },
        ]
      } : {}),
    };
    return paginate(
      (a) => db.fornecedor.findMany({ ...a, where, orderBy: { createdAt: 'desc' } }),
      { cursor, take },
    ).then((p: any) => ({ items: p.items.map(toFornecedorResumo), nextCursor: p.nextCursor }));
  },

  async adicionarContacto(
    fornecedorId: string,
    input: z.infer<typeof CreateContactoFornecedorSchema>,
    ctx: Ctx,
  ): Promise<ContactoFornecedorDto> {
    const fornecedor = await db.fornecedor.findUnique({ where: { id: fornecedorId } });
    if (!fornecedor || fornecedor.tenantId !== ctx.tenantId) throw new NotFoundError('Fornecedor não encontrado');

    const contacto = await db.contactoFornecedor.create({
      data: { ...input, fornecedorId, tenantId: ctx.tenantId },
    });
    return { id: contacto.id, nome: contacto.nome, cargo: contacto.cargo ?? null, email: contacto.email ?? null, telefone: contacto.telefone ?? null, tipo: contacto.tipo, ativo: contacto.ativo };
  },

  async actualizarContacto(
    contactoId: string,
    input: z.infer<typeof UpdateContactoFornecedorSchema>,
    ctx: Ctx,
  ): Promise<ContactoFornecedorDto> {
    const contacto = await db.contactoFornecedor.findUnique({ where: { id: contactoId } });
    if (!contacto || contacto.tenantId !== ctx.tenantId) throw new NotFoundError('Contacto não encontrado');

    const updated = await db.contactoFornecedor.update({ where: { id: contactoId }, data: input });
    return { id: updated.id, nome: updated.nome, cargo: updated.cargo ?? null, email: updated.email ?? null, telefone: updated.telefone ?? null, tipo: updated.tipo, ativo: updated.ativo };
  },

  async removerContacto(contactoId: string, ctx: Ctx): Promise<void> {
    const contacto = await db.contactoFornecedor.findUnique({ where: { id: contactoId } });
    if (!contacto || contacto.tenantId !== ctx.tenantId) throw new NotFoundError('Contacto não encontrado');
    await db.contactoFornecedor.delete({ where: { id: contactoId } });
  },

  async adicionarDocumento(
    input: z.infer<typeof CreateDocumentoFornecedorSchema>,
    ctx: Ctx,
  ): Promise<DocumentoFornecedorDto> {
    const { fornecedorId } = input as any;
    const fornecedor = await db.fornecedor.findUnique({ where: { id: fornecedorId } });
    if (!fornecedor || fornecedor.tenantId !== ctx.tenantId) throw new NotFoundError('Fornecedor não encontrado');

    // Isolamento multi-tenant (B2): `storageKey`/`url` vêm crus do cliente. Se
    // resolverem para uma key de storage, tem de pertencer ao prefixo do tenant;
    // caso contrário, é um metadado envenenado (aponta para o objeto de outro
    // tenant) e nunca pode chegar à BD — bloquearia a fuga no download e a
    // remoção do objeto estrangeiro.
    const keyCandidata = input.storageKey ?? (input.url ? urlRefParaKey(input.url) : null);
    if (keyCandidata && !keyCandidata.startsWith(prefixoTenant(ctx.tenantId))) {
      throw new BusinessRuleError(
        'STORAGE_KEY_CROSS_TENANT',
        'A referência de armazenamento do documento não pertence a este tenant',
      );
    }

    const doc = await db.documentoFornecedor.create({
      data: { ...input, tenantId: ctx.tenantId },
    });
    return { id: doc.id, tipo: doc.tipo, nome: doc.nome, dataUpload: doc.dataUpload, dataValidade: doc.dataValidade ?? null, url: doc.url };
  },

  async removerDocumento(documentoId: string, ctx: Ctx): Promise<void> {
    const doc = await db.documentoFornecedor.findUnique({ where: { id: documentoId } });
    if (!doc || doc.tenantId !== ctx.tenantId) throw new NotFoundError('Documento não encontrado');

    // RF5: apagar o objeto no storage além do metadado (best-effort — a key
    // vem de `storageKey` ou, em falta, do parse da ref opaca em `url`).
    // Isolamento multi-tenant (B2): só apaga se a key pertencer ao prefixo do
    // tenant. Uma key fora do prefixo (metadado envenenado/legado) NUNCA é
    // apagada — apagaria o objeto de outro tenant. Defesa em profundidade
    // mesmo com a validação de escrita em `adicionarDocumento`.
    const key = doc.storageKey ?? (doc.url ? urlRefParaKey(doc.url) : null);
    if (key && key.startsWith(prefixoTenant(ctx.tenantId))) {
      try {
        await getObjectStorage().delete(key);
      } catch (e) {
        // O objeto órfão é recolhido pelo lifecycle do bucket; não bloquear
        // a remoção do metadado por uma falha transitória de storage.
        logger.warn({ documentoId, err: e, key }, 'falha ao remover objeto de storage do documento');
      }
    }

    await db.documentoFornecedor.delete({ where: { id: documentoId } });
  },

  async registarAvaliacao(
    input: z.infer<typeof CreateAvaliacaoFornecedorSchema>,
    ctx: Ctx,
  ): Promise<void> {
    const { fornecedorId } = input as any;
    const fornecedor = await db.fornecedor.findUnique({ where: { id: fornecedorId } });
    if (!fornecedor || fornecedor.tenantId !== ctx.tenantId) throw new NotFoundError('Fornecedor não encontrado');

    await db.avaliacaoFornecedor.create({
      data: { ...input, tenantId: ctx.tenantId, avaliadorId: ctx.userId },
    });
    // Actualizar rating calculado
    const score = await (fornecedorService as IFornecedorService).calcularScore(fornecedorId, ctx);
    await db.fornecedor.update({ where: { id: fornecedorId }, data: { rating: score.ratingCalculado, avaliacaoQualidade: score.qualidadeMedia } });
  },

  async calcularScore(fornecedorId: string, ctx: Ctx): Promise<ScoreFornecedor> {
    const fornecedor = await db.fornecedor.findUnique({ where: { id: fornecedorId } });
    if (!fornecedor || fornecedor.tenantId !== ctx.tenantId) throw new NotFoundError('Fornecedor não encontrado');

    const avaliacoes = await db.avaliacaoFornecedor.findMany({
      where: { tenantId: ctx.tenantId, fornecedorId },
    });

    const score = calcularScoreSupplier(avaliacoes.map((a: any) => ({
      qualidade: a.qualidade, prazo: a.prazo, preco: a.preco, comunicacao: a.comunicacao,
    })));

    return { fornecedorId, totalAvaliacoes: avaliacoes.length, ...score };
  },

  async obterAging(ctx: Ctx): Promise<AgingContasPagar[]> {
    const agora = new Date();
    const contas = await db.contaPagar.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ['ABERTA', 'PARCIALMENTE_PAGA', 'VENCIDA'] },
      },
      include: { fornecedor: { select: { id: true, nome: true } } },
    });

    const por: Record<string, AgingContasPagar> = {};

    for (const conta of contas) {
      const restante = Number(conta.valorRestante ?? 0);
      if (restante <= 0) continue;

      const id = conta.fornecedorId;
      if (!por[id]) {
        por[id] = {
          fornecedorId: id,
          nomeFornecedor: conta.fornecedor?.nome ?? id,
          totalAberto: 0, ate30Dias: 0, de31a60Dias: 0, de61a90Dias: 0, acima90Dias: 0,
        };
      }

      const dias = Math.floor((agora.getTime() - new Date(conta.dataVencimento).getTime()) / 86_400_000);
      por[id].totalAberto += restante;

      if (dias <= 0) por[id].ate30Dias += restante;
      else if (dias <= 30) por[id].ate30Dias += restante;
      else if (dias <= 60) por[id].de31a60Dias += restante;
      else if (dias <= 90) por[id].de61a90Dias += restante;
      else por[id].acima90Dias += restante;
    }

    return Object.values(por);
  },
};
