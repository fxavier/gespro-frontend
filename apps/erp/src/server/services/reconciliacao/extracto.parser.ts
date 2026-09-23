import 'server-only';
import ExcelJS from 'exceljs';
import { Prisma } from '@prisma/client';
import { BusinessRuleError } from '@/lib/errors';
import { normalizarReferencia, type Natureza } from './reconciliacao.model';

// ---------------------------------------------------------------------------
// Leitura de extractos bancários no SERVIDOR (ADR-0038, nó IMPORT, RF §4/§5).
// Cada formato só sabe transformar bytes numa grelha de texto; a interpretação
// (colunas, datas, dinheiro, natureza) é uma só — `interpretarGrelha` — para que
// a mesma linha dê o mesmo movimento, e a mesma chave de idempotência, venha ela
// de CSV ou de XLSX. MT940/CAMT.053 entram como mais um `ParserExtrato`.
// ---------------------------------------------------------------------------

export interface ParserExtrato {
  origem: 'CSV' | 'XLSX';
  /** Bytes do ficheiro → grelha de texto. A linha i da grelha é a linha i+1 do ficheiro. */
  ler(conteudo: Uint8Array): Promise<string[][]>;
}

export interface LinhaExtracto {
  /** Número da linha no ficheiro (1-based, conta o cabeçalho). */
  linha: number;
  /** Dia civil ao meio-dia local — nunca meia-noite, que muda de dia com o fuso. */
  dataMovimento: Date;
  dataValor: Date | null;
  referencia: string | null;
  descricao: string;
  /** Sempre positivo; o sentido vive em `natureza` (DEBITO = entrada). */
  valor: Prisma.Decimal;
  natureza: Natureza;
  saldoAposMovimento: Prisma.Decimal | null;
}

export interface ErroLinhaExtracto {
  linha: number;
  mensagem: string;
}

export interface ResultadoLeitura {
  linhas: LinhaExtracto[];
  erros: ErroLinhaExtracto[];
}

// --- CSV --------------------------------------------------------------------

function descodificar(bytes: Uint8Array): string {
  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // Muitos bancos ainda exportam em Windows-1252.
    texto = new TextDecoder('windows-1252').decode(bytes);
  }
  return texto.replace(/^\uFEFF/, '');
}

/** Divide uma linha CSV respeitando aspas (`"a;b"` e `""` como aspa literal). */
function dividir(linha: string, sep: string): string[] {
  const out: string[] = [];
  let atual = '';
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') { atual += '"'; i++; }
      else if (c === '"') aspas = false;
      else atual += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { out.push(atual); atual = ''; }
    else atual += c;
  }
  out.push(atual);
  return out;
}

// ponytail: sem campos com quebra de linha dentro de aspas — nenhum extracto visto os usa.
export const parserCsv: ParserExtrato = {
  origem: 'CSV',
  async ler(conteudo) {
    const linhas = descodificar(conteudo).split(/\r?\n/);
    const cabecalho = linhas.find((l) => l.trim().length > 0) ?? '';
    const sep = [';', '\t', ','].reduce((a, b) => (cabecalho.split(b).length > cabecalho.split(a).length ? b : a));
    return linhas.map((l) => (l.trim().length > 0 ? dividir(l, sep) : []));
  },
};

// --- XLSX -------------------------------------------------------------------

const doisDigitos = (n: number) => String(n).padStart(2, '0');

function textoDaCelula(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  // O Excel guarda datas sem fuso; o exceljs devolve-as como meia-noite UTC.
  if (v instanceof Date) return `${v.getUTCFullYear()}-${doisDigitos(v.getUTCMonth() + 1)}-${doisDigitos(v.getUTCDate())}`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (typeof v === 'string') return v;
  if ('richText' in v) return v.richText.map((t) => t.text).join('');
  if ('result' in v) return textoDaCelula(v.result as ExcelJS.CellValue);
  if ('text' in v) return String(v.text);
  return '';
}

