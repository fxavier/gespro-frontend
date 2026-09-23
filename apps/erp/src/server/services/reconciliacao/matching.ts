import 'server-only';
import { Prisma } from '@prisma/client';
import {
  distanciaDias,
  nucleoNumerico,
  normalizarReferencia,
  type EstadoMovimento,
  type Natureza,
} from './reconciliacao.model';

// ---------------------------------------------------------------------------
// Motor de correspondência (ADR-0038 §5, nó MATCHING) — núcleo PURO.
// Recebe os candidatos que o serviço recuperou por índice e decide os pares.
// Dentro do lote, a procura também é por chave (mapa por referência, por núcleo
// numérico, faixa de valor por natureza) — nunca produto cartesiano (RF §19).
// ---------------------------------------------------------------------------

export type RegraAutomatica =
  | 'REFERENCIA_EXACTA'
  | 'REFERENCIA_NORMALIZADA'
  | 'DOCUMENTO'
  | 'VALOR_NATUREZA_DATA'
  | 'VALOR_TOLERANCIA'
  | 'DESCRICAO';

export type TipoCorrespondencia = 'EXACTO' | 'DIFERENCA_TEMPORAL' | 'TOLERANCIA_VALOR';

/** Ordem de declaração do enum `RegraCorrespondencia` = prioridade da RF §6. */
export const PASSAGENS: readonly RegraAutomatica[] = [
  'REFERENCIA_EXACTA',
  'REFERENCIA_NORMALIZADA',
  'DOCUMENTO',
  'VALOR_NATUREZA_DATA',
  'VALOR_TOLERANCIA',
  'DESCRICAO',
];

/** Estados em que um movimento ainda pode ser correspondido pelo motor. */
export const ESTADOS_LIVRES: readonly EstadoMovimento[] = [
  'PENDENTE',
  'EM_TRANSITO',
  'BANCO_SEM_CONTABILIZACAO',
  'CONTABILIDADE_SEM_BANCO',
];

export interface MovimentoParaMatch {
  id: string;
  /** dataMovimento (banco) ou dataContabilistica (contabilidade). */
  data: Date;
  valor: Prisma.Decimal;
  natureza: Natureza;
  referencia: string | null;
  referenciaNormalizada: string | null;
  descricao: string;
  /** Só existe no lado contabilístico. */
  documento: string | null;
  estado: EstadoMovimento;
}

export interface ConfiguracaoMatching {
  toleranciaDias: number;
  toleranciaValor: Prisma.Decimal;
  permitirMatchPorReferencia: boolean;
  permitirMatchPorValor: boolean;
  permitirMatchPorDescricao: boolean;
}

export interface Proposta {
  bancoId: string;
  contabilisticoId: string;
  regra: RegraAutomatica;
  tipo: TipoCorrespondencia;
  /** 0–100. */
  confianca: number;
  /** valorBanco − valorContabilistico. */
  diferencaValor: Prisma.Decimal;
  diferencaDias: number;
  /** Havia outro candidato igualmente bom — o motor escolheu por id. */
  ambigua: boolean;
}

// ponytail: pesos inventados (ADR-0038 §Riscos c) — afinar quando houver dados reais.
const CONFIANCA_BASE: Record<RegraAutomatica, number> = {
  REFERENCIA_EXACTA: 100,
  REFERENCIA_NORMALIZADA: 95,
  DOCUMENTO: 90,
  VALOR_NATUREZA_DATA: 85,
  VALOR_TOLERANCIA: 75,
  DESCRICAO: 60,
};
const PENALIZACAO_POR_DIA = 2;
const PENALIZACAO_AMBIGUIDADE = 25;
const SIMILARIDADE_MINIMA_DESCRICAO = 0.5;

const LIVRES = new Set<EstadoMovimento>(ESTADOS_LIVRES);

export function regraLigada(regra: RegraAutomatica, cfg: ConfiguracaoMatching): boolean {
  if (regra === 'DESCRICAO') return cfg.permitirMatchPorDescricao;
  if (regra === 'VALOR_NATUREZA_DATA' || regra === 'VALOR_TOLERANCIA') return cfg.permitirMatchPorValor;
  return cfg.permitirMatchPorReferencia;
}

function palavras(texto: string): Set<string> {
  return new Set(
    texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter((p) => p.length >= 3),
  );
}

/** Jaccard entre os conjuntos de palavras (≥ 3 caracteres) das duas descrições. */
export function similaridadeDescricao(a: string, b: string): number {
  const pa = palavras(a);
  const pb = palavras(b);
  if (pa.size === 0 || pb.size === 0) return 0;
  let comuns = 0;
  for (const p of pa) if (pb.has(p)) comuns++;
  return comuns / (pa.size + pb.size - comuns);
}

