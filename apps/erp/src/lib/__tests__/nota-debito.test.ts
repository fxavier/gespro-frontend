/**
 * Regras puras da nota de débito (ADR-0039). As contas por omissão são julgadas
 * contra o plano PGC-NIRF SEMEADO, não contra a memória de quem as escreveu.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { Prisma } from '@prisma/client';
import planoContas from '../../../prisma/seed/data/plano-contas-pgc.json';
import {
  CONTA_PADRAO_NATUREZA_ND,
  NATUREZAS_NOTA_DEBITO,
  classeAdmitidaParaNatureza,
  motivoIsencaoEmFalta,
} from '../nota-debito';

describe('motivoIsencaoEmFalta (ADR-0039 §4)', () => {
  const vazio = fc.constantFrom(undefined, null, '', ' ', '\t\n');
  const texto = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);

  it('taxa zero sem motivo (ou só espaços) → em falta, em number, string ou Decimal', () => {
    fc.assert(
      fc.property(fc.constantFrom<number | string | Prisma.Decimal>(0, '0', '0.000000', new Prisma.Decimal(0)), vazio, (taxaIva, motivoIsencao) =>
        motivoIsencaoEmFalta({ taxaIva, motivoIsencao }),
      ),
    );
  });

  it('taxa zero com motivo → não está em falta', () => {
    fc.assert(fc.property(texto, (motivoIsencao) => !motivoIsencaoEmFalta({ taxaIva: 0, motivoIsencao })));
  });

  it('taxa positiva → nunca em falta, com ou sem motivo', () => {
    fc.assert(
      fc.property(fc.double({ min: 0.0001, max: 1, noNaN: true }), fc.option(fc.string()), (taxa, motivoIsencao) =>
        !motivoIsencaoEmFalta({ taxaIva: taxa, motivoIsencao }) &&
        !motivoIsencaoEmFalta({ taxaIva: new Prisma.Decimal(taxa), motivoIsencao }),
      ),
    );
  });
});

describe('natureza → classe da conta de crédito', () => {
  it('só DESPESAS_REPERCUTIDAS credita gasto (classe 6); as outras creditam rendimento (classe 7)', () => {
    for (const n of NATUREZAS_NOTA_DEBITO) {
      expect(classeAdmitidaParaNatureza(n)).toBe(n === 'DESPESAS_REPERCUTIDAS' ? 'CLASSE_6' : 'CLASSE_7');
    }
  });

  it('cada conta por omissão existe no plano semeado, é de movimento e da classe que a natureza admite', () => {
    const plano = planoContas as Array<{ codigo: string; classe: number; aceitaLancamento: boolean }>;
    for (const [natureza, codigo] of Object.entries(CONTA_PADRAO_NATUREZA_ND)) {
      const conta = plano.find((c) => c.codigo === codigo);
      expect(conta, `${natureza} → ${codigo}`).toBeDefined();
      expect(conta!.aceitaLancamento).toBe(true);
      expect(`CLASSE_${conta!.classe}`).toBe(classeAdmitidaParaNatureza(natureza as never));
    }
  });
});
