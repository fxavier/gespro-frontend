/**
 * Modelo de documento fiscal — Factura MZ (puro, testável, sem react-pdf).
 *
 * Fonte: skill `fiscalidade-mz` + Código do IVA de Moçambique. O documento
 * REFLECTE os valores persistidos da factura emitida (append-only, CLAUDE.md
 * §Dinheiro e documentos) — NUNCA recalcula totais. O agrupamento por taxa de
 * IVA é apenas uma re-apresentação dos valores JÁ emitidos por linha.
 *
 * `DecimalLike` aceita tanto `Prisma.Decimal` (runtime) como `string`
 * (fixtures de teste) — sempre serializado lossless via `toString()`.
 */
import { type DecimalLike, displayCell, serializeCell } from '@/lib/reporting/dataset';

// ---------------------------------------------------------------------------
// Entradas (estruturais — não importam módulos server-only)
// ---------------------------------------------------------------------------

export interface EmitenteInput {
  nome: string;
  nuit: string;
  endereco?: string | null;
  cidade?: string | null;
  provincia?: string | null;
  telefone?: string | null;
  email?: string | null;
  /** Regime de IVA (ex.: NORMAL, ISENCAO). */
  regimeIva?: string | null;
}

export interface AdquirenteInput {
  nome: string;
  nuit: string;
  endereco?: string | null;
  cidade?: string | null;
}

export interface LinhaDocumentoInput {
  descricao: string;
  quantidade: DecimalLike;
  precoUnitario: DecimalLike;
  desconto: DecimalLike;
  /** Taxa de IVA como FRACÇÃO (ex.: 0.16). ADR-0003 §4. */
  taxaIva: DecimalLike;
  subtotal: DecimalLike;
  ivaItem: DecimalLike;
  total: DecimalLike;
}

export interface FaturaInput {
  numero: string;
  serieTipo: string;
  moeda: string;
  dataEmissao: Date;
  dataVencimento?: Date | null;
  subtotal: DecimalLike;
  ivaTotal: DecimalLike;
  total: DecimalLike;
  totalPago?: DecimalLike | null;
  observacoes?: string | null;
  linhas: LinhaDocumentoInput[];
}

// ---------------------------------------------------------------------------
// Saída — modelo de documento pronto a renderizar
// ---------------------------------------------------------------------------

export interface LinhaDocumentoModel {
  descricao: string;
  quantidade: string;
  precoUnitario: string;
  desconto: string;
  taxaIvaPercent: string;
  incidencia: string;
  iva: string;
  total: string;
}

export interface ResumoIva {
  /** Percentagem formatada (ex.: "16%"). */
  taxaPercent: string;
  incidencia: string;
  iva: string;
}

export interface DocumentoFiscalModel {
  designacao: string;
  numero: string;
  moeda: string;
  dataEmissao: string;
  dataVencimento: string | null;
  emitente: {
    nome: string;
    nuit: string;
    morada: string | null;
    contacto: string | null;
    regimeIva: string;
  };
  adquirente: {
    nome: string;
    nuit: string;
    morada: string | null;
  };
  linhas: LinhaDocumentoModel[];
  resumoIva: ResumoIva[];
  totais: {
    /** Base tributável / incidência total (reflectida). */
    subtotal: string;
    ivaTotal: string;
    total: string;
    totalPago: string | null;
  };
  /** Menções legais obrigatórias (MZ). */
  mencoesLegais: string[];
  observacoes: string | null;
}

// ---------------------------------------------------------------------------
// Designação por tipo de série
// ---------------------------------------------------------------------------

const DESIGNACAO: Record<string, string> = {
  FATURA: 'Factura',
  RECIBO: 'Recibo',
  NOTA_CREDITO: 'Nota de Crédito',
  NOTA_DEBITO: 'Nota de Débito',
  PROFORMA: 'Factura Pró-forma',
  COTACAO_COMERCIAL: 'Cotação',
};

function fracaoParaPercent(taxa: DecimalLike): string {
  const n = Number(taxa.toString());
  // Fracção (0.16) → 16 %; se já vier em percentagem (16) mantém.
  const pct = n <= 1 ? n * 100 : n;
  // Sem casas decimais desnecessárias.
  const s = Number.isInteger(pct) ? String(pct) : pct.toFixed(2).replace(/\.?0+$/, '');
  return `${s}%`;
}

