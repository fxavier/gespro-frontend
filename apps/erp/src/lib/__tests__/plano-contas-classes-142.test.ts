/**
 * Issue #142 — etiquetas das classes no formulário/detalhe de conta do plano (ORÁCULO,
 * escrito pelo verificador do nó D:conta-form-etiquetas-142; outro agente implementa).
 *
 * Contrato (decisão do orquestrador; opção conservadora onde ficou em aberto):
 *  - Uma constante ÚNICA `CLASSE_PGC_LABEL: Record<ClassePGC, string>` em `src/lib/plano-contas.ts`
 *    (módulo client-safe: o `conta-form.tsx` é Client Component — nada de `server-only`), com os
 *    nomes PGC-NIRF das classes tal como estão nas contas de nível 1 de
 *    `prisma/seed/data/plano-contas-pgc.json` (ex.: Classe 4 — Contas a receber, contas a pagar,
 *    acréscimos e diferimentos; nunca «Investimentos»).
 *  - `conta-form.tsx` e `[id]/page.tsx` do plano de contas importam-na de `@/lib/plano-contas`;
 *    nenhum ficheiro em `src/app` volta a declarar etiquetas «Classe N — …» à mão.
 *  - O campo Código não sugere o formato com pontos (`1.1.1`): os códigos do plano são sem pontos.
 *  - O diálogo de desactivar deixa de prometer reactivação «pela edição» (a reactivação é um
 *    botão próprio no detalhe — ver o oráculo E2E e o de integração da mesma issue).
 *
 * O módulo é importado por caminho dinâmico e lido por `any`: cada caso falha pelo
 * comportamento em falta, não o ficheiro.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ClassePGCEnum } from '@/lib/validations/contabilidade';

const RAIZ = path.resolve(__dirname, '../../..'); // apps/erp
const SRC = path.join(RAIZ, 'src');
const APP = path.join(SRC, 'app');
const PLANO = path.join(APP, '(dashboard)', 'contabilidade', 'plano-contas');
const FORM = path.join(PLANO, '_components', 'conta-form.tsx');
const DETALHE = path.join(PLANO, '[id]', 'page.tsx');
const DESACTIVAR = path.join(PLANO, '_components', 'desactivar-conta.tsx');
const PGC_JSON = path.join(RAIZ, 'prisma', 'seed', 'data', 'plano-contas-pgc.json');

async function modulo(): Promise<any> {
  const caminho = '@/lib/plano-contas';
  try {
    return await import(/* @vite-ignore */ caminho);
  } catch {
    return {};
  }
}

/** Nome PGC de cada classe = nome da conta de nível 1 no plano semeado. */
function nomesDoPlano(): Record<string, string> {
  const contas = JSON.parse(readFileSync(PGC_JSON, 'utf8')) as Array<{
    nivel: number;
    classe: number;
    nome: string;
  }>;
  const nomes: Record<string, string> = {};
  for (const c of contas) if (c.nivel === 1) nomes[`CLASSE_${c.classe}`] = c.nome;
  return nomes;
}

function ficheirosTsx(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...ficheirosTsx(p));
    else if (/\.(tsx?|jsx?)$/.test(nome) && !/\.test\./.test(nome)) out.push(p);
  }
  return out;
}

const IMPORTA_CONSTANTE = /import\s*\{[^}]*\bCLASSE_PGC_LABEL\b[^}]*\}\s*from\s*['"]@\/lib\/plano-contas['"]/;
const ETIQUETA_A_MAO = /['"`]Classe [1-8] —/;

describe('#142 — etiquetas das classes PGC-NIRF', () => {
  it('o plano semeado tem as 8 classes (pré-condição do oráculo)', () => {
    const nomes = nomesDoPlano();
    expect(Object.keys(nomes).sort()).toEqual([...ClassePGCEnum.options].sort());
    expect(nomes.CLASSE_4).toMatch(/Contas a receber/);
  });

  it('CLASSE_PGC_LABEL existe em @/lib/plano-contas e cobre exactamente as classes do enum', async () => {
    const m = await modulo();
    expect(m.CLASSE_PGC_LABEL, 'CLASSE_PGC_LABEL não está exportada de src/lib/plano-contas.ts').toBeTypeOf('object');
    expect(Object.keys(m.CLASSE_PGC_LABEL ?? {}).sort()).toEqual([...ClassePGCEnum.options].sort());
  });

  it('cada etiqueta é o nome PGC-NIRF da classe (o da conta de nível 1 do plano)', async () => {
    const m = await modulo();
    const nomes = nomesDoPlano();
    for (const classe of ClassePGCEnum.options) {
      expect(m.CLASSE_PGC_LABEL?.[classe], classe).toBe(nomes[classe]);
    }
  });

  it('nenhuma etiqueta errada: classe 2 não é «Contas a receber/pagar», 3 não é «Existências», 4 não é «Investimentos»', async () => {
    const m = await modulo();
    const l = m.CLASSE_PGC_LABEL ?? {};
    expect(l.CLASSE_2 ?? '').toMatch(/Inventários/);
    expect(l.CLASSE_3 ?? '').toMatch(/Investimentos/);
    expect(l.CLASSE_4 ?? '').toMatch(/Contas a receber/);
    expect(l.CLASSE_4 ?? '').not.toMatch(/Investimentos/);
  });

  it('o formulário de conta usa a constante única e não declara etiquetas de classe à mão', () => {
    const fonte = readFileSync(FORM, 'utf8');
    expect(fonte).toMatch(IMPORTA_CONSTANTE);
    expect(fonte).not.toMatch(ETIQUETA_A_MAO);
  });

  it('o detalhe da conta usa a constante única e não declara etiquetas de classe à mão', () => {
    const fonte = readFileSync(DETALHE, 'utf8');
    expect(fonte).toMatch(IMPORTA_CONSTANTE);
    expect(fonte).not.toMatch(ETIQUETA_A_MAO);
  });

  it('nenhum ficheiro de src/app declara etiquetas «Classe N — …» à mão', () => {
    const culpados = ficheirosTsx(APP).filter((f) => ETIQUETA_A_MAO.test(readFileSync(f, 'utf8')));
    expect(culpados.map((f) => path.relative(RAIZ, f))).toEqual([]);
  });

  it('o campo Código não sugere o formato com pontos (1.1.1): os códigos do plano não têm pontos', () => {
    const fonte = readFileSync(FORM, 'utf8');
    expect(fonte).not.toContain('1.1.1');
  });

  it('o diálogo de desactivar não promete reactivar «pela edição»', () => {
    const fonte = readFileSync(DESACTIVAR, 'utf8');
    expect(fonte).not.toMatch(/pela\s+edição/);
  });
});
