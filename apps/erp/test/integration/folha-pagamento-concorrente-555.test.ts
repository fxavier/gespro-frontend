/**
 * Teste de integração — Folha de pagamento: corridas (#555)
 *
 * `marcarProcessada` e `marcarPaga` liam a `FolhaPagamento` sem tranca e terminavam com
 * `update` incondicional; `cancelar` lia, estornava e actualizava fora de uma só
 * transacção. Dois pedidos simultâneos liam ambos o estado antigo e escreviam ambos:
 *   (a) duplo «Processar» → dois lançamentos da massa salarial, o primeiro órfão;
 *   (b) duplo «Pagar» em numerário → dois D 4622 / C 111 e duas saídas de caixa;
 *   (c) `cancelar` contra `marcarPaga` → folha CANCELADA com pagamento lançado.
 *
 * Contrato: em cada corrida um pedido passa e o outro é recusado com
 * `TRANSICAO_INVALIDA`; o estado final é coerente com o vencedor.
 *
 * A corrida repete-se em RONDAS (uma folha nova por ronda, um mês de referência por
 * folha) para que o resultado não dependa de um único entrelaçamento.
 *
 * Setup no molde de `payroll-pagar-folha.test.ts` (#96).
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true ou sem INTEGRATION_DB_URL → saltado.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

const RONDAS = 4;
const ANO_REF = 2025;

describe.skipIf(skip)('Folha de pagamento — corridas (#555)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let svc: any;

  const sufixo = Date.now();
  const TENANT = `tenant-folha-conc-${sufixo}`;
  const USER = `user-folha-conc-${sufixo}`;
  const ctx = {
    tenantId: TENANT,
    userId: USER,
    permissions: new Set(['rh:payroll:pagar', 'caixa:operar', 'financas:banca:escrita']),
  };

  let folhas = 0;

  const run = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  async function folhaPendente(): Promise<string> {
    const n = folhas++;
    const r: any = await run(() => svc.processarFolhaMes({ mes: (n % 12) + 1, ano: ANO_REF + Math.floor(n / 12) }, ctx));
    return r.folhaId;
  }

  async function folhaProcessada(): Promise<string> {
    const id = await folhaPendente();
    await run(() => svc.marcarProcessada(id, ctx));
    return id;
  }

  const pagar = (folhaId: string) =>
    run(() => svc.marcarPaga({ folhaId, dataPagamento: new Date(), formaPagamento: 'NUMERARIO' }, ctx));

  /** Um passa, o outro é recusado por `TRANSICAO_INVALIDA`. Devolve o índice do vencedor. */
  function umVenceOutroRecusa(rs: PromiseSettledResult<unknown>[], rotulo: string): number {
    const ok = rs.filter((r) => r.status === 'fulfilled');
    const ko = rs.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok, `${rotulo}: ${ko.map((r) => r.reason?.code ?? r.reason?.message).join(', ')}`).toHaveLength(1);
    expect(ko[0].reason?.code, `${rotulo}: ${ko[0].reason?.message}`).toBe('TRANSICAO_INVALIDA');
    return rs.findIndex((r) => r.status === 'fulfilled');
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    ({ PayrollService: svc } = await import('@/server/services/pessoas-projetos/payroll.service'));
    const caixa = await import('@/server/services/financas/caixa.service');
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({
      data: { id: TENANT, nome: 'Tenant Folha Concorrente', slug: `folha-conc-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `${USER}@test.mz`, nome: 'RH', keycloakSub: `kc-${USER}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    await db.tabelaINSS.create({
      data: { tenantId: TENANT, vigenciaInicio: new Date(Date.UTC(2018, 0, 1)), taxaTrabalhador: '0.03', taxaEntidade: '0.04', tetoIncidencia: null },
    });
    await db.escalaoIRPS.create({
      data: {
        tenantId: TENANT, vigenciaInicio: new Date(Date.UTC(2020, 0, 1)), ordem: 1,
        limiteInferior: '0', limiteSuperior: null, taxa: '0.10', parcelaAbater: '0', numeroDependentes: 0,
      },
    });
    await db.colaborador.create({
      data: {
        tenantId: TENANT, codigo: 'FC1', nome: 'Colaborador FC1',
        dataNascimento: new Date(Date.UTC(1990, 0, 1)), genero: 'MASCULINO', estadoCivil: 'SOLTEIRO',
        nacionalidade: 'Moçambicana', naturalidadeProvincia: 'Maputo', naturalidadeDistrito: 'KaMpfumo',
        bi: `BIFC1${sufixo}`, nuit: `FC1-${sufixo}`, email: `fc1-${sufixo}@test.mz`, telefone: '840000000',
        enderecoRua: 'Av. 24 de Julho', enderecoNumero: '1', enderecoBairro: 'Polana',
        enderecoCidade: 'Maputo', enderecoProvincia: 'Maputo',
        emergenciaNome: 'Contacto', emergenciaParentesco: 'Irmão', emergenciaTelefone: '840000001',
        dataAdmissao: new Date(Date.UTC(2020, 0, 1)), status: 'ACTIVO', tipoContrato: 'EFECTIVO',
        regimeTrabalho: 'TEMPO_INTEGRAL', salarioBase: '10000', nivelAcesso: 'USUARIO',
      },
    });
    await run(() => caixa.abrirSessao({ fundoInicial: 1000 }, ctx));
    // Aquecimento: o primeiro lançamento cria o exercício e o período correntes. Sem ele,
    // a ronda 1 de (a) corre também contra o `upsert` do exercício (P2002), que não é #555.
    await folhaProcessada();
  }, 180_000);

  it('(a) duas marcarProcessada concorrentes → um lançamento da massa salarial, a outra TRANSICAO_INVALIDA', async () => {
    for (let ronda = 1; ronda <= RONDAS; ronda++) {
      const folhaId = await folhaPendente();
      const rs = await Promise.allSettled([
        run(() => svc.marcarProcessada(folhaId, ctx)),
        run(() => svc.marcarProcessada(folhaId, ctx)),
      ]);
      const venc = umVenceOutroRecusa(rs, `ronda ${ronda}`);

      const ls = await db.lancamento.findMany({ where: { tenantId: TENANT, documentoOrigemId: folhaId } });
      expect(ls, `ronda ${ronda}: lançamentos da folha`).toHaveLength(1);
      const f = await db.folhaPagamento.findFirst({ where: { id: folhaId } });
      expect(f.status).toBe('PROCESSADO');
      expect(f.lancamentoId, `ronda ${ronda}: a folha guarda o único lançamento`).toBe(ls[0].id);
      expect((rs[venc] as PromiseFulfilledResult<any>).value.lancamentoId).toBe(ls[0].id);
    }
  }, 120_000);

  it('(b) duas marcarPaga concorrentes em numerário → um lançamento de pagamento e um MovimentoCaixa', async () => {
    for (let ronda = 1; ronda <= RONDAS; ronda++) {
      const folhaId = await folhaProcessada();
      const rs = await Promise.allSettled([pagar(folhaId), pagar(folhaId)]);
      umVenceOutroRecusa(rs, `ronda ${ronda}`);

      const pags = await db.lancamento.findMany({
        where: { tenantId: TENANT, documentoOrigemId: folhaId, origem: 'PAGAMENTO' },
      });
      expect(pags, `ronda ${ronda}: lançamentos de pagamento`).toHaveLength(1);
      const movs = await db.movimentoCaixa.findMany({ where: { documentoOrigemId: folhaId } });
      expect(movs, `ronda ${ronda}: movimentos de caixa`).toHaveLength(1);
      const f = await db.folhaPagamento.findFirst({ where: { id: folhaId } });
      expect(f.status).toBe('PAGO');
      expect(f.lancamentoPagamentoId).toBe(pags[0].id);
    }
  }, 120_000);

  it('(c) cancelar concorrente com marcarPaga → nunca CANCELADO com pagamento lançado', async () => {
    for (let ronda = 1; ronda <= RONDAS; ronda++) {
      const folhaId = await folhaProcessada();
      const rs = await Promise.allSettled([
        run(() => svc.cancelar(folhaId, `corrida ${ronda}`, ctx)),
        pagar(folhaId),
      ]);
      const venc = umVenceOutroRecusa(rs, `ronda ${ronda}`);

      const f = await db.folhaPagamento.findFirst({ where: { id: folhaId } });
      const massa = await db.lancamento.findFirst({ where: { id: f.lancamentoId } });
      const pags = await db.lancamento.findMany({
        where: { tenantId: TENANT, documentoOrigemId: folhaId, origem: 'PAGAMENTO' },
      });
      const movs = await db.movimentoCaixa.findMany({ where: { documentoOrigemId: folhaId } });
      const ps = await db.payroll.findMany({ where: { folhaId } });

      if (venc === 0) {
        expect(f.status, `ronda ${ronda}`).toBe('CANCELADO');
        expect(pags, `ronda ${ronda}: CANCELADO com pagamento lançado`).toHaveLength(0);
        expect(movs, `ronda ${ronda}: CANCELADO com saída de caixa`).toHaveLength(0);
        expect(massa.status, `ronda ${ronda}: massa salarial estornada`).toBe('ESTORNADO');
        expect(ps.every((p: any) => p.status === 'CANCELADO')).toBe(true);
      } else {
        expect(f.status, `ronda ${ronda}`).toBe('PAGO');
        expect(pags).toHaveLength(1);
        expect(movs).toHaveLength(1);
        expect(massa.status, `ronda ${ronda}: folha paga com massa salarial estornada`).toBe('LANCADO');
        expect(ps.every((p: any) => p.status === 'PAGO')).toBe(true);
      }
    }
  }, 120_000);
});
