import { exigirPermissaoPagina } from '@/lib/auth';

/** #76 — sem `core_tenancy:ver`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function CoreTenancyLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/core-tenancy')) ?? children;
}
