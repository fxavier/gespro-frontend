/**
 * Zod schemas — WS C Comercial (Clientes)
 * Partilhado cliente/servidor: sem 'server-only', sem imports de Prisma.
 *
 * Inclui: CreateClienteSchema, UpdateClienteSchema, FilterClienteSchema,
 *         CreateEnderecoClienteSchema, CreateContactoClienteSchema,
 *         CreateSegmentacaoClienteSchema
 */

import { z } from 'zod';
import { nuit, biMocambicano, provinciaSchema } from '@/lib/validations/common';

// ---------------------------------------------------------------------------
// Enums (espelham os enums Prisma em SCREAMING_SNAKE)
// ---------------------------------------------------------------------------

export const TipoClienteEnum = z.enum(['FISICA', 'JURIDICA', 'REVENDEDOR']);
export const StatusClienteEnum = z.enum(['ATIVO', 'INATIVO', 'SUSPENSO']);
export const CategoriaClienteEnum = z.enum(['VIP', 'REGULAR', 'NOVO', 'INATIVO']);
export const TipoEnderecoClienteEnum = z.enum(['FACTURACAO', 'ENTREGA', 'OUTRO']);
export const TipoContactoClienteEnum = z.enum(['PRINCIPAL', 'SECUNDARIO', 'TECNICO', 'FINANCEIRO']);
export const SegmentoClienteEnum = z.enum([
  'VAREJO',
  'GROSSISTA',
  'DISTRIBUIDOR',
  'CORPORATIVO',
  'GOVERNO',
]);
export const TamanhoEmpresaEnum = z.enum(['MICRO', 'PEQUENA', 'MEDIA', 'GRANDE']);
export const PotencialVendasEnum = z.enum(['ALTO', 'MEDIO', 'BAIXO']);
export const FrequenciaCompraEnum = z.enum(['DIARIA', 'SEMANAL', 'MENSAL', 'TRIMESTRAL', 'ANUAL']);

// ---------------------------------------------------------------------------
// Endereço
// ---------------------------------------------------------------------------

export const CreateEnderecoClienteSchema = z.object({
  tipo: TipoEnderecoClienteEnum.default('FACTURACAO'),
  rua: z.string().min(2, 'Rua obrigatória').max(200),
  numero: z.string().min(1, 'Número obrigatório').max(20),
  bairro: z.string().min(2, 'Bairro obrigatório').max(100),
  cidade: z.string().min(2, 'Cidade obrigatória').max(100),
  provincia: provinciaSchema,
  codigoPostal: z.string().max(20).optional(),
  referencia: z.string().max(300).optional(),
  principal: z.boolean().default(false),
});

