// Zod schemas — WS G Plataforma
// Partilhado cliente/servidor: sem 'server-only', sem imports de Prisma.
// Cobre: gestão de tenants (plataforma), utilizadores/roles (admin de tenant),
// configuração fiscal e leitura de auditoria.

import { z } from 'zod';
import { validarNUIT } from '@/lib/validacao-nuit';
import { getProvincias } from '@/lib/provincias-mocambique';

// ---------------------------------------------------------------------------
// Helpers de refinamento moçambicanos
// ---------------------------------------------------------------------------

export const nuitSchema = z
  .string()
  .min(9)
  .max(9)
  .refine(validarNUIT, { message: 'NUIT inválido (9 dígitos não repetidos)' });

export const provinciaSchema = z
  .string()
  .refine((v) => getProvincias().includes(v), {
    message: 'Província inválida para Moçambique',
  })
  .optional();

// ---------------------------------------------------------------------------
// Enums (espelham os enums Prisma em SCREAMING_SNAKE)
// ---------------------------------------------------------------------------

export const regimeIvaEnum = z.enum(['NORMAL', 'SIMPLIFICADO', 'ISENTO']);
export type RegimeIva = z.infer<typeof regimeIvaEnum>;

export const planoAssinaturaEnum = z.enum(['BASICO', 'PROFISSIONAL', 'EMPRESARIAL']);
export type PlanoAssinatura = z.infer<typeof planoAssinaturaEnum>;

// ---------------------------------------------------------------------------
// Gestão de Tenants — admin de plataforma (permissão: plataforma:admin)
// ---------------------------------------------------------------------------

export const CreateTenantSchema = z.object({
  nome: z.string().min(2, 'Nome obrigatório').max(200),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug: apenas letras minúsculas, números e hífens'),
  nuit: nuitSchema,
  // Campos da ConfiguracaoFiscal criada em transacção
  email: z.string().email('Email inválido').optional(),
  telefone: z.string().max(20).optional(),
  endereco: z.string().max(300).optional(),
  cidade: z.string().max(100).optional(),
  provincia: provinciaSchema,
  codigoPostal: z.string().max(10).optional(),
  timezone: z.string().max(50).default('Africa/Maputo'),
  moedaBase: z
    .string()
    .length(3, 'Código de moeda ISO 4217 (3 letras)')
    .default('MZN'),
  planoAssinatura: planoAssinaturaEnum.default('BASICO'),
  regimeIva: regimeIvaEnum.default('NORMAL'),
  // IVA como FRACÇÃO (ADR-0003 §4): 0.16 = 16 %. Consistente com A/B/C/D.
  taxaIvaDefault: z.number().min(0).max(1).default(0.16),
});
export type CreateTenantInput = z.infer<typeof CreateTenantSchema>;

/** Actualização: slug e nuit são imutáveis após criação. */
export const UpdateTenantSchema = CreateTenantSchema.partial().omit({
  slug: true,
  nuit: true,
});
export type UpdateTenantInput = z.infer<typeof UpdateTenantSchema>;

export const FilterTenantSchema = z.object({
  search: z.string().max(200).optional(),
  planoAssinatura: planoAssinaturaEnum.optional(),
  statusAtivo: z.boolean().optional(),
  cursor: z.string().optional(),
  take: z.number().int().min(1).max(100).default(25),
});
export type FilterTenantInput = z.infer<typeof FilterTenantSchema>;

// ---------------------------------------------------------------------------
// Configuração Fiscal — admin do tenant (permissão: configuracoes:editar)
// ---------------------------------------------------------------------------

