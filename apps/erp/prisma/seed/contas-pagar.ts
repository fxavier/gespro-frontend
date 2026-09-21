/**
 * Seed de Contas a Pagar — WS B, tenant demo.
 *
 * Entra PELO SERVIÇO, não por `createMany`: cada conta recebe o número da
 * série `CONTA_PAGAR` sem lacunas, e cada pagamento recebe o seu número
 * (`PAGAMENTO`) e o lançamento contabilístico do contrato do WS D — 421
 * Fornecedores c/c a débito, 121 Depósitos à ordem a crédito, no diário de
 * banco. O balancete e o razão passam a bater com o que a listagem mostra.
 *
 * O serviço vive atrás de `import 'server-only'`, que fora do Next lança ao
 * ser importado. O `db:seed` corre com `tsx -C react-server`: nessa condição
 * o pacote resolve para um módulo vazio (é o que o Next faz no servidor) e o
 * resto do grafo — client Prisma da app, extensão de tenant, auditoria — é
 * Node normal. O seed continua a usar o seu próprio `PrismaClient` para as
 * leituras; só a escrita passa pelo serviço, dentro de `runWithTenantContext`.
 *
 * Idempotência: o serviço numera em série e não há chave natural estável, por
 * isso a guarda é «o tenant já tem contas a pagar? então nada a fazer».
 *
 * Mistura (12 contas pelos fornecedores do seed, valores em MT):
 *   5 abertas a vencer nos próximos 60 dias · 3 vencidas · 2 parcialmente
 *   pagas · 2 pagas (uma em duas prestações). Datas relativas a hoje, para a
 *   demo nunca «envelhecer».
 */
import type { PrismaClient } from '@prisma/client';
import { runWithTenantContext } from '../../src/server/db/tenant-extension';
import { contaPagarService } from '../../src/server/services/compras/conta-pagar.service';

const DIA = 24 * 60 * 60 * 1000;
const dias = (n: number) => new Date(Date.now() + n * DIA);

interface Pagamento {
  /** Dias relativos a hoje (negativo = passado). */
  em: number;
  valor: number;
  forma: 'TRANSFERENCIA_BANCARIA' | 'CHEQUE' | 'M-PESA';
  referencia: string;
}

interface Conta {
  fornecedor: string; // código FOR-000n do seed de compras
  descricao: string;
  valor: number;
  emissao: number; // dias relativos a hoje
  vencimento: number;
  /**
   * Código PGC da conta de gasto/existências a debitar no reconhecimento da
   * dívida (obrigatório desde o ADR-0034 §1 — `CONTA_CONTABIL_OBRIGATORIA`).
   * `6112 De mercadorias` para compra de bens; por omissão `63299 Outros
   * fornecimentos e serviços`.
   */
  conta?: '6112' | '63299';
  observacoes?: string;
  pagamentos?: Pagamento[];
}

