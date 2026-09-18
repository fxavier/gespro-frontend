/**
 * Painel imersivo dos ecrãs de autenticação.
 *
 * Escuro nos DOIS temas: a classe `dark` redefine aqui os tokens de marca, por
 * isso não há uma cor literal em lado nenhum — o painel é escuro porque usa a
 * paleta escura, não porque alguém lhe escreveu um azul-marinho.
 *
 * O que diz é verificável no produto: isolamento por tenant, trilho de
 * auditoria e o plano PGC-NIRF. Não há testemunhos, percentagens de
 * disponibilidade nem selos de conformidade — não há produção para os
 * sustentar (ADR-0026 §5), e um selo falso num ecrã de login é a pior
 * primeira impressão possível.
 *
 * Escondido abaixo de `lg`: no telemóvel o que interessa é o formulário.
 */

import { Building2, FileSpreadsheet, History } from 'lucide-react';
import { formatMZN } from '@/lib/format-currency';

/** Valores de amostra do painel — ilustração, e rotulados como tal no ecrã. */
const AMOSTRA = {
  faturacao: 48250,
  variacao: '+18,4%',
  transacoes: '1 420',
  margem: '41,8%',
};

const ATRIBUTOS = [
  { icone: Building2, titulo: 'Tenant isolado' },
  { icone: History, titulo: 'Trilho de auditoria' },
  { icone: FileSpreadsheet, titulo: 'PGC-NIRF' },
];

export function PainelInstitucional() {
  return (
    <aside className="dark relative hidden overflow-hidden bg-background p-10 text-foreground lg:col-span-5 lg:flex lg:flex-col lg:justify-between">
      {/* Halos de fundo — cor de marca, opacidade baixa, sem literais. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-primary/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-24 size-80 rounded-full bg-info/10 blur-3xl"
      />

      <div className="relative z-10 flex items-center justify-between gap-2">
        <span className="rounded-full bg-foreground/10 px-3 py-1 text-xs font-medium">
          ERP para empresas moçambicanas
        </span>
        <span className="text-xs text-muted-foreground">MZN · pt-MZ</span>
      </div>

      <div className="relative z-10 my-8 space-y-4">
        <div className="rounded-xl bg-foreground/5 p-5 shadow-md">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Faturação consolidada
            </span>
            <span className="rounded-full bg-success px-2 py-0.5 text-xs font-semibold text-success-foreground">
              {AMOSTRA.variacao} este mês
            </span>
          </div>

          <p className="mb-3 text-3xl font-bold tracking-tight tabular-nums">
            {formatMZN(AMOSTRA.faturacao)}
          </p>

          {/* Sparkline decorativa. `currentColor` herda o azul de marca: um
              gradiente SVG não aceita classes utilitárias no `stop-color`. */}
          <div className="h-14 w-full text-primary">
            <svg
              viewBox="0 0 280 60"
              fill="none"
              preserveAspectRatio="none"
              className="h-full w-full"
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="gradiente-amostra" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 45 C40 42, 60 48, 90 32 C120 16, 150 28, 190 18 C230 8, 250 14, 280 4"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <path
                d="M0 45 C40 42, 60 48, 90 32 C120 16, 150 28, 190 18 C230 8, 250 14, 280 4 L280 60 L0 60 Z"
                fill="url(#gradiente-amostra)"
              />
            </svg>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
            <span>
              Transações: <strong className="font-semibold text-foreground">{AMOSTRA.transacoes}</strong>
            </span>
            <span className="text-right">
              Margem bruta: <strong className="font-semibold text-foreground">{AMOSTRA.margem}</strong>
            </span>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Valores de exemplo, para ilustrar o painel de faturação.
        </p>

        <div className="grid grid-cols-3 gap-2">
          {ATRIBUTOS.map(({ icone: Icone, titulo }) => (
            <div key={titulo} className="rounded-lg bg-foreground/5 p-3 text-center">
              <Icone className="mx-auto mb-1.5 size-5 text-primary" aria-hidden="true" />
              <p className="text-xs text-muted-foreground">{titulo}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl bg-foreground/5 p-5">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Contabilidade por partida dobrada sobre o plano PGC-NIRF (Decreto 70/2009), IVA, INSS e
            IRPS calculados pelas tabelas em vigor, e cada documento numerado por série, sem lacunas.
          </p>
        </div>
      </div>

      <p className="relative z-10 text-xs text-muted-foreground">
        GestPro · gestão empresarial multi-empresa
      </p>
    </aside>
  );
}
