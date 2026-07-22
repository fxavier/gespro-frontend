// Validações Zod — Ativos, Manutenção, Amortização e Inventário Físico (WS A)
// Partilhado cliente/servidor.

import { z } from 'zod';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const EstadoAtivoEnum = z.enum([
  'NOVO',
  'EM_USO',
  'EM_MANUTENCAO',
  'OBSOLETO',
  'BAIXADO',
  'EM_TRANSFERENCIA',
]);

export const MetodoAmortizacaoEnum = z.enum([
  'LINEAR',
  'DIGITOS_ANOS',
  'UNIDADES_PRODUCAO',
  'SALDOS_DECRESCENTES',
]);

export const TipoManutencaoAtivoEnum = z.enum([
  'PREVENTIVA',
  'CORRETIVA',
  'INSPECAO',
  'CALIBRACAO',
]);

export const StatusManutencaoAtivoEnum = z.enum([
  'AGENDADA',
  'EM_ANDAMENTO',
  'ORCAMENTO',
  'CONCLUIDA',
  'CANCELADA',
]);

export const PrioridadeManutencaoEnum = z.enum(['BAIXA', 'MEDIA', 'ALTA', 'CRITICA']);

export const TipoMovimentacaoAtivoEnum = z.enum([
  'ENTRADA',
  'SAIDA',
  'TRANSFERENCIA',
  'EMPRESTIMO',
  'DEVOLUCAO',
  'BAIXA',
  'AJUSTE',
]);

export const StatusInventarioFisicoEnum = z.enum([
  'PLANEJADO',
  'AGENDADO',
  'EM_ANDAMENTO',
  'PAUSADO',
  'CONCLUIDO',
  'CANCELADO',
]);

export const TipoDocumentoAtivoEnum = z.enum([
  'MANUAL',
  'CERTIFICADO',
  'GARANTIA',
  'NOTA_FISCAL',
  'OUTRO',
]);

// ─── Categoria de Ativo ───────────────────────────────────────────────────────

export const CategoriaAtivoCreateSchema = z.object({
  codigo: z.string().min(1).max(20),
  nome: z.string().min(1).max(100),
  descricao: z.string().max(500).optional(),
  categoriaPaiId: z.string().cuid().optional(),
  metodoAmortizacao: MetodoAmortizacaoEnum.default('LINEAR'),
  vidaUtilAnos: z.coerce.number().int().min(1).max(100),
  valorResidualPct: z.coerce.number().min(0).max(1).default(0),
  intervaloPreventivaDias: z.coerce.number().int().positive().optional(),
  alertaManutencaoDias: z.coerce.number().int().positive().optional(),
  ativa: z.boolean().default(true),
});

export const CategoriaAtivoUpdateSchema = CategoriaAtivoCreateSchema.partial().omit({
  codigo: true,
});

export const CategoriaAtivoFilterSchema = z.object({
  search: z.string().optional(),
  ativa: z.boolean().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(25),
});

export type CategoriaAtivoCreate = z.infer<typeof CategoriaAtivoCreateSchema>;
export type CategoriaAtivoUpdate = z.infer<typeof CategoriaAtivoUpdateSchema>;
export type CategoriaAtivoFilter = z.infer<typeof CategoriaAtivoFilterSchema>;

// ─── Ativo ────────────────────────────────────────────────────────────────────

const GarantiaSchema = z.object({
  dataInicio: z.coerce.date(),
  dataFim: z.coerce.date(),
  fornecedor: z.string().max(200),
  termos: z.string().max(2000).optional(),
});

export const AtivoCreateSchema = z.object({
  codigoInterno: z.string().min(1, 'Código interno é obrigatório').max(50),
  nome: z.string().min(1, 'Nome é obrigatório').max(200),
  descricao: z.string().max(2000).optional(),
  categoriaId: z.string().cuid('ID de categoria inválido'),
  numeroSerie: z.string().max(100).optional(),
  modelo: z.string().max(100).optional(),
  marca: z.string().max(100).optional(),
  fornecedorId: z.string().optional(), // cross-domain: ID do Fornecedor (WS B)
  dataAquisicao: z.coerce.date(),
  valorCompra: z.coerce.number().positive('Valor de compra deve ser positivo'),
  valorResidual: z.coerce.number().nonnegative().optional(),
  vidaUtilAnos: z.coerce.number().int().min(1).max(100),
  dataSubstituicao: z.coerce.date().optional(),
  estado: EstadoAtivoEnum.default('NOVO'),
  localizacaoId: z.string().cuid('ID de localização inválido'),
  responsavelId: z.string().optional(),    // cross-domain: User
  departamentoId: z.string().optional(),   // cross-domain: WS E Departamento
  projetoId: z.string().optional(),        // cross-domain: WS E Projeto
  metodoAmortizacao: MetodoAmortizacaoEnum.default('LINEAR'),
  qrCode: z.string().max(100).optional(),
  codigoBarras: z.string().max(100).optional(),
  rfidTag: z.string().max(100).optional(),
  observacoes: z.string().max(2000).optional(),
  garantia: GarantiaSchema.optional(),
  imagens: z.array(z.string().url()).default([]),
});

