import 'server-only';
import type { TipoNotificacao, CanalNotificacao, EstadoEnvio } from '@prisma/client';
import type { Ctx } from '@/server/services/types';

export type { TipoNotificacao, CanalNotificacao, EstadoEnvio };

export interface EmitirNotificacaoDto {
  userId: string;
  tipo: TipoNotificacao;
  titulo: string;
  mensagem: string;
  canal?: CanalNotificacao;
  entidadeTipo?: string;
  entidadeId?: string;
}

export interface NotificacaoListItem {
  id: string;
  tipo: TipoNotificacao;
  titulo: string;
  mensagem: string;
  canal: CanalNotificacao;
  entidadeTipo: string | null;
  entidadeId: string | null;
  lida: boolean;
  lidaEm: Date | null;
  estadoEnvio: EstadoEnvio;
  enviadoEm: Date | null;
  createdAt: Date;
}

export interface FiltroNotificacoes {
  apenasNaoLidas?: boolean;
  tipo?: TipoNotificacao;
  cursor?: string;
  take?: number;
}

export interface PreferenciaNotificacaoItem {
  id: string;
  tipo: TipoNotificacao;
  canais: CanalNotificacao[];
}

export interface INotificacaoService {
  emitir(dto: EmitirNotificacaoDto, ctx: Ctx): Promise<{ id: string }>;
  listar(filtro: FiltroNotificacoes, ctx: Ctx): Promise<{
    items: NotificacaoListItem[];
    nextCursor: string | null;
  }>;
  marcarLida(id: string, ctx: Ctx): Promise<void>;
  marcarTodasLidas(ctx: Ctx): Promise<{ count: number }>;
  naoLidasCount(ctx: Ctx): Promise<number>;
  obterPreferencias(ctx: Ctx): Promise<PreferenciaNotificacaoItem[]>;
  actualizarPreferencia(tipo: TipoNotificacao, canais: CanalNotificacao[], ctx: Ctx): Promise<void>;
}
