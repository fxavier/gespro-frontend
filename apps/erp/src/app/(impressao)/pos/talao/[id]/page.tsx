/**
 * Talão do POS (issue #127) — Server Component. Documento NÃO fiscal:
 * reflecte a venda gravada e avisa que não serve de factura.
 */
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { NotFoundError } from '@/lib/errors';
import { formatarDataHora } from '@/lib/format-date';
import { formatMZN } from '@/lib/format-currency';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { obterModeloTalao } from '@/server/services/plataforma/documentos.service';
import { Button } from '@/components/ui/button';
import { BotaoImprimir } from './_components/botao-imprimir';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TalaoPage({ params }: Props) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const ctx = { tenantId: session.user.tenantId, userId: session.user.id };

  let talao;
  try {
    talao = await runWithTenantContext(ctx, () => obterModeloTalao(id, ctx));
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }

  const { emitente } = talao;

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Button variant="outline" size="sm" asChild>
          <Link href="/pos">Voltar ao POS</Link>
        </Button>
        <BotaoImprimir />
      </div>

      <header className="text-center space-y-0.5">
        <p className="font-bold text-base">{emitente.nome}</p>
        <p>NUIT: {emitente.nuit}</p>
        {emitente.endereco && <p>{emitente.endereco}</p>}
        {emitente.telefone && <p>Tel.: {emitente.telefone}</p>}
      </header>

      <div className="border-t border-dashed pt-2 space-y-0.5">
        <p>
          Talão <span className="font-mono">{talao.numero}</span>
        </p>
        <p>{formatarDataHora(talao.data)}</p>
      </div>

      <ul className="border-t border-dashed pt-2 space-y-1.5">
        {talao.linhas.map((l, i) => (
          <li key={i}>
            <p>{l.descricao}</p>
            <p className="flex justify-between tabular-nums">
              <span>
                {l.quantidade} × {formatMZN(l.precoUnitario)}
              </span>
              <span>{formatMZN(l.total)}</span>
            </p>
          </li>
        ))}
      </ul>

      <dl className="border-t border-dashed pt-2 space-y-0.5 tabular-nums">
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd>{formatMZN(talao.subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>IVA</dt>
          <dd>{formatMZN(talao.iva)}</dd>
        </div>
        <div className="flex justify-between font-bold text-base">
          <dt>Total</dt>
          <dd>{formatMZN(talao.total)}</dd>
        </div>
      </dl>

      <dl className="border-t border-dashed pt-2 space-y-0.5 tabular-nums">
        {talao.pagamentos.map((p, i) => (
          <div key={i} className="space-y-0.5">
            <div className="flex justify-between">
              <dt>{p.metodo}</dt>
              <dd>{formatMZN(p.valor)}</dd>
            </div>
            {p.troco && (
              <>
                <div className="flex justify-between">
                  <dt>Recebido</dt>
                  <dd>{formatMZN(p.recebido)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Troco</dt>
                  <dd>{formatMZN(p.troco)}</dd>
                </div>
              </>
            )}
          </div>
        ))}
      </dl>

      <p className="border-t border-dashed pt-2 text-center text-xs font-medium">{talao.aviso}</p>
    </div>
  );
}