export const UpdateEnderecoClienteSchema = CreateEnderecoClienteSchema.partial().extend({
  principal: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Contacto
// ---------------------------------------------------------------------------

export const CreateContactoClienteSchema = z.object({
  nome: z.string().min(2, 'Nome obrigatório').max(100),
  cargo: z.string().max(100).optional(),
  email: z.string().email('Email inválido'),
  telefone: z.string().min(9, 'Telefone inválido').max(20),
  telefoneSec: z.string().max(20).optional(),
  tipo: TipoContactoClienteEnum.default('PRINCIPAL'),
  ativo: z.boolean().default(true),
});

export const UpdateContactoClienteSchema = CreateContactoClienteSchema.partial();

// ---------------------------------------------------------------------------
// Segmentação
// ---------------------------------------------------------------------------

export const CreateSegmentacaoClienteSchema = z.object({
  segmento: SegmentoClienteEnum,
  industria: z.string().max(100).optional(),
  tamanhoEmpresa: TamanhoEmpresaEnum.optional(),
  potencialVendas: PotencialVendasEnum.default('MEDIO'),
  frequenciaCompra: FrequenciaCompraEnum.default('MENSAL'),
  ticketMedio: z.number().nonnegative('Ticket médio não pode ser negativo').default(0),
});

export const UpdateSegmentacaoClienteSchema = CreateSegmentacaoClienteSchema.partial();

// ---------------------------------------------------------------------------
// Representante
// ---------------------------------------------------------------------------

const RepresentanteSchema = z.object({
  nome: z.string().min(2).max(100),
  email: z.string().email('Email do representante inválido'),
  telefone: z.string().min(9).max(20),
});

// ---------------------------------------------------------------------------
// Cliente (entidade canónica — conflito #1)
// ---------------------------------------------------------------------------

export const CreateClienteSchema = z
  .object({
    nome: z.string().min(2, 'Nome obrigatório').max(200, 'Nome demasiado longo'),
    tipo: TipoClienteEnum,
    nuit: nuit(),
    bi: biMocambicano().optional(),
    email: z.string().email('Email inválido'),
    telefone: z.string().min(9, 'Telefone inválido').max(20),
    telefoneSec: z.string().max(20).optional(),
    diasPagamento: z.number().int().min(0).max(365).default(30),
    limiteCreditoMT: z
      .number()
      .nonnegative('Limite de crédito não pode ser negativo')
      .default(0),
    status: StatusClienteEnum.default('ATIVO'),
    categoria: CategoriaClienteEnum.default('NOVO'),
    observacoes: z.string().max(1000).optional(),
    representante: RepresentanteSchema.optional(),
    tags: z.array(z.string().max(50)).max(20).default([]),
    enderecos: z
      .array(CreateEnderecoClienteSchema)
      .min(1, 'Pelo menos um endereço é obrigatório'),
  })
  .refine((data) => data.enderecos.filter((e) => e.principal).length === 1, {
    message: 'Deve existir exactamente um endereço principal',
    path: ['enderecos'],
  });

export const UpdateClienteSchema = z.object({
  nome: z.string().min(2).max(200).optional(),
  tipo: TipoClienteEnum.optional(),
  nuit: nuit().optional(),
  bi: biMocambicano().optional().nullable(),
  email: z.string().email().optional(),
  telefone: z.string().min(9).max(20).optional(),
  telefoneSec: z.string().max(20).optional().nullable(),
  diasPagamento: z.number().int().min(0).max(365).optional(),
  limiteCreditoMT: z.number().nonnegative().optional(),
  status: StatusClienteEnum.optional(),
  categoria: CategoriaClienteEnum.optional(),
  observacoes: z.string().max(1000).optional().nullable(),
  representante: RepresentanteSchema.optional().nullable(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

export const FilterClienteSchema = z.object({
  cursor: z.string().optional(),
  take: z.number().int().min(1).max(100).default(25),
  /** Busca por nome, NUIT, email ou código */
  q: z.string().max(200).optional(),
  tipo: TipoClienteEnum.optional(),
  status: StatusClienteEnum.optional(),
  categoria: CategoriaClienteEnum.optional(),
  segmento: SegmentoClienteEnum.optional(),
  orderBy: z.enum(['nome', 'createdAt', 'categoria', 'creditoUtilizadoMT']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

// ---------------------------------------------------------------------------
// Tipos inferidos
// ---------------------------------------------------------------------------

export type CreateClienteInput = z.infer<typeof CreateClienteSchema>;
export type UpdateClienteInput = z.infer<typeof UpdateClienteSchema>;
export type FilterClienteInput = z.infer<typeof FilterClienteSchema>;
export type CreateEnderecoClienteInput = z.infer<typeof CreateEnderecoClienteSchema>;
export type UpdateEnderecoClienteInput = z.infer<typeof UpdateEnderecoClienteSchema>;
export type CreateContactoClienteInput = z.infer<typeof CreateContactoClienteSchema>;
export type UpdateContactoClienteInput = z.infer<typeof UpdateContactoClienteSchema>;
export type CreateSegmentacaoClienteInput = z.infer<typeof CreateSegmentacaoClienteSchema>;
export type UpdateSegmentacaoClienteInput = z.infer<typeof UpdateSegmentacaoClienteSchema>;
