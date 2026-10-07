import { exigirPermissaoPagina } from '@/lib/auth';

/** #76 — sem `caixa:ver`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function CaixaLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/caixa')) ?? children;
}
