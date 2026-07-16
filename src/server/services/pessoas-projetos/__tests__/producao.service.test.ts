import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { BusinessRuleError } from '@/lib/errors';
import { transitar } from '../rh.service';
import {
  TRANSICOES_ORDEM_PRODUCAO,
  TRANSICOES_OPERACAO_ORDEM,
  TRANSICOES_BOM,
  TRANSICOES_ROTEIRO,
  type StockContratoA,
  type ItemExplosaoBOM,
} from '../producao.interface';

// ─────────────────────────────────────────────────────────────────────────────
// TRANSICOES_ORDEM_PRODUCAO — máquina de estado da OP
// ─────────────────────────────────────────────────────────────────────────────

describe('TRANSICOES_ORDEM_PRODUCAO', () => {
  it('todos os destinos são estados conhecidos', () => {
    const estados = new Set(Object.keys(TRANSICOES_ORDEM_PRODUCAO));
    for (const destinos of Object.values(TRANSICOES_ORDEM_PRODUCAO)) {
      for (const d of destinos) {
        expect(estados.has(d), `Destino desconhecido: ${d}`).toBe(true);
      }
    }
  });

  it('caminho normal: PLANEADA → LIBERADA → EM_PRODUCAO → CONCLUIDA', () => {
    expect(() => transitar(TRANSICOES_ORDEM_PRODUCAO, 'PLANEADA', 'LIBERADA')).not.toThrow();
    expect(() => transitar(TRANSICOES_ORDEM_PRODUCAO, 'LIBERADA', 'EM_PRODUCAO')).not.toThrow();
    expect(() => transitar(TRANSICOES_ORDEM_PRODUCAO, 'EM_PRODUCAO', 'CONCLUIDA')).not.toThrow();
  });

  it('pausa e retoma: EM_PRODUCAO → PAUSADA → EM_PRODUCAO', () => {
    expect(() => transitar(TRANSICOES_ORDEM_PRODUCAO, 'EM_PRODUCAO', 'PAUSADA')).not.toThrow();
    expect(() => transitar(TRANSICOES_ORDEM_PRODUCAO, 'PAUSADA', 'EM_PRODUCAO')).not.toThrow();
  });

  it('cancelamento em qualquer estado activo', () => {
    for (const estado of ['PLANEADA', 'LIBERADA', 'EM_PRODUCAO', 'PAUSADA']) {
      expect(() => transitar(TRANSICOES_ORDEM_PRODUCAO, estado, 'CANCELADA')).not.toThrow();
    }
  });

  it('CONCLUIDA e CANCELADA são terminais', () => {
    expect(TRANSICOES_ORDEM_PRODUCAO['CONCLUIDA']).toHaveLength(0);
    expect(TRANSICOES_ORDEM_PRODUCAO['CANCELADA']).toHaveLength(0);
  });

  it('não pode ir de PLANEADA directamente para EM_PRODUCAO', () => {
    expect(() => transitar(TRANSICOES_ORDEM_PRODUCAO, 'PLANEADA', 'EM_PRODUCAO')).toThrow(BusinessRuleError);
  });

  it('não pode ir de CONCLUIDA para qualquer outro estado', () => {
    expect(() => transitar(TRANSICOES_ORDEM_PRODUCAO, 'CONCLUIDA', 'PLANEADA')).toThrow(BusinessRuleError);
    expect(() => transitar(TRANSICOES_ORDEM_PRODUCAO, 'CONCLUIDA', 'CANCELADA')).toThrow(BusinessRuleError);
  });

  // Property: todas as transições listadas são permitidas
  it('[property] todas as transições listadas são bidirectionalmente correctas', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...Object.keys(TRANSICOES_ORDEM_PRODUCAO)),
        (estado) => {
          const destinos = TRANSICOES_ORDEM_PRODUCAO[estado] ?? [];
          for (const d of destinos) {
            expect(() => transitar(TRANSICOES_ORDEM_PRODUCAO, estado, d)).not.toThrow();
          }
          return true;
        },
      ),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSICOES_OPERACAO_ORDEM
// ─────────────────────────────────────────────────────────────────────────────

describe('TRANSICOES_OPERACAO_ORDEM', () => {
  it('todos os destinos são estados conhecidos', () => {
    const estados = new Set(Object.keys(TRANSICOES_OPERACAO_ORDEM));
    for (const destinos of Object.values(TRANSICOES_OPERACAO_ORDEM)) {
      for (const d of destinos) {
        expect(estados.has(d)).toBe(true);
      }
    }
  });

  it('CONCLUIDA é terminal', () => {
    expect(TRANSICOES_OPERACAO_ORDEM['CONCLUIDA']).toHaveLength(0);
  });

  it('pausa e retoma possíveis', () => {
    expect(() => transitar(TRANSICOES_OPERACAO_ORDEM, 'EM_ANDAMENTO', 'PAUSADA')).not.toThrow();
    expect(() => transitar(TRANSICOES_OPERACAO_ORDEM, 'PAUSADA', 'EM_ANDAMENTO')).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSICOES_BOM
// ─────────────────────────────────────────────────────────────────────────────

describe('TRANSICOES_BOM', () => {
  it('todos os destinos são estados conhecidos', () => {
    const estados = new Set(Object.keys(TRANSICOES_BOM));
    for (const destinos of Object.values(TRANSICOES_BOM)) {
      for (const d of destinos) {
        expect(estados.has(d)).toBe(true);
      }
    }
  });

  it('SUBSTITUIDO é terminal', () => {
    expect(TRANSICOES_BOM['SUBSTITUIDO']).toHaveLength(0);
  });

  it('RASCUNHO → ATIVO é válido', () => {
    expect(() => transitar(TRANSICOES_BOM, 'RASCUNHO', 'ATIVO')).not.toThrow();
  });

  it('ATIVO pode ser substituído ou desactivado', () => {
    expect(TRANSICOES_BOM['ATIVO']).toContain('SUBSTITUIDO');
    expect(TRANSICOES_BOM['ATIVO']).toContain('INATIVO');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSICOES_ROTEIRO
// ─────────────────────────────────────────────────────────────────────────────

describe('TRANSICOES_ROTEIRO', () => {
  it('todos os destinos são estados conhecidos', () => {
    const estados = new Set(Object.keys(TRANSICOES_ROTEIRO));
    for (const destinos of Object.values(TRANSICOES_ROTEIRO)) {
      for (const d of destinos) {
        expect(estados.has(d)).toBe(true);
      }
    }
  });

  it('SUBSTITUIDO é terminal', () => {
    expect(TRANSICOES_ROTEIRO['SUBSTITUIDO']).toHaveLength(0);
  });

  it('suporta ciclo de revisão: RASCUNHO → EM_REVISAO → RASCUNHO', () => {
    expect(() => transitar(TRANSICOES_ROTEIRO, 'RASCUNHO', 'EM_REVISAO')).not.toThrow();
    expect(() => transitar(TRANSICOES_ROTEIRO, 'EM_REVISAO', 'RASCUNHO')).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BOM — detecção de ciclos (simulada com dados inline)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Implementação inline da lógica de detecção de ciclo para testes puros.
 * Espelha a lógica de assertSemCicloBOM sem chamar Prisma.
 */
function assertSemCicloBOMInline(
  componentes: { id: string; componenteProdutoId: string; componentePaiId: string | null }[],
  componenteProdutoId: string,
  componentePaiId: string | null,
): void {
  if (!componentePaiId) return;

  const mapa = new Map(componentes.map((c) => [c.id, { produtoId: c.componenteProdutoId, paiId: c.componentePaiId }]));

  let atual: string | null = componentePaiId;
  const visitados = new Set<string>();
  while (atual) {
    if (visitados.has(atual)) break;
    visitados.add(atual);
    const node = mapa.get(atual);
    if (!node) break;
    if (node.produtoId === componenteProdutoId) {
      throw new BusinessRuleError('CICLO_BOM', 'Ciclo detectado na BOM');
    }
    atual = node.paiId;
  }
}

describe('BOM — detecção de ciclos', () => {
  it('permite adicionar componente sem ciclo', () => {
    const componentes = [
      { id: 'c1', componenteProdutoId: 'p1', componentePaiId: null },
    ];
    // Adicionar p2 como filho de c1 — sem ciclo
    expect(() => assertSemCicloBOMInline(componentes, 'p2', 'c1')).not.toThrow();
  });

  it('deteta ciclo directo: A → B → A', () => {
    const componentes = [
      { id: 'c1', componenteProdutoId: 'pA', componentePaiId: null },  // A é raiz
      { id: 'c2', componenteProdutoId: 'pB', componentePaiId: 'c1' }, // B é filho de A
    ];
    // Tentativa: adicionar A como filho de B (c2 → A) → ciclo!
    expect(() => assertSemCicloBOMInline(componentes, 'pA', 'c2')).toThrow(BusinessRuleError);
  });

  it('deteta ciclo transitivo: A → B → C → A', () => {
    const componentes = [
      { id: 'c1', componenteProdutoId: 'pA', componentePaiId: null },
      { id: 'c2', componenteProdutoId: 'pB', componentePaiId: 'c1' },
      { id: 'c3', componenteProdutoId: 'pC', componentePaiId: 'c2' },
    ];
    // Tentativa: adicionar A como filho de C → ciclo transitivo!
    expect(() => assertSemCicloBOMInline(componentes, 'pA', 'c3')).toThrow(BusinessRuleError);
  });

  it('permite árvore em largura (sem ciclos)', () => {
    const componentes = [
      { id: 'c1', componenteProdutoId: 'pA', componentePaiId: null },
      { id: 'c2', componenteProdutoId: 'pB', componentePaiId: 'c1' },
      { id: 'c3', componenteProdutoId: 'pC', componentePaiId: 'c1' },
    ];
    // Adicionar pD como filho de c2 — sem ciclo
    expect(() => assertSemCicloBOMInline(componentes, 'pD', 'c2')).not.toThrow();
    expect(() => assertSemCicloBOMInline(componentes, 'pE', 'c3')).not.toThrow();
  });

  it('nó raiz (componentePaiId = null) não gera ciclo', () => {
    const componentes = [
      { id: 'c1', componenteProdutoId: 'pA', componentePaiId: null },
    ];
    // Adicionar produto X como raiz — sempre OK
    expect(() => assertSemCicloBOMInline(componentes, 'pX', null)).not.toThrow();
  });

  // Property: BOM sem ciclos tem DFS sem revisita
  it('[property] sem ciclos: DFS termina sem revisitar nós', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        (depth) => {
          // Gera BOM linear de profundidade `depth` (sem ciclos garantidos)
          const comps: { id: string; componenteProdutoId: string; componentePaiId: string | null }[] = [];
          for (let i = 0; i < depth; i++) {
            comps.push({
              id: `c${i}`,
              componenteProdutoId: `p${i}`,
              componentePaiId: i === 0 ? null : `c${i - 1}`,
            });
          }
          // Adicionar novo produto ao fim — nunca é ciclo
          expect(() => assertSemCicloBOMInline(comps, 'pNEW', `c${depth - 1}`)).not.toThrow();
        },
      ),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BOM — explosão (implementação inline para testes puros)
// ─────────────────────────────────────────────────────────────────────────────

type CompData = {
  id: string;
  componenteProdutoId: string;
  codigoComponente: string;
  nomeComponente: string;
  categoria: string;
  quantidade: number;
  unidadeMedida: string;
  custoUnitario: number;
  perdaPrevista: number;
  tempoLead: number | null;
  componentePaiId: string | null;
};

function explodirInline(componentes: CompData[], quantidade: number, total: boolean): ItemExplosaoBOM[] {
  const filhosMap = new Map<string | null, CompData[]>();
  for (const c of componentes) {
    const chave = c.componentePaiId ?? null;
    if (!filhosMap.has(chave)) filhosMap.set(chave, []);
    filhosMap.get(chave)!.push(c);
  }

  const resultado: ItemExplosaoBOM[] = [];

  function visitar(paiId: string | null, fator: number, nivel: number): void {
    for (const c of filhosMap.get(paiId) ?? []) {
      const perda = c.perdaPrevista;
      const fatorAjustado = perda < 1 ? fator / (1 - perda) : fator;
      const qtdTotal = c.quantidade * fatorAjustado;
      resultado.push({
        nivel,
        componenteProdutoId: c.componenteProdutoId,
        codigoComponente: c.codigoComponente,
        nomeComponente: c.nomeComponente,
        categoria: c.categoria,
        quantidadeTotal: qtdTotal,
        unidadeMedida: c.unidadeMedida,
        custoUnitario: c.custoUnitario,
        custoTotal: qtdTotal * c.custoUnitario,
        tempoLead: c.tempoLead,
      });
      if (total) visitar(c.id, qtdTotal, nivel + 1);
    }
  }

  visitar(null, quantidade, 1);
  return resultado;
}

describe('BOM — explosão', () => {
  const componentes: CompData[] = [
    { id: 'c1', componenteProdutoId: 'pMP1', codigoComponente: 'MP1', nomeComponente: 'Matéria 1', categoria: 'MATERIA_PRIMA', quantidade: 2, unidadeMedida: 'kg', custoUnitario: 10, perdaPrevista: 0, tempoLead: 5, componentePaiId: null },
    { id: 'c2', componenteProdutoId: 'pMP2', codigoComponente: 'MP2', nomeComponente: 'Matéria 2', categoria: 'MATERIA_PRIMA', quantidade: 1, unidadeMedida: 'un', custoUnitario: 20, perdaPrevista: 0.1, tempoLead: null, componentePaiId: null },
  ];

  it('explode BOM simples de 2 componentes', () => {
    const resultado = explodirInline(componentes, 10, false);
    expect(resultado).toHaveLength(2);
  });

  it('escala quantidades pelo fator de produção', () => {
    const resultado = explodirInline(componentes, 5, false);
    const mp1 = resultado.find((r) => r.componenteProdutoId === 'pMP1')!;
    expect(mp1.quantidadeTotal).toBe(10); // 2 * 5
  });

  it('aplica factor de perda prevista', () => {
    const resultado = explodirInline(componentes, 1, false);
    const mp2 = resultado.find((r) => r.componenteProdutoId === 'pMP2')!;
    // quantidade = 1 / (1 - 0.1) ≈ 1.111
    expect(mp2.quantidadeTotal).toBeCloseTo(1 / (1 - 0.1), 5);
  });

  it('calcula custo total correctamente', () => {
    const resultado = explodirInline(componentes, 1, false);
    const mp1 = resultado.find((r) => r.componenteProdutoId === 'pMP1')!;
    expect(mp1.custoTotal).toBe(mp1.quantidadeTotal * mp1.custoUnitario);
  });

  it('explosão total inclui sub-componentes', () => {
    const compsComSubNivel: CompData[] = [
      ...componentes,
      { id: 'c3', componenteProdutoId: 'pSUB', codigoComponente: 'SUB1', nomeComponente: 'Sub-comp', categoria: 'COMPONENTE', quantidade: 3, unidadeMedida: 'pc', custoUnitario: 5, perdaPrevista: 0, tempoLead: null, componentePaiId: 'c1' },
    ];
    const total = explodirInline(compsComSubNivel, 2, true);
    expect(total.length).toBe(3);
    const sub = total.find((r) => r.componenteProdutoId === 'pSUB')!;
    expect(sub.nivel).toBe(2);
    expect(sub.quantidadeTotal).toBeCloseTo(3 * 2 * 2, 5); // 3 * quantidade_pai * fator_producao
  });

  it('explosão parcial (explosaoTotal=false) não inclui sub-componentes', () => {
    const compsComSubNivel: CompData[] = [
      ...componentes,
      { id: 'c3', componenteProdutoId: 'pSUB', codigoComponente: 'SUB1', nomeComponente: 'Sub-comp', categoria: 'COMPONENTE', quantidade: 3, unidadeMedida: 'pc', custoUnitario: 5, perdaPrevista: 0, tempoLead: null, componentePaiId: 'c1' },
    ];
    const parcial = explodirInline(compsComSubNivel, 2, false);
    expect(parcial.length).toBe(2);
    expect(parcial.find((r) => r.componenteProdutoId === 'pSUB')).toBeUndefined();
  });

  // Property: quantidade total >= quantidade base (perda só aumenta)
  it('[property] explosão com perda > 0 resulta em quantidade >= original', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 1, max: 100, noNaN: true }),
        fc.float({ min: 0, max: 0.5, noNaN: true }),
        (qtd, perda) => {
          const comps: CompData[] = [
            { id: 'c1', componenteProdutoId: 'p1', codigoComponente: 'MP', nomeComponente: 'MP', categoria: 'MATERIA_PRIMA', quantidade: 1, unidadeMedida: 'kg', custoUnitario: 1, perdaPrevista: perda, tempoLead: null, componentePaiId: null },
          ];
          const resultado = explodirInline(comps, qtd, false);
          expect(resultado[0]!.quantidadeTotal).toBeGreaterThanOrEqual(qtd);
        },
      ),
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Mock StockContratoA para testar fluxo de stock
// ─────────────────────────────────────────────────────────────────────────────

describe('StockContratoA — contrato de interface', () => {
  it('mock satisfaz o tipo StockContratoA', () => {
    // Verifica que o mock implementa os métodos esperados
    const mockStock: StockContratoA = {
      reservarStock: vi.fn().mockResolvedValue({ reservaId: 'res-123' }),
      confirmarConsumoStock: vi.fn().mockResolvedValue({ id: 'mov-456', tenantId: 't1', produtoId: 'p1', varianteProdutoId: null, tipo: 'SAIDA', quantidade: '10', localizacaoOrigemId: null, localizacaoDestinoId: null, transferenciaRefId: null, documentoReferenciaId: null, documentoReferenciaTipo: null, motivo: null, observacoes: null, criadoPor: 'u1', createdAt: new Date() }),
      libertarStock: vi.fn().mockResolvedValue(undefined),
      entradaStock: vi.fn().mockResolvedValue({ id: 'mov-789', tenantId: 't1', produtoId: 'p1', varianteProdutoId: null, tipo: 'ENTRADA', quantidade: '5', localizacaoOrigemId: null, localizacaoDestinoId: null, transferenciaRefId: null, documentoReferenciaId: null, documentoReferenciaTipo: null, motivo: null, observacoes: null, criadoPor: 'u1', createdAt: new Date() }),
    };

    expect(mockStock.reservarStock).toBeDefined();
    expect(mockStock.confirmarConsumoStock).toBeDefined();
    expect(mockStock.libertarStock).toBeDefined();
    expect(mockStock.entradaStock).toBeDefined();
  });
});