export const parserXlsx: ParserExtrato = {
  origem: 'XLSX',
  async ler(conteudo) {
    const wb = new ExcelJS.Workbook();
    // O tipo do exceljs ainda declara o Buffer antigo; os bytes são os mesmos.
    await wb.xlsx.load(Buffer.from(conteudo) as unknown as ExcelJS.Buffer);
    const ws = wb.worksheets[0];
    const grelha: string[][] = [];
    ws?.eachRow({ includeEmpty: false }, (row, numero) => {
      const valores = row.values as ExcelJS.CellValue[]; // 1-based
      grelha[numero - 1] = valores.slice(1).map(textoDaCelula);
    });
    return Array.from(grelha, (l) => l ?? []);
  },
};

export function parserPara(nomeFicheiro: string): ParserExtrato {
  const ext = nomeFicheiro.toLowerCase().split('.').pop();
  if (ext === 'csv' || ext === 'txt') return parserCsv;
  if (ext === 'xlsx') return parserXlsx;
  throw new BusinessRuleError('FORMATO_EXTRACTO_NAO_SUPORTADO', `Formato de extracto não suportado: .${ext}. Use CSV ou XLSX.`);
}

// --- Interpretação ----------------------------------------------------------

const COLUNAS = {
  data: ['data', 'datamovimento', 'datalancamento', 'dataoperacao'],
  dataValor: ['datavalor', 'valordata'],
  referencia: ['referencia', 'ref', 'numerooperacao'],
  descricao: ['descricao', 'descritivo', 'movimento'],
  valor: ['valor', 'montante', 'importancia'],
  tipo: ['tipo', 'natureza', 'dc'],
  saldo: ['saldo', 'saldoaposmovimento', 'saldocontabilistico'],
} as const;
const OBRIGATORIAS = ['data', 'descricao', 'valor'] as const;
/** Tecto de movimentos por ficheiro — um extracto mensal real tem centenas. */
export const MAXIMO_LINHAS = 50_000;

const chave = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function lerData(raw: string): Date | null {
  const s = raw.trim();
  let a: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (r) [a, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) [a, m, d] = [+r[3], +r[2], +r[1]];
  else return null;
  // Meio-dia local: o dia civil sobrevive a qualquer fuso de ±11h (regra do CLAUDE.md).
  const data = new Date(a, m - 1, d, 12);
  return data.getFullYear() === a && data.getMonth() === m - 1 && data.getDate() === d ? data : null;
}

/**
 * Texto de montante → Decimal com no máximo 2 casas. Aceita `1.234,56`,
 * `1,234.56`, `1234.56`, `1234,56`, `-500`: o ÚLTIMO de `.`/`,` é o separador
 * decimal quando os dois aparecem; um só `.` com 3 dígitos a seguir é ambíguo
 * e recusa-se (seria 1234 ou 1,234?).
 */
