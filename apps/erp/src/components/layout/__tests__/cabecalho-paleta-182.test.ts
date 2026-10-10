/**
 * Oráculo estrutural da issue #182 — cabeçalho global (nó C:cabecalho-paleta-182; escrito pelo
 * VERIFICADOR — alterá-lo do lado de quem implementa é BLOCKER).
 *
 * Contrato:
 * 1. A caixa de pesquisa do cabeçalho abre a paleta de comandos. Hoje o botão faz
 *    `onClick={onCommandPaletteOpen}`, a prop é opcional e nenhum layout a passa (nem pode: os
 *    layouts são Server Components) — o clique não faz nada. Aqui exige-se que o clique não fique
 *    pendurado numa prop opcional que ninguém passa; o comportamento é provado pelo E2E
 *    `e2e/58-cabecalho-paleta-182.spec.ts`.
 * 2. «Configurações» no menu do utilizador não aponta para `/configuracoes` (não existe). Ou sai do
 *    menu, ou aponta para uma rota com `page.tsx` real — não para uma rota que só redirecciona
 *    (`/dashboard/configuracoes` é `redirect('/dashboard')`).
 * 3. O sino de notificações aparece em todas as páginas com cabeçalho, `/dashboard` incluído:
 *    toda a chamada `<AppHeader` passa `notificationSlot`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const SRC = path.resolve(__dirname, '../../..');
const APP = path.join(SRC, 'app');
const HEADER = path.join(SRC, 'components/layout/AppHeader.tsx');

/** Todos os .ts/.tsx de um directório, recursivo, sem `__tests__`. */
function ficheiros(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : ficheiros(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

/**
 * Mapa rota → ficheiro `page.tsx` do App Router: tira grupos `(x)` e slots `@x`; ignora rotas
 * interceptadas `(.)x` e segmentos dinâmicos (só interessam rotas estáticas aqui).
 */
function rotasEstaticas(): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const f of ficheiros(APP)) {
    if (path.basename(f) !== 'page.tsx') continue;
    const segs = path.relative(APP, path.dirname(f)).split(path.sep).filter(Boolean);
    if (segs.some((s) => s.startsWith('(.') || s.startsWith('[') || s.startsWith('@'))) continue;
    const rota = '/' + segs.filter((s) => !/^\(.*\)$/.test(s)).join('/');
    mapa.set(rota === '/' ? '/' : rota.replace(/\/$/, ''), f);
  }
  return mapa;
}

