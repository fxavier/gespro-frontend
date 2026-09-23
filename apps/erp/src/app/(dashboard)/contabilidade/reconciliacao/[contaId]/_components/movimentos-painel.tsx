'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Eye, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DataTable, EmptyState, type TableColumn } from '@/components/patterns';
import { definirIgnoradoAction } from '@/server/actions/reconciliacao.actions';
import type { MovimentoLinha } from '../../_lib/tipos';
import { colunasMovimento } from './colunas';
import { ReverterCorrespondencia } from './rejeitar';

interface Props {
  vista: 'transito' | 'reconciliados' | 'ignorados';
  bancarios: MovimentoLinha[];
  contabilisticos: MovimentoLinha[];
  cursorBanco: string | null;
  cursorContab: string | null;
}

/** Vistas de consulta: em trânsito (a aguardar o banco), reconciliados (reversíveis), ignorados (reactiváveis). */
export function MovimentosPainel({ vista, bancarios, contabilisticos, cursorBanco, cursorContab }: Props) {
  const router = useRouter();
  const [aCorrer, iniciar] = useTransition();

  const reactivar = (m: MovimentoLinha) =>
    iniciar(async () => {
      const r = await definirIgnoradoAction({ lado: m.lado, id: m.id, ignorado: false });
      if (!r.ok) return void toast.error(r.error.message);
      toast.success('Movimento reactivado.');
      router.refresh();
    });

  const accoes: TableColumn<MovimentoLinha> | null =
    vista === 'reconciliados'
      ? {
          key: 'accoes', label: '', className: 'text-right',
          render: (m) =>
            m.correspondenciaId && (
              <ReverterCorrespondencia
                correspondenciaId={m.correspondenciaId}
                rotulo="Reverter"
                icone={<Undo2 className="h-4 w-4 mr-1" />}
                titulo="Desfazer esta reconciliação?"
                descricao="Os movimentos voltam a pendentes. O registo da reconciliação fica no histórico, marcado revertido. Não é possível num período já fechado."
              />
            ),
        }
      : vista === 'ignorados'
        ? {
            key: 'accoes', label: '', className: 'text-right',
            render: (m) => (
              <Button size="sm" variant="ghost" disabled={aCorrer} onClick={() => reactivar(m)}>
                <Eye className="h-4 w-4 mr-1" /> Reactivar
              </Button>
            ),
          }
        : null;
  const colunas = accoes ? [...colunasMovimento, accoes] : colunasMovimento;
  const vazio = <EmptyState title="Sem movimentos" />;

  return (
    <div className="space-y-6">
      <section aria-labelledby="mov-banco" className="space-y-2">
        <h2 id="mov-banco" className="text-sm font-semibold">Extracto bancário</h2>
        <DataTable data={bancarios} columns={colunas} nextCursor={cursorBanco} cursorParam="cb" emptyState={vazio} />
      </section>
      <section aria-labelledby="mov-contab" className="space-y-2">
        <h2 id="mov-contab" className="text-sm font-semibold">Contabilidade</h2>
        <DataTable data={contabilisticos} columns={colunas} nextCursor={cursorContab} cursorParam="cc" emptyState={vazio} />
      </section>
    </div>
  );
}
