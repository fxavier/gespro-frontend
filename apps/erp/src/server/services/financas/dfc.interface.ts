import 'server-only'; // A5: serviços são server-only
import type { Prisma } from '@prisma/client';
import type {
  AtividadeFluxo,
  AtividadeSeccao,
  SinalFluxo,
  OrigemRubrica,
  EstadoVersaoMapeamento,
  FiltroDFCInput,
  MapearContaInput,
  CriarRubricaInput,
  EditarRubricaInput,
  DefinirContasCaixaInput,
  ValidarVersaoInput,
} from '@/lib/validations/fluxo-caixa';
import type {
  Ctx,
  ContaPGC,
  ContaBalancete,
  PeriodoContabil,
  ExercicioContabil,
} from './contabilidade.interface';

export type { Ctx };

/**
 * Contratos da Demonstração de Fluxos de Caixa — método indirecto
 * (spec 22 · WS-2 · ADR-0037 com a emenda de 2026-09-25).
 *
 * Vocabulário (skill `fluxo-de-caixa-conventions`) — desvio é defeito de domínio:
 *  - Rubrica     = linha da DFC, com actividade e sinal. NÃO é uma conta PGC.
 *  - Caixa       = as contas mapeadas a rubricas de actividade `CAIXA` (E2).
 *                  NÃO é «a classe 1»; nunca se deduz por prefixo de código.
 *  - Articulação = OP + INV + FIN == Δcaixa, ao cêntimo, em `Decimal` (I6).
 *                  NÃO é «bate aproximadamente».
 *  - Versão      = instantâneo append-only do mapeamento (E1). NÃO é a cópia
 *                  de trabalho: essa é `RubricaFluxoCaixa` + `MapeamentoContaFluxo`.
 *
 * As duas regras do épico:
 *  1. Conta com movimento e sem mapeamento ⇒ `impedimentos`, TODAS de uma vez,
 *     e NENHUM mapa (§4, I7) — ao estilo do `fecharPeriodo`.
 *  2. `verificarArticulacao` corre em produção; divergência ⇒
 *     `DFC_NAO_ARTICULA` com o delta em `details`, e o mapa não sai (§5).
 *
 * A DFC é SÓ LEITURA de `Lancamento`/`PartidaLancamento` (gate-periodo a zero).
 * Nada do que calcula se grava. Reutiliza `gerarDRE`, `montarLinhasBalancete`
 * e `FILTRO_LANCAMENTO_MAPA` de `contabilidade.service.ts` — não os reescreve.
 * NÃO usa `saldoContabilAte`: essa função filtra só `LANCADO` (issue #66) e,
 * numa conta de caixa com estorno, faria o I6 falhar sem erro nenhum de
 * classificação. Os dois lados da articulação saem dos MESMOS balancetes
 * (ADR-0037 §6: filtro dos mapas).
 */

// ---------------------------------------------------------------------------
// Códigos de erro estáveis deste domínio (BusinessRuleError.code)
// ---------------------------------------------------------------------------

export const ERROS_DFC = {
  /** I6 violado. `details: { delta, somaAtividades, variacaoCaixa }` em strings decimais (delta = somaAtividades − variacaoCaixa). */
  DFC_NAO_ARTICULA: 'DFC_NAO_ARTICULA',
  /** V4: início e fim em exercícios diferentes. */
  DFC_ENTRE_EXERCICIOS: 'DFC_ENTRE_EXERCICIOS',
  /** Período final anterior ao inicial (por `ordem`). */
  DFC_INTERVALO_INVERTIDO: 'DFC_INTERVALO_INVERTIDO',
  /** V3: tentativa de validar uma versão que não é a mais recente. */
  VERSAO_DESACTUALIZADA: 'VERSAO_DESACTUALIZADA',
  /** §3: tentativa de apagar uma rubrica `origem: SISTEMA`. */
  RUBRICA_DE_SISTEMA: 'RUBRICA_DE_SISTEMA',
} as const;

export type CodigoErroDFC = (typeof ERROS_DFC)[keyof typeof ERROS_DFC];

// ---------------------------------------------------------------------------
// Tipos de domínio (espelham o que o Prisma gera após a migração 22b)
// ---------------------------------------------------------------------------

