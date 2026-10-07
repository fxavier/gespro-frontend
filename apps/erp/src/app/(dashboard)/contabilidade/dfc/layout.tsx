import { exigirPermissaoPagina } from '@/lib/auth';

/** #76 — sem `financas:fluxo-caixa:leitura`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function ContabilidadeDfcLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/contabilidade/dfc')) ?? children;
}
