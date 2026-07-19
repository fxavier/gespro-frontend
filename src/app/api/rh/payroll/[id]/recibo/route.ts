/**
 * GET /api/rh/payroll/[id]/recibo — Recibo de vencimento em PDF (Spec 06).
 * Route Handler via withApi (sessão → permissão → contexto de tenant).
 */
import { withApi } from '@/lib/api/with-api';
import { PayrollService } from '@/server/services/pessoas-projetos/payroll.service';
import { gerarPdf, PDF_A4, type PdfLinha, type PdfTexto } from '@/lib/pdf/simple-pdf';
import { NotFoundError } from '@/lib/errors';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function mt(v: { toString(): string }): string {
  return `MT ${Number(v.toString()).toLocaleString('pt-PT', { minimumFractionDigits: 2 })}`;
}

export const GET = withApi(
  async (_req, ctx) => {
    const id = String(ctx.params.id ?? '');
    if (!id) throw new NotFoundError('Payroll não encontrado');
    const recibo = await PayrollService.obterRecibo(id, ctx);

    const { payroll, colaborador, empresa, linhas } = recibo;
    const periodo = `${MESES[payroll.mesReferencia - 1]} ${payroll.anoReferencia}`;
    const margem = 50;
    const direita = PDF_A4.largura - margem;
    let y = PDF_A4.altura - 60;

    const textos: PdfTexto[] = [];
    const regras: PdfLinha[] = [];

    textos.push({ texto: empresa.nome, x: margem, y, tamanho: 14, negrito: true });
    y -= 16;
    textos.push({ texto: `NUIT: ${empresa.nuit}`, x: margem, y, tamanho: 9 });
    y -= 24;
    textos.push({ texto: `Recibo de Vencimento — ${periodo}`, x: margem, y, tamanho: 12, negrito: true });
    y -= 8;
    regras.push({ x1: margem, y1: y, x2: direita, y2: y });
    y -= 18;

    textos.push({ texto: `Colaborador: ${colaborador.nome} (${colaborador.codigo})`, x: margem, y });
    y -= 14;
    textos.push({ texto: `NUIT: ${colaborador.nuit}   NISS: ${colaborador.niss ?? '—'}`, x: margem, y });
    y -= 14;
    textos.push({
      texto: `Cargo: ${colaborador.cargo ?? '—'}   Departamento: ${colaborador.departamento ?? '—'}`,
      x: margem,
      y,
    });
    if (colaborador.bancoNib) {
      y -= 14;
      textos.push({ texto: `NIB: ${colaborador.bancoNib}`, x: margem, y });
    }
    y -= 10;
    regras.push({ x1: margem, y1: y, x2: direita, y2: y });
    y -= 20;

    textos.push({ texto: 'Proventos', x: margem, y, negrito: true });
    y -= 14;
    for (const l of linhas.filter((l) => l.tipo === 'PROVENTO')) {
      textos.push({ texto: l.descricao, x: margem + 8, y, tamanho: 9 });
      textos.push({ texto: mt(l.valor), x: direita - 110, y, tamanho: 9 });
      y -= 12;
    }
    textos.push({ texto: 'Total bruto', x: margem + 8, y, tamanho: 9, negrito: true });
    textos.push({ texto: mt(payroll.salarioBruto), x: direita - 110, y, tamanho: 9, negrito: true });
    y -= 20;

    textos.push({ texto: 'Descontos', x: margem, y, negrito: true });
    y -= 14;
    for (const l of linhas.filter((l) => l.tipo === 'DESCONTO')) {
      textos.push({ texto: l.descricao, x: margem + 8, y, tamanho: 9 });
      textos.push({ texto: `- ${mt(l.valor)}`, x: direita - 110, y, tamanho: 9 });
      y -= 12;
    }
    y -= 6;
    regras.push({ x1: margem, y1: y, x2: direita, y2: y });
    y -= 16;

    textos.push({ texto: 'Salário líquido', x: margem + 8, y, tamanho: 11, negrito: true });
    textos.push({ texto: mt(payroll.salarioLiquido), x: direita - 110, y, tamanho: 11, negrito: true });
    y -= 18;
    textos.push({
      texto: `INSS entidade (encargo patronal): ${mt(payroll.encargoInssEntidade)}   Custo total: ${mt(payroll.custoTotalEntidade)}`,
      x: margem + 8,
      y,
      tamanho: 8,
    });
    y -= 24;
    if (payroll.dataPagamento) {
      textos.push({
        texto: `Pago em: ${payroll.dataPagamento.toLocaleDateString('pt-PT')}`,
        x: margem,
        y,
        tamanho: 9,
      });
    }

    const pdf = gerarPdf(textos, regras);
    return new Response(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="recibo-${colaborador.codigo}-${payroll.anoReferencia}-${String(payroll.mesReferencia).padStart(2, '0')}.pdf"`,
      },
    });
  },
  { permission: 'rh:payroll:read' },
);
