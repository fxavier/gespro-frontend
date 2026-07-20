import 'server-only';
import { prismaBase } from '@/server/db/client';
import { NotFoundError } from '@/lib/errors';
import { emailProvider } from '@/server/email';
import { alertaTemplate } from '@/server/email/templates/alerta';
import type { Ctx } from '@/server/services/types';
import type {
  EmitirNotificacaoDto,
  FiltroNotificacoes,
  INotificacaoService,
  NotificacaoListItem,
  PreferenciaNotificacaoItem,
} from './notificacao.interface';
import type { CanalNotificacao, TipoNotificacao } from '@prisma/client';

// ---------------------------------------------------------------------------
// Canais por defeito para cada tipo de notificação
// (quando o utilizador não tem preferências explícitas — "sem registo" ≠ "lista vazia")
// ---------------------------------------------------------------------------

const CANAIS_DEFAULT: Record<TipoNotificacao, CanalNotificacao[]> = {
  DOCUMENTO_EXPIRADO: ['IN_APP', 'EMAIL'],
  DOCUMENTO_PROXIMO_EXPIRAR: ['IN_APP', 'EMAIL'],
  MANUTENCAO_PENDENTE: ['IN_APP', 'EMAIL'],
  RESET_PASSWORD: ['EMAIL'],
  CONVITE_UTILIZADOR: ['EMAIL'],
  ALERTA_SISTEMA: ['IN_APP'],
};

// ---------------------------------------------------------------------------
// Implementação
// ---------------------------------------------------------------------------

/**
 * Serviço de notificações — WS 13.
 *
 * PADRÃO "PERSISTIR DEPOIS ENVIAR":
 *   1. Valida o destinatário no tenant (cross-tenant → NotFoundError).
 *   2. Persiste a Notificacao com EstadoEnvio=PENDENTE (antes de qualquer I/O externo).
 *   3. FORA da $transaction de negócio, despacha para os canais efectivos.
 *   4. Actualiza EstadoEnvio → ENVIADO ou FALHA.
 *
 * Multi-tenant: tenantId e userId vêm sempre do Ctx (nunca do cliente).
 * Isolamento: TODAS as queries filtram por { tenantId, userId }; o destinatário
 *   é validado como pertencente ao mesmo tenant antes de qualquer escrita.
 */

async function emitir(dto: EmitirNotificacaoDto, ctx: Ctx): Promise<{ id: string }> {
  const { tenantId } = ctx;
  const destinatarioId = dto.userId;

  // BLOCKER FIX: Validar que o destinatário existe e pertence ao tenant do caller.
  // Impede emissão cross-tenant e carrega o email validado.
  const dest = await prismaBase.user.findFirst({
    where: { id: destinatarioId, tenantId, ativo: true },
    select: { email: true },
  });
  if (!dest) {
    throw new NotFoundError('Destinatário não encontrado neste tenant');
  }

  // Idempotência: não emite o mesmo tipo+entidade+utilizador mais de uma vez por dia.
  if (dto.entidadeId) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);

    const existente = await prismaBase.notificacao.findFirst({
      where: {
        tenantId,
        userId: destinatarioId,
        tipo: dto.tipo,
        entidadeId: dto.entidadeId,
        createdAt: { gte: hoje, lt: amanha },
      },
      select: { id: true },
    });

    if (existente) return { id: existente.id };
  }

  // MAJOR 1 FIX: Distinguir "sem registo" de "canais=[]]" (opt-out explícito).
  // preferencia === null → sem preferência → usar defaults.
  // preferencia.canais === [] → desligou tudo → não enviar por nenhum canal.
  const preferencia = await prismaBase.preferenciaNotificacao.findFirst({
    where: { userId: destinatarioId, tenantId, tipo: dto.tipo },
    select: { canais: true },
  });

  const canaisActivos: CanalNotificacao[] =
    preferencia !== null
      ? (preferencia.canais as CanalNotificacao[])
      : (CANAIS_DEFAULT[dto.tipo] ?? ['IN_APP']);

  // MAJOR 2 FIX: Deriva canal gravado, estadoEnvio e despacho do mesmo conjunto efectivo.
  // dto.canal (ex.: EMAIL para reset/convite) substitui canaisActivos integralmente.
  const canaisEfectivos: CanalNotificacao[] = dto.canal ? [dto.canal] : canaisActivos;
  const canalPrimario: CanalNotificacao = canaisEfectivos[0] ?? 'IN_APP';
  const precisaEmail = canaisEfectivos.includes('EMAIL');

  // 1. PERSISTIR (efeito duradouro — antes de qualquer I/O externo)
  const notificacao = await prismaBase.notificacao.create({
    data: {
      tenantId,
      userId: destinatarioId,
      tipo: dto.tipo,
      titulo: dto.titulo,
      mensagem: dto.mensagem,
      canal: canalPrimario,
      entidadeTipo: dto.entidadeTipo,
      entidadeId: dto.entidadeId,
      estadoEnvio: precisaEmail ? 'PENDENTE' : 'ENVIADO',
    },
    select: { id: true },
  });

  // 2. ENVIAR por email (fora de qualquer $transaction; efeito colateral assíncrono)
  // Passa o email já validado para evitar segunda query sem filtro de tenant.
  if (precisaEmail && dest.email) {
    void enviarEmailNotificacao(notificacao.id, dto.titulo, dto.mensagem, dest.email);
  } else if (precisaEmail && !dest.email) {
    // Utilizador sem email configurado → marca falha imediatamente
    await prismaBase.notificacao.update({
      where: { id: notificacao.id },
      data: { estadoEnvio: 'FALHA', erroEnvio: 'Utilizador sem email configurado' },
    }).catch(() => undefined);
  }

  return { id: notificacao.id };
}

