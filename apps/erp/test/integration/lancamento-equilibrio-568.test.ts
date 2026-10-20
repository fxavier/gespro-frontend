/**
 * Teste de integração — equilíbrio do lançamento depois do arredondamento (#568)
 *
 * `registarLancamentoContabilistico` verificava Σ D = Σ C sobre os valores por arredondar e
 * gravava-os numa coluna `Decimal(18,2)`, que arredonda. Com `baseIva 86.205`, `valorIva 13.795`
 * e `valorOriginal 100`, a soma 100.000 passava e ficava gravado D 86.21 + D 13.80 = 100.01
 * contra C 100.00 — e o período deixava de fechar (`BALANCETE_DESEQUILIBRADO`).
 *
 * O oráculo é a BASE: as `PartidaLancamento` lidas depois do commit.
 *
 * Requer: Docker em execução + @testcontainers/postgresql
 * Degrada graciosamente: SKIP_INTEGRATION=true ou sem INTEGRATION_DB_URL → saltado.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import fc from 'fast-check';
import { Prisma } from '@prisma/client';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

type Partida = { contaCodigo: string; tipo: 'DEBITO' | 'CREDITO'; valor: string };

describe.skipIf(skip)('#568 — Σ D = Σ C nas partidas gravadas', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];
  let contab: typeof import('@/server/services/financas/contabilidade.service');
  let contaPagar: any; // contaPagarService

  const sufixo = Date.now();
  const TENANT = `tenant-l568-${sufixo}`;
  const USER = `user-l568-${sufixo}`;
  const CTX = { tenantId: TENANT, userId: USER };
  let fornecedorId: string;
  let conta622Id: string;
  let doc = 0;

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    contab = await import('@/server/services/financas/contabilidade.service');
    ({ contaPagarService: contaPagar } = await import('@/server/services/compras/conta-pagar.service'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    await db.tenant.create({ data: { id: TENANT, nome: 'Tenant 568', slug: `l568-${sufixo}`, nuit: `${sufixo}`.slice(-9) } });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `${USER}@test.mz`, nome: 'Contabilista', keycloakSub: `kc-${USER}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const f = await db.fornecedor.create({
      data: {
        tenantId: TENANT,
        codigo: `FOR-568-${sufixo}`,
        nome: 'Fornecedor 568',
        tipo: 'PESSOA_JURIDICA',
        nuit: '400000568',
        email: `for-568-${sufixo}@test.mz`,
      },
    });
    fornecedorId = f.id;
    const c622 = await db.contaPGC.findFirst({ where: { tenantId: TENANT, codigo: '622' } });
    expect(c622?.aceitaLancamento, 'pré-condição: 622 aceita lançamento').toBe(true);
    conta622Id = c622.id;
  }, 180_000);

  async function somasGravadas(lancamentoId: string) {
    const partidas = await db.partidaLancamento.findMany({ where: { tenantId: TENANT, lancamentoId } });
    let d = new Prisma.Decimal(0);
    let c = new Prisma.Decimal(0);
    for (const p of partidas) {
      if (p.tipo === 'DEBITO') d = d.plus(p.valor);
      else c = c.plus(p.valor);
    }
    return { d: d.toFixed(2), c: c.toFixed(2), valores: partidas.map((p: any) => `${p.tipo}:${new Prisma.Decimal(p.valor).toFixed(2)}`) };
  }

  it('cenário da issue: ContaPagar com baseIva 86.205 / valorIva 13.795 / total 100', async () => {
    const numeroDocumento = `FT-568-${sufixo}`;
    let resultado: { ok: true; id: string } | { ok: false; erro: any };
    try {
      const cp = await runCtx(CTX, () =>
        contaPagar.criar(
          {
            fornecedorId,
            descricao: 'Compra com IVA a três casas',
            valorOriginal: 100,
            dataEmissao: new Date(),
            dataVencimento: new Date(Date.now() + 30 * 86_400_000),
            contaContabilId: conta622Id,
            numeroDocumento,
            baseIva: 86.205,
            taxaIva: 16,
            valorIva: 13.795,
            tipoAquisicao: 'OUTROS_BENS_SERVICOS',
          },
          CTX,
        ),
      );
      resultado = { ok: true, id: cp.id };
    } catch (erro) {
      resultado = { ok: false, erro };
    }

    if (resultado.ok) {
      const lanc = await db.lancamento.findFirst({
        where: { tenantId: TENANT, documentoOrigemTipo: 'ContaPagar', documentoOrigemId: resultado.id },
      });
      expect(lanc, 'lançamento do reconhecimento').not.toBeNull();
      const s = await somasGravadas(lanc.id);
      expect(s.d, `Σ D = Σ C na base (${s.valores.join(' ')})`).toBe(s.c);
    } else {
      expect(resultado.erro).toMatchObject({ name: 'BusinessRuleError', code: 'PARTIDAS_DESEQUILIBRADAS' });
      // Recusado é recusado: nada fica a meio.
      expect(await db.contaPagar.count({ where: { tenantId: TENANT, numeroDocumento } })).toBe(0);
    }
  });

  it('property: para qualquer conjunto de partidas aceite (0 a 4 casas), Σ D = Σ C nas partidas lidas', async () => {
    // Valor com 0 a 4 casas decimais, como string exacta.
    const valor = fc
      .tuple(fc.integer({ min: 1, max: 1_000_000_000 }), fc.integer({ min: 0, max: 4 }))
      .map(([n, casas]) => new Prisma.Decimal(n).div(new Prisma.Decimal(10).pow(casas)));
    // Partidas equilibradas ANTES do arredondamento, como as calculam os chamadores.
    const partidas = fc
      .tuple(fc.array(valor, { minLength: 1, maxLength: 4 }), fc.array(valor, { minLength: 1, maxLength: 3 }))
      .map(([debitos, creditos]) => {
        const soma = (xs: Prisma.Decimal[]) => xs.reduce((a, b) => a.plus(b), new Prisma.Decimal(0));
        const dif = soma(debitos).minus(soma(creditos));
        if (dif.gt(0)) creditos = [...creditos, dif];
        else if (dif.lt(0)) debitos = [...debitos, dif.neg()];
        return [
          ...debitos.map((v): Partida => ({ contaCodigo: '622', tipo: 'DEBITO', valor: v.toString() })),
          ...creditos.map((v): Partida => ({ contaCodigo: '421', tipo: 'CREDITO', valor: v.toString() })),
        ];
      });

    let aceites = 0;
    await fc.assert(
      fc.asyncProperty(partidas, async (ps) => {
        let lancamentoId: string | null = null;
        try {
          const l = await runCtx(CTX, () =>
            db.$transaction((tx: any) =>
              contab.registarLancamentoContabilistico(
                tx,
                {
                  data: new Date(),
                  diarioTipo: 'OPERACOES',
                  origem: 'AJUSTE',
                  documentoOrigemId: `doc-568-${++doc}`,
                  documentoOrigemTipo: 'Teste568',
                  historico: 'Teste 568',
                  partidas: ps,
                },
                CTX,
              ),
              { timeout: 30_000 }, // máquina carregada: o tecto de 5 s da tx interactiva não é o que se prova
            ),
          );
          lancamentoId = l.id;
        } catch (erro: any) {
          expect(erro).toMatchObject({ name: 'BusinessRuleError', code: 'PARTIDAS_DESEQUILIBRADAS' });
          return;
        }
        aceites++;
        const s = await somasGravadas(lancamentoId!);
        expect(s.d, `Σ D = Σ C na base (${s.valores.join(' ')})`).toBe(s.c);
        // Grava-se exactamente o valor arredondado (ROUND_HALF_UP, 2 casas).
        const esperado = ps.map((p) => `${p.tipo}:${new Prisma.Decimal(p.valor).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2)}`);
        expect([...s.valores].sort()).toEqual(esperado.sort());
      }),
      { numRuns: 60 },
    );
    expect(aceites, 'a propriedade exercitou lançamentos aceites').toBeGreaterThan(0);
  }, 300_000);
});
