/**
 * ClienteService — Wave 2 (WS C)
 * Implementação de IClienteService com Prisma.
 * Porte de src/lib/storage/cliente-storage.ts (sem localStorage — DB real).
 *
 * Convenções:
 *  - Usa `prisma` da extensão multi-tenant para reads/writes fora de transaction.
 *  - Dentro de $transaction, usa `tx` explicitamente com tenantId no where/data.
 *  - Decimal fields retornados como string (ADR A9 — interface).
 *  - Soft delete: marca deletedAt, não remove.
 */
import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/server/db/client';
import { paginate } from '@/server/db/paginate';
import { BusinessRuleError, NotFoundError } from '@/lib/errors';
import type { Ctx, TxClient } from '@/server/services/types';
import type {
  IClienteService,
  ClienteRow,
  ClienteSummary,
  PaginatedClientes,
  EnderecoClienteRow,
  ContactoClienteRow,
  SegmentacaoClienteRow,
  HistoricoTransacaoRow,
} from './cliente.interface';
import type {
  CreateClienteInput,
  UpdateClienteInput,
  FilterClienteInput,
  CreateEnderecoClienteInput,
  UpdateEnderecoClienteInput,
  CreateContactoClienteInput,
  UpdateContactoClienteInput,
  CreateSegmentacaoClienteInput,
  UpdateSegmentacaoClienteInput,
} from '@/lib/validations/clientes';

// ---------------------------------------------------------------------------
// Helpers de mapeamento (Decimal → string, ADR A9)
// ---------------------------------------------------------------------------

function dec(v: Prisma.Decimal | null | undefined): string {
  return v?.toString() ?? '0';
}

type PrismaCliente = Awaited<ReturnType<typeof prisma.cliente.findFirstOrThrow>>;
type PrismaEndereco = Awaited<ReturnType<typeof prisma.enderecoCliente.findFirstOrThrow>>;
type PrismaContacto = Awaited<ReturnType<typeof prisma.contactoCliente.findFirstOrThrow>>;
type PrismaSegmentacao = Awaited<ReturnType<typeof prisma.segmentacaoCliente.findFirstOrThrow>>;
type PrismaHistorico = Awaited<ReturnType<typeof prisma.historicoTransacao.findFirstOrThrow>>;