export const ConfiguracaoFiscalSchema = z.object({
  regimeIva: regimeIvaEnum.optional(),
  // IVA como FRACÇÃO (ADR-0003 §4): 0.16 = 16 %. Consistente com A/B/C/D.
  taxaIvaDefault: z.number().min(0).max(1).optional(),
  email: z.string().email().optional(),
  telefone: z.string().max(20).optional(),
  endereco: z.string().max(300).optional(),
  cidade: z.string().max(100).optional(),
  provincia: provinciaSchema,
  codigoPostal: z.string().max(10).optional(),
  timezone: z.string().max(50).optional(),
  moedaBase: z.string().length(3).optional(),
  /** URL do logótipo; string vazia remove o logótipo actual. */
  logoEmpresa: z
    .string()
    .url('URL inválido')
    .optional()
    .or(z.literal('')),
  assinaturaDigital: z.string().max(500).optional(),
  planoAssinatura: planoAssinaturaEnum.optional(),
  statusAtivo: z.boolean().optional(),
});
export type ConfiguracaoFiscalInput = z.infer<typeof ConfiguracaoFiscalSchema>;

// ---------------------------------------------------------------------------
// Gestão de Utilizadores — admin do tenant (permissão: utilizadores:gerir)
// ---------------------------------------------------------------------------

export const CreateUserSchema = z.object({
  nome: z.string().min(2, 'Nome obrigatório').max(200),
  email: z.string().email('Email inválido'),
  password: z
    .string()
    .min(8, 'A palavra-passe deve ter pelo menos 8 caracteres')
    .max(128),
  roleIds: z
    .array(z.string().cuid('ID de papel inválido'))
    .min(1, 'Atribua pelo menos um papel ao utilizador'),
  ativo: z.boolean().default(true),
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z.object({
  nome: z.string().min(2).max(200).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).max(128).optional(),
  ativo: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

export const FilterUserSchema = z.object({
  search: z.string().max(200).optional(),
  ativo: z.boolean().optional(),
  roleId: z.string().cuid().optional(),
  cursor: z.string().optional(),
  take: z.number().int().min(1).max(100).default(25),
});
export type FilterUserInput = z.infer<typeof FilterUserSchema>;

/** Substitui a lista completa de roles de um utilizador. */
export const AssignRoleSchema = z.object({
  userId: z.string().cuid('ID de utilizador inválido'),
  roleIds: z
    .array(z.string().cuid('ID de papel inválido'))
    .min(1, 'Atribua pelo menos um papel'),
});
export type AssignRoleInput = z.infer<typeof AssignRoleSchema>;

// ---------------------------------------------------------------------------
// Gestão de Roles — admin do tenant (permissão: roles:gerir)
// ---------------------------------------------------------------------------

export const CreateRoleSchema = z.object({
  nome: z.string().min(2, 'Nome obrigatório').max(100),
  descricao: z.string().max(500).optional(),
  /** Códigos de Permission a associar (ex.: ['vendas:criar', 'stock:ler']). */
  permissionCodes: z.array(z.string().max(100)).default([]),
});
export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;

export const UpdateRoleSchema = CreateRoleSchema.partial();
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;

// ---------------------------------------------------------------------------
// Auditoria — leitura (permissão: auditoria:ler)
// ---------------------------------------------------------------------------

export const FilterAuditLogSchema = z.object({
  /** Filtra por tipo de entidade (ex.: 'Venda', 'Fatura'). */
  entity: z.string().max(100).optional(),
  /** Filtra por ID de entidade específica. */
  entityId: z.string().max(100).optional(),
  /** Filtra por acção (ex.: 'CREATE', 'UPDATE', 'DELETE', 'TRANSICAO'). */
  action: z.string().max(100).optional(),
  /** Filtra por utilizador que efectuou a acção. */
  userId: z.string().max(100).optional(),
  /** Data de início (ISO 8601). */
  dateFrom: z.string().datetime({ message: 'Data inválida (ISO 8601)' }).optional(),
  /** Data de fim (ISO 8601). */
  dateTo: z.string().datetime({ message: 'Data inválida (ISO 8601)' }).optional(),
  cursor: z.string().optional(),
  take: z.number().int().min(1).max(100).default(25),
});
export type FilterAuditLogInput = z.infer<typeof FilterAuditLogSchema>;
