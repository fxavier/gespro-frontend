/**
 * Gerador set-based de volume (ADR-0018 §2).
 *
 * Cada entidade é inserida com UM `INSERT … SELECT … FROM generate_series` —
 * os dados nascem no servidor Postgres, sem round-trips por linha, o que torna
 * viável semear 50 tenants de dimensão PME em «dezenas de minutos» (ADR-0018).
 *
 * Idempotência: IDs determinísticos (ver id.ts) + `ON CONFLICT DO NOTHING`.
 * Dinheiro: tudo `numeric(18,2)` no servidor — nunca float (o `random()` é
 * arredondado a 2 casas antes de entrar em colunas de dinheiro).
 *
 * NOTA DE HONESTIDADE: os valores financeiros são sintéticos e não têm
 * consistência cruzada garantida (ex.: total da venda ≠ soma exacta dos itens).
 * Servem para medir desempenho, nunca para validar contabilidade.
 */
import type { PrismaClient } from '@prisma/client';
import type { TenantBase } from './base';
import type { Volumes } from './config';
import { sqlCuid } from './id';

/** Valor monetário pseudo-aleatório determinístico (estável entre execuções). */
function valDet(slug: string, ns: string, exprN: string): string {
  return `(100 + (abs(('x' || substr(md5('${slug}:${ns}:' || ${exprN}), 1, 8))::bit(32)::int::bigint) % 90000))::numeric(18,2)`;
}

const SPREAD = `now() - (random() * interval '730 days')`;