/**
 * A regra casa este par? Devolve as diferenças, ou `null`. Comum a todas as
 * regras: ambos livres, mesma natureza, datas dentro da tolerância (RF §8).
 * Só REFERENCIA_EXACTA aceita valores diferentes — é identidade forte e o
 * desfecho é DIFERENCA_VALOR; as regras mais fracas exigem o valor na tolerância.
 */
export function avaliar(
  regra: RegraAutomatica,
  banco: MovimentoParaMatch,
  contab: MovimentoParaMatch,
  cfg: ConfiguracaoMatching,
): { diferencaValor: Prisma.Decimal; diferencaDias: number } | null {
  if (!regraLigada(regra, cfg)) return null;
  if (!LIVRES.has(banco.estado) || !LIVRES.has(contab.estado)) return null;
  if (banco.natureza !== contab.natureza) return null;
  const diferencaDias = distanciaDias(banco.data, contab.data);
  if (diferencaDias > cfg.toleranciaDias) return null;
  const diferencaValor = banco.valor.minus(contab.valor);
  const naTolerancia = diferencaValor.abs().lte(cfg.toleranciaValor);

  let casa: boolean;
  switch (regra) {
    case 'REFERENCIA_EXACTA':
      casa = banco.referenciaNormalizada !== null && banco.referenciaNormalizada === contab.referenciaNormalizada;
      break;
    case 'REFERENCIA_NORMALIZADA': {
      const n = nucleoNumerico(banco.referencia);
      casa = naTolerancia && n !== null && n === nucleoNumerico(contab.referencia);
      break;
    }
    case 'DOCUMENTO': {
      const doc = normalizarReferencia(contab.documento);
      casa =
        naTolerancia &&
        doc !== null &&
        doc.length >= 4 &&
        ((normalizarReferencia(banco.referencia) ?? '').includes(doc) ||
          (normalizarReferencia(banco.descricao) ?? '').includes(doc));
      break;
    }
    case 'VALOR_NATUREZA_DATA':
      casa = diferencaValor.isZero();
      break;
    case 'VALOR_TOLERANCIA':
      casa = !diferencaValor.isZero() && naTolerancia;
      break;
    case 'DESCRICAO':
      casa = naTolerancia && similaridadeDescricao(banco.descricao, contab.descricao) >= SIMILARIDADE_MINIMA_DESCRICAO;
      break;
  }
  return casa ? { diferencaValor, diferencaDias } : null;
}

function tipoDe(diferencaValor: Prisma.Decimal, diferencaDias: number): TipoCorrespondencia {
  if (!diferencaValor.isZero()) return 'TOLERANCIA_VALOR';
  return diferencaDias > 0 ? 'DIFERENCA_TEMPORAL' : 'EXACTO';
}

export function confiancaDe(regra: RegraAutomatica, diferencaDias: number, ambigua: boolean): number {
  const c = CONFIANCA_BASE[regra] - PENALIZACAO_POR_DIA * diferencaDias - (ambigua ? PENALIZACAO_AMBIGUIDADE : 0);
  return Math.max(0, Math.min(100, c));
}

// --- índices em memória sobre o lote contabilístico -------------------------

function agrupar<K>(itens: MovimentoParaMatch[], chave: (m: MovimentoParaMatch) => K | null) {
  const mapa = new Map<K, MovimentoParaMatch[]>();
  for (const m of itens) {
    const k = chave(m);
    if (k === null) continue;
    const lista = mapa.get(k);
    if (lista) lista.push(m);
    else mapa.set(k, [m]);
  }
  return mapa;
}

/** Movimentos da natureza dada com valor em [v − tol, v + tol], por pesquisa binária. */
function faixa(ordenados: MovimentoParaMatch[], valor: Prisma.Decimal, tol: Prisma.Decimal) {
  const min = valor.minus(tol);
  const max = valor.plus(tol);
  let lo = 0;
  let hi = ordenados.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ordenados[mid].valor.lt(min)) lo = mid + 1;
    else hi = mid;
  }
  const out: MovimentoParaMatch[] = [];
  for (let i = lo; i < ordenados.length && ordenados[i].valor.lte(max); i++) out.push(ordenados[i]);
  return out;
}

const porId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Pipeline de passagens, greedy e determinístico: em cada passagem, cada
 * bancário livre (por data, id) fica com o melhor candidato livre — menos dias,
 * depois menor |diferença|, depois id. Um movimento entra no máximo numa
 * proposta (RF §14). Agregação N:1/1:N NÃO é feita aqui (ver handoff).
 */
