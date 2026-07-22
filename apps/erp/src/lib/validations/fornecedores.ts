/**
 * Zod schemas — Fornecedores (WS B)
 * Partilhado cliente/servidor. Sem imports de @prisma/client.
 * Helpers moçambicanos: validarNUIT de src/lib/validacao-nuit.ts
 */
import { z } from 'zod';
import { nuit } from '@/lib/validations/common';

// ---- Enums ----

export const TipoFornecedorEnum = z.enum(['PESSOA_FISICA', 'PESSOA_JURIDICA']);
export const StatusFornecedorEnum = z.enum(['ATIVO', 'INATIVO', 'SUSPENSO']);
export const ClassificacaoFornecedorEnum = z.enum(['PREFERENCIAL', 'REGULAR', 'NOVO']);
export const TipoEnderecoFornecedorEnum = z.enum(['SEDE', 'ENTREGA', 'OUTRO']);
export const TipoContactoFornecedorEnum = z.enum(['PRINCIPAL', 'SECUNDARIO', 'TECNICO', 'FINANCEIRO']);
export const TipoDocumentoFornecedorEnum = z.enum(['CONTRATO', 'NUIT', 'CERTIFICACAO', 'OUTRO']);

// ---- Endereço ----

export const CreateEnderecoFornecedorSchema = z.object({
  tipo: TipoEnderecoFornecedorEnum.default('SEDE'),
  rua: z.string().min(1, 'Rua obrigatória').max(200),
  numero: z.string().min(1, 'Número obrigatório').max(20),
  bairro: z.string().min(1, 'Bairro obrigatório').max(100),
  cidade: z.string().min(1, 'Cidade obrigatória').max(100),
  provincia: z.string().min(1, 'Província obrigatória').max(100),
  codigoPostal: z.string().max(20).optional(),
  referencia: z.string().max(300).optional(),
  principal: z.boolean().default(false),
});

export const UpdateEnderecoFornecedorSchema = CreateEnderecoFornecedorSchema.partial();

// ---- Contacto ----

export const CreateContactoFornecedorSchema = z.object({
  fornecedorId: z.string().cuid('ID de fornecedor inválido'),
  nome: z.string().min(2, 'Nome obrigatório').max(150),
  cargo: z.string().max(100).optional(),
  email: z.string().email('Email inválido').optional(),
  telefone: z.string().max(30).optional(),
  telefoneSec: z.string().max(30).optional(),
  tipo: TipoContactoFornecedorEnum.default('PRINCIPAL'),
  ativo: z.boolean().default(true),
});

export const UpdateContactoFornecedorSchema = CreateContactoFornecedorSchema.partial().omit({
  fornecedorId: true,
});

// ---- Documento ----

export const CreateDocumentoFornecedorSchema = z.object({
  fornecedorId: z.string().cuid('ID de fornecedor inválido'),
  tipo: TipoDocumentoFornecedorEnum.default('OUTRO'),
  nome: z.string().min(1, 'Nome do documento obrigatório').max(200),
  dataValidade: z.coerce.date().optional(),
  url: z.string().url('URL inválida'),
  observacoes: z.string().max(500).optional(),
});

export const UpdateDocumentoFornecedorSchema = CreateDocumentoFornecedorSchema.partial().omit({
  fornecedorId: true,
});

// ---- Avaliação ----

const scoreSchema = z
  .number()
  .int()
  .min(1, 'Score mínimo: 1')
  .max(5, 'Score máximo: 5');

export const CreateAvaliacaoFornecedorSchema = z.object({
  fornecedorId: z.string().cuid('ID de fornecedor inválido'),
  qualidade: scoreSchema,
  prazo: scoreSchema,
  preco: scoreSchema,
  comunicacao: scoreSchema,
  observacoes: z.string().max(1000).optional(),
});

// ---- Fornecedor (Create) ----

export const CreateFornecedorSchema = z.object({
  codigo: z.string().min(1, 'Código obrigatório').max(50),
  nome: z.string().min(2, 'Nome obrigatório').max(200),
  tipo: TipoFornecedorEnum,
  nuit: nuit(),
  bi: z.string().max(20).optional(),
  email: z.string().email('Email inválido'),
  telefone: z.string().max(30).optional(),
  telefoneSec: z.string().max(30).optional(),
  categoria: z.string().max(100).optional(),
  classificacao: ClassificacaoFornecedorEnum.default('REGULAR'),
  diasPagamento: z.number().int().positive().default(30),
  prazoMedioPagamento: z.number().int().positive().default(30),
  condicoesPagamento: z.string().max(200).optional(),
  formasPagamento: z.array(z.string().max(100)).default([]),
  condicoesComerciaisDesconto: z.number().min(0).max(100).optional(),
  limiteCredito: z.number().positive().optional(),
  observacoes: z.string().max(2000).optional(),
  tags: z.array(z.string().max(50)).default([]),
  // Endereço principal (opcional; pode ser adicionado depois)
  enderecoPrincipal: CreateEnderecoFornecedorSchema.optional(),
});

export type CreateFornecedorInput = z.infer<typeof CreateFornecedorSchema>;

// ---- Fornecedor (Update) ----

export const UpdateFornecedorSchema = z
  .object({
    nome: z.string().min(2).max(200).optional(),
    tipo: TipoFornecedorEnum.optional(),
    nuit: nuit().optional(),
    bi: z.string().max(20).optional(),
    email: z.string().email('Email inválido').optional(),
    telefone: z.string().max(30).optional(),
    telefoneSec: z.string().max(30).optional(),
    categoria: z.string().max(100).optional(),
    status: StatusFornecedorEnum.optional(),
    classificacao: ClassificacaoFornecedorEnum.optional(),
    diasPagamento: z.number().int().positive().optional(),
    prazoMedioPagamento: z.number().int().positive().optional(),
    condicoesPagamento: z.string().max(200).optional(),
    formasPagamento: z.array(z.string().max(100)).optional(),
    condicoesComerciaisDesconto: z.number().min(0).max(100).optional(),
    limiteCredito: z.number().positive().optional(),
    observacoes: z.string().max(2000).optional(),
    tags: z.array(z.string().max(50)).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Pelo menos um campo deve ser fornecido para actualizar',
  });

export type UpdateFornecedorInput = z.infer<typeof UpdateFornecedorSchema>;

// ---- Fornecedor (Filter) ----

export const FilterFornecedorSchema = z.object({
  termo: z.string().max(200).optional(),
  tipo: TipoFornecedorEnum.optional(),
  status: StatusFornecedorEnum.optional(),
  classificacao: ClassificacaoFornecedorEnum.optional(),
  categoria: z.string().max(100).optional(),
  ratingMin: z.number().min(1).max(5).optional(),
  // Paginação por cursor
  cursor: z.string().cuid().optional(),
  take: z.number().int().positive().max(100).default(25),
  orderBy: z
    .enum(['nome', 'createdAt', 'rating', 'totalCompras'])
    .default('nome'),
  orderDir: z.enum(['asc', 'desc']).default('asc'),
});

export type FilterFornecedorInput = z.infer<typeof FilterFornecedorSchema>;
