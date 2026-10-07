import { exigirPermissaoPagina } from '@/lib/auth';

/** #76 — sem `servicos:ver`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function ServicosLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/servicos')) ?? children;
}
