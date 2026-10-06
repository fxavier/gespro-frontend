/**
 * Contas por natureza de nota de débito (ADR-0039 §1, issue #139) — Server Component.
 *
 * Para cada natureza, a conta que a nota de débito credita por omissão. Sem
 * conta, escolhe-se em cada nota de débito. A pesquisa vai ao servidor e só
 * oferece contas de movimento activas da classe que a natureza admite.
 */

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import * as contabilidadeService from '@/server/services/financas/contabilidade.service';
import { listarContasNaturezaNotaDebito } from '@/server/services/financas/natureza-nota-debito.service';
import { ROTULO_NATUREZA_ND, classeAdmitidaParaNatureza, rotuloContaPGC } from '@/lib/nota-debito';
import { FormSection, PageHeader, type ComboboxOption } from '@/components/patterns';
import { NaturezaNotaDebitoForm } from './_components/natureza-nota-debito-form';

const TITULO = 'Contas por natureza de nota de débito';
const BREADCRUMBS = [
  { label: 'Contabilidade', href: '/contabilidade' },
  { label: 'Configurações', href: '/contabilidade/configuracoes' },
  { label: 'Naturezas de nota de débito' },
];

export default async function NaturezasNotaDebitoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId, permissions } = session.user;

  if (!permissions.includes('financas:configurar')) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader title={TITULO} breadcrumbs={BREADCRUMBS} />
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm">
          <p className="font-medium text-destructive">Acesso não autorizado</p>
          <p className="mt-1 text-muted-foreground">
            Não tem permissão para configurar as contas das notas de débito. Contacte o administrador do sistema.
          </p>
        </div>
      </div>
    );
  }

  const ctx = { tenantId, userId };
  const filtro = { aceitaLancamento: true, ativo: true, take: 50 } as const;
  const { configuracao, classe6, classe7 } = await runWithTenantContext(ctx, async () => ({
    configuracao: await listarContasNaturezaNotaDebito(ctx),
    classe6: await contabilidadeService.listarContas({ ...filtro, classe: 'CLASSE_6' }, ctx),
    classe7: await contabilidadeService.listarContas({ ...filtro, classe: 'CLASSE_7' }, ctx),
  }));
  const primeiraPagina = {
    CLASSE_6: classe6.items.map((c) => ({ value: c.id, label: rotuloContaPGC(c) })),
    CLASSE_7: classe7.items.map((c) => ({ value: c.id, label: rotuloContaPGC(c) })),
  };

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title={TITULO}
        description="Conta que cada nota de débito credita, por natureza"
        breadcrumbs={BREADCRUMBS}
      />
      <FormSection
        title="Conta a crédito por natureza"
        description="O acerto de preço credita vendas; juros de mora e penalizações creditam rendimentos (classe 7). Uma despesa repercutida credita o gasto que a originou (classe 6). Uma natureza sem conta obriga a escolhê-la em cada nota de débito."
      >
        <div className="space-y-6">
          {configuracao.map((linha) => {
            // Primeira página da classe admitida, fundida por id com a conta actual
            // (que pode estar fora da página, ou já inactiva).
            const opcoes = new Map<string, ComboboxOption>(
              primeiraPagina[classeAdmitidaParaNatureza(linha.natureza)].map((o) => [o.value, o]),
            );
            if (linha.contaId && linha.codigo && linha.nome) {
              opcoes.set(linha.contaId, {
                value: linha.contaId,
                label: rotuloContaPGC({ codigo: linha.codigo, nome: linha.nome }),
              });
            }
            return (
              <NaturezaNotaDebitoForm
                key={linha.natureza}
                natureza={linha.natureza}
                rotulo={ROTULO_NATUREZA_ND[linha.natureza]}
                contaId={linha.contaId}
                opcoesIniciais={[...opcoes.values()]}
              />
            );
          })}
        </div>
      </FormSection>
    </div>
  );
}
