# Documentação Técnica do Backend Modular GestPro

## 1. Objectivo
Esta documentação descreve como construir a API/backend corporativo do GestPro ERP recorrendo a **Spring Modulith**, com
arquitectura hexagonal suportada por princípios de **Domain-Driven Design (DDD)**, **Java 21**, **Maven** e **Lombok**. O foco é:

- Substituir os dados mock/local actualmente consumidos pelo frontend Next.js por uma API modular real, consistente e versionada.
- Garantir que cada módulo de domínio consegue evoluir de forma independente, favorecendo uma futura migração seletiva para
  microserviços.
- Criar uma base tecnológica standard (stack Spring Boot 3/Spring Modulith) com automatização de testes, observabilidade e
  documentação viva.

---

## 2. Stack Tecnológica Principal
| Camada | Tecnologia / Versão | Observações |
| --- | --- | --- |
| Runtime | Java 21 (LTS) | Permite usar virtual threads, records e `switch` melhorado nas regras de negócio. |
| Framework | Spring Boot 3.3 + Spring Modulith | Estrutura o monólito modular com fronteiras explícitas e eventos assíncronos. |
| Build | Maven 3.9.x | Multi-module project, com módulos Maven alinhados aos módulos do domínio. |
| ORM / Persistência | Spring Data JPA + PostgreSQL 16 | Cada módulo define os seus repositórios e entidades agregadas. |
| Mapeamento | MapStruct + Lombok | Lombok reduz boilerplate (getters/builders); MapStruct cria DTOs/records para as APIs. |
| Mensageria interna | Spring Application Events + Modulith Event Publication Registry | Permite propagar eventos intra-módulo (por exemplo, `PedidoAprovadoEvent`). |
| Observabilidade | Micrometer, OpenTelemetry exporter, Spring Boot Actuator | Métricas, tracing e health checks modulados. |
| Testes | JUnit 5, Testcontainers (PostgreSQL/Kafka), Spring Modulith Test | Garantem isolamento de módulos e contratos de API. |

---

## 3. Visão Arquitectural
```mermaid
graph LR
  UI[Next.js GestPro] -->|HTTPS/REST| API[(Spring Modulith API)]
  API -->|Application Services| DOM[Domínio]
  DOM -->|Portas| INFRA[Adaptadores de Infraestrutura]
  INFRA --> DB[(PostgreSQL)]
  INFRA --> EXT[Serviços externos (ERP legado, logística, pagamentos)]
  API --> EVT[Eventos de Domínio]
  EVT --> MQ[(Message Bus opcional / futuro)]
```

- **Arquitectura Hexagonal**: cada módulo possui portas (interfaces) e adaptadores para entrada (REST, mensageria) e saída
  (repositórios, integrações externas). Isto facilita a futura separação em microserviços.
- **Spring Modulith** divide o monólito em módulos explicitamente declarados (`@ApplicationModule`) e realiza verificação
  automática de dependências (arquitectura enforcement).

---

## 4. Estrutura de Projecto
```text
backend/
├─ pom.xml                         # POM agregador
├─ modules/
│  ├─ shared-kernel/               # Tipos globais, eventos base, utilitários cross-module
│  ├─ procurement-module/
│  │  ├─ src/main/java/com/gestpro/procurement/
│  │  │  ├─ api/                   # Controllers REST e DTOs de entrada/saída
│  │  │  ├─ application/          # Serviços de caso de uso (use cases)
│  │  │  ├─ domain/               # Entidades, VOs, agregados, domain services
│  │  │  └─ infrastructure/       # Repositórios JPA, adaptadores externos
│  │  └─ src/test/...             # Testes específicos do módulo (Spring Modulith Test)
│  ├─ inventory-module/
│  ├─ sales-module/
│  ├─ finance-module/
│  ├─ hr-module/
│  ├─ support-logistics-module/
│  └─ analytics-module/
└─ platform/
   ├─ application-bootstrap/      # Configurações partilhadas, segurança, actuaters
   └─ integration-tests/          # Testes ponta-a-ponta usando os módulos reais
```

