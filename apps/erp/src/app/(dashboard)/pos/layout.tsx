import { exigirPermissaoPagina } from '@/lib/auth';

/** #76 — sem `pos:operar`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function PosLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/pos')) ?? children;
}
