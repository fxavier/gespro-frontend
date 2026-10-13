'use server';
import { createSafeAction } from '@/server/safe-action';
import {
  CreateColaboradorSchema,
  UpdateColaboradorSchema,
  FilterColaboradorSchema,
  CreateAusenciaSchema,
  AprovarAusenciaSchema,
  RejeitarAusenciaSchema,
  CreateFeriasSchema,
  CreateSolicitacaoFeriasSchema,
  AprovarSolicitacaoFeriasSchema,
  CancelarSolicitacaoFeriasSchema,
  CreateRegistoAssiduidadeSchema,
  FilterAssiduidadeSchema,
  CreateAvaliacaoSchema,
  UpdateAvaliacaoSchema,
  CreateFormacaoSchema,
  UpdateFormacaoSchema,
  AdicionarDocumentoColaboradorSchema,
} from '@/lib/validations/rh';
import { z } from 'zod';
import {
  ColaboradorService,
  FeriasService,
  AusenciaService,
  AssiduidadeService,
  AvaliacaoService,
  FormacaoService,
} from '@/server/services/pessoas-projetos/rh.service';

// ─────────────────────────────────────────────────────────────────────────────
// Colaborador
// ─────────────────────────────────────────────────────────────────────────────

export const criarColaboradorAction = createSafeAction({
  schema: CreateColaboradorSchema,
  permission: 'rh:colaboradores:create',
  revalidate: { tags: ['rh:colaboradores'] },
  handler: (input, ctx) => ColaboradorService.criar(input, ctx),
});

export const actualizarColaboradorAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), data: UpdateColaboradorSchema }),
  permission: 'rh:colaboradores:update',
  revalidate: { tags: ['rh:colaboradores'] },
  handler: ({ id, data }, ctx) => ColaboradorService.actualizar(id, data, ctx),
});

export const transitarStatusColaboradorAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), novoStatus: z.string() }),
  permission: 'rh:colaboradores:update',
  revalidate: { tags: ['rh:colaboradores'] },
  handler: ({ id, novoStatus }, ctx) => ColaboradorService.transitarStatus(id, novoStatus, ctx),
});

export const arquivarColaboradorAction = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'rh:colaboradores:delete',
  revalidate: { tags: ['rh:colaboradores'] },
  handler: ({ id }, ctx) => ColaboradorService.arquivar(id, ctx),
});

/** #163 — regista o documento carregado pelo presign na ficha do colaborador. */
export const adicionarDocumentoColaboradorAction = createSafeAction({
  schema: AdicionarDocumentoColaboradorSchema,
  permission: 'rh:colaboradores:update',
  revalidate: { tags: ['rh:colaboradores'] },
  handler: (input, ctx) => ColaboradorService.adicionarDocumento(input, ctx),
});

export const listarColaboradoresAction = createSafeAction({
  schema: FilterColaboradorSchema,
  permission: 'rh:colaboradores:read',
  permiteEmLeitura: true,
  handler: (filter, ctx) => ColaboradorService.listar(filter, ctx),
});

/**
 * Pesquisa de colaboradores para o `ComboboxRemoto` (ausências, atribuição de benefícios — #265).
 * Leitura: corre em modo de Leitura. Só é chamada com termo — o campo vazio mostra as
 * `opcoesIniciais` carregadas pelo Server Component.
 */