### Mapeamento módulo ➜ rotas do frontend
| Módulo Spring Modulith | Rotas Next.js servidas | Responsabilidades-chave |
| --- | --- | --- |
| `procurement-module` | `/compras`, `/procurement`, `/fornecedores` | Requisições, aprovações, contratos e fornecedores. |
| `inventory-module` | `/inventario`, `/stock`, `/produtos` | Catálogo, reservas, contagens físicas e níveis mínimos. |
| `sales-module` | `/vendas`, `/pos`, `/clientes` | Pipeline comercial, POS, cálculo de comissões. |
| `finance-module` | `/caixa`, `/contabilidade`, `/faturacao` | Facturação, impostos, conciliações, pagamentos. |
| `hr-module` | `/rh` | Admissões, assiduidade, planos de formação. |
| `support-logistics-module` | `/tickets`, `/transporte` | Helpdesk, SLA, planeamento de transporte. |
| `analytics-module` | Dashboards globais `/dashboard` | KPIs agregados, relatórios e exportações. |
| `shared-kernel` | N/A | Tipagens, eventos, políticas comuns (ex.: moeda, país, auditoria). |

---

## 5. Camadas Hexagonais por Módulo
1. **API (Inbound Adapters)**
   - Controllers anotados com `@RestController` e `@RequestMapping("/api/v1/...")`.
   - Validam DTOs com `jakarta.validation` e convertem-nos em comandos (records). Utilizam `ProblemDetail` para erros.
2. **Application Layer**
   - Serviços `@Service` orientados a caso de uso (e.g., `AprovarRequisicaoService`).
   - Orquestram transacções (`@Transactional`), chamam repositórios, publicam eventos (`DomainEventPublisher`).
3. **Domain Layer**
   - Agregados (`Requisicao`, `Pedido`, `StockItem`, `Fatura`, etc.) com invariantes claras.
   - Value Objects (`IdentificadorFornecedor`, `QuantidadeReservada`, `Moeda`), Domain Services (e.g., `PoliticaComissao`).
   - Eventos de domínio (`RequisicaoAprovadaEvent`, `StockBaixoEvent`).
4. **Infrastructure Layer (Outbound Adapters)**
   - Repositórios JPA, adaptadores para sistemas externos (por exemplo, gateway de pagamentos), clientes HTTP.
   - Configurações específicas (datasource, caches) encapsuladas no módulo.

---

## 6. Contratos de API e Versionamento
- **Prefixo**: `/api/v1/{modulo}/...` (ex.: `/api/v1/procurement/requisicoes`).
- **Formatos**: JSON UTF-8 com snake_case para campos persistidos e camelCase para DTOs TypeScript (converter via MapStruct).
- **Versionamento**: nova versão da API implica novo prefixo (`/api/v2/...`) mantendo compatibilidade em paralelo.
- **Paginação**: parâmetros standard `page`, `size`, `sort` e resposta `PageResponse<T>` com metadados.
- **Autenticação**: OAuth2 Resource Server (JWT) com scopes mapeados para módulos (`SCOPE_PROCUREMENT_READ`).
- **Documentação**: Springdoc OpenAPI 2, gerando `swagger-ui` e ficheiros `.json` para o frontend.

### Exemplo - Endpoint de Requisições
```http
POST /api/v1/procurement/requisicoes
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "solicitanteId": "usr-192",
  "fornecedorId": "for-88",
  "itens": [
    { "produtoId": "prod-100", "quantidade": 20, "precoUnitario": 1150.00, "moeda": "MZN" }
  ],
  "observacoes": "Reposição trimestral"
}
```
Resposta `201 Created` devolve `RequisicaoDTO` com estado inicial, datas e links HATEOAS para aprovar/consultar.

---

## 7. Estratégia para Substituir Dados Locais
1. **Camada BFF**: o frontend continua a usar `src/lib/api-client.ts` apontado para o domínio do backend (`NEXT_PUBLIC_API_URL`).
2. **Feature Flags**: cada módulo pode apontar inicialmente para endpoints `mock` (`/api/mock/...`). Activar gradualmente o backend
   real através de `env` e toggles (`PROCUREMENT_API_ENABLED`).
