# Módulo de Transporte — Descrição Completa (Proposta de Extração)

## 1) Visão geral

O **Módulo de Transporte** é responsável por gerir o ciclo operacional completo de logística de entrega:

1. cadastro e disponibilidade da frota;
2. cadastro e performance de motoristas;
3. planeamento e execução de rotas;
4. criação, despacho e acompanhamento de entregas;
5. manutenção preventiva/corretiva dos veículos;
6. controlo de abastecimentos e eficiência de combustível;
7. monitorização de KPIs operacionais e financeiros.

No estado atual da aplicação, o domínio já existe no frontend em rotas dedicadas (`/transporte`) com funcionalidades ricas de UI/UX e dados de exemplo (mock), o que permite uma extração por etapas para um módulo isolado (frontend + backend/API + dados).

---

## 2) Objetivos estratégicos da extração

- **Desacoplamento funcional:** separar transporte dos restantes domínios para reduzir acoplamento e facilitar manutenção.
- **Escalabilidade:** permitir evolução independente (regras de despacho, tracking, otimização, integrações com mapas/telemática).
- **Governança de dados:** consolidar entidades logísticas num modelo único e auditável.
- **Observabilidade operacional:** centralizar métricas de SLA, custo por km, taxa de sucesso, pontualidade e utilização da frota.
- **Integração cross-módulo:** expor contratos claros com Vendas, Inventário, Procurement, CRM e Tickets.

---

## 3) Escopo funcional

### 3.1 Dashboard de Transporte
- Visão consolidada de veículos, motoristas, entregas, rotas, custos e alertas.
- Indicadores de operação diária e mensal.
- Ações rápidas para criar entrega e rota.

### 3.2 Gestão de Veículos (Frota)
- Cadastro completo (matrícula, marca/modelo, tipo, capacidade, consumo médio, quilometragem).
- Estado operacional (`disponivel`, `em_rota`, `manutencao`, `inativo`).
- Controlo documental (seguro, inspeção, licença e validade).
- CRUD completo com filtros e paginação.

### 3.3 Gestão de Motoristas
- Cadastro de dados pessoais e contacto.
- Controlo da carta de condução (categorias, validade, estado).
- Estado de disponibilidade (`ativo`, `inativo`, `ferias`, `licenca`).
- Métricas de desempenho por motorista (entregas no tempo, atrasadas, falhadas, avaliação).

### 3.4 Gestão de Rotas
- Planeamento por origem/destino e pontos intermédios.
- Definição de prioridade e estado (`planejada`, `ativa`, `pausada`, `concluida`, `cancelada`).
- Atribuição de motorista e veículo.
- Gestão de pontos (ordem, tipo `coleta/entrega/parada`, tempos previstos/reais).
- Ações operacionais: iniciar, pausar, concluir, otimizar.

### 3.5 Gestão de Entregas
- Criação de entrega com endereço completo e múltiplos produtos.
- Cálculo de custo de entrega (peso, volume e valor da carga).
- Estados de execução (`pendente`, `agendada`, `em_transito`, `entregue`, `falhada`, `cancelada`).
- Prova de entrega (assinatura/foto/código), tentativas, avaliação do cliente.
- Filtros por status, prioridade, data, cliente, motorista e rota.

### 3.6 Gestão de Manutenção
- Registo de ordens de manutenção (`preventiva`, `corretiva`, `preditiva`, `emergencia`).
- Planeamento por quilometragem e data.
- Gestão de serviços executados, peças, custos e oficina.
- Alertas de manutenção pendente e recomendações de próxima intervenção.

### 3.7 Gestão de Combustível
- Registo detalhado de abastecimentos por veículo e motorista.
- Controlo de posto, preço/litro, litros, km anterior/atual e consumo estimado.
- Gestão de cartões de combustível e aprovação.
- Métricas de eficiência e custo por veículo/rota.

---

## 4) Fronteira de domínio (Domain Boundary)

### Dentro do módulo
- Frota e documentação veicular.
- Motoristas e aptidão operacional.
- Roteirização de distribuição e execução de entregas.
- Custos logísticos diretos (combustível e manutenção).
- KPIs de operação logística.

### Fora do módulo (integrações)
- **Vendas/Pedidos:** origem da entrega (pedido comercial).
- **Clientes/CRM:** dados de cliente e endereços de entrega.
- **Inventário/Armazém:** expedição, separação e disponibilidade de carga.
- **Financeiro/Contabilidade:** lançamento de custos e centros de custo.
- **RH:** vínculo e compliance laboral de motoristas.
- **Tickets/Serviços:** incidentes de entrega, atrasos e ocorrências.

---

## 5) Entidades centrais e agregados

### 5.1 Veículo
- Identificação do ativo e capacidade logística.
- Estado operacional e indicadores de uso.
- Subestruturas documentais: seguro, inspeção e licença.

### 5.2 Motorista
- Identidade e contacto.
- Habilitações e validade de carta.
- Desempenho histórico (SLA e qualidade de atendimento).

