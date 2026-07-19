'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Mapa único de status/prioridade de domínio para variante visual.
 * É o único mapa status→variante no sistema — proibido mapa local nos módulos.
 * Inclui todos os estados dos 7 domínios + prioridades (URGENTE/ALTA/MEDIA/BAIXA).
 */

type StatusVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'info' | 'outline';

const STATUS_MAP: Record<string, StatusVariant> = {
  // Requisição de Compra
  RASCUNHO: 'secondary',
  PENDENTE: 'warning',
  EM_APROVACAO: 'info',
  APROVADA: 'success',
  REJEITADA: 'destructive',
  CANCELADA: 'secondary',
  CONVERTIDA: 'default',

  // Cotação (RFQ)
  ENVIADA: 'info',
  RESPONDIDA: 'warning',
  ADJUDICADA: 'success',
  VENCIDA: 'destructive',  // expirado/vencido = destructive em qualquer domínio

  // Pedido de Compra
  ENVIADO: 'info',
  CONFIRMADO: 'success',   // partilhado com Agendamento (mesmo valor)
  EM_TRANSITO: 'warning',
  RECEBIDO_PARCIAL: 'warning',
  RECEBIDO_TOTAL: 'success',
  CANCELADO: 'destructive',

  // Venda — WS C Comercial
  CONFIRMADA: 'success',
  EM_PREPARACAO: 'info',
  FATURADA: 'success',
  CONCLUIDA: 'success',
  DEVOLVIDA: 'warning',

  // Cliente — tipo (WS C)
  FISICA: 'secondary',
  JURIDICA: 'info',
  REVENDEDOR: 'default',

  // Cliente — categoria (WS C)
  VIP: 'success',
  REGULAR: 'secondary',
  NOVO: 'info',

  // Fornecedor
  ATIVO: 'success',
  INATIVO: 'secondary',
  SUSPENSO: 'destructive',

  // Conta a Pagar / Pagamento
  ABERTA: 'warning',
  PARCIALMENTE_PAGA: 'info',
  PAGA: 'success',
  PROCESSANDO: 'info',
  CONCLUIDO: 'success',

  // Agendamento / Serviço
  EM_ANDAMENTO: 'info',
  CONCLUIDO_SERV: 'success',
  NAO_COMPARECEU: 'destructive',

  // Faturação
  EMITIDA: 'info',
  LIQUIDADA: 'success',
  ANULADA: 'destructive',
  PROFORMA: 'secondary',

  // Inventário / Stock
  DISPONIVEL: 'success',
  INDISPONIVEL: 'destructive',
  BAIXO_STOCK: 'warning',

  // Produção
  PLANEJADO: 'secondary',
  EM_PRODUCAO: 'info',
  CONCLUIDO_PROD: 'success',
  SUSPENSO_PROD: 'warning',

  // RH / Payroll
  ACTIVO: 'success',
  FERIAS: 'info',
  AFASTADO: 'warning',
  DESLIGADO: 'secondary',

  // Projecto
  NAO_INICIADO: 'secondary',
  EM_PROGRESSO: 'info',
  CONCLUIDO_PROJ: 'success',
  ATRASADO: 'destructive',
  PAUSADO: 'warning',

  // Transporte — Viatura
  EM_ACTIVIDADE: 'info',
  EM_MANUTENCAO: 'warning',
  INACTIVA: 'secondary',
  ABATIDA: 'outline',

  // Transporte — Atividade
  PLANEADA: 'secondary',
  EM_CURSO: 'info',
  SUSPENSA: 'warning',
  // CONCLUIDA already defined above (Venda WS-C) — same variant 'success'

  // Transporte — Rota
  ATIVA: 'success',
  PAUSADA: 'warning',

  // Transporte — Entrega
  AGENDADA: 'info',
  ENTREGUE: 'success',
  FALHADA: 'destructive',

  // Ticket — estados adicionais
  AGUARDANDO_CLIENTE: 'warning',
  AGUARDANDO_TERCEIRO: 'warning',

  // Ticket — prioridade NORMAL
  NORMAL: 'secondary',

  // Ticket
  ABERTO: 'warning',
  EM_ATENDIMENTO: 'info',
  RESOLVIDO: 'success',
  FECHADO: 'secondary',

  // Aprovação
  APROVADO: 'success',
  REJEITADO: 'destructive',

  // Prioridades (requisições, tarefas, tickets) — mapa único, proibido local
  URGENTE: 'destructive',
  ALTA: 'warning',
  MEDIA: 'secondary',
  BAIXA: 'outline',

  // Kanban (projectos/tarefas)
  A_FAZER: 'secondary',
  EM_REVISAO: 'info',
  BLOQUEADA: 'destructive',

  // Produção / Projectos
  LIBERADA: 'success',
  PLANEAMENTO: 'secondary',   // PT-PT
  PLANEJAMENTO: 'secondary',  // PT-BR (compatibilidade)
  ARQUIVADO: 'outline',
  ARQUIVADA: 'outline',       // forma feminina

  // Genérico
  ATIVO_GEN: 'success',
  INATIVO_GEN: 'secondary',

  // Recrutamento — Spec 07
  // StatusVaga
  EM_TRIAGEM: 'info',
  // RASCUNHO, ABERTA, FECHADA, CANCELADA já estão acima com variantes compatíveis

  // EtapaCandidatura
  RECEBIDA: 'secondary',
  TRIAGEM: 'info',
  ENTREVISTA: 'warning',
  PROPOSTA: 'info',
  CONTRATADO: 'success',
  DESISTIU: 'outline',
  // REJEITADO já definido acima como 'destructive'

  // TipoEntrevista
  TELEFONICA: 'secondary',
  PRESENCIAL: 'default',
  VIDEO: 'info',
  TECNICA: 'warning',
  PAINEL: 'default',
};

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        success: 'border-transparent bg-success text-success-foreground',
        // warning/info usam `text-warning`/`text-info` directamente:
        // — light mode: cor própria é escura o suficiente para contrastar com fundo suave
        // — dark mode: cor própria é clara o suficiente para contrastar com fundo escuro
        // (ver tokens CSS em globals.css)
        warning: 'border-warning/40 bg-warning/10 text-warning',
        info: 'border-info/40 bg-info/10 text-info',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const STATUS_LABELS: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  PENDENTE: 'Pendente',
  EM_APROVACAO: 'Em Aprovação',
  APROVADA: 'Aprovada',
  REJEITADA: 'Rejeitada',
  CANCELADA: 'Cancelada',
  CONVERTIDA: 'Convertida',
  ENVIADA: 'Enviada',
  RESPONDIDA: 'Respondida',
  ADJUDICADA: 'Adjudicada',
  VENCIDA: 'Vencida',
  ENVIADO: 'Enviado',
  CONFIRMADO: 'Confirmado',
  EM_TRANSITO: 'Em Trânsito',
  RECEBIDO_PARCIAL: 'Parcialmente Recebido',
  RECEBIDO_TOTAL: 'Recebido',
  CANCELADO: 'Cancelado',
  ATIVO: 'Activo',
  INATIVO: 'Inactivo',
  SUSPENSO: 'Suspenso',
  ABERTA: 'Aberta',
  PARCIALMENTE_PAGA: 'Parcialmente Paga',
  PAGA: 'Paga',
  PROCESSANDO: 'A Processar',
  CONCLUIDO: 'Concluído',
  // Transporte
  EM_ACTIVIDADE: 'Em Actividade',
  EM_MANUTENCAO: 'Em Manutenção',
  INACTIVA: 'Inactiva',
  ABATIDA: 'Abatida',
  PLANEADA: 'Planeada',
  EM_CURSO: 'Em Curso',
  SUSPENSA: 'Suspensa',
  CONCLUIDA: 'Concluída',
  ATIVA: 'Activa',
  PAUSADA: 'Pausada',
  AGENDADA: 'Agendada',
  ENTREGUE: 'Entregue',
  FALHADA: 'Falhada',
  // Tickets
  AGUARDANDO_CLIENTE: 'A Aguardar Cliente',
  AGUARDANDO_TERCEIRO: 'A Aguardar Terceiro',
  NORMAL: 'Normal',
  ABERTO: 'Aberto',
  EM_ATENDIMENTO: 'Em Atendimento',
  RESOLVIDO: 'Resolvido',
  FECHADO: 'Fechado',
  APROVADO: 'Aprovado',
  REJEITADO: 'Rejeitado',
  // Venda — WS C
  CONFIRMADA: 'Confirmada',
  EM_PREPARACAO: 'Em Preparação',
  FATURADA: 'Faturada',
  // CONCLUIDA already defined above (Transporte) — same label 'Concluída'
  DEVOLVIDA: 'Devolvida',
  // Cliente
  FISICA: 'Pessoa Física',
  JURIDICA: 'Pessoa Jurídica',
  REVENDEDOR: 'Revendedor',
  VIP: 'VIP',
  REGULAR: 'Regular',
  NOVO: 'Novo',
  EMITIDA: 'Emitida',
  LIQUIDADA: 'Liquidada',
  ANULADA: 'Anulada',
  DISPONIVEL: 'Disponível',
  INDISPONIVEL: 'Indisponível',
  BAIXO_STOCK: 'Stock Baixo',
  NAO_INICIADO: 'Não Iniciado',
  EM_PROGRESSO: 'Em Progresso',
  ATRASADO: 'Atrasado',
  PAUSADO: 'Pausado',
  EM_ANDAMENTO: 'Em Andamento',
  NAO_COMPARECEU: 'Não Compareceu',
  // Kanban / Produção / Projectos
  A_FAZER: 'A Fazer',
  EM_REVISAO: 'Em Revisão',
  BLOQUEADA: 'Bloqueada',
  LIBERADA: 'Liberada',
  PLANEAMENTO: 'Planeamento',
  PLANEJAMENTO: 'Planeamento',
  ARQUIVADO: 'Arquivado',
  ARQUIVADA: 'Arquivada',

  // Prioridades
  URGENTE: 'Urgente',
  ALTA: 'Alta',
  MEDIA: 'Média',
  BAIXA: 'Baixa',

  // Recrutamento — Spec 07
  EM_TRIAGEM: 'Em Triagem',
  RECEBIDA: 'Recebida',
  TRIAGEM: 'Triagem',
  ENTREVISTA: 'Entrevista',
  PROPOSTA: 'Proposta',
  CONTRATADO: 'Contratado',
  DESISTIU: 'Desistiu',
  TELEFONICA: 'Telefónica',
  PRESENCIAL: 'Presencial',
  VIDEO: 'Vídeo',
  TECNICA: 'Técnica',
  PAINEL: 'Painel',
};

interface StatusBadgeProps extends VariantProps<typeof badgeVariants> {
  status: string;
  label?: string;
  className?: string;
}

/**
 * Badge de estado ou prioridade com mapa único status→variante.
 * Uso: <StatusBadge status="APROVADA" /> ou <StatusBadge status="URGENTE" />
 */
export function StatusBadge({ status, label, className, variant }: StatusBadgeProps) {
  const safeStatus = status ?? '';
  const resolvedVariant = variant ?? STATUS_MAP[safeStatus] ?? 'outline';
  const resolvedLabel = label ?? STATUS_LABELS[safeStatus] ?? safeStatus.replace(/_/g, ' ') ?? '—';

  return (
    <span className={cn(badgeVariants({ variant: resolvedVariant }), className)}>
      {resolvedLabel}
    </span>
  );
}

export { badgeVariants };
export type { StatusVariant };
