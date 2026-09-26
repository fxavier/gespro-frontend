/**
 * Configuração do mapeamento da DFC — Server Component (spec 22 · WS-2 ·
 * ADR-0037 E1/E2/E5; nó `config` do grafo `dfc`, ticket 7.3).
 *
 * Rubricas por actividade, com as contas de cada uma; as contas folha sem
 * mapeamento; a versão actual do mapeamento. Todas as operações são rotas
 * dedicadas (nova, editar, mapear, contas de caixa, versões, validar); as
 * únicas confirmações em `AlertDialog` são as destrutivas sem dados a recolher
 * (desmapear uma conta, eliminar uma rubrica).
 *
 * As ligações por conta e por rubrica levam `prefetch={false}`: o seed mapeia
 * ~435 contas, e em produção cada `<Link>` visível pré-carrega a sua rota
 * dinâmica — eram ~900 pedidos ao servidor só por abrir a página.
 */
import Link from 'next/link';
import { History, Landmark, Link2, Plus, ShieldCheck } from 'lucide-react';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { painelConfiguracao, versaoAtual } from '@/server/services/financas/dfc.service';
import type { AtividadeFluxo } from '@/lib/validations/fluxo-caixa';
import { PageHeader, StatusBadge } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { acessoDFC, SemPermissao } from './_components/acesso';
import { BREADCRUMBS_BASE, ROTA_RUBRICAS, ROTULO_ATIVIDADE, ROTULO_SINAL } from './_components/rotulos';
import { DesmapearConta } from './_components/desmapear-conta';
import { EliminarRubrica } from './_components/eliminar-rubrica';

const ORDEM_ATIVIDADES: AtividadeFluxo[] = ['OPERACIONAL', 'INVESTIMENTO', 'FINANCIAMENTO', 'CAIXA'];

const CABECALHO = {
  title: 'Rubricas da DFC',
  description: 'Classificação das contas nas actividades da Demonstração de Fluxos de Caixa',
  breadcrumbs: [BREADCRUMBS_BASE[0], BREADCRUMBS_BASE[1], { label: 'Rubricas' }],
};

