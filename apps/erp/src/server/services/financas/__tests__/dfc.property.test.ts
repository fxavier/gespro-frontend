import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors';
import type { AtividadeFluxo } from '@/lib/validations/fluxo-caixa';
import type {
  ContaBalancete,
  NaturezaConta,
  PeriodoContabil,
  TipoConta,
} from '../contabilidade.interface';
import { ERROS_DFC } from '../dfc.interface';
import type {
  ClassificarVariacoesFn,
  MapaConta,
  MontarSeccoesDFCFn,
  PeriodoHomologoFn,
  RubricaResumo,
  SeccoesDFC,
  VariacaoClassificada,
  VerificarArticulacaoFn,
  VerificarMesmoExercicioFn,
} from '../dfc.interface';
// ---------------------------------------------------------------------------
// ORÁCULO do nó `oraculos` (ticket 2.1, verificador-fluxo-caixa) — spec 22 ·
// WS-2 · ADR-0037 com a emenda de 2026-09-25.
//
// O módulo abaixo AINDA NÃO EXISTE. O import é deliberado: enquanto o nó
// `nucleo` não entregar `dfc.model.ts` com estas cinco funções puras (contra
// os tipos *Fn de dfc.interface.ts), este ficheiro rebenta na resolução do
// import — e essa é a prova vermelha de que o oráculo foi escrito antes da
// solução. Qualquer alteração a este ficheiro por um agente feat-* é BLOCKER
// (doutrina 00 §2; grafo dfc, «Ficheiros protegidos»).
// ---------------------------------------------------------------------------
import {
  classificarVariacoes as classificarVariacoesImpl,
  montarSeccoesDFC as montarSeccoesDFCImpl,
  periodoHomologo as periodoHomologoImpl,
  verificarArticulacao as verificarArticulacaoImpl,
  verificarMesmoExercicio as verificarMesmoExercicioImpl,
} from '../dfc.model';

/** Ligadas ao contrato: se a assinatura do núcleo divergir dos tipos `*Fn`, o tsc acusa aqui. */
const classificarVariacoes: ClassificarVariacoesFn = classificarVariacoesImpl;
const montarSeccoesDFC: MontarSeccoesDFCFn = montarSeccoesDFCImpl;
const periodoHomologo: PeriodoHomologoFn = periodoHomologoImpl;
const verificarArticulacao: VerificarArticulacaoFn = verificarArticulacaoImpl;
const verificarMesmoExercicio: VerificarMesmoExercicioFn = verificarMesmoExercicioImpl;

// ---------------------------------------------------------------------------
// Configuração e helpers
// ---------------------------------------------------------------------------

/** ≥ 1000 por propriedade — exigência do verificador. */
const NUM_RUNS = 1000;

const ZERO = new Prisma.Decimal(0);

function centavos(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n).dividedBy(100);
}

/** Igualdade monetária: SEMPRE `Decimal.equals`. Nunca number, nunca tolerância. */
function iguais(a: Prisma.Decimal, b: Prisma.Decimal): boolean {
  return a.equals(b);
}

function somar(valores: Prisma.Decimal[]): Prisma.Decimal {
  return valores.reduce((acc, v) => acc.plus(v), ZERO);
}

/**
 * Datas em Africa/Maputo (UTC+2, sem horário de Verão), como o
 * `criarExercicioContabil` as grava. NUNCA `new Date('aaaa-mm-dd')`: lê como
 * UTC e, a leste de Greenwich, cai no dia anterior.
 */
function inicioDeMesEmMaputo(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes - 1, 1) - 2 * 60 * 60 * 1000);
}

function fimDeMesEmMaputo(ano: number, mes: number): Date {
  return new Date(Date.UTC(ano, mes, 0, 21, 59, 59, 999));
}

const FMT_MAPUTO = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Maputo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Dia civil em Maputo — a única leitura de data que este oráculo faz. */
function civilEmMaputo(d: Date): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = FMT_MAPUTO.format(d).split('-').map(Number);
  return { ano, mes, dia };
}

function codigoErro(fn: () => void): string | null {
  try {
    fn();
    return null;
  } catch (erro) {
    if (erro instanceof BusinessRuleError) return erro.code;
    throw erro;
  }
}

// ---------------------------------------------------------------------------
// Plano de contas do oráculo
//
// Um recorte do PGC-NIRF com tudo o que já mordeu esta casa:
//  - 421 e 44331, DEVEDORAS no seed (classe 4 com o sinal ao contrário) —
//    aqui a natureza é GERADA, para que nenhuma regra por prefixo sobreviva;
//  - 3281 Amortizações acumuladas com `tipo` ATIVO e natureza CREDORA (uma
//    conta criada pelo tenant pode ter os dois independentes): o sinal do
//    fluxo é pela NATUREZA, que é o que assina `saldoAtual` no balancete;
//  - 129 Descobertos bancários, CREDORA, candidata a CAIXA (entra negativa);
//  - 314 Outros investimentos financeiros, classe 3, candidata a CAIXA
//    («equivalente» fora da classe 1 — aviso na configuração, mas articula);
//  - 851 Imposto corrente, classe 8 (`tipo` RESULTADO), que a DRE ignora
//    (`impostos = 0`) e por isso tem de fluir como variação;
//  - classes 6 e 7 (`tipo` GASTO/RENDIMENTO), MAPEADAS como todas as folhas
//    (ticket 4.1) mas representadas pelo resultado líquido — quem as somar
//    outra vez nas secções conta o resultado duas vezes e não articula.
// ---------------------------------------------------------------------------

type Codigo = string;

interface ContaEspec {
  codigo: Codigo;
  nome: string;
  tipo: TipoConta;
  natureza: NaturezaConta;
  /** Rubrica por omissão quando a conta NÃO é escolhida como caixa. */
  rubrica: string;
}