export function emparelhar(
  bancos: MovimentoParaMatch[],
  contabs: MovimentoParaMatch[],
  cfg: ConfiguracaoMatching,
  passagens: readonly RegraAutomatica[] = PASSAGENS,
): Proposta[] {
  const livresContab = contabs.filter((c) => LIVRES.has(c.estado)).sort(porId);
  const porRef = agrupar(livresContab, (c) => c.referenciaNormalizada);
  const porNucleo = agrupar(livresContab, (c) => nucleoNumerico(c.referencia));
  const porNatureza = agrupar(livresContab, (c) => c.natureza);
  for (const lista of porNatureza.values()) lista.sort((a, b) => a.valor.comparedTo(b.valor) || porId(a, b));

  const filaBanco = bancos
    .filter((b) => LIVRES.has(b.estado))
    .sort((a, b) => a.data.getTime() - b.data.getTime() || porId(a, b));

  const usadosBanco = new Set<string>();
  const usadosContab = new Set<string>();
  const propostas: Proposta[] = [];
  const zero = new Prisma.Decimal(0);

  for (const regra of passagens) {
    if (!regraLigada(regra, cfg)) continue;
    for (const b of filaBanco) {
      if (usadosBanco.has(b.id)) continue;
      let candidatos: MovimentoParaMatch[];
      if (regra === 'REFERENCIA_EXACTA') {
        candidatos = b.referenciaNormalizada ? (porRef.get(b.referenciaNormalizada) ?? []) : [];
      } else if (regra === 'REFERENCIA_NORMALIZADA') {
        const n = nucleoNumerico(b.referencia);
        candidatos = n ? (porNucleo.get(n) ?? []) : [];
      } else {
        const tol = regra === 'VALOR_NATUREZA_DATA' ? zero : cfg.toleranciaValor;
        candidatos = faixa(porNatureza.get(b.natureza) ?? [], b.valor, tol);
      }

      const avaliados = candidatos
        .filter((c) => !usadosContab.has(c.id))
        .map((c) => ({ c, r: avaliar(regra, b, c, cfg) }))
        .filter((x): x is { c: MovimentoParaMatch; r: NonNullable<typeof x.r> } => x.r !== null)
        .sort(
          (x, y) =>
            x.r.diferencaDias - y.r.diferencaDias ||
            x.r.diferencaValor.abs().comparedTo(y.r.diferencaValor.abs()) ||
            porId(x.c, y.c),
        );
      if (avaliados.length === 0) continue;

      const [melhor, segundo] = avaliados;
      const ambigua =
        segundo !== undefined &&
        segundo.r.diferencaDias === melhor.r.diferencaDias &&
        segundo.r.diferencaValor.abs().equals(melhor.r.diferencaValor.abs());

      usadosBanco.add(b.id);
      usadosContab.add(melhor.c.id);
      propostas.push({
        bancoId: b.id,
        contabilisticoId: melhor.c.id,
        regra,
        tipo: tipoDe(melhor.r.diferencaValor, melhor.r.diferencaDias),
        confianca: confiancaDe(regra, melhor.r.diferencaDias, ambigua),
        diferencaValor: melhor.r.diferencaValor,
        diferencaDias: melhor.r.diferencaDias,
        ambigua,
      });
    }
  }
  return propostas;
}

export interface ContaParaDesfecho {
  autoReconciliacao: boolean;
  limiarConfianca: number;
  toleranciaValor: Prisma.Decimal;
}

/**
 * O que a proposta faz ao estado dos movimentos:
 * - diferença de valor acima da tolerância → nunca confirma; ambos DIFERENCA_VALOR;
 * - `autoReconciliacao` e confiança ≥ limiar → confirma; ambos RECONCILIADO;
 * - caso contrário → sugestão gravada, estado intacto (opção (a) do nó MATCHING).
 */
export function decidirDesfecho(
  p: Pick<Proposta, 'confianca' | 'diferencaValor'>,
  conta: ContaParaDesfecho,
): { confirmar: boolean; estadoAlvo: EstadoMovimento | null } {
  if (p.diferencaValor.abs().gt(conta.toleranciaValor)) {
    return { confirmar: false, estadoAlvo: 'DIFERENCA_VALOR' };
  }
  if (conta.autoReconciliacao && p.confianca >= conta.limiarConfianca) {
    return { confirmar: true, estadoAlvo: 'RECONCILIADO' };
  }
  return { confirmar: false, estadoAlvo: null };
}