/** Uma página que só redirecciona (sem JSX) não é uma «rota real». */
function soRedirecciona(codigo: string): boolean {
  return /\bredirect\s*\(/.test(codigo) && !/<[A-Za-z]/.test(codigo);
}

describe('#182 — a pesquisa do cabeçalho abre a paleta', () => {
  it('o botão «Abrir paleta de comandos» não depende de uma prop opcional que nenhum layout passa', () => {
    const codigo = fs.readFileSync(HEADER, 'utf8');
    const i = codigo.indexOf('Abrir paleta de comandos');
    expect(i, 'o botão de pesquisa continua no cabeçalho (aria-label «Abrir paleta de comandos»)').toBeGreaterThan(-1);

    // O `<Button …>` que contém o aria-label.
    const inicio = codigo.lastIndexOf('<Button', i);
    const fim = codigo.indexOf('>', i);
    const botao = codigo.slice(inicio, fim);
    const onClick = /onClick=\{\s*([A-Za-z_$][\w$]*)\s*\}/.exec(botao)?.[1];

    if (onClick === undefined) return; // handler próprio (inline ou interno) — o E2E prova o clique.

    // O handler é um identificador simples: se for uma prop do AppHeader, tem de ser obrigatória
    // (o tsc obriga então todos os chamadores a passá-la) e todos os `<AppHeader` têm de a passar.
    const iface = codigo.slice(codigo.indexOf('interface AppHeaderProps'), codigo.indexOf('}', codigo.indexOf('interface AppHeaderProps')));
    const declaracao = new RegExp(`\\b${onClick}\\s*(\\??)\\s*:`).exec(iface);
    if (!declaracao) return; // não é prop — é estado/handler interno.

    expect(declaracao[1], `a prop ${onClick} do AppHeader é opcional: sem ela o clique não faz nada`).toBe('');
    for (const f of ficheiros(SRC).filter((x) => x !== HEADER)) {
      const fonte = fs.readFileSync(f, 'utf8');
      for (let j = fonte.indexOf('<AppHeader'); j !== -1; j = fonte.indexOf('<AppHeader', j + 1)) {
        const chamada = fonte.slice(j, fonte.indexOf('>', j) + 1);
        expect(chamada, `${path.relative(SRC, f)} chama <AppHeader> sem ${onClick}`).toMatch(new RegExp(`\\b${onClick}\\s*=`));
      }
    }
  });
});

describe('#182 — «Configurações» no menu do utilizador', () => {
  const codigo = () => fs.readFileSync(HEADER, 'utf8');

  it('nenhuma ligação do cabeçalho aponta para /configuracoes (rota inexistente)', () => {
    expect(codigo()).not.toMatch(/['"`]\/configuracoes['"`]/);
  });

  it('se o item «Configurações» existir, aponta para uma rota com página real', () => {
    const fonte = codigo();
    const rotas = rotasEstaticas();
    const ocorrencias: number[] = [];
    for (let i = fonte.indexOf('>Configurações<'); i !== -1; i = fonte.indexOf('>Configurações<', i + 1)) ocorrencias.push(i);
    for (let i = fonte.indexOf('Configurações</'); i !== -1; i = fonte.indexOf('Configurações</', i + 1)) {
      if (!ocorrencias.some((o) => Math.abs(o - i) < 2)) ocorrencias.push(i);
    }

    for (const i of ocorrencias) {
      const janela = fonte.slice(Math.max(0, i - 400), i);
      const hrefs = [...janela.matchAll(/href=\{?\s*['"`](\/[^'"`?#]*)['"`]/g)].map((m) => m[1]!);
      const href = hrefs.at(-1);
      expect(href, 'o item «Configurações» tem um href literal antes do rótulo').toBeDefined();
      const rota = href!.replace(/\/$/, '') || '/';
      const pagina = rotas.get(rota);
      expect(pagina, `«Configurações» aponta para ${rota}, que não tem page.tsx`).toBeDefined();
      expect(
        soRedirecciona(fs.readFileSync(pagina!, 'utf8')),
        `«Configurações» aponta para ${rota}, que só redirecciona`,
      ).toBe(false);
    }
  });
});

describe('#182 — o sino de notificações aparece em todas as páginas com cabeçalho', () => {
  it('toda a chamada <AppHeader> (incluindo app/dashboard/layout.tsx) passa notificationSlot', () => {
    const chamadas: { ficheiro: string; chamada: string }[] = [];
    for (const f of ficheiros(SRC).filter((x) => x !== HEADER)) {
      const fonte = fs.readFileSync(f, 'utf8');
      for (let j = fonte.indexOf('<AppHeader'); j !== -1; j = fonte.indexOf('<AppHeader', j + 1)) {
        // `<AppHeaderXyz` não conta.
        if (/[\w$]/.test(fonte[j + '<AppHeader'.length] ?? '')) continue;
        chamadas.push({ ficheiro: path.relative(SRC, f), chamada: fonte.slice(j, fonte.indexOf('>', j) + 1) });
      }
    }
    expect(chamadas.length, 'há pelo menos uma chamada a <AppHeader>').toBeGreaterThan(0);
    for (const { ficheiro, chamada } of chamadas) {
      expect(chamada, `${ficheiro} chama <AppHeader> sem o sino (notificationSlot)`).toMatch(/\bnotificationSlot\s*=/);
    }
  });

  it('o layout de /dashboard chega ao contador real de não-lidas', () => {
    // O layout (ou um componente partilhado que ele importe de @/components/layout) usa
    // `notificacaoService.naoLidasCount` — o mesmo que (dashboard)/layout.tsx; nada de `count={0}` fixo.
    const layout = fs.readFileSync(path.join(APP, 'dashboard/layout.tsx'), 'utf8');
    const importados = [...layout.matchAll(/from\s+['"]@\/components\/layout\/([\w\-/]+)['"]/g)]
      .map((m) => path.join(SRC, 'components/layout', m[1]!))
      .flatMap((base) => [`${base}.tsx`, `${base}.ts`, path.join(base, 'index.tsx'), path.join(base, 'index.ts')])
      .filter((p) => fs.existsSync(p))
      .map((p) => fs.readFileSync(p, 'utf8'));
    const alcance = [layout, ...importados].join('\n');
    expect(alcance, 'o /dashboard lê o número real de notificações por ler').toMatch(/\bnaoLidasCount\b/);
  });
});
