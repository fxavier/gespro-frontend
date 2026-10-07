import { exigirPermissaoPagina } from '@/lib/auth';

/** #76 — sem `transporte:ver`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function TransporteLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/transporte')) ?? children;
}
