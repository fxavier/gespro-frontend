'use server';
import { z } from 'zod';
import { createSafeAction } from '@/server/safe-action';
import {
  CreateEquipaSchema,
  UpdateEquipaSchema,
  AddMembroEquipaSchema,
  CreateProjetoSchema,
  UpdateProjetoSchema,
  FilterProjetoSchema,
  CreateTarefaSchema,
  UpdateTarefaSchema,
  ReordenarTarefaSchema,
  FilterTarefaSchema,
  CreateTimesheetSchema,
  FilterTimesheetSchema,
  CreateMarcoSchema,
  CreateOrcamentoProjetoSchema,
  CreateRiscoSchema,
  UpdateRiscoSchema,
  FilterRiscoSchema,
  TransitarRiscoSchema,
  CreateQualidadeSchema,
  UpdateQualidadeSchema,
  FilterQualidadeSchema,
  TransitarQualidadeSchema,
  CreateComunicacaoSchema,
  FilterComunicacaoSchema,
  UpdateConfiguracaoProjetoSchema,
} from '@/lib/validations/projetos';
import {
  EquipaService,
  ProjetoService,
  TarefaService,
  TimesheetService,
  MarcoService,
  OrcamentoProjetoService,
} from '@/server/services/pessoas-projetos/projetos.service';
import { RiscoService } from '@/server/services/pessoas-projetos/risco.service';
import { QualidadeService } from '@/server/services/pessoas-projetos/qualidade.service';
import { ComunicacaoService } from '@/server/services/pessoas-projetos/comunicacao.service';
import { ConfiguracaoProjetoService } from '@/server/services/pessoas-projetos/configuracao-projeto.service';

// ─────────────────────────────────────────────────────────────────────────────
// Equipa
// ─────────────────────────────────────────────────────────────────────────────

export const criarEquipaAction = createSafeAction({
  schema: CreateEquipaSchema,
  permission: 'projetos:equipas:create',
  revalidate: { tags: ['projetos:equipas'] },
  handler: (input, ctx) => EquipaService.criar(input, ctx),
});

export const actualizarEquipaAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), data: UpdateEquipaSchema }),
  permission: 'projetos:equipas:update',
  revalidate: { tags: ['projetos:equipas'] },
  handler: ({ id, data }, ctx) => EquipaService.actualizar(id, data, ctx),
});

export const adicionarMembroEquipaAction = createSafeAction({
  schema: AddMembroEquipaSchema,
  permission: 'projetos:equipas:update',
  revalidate: { tags: ['projetos:equipas'] },
  handler: (input, ctx) => EquipaService.adicionarMembro(input, ctx),
});

// ─────────────────────────────────────────────────────────────────────────────
// Projecto
// ─────────────────────────────────────────────────────────────────────────────

export const criarProjetoAction = createSafeAction({
  schema: CreateProjetoSchema,
  permission: 'projetos:create',
  revalidate: { tags: ['projetos'] },
  handler: (input, ctx) => ProjetoService.criar(input, ctx),
});

export const actualizarProjetoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), data: UpdateProjetoSchema }),
  permission: 'projetos:update',
  revalidate: { tags: ['projetos'] },
  handler: ({ id, data }, ctx) => ProjetoService.actualizar(id, data, ctx),
});

export const transitarStatusProjetoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), novoStatus: z.string() }),
  permission: 'projetos:update',
  revalidate: { tags: ['projetos'] },
  handler: ({ id, novoStatus }, ctx) => ProjetoService.transitarStatus(id, novoStatus, ctx),
});

export const listarProjetosAction = createSafeAction({
  schema: FilterProjetoSchema,
  permission: 'projetos:read',
  handler: (filter, ctx) => ProjetoService.listar(filter, ctx),
});

// ─────────────────────────────────────────────────────────────────────────────
// Tarefa (kanban)
// ─────────────────────────────────────────────────────────────────────────────

export const criarTarefaAction = createSafeAction({
  schema: CreateTarefaSchema,
  permission: 'projetos:tarefas:create',
  revalidate: { tags: ['projetos:tarefas'] },
  handler: (input, ctx) => TarefaService.criar(input, ctx),
});

export const actualizarTarefaAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), data: UpdateTarefaSchema }),
  permission: 'projetos:tarefas:update',
  revalidate: { tags: ['projetos:tarefas'] },
  handler: ({ id, data }, ctx) => TarefaService.actualizar(id, data, ctx),
});

export const transitarStatusTarefaAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), novoStatus: z.string() }),
  permission: 'projetos:tarefas:update',
  revalidate: { tags: ['projetos:tarefas'] },
  handler: ({ id, novoStatus }, ctx) => TarefaService.transitarStatus(id, novoStatus, ctx),
});

/** Reordenação kanban via drag-and-drop. */
export const reordenarTarefaAction = createSafeAction({
  schema: ReordenarTarefaSchema,
  permission: 'projetos:tarefas:update',
  revalidate: { tags: ['projetos:tarefas'] },
  handler: (input, ctx) => TarefaService.reordenar(input, ctx),
});

export const listarTarefasAction = createSafeAction({
  schema: FilterTarefaSchema,
  permission: 'projetos:tarefas:read',
  handler: (filter, ctx) => TarefaService.listar(filter, ctx),
});

// ─────────────────────────────────────────────────────────────────────────────
// Timesheet
// ─────────────────────────────────────────────────────────────────────────────

export const registarTimesheetAction = createSafeAction({
  schema: CreateTimesheetSchema,
  permission: 'projetos:timesheets:create',
  revalidate: { tags: ['projetos:timesheets'] },
  handler: (input, ctx) => TimesheetService.registar(input, ctx),
});

