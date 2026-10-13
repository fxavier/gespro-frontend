/**
 * Oráculo #107 — mensagens com jargão interno não chegam ao utilizador.
 *
 * Contrato (decisão do orquestrador, a opção mais conservadora):
 *   - As mensagens de `BusinessRuleError`/`NotFoundError`/`ValidationError`/`ForbiddenError`/
 *     `AppError` lançadas em `src/server/services` não dizem «tenant» (nem «neste tenant»,
 *     nem «Tenant não encontrado») nem nomes de modelos Prisma/identificadores internos
 *     (`RequisicaoCompra`, `SessaoPOS`, `NotaCredito`, `Comissao`, `ContagemStock`…).
 *   - Todas as máquinas de estado `transitar*` exportadas recusam uma transição inválida com
 *     `BusinessRuleError` (código ESTÁVEL `TRANSICAO_INVALIDA`, 409) — nunca `Error` cru (500).
 *   - Os CÓDIGOS não mudam. A frase «Transição inválida» e os valores de estado em bruto
 *     (`PENDENTE → CANCELADA`) continuam permitidos: não são o jargão que a issue aponta, e
 *     os testes existentes (`toThrow(/Transi/)`) afirmam-nos.
 *
 * Os genéricos `transitar(mapa, nome, atual, alvo)` (compras, inventário) recebem o nome da
 * entidade do chamador: o teste lê os nomes que os chamadores passam DE FACTO (literal no
 * ficheiro do serviço) e exige que a mensagem resultante não tenha jargão — vale mapear no
 * genérico ou passar já um rótulo em português no chamador.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AppError, BusinessRuleError } from '@/lib/errors';

// compras.service importa o cliente Prisma e contratos de outros domínios: dobra-os.
vi.mock('@/server/db/client', () => ({ prisma: {}, prismaBase: {} }));
vi.mock('@/server/services/inventario/stock.service', () => ({ entradaStock: vi.fn() }));
vi.mock('@/server/services/financas/faturacao.service', () => ({ proximoNumeroSerie: vi.fn() }));
vi.mock('@/server/services/financas/contabilidade.service', () => ({
  registarLancamentoContabilistico: vi.fn(),
}));

const SERVICOS = path.resolve(__dirname, '..');

// ─── Detector de jargão ─────────────────────────────────────────────────────

/** Marcas próprias que são PascalCase e não são jargão. */
const PERMITIDOS_CAMEL = new Set(['GestPro']);

/** Devolve as ofensas encontradas numa mensagem (vazio = mensagem limpa). */
function jargao(msg: string): string[] {
  const ofensas: string[] = [];
  if (/\btenants?\b/i.test(msg)) ofensas.push('«tenant»');
  for (const m of msg.match(/\b[A-Z][a-z]+[A-Z][A-Za-z]*\b/g) ?? []) {
    if (!PERMITIDOS_CAMEL.has(m)) ofensas.push(`identificador interno «${m}»`);
  }
  // Português sem acento em -ção/-são é nome de modelo/enum em minúsculas (Comissao, Cotacao…).
  for (const m of msg.match(/\b(?:[A-Z][a-z]+|[a-z]+)(?:cao|sao|coes|soes)\b/g) ?? []) {
    ofensas.push(`identificador sem acento «${m}»`);
  }
  return ofensas;
}

describe('#107 — detector de jargão (autoteste do oráculo)', () => {
  it.each([
    'NUIT 400000001 já registado neste tenant',
    'Transição inválida de RequisicaoCompra: PENDENTE → RASCUNHO',
    'Transição inválida de Comissao: PAGA → PENDENTE',
    'NotaCredito: transição inválida LIQUIDADA → EMITIDA',
    'Tenant não encontrado',
  ])('acusa «%s»', (msg) => {
    expect(jargao(msg)).not.toEqual([]);
  });

  it.each([
    'Já existe um fornecedor com o NUIT 400000001.',
    'Transição inválida de requisição de compra: PENDENTE → RASCUNHO',
    'A comissão não pode passar de PAGA a PENDENTE.',
    'Este endereço de e-mail já está associado a uma conta GestPro.',
    'Empresa não encontrada',
  ])('aceita «%s»', (msg) => {
    expect(jargao(msg)).toEqual([]);
  });
});