export const AtivoUpdateSchema = AtivoCreateSchema.partial().omit({ codigoInterno: true });

export const AtivoFilterSchema = z.object({
  search: z.string().optional(),
  categoriaId: z.string().optional(),
  localizacaoId: z.string().optional(),
  responsavelId: z.string().optional(),
  estado: EstadoAtivoEnum.optional(),
  fornecedorId: z.string().optional(),
  dataAquisicaoInicio: z.coerce.date().optional(),
  dataAquisicaoFim: z.coerce.date().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(25),
  orderBy: z
    .enum(['nome', 'codigoInterno', 'dataAquisicao', 'valorCompra', 'createdAt'])
    .default('createdAt'),
  orderDir: z.enum(['asc', 'desc']).default('desc'),
});

export type AtivoCreate = z.infer<typeof AtivoCreateSchema>;
export type AtivoUpdate = z.infer<typeof AtivoUpdateSchema>;
export type AtivoFilter = z.infer<typeof AtivoFilterSchema>;

// ─── Documento de Ativo ───────────────────────────────────────────────────────

export const DocumentoAtivoCreateSchema = z.object({
  ativoId: z.string().cuid(),
  nome: z.string().min(1).max(200),
  tipo: TipoDocumentoAtivoEnum,
  url: z.string().url('URL do documento inválida'),
  dataUpload: z.coerce.date().optional(),
});

export type DocumentoAtivoCreate = z.infer<typeof DocumentoAtivoCreateSchema>;

// ─── Movimentação de Ativo ────────────────────────────────────────────────────

export const MovimentacaoAtivoCreateSchema = z.object({
  ativoId: z.string().cuid(),
  tipo: TipoMovimentacaoAtivoEnum,
  localizacaoOrigemId: z.string().cuid().optional(),
  localizacaoDestinoId: z.string().cuid().optional(),
  responsavelOrigemId: z.string().optional(),
  responsavelDestinoId: z.string().optional(),
  dataMovimentacao: z.coerce.date(),
  dataPrevisaoDevolucao: z.coerce.date().optional(),
  motivo: z.string().min(1, 'Motivo é obrigatório').max(500),
  observacoes: z.string().max(2000).optional(),
  guiaMovimentacao: z.string().max(50).optional(),
  assinaturaDigital: z.string().optional(),
  termoResponsabilidade: z.string().optional(),
});

export const ConfirmarMovimentacaoSchema = z.object({
  movimentacaoId: z.string().cuid(),
  confirmadaPor: z.string(),
});

export type MovimentacaoAtivoCreate = z.infer<typeof MovimentacaoAtivoCreateSchema>;

// ─── Manutenção de Ativo ──────────────────────────────────────────────────────

const PecaManutencaoSchema = z.object({
  produtoId: z.string().cuid().optional(),
  nome: z.string().min(1).max(200),
  quantidade: z.coerce.number().positive(),
  custoUnitario: z.coerce.number().nonnegative(),
  custoTotal: z.coerce.number().nonnegative(),
});

export const ManutencaoAtivoCreateSchema = z.object({
  ativoId: z.string().cuid('ID de ativo inválido'),
  tipo: TipoManutencaoAtivoEnum,
  prioridade: PrioridadeManutencaoEnum.optional(),
  dataAgendada: z.coerce.date(),
  titulo: z.string().min(1, 'Título é obrigatório').max(200),
  descricao: z.string().min(1, 'Descrição é obrigatória').max(2000),
  procedimentos: z.string().max(5000).optional(),
  tecnicoId: z.string().optional(),
  responsavelId: z.string().optional(),
  fornecedorId: z.string().optional(),
  custoEstimado: z.coerce.number().nonnegative().optional(),
  proximaManutencao: z.coerce.date().optional(),
  intervaloProximaManutencaoDias: z.coerce.number().int().positive().optional(),
  observacoes: z.string().max(2000).optional(),
  pecas: z.array(PecaManutencaoSchema).default([]),
});

export const ManutencaoAtivoUpdateSchema = z.object({
  prioridade: PrioridadeManutencaoEnum.optional(),
  dataAgendada: z.coerce.date().optional(),
  titulo: z.string().min(1).max(200).optional(),
  descricao: z.string().min(1).max(2000).optional(),
  procedimentos: z.string().max(5000).optional(),
  tecnicoId: z.string().optional(),
  responsavelId: z.string().optional(),
  fornecedorId: z.string().optional(),
  custoEstimado: z.coerce.number().nonnegative().optional(),
  custoReal: z.coerce.number().nonnegative().optional(),
  custoMaoObra: z.coerce.number().nonnegative().optional(),
  custoPecas: z.coerce.number().nonnegative().optional(),
  relatorio: z.string().max(10000).optional(),
  fotos: z.array(z.string().url()).optional(),
  anexos: z.array(z.string().url()).optional(),
  observacoes: z.string().max(2000).optional(),
  motivoCancelamento: z.string().max(500).optional(),
  proximaManutencao: z.coerce.date().optional(),
  intervaloProximaManutencaoDias: z.coerce.number().int().positive().optional(),
});