const CATALOGO: readonly ContaEspec[] = [
  { codigo: '111', nome: 'Caixa', tipo: 'ATIVO', natureza: 'DEVEDORA', rubrica: 'OP-02' },
  { codigo: '121', nome: 'Depósitos à ordem', tipo: 'ATIVO', natureza: 'DEVEDORA', rubrica: 'OP-02' },
  { codigo: '123', nome: 'Depósitos a prazo', tipo: 'ATIVO', natureza: 'DEVEDORA', rubrica: 'INV-02' },
  { codigo: '129', nome: 'Descobertos bancários', tipo: 'PASSIVO', natureza: 'CREDORA', rubrica: 'FIN-01' },
  { codigo: '211', nome: 'Mercadorias', tipo: 'ATIVO', natureza: 'DEVEDORA', rubrica: 'OP-03' },
  { codigo: '314', nome: 'Outros investimentos financeiros', tipo: 'ATIVO', natureza: 'DEVEDORA', rubrica: 'INV-02' },
  { codigo: '321', nome: 'Construções', tipo: 'ATIVO', natureza: 'DEVEDORA', rubrica: 'INV-01' },
  { codigo: '3281', nome: 'Amortizações acumuladas', tipo: 'ATIVO', natureza: 'CREDORA', rubrica: 'OP-04' },
  { codigo: '411', nome: 'Clientes c/c', tipo: 'ATIVO', natureza: 'DEVEDORA', rubrica: 'OP-01' },
  { codigo: '421', nome: 'Fornecedores c/c', tipo: 'ATIVO', natureza: 'DEVEDORA', rubrica: 'OP-02' },
  { codigo: '44321', nome: 'IVA dedutível', tipo: 'ATIVO', natureza: 'DEVEDORA', rubrica: 'OP-02' },
  { codigo: '44331', nome: 'IVA liquidado', tipo: 'ATIVO', natureza: 'DEVEDORA', rubrica: 'OP-02' },
  { codigo: '451', nome: 'Empréstimos bancários', tipo: 'PASSIVO', natureza: 'CREDORA', rubrica: 'FIN-01' },
  { codigo: '481', nome: 'Provisões', tipo: 'PASSIVO', natureza: 'CREDORA', rubrica: 'OP-04' },
  { codigo: '511', nome: 'Capital', tipo: 'CAPITAL_PROPRIO', natureza: 'CREDORA', rubrica: 'FIN-02' },
  { codigo: '591', nome: 'Resultados transitados', tipo: 'CAPITAL_PROPRIO', natureza: 'CREDORA', rubrica: 'FIN-02' },
  { codigo: '611', nome: 'Custo das mercadorias vendidas', tipo: 'GASTO', natureza: 'DEVEDORA', rubrica: 'OP-05' },
  { codigo: '621', nome: 'Gastos com o pessoal', tipo: 'GASTO', natureza: 'DEVEDORA', rubrica: 'OP-05' },
  { codigo: '651', nome: 'Amortizações do período', tipo: 'GASTO', natureza: 'DEVEDORA', rubrica: 'OP-05' },
  { codigo: '711', nome: 'Vendas', tipo: 'RENDIMENTO', natureza: 'CREDORA', rubrica: 'OP-05' },
  { codigo: '781', nome: 'Juros obtidos', tipo: 'RENDIMENTO', natureza: 'CREDORA', rubrica: 'OP-05' },
  { codigo: '851', nome: 'Imposto corrente', tipo: 'RESULTADO', natureza: 'CREDORA', rubrica: 'OP-06' },
];

const CODIGOS: readonly Codigo[] = CATALOGO.map((c) => c.codigo);

/** As contas que o gerador pode declarar como caixa (E2: é configuração, não prefixo). */
const CANDIDATAS_CAIXA: readonly Codigo[] = ['111', '121', '123', '129', '314'];

/** Contas do balanço (não caixa, não resultado) cuja rubrica o gerador pode reatribuir. */
const REATRIBUIVEIS: readonly Codigo[] = ['211', '321', '3281', '411', '421', '44321', '44331', '451', '481', '511', '591'];

const TIPOS_RESULTADO: ReadonlySet<TipoConta> = new Set<TipoConta>(['GASTO', 'RENDIMENTO']);

const RUBRICAS: readonly RubricaResumo[] = [
  { id: 'r-OP-01', codigo: 'OP-01', designacao: 'Variação de clientes', atividade: 'OPERACIONAL', sinal: 'VARIACAO', ordem: 10 },
  { id: 'r-OP-02', codigo: 'OP-02', designacao: 'Variação de fornecedores e Estado', atividade: 'OPERACIONAL', sinal: 'VARIACAO', ordem: 20 },
  { id: 'r-OP-03', codigo: 'OP-03', designacao: 'Variação de inventários', atividade: 'OPERACIONAL', sinal: 'VARIACAO', ordem: 30 },
  { id: 'r-OP-04', codigo: 'OP-04', designacao: 'Amortizações e provisões', atividade: 'OPERACIONAL', sinal: 'VARIACAO', ordem: 40 },
  { id: 'r-OP-05', codigo: 'OP-05', designacao: 'Gastos e rendimentos do período', atividade: 'OPERACIONAL', sinal: 'VARIACAO', ordem: 50 },
  { id: 'r-OP-06', codigo: 'OP-06', designacao: 'Imposto sobre o rendimento', atividade: 'OPERACIONAL', sinal: 'SAIDA', ordem: 60 },
  { id: 'r-INV-01', codigo: 'INV-01', designacao: 'Activos fixos tangíveis', atividade: 'INVESTIMENTO', sinal: 'SAIDA', ordem: 10 },
  { id: 'r-INV-02', codigo: 'INV-02', designacao: 'Investimentos financeiros', atividade: 'INVESTIMENTO', sinal: 'VARIACAO', ordem: 20 },
  { id: 'r-FIN-01', codigo: 'FIN-01', designacao: 'Empréstimos obtidos', atividade: 'FINANCIAMENTO', sinal: 'VARIACAO', ordem: 10 },
  { id: 'r-FIN-02', codigo: 'FIN-02', designacao: 'Capital e reservas', atividade: 'FINANCIAMENTO', sinal: 'ENTRADA', ordem: 20 },
  { id: 'r-CX-01', codigo: 'CX-01', designacao: 'Caixa e equivalentes de caixa', atividade: 'CAIXA', sinal: 'VARIACAO', ordem: 10 },
];

const RUBRICA_POR_CODIGO = new Map(RUBRICAS.map((r) => [r.codigo, r]));
const RUBRICAS_ATIVIDADE: readonly string[] = RUBRICAS.filter((r) => r.atividade !== 'CAIXA').map((r) => r.codigo);

interface ContaOraculo {
  conta: ContaBalancete['conta'];
  rubrica: RubricaResumo;
}

/** Um plano concreto: contas com natureza fixada, mapa conta→rubrica e o conjunto de caixa. */
interface Plano {
  contas: Map<Codigo, ContaOraculo>;
  mapa: MapaConta;
  caixa: ReadonlySet<Codigo>;
}

interface PlanoEspec {
  natureza421: NaturezaConta;
  natureza44331: NaturezaConta;
  contasCaixa: Codigo[];
  reatribuicoes: { conta: Codigo; rubrica: string }[];
}

/** Regra do `tenant-bootstrap` para as classes 1–4: a natureza decide o tipo. */
function tipoPorNatureza(natureza: NaturezaConta): TipoConta {
  return natureza === 'DEVEDORA' ? 'ATIVO' : 'PASSIVO';
}

