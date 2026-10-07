import { exigirPermissaoPagina } from '@/lib/auth';

/** #76 — sem `vendas:ver`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function VendasLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/vendas')) ?? children;
}
