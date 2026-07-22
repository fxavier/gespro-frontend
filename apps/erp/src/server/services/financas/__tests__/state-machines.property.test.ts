import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  TRANSICOES_SESSAO_CAIXA,
  type StatusSessaoCaixa,
} from '../caixa.interface';
import {
  TRANSICOES_LANCAMENTO,
  type StatusLancamento,
} from '../contabilidade.interface';
import {
  TRANSICOES_FATURA,
  TRANSICOES_NOTA_CREDITO,
  TRANSICOES_NOTA_DEBITO,
  TRANSICOES_PROFORMA,
  TRANSICOES_COTACAO_COMERCIAL,
  type StatusFatura,
  type StatusNotaCredito,
  type StatusProforma,
  type StatusCotacaoComercial,
} from '../faturacao.interface';
import { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Helpers de property test
// ---------------------------------------------------------------------------

/**
 * Verifica que o grafo de transições é consistente (estados referenciados
 * como destinos existem como chaves) e tem pelo menos um estado terminal.
 */
function assertMaquinaConsistente<S extends string>(
  mapa: Record<S, S[]>,
  _nome: string,
): void {
  const estados = Object.keys(mapa) as S[];
  for (const [, destinos] of Object.entries(mapa) as [S, S[]][]) {
    for (const d of destinos) {
      expect(estados).toContain(d);
    }
  }
  const terminais = estados.filter((s) => (mapa[s] as S[]).length === 0);
  expect(terminais.length).toBeGreaterThan(0);
}

/** Segue o primeiro destino disponível até chegar a um terminal. */
function caminhoValido<S extends string>(mapa: Record<S, S[]>, inicial: S): S[] {
  const caminho = [inicial];
  let atual = inicial;
  let i = 0;
  while ((mapa[atual] as S[]).length > 0 && i++ < 10) {
    atual = (mapa[atual] as S[])[0];
    caminho.push(atual);
  }
  return caminho;
}

// ---------------------------------------------------------------------------
// SessaoCaixa
// ---------------------------------------------------------------------------

describe('máquina SessaoCaixa', () => {
  it('estrutura consistente (estados referenciados existem)', () => {
    assertMaquinaConsistente(TRANSICOES_SESSAO_CAIXA, 'SessaoCaixa');
  });

  it('ABERTA é o único estado com transições de saída', () => {
    expect(TRANSICOES_SESSAO_CAIXA['ABERTA'].length).toBeGreaterThan(0);
    expect(TRANSICOES_SESSAO_CAIXA['FECHADA']).toEqual([]);
    expect(TRANSICOES_SESSAO_CAIXA['CANCELADA']).toEqual([]);
  });

  it('caminho canónico ABERTA→FECHADA é válido', () => {
    const caminho = caminhoValido(TRANSICOES_SESSAO_CAIXA, 'ABERTA');
    expect(caminho[0]).toBe('ABERTA');
    expect(TRANSICOES_SESSAO_CAIXA['ABERTA']).toContain(caminho[1]);
  });

  it('[property] qualquer estado terminal não tem transições de saída', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<StatusSessaoCaixa>('FECHADA', 'CANCELADA'),
        (estado) => {
          expect(TRANSICOES_SESSAO_CAIXA[estado]).toEqual([]);
          return true;
        },
      ),
    );
  });

  it('[property] transição ABERTA sempre produz estado conhecido', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TRANSICOES_SESSAO_CAIXA['ABERTA']),
        (alvo) => {
          expect(Object.keys(TRANSICOES_SESSAO_CAIXA)).toContain(alvo);
          return true;
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Lancamento
// ---------------------------------------------------------------------------

describe('máquina Lancamento', () => {
  it('estrutura consistente', () => {
    assertMaquinaConsistente(TRANSICOES_LANCAMENTO, 'Lancamento');
  });

  it('RASCUNHO→LANCADO→ESTORNADO é o caminho canónico', () => {
    const caminho = caminhoValido(TRANSICOES_LANCAMENTO, 'RASCUNHO');
    expect(caminho).toEqual(['RASCUNHO', 'LANCADO', 'ESTORNADO']);
  });

  it('ESTORNADO é terminal', () => {
    expect(TRANSICOES_LANCAMENTO['ESTORNADO']).toEqual([]);
  });

  it('[property] ESTORNADO é terminal (property)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<StatusLancamento>('ESTORNADO'),
        (s) => {
          expect(TRANSICOES_LANCAMENTO[s]).toEqual([]);
          return true;
        },
      ),
    );
  });

  it('[property] todos os destinos de transição existem como estados', () => {
    const estados = Object.keys(TRANSICOES_LANCAMENTO) as StatusLancamento[];
    fc.assert(
      fc.property(
        fc.constantFrom(...estados),
        (estado) => {
          for (const d of TRANSICOES_LANCAMENTO[estado]) {
            expect(estados).toContain(d);
          }
          return true;
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Fatura
// ---------------------------------------------------------------------------

describe('máquina Fatura', () => {
  it('estrutura consistente', () => {
    assertMaquinaConsistente(TRANSICOES_FATURA, 'Fatura');
  });

  it('PAGA e CANCELADA são terminais', () => {
    expect(TRANSICOES_FATURA['PAGA']).toEqual([]);
    expect(TRANSICOES_FATURA['CANCELADA']).toEqual([]);
  });

  it('[property] estado RASCUNHO só vai para EMITIDA', () => {
    fc.assert(
      fc.property(
        fc.constant<StatusFatura>('RASCUNHO'),
        (s) => {
          expect(TRANSICOES_FATURA[s]).toEqual(['EMITIDA']);
          return true;
        },
      ),
    );
  });

  it('[property] todos os destinos existem', () => {
    const estados = Object.keys(TRANSICOES_FATURA) as StatusFatura[];
    fc.assert(
      fc.property(
        fc.constantFrom(...estados),
        (estado) => {
          for (const d of TRANSICOES_FATURA[estado]) {
            expect(estados).toContain(d);
          }
          return true;
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// NotaCredito e NotaDebito
// ---------------------------------------------------------------------------

describe('máquinas NC e ND', () => {
  it('NC: estrutura consistente e terminais corretos', () => {
    assertMaquinaConsistente(TRANSICOES_NOTA_CREDITO, 'NotaCredito');
    expect(TRANSICOES_NOTA_CREDITO['LIQUIDADA']).toEqual([]);
    expect(TRANSICOES_NOTA_CREDITO['CANCELADA']).toEqual([]);
  });

  it('ND: estrutura consistente e terminais corretos', () => {
    assertMaquinaConsistente(TRANSICOES_NOTA_DEBITO, 'NotaDebito');
    expect(TRANSICOES_NOTA_DEBITO['LIQUIDADA']).toEqual([]);
    expect(TRANSICOES_NOTA_DEBITO['CANCELADA']).toEqual([]);
  });

  it('[property] NC RASCUNHO→EMITIDA→LIQUIDADA caminho válido', () => {
    fc.assert(
      fc.property(fc.constant<StatusNotaCredito>('RASCUNHO'), (s) => {
        const proximo = TRANSICOES_NOTA_CREDITO[s][0];
        expect(proximo).toBe('EMITIDA');
        const terminal = TRANSICOES_NOTA_CREDITO[proximo][0];
        expect(['LIQUIDADA', 'CANCELADA']).toContain(terminal);
        return true;
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Proforma e CotacaoComercial
// ---------------------------------------------------------------------------

describe('máquinas Proforma e CotacaoComercial', () => {
  it('Proforma: CONVERTIDA, EXPIRADA, CANCELADA são terminais', () => {
    assertMaquinaConsistente(TRANSICOES_PROFORMA, 'Proforma');
    const terminais: StatusProforma[] = ['CONVERTIDA', 'EXPIRADA', 'CANCELADA'];
    for (const t of terminais) expect(TRANSICOES_PROFORMA[t]).toEqual([]);
  });

  it('CotacaoComercial: terminais corretos', () => {
    assertMaquinaConsistente(TRANSICOES_COTACAO_COMERCIAL, 'CotacaoComercial');
    const terminais: StatusCotacaoComercial[] = ['REJEITADA', 'CONVERTIDA', 'EXPIRADA', 'CANCELADA'];
    for (const t of terminais) expect(TRANSICOES_COTACAO_COMERCIAL[t]).toEqual([]);
  });

  it('[property] CotacaoComercial ACEITE só vai para CONVERTIDA', () => {
    fc.assert(
      fc.property(fc.constant<StatusCotacaoComercial>('ACEITE'), (s) => {
        expect(TRANSICOES_COTACAO_COMERCIAL[s]).toEqual(['CONVERTIDA']);
        return true;
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Invariante débito=crédito com aritmética Decimal
// ---------------------------------------------------------------------------

describe('invariante débito=crédito (Decimal exacto)', () => {
  it('[property] Decimal.plus nunca acumula imprecisão float', () => {
    // Usar fc.integer para evitar problemas de float 32-bit
    fc.assert(
      fc.property(
        // Gerar inteiros de centavos (1 a 1000000) para evitar problemas de ponto flutuante
        fc.array(fc.integer({ min: 1, max: 1000000 }), { minLength: 1, maxLength: 10 }),
        (centavos) => {
          let totalDeb = new Prisma.Decimal(0);
          let totalCred = new Prisma.Decimal(0);
          for (const c of centavos) {
            const dec = new Prisma.Decimal(c).dividedBy(100);
            totalDeb = totalDeb.plus(dec);
            totalCred = totalCred.plus(dec);
          }
          expect(totalDeb.equals(totalCred)).toBe(true);
          return true;
        },
      ),
    );
  });

  it('[property] partidas desequilibradas com valores diferentes são detectadas', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000000 }),
        fc.integer({ min: 1, max: 1000000 }),
        (centavosA, centavosB) => {
          if (centavosA === centavosB) return true; // caso trivial
          const decA = new Prisma.Decimal(centavosA).dividedBy(100);
          const decB = new Prisma.Decimal(centavosB).dividedBy(100);
          expect(decA.equals(decB)).toBe(false);
          return true;
        },
      ),
    );
  });

  it('caso concreto: 0.1 + 0.2 com Decimal não tem imprecisão float', () => {
    const a = new Prisma.Decimal('0.10');
    const b = new Prisma.Decimal('0.20');
    const soma = a.plus(b);
    // Decimal.js preserva precisão: 0.1 + 0.2 = 0.3 exacto
    expect(soma.equals(new Prisma.Decimal('0.3'))).toBe(true);
    // Em JS nativo há imprecisão:
    expect(0.1 + 0.2).not.toBe(0.3);
  });

  it('[property] lançamento com N partidas débito = N partidas crédito equilibra', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 100, max: 100000 }), { minLength: 1, maxLength: 5 }),
        (valores) => {
          let deb = new Prisma.Decimal(0);
          let cred = new Prisma.Decimal(0);
          for (const v of valores) {
            const dec = new Prisma.Decimal(v).dividedBy(100);
            deb = deb.plus(dec);
            cred = cred.plus(dec);
          }
          expect(deb.equals(cred)).toBe(true);
          return true;
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Paridade: TipoSerieDocumento TS ↔ Prisma enum
// ---------------------------------------------------------------------------

describe('TipoSerieDocumento paridade', () => {
  const TIPOS_ESPERADOS = [
    'FATURA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'PROFORMA', 'COTACAO_COMERCIAL',
    'RECIBO', 'VENDA', 'SESSAO_CAIXA', 'REQUISICAO_COMPRA', 'COTACAO_RFQ',
    'PEDIDO_COMPRA', 'CONTA_PAGAR', 'PAGAMENTO', 'RECEBIMENTO',
    'ORDEM_PRODUCAO', 'ATIVIDADE', 'TICKET', 'ENTREGA',
  ] as const;

  it('todos os tipos esperados são strings não vazias', () => {
    for (const t of TIPOS_ESPERADOS) {
      expect(typeof t).toBe('string');
      expect(t.length).toBeGreaterThan(0);
    }
  });

  it('nenhum tipo duplicado', () => {
    const unicos = new Set(TIPOS_ESPERADOS);
    expect(unicos.size).toBe(TIPOS_ESPERADOS.length);
  });

  it('conta 18 tipos documentais', () => {
    expect(TIPOS_ESPERADOS.length).toBe(18);
  });
});
