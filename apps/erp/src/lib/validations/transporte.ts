// Zod schemas — Módulo de Transporte & Logística (WS F)
// Partilhado cliente/servidor. Nunca aceitar `where` cru do cliente.

import { z } from 'zod';

// ============================================================
// Enums (espelham os enums Prisma de operacoes.prisma)
// ============================================================

export const TipoViaturaEnum = z.enum([
  'LIGEIRO_PASSAGEIROS',
  'LIGEIRO_MERCADORIAS',
  'PESADO_MERCADORIAS',
  'PESADO_PASSAGEIROS',
  'MOTOCICLO',
  'OUTRO',
]);

export const UnidadeCapacidadeEnum = z.enum(['KG', 'TON', 'M3', 'PASSAGEIROS']);

export const EstadoViaturaEnum = z.enum([
  'DISPONIVEL',
  'EM_ACTIVIDADE',
  'EM_MANUTENCAO',
  'INACTIVA',
  'ABATIDA',
]);

export const TipoDocumentoViaturaEnum = z.enum([
  'LIVRETE',
  'INSPECAO',
  'SEGURO',
  'LICENCA',
  'MANIFESTO',
  'TAXA_RADIO',
  'OUTRO',
]);

export const EstadoDocumentoEnum = z.enum(['VALIDO', 'PROXIMO_EXPIRAR', 'EXPIRADO']);

export const TipoManutencaoViaturaEnum = z.enum(['PREVENTIVA', 'CORRECTIVA']);

export const CategoriaItemChecklistEnum = z.enum([
  'COMPONENTE',
  'SOBRESSALENTE',
  'ACESSORIO',
]);

export const EstadoItemChecklistEnum = z.enum(['OK', 'AVARIA', 'FALTA']);

export const TipoDocumentoMotoristaEnum = z.enum(['CARTA_CONDUCAO', 'BI', 'OUTRO']);

export const EstadoOperacionalMotoristaEnum = z.enum(['ACTIVO', 'INACTIVO', 'SUSPENSO']);

export const MotivoIndisponibilidadeEnum = z.enum([
  'FERIAS',
  'AUSENCIA',
  'SUSPENSAO',
  'MANUAL',
  'CONFLITO_AGENDA',
]);

export const FonteDisponibilidadeEnum = z.enum(['SISTEMA', 'RH_API', 'MANUAL']);

export const TipoActividadeEnum = z.enum([
  'DESLOCACAO',
  'MISSAO_SERVICO',
  'TRANSPORTE_MERCADORIAS',
  'TRANSPORTE_PESSOAL',
  'MANUTENCAO_CAMPO',
  'OUTRO',
]);

export const PrioridadeAtividadeEnum = z.enum(['BAIXA', 'MEDIA', 'ALTA', 'URGENTE']);

export const EstadoAtividadeEnum = z.enum([
  'PLANEADA',
  'EM_CURSO',
  'SUSPENSA',
  'CONCLUIDA',
  'CANCELADA',
]);

export const EstadoRotaEnum = z.enum([
  'PLANEADA',
  'ATIVA',
  'PAUSADA',
  'CONCLUIDA',
  'CANCELADA',
]);

export const TipoPontoRotaEnum = z.enum(['COLETA', 'ENTREGA', 'PARADA']);

export const EstadoPontoRotaEnum = z.enum(['PENDENTE', 'EM_TRANSITO', 'ENTREGUE', 'FALHADA']);

export const EstadoEntregaEnum = z.enum([
  'PENDENTE',
  'AGENDADA',
  'EM_TRANSITO',
  'ENTREGUE',
  'FALHADA',
  'CANCELADA',
]);

export const PrioridadeEntregaEnum = z.enum(['BAIXA', 'NORMAL', 'ALTA', 'URGENTE']);

export const TipoProvaEntregaEnum = z.enum(['ASSINATURA', 'FOTO', 'CODIGO']);

export const TipoCombustivelEnum = z.enum(['GASOLINA', 'DIESEL', 'ETANOL', 'GNV']);

// ============================================================
// Viatura
// ============================================================

