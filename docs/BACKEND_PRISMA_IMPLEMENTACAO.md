# Plano Detalhado de Backend com Prisma para o GestPro ERP

## 1. Objetivo e Contexto
Este documento define, de forma prática e detalhada, os **requisitos**, o **design técnico** e o **plano de tarefas** para construir um backend moderno para o GestPro usando **Node.js + TypeScript + Prisma + PostgreSQL**, alinhado com os módulos já existentes no frontend.

O objetivo principal é substituir progressivamente dados mock/local por uma API real, com segurança, rastreabilidade, transações consistentes e base preparada para escala.

---

## 2. Escopo Funcional Inicial (MVP)
O MVP deve atender os módulos críticos já presentes no sistema:

1. **Procurement e Compras**
   - Requisição de compra
   - Aprovação em níveis
   - Pedido de compra
   - Receção de mercadorias
   - Gestão de fornecedores

2. **Inventário e Stock**
   - Catálogo de produtos
   - Movimentações de stock (entrada/saída/ajuste/reserva/libertação)
   - Alertas de stock mínimo
   - Lotes e validade (quando aplicável)

3. **Vendas e POS**
   - Clientes
   - Encomendas/vendas
   - Linhas de venda
   - Comissão por vendedor

4. **Finanças Base (mínimo necessário para integração)**
   - Faturas
   - Pagamentos
   - Estado financeiro da transação

5. **Plataforma e Segurança**
   - Utilizadores, perfis e permissões (RBAC)
   - Auditoria de operações críticas
   - Versionamento e documentação da API

---

## 3. Requisitos Detalhados

### 3.1 Requisitos Funcionais

#### RF-01 — Gestão de Utilizadores e Perfis
- Criar, editar, desativar utilizadores.
- Associar utilizador a perfil (Admin, Compras, Financeiro, Vendas, RH, Operador).
- Registar histórico de alterações sensíveis (perfil, status, reset de credenciais).

#### RF-02 — Fornecedores
- CRUD completo de fornecedores.
- Classificação (ativo/inativo, categoria, scoring básico).
- Associação com NUIT/documentação legal.

#### RF-03 — Requisição de Compra
- Criar requisição com múltiplas linhas.
- Estados: `DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, `CANCELLED`.
- Aprovação por nível (ex.: supervisor → financeiro).
- Registo de motivo de rejeição.

#### RF-04 — Pedido de Compra
- Converter requisição aprovada em pedido.
- Controlar status logístico: `OPEN`, `PARTIALLY_RECEIVED`, `RECEIVED`, `CLOSED`.
- Vincular itens recebidos ao inventário.

#### RF-05 — Movimentação de Stock
- Registar entradas e saídas por tipo de movimento.
- Garantir consistência de quantidade (não permitir saldo negativo sem permissão).
- Suportar reservas para vendas e libertação de reservas.

#### RF-06 — Produtos
- CRUD de produtos com SKU único.
- Unidade de medida, custo médio, preço base de venda.
- Estoque mínimo e máximo por armazém.

#### RF-07 — Clientes e Vendas
- CRUD de clientes.
- Criar venda com itens e cálculo de totais.
- Baixa de stock automática após confirmação da venda.

#### RF-08 — Comissões
- Definir regra por vendedor/equipa.
- Calcular comissão no fecho da venda.
- Registar histórico para auditoria e reconciliação.

#### RF-09 — Faturação e Pagamentos (MVP)
- Emitir fatura associada à venda/pedido.
- Registar pagamento parcial ou total.
- Estados: `PENDING`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`.

#### RF-10 — Auditoria
- Log de ações críticas: create/update/delete/status transition/approval.
- Guardar `actorId`, data/hora, entidade, before/after (resumo).

---

### 3.2 Requisitos Não Funcionais

#### RNF-01 — Performance
- P95 de endpoints críticos (listagens e detalhes) < 400ms com dataset de referência.
- Paginação obrigatória em listagens.

#### RNF-02 — Segurança
- JWT para autenticação.
- RBAC por módulo e ação (`procurement.read`, `procurement.write`, etc.).
- Hash seguro de password (Argon2 ou bcrypt com fator adequado).

