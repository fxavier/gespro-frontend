// ---------------------------------------------------------------------------
// Autoteste da sentinela de versões da golden da DFC (revisão 2026-09-26) —
// escrito pelo verificador-fluxo-caixa. FICHEIRO PROTEGIDO (doutrina 00 §2).
//
// Prova que a sentinela nova:
//  - ACEITA versões posteriores (PENDING ou VALIDATED) com o conteúdo do seed;
//  - RECUSA, com «a base tem resíduos», um vivo diferente do seed, uma versão
//    mais recente diferente do seed, e a falta da versão semeada.
// Tudo por injecção: a base é só LIDA (para partir do estado real), nunca escrita.
// ---------------------------------------------------------------------------
import { afterAll, describe, expect, it, vi } from 'vitest';
import { prismaBase } from '@/server/db/client';
import type { InstantaneoMapeamento } from '../dfc.interface';
import {
  lerVersoesDoMapeamento,
  resolverTenantDemo,
  verificarSentinelas,
  verificarVersoesDoMapeamento,
  type EstadoVersoesMapeamento,
  type VersaoLida,
} from './helpers/dfc-golden';

const hasDB = Boolean(process.env.DATABASE_URL);
// Só na base LOCAL (issue #237): estes oráculos comparam a base semeada do tenant `demo` com
// uma fixture derivada do seed num dia civil fixo. No CI a base é semeada no dia da corrida e a
// fixture nunca bate, por isso não correm lá (o GitHub Actions define CI=true em todos os passos).
// Localmente continuam a correr dentro do `pnpm check`, com as mesmas asserções.
const noCI = Boolean(process.env.CI);

const RUB = (id: string, codigo: string, atividade: string, ordem: number) => ({
  id,
  codigo,
  designacao: `Rubrica ${codigo}`,
  atividade,
  sinal: 'POSITIVO',
  ordem,
  origem: 'SEED',
  ativo: true,
});

/** Um instantâneo sintético pequeno, na forma canónica. */
const SEED: InstantaneoMapeamento = {
  rubricas: [RUB('r-cx', 'CX-01', 'CAIXA', 1), RUB('r-op', 'OP-04', 'OPERACIONAL', 4)],
  mapeamentos: [
    { contaId: 'c-121', rubricaId: 'r-cx' },
    { contaId: 'c-411', rubricaId: 'r-op' },
  ],
} as unknown as InstantaneoMapeamento;

const clonar = (i: InstantaneoMapeamento): InstantaneoMapeamento => JSON.parse(JSON.stringify(i));
const versao = (numero: number, estado: string, instantaneo: InstantaneoMapeamento): VersaoLida => ({
  id: `v${numero}`,
  numero,
  estado,
  instantaneo,
});
const desordenado = (i: InstantaneoMapeamento): InstantaneoMapeamento => ({
  rubricas: [...i.rubricas].reverse(),
  mapeamentos: [...i.mapeamentos].reverse(),
});
const comMapeamentoMovido = (i: InstantaneoMapeamento): InstantaneoMapeamento => {
  const c = clonar(i);
  const outra = c.rubricas.find((r) => r.id !== c.mapeamentos[0]!.rubricaId)!;
  c.mapeamentos[0] = { ...c.mapeamentos[0]!, rubricaId: outra.id };
  return c;
};

describe('sentinela de versões da golden — pura', () => {
  it('aceita: só a versão 1, e o vivo igual a ela', () => {
    expect(verificarVersoesDoMapeamento({ referencia: versao(1, 'PENDING', SEED), recente: versao(1, 'PENDING', SEED), vivo: clonar(SEED) })).toEqual([]);
  });

  it('aceita: versão 7 VALIDATED posterior com o conteúdo do seed (lida desordenada), e o vivo igual', () => {
    const e: EstadoVersoesMapeamento = {
      referencia: versao(1, 'PENDING', SEED),
      recente: versao(7, 'VALIDATED', desordenado(SEED)),
      vivo: desordenado(SEED),
    };
    expect(verificarVersoesDoMapeamento(e)).toEqual([]);
  });

  it('aceita: versão 2 PENDING posterior com o conteúdo do seed', () => {
    expect(verificarVersoesDoMapeamento({ referencia: versao(1, 'VALIDATED', SEED), recente: versao(2, 'PENDING', clonar(SEED)), vivo: clonar(SEED) })).toEqual([]);
  });

  it('TEM de recusar: o vivo tem um mapeamento movido (a recente continua igual ao seed)', () => {
    const d = verificarVersoesDoMapeamento({ referencia: versao(1, 'PENDING', SEED), recente: versao(1, 'PENDING', SEED), vivo: comMapeamentoMovido(SEED) });
    expect(d).toHaveLength(1);
    expect(d[0]).toMatch(/mapeamento vivo é diferente/);
  });

  it('TEM de recusar: o vivo tem uma rubrica com designação mudada', () => {
    const vivo = clonar(SEED);
    vivo.rubricas[1] = { ...vivo.rubricas[1]!, designacao: 'Outra coisa' };
    expect(verificarVersoesDoMapeamento({ referencia: versao(1, 'PENDING', SEED), recente: versao(2, 'PENDING', vivo), vivo })).toHaveLength(2);
  });

  it('TEM de recusar: a versão mais recente diverge do seed, mesmo com o vivo igual ao seed', () => {
    const d = verificarVersoesDoMapeamento({ referencia: versao(1, 'PENDING', SEED), recente: versao(3, 'VALIDATED', comMapeamentoMovido(SEED)), vivo: clonar(SEED) });
    expect(d).toHaveLength(1);
    expect(d[0]).toMatch(/versão mais recente \(3, VALIDATED\)/);
  });

  it('TEM de recusar: a versão semeada não existe', () => {
    expect(verificarVersoesDoMapeamento({ referencia: null, recente: versao(2, 'PENDING', SEED), vivo: clonar(SEED) })[0]).toMatch(/não existe/);
  });

  it('TEM de recusar: o vivo nem se deixa congelar (conta em dois mapeamentos)', () => {
    const d = verificarVersoesDoMapeamento({ referencia: versao(1, 'PENDING', SEED), recente: versao(1, 'PENDING', SEED), vivo: new Error('A conta c-121 aparece em dois mapeamentos.') });
    expect(d[0]).toMatch(/não se deixa congelar/);
  });
});

