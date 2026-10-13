/**
 * Nomes das classes do plano PGC-NIRF (Decreto 70/2009) — fonte única para a UI.
 *
 * Client-safe (sem `server-only`): o formulário de conta é Client Component. Os
 * valores são os nomes das contas de nível 1 de `prisma/seed/data/plano-contas-pgc.json`;
 * há teste a trancar a concordância (#142 — o formulário dizia «Classe 4 — Investimentos»).
 */
import type { z } from 'zod';
import type { ClassePGCEnum } from '@/lib/validations/contabilidade';

type ClassePGC = z.infer<typeof ClassePGCEnum>;

export const CLASSE_PGC_LABEL: Record<ClassePGC, string> = {
  CLASSE_1: 'Classe 1 — Meios financeiros',
  CLASSE_2: 'Classe 2 — Inventários e activos biológicos',
  CLASSE_3: 'Classe 3 — Investimentos de capital',
  CLASSE_4: 'Classe 4 — Contas a receber, contas a pagar, acréscimos e diferimentos',
  CLASSE_5: 'Classe 5 — Capital próprio',
  CLASSE_6: 'Classe 6 — Gastos e perdas',
  CLASSE_7: 'Classe 7 — Rendimentos e ganhos',
  CLASSE_8: 'Classe 8 — Resultados',
};
