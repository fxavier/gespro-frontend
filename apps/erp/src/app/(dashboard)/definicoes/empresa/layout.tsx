import { exigirPermissaoPagina } from '@/lib/auth';

/** #177 — sem `core_tenancy:configurar`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function DefinicoesEmpresaLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/definicoes/empresa')) ?? children;
}