function morada(e: { endereco?: string | null; cidade?: string | null; provincia?: string | null }): string | null {
  const partes = [e.endereco, e.cidade, e.provincia].filter((p): p is string => !!p && p.trim().length > 0);
  return partes.length > 0 ? partes.join(', ') : null;
}

/**
 * Constrói o modelo de documento fiscal a partir dos valores EMITIDOS.
 * Pure function — sem I/O. Reflecte, nunca recalcula.
 */
export function construirDocumentoFatura(
  fatura: FaturaInput,
  emitente: EmitenteInput,
  adquirente: AdquirenteInput,
): DocumentoFiscalModel {
  const designacao = DESIGNACAO[fatura.serieTipo] ?? 'Documento';

  const linhas: LinhaDocumentoModel[] = fatura.linhas.map((l) => ({
    descricao: l.descricao,
    quantidade: displayCell(l.quantidade, 'decimal'),
    precoUnitario: displayCell(l.precoUnitario, 'decimal'),
    desconto: displayCell(l.desconto, 'decimal'),
    taxaIvaPercent: fracaoParaPercent(l.taxaIva),
    incidencia: displayCell(l.subtotal, 'decimal'),
    iva: displayCell(l.ivaItem, 'decimal'),
    total: displayCell(l.total, 'decimal'),
  }));

  // Resumo por taxa — soma dos valores PERSISTIDOS por linha (re-apresentação).
  const porTaxa = new Map<string, { incidencia: number; iva: number }>();
  for (const l of fatura.linhas) {
    const chave = fracaoParaPercent(l.taxaIva);
    const acc = porTaxa.get(chave) ?? { incidencia: 0, iva: 0 };
    acc.incidencia += Number(l.subtotal.toString());
    acc.iva += Number(l.ivaItem.toString());
    porTaxa.set(chave, acc);
  }
  const resumoIva: ResumoIva[] = [...porTaxa.entries()].map(([taxaPercent, v]) => ({
    taxaPercent,
    incidencia: displayCell(v.incidencia, 'decimal'),
    iva: displayCell(v.iva, 'decimal'),
  }));

  const regime = emitente.regimeIva ?? 'NORMAL';
  const mencoesLegais = construirMencoesLegais(regime, fatura.linhas);

  return {
    designacao,
    numero: fatura.numero,
    moeda: fatura.moeda,
    dataEmissao: displayCell(fatura.dataEmissao, 'date'),
    dataVencimento: fatura.dataVencimento ? displayCell(fatura.dataVencimento, 'date') : null,
    emitente: {
      nome: emitente.nome,
      nuit: emitente.nuit,
      morada: morada(emitente),
      contacto: [emitente.telefone, emitente.email].filter(Boolean).join(' · ') || null,
      regimeIva: regime,
    },
    adquirente: {
      nome: adquirente.nome,
      nuit: adquirente.nuit,
      morada: morada(adquirente),
    },
    linhas,
    resumoIva,
    totais: {
      // Valores REFLECTIDOS (append-only) — nunca recalculados.
      subtotal: displayCell(fatura.subtotal, 'decimal'),
      ivaTotal: displayCell(fatura.ivaTotal, 'decimal'),
      total: displayCell(fatura.total, 'decimal'),
      totalPago: fatura.totalPago != null ? displayCell(fatura.totalPago, 'decimal') : null,
    },
    mencoesLegais,
    observacoes: fatura.observacoes ?? null,
  };
}

/** Menções legais obrigatórias em documentos fiscais moçambicanos. */
export function construirMencoesLegais(regime: string, linhas: LinhaDocumentoInput[]): string[] {
  const taxas = new Set(linhas.map((l) => fracaoParaPercent(l.taxaIva)));
  const mencoes: string[] = [];

  if (regime === 'ISENCAO' || [...taxas].every((t) => t === '0%')) {
    mencoes.push('Isento de IVA nos termos do Código do IVA.');
  } else {
    mencoes.push(`IVA incluído às taxas indicadas (${[...taxas].join(', ')}).`);
  }
  mencoes.push('Documento processado por programa informático.');
  mencoes.push('Documento emitido nos termos do Código do IVA (Moçambique).');
  return mencoes;
}

/** Serialização canónica (para hash/validação determinística e testes). */
export function serializarDocumentoParaHash(fatura: FaturaInput): string {
  return [
    fatura.numero,
    serializeCell(fatura.total, 'decimal'),
    serializeCell(fatura.ivaTotal, 'decimal'),
    serializeCell(fatura.subtotal, 'decimal'),
    serializeCell(fatura.dataEmissao, 'datetime'),
  ].join('|');
}
