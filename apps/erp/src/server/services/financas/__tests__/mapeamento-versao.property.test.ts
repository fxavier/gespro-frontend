import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type {
  AtividadeFluxo,
  EstadoVersaoMapeamento,
  OrigemRubrica,
  SinalFluxo,
} from '@/lib/validations/fluxo-caixa';
import type {
  InstantaneoDeFn,
  InstantaneoMapeamento,
  MapeamentoContaFluxo,
  MudouFn,
  RubricaFluxoCaixa,
  RubricaInstantaneo,
} from '../dfc.interface';
// ---------------------------------------------------------------------------
// ORÁCULO do nó `oraculos` (ticket 2.2, verificador-fluxo-caixa) — spec 22 ·
// WS-2 · ADR-0037 E1 (V1, V2).
//
// O módulo abaixo AINDA NÃO EXISTE (ticket 3.2). Enquanto o nó `nucleo` não
// entregar `mapeamento-versao.model.ts` com `instantaneoDe` e `mudou` (contra
// `InstantaneoDeFn` e `MudouFn` de dfc.interface.ts), este ficheiro rebenta
// na resolução do import — a prova vermelha de que o oráculo antecede a
// solução. Alterá-lo num nó de autor é BLOCKER (doutrina 00 §2).
//
// O que fica para o nó `config-v` (precisa do serviço real, ticket 7):
//  - V2 «na mesma $transaction»: que `mapearConta`, `criarRubrica`,
//    `editarRubrica`, `definirContasCaixa` e `desmapearConta` criam a versão
//    n+1 em PENDING dentro da transacção da escrita, e que uma escrita que não
//    muda nada não cria versão — contra um duplo Prisma com estado;
//  - V3 inteiro: `validarVersao` só na mais recente, `VERSAO_DESACTUALIZADA`
//    numa anterior, e «validar é a única escrita sobre uma versão»;
//  - a transição nos dois sentidos (VALIDATED → alterar → PENDING → validar).
// Aqui testa-se o que o núcleo puro DECIDE: a forma canónica do instantâneo
// (V1) e a igualdade estrutural que diz se houve mudança (V2) — contra um
// duplo com estado da cópia de trabalho, cuja única lógica de decisão é a do
// núcleo.
// ---------------------------------------------------------------------------
import { instantaneoDe as instantaneoDeImpl, mudou as mudouImpl } from '../mapeamento-versao.model';

/** Ligadas ao contrato: se a assinatura do núcleo divergir de `InstantaneoDeFn`/`MudouFn`, o tsc acusa aqui. */
const instantaneoDe: InstantaneoDeFn = instantaneoDeImpl;
const mudou: MudouFn = mudouImpl;

/** ≥ 1000 por propriedade — exigência do verificador. */
const NUM_RUNS = 1000;

// ---------------------------------------------------------------------------
// Universo
// ---------------------------------------------------------------------------

const TENANT = 't-dfc';
const EPOCA = new Date(Date.UTC(2026, 0, 1, 10)); // um instante fixo; sem Date.now()

const CONTAS: readonly string[] = ['conta-1', 'conta-2', 'conta-3', 'conta-4', 'conta-5', 'conta-6', 'conta-7', 'conta-8'];

/** Códigos possíveis — todos com a mesma largura, para a ordem por código não ter ambiguidade. */
const CODIGOS_RUBRICA: readonly string[] = ['CX-01', 'CX-02', 'FIN-01', 'FIN-02', 'INV-01', 'INV-02', 'OP-01', 'OP-02', 'OP-03', 'TEN-01'];

const ATIVIDADES: readonly AtividadeFluxo[] = ['OPERACIONAL', 'INVESTIMENTO', 'FINANCIAMENTO', 'CAIXA'];
const SINAIS: readonly SinalFluxo[] = ['ENTRADA', 'SAIDA', 'VARIACAO'];
const ORIGENS: readonly OrigemRubrica[] = ['SISTEMA', 'TENANT'];

let sequencia = 0;

