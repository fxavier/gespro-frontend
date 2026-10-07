import { exigirPermissaoPagina } from '@/lib/auth';

/** #76 — sem `projetos:ver`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function ProjetosLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/projetos')) ?? children;
}