// ─── A. Varrimento das mensagens literais dos serviços ──────────────────────

function ficheirosServico(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : ficheirosServico(p);
    return e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [p] : [];
  });
}

/** Argumentos de topo de uma chamada, a partir do índice logo a seguir ao `(`. */
function argumentosDeTopo(src: string, inicio: number): string[] {
  const args: string[] = [];
  let prof = 1;
  let aspa: string | null = null;
  let actual = '';
  for (let j = inicio; j < src.length; j++) {
    const c = src[j];
    if (aspa) {
      actual += c;
      if (c === '\\') {
        actual += src[++j];
        continue;
      }
      if (c === aspa) aspa = null;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      aspa = c;
      actual += c;
      continue;
    }
    if (c === '(' || c === '{' || c === '[') prof++;
    else if (c === ')' || c === '}' || c === ']') {
      prof--;
      if (prof === 0) {
        args.push(actual);
        return args;
      }
    } else if (c === ',' && prof === 1) {
      args.push(actual);
      actual = '';
      continue;
    }
    actual += c;
  }
  return args;
}

/** Texto dos literais de string de uma expressão (`${…}` substituído por «·»). */
function textoDosLiterais(expr: string): string {
  const out: string[] = [];
  const re = /'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(expr))) out.push((m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, '·'));
  return out.join(' ');
}

const CONSTRUTORES = /new\s+(BusinessRuleError|NotFoundError|ValidationError|ForbiddenError|AppError)\s*\(/g;

function mensagensLiterais(): Array<{ onde: string; msg: string }> {
  const achados: Array<{ onde: string; msg: string }> = [];
  for (const f of ficheirosServico(SERVICOS)) {
    const src = fs.readFileSync(f, 'utf8');
    let m: RegExpExecArray | null;
    CONSTRUTORES.lastIndex = 0;
    while ((m = CONSTRUTORES.exec(src))) {
      const args = argumentosDeTopo(src, m.index + m[0].length);
      // BusinessRuleError/AppError: (código, mensagem, …); os outros: (mensagem, …).
      const arg = m[1] === 'BusinessRuleError' || m[1] === 'AppError' ? args[1] : args[0];
      if (!arg) continue;
      const msg = textoDosLiterais(arg);
      if (!msg) continue;
      const linha = src.slice(0, m.index).split('\n').length;
      achados.push({ onde: `${path.relative(SERVICOS, f)}:${linha}`, msg });
    }
  }
  return achados;
}

describe('#107 A — mensagens literais de erro dos serviços', () => {
  it('o varrimento encontra as mensagens (o oráculo não está a olhar para o vazio)', () => {
    expect(mensagensLiterais().length).toBeGreaterThan(200);
  });

  it('nenhuma mensagem de erro de domínio fala em «tenant» nem em identificadores internos', () => {
    const ofensas = mensagensLiterais()
      .map(({ onde, msg }) => ({ onde, msg, o: jargao(msg) }))
      .filter((x) => x.o.length > 0)
      .map((x) => `${x.onde}  ${x.o.join(', ')}  «${x.msg.slice(0, 90)}»`);
    expect(ofensas, `mensagens com jargão:\n${ofensas.join('\n')}`).toEqual([]);
  });

  it('nenhuma frase «neste/deste/este/ao tenant» em código (constantes e mensagens montadas fora do construtor)', () => {
    const ofensas: string[] = [];
    for (const f of ficheirosServico(SERVICOS)) {
      fs.readFileSync(f, 'utf8')
        .split('\n')
        .forEach((l, i) => {
          const t = l.trim();
          if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return;
          const codigo = l.replace(/\s\/\/\s.*$/, '');
          if (/\b(neste|deste|este|nesse|desse|ao) tenant\b/i.test(codigo)) {
            ofensas.push(`${path.relative(SERVICOS, f)}:${i + 1}  ${t.slice(0, 100)}`);
          }
        });
    }
    expect(ofensas, `frases com «tenant»:\n${ofensas.join('\n')}`).toEqual([]);
  });
});

// ─── B. Máquinas de estado: BusinessRuleError, código estável, sem jargão ───

type Mapa = Record<string, readonly string[]>;

/** Um par (de, para) que o mapa recusa. */
function parInvalido(mapa: Mapa): [string, string] {
  const estados = Object.keys(mapa);
  for (const de of estados) {
    for (const para of estados) {
      if (!(mapa[de] ?? []).includes(para)) return [de, para];
    }
  }
  throw new Error('mapa sem transições inválidas — escolhe outro caso');
}

function capturar(fn: () => void): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
}

