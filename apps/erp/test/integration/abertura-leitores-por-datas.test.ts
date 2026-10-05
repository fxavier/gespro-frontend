/**
 * Oráculo P2 (run exercicio-followups, issue #363 prefactor, ADR-0035 §6) — os leitores de
 * saldos POR DATAS não contam o lançamento de abertura (diário ABERTURA) nem o período 13;
 * as vistas POR PERÍODO usam o AB; o «tem AB» é efectivo; diários reservados recusam o
 * lançamento manual.
 *
 * Porquê: o AB de N+1 RE-AFIRMA, à data de início de N+1, saldos que já estão no razão (os
 * lançamentos de N). Um leitor que soma «tudo com data ≤ X» conta-os duas vezes.
 *
 * Contrato (decisões do orquestrador, `.scratch/sdlc/exercicio-followups/RUN.md`):
 *   - Leitores por DATAS excluem fecho e abertura (período 13 e diário ABERTURA) por um
 *     predicado único: gerarBalancete (→ DFC), razaoConta (datas), obterContaDetalhe,
 *     saldoContabilAte, projeção saldoTesourariaAte, reconciliação saldoRazao, importação
 *     (partidas do banco), apurarIva (agregação e 4438).
 *   - Emenda pós-P3: a exclusão por datas é do AB AUTOMÁTICO — diário ABERTURA com
 *     `documentoOrigemTipo = 'ExercicioContabil'` (origem = exercício anterior). Um AB manual
 *     (sem essa origem, legado) conta sempre, em qualquer exercício. A exclusão cobre também os
 *     ESTORNOS do AB automático (`lancamentoEstornoId` aponta para um AB automático).
 *   - «Tem AB» = lançamento LANCADO no diário AB do exercício, não estornado e não estorno.
 *   - Lançamento manual: diário EN recusado (`DIARIO_DE_ENCERRAMENTO`); diário AB só no
 *     primeiro exercício do tenant, sem anterior (`ABERTURA_AUTOMATICA`).
 *
 * Dados (cada tenant montado pelos serviços reais; o AB por inserção crua — o gerador do AB
 * é a P3 e ainda não existe; o `gate-periodo` só varre src/ e prisma/, precedente
 * `apuramento-iva-reproducibilidade.test.ts`):
 *   2026  L1 02-10 111 D1000 / 521 C1000 · L2 03-10 121 D2000 / 521 C2000
 *         L3 04-10 4438 D300 / 121 C300
 *         ⇒ fecho: 111 = 1000 D · 121 = 1700 D · 4438 = 300 D · 521 = 3000 C
 *   2027  AB  01-01 00:00 Maputo (dataInicio de 2027, período 1, diário ABERTURA, LANCADO):
 *               111 D1000 · 121 D1700 · 4438 D300 / 521 C3000
 *         M1 03-10 111 D200 / 711 C200 · M2 04-10 121 D400 / 711 C400
 *   Conta bancária activa no 121 (projeção e reconciliação).
 *
 * Valores esperados = os do razão SEM a dupla contagem do AB.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo autor do oráculo; um agente de implementação que o altere é BLOCKER.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Prisma } from '@prisma/client';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

type AnyDb = any;
type Ctx = { tenantId: string; userId: string };

const dec = (v: unknown) => new Prisma.Decimal(String(v ?? 0));
const f2 = (v: unknown) => dec(v).toFixed(2);

const CODIGOS = ['111', '121', '4435', '4437', '4438', '44331', '521', '711'] as const;
type Codigo = (typeof CODIGOS)[number];

/** Instantes de dias civis de Maputo. */
const inicioDia = (d: string) => new Date(`${d}T00:00:00.000+02:00`);
const fimDia = (d: string) => new Date(`${d}T23:59:59.999+02:00`);

