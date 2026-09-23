import 'server-only'; // A5: serviços são server-only
import type { Prisma } from '@prisma/client';
import type {
  TipoCompromisso,
  RecorrenciaCompromisso,
  Granularidade,
  Cenario,
  FiltroProjecaoInput,
  FiltroCompromissoInput,
  CriarCompromissoInput,
  AtualizarCompromissoInput,
} from '@/lib/validations/tesouraria';

/**
 * Contratos da Projecção de Tesouraria (spec 22 · WS-1 · ADR-0036).
 *
 * Vocabulário fixado no design §1 — qualquer desvio é defeito de domínio:
 *  - Tesouraria  = caixa + saldo contabilístico das contas bancárias.
 *                  NÃO inclui contas a receber.
 *  - Compromisso = obrigação ou direito datado, ainda não liquidado.
 *                  NÃO é um lançamento.
 *  - Bucket      = intervalo temporal com entradas, saídas e saldo de fecho.
 *                  NÃO é um período contabilístico.
 *
 * Nada do que a projecção calcula se grava (ADR-0036 §Decisão-1): sem tabela
 * de resultados, sem job, sem cache. O saldo de abertura vem SEMPRE do razão
 * — agregado com `FILTRO_LANCAMENTO_MAPA` sobre os `contaContabilId`
 * DISTINTOS das contas bancárias activas (§Decisão-2 e §2-bis), sem delegar
 * no `saldoContabilAte`, que filtra só `LANCADO` (issue #66).
 * `ContaBancaria.saldoAtual` é estado morto e não se lê.
 */

// ---------------------------------------------------------------------------
// Contexto (injectado pela action — nunca vem do cliente)
// ---------------------------------------------------------------------------

export interface Ctx {
  tenantId: string;
  userId: string;
}

// ---------------------------------------------------------------------------
// Tipos de domínio (espelham o que Prisma gerará após generate na migração 22a)
// ---------------------------------------------------------------------------

