import { exigirPermissaoPagina } from '@/lib/auth';

/** #76 — sem `tickets:ver`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function TicketsLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/tickets')) ?? children;
}
