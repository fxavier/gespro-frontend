/**
 * Página de demonstração dos componentes de padrão.
 * Apenas disponível em ambiente de desenvolvimento.
 * URL: /dev/patterns
 */

import { notFound } from 'next/navigation';
import { Plus, ClipboardList, TrendingUp, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  PageHeader,
  StatusBadge,
  KpiCard,
  DetailShell,
  FormSection,
  Timeline,
  EmptyState,
  ErrorState,
  Stepper,
} from '@/components/patterns';
import { PatternsDataTableDemo } from './_components/patterns-datatable-demo';

export default function PatternsPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  const timelineItems = [
    { id: '1', title: 'Requisição criada', date: new Date('2026-01-10'), variant: 'default' as const },
    { id: '2', title: 'Submetida para aprovação', description: 'Enviada ao nível 1', date: new Date('2026-01-11'), variant: 'info' as const },
    { id: '3', title: 'Aprovada pelo gestor', description: 'Ana Silva aprovou', date: new Date('2026-01-12'), variant: 'success' as const },
  ];

  const stepperSteps = [
    { key: 'dados', label: 'Dados' },
    { key: 'itens', label: 'Itens' },
    { key: 'aprovacao', label: 'Aprovação' },
    { key: 'concluido', label: 'Concluído' },
  ];

  return (
    <div className="p-6 space-y-12 max-w-5xl">
      {/* PageHeader */}
      <section>
        <h2 className="text-lg font-semibold mb-4 text-muted-foreground uppercase tracking-wide text-xs">
          PageHeader
        </h2>
        <PageHeader
          title="Requisições de Compra"
          description="Gerencie as solicitações de compra da empresa"
          breadcrumbs={[
            { label: 'Compras', href: '/compras' },
            { label: 'Requisições' },
          ]}
          actions={
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nova Requisição
            </Button>
          }
        />
      </section>

      {/* StatusBadge */}
      <section>
        <h2 className="text-lg font-semibold mb-4 text-muted-foreground uppercase tracking-wide text-xs">
          StatusBadge — Todos os Estados
        </h2>
        <div className="flex flex-wrap gap-2">
          {[
            'RASCUNHO', 'PENDENTE', 'EM_APROVACAO', 'APROVADA', 'REJEITADA',
            'CANCELADA', 'CONVERTIDA', 'ENVIADO', 'CONFIRMADO', 'EM_TRANSITO',
            'RECEBIDO_PARCIAL', 'RECEBIDO_TOTAL', 'CANCELADO', 'APROVADO',
            'REJEITADO', 'ATIVO', 'INATIVO', 'SUSPENSO', 'ABERTA', 'PAGA',
            'VENCIDA', 'ABERTO', 'RESOLVIDO', 'FECHADO',
          ].map((status) => (
            <StatusBadge key={status} status={status} />
          ))}
        </div>
      </section>

      {/* KpiCard */}
      <section>
        <h2 className="text-lg font-semibold mb-4 text-muted-foreground uppercase tracking-wide text-xs">
          KpiCard
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            title="Requisições Activas"
            value="42"
            delta={12.5}
            deltaLabel="vs. mês anterior"
            icon={<ClipboardList className="h-5 w-5" />}
          />
          <KpiCard
            title="Valor Total em Aprovação"
            value="MT 1.250.000"
            delta={-3.2}
            deltaLabel="vs. mês anterior"
            icon={<TrendingUp className="h-5 w-5" />}
          />
          <KpiCard
            title="Pedidos Pendentes"
            value="8"
            delta={0}
            deltaLabel="sem alteração"
            icon={<Package className="h-5 w-5" />}
          />
          <KpiCard
            title="Fornecedores Activos"
            value="156"
            icon={<ClipboardList className="h-5 w-5" />}
            description="Total cadastrado"
          />
        </div>
      </section>

      {/* DataTable */}
      <section>
        <h2 className="text-lg font-semibold mb-4 text-muted-foreground uppercase tracking-wide text-xs">
          DataTable — Server Paginada com Cursor
        </h2>
        <PatternsDataTableDemo />
      </section>

      {/* EmptyState */}
      <section>
        <h2 className="text-lg font-semibold mb-4 text-muted-foreground uppercase tracking-wide text-xs">
          EmptyState & ErrorState
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border rounded-lg">
            <EmptyState
              title="Sem requisições"
              description="Crie a primeira requisição de compra para começar."
              action={
                <Button size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Requisição
                </Button>
              }
            />
          </div>
          <div className="border rounded-lg">
            <ErrorState
              title="Não foi possível carregar"
              message="Verifique a sua ligação e tente novamente."
              onRetry={() => console.log('retry')}
            />
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section>
        <h2 className="text-lg font-semibold mb-4 text-muted-foreground uppercase tracking-wide text-xs">
          Timeline — Histórico de Auditoria
        </h2>
        <div className="max-w-lg border rounded-lg p-5">
          <Timeline items={timelineItems} />
        </div>
      </section>

      {/* Stepper */}
      <section>
        <h2 className="text-lg font-semibold mb-4 text-muted-foreground uppercase tracking-wide text-xs">
          Stepper — Wizard Multi-Passo
        </h2>
        <div className="border rounded-lg p-6 space-y-4">
          <Stepper steps={stepperSteps} currentStep="itens" />
        </div>
      </section>

      {/* DetailShell */}
      <section>
        <h2 className="text-lg font-semibold mb-4 text-muted-foreground uppercase tracking-wide text-xs">
          DetailShell — Detalhe com Abas
        </h2>
        <DetailShell
          header={
            <PageHeader
              title="REQ-001"
              description="Requisição de equipamento informático"
              breadcrumbs={[
                { label: 'Compras', href: '/compras' },
                { label: 'Requisições', href: '/compras/requisicoes' },
                { label: 'REQ-001' },
              ]}
              badge={<StatusBadge status="APROVADA" />}
              actions={
                <Button variant="outline" size="sm">Editar</Button>
              }
            />
          }
          tabs={[
            {
              key: 'itens',
              label: 'Itens',
              count: 3,
              content: (
                <div className="p-4 border rounded-lg text-sm text-muted-foreground">
                  Lista de itens da requisição...
                </div>
              ),
            },
            {
              key: 'aprovacoes',
              label: 'Aprovações',
              count: 2,
              content: (
                <div className="p-4 border rounded-lg text-sm text-muted-foreground">
                  Histórico de aprovações...
                </div>
              ),
            },
            {
              key: 'historico',
              label: 'Histórico',
              content: <Timeline items={timelineItems} />,
            },
          ]}
          metadata={[
            { label: 'Criada em', value: '10/01/2026' },
            { label: 'Solicitante', value: 'Ana Silva' },
            { label: 'Departamento', value: 'TI' },
            { label: 'Prioridade', value: <StatusBadge status="ALTA" label="Alta" /> },
            { label: 'Valor Total', value: <span className="font-medium tabular-nums">MT 15.000,00</span> },
          ]}
        />
      </section>

      {/* FormSection */}
      <section>
        <h2 className="text-lg font-semibold mb-4 text-muted-foreground uppercase tracking-wide text-xs">
          FormSection
        </h2>
        <div className="space-y-4 max-w-lg">
          <FormSection
            title="Informações Gerais"
            description="Dados principais da requisição"
          >
            <div className="text-sm text-muted-foreground">
              Campos do formulário aqui...
            </div>
          </FormSection>
          <FormSection
            title="Itens"
            description="Produtos ou serviços a requisitar"
          >
            <div className="text-sm text-muted-foreground">
              Lista de itens dinâmica...
            </div>
          </FormSection>
        </div>
      </section>
    </div>
  );
}
