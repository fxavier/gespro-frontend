/**
 * Layout de Requisições de Compra.
 * Renderiza {children} (lista ou detalhe) + {panel} (painel lateral via rota paralela @panel).
 *
 * Padrão: parallel routes + intercepting routes.
 * Quando se navega client-side para /compras/requisicoes/[id]:
 *   - children = lista (page.tsx)
 *   - panel = @panel/(.)[id]/page.tsx (painel de inspecção rápida)
 * Quando se acede directamente ao URL:
 *   - children = [id]/page.tsx (detalhe completo)
 *   - panel = @panel/default.tsx (null)
 */
export default function RequisicoesLayout({
  children,
  panel,
}: {
  children: React.ReactNode;
  panel: React.ReactNode;
}) {
  return (
    <div className="flex h-full overflow-hidden">
      {/* Conteúdo principal: lista ou detalhe completo */}
      <div className="flex-1 min-w-0 overflow-auto">
        {children}
      </div>

      {/* Painel lateral de inspecção rápida */}
      {panel}
    </div>
  );
}
