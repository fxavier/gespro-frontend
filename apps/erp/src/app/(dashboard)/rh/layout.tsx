import { exigirPermissaoPagina } from '@/lib/auth';

/** #76 — sem `rh:ver`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function RhLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/rh')) ?? children;
}
