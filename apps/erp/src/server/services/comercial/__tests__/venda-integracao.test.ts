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
 *
 * ADR-0041 (#306): a venda POS paga emite Factura-Recibo e lança na mesma transacção,
 * por isso o tenant é provisionado pelo `bootstrapContabilidade` real (PGC, diários,
 * séries — VENDA e FATURA_RECIBO incluídas —, Consumidor Final). O exercício e os
 * períodos nascem na primeira escrita contabilística (`resolverPeriodo`).
 * O `afterAll` apaga TUDO o que o tenant descartável deixou — corre contra a base local
 * dentro do `pnpm check`.
 */

// Carrega variáveis de ambiente do .env (necessário em vitest — não usa Next.js runtime)
import 'dotenv/config';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prismaBase } from '@/server/db/client';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { vendaService } from '@/server/services/comercial/index';
import { bootstrapContabilidade } from '@/server/provisioning/tenant-bootstrap';
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
    data: { id: USER_ID, tenantId: TENANT_ID, nome: 'Vendedor Teste', email: `vendedor-${Date.now()}@test.local`, keycloakSub: `kc-vendedor-${Date.now()}` },
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

  // 7. Contabilidade do tenant pelo bootstrap real: PGC, diários, séries (VENDA com
  //    prefixo VND e FATURA_RECIBO), Consumidor Final, DFC — ADR-0041.
  await prismaBase.$transaction((tx) => bootstrapContabilidade(tx, TENANT_ID), { timeout: 60_000 });

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
  const W = { where: { tenantId: TENANT_ID } };
  await prismaBase.historicoEstadoVenda.deleteMany(W);
  await prismaBase.itemVenda.deleteMany(W);
  await prismaBase.pagamentoVenda.deleteMany(W);
  await prismaBase.comissao.deleteMany(W); // FK Comissao→Venda
  await prismaBase.venda.deleteMany(W);
  await prismaBase.sessaoPOS.deleteMany(W);
  // Factura-Recibo e o seu lançamento (ADR-0041)
  await prismaBase.linhaFatura.deleteMany(W);
  await prismaBase.fatura.deleteMany(W);
  await prismaBase.partidaLancamento.deleteMany(W);
  await prismaBase.lancamento.deleteMany(W);
  await prismaBase.periodoContabil.deleteMany(W);
  await prismaBase.exercicioContabil.deleteMany(W);
  await prismaBase.movimentoCaixa.deleteMany(W);
  await prismaBase.sessaoCaixa.deleteMany(W);
  await prismaBase.serieDocumento.deleteMany(W);
  await prismaBase.movimentoStock.deleteMany(W);
  await prismaBase.saldoStock.deleteMany(W);
  await prismaBase.reservaStock.deleteMany(W);
  await prismaBase.localizacao.deleteMany(W);
  await prismaBase.produto.deleteMany(W);
  await prismaBase.categoriaProduto.deleteMany(W);
  // Resto do bootstrapContabilidade
  await prismaBase.cliente.deleteMany(W);
  await prismaBase.regraSugestaoLancamento.deleteMany(W);
  await prismaBase.contaNaturezaNotaDebito.deleteMany(W);
  await prismaBase.mapeamentoContaFluxo.deleteMany(W);
  await prismaBase.versaoMapeamentoFluxo.deleteMany(W);
  await prismaBase.rubricaFluxoCaixa.deleteMany(W);
  await prismaBase.diario.deleteMany(W);
  // ContaPGC é auto-referenciada (contaMaeId): folhas primeiro, do nível mais fundo para cima.
  const niveis = await prismaBase.contaPGC.findMany({ ...W, distinct: ['nivel'], select: { nivel: true } });
  for (const nivel of niveis.map((n) => n.nivel).sort((a, b) => b - a)) {
    await prismaBase.contaPGC.deleteMany({ where: { tenantId: TENANT_ID, nivel } });
  }
  await prismaBase.auditLog.deleteMany(W);
  await prismaBase.user.deleteMany(W);
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
