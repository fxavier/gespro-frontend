/**
 * Teste de integração — Venda POS (WS C, Wave 3)
 *
 * Requer DB PostgreSQL activo (DATABASE_URL em .env).
 * Usa um tenantId único por execução para evitar conflitos com dados de produção.
 *
 * Asserts:
 *   (a) SaldoStock decrementado após venda POS
 *   (b) MovimentoCaixa criado com o valor total da venda
 *   (c) Venda.numero gerado pelo proximoNumeroSerie (sequencial, sem Date.now)
 */

// Carrega variáveis de ambiente do .env (necessário em vitest — não usa Next.js runtime)
import 'dotenv/config';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prismaBase } from '@/server/db/client';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { vendaService } from '@/server/services/comercial/index';
import type { CreateVendaInput } from '@/lib/validations/vendas';

// ---------------------------------------------------------------------------
// IDs de teste (únicos por execução para isolamento)
// ---------------------------------------------------------------------------

const TENANT_ID = `test-tenant-${Date.now()}`;
const USER_ID = `test-user-${Date.now()}`;
const CTX = { tenantId: TENANT_ID, userId: USER_ID };

let produtoId: string;
let localizacaoId: string;
let sessaoCaixaId: string;
const SALDO_INICIAL = 100;

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(async () => {
  // 1. Tenant
  await prismaBase.tenant.create({
    data: { id: TENANT_ID, nome: 'Tenant de Teste WS-C', slug: `test-wsc-${Date.now()}`, nuit: `${Date.now()}`.slice(0, 9) },
  });

  // 2. User
  await prismaBase.user.create({
    data: { id: USER_ID, tenantId: TENANT_ID, nome: 'Vendedor Teste', email: `vendedor-${Date.now()}@test.local`, passwordHash: 'test' },
  });

  // 3. Categoria de produto
  const categoria = await prismaBase.categoriaProduto.create({
    data: { tenantId: TENANT_ID, nome: 'Categoria Teste' },
  });

  // 4. Produto
  const produto = await prismaBase.produto.create({
    data: {
      tenantId: TENANT_ID,
      sku: `SKU-TEST-${Date.now()}`,
      nome: 'Produto de Teste',
      categoriaId: categoria.id,
      unidadeMedida: 'UN',
      precoVenda: 1000,
      precoCompra: 700,
      margemLucro: 0.3,
      taxaIva: 0.16,
    },
  });
  produtoId = produto.id;

  // 5. Localização (ARMAZEM)
  const loc = await prismaBase.localizacao.create({
    data: {
      tenantId: TENANT_ID,
      codigo: `ARM-TEST-${Date.now()}`,
      nome: 'Armazém Teste',
      tipo: 'ARMAZEM',
      ativa: true,
    },
  });
  localizacaoId = loc.id;

  // 6. SaldoStock inicial
  await prismaBase.saldoStock.create({
    data: {
      tenantId: TENANT_ID,
      produtoId,
      varianteProdutoId: '',
      localizacaoId,
      saldo: SALDO_INICIAL,
      saldoReservado: 0,
    },
  });

  // 7. SerieDocumento para VENDA
  await prismaBase.serieDocumento.create({
    data: {
      tenantId: TENANT_ID,
      tipo: 'VENDA' as never,
      prefixo: 'VND',
      ano: new Date().getFullYear(),
      formatoNumero: '{prefixo}/{ano}/{numero:06}',
      ativo: true,
    },
  });

  // 8. SessaoCaixa aberta
  const sessao = await prismaBase.sessaoCaixa.create({
    data: {
      tenantId: TENANT_ID,
      responsavelId: USER_ID,
      numero: `SC-TEST-${Date.now()}`,
      fundoInicial: 5000,
      status: 'ABERTA',
    },
  });
  sessaoCaixaId = sessao.id;
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterAll(async () => {
  // Deletar em ordem de dependência (FK sem cascade explícito)
  await prismaBase.historicoEstadoVenda.deleteMany({ where: { tenantId: TENANT_ID } });
  await prismaBase.itemVenda.deleteMany({ where: { tenantId: TENANT_ID } });
  await prismaBase.pagamentoVenda.deleteMany({ where: { tenantId: TENANT_ID } });
  await prismaBase.comissao.deleteMany({ where: { tenantId: TENANT_ID } }); // FK Comissao→Venda
  await prismaBase.venda.deleteMany({ where: { tenantId: TENANT_ID } });
  await prismaBase.movimentoCaixa.deleteMany({ where: { tenantId: TENANT_ID } });
  await prismaBase.sessaoCaixa.deleteMany({ where: { tenantId: TENANT_ID } });
  await prismaBase.serieDocumento.deleteMany({ where: { tenantId: TENANT_ID } });
  await prismaBase.movimentoStock.deleteMany({ where: { tenantId: TENANT_ID } });
  await prismaBase.saldoStock.deleteMany({ where: { tenantId: TENANT_ID } });
  await prismaBase.reservaStock.deleteMany({ where: { tenantId: TENANT_ID } });
  await prismaBase.localizacao.deleteMany({ where: { tenantId: TENANT_ID } });
  await prismaBase.produto.deleteMany({ where: { tenantId: TENANT_ID } });
  await prismaBase.categoriaProduto.deleteMany({ where: { tenantId: TENANT_ID } });
  await prismaBase.user.deleteMany({ where: { tenantId: TENANT_ID } });
  await prismaBase.tenant.delete({ where: { id: TENANT_ID } });
});

// ---------------------------------------------------------------------------
// Testes de integração
// ---------------------------------------------------------------------------

describe('VendaService — integração real (POS)', () => {
  it('(a) SaldoStock é decrementado após venda POS', async () => {
    const QUANTIDADE = 2;
    const input: CreateVendaInput = {
      origem: 'POS',
      vendedorId: USER_ID,
      sessaoCaixaId,
      localizacaoOrigemId: localizacaoId,
      itens: [
        {
          produtoId,
          nomeProduto: 'Produto de Teste',
          quantidade: QUANTIDADE,
          precoUnitario: 1000,
          desconto: 0,
          taxaIva: 0.16,
        },
      ],
      pagamentos: [{ tipo: 'DINHEIRO', valor: 2320 }],
    };

    await runWithTenantContext(CTX, async () => {
      await vendaService.criar(input, CTX);
    });

    const saldo = await prismaBase.saldoStock.findUnique({
      where: {
        tenantId_produtoId_varianteProdutoId_localizacaoId: {
          tenantId: TENANT_ID,
          produtoId,
          varianteProdutoId: '',
          localizacaoId,
        },
      },
      select: { saldo: true },
    });

    expect(Number(saldo?.saldo?.toString())).toBe(SALDO_INICIAL - QUANTIDADE);
  });

  it('(b) MovimentoCaixa criado com o valor total da venda', async () => {
    // Calcula o total esperado: 1000 * 1 * (1 - 0) * (1 + 0.16) = 1160
    const QUANTIDADE = 1;
    const PRECO = 1000;
    const IVA = 0.16;
    const totalEsperado = PRECO * QUANTIDADE * (1 + IVA); // 1160

    const input: CreateVendaInput = {
      origem: 'POS',
      vendedorId: USER_ID,
      sessaoCaixaId,
      localizacaoOrigemId: localizacaoId,
      itens: [
        {
          produtoId,
          nomeProduto: 'Produto de Teste',
          quantidade: QUANTIDADE,
          precoUnitario: PRECO,
          desconto: 0,
          taxaIva: IVA,
        },
      ],
      pagamentos: [{ tipo: 'DINHEIRO', valor: totalEsperado }],
    };

    let vendaId: string | undefined;
    await runWithTenantContext(CTX, async () => {
      const venda = await vendaService.criar(input, CTX);
      vendaId = venda.id;
    });

    const movimentos = await prismaBase.movimentoCaixa.findMany({
      where: { tenantId: TENANT_ID, sessaoCaixaId, documentoOrigemId: vendaId, tipo: 'VENDA' },
      select: { valor: true },
    });

    expect(movimentos).toHaveLength(1);
    expect(Number(movimentos[0].valor.toString())).toBeCloseTo(totalEsperado, 2);
  });

  it('(c) Venda.numero é sequencial e segue o formato da SerieDocumento', async () => {
    const input: CreateVendaInput = {
      origem: 'POS',
      vendedorId: USER_ID,
      sessaoCaixaId,
      localizacaoOrigemId: localizacaoId,
      itens: [
        {
          produtoId,
          nomeProduto: 'Produto de Teste',
          quantidade: 1,
          precoUnitario: 500,
          desconto: 0,
          taxaIva: 0.16,
        },
      ],
      pagamentos: [{ tipo: 'DINHEIRO', valor: 580 }],
    };

    let venda1: Awaited<ReturnType<typeof vendaService.criar>>;
    let venda2: Awaited<ReturnType<typeof vendaService.criar>>;

    await runWithTenantContext(CTX, async () => {
      venda1 = await vendaService.criar(input, CTX);
      venda2 = await vendaService.criar(input, CTX);
    });

    // O formato é VND/{ano}/{numero:06}
    const ano = new Date().getFullYear();
    expect(venda1!.numero).toMatch(new RegExp(`^VND/${ano}/\\d{6}$`));
    expect(venda2!.numero).toMatch(new RegExp(`^VND/${ano}/\\d{6}$`));

    // Os números são sequenciais (incrementam 1)
    const num1 = parseInt(venda1!.numero.split('/')[2], 10);
    const num2 = parseInt(venda2!.numero.split('/')[2], 10);
    expect(num2).toBe(num1 + 1);
  });
});
