import { describe, expect, it } from 'vitest';
import planoContasJson from '../../../../prisma/seed/data/plano-contas-pgc.json';
import rubricasJson from '../../../../prisma/seed/data/rubricas-fluxo-caixa.json';
import { AtividadeFluxoEnum, SinalFluxoEnum } from '@/lib/validations/fluxo-caixa';

/**
 * Teste ACESSÓRIO do nó `seed` (ticket 4.1) — tranca a FORMA de
 * `rubricas-fluxo-caixa.json` contra `plano-contas-pgc.json`, não o
 * conteúdo contabilístico (esse é do parecer, ticket 11). O oráculo
 * protegido (`tenant-bootstrap.test.ts`) prova as propriedades do seed sobre
 * um plano qualquer; este ficheiro prova que a tabela de dados é coerente
 * consigo própria antes de o seed a ler:
 *  - cada folha do plano tem exactamente UMA linha (I7 sobre os dados);
 *  - nenhuma linha aponta para uma conta que não é folha, nem para uma
 *    rubrica que não existe;
 *  - as contas `CAIXA` são folhas activas da classe 1 (E2 sem avisos);
 *  - as classes 6 e 7 (tipo GASTO/RENDIMENTO) estão numa rubrica OPERACIONAL —
 *    o núcleo exclui-as das secções pelo tipo, mas precisam de mapeamento.
 */

interface ContaPlano {
  codigo: string;
  nome: string;
  classe: number;
  aceitaLancamento: boolean;
}

function folhasDoPlano(): ContaPlano[] {
  const vistos = new Set<string>();
  const folhas: ContaPlano[] = [];
  for (const c of planoContasJson as ContaPlano[]) {
    if (vistos.has(c.codigo)) continue;
    vistos.add(c.codigo);
    if (c.aceitaLancamento) folhas.push(c);
  }
  return folhas;
}

const { rubricas, mapeamentos } = rubricasJson;
const folhas = folhasDoPlano();
const folhaPorCodigo = new Map(folhas.map((c) => [c.codigo, c]));
const rubricaPorCodigo = new Map(rubricas.map((r) => [r.codigo, r]));

describe('rubricas-fluxo-caixa.json — rubricas SISTEMA', () => {
  it('códigos únicos, enums válidos, ordem inteira, textos não vazios', () => {
    expect(new Set(rubricas.map((r) => r.codigo)).size).toBe(rubricas.length);
    for (const r of rubricas) {
      expect(AtividadeFluxoEnum.options).toContain(r.atividade);
      expect(SinalFluxoEnum.options).toContain(r.sinal);
      expect(Number.isInteger(r.ordem)).toBe(true);
      expect(r.codigo.length).toBeGreaterThan(0);
      expect(r.designacao.length).toBeGreaterThan(0);
    }
  });

  it('as quatro actividades têm rubrica, e a CAIXA é uma só', () => {
    const porAtividade = new Map<string, number>();
    for (const r of rubricas) porAtividade.set(r.atividade, (porAtividade.get(r.atividade) ?? 0) + 1);
    for (const a of AtividadeFluxoEnum.options) expect(porAtividade.get(a) ?? 0).toBeGreaterThan(0);
    // Uma conta tem uma só rubrica; várias rubricas CAIXA só serviriam para
    // repartir a caixa por linhas, e o Δcaixa é um número só.
    expect(porAtividade.get('CAIXA')).toBe(1);
  });

  it('a ordem é única dentro de cada actividade (é a ordem de apresentação)', () => {
    const vistos = new Set<string>();
    for (const r of rubricas) {
      const chave = `${r.atividade}:${r.ordem}`;
      expect(vistos.has(chave), `ordem repetida: ${chave}`).toBe(false);
      vistos.add(chave);
    }
  });
});

describe('rubricas-fluxo-caixa.json — mapeamento conta → rubrica', () => {
  it('cada folha do plano canónico tem exactamente uma linha, e nenhuma linha está fora das folhas', () => {
    const porConta = new Map<string, number>();
    for (const m of mapeamentos) porConta.set(m.conta, (porConta.get(m.conta) ?? 0) + 1);

    const semLinha = folhas.filter((c) => !porConta.has(c.codigo)).map((c) => c.codigo);
    expect(semLinha).toEqual([]);
    const repetidas = [...porConta.entries()].filter(([, n]) => n !== 1).map(([c]) => c);
    expect(repetidas).toEqual([]);
    const foraDasFolhas = mapeamentos.filter((m) => !folhaPorCodigo.has(m.conta)).map((m) => m.conta);
    expect(foraDasFolhas).toEqual([]);
    expect(mapeamentos.length).toBe(folhas.length);
  });

  it('toda a rubrica referida existe', () => {
    const penduradas = mapeamentos.filter((m) => !rubricaPorCodigo.has(m.rubrica)).map((m) => `${m.conta}→${m.rubrica}`);
    expect(penduradas).toEqual([]);
  });

  it('o nome de cada linha é o do plano (documentação que não pode mentir)', () => {
    const divergentes = mapeamentos
      .filter((m) => folhaPorCodigo.get(m.conta)?.nome !== m.nome)
      .map((m) => `${m.conta}: «${m.nome}» ≠ «${folhaPorCodigo.get(m.conta)?.nome}»`);
    expect(divergentes).toEqual([]);
  });

  it('as contas CAIXA são folhas da classe 1 (E2: a configuração por omissão não nasce com avisos)', () => {
    const rubricasCaixa = new Set(rubricas.filter((r) => r.atividade === 'CAIXA').map((r) => r.codigo));
    const contasCaixa = mapeamentos.filter((m) => rubricasCaixa.has(m.rubrica));
    expect(contasCaixa.length).toBeGreaterThan(0);
    const foraDaClasse1 = contasCaixa.filter((m) => folhaPorCodigo.get(m.conta)?.classe !== 1).map((m) => m.conta);
    expect(foraDaClasse1).toEqual([]);
    // Q6: não é a classe 1 inteira — os outros instrumentos financeiros (13x) ficam de fora.
    const classe1 = folhas.filter((c) => c.classe === 1).map((c) => c.codigo);
    expect(contasCaixa.length).toBeLessThan(classe1.length);
  });

  it('as classes 6 e 7 estão numa rubrica OPERACIONAL (o núcleo exclui-as das secções pelo tipo)', () => {
    const foraDoOperacional = mapeamentos
      .filter((m) => {
        const classe = folhaPorCodigo.get(m.conta)?.classe;
        return (classe === 6 || classe === 7) && rubricaPorCodigo.get(m.rubrica)?.atividade !== 'OPERACIONAL';
      })
      .map((m) => m.conta);
    expect(foraDoOperacional).toEqual([]);
  });
});