export const CriarViaturaSchema = z.object({
  matricula: z.string().min(3, 'Matrícula obrigatória').max(20),
  marca: z.string().min(1, 'Marca obrigatória').max(100),
  modelo: z.string().min(1, 'Modelo obrigatório').max(100),
  tipoViatura: TipoViaturaEnum,
  capacidade: z.number().positive('Capacidade deve ser positiva'),
  unidadeCapacidade: UnidadeCapacidadeEnum,
  localActividade: z.string().min(1, 'Local de actividade obrigatório'),
  dataInicioActividade: z.coerce.date(),
  motoristaResponsavelId: z.string().cuid().optional(),
  observacoes: z.string().max(1000).optional(),
});

export const AtualizarViaturaSchema = CriarViaturaSchema.partial().extend({
  estado: EstadoViaturaEnum.optional(),
});

export const TransitarViaturaSchema = z.object({
  viaturaId: z.string().cuid(),
  estadoAlvo: EstadoViaturaEnum,
  motivo: z.string().max(500).optional(),
});

export const FiltrarViaturasSchema = z.object({
  estado: EstadoViaturaEnum.optional(),
  tipoViatura: TipoViaturaEnum.optional(),
  motoristaResponsavelId: z.string().cuid().optional(),
  cursor: z.string().optional(),
  take: z.number().int().min(1).max(100).default(25),
  orderBy: z.enum(['createdAt', 'matricula', 'marca']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type CriarViaturaInput = z.infer<typeof CriarViaturaSchema>;
export type AtualizarViaturaInput = z.infer<typeof AtualizarViaturaSchema>;
export type FiltrarViaturasInput = z.infer<typeof FiltrarViaturasSchema>;

// ============================================================
// Documento de Viatura
// ============================================================

export const CriarDocumentoViaturaSchema = z.object({
  viaturaId: z.string().cuid(),
  tipo: TipoDocumentoViaturaEnum,
  numero: z.string().min(1).max(100),
  dataEmissao: z.coerce.date(),
  dataValidade: z.coerce.date(),
  entidadeEmissora: z.string().min(1).max(200),
  prazoAlertaDias: z.number().int().min(1).max(365).default(30),
  anexo: z.string().url().optional(),
  observacoes: z.string().max(1000).optional(),
}).refine(
  (d) => d.dataValidade > d.dataEmissao,
  { message: 'Data de validade deve ser posterior à data de emissão', path: ['dataValidade'] },
);

export type CriarDocumentoViaturaInput = z.infer<typeof CriarDocumentoViaturaSchema>;

// ============================================================
// Manutenção de Viatura
// ============================================================

export const CriarManutencaoViaturaSchema = z.object({
  viaturaId: z.string().cuid(),
  tipo: TipoManutencaoViaturaEnum,
  data: z.coerce.date(),
  quilometragem: z.number().int().nonnegative().optional(),
  criterio: z.string().max(200).optional(),
  descricao: z.string().min(1, 'Descrição obrigatória').max(2000),
  fornecedor: z.string().max(200).optional(),
  custo: z.number().nonnegative().optional(),
  pecasSubstituidas: z.string().max(1000).optional(),
  responsavel: z.string().min(1).max(200),
  proximaManutencaoData: z.coerce.date().optional(),
  proximaManutencaoKm: z.number().int().nonnegative().optional(),
  proximaManutencaoCriterio: z.string().max(200).optional(),
});

export const FiltrarManutencoesSchema = z.object({
  viaturaId: z.string().cuid().optional(),
  tipo: TipoManutencaoViaturaEnum.optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

export type CriarManutencaoViaturaInput = z.infer<typeof CriarManutencaoViaturaSchema>;

// ============================================================
// Checklist
// ============================================================

export const ItemChecklistInputSchema = z.object({
  nome: z.string().min(1).max(200),
  categoria: CategoriaItemChecklistEnum,
  estado: EstadoItemChecklistEnum,
  observacoes: z.string().max(500).optional(),
});

export const CriarChecklistSchema = z.object({
  viaturaId: z.string().cuid(),
  dataInspeccao: z.coerce.date(),
  responsavel: z.string().min(1).max(200),
  responsavelId: z.string().cuid().optional(),
  observacoes: z.string().max(1000).optional(),
  itens: z.array(ItemChecklistInputSchema).min(1, 'Pelo menos um item obrigatório'),
});

export type CriarChecklistInput = z.infer<typeof CriarChecklistSchema>;

// ============================================================
// Motorista
// ============================================================

const CriarMotoristaBaseSchema = z.object({
  nomeCompleto: z.string().min(2, 'Nome obrigatório').max(200),
  contacto: z.string().min(9, 'Contacto inválido').max(30),
  morada: z.string().max(500).optional(),
  numeroBI: z.string().max(20).optional(),
  numeroCarta: z.string().min(1).max(50),
  categoriaCarta: z.array(z.string().min(1).max(5)).min(1, 'Pelo menos uma categoria'),
  dataEmissaoCarta: z.coerce.date(),
  validadeCarta: z.coerce.date(),
  localActividade: z.string().max(200).optional(),
  observacoes: z.string().max(1000).optional(),
});

export const CriarMotoristaSchema = CriarMotoristaBaseSchema.refine(
  (d) => d.validadeCarta > d.dataEmissaoCarta,
  { message: 'Validade da carta deve ser posterior à emissão', path: ['validadeCarta'] },
);

export const AtualizarMotoristaSchema = CriarMotoristaBaseSchema.partial().extend({
  estadoOperacional: EstadoOperacionalMotoristaEnum.optional(),
});

export const AtualizarDisponibilidadeMotoristaSchema = z.object({
  motoristaId: z.string().cuid(),
  disponivel: z.boolean(),
  motivo: MotivoIndisponibilidadeEnum.optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  fonte: FonteDisponibilidadeEnum.default('MANUAL'),
});

export const FiltrarMotoristasSchema = z.object({
  estadoOperacional: EstadoOperacionalMotoristaEnum.optional(),
  disponivel: z.boolean().optional(),
  cursor: z.string().optional(),
  take: z.number().int().min(1).max(100).default(25),
  orderBy: z.enum(['createdAt', 'nomeCompleto']).default('nomeCompleto'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export type CriarMotoristaInput = z.infer<typeof CriarMotoristaSchema>;
export type AtualizarMotoristaInput = z.infer<typeof AtualizarMotoristaSchema>;
export type AtualizarDisponibilidadeInput = z.infer<typeof AtualizarDisponibilidadeMotoristaSchema>;
export type FiltrarMotoristasInput = z.infer<typeof FiltrarMotoristasSchema>;

// ============================================================
// Documento de Motorista
// ============================================================

export const CriarDocumentoMotoristaSchema = z.object({
  motoristaId: z.string().cuid(),
  tipo: TipoDocumentoMotoristaEnum,
  numero: z.string().min(1).max(100),
  dataEmissao: z.coerce.date(),
  dataValidade: z.coerce.date(),
  entidadeEmissora: z.string().min(1).max(200),
  anexo: z.string().url().optional(),
  observacoes: z.string().max(1000).optional(),
}).refine(
  (d) => d.dataValidade > d.dataEmissao,
  { message: 'Data de validade deve ser posterior à data de emissão', path: ['dataValidade'] },
);

export type CriarDocumentoMotoristaInput = z.infer<typeof CriarDocumentoMotoristaSchema>;

// ============================================================
// Atividade (entidade central)
// ============================================================

const CriarAtividadeBaseSchema = z.object({
  titulo: z.string().min(3, 'Título obrigatório').max(300),
  descricao: z.string().max(2000).optional(),
  tipoActividade: TipoActividadeEnum,
  localActividade: z.string().min(1).max(300),
  dataInicioPrevista: z.coerce.date(),
  dataConclusaoPrevista: z.coerce.date().optional(),
  motoristaResponsavelId: z.string().cuid().optional(),
  viaturaId: z.string().cuid().optional(),
  prioridade: PrioridadeAtividadeEnum.default('MEDIA'),
  observacoes: z.string().max(2000).optional(),
  anexos: z.array(z.string().url()).default([]),
});

export const CriarAtividadeSchema = CriarAtividadeBaseSchema.refine(
  (d) =>
    !d.dataConclusaoPrevista || d.dataConclusaoPrevista > d.dataInicioPrevista,
  {
    message: 'Data de conclusão prevista deve ser posterior ao início',
    path: ['dataConclusaoPrevista'],
  },
);

export const AtualizarAtividadeSchema = CriarAtividadeBaseSchema.partial();

export const TransitarAtividadeSchema = z.object({
  atividadeId: z.string().cuid(),
  estadoAlvo: EstadoAtividadeEnum,
  descricao: z.string().min(1, 'Descrição da transição obrigatória').max(500),
});

export const FiltrarAtividadesSchema = z.object({
  estado: EstadoAtividadeEnum.optional(),
  tipoActividade: TipoActividadeEnum.optional(),
  prioridade: PrioridadeAtividadeEnum.optional(),
  motoristaResponsavelId: z.string().cuid().optional(),
  viaturaId: z.string().cuid().optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().optional(),
  take: z.number().int().min(1).max(100).default(25),
  orderBy: z.enum(['dataInicioPrevista', 'createdAt', 'prioridade']).default('dataInicioPrevista'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type CriarAtividadeInput = z.infer<typeof CriarAtividadeSchema>;
export type AtualizarAtividadeInput = z.infer<typeof AtualizarAtividadeSchema>;
export type TransitarAtividadeInput = z.infer<typeof TransitarAtividadeSchema>;
export type FiltrarAtividadesInput = z.infer<typeof FiltrarAtividadesSchema>;

// ============================================================
// Rota
// ============================================================

export const CriarRotaSchema = z.object({
  nome: z.string().min(1, 'Nome obrigatório').max(200),
  descricao: z.string().max(1000).optional(),
  origem: z.string().min(1, 'Origem obrigatória').max(300),
  destino: z.string().min(1, 'Destino obrigatório').max(300),
  viaturaId: z.string().cuid().optional(),
  motoristaId: z.string().cuid().optional(),
  dataInicio: z.coerce.date(),
  dataFim: z.coerce.date().optional(),
  distanciaTotal: z.number().positive().optional(),
  tempoEstimadoMin: z.number().int().positive().optional(),
  custoEstimado: z.number().nonnegative().optional(),
  observacoes: z.string().max(1000).optional(),
});

export const AtualizarRotaSchema = CriarRotaSchema.partial();

export const TransitarRotaSchema = z.object({
  rotaId: z.string().cuid(),
  estadoAlvo: EstadoRotaEnum,
  motivo: z.string().max(500).optional(),
});

export const FiltrarRotasSchema = z.object({
  estado: EstadoRotaEnum.optional(),
  viaturaId: z.string().cuid().optional(),
  motoristaId: z.string().cuid().optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().optional(),
  take: z.number().int().min(1).max(100).default(25),
  orderBy: z.enum(['dataInicio', 'createdAt']).default('dataInicio'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type CriarRotaInput = z.infer<typeof CriarRotaSchema>;
export type AtualizarRotaInput = z.infer<typeof AtualizarRotaSchema>;
export type FiltrarRotasInput = z.infer<typeof FiltrarRotasSchema>;

// ============================================================
// Entrega
// ============================================================

export const ItemEntregaInputSchema = z.object({
  produtoId: z.string().min(1),
  produtoNome: z.string().min(1).max(300),
  quantidade: z.number().int().positive(),
  peso: z.number().nonnegative(),
  volume: z.number().nonnegative(),
  valor: z.number().nonnegative(),
});

export const CriarEntregaSchema = z.object({
  vendaId: z.string().optional(),
  clienteId: z.string().min(1, 'Cliente obrigatório'),
  clienteNome: z.string().min(1).max(200),
  clienteTelefone: z.string().min(9).max(30),
  enderecoEntrega: z.string().min(1).max(500),
  cidade: z.string().min(1).max(200),
  rotaId: z.string().cuid().optional(),
  viaturaId: z.string().cuid().optional(),
  motoristaId: z.string().cuid().optional(),
  dataAgendada: z.coerce.date(),
  prioridade: PrioridadeEntregaEnum.default('NORMAL'),
  itens: z.array(ItemEntregaInputSchema).min(1, 'Pelo menos um item obrigatório'),
  pesoTotal: z.number().nonnegative(),
  volumeTotal: z.number().nonnegative(),
  valorCarga: z.number().nonnegative(),
  taxaEntrega: z.number().nonnegative(),
  observacoes: z.string().max(1000).optional(),
});

export const AtualizarEntregaSchema = CriarEntregaSchema.partial();

export const TransitarEntregaSchema = z.object({
  entregaId: z.string().cuid(),
  estadoAlvo: EstadoEntregaEnum,
  motivoFalha: z.string().max(500).optional(),
}).refine(
  (d) => d.estadoAlvo !== 'FALHADA' || !!d.motivoFalha,
  { message: 'Motivo de falha obrigatório quando estado é FALHADA', path: ['motivoFalha'] },
);

export const RegistarProvaEntregaSchema = z.object({
  entregaId: z.string().cuid(),
  tipo: TipoProvaEntregaEnum,
  dados: z.string().min(1),
  recebedor: z.string().min(1).max(200),
  dataHora: z.coerce.date(),
});

export const FiltrarEntregasSchema = z.object({
  estado: EstadoEntregaEnum.optional(),
  prioridade: PrioridadeEntregaEnum.optional(),
  clienteId: z.string().optional(),
  rotaId: z.string().cuid().optional(),
  viaturaId: z.string().cuid().optional(),
  motoristaId: z.string().cuid().optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().optional(),
  take: z.number().int().min(1).max(100).default(25),
  orderBy: z.enum(['dataAgendada', 'createdAt', 'prioridade']).default('dataAgendada'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type CriarEntregaInput = z.infer<typeof CriarEntregaSchema>;
export type AtualizarEntregaInput = z.infer<typeof AtualizarEntregaSchema>;
export type TransitarEntregaInput = z.infer<typeof TransitarEntregaSchema>;
export type RegistarProvaEntregaInput = z.infer<typeof RegistarProvaEntregaSchema>;
export type FiltrarEntregasInput = z.infer<typeof FiltrarEntregasSchema>;

// ============================================================
// Abastecimento
// ============================================================

export const RegistarAbastecimentoSchema = z.object({
  viaturaId: z.string().cuid(),
  motoristaId: z.string().cuid(),
  data: z.coerce.date(),
  kmVeiculo: z.number().int().nonnegative(),
  tipoCombustivel: TipoCombustivelEnum,
  litros: z.number().positive('Litros deve ser positivo'),
  valorLitro: z.number().positive('Valor/litro deve ser positivo'),
  valorTotal: z.number().positive('Valor total deve ser positivo'),
  posto: z.string().max(200).optional(),
  notaFiscal: z.string().max(100).optional(),
  kmPercorrido: z.number().int().nonnegative().optional(),
  rotaId: z.string().cuid().optional(),
  observacoes: z.string().max(1000).optional(),
}).refine(
  (d) => Math.abs(d.valorTotal - d.litros * d.valorLitro) < 0.1,
  {
    message: 'Valor total inconsistente com litros × valor/litro',
    path: ['valorTotal'],
  },
);

export const FiltrarAbastecimentosSchema = z.object({
  viaturaId: z.string().cuid().optional(),
  motoristaId: z.string().cuid().optional(),
  tipoCombustivel: TipoCombustivelEnum.optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().optional(),
  take: z.number().int().min(1).max(100).default(25),
  orderBy: z.enum(['data', 'createdAt']).default('data'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type RegistarAbastecimentoInput = z.infer<typeof RegistarAbastecimentoSchema>;
export type FiltrarAbastecimentosInput = z.infer<typeof FiltrarAbastecimentosSchema>;