export interface RubricaFluxoCaixa {
  id: string;
  tenantId: string;
  codigo: string; // OP-01, INV-02, FIN-03, CX-01
  designacao: string;
  atividade: AtividadeFluxo;
  sinal: SinalFluxo;
  ordem: number;
  origem: OrigemRubrica;
  ativo: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface MapeamentoContaFluxo {
  id: string;
  tenantId: string;
  contaId: string; // → ContaPGC
  rubricaId: string; // → RubricaFluxoCaixa
  createdAt: Date;
  updatedAt: Date;
}

export interface VersaoMapeamentoFluxo {
  id: string;
  tenantId: string;
  numero: number; // 1, 2, 3… por tenant
  estado: EstadoVersaoMapeamento;
  instantaneo: InstantaneoMapeamento;
  validadoPorId: string | null;
  validadoEm: Date | null;
  observacao: string | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Instantâneo de uma versão (E1) — o que vai para `VersaoMapeamentoFluxo.instantaneo`
// ---------------------------------------------------------------------------

/**
 * Uma rubrica tal como fica congelada numa versão: só o que decide o mapa.
 * Sem `tenantId`, datas nem `deletedAt` — uma rubrica apagada não entra no
 * instantâneo, e o `id` chega para reconciliar com a cópia de trabalho.
 */
export type RubricaInstantaneo = Pick<
  RubricaFluxoCaixa,
  'id' | 'codigo' | 'designacao' | 'atividade' | 'sinal' | 'ordem' | 'origem' | 'ativo'
>;

export interface MapeamentoInstantaneo {
  contaId: string;
  rubricaId: string;
}

/**
 * O conteúdo de uma versão (E1): o conjunto de rubricas e a atribuição
 * conta→rubrica. As contas de caixa NÃO têm campo próprio: são as entradas de
 * `mapeamentos` cuja rubrica tem `atividade: 'CAIXA'` (E2). Um campo à parte
 * seria uma segunda fonte de verdade que o V1 («igual ao elemento») teria de
 * reconciliar.
 *
 * Ordenação CANÓNICA, para que `mudou()` seja igualdade estrutural e não
 * dependa da ordem em que a base devolveu as linhas: `rubricas` por `codigo`
 * ascendente; `mapeamentos` por `contaId` ascendente. `instantaneoDe` garante-a.
 *
 * É serializável em JSON tal como está (só strings, números e booleanos) —
 * é o tipo do campo `Json` do Prisma.
 */
export interface InstantaneoMapeamento {
  rubricas: RubricaInstantaneo[];
  mapeamentos: MapeamentoInstantaneo[];
}

// ---------------------------------------------------------------------------
// Impedimentos e avisos (ADR-0037 §4, E2)
// ---------------------------------------------------------------------------

/**
 * Uma conta com movimento no intervalo e sem mapeamento (I7). A UI mostra a
 * lista COMPLETA com o saldo e o movimento de cada uma (intent §Impedimentos),
 * e quem tem `:configurar` vê «Mapear» em cada linha.
 */
export interface ContaNaoMapeada {
  conta: Pick<ContaPGC, 'id' | 'codigo' | 'nome' | 'classe' | 'natureza'>;
  /** Σ débitos − Σ créditos ou o inverso, conforme a natureza, no intervalo. */
  movimento: Prisma.Decimal;
  /** Saldo (pela natureza) no fim do intervalo. */
  saldoFinal: Prisma.Decimal;
  /**
   * `true` quando a conta só tem movimento no comparativo N-1 (o intervalo
   * homólogo do exercício anterior, E3) e não no intervalo pedido: então
   * `movimento` e `saldoFinal` são os do HOMÓLOGO. `false` ⇒ são do intervalo
   * pedido. Uma conta que se move nos dois aparece uma vez só, com `false`.
   * A frase correspondente em `impedimentos` já o diz («no comparativo N-1»);
   * este campo é para a tabela da UI não ter de a interpretar.
   */
  comparativo: boolean;
}

/** Códigos dos avisos de coerência da configuração de caixa (E2). Avisam, não bloqueiam. */
export type CodigoAvisoConfiguracao =
  | 'CAIXA_FORA_CLASSE_1'
  | 'CAIXA_CONTA_AGREGADORA'
  | 'CAIXA_CONTA_INATIVA';

export interface AvisoConfiguracao {
  codigo: CodigoAvisoConfiguracao;
  conta: Pick<ContaPGC, 'id' | 'codigo' | 'nome'>;
  /** Frase em PT-PT pronta a mostrar, ex.: «A conta 2311 Depósitos a prazo está fora da classe 1». */
  mensagem: string;
}

/**
 * Resposta de `gerarDFC` quando o mapa NÃO sai (§4, E2). `impedimentos` são
 * frases em PT-PT, todas de uma vez, como no `fecharPeriodo`; `contasNaoMapeadas`
 * é a mesma informação estruturada, para a tabela da UI. Uma resposta destas
 * NUNCA traz secções: o tipo torna-o impossível.
 */
export interface ImpedimentosDFC {
  impedimentos: string[];
  contasNaoMapeadas: ContaNaoMapeada[];
  avisos: AvisoConfiguracao[];
}

// ---------------------------------------------------------------------------
// O mapa
// ---------------------------------------------------------------------------

/**
 * A variação de UMA conta entre o início e o fim do intervalo, já atribuída à
 * sua rubrica. Saldos pela natureza da conta (como `ContaBalancete.saldoAtual`):
 * positivos quando o saldo está do lado natural.
 *
 * `variacao = saldoFinal − saldoInicial` (pela natureza).
 * `efeitoCaixa` é a variação traduzida em fluxo pelo método indirecto — o
 * aumento de um activo (DEVEDORA) consome caixa, o aumento de um passivo
 * (CREDORA) liberta-a — e para as contas `CAIXA` é a própria variação de
 * caixa. A regra do sinal vive em `classificarVariacoes`; aqui fica o
 * resultado, para a UI e para os testes não a reimplementarem.
 * A `natureza` vai junto porque é conta a conta (44331 e 421 têm o sinal ao
 * contrário do resto da classe 4) — nunca se infere do código.
 */
export interface VariacaoClassificada {
  /** A forma de `ContaBalancete['conta']`: é tudo o que `classificarVariacoes` recebe. */
  conta: Pick<ContaPGC, 'id' | 'codigo' | 'nome' | 'tipo' | 'natureza'>;
  rubricaId: string;
  atividade: AtividadeFluxo;
  saldoInicial: Prisma.Decimal;
  saldoFinal: Prisma.Decimal;
  variacao: Prisma.Decimal;
  efeitoCaixa: Prisma.Decimal;
}

/** O que o núcleo puro precisa de saber de uma rubrica para classificar e apresentar. */
export type RubricaResumo = Pick<
  RubricaFluxoCaixa,
  'id' | 'codigo' | 'designacao' | 'atividade' | 'sinal' | 'ordem'
>;

/** O que `classificarVariacoes` precisa: `contaId` → rubrica. */
export type MapaConta = ReadonlyMap<string, RubricaResumo>;

/** Uma rubrica no mapa: o seu total e as contas que o compõem (expansível na UI). */
export interface LinhaRubricaDFC {
  rubrica: RubricaResumo;
  valor: Prisma.Decimal;
  contas: VariacaoClassificada[];
}

/** Uma das três secções (OP, INV, FIN). `CAIXA` não é secção. */
export interface SeccaoDFC {
  atividade: AtividadeSeccao;
  rubricas: LinhaRubricaDFC[];
  total: Prisma.Decimal;
}

/**
 * As secções do método indirecto. `resultadoLiquido` é o `lucroLiquido` de
 * `gerarDRE` do MESMO intervalo (I9) e ABRE a secção operacional: está
 * incluído em `operacional.total`.
 * Invariante I6: `somaAtividades == ColunaDFC.variacaoCaixa`, em `Decimal`
 * exacto — é o que `verificarArticulacao` impõe.
 */
export interface SeccoesDFC {
  resultadoLiquido: Prisma.Decimal;
  operacional: SeccaoDFC;
  investimento: SeccaoDFC;
  financiamento: SeccaoDFC;
  /**
   * `operacional.total + investimento.total + financiamento.total` — o lado
   * esquerdo da articulação. Não se chama `variacaoCaixa` de propósito: esse
   * nome é o do lado direito (`ColunaDFC.variacaoCaixa`, `caixaFinal −
   * caixaInicial`), e os dois só são iguais quando o mapa articula.
   */
  somaAtividades: Prisma.Decimal;
}

export type PeriodoRef = Pick<PeriodoContabil, 'id' | 'codigo' | 'ordem' | 'dataInicio' | 'dataFim' | 'estado'>;

/** Uma coluna do mapa: N, ou o homólogo N-1. */
export interface ColunaDFC {
  exercicio: Pick<ExercicioContabil, 'id' | 'codigo'>;
  periodoInicio: PeriodoRef;
  periodoFim: PeriodoRef;
  seccoes: SeccoesDFC;
  /**
   * Saldo das contas mapeadas a rubricas `CAIXA` no balancete do dia
   * anterior ao início — o MESMO balancete (mesmo `FILTRO_LANCAMENTO_MAPA`,
   * mesma data) que alimenta `classificarVariacoes` — em TERMOS DE DÉBITO
   * (débitos − créditos), via `saldoCaixaDe` de `dfc.model.ts`: DEVEDORA
   * `saldoAtual`, CREDORA `saldoAtual.negated()`. NÃO é Σ `saldoAtual` tal
   * qual: esse vem assinado pela natureza, e numa conta `CAIXA` CREDORA (um
   * descoberto bancário) ficaria com o sinal trocado face ao `efeitoCaixa`
   * das variações — um descoberto de 100 e um depósito de 100 dariam +200
   * em vez de 0, e `DFC_NAO_ARTICULA` sem nenhum erro de classificação.
   * NUNCA `saldoContabilAte` (só `LANCADO`): com um estorno numa conta de
   * caixa, os dois lados do I6 divergiriam sem nenhum erro de classificação.
   */
  caixaInicial: Prisma.Decimal;
  /** Idem, no balancete do fim do intervalo. */
  caixaFinal: Prisma.Decimal;
  /** `caixaFinal − caixaInicial` (o lado direito da articulação, I6). */
  variacaoCaixa: Prisma.Decimal;
}

/**
 * A Demonstração de Fluxos de Caixa (resposta de `gerarDFC` quando o mapa sai).
 * `homologo` é `null` quando não há exercício anterior (E3): a UI mostra «—»,
 * nunca um N-1 parcial calculado a partir dos saldos de abertura.
 * `provisorio` é true se ALGUM período do intervalo N estiver `ABERTO` (§6).
 * `versao` é a versão mais recente do mapeamento com que o mapa foi produzido;
 * `estado: 'PENDING'` liga a faixa «Mapeamento por validar» no ecrã e no PDF.
 */
export interface DFC {
  atual: ColunaDFC;
  homologo: ColunaDFC | null;
  provisorio: boolean;
  versao: Pick<VersaoMapeamentoFluxo, 'id' | 'numero' | 'estado'>;
  avisos: AvisoConfiguracao[];
}

/** O que `gerarDFC` devolve: o mapa, ou os impedimentos — nunca os dois. */
export type ResultadoDFC = DFC | ImpedimentosDFC;

/** Discriminador de `ResultadoDFC` para a action e para a página. */
export function temImpedimentos(r: ResultadoDFC): r is ImpedimentosDFC {
  return 'impedimentos' in r;
}

// ---------------------------------------------------------------------------
// Núcleo puro — assinaturas (implementação em dfc.model.ts, nó `nucleo`)
// ---------------------------------------------------------------------------
// Sem Prisma, sem I/O, sem Date.now(): tudo o que precisa entra por parâmetro.
// É onde vivem I6, I8, V1–V4 e onde os property tests correm em milissegundos.
// Precedente: `montarLinhasBalancete`, `calcularLinhasDRE`.

/**
 * Atribui cada conta à sua rubrica e calcula a variação e o efeito em caixa.
 * `balanceteInicio`/`balanceteFim` são os saldos pela natureza no dia anterior
 * ao início e no fim do intervalo (a mesma forma de `ContaBalancete`, com
 * `saldoAtual` como saldo nessa data). Uma conta presente num só lado tem
 * saldo zero no outro.
 * Uma conta SEM entrada em `mapa` NÃO é silenciada: é devolvida em
 * `naoMapeadas`, para que quem chama a transforme em impedimento (I7). A
 * função pura não decide se é impedimento — só não a deixa desaparecer.
 */
export type ClassificarVariacoesFn = (
  balanceteInicio: ContaBalancete[],
  balanceteFim: ContaBalancete[],
  mapa: MapaConta,
) => { variacoes: VariacaoClassificada[]; naoMapeadas: ContaBalancete['conta'][] };

/**
 * Agrupa as variações por rubrica e por secção, com o resultado líquido a
 * abrir a operacional (I9). As contas `CAIXA` NÃO entram em secção nenhuma
 * (E2: uma conta tem uma só rubrica, logo uma conta de caixa fica fora das
 * três actividades). Rubricas sem contas com movimento não aparecem.
 * `rubricas` fixa a ordem de apresentação (`atividade`, `ordem`).
 */
export type MontarSeccoesDFCFn = (
  resultadoLiquido: Prisma.Decimal,
  variacoes: VariacaoClassificada[],
  rubricas: RubricaResumo[],
) => SeccoesDFC;

/**
 * I6. Lança `BusinessRuleError('DFC_NAO_ARTICULA')` se
 * `seccoes.somaAtividades` ≠ `variacaoCaixa` (o `ColunaDFC.variacaoCaixa`,
 * `caixaFinal − caixaInicial`), com `details: { delta, somaAtividades,
 * variacaoCaixa }` em strings decimais, `delta = somaAtividades − variacaoCaixa`.
 * Igualdade por `Decimal.equals`, sem tolerância. Corre SEMPRE, em produção.
 */
export type VerificarArticulacaoFn = (
  seccoes: SeccoesDFC,
  variacaoCaixa: Prisma.Decimal,
) => void;

/**
 * V4. Lança `DFC_ENTRE_EXERCICIOS` se `inicio.exercicioId !== fim.exercicioId`
 * e `DFC_INTERVALO_INVERTIDO` se `fim.ordem < inicio.ordem`.
 */
export type VerificarMesmoExercicioFn = (
  inicio: Pick<PeriodoContabil, 'exercicioId' | 'ordem' | 'codigo'>,
  fim: Pick<PeriodoContabil, 'exercicioId' | 'ordem' | 'codigo'>,
) => void;

/**
 * E3. O intervalo homólogo no exercício anterior: os períodos com a MESMA
 * `ordem` de `inicio` e `fim`, procurados em `periodosAnterior` (os períodos
 * do `ExercicioContabil.anteriorId`). `null` se não houver exercício anterior
 * ou se algum dos dois períodos homólogos não existir — nunca um parcial.
 */
export type PeriodoHomologoFn = (
  inicio: Pick<PeriodoContabil, 'ordem'>,
  fim: Pick<PeriodoContabil, 'ordem'>,
  periodosAnterior: PeriodoContabil[] | null,
) => { inicio: PeriodoContabil; fim: PeriodoContabil } | null;

/** O que `coerenciaContasCaixa` precisa de saber de cada conta mapeada a `CAIXA`. */
export type ContaCaixaInfo = Pick<
  ContaPGC,
  'id' | 'codigo' | 'nome' | 'classe' | 'aceitaLancamento' | 'ativo'
>;

/**
 * E2. Nenhuma conta `CAIXA` ⇒ um impedimento (sem elas não há Δcaixa).
 * Conta `CAIXA` fora da classe 1, de agregação (`aceitaLancamento: false`) ou
 * inactiva ⇒ um aviso por conta e por motivo, que não bloqueia.
 * Nunca assume a classe 1 inteira como caixa: só olha para o que recebe.
 */
export type CoerenciaContasCaixaFn = (contasCaixa: ContaCaixaInfo[]) => {
  impedimentos: string[];
  avisos: AvisoConfiguracao[];
};

/**
 * Constrói o instantâneo de uma versão a partir da cópia de trabalho, em
 * ordem canónica (ver `InstantaneoMapeamento`). Rubricas com `deletedAt`
 * ficam de fora. (mapeamento-versao.model.ts)
 */
export type InstantaneoDeFn = (
  rubricas: RubricaFluxoCaixa[],
  mapeamentos: Pick<MapeamentoContaFluxo, 'contaId' | 'rubricaId'>[],
) => InstantaneoMapeamento;

/**
 * V2. Igualdade ESTRUTURAL entre dois instantâneos: `false` ⇔ nada mudou, e
 * então NÃO se cria versão. Indiferente à ordem de chegada (compara na ordem
 * canónica). (mapeamento-versao.model.ts)
 */
export type MudouFn = (
  anterior: InstantaneoMapeamento | null,
  novo: InstantaneoMapeamento,
) => boolean;

// ---------------------------------------------------------------------------
// Interface do serviço (I/O — implementação em dfc.service.ts, nós `servico` e `config`)
// ---------------------------------------------------------------------------

/**
 * IDfcService — contrato do serviço da DFC.
 *
 * `gerarDFC`, pela ordem da design §4.2 mais os três passos da emenda:
 *  1. resolver os dois períodos (cross-tenant → NotFoundError, I10) e
 *     `verificarMesmoExercicio` (V4);
 *  2. `versaoAtual` — `null` (tenant sem seed do mapeamento) é um
 *     IMPEDIMENTO («Mapeamento da DFC não semeado»), não um erro (§4):
 *     devolve `ImpedimentosDFC` com `contasNaoMapeadas: []` e PÁRA;
 *     `contasNaoMapeadas` + `coerenciaContasCaixa` → se houver impedimentos,
 *     devolve `ImpedimentosDFC` e PÁRA (nenhum mapa);
 *  3. `gerarDRE` do intervalo (I9) → dois balancetes, no dia anterior ao início
 *     e no fim (`FILTRO_LANCAMENTO_MAPA`, dia fiscal `Africa/Maputo`) →
 *     `classificarVariacoes` → `montarSeccoesDFC`; `caixaInicial`/`caixaFinal`
 *     saem DESSES MESMOS balancetes (Σ `saldoAtual` das contas `CAIXA`, sinal
 *     pela natureza) → `verificarArticulacao` (I6);
 *  4. a coluna N-1 por `periodoHomologo` (mesmo pipeline; `null` sem exercício
 *     anterior) — a articulação verifica-se nas duas colunas;
 *  5. `provisorio`, `versao` (a mais recente) e `avisos`.
 *
 * Escritas de configuração (nó `config`): singulares (nunca `upsert`/`*Many`),
 * na mesma `$transaction` que cria a versão n+1 em PENDING quando `mudou()`
 * (V1, V2). `validarVersao` tranca a versão com `FOR UPDATE` e recusa com
 * `VERSAO_DESACTUALIZADA` se não for a mais recente (V3). Isolamento (I10):
 * `tenantId` explícito em todos os `findFirst`/`update`/`delete`. As FKs da
 * migração 22b NÃO são tenant-scoped — a base aceita um `contaId` ou
 * `rubricaId` de outro tenant. Por isso `mapearConta`, `definirContasCaixa`,
 * `criarRubrica`/`editarRubrica` e qualquer escrita que receba `contaId`/
 * `rubricaId` resolvem-nos primeiro por `findFirst({ where: { id, tenantId } })`
 * e lançam `NotFoundError` (404, nunca 403) ANTES de escrever.
 */
export interface IDfcService {
  gerarDFC(filtro: FiltroDFCInput, ctx: Ctx): Promise<ResultadoDFC>;

