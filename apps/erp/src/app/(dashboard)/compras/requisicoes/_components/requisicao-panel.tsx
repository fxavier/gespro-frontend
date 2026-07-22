'use client';

import { useEffect, useRef, useId } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { X, ExternalLink, Edit } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StatusBadge } from '@/components/patterns';
import type { RequisicaoCompraDetalhe } from '@/server/services/compras/compras.service.interface';
import { RequisicaoAcoes } from './requisicao-acoes';

interface RequisicaoPainelProps {
  requisicao: RequisicaoCompraDetalhe;
}

/**
 * Painel lateral de inspecção rápida de uma requisição.
 *
 * Implementado como aside posicionado com CSS (não usa Dialog/Modal).
 * Gestão de acessibilidade:
 *   - role="dialog" + aria-modal="true" — anuncia como diálogo a leitores de ecrã
 *   - aria-labelledby — aponta para o título do painel
 *   - Tecla Esc fecha o painel (useEffect + keyboard listener)
 *   - Auto-foco no botão fechar ao montar (useRef + focus())
 *
 * Fechar: tecla Esc, clique no X, ou clique no overlay de fundo.
 */
export function RequisicaoPainel({ requisicao }: RequisicaoPainelProps) {
  const router = useRouter();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  const handleClose = () => {
    router.back();
  };

  // Auto-foco no botão fechar ao montar
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Tecla Esc fecha o painel
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const podeEditar = requisicao.status === 'RASCUNHO' || requisicao.status === 'PENDENTE';

  const valorFormatado = requisicao.valorTotal.toLocaleString('pt-MZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const dataFormatada = new Date(requisicao.data).toLocaleDateString('pt-MZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <>
      {/* Overlay de fundo — fecha ao clicar */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Painel lateral com gestão de foco e Esc */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed right-0 top-0 bottom-0 z-50 flex w-full max-w-md flex-col bg-background shadow-xl border-l"
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 id={titleId} className="text-base font-semibold">
                {requisicao.numero}
              </h2>
              <StatusBadge status={requisicao.status} />
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{dataFormatada}</p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              asChild
              aria-label="Abrir detalhe completo"
            >
              <Link href={`/compras/requisicoes/${requisicao.id}`}>
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              ref={closeButtonRef}
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleClose}
              aria-label="Fechar painel (Esc)"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Conteúdo com scroll */}
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-5">
            {/* Resumo em grelha */}
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Solicitante</dt>
                <dd className="text-sm mt-0.5">{requisicao.solicitanteNome}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Departamento</dt>
                <dd className="text-sm mt-0.5">{requisicao.departamento}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Prioridade</dt>
                <dd className="mt-0.5">
                  {/* StatusBadge usa STATUS_MAP global (URGENTE/ALTA/MEDIA/BAIXA) */}
                  <StatusBadge status={requisicao.prioridade} />
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Valor Total</dt>
                <dd className="text-sm font-semibold mt-0.5 tabular-nums">
                  MT {valorFormatado}
                </dd>
              </div>
              {requisicao.dataEntregaDesejada && (
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">Entrega Desejada</dt>
                  <dd className="text-sm mt-0.5">
                    {new Date(requisicao.dataEntregaDesejada).toLocaleDateString('pt-MZ')}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-medium text-muted-foreground">Aprovação</dt>
                <dd className="text-sm mt-0.5 tabular-nums">
                  {requisicao.nivelAprovacaoActual}/{requisicao.totalNiveis} níveis
                </dd>
              </div>
            </dl>

            <Separator />

            {/* Justificativa */}
            <div>
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                Justificativa
              </h3>
              <p className="text-sm leading-relaxed">{requisicao.justificativa}</p>
            </div>

            {/* Itens (máx. 5 + contador) */}
            {requisicao.itens && requisicao.itens.length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    Itens ({requisicao.itens.length})
                  </h3>
                  <div className="space-y-2">
                    {requisicao.itens.slice(0, 5).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between gap-2 text-sm"
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{item.descricao}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {item.quantidade} {item.unidadeMedida}
                          </p>
                        </div>
                        <span className="tabular-nums text-right flex-shrink-0">
                          MT{' '}
                          {item.precoEstimado.toLocaleString('pt-MZ', {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </div>
                    ))}
                    {requisicao.itens.length > 5 && (
                      <p className="text-xs text-muted-foreground">
                        +{requisicao.itens.length - 5} itens adicionais
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>

        {/* Acções contextuais por estado */}
        <div className="border-t p-4 flex-shrink-0 space-y-2">
          <Button asChild className="w-full">
            <Link href={`/compras/requisicoes/${requisicao.id}`}>
              Ver detalhe completo
            </Link>
          </Button>

          <div className="flex gap-2">
            {podeEditar && (
              <Button variant="outline" size="sm" className="flex-1" asChild>
                <Link href={`/compras/requisicoes/${requisicao.id}/editar`}>
                  <Edit className="h-4 w-4 mr-1.5" />
                  Editar
                </Link>
              </Button>
            )}
            {/* RequisicaoAcoes: padrão canónico de mutação — AlterDialog para cancelar */}
            <div className="flex-1">
              <RequisicaoAcoes
                id={requisicao.id}
                status={requisicao.status}
                modoCompacto
              />
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
