import { exigirPermissaoPagina } from '@/lib/auth';

/** #145 — sem `financas:banca:contas:leitura`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function ContabilidadeContasBancariasLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/contabilidade/contas-bancarias')) ?? children;
}
