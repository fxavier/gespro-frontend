import { exigirPermissaoPagina } from '@/lib/auth';

/** #76 — sem `inventario:ver`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function InventarioLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/inventario')) ?? children;
}
