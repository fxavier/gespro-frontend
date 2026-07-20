'use client';

/**
 * MatrizRisco — Client Component.
 * Matriz de risco 4×4 (probabilidade × impacto).
 * Dataviz: tokens CSS, dark-mode, acessível (aria-labels, contraste AA).
 * Carregado via dynamic() com skeleton no componente pai.
 */

import { useMemo } from 'react';

type RiscoMatriz = {
  id: string;
  titulo: string;
  probabilidade: string;
  impacto: string;
  severidade: number;
  status: string;
};

interface MatrizRiscoProps {
  riscos: RiscoMatriz[];
}

const PROBABILIDADES = ['BAIXA', 'MEDIA', 'ALTA', 'MUITO_ALTA'] as const;
const IMPACTOS = ['BAIXO', 'MEDIO', 'ALTO', 'MUITO_ALTO'] as const;

const PROB_LABEL: Record<string, string> = {
  BAIXA: 'Baixa', MEDIA: 'Média', ALTA: 'Alta', MUITO_ALTA: 'Muito Alta',
};
const IMPACTO_LABEL: Record<string, string> = {
  BAIXO: 'Baixo', MEDIO: 'Médio', ALTO: 'Alto', MUITO_ALTO: 'Muito Alto',
};

const PROB_PESO: Record<string, number> = { BAIXA: 1, MEDIA: 2, ALTA: 3, MUITO_ALTA: 4 };
const IMPACTO_PESO: Record<string, number> = { BAIXO: 1, MEDIO: 2, ALTO: 3, MUITO_ALTO: 4 };

function corCelula(prob: string, impacto: string): string {
  const s = (PROB_PESO[prob] ?? 1) * (IMPACTO_PESO[impacto] ?? 1);
  if (s <= 2) return 'bg-success/15 border-success/30';
  if (s <= 6) return 'bg-warning/15 border-warning/30';
  if (s <= 12) return 'bg-destructive/10 border-destructive/25';
  return 'bg-destructive/25 border-destructive/50';
}

function corBadge(severidade: number): string {
  if (severidade <= 2) return 'bg-success/80 text-success-foreground';
  if (severidade <= 6) return 'bg-warning/80 text-warning-foreground';
  if (severidade <= 12) return 'bg-destructive/50 text-destructive-foreground';
  return 'bg-destructive/80 text-destructive-foreground';
}

export function MatrizRisco({ riscos }: MatrizRiscoProps) {
  const matrizMap = useMemo(() => {
    const map: Record<string, RiscoMatriz[]> = {};
    for (const r of riscos) {
      const key = `${r.probabilidade}:${r.impacto}`;
      if (!map[key]) map[key] = [];
      map[key].push(r);
    }
    return map;
  }, [riscos]);

  if (riscos.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Nenhum risco activo para apresentar na matriz.
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label="Matriz de risco probabilidade por impacto"
      className="overflow-x-auto"
    >
      <div className="min-w-[480px]">
        {/* Cabeçalho do eixo X — Impacto */}
        <div className="flex ml-20 mb-1">
          <div className="flex-1 text-center text-xs font-semibold text-muted-foreground mb-1">
            Impacto →
          </div>
        </div>
        <div className="flex ml-20">
          {IMPACTOS.map((imp) => (
            <div key={imp} className="flex-1 text-center text-xs text-muted-foreground py-1 font-medium">
              {IMPACTO_LABEL[imp]}
            </div>
          ))}
        </div>

        {/* Grade da matriz — ordem reversa (Muito Alta em cima) */}
        {[...PROBABILIDADES].reverse().map((prob) => (
          <div key={prob} className="flex items-stretch">
            {/* Label eixo Y — Probabilidade */}
            <div className="w-20 flex items-center justify-end pr-2">
              <span className="text-xs text-muted-foreground font-medium text-right leading-tight">
                {PROB_LABEL[prob]}
              </span>
            </div>
            {/* Células */}
            {IMPACTOS.map((imp) => {
              const key = `${prob}:${imp}`;
              const celRiscos = matrizMap[key] ?? [];
              const corFundo = corCelula(prob, imp);

              return (
                <div
                  key={imp}
                  className={`flex-1 border ${corFundo} min-h-[72px] p-1.5 m-0.5 rounded-md flex flex-col gap-1`}
                  role="gridcell"
                  aria-label={`Probabilidade ${PROB_LABEL[prob]}, Impacto ${IMPACTO_LABEL[imp]}: ${celRiscos.length} risco(s)`}
                >
                  {celRiscos.map((r) => (
                    <div
                      key={r.id}
                      className={`text-xs rounded px-1 py-0.5 truncate ${corBadge(r.severidade)}`}
                      title={r.titulo}
                    >
                      {r.titulo}
                    </div>
                  ))}
                  {celRiscos.length === 0 && (
                    <div className="flex-1 flex items-center justify-center">
                      <span className="text-xs text-muted-foreground/40 select-none">—</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {/* Legenda */}
        <div className="flex gap-3 mt-4 ml-20 flex-wrap">
          {[
            { label: 'Baixo (1-2)', classe: 'bg-success/80' },
            { label: 'Médio (3-6)', classe: 'bg-warning/80' },
            { label: 'Alto (7-12)', classe: 'bg-destructive/50' },
            { label: 'Crítico (13-16)', classe: 'bg-destructive/80' },
          ].map(({ label, classe }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-sm ${classe}`} aria-hidden="true" />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
