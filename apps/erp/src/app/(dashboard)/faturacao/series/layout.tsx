import { exigirPermissaoPagina } from '@/lib/auth';

/** #76 — sem `faturacao:leitura`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function FaturacaoSeriesLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/faturacao/series')) ?? children;
}
