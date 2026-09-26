import 'server-only';
import { ValidationError } from '@/lib/errors';
import type {
  InstantaneoDeFn,
  InstantaneoMapeamento,
  MapeamentoInstantaneo,
  MudouFn,
  RubricaInstantaneo,
} from './dfc.interface';

/**
 * Versão do mapeamento da DFC — a parte pura (ADR-0037 E1; nó `nucleo`,
 * ticket 3.2). Duas decisões e só duas:
 *  - `instantaneoDe`: a forma CANÓNICA do instantâneo de uma versão (V1);
 *  - `mudou`: a igualdade estrutural que diz se uma escrita cria a versão
 *    n+1 (V2 — «uma escrita que não muda nada não cria versão»).
 * Quem grava, tranca e valida é o serviço (nó `config`).
 *
 * A ordem canónica é por ponto de código (`<`), não por locale: um
 * instantâneo gravado hoje tem de comparar igual a si próprio quando for
 * lido daqui a anos noutra máquina.
 */

function porPontoDeCodigo(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function ordenarRubricas(rubricas: readonly RubricaInstantaneo[]): RubricaInstantaneo[] {
  return [...rubricas].sort((a, b) => porPontoDeCodigo(a.codigo, b.codigo) || porPontoDeCodigo(a.id, b.id));
}

function ordenarMapeamentos(mapeamentos: readonly MapeamentoInstantaneo[]): MapeamentoInstantaneo[] {
  return [...mapeamentos].sort(
    (a, b) => porPontoDeCodigo(a.contaId, b.contaId) || porPontoDeCodigo(a.rubricaId, b.rubricaId),
  );
}

export const instantaneoDe: InstantaneoDeFn = (rubricas, mapeamentos) => {
  // Só os oito campos que decidem o mapa: sem tenantId, datas nem deletedAt.
  const vivas: RubricaInstantaneo[] = rubricas
    .filter((r) => r.deletedAt === null)
    .map((r) => ({
      id: r.id,
      codigo: r.codigo,
      designacao: r.designacao,
      atividade: r.atividade,
      sinal: r.sinal,
      ordem: r.ordem,
      origem: r.origem,
      ativo: r.ativo,
    }));
  const idsVivas = new Set(vivas.map((r) => r.id));

  // Uma versão que não se reconcilia consigo própria não se congela: a mesma
  // conta em dois mapeamentos contaria a conta em duas actividades; um
  // mapeamento para uma rubrica apagada ou inexistente é lixo com número de versão.
  const contasVistas = new Set<string>();
  const maps: MapeamentoInstantaneo[] = [];
  for (const m of mapeamentos) {
    if (contasVistas.has(m.contaId)) {
      throw new ValidationError(`A conta ${m.contaId} aparece em dois mapeamentos.`, { contaId: m.contaId });
    }
    contasVistas.add(m.contaId);
    if (!idsVivas.has(m.rubricaId)) {
      throw new ValidationError(`O mapeamento da conta ${m.contaId} aponta para uma rubrica apagada ou inexistente.`, {
        contaId: m.contaId,
        rubricaId: m.rubricaId,
      });
    }
    maps.push({ contaId: m.contaId, rubricaId: m.rubricaId });
  }

  return { rubricas: ordenarRubricas(vivas), mapeamentos: ordenarMapeamentos(maps) };
};

function rubricasIguais(a: RubricaInstantaneo, b: RubricaInstantaneo): boolean {
  return (
    a.id === b.id &&
    a.codigo === b.codigo &&
    a.designacao === b.designacao &&
    a.atividade === b.atividade &&
    a.sinal === b.sinal &&
    a.ordem === b.ordem &&
    a.origem === b.origem &&
    a.ativo === b.ativo
  );
}

function canonico(i: InstantaneoMapeamento): InstantaneoMapeamento {
  return { rubricas: ordenarRubricas(i.rubricas), mapeamentos: ordenarMapeamentos(i.mapeamentos) };
}

export const mudou: MudouFn = (anterior, novo) => {
  // A primeira versão existe sempre.
  if (anterior === null) return true;
  // Compara-se na ordem canónica também quando um dos lados chega desordenado
  // (uma versão antiga lida da base).
  const a = canonico(anterior);
  const b = canonico(novo);
  if (a.rubricas.length !== b.rubricas.length || a.mapeamentos.length !== b.mapeamentos.length) return true;
  for (let i = 0; i < a.rubricas.length; i++) {
    if (!rubricasIguais(a.rubricas[i], b.rubricas[i])) return true;
  }
  for (let i = 0; i < a.mapeamentos.length; i++) {
    if (a.mapeamentos[i].contaId !== b.mapeamentos[i].contaId || a.mapeamentos[i].rubricaId !== b.mapeamentos[i].rubricaId) {
      return true;
    }
  }
  return false;
};
