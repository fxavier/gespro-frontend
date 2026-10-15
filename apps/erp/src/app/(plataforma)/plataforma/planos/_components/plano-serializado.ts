import type { PlanoAdmin } from '@/server/services/plataforma/plano-admin.service';

/**
 * Um plano como atravessa a fronteira Servidor→Cliente: `Decimal` → string, datas → ISO.
 * Módulo neutro (nem 'use client' nem server-only): as páginas convertem, os componentes
 * cliente só conhecem o tipo.
 */
export interface PlanoSerializado {
  id: string;
  codigo: string;
  nome: string;
  descricao: string;
  precoMensalUsd: string;
  precoAnualUsd: string;
  stripePriceIdMensal: string | null;
  stripePriceIdAnual: string | null;
  limiteUtilizadores: number;
  limiteArmazens: number;
  suporte: string;
  funcionalidades: string[];
  ordem: number;
  destaque: boolean;
  arquivadoEm: string | null;
  assinaturas: number;
}

export function serializarPlano(p: PlanoAdmin): PlanoSerializado {
  return {
    id: p.id,
    codigo: p.codigo,
    nome: p.nome,
    descricao: p.descricao,
    precoMensalUsd: p.precoMensalUsd.toString(),
    precoAnualUsd: p.precoAnualUsd.toString(),
    stripePriceIdMensal: p.stripePriceIdMensal,
    stripePriceIdAnual: p.stripePriceIdAnual,
    limiteUtilizadores: p.limiteUtilizadores,
    limiteArmazens: p.limiteArmazens,
    suporte: p.suporte,
    funcionalidades: [...p.funcionalidades],
    ordem: p.ordem,
    destaque: p.destaque,
    arquivadoEm: p.arquivadoEm ? p.arquivadoEm.toISOString() : null,
    assinaturas: p.assinaturas,
  };
}

/** -1 = ilimitado (ADR-0027 §3). */
export function formatarLimite(n: number): string {
  return n === -1 ? '∞' : String(n);
}

export function formatarUsd(valor: string): string {
  const n = Number(valor);
  if (Number.isNaN(n)) return '—';
  return `US$ ${n.toFixed(2)}`;
}