#### RNF-03 — Confiabilidade
- Uso de transações Prisma em operações multi-entidade.
- Idempotência para operações sensíveis (ex.: callback de pagamento).

#### RNF-04 — Observabilidade
- Logs estruturados (JSON) com `requestId`.
- Métricas de latência e taxa de erro por endpoint.
- Tracing opcional em ambiente de produção.

#### RNF-05 — Qualidade
- Cobertura mínima: 70% em serviços de domínio críticos.
- Testes de integração para fluxos de compra, venda e stock.

#### RNF-06 — Evolução
- Estratégia de migração de schema via Prisma Migrate.
- Convenção de versionamento para API (`/api/v1`).

---

## 4. Arquitetura Proposta

### 4.1 Stack Recomendada
- **Runtime:** Node.js 20+
- **Linguagem:** TypeScript
- **Framework API:** NestJS (preferencial) ou Fastify/Express estruturado em camadas
- **ORM:** Prisma
- **DB:** PostgreSQL 15+
- **Auth:** JWT (access + refresh)
- **Validação:** Zod ou class-validator
- **Docs API:** OpenAPI/Swagger
- **Testes:** Vitest/Jest + Supertest

### 4.2 Organização por Módulos
```text
backend/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts
├─ src/
│  ├─ core/
│  │  ├─ auth/
│  │  ├─ rbac/
│  │  ├─ audit/
│  │  └─ common/
│  ├─ modules/
│  │  ├─ procurement/
│  │  ├─ inventory/
│  │  ├─ sales/
│  │  ├─ finance/
│  │  └─ crm/
│  ├─ infra/
│  │  ├─ db/
│  │  ├─ logger/
│  │  └─ cache/
│  └─ main.ts
└─ package.json
```

### 4.3 Princípios de Design
- **Separação por domínio:** handlers/controllers não contêm regra de negócio complexa.
- **Use cases explícitos:** `CreatePurchaseRequestUseCase`, `ApprovePurchaseRequestUseCase`, etc.
- **Transações em serviço:** operações compostas usam `prisma.$transaction`.
- **Eventos de domínio (fase 2):** publicar eventos internos para analytics/notificações.

---

## 5. Modelagem de Dados (Prisma) — Base Inicial

### 5.1 Entidades Core
- `User`, `Role`, `Permission`, `UserRole`
- `AuditLog`
- `Tenant` (opcional desde início, recomendado se for multiempresa)

### 5.2 Procurement
- `Supplier`
- `PurchaseRequest`
- `PurchaseRequestItem`
- `PurchaseApproval`
- `PurchaseOrder`
- `PurchaseOrderItem`
- `GoodsReceipt`
- `GoodsReceiptItem`

### 5.3 Inventário
- `Warehouse`
- `Product`
- `StockBalance`
- `StockMovement`
- `StockReservation`

### 5.4 Vendas/CRM
- `Customer`
- `SalesOrder`
- `SalesOrderItem`
- `CommissionRule`
- `CommissionEntry`

### 5.5 Finanças
- `Invoice`
- `InvoiceItem`
- `Payment`

### 5.6 Campos Técnicos Obrigatórios
Todas as entidades transacionais devem ter:
- `id` (UUID ou CUID)
- `createdAt`, `updatedAt`
- `createdBy`, `updatedBy` (quando aplicável)
- `status` (enum quando há workflow)
- `version` (otimista, opcional mas recomendado)
- `deletedAt` para soft delete (quando sentido)

---

## 6. Fluxos Críticos (Design de Processos)

### 6.1 Fluxo Compra → Receção → Stock
1. Utilizador cria `PurchaseRequest`.
2. Sistema valida permissões e orçamento (se já existir regra).
3. Aprovador altera estado para `APPROVED`.
4. Sistema cria `PurchaseOrder` a partir da requisição.
5. Receção gera `GoodsReceipt`.
6. Cada item recebido gera `StockMovement` de entrada.
7. Atualiza `StockBalance` do produto/armazém na mesma transação.

### 6.2 Fluxo Venda → Baixa de Stock → Comissão
1. Vendedor cria `SalesOrder`.
2. Sistema valida disponibilidade (`StockBalance - reservas`).
3. Confirma venda e grava `StockMovement` de saída.
4. Cria `Invoice` (conforme política de faturação).
5. Calcula e grava `CommissionEntry`.

