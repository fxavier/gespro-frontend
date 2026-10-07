import { exigirPermissaoPagina } from '@/lib/auth';

/** #76 — sem `financas:ver`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function ContabilidadeLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/contabilidade')) ?? children;
}