export default async function RubricasPage() {
  const acesso = await acessoDFC();
  if (!acesso.podeLer) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader {...CABECALHO} />
        <SemPermissao mensagem="Não tem permissão para consultar a configuração da DFC. Contacte o administrador do sistema." />
      </div>
    );
  }

  const { ctx, podeConfigurar, podeValidar } = acesso;
  const [painel, versao] = await runWithTenantContext(ctx, () =>
    Promise.all([painelConfiguracao(ctx), versaoAtual(ctx)]),
  );

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        {...CABECALHO}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`${ROTA_RUBRICAS}/versoes`}>
                <History className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Histórico de versões
              </Link>
            </Button>
            {podeConfigurar && (
              <>
                <Button asChild variant="outline" size="sm">
                  <Link href={`${ROTA_RUBRICAS}/contas-caixa`}>
                    <Landmark className="h-4 w-4 mr-1.5" aria-hidden="true" />
                    Contas de caixa
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={`${ROTA_RUBRICAS}/mapear`}>
                    <Link2 className="h-4 w-4 mr-1.5" aria-hidden="true" />
                    Mapear conta
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link href={`${ROTA_RUBRICAS}/nova`}>
                    <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
                    Nova rubrica
                  </Link>
                </Button>
              </>
            )}
          </div>
        }
      />

      <Card data-testid="dfc-versao-actual">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
          <div className="flex items-center gap-3 text-sm">
            {versao ? (
              <>
                <span className="font-medium">Versão {versao.numero} do mapeamento</span>
                <StatusBadge status={versao.estado} />
              </>
            ) : (
              <span className="text-muted-foreground">Mapeamento ainda não semeado neste tenant.</span>
            )}
          </div>
          {podeValidar && versao?.estado === 'PENDING' && (
            <Button asChild size="sm">
              <Link href={`${ROTA_RUBRICAS}/validar`}>
                <ShieldCheck className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Validar versão actual
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {ORDEM_ATIVIDADES.map((atividade) => {
        const linhas = painel.rubricas.filter((r) => r.rubrica.atividade === atividade);
        return (
          <Card key={atividade} data-testid={`dfc-atividade-${atividade}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{ROTULO_ATIVIDADE[atividade]}</CardTitle>
              {atividade === 'CAIXA' && (
                <CardDescription>
                  As contas desta rubrica são as de caixa e equivalentes: a variação delas é o Δcaixa com que a DFC
                  articula. Alteram-se em «Contas de caixa».
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {linhas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem rubricas nesta actividade.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Código</TableHead>
                      <TableHead>Designação e contas</TableHead>
                      <TableHead className="w-24">Sinal</TableHead>
                      <TableHead className="w-16 text-right">Ordem</TableHead>
                      <TableHead className="w-28">Estado</TableHead>
                      {podeConfigurar && <TableHead className="w-40 text-right">Acções</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.map(({ rubrica, contas }) => (
                      <TableRow key={rubrica.id} data-testid={`rubrica-${rubrica.codigo}`} className="align-top">
                        <TableCell className="font-mono text-xs">{rubrica.codigo}</TableCell>
                        <TableCell>
                          <div className="font-medium">{rubrica.designacao}</div>
                          <div className="text-xs text-muted-foreground">
                            {rubrica.origem === 'SISTEMA' ? 'Sistema' : 'Criada pelo tenant'} · {contas.length}{' '}
                            {contas.length === 1 ? 'conta' : 'contas'}
                          </div>
                          {contas.length > 0 && (
                            <ul className="mt-2 space-y-1">
                              {contas.map((c) => (
                                <li
                                  key={c.id}
                                  className="flex flex-wrap items-center gap-2 text-xs"
                                  data-testid={`conta-${c.codigo}`}
                                >
                                  <span className="font-mono">{c.codigo}</span>
                                  <span className="text-muted-foreground">{c.nome}</span>
                                  {podeConfigurar && atividade !== 'CAIXA' && (
                                    <span className="flex items-center gap-1">
                                      <Link
                                        href={`${ROTA_RUBRICAS}/mapear?contaId=${encodeURIComponent(c.id)}`}
                      prefetch={false}
                                        className="text-primary underline-offset-2 hover:underline"
                                      >
                                        Reatribuir
                                      </Link>
                                      <DesmapearConta contaId={c.id} rotulo={`${c.codigo} ${c.nome}`} />
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{ROTULO_SINAL[rubrica.sinal]}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{rubrica.ordem}</TableCell>
                        <TableCell>
                          <StatusBadge status={rubrica.ativo ? 'ATIVO' : 'INATIVO'} />
                        </TableCell>
                        {podeConfigurar && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button asChild variant="ghost" size="sm">
                                <Link href={`${ROTA_RUBRICAS}/${rubrica.id}/editar`} prefetch={false}>
                                  Editar
                                </Link>
                              </Button>
                              {rubrica.origem === 'TENANT' && (
                                <EliminarRubrica
                                  id={rubrica.id}
                                  rotulo={`${rubrica.codigo} ${rubrica.designacao}`}
                                  temContas={contas.length > 0}
                                />
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        );
      })}

      <Card data-testid="dfc-contas-sem-mapeamento">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Contas folha sem mapeamento ({painel.contasSemMapeamento.length})</CardTitle>
          <CardDescription>
            Uma conta sem mapeamento com movimento no intervalo impede a DFC: nunca conta como zero.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {painel.contasSemMapeamento.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todas as contas folha activas estão mapeadas.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {painel.contasSemMapeamento.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs">{c.codigo}</span>
                  <span>{c.nome}</span>
                  {podeConfigurar && (
                    <Link
                      href={`${ROTA_RUBRICAS}/mapear?contaId=${encodeURIComponent(c.id)}`}
                      prefetch={false}
                      className="text-xs text-primary underline-offset-2 hover:underline"
                    >
                      Mapear
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