### 6.3 Fluxo Pagamento
1. Financeiro registra `Payment`.
2. Sistema recalcula estado da fatura.
3. Se pago total, muda para `PAID`; caso parcial, `PARTIALLY_PAID`.
4. Registra evento/auditoria.

---

## 7. Estratégia de API

### 7.1 Convenções
- Prefixo: `/api/v1`
- Endpoints por recurso: `GET /products`, `POST /purchase-requests`, etc.
- Paginação: `page`, `pageSize`, `sort`, `filter`
- Resposta padrão:
  - `data`
  - `meta` (paginação)
  - `error` (quando aplicável)

### 7.2 Exemplo de Endpoints MVP
- `POST /api/v1/auth/login`
- `GET /api/v1/suppliers`
- `POST /api/v1/purchase-requests`
- `POST /api/v1/purchase-requests/:id/approve`
- `POST /api/v1/goods-receipts`
- `GET /api/v1/products`
- `POST /api/v1/sales-orders`
- `POST /api/v1/invoices/:id/payments`

### 7.3 Regras de Erro
- 400: validação
- 401: não autenticado
- 403: sem permissão
- 404: recurso não encontrado
- 409: conflito de estado/concor­rência
- 422: regra de negócio violada

---

## 8. Segurança e Governança
- Política de password e rotação de refresh token.
- Revogação de sessão.
- Rate limiting em auth e endpoints críticos.
- CORS por ambiente.
- Segredos em `.env` + secret manager em produção.
- Auditoria para aprovação/reprovação/fecho financeiro.

---

## 9. Plano de Implementação por Fases

### Fase 0 — Fundação Técnica
- Criar projeto backend com TypeScript, lint e testes.
- Configurar Prisma + PostgreSQL + migração inicial.
- Implementar módulo de auth básico e RBAC mínimo.
- Configurar Swagger, logger e healthcheck.

### Fase 1 — Procurement + Inventário (núcleo operacional)
- Implementar entidades e endpoints de fornecedores, requisições, aprovações, pedidos e receção.
- Integrar receção com movimentação de stock.
- Testes de integração de fluxo completo.

### Fase 2 — Vendas + Comissão
- CRUD de clientes, criação e confirmação de venda.
- Baixa de stock em transação.
- Cálculo e persistência de comissão.

### Fase 3 — Faturação + Pagamentos
- Emissão de faturas e itens.
- Registo de pagamentos parciais/totais.
- Estado financeiro automatizado.

### Fase 4 — Hardening e Go-live
- Otimizações de índice/query.
- Observabilidade (métricas/alertas).
- Revisão de segurança e backup/restore.
- Plano de rollout com feature flags.

---

## 10. Backlog de Tasks Detalhadas (pronto para execução)

## Epic A — Plataforma Base
- [ ] A1. Inicializar backend TypeScript e estrutura modular.
- [ ] A2. Configurar ESLint, Prettier, Husky e conventional commits.
- [ ] A3. Configurar Prisma (`schema.prisma`, datasource, generator).
- [ ] A4. Criar migração inicial (`User`, `Role`, `Permission`, `AuditLog`).
- [ ] A5. Implementar seed de perfis e permissões padrão.
- [ ] A6. Implementar autenticação JWT (login/refresh/logout).
- [ ] A7. Implementar middleware de autorização RBAC por rota.
- [ ] A8. Configurar Swagger + endpoint `/health`.

## Epic B — Procurement
- [ ] B1. Modelar entidades Prisma de procurement.
- [ ] B2. Criar CRUD de fornecedores com paginação/filtros.
- [ ] B3. Criar caso de uso `CreatePurchaseRequest`.
- [ ] B4. Criar caso de uso `SubmitPurchaseRequest`.
- [ ] B5. Criar caso de uso `ApprovePurchaseRequest` com níveis.
- [ ] B6. Criar caso de uso `RejectPurchaseRequest` com motivo obrigatório.
- [ ] B7. Criar geração de `PurchaseOrder` a partir de requisição aprovada.
- [ ] B8. Implementar testes de integração para ciclo completo de compra.