/**
 * Envia email e actualiza EstadoEnvio. Não lança — regista FALHA no estado.
 * Recebe o email já validado (do destinatário verificado no tenant) para evitar
 * query sem filtro de tenant na execução assíncrona.
 */
async function enviarEmailNotificacao(
  notificacaoId: string,
  titulo: string,
  mensagem: string,
  emailDestinatario: string,
): Promise<void> {
  try {
    const { html, texto } = alertaTemplate({ titulo, mensagem });
    await emailProvider.enviar({ para: emailDestinatario, assunto: titulo, html, texto });

    await prismaBase.notificacao.update({
      where: { id: notificacaoId },
      data: { estadoEnvio: 'ENVIADO', enviadoEm: new Date() },
    });
  } catch (err) {
    const mensagemErro = err instanceof Error ? err.message : String(err);
    console.error(`[notificacao:email] Falha ao enviar email para notificacao ${notificacaoId}:`, err);
    await prismaBase.notificacao.update({
      where: { id: notificacaoId },
      data: { estadoEnvio: 'FALHA', erroEnvio: mensagemErro.slice(0, 500) },
    }).catch(() => undefined); // Não propagar erro de DB no catch
  }
}

async function listar(
  filtro: FiltroNotificacoes,
  ctx: Ctx,
): Promise<{ items: NotificacaoListItem[]; nextCursor: string | null }> {
  const { tenantId, userId } = ctx;
  const take = filtro.take ?? 20;

  const items = await prismaBase.notificacao.findMany({
    where: {
      tenantId,
      userId,
      ...(filtro.apenasNaoLidas ? { lida: false } : {}),
      ...(filtro.tipo ? { tipo: filtro.tipo } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(filtro.cursor ? { cursor: { id: filtro.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      tipo: true,
      titulo: true,
      mensagem: true,
      canal: true,
      entidadeTipo: true,
      entidadeId: true,
      lida: true,
      lidaEm: true,
      estadoEnvio: true,
      enviadoEm: true,
      createdAt: true,
    },
  });

  const hasMore = items.length > take;
  const result = hasMore ? items.slice(0, take) : items;
  const nextCursor = hasMore ? (result[result.length - 1]?.id ?? null) : null;

  return { items: result as NotificacaoListItem[], nextCursor };
}

async function marcarLida(id: string, ctx: Ctx): Promise<void> {
  const { tenantId, userId } = ctx;

  const notif = await prismaBase.notificacao.findUnique({
    where: { id },
    select: { tenantId: true, userId: true },
  });

  // Isolamento multi-tenant: verifica tenantId + userId (cross-tenant → 404)
  if (!notif || notif.tenantId !== tenantId || notif.userId !== userId) {
    throw new NotFoundError('Notificação não encontrada');
  }

  await prismaBase.notificacao.update({
    where: { id },
    data: { lida: true, lidaEm: new Date() },
  });
}

async function marcarTodasLidas(ctx: Ctx): Promise<{ count: number }> {
  const { tenantId, userId } = ctx;

  const result = await prismaBase.notificacao.updateMany({
    where: { tenantId, userId, lida: false },
    data: { lida: true, lidaEm: new Date() },
  });

  return { count: result.count };
}

async function naoLidasCount(ctx: Ctx): Promise<number> {
  const { tenantId, userId } = ctx;

  return prismaBase.notificacao.count({
    where: { tenantId, userId, lida: false },
  });
}

async function obterPreferencias(ctx: Ctx): Promise<PreferenciaNotificacaoItem[]> {
  const { tenantId, userId } = ctx;

  const prefs = await prismaBase.preferenciaNotificacao.findMany({
    where: { tenantId, userId },
    select: { id: true, tipo: true, canais: true },
    orderBy: { tipo: 'asc' },
  });

  return prefs;
}

async function actualizarPreferencia(
  tipo: TipoNotificacao,
  canais: CanalNotificacao[],
  ctx: Ctx,
): Promise<void> {
  const { tenantId, userId } = ctx;

  await prismaBase.preferenciaNotificacao.upsert({
    where: { userId_tipo: { userId, tipo } },
    create: { tenantId, userId, tipo, canais },
    update: { canais },
  });
}

export const notificacaoService: INotificacaoService = {
  emitir,
  listar,
  marcarLida,
  marcarTodasLidas,
  naoLidasCount,
  obterPreferencias,
  actualizarPreferencia,
};
