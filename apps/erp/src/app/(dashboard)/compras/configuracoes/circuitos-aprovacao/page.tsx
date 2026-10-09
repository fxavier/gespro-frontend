/**
 * Circuitos de aprovação de compras (#108) — Server Component.
 *
 * Lista os circuitos do tenant (activos e inactivos), com os níveis, as faixas de valor,
 * o quórum e os aprovadores. Só um circuito activo por tipo de documento: é esse que o
 * «Submeter» de uma requisição usa. Criar e editar são rotas próprias (`novo`, `[id]/editar`),
 * nunca Dialog; desactivar só pede confirmação (AlertDialog).
 */

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Pencil, Plus } from 'lucide-react';
import { auth } from '@/lib/auth';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { comprasService } from '@/server/services/compras/compras.service';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, PageHeader, StatusBadge } from '@/components/patterns';
import { formatMZN } from '@/lib/format-currency';
import { ROTULO_TIPO_CIRCUITO, ROTULO_TIPO_APROVACAO } from '@/lib/compras-aprovacao';
import { DesactivarCircuito } from './_components/desactivar-circuito';

export default async function CircuitosAprovacaoPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');
  const { tenantId, id: userId, permissions } = session.user;
  const ctx = { tenantId, userId };

  const circuitos = await runWithTenantContext(ctx, () => comprasService.listarConfiguracoesWorkflow(ctx));
  const podeConfigurar = permissions.includes('compras:configurar');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Circuitos de aprovação"
        description="Quem aprova as requisições e os pedidos de compra, por nível e faixa de valor"
        breadcrumbs={[
          { label: 'Compras', href: '/compras/requisicoes' },
          { label: 'Circuitos de aprovação' },
        ]}
        actions={
          podeConfigurar ? (
            <Button size="sm" asChild>
              <Link href="/compras/configuracoes/circuitos-aprovacao/novo">
                <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Novo circuito
              </Link>
            </Button>
          ) : undefined
        }
      />

      {circuitos.length === 0 ? (
        <EmptyState
          title="Nenhum circuito configurado"
          description="Sem circuito activo, uma requisição submetida fica aprovada de imediato."
        />
      ) : (
        <div className="space-y-6">
          {circuitos.map((c) => (
            <section key={c.id} className="rounded-lg border" aria-labelledby={`circuito-${c.id}`}>
              <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
                <div>
                  <h2 id={`circuito-${c.id}`} className="text-sm font-semibold">{c.nome}</h2>
                  <p className="text-xs text-muted-foreground">{ROTULO_TIPO_CIRCUITO[c.tipo]}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={c.ativo ? 'ATIVO' : 'INATIVO'} />
                  {podeConfigurar && (
                    <>
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/compras/configuracoes/circuitos-aprovacao/${c.id}/editar`}>
                          <Pencil className="h-4 w-4 mr-1.5" aria-hidden="true" />
                          Editar
                        </Link>
                      </Button>
                      {c.ativo && <DesactivarCircuito id={c.id} nome={c.nome} />}
                    </>
                  )}
                </div>
              </header>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Nível</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Nome</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Valor mínimo</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">Valor máximo</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Quórum</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Aprovadores</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.niveis.map((n) => (
                    <TableRow key={n.id} className="h-10">
                      <TableCell className="tabular-nums">{n.nivel}</TableCell>
                      <TableCell className="font-medium">{n.nome}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMZN(n.valorMinimo)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMZN(n.valorMaximo)}</TableCell>
                      <TableCell>{ROTULO_TIPO_APROVACAO[n.tipoAprovacao]}</TableCell>
                      <TableCell>
                        <ul className="space-y-0.5">
                          {n.aprovadores.map((a) => (
                            <li key={a.usuarioId} className="text-sm">{a.email}</li>
                          ))}
                        </ul>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