describe.skipIf(!hasDB || noCI)('sentinela de versões da golden — a partir do estado REAL da base (só leitura, injecção em memória)', () => {
  afterAll(async () => {
    await prismaBase.$disconnect();
  });

  it('a base local passa a sentinela inteira (verificarSentinelas não lança)', async () => {
    const { tenantId } = await resolverTenantDemo();
    await expect(verificarSentinelas(tenantId)).resolves.toBeUndefined();
  });

  it('aceita o estado real com uma versão 9 VALIDATED injectada com o instantâneo semeado; recusa o vivo real com um mapeamento movido', async () => {
    const { tenantId } = await resolverTenantDemo();
    const real = await lerVersoesDoMapeamento(tenantId);
    expect(real.referencia, 'a versão semeada existe').not.toBeNull();
    expect(real.vivo).not.toBeInstanceOf(Error);
    expect(verificarVersoesDoMapeamento(real), 'estado real').toEqual([]);

    const ref = real.referencia!;
    const comV9: EstadoVersoesMapeamento = { ...real, recente: { ...ref, id: 'injectada', numero: 9, estado: 'VALIDATED', instantaneo: desordenado(clonar(ref.instantaneo)) } };
    expect(verificarVersoesDoMapeamento(comV9), 'v9 igual ao seed').toEqual([]);

    const vivoMovido: EstadoVersoesMapeamento = { ...comV9, vivo: comMapeamentoMovido(real.vivo as InstantaneoMapeamento) };
    expect(verificarVersoesDoMapeamento(vivoMovido)).toEqual([
      `o mapeamento vivo é diferente do instantâneo da versão ${ref.numero} semeada (V1)`,
    ]);

    const recenteMovida: EstadoVersoesMapeamento = { ...real, recente: { ...ref, numero: 4, estado: 'PENDING', instantaneo: comMapeamentoMovido(ref.instantaneo) } };
    expect(verificarVersoesDoMapeamento(recenteMovida)).toHaveLength(1);
  });

  it('TEM de recusar pelo caminho inteiro: verificarSentinelas lança «a base tem resíduos» com um vivo diferente injectado na leitura', async () => {
    const { tenantId } = await resolverTenantDemo();
    const delegado = prismaBase.mapeamentoContaFluxo;
    const original = delegado.findMany.bind(delegado);
    // Só a leitura crua conta→rubrica (a do instantâneo do vivo) é adulterada:
    // a primeira conta passa para a rubrica da segunda. Nada é escrito.
    const espiao = vi.spyOn(delegado, 'findMany').mockImplementation((async (args: Parameters<typeof original>[0]) => {
      const linhas = (await original(args)) as Array<{ contaId?: string; rubricaId?: string }>;
      const cru = args?.select && 'contaId' in args.select && 'rubricaId' in args.select && !('conta' in args.select);
      if (!cru) return linhas;
      const i = linhas.findIndex((l) => l.rubricaId !== linhas[0]!.rubricaId);
      return linhas.map((l, j) => (j === 0 ? { ...l, rubricaId: linhas[i]!.rubricaId } : l));
    }) as unknown as typeof delegado.findMany);
    try {
      await expect(verificarSentinelas(tenantId)).rejects.toThrow(
        /a base tem resíduos[\s\S]*mapeamento vivo é diferente do instantâneo da versão 1 semeada/,
      );
      expect(espiao).toHaveBeenCalled();
    } finally {
      espiao.mockRestore();
    }
    await expect(verificarSentinelas(tenantId), 'restaurada a leitura, volta a passar').resolves.toBeUndefined();
  });
});
