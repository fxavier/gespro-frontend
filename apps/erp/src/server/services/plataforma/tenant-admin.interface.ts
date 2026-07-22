import 'server-only';
import type { Page } from '@/server/db/paginate';
import type {
  CreateTenantInput,
  UpdateTenantInput,
  FilterTenantInput,
  ConfiguracaoFiscalInput,
  PlanoAssinatura,
  RegimeIva,
} from '@/lib/validations/plataforma';

// ---------------------------------------------------------------------------
// Tipos de resposta (Wave 1 — sem tipos Prisma gerados; Wave 2 usa Prisma.$*)
// ---------------------------------------------------------------------------

export interface ConfiguracaoFiscalRow {
  id: string;
  tenantId: string;
  planoAssinatura: PlanoAssinatura;
  statusAtivo: boolean;
  email: string | null;
  telefone: string | null;
  endereco: string | null;
  cidade: string | null;
  provincia: string | null;
  codigoPostal: string | null;
  timezone: string;
  moedaBase: string;
  regimeIva: RegimeIva;
  /** Decimal(9,6) serializado como string. Ex.: "16.000000" */
  taxaIvaDefault: string;
  logoEmpresa: string | null;
  assinaturaDigital: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantRow {
  id: string;
  nome: string;
  slug: string;
  nuit: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  configuracaoFiscal: ConfiguracaoFiscalRow | null;
}

// ---------------------------------------------------------------------------
// Contexto de serviço — nunca vem do cliente
// ---------------------------------------------------------------------------

export interface Ctx {
  tenantId: string;
  userId: string;
}

// ---------------------------------------------------------------------------
// Interface de serviço
// ---------------------------------------------------------------------------

/**
 * ITenantAdminService — operações de plataforma sobre tenants.
 *
 * Permissão necessária: `plataforma:admin` (utilizador PLATFORM_ADMIN).
 * Estas operações NÃO usam TenantContext — operam sobre o prismaBase
 * sem isolamento de tenant, uma vez que gerem a própria lista de tenants.
 *
 * Implementação em Wave 2: `src/server/services/plataforma/tenant-admin.service.ts`
 */
export interface ITenantAdminService {
  /**
   * Lista tenants com paginação cursor e filtros opcionais.
   * Query: `Tenant` JOIN `ConfiguracaoFiscal` com índices em [deletedAt] e [statusAtivo].
   */
  listar(filter: FilterTenantInput): Promise<Page<TenantRow>>;

  /**
   * Obtém um tenant por id.
   * Lança `NotFoundError` se inexistente ou com deletedAt preenchido.
   */
  obter(tenantId: string): Promise<TenantRow>;

  /**
   * Cria um novo tenant e a sua ConfiguracaoFiscal em transacção.
   * O slug é validado como único; o nuit é validado e único em Tenant.
   * Lança `BusinessRuleError('TENANT_DUPLICADO')` se slug ou nuit já existirem.
   */
  criar(input: CreateTenantInput): Promise<TenantRow>;

  /**
   * Actualiza dados do Tenant e/ou da ConfiguracaoFiscal.
   * Slug e NUIT são imutáveis após criação — quaisquer valores enviados são ignorados.
   */
  actualizar(tenantId: string, input: UpdateTenantInput): Promise<TenantRow>;

  /**
   * Actualiza apenas a ConfiguracaoFiscal de um tenant.
   * Usado pelo admin do próprio tenant para configurações fiscais/visuais.
   * Permissão: `configuracoes:editar` (diferente de `plataforma:admin`).
   */
  actualizarConfiguracaoFiscal(
    tenantId: string,
    input: ConfiguracaoFiscalInput,
    ctx: Ctx,
  ): Promise<ConfiguracaoFiscalRow>;

  /**
   * Desactiva o tenant: soft-delete em Tenant (preenche deletedAt) e
   * statusAtivo=false em ConfiguracaoFiscal.
   * Impede login de todos os utilizadores do tenant (auth.ts verifica deletedAt).
   * Lança `BusinessRuleError('TENANT_JA_INATIVO')` se já inactivo.
   */
  desactivar(tenantId: string): Promise<void>;

  /**
   * Reactiva um tenant desactivado: limpa deletedAt e statusAtivo=true.
   * Lança `BusinessRuleError('TENANT_JA_ATIVO')` se já activo.
   */
  reactivar(tenantId: string): Promise<void>;
}