function rubrica(parcial: Partial<RubricaFluxoCaixa> & Pick<RubricaFluxoCaixa, 'codigo' | 'atividade'>): RubricaFluxoCaixa {
  sequencia += 1;
  return {
    id: `rub-${sequencia}`,
    tenantId: TENANT,
    designacao: `Rubrica ${parcial.codigo}`,
    sinal: 'VARIACAO',
    ordem: 10,
    origem: 'SISTEMA',
    ativo: true,
    createdAt: EPOCA,
    updatedAt: EPOCA,
    deletedAt: null,
    ...parcial,
  };
}

type Mapeamento = Pick<MapeamentoContaFluxo, 'contaId' | 'rubricaId'>;

// ---------------------------------------------------------------------------
// O juiz independente: a forma canónica que o ORÁCULO espera (E1, contrato de
// `InstantaneoMapeamento`) — rubricas não apagadas por `codigo` ascendente,
// só os oito campos; mapeamentos por `contaId` ascendente. Comparação de
// códigos por ponto de código (os códigos do universo têm largura fixa, logo
// `localeCompare` daria a mesma ordem).
// ---------------------------------------------------------------------------

function ordemCodigo(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonico(rubricas: RubricaFluxoCaixa[], mapeamentos: Mapeamento[]): InstantaneoMapeamento {
  const rubs: RubricaInstantaneo[] = rubricas
    .filter((r) => r.deletedAt === null)
    .map((r) => ({
      id: r.id,
      codigo: r.codigo,
      designacao: r.designacao,
      atividade: r.atividade,
      sinal: r.sinal,
      ordem: r.ordem,
      origem: r.origem,
      ativo: r.ativo,
    }))
    .sort((a, b) => ordemCodigo(a.codigo, b.codigo));
  const maps = mapeamentos
    .map((m) => ({ contaId: m.contaId, rubricaId: m.rubricaId }))
    .sort((a, b) => ordemCodigo(a.contaId, b.contaId));
  return { rubricas: rubs, mapeamentos: maps };
}

function chave(i: InstantaneoMapeamento): string {
  return JSON.stringify({
    rubricas: i.rubricas.map((r) => [r.id, r.codigo, r.designacao, r.atividade, r.sinal, r.ordem, r.origem, r.ativo]),
    mapeamentos: i.mapeamentos.map((m) => [m.contaId, m.rubricaId]),
  });
}

/** Baralha um array de forma determinista a partir de uma semente (sem Math.random). */
function baralhar<T>(itens: readonly T[], semente: number): T[] {
  const out = [...itens];
  let s = semente >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Geradores de estados consistentes: rubricas com códigos únicos; mapeamentos
// com contaId único (o @@unique da §2) e para rubricas NÃO apagadas.
// ---------------------------------------------------------------------------

const arbRubricaEspec = fc.record({
  codigo: fc.constantFrom(...CODIGOS_RUBRICA),
  designacao: fc.constantFrom('Clientes', 'Fornecedores', 'Activos fixos', 'Empréstimos', 'Caixa'),
  atividade: fc.constantFrom(...ATIVIDADES),
  sinal: fc.constantFrom(...SINAIS),
  ordem: fc.integer({ min: 0, max: 99 }),
  origem: fc.constantFrom(...ORIGENS),
  ativo: fc.boolean(),
  apagada: fc.boolean(),
});

interface Estado {
  rubricas: RubricaFluxoCaixa[];
  mapeamentos: Mapeamento[];
}

const arbEstado: fc.Arbitrary<Estado> = fc
  .tuple(
    fc.uniqueArray(arbRubricaEspec, { minLength: 1, maxLength: 6, selector: (r) => r.codigo }),
    fc.uniqueArray(fc.record({ contaId: fc.constantFrom(...CONTAS), escolha: fc.nat() }), {
      maxLength: 8,
      selector: (m) => m.contaId,
    }),
  )
  .map(([especs, contas]) => {
    const rubricas = especs.map((e) =>
      rubrica({
        codigo: e.codigo,
        designacao: e.designacao,
        atividade: e.atividade,
        sinal: e.sinal,
        ordem: e.ordem,
        origem: e.origem,
        ativo: e.ativo,
        deletedAt: e.apagada ? EPOCA : null,
      }),
    );
    const vivas = rubricas.filter((r) => r.deletedAt === null);
    const mapeamentos: Mapeamento[] = vivas.length === 0
      ? []
      : contas.map((c) => ({ contaId: c.contaId, rubricaId: vivas[c.escolha % vivas.length].id }));
    return { rubricas, mapeamentos };
  });

// ---------------------------------------------------------------------------
// V1 — o instantâneo, na forma canónica (a parte que o núcleo decide)
// ---------------------------------------------------------------------------

describe('V1 — instantaneoDe: forma canónica do instantâneo', () => {
  it('[property] é igual, ao elemento, ao mapeamento vivo: rubricas não apagadas por código, só os oito campos; mapeamentos por contaId', () => {
    fc.assert(
      fc.property(arbEstado, ({ rubricas, mapeamentos }) => {
        const instantaneo = instantaneoDe(rubricas, mapeamentos);
        // toEqual é sensível à ORDEM dos arrays e recusa campos a mais
        // (tenantId, datas, deletedAt não podem entrar no JSON da versão).
        expect(instantaneo).toEqual(canonico(rubricas, mapeamentos));
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('[property] indiferente à ordem em que a base devolve as linhas', () => {
    fc.assert(
      fc.property(arbEstado, fc.nat(), fc.nat(), ({ rubricas, mapeamentos }, s1, s2) => {
        const a = instantaneoDe(rubricas, mapeamentos);
        const b = instantaneoDe(baralhar(rubricas, s1), baralhar(mapeamentos, s2));
        expect(b).toEqual(a);
        expect(chave(b)).toBe(chave(a));
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('[property] uma rubrica apagada (deletedAt) fica de fora, mesmo que continue activa e com código', () => {
    fc.assert(
      fc.property(arbEstado, fc.nat(), ({ rubricas, mapeamentos }, escolha) => {
        const vivas = rubricas.filter((r) => r.deletedAt === null);
        fc.pre(vivas.length > 0);
        const alvo = vivas[escolha % vivas.length];
        // Só se pode apagar uma rubrica sem contas (o serviço recusa as outras).
        const semContas = mapeamentos.filter((m) => m.rubricaId !== alvo.id);
        const apagadas = rubricas.map((r) => (r.id === alvo.id ? { ...r, deletedAt: EPOCA } : r));
        const instantaneo = instantaneoDe(apagadas, semContas);
        expect(instantaneo.rubricas.some((r) => r.id === alvo.id)).toBe(false);
        expect(instantaneo).toEqual(canonico(apagadas, semContas));
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('instantâneo vazio: sem rubricas nem mapeamentos', () => {
    expect(instantaneoDe([], [])).toEqual({ rubricas: [], mapeamentos: [] });
  });

  it('é serializável em JSON sem perda (é o tipo do campo Json do Prisma)', () => {
    const r1 = rubrica({ codigo: 'OP-01', atividade: 'OPERACIONAL' });
    const r2 = rubrica({ codigo: 'CX-01', atividade: 'CAIXA', origem: 'SISTEMA' });
    const instantaneo = instantaneoDe([r1, r2], [{ contaId: 'conta-2', rubricaId: r1.id }, { contaId: 'conta-1', rubricaId: r2.id }]);
    expect(JSON.parse(JSON.stringify(instantaneo))).toEqual(instantaneo);
    expect(instantaneo.rubricas.map((r) => r.codigo)).toEqual(['CX-01', 'OP-01']);
    expect(instantaneo.mapeamentos.map((m) => m.contaId)).toEqual(['conta-1', 'conta-2']);
  });

  /**
   * Casos que TÊM de lançar (V1). Um instantâneo com a mesma conta duas vezes
   * é uma versão que conta a conta em duas actividades — exactamente o que o
   * `@@unique([tenantId, contaId])` proíbe na cópia de trabalho; e um
   * mapeamento para uma rubrica que não está no instantâneo (apagada ou
   * inexistente) é uma versão que não se reconcilia consigo própria: «igual
   * ao elemento» deixa de ter sentido. Congelar isso em silêncio é gravar
   * lixo com número de versão.
   */
  it('TEM de lançar: a mesma conta em dois mapeamentos', () => {
    const r1 = rubrica({ codigo: 'OP-01', atividade: 'OPERACIONAL' });
    const r2 = rubrica({ codigo: 'INV-01', atividade: 'INVESTIMENTO' });
    expect(() =>
      instantaneoDe([r1, r2], [
        { contaId: 'conta-1', rubricaId: r1.id },
        { contaId: 'conta-1', rubricaId: r2.id },
      ]),
    ).toThrow();
  });

  it('TEM de lançar: mapeamento para uma rubrica apagada ou inexistente', () => {
    const viva = rubrica({ codigo: 'OP-01', atividade: 'OPERACIONAL' });
    const apagada = rubrica({ codigo: 'TEN-01', atividade: 'OPERACIONAL', origem: 'TENANT', deletedAt: EPOCA });
    expect(() => instantaneoDe([viva, apagada], [{ contaId: 'conta-1', rubricaId: apagada.id }])).toThrow();
    expect(() => instantaneoDe([viva], [{ contaId: 'conta-1', rubricaId: 'rub-inexistente' }])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// V2 — mudou: a igualdade estrutural que decide se se cria versão
// ---------------------------------------------------------------------------

/** Uma alteração de UM elemento, que TEM de contar como mudança. */
type Alteracao =
  | { tipo: 'designacao' | 'atividade' | 'sinal' | 'ordem' | 'origem' | 'ativo' | 'codigo'; escolha: number }
  | { tipo: 'reatribuir'; escolha: number; rubrica: number }
  | { tipo: 'desmapear'; escolha: number }
  | { tipo: 'mapear-nova'; rubrica: number }
  | { tipo: 'apagar-rubrica-sem-contas'; escolha: number };

const arbAlteracao: fc.Arbitrary<Alteracao> = fc.oneof(
  fc.record({
    tipo: fc.constantFrom<'designacao' | 'atividade' | 'sinal' | 'ordem' | 'origem' | 'ativo' | 'codigo'>(
      'designacao', 'atividade', 'sinal', 'ordem', 'origem', 'ativo', 'codigo',
    ),
    escolha: fc.nat(),
  }),
  fc.record({ tipo: fc.constant('reatribuir' as const), escolha: fc.nat(), rubrica: fc.nat() }),
  fc.record({ tipo: fc.constant('desmapear' as const), escolha: fc.nat() }),
  fc.record({ tipo: fc.constant('mapear-nova' as const), rubrica: fc.nat() }),
  fc.record({ tipo: fc.constant('apagar-rubrica-sem-contas' as const), escolha: fc.nat() }),
);

function proximo<T>(atual: T, opcoes: readonly T[]): T {
  return opcoes[(opcoes.indexOf(atual) + 1) % opcoes.length];
}

/** Aplica a alteração a uma cópia; `null` se não for aplicável a este estado. */
function aplicar(estado: Estado, a: Alteracao): Estado | null {
  const rubricas = estado.rubricas.map((r) => ({ ...r }));
  const mapeamentos = estado.mapeamentos.map((m) => ({ ...m }));
  const vivas = rubricas.filter((r) => r.deletedAt === null);
  if (vivas.length === 0) return null;
  switch (a.tipo) {
    case 'designacao':
    case 'atividade':
    case 'sinal':
    case 'ordem':
    case 'origem':
    case 'ativo':
    case 'codigo': {
      const r = vivas[a.escolha % vivas.length];
      if (a.tipo === 'designacao') r.designacao = r.designacao + ' (alterada)';
      if (a.tipo === 'atividade') r.atividade = proximo(r.atividade, ATIVIDADES);
      if (a.tipo === 'sinal') r.sinal = proximo(r.sinal, SINAIS);
      if (a.tipo === 'ordem') r.ordem = r.ordem + 1;
      if (a.tipo === 'origem') r.origem = proximo(r.origem, ORIGENS);
      if (a.tipo === 'ativo') r.ativo = !r.ativo;
      if (a.tipo === 'codigo') {
        const livres = CODIGOS_RUBRICA.filter((c) => !rubricas.some((x) => x.codigo === c));
        if (livres.length === 0) return null;
        r.codigo = livres[a.escolha % livres.length];
      }
      return { rubricas, mapeamentos };
    }
    case 'reatribuir': {
      if (mapeamentos.length === 0 || vivas.length < 2) return null;
      const m = mapeamentos[a.escolha % mapeamentos.length];
      const outras = vivas.filter((r) => r.id !== m.rubricaId);
      m.rubricaId = outras[a.rubrica % outras.length].id;
      return { rubricas, mapeamentos };
    }
    case 'desmapear': {
      if (mapeamentos.length === 0) return null;
      mapeamentos.splice(a.escolha % mapeamentos.length, 1);
      return { rubricas, mapeamentos };
    }
    case 'mapear-nova': {
      const livres = CONTAS.filter((c) => !mapeamentos.some((m) => m.contaId === c));
      if (livres.length === 0) return null;
      mapeamentos.push({ contaId: livres[0], rubricaId: vivas[a.rubrica % vivas.length].id });
      return { rubricas, mapeamentos };
    }
    case 'apagar-rubrica-sem-contas': {
      const semContas = vivas.filter((r) => !mapeamentos.some((m) => m.rubricaId === r.id));
      if (semContas.length === 0) return null;
      semContas[a.escolha % semContas.length].deletedAt = EPOCA;
      return { rubricas, mapeamentos };
    }
  }
}

describe('V2 — mudou: igualdade estrutural, indiferente à ordem', () => {
  it('[property] mudou(null, x) é sempre true — a primeira versão existe sempre', () => {
    fc.assert(
      fc.property(arbEstado, ({ rubricas, mapeamentos }) => {
        expect(mudou(null, instantaneoDe(rubricas, mapeamentos))).toBe(true);
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('[property] mudou(x, x′) é false quando x′ é o mesmo mapeamento lido por outra ordem', () => {
    fc.assert(
      fc.property(arbEstado, fc.nat(), fc.nat(), ({ rubricas, mapeamentos }, s1, s2) => {
        const anterior = instantaneoDe(rubricas, mapeamentos);
        const novo = instantaneoDe(baralhar(rubricas, s1), baralhar(mapeamentos, s2));
        expect(mudou(anterior, novo)).toBe(false);
        expect(mudou(anterior, anterior)).toBe(false);
        // Um instantâneo que chegue com os arrays fora da ordem canónica
        // (p.ex. lido de uma versão antiga) compara-se na ordem canónica.
        const desordenado: InstantaneoMapeamento = {
          rubricas: baralhar(anterior.rubricas, s2),
          mapeamentos: baralhar(anterior.mapeamentos, s1),
        };
        expect(mudou(anterior, desordenado)).toBe(false);
        expect(mudou(desordenado, anterior)).toBe(false);
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('[property] qualquer alteração de UM elemento é mudança — e o juiz independente concorda', () => {
    fc.assert(
      fc.property(arbEstado, arbAlteracao, (estado, alteracao) => {
        const depois = aplicar(estado, alteracao);
        fc.pre(depois !== null);
        const anterior = instantaneoDe(estado.rubricas, estado.mapeamentos);
        const novo = instantaneoDe(depois!.rubricas, depois!.mapeamentos);
        const esperado = chave(canonico(estado.rubricas, estado.mapeamentos)) !== chave(canonico(depois!.rubricas, depois!.mapeamentos));
        // Toda a alteração do gerador muda o instantâneo — se não mudasse, o
        // gerador estaria a produzir não-alterações.
        expect(esperado).toBe(true);
        expect(mudou(anterior, novo)).toBe(true);
        // Simetria: mudança é mudança nos dois sentidos.
        expect(mudou(novo, anterior)).toBe(true);
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// V1 + V2 contra um duplo COM ESTADO da cópia de trabalho
//
// `CopiaDeTrabalho` guarda rubricas, mapeamentos e versões. A regra de negócio
// é a do serviço (ticket 7): cada escrita produz a versão n+1 em PENDING se
// — e só se — o núcleo disser que `mudou`. O duplo não decide nada: quem
// decide é `instantaneoDe` + `mudou`. Se `mudou` mentir para um lado, V2
// falha (versão criada por uma escrita que não mudou nada); se mentir para o
// outro, V1 falha (a versão mais recente deixa de ser igual ao vivo).
// ---------------------------------------------------------------------------

interface Versao {
  numero: number;
  estado: EstadoVersaoMapeamento;
  instantaneo: InstantaneoMapeamento;
}

class CopiaDeTrabalho {
  rubricas: RubricaFluxoCaixa[] = [];
  mapeamentos: Mapeamento[] = [];
  versoes: Versao[] = [];

  /** Executa a mutação e cria a versão n+1 se o núcleo disser que mudou. Devolve se criou. */
  escrever(mutacao: () => void): boolean {
    const anterior = this.versoes.at(-1)?.instantaneo ?? null;
    mutacao();
    const novo = instantaneoDe(this.rubricas, this.mapeamentos);
    if (!mudou(anterior, novo)) return false;
    this.versoes.push({ numero: this.versoes.length + 1, estado: 'PENDING', instantaneo: novo });
    return true;
  }

  vivas(): RubricaFluxoCaixa[] {
    return this.rubricas.filter((r) => r.deletedAt === null);
  }

  mapearConta(contaId: string, rubricaId: string): boolean {
    return this.escrever(() => {
      const m = this.mapeamentos.find((x) => x.contaId === contaId);
      if (m) m.rubricaId = rubricaId;
      else this.mapeamentos.push({ contaId, rubricaId });
    });
  }

  criarRubrica(espec: Pick<RubricaFluxoCaixa, 'codigo' | 'designacao' | 'atividade' | 'sinal' | 'ordem'>): boolean {
    return this.escrever(() => {
      // @@unique([tenantId, codigo]) conta também com as apagadas: recusa (sem escrita).
      if (this.rubricas.some((r) => r.codigo === espec.codigo)) return;
      this.rubricas.push(rubrica({ ...espec, origem: 'TENANT' }));
    });
  }

  editarRubrica(id: string, patch: Partial<Pick<RubricaFluxoCaixa, 'designacao' | 'atividade' | 'sinal' | 'ordem' | 'ativo'>>): boolean {
    return this.escrever(() => {
      const r = this.vivas().find((x) => x.id === id);
      if (!r) return;
      Object.assign(r, patch);
    });
  }

  eliminarRubrica(id: string): boolean {
    return this.escrever(() => {
      const r = this.vivas().find((x) => x.id === id);
      // SISTEMA recusa (RUBRICA_DE_SISTEMA); com contas recusa; nos dois casos, nada se escreve.
      if (!r || r.origem === 'SISTEMA' || this.mapeamentos.some((m) => m.rubricaId === r.id)) return;
      r.deletedAt = EPOCA;
    });
  }

  /** E2: `contaIds` passa a ser o conjunto exacto das contas de caixa; as que saem ficam sem mapeamento. */
  definirContasCaixa(contaIds: string[], rubricaCaixaId: string): boolean {
    return this.escrever(() => {
      const alvo = new Set(contaIds);
      this.mapeamentos = this.mapeamentos.filter((m) => m.rubricaId !== rubricaCaixaId || alvo.has(m.contaId));
      for (const contaId of alvo) {
        const m = this.mapeamentos.find((x) => x.contaId === contaId);
        if (m) m.rubricaId = rubricaCaixaId;
        else this.mapeamentos.push({ contaId, rubricaId: rubricaCaixaId });
      }
    });
  }
}

/** Uma operação do serviço, em dados planos; resolve-se contra o estado corrente. */
type Operacao =
  | { tipo: 'mapear'; conta: number; rubrica: number }
  | { tipo: 'criar'; codigo: number; atividade: number; ordem: number }
  | { tipo: 'editar'; rubrica: number; campo: 'designacao' | 'atividade' | 'ordem' | 'ativo'; valor: number }
  | { tipo: 'eliminar'; rubrica: number }
  | { tipo: 'caixa'; contas: number[] };

const arbOperacao: fc.Arbitrary<Operacao> = fc.oneof(
  fc.record({ tipo: fc.constant('mapear' as const), conta: fc.nat(), rubrica: fc.nat() }),
  fc.record({ tipo: fc.constant('criar' as const), codigo: fc.nat(), atividade: fc.nat(), ordem: fc.integer({ min: 0, max: 99 }) }),
  fc.record({
    tipo: fc.constant('editar' as const),
    rubrica: fc.nat(),
    campo: fc.constantFrom<'designacao' | 'atividade' | 'ordem' | 'ativo'>('designacao', 'atividade', 'ordem', 'ativo'),
    valor: fc.nat(),
  }),
  fc.record({ tipo: fc.constant('eliminar' as const), rubrica: fc.nat() }),
  fc.record({ tipo: fc.constant('caixa' as const), contas: fc.uniqueArray(fc.integer({ min: 0, max: CONTAS.length - 1 }), { maxLength: 4 }) }),
);

/** Semente: as rubricas SISTEMA e um mapeamento inicial, com a versão 1 — como o tenant-bootstrap deixa um tenant. */
function semear(): CopiaDeTrabalho {
  const copia = new CopiaDeTrabalho();
  const op = rubrica({ codigo: 'OP-01', atividade: 'OPERACIONAL' });
  const inv = rubrica({ codigo: 'INV-01', atividade: 'INVESTIMENTO' });
  const fin = rubrica({ codigo: 'FIN-01', atividade: 'FINANCIAMENTO' });
  const cx = rubrica({ codigo: 'CX-01', atividade: 'CAIXA' });
  const criou = copia.escrever(() => {
    copia.rubricas.push(op, inv, fin, cx);
    copia.mapeamentos.push(
      { contaId: 'conta-1', rubricaId: cx.id },
      { contaId: 'conta-2', rubricaId: op.id },
      { contaId: 'conta-3', rubricaId: op.id },
      { contaId: 'conta-4', rubricaId: inv.id },
      { contaId: 'conta-5', rubricaId: fin.id },
    );
  });
  expect(criou).toBe(true);
  expect(copia.versoes).toHaveLength(1);
  return copia;
}

/**
 * Resolve a operação contra o estado CORRENTE e devolve a chamada concreta
 * (a mesma conta, a mesma rubrica, o mesmo patch) — para que «repetir a
 * escrita» seja mesmo repetir a escrita, e não resolver os índices outra vez
 * sobre um estado que a primeira chamada alterou.
 */
function resolver(copia: CopiaDeTrabalho, op: Operacao): () => boolean {
  const vivas = copia.vivas();
  switch (op.tipo) {
    case 'mapear': {
      const contaId = CONTAS[op.conta % CONTAS.length];
      const rubricaId = vivas[op.rubrica % vivas.length].id;
      return () => copia.mapearConta(contaId, rubricaId);
    }
    case 'criar': {
      const codigo = CODIGOS_RUBRICA[op.codigo % CODIGOS_RUBRICA.length];
      const espec = {
        codigo,
        designacao: `Rubrica ${codigo}`,
        atividade: ATIVIDADES[op.atividade % ATIVIDADES.length],
        sinal: 'VARIACAO' as const,
        ordem: op.ordem,
      };
      return () => copia.criarRubrica(espec);
    }
    case 'editar': {
      const id = vivas[op.rubrica % vivas.length].id;
      const patch =
        op.campo === 'designacao'
          ? { designacao: ['Clientes', 'Fornecedores', 'Caixa'][op.valor % 3] }
          : op.campo === 'atividade'
            ? { atividade: ATIVIDADES[op.valor % ATIVIDADES.length] }
            : op.campo === 'ordem'
              ? { ordem: op.valor % 5 }
              : { ativo: op.valor % 2 === 0 };
      return () => copia.editarRubrica(id, patch);
    }
    case 'eliminar': {
      const id = vivas[op.rubrica % vivas.length].id;
      return () => copia.eliminarRubrica(id);
    }
    case 'caixa': {
      const cx = copia.rubricas.find((r) => r.codigo === 'CX-01')!;
      const contaIds = op.contas.map((i) => CONTAS[i]);
      return () => copia.definirContasCaixa(contaIds, cx.id);
    }
  }
}

describe('V1 + V2 — contra um duplo com estado da cópia de trabalho', () => {
  it('[property] depois de cada escrita, a versão mais recente é igual ao vivo e há versão nova ⇔ o vivo mudou', () => {
    fc.assert(
      fc.property(fc.array(arbOperacao, { minLength: 1, maxLength: 12 }), (operacoes) => {
        const copia = semear();
        for (const op of operacoes) {
          const antes = chave(canonico(copia.rubricas, copia.mapeamentos));
          const versoesAntes = copia.versoes.length;
          const escrita = resolver(copia, op);
          const criou = escrita();
          const depois = chave(canonico(copia.rubricas, copia.mapeamentos));

          // V2: versão n+1 em PENDING se — e só se — o vivo mudou (juiz independente).
          const mudouMesmo = antes !== depois;
          expect(criou).toBe(mudouMesmo);
          expect(copia.versoes.length).toBe(versoesAntes + (mudouMesmo ? 1 : 0));
          const ultima = copia.versoes.at(-1)!;
          if (mudouMesmo) {
            expect(ultima.numero).toBe(versoesAntes + 1);
            expect(ultima.estado).toBe('PENDING');
          }

          // V1: a versão mais recente é igual, ao elemento, ao mapeamento vivo.
          expect(ultima.instantaneo).toEqual(canonico(copia.rubricas, copia.mapeamentos));
          expect(mudou(ultima.instantaneo, instantaneoDe(copia.rubricas, copia.mapeamentos))).toBe(false);

          // Repetir a MESMA escrita não muda nada, logo não cria versão.
          const versoesAntesDaRepeticao = copia.versoes.length;
          expect(escrita()).toBe(false);
          expect(copia.versoes.length).toBe(versoesAntesDaRepeticao);
        }
        // Números contíguos, 1..n: as versões nunca se apagam nem se reordenam.
        expect(copia.versoes.map((v) => v.numero)).toEqual(copia.versoes.map((_, i) => i + 1));
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('escrita que não muda nada não cria versão: mapear a conta à rubrica onde já está', () => {
    const copia = semear();
    const op = copia.rubricas.find((r) => r.codigo === 'OP-01')!;
    expect(copia.mapearConta('conta-2', op.id)).toBe(false);
    expect(copia.versoes).toHaveLength(1);
    // …e a reatribuição real cria a versão 2, em PENDING.
    const inv = copia.rubricas.find((r) => r.codigo === 'INV-01')!;
    expect(copia.mapearConta('conta-2', inv.id)).toBe(true);
    expect(copia.versoes).toHaveLength(2);
    expect(copia.versoes[1]).toMatchObject({ numero: 2, estado: 'PENDING' });
    expect(copia.versoes[1].instantaneo.mapeamentos.find((m) => m.contaId === 'conta-2')?.rubricaId).toBe(inv.id);
    // A versão 1 ficou intacta (append-only).
    expect(copia.versoes[0].instantaneo.mapeamentos.find((m) => m.contaId === 'conta-2')?.rubricaId).toBe(op.id);
  });

  it('as contas de caixa fazem parte da versão (E1/E2): mudar o conjunto cria versão; repetir o mesmo conjunto não', () => {
    const copia = semear();
    const cx = copia.rubricas.find((r) => r.codigo === 'CX-01')!;
    expect(copia.definirContasCaixa(['conta-1'], cx.id)).toBe(false); // já era exactamente este
    expect(copia.definirContasCaixa(['conta-1', 'conta-6'], cx.id)).toBe(true);
    expect(copia.versoes).toHaveLength(2);
    expect(copia.definirContasCaixa(['conta-6', 'conta-1'], cx.id)).toBe(false); // mesmo conjunto, outra ordem
    expect(copia.versoes).toHaveLength(2);
    // conta-1 sai do conjunto: fica SEM mapeamento, e isso é uma versão nova.
    expect(copia.definirContasCaixa(['conta-6'], cx.id)).toBe(true);
    expect(copia.versoes).toHaveLength(3);
    expect(copia.versoes[2].instantaneo.mapeamentos.some((m) => m.contaId === 'conta-1')).toBe(false);
  });
});
