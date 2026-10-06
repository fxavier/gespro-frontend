/**
 * Editar Encomenda de Venda — Server Component.
 *
 * Só uma encomenda em RASCUNHO se edita; noutro estado volta ao detalhe.
 * Carrega a mesma primeira página de clientes, vendedores e produtos do /novo e
 * funde por id os já escolhidos na encomenda, para as caixas de selecção
 * aparecerem preenchidas mesmo quando o escolhido não está na primeira página.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import {
  clienteService,
  encomendaService,
  vendedorService,
} from '@/server/services/comercial/index';
import { listarProdutos, obterProduto } from '@/server/services/inventario/catalogo.service';
import { formatarDiaIso } from '@/lib/format-date';
import { PageHeader } from '@/components/patterns';
import {
  NovaEncomendaForm,
  type ClienteOpcao,
  type EncomendaEmEdicao,
  type VendedorOpcao,
  type ProdutoOpcao,
} from '../../_components/nova-encomenda-form';

interface PageProps {
  params: Promise<{ id: string }>;
}

function fundirPorId<T extends { id: string }>(primeiraPagina: T[], escolhidos: T[]): T[] {
  const mapa = new Map(primeiraPagina.map((x) => [x.id, x]));
  for (const x of escolhidos) if (!mapa.has(x.id)) mapa.set(x.id, x);
  return [...mapa.values()];
}

export default async function EditarEncomendaPage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId } = session.user;
  const ctx = { tenantId, userId };
  const { id } = await params;

  const encomenda = await runWithTenantContext(ctx, () => encomendaService.obter(id, ctx)).catch(
    () => null,
  );
  if (!encomenda) notFound();
  if (encomenda.status !== 'RASCUNHO') redirect(`/vendas/pedidos/${id}`);

  let clientes: ClienteOpcao[] = [];
  let vendedores: VendedorOpcao[] = [];
  let produtos: ProdutoOpcao[] = [];

  try {
    [clientes, vendedores, produtos] = await runWithTenantContext(ctx, async () => {
      const idsProdutos = [...new Set(encomenda.itens.map((i) => i.produtoId))];
      const [c, v, p, cliente, vendedor, produtosEscolhidos] = await Promise.all([
        clienteService.listar({ status: 'ATIVO', take: 20, orderBy: 'nome', order: 'asc' }, ctx),
        vendedorService.listar({ status: 'ATIVO', take: 20, orderBy: 'nome', order: 'asc' }, ctx),
        listarProdutos({ ativo: true, take: 20, orderBy: 'nome', orderDir: 'asc' }, ctx),
        clienteService.buscarPorId(encomenda.clienteId, ctx).catch(() => null),
        encomenda.vendedorId
          ? vendedorService.obter(encomenda.vendedorId, ctx).catch(() => null)
          : Promise.resolve(null),
        Promise.all(
          idsProdutos.map(async (produtoId): Promise<ProdutoOpcao> => {
            const doCatalogo = await obterProduto(produtoId, ctx).catch(() => null);
            if (doCatalogo) {
              return {
                id: doCatalogo.id,
                nome: doCatalogo.nome,
                sku: doCatalogo.sku,
                precoVenda: doCatalogo.precoVenda,
                taxaIva: doCatalogo.taxaIva,
              };
            }
            // Produto entretanto arquivado: a linha guarda o que é preciso para o mostrar.
            const linha = encomenda.itens.find((i) => i.produtoId === produtoId)!;
            return {
              id: produtoId,
              nome: linha.nomeProduto,
              sku: linha.sku ?? '',
              precoVenda: linha.precoUnitario,
              taxaIva: linha.taxaIva,
            };
          }),
        ),
      ]);
      return [
        fundirPorId(
          c.items.map((x) => ({ id: x.id, codigo: x.codigo, nome: x.nome })),
          cliente ? [{ id: cliente.id, codigo: cliente.codigo, nome: cliente.nome }] : [],
        ),
        fundirPorId(
          v.items.map((x) => ({ id: x.id, nome: x.nome })),
          vendedor ? [{ id: vendedor.id, nome: vendedor.nome }] : [],
        ),
        fundirPorId(
          p.items.map((x) => ({
            id: x.id,
            nome: x.nome,
            sku: x.sku,
            precoVenda: x.precoVenda,
            taxaIva: x.taxaIva,
          })),
          produtosEscolhidos,
        ),
      ] as const;
    });
  } catch {
    // O formulário mostra as listas vazias e avisa.
  }

  const emEdicao: EncomendaEmEdicao = {
    id: encomenda.id,
    numero: encomenda.numero,
    valores: {
      clienteId: encomenda.clienteId,
      vendedorId: encomenda.vendedorId ?? undefined,
      dataPrevista: encomenda.dataPrevista ? formatarDiaIso(encomenda.dataPrevista) : undefined,
      notas: encomenda.notas ?? '',
      itens: encomenda.itens.map((i) => ({
        produtoId: i.produtoId,
        varianteId: i.varianteId ?? undefined,
        nomeProduto: i.nomeProduto,
        sku: i.sku ?? undefined,
        quantidade: parseFloat(i.quantidade),
        precoUnitario: parseFloat(i.precoUnitario),
        desconto: parseFloat(i.desconto),
        taxaIva: parseFloat(i.taxaIva),
      })),
    },
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={`Editar Encomenda ${encomenda.numero}`}
        description="Altere os campos e as linhas da encomenda em rascunho"
        breadcrumbs={[
          { label: 'Vendas', href: '/vendas' },
          { label: 'Encomendas', href: '/vendas/pedidos' },
          { label: encomenda.numero, href: `/vendas/pedidos/${id}` },
          { label: 'Editar' },
        ]}
      />

      <NovaEncomendaForm
        clientesIniciais={clientes}
        vendedoresIniciais={vendedores}
        produtosIniciais={produtos}
        encomenda={emEdicao}
      />
    </div>
  );
}