function montarPlano(espec: PlanoEspec): Plano {
  const caixa = new Set(espec.contasCaixa);
  const reatribuida = new Map(espec.reatribuicoes.map((r) => [r.conta, r.rubrica]));
  const contas = new Map<Codigo, ContaOraculo>();
  for (const e of CATALOGO) {
    let natureza = e.natureza;
    let tipo = e.tipo;
    if (e.codigo === '421') {
      natureza = espec.natureza421;
      tipo = tipoPorNatureza(natureza);
    }
    if (e.codigo === '44331') {
      natureza = espec.natureza44331;
      tipo = tipoPorNatureza(natureza);
    }
    const codigoRubrica = caixa.has(e.codigo) ? 'CX-01' : (reatribuida.get(e.codigo) ?? e.rubrica);
    contas.set(e.codigo, {
      conta: { id: 'c-' + e.codigo, codigo: e.codigo, nome: e.nome, tipo, natureza },
      rubrica: RUBRICA_POR_CODIGO.get(codigoRubrica)!,
    });
  }
  const mapa = new Map<string, RubricaResumo>();
  for (const c of contas.values()) mapa.set(c.conta.id, c.rubrica);
  return { contas, mapa, caixa };
}

const arbNatureza = fc.constantFrom<NaturezaConta>('DEVEDORA', 'CREDORA');

const arbPlano: fc.Arbitrary<Plano> = fc
  .record({
    natureza421: arbNatureza,
    natureza44331: arbNatureza,
    contasCaixa: fc.subarray([...CANDIDATAS_CAIXA], { minLength: 1 }),
    reatribuicoes: fc.array(
      fc.record({
        conta: fc.constantFrom(...REATRIBUIVEIS),
        rubrica: fc.constantFrom(...RUBRICAS_ATIVIDADE),
      }),
      { maxLength: 6 },
    ),
  })
  .map(montarPlano);

// ---------------------------------------------------------------------------
// Diário do oráculo
//
// Lançamentos de partida dobrada (Σ débitos == Σ créditos, por construção),
// datados por MÊS: 0 é «antes do exercício» (saldos de abertura), 1..12 são
// os meses. Um lançamento `estornado` produz o par original + estorno, os
// dois na mesma data — os dois entram em FILTRO_LANCAMENTO_MAPA (LANCADO +
// ESTORNADO) e é assim que o balancete os vê. Valores incluem ZERO de
// propósito: uma partida nula não pode perturbar a articulação.
// ---------------------------------------------------------------------------

interface LinhaEspec {
  conta: Codigo;
  centavos: number;
}

interface LancamentoEspec {
  mes: number;
  debitos: LinhaEspec[];
  /** Uma ou duas contas a crédito; `corte` (0..100) reparte o total pela segunda. */
  creditos: Codigo[];
  corte: number;
  estornado: boolean;
}

interface Partida {
  conta: Codigo;
  tipo: 'DEBITO' | 'CREDITO';
  valor: Prisma.Decimal;
}

interface Lancamento {
  mes: number;
  partidas: Partida[];
}

const arbCentavos = fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 5_000_000_00 }));

function arbLancamento(contas: readonly Codigo[], mes: fc.Arbitrary<number>): fc.Arbitrary<LancamentoEspec> {
  return fc.record({
    mes,
    debitos: fc.array(
      fc.record({ conta: fc.constantFrom(...contas), centavos: arbCentavos }),
      { minLength: 1, maxLength: 3 },
    ),
    creditos: fc.array(fc.constantFrom(...contas), { minLength: 1, maxLength: 2 }),
    corte: fc.integer({ min: 0, max: 100 }),
    estornado: fc.boolean(),
  });
}

function materializar(e: LancamentoEspec): Lancamento[] {
  const total = e.debitos.reduce((acc, d) => acc + d.centavos, 0);
  const partidas: Partida[] = e.debitos.map((d) => ({
    conta: d.conta,
    tipo: 'DEBITO',
    valor: centavos(d.centavos),
  }));
  if (e.creditos.length === 1) {
    partidas.push({ conta: e.creditos[0], tipo: 'CREDITO', valor: centavos(total) });
  } else {
    const primeira = Math.floor((total * e.corte) / 100);
    partidas.push({ conta: e.creditos[0], tipo: 'CREDITO', valor: centavos(primeira) });
    partidas.push({ conta: e.creditos[1], tipo: 'CREDITO', valor: centavos(total - primeira) });
  }
  const original: Lancamento = { mes: e.mes, partidas };
  if (!e.estornado) return [original];
  const estorno: Lancamento = {
    mes: e.mes,
    partidas: partidas.map((p) => ({ ...p, tipo: p.tipo === 'DEBITO' ? 'CREDITO' : 'DEBITO' })),
  };
  return [original, estorno];
}

interface Somas {
  debitos: Prisma.Decimal;
  creditos: Prisma.Decimal;
}

/** Σ débitos e créditos por conta sobre os lançamentos que passam o filtro de mês. */
function agregar(lancamentos: Lancamento[], ateMes: (mes: number) => boolean): Map<Codigo, Somas> {
  const somas = new Map<Codigo, Somas>();
  for (const l of lancamentos) {
    if (!ateMes(l.mes)) continue;
    for (const p of l.partidas) {
      const s = somas.get(p.conta) ?? { debitos: ZERO, creditos: ZERO };
      if (p.tipo === 'DEBITO') s.debitos = s.debitos.plus(p.valor);
      else s.creditos = s.creditos.plus(p.valor);
      somas.set(p.conta, s);
    }
  }
  return somas;
}

function saldoPelaNatureza(natureza: NaturezaConta, s: Somas): Prisma.Decimal {
  return natureza === 'DEVEDORA' ? s.debitos.minus(s.creditos) : s.creditos.minus(s.debitos);
}

/** Débitos − créditos: o saldo «em termos de débito», independente da natureza. */
function saldoDebito(s: Somas | undefined): Prisma.Decimal {
  return s ? s.debitos.minus(s.creditos) : ZERO;
}

/**
 * A forma que `montarLinhasBalancete` devolve (contabilidade.service.ts):
 * uma linha por conta com movimento, `saldoAtual` pela natureza,
 * `saldoAnterior` a zero, sem as linhas D = C = 0, ordenadas por código.
 */
