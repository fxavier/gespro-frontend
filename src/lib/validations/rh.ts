import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const GeneroColaboradorEnum = z.enum(['MASCULINO', 'FEMININO', 'OUTRO']);
export const EstadoCivilEnum = z.enum(['SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'UNIAO_FACTO']);
export const StatusColaboradorEnum = z.enum([
  'ACTIVO', 'INACTIVO', 'FERIAS', 'AFASTADO', 'PERIODO_EXPERIMENTAL',
]);
export const TipoContratoTrabalhoEnum = z.enum([
  'EFECTIVO', 'TERMO_CERTO', 'ESTAGIO', 'TEMPORARIO', 'PRESTACAO_SERVICOS',
]);
export const RegimeTrabalhoEnum = z.enum(['TEMPO_INTEGRAL', 'TEMPO_PARCIAL']);
export const NivelAcessoColaboradorEnum = z.enum(['USUARIO', 'SUPERVISOR', 'GERENTE', 'ADMIN']);
export const NivelFormacaoAcademicaEnum = z.enum([
  'BASICO', 'MEDIO', 'TECNICO', 'LICENCIATURA', 'MESTRADO', 'DOUTORAMENTO',
]);
export const TipoDocColaboradorEnum = z.enum([
  'FOTO', 'BI_FRENTE', 'BI_VERSO', 'CERTIFICADO_HABILITACOES', 'CURRICULUM',
  'CERTIFICADO_CRIMINAL', 'ATESTADO_MEDICO_DOC', 'COMPROVATIVO_RESIDENCIA',
  'CERTIFICADO_INSS', 'DECLARACAO_NUIT', 'CONTRATO_TRABALHO', 'CARTA_CONDUCAO',
  'CERTIFICADO_PROFISSIONAL', 'OUTRO',
]);
export const TipoAusenciaEnum = z.enum([
  'FALTA', 'ATESTADO_MEDICO', 'LICENCA_MATERNIDADE', 'LICENCA_PATERNIDADE',
  'LICENCA_SEM_VENCIMENTO', 'LICENCA_NOJO', 'LICENCA_CASAMENTO', 'OUTRO',
]);
export const StatusAusenciaEnum = z.enum(['PENDENTE', 'APROVADA', 'REJEITADA']);
export const TipoSolicitacaoFeriasEnum = z.enum(['INTEGRAL', 'FRACIONADA', 'ABONO_PECUNIARIO']);
export const StatusSolicitacaoFeriasEnum = z.enum(['PENDENTE', 'APROVADA', 'REJEITADA', 'CANCELADA']);
export const TipoAssiduidadeEnum = z.enum([
  'NORMAL', 'FERIADO', 'FIM_SEMANA', 'FERIAS', 'AUSENCIA',
]);
export const TipoAvaliacaoEnum = z.enum([
  'DESEMPENHO', 'COMPETENCIAS', 'GRAU_360', 'PROBATORIO',
]);
export const StatusAvaliacaoEnum = z.enum(['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA']);
export const ModalidadeFormacaoEnum = z.enum(['PRESENCIAL', 'ONLINE', 'HIBRIDO']);
export const StatusFormacaoEnum = z.enum(['PLANEADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA']);
export const StatusParticipanteEnum = z.enum([
  'INSCRITO', 'CONFIRMADO', 'PRESENTE', 'AUSENTE', 'APROVADO', 'REPROVADO',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de validação moçambicana
// ─────────────────────────────────────────────────────────────────────────────

/** NUIT — 9 dígitos numéricos */
const nuitSchema = z
  .string()
  .regex(/^\d{9}$/, 'NUIT deve ter exactamente 9 dígitos numéricos');

/** BI moçambicano — formato alfanumérico (12 chars) */
const biMocambicanSchema = z
  .string()
  .min(8, 'Número de BI deve ter pelo menos 8 caracteres')
  .max(16, 'Número de BI não pode exceder 16 caracteres');

/** NISS moçambicano — 11 dígitos */
const nissSchema = z
  .string()
  .regex(/^\d{11}$/, 'NISS deve ter exactamente 11 dígitos')
  .optional();

// ─────────────────────────────────────────────────────────────────────────────
// Departamento
// ─────────────────────────────────────────────────────────────────────────────

export const CreateDepartamentoSchema = z.object({
  codigo: z.string().min(1).max(20),
  nome: z.string().min(1).max(100),
  descricao: z.string().max(500).optional(),
  departamentoPaiId: z.string().cuid().optional(),
  ativo: z.boolean().default(true),
});

export const UpdateDepartamentoSchema = CreateDepartamentoSchema.partial();

export const FilterDepartamentoSchema = z.object({
  search: z.string().optional(),
  ativo: z.boolean().optional(),
  departamentoPaiId: z.string().cuid().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

// ─────────────────────────────────────────────────────────────────────────────
// Cargo
// ─────────────────────────────────────────────────────────────────────────────

const CreateCargoBaseSchema = z.object({
  codigo: z.string().min(1).max(20),
  nome: z.string().min(1).max(100),
  descricao: z.string().max(500).optional(),
  departamentoId: z.string().cuid().optional(),
  nivelSalarial: z.number().int().min(1).max(20).optional(),
  salarioMinimo: z.number().positive().optional(),
  salarioMaximo: z.number().positive().optional(),
  ativo: z.boolean().default(true),
});

export const CreateCargoSchema = CreateCargoBaseSchema.refine(
  (d) => !d.salarioMinimo || !d.salarioMaximo || d.salarioMinimo <= d.salarioMaximo,
  { message: 'Salário mínimo não pode ser superior ao máximo', path: ['salarioMinimo'] },
);

export const UpdateCargoSchema = CreateCargoBaseSchema.partial();

export const FilterCargoSchema = z.object({
  search: z.string().optional(),
  ativo: z.boolean().optional(),
  departamentoId: z.string().cuid().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

// ─────────────────────────────────────────────────────────────────────────────
// Colaborador
// ─────────────────────────────────────────────────────────────────────────────

export const CreateColaboradorSchema = z.object({
  codigo: z.string().min(1).max(20),

  // Dados Pessoais
  nome: z.string().min(2).max(150),
  dataNascimento: z.coerce.date(),
  genero: GeneroColaboradorEnum,
  estadoCivil: EstadoCivilEnum,
  nacionalidade: z.string().min(1).max(60),
  naturalidadeProvincia: z.string().min(1).max(60),
  naturalidadeDistrito: z.string().min(1).max(60),

  // Documentos
  bi: biMocambicanSchema,
  nuit: nuitSchema,
  niss: nissSchema,

  // Contactos
  email: z.string().email('Email inválido'),
  telefone: z.string().min(9).max(20),
  telefoneAlternativo: z.string().min(9).max(20).optional(),
  enderecoRua: z.string().min(1).max(200),
  enderecoNumero: z.string().max(20),
  enderecoBairro: z.string().min(1).max(100),
  enderecoCidade: z.string().min(1).max(100),
  enderecoProvincia: z.string().min(1).max(60),
  enderecoCodigoPostal: z.string().max(10).optional(),

  // Contacto de Emergência
  emergenciaNome: z.string().min(2).max(150),
  emergenciaParentesco: z.string().min(1).max(50),
  emergenciaTelefone: z.string().min(9).max(20),

  fotoUrl: z.string().url().optional(),

  // Dados Profissionais
  departamentoId: z.string().cuid().optional(),
  cargoId: z.string().cuid().optional(),
  supervisorId: z.string().cuid().optional(),
  dataAdmissao: z.coerce.date(),
  status: StatusColaboradorEnum.default('ACTIVO'),
  tipoContrato: TipoContratoTrabalhoEnum,
  regimeTrabalho: RegimeTrabalhoEnum,
  horarioTrabalho: z.string().max(100).optional(),
  salarioBase: z.number().positive(),
  subsidioAlimentacao: z.number().nonnegative().optional(),
  subsidioTransporte: z.number().nonnegative().optional(),
  subsidioHabitacao: z.number().nonnegative().optional(),
  subsidiosOutros: z.number().nonnegative().optional(),
  localizacao: z.string().max(100).optional(),

  // Dados Bancários
  bancoBanco: z.string().max(100).optional(),
  bancoNib: z.string().max(30).optional(),
  bancoTitular: z.string().max(150).optional(),

  nivelAcesso: NivelAcessoColaboradorEnum.default('USUARIO'),
  observacoes: z.string().max(1000).optional(),
});

export const UpdateColaboradorSchema = CreateColaboradorSchema.partial().omit({ codigo: true });

export const FilterColaboradorSchema = z.object({
  search: z.string().optional(),
  status: StatusColaboradorEnum.optional(),
  departamentoId: z.string().cuid().optional(),
  cargoId: z.string().cuid().optional(),
  tipoContrato: TipoContratoTrabalhoEnum.optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

// ─────────────────────────────────────────────────────────────────────────────
// Ausência
// ─────────────────────────────────────────────────────────────────────────────

export const CreateAusenciaSchema = z.object({
  colaboradorId: z.string().cuid(),
  tipo: TipoAusenciaEnum,
  dataInicio: z.coerce.date(),
  dataFim: z.coerce.date(),
  justificada: z.boolean().default(false),
  justificativa: z.string().max(1000).optional(),
  observacoes: z.string().max(1000).optional(),
}).refine(
  (d) => d.dataFim >= d.dataInicio,
  { message: 'Data de fim não pode ser anterior à data de início', path: ['dataFim'] },
);

export const UpdateAusenciaSchema = z.object({
  status: StatusAusenciaEnum,
  motivoRejeicao: z.string().max(500).optional(),
  observacoes: z.string().max(1000).optional(),
});

export const FilterAusenciaSchema = z.object({
  colaboradorId: z.string().cuid().optional(),
  tipo: TipoAusenciaEnum.optional(),
  status: StatusAusenciaEnum.optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

// ─────────────────────────────────────────────────────────────────────────────
// Férias
// ─────────────────────────────────────────────────────────────────────────────

export const CreateFeriasSchema = z.object({
  colaboradorId: z.string().cuid(),
  periodoAquisitivoInicio: z.coerce.date(),
  periodoAquisitivoFim: z.coerce.date(),
  diasDisponiveis: z.number().int().positive(),
});

export const CreateSolicitacaoFeriasSchema = z.object({
  feriasId: z.string().cuid(),
  dataInicio: z.coerce.date(),
  dataFim: z.coerce.date(),
  diasSolicitados: z.number().int().positive(),
  tipo: TipoSolicitacaoFeriasEnum,
  observacoes: z.string().max(500).optional(),
}).refine(
  (d) => d.dataFim >= d.dataInicio,
  { message: 'Data de fim não pode ser anterior à data de início', path: ['dataFim'] },
);

export const AprovarSolicitacaoFeriasSchema = z.object({
  solicitacaoId: z.string().cuid(),
  status: z.enum(['APROVADA', 'REJEITADA']),
  motivoRejeicao: z.string().max(500).optional(),
}).refine(
  (d) => d.status !== 'REJEITADA' || !!d.motivoRejeicao,
  { message: 'Motivo de rejeição é obrigatório', path: ['motivoRejeicao'] },
);

// ─────────────────────────────────────────────────────────────────────────────
// Registo de Assiduidade
// ─────────────────────────────────────────────────────────────────────────────

export const CreateRegistoAssiduidadeSchema = z.object({
  colaboradorId: z.string().cuid(),
  data: z.coerce.date(),
  entrada: z.coerce.date(),
  saidaAlmoco: z.coerce.date().optional(),
  retornoAlmoco: z.coerce.date().optional(),
  saida: z.coerce.date(),
  tipo: TipoAssiduidadeEnum.default('NORMAL'),
  observacoes: z.string().max(500).optional(),
}).refine(
  (d) => d.saida > d.entrada,
  { message: 'Hora de saída deve ser posterior à entrada', path: ['saida'] },
);

export const FilterAssiduidadeSchema = z.object({
  colaboradorId: z.string().cuid().optional(),
  tipo: TipoAssiduidadeEnum.optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

// ─────────────────────────────────────────────────────────────────────────────
// Avaliação de Desempenho
// ─────────────────────────────────────────────────────────────────────────────

export const CriterioAvaliacaoSchema = z.object({
  nome: z.string().min(1).max(100),
  descricao: z.string().max(500),
  peso: z.number().min(0).max(100),
  nota: z.number().min(0).max(10),
  comentario: z.string().max(1000).optional(),
});

export const CreateAvaliacaoSchema = z.object({
  colaboradorId: z.string().cuid(),
  avaliadorId: z.string().cuid(),
  periodo: z.string().min(1).max(20),
  tipo: TipoAvaliacaoEnum,
  dataInicio: z.coerce.date(),
  criterios: z.array(CriterioAvaliacaoSchema).min(1),
  pontosFortes: z.array(z.string().max(200)).default([]),
  pontosDesenvolvimento: z.array(z.string().max(200)).default([]),
  planoAcao: z.array(z.string().max(200)).default([]),
  comentarios: z.string().max(2000).optional(),
}).refine(
  (d) => d.colaboradorId !== d.avaliadorId,
  { message: 'O colaborador não pode avaliar-se a si próprio', path: ['avaliadorId'] },
);

export const UpdateAvaliacaoSchema = z.object({
  criterios: z.array(CriterioAvaliacaoSchema).optional(),
  pontosFortes: z.array(z.string().max(200)).optional(),
  pontosDesenvolvimento: z.array(z.string().max(200)).optional(),
  planoAcao: z.array(z.string().max(200)).optional(),
  comentarios: z.string().max(2000).optional(),
  dataConclusao: z.coerce.date().optional(),
});

export const FilterAvaliacaoSchema = z.object({
  colaboradorId: z.string().cuid().optional(),
  avaliadorId: z.string().cuid().optional(),
  tipo: TipoAvaliacaoEnum.optional(),
  status: StatusAvaliacaoEnum.optional(),
  periodo: z.string().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

// ─────────────────────────────────────────────────────────────────────────────
// Formação
// ─────────────────────────────────────────────────────────────────────────────

const CreateFormacaoBaseSchema = z.object({
  titulo: z.string().min(1).max(200),
  descricao: z.string().min(1),
  categoria: z.string().min(1).max(100),
  instrutor: z.string().min(1).max(150),
  cargaHoraria: z.number().int().positive(),
  dataInicio: z.coerce.date(),
  dataFim: z.coerce.date(),
  local: z.string().min(1).max(200),
  modalidade: ModalidadeFormacaoEnum,
  vagasDisponiveis: z.number().int().positive(),
  custoTotal: z.number().nonnegative(),
  observacoes: z.string().max(1000).optional(),
});

export const CreateFormacaoSchema = CreateFormacaoBaseSchema.refine(
  (d) => d.dataFim >= d.dataInicio,
  { message: 'Data de fim deve ser igual ou posterior à data de início', path: ['dataFim'] },
);

export const UpdateFormacaoSchema = CreateFormacaoBaseSchema.partial();

export const InscricaoFormacaoSchema = z.object({
  formacaoId: z.string().cuid(),
  colaboradorId: z.string().cuid(),
});

export const FilterFormacaoSchema = z.object({
  search: z.string().optional(),
  status: StatusFormacaoEnum.optional(),
  modalidade: ModalidadeFormacaoEnum.optional(),
  dataInicio: z.coerce.date().optional(),
  dataFim: z.coerce.date().optional(),
  cursor: z.string().cuid().optional(),
  take: z.number().int().min(1).max(100).default(25),
});

// ─────────────────────────────────────────────────────────────────────────────
// Tipos exportados
// ─────────────────────────────────────────────────────────────────────────────

export type CreateDepartamentoInput = z.infer<typeof CreateDepartamentoSchema>;
export type UpdateDepartamentoInput = z.infer<typeof UpdateDepartamentoSchema>;
export type CreateCargoInput = z.infer<typeof CreateCargoSchema>;
export type UpdateCargoInput = z.infer<typeof UpdateCargoSchema>;
export type CreateColaboradorInput = z.infer<typeof CreateColaboradorSchema>;
export type UpdateColaboradorInput = z.infer<typeof UpdateColaboradorSchema>;
export type FilterColaboradorInput = z.infer<typeof FilterColaboradorSchema>;
export type CreateAusenciaInput = z.infer<typeof CreateAusenciaSchema>;
export type UpdateAusenciaInput = z.infer<typeof UpdateAusenciaSchema>;
export type CreateFeriasInput = z.infer<typeof CreateFeriasSchema>;
export type CreateSolicitacaoFeriasInput = z.infer<typeof CreateSolicitacaoFeriasSchema>;
export type AprovarSolicitacaoFeriasInput = z.infer<typeof AprovarSolicitacaoFeriasSchema>;
export type CreateRegistoAssiduidadeInput = z.infer<typeof CreateRegistoAssiduidadeSchema>;
export type FilterAssiduidadeInput = z.infer<typeof FilterAssiduidadeSchema>;
export type CreateAvaliacaoInput = z.infer<typeof CreateAvaliacaoSchema>;
export type UpdateAvaliacaoInput = z.infer<typeof UpdateAvaliacaoSchema>;
export type CreateFormacaoInput = z.infer<typeof CreateFormacaoSchema>;
export type UpdateFormacaoInput = z.infer<typeof UpdateFormacaoSchema>;
export type FilterFormacaoInput = z.infer<typeof FilterFormacaoSchema>;
