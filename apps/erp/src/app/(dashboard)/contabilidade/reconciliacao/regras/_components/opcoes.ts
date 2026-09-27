import 'server-only';
import type { ComboboxOption } from '@/components/patterns';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { listarContas, listarContasBancarias, obterConta } from '@/server/services/financas/contabilidade.service';
import type { AcessoRegras } from './acesso';

/** Primeira página de contrapartidas; o resto chega pela pesquisa no servidor. */
const PRIMEIRA_PAGINA = 50;

/**
 * Opções dos dois comboboxes do formulário da regra. A contrapartida e a conta
 * bancária actuais (edição) entram sempre, mesmo fora da primeira página ou já
 * inactivas — senão o campo aparecia vazio com um valor escolhido.
 */
export async function opcoesFormularioRegra(
  ctx: AcessoRegras['ctx'],
  actual?: { contaContrapartidaId: string; contaBancariaId: string | null },
): Promise<{ contrapartidasIniciais: ComboboxOption[]; contasBancarias: ComboboxOption[] }> {
  return runWithTenantContext(ctx, async () => {
    const [pagina, bancarias] = await Promise.all([
      listarContas({ aceitaLancamento: true, ativo: true, take: PRIMEIRA_PAGINA }, ctx),
      listarContasBancarias(ctx),
    ]);
    const contas = [...pagina.items];
    if (actual && !contas.some((c) => c.id === actual.contaContrapartidaId)) {
      const contaActual = await obterConta(actual.contaContrapartidaId, ctx);
      if (contaActual) contas.unshift(contaActual);
    }
    return {
      contrapartidasIniciais: contas.map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nome}` })),
      contasBancarias: bancarias
        .filter((b) => b.ativo || b.id === actual?.contaBancariaId)
        .map((b) => ({
          value: b.id,
          label: `${b.banco} — ${b.numeroConta}${b.ativo ? '' : ' (inactiva)'}`,
        })),
    };
  });
}
