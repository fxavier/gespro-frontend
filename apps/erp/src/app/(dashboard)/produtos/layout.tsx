import { exigirPermissaoPagina } from '@/lib/auth';

/** #76 — sem `produtos:ver`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function ProdutosLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/produtos')) ?? children;
}