function exigirRecusaLimpa(erro: unknown, contexto: string): void {
  expect(erro, `${contexto}: a transição inválida tinha de ser recusada`).toBeDefined();
  expect(erro, `${contexto}: tem de ser BusinessRuleError (não Error cru → 500)`).toBeInstanceOf(
    BusinessRuleError,
  );
  const e = erro as AppError;
  expect(e).toBeInstanceOf(AppError);
  expect(e.code, `${contexto}: o código é estável`).toBe('TRANSICAO_INVALIDA');
  expect(e.status, contexto).toBe(409);
  expect(e.message.trim().length, `${contexto}: mensagem vazia`).toBeGreaterThan(10);
  expect(jargao(e.message), `${contexto}: «${e.message}»`).toEqual([]);
}

describe('#107 B — transitar* exportados recusam com BusinessRuleError e mensagem limpa', async () => {
  const comissao = await import('@/server/services/comercial/comissao.interface');
  const venda = await import('@/server/services/comercial/venda.interface');
  const contaPagar = await import('@/server/services/compras/conta-pagar.service.interface');
  const apuramento = await import('@/server/services/financas/apuramento-iva.interface');
  const caixa = await import('@/server/services/financas/caixa.interface');
  const contab = await import('@/server/services/financas/contabilidade.interface');
  const fat = await import('@/server/services/financas/faturacao.interface');
  const reconc = await import('@/server/services/reconciliacao/reconciliacao.model');
  const estados = await import('@/lib/state-machines');

  // [nome, função, mapa]
  const casos: Array<[string, (a: string, b: string) => void, Mapa]> = [
    ['transitarComissao', comissao.transitarComissao as never, comissao.TRANSICOES_COMISSAO],
    ['transitarVenda', venda.transitarVenda as never, venda.TRANSICOES_VENDA],
    ['transitarSessaoPOS', venda.transitarSessaoPOS as never, venda.TRANSICOES_SESSAO_POS],
    ['transitarContaPagar', contaPagar.transitarContaPagar as never, contaPagar.TRANSICOES_CONTA_PAGAR],
    ['transitarPagamento', contaPagar.transitarPagamento as never, contaPagar.TRANSICOES_PAGAMENTO],
    ['transitarApuramento', apuramento.transitarApuramento as never, apuramento.TRANSICOES_APURAMENTO],
    ['transitarSessaoCaixa', caixa.transitarSessaoCaixa as never, caixa.TRANSICOES_SESSAO_CAIXA],
    ['transitarLancamento', contab.transitarLancamento as never, contab.TRANSICOES_LANCAMENTO],
    ['transitarFatura', fat.transitarFatura as never, fat.TRANSICOES_FATURA],
    ['transitarNotaCredito', fat.transitarNotaCredito as never, fat.TRANSICOES_NOTA_CREDITO],
    ['transitarNotaDebito', fat.transitarNotaDebito as never, fat.TRANSICOES_NOTA_DEBITO],
    ['transitarProforma', fat.transitarProforma as never, fat.TRANSICOES_PROFORMA],
    ['transitarCotacaoComercial', fat.transitarCotacaoComercial as never, fat.TRANSICOES_COTACAO_COMERCIAL],
    ['transitarMovimento', reconc.transitarMovimento as never, estados.TRANSICOES_MOVIMENTO_RECONCILIACAO],
    [
      'transitarPeriodoReconciliacao',
      reconc.transitarPeriodoReconciliacao as never,
      estados.TRANSICOES_PERIODO_RECONCILIACAO,
    ],
  ];

  it.each(casos)('%s', (nome, fn, mapa) => {
    const [de, para] = parInvalido(mapa);
    exigirRecusaLimpa(
      capturar(() => fn(de, para)),
      `${nome}(${de} → ${para})`,
    );
  });
});