export interface CompromissoTesouraria {
  id: string;
  tenantId: string;
  descricao: string;
  tipo: TipoCompromisso;
  valor: Prisma.Decimal;
  dataPrevista: Date;
  recorrencia: RecorrenciaCompromisso;
  dataFimRecorrencia: Date | null;
  rubricaId: string | null; // → RubricaFluxoCaixa (WS-2; nulo até lá)
  contaContabilId: string | null; // → ContaPGC (escalar)
  ativo: boolean;
  observacoes: string | null;
  criadoPorId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/**
 * O subconjunto de um compromisso manual de que `expandirRecorrencia` precisa.
 * Deliberadamente sem campos de persistência: a expansão é uma função pura,
 * sem Prisma e sem `Date.now()` — a data de referência é sempre parâmetro.
 */
export type CompromissoBase = Pick<
  CompromissoTesouraria,
  | 'id'
  | 'descricao'
  | 'tipo'
  | 'valor'
  | 'dataPrevista'
  | 'recorrencia'
  | 'dataFimRecorrencia'
>;

/** As quatro origens de compromisso (ADR-0036 §Decisão-3). */
export type OrigemOcorrencia =
  | 'FATURA'
  | 'CONTA_PAGAR'
  | 'PAYROLL'
  | 'COMPROMISSO_MANUAL';

/**
 * Ocorrência: uma instância datada de um compromisso, pronta a distribuir por
 * buckets. Uma recorrência MENSAL num horizonte de 90 dias expande em ~3
 * ocorrências; uma `Fatura` a receber é exactamente uma.
 */
export interface Ocorrencia {
  origem: OrigemOcorrencia;
  /** Id do registo de origem (Fatura, ContaPagar, Payroll ou CompromissoTesouraria). */
  origemId: string;
  descricao: string;
  tipo: TipoCompromisso; // ENTRADA | SAIDA
  valor: Prisma.Decimal;
  data: Date;
  /**
   * R2.4: compromisso com data anterior à data de referência e ainda em
   * aberto — vai para o PRIMEIRO bucket, assinalado, nunca omitido.
   */
  vencida: boolean;
}

/**
 * Bucket: intervalo temporal com entradas, saídas e saldos (R4.2).
 * Invariante I2 (conservação): saldoFinal(n) == saldoFinal(n−1) + entradas(n) − saidas(n),
 * em `Decimal` exacto — nunca number.
 */
export interface Bucket {
  inicio: Date;
  fim: Date;
  entradas: Prisma.Decimal;
  saidas: Prisma.Decimal;
  saldoInicial: Prisma.Decimal;
  saldoFinal: Prisma.Decimal;
  /** Ocorrências atribuídas a este bucket (detalhe para a UI; vencidas assinaladas). */
  ocorrencias: Ocorrencia[];
}

/**
 * Perfil de atraso de cobrança do tenant (ADR-0036 §Decisão-6):
 * média e desvio padrão do atraso, sobre facturas liquidadas nos últimos 180 dias.
 * `amostra < 20` ⇒ `amostraInsuficiente: true` e o cenário BASE degrada para
 * OTIMISTA — e a UI di-lo explicitamente (R5.3).
 */
export interface PerfilAtraso {
  atrasoMedioDias: number;
  desvioPadraoDias: number;
  amostra: number;
  amostraInsuficiente: boolean;
}

/** Resposta de `projetarTesouraria` (R1, R4, R5, R6). */
export interface ProjecaoTesouraria {
  /** Dia civil de referência em Africa/Maputo (via diaCivilEmMaputo). */
  dataReferencia: Date;
  horizonteDias: number;
  granularidade: Granularidade;
  /** Cenário pedido pelo utilizador. */
  cenario: Cenario;
  /** Cenário efectivamente aplicado (BASE degrada para OTIMISTA se amostra insuficiente). */
  cenarioAplicado: Cenario;
  saldoAbertura: Prisma.Decimal;
  /**
   * R1.3: true quando não há nenhuma ContaBancaria activa nem SessaoCaixa
   * ABERTA — a UI diz que não há origens de saldo configuradas, nunca
   * apresenta «0,00 MT» como facto apurado.
   */
  semOrigensDeSaldo: boolean;
  buckets: Bucket[];
  /** R6.1: primeiro dia em que o saldo projectado cruza para negativo. */
  primeiroDiaNegativo: Date | null;
  menorSaldoProjetado: Prisma.Decimal;
  perfilAtraso: PerfilAtraso;
}

/**
 * Página de resultados por cursor (padrão da casa, `src/server/db/paginate.ts`).
 * Deliberadamente SEM `total` (task 5.1-quater): nenhum requisito nem o design
 * §2 o pedem, a listagem de compromissos navega por cursor (nunca por número
 * de página) e um `COUNT(*)` por pedido seria custo sem consumidor. Se um dia
 * a UI precisar de um total, ele entra aqui COM o contrato de quem o preenche
 * — nunca como campo opcional que ninguém sabe se vem.
 */
export interface PaginacaoTesouraria<T> {
  items: T[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Núcleo puro — assinaturas (implementação no projecao.service.ts, nó L2)
// ---------------------------------------------------------------------------
// Funções puras exportadas, testáveis sem base de dados: sem Prisma client,
// sem Date.now(). É onde vivem os invariantes I2, I3 e I5 — precedente de
// `montarLinhasBalancete` e `calcularLinhasDRE`.

/**
 * Expande um compromisso manual nas suas ocorrências dentro do horizonte
 * [dataPrevista, ate], respeitando `recorrencia` e `dataFimRecorrencia`.
 * UNICA produz no máximo uma ocorrência.
 * As ocorrências saem em ORDEM CRONOLÓGICA ASCENDENTE (task 5.1-quinquies):
 * os casos nomeados do §4.1-bis asserem listas ordenadas, e sem esta cláusula
 * uma reordenação futura parti-los-ia sem violar contrato nenhum.
 * Invariante I5 (idempotência): expandir duas vezes sobre o mesmo horizonte
 * produz exactamente o mesmo conjunto de ocorrências.
 */
export type ExpandirRecorrenciaFn = (
  compromisso: CompromissoBase,
  ate: Date,
) => Ocorrencia[];

/**
 * Constrói a sequência de buckets vazios (entradas/saídas a zero, sem
 * ocorrências) de `inicio` até `inicio + horizonteDias`, com fronteiras de dia
 * em Africa/Maputo (diaCivilEmMaputo). Horizonte zero produz um único bucket
 * do próprio dia (invariante I1).
 */
export type MontarBucketsFn = (
  inicio: Date,
  horizonteDias: number,
  granularidade: Granularidade,
) => Bucket[];

/**
 * Distribui as ocorrências pelos buckets, aplicando o cenário às ENTRADAS
 * (OTIMISTA: na data; BASE: + atraso médio; PESSIMISTA: + atraso médio + 1
 * desvio padrão, vencidas há > 90 dias excluídas). As SAÍDAS nunca se
 * deslocam (R5.5 — o fornecedor não atrasa o recebimento dele por simpatia).
 * Ocorrências vencidas entram no primeiro bucket, assinaladas (R2.4).
 * Invariante I3 (monotonia): saldo_PESSIMISTA ≤ saldo_BASE ≤ saldo_OTIMISTA.
 */
export type DistribuirCompromissosFn = (
  buckets: Bucket[],
  ocorrencias: Ocorrencia[],
  cenario: Cenario,
  atraso: PerfilAtraso,
) => Bucket[];

/**
 * Preenche `saldoInicial`/`saldoFinal` em cadeia a partir do saldo de
 * abertura. Invariante I2 (conservação), em aritmética Decimal exacta.
 */
export type AcumularSaldosFn = (
  buckets: Bucket[],
  saldoAbertura: Prisma.Decimal,
) => Bucket[];

/**
 * Re-marca a bandeira `vencida` contra a data de referência (R2.4, task
 * 3.2-bis). «Anterior» é ESTRITO: uma ocorrência no próprio dia da referência
 * NÃO é vencida — está por liquidar hoje, não em atraso. Marca ENTRADAS e
 * SAÍDAS por igual: a bandeira depende da data, não do tipo. Pura: devolve
 * ocorrências novas, sem mutar o array nem os objectos recebidos.
 *
 * Existe porque `expandirRecorrencia` devolve sempre `vencida: false` — a
 * assinatura pura não recebe data de referência; sem esta função a R2.4 só
 * seria falsificável no L4.
 */
export type MarcarVencidasFn = (
  ocorrencias: Ocorrencia[],
  dataReferencia: Date,
) => Ocorrencia[];

/**
 * Calcula o perfil de atraso a partir dos atrasos CRUS em dias
 * (dataPagamento − dataVencimento, possivelmente NEGATIVOS quando o cliente
 * pagou adiantado). O truncamento em zero é POR OBSERVAÇÃO, cá dentro —
 * `max(0, atraso)` em cada factura ANTES de média e desvio (ADR-0036 §10,
 * design §4.1-bis); receber os atrasos já truncados tornaria a regra
 * intestável. O desvio é AMOSTRAL (divisor `n − 1`); com `n < 2` o desvio é
 * ZERO, nunca `NaN`. Amostra vazia ⇒ média 0, σ 0, `amostraInsuficiente: true`;
 * `n < 20` ⇒ `amostraInsuficiente: true` (R5.3).
 */
export type CalcularPerfilAtrasoFn = (
  atrasosBrutosDias: number[],
) => PerfilAtraso;

// ---------------------------------------------------------------------------
// Interface do serviço de projecção (I/O — implementação nos nós L3–L5)
// ---------------------------------------------------------------------------

/**
 * IProjecaoService — contrato do serviço de projecção de tesouraria.
 *
 * Regras de negócio:
 *  - Saldo de abertura = Σ saldo do razão (filtro `FILTRO_LANCAMENTO_MAPA`)
 *    sobre os `contaContabilId` DISTINTOS das ContaBancaria activas (§2-bis:
 *    uma conta PGC entra se ≥ 1 bancária ancorada nela estiver activa, e
 *    entra uma vez, pelo saldo inteiro) + Σ (fundoInicial + totalEntradas −
 *    totalSaidas) das SessaoCaixa ABERTA. `ContaBancaria.saldoAtual` NUNCA
 *    se lê; `saldoContabilAte` NUNCA se delega (filtra só `LANCADO` — §2,
 *    issue #66).
 *  - Origens derivadas (ADR-0036 §Decisão-3): Fatura EMITIDA/PARCIALMENTE_PAGA/
 *    VENCIDA (total − totalPago) · ContaPagar ABERTA/PARCIALMENTE_PAGA/VENCIDA
 *    (valorRestante) · Payroll PROCESSADO (custoTotalEntidade, dataPagamento ??
 *    último dia útil do mês de referência em Africa/Maputo) · CompromissoTesouraria.
 *  - Nada se persiste: a projecção é recalculada a cada pedido.
 *  - Isolamento (I4): tenantId explícito em todos os findFirst/update/delete;
 *    cross-tenant devolve NotFoundError (404), nunca 403.
 *  - eliminarCompromisso é soft delete (deletedAt) — nunca DELETE físico.
 */
export interface IProjecaoService {
  projetarTesouraria(
    filtro: FiltroProjecaoInput,
    ctx: Ctx,
  ): Promise<ProjecaoTesouraria>;

  /**
   * Saldo de tesouraria até `data` (inclusive): agrega as partidas do razão
   * com `FILTRO_LANCAMENTO_MAPA` sobre os `contaContabilId` DISTINTOS das
   * contas bancárias activas (§2-bis) + sessões de caixa ABERTAS. NÃO delega
   * no `saldoContabilAte` — essa função filtra só `LANCADO` e, numa conta com
   * estornos, guarda a metade invertida (§2, issue #66). Responde «quanto
   * dinheiro há», não «quanto há a receber».
   */
  saldoTesourariaAte(data: Date, ctx: Ctx): Promise<Prisma.Decimal>;

  /**
   * Perfil de atraso de cobrança sobre facturas liquidadas nos 180 dias que
   * antecedem `dataReferencia` (R5.2-3). A data é parâmetro OBRIGATÓRIO (task
   * 5.0, fecha a 4.8): a projecção tem UM relógio só (design §4.1 passo 4) e
   * um `new Date()` por omissão dava um segundo relógio a qualquer chamador
   * esquecido — sem default, o esquecimento é erro de compilação.
   */
  perfilAtraso(ctx: Ctx, dataReferencia: Date): Promise<PerfilAtraso>;

  listarCompromissos(
    filtro: FiltroCompromissoInput,
    ctx: Ctx,
  ): Promise<PaginacaoTesouraria<CompromissoTesouraria>>;

  /**
   * Carrega um compromisso por id (task 5.1-ter — a rota `[id]/editar`
   * precisa dele; molde `ICaixaService.obterSessao(id, ctx)`). Ao contrário
   * do molde, NÃO devolve `null`: inexistente, eliminado (soft delete) ou de
   * outro tenant lançam `NotFoundError` (404) — o I4 exige o mesmo erro nos
   * três verbos, e um 403 confirmaria a existência do registo a quem não
   * devia saber dela.
   */
  obterCompromisso(id: string, ctx: Ctx): Promise<CompromissoTesouraria>;

  criarCompromisso(
    input: CriarCompromissoInput,
    ctx: Ctx,
  ): Promise<CompromissoTesouraria>;

  /**
   * Actualização parcial. A R3.4 é reimposta contra o registo EXISTENTE
   * (task 5.1-bis): o `superRefine` do Zod só vê o input, e mover só uma das
   * datas pode invalidar o par efectivo — `dataPrevista` para depois do
   * `dataFimRecorrencia` gravado, ou `dataFimRecorrencia` para antes da
   * `dataPrevista` gravada, ambos `ValidationError`. Idem `recorrencia`
   * UNICA efectiva com `dataFimRecorrencia` efectiva preenchida.
   */
  atualizarCompromisso(
    input: AtualizarCompromissoInput,
    ctx: Ctx,
  ): Promise<CompromissoTesouraria>;

  /** Soft delete (deletedAt = now); devolve o registo marcado. */
  eliminarCompromisso(id: string, ctx: Ctx): Promise<CompromissoTesouraria>;
}
