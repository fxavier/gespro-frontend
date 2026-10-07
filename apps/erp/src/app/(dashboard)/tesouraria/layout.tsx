import { exigirPermissaoPagina } from '@/lib/auth';

/** #76 — sem `financas:tesouraria:leitura`, «Sem permissão» em vez da página (`lib/permissoes-rotas`). */
export default async function TesourariaLayout({ children }: { children: React.ReactNode }) {
  return (await exigirPermissaoPagina('/tesouraria')) ?? children;
}