function mapEnderecoRow(e: PrismaEndereco): EnderecoClienteRow {
  return {
    id: e.id,
    tenantId: e.tenantId,
    clienteId: e.clienteId,
    tipo: e.tipo as EnderecoClienteRow['tipo'],
    rua: e.rua,
    numero: e.numero,
    bairro: e.bairro,
    cidade: e.cidade,
    provincia: e.provincia,
    codigoPostal: e.codigoPostal,
    referencia: e.referencia,
    principal: e.principal,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

function mapContactoRow(c: PrismaContacto): ContactoClienteRow {
  return {
    id: c.id,
    tenantId: c.tenantId,
    clienteId: c.clienteId,
    nome: c.nome,
    cargo: c.cargo,
    email: c.email,
    telefone: c.telefone,
    telefoneSec: c.telefoneSec,
    tipo: c.tipo as ContactoClienteRow['tipo'],
    ativo: c.ativo,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function mapSegmentacaoRow(s: PrismaSegmentacao): SegmentacaoClienteRow {
  return {
    id: s.id,
    tenantId: s.tenantId,
    clienteId: s.clienteId,
    segmento: s.segmento as SegmentacaoClienteRow['segmento'],
    industria: s.industria,
    tamanhoEmpresa: s.tamanhoEmpresa as SegmentacaoClienteRow['tamanhoEmpresa'],
    potencialVendas: s.potencialVendas as SegmentacaoClienteRow['potencialVendas'],
    frequenciaCompra: s.frequenciaCompra as SegmentacaoClienteRow['frequenciaCompra'],
    ticketMedio: dec(s.ticketMedio),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

function mapHistoricoRow(h: PrismaHistorico): HistoricoTransacaoRow {
  return {
    id: h.id,
    tenantId: h.tenantId,
    clienteId: h.clienteId,
    tipo: h.tipo as HistoricoTransacaoRow['tipo'],
    referencia: h.referencia,
    descricao: h.descricao,
    valor: dec(h.valor),
    currency: h.currency,
    dataTransacao: h.dataTransacao,
    status: h.status as HistoricoTransacaoRow['status'],
    userId: h.userId,
    createdAt: h.createdAt,
  };
}

type ClienteWithRelations = PrismaCliente & {
  enderecos?: PrismaEndereco[];
  contactos?: PrismaContacto[];
  segmentacao?: PrismaSegmentacao | null;
};

function mapClienteRow(c: ClienteWithRelations): ClienteRow {
  return {
    id: c.id,
    tenantId: c.tenantId,
    codigo: c.codigo,
    nome: c.nome,
    tipo: c.tipo as ClienteRow['tipo'],
    nuit: c.nuit,
    bi: c.bi,
    email: c.email,
    telefone: c.telefone,
    telefoneSec: c.telefoneSec,
    diasPagamento: c.diasPagamento,
    limiteCreditoMT: dec(c.limiteCreditoMT),
    creditoUtilizadoMT: dec(c.creditoUtilizadoMT),
    status: c.status as ClienteRow['status'],
    categoria: c.categoria as ClienteRow['categoria'],
    observacoes: c.observacoes,
    representanteNome: c.representanteNome,
    representanteEmail: c.representanteEmail,
    representanteTelefone: c.representanteTelefone,
    tags: c.tags,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    deletedAt: c.deletedAt,
    enderecos: c.enderecos?.map(mapEnderecoRow),
    contactos: c.contactos?.map(mapContactoRow),
    segmentacao: c.segmentacao ? mapSegmentacaoRow(c.segmentacao) : undefined,
  };
}

function mapClienteSummary(c: PrismaCliente & { enderecos?: { cidade: string }[] }): ClienteSummary {
  const cidades = c.enderecos?.map((e) => e.cidade) ?? [];
  return {
    id: c.id,
    codigo: c.codigo,
    nome: c.nome,
    tipo: c.tipo as ClienteSummary['tipo'],
    nuit: c.nuit,
    email: c.email,
    telefone: c.telefone,
    status: c.status as ClienteSummary['status'],
    categoria: c.categoria as ClienteSummary['categoria'],
    enderecosCidade: [...new Set(cidades)].join(', '),
    createdAt: c.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Geração de código sequencial
// ---------------------------------------------------------------------------

async function gerarCodigoCliente(tenantId: string): Promise<string> {
  // Busca o último código do tenant e incrementa
  const ultimo = await prisma.cliente.findFirst({
    where: { tenantId, codigo: { startsWith: 'CLI-' } },
    orderBy: { codigo: 'desc' },
    select: { codigo: true },
  });

  if (!ultimo) return 'CLI-0001';

  const num = parseInt(ultimo.codigo.split('-')[1] ?? '0', 10);
  return `CLI-${(num + 1).toString().padStart(4, '0')}`;
}

// ---------------------------------------------------------------------------
// Implementação do serviço
// ---------------------------------------------------------------------------

export class ClienteService implements IClienteService {
  async criar(input: CreateClienteInput, ctx: Ctx): Promise<ClienteRow> {
    const codigo = await gerarCodigoCliente(ctx.tenantId);

    const criado = await prisma.cliente.create({
      data: {
        tenantId: ctx.tenantId,
        codigo,
        nome: input.nome,
        tipo: input.tipo,
        nuit: input.nuit,
        bi: input.bi ?? null,
        email: input.email,
        telefone: input.telefone,
        telefoneSec: input.telefoneSec ?? null,
        diasPagamento: input.diasPagamento,
        limiteCreditoMT: new Prisma.Decimal(input.limiteCreditoMT ?? 0),
        status: input.status,
        categoria: input.categoria,
        observacoes: input.observacoes ?? null,
        representanteNome: input.representante?.nome ?? null,
        representanteEmail: input.representante?.email ?? null,
        representanteTelefone: input.representante?.telefone ?? null,
        tags: input.tags,
        enderecos: {
          create: input.enderecos.map((e) => ({
            tenantId: ctx.tenantId,
            tipo: e.tipo,
            rua: e.rua,
            numero: e.numero,
            bairro: e.bairro,
            cidade: e.cidade,
            provincia: e.provincia,
            codigoPostal: e.codigoPostal ?? null,
            referencia: e.referencia ?? null,
            principal: e.principal,
          })),
        },
      },
      include: { enderecos: true, contactos: true, segmentacao: true },
    });

    return mapClienteRow(criado);
  }

  async buscarPorId(id: string, ctx: Ctx): Promise<ClienteRow> {
    const cliente = await prisma.cliente.findUnique({
      where: { id },
      include: { enderecos: true, contactos: true, segmentacao: true },
    });

    if (!cliente || cliente.tenantId !== ctx.tenantId || cliente.deletedAt) {
      throw new NotFoundError(`Cliente ${id} não encontrado`);
    }

    return mapClienteRow(cliente);
  }

  async listar(filtros: FilterClienteInput, ctx: Ctx): Promise<PaginatedClientes> {
    const orderBy = { [filtros.orderBy]: filtros.order } as Prisma.ClienteOrderByWithRelationInput;

    const page = await paginate<{ id: string }>(
      (args) =>
        prisma.cliente.findMany({
          ...args,
          where: {
            ...(filtros.q
              ? {
                  OR: [
                    { nome: { contains: filtros.q, mode: 'insensitive' } },
                    { nuit: { contains: filtros.q } },
                    { email: { contains: filtros.q, mode: 'insensitive' } },
                    { codigo: { contains: filtros.q } },
                  ],
                }
              : {}),
            ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
            ...(filtros.status ? { status: filtros.status } : {}),
            ...(filtros.categoria ? { categoria: filtros.categoria } : {}),
            ...(filtros.segmento
              ? { segmentacao: { segmento: filtros.segmento } }
              : {}),
          },
          orderBy,
          select: {
            id: true,
            codigo: true,
            nome: true,
            tipo: true,
            nuit: true,
            email: true,
            telefone: true,
            status: true,
            categoria: true,
            tenantId: true,
            createdAt: true,
            enderecos: { select: { cidade: true } },
          },
        }) as Promise<{ id: string }[]>,
      { cursor: filtros.cursor, take: filtros.take },
    );

    return {
      items: (page.items as unknown as Parameters<typeof mapClienteSummary>[0][]).map(mapClienteSummary),
      nextCursor: page.nextCursor,
    };
  }

  async atualizar(id: string, input: UpdateClienteInput, ctx: Ctx): Promise<ClienteRow> {
    const existente = await prisma.cliente.findUnique({ where: { id } });
    if (!existente || existente.tenantId !== ctx.tenantId || existente.deletedAt) {
      throw new NotFoundError(`Cliente ${id} não encontrado`);
    }

    const atualizado = await prisma.cliente.update({
      where: { id },
      data: {
        ...(input.nome !== undefined ? { nome: input.nome } : {}),
        ...(input.tipo !== undefined ? { tipo: input.tipo } : {}),
        ...(input.nuit !== undefined ? { nuit: input.nuit } : {}),
        ...(input.bi !== undefined ? { bi: input.bi } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.telefone !== undefined ? { telefone: input.telefone } : {}),
        ...(input.telefoneSec !== undefined ? { telefoneSec: input.telefoneSec } : {}),
        ...(input.diasPagamento !== undefined ? { diasPagamento: input.diasPagamento } : {}),
        ...(input.limiteCreditoMT !== undefined
          ? { limiteCreditoMT: new Prisma.Decimal(input.limiteCreditoMT) }
          : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.categoria !== undefined ? { categoria: input.categoria } : {}),
        ...(input.observacoes !== undefined ? { observacoes: input.observacoes } : {}),
        ...(input.representante !== undefined
          ? {
              representanteNome: input.representante?.nome ?? null,
              representanteEmail: input.representante?.email ?? null,
              representanteTelefone: input.representante?.telefone ?? null,
            }
          : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
      },
      include: { enderecos: true, contactos: true, segmentacao: true },
    });

    return mapClienteRow(atualizado);
  }

  async desativar(id: string, ctx: Ctx): Promise<void> {
    const cliente = await prisma.cliente.findUnique({
      where: { id },
      select: { tenantId: true, deletedAt: true, creditoUtilizadoMT: true },
    });

    if (!cliente || cliente.tenantId !== ctx.tenantId || cliente.deletedAt) {
      throw new NotFoundError(`Cliente ${id} não encontrado`);
    }

    if (cliente.creditoUtilizadoMT && cliente.creditoUtilizadoMT.greaterThan(0)) {
      throw new BusinessRuleError(
        'CLIENTE_COM_DEBITOS_PENDENTES',
        `Cliente tem crédito utilizado de ${dec(cliente.creditoUtilizadoMT)} MT`,
      );
    }

    await prisma.cliente.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'INATIVO' },
    });
  }

  // --- Endereços ---

  async adicionarEndereco(
    clienteId: string,
    input: CreateEnderecoClienteInput,
    ctx: Ctx,
  ): Promise<EnderecoClienteRow> {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { tenantId: true, deletedAt: true },
    });
    if (!cliente || cliente.tenantId !== ctx.tenantId || cliente.deletedAt) {
      throw new NotFoundError(`Cliente ${clienteId} não encontrado`);
    }

    if (input.principal) {
      // Desmarca todos os outros endereços principais
      await prisma.enderecoCliente.updateMany({
        where: { clienteId },
        data: { principal: false },
      });
    }

    const criado = await prisma.enderecoCliente.create({
      data: {
        tenantId: ctx.tenantId,
        clienteId,
        tipo: input.tipo,
        rua: input.rua,
        numero: input.numero,
        bairro: input.bairro,
        cidade: input.cidade,
        provincia: input.provincia,
        codigoPostal: input.codigoPostal ?? null,
        referencia: input.referencia ?? null,
        principal: input.principal,
      },
    });

    return mapEnderecoRow(criado);
  }

  async atualizarEndereco(
    clienteId: string,
    enderecoId: string,
    input: UpdateEnderecoClienteInput,
    ctx: Ctx,
  ): Promise<EnderecoClienteRow> {
    const endereco = await prisma.enderecoCliente.findUnique({ where: { id: enderecoId } });
    if (!endereco || endereco.clienteId !== clienteId || endereco.tenantId !== ctx.tenantId) {
      throw new NotFoundError(`Endereço ${enderecoId} não encontrado`);
    }

    if (input.principal) {
      await prisma.enderecoCliente.updateMany({
        where: { clienteId, id: { not: enderecoId } },
        data: { principal: false },
      });
    }

    const atualizado = await prisma.enderecoCliente.update({
      where: { id: enderecoId },
      data: {
        ...(input.tipo !== undefined ? { tipo: input.tipo } : {}),
        ...(input.rua !== undefined ? { rua: input.rua } : {}),
        ...(input.numero !== undefined ? { numero: input.numero } : {}),
        ...(input.bairro !== undefined ? { bairro: input.bairro } : {}),
        ...(input.cidade !== undefined ? { cidade: input.cidade } : {}),
        ...(input.provincia !== undefined ? { provincia: input.provincia } : {}),
        ...(input.codigoPostal !== undefined ? { codigoPostal: input.codigoPostal } : {}),
        ...(input.referencia !== undefined ? { referencia: input.referencia } : {}),
        ...(input.principal !== undefined ? { principal: input.principal } : {}),
      },
    });

    return mapEnderecoRow(atualizado);
  }

  async removerEndereco(clienteId: string, enderecoId: string, ctx: Ctx): Promise<void> {
    const endereco = await prisma.enderecoCliente.findUnique({ where: { id: enderecoId } });
    if (!endereco || endereco.clienteId !== clienteId || endereco.tenantId !== ctx.tenantId) {
      throw new NotFoundError(`Endereço ${enderecoId} não encontrado`);
    }
    if (endereco.principal) {
      throw new BusinessRuleError(
        'ENDERECO_PRINCIPAL_REMOVIDO',
        'Não é possível remover o endereço principal. Defina outro como principal primeiro.',
      );
    }
    await prisma.enderecoCliente.delete({ where: { id: enderecoId } });
  }

  async definirEnderecoPrincipal(clienteId: string, enderecoId: string, ctx: Ctx): Promise<void> {
    const endereco = await prisma.enderecoCliente.findUnique({ where: { id: enderecoId } });
    if (!endereco || endereco.clienteId !== clienteId || endereco.tenantId !== ctx.tenantId) {
      throw new NotFoundError(`Endereço ${enderecoId} não encontrado`);
    }
    await prisma.$transaction([
      prisma.enderecoCliente.updateMany({
        where: { clienteId },
        data: { principal: false },
      }),
      prisma.enderecoCliente.update({
        where: { id: enderecoId },
        data: { principal: true },
      }),
    ]);
  }

  // --- Contactos ---

  async adicionarContacto(
    clienteId: string,
    input: CreateContactoClienteInput,
    ctx: Ctx,
  ): Promise<ContactoClienteRow> {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { tenantId: true, deletedAt: true },
    });
    if (!cliente || cliente.tenantId !== ctx.tenantId || cliente.deletedAt) {
      throw new NotFoundError(`Cliente ${clienteId} não encontrado`);
    }

    const criado = await prisma.contactoCliente.create({
      data: {
        tenantId: ctx.tenantId,
        clienteId,
        nome: input.nome,
        cargo: input.cargo ?? null,
        email: input.email,
        telefone: input.telefone,
        telefoneSec: input.telefoneSec ?? null,
        tipo: input.tipo,
        ativo: input.ativo,
      },
    });

    return mapContactoRow(criado);
  }

  async atualizarContacto(
    clienteId: string,
    contactoId: string,
    input: UpdateContactoClienteInput,
    ctx: Ctx,
  ): Promise<ContactoClienteRow> {
    const contacto = await prisma.contactoCliente.findUnique({ where: { id: contactoId } });
    if (!contacto || contacto.clienteId !== clienteId || contacto.tenantId !== ctx.tenantId) {
      throw new NotFoundError(`Contacto ${contactoId} não encontrado`);
    }

    const atualizado = await prisma.contactoCliente.update({
      where: { id: contactoId },
      data: {
        ...(input.nome !== undefined ? { nome: input.nome } : {}),
        ...(input.cargo !== undefined ? { cargo: input.cargo } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.telefone !== undefined ? { telefone: input.telefone } : {}),
        ...(input.telefoneSec !== undefined ? { telefoneSec: input.telefoneSec } : {}),
        ...(input.tipo !== undefined ? { tipo: input.tipo } : {}),
        ...(input.ativo !== undefined ? { ativo: input.ativo } : {}),
      },
    });

    return mapContactoRow(atualizado);
  }

  async removerContacto(clienteId: string, contactoId: string, ctx: Ctx): Promise<void> {
    const contacto = await prisma.contactoCliente.findUnique({ where: { id: contactoId } });
    if (!contacto || contacto.clienteId !== clienteId || contacto.tenantId !== ctx.tenantId) {
      throw new NotFoundError(`Contacto ${contactoId} não encontrado`);
    }
    await prisma.contactoCliente.delete({ where: { id: contactoId } });
  }

  // --- Segmentação ---

  async atualizarSegmentacao(
    clienteId: string,
    input: CreateSegmentacaoClienteInput | UpdateSegmentacaoClienteInput,
    ctx: Ctx,
  ): Promise<SegmentacaoClienteRow> {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { tenantId: true, deletedAt: true },
    });
    if (!cliente || cliente.tenantId !== ctx.tenantId || cliente.deletedAt) {
      throw new NotFoundError(`Cliente ${clienteId} não encontrado`);
    }

    const resultado = await prisma.segmentacaoCliente.upsert({
      where: { clienteId },
      update: {
        ...(input.segmento !== undefined ? { segmento: input.segmento } : {}),
        ...(input.industria !== undefined ? { industria: input.industria } : {}),
        ...(input.tamanhoEmpresa !== undefined ? { tamanhoEmpresa: input.tamanhoEmpresa } : {}),
        ...(input.potencialVendas !== undefined ? { potencialVendas: input.potencialVendas } : {}),
        ...(input.frequenciaCompra !== undefined ? { frequenciaCompra: input.frequenciaCompra } : {}),
        ...(input.ticketMedio !== undefined
          ? { ticketMedio: new Prisma.Decimal(input.ticketMedio) }
          : {}),
      },
      create: {
        tenantId: ctx.tenantId,
        clienteId,
        segmento: (input as CreateSegmentacaoClienteInput).segmento ?? 'VAREJO',
        industria: input.industria ?? null,
        tamanhoEmpresa: input.tamanhoEmpresa ?? null,
        potencialVendas: input.potencialVendas ?? 'MEDIO',
        frequenciaCompra: input.frequenciaCompra ?? 'MENSAL',
        ticketMedio: new Prisma.Decimal(input.ticketMedio ?? 0),
      },
    });

    return mapSegmentacaoRow(resultado);
  }

  // --- Histórico ---

  async obterHistorico(
    clienteId: string,
    filtro: { dataInicio?: Date; dataFim?: Date; cursor?: string; take?: number },
    ctx: Ctx,
  ): Promise<{ items: HistoricoTransacaoRow[]; nextCursor: string | null }> {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { tenantId: true },
    });
    if (!cliente || cliente.tenantId !== ctx.tenantId) {
      throw new NotFoundError(`Cliente ${clienteId} não encontrado`);
    }

    const page = await paginate<{ id: string }>(
      (args) =>
        prisma.historicoTransacao.findMany({
          ...args,
          where: {
            clienteId,
            ...(filtro.dataInicio || filtro.dataFim
              ? {
                  dataTransacao: {
                    ...(filtro.dataInicio ? { gte: filtro.dataInicio } : {}),
                    ...(filtro.dataFim ? { lte: filtro.dataFim } : {}),
                  },
                }
              : {}),
          },
          orderBy: { dataTransacao: 'desc' },
        }) as Promise<{ id: string }[]>,
      { cursor: filtro.cursor, take: filtro.take ?? 20 },
    );

    return {
      items: (page.items as unknown as PrismaHistorico[]).map(mapHistoricoRow),
      nextCursor: page.nextCursor,
    };
  }

  // --- Crédito ---

  async incrementarCreditoUtilizado(
    tx: TxClient,
    clienteId: string,
    valor: string,
    ctx: Ctx,
  ): Promise<void> {
    const txClient = tx as Prisma.TransactionClient;

    const cliente = await txClient.cliente.findUnique({
      where: { id: clienteId },
      select: { tenantId: true, limiteCreditoMT: true, creditoUtilizadoMT: true },
    });

    if (!cliente || cliente.tenantId !== ctx.tenantId) {
      throw new NotFoundError(`Cliente ${clienteId} não encontrado`);
    }

    const novoUtilizado = new Prisma.Decimal(dec(cliente.creditoUtilizadoMT)).plus(new Prisma.Decimal(valor));
    const limite = new Prisma.Decimal(dec(cliente.limiteCreditoMT));

    if (limite.greaterThan(0) && novoUtilizado.greaterThan(limite)) {
      throw new BusinessRuleError(
        'LIMITE_CREDITO_EXCEDIDO',
        `Limite de crédito (${limite.toFixed(2)} MT) seria excedido`,
      );
    }

    await txClient.cliente.update({
      where: { id: clienteId },
      data: { creditoUtilizadoMT: novoUtilizado },
    });
  }

  async liberarCredito(
    tx: TxClient,
    clienteId: string,
    valor: string,
    ctx: Ctx,
  ): Promise<void> {
    const txClient = tx as Prisma.TransactionClient;

    const cliente = await txClient.cliente.findUnique({
      where: { id: clienteId },
      select: { tenantId: true, creditoUtilizadoMT: true },
    });

    if (!cliente || cliente.tenantId !== ctx.tenantId) {
      throw new NotFoundError(`Cliente ${clienteId} não encontrado`);
    }

    const atual = new Prisma.Decimal(dec(cliente.creditoUtilizadoMT));
    const liberar = new Prisma.Decimal(valor);
    const novo = atual.minus(liberar);

    await txClient.cliente.update({
      where: { id: clienteId },
      data: { creditoUtilizadoMT: novo.lessThan(0) ? new Prisma.Decimal(0) : novo },
    });
  }
}

export const clienteService = new ClienteService();
