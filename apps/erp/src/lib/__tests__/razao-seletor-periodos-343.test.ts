/**
 * ORÁCULO #343 — o selector do razão usa os controlos de exercício e períodos do balancete.
 *
 * Escrito pelo VERIFICADOR; um agente de implementação que altere este ficheiro é BLOCKER.
 *
 * Contrato (fixado pelo orquestrador):
 *   O «Exercício», «Do período» e «Ao período» do razão (/contabilidade/razao-geral) deixam de
 *   ser `<select>` nativo e `Input type=number`, e passam a reutilizar os controlos do balancete
 *   (`ui/Select` com as opções de período do balancete, o 13 só com «Incluir período 13»). O URL
 *   que o «Consultar» empurra tem o MESMO formato que o drill-down do balancete já gera
 *   (`hrefRazaoPeriodos`).
 *
 * Para que haja UMA regra e não duas cópias, as peças partilhadas vivem em
 * `src/lib/balancete-params.ts` (client-safe):
 *   - `opcoesPeriodo(incluir13: boolean): { value: string; label: string }[]`
 *       12 opções «01 — Janeiro» … «12 — Dezembro»; com `incluir13`, mais «13 — Encerramento».
 *       (separador U+2014, como o balancete já mostra).
 *   - `normalizarIntervaloPeriodos({ periodoInicial, periodoFinal, incluir13 })`
 *       a mesma normalização que `lerParametrosBalancete` aplica ao URL: final ≤ 12 sem p13,
 *       inicial ≤ final. É o que o «Consultar» do razão e o «Aplicar» do balancete escrevem.
 *
 * Os dois selectores importam-nas daí (verificação estrutural no fim — a prova
 * comportamental é o E2E `60-razao-seletor-periodos-343.spec.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Import dinâmico + acesso `any`: o ficheiro compila e falha por CASO enquanto as
// funções não existirem («… is not a function»), não por erro de tipo.
const modulo = async (): Promise<any> => import('../balancete-params');

type Intervalo = { periodoInicial: number; periodoFinal: number; incluir13: boolean };

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

describe('#343 opcoesPeriodo — as opções de período do balancete, partilhadas', () => {
  it('sem período 13: exactamente 12 opções, «01 — Janeiro» … «12 — Dezembro»', async () => {
    const { opcoesPeriodo } = await modulo();
    const opcoes = opcoesPeriodo(false) as { value: string; label: string }[];
    expect(opcoes).toEqual(
      MESES.map((m, i) => ({
        value: String(i + 1),
        label: `${String(i + 1).padStart(2, '0')} — ${m}`,
      })),
    );
    expect(opcoes.some((o) => o.value === '13'), 'o 13 só aparece com p13').toBe(false);
  });

  it('com período 13: as mesmas 12 e, no fim, «13 — Encerramento»', async () => {
    const { opcoesPeriodo } = await modulo();
    const sem = opcoesPeriodo(false) as { value: string; label: string }[];
    const com = opcoesPeriodo(true) as { value: string; label: string }[];
    expect(com).toHaveLength(13);
    expect(com.slice(0, 12)).toEqual(sem);
    expect(com[12]).toEqual({ value: '13', label: '13 — Encerramento' });
  });

  it('os valores são inteiros sem zero à esquerda (o formato de de=/ate= do drill-down)', async () => {
    const { opcoesPeriodo } = await modulo();
    for (const o of opcoesPeriodo(true) as { value: string }[]) {
      expect(o.value).toMatch(/^(?:[1-9]|1[0-3])$/);
    }
  });
});

describe('#343 normalizarIntervaloPeriodos — a regra do servidor, aplicada antes do push', () => {
  const casos: Array<[string, Intervalo, Intervalo]> = [
    ['intervalo válido fica igual', { periodoInicial: 3, periodoFinal: 5, incluir13: false }, { periodoInicial: 3, periodoFinal: 5, incluir13: false }],
    ['ate=13 sem p13 é cortado a 12', { periodoInicial: 3, periodoFinal: 13, incluir13: false }, { periodoInicial: 3, periodoFinal: 12, incluir13: false }],
    ['de=13 e ate=13 sem p13 caem ambos para 12', { periodoInicial: 13, periodoFinal: 13, incluir13: false }, { periodoInicial: 12, periodoFinal: 12, incluir13: false }],
    ['inicial > final: o inicial desce ao final', { periodoInicial: 7, periodoFinal: 4, incluir13: false }, { periodoInicial: 4, periodoFinal: 4, incluir13: false }],
    ['com p13 o 13 mantém-se', { periodoInicial: 12, periodoFinal: 13, incluir13: true }, { periodoInicial: 12, periodoFinal: 13, incluir13: true }],
    ['com p13, 13..13', { periodoInicial: 13, periodoFinal: 13, incluir13: true }, { periodoInicial: 13, periodoFinal: 13, incluir13: true }],
  ];

  for (const [nome, entrada, esperado] of casos) {
    it(nome, async () => {
      const { normalizarIntervaloPeriodos } = await modulo();
      expect(normalizarIntervaloPeriodos(entrada)).toEqual(esperado);
    });
  }

  it('concorda com lerParametrosBalancete para todas as combinações 1..13 × 1..13 × p13', async () => {
    const { normalizarIntervaloPeriodos, lerParametrosBalancete } = await modulo();
    const exercicios = [
      { id: 'ex-2026', codigo: '2026', dataInicio: new Date('2025-12-31T22:00:00Z'), dataFim: new Date('2026-12-31T21:59:59Z') },
    ];
    for (const incluir13 of [false, true]) {
      for (let de = 1; de <= 13; de++) {
        for (let ate = 1; ate <= 13; ate++) {
          const params: Record<string, string> = { exercicio: '2026', de: String(de), ate: String(ate) };
          if (incluir13) params.p13 = '1';
          const lido = lerParametrosBalancete(params, { exercicios, mesAtual: 6 });
          const { exercicioId: _ignorado, ...servidor } = lido.filtroServico;
          void _ignorado;
          expect(
            normalizarIntervaloPeriodos({ periodoInicial: de, periodoFinal: ate, incluir13 }),
            `de=${de} ate=${ate} p13=${incluir13}`,
          ).toEqual(servidor);
        }
      }
    }
  });

  it('normalizar + hrefRazaoPeriodos é ponto fixo da leitura do URL (o razão relê o que escreveu)', async () => {
    const { normalizarIntervaloPeriodos, hrefRazaoPeriodos, lerParametrosBalancete } = await modulo();
    const exercicios = [
      { id: 'ex-2026', codigo: '2026', dataInicio: new Date('2025-12-31T22:00:00Z'), dataFim: new Date('2026-12-31T21:59:59Z') },
    ];
    const intervalo = normalizarIntervaloPeriodos({ periodoInicial: 9, periodoFinal: 13, incluir13: false });
    const href: string = hrefRazaoPeriodos('conta-1', '2026', intervalo);
    const u = new URL(href, 'http://localhost');
    expect(Object.fromEntries(u.searchParams)).toEqual({ contaId: 'conta-1', exercicio: '2026', de: '9', ate: '12' });
    const relido = lerParametrosBalancete(u.searchParams, { exercicios, mesAtual: 6 });
    expect(relido.filtroServico).toEqual({ exercicioId: 'ex-2026', ...intervalo });
  });
});

describe('#343 estrutura — os dois selectores usam as peças partilhadas', () => {
  const raiz = path.resolve(__dirname, '../../app/(dashboard)/contabilidade');
  const ler = (rel: string) => fs.readFileSync(path.join(raiz, rel), 'utf8');
  const RAZAO = 'razao-geral/_components/seletor-conta.tsx';
  const BALANCETE = 'balancete/_components/seletor-balancete-verificacao.tsx';

  it('o selector do razão não tem <select> nativo nem campos numéricos de período', () => {
    const src = ler(RAZAO);
    expect(src, '<select> nativo no razão').not.toMatch(/<select\b/);
    expect(src, 'Input type=number no razão').not.toMatch(/type=["']number["']/);
    expect(src, 'usa o ui/Select').toMatch(/from ['"]@\/components\/ui\/select['"]/);
  });

  it('o razão importa opcoesPeriodo e normalizarIntervaloPeriodos de @/lib/balancete-params', () => {
    const src = ler(RAZAO);
    const imp = src.match(/import\s*\{([^}]*)\}\s*from\s*['"]@\/lib\/balancete-params['"]/);
    expect(imp, 'import de @/lib/balancete-params').not.toBeNull();
    expect(imp![1]).toMatch(/\bopcoesPeriodo\b/);
    expect(imp![1]).toMatch(/\bnormalizarIntervaloPeriodos\b/);
  });

  it('o balancete deixa de ter a sua cópia local das opções e usa as mesmas', () => {
    const src = ler(BALANCETE);
    expect(src, 'cópia local OPCOES_PERIODO/NOMES_MES').not.toMatch(/const\s+(?:OPCOES_PERIODO|NOMES_MES)\b/);
    const imp = src.match(/import\s*\{([^}]*)\}\s*from\s*['"]@\/lib\/balancete-params['"]/);
    expect(imp, 'import de @/lib/balancete-params').not.toBeNull();
    expect(imp![1]).toMatch(/\bopcoesPeriodo\b/);
  });
});
