# Requisitos: APIs e Serviços de Domínio por Módulo

## Introdução

Com a fundação do spec 01 concluída, este spec define a migração dos 21 módulos do GestPro de dados mock (`src/data/*.ts`) para persistência real: modelos Prisma por domínio, serviços em `src/server/services/<modulo>`, Server Actions para mutações, leitura via Server Components e Route Handlers apenas para exportações/integrações.

Os módulos estão agrupados em **7 workstreams paralelizáveis** (um agente por workstream), com dependências explícitas entre eles.

## Workstreams e Dependências

| WS | Módulos | Depende de |
|----|---------|-----------|
| A — Catálogo & Inventário | `produtos`, `inventario`, `stock` | Foundation |
| B — Compras & Fornecedores | `compras`, `procurement`, `fornecedores`, `servicos` | Foundation, A (produtos) |
| C — Comercial | `vendas`, `pos`, `clientes` | Foundation, A (stock) |
| D — Finanças | `caixa`, `contabilidade`, `faturacao` | Foundation, C (faturas de vendas) |
| E — Pessoas & Projectos | `rh`, `projetos`, `producao` | Foundation, A (produção↔stock) |
| F — Operações | `transporte`, `tickets` | Foundation |
| G — Plataforma | `core-tenancy`, `analytics`, `dashboard` | Foundation, todos (analytics agrega) |

Dependências inter-WS são resolvidas por **contratos primeiro**: cada WS publica os seus modelos Prisma e tipos de serviço na Wave 1 (contratos), e só implementa na Wave 2, permitindo paralelismo real.

## Requisitos Transversais (aplicam-se a todos os workstreams)

### Requisito T1 — Migração de Mock para Prisma

1. PARA cada entidade em `src/data/*.ts` e `src/types/*.ts`, o workstream DEVE criar o modelo Prisma equivalente seguindo as convenções do spec 01 (tenantId, Decimal, enums, índices).
2. Os dados mock existentes DEVEM ser convertidos em seeds (`prisma/seed/<modulo>.ts`) para preservar dados de demonstração.
3. Os union types de `src/types` DEVEM ser substituídos por tipos derivados do Prisma (`Prisma.$<Model>Payload` / tipos gerados), mantendo `src/types` apenas como re-export durante a transição.
4. QUANDO um módulo estiver migrado, ENTÃO o ficheiro mock correspondente em `src/data` DEVE ser removido.

### Requisito T2 — Camada de Serviço

1. Cada módulo DEVE ter serviços em `src/server/services/<modulo>/` com funções puras de domínio testáveis, sem dependência de Next.js.
2. Regras de negócio existentes nos serviços actuais (`comissao.service.ts`, `stock-validation.service.ts`, `transporte-alocacao.service.ts`, `transporte-alertas.service.ts`) DEVEM ser portadas para a nova camada com os seus testes.
3. Operações multi-entidade DEVEM usar `prisma.$transaction` (ex.: converter requisição em pedido; facturar venda; fecho de caixa).

### Requisito T3 — Server Actions e Leitura

1. Cada mutação de UI DEVE ter uma Server Action criada via `createSafeAction` em `src/server/actions/<modulo>.actions.ts` (ficheiro `'use server'`).
2. Listagens DEVEM suportar paginação por cursor (`take`/`cursor`), filtros tipados e ordenação, com um helper partilhado `paginate()`.
3. Páginas de listagem/detalhe DEVEM ser convertidas para Server Components que chamam serviços directamente (a conversão visual é do spec 03; aqui garante-se o data-fetching).
4. Exportações (CSV/PDF) e webhooks DEVEM usar Route Handlers com `withApi`.

### Requisito T4 — Máquinas de Estado

1. Entidades com ciclo de vida (requisição, pedido, factura, ordem de produção, ticket, actividade de transporte) DEVEM ter transições validadas no serviço: transição inválida → `BusinessRuleError`.
2. Toda a transição de estado DEVE gerar entrada de auditoria e, quando existir no domínio, entrada no histórico da entidade.

