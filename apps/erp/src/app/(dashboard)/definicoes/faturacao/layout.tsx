import { exigirPermissaoPagina } from '@/lib/auth';

/** #76 — sem `assinatura:ver`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function DefinicoesFaturacaoLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/definicoes/faturacao')) ?? children;
}
