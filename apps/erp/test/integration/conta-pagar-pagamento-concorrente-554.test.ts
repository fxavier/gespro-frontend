/**
 * Teste de integração — Pagamento de conta a pagar: corrida (#554)
 *
 * Dois `contaPagarService.registarPagamento` simultâneos de 1000 sobre a mesma conta
 * de 1000 têm de produzir UM só pagamento: um passa, o outro é recusado
 * (`PAGAMENTO_EXCEDIDO` ou `ESTADO_INVALIDO`). Sem tranca na `ContaPagar`, os dois
 * leem `valorRestante = 1000`, só se serializam na série (`proximoNumeroSerie`) e o
 * segundo prossegue com a leitura antiga: 2 pagamentos, 2 lançamentos D 421, e a
 * conta fica `valorPago = 1000` (actualização perdida).
 *
 * A corrida repete-se em RONDAS (uma conta nova por ronda) para que o resultado não
 * dependa de um único entrelaçamento. Molde: `lancamento-estorno-concorrente.test.ts`.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true ou sem INTEGRATION_DB_URL → saltado.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

const RONDAS = 6;

describe.skipIf(skip)('#554 — registarPagamento de conta a pagar — corrida', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let svc: any; // contaPagarService

  const sufixo = Date.now();
  const TENANT = `tenant-cp554-${sufixo}`;
  const USER = `user-cp554-${sufixo}`;
  const CTX = { tenantId: TENANT, userId: USER };
  let fornecedorId: string;
  let contaBancariaId: string;

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ contaPagarService: svc } = await import('@/server/services/compras/conta-pagar.service'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({ data: { id: TENANT, nome: 'Tenant CP 554', slug: `cp554-${sufixo}`, nuit: `${sufixo}`.slice(-9) } });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `${USER}@test.mz`, nome: 'Financeiro', keycloakSub: `kc-${USER}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const f = await db.fornecedor.create({
      data: {
        tenantId: TENANT,
        codigo: `FOR-554-${sufixo}`,
        nome: 'Fornecedor Credor',
        tipo: 'PESSOA_JURIDICA',
        nuit: '400000554',
        email: `for-554-${sufixo}@test.mz`,
      },
    });
    fornecedorId = f.id;

    const pgc123 = await db.contaPGC.findFirst({ where: { tenantId: TENANT, codigo: '123' } });
    expect(pgc123, 'ContaPGC 123 no bootstrap').not.toBeNull();
    const cb = await db.contaBancaria.create({
      data: {
        tenantId: TENANT, banco: 'Banco 554', agencia: '0001', numeroConta: `CORR-554-${sufixo}`,
        tipoConta: 'CORRENTE', contaContabilId: pgc123.id, ativo: true,
      },
    });
    contaBancariaId = cb.id;
  }, 180_000);

  async function contaAberta(ronda: number): Promise<string> {
    const agora = new Date();
    const c = await db.contaPagar.create({
      data: {
        tenantId: TENANT,
        numero: `CP-554-${sufixo}-${ronda}`,
        fornecedorId,
        descricao: `Conta 554 ronda ${ronda}`,
        valorOriginal: '1000',
        valorPago: '0',
        valorRestante: '1000',
        dataEmissao: agora,
        dataVencimento: new Date(agora.getTime() + 30 * 86_400_000),
        status: 'ABERTA',
      },
    });
    return c.id;
  }

  const pagar1000 = (contaPagarId: string) =>
    runCtx(CTX, () =>
      svc.registarPagamento(
        {
          contaPagarId,
          valor: 1000,
          dataPagamento: new Date(),
          formaPagamento: 'TRANSFERENCIA_BANCARIA',
          contaBancariaId,
        },
        CTX,
      ),
    );

  it(
    'corrida: dois pagamentos de 1000 numa conta de 1000 — um passa, o outro é recusado, nada em duplicado',
    async () => {
      for (let ronda = 1; ronda <= RONDAS; ronda++) {
        const contaId = await contaAberta(ronda);

        const resultados = await Promise.allSettled([pagar1000(contaId), pagar1000(contaId)]);

        const pagamentos = await db.pagamento.findMany({ where: { tenantId: TENANT, contaPagarId: contaId } });
        const somaPagamentos = pagamentos.reduce((s: number, p: any) => s + Number(String(p.valor)), 0);
        const conta = await db.contaPagar.findFirst({ where: { id: contaId, tenantId: TENANT } });

        // A afirmação que decide: o fornecedor não pode receber duas vezes.
        expect(pagamentos, `ronda ${ronda}: pagamentos gravados`).toHaveLength(1);
        expect(somaPagamentos, `ronda ${ronda}: Σ Pagamento.valor`).toBeCloseTo(1000, 2);
        expect(Number(String(conta.valorPago)), `ronda ${ronda}: valorPago`).toBeCloseTo(somaPagamentos, 2);
        expect(Number(String(conta.valorRestante)), `ronda ${ronda}: valorRestante`).toBeCloseTo(0, 2);
        expect(conta.status, `ronda ${ronda}: estado`).toBe('PAGA');

        const partidas421 = await db.partidaLancamento.count({
          where: {
            tenantId: TENANT,
            tipo: 'DEBITO',
            conta: { codigo: '421' },
            lancamento: { origem: 'PAGAMENTO', documentoOrigemId: { in: pagamentos.map((p: any) => p.id) } },
          },
        });
        const lancamentos = await db.lancamento.count({
          where: { tenantId: TENANT, origem: 'PAGAMENTO', documentoOrigemId: { in: pagamentos.map((p: any) => p.id) } },
        });
        expect(lancamentos, `ronda ${ronda}: lançamentos de pagamento`).toBe(1);
        expect(partidas421, `ronda ${ronda}: débitos na 421`).toBe(1);

        const cumpridos = resultados.filter((r) => r.status === 'fulfilled');
        const rejeitados = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        expect(cumpridos, `ronda ${ronda}: pedidos que passaram`).toHaveLength(1);
        expect(rejeitados, `ronda ${ronda}: pedidos recusados`).toHaveLength(1);
        expect(rejeitados[0].reason).toMatchObject({ name: 'BusinessRuleError' });
        expect(['PAGAMENTO_EXCEDIDO', 'ESTADO_INVALIDO']).toContain(rejeitados[0].reason.code);
      }
    },
    180_000,
  );
});
