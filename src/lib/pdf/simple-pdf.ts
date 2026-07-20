/**
 * Gerador de PDF mínimo, sem dependências externas (Spec 06 — recibo de
 * vencimento). Produz um documento A4 de página única com texto Helvetica
 * (WinAnsiEncoding — cobre os diacríticos do Português).
 *
 * Suficiente para documentos tabulares simples; para layouts ricos adoptar
 * uma biblioteca dedicada (dívida documentada no handoff).
 */

export interface PdfTexto {
  texto: string;
  x: number;
  y: number; // a partir do fundo da página (pontos)
  tamanho?: number;
  negrito?: boolean;
}

export interface PdfLinha {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const A4_LARGURA = 595;
const A4_ALTURA = 842;

/** Tipografia comum fora do Latin-1 → códigos WinAnsi (Windows-1252). */
const WINANSI_EXTRA: Record<string, number> = {
  '–': 150, // –
  '—': 151, // —
  '‘': 145, // '
  '’': 146, // '
  '“': 147, // "
  '”': 148, // "
  '•': 149, // •
  '…': 133, // …
  '€': 128, // €
};

/** Escapa e converte para WinAnsi; caracteres fora do encoding → '?'. */
function escaparTexto(s: string): string {
  let out = '';
  for (const ch of s.normalize('NFC')) {
    const code = WINANSI_EXTRA[ch] ?? ch.codePointAt(0) ?? 63;
    if (ch === '(' || ch === ')' || ch === '\\') {
      out += `\\${ch}`;
    } else if (code >= 32 && code <= 126) {
      out += ch;
    } else if ((code >= 128 && code <= 159) || (code >= 160 && code <= 255)) {
      // WinAnsi (Windows-1252) em octal
      out += `\\${code.toString(8).padStart(3, '0')}`;
    } else {
      out += '?';
    }
  }
  return out;
}

export function gerarPdf(textos: PdfTexto[], linhas: PdfLinha[] = []): Uint8Array {
  const partes: string[] = [];
  for (const t of textos) {
    const fonte = t.negrito ? '/F2' : '/F1';
    const tamanho = t.tamanho ?? 10;
    partes.push(
      `BT ${fonte} ${tamanho} Tf ${t.x.toFixed(2)} ${t.y.toFixed(2)} Td (${escaparTexto(t.texto)}) Tj ET`,
    );
  }
  for (const l of linhas) {
    partes.push(
      `0.5 w ${l.x1.toFixed(2)} ${l.y1.toFixed(2)} m ${l.x2.toFixed(2)} ${l.y2.toFixed(2)} l S`,
    );
  }
  const conteudo = partes.join('\n');

  const objetos: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_LARGURA} ${A4_ALTURA}] ` +
      '/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(conteudo, 'latin1')} >>\nstream\n${conteudo}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];

  let corpo = '%PDF-1.4\n';
  const offsets: number[] = [];
  objetos.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(corpo, 'latin1'));
    corpo += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(corpo, 'latin1');
  let xref = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  corpo += xref;
  corpo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Uint8Array(Buffer.from(corpo, 'latin1'));
}

export const PDF_A4 = { largura: A4_LARGURA, altura: A4_ALTURA } as const;
