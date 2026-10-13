/**
 * Oráculo #345 — `ComboboxRemoto`: o valor pré-preenchido deixa de aparecer depois de uma pesquisa
 * sem escolha.
 *
 * O defeito: o rótulo do trigger é procurado só nas opções CORRENTES (`options.find(...)`) ou na
 * `ultimaEscolhida`, que só se grava num clique. Um campo pré-preenchido (conta 611 vinda de `?p=` da
 * reconciliação, ou de um rascunho) e nunca clicado: escreve-se «85», as opções passam a ser os
 * resultados da pesquisa, e o trigger mostra o placeholder — enquanto `field.value` continua 611 e é
 * isso que se grava.
 *
 * Contrato (decisão do orquestrador): o rótulo da opção escolhida — ou da opção de `opcoesIniciais`
 * que corresponde ao `value` — fica guardado INDEPENDENTEMENTE dos resultados da pesquisa: com a
 * lista aberta a mostrar outros resultados, depois de fechar, e quando o `value` muda por fora para
 * uma opção inicial. A API pública do `ComboboxRemoto` não muda (≈20 chamadores).
 *
 * Como se corre sem DOM: este projecto de testes é `environment: node`, sem jsdom nem
 * testing-library. O teste traz um renderizador mínimo — os componentes são funções; os hooks do
 * `react` são substituídos por uma implementação que guarda estado por posição na árvore, corre os
 * efeitos depois de cada passagem e volta a renderizar enquanto houver `setState`. Os primitivos
 * `ui/` (Radix/cmdk) são trocados por elementos simples; o `Combobox` e o `ComboboxRemoto` correm
 * REAIS. O que se observa é o que o utilizador vê: o texto do botão `role="combobox"`, o campo de
 * pesquisa (`onValueChange`), o abrir/fechar (`onOpenChange`) e as opções (`onSelect`).
 *
 * Como confirmar que vale: no `main` actual os casos marcados #345 falham com o placeholder no lugar
 * do rótulo «611 — Compras de mercadorias».
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';

// ─── Renderizador mínimo: hooks com estado por posição na árvore ─────────────────────────────────

const h = vi.hoisted(() => {
  type Efeito = { deps?: unknown[]; limpar?: (() => void) | void };
  type Hook = { valor?: unknown; deps?: unknown[]; efeito?: Efeito };
  const instancias = new Map<string, Hook[]>();
  let actual: { hooks: Hook[]; i: number } | null = null;
  let pendentes: Array<() => void> = [];
  let sujo = false;
  let idSeq = 0;

  const mudou = (a?: unknown[], b?: unknown[]) =>
    !a || !b || a.length !== b.length || a.some((x, i) => !Object.is(x, b[i]));

  function proximo(): Hook {
    if (!actual) throw new Error('hook fora de um componente');
    const { hooks } = actual;
    if (hooks.length <= actual.i) hooks.push({});
    return hooks[actual.i++];
  }

  function useState<T>(inicial: T | (() => T)) {
    const hook = proximo();
    if (!('valor' in hook)) {
      hook.valor = typeof inicial === 'function' ? (inicial as () => T)() : inicial;
    }
    const definir = (novo: T | ((v: T) => T)) => {
      const v = typeof novo === 'function' ? (novo as (v: T) => T)(hook.valor as T) : novo;
      if (!Object.is(v, hook.valor)) {
        hook.valor = v;
        sujo = true;
      }
    };
    return [hook.valor as T, definir] as const;
  }

  function useReducer<S, A>(red: (s: S, a: A) => S, arg: S, init?: (a: S) => S) {
    const [s, set] = useState<S>(() => (init ? init(arg) : arg));
    return [s, (a: A) => set((prev) => red(prev, a))] as const;
  }

  function useRef<T>(inicial: T) {
    const hook = proximo();
    if (!('valor' in hook)) hook.valor = { current: inicial };
    return hook.valor as { current: T };
  }

  // Sem o prefixo `use`: o lint de hooks não tem de ler o harness como se fosse um componente.
  function memo<T>(fn: () => T, deps?: unknown[]) {
    const hook = proximo();
    if (!('valor' in hook) || mudou(hook.deps, deps)) {
      hook.valor = fn();
      hook.deps = deps;
    }
    return hook.valor as T;
  }

  const useCallback = <T,>(fn: T, deps?: unknown[]) => memo(() => fn, deps);

  function useEffect(fn: () => void | (() => void), deps?: unknown[]) {
    const hook = proximo();
    const anterior = hook.efeito;
    if (!anterior || mudou(anterior.deps, deps)) {
      const efeito: Efeito = { deps };
      hook.efeito = efeito;
      pendentes.push(() => {
        if (anterior?.limpar) anterior.limpar();
        efeito.limpar = fn();
      });
    }
  }

  function useId() {
    const hook = proximo();
    if (!('valor' in hook)) hook.valor = `:r${idSeq++}:`;
    return hook.valor as string;
  }

  const fake = {
    useState,
    useReducer,
    useRef,
    useMemo: memo,
    useCallback,
    useEffect,
    useLayoutEffect: useEffect,
    useInsertionEffect: useEffect,
    useId,
    useContext: (ctx: { _currentValue?: unknown }) => ctx?._currentValue,
    useTransition: () => [false, (cb: () => void) => cb()] as const,
    useDeferredValue: <T,>(v: T) => v,
  };

  return {
    fake,
    instancias,
    entrar(caminho: string) {
      let hooks = instancias.get(caminho);
      if (!hooks) instancias.set(caminho, (hooks = []));
      actual = { hooks, i: 0 };
    },
    sair() {
      actual = null;
    },
    tirarPendentes() {
      const p = pendentes;
      pendentes = [];
      return p;
    },
    sujo: () => sujo,
    limparSujo() {
      sujo = false;
    },
    reiniciar() {
      instancias.clear();
      pendentes = [];
      sujo = false;
      actual = null;
    },
  };
});

vi.mock('react', async (importOriginal) => {
  const real = await importOriginal<typeof import('react')>();
  return { ...real, ...h.fake, default: { ...real, ...h.fake } };
});

// Primitivos `ui/` trocados por elementos simples — o que interessa está no Combobox, não no Radix.
vi.mock('@/components/ui/popover', () => {
  const Popover = (p: { open?: boolean; onOpenChange?: (v: boolean) => void; children?: unknown }) =>
    createElement('popover-root', { open: p.open, onOpenChange: p.onOpenChange }, p.children as never);
  const PopoverTrigger = (p: { children?: unknown }) => p.children;
  const PopoverContent = (p: { children?: unknown }) => createElement('popover-content', null, p.children as never);
  return { Popover, PopoverTrigger, PopoverContent, PopoverAnchor: PopoverTrigger };
});

vi.mock('@/components/ui/command', () => {
  const caixa = (tag: string) => {
    const Caixa = (p: { children?: unknown }) => createElement(tag, null, p.children as never);
    Caixa.displayName = `Caixa(${tag})`;
    return Caixa;
  };
  const CommandInput = (p: { onValueChange?: (v: string) => void; placeholder?: string; value?: string }) =>
    createElement('input', { 'data-pesquisa': true, onValueChange: p.onValueChange, placeholder: p.placeholder, value: p.value });
  const CommandItem = (p: { value?: string; onSelect?: (v: string) => void; children?: unknown }) =>
    createElement('item', { value: p.value, onSelect: p.onSelect }, p.children as never);
  return {
    Command: caixa('cmd'),
    CommandInput,
    CommandList: caixa('cmd-list'),
    CommandEmpty: caixa('cmd-empty'),
    CommandGroup: caixa('cmd-group'),
    CommandItem,
    CommandSeparator: caixa('cmd-sep'),
  };
});

vi.mock('@/components/ui/button', () => ({
  Button: (p: Record<string, unknown>) => createElement('button', p),
}));

type No = { tag: string; props: Record<string, unknown>; filhos: Arvore[] };
type Arvore = No | string;

const FRAGMENTO = Symbol.for('react.fragment');
const CONTEXTO = Symbol.for('react.context');
const PROVIDER = Symbol.for('react.provider');

function renderizar(no: unknown, caminho: string): Arvore[] {
  if (no === null || no === undefined || typeof no === 'boolean') return [];
  if (typeof no === 'string' || typeof no === 'number') return [String(no)];
  if (Array.isArray(no)) return no.flatMap((n, i) => renderizar(n, `${caminho}[${i}]`));
  const el = no as { type: unknown; props: Record<string, unknown>; key?: string | null };
  const filhos = (p: Record<string, unknown>, c: string) => renderizar(p?.children, c);
  if (el.type === FRAGMENTO) return filhos(el.props, `${caminho}/#f`);
  if (typeof el.type === 'string') {
    const { children: _c, ...props } = el.props ?? {};
    return [{ tag: el.type, props, filhos: filhos(el.props, `${caminho}/${el.type}`) }];
  }
  if (typeof el.type === 'function') {
    const tipo = el.type as (p: unknown) => unknown;
    const aqui = `${caminho}/${tipo.name || 'anon'}${el.key != null ? `#${el.key}` : ''}`;
    h.entrar(aqui);
    let saida: unknown;
    try {
      saida = tipo(el.props);
    } finally {
      h.sair();
    }
    return renderizar(saida, aqui);
  }
  const t = el.type as { $$typeof?: symbol } | null;
  if (t && (t.$$typeof === CONTEXTO || t.$$typeof === PROVIDER)) return filhos(el.props, `${caminho}/ctx`);
  // forwardRef/memo de terceiros (ícones lucide): não interessam ao rótulo.
  return [];
}

// ─── Montagem e interacção ───────────────────────────────────────────────────────────────────────

import type { ComboboxOption } from '../combobox';

const PLACEHOLDER = 'Escolher conta';
const C611: ComboboxOption = { value: 'conta-611', label: '611 — Compras de mercadorias' };
const C612: ComboboxOption = { value: 'conta-612', label: '612 — Mercadorias' };
const C851: ComboboxOption = { value: 'conta-851', label: '851 — Resultados correntes' };
const C852: ComboboxOption = { value: 'conta-852', label: '852 — Resultados extraordinários' };

let raiz: unknown;
let arvore: Arvore[] = [];
let valor: string | undefined;
let procurar: ReturnType<typeof vi.fn<(t: string) => Promise<ComboboxOption[] | null>>>;

async function carregarComponente() {
  const mod = (await import('../combobox-remoto')) as Record<string, unknown>;
  return mod.ComboboxRemoto as (p: unknown) => unknown;
}

function flush() {
  for (let volta = 0; volta < 50; volta++) {
    h.limparSujo();
    arvore = renderizar(raiz, 'raiz');
    for (const efeito of h.tirarPendentes()) efeito();
    if (!h.sujo()) return;
  }
  throw new Error('renderização não estabiliza (50 voltas)');
}

async function montar(opts: { opcoesIniciais: ComboboxOption[]; valor?: string }) {
  const ComboboxRemoto = await carregarComponente();
  valor = opts.valor;
  const desenhar = () => {
    // Arrays e funções NOVOS a cada render, como num `.map()` inline de quem chama.
    raiz = createElement(ComboboxRemoto as never, {
      opcoesIniciais: [...opts.opcoesIniciais],
      procurar: (t: string) => procurar(t),
      value: valor,
      onChange: (v: string) => {
        valor = v;
        desenhar();
      },
      placeholder: PLACEHOLDER,
      'aria-label': 'Conta',
    } as never);
  };
  desenhar();
  flush();
  return {
    /** O `value` muda por fora (reset do formulário, rascunho carregado). */
    definirValor(v: string | undefined) {
      valor = v;
      desenhar();
      flush();
    },
  };
}

