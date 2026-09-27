import 'server-only';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { clienteService } from '@/server/services/comercial/cliente.service';
import type { ComboboxOption } from '@/components/patterns';

/** Os 20 primeiros clientes activos por nome; a partir daí o `CampoCliente` pesquisa no servidor. */
export async function clientesIniciais(ctx: { tenantId: string; userId: string }): Promise<ComboboxOption[]> {
  try {
    const pagina = await runWithTenantContext(ctx, () =>
      clienteService.listar({ status: 'ATIVO', take: 20, orderBy: 'nome', order: 'asc' }, ctx),
    );
    return pagina.items.map((c) => ({ value: c.id, label: `${c.codigo} — ${c.nome}` }));
  } catch {
    return []; // a pesquisa continua a funcionar
  }
}
