/**
 * Oráculo — issue #116: valores do formulário ignorados pelo servidor (compras e serviços).
 *
 * Contrato (decisão do orquestrador: alinhar schema Zod + serviço para gravar o que o formulário
 * envia; campos que o domínio não suporta saem do formulário). Escolhas conservadoras deste
 * verificador, que são contrato:
 *
 *   Códigos manuais (o schema de criação exige `codigo`, o formulário pede-o):
 *     - `fornecedorService.criar`, `servicoService.criarServico` e `servicoService.criarContrato`
 *       gravam EXACTAMENTE o `codigo` que recebem (depois do `Create*Schema.parse`, que é o que a
 *       action faz) — nunca o substituem por FOR-/SRV-/CTRT- automático;
 *     - código repetido no mesmo tenant é RECUSADO como erro de aplicação (AppError 4xx, nunca
 *       o P2002 cru que chega ao utilizador como «Erro interno») e nada é criado;
 *     - o mesmo código noutro tenant é aceite (a unicidade é por tenant).
 *
 *   Nomes reais:
 *     - `comprasService.criarRequisicao` grava `solicitanteId = ctx.userId` e
 *       `solicitanteNome = User.nome` do utilizador da sessão (nunca «Utilizador xxxx»);
 *     - `comprasService.registarRecebimento` grava `responsavelId = ctx.userId` e
 *       `responsavelNome = User.nome`.
 *
 *   Agendamento:
 *     - `servicoService.criarAgendamento` grava o `precoServico` e a `taxaIva` do formulário
 *       (não os do catálogo do serviço) e `total = (precoServico − desconto) × (1 + taxaIva)`,
 *       a 2 casas, coerente com o que gravou.
 *
 *   Categoria do serviço: `categoriaServicoId` enviado na criação é gravado e o detalhe expõe o
 *   `categoriaNome` (o formulário passa a ter o campo — provado no E2E 57).
 *   A percentagem formatada do detalhe («16%», não «0.16%») é provada no E2E 57.
 *
 * Sessão não é usada (serviços chamados dentro de `runWithTenantContext`); tudo é real: Postgres
 * efémero, `bootstrapContabilidade` (séries REQUISICAO_COMPRA e PEDIDO_COMPRA), serviços reais.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó B:compras-valores-ignorados-116; um agente de implementação que
 * o altere é BLOCKER.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => null) }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

describe.skipIf(skip)('Valores do formulário gravados pelo servidor (#116) — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let AppError: (typeof import('@/lib/errors'))['AppError'];
  // Acesso dinâmico: o que ainda não se comporta como o contrato falha o caso, não o ficheiro.
  let compras: Record<string, (...args: any[]) => Promise<any>>;
  let fornecedores: Record<string, (...args: any[]) => Promise<any>>;
  let servicos: Record<string, (...args: any[]) => Promise<any>>;
  let CreateFornecedorSchema: any;
  let CreateServicoSchema: any;
  let CreateContratoServicoSchema: any;
  let CreateAgendamentoServicoSchema: any;

  const sufixo = Date.now();
  const s4 = String(sufixo).slice(-6);
  const TENANT = `tenant-vi-116-${sufixo}`;
  const OUTRO = `tenant-vi-116-o-${sufixo}`;
  const USER = `user-vi-116-${sufixo}`;
  const USER_OUTRO = `user-vi-116-o-${sufixo}`;
  const NOME_USER = 'Joana Macuácua';
  const ctx = { tenantId: TENANT, userId: USER };
  const ctxOutro = { tenantId: OUTRO, userId: USER_OUTRO };

  let fornecedorId = '';
  let servicoCatalogoId = '';
  let categoriaId = '';

  const noCtx = <T>(c: typeof ctx, fn: () => Promise<T>) => runCtx(c, fn);

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  function recusadoComoRegra(err: any, oQue: string) {
    expect(err, `${oQue} foi aceite`).toBeDefined();
    expect(
      err instanceof AppError,
      `${oQue} rebentou fora da hierarquia AppError (chega ao utilizador como «Erro interno»): ${err?.code ?? ''} ${err?.message ?? err}`,
    ).toBe(true);
    expect([400, 409, 422], `${oQue}: estado HTTP ${err.status} não é de recusa do pedido`).toContain(err.status);
  }

  /** NUIT de 9 dígitos não repetidos, distinto por `n`. */
  const nuitDe = (n: number) => `4${String(sufixo + n).slice(-8)}`;

  function dadosFornecedor(codigo: string, n: number) {
    return CreateFornecedorSchema.parse({
      codigo,
      nome: `Fornecedor 116 ${n}`,
      tipo: 'PESSOA_JURIDICA',
      nuit: nuitDe(n),
      email: `for-116-${n}-${sufixo}@test.mz`,
    });
  }

  function dadosServico(codigo: string, extra: Record<string, unknown> = {}) {
    return CreateServicoSchema.parse({
      codigo,
      nome: `Serviço 116 ${codigo}`,
      preco: 2000,
      duracaoEstimada: 60,
      taxaIva: 0.16,
      ...extra,
    });
  }

  function dadosContrato(codigo: string) {
    return CreateContratoServicoSchema.parse({
      codigo,
      clienteId: `cliente-116-${sufixo}`,
      clienteNome: 'Cliente 116',
      servicosIds: [servicoCatalogoId],
      dataInicio: new Date(Date.UTC(2026, 0, 1, 10)),
      dataFim: new Date(Date.UTC(2026, 11, 31, 10)),
      valorMensal: 5000,
    });
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ AppError } = await import('@/lib/errors'));
    ({ comprasService: compras } = (await import('@/server/services/compras/compras.service')) as any);
    ({ fornecedorService: fornecedores } = (await import('@/server/services/compras/fornecedor.service')) as any);
    ({ servicoService: servicos } = (await import('@/server/services/compras/servico.service')) as any);
    ({ CreateFornecedorSchema } = (await import('@/lib/validations/fornecedores')) as any);
    ({ CreateServicoSchema, CreateContratoServicoSchema, CreateAgendamentoServicoSchema } = (await import(
      '@/lib/validations/servicos'
    )) as any);
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    const tenants = [
      [TENANT, `vi-116-${sufixo}`, `${sufixo}`.slice(-9)],
      [OUTRO, `vi-116-o-${sufixo}`, `${sufixo + 1}`.slice(-9)],
    ] as const;
    for (const [id, slug, nuit] of tenants) {
      await db.tenant.create({ data: { id, nome: `Tenant ${slug}`, slug, nuit } });
    }
    await db.user.create({ data: { id: USER, tenantId: TENANT, email: `${USER}@test.mz`, nome: NOME_USER, keycloakSub: `kc-${USER}` } });
    await db.user.create({
      data: { id: USER_OUTRO, tenantId: OUTRO, email: `${USER_OUTRO}@test.mz`, nome: 'Outro', keycloakSub: `kc-${USER_OUTRO}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    fornecedorId = (
      await db.fornecedor.create({
        data: {
          tenantId: TENANT,
          codigo: `FOR-BASE-116-${sufixo}`,
          nome: 'Papelaria 116 Lda',
          tipo: 'PESSOA_JURIDICA',
          nuit: nuitDe(90),
          email: `for-base-116-${sufixo}@test.mz`,
        },
      })
    ).id;

    categoriaId = (await db.categoriaServico.create({ data: { tenantId: TENANT, nome: `Manutenção 116 ${sufixo}` } })).id;

    servicoCatalogoId = (
      await db.servico.create({
        data: {
          tenantId: TENANT,
          codigo: `CAT-116-${sufixo}`,
          nome: 'Manutenção de ar condicionado',
          preco: '2000',
          taxaIva: '0.16',
          duracaoEstimada: 60,
        },
      })
    ).id;
  }, 180_000);

  // ===========================================================================
  // Códigos manuais
  // ===========================================================================

  it('fornecedor: grava o código do formulário; repetido no tenant é recusado e nada é criado; noutro tenant é aceite', async () => {
    const codigo = `FORN-MANUAL-${s4}`;
    const f = await noCtx(ctx, () => fornecedores.criar(dadosFornecedor(codigo, 1), ctx));
    expect(f.codigo, 'o código manual do fornecedor foi substituído pelo automático').toBe(codigo);
    const gravado = await db.fornecedor.findUnique({ where: { id: f.id } });
    expect(gravado.codigo).toBe(codigo);

    const antes = await db.fornecedor.count({ where: { tenantId: TENANT } });
    const err = await capturarErro(() => noCtx(ctx, () => fornecedores.criar(dadosFornecedor(codigo, 2), ctx)));
    recusadoComoRegra(err, 'fornecedor com código repetido');
    expect(await db.fornecedor.count({ where: { tenantId: TENANT } })).toBe(antes);

    const noOutro = await noCtx(ctxOutro, () => fornecedores.criar(dadosFornecedor(codigo, 3), ctxOutro));
    expect(noOutro.codigo).toBe(codigo);
  });

  it('serviço: grava o código do formulário e a categoria; repetido no tenant é recusado e nada é criado', async () => {
    const codigo = `SRV-MANUAL-${s4}`;
    const s = await noCtx(ctx, () => servicos.criarServico(dadosServico(codigo, { categoriaServicoId: categoriaId }), ctx));
    expect(s.codigo, 'o código manual do serviço foi substituído pelo automático').toBe(codigo);

    const gravado = await db.servico.findUnique({ where: { id: s.id } });
    expect(gravado.codigo).toBe(codigo);
    expect(gravado.categoriaServicoId, 'a categoria enviada não foi gravada').toBe(categoriaId);

    const detalhe = await noCtx(ctx, () => servicos.obterServico(s.id, ctx));
    expect(detalhe.categoriaServicoId).toBe(categoriaId);
    expect(detalhe.categoriaNome).toBe(`Manutenção 116 ${sufixo}`);
    expect(detalhe.taxaIva).toBeCloseTo(0.16, 6);

    const antes = await db.servico.count({ where: { tenantId: TENANT } });
    const err = await capturarErro(() => noCtx(ctx, () => servicos.criarServico(dadosServico(codigo), ctx)));
    recusadoComoRegra(err, 'serviço com código repetido');
    expect(await db.servico.count({ where: { tenantId: TENANT } })).toBe(antes);
  });

  it('contrato: grava o código do formulário; repetido no tenant é recusado e nada é criado', async () => {
    const codigo = `CTR-MANUAL-${s4}`;
    const c = await noCtx(ctx, () => servicos.criarContrato(dadosContrato(codigo), ctx));
    expect(c.codigo, 'o código manual do contrato foi substituído pelo automático').toBe(codigo);
    const gravado = await db.contratoServico.findUnique({ where: { id: c.id } });
    expect(gravado.codigo).toBe(codigo);

    const antes = await db.contratoServico.count({ where: { tenantId: TENANT } });
    const err = await capturarErro(() => noCtx(ctx, () => servicos.criarContrato(dadosContrato(codigo), ctx)));
    recusadoComoRegra(err, 'contrato com código repetido');
    expect(await db.contratoServico.count({ where: { tenantId: TENANT } })).toBe(antes);
  });

  // ===========================================================================
  // Agendamento: preço e IVA do formulário
  // ===========================================================================

  it('agendamento: grava o preço e a taxa de IVA do formulário (não os do catálogo) e o total coerente', async () => {
    const input = CreateAgendamentoServicoSchema.parse({
      servicoId: servicoCatalogoId,
      clienteId: `cliente-116-${sufixo}`,
      clienteNome: 'Cliente 116',
      clienteEmail: `cliente-116-${sufixo}@test.mz`,
      clienteTelefone: '+258 84 000 0116',
      dataAgendamento: new Date(Date.UTC(2026, 9, 20, 10)),
      horaInicio: '09:00',
      horaFim: '10:00',
      duracaoEstimada: 60,
      local: 'Escritório do cliente',
      endereco: 'Av. Julius Nyerere 116',
      cidade: 'Maputo',
      provincia: 'Maputo Cidade',
      precoServico: 1500,
      desconto: 100,
      taxaIva: 0.05,
    });
    const a = await noCtx(ctx, () => servicos.criarAgendamento(input, ctx));
    const gravado = await db.agendamentoServico.findUnique({ where: { id: a.id } });

    expect(Number(gravado.precoServico), 'o preço do formulário foi trocado pelo do catálogo').toBe(1500);
    expect(Number(gravado.taxaIva), 'a taxa de IVA do formulário não foi gravada').toBeCloseTo(0.05, 6);
    expect(Number(gravado.desconto)).toBe(100);
    // (1500 − 100) × 1,05 = 1470,00
    expect(Number(gravado.total), 'o total não foi calculado com o preço e o IVA do formulário').toBe(1470);

    expect(a.precoServico).toBe(1500);
    expect(a.taxaIva).toBeCloseTo(0.05, 6);
    expect(a.total).toBe(1470);
  });

  // ===========================================================================
  // Nomes reais
  // ===========================================================================

  it('requisição: o solicitante gravado é o utilizador da sessão, com o nome real', async () => {
    const req = await noCtx(ctx, () =>
      compras.criarRequisicao(
        {
          data: new Date(),
          departamento: 'Compras #116',
          prioridade: 'MEDIA',
          justificativa: `Requisição do oráculo #116 (${sufixo})`,
          itens: [{ descricao: 'Resma de papel A4', quantidade: 1, unidadeMedida: 'UN', precoEstimado: 300 }],
        },
        ctx,
      ),
    );
    const gravada = await db.requisicaoCompra.findUnique({ where: { id: req.id } });
    expect(gravada.solicitanteId).toBe(USER);
    expect(gravada.solicitanteNome, 'o solicitante foi gravado com um nome inventado').toBe(NOME_USER);
    expect(gravada.solicitanteNome).not.toMatch(/^Utilizador /);
  });

  it('recepção: o responsável gravado é o utilizador da sessão, com o nome real', async () => {
    const p = await noCtx(ctx, () =>
      compras.criarPedido(
        {
          fornecedorId,
          data: new Date(),
          condicoesPagamento: '30 dias',
          prazoEntregaDias: 10,
          dataEntregaPrevista: new Date(Date.now() + 10 * 24 * 3600 * 1000),
          enderecoEntrega: 'Av. 25 de Setembro, Maputo',
          itens: [
            { descricao: 'Serviço de montagem 116', quantidade: 2, unidadeMedida: 'UN', precoUnitario: 2500, desconto: 0, taxaIva: 0.16 },
          ],
        },
        ctx,
      ),
    );
    // O circuito do pedido não é o objecto deste oráculo: põe-se em trânsito directamente.
    await db.pedidoCompra.update({ where: { id: p.id }, data: { status: 'EM_TRANSITO' } });
    const item = await db.itemPedidoCompra.findFirst({ where: { pedidoCompraId: p.id } });

    await noCtx(ctx, () =>
      compras.registarRecebimento(
        {
          pedidoCompraId: p.id,
          data: new Date(),
          numeroDocumento: `GR-116-${sufixo}`,
          itens: [
            {
              itemPedidoCompraId: item.id,
              // Item sem produto não lê a localização.
              localizacaoDestinoId: `cloc116nada${sufixo}`,
              quantidadeRecebida: 1,
              quantidadeAceita: 1,
              quantidadeRejeitada: 0,
            },
          ],
        },
        ctx,
      ),
    );
    const rec = await db.recebimentoCompra.findFirst({ where: { pedidoCompraId: p.id } });
    expect(rec, 'a recepção não foi gravada').toBeTruthy();
    expect(rec.responsavelId).toBe(USER);
    expect(rec.responsavelNome, 'o responsável da recepção foi gravado com um nome inventado').toBe(NOME_USER);
    expect(rec.responsavelNome).not.toMatch(/^Utilizador /);
  });
});