### 5.3 Rota
- Unidade de planeamento operacional.
- Contém sequência de pontos e entregas associadas.
- Materializa custos/tempos previstos vs realizados.

### 5.4 Entrega
- Unidade de compromisso com cliente.
- Contém dados logísticos (endereçamento, produtos, prioridade, janela temporal).
- Evidências de conclusão, tentativas e qualidade percebida.

### 5.5 Manutenção
- Unidade técnica de intervenção em veículo.
- Controla escopo, peças, custos e resultado.

### 5.6 Abastecimento
- Evento financeiro-operacional de consumo.
- Base para cálculo de eficiência e anomalias de combustível.

---

## 6) Fluxos E2E principais

### Fluxo A — Planeamento e execução de entrega
1. Operador cria entrega (manual ou vinda de pedido de venda).
2. Sistema valida endereço, peso/volume e prioridade.
3. Entrega é agregada a rota existente ou gera sugestão de nova rota.
4. Supervisor atribui veículo e motorista.
5. Rota é iniciada e estados evoluem até conclusão/falha.
6. Entrega recebe prova de entrega e fecha SLA.
7. Custos (combustível + tempo + manutenção proporcional) são consolidados.

### Fluxo B — Gestão de frota e manutenção
1. Veículo acumula quilometragem operacional.
2. Sistema dispara alerta por km/data/documento.
3. Ordem de manutenção é aberta e executada.
4. Estado do veículo muda para `manutencao` e retorna para `disponivel` após conclusão.
5. Custo e indisponibilidade são refletidos em KPIs.

### Fluxo C — Controlo de combustível
1. Motorista regista abastecimento associado a veículo (e rota, quando aplicável).
2. Sistema calcula consumo por km e eficiência.
3. Supervisor aprova/rejeita abastecimento suspeito.
4. Dados alimentam painel de custo por km e benchmark entre veículos.

---

## 7) Máquina de estados recomendada

### 7.1 Entrega
- `pendente` → `agendada` → `em_transito` → `entregue`
- Exceções: `falhada`, `cancelada`

Regras:
- só pode marcar `entregue` se existir evidência mínima (hora + recebedor);
- falha deve registrar motivo e tentativas;
- cancelamento exige usuário autorizado.

### 7.2 Rota
- `planejada` → `ativa` ↔ `pausada` → `concluida`
- Exceção: `cancelada`

Regras:
- iniciar rota exige veículo e motorista ativos;
- concluir rota exige fechamento de todos os pontos (ou justificativa de não execução).

### 7.3 Veículo
- `disponivel` ↔ `em_rota`
- `disponivel` ↔ `manutencao`
- `inativo` como estado administrativo

Regras:
- veículo com documento vencido não entra em rota;
- manutenção crítica bloqueia alocação.

---

## 8) Regras de negócio críticas

1. **Conformidade documental:** seguro/inspeção/licença válidos são obrigatórios para operação.
2. **Compatibilidade capacidade-carga:** soma de peso/volume não pode exceder limite do veículo.
3. **Compatibilidade carta/tipo veículo:** motorista deve ter categoria adequada.
4. **Priorização de entregas:** `urgente` tem precedência no planeamento.
5. **SLA e tentativa máxima:** entregas falhadas devem respeitar política de retentativa.
6. **Rastreabilidade:** qualquer mudança de estado deve ser auditável (quem, quando, motivo).
7. **Controle de custos:** custo total da rota = combustível + manutenção proporcional + custo operacional.
8. **Detecção de anomalias:** abastecimentos fora de padrão disparam alerta automático.

---

## 9) Contratos de API sugeridos (para extração)

### 9.1 Veículos
- `GET /api/transporte/veiculos`
- `POST /api/transporte/veiculos`
- `GET /api/transporte/veiculos/{id}`
- `PATCH /api/transporte/veiculos/{id}`
- `POST /api/transporte/veiculos/{id}/status`

### 9.2 Motoristas
- `GET /api/transporte/motoristas`
- `POST /api/transporte/motoristas`
- `GET /api/transporte/motoristas/{id}`
- `PATCH /api/transporte/motoristas/{id}`

### 9.3 Rotas
- `GET /api/transporte/rotas`
- `POST /api/transporte/rotas`
- `GET /api/transporte/rotas/{id}`
- `POST /api/transporte/rotas/{id}/iniciar`
- `POST /api/transporte/rotas/{id}/pausar`
- `POST /api/transporte/rotas/{id}/concluir`
- `POST /api/transporte/rotas/{id}/otimizar`

### 9.4 Entregas
- `GET /api/transporte/entregas`
- `POST /api/transporte/entregas`
- `GET /api/transporte/entregas/{id}`
- `PATCH /api/transporte/entregas/{id}`
- `POST /api/transporte/entregas/{id}/atribuir`
- `POST /api/transporte/entregas/{id}/status`
- `POST /api/transporte/entregas/{id}/prova`

### 9.5 Manutenção
- `GET /api/transporte/manutencoes`
- `POST /api/transporte/manutencoes`
- `GET /api/transporte/manutencoes/{id}`
- `POST /api/transporte/manutencoes/{id}/status`