3. **Sincronização Inicial**:
   - Criar scripts de seed (SQL ou `CommandLineRunner`) para povoar dados de referência.
   - Converter as fontes locais (JSON/fixtures) para POST requests iniciais ou `CSV importers` invocados pelos módulos.
4. **Validação Contratual**: usar testes de contrato com `Spring Cloud Contract` ou `schemathesis` garantindo que os DTOs são
   compatíveis com o frontend.
5. **Observabilidade**: monitorizar métricas de erros 4xx/5xx por módulo e usar tracing (`traceId`) para identificar discrepâncias.

---

## 8. Práticas de DDD Aplicadas
- **Contextos Delimitados (Bounded Contexts)**: cada módulo Maven = um contexto. Dependências entre contextos são declaradas via
  `@ApplicationModule` e revistadas pelo Spring Modulith.
- **Ubiquitous Language**: nomes de classes, endpoints e eventos reflectem o idioma funcional usado no GestPro (PT-PT).
- **Agregados**: limites definidos para garantir consistência transaccional (ex.: `PedidoCompra` agrega linhas, impostos,
  aprovações). Interacções entre agregados ocorrem via eventos ou ACLs.
- **Domain Events**: publicação assíncrona (in-memory) com possibilidade de projectar para Kafka/RabbitMQ num futuro microserviço.
- **Políticas (Policy/Specification)**: regras como cálculo de comissões ou limites de crédito implementadas como objetos que
  podem ser substituídos por configuração.

---

## 9. Observabilidade, Segurança e Ops
- **Actuators por módulo**: endpoints expostos sob `/actuator/{module}/health`. Podem ser agregados num API Gateway.
- **Logs Estruturados**: usar `logback-spring.xml` com appenders JSON para ingestão em Elastic ou Loki.
- **Tracing**: configurar OpenTelemetry exporter (OTLP) apontando para Jaeger ou Tempo.
- **Segurança**: Resource Server + Keycloak/Identity Provider. Perfis `dev`, `test`, `prod` com configurações isoladas.
- **CI/CD**: pipeline Maven (build → tests → sonar → docker build). Deploy inicial como container único; roadmap para fatiar por módulo.

---

## 10. Roadmap para Migração a Microserviços
1. **Estabilizar Módulos**: garantir baixa acoplagem (Spring Modulith enforcer) e dependências one-way.
2. **Externalizar Eventos**: activar publicação para Kafka/RabbitMQ utilizando o mesmo payload dos eventos internos.
3. **Isolar Bases de Dados**: introduzir schema dedicado por módulo (`procurement`, `sales`, ...). Migrar gradualmente para
   instâncias próprias.
4. **Desacoplar Deploy**: empacotar cada módulo em imagens separadas recorrendo a Spring Boot 3.3 `ApplicationContextSlices` ou
   reescrever como microserviço Spring Boot standalone.
5. **Gateway/API Management**: introduzir API Gateway (Kong, Spring Cloud Gateway) para orquestrar múltiplos serviços.
6. **Observabilidade Federada**: replicar dashboards e alertas por serviço, garantindo paridade com o monólito.

---

## 11. Checklist de Implementação
- [ ] Gerar projecto Maven multi-module com `spring-boot-starter-parent` 3.3, `spring-modulith-starter-core`.
- [ ] Configurar `SharedKernel` (moedas, países, auditoria, `BaseEntity`).
- [ ] Implementar `procurement-module` (CRUD requisições, aprovações, fornecedores) e expor endpoints `/api/v1/procurement/...`.
- [ ] Criar eventos de domínio (`RequisicaoAprovadaEvent`, `StockReservadoEvent`) e subscrições internas.
- [ ] Implementar testes modulith (`@ApplicationModuleTest`) para garantir isolamento entre módulos.
- [ ] Publicar OpenAPI e ligar o frontend (`NEXT_PUBLIC_API_URL`).
- [ ] Monitorizar métricas e ajustar toggles até remover totalmente o mock/local data.

---

Com esta fundação, o GestPro passa a contar com uma API modular, robusta e preparada para uma transição suave para um ecossistema
baseado em microserviços, preservando a coesão do domínio e acelerando novas funcionalidades.
