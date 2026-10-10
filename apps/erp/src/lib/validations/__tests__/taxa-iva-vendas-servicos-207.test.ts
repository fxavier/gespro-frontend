/**
 * Oráculo — issue #207 (e a parte de taxa da #125): a taxa de IVA de vendas e serviços passa a
 * usar o MESMO schema da faturação (`taxaIvaSchema()` de `@/lib/iva`).
 *
 * Contrato:
 *   - Os schemas de entrada de vendas (`CreateItemVendaSchema`, `CreateItemEncomendaSchema`,
 *     `CreateItemDevolucaoSchema`) e de serviços (`CreateServicoSchema`, `UpdateServicoSchema`,
 *     `CreateAgendamentoServicoSchema`) aceitam só `TAXAS_IVA` = {0, 0.16};
 *   - qualquer outra taxa (0.17, 0.05, 1, −0.16) é recusada no caminho `taxaIva`, com a mensagem
 *     da faturação (`MENSAGEM_TAXA_IVA_INVALIDA`) — a da constante partilhada, não uma local;
 *   - o 0 é preservado (isento não vira 16%);
 *   - nos schemas de CRIAÇÃO não há `.default(0.16)`: uma taxa ausente é recusada, não inventada
 *     (decisão C2 da #77, critério de aceitação da #207). No `UpdateServicoSchema` a taxa
 *     continua opcional (ausente = não mexer), mas, se vier, só {0, 0.16};
 *   - os schemas-pai (`CreateVendaSchema`, `CreateEncomendaSchema`, `CreateDevolucaoSchema`,
 *     `CreateTrocaSchema`, `CriarTrocaFormSchema`) herdam a recusa — 0.17 num item não passa.
 *
 * Acesso dinâmico (`as any`) de propósito: o caso falha pelo comportamento, não o ficheiro.
 */
import { describe, expect, it } from 'vitest';
import * as vendas from '@/lib/validations/vendas';
import * as servicos from '@/lib/validations/servicos';
import { MENSAGEM_TAXA_IVA_INVALIDA } from '@/lib/iva';

const CUID = 'ckz0000000000000000000000';
const CUID2 = 'ckz0000000000000000000001';
const CUID3 = 'ckz0000000000000000000002';

type Caso = { modulo: Record<string, unknown>; nome: string; base: Record<string, unknown>; criacao: boolean };

const itemVenda = { produtoId: CUID, nomeProduto: 'Artigo', quantidade: 1, precoUnitario: 100, desconto: 0 };
const itemDevolucao = { produtoId: CUID, nomeProduto: 'Artigo', quantidade: 1, valorUnitario: 100 };
const servico = { codigo: 'SRV-207', nome: 'Serviço 207', preco: 2000, duracaoEstimada: 60 };
const agendamento = {
  servicoId: CUID,
  clienteId: 'cliente-207',
  clienteNome: 'Cliente 207',
  clienteEmail: 'cliente-207@test.mz',
  clienteTelefone: '+258 84 000 0207',
  dataAgendamento: new Date(Date.UTC(2026, 9, 20, 10)),
  horaInicio: '09:00',
  horaFim: '10:00',
  duracaoEstimada: 60,
  local: 'Escritório do cliente',
  endereco: 'Av. Julius Nyerere 207',
  cidade: 'Maputo',
  provincia: 'Maputo Cidade',
  precoServico: 1500,
  desconto: 0,
};

const CASOS: Caso[] = [
  { modulo: vendas, nome: 'CreateItemVendaSchema', base: itemVenda, criacao: true },
  { modulo: vendas, nome: 'CreateItemEncomendaSchema', base: itemVenda, criacao: true },
  { modulo: vendas, nome: 'CreateItemDevolucaoSchema', base: itemDevolucao, criacao: true },
  { modulo: servicos, nome: 'CreateServicoSchema', base: servico, criacao: true },
  { modulo: servicos, nome: 'UpdateServicoSchema', base: {}, criacao: false },
  { modulo: servicos, nome: 'CreateAgendamentoServicoSchema', base: agendamento, criacao: true },
];

const RECUSADAS: unknown[] = [0.17, 0.05, 1, -0.16, 0.5];

function schemaDe(c: Caso): any {
  const s = (c.modulo as any)[c.nome];
  expect(s, `${c.nome} exportado`).toBeDefined();
  return s;
}

function mensagensTaxa(r: any): string[] {
  return (r?.error?.issues ?? [])
    .filter((i: any) => Array.isArray(i.path) && i.path.includes('taxaIva'))
    .map((i: any) => i.message);
}

function semTaxa(o: Record<string, unknown>) {
  const c = { ...o };
  delete c.taxaIva;
  return c;
}

