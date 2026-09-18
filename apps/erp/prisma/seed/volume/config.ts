/**
 * Perfis e volumes do gerador de carga (ADR-0018 §2).
 *
 * Os volumes base correspondem a UM tenant «PME moçambicana com dois anos de
 * operação». O perfil `multi` replica essa dimensão por 50 tenants na mesma
 * base de dados (custo do isolamento lógico); `VOLUME_SCALE` permite reduzir
 * a dimensão por tenant quando o disco/tempo da máquina local não chega —
 * o factor usado fica registado no manifesto e na linha de base.
 */

export interface VolumeProfile {
  nome: string;
  tenants: number;
  scale: number;
}

/** Volumes por tenant à escala 1 (ADR-0018 §2). */
export const VOLUMES_BASE = {
  categorias: 10,
  produtos: 4000,
  variantes: 1000, // produtos + variantes = 5 000
  localizacoes: 2,
  clientes: 2000,
  vendas: 120_000,
  itensPorVenda: 2,
  movimentosStock: 400_000,
  // ADR-0018 §2 «Lançamentos contabilísticos e partidas: 250 000» conta-se
  // nas PARTIDAS: 100 000 lançamentos × ~2,5 partidas = 250 000 partidas
  // (débito principal em todos + débito secundário nos ímpares + crédito em
  // todos — ver bulk.ts). Confirmado na BD de volume: 250 000 + deltas da
  // própria campanha. NÃO subir para 250 000 lançamentos sem rever o ADR.
  lancamentos: 100_000,
  faturas: 60_000,
  linhasPorFatura: 2,
  colaboradores: 80,
  mesesFolha: 24,
  auditoria: 1_000_000,
  /** Histórico de transacções do cliente-alvo da exportação XLSX. */
  historicoExport: 6000,
  contasPGC: 30,
  diarios: 4,
  centrosCusto: 5,
  departamentos: 5,
  cargos: 8,
} as const;

export type Volumes = { [K in keyof typeof VOLUMES_BASE]: number };

/** Aplica o factor de escala aos volumes que crescem com o tempo de operação. */
export function volumesEscalados(scale: number): Volumes {
  const fixos: (keyof typeof VOLUMES_BASE)[] = [
    'categorias',
    'localizacoes',
    'contasPGC',
    'diarios',
    'centrosCusto',
    'departamentos',
    'cargos',
    'itensPorVenda',
    'linhasPorFatura',
  ];
  const out = {} as Record<string, number>;
  for (const [k, v] of Object.entries(VOLUMES_BASE)) {
    out[k] = fixos.includes(k as keyof typeof VOLUMES_BASE)
      ? v
      : Math.max(1, Math.round(v * scale));
  }
  // O cenário de payroll precisa de um quadro de pessoal íntegro.
  out.colaboradores = Math.max(8, out.colaboradores);
  out.mesesFolha = Math.min(24, Math.max(3, out.mesesFolha));
  return out as Volumes;
}

export function resolverPerfil(): VolumeProfile {
  const nome = process.env.VOLUME_PROFILE ?? 'pme';
  const scaleEnv = process.env.VOLUME_SCALE ? Number(process.env.VOLUME_SCALE) : undefined;
  switch (nome) {
    case 'pme':
      return { nome, tenants: 1, scale: scaleEnv ?? 1 };
    case 'multi':
      return { nome, tenants: Number(process.env.VOLUME_TENANTS ?? 50), scale: scaleEnv ?? 1 };
    case 'ci':
      // Subconjunto do volume (ADR-0018 §6): detector de regressões, não capacidade.
      return { nome, tenants: 1, scale: scaleEnv ?? 0.05 };
    default:
      throw new Error(`VOLUME_PROFILE desconhecido: ${nome} (use pme | multi | ci)`);
  }
}
