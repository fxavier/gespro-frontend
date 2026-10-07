import { exigirPermissaoPagina } from '@/lib/auth';

/** #76 — sem `admin:ver_utilizadores`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function CoreTenancyUtilizadoresLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/core-tenancy/utilizadores')) ?? children;
}