describe('#207 — taxa de IVA de vendas e serviços só {0, 0.16}', () => {
  for (const c of CASOS) {
    describe(c.nome, () => {
      it('base válida com 0.16 passa e devolve 0.16 (a recusa abaixo é só da taxa)', () => {
        const r = schemaDe(c).safeParse({ ...c.base, taxaIva: 0.16 });
        expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
        expect(r.data.taxaIva).toBe(0.16);
      });

      it('aceita 0 (isento) e preserva-o — não vira 16%', () => {
        const r = schemaDe(c).safeParse({ ...c.base, taxaIva: 0 });
        expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
        expect(Object.is(r.data.taxaIva, 0)).toBe(true);
      });

      for (const taxa of RECUSADAS) {
        it(`recusa ${String(taxa)} no campo taxaIva com a mensagem da faturação`, () => {
          const r = schemaDe(c).safeParse({ ...c.base, taxaIva: taxa });
          expect(r.success, `${c.nome} aceitou taxaIva=${String(taxa)}`).toBe(false);
          expect(mensagensTaxa(r)).toEqual([MENSAGEM_TAXA_IVA_INVALIDA]);
        });
      }

      if (c.criacao) {
        it('taxa ausente é recusada — sem .default(0.16) silencioso', () => {
          const r = schemaDe(c).safeParse(semTaxa({ ...c.base, taxaIva: 0.16 }));
          expect(r.success, `${c.nome} inventou uma taxa: ${JSON.stringify(r.data?.taxaIva)}`).toBe(false);
          expect(mensagensTaxa(r)).toEqual([MENSAGEM_TAXA_IVA_INVALIDA]);
        });
      } else {
        it('taxa ausente continua permitida na edição e não é inventada', () => {
          const r = schemaDe(c).safeParse({ ...c.base });
          expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
          expect(r.data.taxaIva).toBeUndefined();
        });
      }
    });
  }
});

describe('#207 — os schemas-pai herdam a recusa', () => {
  const v = vendas as any;

  it('CreateVendaSchema recusa um item a 0.17', () => {
    const base = {
      itens: [{ ...itemVenda, taxaIva: 0.16 }],
      pagamentos: [{ tipo: 'DINHEIRO', valor: 116 }],
      vendedorId: CUID2,
      sessaoPOSId: CUID3,
      sessaoCaixaId: CUID3,
    };
    // Se a base não for aceite, a prova abaixo não diz nada sobre a taxa.
    const ok = v.CreateVendaSchema.safeParse(base);
    expect(ok.success, JSON.stringify(ok.error?.issues)).toBe(true);
    const r = v.CreateVendaSchema.safeParse({ ...base, itens: [{ ...itemVenda, taxaIva: 0.17 }] });
    expect(r.success).toBe(false);
    expect(mensagensTaxa(r)).toEqual([MENSAGEM_TAXA_IVA_INVALIDA]);
  });

  it('CreateEncomendaSchema recusa um item a 0.17', () => {
    const base = { clienteId: CUID2, itens: [{ ...itemVenda, taxaIva: 0.16 }] };
    expect(v.CreateEncomendaSchema.safeParse(base).success).toBe(true);
    const r = v.CreateEncomendaSchema.safeParse({ ...base, itens: [{ ...itemVenda, taxaIva: 0.17 }] });
    expect(r.success).toBe(false);
    expect(mensagensTaxa(r)).toEqual([MENSAGEM_TAXA_IVA_INVALIDA]);
  });

  it('CreateDevolucaoSchema recusa um item a 0.17', () => {
    const base = { clienteId: CUID2, motivo: 'DEFEITO', reembolso: false, itens: [{ ...itemDevolucao, taxaIva: 0.16 }] };
    const ok = v.CreateDevolucaoSchema.safeParse(base);
    expect(ok.success, JSON.stringify(ok.error?.issues)).toBe(true);
    const r = v.CreateDevolucaoSchema.safeParse({ ...base, itens: [{ ...itemDevolucao, taxaIva: 0.17 }] });
    expect(r.success).toBe(false);
    expect(mensagensTaxa(r)).toEqual([MENSAGEM_TAXA_IVA_INVALIDA]);
  });

  for (const nome of ['CreateTrocaSchema', 'CriarTrocaFormSchema'] as const) {
    it(`${nome} recusa o novo item a 0.17`, () => {
      const base = { devolucaoId: CUID2, novoItem: { ...itemVenda, taxaIva: 0.16 }, localizacaoId: CUID3, pagamentos: [] };
      const ok = v[nome].safeParse(base);
      expect(ok.success, JSON.stringify(ok.error?.issues)).toBe(true);
      const r = v[nome].safeParse({ ...base, novoItem: { ...itemVenda, taxaIva: 0.17 } });
      expect(r.success).toBe(false);
      expect(mensagensTaxa(r)).toEqual([MENSAGEM_TAXA_IVA_INVALIDA]);
    });
  }
});