### 9.6 Combustível
- `GET /api/transporte/abastecimentos`
- `POST /api/transporte/abastecimentos`
- `POST /api/transporte/abastecimentos/{id}/aprovar`
- `GET /api/transporte/eficiencia`

### 9.7 Dashboard
- `GET /api/transporte/dashboard`
- `GET /api/transporte/kpis?periodo=...`

---

## 10) Eventos de domínio recomendados

- `VeiculoDisponibilidadeAlterada`
- `ManutencaoAgendada`
- `ManutencaoConcluida`
- `RotaPlanejada`
- `RotaIniciada`
- `RotaConcluida`
- `EntregaCriada`
- `EntregaDespachada`
- `EntregaConcluida`
- `EntregaFalhada`
- `AbastecimentoRegistrado`
- `AbastecimentoAprovado`

Esses eventos permitem integração assíncrona com notificações, faturação de frete, analytics e alertas operacionais.

---

## 11) Permissões e perfis (RBAC)

### Perfis sugeridos
- **Admin Logística:** acesso total ao módulo.
- **Despachante:** cria/edita rotas e entregas, faz atribuições.
- **Gestor de Frota:** controla veículos, manutenção e combustível.
- **Motorista (portal/app):** consulta rotas e atualiza estados em campo.
- **Financeiro (somente leitura):** consulta custos, aprova exceções financeiras.

### Regras de permissão
- alteração de estado crítico (cancelamento, aprovação de abastecimento, override de SLA) exige perfil superior;
- exclusões devem ser limitadas (preferir soft-delete/auditoria);
- segregação por tenant e por filial operacional.

---

## 12) Indicadores-chave (KPIs)

### Operacionais
- taxa de entregas no prazo (%);
- tempo médio de entrega;
- taxa de falha de entrega;
- produtividade por motorista (entregas/dia);
- utilização da frota (% tempo em rota vs parado).

### Financeiros
- custo por km;
- custo por entrega;
- consumo médio (km/l);
- custo de manutenção por veículo/mês;
- variação real vs estimado por rota.

### Qualidade e risco
- ocorrências por 100 entregas;
- documentos próximos ao vencimento;
- manutenções em atraso;
- índice de satisfação do cliente pós-entrega.

---

## 13) Requisitos não funcionais

- **Performance:** listagens paginadas e filtros server-side para grandes volumes.
- **Disponibilidade:** módulo crítico para operação diária (SLA alto).
- **Auditoria:** histórico imutável de mudanças de estado.
- **Segurança:** segregação multi-tenant, logs e trilha de acesso.
- **Resiliência offline (futuro):** app de motorista com sync posterior.
- **Observabilidade:** métricas, logs estruturados e tracing por fluxo de entrega.

---

## 14) Estratégia técnica de extração (incremental)

### Fase 1 — Contrato e tipagem
- Consolidar os tipos do domínio de transporte num pacote/namespace dedicado.
- Definir DTOs de entrada/saída e convenções de estado.

### Fase 2 — Camada de dados
- Substituir mocks por repositórios/API client.
- Criar endpoints de leitura para dashboards e listagens.

### Fase 3 — Operações críticas
- Implementar comandos transacionais (iniciar rota, concluir entrega, aprovar abastecimento).
- Introduzir validações de negócio no backend.

### Fase 4 — Integrações
- Publicar eventos para módulos externos.
- Conectar com pedidos de venda, inventário e financeiro.

### Fase 5 — Otimização
- Motor de sugestão de rota e alocação veículo/motorista.
- Alertas inteligentes (anomalia de combustível, risco de SLA).

---

## 15) Mapeamento atual de ecrãs (frontend)

- `/transporte` — dashboard geral.
- `/transporte/veiculos` — gestão de frota.
- `/transporte/motoristas` — gestão de motoristas.
- `/transporte/rotas` — planeamento e acompanhamento de rotas.
- `/transporte/entregas` — operação de entregas.
- `/transporte/entregas/nova` — criação detalhada de entrega.
- `/transporte/manutencao` — agenda e execução de manutenção.
- `/transporte/combustivel` — abastecimentos, eficiência e custos.

---

## 16) Riscos e mitigação

1. **Inconsistência de estados entre módulos**  
   Mitigação: máquina de estados única e validação no backend.

2. **Dependência de dados de cliente/pedido**  
   Mitigação: contratos versionados e fallback de dados mínimos.

3. **Escalada de custos sem visibilidade**  
   Mitigação: dashboard financeiro-logístico com alertas automáticos.

4. **Complexidade operacional em picos de demanda**  
   Mitigação: fila de despacho e regras automáticas de priorização.

---

## 17) Conclusão

A extração do módulo de transporte é tecnicamente viável e estrategicamente recomendada. O frontend já possui cobertura funcional ampla (frota, motoristas, rotas, entregas, manutenção e combustível), o que reduz risco de descoberta funcional tardia. O próximo passo é formalizar contratos de API e regras de negócio centrais para migrar de uma base orientada a mocks para uma operação transacional robusta, auditável e escalável.
