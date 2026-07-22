/**
 * Dataset tipado para exportação transversal (CSV/XLSX/PDF).
 *
 * Camada G/plataforma — reutilizável por qualquer domínio. Puro e testável
 * (sem I/O, sem `server-only`). Os geradores (`csv.ts`, `xlsx.ts`) e o motor de
 * documentos consomem este formato.
 *
 * Regra de ouro (CLAUDE.md §Dinheiro e documentos): `Prisma.Decimal` é
 * serializado para `string` SEM perda de precisão — nunca convertido para
 * `Float`. `serializeCell` produz a forma canónica lossless (ponto decimal,
 * ISO-8601) para interoperabilidade; `displayCell` produz a forma pt-PT/MZN
 * para leitura humana em PDF.
 */

export type ColumnType =
  | 'text'
  | 'integer'
  | 'decimal'
  | 'currency'
  | 'date'
  | 'datetime'
  | 'boolean';

export interface Column {
  /** Chave na linha (`Row`). */
  key: string;
  /** Cabeçalho em Português (pt-PT). */
  header: string;
  /** Tipo de célula — controla serialização/formatação. Default: `text`. */
  type?: ColumnType;
}

/** Um `Decimal` do Prisma expõe `toString()` lossless — aceitamos por duck-typing. */
export interface DecimalLike {
  toString(): string;
}

export type CellValue = string | number | boolean | Date | DecimalLike | null | undefined;

export type Row = Record<string, CellValue>;

export interface Dataset {
  /** Nome base do ficheiro e da folha (sem extensão). */
  nome: string;
  colunas: Column[];
  linhas: Row[];
  /** Metadados opcionais (cabeçalho de relatório). */
  meta?: Array<[string, string]>;
}

// ---------------------------------------------------------------------------
// Serialização canónica (lossless) — usada por CSV e XLSX
// ---------------------------------------------------------------------------

function isDate(v: unknown): v is Date {
  return v instanceof Date && !Number.isNaN(v.getTime());
}

/**
 * Forma canónica lossless para interoperabilidade de dados.
 * - `decimal`/`currency`: `String(value)` — preserva TODAS as casas do
 *   `Prisma.Decimal` (ex.: "1234.56", "0.160000"). Nunca `Number()`.
 * - `date`: `AAAA-MM-DD`; `datetime`: ISO-8601.
 * - `boolean`: `Sim`/`Não`.
 */
export function serializeCell(value: CellValue, type: ColumnType = 'text'): string {
  if (value === null || value === undefined) return '';

  switch (type) {
    case 'decimal':
    case 'currency':
      // Duck-typing do Decimal: toString() é lossless; evita perda por Float.
      return typeof value === 'number' ? String(value) : String(value.toString());
    case 'integer':
      return String(typeof value === 'number' ? Math.trunc(value) : value.toString());
    case 'date':
      return isDate(value) ? value.toISOString().slice(0, 10) : String(value);
    case 'datetime':
      return isDate(value) ? value.toISOString() : String(value);
    case 'boolean':
      return value ? 'Sim' : 'Não';
    default:
      return String(value);
  }
}

// ---------------------------------------------------------------------------
// Formatação pt-PT / MZN — usada por documentos PDF (leitura humana)
// ---------------------------------------------------------------------------

const nf2 = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nfInt = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 });

/** Converte um Decimal/valor para número apenas para EXIBIÇÃO (nunca para cálculo). */
function toNumber(value: CellValue): number {
  if (value === null || value === undefined) return 0;
  return typeof value === 'number' ? value : Number(value.toString());
}

export function displayCell(value: CellValue, type: ColumnType = 'text'): string {
  if (value === null || value === undefined) return '—';

  switch (type) {
    case 'currency':
      return `MT ${nf2.format(toNumber(value))}`;
    case 'decimal':
      return nf2.format(toNumber(value));
    case 'integer':
      return nfInt.format(toNumber(value));
    case 'date':
      return isDate(value) ? value.toLocaleDateString('pt-PT') : String(value);
    case 'datetime':
      return isDate(value) ? value.toLocaleString('pt-PT') : String(value);
    case 'boolean':
      return value ? 'Sim' : 'Não';
    default:
      return String(value);
  }
}

/** Nome de ficheiro seguro (sem acentos/espaços/caracteres inválidos). */
export function safeFilename(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}