/**
 * Lê, no ficheiro do serviço, os nomes de entidade que os chamadores passam ao `transitar`
 * genérico. Exige que TODA a chamada passe um literal — senão o oráculo não o consegue ver.
 */
function nomesNosChamadores(
  ficheiros: string[],
  reChamada: RegExp,
  reComLiteral: RegExp,
): Array<{ mapa: string; nome: string; onde: string }> {
  const achados: Array<{ mapa: string; nome: string; onde: string }> = [];
  let chamadas = 0;
  for (const rel of ficheiros) {
    const src = fs.readFileSync(path.join(SERVICOS, rel), 'utf8');
    chamadas += (src.match(reChamada) ?? []).length;
    for (const m of src.matchAll(reComLiteral)) {
      achados.push({ mapa: m[1], nome: m[3], onde: `${rel}:${src.slice(0, m.index).split('\n').length}` });
    }
  }
  expect(achados.length, 'cada chamada ao transitar genérico passa o nome como literal').toBe(chamadas);
  expect(achados.length).toBeGreaterThan(0);
  return achados;
}

describe('#107 B — transitar genérico de compras com os nomes que os chamadores passam', async () => {
  const { transitar } = await import('@/server/services/compras/compras.service');
  const mapas = (await import('@/server/services/compras/compras.service.interface')) as unknown as Record<
    string,
    Mapa
  >;

  const chamadas = nomesNosChamadores(
    ['compras/compras.service.ts'],
    /\btransitar\(\s*TRANSICOES_\w+/g,
    /\btransitar\(\s*(TRANSICOES_\w+)\s*,\s*(['"`])((?:(?!\2).)+)\2/g,
  );

  it.each(chamadas.map((c) => [c.onde, c.mapa, c.nome]))('%s — transitar(%s, «%s», …)', (onde, mapa, nome) => {
    const m = mapas[mapa];
    expect(m, `${mapa} exportado por compras.service.interface`).toBeDefined();
    const [de, para] = parInvalido(m);
    exigirRecusaLimpa(
      capturar(() => (transitar as (...a: unknown[]) => void)(m, nome, de, para)),
      `${onde} (${de} → ${para})`,
    );
  });
});

describe('#107 B — transitar genérico do inventário com os nomes que os chamadores passam', async () => {
  const { transitar } = await import('@/server/services/inventario/state-machine');
  const mapas: Record<string, Mapa> = {
    ...((await import('@/server/services/inventario/ativos.interface')) as unknown as Record<string, Mapa>),
    ...((await import('@/server/services/inventario/contagem-stock.interface')) as unknown as Record<string, Mapa>),
    ...((await import('@/server/services/inventario/inventario-fisico.interface')) as unknown as Record<
      string,
      Mapa
    >),
    ...((await import('@/server/services/inventario/manutencao.interface')) as unknown as Record<string, Mapa>),
    ...((await import('@/server/services/inventario/stock.interface')) as unknown as Record<string, Mapa>),
  };

  const chamadas = nomesNosChamadores(
    [
      'inventario/ativos.service.ts',
      'inventario/contagem-stock.service.ts',
      'inventario/inventario-fisico.service.ts',
      'inventario/manutencao.service.ts',
      'inventario/stock.service.ts',
    ],
    /\btransitar\(\s*TRANSICOES_\w+/g,
    /\btransitar\(\s*(TRANSICOES_\w+)\b[^,]*,[^,]+,[^,]+,\s*(['"`])((?:(?!\2).)+)\2\s*\)/g,
  );

  it.each(chamadas.map((c) => [c.onde, c.mapa, c.nome]))('%s — transitar(%s, …, «%s»)', (onde, mapa, nome) => {
    const m = mapas[mapa];
    expect(m, `${mapa} exportado por uma interface do inventário`).toBeDefined();
    const [de, para] = parInvalido(m);
    exigirRecusaLimpa(
      capturar(() => (transitar as (...a: unknown[]) => void)(m, de, para, nome)),
      `${onde} (${de} → ${para})`,
    );
  });
});
