/**
 * Extracção de texto de um PDF do `@react-pdf/renderer` — auxiliar do oráculo
 * do nó `export-v` (grafo `dfc`, gate do ticket 9.1). Não é um teste: o vitest
 * só recolhe `*.test.ts`.
 *
 * Porquê à mão e não com uma biblioteca: não há `pdf-parse`/`pdfjs` no
 * repositório, e o motor do ADR-0005 (`src/lib/documents/pdf/base.tsx`) escreve
 * com as fontes-padrão (Helvetica/Helvetica-Bold). Com elas o pdfkit do
 * react-pdf emite o texto como strings hexadecimais WinAnsi dentro de arrays
 * `TJ`, em streams `FlateDecode`. Basta inflar cada stream, apanhar os
 * operandos de `Tj`/`TJ` e descodificar em windows-1252.
 *
 * As quebras de linha do layout partem uma frase em vários `TJ`, e o kerning
 * parte uma palavra em vários operandos. Por isso a comparação faz-se sobre o
 * texto COMPACTO: tudo concatenado, sem espaço nenhum (incluindo NBSP e o
 * espaço fino que o `Intl` põe nos milhares), em minúsculas.
 *
 * Limite, registado no handoff: se a rota registar uma fonte embebida
 * (`Font.register`), o texto passa a ser ids de glifo e isto deixa de o ver.
 * `garantirExtractor()` calibra o extractor contra um PDF de controlo, para
 * que uma actualização do react-pdf que parta a extracção se veja como defeito
 * do auxiliar, e não como defeito da rota.
 */
import React from 'react';
import { inflateSync } from 'node:zlib';
import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer';

const WIN1252 = new TextDecoder('windows-1252');

function hexParaTexto(hex: string): string {
  const limpo = hex.replace(/\s+/g, '');
  const par = limpo.length % 2 === 0 ? limpo : `${limpo}0`;
  return WIN1252.decode(Buffer.from(par, 'hex'));
}

function literalParaTexto(lit: string): string {
  // `lit` sem os parênteses exteriores.
  const bytes: number[] = [];
  for (let i = 0; i < lit.length; i++) {
    const c = lit[i]!;
    if (c !== '\\') {
      bytes.push(c.charCodeAt(0) & 0xff);
      continue;
    }
    const n = lit[++i];
    if (n === undefined) break;
    if (/[0-7]/.test(n)) {
      let oct = n;
      while (oct.length < 3 && /[0-7]/.test(lit[i + 1] ?? '')) oct += lit[++i];
      bytes.push(parseInt(oct, 8) & 0xff);
    } else {
      const esc: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12 };
      bytes.push(esc[n] ?? n.charCodeAt(0));
    }
  }
  return WIN1252.decode(Uint8Array.from(bytes));
}

const OPERANDO = /<([0-9A-Fa-f\s]*)>|\(((?:\\.|[^\\)])*)\)/g;

function textoDoConteudo(conteudo: string): string[] {
  const partes: string[] = [];
  const mostra = /\[((?:[^\]\\]|\\.)*)\]\s*TJ|(<[0-9A-Fa-f\s]*>|\((?:\\.|[^\\)])*\))\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = mostra.exec(conteudo))) {
    const operandos = m[1] ?? m[2] ?? '';
    let linha = '';
    let o: RegExpExecArray | null;
    OPERANDO.lastIndex = 0;
    while ((o = OPERANDO.exec(operandos))) {
      linha += o[1] !== undefined ? hexParaTexto(o[1]) : literalParaTexto(o[2] ?? '');
    }
    partes.push(linha);
  }
  return partes;
}

/** Todos os troços de texto mostrados no PDF, pela ordem em que aparecem. */
export function trocosDoPdf(pdf: Uint8Array): string[] {
  const buf = Buffer.from(pdf);
  const bruto = buf.toString('latin1');
  const trocos: string[] = [];
  const inicioStream = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = inicioStream.exec(bruto))) {
    const ini = m.index + m[0].length;
    const fim = bruto.indexOf('endstream', ini);
    if (fim < 0) break;
    const dados = buf.subarray(ini, fim);
    let conteudo: string;
    try {
      conteudo = inflateSync(dados).toString('latin1');
    } catch {
      conteudo = dados.toString('latin1');
    }
    trocos.push(...textoDoConteudo(conteudo));
    inicioStream.lastIndex = fim;
  }
  return trocos;
}

/** Compacta para comparação: sem espaços de nenhum tipo, em minúsculas. */
export function compactar(s: string): string {
  return s.replace(/[\s   ]+/g, '').toLowerCase();
}

/** O texto do PDF, compacto (ver `compactar`). */
export function textoCompacto(pdf: Uint8Array): string {
  return compactar(trocosDoPdf(pdf).join(''));
}

/** Só os algarismos do texto do PDF — para procurar montantes sem depender da formatação. */
export function algarismos(pdf: Uint8Array): string {
  return trocosDoPdf(pdf).join('').replace(/\D+/g, '');
}

/** O PDF contém a frase? (compacta nos dois lados; quebras de linha e kerning não contam) */
export function contem(pdf: Uint8Array, frase: string): boolean {
  return textoCompacto(pdf).includes(compactar(frase));
}

let calibrado = false;

/**
 * Calibra o extractor contra um PDF de controlo feito pelo mesmo motor, com as
 * armadilhas conhecidas: quebra de linha a meio da frase, `textTransform`,
 * acentos WinAnsi e milhares com espaço. Lança se o extractor não as vir — o
 * vermelho passa então a ser do auxiliar, não da rota.
 */
export async function garantirExtractor(): Promise<void> {
  if (calibrado) return;
  const h = React.createElement;
  const doc = h(
    Document,
    null,
    h(
      Page,
      { size: 'A4', style: { fontFamily: 'Helvetica', fontSize: 9 } },
      h(View, { style: { width: 60 } }, h(Text, null, 'Mapeamento por validar · versão 37')),
      h(Text, { style: { fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' } }, 'Provisório'),
      h(Text, null, '4 235 981,20 MT'),
    ),
  );
  const pdf = new Uint8Array(await renderToBuffer(doc));
  const falhas: string[] = [];
  if (!contem(pdf, 'Mapeamento por validar')) falhas.push('«Mapeamento por validar» partido em linhas');
  if (!contem(pdf, 'Provisório')) falhas.push('«Provisório» em maiúsculas/acentuado');
  if (!textoCompacto(pdf).includes('versão37')) falhas.push('«versão 37»');
  if (!algarismos(pdf).includes('423598120')) falhas.push('montante com NBSP');
  if (contem(pdf, 'Validado')) falhas.push('falso positivo');
  if (falhas.length > 0) {
    throw new Error(`Extractor de texto do PDF descalibrado (auxiliar do oráculo, não a rota): ${falhas.join('; ')}`);
  }
  calibrado = true;
}
