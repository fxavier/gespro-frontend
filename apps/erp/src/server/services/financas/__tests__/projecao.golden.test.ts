import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { vi } from 'vitest';
import { Prisma } from '@prisma/client';
// ---------------------------------------------------------------------------
// GOLDEN FIXTURE do nó L4 (P4, tasks 4.5/4.6/4.6-bis) — spec 22 · ADR-0036.
//
// A fixture `fixtures/projecao-seed-demo.json` foi apurada À MÃO a partir do
// estado do tenant demo acabado de semear (base limpa + pnpm db:seed em
// 2026-09-23; primeira derivação a 2026-09-21): listagens SQL independentes de facturas, contas a pagar,
// payroll e sessões de caixa + aritmética Decimal — NUNCA a partir de
// `projetarTesouraria`. Se a implementação discordar da fixture, o defeito é
// da implementação até prova documentada em contrário. NUNCA `vitest -u`
// neste directório; um seed re-corrido noutro dia civil exige RE-DERIVAR a
// fixture à mão (derivação completa no handoff §Golden fixture).
//
// O relógio é pinado (só `Date`) em `instanteReferencia`: o seed gera datas
// RELATIVAS ao dia da execução, e a projecção lê «hoje» — sem pinar, a
// fixture apodreceria um dia depois de escrita.
// ---------------------------------------------------------------------------
import { projetarTesouraria } from '../projecao.service';
import { diaCivilEmMaputo } from '../contabilidade.service';
import { prismaBase } from '@/server/db/client';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import type { FiltroProjecaoInput } from '@/lib/validations/tesouraria';
import type { Bucket, ProjecaoTesouraria } from '../projecao.interface';
import fixture from './fixtures/projecao-seed-demo.json';

const hasDB = Boolean(process.env.DATABASE_URL);
// Só na base LOCAL (issue #237): estes oráculos comparam a base semeada do tenant `demo` com
// uma fixture derivada do seed num dia civil fixo. No CI a base é semeada no dia da corrida e a
// fixture nunca bate, por isso não correm lá (o GitHub Actions define CI=true em todos os passos).
// Localmente continuam a correr dentro do `pnpm check`, com as mesmas asserções.
const noCI = Boolean(process.env.CI);

const D = (v: string | number) => new Prisma.Decimal(v);

