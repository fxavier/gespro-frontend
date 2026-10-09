/**
 * Oráculo estático — issues #101 e #265: nenhum formulário pede o identificador interno (CUID)
 * colado num campo de texto; as entidades escolhem-se por `Combobox`/`ComboboxRemoto`.
 *
 * Varre o CÓDIGO dos onze formulários da tabela da #265 (a página `page.tsx` e tudo o que ela
 * importa dentro de `src/`, com excepção das bibliotecas `components/ui` e `components/patterns`,
 * e do servidor): é a única prova que não depende de dados nem de servidor a correr. A escolha
 * pela UI prova-se em `e2e/53-combobox-ids-101-265.spec.ts`; as pesquisas no servidor em
 * `test/integration/combobox-ids-101-265.test.ts`.
 *
 * Contrato:
 *   1. Critério de aceitação literal da #265, alargado a minúsculas: em `src/app`, nenhum
 *      ficheiro tem «(CUID)» nem um `<Label>`/`<FormLabel>` que comece por «ID»/«IDs».
 *   2. Nos onze formulários, nenhum resquício do campo de id: placeholders com «cuid», «cmr…»,
 *      «ID do/da/de…», «IDs separados…», a nota «disponível após integração comercial» e a
 *      instrução «Introduza o ID…».
 *   3. Cada um dos onze formulários usa de facto uma `<Combobox>` ou `<ComboboxRemoto>` (no
 *      próprio formulário ou num componente de campo que ele importe, ex.: `CampoCliente`).
 *   4. Ninguém pede a primeira página ao servidor com termo vazio (`{ q: '' }`): a lista inicial
 *      vem por `opcoesIniciais`, carregada pelo Server Component.
 *   5. (#101) Na nova contagem de stock, os campos de localização e de categoria continuam e
 *      são combobox, não `<Input>` de texto onde se cola o id.
 *
 * ESTADO ESPERADO antes da implementação: RED nos quatro primeiros grupos (os onze formulários
 * ainda têm os campos de id).
 *
 * Escrito pelo verificador do nó B:combobox-ids-101-265; um agente de implementação que o
 * altere é BLOCKER.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const SRC = path.resolve(__dirname, '../../..'); // apps/erp/src
const APP = path.join(SRC, 'app');
const DASH = path.join(APP, '(dashboard)');

/** As onze rotas da tabela da #265 (as três da #101 que o #264 corrigiu já não estão aqui). */
const FORMULARIOS: Array<{ rota: string; campos: string }> = [
  { rota: 'compras/cotacoes/novo', campos: 'requisição de compra; fornecedores a convidar' },
  { rota: 'compras/pedidos/novo', campos: 'fornecedor; centro de custo; requisição; cotação' },
  { rota: 'vendas/devolucoes/nova', campos: 'cliente; venda; produto de cada linha' },
  { rota: 'vendas/comissoes/regras/nova', campos: 'vendedor' },
  { rota: 'servicos/contratos/novo', campos: 'cliente' },
  { rota: 'producao/estrutura/nova', campos: 'produto; componente' },
  { rota: 'producao/ordens/nova', campos: 'produto' },
  { rota: 'inventario/contagens/nova', campos: 'responsável' },
  { rota: 'projetos/orcamento/novo', campos: 'projecto' },
  { rota: 'rh/ausencias/nova', campos: 'colaborador' },
  { rota: 'rh/beneficios/atribuir', campos: 'benefício; colaborador' },
];

/** Bibliotecas e camadas que não são «o formulário» — não se desce nelas. */
const NAO_DESCER = [
  path.join(SRC, 'components', 'ui') + path.sep,
  path.join(SRC, 'components', 'patterns') + path.sep,
  path.join(SRC, 'server') + path.sep,
];

function resolverImport(de: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(de), spec);
  else return null; // pacote externo
  const candidatos = [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    path.join(base, 'index.tsx'),
    path.join(base, 'index.ts'),
  ];
  for (const c of candidatos) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