export const aprovarTimesheetAction = createSafeAction({
  schema: z.object({ id: z.string().cuid() }),
  permission: 'projetos:timesheets:aprovar',
  revalidate: { tags: ['projetos:timesheets'] },
  handler: ({ id }, ctx) => TimesheetService.aprovar(id, ctx),
});

export const listarTimesheetsAction = createSafeAction({
  schema: FilterTimesheetSchema,
  permission: 'projetos:timesheets:read',
  handler: (filter, ctx) => TimesheetService.listar(filter, ctx),
});

// ─────────────────────────────────────────────────────────────────────────────
// Marco (Milestone)
// ─────────────────────────────────────────────────────────────────────────────

export const criarMarcoAction = createSafeAction({
  schema: CreateMarcoSchema,
  permission: 'projetos:marcos:create',
  revalidate: { tags: ['projetos:marcos'] },
  handler: (input, ctx) => MarcoService.criar(input, ctx),
});

export const transitarStatusMarcoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), novoStatus: z.string() }),
  permission: 'projetos:marcos:update',
  revalidate: { tags: ['projetos:marcos'] },
  handler: ({ id, novoStatus }, ctx) => MarcoService.transitarStatus(id, novoStatus, ctx),
});

// ─────────────────────────────────────────────────────────────────────────────
// Orçamento de Projecto
// ─────────────────────────────────────────────────────────────────────────────

export const criarOrcamentoProjetoAction = createSafeAction({
  schema: CreateOrcamentoProjetoSchema,
  permission: 'projetos:orcamentos:create',
  revalidate: { tags: ['projetos:orcamentos'] },
  handler: (input, ctx) => OrcamentoProjetoService.criar(input, ctx),
});

export const transitarStatusOrcamentoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), novoStatus: z.string() }),
  permission: 'projetos:orcamentos:update',
  revalidate: { tags: ['projetos:orcamentos'] },
  handler: ({ id, novoStatus }, ctx) => OrcamentoProjetoService.transitarStatus(id, novoStatus, ctx),
});

// ─────────────────────────────────────────────────────────────────────────────
// Spec 11 — Riscos de Projecto
// ─────────────────────────────────────────────────────────────────────────────

export const criarRiscoAction = createSafeAction({
  schema: CreateRiscoSchema,
  permission: 'projetos:riscos:create',
  revalidate: { tags: ['projetos:riscos'] },
  handler: (input, ctx) => RiscoService.criar(input, ctx),
});

export const actualizarRiscoAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), data: UpdateRiscoSchema }),
  permission: 'projetos:riscos:update',
  revalidate: { tags: ['projetos:riscos'] },
  handler: ({ id, data }, ctx) => RiscoService.actualizar(id, data, ctx),
});

export const transitarStatusRiscoAction = createSafeAction({
  schema: TransitarRiscoSchema,
  permission: 'projetos:riscos:update',
  revalidate: { tags: ['projetos:riscos'] },
  handler: ({ id, novoStatus }, ctx) => RiscoService.transitarStatus(id, novoStatus, ctx),
});

export const listarRiscosAction = createSafeAction({
  schema: FilterRiscoSchema,
  permission: 'projetos:riscos:read',
  handler: (filter, ctx) => RiscoService.listar(filter, ctx),
});

// ─────────────────────────────────────────────────────────────────────────────
// Spec 11 — Qualidade de Projecto
// ─────────────────────────────────────────────────────────────────────────────

export const criarRegistoQualidadeAction = createSafeAction({
  schema: CreateQualidadeSchema,
  permission: 'projetos:qualidade:create',
  revalidate: { tags: ['projetos:qualidade'] },
  handler: (input, ctx) => QualidadeService.criar(input, ctx),
});

export const actualizarRegistoQualidadeAction = createSafeAction({
  schema: z.object({ id: z.string().cuid(), data: UpdateQualidadeSchema }),
  permission: 'projetos:qualidade:update',
  revalidate: { tags: ['projetos:qualidade'] },
  handler: ({ id, data }, ctx) => QualidadeService.actualizar(id, data, ctx),
});

export const transitarStatusQualidadeAction = createSafeAction({
  schema: TransitarQualidadeSchema,
  permission: 'projetos:qualidade:update',
  revalidate: { tags: ['projetos:qualidade'] },
  handler: ({ id, novoStatus }, ctx) => QualidadeService.transitarStatus(id, novoStatus, ctx),
});

export const listarQualidadeAction = createSafeAction({
  schema: FilterQualidadeSchema,
  permission: 'projetos:qualidade:read',
  handler: (filter, ctx) => QualidadeService.listar(filter, ctx),
});

// ─────────────────────────────────────────────────────────────────────────────
// Spec 11 — Comunicações de Projecto
// ─────────────────────────────────────────────────────────────────────────────

export const registarComunicacaoAction = createSafeAction({
  schema: CreateComunicacaoSchema,
  permission: 'projetos:comunicacoes:create',
  revalidate: { tags: ['projetos:comunicacoes'] },
  handler: (input, ctx) => ComunicacaoService.registar(input, ctx),
});

export const listarComunicacoesAction = createSafeAction({
  schema: FilterComunicacaoSchema,
  permission: 'projetos:comunicacoes:read',
  handler: (filter, ctx) => ComunicacaoService.listar(filter, ctx),
});

// ─────────────────────────────────────────────────────────────────────────────
// Spec 11 — Configuração de Projecto
// ─────────────────────────────────────────────────────────────────────────────

export const actualizarConfiguracaoProjetoAction = createSafeAction({
  schema: UpdateConfiguracaoProjetoSchema,
  permission: 'projetos:config:update',
  revalidate: { tags: ['projetos:config'] },
  handler: (input, ctx) => ConfiguracaoProjetoService.actualizar(input, ctx),
});
