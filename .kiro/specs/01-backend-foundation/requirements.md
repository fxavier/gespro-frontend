# Requisitos: Backend Foundation — Prisma + PostgreSQL + Autenticação + Multi-Tenancy

## Introdução

O GestPro ERP possui actualmente 195 páginas em 21 módulos, todas alimentadas por dados mock em `src/data/*.ts`, sem backend real, sem autenticação funcional (login simulado com `setTimeout`) e sem persistência. Este spec define a fundação do backend: schema Prisma multi-tenant sobre PostgreSQL, autenticação com sessões seguras, autorização RBAC, infraestrutura de Server Actions e Route Handlers, validação, auditoria e tratamento de erros padronizado.

Este spec é **pré-requisito** dos specs 02 (APIs de domínio) e 03 (UI/UX). Nenhum agente de domínio pode começar antes das tasks marcadas como `[BLOCKING]` estarem concluídas e aprovadas pelo code reviewer.

## Glossário

- **Tenant**: Empresa cliente do GestPro. Toda a informação de negócio pertence a exactamente um tenant.
- **RBAC**: Role-Based Access Control com permissões granulares por módulo e acção.
- **Server Action**: Função `'use server'` invocada a partir de componentes React para mutações.
- **Route Handler**: Endpoint HTTP em `src/app/api/**/route.ts` para leituras, integrações externas e webhooks.
- **NUIT**: Número Único de Identificação Tributária (Moçambique, 9 dígitos).

## Requisitos

### Requisito 1 — Infraestrutura de Base de Dados

**User Story:** Como equipa de engenharia, quero uma base PostgreSQL gerida via Prisma com migrations versionadas, para que o schema evolua de forma controlada e reproduzível.

#### Critérios de Aceitação

1. QUANDO o projecto é clonado e `pnpm install && pnpm db:migrate:dev` é executado, ENTÃO o sistema DEVE criar a base de dados completa a partir das migrations sem passos manuais.
2. O sistema DEVE usar Prisma ORM (v6+) com `prisma-client-js` e connection pooling adequado a serverless (PgBouncer ou Prisma Accelerate configurável via `DATABASE_URL`/`DIRECT_URL`).
3. O sistema DEVE fornecer um script de seed (`pnpm db:seed`) idempotente com: 1 tenant demo, utilizadores por perfil (admin, gestor, operador), plano de contas moçambicano base, e dados de exemplo por módulo migrados dos mocks existentes em `src/data`.
4. TODAS as tabelas de negócio DEVEM incluir `tenantId`, `createdAt`, `updatedAt` e, quando aplicável a soft delete, `deletedAt`.
5. O schema DEVE definir índices compostos começando por `tenantId` para todas as queries de listagem previstas (ex.: `@@index([tenantId, status])`).
6. Valores monetários DEVEM usar `Decimal` (nunca `Float`), com moeda padrão MZN e campo `currency` onde múltiplas moedas sejam plausíveis (faturação, compras).

### Requisito 2 — Multi-Tenancy

**User Story:** Como operador de SaaS, quero isolamento estrito de dados por tenant, para que nenhum cliente aceda a dados de outro.

#### Critérios de Aceitação

1. QUANDO qualquer query de negócio é executada, ENTÃO o sistema DEVE filtrar por `tenantId` derivado da sessão — nunca de input do cliente.
2. O sistema DEVE implementar um Prisma Client Extension (`$extends`) que injecta `tenantId` automaticamente em `findMany/findFirst/update/delete/create` para modelos tenant-scoped, tornando fugas de tenant um erro de compilação/runtime e não uma omissão silenciosa.
3. SE um registo referenciado pertencer a outro tenant, ENTÃO a operação DEVE falhar com erro 404 (não 403, para não revelar existência).
4. O sistema DEVE suportar o modelo actual do módulo `core-tenancy`: gestão de tenants, planos e estado (activo/suspenso).
5. QUANDO um tenant está suspenso, ENTÃO todas as mutações DEVEM ser rejeitadas com erro específico, permitindo apenas leituras a administradores da plataforma.

### Requisito 3 — Autenticação

**User Story:** Como utilizador, quero autenticar-me com email e palavra-passe de forma segura, para aceder apenas ao meu tenant.

#### Critérios de Aceitação

1. O sistema DEVE implementar autenticação com Auth.js (NextAuth v5) usando Credentials provider + Prisma Adapter, com sessões em cookie HttpOnly/SameSite=Lax/Secure e estratégia JWT assinada (biblioteca `jose` já presente).
2. Palavras-passe DEVEM ser armazenadas com Argon2id (fallback aceitável: bcrypt cost ≥ 12); NUNCA em claro nem com hash rápido.
3. QUANDO ocorrem 5 tentativas falhadas em 15 minutos para o mesmo email ou IP, ENTÃO o sistema DEVE aplicar rate limiting com backoff e registar o evento de segurança.
4. O sistema DEVE suportar: recuperação de palavra-passe por token de uso único com expiração ≤ 1h, alteração de palavra-passe com invalidação de sessões activas, e convite de utilizadores por email com token.
5. O `middleware.ts` DEVE proteger todas as rotas `(dashboard)` e redireccionar não autenticados para `/auth/login` preservando `callbackUrl`.
6. A página de login existente DEVE ser ligada ao fluxo real, removendo a simulação `setTimeout`.

