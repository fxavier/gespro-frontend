import { exigirPermissaoPagina } from '@/lib/auth';

/** #76 — sem `admin:ver_auditoria`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function CoreTenancyAuditoriaLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/core-tenancy/auditoria')) ?? children;
}