export const TransicaoManutencaoAtivoSchema = z.object({
  manutencaoId: z.string().cuid(),
  novoStatus: StatusManutencaoAtivoEnum,
  observacoes: z.string().max(2000).optional(),
  motivoCancelamento: z.string().max(500).optional(),
});

export const ManutencaoAtivoFilterSchema = z.object({
  ativoId: z.string().optional(),
  tipo: TipoManutencaoAtivoEnum.optional(),
  status: StatusManutencaoAtivoEnum.optional(),
  prioridade: PrioridadeManutencaoEnum.optional(),
  tecnicoId: z.string().optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(25),
});

export type ManutencaoAtivoCreate = z.infer<typeof ManutencaoAtivoCreateSchema>;
export type ManutencaoAtivoUpdate = z.infer<typeof ManutencaoAtivoUpdateSchema>;
export type ManutencaoAtivoFilter = z.infer<typeof ManutencaoAtivoFilterSchema>;
export type TransicaoManutencaoAtivo = z.infer<typeof TransicaoManutencaoAtivoSchema>;

// ─── Amortização ──────────────────────────────────────────────────────────────

export const GerarPlanoAmortizacaoSchema = z.object({
  ativoId: z.string().cuid('ID de ativo inválido'),
  anoInicio: z.coerce.number().int().min(2000).max(2100).optional(),
  mesInicio: z.coerce.number().int().min(1).max(12).optional(),
  contaDebitoId: z.string().optional(), // cross-domain: WS D
  contaCreditoId: z.string().optional(), // cross-domain: WS D
});

export type GerarPlanoAmortizacaoInput = z.infer<typeof GerarPlanoAmortizacaoSchema>;

// ─── Inventário Físico ────────────────────────────────────────────────────────

export const InventarioFisicoCreateSchema = z.object({
  codigo: z.string().min(1).max(30),
  titulo: z.string().min(1, 'Título é obrigatório').max(200),
  descricao: z.string().max(2000).optional(),
  dataInicio: z.coerce.date(),
  dataPrevistaConclusao: z.coerce.date().optional(),
  localizacaoId: z.string().cuid().optional(),
  responsavelId: z.string().min(1, 'Responsável é obrigatório'),
  localizacoesIncluidas: z.array(z.string()).default([]),
  categoriasIncluidas: z.array(z.string()).default([]),
  observacoes: z.string().max(2000).optional(),
});

export const InventarioFisicoUpdateSchema = z.object({
  titulo: z.string().min(1).max(200).optional(),
  descricao: z.string().max(2000).optional(),
  dataPrevistaConclusao: z.coerce.date().optional(),
  observacoes: z.string().max(2000).optional(),
  motivoCancelamento: z.string().max(500).optional(),
});

export const TransicaoInventarioFisicoSchema = z.object({
  inventarioId: z.string().cuid(),
  novoStatus: StatusInventarioFisicoEnum,
  observacoes: z.string().max(2000).optional(),
  motivoCancelamento: z.string().max(500).optional(),
});

export const InventarioFisicoFilterSchema = z.object({
  status: StatusInventarioFisicoEnum.optional(),
  responsavelId: z.string().optional(),
  localizacaoId: z.string().optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(25),
});

export type InventarioFisicoCreate = z.infer<typeof InventarioFisicoCreateSchema>;
export type InventarioFisicoUpdate = z.infer<typeof InventarioFisicoUpdateSchema>;
export type InventarioFisicoFilter = z.infer<typeof InventarioFisicoFilterSchema>;
export type TransicaoInventarioFisico = z.infer<typeof TransicaoInventarioFisicoSchema>;

// ─── Contagem de Inventário ───────────────────────────────────────────────────

export const RegistarContagemSchema = z.object({
  itemId: z.string().cuid('ID do item inválido'),
  encontrado: z.boolean(),
  localizacaoEncontradaId: z.string().cuid().optional(),
  responsavelEncontradoId: z.string().optional(),
  estadoEncontrado: EstadoAtivoEnum.optional(),
  observacoesContagem: z.string().max(2000).optional(),
  fotoContagem: z.string().url().optional(),
});

export const JustificarDiscrepanciaSchema = z.object({
  itemId: z.string().cuid(),
  tipoDiscrepancia: z.enum([
    'NAO_ENCONTRADO',
    'LOCAL_DIFERENTE',
    'RESPONSAVEL_DIFERENTE',
    'ESTADO_DIFERENTE',
    'DADOS_INCORRETOS',
  ]),
  justificativaDiscrepancia: z
    .string()
    .min(1, 'Justificativa é obrigatória')
    .max(2000),
});

export type RegistarContagem = z.infer<typeof RegistarContagemSchema>;
export type JustificarDiscrepancia = z.infer<typeof JustificarDiscrepanciaSchema>;
