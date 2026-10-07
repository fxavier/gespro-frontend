import { exigirPermissaoPagina } from '@/lib/auth';

/** #76 — sem `analytics:ver`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/analytics')) ?? children;
}