## Epic C — Inventário
- [ ] C1. Modelar `Product`, `Warehouse`, `StockBalance`, `StockMovement`, `StockReservation`.
- [ ] C2. Implementar CRUD de produtos e armazéns.
- [ ] C3. Implementar serviço transacional de movimentação de stock.
- [ ] C4. Implementar reserva/libertação de stock.
- [ ] C5. Implementar alerta de stock mínimo.
- [ ] C6. Testes concorrenciais para evitar saldo inconsistente.

## Epic D — Vendas
- [ ] D1. Modelar `Customer`, `SalesOrder`, `SalesOrderItem`.
- [ ] D2. Criar endpoint de criação de venda.
- [ ] D3. Confirmar venda com baixa de stock em transação única.
- [ ] D4. Bloquear confirmação quando stock insuficiente.
- [ ] D5. Criar listagem de vendas por período, vendedor e cliente.

## Epic E — Comissão
- [ ] E1. Modelar `CommissionRule` e `CommissionEntry`.
- [ ] E2. Implementar motor de cálculo de comissão por regra.
- [ ] E3. Persistir comissão no fecho de venda.
- [ ] E4. Endpoint de extrato de comissão por vendedor.

## Epic F — Faturação e Pagamentos
- [ ] F1. Modelar `Invoice`, `InvoiceItem`, `Payment`.
- [ ] F2. Gerar fatura a partir da venda confirmada.
- [ ] F3. Registar pagamento parcial/total.
- [ ] F4. Atualizar estado financeiro automaticamente.
- [ ] F5. Implementar validações fiscais locais (fase incremental).

## Epic G — Qualidade, Segurança e Operação
- [ ] G1. Implementar auditoria central para ações críticas.
- [ ] G2. Adicionar rate limit e proteção contra brute force no login.
- [ ] G3. Criar suite de testes E2E dos fluxos principais.
- [ ] G4. Configurar CI (lint + test + migrate check).
- [ ] G5. Criar runbooks: migração, rollback, backup e restore.

---

## 11. Critérios de Aceitação por Macrofluxo

### Compra
- Requisição só pode ser aprovada por perfil autorizado.
- Pedido só é criado para requisição aprovada.
- Receção atualiza stock com rastreabilidade de origem.

### Venda
- Sistema impede venda com stock insuficiente.
- Confirmação da venda gera movimento de stock e comissão.

### Financeiro
- Pagamentos alteram estado da fatura corretamente.
- Auditoria disponível para toda mudança de estado financeiro.

### Plataforma
- Rotas protegidas por JWT + RBAC.
- Swagger disponível e alinhado com implementação.

---

## 12. Riscos, Mitigações e Decisões Arquiteturais

### Risco 1 — Complexidade de regras de negócio logo no início
**Mitigação:** começar com regras mínimas em serviços isolados e evoluir por versão.

### Risco 2 — Inconsistência de stock em concorrência
**Mitigação:** transações, índices corretos e testes concorrenciais desde fase 1.

### Risco 3 — Divergência frontend/backend de contrato
**Mitigação:** OpenAPI versionado + testes de contrato + DTOs claros.

### Risco 4 — Crescimento de acoplamento entre módulos
**Mitigação:** manter fronteiras por domínio e regras de dependência explícitas.

---

## 13. Entregáveis Esperados
1. Repositório `backend/` funcional com Prisma e migrações.
2. API `/api/v1` com módulos MVP operacionais.
3. Banco PostgreSQL com seed inicial e scripts de setup.
4. Documentação OpenAPI e guia de operação (deploy/rollback).
5. Testes automatizados cobrindo fluxos críticos.

---

## 14. Próximos Passos Imediatos (Sprint 1 sugerida)
1. Criar bootstrap do backend e integrar Prisma.
2. Subir auth + RBAC + auditoria base.
3. Implementar fornecedores + requisições + aprovações.
4. Entregar fluxo mínimo de receção com atualização de stock.
5. Publicar primeira versão da OpenAPI para integração com frontend.

Com este plano, a equipa consegue iniciar a implementação do backend com Prisma de forma controlada, priorizando valor de negócio, consistência transacional e facilidade de evolução.