describe.skipIf(skip)('Leitores por datas imunes ao lançamento de abertura (#363) — DB efémera', () => {
  let db: AnyDb;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let contab: typeof import('@/server/services/financas/contabilidade.service');
  let val: typeof import('@/lib/validations/contabilidade');
  let bootstrapContabilidade: (typeof import('@/server/provisioning/tenant-bootstrap'))['bootstrapContabilidade'];

  const TS = Date.now();
  let seq = 0;

  interface Tenant {
    ctx: Ctx;
    conta: Record<Codigo, string>;
    ex26: string;
    ex27: string;
    /** id do lançamento de abertura de 2027 (quando montado). */
    abId?: string;
    /** id da partida do AB no 121 (quando montado). */
    abPartida121?: string;
    contaBancariaId?: string;
  }

  const comCtx = <T>(t: Tenant, fn: () => Promise<T>) => runCtx(t.ctx, fn);

  async function novoTenant(): Promise<Tenant> {
    seq += 1;
    const tenantId = `tenant-ab-${TS}-${seq}`;
    const userId = `user-ab-${TS}-${seq}`;
    const slug = `ab-${TS}-${seq}`;
    await db.tenant.create({
      data: { id: tenantId, nome: `Tenant ${slug}`, slug, nuit: `${String(TS).slice(-7)}${String(seq).padStart(2, '0')}` },
    });
    await db.user.create({
      data: { id: userId, tenantId, email: `${slug}@test.mz`, nome: 'Contabilista', keycloakSub: `kc-${slug}` },
    });
    await db.$transaction((tx: AnyDb) => bootstrapContabilidade(tx, tenantId), { timeout: 60_000 });

    const contas = await db.contaPGC.findMany({
      where: { tenantId, codigo: { in: [...CODIGOS] } },
      select: { id: true, codigo: true, aceitaLancamento: true },
    });
    const conta = {} as Record<Codigo, string>;
    for (const c of contas) {
      expect(c.aceitaLancamento, `pré-condição: ${c.codigo} aceita lançamento`).toBe(true);
      conta[c.codigo as Codigo] = c.id;
    }
    expect(Object.keys(conta).sort()).toEqual([...CODIGOS].sort());

    const ctx = { tenantId, userId };
    // 2026 primeiro (sem anterior), depois 2027 (anterior = 2026), pelo serviço real.
    await runCtx(ctx, () => contab.abrirExercicio({ ano: 2026 }, ctx));
    await runCtx(ctx, () => contab.abrirExercicio({ ano: 2027 }, ctx));
    const exs = await db.exercicioContabil.findMany({ where: { tenantId }, select: { id: true, codigo: true, anteriorId: true } });
    const ex26 = exs.find((e: any) => e.codigo === '2026');
    const ex27 = exs.find((e: any) => e.codigo === '2027');
    expect(ex26.anteriorId, 'pré-condição: 2026 é o primeiro exercício').toBeNull();
    expect(ex27.anteriorId, 'pré-condição: 2027 encadeia em 2026').toBe(ex26.id);
    return { ctx, conta, ex26: ex26.id, ex27: ex27.id };
  }

  let doc = 0;
  async function lancar(t: Tenant, data: string, partidas: Array<[Codigo, 'DEBITO' | 'CREDITO', string]>) {
    return comCtx(t, () =>
      db.$transaction((tx: AnyDb) =>
        contab.registarLancamentoContabilistico(
          tx,
          {
            data: new Date(data),
            diarioTipo: 'OPERACOES',
            origem: 'AJUSTE',
            documentoOrigemId: `doc-ab-${++doc}`,
            documentoOrigemTipo: 'TesteAbertura',
            historico: `Teste abertura ${partidas.map((p) => `${p[0]} ${p[1][0]}${p[2]}`).join(' / ')}`,
            partidas: partidas.map(([contaCodigo, tipo, valor]) => ({ contaCodigo, tipo, valor })),
          },
          t.ctx,
        ),
      ),
    );
  }

  /**
   * Lançamento de abertura de 2027, LANCADO, no diário ABERTURA, período 1, data = dataInicio
   * do exercício. Inserção CRUA só no setup: o gerador do AB é a P3 e não existe ainda.
   */
  async function inserirAbertura(
    t: Tenant,
    partidas: Array<[Codigo, 'DEBITO' | 'CREDITO', string]>,
    { automatica = true }: { automatica?: boolean } = {},
  ) {
    const diario = await db.diario.findFirst({ where: { tenantId: t.ctx.tenantId, tipo: 'ABERTURA' } });
    const ex = await db.exercicioContabil.findFirst({ where: { id: t.ex27, tenantId: t.ctx.tenantId } });
    const p1 = await db.periodoContabil.findFirst({ where: { tenantId: t.ctx.tenantId, exercicioId: t.ex27, ordem: 1 } });
    const debitos = partidas.filter((p) => p[1] === 'DEBITO').reduce((a, p) => a.plus(dec(p[2])), dec(0));
    const creditos = partidas.filter((p) => p[1] === 'CREDITO').reduce((a, p) => a.plus(dec(p[2])), dec(0));
    expect(f2(debitos), 'pré-condição: o AB do teste está equilibrado').toBe(f2(creditos));
    const ab = await db.lancamento.create({
      data: {
        tenantId: t.ctx.tenantId,
        numero: '000001',
        data: ex.dataInicio,
        tipo: 'AUTOMATICO',
        origem: 'AJUSTE',
        diarioId: diario.id,
        periodoId: p1.id,
        periodoFiscal: p1.codigo,
        // O AB AUTOMÁTICO (o do gerador) é o que traz a origem no exercício anterior; um AB
        // manual (dados legados) não a tem e conta sempre.
        ...(automatica ? { documentoOrigemTipo: 'ExercicioContabil', documentoOrigemId: t.ex26 } : {}),
        historico: automatica ? 'Abertura do exercício 2027 (teste)' : 'Abertura manual 2027 (legado)',
        valorTotal: debitos,
        status: 'LANCADO',
        criadoPorId: t.ctx.userId,
      },
    });
    for (const [codigo, tipo, valor] of partidas) {
      const p = await db.partidaLancamento.create({
        data: { tenantId: t.ctx.tenantId, lancamentoId: ab.id, contaId: t.conta[codigo], tipo, valor: dec(valor) },
      });
      if (codigo === '121') t.abPartida121 = p.id;
    }
    t.abId = ab.id;
    expect(p1.codigo).toBe('2027-01');
    return ab;
  }

  /** O cenário comum (ver cabeçalho). */
  async function montarCenario(t: Tenant) {
    await lancar(t, '2026-02-10T10:00:00Z', [['111', 'DEBITO', '1000'], ['521', 'CREDITO', '1000']]);
    await lancar(t, '2026-03-10T10:00:00Z', [['121', 'DEBITO', '2000'], ['521', 'CREDITO', '2000']]);
    await lancar(t, '2026-04-10T10:00:00Z', [['4438', 'DEBITO', '300'], ['121', 'CREDITO', '300']]);
    await inserirAbertura(t, [
      ['111', 'DEBITO', '1000'],
      ['121', 'DEBITO', '1700'],
      ['4438', 'DEBITO', '300'],
      ['521', 'CREDITO', '3000'],
    ]);
    await lancar(t, '2027-03-10T10:00:00Z', [['111', 'DEBITO', '200'], ['711', 'CREDITO', '200']]);
    await lancar(t, '2027-04-10T10:00:00Z', [['121', 'DEBITO', '400'], ['711', 'CREDITO', '400']]);
    const cb = await db.contaBancaria.create({
      data: {
        tenantId: t.ctx.tenantId,
        banco: 'Banco de Teste',
        agencia: '0001',
        numeroConta: `AB-${t.ctx.tenantId}`,
        tipoConta: 'CORRENTE',
        contaContabilId: t.conta['121'],
        ativo: true,
      },
    });
    t.contaBancariaId = cb.id;
  }

  let A: Tenant; // cenário com AB efectivo
  let B: Tenant; // cenário com AB estornado
  let IVA: Tenant; // IVA com 4438 no AB
  let MAN: Tenant; // lançamento manual em diários reservados

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    contab = await import('@/server/services/financas/contabilidade.service');
    val = await import('@/lib/validations/contabilidade');
    ({ bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap'));

    A = await novoTenant();
    await montarCenario(A);

    B = await novoTenant();
    await montarCenario(B);
    // O AB automático estorna-se pelo caminho dele (o genérico recusa-o com LANCAMENTO_DE_ABERTURA):
    // o espelho fica no MESMO diário ABERTURA, período 1, com a data do original.
    await comCtx(B, () =>
      db.$transaction((tx: AnyDb) => contab.estornarLancamentoAberturaEmTx(tx, { lancamentoId: B.abId!, motivo: 'AB refeito' }, B.ctx)),
    );
    const estornoB = await db.lancamento.findFirst({
      where: { tenantId: B.ctx.tenantId, lancamentoEstornoId: B.abId },
      include: { diario: true, periodo: true },
    });
    expect(estornoB.diario.tipo, 'pré-condição: o estorno do AB fica no diário ABERTURA').toBe('ABERTURA');
    expect(estornoB.periodo.codigo).toBe('2027-01');

    IVA = await novoTenant();
    await lancar(IVA, '2026-03-10T10:00:00Z', [['121', 'DEBITO', '300'], ['521', 'CREDITO', '300']]);
    await lancar(IVA, '2026-04-10T10:00:00Z', [['4438', 'DEBITO', '300'], ['121', 'CREDITO', '300']]);
    // Fecho 2026: 4438 = 300 D · 521 = 300 C (121 a zero).
    await inserirAbertura(IVA, [['4438', 'DEBITO', '300'], ['521', 'CREDITO', '300']]);
    // 2027-01: venda 1000 + IVA 160; 2027-02: venda 500 + IVA 80.
    await lancar(IVA, '2027-01-15T10:00:00Z', [['121', 'DEBITO', '1160'], ['711', 'CREDITO', '1000'], ['44331', 'CREDITO', '160']]);
    await lancar(IVA, '2027-02-15T10:00:00Z', [['121', 'DEBITO', '580'], ['711', 'CREDITO', '500'], ['44331', 'CREDITO', '80']]);

    MAN = await novoTenant();
  }, 300_000);

  // -------------------------------------------------------------------------
  // 1. gerarBalancete (por datas)
  // -------------------------------------------------------------------------

  const linhaBal = (bal: any, t: Tenant, codigo: Codigo) => bal.contas.find((c: any) => c.conta.id === t.conta[codigo]);

  it('1a. gerarBalancete 2026-01-01..2027-12-31: o 111 tem só o movimento real (o AB não conta)', async () => {
    const filtro = val.FiltroBalanceteSchema.parse({ dataInicio: '2026-01-01', dataFim: '2027-12-31' });
    const bal: any = await comCtx(A, () => contab.gerarBalancete(filtro, A.ctx));
    const l111 = linhaBal(bal, A, '111');
    expect(f2(l111?.debitos), '111 débitos 2026–2027').toBe('1200.00');
    expect(f2(l111?.saldoAtual), '111 saldo 2026–2027').toBe('1200.00');
    const l521 = linhaBal(bal, A, '521');
    expect(f2(l521?.creditos), '521 créditos 2026–2027').toBe('3000.00');
    expect(f2(bal.totalDebitos), 'total dos débitos = Σ dos lançamentos reais').toBe(f2(1000 + 2000 + 300 + 200 + 400));
  });

  it('1b. gerarBalancete 2027 com saldo anterior: anterior = fecho de 2026, movimento = só 2027', async () => {
    const filtro = val.FiltroBalanceteSchema.parse({ dataInicio: '2027-01-01', dataFim: '2027-12-31', comSaldoAnterior: true });
    const bal: any = await comCtx(A, () => contab.gerarBalancete(filtro, A.ctx));
    const l111 = linhaBal(bal, A, '111');
    expect(f2(l111?.saldoAnterior), '111 saldo anterior').toBe('1000.00');
    expect(f2(l111?.debitos), '111 débitos de 2027').toBe('200.00');
    expect(f2(l111?.saldoAtual), '111 saldo no fim de 2027').toBe('1200.00');
    const l121 = linhaBal(bal, A, '121');
    expect(f2(l121?.debitos), '121 débitos de 2027').toBe('400.00');
    expect(f2(l121?.saldoAtual), '121 saldo no fim de 2027').toBe('2100.00');
  });

  // -------------------------------------------------------------------------
  // 2. DFC (via gerarBalancete)
  // -------------------------------------------------------------------------

  it('2. gerarDFC de 2027: variação de caixa = 600 (o AB não é fluxo de caixa)', async () => {
    const { gerarDFC } = await import('@/server/services/financas/dfc.service');
    const p01 = await db.periodoContabil.findFirst({ where: { tenantId: A.ctx.tenantId, codigo: '2027-01' } });
    const p12 = await db.periodoContabil.findFirst({ where: { tenantId: A.ctx.tenantId, codigo: '2027-12' } });
    const r: any = await comCtx(A, () => gerarDFC({ periodoInicioId: p01.id, periodoFimId: p12.id }, A.ctx));
    expect('atual' in r, `a DFC sai sem impedimentos (${JSON.stringify(r.impedimentos ?? [])})`).toBe(true);
    expect(f2(r.atual.caixaInicial), 'caixa inicial = 111 + 121 no fecho de 2026').toBe('2700.00');
    expect(f2(r.atual.variacaoCaixa), 'variação de caixa de 2027').toBe('600.00');
    expect(f2(r.atual.caixaFinal), 'caixa final de 2027').toBe('3300.00');
  });

  // -------------------------------------------------------------------------
  // 3. razaoConta por datas
  // -------------------------------------------------------------------------

  it('3. razaoConta por datas (111, 2027): anterior = fecho real de 2026 e o AB não é linha de movimento', async () => {
    const filtro = val.FiltroRazaoSchema.parse({ contaId: A.conta['111'], dataInicio: '2027-01-01', dataFim: '2027-12-31' });
    const r: any = await comCtx(A, () => contab.razaoConta(filtro, A.ctx));
    expect(f2(r.saldoAnterior), 'saldo anterior').toBe('1000.00');
    expect(r.linhas.map((l: any) => l.lancamentoId), 'o AB não aparece como movimento').not.toContain(A.abId);
    expect(r.linhas, 'só o M1').toHaveLength(1);
    expect(f2(r.totais.debito), 'Σ débitos').toBe('200.00');
    expect(f2(r.saldoFinal), 'saldo final').toBe('1200.00');
  });

  // -------------------------------------------------------------------------
  // 4. obterContaDetalhe e saldoContabilAte
  // -------------------------------------------------------------------------

  it('4a. obterContaDetalhe (111, 2026–2027): débitos e saldo sem o AB', async () => {
    const r: any = await comCtx(A, () =>
      contab.obterContaDetalhe(A.conta['111'], { dataInicio: inicioDia('2026-01-01'), dataFim: fimDia('2027-12-31') }, A.ctx),
    );
    expect(f2(r?.debitos), 'débitos').toBe('1200.00');
    expect(f2(r?.saldo), 'saldo').toBe('1200.00');
    expect(r?.movimentos, 'movimentos = L1 + M1').toBe(2);
  });

  it('4b. saldoContabilAte (111, fim de 2027): 1200, não 2200', async () => {
    const s = await comCtx(A, () => contab.saldoContabilAte(A.conta['111'], fimDia('2027-12-31'), A.ctx));
    expect(f2(s)).toBe('1200.00');
  });

  // -------------------------------------------------------------------------
  // 5. Projeção e reconciliação (conta bancária no 121)
  // -------------------------------------------------------------------------

  it('5a. projeção saldoTesourariaAte: o banco não fica a dobrar depois do AB', async () => {
    const proj = await import('@/server/services/financas/projecao.service');
    const noDiaDoAB = await comCtx(A, () => proj.saldoTesourariaAte(fimDia('2027-01-01'), A.ctx));
    expect(f2(noDiaDoAB), 'saldo do 121 no dia da abertura').toBe('1700.00');
    const noFim = await comCtx(A, () => proj.saldoTesourariaAte(fimDia('2027-12-31'), A.ctx));
    expect(f2(noFim), 'saldo do 121 no fim de 2027').toBe('2100.00');
  });

  it('5b. reconciliação abrirPeriodo (saldoRazao): saldos contabilísticos do 121 sem o AB', async () => {
    const rec = await import('@/server/services/reconciliacao/reconciliacao.service');
    const p: any = await comCtx(A, () =>
      rec.abrirPeriodo(
        {
          contaBancariaId: A.contaBancariaId!,
          dataInicio: new Date('2027-01-01T12:00:00+02:00'),
          dataFim: new Date('2027-12-31T12:00:00+02:00'),
          saldoInicialBanco: dec('1700'),
          saldoFinalBanco: dec('2100'),
        },
        A.ctx,
      ),
    );
    expect(f2(p.saldoInicialContabil), 'saldo contabilístico inicial (antes de 2027-01-01)').toBe('1700.00');
    expect(f2(p.saldoFinalContabil), 'saldo contabilístico final (até 2027-12-31)').toBe('2100.00');
  });

  // -------------------------------------------------------------------------
  // 6. Importação: a partida do AB no banco não é movimento a reconciliar
  // -------------------------------------------------------------------------

  it('6. projetarMovimentosContabilisticos: a partida do AB no 121 não é projectada', async () => {
    const imp = await import('@/server/services/reconciliacao/importacao.service');
    await comCtx(A, () => imp.projetarMovimentosContabilisticos(A.contaBancariaId!, A.ctx));
    const movs = await db.movimentoContabilistico.findMany({
      where: { tenantId: A.ctx.tenantId, contaBancariaId: A.contaBancariaId },
      select: { partidaId: true, lancamentoId: true },
    });
    expect(A.abPartida121, 'pré-condição: o AB tem partida no 121').toBeTruthy();
    expect(movs.map((m: any) => m.partidaId), 'a partida do AB não é movimento').not.toContain(A.abPartida121);
    expect(movs.map((m: any) => m.lancamentoId)).not.toContain(A.abId);
    expect(movs, 'L2, L3 e M2').toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // 7. IVA: o 4438 do AB não é crédito a reportar outra vez
  // -------------------------------------------------------------------------

  it('7. apurarIva 2027-01 e 2027-02: o crédito reportado vem do razão real, não do AB', async () => {
    const { apurarIva } = await import('@/server/services/financas/apuramento-iva.service');
    const p01 = await db.periodoContabil.findFirst({ where: { tenantId: IVA.ctx.tenantId, codigo: '2027-01' } });
    const p02 = await db.periodoContabil.findFirst({ where: { tenantId: IVA.ctx.tenantId, codigo: '2027-02' } });

    // 2027-01: liquidado 160, crédito de 2026 = 300 ⇒ a recuperar 140 (4438 fica com 140).
    const a1: any = await comCtx(IVA, () => apurarIva({ periodoId: p01.id }, IVA.ctx));
    expect(f2(a1.totalIvaLiquidado), '2027-01 liquidado').toBe('160.00');
    expect(f2(a1.totalIvaDedutivel), '2027-01 dedutível').toBe('0.00');
    expect(f2(a1.creditoReportado), '2027-01 crédito reportado').toBe('300.00');
    expect(f2(a1.saldoApuramento), '2027-01 saldo').toBe('-140.00');

    // 2027-02: liquidado 80, crédito reportado = 4438 real fora do período = 140 (300 − 300 + 140).
    // Com o AB contado: 440.
    const a2: any = await comCtx(IVA, () => apurarIva({ periodoId: p02.id }, IVA.ctx));
    expect(f2(a2.totalIvaLiquidado), '2027-02 liquidado').toBe('80.00');
    expect(f2(a2.creditoReportado), '2027-02 crédito reportado').toBe('140.00');
    expect(f2(a2.saldoApuramento), '2027-02 saldo').toBe('-60.00');
  });

  // -------------------------------------------------------------------------
  // 8. Vistas por PERÍODO usam o AB; «tem AB» é efectivo
  // -------------------------------------------------------------------------

  const linhaBV = (bv: any, t: Tenant, codigo: Codigo) => bv.linhas.find((l: any) => l.conta?.id === t.conta[codigo]);

  it('8a. gerarBalanceteVerificacao 2027 com AB efectivo: sem abertura implícita, acumulado = AB + 2027', async () => {
    const bv: any = await comCtx(A, () =>
      contab.gerarBalanceteVerificacao({ exercicioId: A.ex27, periodoInicial: 1, periodoFinal: 12, incluir13: false }, A.ctx),
    );
    expect(bv.temAberturaImplicita, 'o AB substitui a abertura implícita').toBe(false);
    const l111 = linhaBV(bv, A, '111');
    expect(f2(l111?.acumD), '111 acumulado devedor').toBe('1200.00');
    expect(f2(l111?.saldoDevedor), '111 saldo').toBe('1200.00');
    const l521 = linhaBV(bv, A, '521');
    expect(f2(l521?.saldoCredor), '521 saldo').toBe('3000.00');
  });

  it('8b. gerarBalanceteVerificacao 2027 com o AB ESTORNADO: a abertura implícita volta e os saldos ficam', async () => {
    const bv: any = await comCtx(B, () =>
      contab.gerarBalanceteVerificacao({ exercicioId: B.ex27, periodoInicial: 1, periodoFinal: 12, incluir13: false }, B.ctx),
    );
    expect(bv.temAberturaImplicita, 'AB estornado ⇒ não há AB efectivo ⇒ abertura implícita').toBe(true);
    // implícita 1000 + AB 1000 − estorno 1000 + M1 200
    expect(f2(linhaBV(bv, B, '111')?.saldoDevedor), '111 saldo').toBe('1200.00');
    // implícita 1700 + AB 1700 − estorno 1700 + M2 400
    expect(f2(linhaBV(bv, B, '121')?.saldoDevedor), '121 saldo').toBe('2100.00');
    expect(f2(linhaBV(bv, B, '521')?.saldoCredor), '521 saldo').toBe('3000.00');
  });

  // -------------------------------------------------------------------------
  // 8c. AB MANUAL (legado) conta sempre nos leitores por datas
  // -------------------------------------------------------------------------

  it('8c. gerarBalancete conta um AB MANUAL (sem origem ExercicioContabil) de um exercício com anterior', async () => {
    const LEG = await novoTenant();
    await lancar(LEG, '2026-02-10T10:00:00Z', [['111', 'DEBITO', '1000'], ['521', 'CREDITO', '1000']]);
    // Dados legados: AB manual LANCADO no diário ABERTURA de 2027 (que tem anterior), sem origem.
    await inserirAbertura(LEG, [['111', 'DEBITO', '500'], ['521', 'CREDITO', '500']], { automatica: false });
    const ab = await db.lancamento.findFirst({ where: { id: LEG.abId, tenantId: LEG.ctx.tenantId } });
    expect(ab.documentoOrigemTipo, 'pré-condição: AB sem origem').toBeNull();

    const filtro = val.FiltroBalanceteSchema.parse({ dataInicio: '2027-01-01', dataFim: '2027-12-31', comSaldoAnterior: true });
    const bal: any = await comCtx(LEG, () => contab.gerarBalancete(filtro, LEG.ctx));
    const l111 = linhaBal(bal, LEG, '111');
    expect(f2(l111?.saldoAnterior), '111 saldo anterior').toBe('1000.00');
    expect(f2(l111?.debitos), 'o AB manual é movimento de 2027').toBe('500.00');
    expect(f2(l111?.saldoAtual), '111 saldo no fim de 2027').toBe('1500.00');
  });

  // -------------------------------------------------------------------------
  // 8d. AB automático ESTORNADO: nem o AB nem o estorno contam nos leitores por datas
  // -------------------------------------------------------------------------

  it('8d. AB automático estornado: gerarBalancete e razaoConta por datas não contam o AB nem o estorno dele', async () => {
    const estorno = await db.lancamento.findFirst({ where: { tenantId: B.ctx.tenantId, lancamentoEstornoId: B.abId } });
    expect(estorno, 'pré-condição: o AB de B tem estorno').toBeTruthy();

    const filtro = val.FiltroBalanceteSchema.parse({ dataInicio: '2027-01-01', dataFim: '2027-12-31', comSaldoAnterior: true });
    const bal: any = await comCtx(B, () => contab.gerarBalancete(filtro, B.ctx));
    const l111 = linhaBal(bal, B, '111');
    expect(f2(l111?.saldoAnterior), 'balancete: 111 saldo anterior').toBe('1000.00');
    expect(f2(l111?.debitos), 'balancete: 111 débitos de 2027 = só o M1').toBe('200.00');
    expect(f2(l111?.creditos), 'balancete: 111 créditos de 2027 (o estorno do AB não conta)').toBe('0.00');
    expect(f2(l111?.saldoAtual), 'balancete: 111 saldo no fim de 2027').toBe('1200.00');

    const fr = val.FiltroRazaoSchema.parse({ contaId: B.conta['111'], dataInicio: '2027-01-01', dataFim: '2027-12-31' });
    const r: any = await comCtx(B, () => contab.razaoConta(fr, B.ctx));
    const ids = r.linhas.map((l: any) => l.lancamentoId);
    expect(ids, 'razão: o AB não é linha').not.toContain(B.abId);
    expect(ids, 'razão: o estorno do AB não é linha').not.toContain(estorno.id);
    expect(f2(r.saldoAnterior), 'razão: saldo anterior').toBe('1000.00');
    expect(r.linhas, 'razão: só o M1').toHaveLength(1);
    expect(f2(r.saldoFinal), 'razão: saldo final').toBe('1200.00');
  });

  it('8e. AB automático estornado: projetarMovimentosContabilisticos não projecta a partida do banco do AB nem a do estorno', async () => {
    const imp = await import('@/server/services/reconciliacao/importacao.service');
    const estorno = await db.lancamento.findFirst({
      where: { tenantId: B.ctx.tenantId, lancamentoEstornoId: B.abId },
      include: { partidas: true },
    });
    const estorno121 = estorno?.partidas.find((p: any) => p.contaId === B.conta['121']);
    expect(B.abPartida121, 'pré-condição: o AB tem partida no 121').toBeTruthy();
    expect(estorno121, 'pré-condição: o estorno do AB tem partida no 121').toBeTruthy();

    await comCtx(B, () => imp.projetarMovimentosContabilisticos(B.contaBancariaId!, B.ctx));
    const movs = await db.movimentoContabilistico.findMany({
      where: { tenantId: B.ctx.tenantId, contaBancariaId: B.contaBancariaId },
      select: { partidaId: true, lancamentoId: true },
    });
    const partidas = movs.map((m: any) => m.partidaId);
    expect(partidas, 'a partida do AB não é movimento').not.toContain(B.abPartida121);
    expect(partidas, 'a partida do estorno do AB não é movimento').not.toContain(estorno121.id);
    expect(movs.map((m: any) => m.lancamentoId)).not.toContain(estorno.id);
    expect(movs, 'L2, L3 e M2').toHaveLength(3);
  });

  // -------------------------------------------------------------------------
  // 9. Lançamento manual em diários reservados
  // -------------------------------------------------------------------------

  async function manual(diarioTipo: 'ABERTURA' | 'ENCERRAMENTO', data: string) {
    const diario = await db.diario.findFirst({ where: { tenantId: MAN.ctx.tenantId, tipo: diarioTipo } });
    const input = val.CriarLancamentoSchema.parse({
      data,
      diarioId: diario.id,
      historico: `Manual no diário ${diarioTipo}`,
      partidas: [
        { contaId: MAN.conta['111'], tipo: 'DEBITO', valor: 50 },
        { contaId: MAN.conta['521'], tipo: 'CREDITO', valor: 50 },
      ],
    });
    return comCtx(MAN, () => contab.criarLancamento(input, MAN.ctx));
  }

  it('9a. criarLancamento no diário de ENCERRAMENTO → DIARIO_DE_ENCERRAMENTO', async () => {
    await expect(manual('ENCERRAMENTO', '2026-06-10T10:00:00Z')).rejects.toMatchObject({
      name: 'BusinessRuleError',
      code: 'DIARIO_DE_ENCERRAMENTO',
    });
    const n = await db.lancamento.count({ where: { tenantId: MAN.ctx.tenantId, diario: { tipo: 'ENCERRAMENTO' } } });
    expect(n, 'nada gravado no diário EN').toBe(0);
  });

  it('9b. criarLancamento no diário de ABERTURA de um exercício com anterior → ABERTURA_AUTOMATICA', async () => {
    await expect(manual('ABERTURA', '2027-01-05T10:00:00Z')).rejects.toMatchObject({
      name: 'BusinessRuleError',
      code: 'ABERTURA_AUTOMATICA',
    });
    const n = await db.lancamento.count({
      where: { tenantId: MAN.ctx.tenantId, diario: { tipo: 'ABERTURA' }, periodo: { exercicioId: MAN.ex27 } },
    });
    expect(n, 'nada gravado no diário AB de 2027').toBe(0);
  });

  it('9c. criarLancamento no diário de ABERTURA do primeiro exercício (sem anterior) é permitido', async () => {
    const l: any = await manual('ABERTURA', '2026-01-02T10:00:00Z');
    expect(l.status).toBe('RASCUNHO');
    expect(l.diario.tipo).toBe('ABERTURA');
    const gravado = await db.lancamento.findFirst({ where: { id: l.id, tenantId: MAN.ctx.tenantId }, include: { periodo: true } });
    expect(gravado.periodo.exercicioId, 'no exercício 2026, o primeiro').toBe(MAN.ex26);
  });

  // -------------------------------------------------------------------------
  // 10. confirmarLancamento (RASCUNHO → LANCADO) em diários reservados
  // -------------------------------------------------------------------------

  /**
   * RASCUNHO já pousado num diário reservado (legado, anterior à guarda). Inserção CRUA só no
   * setup: o `criarLancamento` passou a recusá-lo, e é a confirmação que está em teste.
   */
  let rasc = 0;
  async function inserirRascunho(diarioTipo: 'ABERTURA' | 'ENCERRAMENTO', periodoCodigo: string) {
    const diario = await db.diario.findFirst({ where: { tenantId: MAN.ctx.tenantId, tipo: diarioTipo } });
    const periodo = await db.periodoContabil.findFirst({ where: { tenantId: MAN.ctx.tenantId, codigo: periodoCodigo } });
    const l = await db.lancamento.create({
      data: {
        tenantId: MAN.ctx.tenantId,
        numero: `RASC-${++rasc}`,
        data: new Date(periodo.dataInicio.getTime() + 36 * 3600 * 1000),
        tipo: 'MANUAL',
        origem: 'MANUAL',
        diarioId: diario.id,
        periodoId: periodo.id,
        periodoFiscal: periodo.codigo,
        historico: `Rascunho legado no diário ${diarioTipo}`,
        valorTotal: dec(50),
        status: 'RASCUNHO',
        criadoPorId: MAN.ctx.userId,
      },
    });
    for (const [codigo, tipo] of [['111', 'DEBITO'], ['521', 'CREDITO']] as const) {
      await db.partidaLancamento.create({
        data: { tenantId: MAN.ctx.tenantId, lancamentoId: l.id, contaId: MAN.conta[codigo], tipo, valor: dec(50) },
      });
    }
    return l.id as string;
  }

  const estadoDe = async (id: string) =>
    (await db.lancamento.findFirst({ where: { id, tenantId: MAN.ctx.tenantId }, select: { status: true } })).status;

  it('10a. confirmarLancamento de um RASCUNHO no diário de ENCERRAMENTO → DIARIO_DE_ENCERRAMENTO, fica RASCUNHO', async () => {
    const id = await inserirRascunho('ENCERRAMENTO', '2026-06');
    await expect(comCtx(MAN, () => contab.confirmarLancamento(id, MAN.ctx))).rejects.toMatchObject({
      name: 'BusinessRuleError',
      code: 'DIARIO_DE_ENCERRAMENTO',
    });
    expect(await estadoDe(id)).toBe('RASCUNHO');
  });

  it('10b. confirmarLancamento de um RASCUNHO no diário de ABERTURA de exercício com anterior → ABERTURA_AUTOMATICA, fica RASCUNHO', async () => {
    const id = await inserirRascunho('ABERTURA', '2027-01');
    await expect(comCtx(MAN, () => contab.confirmarLancamento(id, MAN.ctx))).rejects.toMatchObject({
      name: 'BusinessRuleError',
      code: 'ABERTURA_AUTOMATICA',
    });
    expect(await estadoDe(id)).toBe('RASCUNHO');
  });

  it('10c. confirmarLancamento de um RASCUNHO no diário de ABERTURA do primeiro exercício é permitido', async () => {
    const id = await inserirRascunho('ABERTURA', '2026-01');
    await comCtx(MAN, () => contab.confirmarLancamento(id, MAN.ctx));
    expect(await estadoDe(id)).toBe('LANCADO');
  });
});