## Requisitos por Workstream (âncoras de domínio)

### Requisito A — Catálogo & Inventário

1. Produtos com SKU único por tenant, categorias, unidades, preço custo/venda (Decimal), IVA moçambicano (16%/isento).
2. Stock por localização com movimentos imutáveis (entrada, saída, transferência, ajuste); saldo calculado por agregação com snapshot periódico.
3. `StockValidationService` portado: reserva de stock, alertas de mínimo, validação de disponibilidade em transacção com lock optimista.
4. Inventário físico: contagens, reconciliação com diffs e ajustes gerados automaticamente.
5. Activos (módulo inventário/ativos): ficha, amortização linear configurável, abate com registo contabilístico (integração com WS D via evento/serviço).

### Requisito B — Compras & Fornecedores

1. Fluxo completo: requisição → aprovação multi-nível (níveis por valor, configuráveis) → cotações → pedido de compra → recepção → entrada em stock (WS A) → conta a pagar (WS D).
2. Unificar rotas duplicadas `compras` e `procurement` no mesmo domínio de serviço (uma única fonte de verdade; as duas árvores de UI passam a consumir os mesmos serviços — a consolidação de rotas é decidida no spec 03).
3. Fornecedores com scoring, NUIT validado, contas a pagar com aging.

### Requisito C — Comercial

1. Clientes com NUIT/BI validados, segmentação, endereços (províncias MZ), histórico.
2. Vendas com pipeline de estados; POS com venda rápida, sessão de caixa vinculada (WS D) e baixa de stock em transacção.
3. `ComissaoService` portado com regras por vendedor/escalão e relatório de comissões.

### Requisito D — Finanças

1. Caixa: abertura/fecho de sessão com conferência, sangria/reforço, fecho bloqueado com pendências (`BusinessRuleError`).
2. Contabilidade: plano de contas PGC-NIRF, lançamentos com partidas dobradas validadas (débito=crédito obrigatório na transacção), diários, razão, balancete e DRE gerados por agregação.
3. Faturação: série+numeração sequencial por tenant sem lacunas (obtida em transacção com lock), factura/proforma/nota de crédito, IVA 16%, totais em Decimal, imutabilidade após emissão (correcções apenas por nota de crédito).

### Requisito E — Pessoas & Projectos

1. RH: colaboradores, assiduidade, férias e formação; sem processamento salarial nesta fase (fora de âmbito — registar como extensão futura).
2. Projectos: projectos, tarefas com kanban, marcos, timesheet ligado a colaboradores; orçamento por projecto.
3. Produção: BOM (estrutura), roteiros, ordens com consumo de stock (WS A) e apuramento de custos.

### Requisito F — Operações

1. Transporte: implementar o domínio já especificado em `.kiro/specs/transporte-logistica-refatoracao` (Atividade, Viatura, Motorista, documentos com expiração) sobre Prisma, portando os serviços e property tests existentes.
2. Tickets: ciclo de vida com SLA, atribuição e comentários.

### Requisito G — Plataforma

1. Core-tenancy: CRUD de tenants (plataforma), gestão de utilizadores e roles do tenant (admin do tenant).
2. Analytics/dashboard: KPIs por módulo servidos por queries agregadas dedicadas (nunca N+1 sobre listagens), com cache `unstable_cache`/tags e invalidação nas actions relevantes.

## Critérios de Aceitação Globais

1. `pnpm check` verde em cada PR; cobertura de serviços de domínio ≥ 80%.
2. Zero imports de `src/data/*` no final do spec (verificado por lint/CI).
3. Cada workstream entrega: migration própria (`00XX_<modulo>`), seed, serviços, actions, testes e nota de handoff para o spec 03 com a lista de actions disponíveis por página.
