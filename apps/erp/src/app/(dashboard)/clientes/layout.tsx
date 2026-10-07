import { exigirPermissaoPagina } from '@/lib/auth';

/** #76 — sem `clientes:ver`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function ClientesLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/clientes')) ?? children;
}
