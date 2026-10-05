/**
 * ORÁCULO P5-v (run exercicio-followups, issue #365, ADR-0035 §8) — os documentos PDF do
 * balanço e da DRE (motor do ADR-0005-a, Helvetica).
 *
 * Contrato (decidido pelo orquestrador; a forma de `dados` fixa-se AQUI — questão em aberto):
 *
 *   import { renderBalancoPdf } from '@/lib/documents/pdf/balanco-pdf';
 *   renderBalancoPdf(
 *     dados: {
 *       entidade: { nome: string; nuit: string };
 *       exercicio: string;          // código do exercício
 *       periodoFinal: number;       // 1..13
 *       balanco: Balanco;           // o retorno de gerarBalanco (balanco.service)
 *     },
 *     emissao: { em: Date; por: string },
 *   ): Promise<Uint8Array>
 *
 *   Balanco = { activo, capitalProprio, passivo: { linhas: { codigo, nome, valor }[], total },
 *               resultadoDoPeriodo, equilibrado }  — montantes `Prisma.Decimal`.
 *
 *   import { renderDrePdf } from '@/lib/documents/pdf/dre-pdf';
 *   renderDrePdf(dados: { entidade: { nome; nuit }; dre: DRE }, emissao: { em; por })
 *     — `DRE` é o retorno de `gerarDRE` (contabilidade.interface).
 *
 * Verifica-se pelo texto (auxiliar calibrado `pdf-texto.ts`, forma compacta): título,
 * entidade, NUIT, as três massas do balanço e os seus totais; na DRE, o título, a entidade e o
 * resultado líquido. Montantes: `formatNumero` (o `formatMZN` contém-no — servem os dois).
 *
 * Escrito pelo autor do oráculo antes dos documentos existirem. NUNCA `vitest -u`; um agente de
 * implementação que altere este ficheiro é BLOCKER.
 */
import { Prisma } from '@prisma/client';
import { beforeAll, describe, expect, it } from 'vitest';
import { formatNumero } from '@/lib/format-currency';
import { compactar, garantirExtractor, textoCompacto } from '@/app/api/contabilidade/dfc/export/__tests__/pdf-texto';

type Render = (dados: unknown, emissao: { em: Date; por: string }) => Promise<Uint8Array>;

async function carregar(caminho: string, nome: string): Promise<Render> {
  let modulo: Record<string, unknown> | undefined;
  let erro = '';
  try {
    modulo = (await import(/* @vite-ignore */ caminho)) as Record<string, unknown>;
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }
  expect(typeof modulo?.[nome], `${caminho} exporta ${nome}${erro ? ` (import falhou: ${erro})` : ''}`).toBe('function');
  return modulo![nome] as Render;
}

const D = (v: string) => new Prisma.Decimal(v);
const f = (v: string) => compactar(formatNumero(v));

const ENTIDADE = { nome: 'Mercearia Oráculo Lda', nuit: '400123456' };
const EMISSAO = { em: new Date('2027-01-20T09:30:00.000+02:00'), por: 'Bernardo Revisor' };

/** O balanço do cenário P3 depois do encerramento (período 13). */
const BALANCO = {
  activo: {
    linhas: [
      { codigo: '11', nome: 'Caixa', valor: D('700') },
      { codigo: '12', nome: 'Bancos', valor: D('2000') },
    ],
    total: D('2700'),
  },
  capitalProprio: {
    linhas: [
      { codigo: '52', nome: 'Capital social', valor: D('2000') },
      { codigo: '88', nome: 'Resultado líquido do exercício', valor: D('600') },
    ],
    total: D('2600'),
  },
  passivo: {
    linhas: [{ codigo: '44', nome: 'Estado', valor: D('100') }],
    total: D('100'),
  },
  resultadoDoPeriodo: D('0'),
  equilibrado: true,
};

const DRE = {
  dataInicio: new Date('2026-01-01T00:00:00.000+02:00'),
  dataFim: new Date('2026-12-31T23:59:59.999+02:00'),
  receitaBruta: D('1000'),
  deducoes: D('0'),
  receitaLiquida: D('1000'),
  custoProdutosVendidos: D('0'),
  lucroBruto: D('1000'),
  despesasVendas: D('0'),
  despesasAdministrativas: D('300'),
  despesasGerais: D('0'),
  totalDespesasOperacionais: D('300'),
  lucroOperacional: D('700'),
  receitasFinanceiras: D('0'),
  despesasFinanceiras: D('0'),
  resultadoFinanceiro: D('0'),
  lucroAntesImpostos: D('700'),
  impostos: D('0'),
  lucroLiquido: D('700'),
};

const assinatura = (pdf: Uint8Array) => Buffer.from(pdf.subarray(0, 5)).toString('latin1');

beforeAll(async () => {
  await garantirExtractor();
}, 30_000);

describe('renderBalancoPdf', () => {
  it('é um PDF com título, entidade, NUIT e exercício', async () => {
    const render = await carregar('@/lib/documents/pdf/balanco-pdf', 'renderBalancoPdf');
    const pdf = await render({ entidade: ENTIDADE, exercicio: '2026', periodoFinal: 13, balanco: BALANCO }, EMISSAO);
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(assinatura(pdf)).toBe('%PDF-');
    const t = textoCompacto(pdf);
    expect(t).toContain(compactar('Balanço'));
    expect(t).toContain(compactar(ENTIDADE.nome));
    expect(t).toContain(ENTIDADE.nuit);
    expect(t).toContain('2026');
  }, 60_000);

  it('mostra as três massas, as linhas por conta de razão e os totais', async () => {
    const render = await carregar('@/lib/documents/pdf/balanco-pdf', 'renderBalancoPdf');
    const pdf = await render({ entidade: ENTIDADE, exercicio: '2026', periodoFinal: 13, balanco: BALANCO }, EMISSAO);
    const t = textoCompacto(pdf);
    expect(t).toContain(compactar('Activo'));
    expect(t).toContain(compactar('Capital próprio'));
    expect(t).toContain(compactar('Passivo'));
    for (const nome of ['Caixa', 'Bancos', 'Capital social', 'Estado']) expect(t, nome).toContain(compactar(nome));
    expect(t).toContain(f('2700'));
    expect(t).toContain(f('2600'));
    expect(t).toContain(f('2000'));
    expect(t).toContain(f('600'));
    expect(t).toContain(f('100'));
  }, 60_000);
});

describe('renderDrePdf', () => {
  it('é um PDF com título, entidade, NUIT e o resultado líquido', async () => {
    const render = await carregar('@/lib/documents/pdf/dre-pdf', 'renderDrePdf');
    const pdf = await render({ entidade: ENTIDADE, dre: DRE }, EMISSAO);
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(assinatura(pdf)).toBe('%PDF-');
    const t = textoCompacto(pdf);
    expect(t).toContain(compactar('Demonstração de Resultados'));
    expect(t).toContain(compactar(ENTIDADE.nome));
    expect(t).toContain(ENTIDADE.nuit);
    expect(t).toContain(f('1000'));
    expect(t).toContain(f('700'));
    expect(t).toContain(f('300'));
  }, 60_000);
});