/** A página e tudo o que ela importa dentro de `src/` (fecho transitivo), fora de ui/patterns/server. */
function fechoDaRota(rota: string): Map<string, string> {
  const pagina = path.join(DASH, rota, 'page.tsx');
  const vistos = new Map<string, string>();
  const fila = [pagina];
  while (fila.length) {
    const f = fila.pop()!;
    if (vistos.has(f)) continue;
    if (NAO_DESCER.some((p) => f.startsWith(p))) continue;
    const texto = fs.readFileSync(f, 'utf8');
    vistos.set(f, texto);
    const re = /(?:import|export)\s[^'"`]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
    for (const m of texto.matchAll(re)) {
      const alvo = resolverImport(f, m[1] ?? m[2]);
      if (alvo && !vistos.has(alvo)) fila.push(alvo);
    }
  }
  return vistos;
}

function ficheirosTsx(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      out.push(...ficheirosTsx(p));
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

function linhasQueBatem(texto: string, re: RegExp): string[] {
  return texto
    .split('\n')
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => re.test(l))
    .map(({ l, i }) => `${i + 1}: ${l.trim()}`);
}

const rel = (f: string) => path.relative(SRC, f);

/** Resquícios do campo de id, linha a linha. */
const RESQUICIOS: Array<[string, RegExp]> = [
  ['«(CUID)»', /\(CUID\)/i],
  ['placeholder com «cuid»', /placeholder=\s*["'{`][^\n]*\bcuid\b/i],
  ['placeholder «cmr…»', /placeholder=\s*["'{`]\s*['"`]?cmr/i],
  ['placeholder «ID do/da/de…»', /placeholder=\s*["'{`]\s*['"`]?IDs?\s+d[aoe]s?\b/i],
  ['placeholder «IDs separados…»', /IDs?\s+separados/i],
  ['etiqueta que começa por «ID»', /<(?:Form)?Label\b[^>]*>\s*IDs?\b/],
  ['nota «integração comercial»', /integração comercial/i],
  ['instrução «Introduza o ID…»', /Introduza o ID/i],
];

describe('#265 — critério literal: nenhum «(CUID)» nem etiqueta «ID…» em src/app', () => {
  const ficheiros = ficheirosTsx(APP);

  it('varre ficheiros (sanidade do varrimento)', () => {
    expect(ficheiros.length).toBeGreaterThan(100);
  });

  it('nenhum ficheiro de src/app contém «(CUID)» nem um <Label>/<FormLabel> a começar por «ID»', () => {
    const achados: string[] = [];
    for (const f of ficheiros) {
      const texto = fs.readFileSync(f, 'utf8');
      for (const l of linhasQueBatem(texto, /\(CUID\)/i)) achados.push(`${rel(f)}:${l}`);
      for (const l of linhasQueBatem(texto, /<(?:Form)?Label\b[^>]*>\s*IDs?\b/)) achados.push(`${rel(f)}:${l}`);
    }
    expect(achados, `campos de id ainda presentes:\n${achados.join('\n')}`).toEqual([]);
  });
});

/**
 * #101 lista também «contagens de stock (localização/categoria)»: na nova contagem, os campos
 * `localizacaoId` e `categoriaId` eram `<Input>` de texto onde se colava o id (com placeholders
 * «Todas as localizações»/«Todos os produtos», que o varrimento de resquícios não apanha). Cada
 * um continua no formulário e passa a escolher-se numa combobox (lista pequena: `Combobox` local
 * carregado pelo Server Component, ou um componente de campo `Campo*` que a renderize).
 */
describe('#101 — /inventario/contagens/nova: localização e categoria escolhem-se numa combobox', () => {
  const fecho = fechoDaRota('inventario/contagens/nova');

  /** O bloco do campo `nome`: do `name="nome"` até ao próximo `name=` de outro campo (ou ao fim). */
  function blocoDoCampo(nome: string): { ficheiro: string; bloco: string } | null {
    const reNome = new RegExp(`name=\\s*\\{?\\s*["'\`]${nome}["'\`]`);
    for (const [f, texto] of fecho) {
      const m = reNome.exec(texto);
      if (!m) continue;
      const resto = texto.slice(m.index + m[0].length);
      const fim = resto.search(/name=\s*\{?\s*["'`]\w+["'`]/);
      return { ficheiro: rel(f), bloco: fim === -1 ? resto : resto.slice(0, fim) };
    }
    return null;
  }

  it.each(['localizacaoId', 'categoriaId'])('o campo %s existe e é uma combobox, não um <Input> de texto', (nome) => {
    const achado = blocoDoCampo(nome);
    expect(achado, `o campo ${nome} desapareceu da nova contagem — a contagem tem de poder ser restringida`).not.toBeNull();
    const { ficheiro, bloco } = achado!;
    expect(bloco, `${ficheiro}: o campo ${nome} ainda é um <Input> de texto`).not.toMatch(/<Input\b/);
    expect(bloco, `${ficheiro}: o campo ${nome} não renderiza uma <Combobox>/<ComboboxRemoto> nem um <Campo…>`).toMatch(
      /<Combobox(?:Remoto)?\b|<Campo[A-Z]\w*/,
    );
  });
});

describe.each(FORMULARIOS)('/$rota — escolhe a entidade numa combobox ($campos)', ({ rota }) => {
  const fecho = fechoDaRota(rota);

  it('a página existe e o varrimento chega ao formulário', () => {
    expect(fs.existsSync(path.join(DASH, rota, 'page.tsx')), `${rota}/page.tsx não existe`).toBe(true);
    // page.tsx + pelo menos o componente do formulário
    expect(fecho.size, `o fecho de ${rota} só tem ${[...fecho.keys()].map(rel).join(', ')}`).toBeGreaterThan(1);
  });

  it.each(RESQUICIOS)('sem %s', (_nome, re) => {
    const achados: string[] = [];
    for (const [f, texto] of fecho) {
      for (const l of linhasQueBatem(texto, re)) achados.push(`${rel(f)}:${l}`);
    }
    expect(achados, `resquício de campo de id:\n${achados.join('\n')}`).toEqual([]);
  });

  it('usa <Combobox> ou <ComboboxRemoto> (no formulário ou num campo que ele importe)', () => {
    const usos = [...fecho].filter(([, texto]) => /<Combobox(?:Remoto)?\b/.test(texto)).map(([f]) => rel(f));
    expect(usos.length, `nenhum ficheiro do fecho de ${rota} renderiza uma combobox`).toBeGreaterThan(0);
  });

  it('nunca pede a primeira página ao servidor com termo vazio ({ q: \'\' })', () => {
    const achados: string[] = [];
    for (const [f, texto] of fecho) {
      for (const l of linhasQueBatem(texto, /\bq\s*:\s*(?:''|""|``)/)) achados.push(`${rel(f)}:${l}`);
      for (const l of linhasQueBatem(texto, /procurar\w*\(\s*(?:''|""|``)\s*\)/)) achados.push(`${rel(f)}:${l}`);
    }
    expect(achados, `pesquisa com termo vazio:\n${achados.join('\n')}`).toEqual([]);
  });
});
