import 'server-only';

/**
 * Carregamento de dados (produtos + localizações) para os formulários de
 * movimentação de stock. Executado no Server Component pai; devolve DTOs
 * já serializados (client-safe) para passar aos Client Components de formulário.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { catalogoProdutoService } from '@/server/services/inventario/catalogo.service';
import { stockService } from '@/server/services/inventario/stock.service';

export interface ProdutoOpcao {
  id: string;
  nome: string;
  sku: string;
  unidadeMedida: string;
  variantes: { id: string; nome: string; valor: string }[];
}

export interface LocalizacaoOpcao {
  id: string;
  nome: string;
  codigo: string;
}

export interface DadosMovimentacao {
  produtos: ProdutoOpcao[];
  localizacoes: LocalizacaoOpcao[];
}

export async function carregarDadosMovimentacao(): Promise<DadosMovimentacao> {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };

  const [produtos, localizacoes] = await runWithTenantContext({ tenantId, userId }, () =>
    Promise.all([
      catalogoProdutoService.listarProdutos(
        { ativo: true, take: 100, orderBy: 'nome', orderDir: 'asc' },
        ctx,
      ),
      stockService.listarLocalizacoes({ ativa: true, take: 100 }, ctx),
    ]),
  );

  return {
    produtos: produtos.items.map((p) => ({
      id: p.id,
      nome: p.nome,
      sku: p.sku,
      unidadeMedida: p.unidadeMedida,
      variantes: p.variantes.map((v) => ({ id: v.id, nome: v.nome, valor: v.valor })),
    })),
    localizacoes: localizacoes.items.map((l) => ({
      id: l.id,
      nome: l.nome,
      codigo: l.codigo,
    })),
  };
}
