import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { tenantAdminService } from '@/server/services/plataforma/tenant-admin.service';
import { PageHeader } from '@/components/patterns';
import { DadosEmpresaForm } from './_components/dados-empresa-form';

/**
 * /definicoes/empresa — dados da empresa e configuração fiscal (#177).
 *
 * Server Component: lê o tenant da sessão e passa os valores (strings) à folha cliente.
 * O que se grava aqui é o emitente do PDF fiscal: nome, NUIT, morada e regime de IVA.
 */
export const metadata = { title: 'Dados da empresa — GestPro' };

export default async function DadosEmpresaPage() {
  const session = await auth();
  if (!session?.user) redirect('/auth/login');

  const tenant = await tenantAdminService.obter(session.user.tenantId);
  const cfg = tenant.configuracaoFiscal;

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Dados da empresa"
        description="Identificação e configuração fiscal que saem no cabeçalho dos documentos fiscais"
        breadcrumbs={[{ label: 'Administração', href: '/core-tenancy' }, { label: 'Dados da empresa' }]}
      />
      <DadosEmpresaForm
        valoresIniciais={{
          nome: tenant.nome,
          nuit: tenant.nuit,
          regimeIva: cfg?.regimeIva ?? 'NORMAL',
          endereco: cfg?.endereco ?? '',
          cidade: cfg?.cidade ?? '',
          provincia: cfg?.provincia ?? undefined,
          codigoPostal: cfg?.codigoPostal ?? '',
          email: cfg?.email ?? '',
          telefone: cfg?.telefone ?? '',
        }}
      />
    </div>
  );
}