async function run(prisma: PrismaClient, label: string, sql: string): Promise<void> {
  const t0 = Date.now();
  const n = await prisma.$executeRawUnsafe(sql);
  console.log(`    ${label}: ${n} linhas novas em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

export async function seedTenantBulk(
  prisma: PrismaClient,
  base: TenantBase,
  v: Volumes,
): Promise<void> {
  const { tenantId: t, slug } = base;
  const id = (ns: string, exprN: string) => sqlCuid(`perf:${slug}:${ns}:`, exprN);
  const P = v.produtos;
  const C = v.clientes;
  const V = v.vendas;
  const F = v.faturas;
  const MS = v.movimentosStock;
  const L = v.lancamentos;

  // ── Produtos ──────────────────────────────────────────────────────────────
  await run(prisma, 'produtos', `
    INSERT INTO "Produto" ("id","tenantId","sku","nome","categoriaId","unidadeMedida",
      "precoVenda","precoCompra","margemLucro","taxaIva","stockMinimo","imagens","ativo","createdAt","updatedAt")
    SELECT ${id('produto', 'n::text')}, '${t}', 'PERF-SKU-' || n, 'Produto Perf ' || n,
      ${id('catprod', '((n % 10) + 1)::text')}, 'UN',
      ${valDet(slug, 'pv', 'n')}, ${valDet(slug, 'pc', 'n')},
      0.25, 0.16, 5, '{}', true, ${SPREAD}, now()
    FROM generate_series(1, ${P}) AS n
    ON CONFLICT ("id") DO NOTHING`);

  await run(prisma, 'variantes', `
    INSERT INTO "VarianteProduto" ("id","tenantId","produtoId","nome","valor","precoAdicional","createdAt","updatedAt")
    SELECT ${id('variante', 'n::text')}, '${t}', ${id('produto', '(((n - 1) % ' + P + ') + 1)::text')},
      'Tamanho', 'V' || n, 0, now(), now()
    FROM generate_series(1, ${v.variantes}) AS n
    ON CONFLICT ("id") DO NOTHING`);

  // Saldos generosos para os cenários de POS não esgotarem stock a meio da medição.
  await run(prisma, 'saldos de stock', `
    INSERT INTO "SaldoStock" ("id","tenantId","produtoId","varianteProdutoId","localizacaoId","saldo","saldoReservado","updatedAt")
    SELECT ${id('saldo', `n::text || ':' || l::text`)}, '${t}', ${id('produto', 'n::text')}, '',
      CASE l WHEN 1 THEN '${base.localizacaoLojaId}' ELSE '${base.localizacaoArmazemId}' END,
      100000, 0, now()
    FROM generate_series(1, ${P}) AS n, generate_series(1, 2) AS l
    ON CONFLICT ("id") DO NOTHING`);

  // ── Clientes ──────────────────────────────────────────────────────────────
  await run(prisma, 'clientes', `
    INSERT INTO "Cliente" ("id","tenantId","codigo","nome","tipo","nuit","email","telefone",
      "diasPagamento","limiteCreditoMT","creditoUtilizadoMT","status","categoria","tags","createdAt","updatedAt")
    SELECT ${id('cliente', 'n::text')}, '${t}', 'PCLI-' || lpad(n::text, 6, '0'), 'Cliente Perf ' || n,
      CASE WHEN n % 3 = 0 THEN 'JURIDICA' ELSE 'FISICA' END::"TipoCliente",
      (500000000 + n)::text, 'cliente' || n || '@${slug}.mz', '+2588210' || lpad((n % 100000)::text, 5, '0'),
      30, 50000, 0, 'ATIVO', CASE WHEN n % 20 = 0 THEN 'VIP' ELSE 'REGULAR' END::"CategoriaCliente",
      '{}', ${SPREAD}, now()
    FROM generate_series(1, ${C}) AS n
    ON CONFLICT ("id") DO NOTHING`);

  // Histórico do cliente-alvo da exportação XLSX (cenário 6).
  await run(prisma, 'histórico de transacções (export)', `
    INSERT INTO "HistoricoTransacao" ("id","tenantId","clienteId","tipo","referencia","descricao",
      "valor","currency","dataTransacao","status","userId","createdAt")
    SELECT ${id('hist', 'n::text')}, '${t}', ${id('cliente', `'1'`)},
      'VENDA', 'PHT-' || n, 'Transacção perf ' || n,
      ${valDet(slug, 'ht', 'n')}, 'MZN', ${SPREAD}, 'CONCLUIDO', '${base.adminUserId}', now()
    FROM generate_series(1, ${v.historicoExport}) AS n
    ON CONFLICT ("id") DO NOTHING`);

  // ── Vendas (POS, 2 anos) ──────────────────────────────────────────────────
  await run(prisma, 'vendas', `
    INSERT INTO "Venda" ("id","tenantId","numero","origem","status","clienteId","vendedorId",
      "sessaoPOSId","sessaoCaixaId","subtotal","descontoTotal","ivaTotal","total","currency",
      "dataVenda","createdAt","updatedAt")
    SELECT ${id('venda', 'n::text')}, '${t}', 'PVD/PERF/' || lpad(n::text, 7, '0'), 'POS',
      CASE WHEN n % 20 = 0 THEN 'CANCELADA' WHEN n % 20 = 1 THEN 'FATURADA' ELSE 'CONCLUIDA' END::"StatusVenda",
      CASE WHEN n % 5 = 0 THEN NULL ELSE ${id('cliente', `((n % ${C}) + 1)::text`)} END,
      '${base.adminUserId}', '${base.sessaoPOSId}', '${base.sessaoCaixaId}',
      s, 0, round(s * 0.16, 2), round(s * 1.16, 2), 'MZN', d, d, now()
    FROM (
      SELECT n, ${valDet(slug, 'vs', 'n')} AS s, ${SPREAD} AS d
      FROM generate_series(1, ${V}) AS n
    ) AS g
    ON CONFLICT ("id") DO NOTHING`);

  await run(prisma, 'itens de venda', `
    INSERT INTO "ItemVenda" ("id","tenantId","vendaId","produtoId","nomeProduto","sku",
      "quantidade","precoUnitario","desconto","taxaIva","subtotal","ivaItem","total","createdAt")
    SELECT ${id('itemvenda', 'n::text')}, '${t}', ${id('venda', `(((n - 1) / ${v.itensPorVenda}) + 1)::text`)},
      ${id('produto', `(((n * 7) % ${P}) + 1)::text`)}, 'Produto Perf ' || (((n * 7) % ${P}) + 1),
      'PERF-SKU-' || (((n * 7) % ${P}) + 1),
      (n % 5) + 1, p, 0, 0.16, s, round(s * 0.16, 2), round(s * 1.16, 2), now()
    FROM (
      SELECT n, p, round(p * ((n % 5) + 1), 2) AS s
      FROM (SELECT n, ${valDet(slug, 'ip', 'n')} AS p FROM generate_series(1, ${V * v.itensPorVenda}) AS n) AS g0
    ) AS g
    ON CONFLICT ("id") DO NOTHING`);

  await run(prisma, 'pagamentos de venda', `
    INSERT INTO "PagamentoVenda" ("id","tenantId","vendaId","tipo","valor","createdAt")
    SELECT ${id('pagvenda', 'n::text')}, '${t}', ${id('venda', 'n::text')},
      CASE n % 4 WHEN 0 THEN 'DINHEIRO' WHEN 1 THEN 'MPESA' WHEN 2 THEN 'CARTAO' ELSE 'EMOLA' END::"MetodoPagamentoTipo",
      ${valDet(slug, 'pg', 'n')}, now()
    FROM generate_series(1, ${V}) AS n
    ON CONFLICT ("id") DO NOTHING`);

  // ── Movimentos de stock (maior tabela) ────────────────────────────────────
  await run(prisma, 'movimentos de stock', `
    INSERT INTO "MovimentoStock" ("id","tenantId","produtoId","tipo","quantidade",
      "localizacaoOrigemId","localizacaoDestinoId","documentoReferenciaId","documentoReferenciaTipo",
      "criadoPor","createdAt")
    SELECT ${id('mov', 'n::text')}, '${t}', ${id('produto', `((n % ${P}) + 1)::text`)},
      CASE WHEN n % 10 < 3 THEN 'ENTRADA'
           WHEN n % 10 < 8 THEN 'SAIDA'
           WHEN n % 10 = 8 THEN 'AJUSTE'
           WHEN n % 2 = 0 THEN 'TRANSFERENCIA_ENTRADA'
           ELSE 'TRANSFERENCIA_SAIDA' END::"TipoMovimentoStock",
      (n % 20) + 1,
      CASE WHEN n % 10 BETWEEN 3 AND 7 THEN '${base.localizacaoLojaId}'
           WHEN n % 10 = 9 THEN '${base.localizacaoArmazemId}' ELSE NULL END,
      CASE WHEN n % 10 < 3 THEN '${base.localizacaoArmazemId}'
           WHEN n % 10 = 9 THEN '${base.localizacaoLojaId}' ELSE NULL END,
      CASE WHEN n % 10 BETWEEN 3 AND 7 THEN ${id('venda', `((n % ${V}) + 1)::text`)} ELSE NULL END,
      CASE WHEN n % 10 BETWEEN 3 AND 7 THEN 'Venda' ELSE NULL END,
      '${base.adminUserId}', ${SPREAD}
    FROM generate_series(1, ${MS}) AS n
    ON CONFLICT ("id") DO NOTHING`);

  // ── Contabilidade: lançamentos + partidas (partida dobrada) ───────────────
  await run(prisma, 'lançamentos', `
    INSERT INTO "Lancamento" ("id","tenantId","numero","data","tipo","origem","diarioId",
      "historico","valorTotal","status","periodoFiscal","criadoPorId","createdAt","updatedAt")
    SELECT ${id('lanc', 'n::text')}, '${t}', n::text, d, 'AUTOMATICO',
      CASE n % 4 WHEN 0 THEN 'VENDA' WHEN 1 THEN 'CAIXA' WHEN 2 THEN 'MANUAL' ELSE 'AJUSTE' END::"OrigemLancamento",
      ${id('diario', `((n % 4) + 1)::text`)}, 'Lançamento perf ' || n,
      ${valDet(slug, 'lv', 'n')}, 'LANCADO', to_char(d, 'YYYY-MM'), '${base.adminUserId}', d, now()
    FROM (SELECT n, ${SPREAD} AS d FROM generate_series(1, ${L}) AS n) AS g
    ON CONFLICT ("id") DO NOTHING`);

  // Débito principal (todas), débito secundário (ímpares) e crédito (todas):
  // soma(débitos) = soma(créditos) por lançamento; ~2,5 partidas/lançamento.
  await run(prisma, 'partidas (débito principal)', `
    INSERT INTO "PartidaLancamento" ("id","tenantId","lancamentoId","contaId","centroCustoId","tipo","valor","createdAt")
    SELECT ${id('part', `n::text || ':1'`)}, '${t}', ${id('lanc', 'n::text')},
      ${id('conta', `((n % 30) + 1)::text`)},
      CASE WHEN n % 5 = 0 THEN ${id('cc', `((n % 5) + 1)::text`)} ELSE NULL END,
      'DEBITO',
      CASE WHEN n % 2 = 0 THEN ${valDet(slug, 'lv', 'n')} ELSE round(${valDet(slug, 'lv', 'n')} * 0.6, 2) END,
      now()
    FROM generate_series(1, ${L}) AS n
    ON CONFLICT ("id") DO NOTHING`);

  await run(prisma, 'partidas (débito secundário)', `
    INSERT INTO "PartidaLancamento" ("id","tenantId","lancamentoId","contaId","tipo","valor","createdAt")
    SELECT ${id('part', `n::text || ':2'`)}, '${t}', ${id('lanc', 'n::text')},
      ${id('conta', `(((n * 7) % 30) + 1)::text`)}, 'DEBITO',
      ${valDet(slug, 'lv', 'n')} - round(${valDet(slug, 'lv', 'n')} * 0.6, 2), now()
    FROM generate_series(1, ${L}) AS n
    WHERE n % 2 = 1
    ON CONFLICT ("id") DO NOTHING`);

  await run(prisma, 'partidas (crédito)', `
    INSERT INTO "PartidaLancamento" ("id","tenantId","lancamentoId","contaId","tipo","valor","createdAt")
    SELECT ${id('part', `n::text || ':3'`)}, '${t}', ${id('lanc', 'n::text')},
      ${id('conta', `(((n * 13) % 30) + 1)::text`)}, 'CREDITO', ${valDet(slug, 'lv', 'n')}, now()
    FROM generate_series(1, ${L}) AS n
    ON CONFLICT ("id") DO NOTHING`);

  // ── Facturas emitidas ─────────────────────────────────────────────────────
  await run(prisma, 'facturas', `
    INSERT INTO "Fatura" ("id","tenantId","serieDocumentoId","numero","clienteId","vendaId","moeda",
      "subtotal","descontoTotal","baseIva","ivaTotal","total","totalPago","status",
      "dataEmissao","dataVencimento","emitidoPorId","createdAt","updatedAt")
    SELECT ${id('fatura', 'n::text')}, '${t}', '${base.serieFaturaId}', 'PFT/PERF/' || lpad(n::text, 7, '0'),
      ${id('cliente', `((n % ${C}) + 1)::text`)}, ${id('venda', 'n::text')}, 'MZN',
      s, 0, s, round(s * 0.16, 2), round(s * 1.16, 2),
      CASE WHEN n % 10 < 6 THEN round(s * 1.16, 2) ELSE 0 END,
      CASE WHEN n % 10 < 6 THEN 'PAGA' WHEN n % 10 < 9 THEN 'EMITIDA' ELSE 'VENCIDA' END::"StatusFatura",
      d, d + interval '30 days', '${base.adminUserId}', d, now()
    FROM (SELECT n, ${valDet(slug, 'fs', 'n')} AS s, ${SPREAD} AS d FROM generate_series(1, ${F}) AS n) AS g
    ON CONFLICT ("id") DO NOTHING`);

  await run(prisma, 'linhas de factura', `
    INSERT INTO "LinhaFatura" ("id","tenantId","faturaId","produtoId","descricao","quantidade",
      "precoUnitario","desconto","taxaIva","subtotal","ivaItem","total","ordemLinha","createdAt")
    SELECT ${id('linhafat', 'n::text')}, '${t}', ${id('fatura', `(((n - 1) / ${v.linhasPorFatura}) + 1)::text`)},
      ${id('produto', `(((n * 11) % ${P}) + 1)::text`)}, 'Linha perf ' || n,
      (n % 4) + 1, p, 0, 0.16, s, round(s * 0.16, 2), round(s * 1.16, 2), (n - 1) % ${v.linhasPorFatura}, now()
    FROM (
      SELECT n, p, round(p * ((n % 4) + 1), 2) AS s
      FROM (SELECT n, ${valDet(slug, 'lf', 'n')} AS p FROM generate_series(1, ${F * v.linhasPorFatura}) AS n) AS g0
    ) AS g
    ON CONFLICT ("id") DO NOTHING`);

  // ── Folhas de remuneração (24 meses × quadro de pessoal) ──────────────────
  const M = v.mesesFolha;
  const CO = v.colaboradores;
  await run(prisma, 'folhas de pagamento', `
    INSERT INTO "FolhaPagamento" ("id","tenantId","mesReferencia","anoReferencia","status",
      "totalBruto","totalInssTrabalhador","totalInssEntidade","totalIrps","totalOutrosDescontos",
      "totalLiquido","totalCustoEntidade","processadoPorId","dataProcessamento","createdAt","updatedAt")
    SELECT ${id('folha', 'm::text')}, '${t}', (m % 12) + 1, 2024 + (m / 12), 'PROCESSADO',
      ${CO} * 30000, ${CO} * 900, ${CO} * 1200, ${CO} * 3500, 0, ${CO} * 25600, ${CO} * 31200,
      '${base.adminUserId}', now(), now(), now()
    FROM generate_series(0, ${M - 1}) AS m
    ON CONFLICT ("id") DO NOTHING`);

  await run(prisma, 'payrolls individuais', `
    INSERT INTO "Payroll" ("id","tenantId","colaboradorId","mesReferencia","anoReferencia",
      "salarioBruto","descontoInss","descontoIrps","descontoOutros",
      "proventoSubAlimentacao","proventoSubTransporte","salarioLiquido","status",
      "encargoInssEntidade","custoTotalEntidade","folhaId","createdAt","updatedAt")
    SELECT ${id('payroll', `c::text || ':' || m::text`)}, '${t}', ${id('colab', 'c::text')},
      (m % 12) + 1, 2024 + (m / 12),
      b + 4000, round(b * 0.03, 2), round(b * 0.15, 2), 0, 2500, 1500,
      b + 4000 - round(b * 0.03, 2) - round(b * 0.15, 2), 'PROCESSADO',
      round(b * 0.04, 2), b + 4000 + round(b * 0.04, 2), ${id('folha', 'm::text')}, now(), now()
    FROM (
      SELECT c, m, (15000 + (c % 20) * 2500)::numeric(18,2) AS b
      FROM generate_series(1, ${CO}) AS c, generate_series(0, ${M - 1}) AS m
    ) AS g
    ON CONFLICT ("id") DO NOTHING`);

  await run(prisma, 'linhas de payroll', `
    INSERT INTO "LinhaPayroll" ("id","tenantId","payrollId","tipo","natureza","descricao","valor","manual","createdAt")
    SELECT ${id('linhapay', `c::text || ':' || m::text || ':' || l::text`)}, '${t}',
      ${id('payroll', `c::text || ':' || m::text`)},
      CASE WHEN l <= 3 THEN 'PROVENTO' ELSE 'DESCONTO' END::"TipoLinhaPayroll",
      CASE l WHEN 1 THEN 'BASE' WHEN 2 THEN 'SUBSIDIO' WHEN 3 THEN 'SUBSIDIO'
             WHEN 4 THEN 'INSS' ELSE 'IRPS' END::"NaturezaLinhaPayroll",
      CASE l WHEN 1 THEN 'Salário base' WHEN 2 THEN 'Subsídio de alimentação'
             WHEN 3 THEN 'Subsídio de transporte' WHEN 4 THEN 'INSS 3%' ELSE 'IRPS' END,
      CASE l WHEN 1 THEN (15000 + (c % 20) * 2500)::numeric(18,2) WHEN 2 THEN 2500 WHEN 3 THEN 1500
             WHEN 4 THEN round((15000 + (c % 20) * 2500) * 0.03, 2)
             ELSE round((15000 + (c % 20) * 2500) * 0.15, 2) END,
      false, now()
    FROM generate_series(1, ${CO}) AS c, generate_series(0, ${M - 1}) AS m, generate_series(1, 5) AS l
    ON CONFLICT ("id") DO NOTHING`);

  // ── Trilho de auditoria (~1M, ADR-0015) ───────────────────────────────────
  await run(prisma, 'registos de auditoria', `
    INSERT INTO "AuditLog" ("id","tenantId","userId","action","entity","entityId","data","ip","createdAt")
    SELECT ${id('audit', 'n::text')}, '${t}', '${base.adminUserId}',
      CASE n % 3 WHEN 0 THEN 'create' WHEN 1 THEN 'update' ELSE 'transition' END,
      CASE n % 3 WHEN 0 THEN 'Venda' WHEN 1 THEN 'Fatura' ELSE 'MovimentoStock' END,
      CASE n % 3 WHEN 0 THEN ${id('venda', `((n % ${V}) + 1)::text`)}
                 WHEN 1 THEN ${id('fatura', `((n % ${F}) + 1)::text`)}
                 ELSE ${id('mov', `((n % ${MS}) + 1)::text`)} END,
      '{"perf": true}'::jsonb, '127.0.0.1', ${SPREAD}
    FROM generate_series(1, ${v.auditoria}) AS n
    ON CONFLICT ("id") DO NOTHING`);
}