const CONTAS: Conta[] = [
  // ── Abertas, a vencer ───────────────────────────────────────────────────
  { fornecedor: 'FOR-0001', descricao: 'Factura FT 2026/118 — mercadoria para revenda (Julho)', valor: 184_500, emissao: -5, vencimento: 25, conta: '6112' },
  { fornecedor: 'FOR-0002', descricao: 'Factura IMP-4471 — contentor de material de escritório', valor: 420_000, emissao: -3, vencimento: 42 },
  { fornecedor: 'FOR-0003', descricao: 'Recibo 0312 — manutenção do gerador da loja', valor: 8_500, emissao: -2, vencimento: 13 },
  { fornecedor: 'FOR-0005', descricao: 'Factura NP-2026-0057 — fornecimento Nampula (1.ª entrega)', valor: 96_300, emissao: -10, vencimento: 20, conta: '6112', observacoes: 'Pagar contra guia de remessa assinada.' },
  { fornecedor: 'FOR-0001', descricao: 'Factura FT 2026/131 — reposição de stock (Agosto)', valor: 132_750, emissao: -1, vencimento: 59, conta: '6112' },

  // ── Vencidas (o serviço marca-as no fim) ────────────────────────────────
  { fornecedor: 'FOR-0002', descricao: 'Factura IMP-4390 — peças de reposição', valor: 58_900, emissao: -60, vencimento: -15, conta: '6112' },
  { fornecedor: 'FOR-0003', descricao: 'Recibo 0298 — reparação eléctrica do armazém', valor: 12_400, emissao: -48, vencimento: -33, observacoes: 'Fornecedor já reclamou por telefone.' },
  { fornecedor: 'FOR-0005', descricao: 'Factura NP-2026-0041 — fornecimento Nampula (Maio)', valor: 74_200, emissao: -75, vencimento: -45, conta: '6112' },

  // ── Parcialmente pagas ──────────────────────────────────────────────────
  {
    fornecedor: 'FOR-0001',
    descricao: 'Factura FT 2026/097 — mercadoria para revenda (Junho)',
    valor: 246_000, emissao: -40, vencimento: 5, conta: '6112',
    pagamentos: [{ em: -20, valor: 120_000, forma: 'TRANSFERENCIA_BANCARIA', referencia: 'TRF 2026-06-27/0412' }],
  },
  {
    fornecedor: 'FOR-0002',
    descricao: 'Factura IMP-4402 — equipamento de refrigeração',
    valor: 318_000, emissao: -35, vencimento: 10,
    observacoes: 'Acordado em três prestações.',
    pagamentos: [{ em: -30, valor: 106_000, forma: 'CHEQUE', referencia: 'CHQ 000871' }],
  },

  // ── Pagas ───────────────────────────────────────────────────────────────
  {
    fornecedor: 'FOR-0003',
    descricao: 'Recibo 0275 — limpeza de tanques (Abril)',
    valor: 9_800, emissao: -90, vencimento: -75,
    pagamentos: [{ em: -78, valor: 9_800, forma: 'M-PESA', referencia: 'MP 7F3K2Q1' }],
  },
  {
    fornecedor: 'FOR-0001',
    descricao: 'Factura FT 2026/064 — mercadoria para revenda (Abril)',
    valor: 152_300, emissao: -100, vencimento: -70, conta: '6112',
    pagamentos: [
      { em: -85, valor: 80_000, forma: 'TRANSFERENCIA_BANCARIA', referencia: 'TRF 2026-04-23/0177' },
      { em: -71, valor: 72_300, forma: 'TRANSFERENCIA_BANCARIA', referencia: 'TRF 2026-05-07/0203' },
    ],
  },
];

export async function seedContasPagar(
  prisma: PrismaClient,
  tenantId: string,
  userId: string,
): Promise<void> {
  console.log('[WS-B] Seed contas a pagar iniciado...');

  const existentes = await prisma.contaPagar.count({ where: { tenantId } });
  if (existentes > 0) {
    console.log(`[WS-B] Contas a pagar: ${existentes} já existem — nada a fazer.`);
    return;
  }

  const fornecedores = await prisma.fornecedor.findMany({
    where: { tenantId },
    select: { id: true, codigo: true },
  });
  const porCodigo = new Map(fornecedores.map((f) => [f.codigo, f.id]));

  // Contas PGC de débito do reconhecimento da dívida (ADR-0034 §1): o serviço
  // recusa criar sem `contaContabilId` (CONTA_CONTABIL_OBRIGATORIA).
  const contasGasto = await prisma.contaPGC.findMany({
    where: { tenantId, codigo: { in: ['6112', '63299'] } },
    select: { id: true, codigo: true },
  });
  const gastoPorCodigo = new Map(contasGasto.map((c) => [c.codigo, c.id]));
  for (const codigo of ['6112', '63299'] as const) {
    if (!gastoPorCodigo.has(codigo)) {
      throw new Error(`[WS-B] Conta PGC ${codigo} não existe — correr o seed do plano de contas antes.`);
    }
  }

  const ctx = { tenantId, userId };

  await runWithTenantContext(ctx, async () => {
    for (const c of CONTAS) {
      const fornecedorId = porCodigo.get(c.fornecedor);
      if (!fornecedorId) throw new Error(`[WS-B] Fornecedor ${c.fornecedor} não existe — correr seedCompras antes.`);

      const conta = await contaPagarService.criar(
        {
          fornecedorId,
          descricao: c.descricao,
          valorOriginal: c.valor,
          dataEmissao: dias(c.emissao),
          dataVencimento: dias(c.vencimento),
          contaContabilId: gastoPorCodigo.get(c.conta ?? '63299')!,
          observacoes: c.observacoes,
        },
        ctx,
      );

      for (const p of c.pagamentos ?? []) {
        await contaPagarService.registarPagamento(
          {
            contaPagarId: conta.id,
            dataPagamento: dias(p.em),
            valor: p.valor,
            formaPagamento: p.forma,
            referencia: p.referencia,
          },
          ctx,
        );
      }
    }

    // As que já passaram do prazo sem liquidação ficam VENCIDA — a mesma
    // regra que o cron aplica em produção.
    const vencidas = await contaPagarService.actualizarVencidas(ctx);
    console.log(`[WS-B] Contas a pagar: ${CONTAS.length} criadas, ${vencidas} vencidas.`);
  });
}