  /**
   * Todas as contas com movimento no intervalo e sem mapeamento — de uma vez,
   * nunca uma de cada vez (§4, I7). Lista vazia ⇔ cobertura completa.
   */
  contasNaoMapeadas(filtro: FiltroDFCInput, ctx: Ctx): Promise<ContaNaoMapeada[]>;

  /** Rubricas activas e não apagadas do tenant, por (`atividade`, `ordem`). */
  listarRubricas(ctx: Ctx): Promise<RubricaFluxoCaixa[]>;

  /** Cópia de trabalho do mapeamento do tenant. */
  listarMapeamentos(ctx: Ctx): Promise<MapeamentoContaFluxo[]>;

  mapearConta(input: MapearContaInput, ctx: Ctx): Promise<MapeamentoContaFluxo>;

  /** Nasce `origem: TENANT`. */
  criarRubrica(input: CriarRubricaInput, ctx: Ctx): Promise<RubricaFluxoCaixa>;

  editarRubrica(input: EditarRubricaInput, ctx: Ctx): Promise<RubricaFluxoCaixa>;

  /** Soft delete de uma rubrica `TENANT` sem contas; `SISTEMA` recusa com `RUBRICA_DE_SISTEMA`. */
  eliminarRubrica(id: string, ctx: Ctx): Promise<RubricaFluxoCaixa>;

  /**
   * E2. Torna `contaIds` o conjunto exacto das contas de caixa: as que entram
   * passam a mapear à rubrica `CAIXA`; as que saem ficam SEM mapeamento
   * (impedimento até serem reatribuídas — nunca se adivinha actividade).
   */
  definirContasCaixa(input: DefinirContasCaixaInput, ctx: Ctx): Promise<MapeamentoContaFluxo[]>;

  /** Versões do tenant, da mais recente para a mais antiga. */
  listarVersoes(ctx: Ctx): Promise<VersaoMapeamentoFluxo[]>;

  /**
   * A versão mais recente (maior `numero`); `null` só num tenant ainda sem
   * seed do mapeamento — caso em que `gerarDFC` devolve um impedimento, não
   * um mapa nem um erro.
   */
  versaoAtual(ctx: Ctx): Promise<VersaoMapeamentoFluxo | null>;

  /** V3. `PENDING → VALIDATED` da versão mais recente, com `validadoPorId = ctx.userId`. */
  validarVersao(input: ValidarVersaoInput, ctx: Ctx): Promise<VersaoMapeamentoFluxo>;
}
