import { exigirPermissaoPagina } from '@/lib/auth';

/** #76 — sem `faturacao:ver`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function FaturacaoLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/faturacao')) ?? children;
}
