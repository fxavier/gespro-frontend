/**
 * Serviço central de resolução de datasets para exportação (camada G).
 *
 * Registry `modulo → { permission, build }`. Os builders lêem dados APENAS
 * pelos serviços de domínio (nunca `prisma` cru) — o Route Handler
 * `api/export/[modulo]` corre-os dentro de `runWithTenantContext`. Cada dataset
 * preserva `Decimal` como string (ver `@/lib/reporting`).
 */
import 'server-only';
import type { Ctx } from '@/server/services/types';
import type { Dataset } from '@/lib/reporting';
import { clienteService } from '@/server/services/comercial/cliente.service';
import { OrdemProducaoService } from '@/server/services/pessoas-projetos/producao.service';
import { ValidationError } from '@/lib/errors';

const LIMITE_LINHAS = 5000;

/** Reúne todas as páginas (por cursor) até um limite de segurança. */
async function gatherAll<T>(
  fetch: (cursor: string | undefined) => Promise<{ items: T[]; nextCursor: string | null }>,
): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetch(cursor);
    out.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor && out.length < LIMITE_LINHAS);
  return out.slice(0, LIMITE_LINHAS);
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

async function buildClientes(_params: URLSearchParams, ctx: Ctx): Promise<Dataset> {
  const items = await gatherAll((cursor) =>
    clienteService.listar({ take: 100, cursor, orderBy: 'nome', order: 'asc' }, ctx),
  );
  return {
    nome: 'clientes',
    colunas: [
      { key: 'codigo', header: 'Código' },
      { key: 'nome', header: 'Nome' },
      { key: 'tipo', header: 'Tipo' },
      { key: 'nuit', header: 'NUIT' },
      { key: 'email', header: 'Email' },
      { key: 'telefone', header: 'Telefone' },
      { key: 'status', header: 'Estado' },
      { key: 'categoria', header: 'Categoria' },
      { key: 'enderecosCidade', header: 'Cidade' },
      { key: 'createdAt', header: 'Criado em', type: 'date' },
    ],
    linhas: items.map((c) => ({ ...c })),
  };
}

async function buildProducaoOrdens(params: URLSearchParams, ctx: Ctx): Promise<Dataset> {
  const status = params.get('status') ?? undefined;
  const items = await gatherAll((cursor) =>
    OrdemProducaoService.listar(
      // FilterOrdemProducaoInput — apenas campos suportados
      { take: 100, cursor, ...(status ? { status: status as never } : {}) },
      ctx,
    ),
  );
  return {
    nome: 'ordens-producao',
    colunas: [
      { key: 'numero', header: 'Número' },
      { key: 'nomeProduto', header: 'Produto' },
      { key: 'status', header: 'Estado' },
      { key: 'prioridade', header: 'Prioridade' },
      { key: 'progresso', header: 'Progresso (%)', type: 'integer' },
      { key: 'dataPrevisaoFim', header: 'Previsão de fim', type: 'date' },
    ],
    linhas: items.map((o) => ({ ...o })),
  };
}

async function buildClienteHistorico(params: URLSearchParams, ctx: Ctx): Promise<Dataset> {
  const clienteId = params.get('clienteId');
  if (!clienteId) throw new ValidationError('Parâmetro clienteId é obrigatório');
  const items = await gatherAll((cursor) =>
    clienteService.obterHistorico(clienteId, { take: 100, cursor }, ctx),
  );
  return {
    nome: `historico-cliente-${clienteId}`,
    colunas: [
      { key: 'dataTransacao', header: 'Data', type: 'date' },
      { key: 'tipo', header: 'Tipo' },
      { key: 'referencia', header: 'Referência' },
      { key: 'descricao', header: 'Descrição' },
      { key: 'valor', header: 'Valor (MZN)', type: 'currency' },
      { key: 'status', header: 'Estado' },
    ],
    linhas: items.map((h) => ({ ...h })),
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export interface ExportEntry {
  permission: string;
  build: (params: URLSearchParams, ctx: Ctx) => Promise<Dataset>;
}

export const EXPORT_REGISTRY: Record<string, ExportEntry> = {
  clientes: { permission: 'clientes:ver', build: buildClientes },
  'producao-ordens': { permission: 'producao:ordens:read', build: buildProducaoOrdens },
  'cliente-historico': { permission: 'clientes:ver', build: buildClienteHistorico },
};

export function resolverExport(modulo: string): ExportEntry | undefined {
  return EXPORT_REGISTRY[modulo];
}