function balancete(plano: Plano, somas: Map<Codigo, Somas>): ContaBalancete[] {
  const linhas: ContaBalancete[] = [];
  for (const [codigo, s] of somas) {
    if (s.debitos.equals(0) && s.creditos.equals(0)) continue;
    const { conta } = plano.contas.get(codigo)!;
    linhas.push({
      conta,
      saldoAnterior: ZERO,
      debitos: s.debitos,
      creditos: s.creditos,
      saldoAtual: saldoPelaNatureza(conta.natureza, s),
    });
  }
  return linhas.sort((a, b) => a.conta.codigo.localeCompare(b.conta.codigo));
}

/** O que o oráculo espera de um intervalo [de..ate] de meses, calculado à parte do núcleo. */
interface Esperado {
  inicio: ContaBalancete[];
  fim: ContaBalancete[];
  somasInicio: Map<Codigo, Somas>;
  somasFim: Map<Codigo, Somas>;
  /** Σ (S_fim − S_ini) sobre as contas CAIXA, S = débitos − créditos: o lado direito de I6. */
  variacaoCaixa: Prisma.Decimal;
  /** Rendimentos − gastos do intervalo: o que `gerarDRE` devolve como `lucroLiquido`. */
  resultadoLiquido: Prisma.Decimal;
}

function esperar(plano: Plano, lancamentos: Lancamento[], de: number, ate: number): Esperado {
  const somasInicio = agregar(lancamentos, (m) => m < de);
  const somasFim = agregar(lancamentos, (m) => m <= ate);
  let variacaoCaixa = ZERO;
  let resultadoLiquido = ZERO;
  for (const [codigo, c] of plano.contas) {
    const delta = saldoDebito(somasFim.get(codigo)).minus(saldoDebito(somasInicio.get(codigo)));
    if (plano.caixa.has(codigo)) variacaoCaixa = variacaoCaixa.plus(delta);
    else if (TIPOS_RESULTADO.has(c.conta.tipo)) resultadoLiquido = resultadoLiquido.minus(delta);
  }
  return {
    inicio: balancete(plano, somasInicio),
    fim: balancete(plano, somasFim),
    somasInicio,
    somasFim,
    variacaoCaixa,
    resultadoLiquido,
  };
}

/** Pipeline do núcleo puro, sempre com estruturas frescas. */
function correr(plano: Plano, esperado: Esperado): {
  variacoes: VariacaoClassificada[];
  naoMapeadas: ContaBalancete['conta'][];
  seccoes: SeccoesDFC;
} {
  const { variacoes, naoMapeadas } = classificarVariacoes(
    esperado.inicio.map((l) => ({ ...l, conta: { ...l.conta } })),
    esperado.fim.map((l) => ({ ...l, conta: { ...l.conta } })),
    plano.mapa,
  );
  const seccoes = montarSeccoesDFC(esperado.resultadoLiquido, variacoes, [...RUBRICAS]);
  return { variacoes, naoMapeadas, seccoes };
}

const SECCOES = ['operacional', 'investimento', 'financiamento'] as const;

/** Valor de uma rubrica no mapa, 0 se não aparecer (rubricas sem movimento não aparecem). */
function valorRubrica(seccoes: SeccoesDFC, rubricaId: string): Prisma.Decimal {
  for (const s of SECCOES) {
    const linha = seccoes[s].rubricas.find((r) => r.rubrica.id === rubricaId);
    if (linha) return linha.valor;
  }
  return ZERO;
}

/**
 * As asserções de I6 sobre um intervalo. A articulação é verificada DUAS
 * vezes: pelo `verificarArticulacao` do núcleo (que tem de correr em
 * produção) e directamente por `Decimal.equals` — um `verificarArticulacao`
 * que nunca lançasse não salvaria um `somaAtividades` errado.
 */
function assertArticula(plano: Plano, esperado: Esperado): void {
  const { variacoes, naoMapeadas, seccoes } = correr(plano, esperado);

  // Todas as contas estão mapeadas: nada pode sair em naoMapeadas.
  expect(naoMapeadas).toEqual([]);

  // I6 — o verificador do núcleo não lança…
  expect(() => verificarArticulacao(seccoes, esperado.variacaoCaixa)).not.toThrow();
  // …e a soma é MESMO igual ao Δcaixa, em Decimal exacto.
  expect(iguais(seccoes.somaAtividades, esperado.variacaoCaixa)).toBe(true);
  expect(
    iguais(
      seccoes.somaAtividades,
      seccoes.operacional.total.plus(seccoes.investimento.total).plus(seccoes.financiamento.total),
    ),
  ).toBe(true);

  // I9 (a parte pura): o resultado líquido é o recebido e ABRE a operacional.
  expect(iguais(seccoes.resultadoLiquido, esperado.resultadoLiquido)).toBe(true);
  expect(
    iguais(
      seccoes.operacional.total,
      esperado.resultadoLiquido.plus(somar(seccoes.operacional.rubricas.map((r) => r.valor))),
    ),
  ).toBe(true);
  expect(iguais(seccoes.investimento.total, somar(seccoes.investimento.rubricas.map((r) => r.valor)))).toBe(true);
  expect(iguais(seccoes.financiamento.total, somar(seccoes.financiamento.rubricas.map((r) => r.valor)))).toBe(true);

  // Forma das secções: actividade certa, CAIXA em lado nenhum, cada linha é a
  // soma das suas contas, e nenhuma conta aparece duas vezes (§2 do ADR).
  const contasVistas = new Set<string>();
  const atividadeDe: Record<(typeof SECCOES)[number], AtividadeFluxo> = {
    operacional: 'OPERACIONAL',
    investimento: 'INVESTIMENTO',
    financiamento: 'FINANCIAMENTO',
  };
  for (const s of SECCOES) {
    expect(seccoes[s].atividade).toBe(atividadeDe[s]);
    for (const linha of seccoes[s].rubricas) {
      expect(linha.rubrica.atividade).toBe(atividadeDe[s]);
      expect(iguais(linha.valor, somar(linha.contas.map((c) => c.efeitoCaixa)))).toBe(true);
      for (const c of linha.contas) {
        expect(c.atividade).not.toBe('CAIXA');
        expect(plano.caixa.has(c.conta.codigo)).toBe(false);
        expect(contasVistas.has(c.conta.id)).toBe(false);
        contasVistas.add(c.conta.id);
      }
    }
  }

  // Variações, conta a conta: rubrica e actividade do mapa; saldos iguais aos
  // dos balancetes (zero quando a conta só existe num lado); sinal pela
  // NATUREZA — activo (DEVEDORA) a crescer consome caixa, passivo (CREDORA)
  // a crescer liberta-a; numa conta CAIXA o efeito é a própria variação de
  // caixa. Nunca por prefixo de código, nunca por `tipo`.
  const porConta = new Map<string, VariacaoClassificada[]>();
  for (const v of variacoes) {
    const lista = porConta.get(v.conta.id) ?? [];
    lista.push(v);
    porConta.set(v.conta.id, lista);
  }
  const comMovimento = new Set([...esperado.inicio, ...esperado.fim].map((l) => l.conta.codigo));
  for (const codigo of comMovimento) {
    const { conta, rubrica } = plano.contas.get(codigo)!;
    const saldoIni = saldoPelaNatureza(conta.natureza, esperado.somasInicio.get(codigo) ?? { debitos: ZERO, creditos: ZERO });
    const saldoFim = saldoPelaNatureza(conta.natureza, esperado.somasFim.get(codigo) ?? { debitos: ZERO, creditos: ZERO });
    const variacao = saldoFim.minus(saldoIni);
    const lista = porConta.get(conta.id) ?? [];
    // Uma conta nunca gera duas variações (seria contá-la duas vezes).
    expect(lista.length).toBeLessThanOrEqual(1);
    if (TIPOS_RESULTADO.has(conta.tipo)) {
      // Representada pelo resultado líquido: se aparecer, aparece na sua
      // rubrica — o que pode valer é decidido pelas somas acima.
      for (const v of lista) {
        expect(v.rubricaId).toBe(rubrica.id);
        expect(v.atividade).toBe(rubrica.atividade);
      }
      continue;
    }
    if (!variacao.equals(0)) expect(lista.length).toBe(1);
    for (const v of lista) {
      expect(v.rubricaId).toBe(rubrica.id);
      expect(v.atividade).toBe(rubrica.atividade);
      expect(iguais(v.saldoInicial, saldoIni)).toBe(true);
      expect(iguais(v.saldoFinal, saldoFim)).toBe(true);
      expect(iguais(v.variacao, variacao)).toBe(true);
      const efeitoEsperado = plano.caixa.has(codigo)
        ? conta.natureza === 'DEVEDORA' ? variacao : variacao.negated()
        : conta.natureza === 'DEVEDORA' ? variacao.negated() : variacao;
      expect(iguais(v.efeitoCaixa, efeitoEsperado)).toBe(true);
    }
  }
  // Nenhuma variação de uma conta que não tenha movimento.
  for (const id of porConta.keys()) {
    expect([...comMovimento].some((codigo) => plano.contas.get(codigo)!.conta.id === id)).toBe(true);
  }
}

