/**
 * Regras de sugestão de lançamento — Server Component (issue #140).
 *
 * Quando um movimento do extracto fica sem correspondência, a reconciliação
 * propõe um lançamento pela primeira regra activa (menor prioridade) cujo padrão
 * apareça na descrição. Lê quem tiver `financas:banca:reconciliacao` ou
 * `financas:leitura`; «Nova regra» e as acções por linha só com a primeira.
 */
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/patterns';
import { Button } from '@/components/ui/button';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { listarRegrasSugestao } from '@/server/services/reconciliacao/regras-sugestao.service';
import { acessoRegras } from './_components/acesso';
import { SemPermissao } from '@/components/patterns/sem-permissao';
import { RegrasTable, type RegraLinha } from './_components/regras-table';
import { ROTA_REGRAS, ROTULO_NATUREZA_REGRA } from './_components/rotulos';

const CABECALHO = {
  title: 'Regras de sugestão',
  description:
    'Palavras da descrição do extracto que sugerem a conta de contrapartida de um lançamento. Só sugerem: lançar é sempre acto do utilizador.',
  breadcrumbs: [
    { label: 'Contabilidade', href: '/contabilidade' },
    { label: 'Reconciliação Bancária', href: '/contabilidade/reconciliacao' },
    { label: 'Regras de sugestão' },
  ],
};

export default async function RegrasSugestaoPage() {
  const acesso = await acessoRegras();
  if (!acesso.podeLer) {
    return (
      <div className="p-6 space-y-6">
        <PageHeader {...CABECALHO} />
        <SemPermissao testId="regras-sem-permissao" mensagem="Não tem permissão para consultar as regras de sugestão. Contacte o administrador do sistema." />
      </div>
    );
  }

  const regras = await runWithTenantContext(acesso.ctx, () => listarRegrasSugestao(acesso.ctx));
  const linhas: RegraLinha[] = regras.map((r) => ({
    id: r.id,
    prioridade: r.prioridade,
    padrao: r.padrao,
    descricao: r.descricao,
    movimento: ROTULO_NATUREZA_REGRA[r.natureza],
    contaBancaria: r.contaBancaria ? `${r.contaBancaria.banco} — ${r.contaBancaria.numeroConta}` : null,
    contrapartida: r.contaContrapartida
      ? `${r.contaContrapartida.codigo} · ${r.contaContrapartida.nome}`
      : 'Conta não encontrada',
    ativo: r.ativo,
  }));

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        {...CABECALHO}
        actions={
          acesso.podeEscrever ? (
            <Button asChild size="sm">
              <Link href={`${ROTA_REGRAS}/nova`}>
                <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />
                Nova regra
              </Link>
            </Button>
          ) : undefined
        }
      />
      <RegrasTable data={linhas} podeEscrever={acesso.podeEscrever} />
    </div>
  );
}