/** Dia civil `aaaa-mm-dd` de uma Date, em Africa/Maputo — nunca toISOString. */
function civil(data: Date): string {
  const { ano, mes, dia } = diaCivilEmMaputo(data);
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function compararBuckets(
  actuais: Bucket[],
  esperados: Array<{
    inicio: string;
    fim: string;
    entradas: string;
    saidas: string;
    saldoInicial: string;
    saldoFinal: string;
  }>,
): void {
  expect(actuais).toHaveLength(esperados.length);
  for (const [i, esp] of esperados.entries()) {
    const b = actuais[i]!;
    expect(civil(b.inicio), `bucket ${i}: inicio`).toBe(esp.inicio);
    expect(civil(b.fim), `bucket ${i}: fim`).toBe(esp.fim);
    for (const campo of ['entradas', 'saidas', 'saldoInicial', 'saldoFinal'] as const) {
      expect(
        b[campo].equals(D(esp[campo])),
        `bucket ${i} (${esp.inicio}): ${campo} devolveu ${b[campo].toString()}, a fixture manda ${esp[campo]}`,
      ).toBe(true);
    }
  }
}

describe.skipIf(!hasDB || noCI)(
  'Golden fixture — projecção do seed demo (horizonte 90 · SEMANAL)',
  () => {
    let ctx: { tenantId: string; userId: string };
    let faturaIdPorNumero: Map<string, string>;
    let contaPagarIdPorNumero: Map<string, string>;

    beforeAll(async () => {
      // Só o `Date` é dobrado: os timers reais ficam vivos para o driver pg.
      vi.useFakeTimers({
        toFake: ['Date'],
        now: new Date(fixture.instanteReferencia),
      });

      const tenant = await prismaBase.tenant.findFirst({ where: { slug: 'demo' } });
      if (!tenant) {
        throw new Error('Tenant demo não encontrado. Executa pnpm db:seed primeiro.');
      }
      const admin = await prismaBase.user.findFirst({
        where: { tenantId: tenant.id, email: 'admin@demo.mz' },
      });
      if (!admin) {
        throw new Error('Utilizador admin@demo.mz não encontrado no tenant demo.');
      }
      ctx = { tenantId: tenant.id, userId: admin.id };

      // ------- Sentinelas: o seed é o que a fixture assume? -------
      // Falham AQUI, com mensagem clara, em vez de deixar os números divergir
      // 40 asserções abaixo com um erro incompreensível.
      const s = fixture.sentinelasDoSeed;
      const [
        totalFaturas,
        faturasEmAberto,
        contasPagarEmAberto,
        payrollProcessado,
        compromissos,
        contasBancarias,
        sessoesAbertas,
        fat92,
      ] = await Promise.all([
        prismaBase.fatura.count({ where: { tenantId: ctx.tenantId } }),
        prismaBase.fatura.count({
          where: {
            tenantId: ctx.tenantId,
            status: { in: ['EMITIDA', 'PARCIALMENTE_PAGA', 'VENCIDA'] },
          },
        }),
        prismaBase.contaPagar.count({
          where: {
            tenantId: ctx.tenantId,
            status: { in: ['ABERTA', 'PARCIALMENTE_PAGA', 'VENCIDA'] },
          },
        }),
        prismaBase.payroll.count({
          where: { tenantId: ctx.tenantId, status: 'PROCESSADO' },
        }),
        prismaBase.compromissoTesouraria.count({
          where: { tenantId: ctx.tenantId, deletedAt: null },
        }),
        prismaBase.contaBancaria.count({ where: { tenantId: ctx.tenantId } }),
        prismaBase.sessaoCaixa.count({
          where: { tenantId: ctx.tenantId, status: 'ABERTA' },
        }),
        prismaBase.fatura.findFirst({
          where: { tenantId: ctx.tenantId, numero: 'FAT/2026/000092' },
          select: { dataVencimento: true },
        }),
      ]);
      const observado = {
        totalFaturas,
        faturasEmAberto,
        contasPagarEmAberto,
        payrollProcessado,
        compromissosManuais: compromissos,
        contasBancarias,
        sessoesAbertas,
        vencimentoCivilDaFAT92: fat92 ? civil(fat92.dataVencimento) : '(sem FAT/2026/000092)',
      };
      const esperado = {
        totalFaturas: s.totalFaturas,
        faturasEmAberto: s.faturasEmAberto,
        contasPagarEmAberto: s.contasPagarEmAberto,
        payrollProcessado: s.payrollProcessado,
        compromissosManuais: s.compromissosManuais,
        contasBancarias: s.contasBancarias,
        sessoesAbertas: s.sessoesAbertas,
        vencimentoCivilDaFAT92: s.vencimentoCivilDaFAT92,
      };
      if (JSON.stringify(observado) !== JSON.stringify(esperado)) {
        throw new Error(
          'O estado do tenant demo diverge do que a golden fixture assume — o seed ' +
            'foi re-corrido noutro dia civil ou a base tem resíduos. Re-deriva a ' +
            'fixture À MÃO (handoff §Golden fixture); NUNCA vitest -u.\n' +
            `observado: ${JSON.stringify(observado)}\nfixture:   ${JSON.stringify(esperado)}`,
        );
      }

      const [faturas, contasPagar] = await Promise.all([
        prismaBase.fatura.findMany({
          where: { tenantId: ctx.tenantId },
          select: { id: true, numero: true },
        }),
        prismaBase.contaPagar.findMany({
          where: { tenantId: ctx.tenantId },
          select: { id: true, numero: true },
        }),
      ]);
      faturaIdPorNumero = new Map(faturas.map((f) => [f.numero, f.id]));
      contaPagarIdPorNumero = new Map(contasPagar.map((c) => [c.numero, c.id]));
    });

    afterAll(async () => {
      vi.useRealTimers();
      await prismaBase.$disconnect();
    });

    function projectar(cenario: FiltroProjecaoInput['cenario']): Promise<ProjecaoTesouraria> {
      const filtro: FiltroProjecaoInput = {
        horizonteDias: fixture.filtro.horizonteDias,
        granularidade: 'SEMANAL',
        cenario,
      };
      return runWithTenantContext(ctx, () => projetarTesouraria(filtro, ctx));
    }

    it('BASE: bate ao cêntimo com a derivação manual do seed', async () => {
      const p = await projectar('BASE');
      const e = fixture.esperado;

      expect(civil(p.dataReferencia)).toBe(e.dataReferencia);
      expect(p.cenario).toBe('BASE');
      expect(p.cenarioAplicado).toBe(e.cenarioAplicado);
      expect(
        p.saldoAbertura.equals(D(e.saldoAbertura)),
        `saldoAbertura devolveu ${p.saldoAbertura.toString()}, a fixture manda ${e.saldoAbertura}`,
      ).toBe(true);
      expect(p.semOrigensDeSaldo).toBe(e.semOrigensDeSaldo);

      // §10 ao vivo: os atrasos crus do seed são TODOS −30 (clientes pagam
      // adiantado); truncados por observação dão média 0 e σ 0 — sem a regra,
      // a média seria −30 e o BASE anteciparia entradas (I3 invertido).
      expect(p.perfilAtraso.atrasoMedioDias).toBe(e.perfilAtraso.atrasoMedioDias);
      expect(p.perfilAtraso.desvioPadraoDias).toBe(e.perfilAtraso.desvioPadraoDias);
      expect(p.perfilAtraso.amostra).toBe(e.perfilAtraso.amostra);
      expect(p.perfilAtraso.amostraInsuficiente).toBe(e.perfilAtraso.amostraInsuficiente);

      compararBuckets(p.buckets, e.buckets);

      expect(p.primeiroDiaNegativo).toBe(e.primeiroDiaNegativo); // null
      expect(
        p.menorSaldoProjetado.equals(D(e.menorSaldoProjetado)),
        `menorSaldoProjetado devolveu ${p.menorSaldoProjetado.toString()}, a fixture manda ${e.menorSaldoProjetado}`,
      ).toBe(true);
    });

    it('R2.4/4.6-bis: vencidas no PRIMEIRO bucket, assinaladas — nunca omitidas', async () => {
      const p = await projectar('BASE');
      const primeiro = p.buckets[0]!;
      const porOrigemId = new Map(primeiro.ocorrencias.map((o) => [o.origemId, o]));

      for (const numero of fixture.esperado.vencidasNoPrimeiroBucket.faturas) {
        const id = faturaIdPorNumero.get(numero);
        expect(id, `fatura ${numero} existe no seed`).toBeDefined();
        const o = porOrigemId.get(id!);
        expect(o, `fatura vencida ${numero} está no primeiro bucket`).toBeDefined();
        expect(o!.vencida, `fatura ${numero} assinalada como vencida`).toBe(true);
        expect(o!.tipo).toBe('ENTRADA');
      }
      for (const numero of fixture.esperado.vencidasNoPrimeiroBucket.contasPagar) {
        const id = contaPagarIdPorNumero.get(numero);
        expect(id, `conta a pagar ${numero} existe no seed`).toBeDefined();
        const o = porOrigemId.get(id!);
        expect(o, `conta a pagar vencida ${numero} está no primeiro bucket`).toBeDefined();
        expect(o!.vencida, `conta a pagar ${numero} assinalada como vencida`).toBe(true);
        expect(o!.tipo).toBe('SAIDA');
      }

      // Fronteira estrita: vence DENTRO do 1.º bucket mas depois da referência
      // — está no bucket e NÃO é vencida.
      for (const numero of fixture.esperado.naoVencidasNoPrimeiroBucket.faturas) {
        const o = porOrigemId.get(faturaIdPorNumero.get(numero)!);
        expect(o, `fatura ${numero} está no primeiro bucket`).toBeDefined();
        expect(o!.vencida, `fatura ${numero} NÃO é vencida`).toBe(false);
      }
    });

    it('PESSIMISTA: exclui as ENTRADAS vencidas há > 90 dias, e só essas', async () => {
      const p = await projectar('PESSIMISTA');
      const e = fixture.pessimista;

      const idsEmBuckets = new Set(
        p.buckets.flatMap((b) => b.ocorrencias.map((o) => o.origemId)),
      );
      for (const numero of e.excluidasMaisDe90Dias) {
        expect(
          idsEmBuckets.has(faturaIdPorNumero.get(numero)!),
          `fatura ${numero} (vencida há > 90 dias) fora de TODOS os buckets no PESSIMISTA`,
        ).toBe(false);
      }
      // A margem de dentro: vencida há 87 dias fica, assinalada, no 1.º bucket.
      const fronteira = p.buckets[0]!.ocorrencias.find(
        (o) => o.origemId === faturaIdPorNumero.get(e.incluidaNaFronteira),
      );
      expect(fronteira, `fatura ${e.incluidaNaFronteira} incluída`).toBeDefined();
      expect(fronteira!.vencida).toBe(true);

      compararBuckets(p.buckets, e.buckets);
      expect(
        p.primeiroDiaNegativo === null ? null : civil(p.primeiroDiaNegativo),
      ).toBe(e.primeiroDiaNegativo);
      expect(
        p.menorSaldoProjetado.equals(D(e.menorSaldoProjetado)),
        `menorSaldoProjetado devolveu ${p.menorSaldoProjetado.toString()}, a fixture manda ${e.menorSaldoProjetado}`,
      ).toBe(true);
    });
  },
);
