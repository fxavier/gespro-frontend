import { NextResponse, type NextRequest } from 'next/server';
import { withApi } from '@/lib/api/with-api';
import { NotFoundError, ValidationError } from '@/lib/errors';
import * as contabilidade from '@/server/services/financas/contabilidade.service';
import type { ItemReconciliacaoBancaria } from '@/server/services/financas/contabilidade.interface';
import { exportLimiter, rateLimitedResponse } from '@/server/security/rate-limiter';

/**
 * GET /api/contabilidade/reconciliacao/[id]/export?formato=csv|pdf
 *
 * Relatório da reconciliação bancária (saldos + itens razão/extracto).
 * Requer `financas:leitura`. Route Handler (exportação) — nunca Server Action.
 */

const fmtData = (d: Date) => d.toISOString().slice(0, 10);

function linhaItem(i: ItemReconciliacaoBancaria): string[] {
  return [
    i.tipo === 'LANCAMENTO_CONTABIL' ? 'RAZAO' : 'EXTRATO',
    fmtData(i.data),
    i.descricao,
    i.tipoMovimento,
    i.valor.toFixed(2),
    i.conciliado ? 'SIM' : 'NAO',
    i.extratoReferencia ?? '',
  ];
}

function csvEscape(celula: string): string {
  return /[";\n]/.test(celula) ? `"${celula.replace(/"/g, '""')}"` : celula;
}

// ---------------------------------------------------------------------------
// PDF mínimo sem dependências (Helvetica, latin1, multi-página A4)
// ---------------------------------------------------------------------------

function pdfEscape(s: string): string {
  // latin1-safe + escapes de string PDF
  return s
    .replace(/[\\()]/g, (c) => `\\${c}`)
    .replace(/[^\x20-\xff]/g, '?');
}

function gerarPdfSimples(linhas: string[]): Uint8Array {
  const LINHAS_POR_PAGINA = 48;
  const paginas: string[][] = [];
  for (let i = 0; i < linhas.length; i += LINHAS_POR_PAGINA) {
    paginas.push(linhas.slice(i, i + LINHAS_POR_PAGINA));
  }
  if (paginas.length === 0) paginas.push(['(vazio)']);

  const objetos: string[] = [];
  const fonteId = 3 + paginas.length * 2; // catalog=1, pages=2, [page,content]*n, font
  const pageIds = paginas.map((_, i) => 3 + i * 2);

  objetos.push('<< /Type /Catalog /Pages 2 0 R >>'); // 1
  objetos.push(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${paginas.length} >>`,
  ); // 2

  for (const [i, pagina] of paginas.entries()) {
    const contentId = 4 + i * 2;
    objetos.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fonteId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    const corpo = pagina.map((l) => `(${pdfEscape(l)}) Tj T*`).join('\n');
    const stream = `BT /F1 9 Tf 40 800 Td 14 TL\n${corpo}\nET`;
    objetos.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }

  objetos.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');

  let corpo = '%PDF-1.4\n';
  const offsets: number[] = [];
  objetos.forEach((obj, i) => {
    offsets.push(corpo.length);
    corpo += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefPos = corpo.length;
  corpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) corpo += `${String(off).padStart(10, '0')} 00000 n \n`;
  corpo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

  // latin1
  const bytes = new Uint8Array(corpo.length);
  for (let i = 0; i < corpo.length; i++) bytes[i] = corpo.charCodeAt(i) & 0xff;
  return bytes;
}

export const GET = withApi(
  async (req: NextRequest, ctx) => {
    // Rate limiting: 20 exportações por utilizador por hora
    const rl = await exportLimiter.consume(`${ctx.userId}::export`);
    if (rl.limited) return rateLimitedResponse(rl.retryAfterSec);

    const id = String(ctx.params.id ?? '');
    const formato = new URL(req.url).searchParams.get('formato') ?? 'csv';
    if (formato !== 'csv' && formato !== 'pdf') {
      throw new ValidationError('Formato inválido — use csv ou pdf');
    }

    const rec = await contabilidade.obterReconciliacao(id, {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
    });
    if (!rec) throw new NotFoundError('Reconciliação não encontrada');

    const cabecalhoMeta: [string, string][] = [
      ['Conta bancária', `${rec.contaBancaria.banco} — ${rec.contaBancaria.numeroConta}`],
      ['Período', `${fmtData(rec.dataInicio)} a ${fmtData(rec.dataFim)}`],
      ['Estado', rec.status],
      ['Saldo inicial (banco)', rec.saldoInicialBanco.toFixed(2)],
      ['Saldo final (banco)', rec.saldoFinalBanco.toFixed(2)],
      ['Saldo inicial (contabilístico)', rec.saldoInicialContabil.toFixed(2)],
      ['Saldo final (contabilístico)', rec.saldoFinalContabil.toFixed(2)],
      ['Diferença não conciliada', rec.diferencaNaoConciliada.toFixed(2)],
      ['Observações', rec.observacoes ?? ''],
    ];
    const itens = [...rec.itensRazao, ...rec.itensExtrato];

    if (formato === 'csv') {
      const linhas: string[] = [
        ...cabecalhoMeta.map(([k, v]) => `${csvEscape(k)};${csvEscape(v)}`),
        '',
        'origem;data;descricao;tipoMovimento;valor;conciliado;referencia',
        ...itens.map((i) => linhaItem(i).map(csvEscape).join(';')),
      ];
      const csv = '\uFEFF' + linhas.join('\n');
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="reconciliacao-${id}.csv"`,
        },
      });
    }

    const linhasPdf: string[] = [
      'Reconciliação Bancária — GestPro',
      '',
      ...cabecalhoMeta.map(([k, v]) => `${k}: ${v}`),
      '',
      'Origem | Data | Descrição | Mov. | Valor | Conciliado | Ref.',
      ...itens.map((i) => linhaItem(i).join(' | ')),
    ];
    return new NextResponse(gerarPdfSimples(linhasPdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="reconciliacao-${id}.pdf"`,
      },
    });
  },
  { permission: 'financas:leitura' },
);