function procurarNo(pred: (n: No) => boolean, nos: Arvore[] = arvore): No | undefined {
  for (const n of nos) {
    if (typeof n === 'string') continue;
    if (pred(n)) return n;
    const dentro = procurarNo(pred, n.filhos);
    if (dentro) return dentro;
  }
  return undefined;
}

const texto = (nos: Arvore[]): string =>
  nos.map((n) => (typeof n === 'string' ? n : texto(n.filhos))).join('');

function rotulo(): string {
  const botao = procurarNo((n) => n.props.role === 'combobox');
  if (!botao) throw new Error('trigger role="combobox" não encontrado');
  return texto(botao.filhos).trim();
}

function abrirOuFechar(aberto: boolean) {
  const raizPopover = procurarNo((n) => typeof n.props.onOpenChange === 'function');
  if (!raizPopover) throw new Error('popover sem onOpenChange');
  (raizPopover.props.onOpenChange as (v: boolean) => void)(aberto);
  flush();
}

async function escrever(termo: string) {
  const campo = procurarNo((n) => n.tag === 'input' && typeof n.props.onValueChange === 'function');
  if (!campo) throw new Error('campo de pesquisa sem onValueChange');
  (campo.props.onValueChange as (v: string) => void)(termo);
  flush();
  // atraso da pesquisa (250 ms) + resolução da promessa
  await vi.advanceTimersByTimeAsync(400);
  flush();
  await vi.advanceTimersByTimeAsync(0);
  flush();
}

