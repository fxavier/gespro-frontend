import { exigirPermissaoPagina } from '@/lib/auth';

/** #76 — sem `producao:ver`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function ProducaoLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/producao')) ?? children;
}