export const procurarColaboradoresAction = createSafeAction({
  schema: z.object({ q: z.string().trim().min(1).max(200) }),
  permission: 'rh:colaboradores:read',
  permiteEmLeitura: true,
  handler: async ({ q }, ctx) => {
    const pagina = await ColaboradorService.listar({ search: q, take: 50 }, ctx);
    return pagina.items.map((c) => ({ id: c.id, codigo: c.codigo, nome: c.nome }));
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Férias
// ─────────────────────────────────────────────────────────────────────────────

export const iniciarPeriodoFeriasAction = createSafeAction({
  schema: CreateFeriasSchema,
  permission: 'rh:ferias:create',
  revalidate: { tags: ['rh:ferias'], paths: ['/rh/ferias'] },
  handler: (input, ctx) => FeriasService.iniciarPeriodo(input, ctx),
});

export const solicitarFeriasAction = createSafeAction({
  schema: CreateSolicitacaoFeriasSchema,
  permission: 'rh:ferias:solicitar',
  revalidate: { tags: ['rh:ferias'] },
  handler: (input, ctx) => FeriasService.solicitar(input, ctx),
});

export const aprovarFeriasAction = createSafeAction({
  schema: AprovarSolicitacaoFeriasSchema,
  permission: 'rh:ferias:aprovar',
  revalidate: { tags: ['rh:ferias'], paths: ['/rh/ferias'] },
  handler: (input, ctx) => FeriasService.aprovar(input, ctx),
});

// #156 — só o próprio (quem submeteu) e só PENDENTE; a regra vive no serviço.
export const cancelarSolicitacaoFeriasAction = createSafeAction({
  schema: CancelarSolicitacaoFeriasSchema,
  permission: 'rh:ferias:solicitar',
  revalidate: { tags: ['rh:ferias'], paths: ['/rh/ferias'] },
  handler: ({ solicitacaoId }, ctx) => FeriasService.cancelarSolicitacao(solicitacaoId, ctx),
});

// ─────────────────────────────────────────────────────────────────────────────
// Ausência
// ─────────────────────────────────────────────────────────────────────────────

export const registarAusenciaAction = createSafeAction({
  schema: CreateAusenciaSchema,
  permission: 'rh:ausencias:create',
  revalidate: { tags: ['rh:ausencias'] },
  handler: (input, ctx) => AusenciaService.registar(input, ctx),
});

// #94 — só ausências APROVADA entram na folha; a folha já processada tem de ser recalculada.
export const aprovarAusenciaAction = createSafeAction({
  schema: AprovarAusenciaSchema,
  permission: 'rh:ausencias:aprovar',
  revalidate: { tags: ['rh:ausencias'], paths: ['/rh/ausencias'] },
  handler: ({ id }, ctx) => AusenciaService.aprovar(id, { status: 'APROVADA' }, ctx),
});

export const rejeitarAusenciaAction = createSafeAction({
  schema: RejeitarAusenciaSchema,
  permission: 'rh:ausencias:aprovar',
  revalidate: { tags: ['rh:ausencias'], paths: ['/rh/ausencias'] },
  handler: ({ id, motivoRejeicao }, ctx) =>
    AusenciaService.aprovar(id, { status: 'REJEITADA', motivoRejeicao }, ctx),
});

// ─────────────────────────────────────────────────────────────────────────────
// Assiduidade
// ─────────────────────────────────────────────────────────────────────────────

export const registarAssiduidadeAction = createSafeAction({
  schema: CreateRegistoAssiduidadeSchema,
  permission: 'rh:assiduidade:create',
  revalidate: { tags: ['rh:assiduidade'] },
  handler: (input, ctx) => AssiduidadeService.registar(input, ctx),
});

export const listarAssiduidadeAction = createSafeAction({
  schema: FilterAssiduidadeSchema,
  permission: 'rh:assiduidade:read',
  permiteEmLeitura: true,
  handler: (filter, ctx) => AssiduidadeService.listar(filter, ctx),
});
// ponytail: z import retido para possível extensão de schemas inline

// ─────────────────────────────────────────────────────────────────────────────
// Avaliação
// ─────────────────────────────────────────────────────────────────────────────

export const criarAvaliacaoAction = createSafeAction({
  schema: CreateAvaliacaoSchema,
  permission: 'rh:avaliacoes:create',
  revalidate: { tags: ['rh:avaliacoes'] },
  handler: (input, ctx) => AvaliacaoService.criar(input, ctx),
});

export const actualizarAvaliacaoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), data: UpdateAvaliacaoSchema }),
  permission: 'rh:avaliacoes:update',
  revalidate: { tags: ['rh:avaliacoes'] },
  handler: ({ id, data }, ctx) => AvaliacaoService.actualizar(id, data, ctx),
});

export const transitarStatusAvaliacaoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), novoStatus: z.string() }),
  permission: 'rh:avaliacoes:update',
  revalidate: { tags: ['rh:avaliacoes'] },
  handler: ({ id, novoStatus }, ctx) => AvaliacaoService.transitarStatus(id, novoStatus, ctx),
});

// ─────────────────────────────────────────────────────────────────────────────
// Formação
// ─────────────────────────────────────────────────────────────────────────────

export const criarFormacaoAction = createSafeAction({
  schema: CreateFormacaoSchema,
  permission: 'rh:formacoes:create',
  revalidate: { tags: ['rh:formacoes'] },
  handler: (input, ctx) => FormacaoService.criar(input, ctx),
});

export const actualizarFormacaoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), data: UpdateFormacaoSchema }),
  permission: 'rh:formacoes:update',
  revalidate: { tags: ['rh:formacoes'] },
  handler: ({ id, data }, ctx) => FormacaoService.actualizar(id, data, ctx),
});

export const transitarStatusFormacaoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), novoStatus: z.string() }),
  permission: 'rh:formacoes:update',
  revalidate: { tags: ['rh:formacoes'] },
  handler: ({ id, novoStatus }, ctx) => FormacaoService.transitarStatus(id, novoStatus, ctx),
});

export const inscreverColaboradorFormacaoAction = createSafeAction({
  schema: z.object({ formacaoId: z.string().cuid(), colaboradorId: z.string().cuid() }),
  permission: 'rh:formacoes:update',
  revalidate: { tags: ['rh:formacoes'] },
  handler: ({ formacaoId, colaboradorId }, ctx) => FormacaoService.inscreverColaborador(formacaoId, colaboradorId, ctx),
});