function lerMontante(raw: string): Prisma.Decimal | null {
  let s = raw.trim().replace(/[\s\u00A0]/g, '').replace(/(MZN|MT)$/i, '');
  if (!s) return null;
  const virgula = s.lastIndexOf(',');
  const ponto = s.lastIndexOf('.');
  if (virgula >= 0 && ponto >= 0) {
    s = virgula > ponto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (virgula >= 0) {
    s = s.split(',').length > 2 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (s.split('.').length > 2) {
    s = s.replace(/\./g, '');
  }
  return /^[+-]?\d+(\.\d{1,2})?$/.test(s) ? new Prisma.Decimal(s) : null;
}

function lerTipo(raw: string): Natureza | null {
  const s = chave(raw);
  if (s === 'd' || s === 'debito' || s === 'db' || s === 'entrada') return 'DEBITO';
  if (s === 'c' || s === 'credito' || s === 'cr' || s === 'saida') return 'CREDITO';
  return null;
}

/**
 * Grelha de texto → movimentos. NUNCA decide sozinha o destino do ficheiro:
 * devolve linhas E erros, e o serviço aplica o all-or-nothing (RF §19).
 * Todos os erros de todas as linhas vêm de uma vez — um de cada vez obrigaria
 * o utilizador a N voltas.
 */
export function interpretarGrelha(grelha: string[][]): ResultadoLeitura {
  const iCab = grelha.findIndex((l) => l.some((c) => c.trim().length > 0));
  if (iCab < 0) return { linhas: [], erros: [{ linha: 1, mensagem: 'Ficheiro vazio' }] };

  const cab = grelha[iCab].map(chave);
  const col = Object.fromEntries(
    Object.entries(COLUNAS).map(([k, nomes]) => [k, cab.findIndex((c) => (nomes as readonly string[]).includes(c))]),
  ) as Record<keyof typeof COLUNAS, number>;
  const emFalta = OBRIGATORIAS.filter((k) => col[k] < 0);
  if (emFalta.length > 0) {
    return { linhas: [], erros: [{ linha: iCab + 1, mensagem: `Colunas em falta no cabeçalho: ${emFalta.join(', ')}` }] };
  }

  const linhas: LinhaExtracto[] = [];
  const erros: ErroLinhaExtracto[] = [];
  const referencias = new Set<string>();
  const celula = (l: string[], k: keyof typeof COLUNAS) => (col[k] >= 0 ? (l[col[k]] ?? '').trim() : '');

  for (let i = iCab + 1; i < grelha.length; i++) {
    const l = grelha[i];
    if (!l.some((c) => c.trim().length > 0)) continue;
    const problemas: string[] = [];

    const dataRaw = celula(l, 'data');
    const dataMovimento = lerData(dataRaw);
    if (!dataMovimento) problemas.push(`data inválida (${dataRaw || 'vazia'})`);

    const dataValorRaw = celula(l, 'dataValor');
    const dataValor = dataValorRaw ? lerData(dataValorRaw) : null;
    if (dataValorRaw && !dataValor) problemas.push(`data-valor inválida (${dataValorRaw})`);

    const descricao = celula(l, 'descricao');
    if (!descricao) problemas.push('descrição vazia');

    const referencia = celula(l, 'referencia') || null;
    // Duas linhas cuja referência NORMALIZADA coincide (`TRF-458` e `TRF.458`)
    // colapsariam na mesma chave de idempotência e uma desapareceria sem erro
    // nenhum. Compara-se o que a chave compara. Conta mesmo que a primeira
    // ocorrência tenha outros erros.
    const refChave = normalizarReferencia(referencia);
    if (refChave) {
      if (referencias.has(refChave)) problemas.push(`referência repetida no ficheiro (${referencia})`);
      referencias.add(refChave);
    }

    const valorRaw = celula(l, 'valor');
    const montante = lerMontante(valorRaw);
    let natureza: Natureza | null = null;
    if (!montante || montante.isZero()) {
      problemas.push(`valor inválido (${valorRaw || 'vazio'})`);
    } else if (col.tipo >= 0) {
      natureza = lerTipo(celula(l, 'tipo'));
      if (!natureza) problemas.push(`tipo inválido (${celula(l, 'tipo') || 'vazio'} — esperado D/C, DÉBITO/CRÉDITO)`);
      if (montante.isNegative()) problemas.push(`valor negativo com coluna de tipo (${valorRaw})`);
    } else {
      // Sem coluna de tipo, o sinal manda: positivo entra na conta (DEBITO), negativo sai.
      natureza = montante.isNegative() ? 'CREDITO' : 'DEBITO';
    }

    const saldoRaw = celula(l, 'saldo');
    const saldo = saldoRaw ? lerMontante(saldoRaw) : null;
    if (saldoRaw && !saldo) problemas.push(`saldo inválido (${saldoRaw})`);

    if (problemas.length > 0) {
      erros.push({ linha: i + 1, mensagem: problemas.join('; ') });
      continue;
    }
    linhas.push({
      linha: i + 1,
      dataMovimento: dataMovimento!,
      dataValor,
      referencia,
      descricao,
      valor: montante!.abs(),
      natureza: natureza!,
      saldoAposMovimento: saldo,
    });
  }

  if (linhas.length + erros.length > MAXIMO_LINHAS) {
    return { linhas: [], erros: [{ linha: iCab + 1, mensagem: `O extracto tem mais de ${MAXIMO_LINHAS} movimentos; divida-o por períodos.` }] };
  }
  if (linhas.length === 0 && erros.length === 0) {
    erros.push({ linha: iCab + 1, mensagem: 'Extracto sem movimentos' });
  }
  return { linhas, erros };
}
