/**
 * #622 — documento só com linhas a 0 % num período com IVA apurado ou declarado.
 *
 * A guarda da #564 vive na camada de lançamento e só dispara quando uma partida toca a 443x.
 * Uma factura, NC ou ND só com linhas isentas não toca o IVA e passava — e a base do Modelo A
 * (operações isentas, pro rata) desse período ficava incompleta; em DECLARADO viola o ADR-0034 §7.
 * Documento fiscal num período apurado é sempre recusado, antes da numeração.
 *
 * Calendário do teste (2026):
 *   - 2026-02 aberto, sem apuramento — a factura de base das NC;
 *   - 2026-04 com apuramento APURADO / DECLARADO (linha à mão);
 *   - 2026-05 aberto, sem apuramento — tudo passa;
 *   - 2026-06 FECHADO e DECLARADO — continua a dar PERIODO_FECHADO, não PERIODO_IVA_APURADO.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

vi.mock('@/lib/auth', () => ({
  auth: vi.fn(async () => ({ user: { emailVerificado: true } })),
}));

describe.skipIf(skip)('#622 — documento a 0 % em período com IVA apurado — DB efémera (Testcontainers)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let fat: any;
  let val: typeof import('@/lib/validations/faturacao');

  const sufixo = Date.now();
  const TENANT = `tenant-iva-622-${sufixo}`;
  const USER = `user-iva-622-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER, permissions: new Set<string>() };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  const FEV = new Date('2026-02-10T10:00:00Z');
  const ABR = new Date('2026-04-15T10:00:00Z');
  const MAI = new Date('2026-05-15T10:00:00Z');
  const JUN = new Date('2026-06-15T10:00:00Z');

  let clienteId: string;
  let faturaBaseId: string;

  async function capturarErro(fn: () => Promise<unknown>): Promise<any> {
    try {
      await fn();
    } catch (e) {
      return e;
    }
    return undefined;
  }

  const periodo = (codigo: string) => db.periodoContabil.findFirst({ where: { tenantId: TENANT, codigo } });

  async function comApuramento(codigo: string, estado: 'APURADO' | 'DECLARADO'): Promise<() => Promise<void>> {
    const p = await periodo(codigo);
    const versao = (await db.apuramentoIva.count({ where: { tenantId: TENANT, periodoId: p.id } })) + 1;
    const a = await db.apuramentoIva.create({
      data: {
        tenantId: TENANT, periodoId: p.id, versao, estado,
        totalIvaLiquidado: 0, totalIvaDedutivel: 0, totalRegularizacoes: 0, saldoApuramento: 0,
        apuradoPorId: USER, keycloakSub: `kc-${USER}`,
      },
    });
    return async () => {
      await db.apuramentoIva.delete({ where: { id: a.id } });
    };
  }

  const linhaZero = {
    descricao: 'Livro escolar',
    quantidade: 1,
    precoUnitario: 100,
    taxaIva: 0,
    motivoIsencao: 'Isento — artigo 9.º do CIVA',
  };

  const emitirFatura = (data: Date) =>
    noCtx(() =>
      fat.emitirFatura(
        val.EmitirFaturaSchema.parse({ clienteId, dataEmissao: data, dataVencimento: data, linhas: [linhaZero] }),
        ctx,
      ),
    ) as Promise<any>;

  const emitirNC = (data: Date) =>
    noCtx(() =>
      fat.emitirNotaCredito(
        val.EmitirNotaCreditoSchema.parse({
          faturaOriginalId: faturaBaseId,
          motivo: 'Desconto',
          dataEmissao: data,
          linhas: [{ ...linhaZero, precoUnitario: 10 }],
        }),
        ctx,
      ),
    ) as Promise<any>;

  const emitirND = (data: Date) =>
    noCtx(() =>
      fat.emitirNotaDebito(
        val.EmitirNotaDebitoSchema.parse({ clienteId, motivo: 'Acerto de preço', dataEmissao: data, linhas: [linhaZero] }),
        ctx,
      ),
    ) as Promise<any>;

  const emissoes = { factura: emitirFatura, 'nota de crédito': emitirNC, 'nota de débito': emitirND } as const;

  const contagens = async () => ({
    faturas: await db.fatura.count({ where: { tenantId: TENANT } }),
    ncs: await db.notaCredito.count({ where: { tenantId: TENANT } }),
    nds: await db.notaDebito.count({ where: { tenantId: TENANT } }),
    lancamentos: await db.lancamento.count({ where: { tenantId: TENANT } }),
    series: Object.fromEntries(
      (await db.serieDocumento.findMany({ where: { tenantId: TENANT }, select: { tipo: true, ano: true, proximoNumero: true } })).map(
        (s: any) => [`${s.tipo}-${s.ano}`, s.proximoNumero],
      ),
    ),
  });

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    fat = await import('@/server/services/financas/faturacao.service');
    val = await import('@/lib/validations/faturacao');
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({ data: { id: TENANT, nome: 'Tenant IVA 622', slug: `iva-622-${sufixo}`, nuit: `${sufixo}`.slice(-9) } });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `iva-622-${sufixo}@test.mz`, nome: 'Contabilista', keycloakSub: `kc-${USER}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    clienteId = (
      await db.cliente.create({
        data: {
          tenantId: TENANT, nome: 'Cliente 622', tipo: 'JURIDICA', nuit: '400000622',
          email: `cliente-622-${sufixo}@test.mz`, telefone: '840000622', codigo: `CLI-622-${sufixo}`,
        },
      })
    ).id;

    faturaBaseId = (await emitirFatura(FEV)).id;
  }, 180_000);

  describe.each(['APURADO', 'DECLARADO'] as const)('período 2026-04 com apuramento %s', (estado) => {
    beforeAll(async () => {
      const apagar = await comApuramento('2026-04', estado);
      return () => apagar();
    });

    it.each(Object.keys(emissoes) as Array<keyof typeof emissoes>)(
      '%s só com linhas isentas ⇒ PERIODO_IVA_APURADO, número da série inalterado e nada escrito',
      async (tipo) => {
        const antes = await contagens();
        const erro = await capturarErro(() => emissoes[tipo](ABR));
        expect(erro?.code, `veio: ${erro?.code ?? 'nada'} ${erro?.message ?? ''}`).toBe('PERIODO_IVA_APURADO');
        expect(erro?.message).toContain('2026-04');
        expect(await contagens()).toEqual(antes);
      },
    );
  });

  it.each(Object.keys(emissoes) as Array<keyof typeof emissoes>)(
    'período fechado (e declarado) ⇒ %s isenta continua a dar PERIODO_FECHADO',
    async (tipo) => {
      const p = await periodo('2026-06');
      const apagar = await comApuramento('2026-06', 'DECLARADO');
      await db.periodoContabil.update({ where: { id: p.id }, data: { estado: 'FECHADO' } });
      try {
        const antes = await contagens();
        const erro = await capturarErro(() => emissoes[tipo](JUN));
        expect(erro?.code, `veio: ${erro?.code ?? 'nada'} ${erro?.message ?? ''}`).toBe('PERIODO_FECHADO');
        expect(await contagens()).toEqual(antes);
      } finally {
        await db.periodoContabil.update({ where: { id: p.id }, data: { estado: 'ABERTO' } });
        await apagar();
      }
    },
  );

  it('período aberto sem apuramento ⇒ factura, NC e ND a 0 % emitem', async () => {
    const f = await emitirFatura(MAI);
    const nc = await emitirNC(MAI);
    const nd = await emitirND(MAI);
    for (const d of [f, nc, nd]) expect(d.numero).toBeTruthy();
  });
});