const arbMes = fc.integer({ min: 0, max: 12 });

/** Intervalo [de..ate] de meses, 1 ≤ de ≤ ate ≤ 12, com peso próprio para o ano inteiro e um mês só. */
const arbIntervalo = fc.oneof(
  fc.constant({ de: 1, ate: 12 }),
  fc.integer({ min: 1, max: 12 }).map((m) => ({ de: m, ate: m })),
  fc.tuple(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 12 })).map(([a, b]) => ({
    de: Math.min(a, b),
    ate: Math.max(a, b),
  })),
);

const arbDiario = fc
  .array(arbLancamento(CODIGOS, arbMes), { maxLength: 25 })
  .map((especs) => especs.flatMap(materializar));

// ---------------------------------------------------------------------------
// I6 — Articulação (ADR-0037 §5, E2)
// OP + INV + FIN == Δcaixa do intervalo, em Decimal exacto, com Δcaixa
// calculado SÓ sobre as contas mapeadas a rubricas CAIXA.
// ---------------------------------------------------------------------------

describe('I6 — articulação', () => {
  it('[property] OP + INV + FIN == Δcaixa para qualquer diário de partida dobrada, qualquer mapa e qualquer conjunto de caixa', () => {
    fc.assert(
      fc.property(arbPlano, arbDiario, arbIntervalo, (plano, diario, { de, ate }) => {
        assertArticula(plano, esperar(plano, diario, de, ate));
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  /**
   * Um estorno numa conta de caixa TEM de continuar a articular (correcção M2
   * do nó `contratos`): o par original + estorno entra inteiro no balancete
   * (FILTRO_LANCAMENTO_MAPA) e é neutro — o mapa com o par é igual, linha a
   * linha, ao mapa sem ele. Um núcleo que lesse débitos ou créditos de um só
   * lado, ou que tratasse o estorno como movimento, divergiria aqui.
   */
  it('[property] estorno numa conta de caixa: articula, e o mapa é o mesmo com e sem o par estornado', () => {
    const arbEstornoEmCaixa = fc.record({
      mes: fc.integer({ min: 1, max: 12 }),
      caixa: fc.constantFrom(...CANDIDATAS_CAIXA),
      contraparte: fc.constantFrom(...CODIGOS),
      centavos: fc.integer({ min: 1, max: 5_000_000_00 }),
      sentido: fc.constantFrom<'DEBITO' | 'CREDITO'>('DEBITO', 'CREDITO'),
    });
    fc.assert(
      fc.property(arbPlano, arbDiario, arbIntervalo, arbEstornoEmCaixa, (plano, diario, { de, ate }, e) => {
        // O par: original ESTORNADO + estorno LANCADO, ambos dentro do intervalo.
        const valor = centavos(e.centavos);
        const original: Lancamento = {
          mes: e.mes,
          partidas: [
            { conta: e.caixa, tipo: e.sentido, valor },
            { conta: e.contraparte, tipo: e.sentido === 'DEBITO' ? 'CREDITO' : 'DEBITO', valor },
          ],
        };
        const estorno: Lancamento = {
          mes: e.mes,
          partidas: original.partidas.map((p) => ({ ...p, tipo: p.tipo === 'DEBITO' ? 'CREDITO' : 'DEBITO' })),
        };
        const comPar = [...diario, original, estorno];
        const deAlargado = Math.min(de, e.mes);
        const ateAlargado = Math.max(ate, e.mes);

        const semEstorno = esperar(plano, diario, deAlargado, ateAlargado);
        const comEstorno = esperar(plano, comPar, deAlargado, ateAlargado);
        assertArticula(plano, comEstorno);

        // Neutralidade: mesmos totais e mesmas rubricas, ao cêntimo.
        const a = correr(plano, semEstorno).seccoes;
        const b = correr(plano, comEstorno).seccoes;
        expect(iguais(b.somaAtividades, a.somaAtividades)).toBe(true);
        expect(iguais(b.resultadoLiquido, a.resultadoLiquido)).toBe(true);
        for (const s of SECCOES) expect(iguais(b[s].total, a[s].total)).toBe(true);
        for (const r of RUBRICAS) expect(iguais(valorRubrica(b, r.id), valorRubrica(a, r.id))).toBe(true);
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  /**
   * I7 na parte pura: uma conta com movimento e sem entrada no mapa NÃO é
   * silenciada nem lançada — sai em `naoMapeadas` para o serviço a converter
   * em impedimento (todas de uma vez), e não entra em secção nenhuma.
   */
  it('[property] conta sem mapeamento sai em naoMapeadas e nunca entra nas secções', () => {
    fc.assert(
      fc.property(
        arbPlano,
        arbDiario,
        arbIntervalo,
        fc.subarray([...CODIGOS], { minLength: 1 }),
        (plano, diario, { de, ate }, retiradas) => {
          const esperado = esperar(plano, diario, de, ate);
          const mapa = new Map(plano.mapa);
          for (const codigo of retiradas) mapa.delete('c-' + codigo);
          const { variacoes, naoMapeadas } = classificarVariacoes(esperado.inicio, esperado.fim, mapa);
          const comMovimento = new Set([...esperado.inicio, ...esperado.fim].map((l) => l.conta.id));
          const esperadas = [...comMovimento].filter((id) => !mapa.has(id)).sort();
          expect(naoMapeadas.map((c) => c.id).sort()).toEqual(esperadas);
          for (const v of variacoes) expect(mapa.has(v.conta.id)).toBe(true);
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  /**
   * Caso que TEM de lançar (I6). Qualquer diferença — de um cêntimo, de um
   * milésimo, negativa — é `DFC_NAO_ARTICULA`, `BusinessRuleError`, com o
   * delta em `details` (strings decimais, delta = somaAtividades −
   * variacaoCaixa). Sem tolerância: um `toFixed(2)` antes de comparar é uma
   * tolerância, e uma asserção monetária com tolerância não asserta.
   */
  it('[property] TEM de lançar: somaAtividades ≠ variacaoCaixa ⇒ DFC_NAO_ARTICULA com o delta em details', () => {
    const arbDelta = fc.oneof(
      fc.constantFrom(new Prisma.Decimal('0.01'), new Prisma.Decimal('-0.01')),
      fc.constantFrom(new Prisma.Decimal('0.001'), new Prisma.Decimal('-0.001')),
      fc.integer({ min: -1_000_000_00, max: 1_000_000_00 }).filter((n) => n !== 0).map(centavos),
    );
    fc.assert(
      fc.property(
        fc.integer({ min: -5_000_000_00, max: 5_000_000_00 }).map(centavos),
        arbDelta,
        (soma, delta) => {
          const seccoes = seccoesStub(soma);
          const variacaoCaixa = soma.minus(delta);
          let erro: unknown;
          try {
            verificarArticulacao(seccoes, variacaoCaixa);
          } catch (e) {
            erro = e;
          }
          expect(erro).toBeInstanceOf(BusinessRuleError);
          const bre = erro as BusinessRuleError;
          expect(bre.code).toBe(ERROS_DFC.DFC_NAO_ARTICULA);
          const details = bre.details as { delta: string; somaAtividades: string; variacaoCaixa: string };
          expect(iguais(new Prisma.Decimal(details.delta), delta)).toBe(true);
          expect(iguais(new Prisma.Decimal(details.somaAtividades), soma)).toBe(true);
          expect(iguais(new Prisma.Decimal(details.variacaoCaixa), variacaoCaixa)).toBe(true);
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('TEM de lançar: um cêntimo a mais de 1 000 000 000 000 000 — onde um `number` já não o vê', () => {
    const soma = new Prisma.Decimal('1000000000000000.01');
    const caixa = new Prisma.Decimal('1000000000000000');
    // Se isto passasse, a comparação estaria a fazer-se em double.
    expect(Number(soma.toString()) === Number(caixa.toString())).toBe(true);
    expect(codigoErro(() => verificarArticulacao(seccoesStub(soma), caixa))).toBe(ERROS_DFC.DFC_NAO_ARTICULA);
  });

  it('não lança quando os dois lados são iguais com representações diferentes (100.10 vs 100.1)', () => {
    expect(() =>
      verificarArticulacao(seccoesStub(new Prisma.Decimal('100.10')), new Prisma.Decimal('100.1')),
    ).not.toThrow();
    expect(() => verificarArticulacao(seccoesStub(ZERO), new Prisma.Decimal('-0'))).not.toThrow();
  });

  it('TEM de lançar, de ponta a ponta: um diário que articula deixa de articular com um cêntimo a mais na caixa', () => {
    const plano = montarPlano({
      natureza421: 'DEVEDORA',
      natureza44331: 'DEVEDORA',
      contasCaixa: ['111', '121'],
      reatribuicoes: [],
    });
    const diario = [
      // abertura: capital em banco
      { mes: 0, debitos: [{ conta: '121', centavos: 1_000_000_00 }], creditos: ['511'], corte: 0, estornado: false },
      // venda a crédito com IVA liquidado
      { mes: 3, debitos: [{ conta: '411', centavos: 116_00 }], creditos: ['711', '44331'], corte: 86, estornado: false },
      // recebimento parcial do cliente
      { mes: 4, debitos: [{ conta: '111', centavos: 50_00 }], creditos: ['411'], corte: 0, estornado: false },
      // compra a crédito ao fornecedor
      { mes: 5, debitos: [{ conta: '211', centavos: 40_00 }], creditos: ['421'], corte: 0, estornado: false },
      // amortização do período
      { mes: 6, debitos: [{ conta: '651', centavos: 10_00 }], creditos: ['3281'], corte: 0, estornado: false },
    ].flatMap(materializar);
    const esperado = esperar(plano, diario, 1, 12);
    assertArticula(plano, esperado);
    const { seccoes } = correr(plano, esperado);
    const codigo = codigoErro(() => verificarArticulacao(seccoes, esperado.variacaoCaixa.plus('0.01')));
    expect(codigo).toBe(ERROS_DFC.DFC_NAO_ARTICULA);
  });
});

/** Secções mínimas com um `somaAtividades` dado — o que `verificarArticulacao` compara. */
function seccoesStub(somaAtividades: Prisma.Decimal): SeccoesDFC {
  return {
    resultadoLiquido: ZERO,
    operacional: { atividade: 'OPERACIONAL', rubricas: [], total: somaAtividades },
    investimento: { atividade: 'INVESTIMENTO', rubricas: [], total: ZERO },
    financiamento: { atividade: 'FINANCIAMENTO', rubricas: [], total: ZERO },
    somaAtividades,
  };
}

// ---------------------------------------------------------------------------
// I8 — Aditividade de períodos (ADR-0037 §Consequências)
// DFC(de..ate) == Σ DFC(mês), mês a mês, para as três actividades — e para o
// resultado, a soma e cada rubrica, porque o método é linear nas variações.
// ---------------------------------------------------------------------------

describe('I8 — aditividade dos meses', () => {
  it('[property] DFC(de..ate) == Σ DFC(m), m ∈ [de..ate], por actividade, por rubrica e no resultado', () => {
    fc.assert(
      fc.property(arbPlano, arbDiario, arbIntervalo, (plano, diario, { de, ate }) => {
        const inteiro = correr(plano, esperar(plano, diario, de, ate)).seccoes;
        const meses: SeccoesDFC[] = [];
        for (let m = de; m <= ate; m++) {
          const esperadoMes = esperar(plano, diario, m, m);
          const mes = correr(plano, esperadoMes).seccoes;
          // Cada mês articula por si — I6 é local antes de ser aditivo.
          expect(() => verificarArticulacao(mes, esperadoMes.variacaoCaixa)).not.toThrow();
          meses.push(mes);
        }
        for (const s of SECCOES) {
          expect(iguais(inteiro[s].total, somar(meses.map((x) => x[s].total)))).toBe(true);
        }
        expect(iguais(inteiro.resultadoLiquido, somar(meses.map((x) => x.resultadoLiquido)))).toBe(true);
        expect(iguais(inteiro.somaAtividades, somar(meses.map((x) => x.somaAtividades)))).toBe(true);
        for (const r of RUBRICAS) {
          expect(iguais(valorRubrica(inteiro, r.id), somar(meses.map((x) => valorRubrica(x, r.id))))).toBe(true);
        }
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('[property] o ano inteiro é a soma dos doze meses, mesmo com saldos de abertura (mês 0) não nulos', () => {
    const arbDiarioComAbertura = fc
      .tuple(
        fc.array(arbLancamento(CODIGOS, fc.constant(0)), { minLength: 1, maxLength: 6 }),
        fc.array(arbLancamento(CODIGOS, fc.integer({ min: 1, max: 12 })), { maxLength: 20 }),
      )
      .map(([abertura, ano]) => [...abertura, ...ano].flatMap(materializar));
    fc.assert(
      fc.property(arbPlano, arbDiarioComAbertura, (plano, diario) => {
        const ano = correr(plano, esperar(plano, diario, 1, 12)).seccoes;
        const meses = Array.from({ length: 12 }, (_, i) => correr(plano, esperar(plano, diario, i + 1, i + 1)).seccoes);
        for (const s of SECCOES) {
          expect(iguais(ano[s].total, somar(meses.map((x) => x[s].total)))).toBe(true);
        }
        expect(iguais(ano.somaAtividades, somar(meses.map((x) => x.somaAtividades)))).toBe(true);
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  /**
   * Caso que TEM de lançar (I8). `montarSeccoesDFC` tem de ser total sobre o
   * enum de actividades: um `switch` com `default` silencioso deixaria cair
   * uma variação de actividade desconhecida — dinheiro que desaparece do mapa
   * ANTES da articulação, que depois acusaria a conta errada. Falhar alto,
   * não mentir baixo.
   */
  it('TEM de lançar: variação com actividade fora do enum', () => {
    const variacao: VariacaoClassificada = {
      conta: { id: 'c-411', codigo: '411', nome: 'Clientes c/c', tipo: 'ATIVO', natureza: 'DEVEDORA' },
      rubricaId: 'r-OP-01',
      atividade: 'OUTRA' as AtividadeFluxo,
      saldoInicial: ZERO,
      saldoFinal: centavos(100_00),
      variacao: centavos(100_00),
      efeitoCaixa: centavos(-100_00),
    };
    expect(() => montarSeccoesDFC(ZERO, [variacao], [...RUBRICAS])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// V4 — Limites no mesmo exercício (E3)
// verificarMesmoExercicio(inicio, fim): DFC_ENTRE_EXERCICIOS se os exercícios
// diferem; DFC_INTERVALO_INVERTIDO se fim.ordem < inicio.ordem.
// ---------------------------------------------------------------------------

describe('V4 — recusa entre exercícios', () => {
  type Limite = Pick<PeriodoContabil, 'exercicioId' | 'ordem' | 'codigo'>;
  const limite = (exercicioId: string, ordem: number): Limite => ({
    exercicioId,
    ordem,
    codigo: `${exercicioId}-${String(ordem).padStart(2, '0')}`,
  });
  const arbOrdem = fc.integer({ min: 1, max: 13 });
  const arbExercicio = fc.constantFrom('ex-2024', 'ex-2025', 'ex-2026', 'ex-2027');

  it('[property] TEM de lançar: exercícios diferentes ⇒ DFC_ENTRE_EXERCICIOS, seja qual for a ordem', () => {
    fc.assert(
      fc.property(
        fc.tuple(arbExercicio, arbExercicio).filter(([a, b]) => a !== b),
        arbOrdem,
        arbOrdem,
        ([exA, exB], oA, oB) => {
          expect(codigoErro(() => verificarMesmoExercicio(limite(exA, oA), limite(exB, oB)))).toBe(
            ERROS_DFC.DFC_ENTRE_EXERCICIOS,
          );
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('[property] mesmo exercício e fim.ordem ≥ inicio.ordem ⇒ não lança (inclui um período só e o 13.º)', () => {
    fc.assert(
      fc.property(arbExercicio, arbOrdem, arbOrdem, (ex, a, b) => {
        const inicio = Math.min(a, b);
        const fim = Math.max(a, b);
        expect(() => verificarMesmoExercicio(limite(ex, inicio), limite(ex, fim))).not.toThrow();
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('[property] TEM de lançar: mesmo exercício e fim.ordem < inicio.ordem ⇒ DFC_INTERVALO_INVERTIDO', () => {
    fc.assert(
      fc.property(
        arbExercicio,
        fc.tuple(arbOrdem, arbOrdem).filter(([a, b]) => a !== b),
        (ex, [a, b]) => {
          const inicio = Math.max(a, b);
          const fim = Math.min(a, b);
          expect(codigoErro(() => verificarMesmoExercicio(limite(ex, inicio), limite(ex, fim)))).toBe(
            ERROS_DFC.DFC_INTERVALO_INVERTIDO,
          );
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('fronteira de exercício: Dezembro de 2025 → Janeiro de 2026 é ENTRE_EXERCICIOS, não INTERVALO_INVERTIDO', () => {
    // Por ordem, 12 > 1 — mas a razão da recusa é o exercício, e é isso que a
    // mensagem ao utilizador tem de dizer (V4).
    expect(codigoErro(() => verificarMesmoExercicio(limite('ex-2025', 12), limite('ex-2026', 1)))).toBe(
      ERROS_DFC.DFC_ENTRE_EXERCICIOS,
    );
    // O 13.º período (encerramento) do ano anterior também não se cola ao ano seguinte.
    expect(codigoErro(() => verificarMesmoExercicio(limite('ex-2025', 13), limite('ex-2026', 1)))).toBe(
      ERROS_DFC.DFC_ENTRE_EXERCICIOS,
    );
  });
});

// ---------------------------------------------------------------------------
// periodoHomologo (E3)
// O mesmo intervalo relativo — por `ordem` — no exercício anterior; `null`
// sem exercício anterior ou sem algum dos dois homólogos (nunca um parcial).
// ---------------------------------------------------------------------------

describe('periodoHomologo — o mesmo intervalo relativo em N-1', () => {
  function periodo(exercicioId: string, ano: number, ordem: number): PeriodoContabil {
    const inicio = ordem === 13 ? fimDeMesEmMaputo(ano, 12) : inicioDeMesEmMaputo(ano, ordem);
    const fim = ordem === 13 ? fimDeMesEmMaputo(ano, 12) : fimDeMesEmMaputo(ano, ordem);
    return {
      id: `${exercicioId}-p${ordem}`,
      tenantId: 't-1',
      exercicioId,
      ordem,
      codigo: `${ano}-${String(ordem).padStart(2, '0')}`,
      dataInicio: inicio,
      dataFim: fim,
      estado: 'ABERTO',
      fechadoEm: null,
      fechadoPorId: null,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
  }

  /** Os 13 períodos de um exercício, como `criarExercicioContabil` os cria. */
  function periodosDe(ano: number): PeriodoContabil[] {
    return Array.from({ length: 13 }, (_, i) => periodo(`ex-${ano}`, ano, i + 1));
  }

  const arbIntervaloOrdens = fc
    .tuple(fc.integer({ min: 1, max: 13 }), fc.integer({ min: 1, max: 13 }))
    .map(([a, b]) => ({ inicio: Math.min(a, b), fim: Math.max(a, b) }));

  /** Ano corrente com anterior: 2025←2024 (bissexto), 2026←2025, 2027←2026. */
  const arbAno = fc.constantFrom(2025, 2026, 2027);

  it('[property] devolve os períodos com a MESMA ordem no exercício anterior, seja qual for a ordem em que chegam', () => {
    fc.assert(
      fc.property(arbAno, arbIntervaloOrdens, fc.boolean(), (ano, { inicio, fim }, inverter) => {
        const atuais = periodosDe(ano);
        const anteriores = periodosDe(ano - 1);
        const homologo = periodoHomologo(
          atuais[inicio - 1],
          atuais[fim - 1],
          inverter ? [...anteriores].reverse() : anteriores,
        );
        expect(homologo).not.toBeNull();
        expect(homologo!.inicio.id).toBe(`ex-${ano - 1}-p${inicio}`);
        expect(homologo!.fim.id).toBe(`ex-${ano - 1}-p${fim}`);
        expect(homologo!.inicio.ordem).toBe(inicio);
        expect(homologo!.fim.ordem).toBe(fim);
        expect(homologo!.inicio.exercicioId).toBe(`ex-${ano - 1}`);
        expect(homologo!.fim.exercicioId).toBe(`ex-${ano - 1}`);

        // Em Africa/Maputo: o mesmo mês, um ano antes; do dia 1 ao último dia
        // desse mês NESSE ano (Fevereiro de 2024 acaba a 29, o de 2025 a 28).
        const ini = civilEmMaputo(homologo!.inicio.dataInicio);
        const fimCivil = civilEmMaputo(homologo!.fim.dataFim);
        expect(ini.ano).toBe(ano - 1);
        expect(fimCivil.ano).toBe(ano - 1);
        const mesInicio = inicio === 13 ? 12 : inicio;
        const mesFim = fim === 13 ? 12 : fim;
        expect(ini.mes).toBe(mesInicio);
        expect(fimCivil.mes).toBe(mesFim);
        expect(ini.dia).toBe(inicio === 13 ? 31 : 1);
        expect(fimCivil.dia).toBe(new Date(Date.UTC(ano - 1, mesFim, 0)).getUTCDate());
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('[property] null sem exercício anterior (null ou lista vazia)', () => {
    fc.assert(
      fc.property(arbAno, arbIntervaloOrdens, (ano, { inicio, fim }) => {
        const atuais = periodosDe(ano);
        expect(periodoHomologo(atuais[inicio - 1], atuais[fim - 1], null)).toBeNull();
        expect(periodoHomologo(atuais[inicio - 1], atuais[fim - 1], [])).toBeNull();
        return true;
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('[property] exercício anterior incompleto: null se faltar QUALQUER um dos dois homólogos — nunca um parcial', () => {
    fc.assert(
      fc.property(
        arbAno,
        arbIntervaloOrdens,
        fc.subarray(Array.from({ length: 13 }, (_, i) => i + 1), { minLength: 1 }),
        (ano, { inicio, fim }, ordensEmFalta) => {
          const atuais = periodosDe(ano);
          const emFalta = new Set(ordensEmFalta);
          const anteriores = periodosDe(ano - 1).filter((p) => !emFalta.has(p.ordem));
          const homologo = periodoHomologo(atuais[inicio - 1], atuais[fim - 1], anteriores);
          if (emFalta.has(inicio) || emFalta.has(fim)) {
            expect(homologo).toBeNull();
          } else {
            expect(homologo).not.toBeNull();
            expect(homologo!.inicio.ordem).toBe(inicio);
            expect(homologo!.fim.ordem).toBe(fim);
          }
          return true;
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('exemplo da emenda: 2026-04..2026-06 compara com 2025-04..2025-06, em dias civis de Maputo', () => {
    const atuais = periodosDe(2026);
    const homologo = periodoHomologo(atuais[3], atuais[5], periodosDe(2025));
    expect(homologo).not.toBeNull();
    expect(civilEmMaputo(homologo!.inicio.dataInicio)).toEqual({ ano: 2025, mes: 4, dia: 1 });
    expect(civilEmMaputo(homologo!.fim.dataFim)).toEqual({ ano: 2025, mes: 6, dia: 30 });
  });

  it('29 de Fevereiro: Fevereiro de 2025 (28 dias) tem por homólogo Fevereiro de 2024 inteiro, até dia 29', () => {
    const atuais = periodosDe(2025);
    const homologo = periodoHomologo(atuais[1], atuais[1], periodosDe(2024));
    expect(homologo).not.toBeNull();
    expect(civilEmMaputo(homologo!.inicio.dataInicio)).toEqual({ ano: 2024, mes: 2, dia: 1 });
    expect(civilEmMaputo(homologo!.fim.dataFim)).toEqual({ ano: 2024, mes: 2, dia: 29 });
  });
});
