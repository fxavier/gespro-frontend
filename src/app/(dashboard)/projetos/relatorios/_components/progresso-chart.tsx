'use client';

/**
 * ProgressoChart — gráfico de barras horizontais de progresso por projecto.
 * Dataviz: tokens CSS, dark-mode, acessível.
 * Carregado via dynamic() com skeleton.
 */

type ProjetoProgresso = {
  id: string;
  nome: string;
  codigo: string;
  status: string;
  progresso: number;
  dataFimPrevista: Date;
};

interface ProgressoChartProps {
  projetos: ProjetoProgresso[];
}

function statusCor(status: string): string {
  switch (status) {
    case 'CONCLUIDO': return 'bg-success/70';
    case 'EM_ANDAMENTO': return 'bg-primary/70';
    case 'PAUSADO': return 'bg-warning/70';
    case 'CANCELADO': return 'bg-destructive/50';
    default: return 'bg-muted-foreground/40';
  }
}

export function ProgressoChart({ projetos }: ProgressoChartProps) {
  if (projetos.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        Nenhum projecto para apresentar.
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label="Gráfico de progresso por projecto"
      className="space-y-3"
    >
      {projetos.map((p) => {
        const atrasado = p.status !== 'CONCLUIDO' && new Date(p.dataFimPrevista) < new Date();
        return (
          <div key={p.id} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium truncate max-w-[60%]" title={`${p.codigo} — ${p.nome}`}>
                <span className="font-mono text-muted-foreground mr-1">{p.codigo}</span>
                {p.nome}
              </span>
              <div className="flex items-center gap-2 flex-shrink-0">
                {atrasado && (
                  <span className="text-xs text-destructive font-medium">Atrasado</span>
                )}
                <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">
                  {p.progresso}%
                </span>
              </div>
            </div>
            <div
              className="h-2 bg-muted rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={p.progresso}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progresso de ${p.nome}: ${p.progresso}%`}
            >
              <div
                className={`h-full rounded-full transition-all ${statusCor(p.status)}`}
                style={{ width: `${p.progresso}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
