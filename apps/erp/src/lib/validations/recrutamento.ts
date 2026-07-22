/**
 * Validações Zod — Módulo Recrutamento (Spec 07).
 * Partilhado entre cliente e servidor — sem `server-only`.
 * Reutiliza refinements moçambicanos de mocambique.ts.
 */
import { z } from 'zod';
import { validarNUIT } from '../validacao-nuit';
import { validarBI } from '../validacao-bi';

// ─────────────────────────────────────────────────────────────────────────────
// Enums
// ─────────────────────────────────────────────────────────────────────────────

export const StatusVagaEnum = z.enum([
  'RASCUNHO', 'ABERTA', 'EM_TRIAGEM', 'FECHADA', 'CANCELADA',
]);

export const EtapaCandidaturaEnum = z.enum([
  'RECEBIDA', 'TRIAGEM', 'ENTREVISTA', 'PROPOSTA', 'CONTRATADO', 'REJEITADO', 'DESISTIU',
]);

export const TipoEntrevistaEnum = z.enum([
  'TELEFONICA', 'PRESENCIAL', 'VIDEO', 'TECNICA', 'PAINEL',
]);

export const RegimeTrabalhoEnum = z.enum(['TEMPO_INTEGRAL', 'TEMPO_PARCIAL']);

export const TipoContratoEnum = z.enum([
  'EFECTIVO', 'TERMO_CERTO', 'ESTAGIO', 'TEMPORARIO', 'PRESTACAO_SERVICOS',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Vaga
// ─────────────────────────────────────────────────────────────────────────────

// Schema base sem refine — permite .partial() para actualização
const VagaBaseSchema = z.object({
  titulo: z.string().min(1, 'Título é obrigatório').max(200),
  descricao: z.string().min(1, 'Descrição é obrigatória').max(5000),
  departamentoId: z.string().cuid().optional().nullable(),
  cargoId: z.string().cuid().optional().nullable(),
  numeroPosicoes: z.coerce.number().int().positive().default(1),
  salarioMin: z.coerce.number().positive().optional().nullable(),
  salarioMax: z.coerce.number().positive().optional().nullable(),
  regimeTrabalho: RegimeTrabalhoEnum,
  tipoContrato: TipoContratoEnum,
  localizacao: z.string().max(200).optional().nullable(),
  requisitos: z.array(z.string().min(1).max(500)).default([]),
  dataAbertura: z.coerce.date().optional().nullable(),
  dataFecho: z.coerce.date().optional().nullable(),
  responsavelId: z.string().optional().nullable(),
});

export const VagaSchema = VagaBaseSchema.refine(
  (d) => !d.salarioMin || !d.salarioMax || d.salarioMin <= d.salarioMax,
  { message: 'Salário mínimo não pode ser superior ao máximo', path: ['salarioMin'] },
);

export type VagaInput = z.infer<typeof VagaBaseSchema>;

export const UpdateVagaSchema = VagaBaseSchema.partial();
export type UpdateVagaInput = z.infer<typeof UpdateVagaSchema>;

export const FilterVagaSchema = z.object({
  q: z.string().optional(),
  status: StatusVagaEnum.optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
  orderBy: z.enum(['createdAt', 'titulo', 'status']).default('createdAt'),
  orderDir: z.enum(['asc', 'desc']).default('desc'),
});

export type FilterVagaInput = z.infer<typeof FilterVagaSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Candidato
// ─────────────────────────────────────────────────────────────────────────────

export const CandidatoSchema = z.object({
  nome: z.string().min(2, 'Nome é obrigatório').max(200),
  email: z.string().email('Email inválido'),
  telefone: z.string().min(8).max(20),
  bi: z.string().optional().nullable().refine(
    (v) => !v || validarBI(v),
    { message: 'BI inválido — formato esperado: 12 dígitos seguidos de uma letra (ex: 110100123456A)' },
  ),
  nuit: z.string().optional().nullable().refine(
    (v) => !v || (/^\d{9}$/.test(v) && validarNUIT(v)),
    { message: 'NUIT inválido — deve ter 9 dígitos numéricos' },
  ),
  cvUrl: z.string().url('URL de CV inválido').optional().nullable(),
  linkedinUrl: z.string().url('URL LinkedIn inválido').optional().nullable(),
  observacoes: z.string().max(2000).optional().nullable(),
});

export type CandidatoInput = z.infer<typeof CandidatoSchema>;

export const UpdateCandidatoSchema = CandidatoSchema.partial();
export type UpdateCandidatoInput = z.infer<typeof UpdateCandidatoSchema>;

export const FilterCandidatoSchema = z.object({
  q: z.string().optional(),
  take: z.coerce.number().int().positive().max(100).default(25),
  cursor: z.string().optional(),
});

export type FilterCandidatoInput = z.infer<typeof FilterCandidatoSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Candidatura
// ─────────────────────────────────────────────────────────────────────────────

export const CandidaturaSchema = z.object({
  vagaId: z.string().cuid('ID de vaga inválido'),
  candidatoId: z.string().cuid('ID de candidato inválido'),
  fonte: z.string().max(100).optional().nullable(),
  pretensaoSalarial: z.coerce.number().positive().optional().nullable(),
  notaTriagem: z.coerce.number().min(0).max(10).optional().nullable(),
});

export type CandidaturaInput = z.infer<typeof CandidaturaSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Mover etapa / kanban
// ─────────────────────────────────────────────────────────────────────────────

export const MoverEtapaSchema = z.object({
  candidaturaId: z.string().cuid(),
  novaEtapa: EtapaCandidaturaEnum,
  notas: z.string().max(2000).optional().nullable(),
  motivoRejeicao: z.string().max(2000).optional().nullable(),
});

export type MoverEtapaInput = z.infer<typeof MoverEtapaSchema>;

export const MoverPosicaoKanbanSchema = z.object({
  candidaturaId: z.string().cuid(),
  posicao: z.string().min(1),
  novaEtapa: EtapaCandidaturaEnum.optional(),
});

export type MoverPosicaoKanbanInput = z.infer<typeof MoverPosicaoKanbanSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Entrevista
// ─────────────────────────────────────────────────────────────────────────────

export const EntrevistaSchema = z.object({
  candidaturaId: z.string().cuid(),
  tipo: TipoEntrevistaEnum,
  dataHora: z.coerce.date(),
  entrevistadores: z.array(z.string().min(1)).min(1, 'Pelo menos um entrevistador é obrigatório'),
  avaliacao: z.coerce.number().min(0).max(10).optional().nullable(),
  parecer: z.string().max(5000).optional().nullable(),
  recomendaAvancar: z.boolean().optional().nullable(),
});

export type EntrevistaInput = z.infer<typeof EntrevistaSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Admissão
// ─────────────────────────────────────────────────────────────────────────────

export const AdmitirSchema = z.object({
  candidaturaId: z.string().cuid(),
  // Campos do Colaborador (obrigatórios para criar o registo)
  nome: z.string().min(2, 'Nome é obrigatório').max(200),
  codigo: z.string().min(1).max(20),
  dataNascimento: z.coerce.date(),
  genero: z.enum(['MASCULINO', 'FEMININO', 'OUTRO']),
  estadoCivil: z.enum(['SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'UNIAO_FACTO']),
  nacionalidade: z.string().min(1).max(100),
  naturalidadeProvincia: z.string().min(1).max(100),
  naturalidadeDistrito: z.string().min(1).max(100),
  bi: z.string().refine(validarBI, {
    message: 'BI inválido — formato esperado: 12 dígitos seguidos de uma letra',
  }),
  nuit: z.string().regex(/^\d{9}$/, 'NUIT deve ter 9 dígitos').refine(validarNUIT, {
    message: 'NUIT inválido',
  }),
  niss: z.string().optional().nullable(),
  email: z.string().email(),
  telefone: z.string().min(8).max(20),
  telefoneAlternativo: z.string().optional().nullable(),
  enderecoRua: z.string().min(1).max(200),
  enderecoNumero: z.string().min(1).max(50),
  enderecoBairro: z.string().min(1).max(100),
  enderecoCidade: z.string().min(1).max(100),
  enderecoProvincia: z.string().min(1).max(100),
  enderecoCodigoPostal: z.string().optional().nullable(),
  emergenciaNome: z.string().min(1).max(200),
  emergenciaParentesco: z.string().min(1).max(100),
  emergenciaTelefone: z.string().min(8).max(20),
  fotoUrl: z.string().url().optional().nullable(),
  departamentoId: z.string().cuid().optional().nullable(),
  cargoId: z.string().cuid().optional().nullable(),
  supervisorId: z.string().cuid().optional().nullable(),
  dataAdmissao: z.coerce.date(),
  tipoContrato: z.enum(['EFECTIVO', 'TERMO_CERTO', 'ESTAGIO', 'TEMPORARIO', 'PRESTACAO_SERVICOS']),
  regimeTrabalho: z.enum(['TEMPO_INTEGRAL', 'TEMPO_PARCIAL']),
  horarioTrabalho: z.string().optional().nullable(),
  salarioBase: z.coerce.number().positive(),
  subsidioAlimentacao: z.coerce.number().nonnegative().optional().nullable(),
  subsidioTransporte: z.coerce.number().nonnegative().optional().nullable(),
  subsidioHabitacao: z.coerce.number().nonnegative().optional().nullable(),
  subsidiosOutros: z.coerce.number().nonnegative().optional().nullable(),
  localizacao: z.string().optional().nullable(),
  bancoBanco: z.string().optional().nullable(),
  bancoNib: z.string().optional().nullable(),
  bancoTitular: z.string().optional().nullable(),
  nivelAcesso: z.enum(['USUARIO', 'SUPERVISOR', 'GERENTE', 'ADMIN']).default('USUARIO'),
  observacoes: z.string().max(2000).optional().nullable(),
});

export type AdmitirInput = z.infer<typeof AdmitirSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Transitar status de vaga
// ─────────────────────────────────────────────────────────────────────────────

export const TransitarStatusVagaSchema = z.object({
  vagaId: z.string().cuid(),
  novoStatus: StatusVagaEnum,
  notas: z.string().max(2000).optional().nullable(),
});

export type TransitarStatusVagaInput = z.infer<typeof TransitarStatusVagaSchema>;
