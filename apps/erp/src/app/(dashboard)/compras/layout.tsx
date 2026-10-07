import { exigirPermissaoPagina } from '@/lib/auth';

/** #76 — sem `compras:ver`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function ComprasLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/compras')) ?? children;
}