function opcoesVisiveis(): string[] {
  const itens: string[] = [];
  const visitar = (nos: Arvore[]) => {
    for (const n of nos) {
      if (typeof n === 'string') continue;
      if (n.tag === 'item') itens.push(texto(n.filhos).trim());
      visitar(n.filhos);
    }
  };
  visitar(arvore);
  return itens;
}

function escolher(label: string) {
  const item = procurarNo((n) => n.tag === 'item' && texto(n.filhos).trim() === label);
  if (!item) throw new Error(`opção «${label}» não está na lista`);
  (item.props.onSelect as (v: string) => void)(String(item.props.value));
  flush();
}

beforeEach(() => {
  vi.useFakeTimers();
  h.reiniciar();
  procurar = vi.fn(async (t: string) => (t.startsWith('85') ? [C851, C852] : []));
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Casos ───────────────────────────────────────────────────────────────────────────────────────

describe('ComboboxRemoto — o harness mede o que o utilizador vê (sanidade, verde no main)', () => {
  it('valor pré-preenchido que está em opcoesIniciais aparece no trigger, sem nunca abrir', async () => {
    await montar({ opcoesIniciais: [C611, C612], valor: C611.value });
    expect(rotulo()).toBe(C611.label);
  });

  it('sem valor mostra o placeholder', async () => {
    await montar({ opcoesIniciais: [C611, C612] });
    expect(rotulo()).toBe(PLACEHOLDER);
  });

  it('a pesquisa vai ao servidor e a lista passa a mostrar exactamente os resultados', async () => {
    await montar({ opcoesIniciais: [C611, C612], valor: C611.value });
    abrirOuFechar(true);
    await escrever('85');
    expect(procurar).toHaveBeenCalledWith('85');
    expect(opcoesVisiveis()).toEqual([C851.label, C852.label]);
  });

  it('opção escolhida a partir de uma pesquisa continua no trigger depois de outra pesquisa (regressão)', async () => {
    await montar({ opcoesIniciais: [C611, C612] });
    abrirOuFechar(true);
    await escrever('85');
    escolher(C852.label);
    expect(valor).toBe(C852.value);
    abrirOuFechar(true);
    await escrever('6');
    expect(rotulo()).toBe(C852.label);
  });
});

describe('#345 — o rótulo do valor pré-preenchido sobrevive a uma pesquisa sem escolha', () => {
  it('com a lista aberta a mostrar outros resultados, o trigger continua a mostrar a conta pré-preenchida', async () => {
    await montar({ opcoesIniciais: [C611, C612], valor: C611.value });
    abrirOuFechar(true);
    await escrever('85');
    expect(opcoesVisiveis()).not.toContain(C611.label);
    expect(valor).toBe(C611.value);
    expect(rotulo()).toBe(C611.label);
  });

  it('depois de fechar sem escolher, o trigger mostra a conta pré-preenchida — não o placeholder', async () => {
    await montar({ opcoesIniciais: [C611, C612], valor: C611.value });
    abrirOuFechar(true);
    await escrever('85');
    abrirOuFechar(false);
    expect(valor).toBe(C611.value);
    expect(rotulo()).not.toBe(PLACEHOLDER);
    expect(rotulo()).toBe(C611.label);
  });

  it('pesquisa que falha (procurar devolve null) ou vem vazia não apaga o rótulo', async () => {
    procurar = vi.fn(async (t: string) => (t === 'x' ? null : []));
    await montar({ opcoesIniciais: [C611, C612], valor: C611.value });
    abrirOuFechar(true);
    await escrever('zzz');
    expect(opcoesVisiveis()).toEqual([]);
    expect(rotulo()).toBe(C611.label);
    await escrever('x');
    abrirOuFechar(false);
    expect(rotulo()).toBe(C611.label);
  });

  it('o value muda por fora para uma opção inicial enquanto a lista tem resultados de pesquisa: mostra o rótulo dela', async () => {
    const campo = await montar({ opcoesIniciais: [C611, C612] });
    abrirOuFechar(true);
    await escrever('85');
    abrirOuFechar(false);
    campo.definirValor(C612.value);
    expect(rotulo()).toBe(C612.label);
  });

  it('value que não está em lado nenhum continua a mostrar o placeholder (não inventa rótulo)', async () => {
    await montar({ opcoesIniciais: [C611, C612], valor: 'conta-inexistente' });
    expect(rotulo()).toBe(PLACEHOLDER);
    abrirOuFechar(true);
    await escrever('85');
    abrirOuFechar(false);
    expect(rotulo()).toBe(PLACEHOLDER);
  });

  it('limpar o valor por fora depois de uma pesquisa volta ao placeholder (o rótulo guardado não fica colado)', async () => {
    const campo = await montar({ opcoesIniciais: [C611, C612], valor: C611.value });
    abrirOuFechar(true);
    await escrever('85');
    abrirOuFechar(false);
    campo.definirValor('');
    expect(rotulo()).toBe(PLACEHOLDER);
  });
});
