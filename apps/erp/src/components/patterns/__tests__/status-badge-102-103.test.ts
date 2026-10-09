/**
 * Oráculo #102 / #103 — o mapa único do `StatusBadge` (`patterns/status-badge.tsx`).
 *
 * #102 — `FECHADA` está mapeada para «Acesso Fechado» (rótulo da subscrição, ADR-0032), mas o mesmo
 * valor é o estado final de sessões de caixa (`StatusSessaoCaixa`), sessões POS (`StatusSessaoPOS`),
 * vagas (`StatusVaga`) e registos de qualidade (`StatusQualidade`). Contrato: o mapa único mostra
 * «Fechada» — etiqueta neutra que serve as cinco entidades. Decisão conservadora deste oráculo: a
 * variante (cor) de `FECHADA` não é constrangida, nem o ecrã da subscrição (que já tem o aviso «O
 * acesso foi fechado»); se o chamador quiser outro rótulo passa-o por `label`, nunca por mapa local.
 *
 * #103 — estados de enums Prisma sem etiqueta aparecem em bruto (o fallback é
 * `status.replace(/_/g, ' ')`: «EM PRODUCAO», «TRANSFERENCIA ENTRADA»). Contrato:
 *   - todos os valores dos enums de ESTADO do Prisma (nome começa por Status/Estado/Etapa/Prioridade,
 *     excepto `EstadoCivil`, que é um atributo pessoal) e dos enums de classificação que as tabelas
 *     mostram por `StatusBadge` (`ClassificacaoFornecedor`, `ComplexidadeBOM`, `ImpactoRisco`,
 *     `ProbabilidadeRisco`, `TipoMovimentoStock`) têm etiqueta própria no mapa — o teste lê os
 *     `.prisma`, por isso um valor novo sem etiqueta parte-o;
 *   - os estados citados na issue têm uma variante explícita (não o fallback `outline`).
 *     `SUBSTITUIDO` fica fora da verificação de variante: é `outline` de propósito no mapa.
 *
 * Render no servidor (`react-dom/server`), sem browser.
 */
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const SCHEMA_DIR = path.resolve(__dirname, '../../../../prisma/schema');

/** Classe do fallback `outline` em `badgeVariants` — o que um estado sem variante recebe. */
const CLASSE_OUTLINE = 'border-border text-foreground';

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'");
}

async function render(status: string): Promise<{ texto: string; classe: string }> {
  const mod: any = await import('../status-badge');
  const html = renderToStaticMarkup(createElement(mod.StatusBadge, { status }));
  const m = html.match(/^<span[^>]*class="([^"]*)"[^>]*>([\s\S]*)<\/span>$/);
  expect(m, `StatusBadge(${status}) renderiza um <span>`).not.toBeNull();
  return { classe: m![1], texto: decode(m![2]).trim() };
}

/** Valores de cada enum declarado em prisma/schema/*.prisma (comentários e atributos ignorados). */
function enumsPrisma(): Map<string, string[]> {
  const enums = new Map<string, string[]>();
  for (const f of readdirSync(SCHEMA_DIR).filter((n) => n.endsWith('.prisma'))) {
    const src = readFileSync(path.join(SCHEMA_DIR, f), 'utf8');
    for (const m of src.matchAll(/^enum\s+(\w+)\s*\{([^}]*)\}/gm)) {
      const valores = m[2]
        .split('\n')
        .map((l) => l.replace(/\/\/.*$/, '').trim())
        .map((l) => l.split(/\s+/)[0] ?? '')
        .filter((v) => /^[A-Z][A-Z0-9_]*$/.test(v));
      enums.set(m[1], valores);
    }
  }
  return enums;
}

const ENUMS_CLASSIFICACAO_EM_TABELAS = [
  'ClassificacaoFornecedor',
  'ComplexidadeBOM',
  'ImpactoRisco',
  'ProbabilidadeRisco',
  'TipoMovimentoStock',
];

function enumsMostradosPorBadge(): Array<[string, string[]]> {
  const todos = enumsPrisma();
  const escolhidos = [...todos.entries()].filter(
    ([nome]) =>
      (/^(Status|Estado|Etapa|Prioridade)/.test(nome) && nome !== 'EstadoCivil') ||
      ENUMS_CLASSIFICACAO_EM_TABELAS.includes(nome),
  );
  return escolhidos;
}

describe('#102 — FECHADA tem etiqueta neutra no mapa único', () => {
  it('as cinco entidades com FECHADA existem nos enums Prisma (o contexto do contrato)', () => {
    const e = enumsPrisma();
    for (const nome of ['StatusSessaoCaixa', 'StatusSessaoPOS', 'StatusVaga', 'StatusQualidade', 'EstadoAssinatura']) {
      expect(e.get(nome), `enum ${nome}`).toContain('FECHADA');
    }
  });

  it('StatusBadge("FECHADA") mostra «Fechada», não «Acesso Fechado»', async () => {
    const { texto } = await render('FECHADA');
    expect(texto).not.toMatch(/acesso/i);
    expect(texto).toBe('Fechada');
  });

  it('FECHADO (masculino) continua «Fechado» — não regride', async () => {
    expect((await render('FECHADO')).texto).toBe('Fechado');
  });
});

describe('#103 — estados citados na issue têm etiqueta e variante explícitas', () => {
  const ESPERADOS: Record<string, RegExp> = {
    ACTIVO: /^Activo$/,
    FERIAS: /^Férias$/,
    AFASTADO: /^Afastado$/,
    EM_PRODUCAO: /^Em Produção$/i,
    SUBSTITUIDO: /^Substituído$/,
    PREFERENCIAL: /^Preferencial$/,
    TRANSFERENCIA_ENTRADA: /^Transferência\b.*\bEntrada$/i,
    TRANSFERENCIA_SAIDA: /^Transferência\b.*\bSaída$/i,
  };

  for (const [estado, esperado] of Object.entries(ESPERADOS)) {
    it(`${estado} tem etiqueta em PT (não «${estado.replace(/_/g, ' ')}»)`, async () => {
      const { texto } = await render(estado);
      expect(texto).not.toBe(estado.replace(/_/g, ' '));
      expect(texto).toMatch(esperado);
    });
  }

  for (const estado of Object.keys(ESPERADOS).filter((e) => e !== 'SUBSTITUIDO')) {
    it(`${estado} tem variante explícita no mapa (não o fallback outline)`, async () => {
      const { classe } = await render(estado);
      expect(classe).not.toContain(CLASSE_OUTLINE);
    });
  }
});

describe('#103 — nenhum valor de enum de estado do Prisma aparece em bruto', () => {
  it('o conjunto de enums percorridos não está vazio (o parser lê o schema)', () => {
    const nomes = enumsMostradosPorBadge().map(([n]) => n);
    expect(nomes.length).toBeGreaterThan(40);
    expect(nomes).toEqual(expect.arrayContaining(['StatusColaborador', 'StatusOrdemProducao', 'TipoMovimentoStock']));
    expect(nomes).not.toContain('EstadoCivil');
  });

  it('todos os valores têm etiqueta própria no mapa único', async () => {
    const emBruto: string[] = [];
    for (const [nome, valores] of enumsMostradosPorBadge()) {
      for (const v of valores) {
        const { texto } = await render(v);
        if (texto === v || texto === v.replace(/_/g, ' ')) emBruto.push(`${nome}.${v}`);
      }
    }
    expect(emBruto, `estados sem etiqueta (aparecem em bruto):\n  ${emBruto.join('\n  ')}`).toEqual([]);
  });
});