### Requisito 4 — Autorização (RBAC)

**User Story:** Como administrador de tenant, quero atribuir perfis com permissões por módulo, para controlar quem faz o quê.

#### Critérios de Aceitação

1. O sistema DEVE modelar `Role` e `Permission` com permissões no formato `modulo:accao` (ex.: `faturacao:criar`, `rh:aprovar`), com roles pré-definidas (ADMIN, GESTOR, FINANCEIRO, OPERADOR, LEITURA) e roles customizadas por tenant.
2. TODA Server Action e Route Handler de negócio DEVE verificar permissão via helper único (`requirePermission('modulo:accao')`) antes de qualquer acesso a dados.
3. SE o utilizador não tiver permissão, ENTÃO o sistema DEVE devolver 403 com código de erro estável, sem detalhes internos.
4. A sidebar e as acções da UI DEVEM ser filtradas pelas permissões da sessão (defesa em profundidade: a UI esconde, o servidor garante).

### Requisito 5 — Camada de Server Actions e Route Handlers

**User Story:** Como programador de módulo, quero primitivas padronizadas para criar acções e endpoints, para que todos os módulos tenham o mesmo contrato de erro, validação e telemetria.

#### Critérios de Aceitação

1. O sistema DEVE fornecer um factory `createSafeAction(schema, permission, handler)` que encadeia: autenticação → autorização → validação Zod → execução → mapeamento de erros → revalidação de cache.
2. O sistema DEVE fornecer helpers equivalentes para Route Handlers (`withApi(handler, { permission, schema })`) devolvendo envelope JSON padronizado: `{ data }` em sucesso, `{ error: { code, message, details? } }` em falha, com status HTTP correcto.
3. Mutações DEVEM ser feitas por Server Actions; leituras de páginas DEVEM ser feitas em Server Components chamando serviços directamente (sem fetch interno à própria API); Route Handlers ficam reservados a: exportações (CSV/PDF), webhooks, integrações externas e endpoints consumidos por clientes não-React.
4. TODOS os inputs DEVEM ser validados com Zod no servidor; schemas partilhados entre cliente e servidor DEVEM viver em `src/lib/validations/<modulo>.ts`.
5. Erros de domínio DEVEM usar uma hierarquia `AppError` (`NotFoundError`, `ForbiddenError`, `ConflictError`, `ValidationError`, `BusinessRuleError`) mapeada automaticamente para HTTP/envelope.
6. QUANDO uma mutação altera dados apresentados noutras rotas, ENTÃO a acção DEVE invocar `revalidatePath`/`revalidateTag` de forma declarada no factory.

### Requisito 6 — Auditoria e Observabilidade

**User Story:** Como auditor, quero rasto completo de quem alterou o quê, para conformidade e diagnóstico.

#### Critérios de Aceitação

1. O sistema DEVE registar em `AuditLog` toda a mutação de negócio: `tenantId`, `userId`, `entidade`, `entidadeId`, `accao`, `diff` (antes/depois em JSON), `ip`, `timestamp`.
2. O registo de auditoria DEVE ser feito na mesma transacção da mutação quando a consistência for crítica (contabilidade, faturação, caixa) e assíncrono nos restantes casos.
3. O sistema DEVE usar logging estruturado (pino) com `requestId` propagado, níveis configuráveis por ambiente, e redacção automática de campos sensíveis (password, tokens, NUIT/BI em logs de debug).
4. Route Handlers e Server Actions DEVEM expor métricas mínimas de latência e taxa de erro via logs estruturados prontos para ingestão (formato JSON por linha).

### Requisito 7 — Regras de Domínio Moçambicano

**User Story:** Como empresa moçambicana, quero que o sistema respeite validações fiscais e formatos locais.

#### Critérios de Aceitação

1. O schema e as validações DEVEM integrar as rotinas existentes `validacao-nuit.ts` e `validacao-bi.ts` como refinements Zod reutilizáveis.
2. Moeda padrão DEVE ser MZN com formatação via `format-currency.ts` consolidado (Intl.NumberFormat `pt-MZ`).
3. Dados de endereço DEVEM usar as províncias de `provincias-mocambique.ts` como enum/tabela de referência.
4. O plano de contas seed DEVE seguir o PGC-NIRF moçambicano na estrutura de classes.

### Requisito 8 — Qualidade e Testes

#### Critérios de Aceitação

1. O sistema DEVE ter Vitest configurado com testes unitários para: helpers de autorização, factory de safe actions, extensão de tenant do Prisma e validações Zod críticas.
2. O sistema DEVE ter testes de integração com base de dados efémera (testcontainers ou `pg-mem` onde suficiente) para os fluxos de auth e isolamento de tenant.
3. A pipeline local DEVE ter `pnpm check` executando: typecheck, lint, testes e `prisma validate` — obrigatório passar antes de qualquer PR ser aceite pelo code reviewer.
4. Cobertura mínima da camada `src/server/**`: 80% de linhas.
