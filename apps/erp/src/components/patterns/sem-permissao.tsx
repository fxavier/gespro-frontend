import Link from 'next/link';
import { Button } from '@/components/ui/button';

/**
 * «Sem permissão» — o único aviso da casa para uma página que o utilizador não pode
 * ver (#76). Usado pela guarda de módulo (`exigirPermissaoPagina`, `lib/auth`) e pelas
 * páginas que distinguem leitura de escrita (séries, DFC, regras, exercícios,
 * documentos de faturação).
 */
export function SemPermissao({
  mensagem = 'Não tem permissão para consultar esta página. Contacte o administrador do sistema.',
  voltar,
  testId = 'sem-permissao',
}: {
  mensagem?: string;
  /** Ligação de regresso (ex.: ao documento de onde se veio). */
  voltar?: { href: string; rotulo: string };
  testId?: string;
}) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm"
      data-testid={testId}
    >
      <p className="font-medium text-destructive">Sem permissão</p>
      <p className="mt-1 text-muted-foreground">{mensagem}</p>
      {voltar && (
        <Button asChild size="sm" variant="outline" className="mt-4">
          <Link href={voltar.href}>{voltar.rotulo}</Link>
        </Button>
      )}
    </div>
  );
}
