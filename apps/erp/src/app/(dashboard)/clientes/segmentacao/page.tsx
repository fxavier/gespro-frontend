/**
 * Segmentação de Clientes — redireccionamento.
 * A segmentação é gerida no detalhe de cada cliente (/clientes/[id]).
 */

import { redirect } from 'next/navigation';

export default function SegmentacaoClientesPage() {
  redirect('/clientes');
}
