/**
 * Parser de extracto bancário CSV — client-safe (sem dependências de servidor).
 *
 * Formato esperado (cabeçalho obrigatório, colunas por nome, ordem livre):
 *   referencia;data;descricao;valor;tipo
 * - separador `;` ou `,`
 * - data em `AAAA-MM-DD` ou `DD/MM/AAAA`
 * - valor com ponto ou vírgula decimal (positivo)
 * - tipo: DEBITO/CREDITO (aceita D/C, DÉBITO/CRÉDITO)
 *
 * All-or-nothing é decidido pelo chamador: se `erros.length > 0`, nada é
 * submetido (Requisito 4.2).
 */

export interface LinhaExtratoParseada {
  extratoReferencia: string;
  data: Date;
  descricao: string;
  valor: number;
  tipoMovimento: 'DEBITO' | 'CREDITO';
}

export interface ErroLinhaExtrato {
  linha: number; // número da linha no ficheiro (1-based, inclui cabeçalho)
  mensagem: string;
}

export interface ResultadoParseExtrato {
  linhas: LinhaExtratoParseada[];
  erros: ErroLinhaExtrato[];
}

const COLUNAS = ['referencia', 'data', 'descricao', 'valor', 'tipo'] as const;

function normalizarCabecalho(celula: string): string {
  return celula
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function detectarSeparador(cabecalho: string): string {
  return cabecalho.includes(';') ? ';' : ',';
}

function construirData(ano: number, mes: number, dia: number): Date | null {
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  // Rejeita rollover do JS (ex.: mês 13 ou dia 99)
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return null;
  }
  return d;
}

function parseData(raw: string): Date | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return construirData(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) return construirData(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

function parseValor(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '');
  // "1.234,56" → "1234.56"; "1234.56" mantém-se
  const normalizado = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normalizado);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function parseTipo(raw: string): 'DEBITO' | 'CREDITO' | null {
  const s = normalizarCabecalho(raw).toUpperCase();
  if (s === 'DEBITO' || s === 'D') return 'DEBITO';
  if (s === 'CREDITO' || s === 'C') return 'CREDITO';
  return null;
}

export function parseExtratoCsv(texto: string): ResultadoParseExtrato {
  const linhasFicheiro = texto
    .split(/\r?\n/)
    .map((l, i) => ({ raw: l, numero: i + 1 }))
    .filter((l) => l.raw.trim().length > 0);

  if (linhasFicheiro.length === 0) {
    return { linhas: [], erros: [{ linha: 1, mensagem: 'Ficheiro vazio' }] };
  }

  const sep = detectarSeparador(linhasFicheiro[0].raw);
  const cabecalho = linhasFicheiro[0].raw.split(sep).map(normalizarCabecalho);
  const indice: Partial<Record<(typeof COLUNAS)[number], number>> = {};
  for (const col of COLUNAS) {
    const idx = cabecalho.indexOf(col);
    if (idx >= 0) indice[col] = idx;
  }

  const emFalta = COLUNAS.filter((c) => indice[c] === undefined);
  if (emFalta.length > 0) {
    return {
      linhas: [],
      erros: [{ linha: 1, mensagem: `Colunas em falta no cabeçalho: ${emFalta.join(', ')}` }],
    };
  }

  const linhas: LinhaExtratoParseada[] = [];
  const erros: ErroLinhaExtrato[] = [];
  const referencias = new Set<string>();

  for (const { raw, numero } of linhasFicheiro.slice(1)) {
    const celulas = raw.split(sep);
    const ref = (celulas[indice.referencia!] ?? '').trim();
    const dataRaw = celulas[indice.data!] ?? '';
    const descricao = (celulas[indice.descricao!] ?? '').trim();
    const valorRaw = celulas[indice.valor!] ?? '';
    const tipoRaw = celulas[indice.tipo!] ?? '';

    const problemas: string[] = [];
    if (!ref) problemas.push('referência vazia');
    else if (referencias.has(ref)) problemas.push(`referência duplicada (${ref})`);

    const data = parseData(dataRaw);
    if (!data) problemas.push(`data inválida (${dataRaw.trim() || 'vazia'})`);

    if (!descricao) problemas.push('descrição vazia');

    const valor = parseValor(valorRaw);
    if (valor === null) problemas.push(`valor inválido (${valorRaw.trim() || 'vazio'})`);

    const tipo = parseTipo(tipoRaw);
    if (!tipo) problemas.push(`tipo inválido (${tipoRaw.trim() || 'vazio'} — esperado DEBITO/CREDITO)`);

    if (problemas.length > 0) {
      erros.push({ linha: numero, mensagem: problemas.join('; ') });
      continue;
    }

    referencias.add(ref);
    linhas.push({
      extratoReferencia: ref,
      data: data!,
      descricao,
      valor: valor!,
      tipoMovimento: tipo!,
    });
  }

  return { linhas, erros };
}
