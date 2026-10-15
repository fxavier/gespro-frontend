import Link from 'next/link';
import { PageHeader } from '@/components/patterns/page-header';

export const metadata = { title: 'Plataforma — GestPro' };

/**
 * Início da área do administrador geral do sistema (#525). Não mostra dados
 * de nenhum tenant. A gestão dos planos de subscrição vive em `/plataforma/planos` (#526).
 */
export default function PlataformaInicioPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Administração da plataforma"
        description="Área reservada à equipa GestPro para gerir a plataforma. Não dá acesso aos dados de nenhuma empresa cliente."
      />
      <section className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        <Link href="/plataforma/planos" className="font-medium text-primary hover:underline">
          Planos de subscrição
        </Link>{' '}
        — o catálogo que o site e o checkout mostram: criar, editar, arquivar e apagar planos.
      </section>
    </div>
  );
}
