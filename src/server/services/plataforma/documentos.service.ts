/**
 * Assembla o modelo de documento fiscal (Factura) a partir dos serviços de
 * domínio — faturação (documento emitido), clientes (adquirente) e tenant
 * (emitente/config fiscal). NUNCA lê `prisma` cru; nunca recalcula valores.
 *
 * O Route Handler `api/faturacao/[id]/pdf` corre isto dentro de
 * `runWithTenantContext` e passa o modelo ao motor `@react-pdf/renderer`.
 */
import 'server-only';
import { obterFatura } from '@/server/services/financas/faturacao.service';
import { clienteService } from '@/server/services/comercial/cliente.service';
import { tenantAdminService } from '@/server/services/plataforma/tenant-admin.service';
import { NotFoundError } from '@/lib/errors';
import type { Ctx } from '@/server/services/types';
import {
  construirDocumentoFatura,
  type DocumentoFiscalModel,
  type FaturaInput,
} from '@/lib/documents/fatura-model';

export async function obterModeloFatura(id: string, ctx: Ctx): Promise<DocumentoFiscalModel> {
  const fatura = await obterFatura(id, ctx);
  if (!fatura) throw new NotFoundError('Factura não encontrada');

  const [cliente, tenant] = await Promise.all([
    clienteService.buscarPorId(fatura.clienteId, ctx),
    tenantAdminService.obter(ctx.tenantId),
  ]);
  const cfg = tenant.configuracaoFiscal;

  const enderecoCliente =
    cliente.enderecos?.find((e) => e.tipo === 'FACTURACAO') ?? cliente.enderecos?.[0] ?? null;

  const input: FaturaInput = {
    numero: fatura.numero,
    serieTipo: fatura.serieDocumento.tipo,
    moeda: fatura.moeda,
    dataEmissao: fatura.dataEmissao,
    dataVencimento: fatura.dataVencimento,
    subtotal: fatura.subtotal,
    ivaTotal: fatura.ivaTotal,
    total: fatura.total,
    totalPago: fatura.totalPago,
    observacoes: fatura.observacoes,
    linhas: fatura.linhas.map((l) => ({
      descricao: l.descricao,
      quantidade: l.quantidade,
      precoUnitario: l.precoUnitario,
      desconto: l.desconto,
      taxaIva: l.taxaIva,
      subtotal: l.subtotal,
      ivaItem: l.ivaItem,
      total: l.total,
    })),
  };

  return construirDocumentoFatura(
    input,
    {
      nome: tenant.nome,
      nuit: tenant.nuit,
      endereco: cfg?.endereco ?? null,
      cidade: cfg?.cidade ?? null,
      provincia: cfg?.provincia ?? null,
      telefone: cfg?.telefone ?? null,
      email: cfg?.email ?? null,
      regimeIva: cfg ? String(cfg.regimeIva) : null,
    },
    {
      nome: cliente.nome,
      nuit: cliente.nuit,
      endereco: enderecoCliente ? `${enderecoCliente.rua}, ${enderecoCliente.numero}` : null,
      cidade: enderecoCliente?.cidade ?? null,
    },
  );
}
