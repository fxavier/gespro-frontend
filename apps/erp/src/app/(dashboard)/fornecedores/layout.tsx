import { exigirPermissaoPagina } from '@/lib/auth';

/** #76 — sem `fornecedores:ver`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function FornecedoresLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/fornecedores')) ?? children;
}
