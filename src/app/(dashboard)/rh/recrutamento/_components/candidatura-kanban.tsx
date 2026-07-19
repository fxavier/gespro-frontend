'use client';

import Link from 'next/link';
import { StatusBadge } from '@/components/patterns';
import { TRANSICOES_CANDIDATURA } from '@/lib/state-machines';

type EntrevistaItem = {
  id: string;
  tipo: string;
  dataHora: Date;
  avaliacao: unknown | null;
  recomendaAvancar: boolean | null;
};

type CandidaturaItem = {
  id: string;
  etapa: string;
  posicao: string;
  candidato: { id: string; nome: string; email: string };
  entrevistas: EntrevistaItem[];
  pretensaoSalarial: string | null;
};

const ETAPAS_ORDENADAS = ['RECEBIDA', 'TRIAGEM', 'ENTREVISTA', 'PROPOSTA', 'CONTRATADO'] as const;
const ETAPAS_TERMINAIS = ['REJEITADO', 'DESISTIU'] as const;

const ETAPA_LABELS: Record<string, string> = {
  RECEBIDA: 'Recebida',
  TRIAGEM: 'Triagem',
  ENTREVISTA: 'Entrevista',
  PROPOSTA: 'Proposta',
  CONTRATADO: 'Contratado',
  REJEITADO: 'Rejeitado',
  DESISTIU: 'Desistiu',
};

interface CandidaturaKanbanProps {
  candidaturas: CandidaturaItem[];
  vagaId: string;
  vagaStatus: string;
}

export function CandidaturaKanban({ candidaturas, vagaId, vagaStatus }: CandidaturaKanbanProps) {
  // Agrupa por etapa e ordena por posicao
  const porEtapa: Record<string, CandidaturaItem[]> = {};
  const todasEtapas = [...ETAPAS_ORDENADAS, ...ETAPAS_TERMINAIS];

  for (const etapa of todasEtapas) {
    porEtapa[etapa] = candidaturas
      .filter((c) => c.etapa === etapa)
      .sort((a, b) => a.posicao.localeCompare(b.posicao, undefined, { numeric: true }));
  }

  // Mostrar terminais apenas se tiverem candidaturas
  const etapasVisíveis = [
    ...ETAPAS_ORDENADAS,
    ...ETAPAS_TERMINAIS.filter((e) => porEtapa[e].length > 0),
  ];

  if (candidaturas.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-sm">Nenhuma candidatura nesta vaga ainda.</p>
        {(vagaStatus === 'ABERTA' || vagaStatus === 'EM_TRIAGEM') && (
          <p className="text-xs mt-1">Use o separador &quot;Adicionar Candidato&quot; para registar candidatos.</p>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-4 min-w-max">
        {etapasVisíveis.map((etapa) => {
          const items = porEtapa[etapa] ?? [];
          return (
            <div
              key={etapa}
              className="w-64 flex-shrink-0 rounded-lg border bg-muted/20 p-3 space-y-2"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">{ETAPA_LABELS[etapa]}</span>
                <span className="text-xs text-muted-foreground bg-background rounded-full px-2 py-0.5 border">
                  {items.length}
                </span>
              </div>

              {items.length === 0 ? (
                <div className="rounded border border-dashed bg-background/50 p-4 text-center">
                  <p className="text-xs text-muted-foreground">Sem candidaturas</p>
                </div>
              ) : (
                items.map((c) => (
                  <Link
                    key={c.id}
                    href={`/rh/recrutamento/candidaturas/${c.id}`}
                    className="block rounded border bg-background p-3 space-y-2 hover:shadow-sm hover:border-primary/50 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-tight truncate">{c.candidato.nome}</p>
                      <StatusBadge status={c.etapa} className="shrink-0" />
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{c.candidato.email}</p>
                    {c.pretensaoSalarial && (
                      <p className="text-xs text-muted-foreground tabular-nums">
                        MT {parseFloat(c.pretensaoSalarial).toLocaleString('pt-MZ')}
                      </p>
                    )}
                    {c.entrevistas.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {c.entrevistas.length} entrevista{c.entrevistas.length !== 1 ? 's' : ''}
                      </p>
                    )}
                  </Link>
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
