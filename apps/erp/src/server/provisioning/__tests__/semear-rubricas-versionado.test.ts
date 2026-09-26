import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import planoContasJson from '../../../../prisma/seed/data/plano-contas-pgc.json';
import { semearRubricasFluxo } from '../tenant-bootstrap';

/**
 * Teste ACESSÓRIO do nó `seed` (FIX da revisão, MAJOR 1). Complementa o caso
 * «o seed não é uma escrita do mapeamento» do oráculo protegido com o caso que
 * ele não cobre: o tenant já tem versão e DESMAPEOU uma conta. Uma 2.ª corrida
 * do seed não pode voltar a mapeá-la (seria uma escrita do mapeamento sem
 * versão n+1 — viola V2 e põe a última versão a divergir do vivo, V1), nem
 * escrever o que quer que seja.
 */

type Linha = Record<string, unknown>;

/** Duplo mínimo com estado: guarda linhas e regista TODAS as escritas. */
function tabela(escritas: string[], nome: string, unicos: string[][]) {
  const linhas: Linha[] = [];
  const casa = (l: Linha, where: Linha = {}) =>
    Object.entries(where).every(([k, v]) => (l[k] ?? null) === v);
  const colide = (d: Linha) => unicos.some((u) => linhas.some((l) => u.every((k) => l[k] === d[k])));
  return {
    linhas,
    async findMany(args: { where?: Linha } = {}) {
      return linhas.filter((l) => casa(l, args.where));
    },
    async findFirst(args: { where?: Linha } = {}) {
      return linhas.find((l) => casa(l, args.where)) ?? null;
    },
    async createMany(args: { data: Linha[]; skipDuplicates?: boolean }) {
      escritas.push(`${nome}.createMany`);
      let count = 0;
      for (const d of args.data) {
        if (colide(d)) {
          if (args.skipDuplicates) continue;
          throw new Error(`${nome}: unique`);
        }
        linhas.push({ id: randomUUID(), deletedAt: null, ...d });
        count++;
      }
      return { count };
    },
    async create(args: { data: Linha }) {
      escritas.push(`${nome}.create`);
      if (colide(args.data)) throw new Error(`${nome}: unique`);
      const l = { id: randomUUID(), deletedAt: null, ...args.data };
      linhas.push(l);
      return l;
    },
  };
}

function fakeTx(tenantId: string) {
  const escritas: string[] = [];
  const contaPGC = tabela(escritas, 'contaPGC', [['tenantId', 'codigo']]);
  const vistos = new Set<string>();
  for (const c of planoContasJson as Array<{ codigo: string; aceitaLancamento: boolean }>) {
    if (vistos.has(c.codigo)) continue;
    vistos.add(c.codigo);
    contaPGC.linhas.push({ id: randomUUID(), tenantId, codigo: c.codigo, aceitaLancamento: c.aceitaLancamento, ativo: true });
  }
  return {
    escritas,
    contaPGC,
    rubricaFluxoCaixa: tabela(escritas, 'rubricaFluxoCaixa', [['tenantId', 'codigo']]),
    mapeamentoContaFluxo: tabela(escritas, 'mapeamentoContaFluxo', [['tenantId', 'contaId']]),
    versaoMapeamentoFluxo: tabela(escritas, 'versaoMapeamentoFluxo', [['tenantId', 'numero']]),
  };
}

describe('semearRubricasFluxo — tenant já versionado', () => {
  const T = 'tenant-versionado';

  it('2.ª corrida com versão existente e uma conta desmapeada: a conta continua desmapeada e nada se escreve', async () => {
    const tx = fakeTx(T);
    const primeira = await semearRubricasFluxo(tx as never, T);
    expect(primeira.versaoCriada).toBe(true);
    expect(primeira.mapeamentos).toBeGreaterThan(0);

    // O tenant desmapeou uma conta (escrita do serviço de configuração, que
    // criou a versão 2) — simulado directamente no duplo.
    const [removido] = tx.mapeamentoContaFluxo.linhas.splice(0, 1);
    await tx.versaoMapeamentoFluxo.create({ data: { tenantId: T, numero: 2, instantaneo: {} } });
    const mapeamentosAntes = tx.mapeamentoContaFluxo.linhas.length;
    const rubricasAntes = tx.rubricaFluxoCaixa.linhas.length;
    tx.escritas.length = 0;

    const segunda = await semearRubricasFluxo(tx as never, T);

    expect(segunda).toEqual({ rubricas: 0, mapeamentos: 0, versaoCriada: false });
    expect(tx.escritas).toEqual([]);
    expect(tx.mapeamentoContaFluxo.linhas.some((m) => m.contaId === removido.contaId)).toBe(false);
    expect(tx.mapeamentoContaFluxo.linhas).toHaveLength(mapeamentosAntes);
    expect(tx.rubricaFluxoCaixa.linhas).toHaveLength(rubricasAntes);
    expect(tx.versaoMapeamentoFluxo.linhas.map((v) => v.numero).sort()).toEqual([1, 2]);
  });

  it('tenant com versão mas rubrica SISTEMA apagada: o seed não a repõe', async () => {
    const tx = fakeTx(T);
    await semearRubricasFluxo(tx as never, T);
    const rubricasAntes = tx.rubricaFluxoCaixa.linhas.length;
    tx.rubricaFluxoCaixa.linhas.pop();
    tx.escritas.length = 0;

    await semearRubricasFluxo(tx as never, T);

    expect(tx.escritas).toEqual([]);
    expect(tx.rubricaFluxoCaixa.linhas).toHaveLength(rubricasAntes - 1);
  });
});
