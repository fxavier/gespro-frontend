/**
 * Seed do módulo Comercial (WS C)
 * Portado de src/lib/storage/cliente-storage.ts (dados sem localStorage).
 *
 * Idempotente: upsert por chave natural (tenantId + codigo / tenantId + nuit).
 * Exporta seedComercial(prisma, tenantId) para ser chamado pelo seed principal.
 *
 * Cria:
 *  - 5 Clientes com endereços, contactos e segmentação
 *  - 3 Regras de comissão padrão
 */

import type { PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Dados iniciais (portados de ClienteStorage.getClientesIniciais())
// ---------------------------------------------------------------------------

interface ClienteSeedData {
  codigo: string;
  nome: string;
  tipo: 'FISICA' | 'JURIDICA' | 'REVENDEDOR';
  nuit: string;
  email: string;
  telefone: string;
  status: 'ATIVO' | 'INATIVO' | 'SUSPENSO';
  categoria: 'VIP' | 'REGULAR' | 'NOVO' | 'INATIVO';
  limiteCreditoMT: number;
  creditoUtilizadoMT: number;
  diasPagamento: number;
  observacoes: string;
  endereco: {
    tipo: 'FACTURACAO' | 'ENTREGA' | 'OUTRO';
    rua: string;
    numero: string;
    bairro: string;
    cidade: string;
    provincia: string;
    principal: boolean;
  };
  contacto?: {
    nome: string;
    cargo?: string;
    email: string;
    telefone: string;
    tipo: 'PRINCIPAL' | 'SECUNDARIO' | 'TECNICO' | 'FINANCEIRO';
  };
  segmentacao?: {
    segmento: 'VAREJO' | 'GROSSISTA' | 'DISTRIBUIDOR' | 'CORPORATIVO' | 'GOVERNO';
    industria?: string;
    tamanhoEmpresa?: 'MICRO' | 'PEQUENA' | 'MEDIA' | 'GRANDE';
    potencialVendas: 'ALTO' | 'MEDIO' | 'BAIXO';
    frequenciaCompra: 'DIARIA' | 'SEMANAL' | 'MENSAL' | 'TRIMESTRAL' | 'ANUAL';
    ticketMedio: number;
  };
}

const CLIENTES_SEED: ClienteSeedData[] = [
  {
    codigo: 'CLI-0001',
    nome: 'João Silva',
    tipo: 'FISICA',
    nuit: '123456789',
    email: 'joao.silva@email.com',
    telefone: '+258841234567',
    status: 'ATIVO',
    categoria: 'REGULAR',
    limiteCreditoMT: 100000,
    creditoUtilizadoMT: 0,
    diasPagamento: 30,
    observacoes: 'Cliente regular com bom histórico de pagamento',
    endereco: {
      tipo: 'FACTURACAO',
      rua: 'Avenida Julius Nyerere',
      numero: '123',
      bairro: 'Sommerschield',
      cidade: 'Maputo',
      provincia: 'Maputo',
      principal: true,
    },
    segmentacao: {
      segmento: 'VAREJO',
      industria: 'Comércio',
      tamanhoEmpresa: 'PEQUENA',
      potencialVendas: 'MEDIO',
      frequenciaCompra: 'MENSAL',
      ticketMedio: 45000,
    },
  },
  {
    codigo: 'CLI-0002',
    nome: 'Empresa ABC Lda',
    tipo: 'JURIDICA',
    nuit: '987654321',
    email: 'contato@empresaabc.co.mz',
    telefone: '+25821123456',
    status: 'ATIVO',
    categoria: 'VIP',
    limiteCreditoMT: 500000,
    creditoUtilizadoMT: 0,
    diasPagamento: 60,
    observacoes: 'Cliente VIP - Empresa de grande porte',
    endereco: {
      tipo: 'FACTURACAO',
      rua: 'Avenida 24 de Julho',
      numero: '456',
      bairro: 'Polana',
      cidade: 'Maputo',
      provincia: 'Maputo',
      principal: true,
    },
    contacto: {
      nome: 'Pedro Neves',
      cargo: 'Gerente de Vendas',
      email: 'pedro.neves@empresaabc.co.mz',
      telefone: '+258841112222',
      tipo: 'PRINCIPAL',
    },
    segmentacao: {
      segmento: 'CORPORATIVO',
      industria: 'Tecnologia',
      tamanhoEmpresa: 'GRANDE',
      potencialVendas: 'ALTO',
      frequenciaCompra: 'SEMANAL',
      ticketMedio: 150000,
    },
  },
  {
    codigo: 'CLI-0003',
    nome: 'Maria Santos',
    tipo: 'FISICA',
    nuit: '456789123',
    email: 'maria.santos@email.com',
    telefone: '+258879876543',
    status: 'ATIVO',
    categoria: 'NOVO',
    limiteCreditoMT: 50000,
    creditoUtilizadoMT: 0,
    diasPagamento: 15,
    observacoes: 'Cliente nova — primeira compra em Janeiro',
    endereco: {
      tipo: 'FACTURACAO',
      rua: 'Rua da Resistência',
      numero: '789',
      bairro: 'Matola',
      cidade: 'Matola',
      provincia: 'Maputo',
      principal: true,
    },
  },
  {
    codigo: 'CLI-0004',
    nome: 'Carlos Mendes',
    tipo: 'FISICA',
    nuit: '789123456',
    email: 'carlos.mendes@email.com',
    telefone: '+258824567890',
    status: 'INATIVO',
    categoria: 'INATIVO',
    limiteCreditoMT: 30000,
    creditoUtilizadoMT: 0,
    diasPagamento: 30,
    observacoes: 'Cliente inativo — última compra em Novembro',
    endereco: {
      tipo: 'FACTURACAO',
      rua: 'Avenida Eduardo Mondlane',
      numero: '321',
      bairro: 'Centro',
      cidade: 'Beira',
      provincia: 'Sofala',
      principal: true,
    },
  },
  {
    codigo: 'CLI-0005',
    nome: 'Revendedor XYZ Lda',
    tipo: 'REVENDEDOR',
    nuit: '321654987',
    email: 'vendas@revendedorxyz.co.mz',
    telefone: '+258843216549',
    status: 'ATIVO',
    categoria: 'VIP',
    limiteCreditoMT: 300000,
    creditoUtilizadoMT: 0,
    diasPagamento: 45,
    observacoes: 'Revendedor com bom volume de vendas',
    endereco: {
      tipo: 'FACTURACAO',
      rua: 'Avenida Samora Machel',
      numero: '654',
      bairro: 'Centro',
      cidade: 'Nampula',
      provincia: 'Nampula',
      principal: true,
    },
    segmentacao: {
      segmento: 'GROSSISTA',
      industria: 'Distribuição',
      tamanhoEmpresa: 'MEDIA',
      potencialVendas: 'ALTO',
      frequenciaCompra: 'SEMANAL',
      ticketMedio: 200000,
    },
  },
];

// ---------------------------------------------------------------------------
// Regras de comissão padrão
// ---------------------------------------------------------------------------

interface RegraSeed {
  nome: string;
  tipo: 'FIXA' | 'ESCALONADA' | 'POR_META' | 'POR_CATEGORIA' | 'POR_PERIODO';
  percentualBase: number;
  percentualBonus?: number;
  valorMinimo?: number;
  valorMaximo?: number;
  metaPercentual?: number;
  prioridade: number;
  descricao: string;
}

const REGRAS_SEED: RegraSeed[] = [
  {
    nome: 'Comissão Base',
    tipo: 'FIXA',
    percentualBase: 5,
    prioridade: 1,
    descricao: 'Comissão padrão de 5% aplicada a todas as vendas',
  },
  {
    nome: 'Comissão Escalonada — Vendas Altas',
    tipo: 'ESCALONADA',
    percentualBase: 7,
    valorMinimo: 50000,
    prioridade: 2,
    descricao: 'Comissão aumentada para vendas acima de 50.000 MT',
  },
  {
    nome: 'Bónus Meta Mensal',
    tipo: 'POR_META',
    percentualBase: 5,
    percentualBonus: 2,
    metaPercentual: 100,
    prioridade: 3,
    descricao: 'Bónus de 2% adicional ao atingir 100% da meta mensal',
  },
];

// ---------------------------------------------------------------------------
// Função de seed
// ---------------------------------------------------------------------------

export async function seedComercial(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  console.log('  [comercial] A criar clientes...');

  for (const dados of CLIENTES_SEED) {
    // Upsert por chave natural: tenantId + nuit
    const cliente = await prisma.cliente.upsert({
      where: {
        tenantId_nuit: { tenantId, nuit: dados.nuit },
      },
      update: {
        nome: dados.nome,
        status: dados.status,
        categoria: dados.categoria,
        observacoes: dados.observacoes,
      },
      create: {
        tenantId,
        codigo: dados.codigo,
        nome: dados.nome,
        tipo: dados.tipo,
        nuit: dados.nuit,
        email: dados.email,
        telefone: dados.telefone,
        status: dados.status,
        categoria: dados.categoria,
        limiteCreditoMT: new Prisma.Decimal(dados.limiteCreditoMT),
        creditoUtilizadoMT: new Prisma.Decimal(dados.creditoUtilizadoMT),
        diasPagamento: dados.diasPagamento,
        observacoes: dados.observacoes,
      },
    });

    // Endereço principal (idempotente: upsert baseado em clienteId+principal+tipo)
    await prisma.enderecoCliente.upsert({
      where: {
        // usa a combinação clienteId + tipo + principal como identificador único
        // Como não há @@unique composto, procuramos pelo primeiro e atualizamos
        id: (
          await prisma.enderecoCliente.findFirst({
            where: { clienteId: cliente.id, principal: true },
            select: { id: true },
          })
        )?.id ?? '__nonexistent__',
      },
      update: {
        rua: dados.endereco.rua,
        numero: dados.endereco.numero,
        bairro: dados.endereco.bairro,
        cidade: dados.endereco.cidade,
        provincia: dados.endereco.provincia,
      },
      create: {
        tenantId,
        clienteId: cliente.id,
        tipo: dados.endereco.tipo,
        rua: dados.endereco.rua,
        numero: dados.endereco.numero,
        bairro: dados.endereco.bairro,
        cidade: dados.endereco.cidade,
        provincia: dados.endereco.provincia,
        principal: true,
      },
    });

    // Contacto (se houver)
    if (dados.contacto) {
      const existente = await prisma.contactoCliente.findFirst({
        where: { clienteId: cliente.id, email: dados.contacto.email },
        select: { id: true },
      });

      if (!existente) {
        await prisma.contactoCliente.create({
          data: {
            tenantId,
            clienteId: cliente.id,
            nome: dados.contacto.nome,
            cargo: dados.contacto.cargo ?? null,
            email: dados.contacto.email,
            telefone: dados.contacto.telefone,
            tipo: dados.contacto.tipo,
          },
        });
      }
    }

    // Segmentação
    if (dados.segmentacao) {
      await prisma.segmentacaoCliente.upsert({
        where: { clienteId: cliente.id },
        update: {
          segmento: dados.segmentacao.segmento,
          industria: dados.segmentacao.industria ?? null,
          potencialVendas: dados.segmentacao.potencialVendas,
          frequenciaCompra: dados.segmentacao.frequenciaCompra,
          ticketMedio: new Prisma.Decimal(dados.segmentacao.ticketMedio),
        },
        create: {
          tenantId,
          clienteId: cliente.id,
          segmento: dados.segmentacao.segmento,
          industria: dados.segmentacao.industria ?? null,
          tamanhoEmpresa: dados.segmentacao.tamanhoEmpresa ?? null,
          potencialVendas: dados.segmentacao.potencialVendas,
          frequenciaCompra: dados.segmentacao.frequenciaCompra,
          ticketMedio: new Prisma.Decimal(dados.segmentacao.ticketMedio),
        },
      });
    }

    console.log(`    ✓ ${dados.codigo} — ${dados.nome}`);
  }

  // Regras de comissão
  console.log('  [comercial] A criar regras de comissão...');
  for (const regra of REGRAS_SEED) {
    await prisma.regraComissao.upsert({
      where: {
        // Identificador por nome + tenant (sem @@unique, usa findFirst + upsert)
        id: (
          await prisma.regraComissao.findFirst({
            where: { tenantId, nome: regra.nome },
            select: { id: true },
          })
        )?.id ?? '__nonexistent__',
      },
      update: {
        percentualBase: new Prisma.Decimal(regra.percentualBase),
        descricao: regra.descricao,
      },
      create: {
        tenantId,
        nome: regra.nome,
        tipo: regra.tipo,
        vendedorId: null,
        categoriaId: null,
        percentualBase: new Prisma.Decimal(regra.percentualBase),
        percentualBonus: regra.percentualBonus != null
          ? new Prisma.Decimal(regra.percentualBonus)
          : null,
        valorMinimo: regra.valorMinimo != null
          ? new Prisma.Decimal(regra.valorMinimo)
          : null,
        valorMaximo: null,
        quantidadeMinima: null,
        metaPercentual: regra.metaPercentual != null
          ? new Prisma.Decimal(regra.metaPercentual)
          : null,
        dataInicio: null,
        dataFim: null,
        prioridade: regra.prioridade,
        descricao: regra.descricao,
        ativa: true,
      },
    });
    console.log(`    ✓ Regra: ${regra.nome}`);
  }

  console.log('  [comercial] Seed concluído.');
}
