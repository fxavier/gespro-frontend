# Documento de Requisitos

## Introdução

Esta funcionalidade refatora o módulo de Transportes e Logística do GestPro ERP, transformando-o de um módulo centrado em "entregas" para um módulo orientado a domínio, workflows e conformidade operacional. A refatoração introduz a entidade **Atividade** como unidade central de operação, expande a gestão de viaturas com documentação completa, manutenção estruturada e checklists configuráveis, e reforça a gestão de motoristas com foco exclusivo na operação logística (sem duplicar funcionalidades de RH/Payroll). O módulo opera com dados mock (sem backend real), seguindo os padrões existentes do projeto: componentes client-side com `'use client'`, shadcn/ui, lucide-react e tipos em `src/types/transporte.ts`.

---

## Glossário

- **Modulo_Transporte**: O conjunto de páginas e componentes em `src/app/(dashboard)/transporte/`.
- **Atividade**: Entidade central de negócio que representa uma operação de transporte (ex.: deslocação, missão, serviço de campo). Substitui "Entrega" como entidade principal.
- **Viatura**: Veículo da frota registado no sistema, identificado pela matrícula.
- **Motorista**: Condutor registado no sistema para fins operacionais logísticos.
- **Documento_Viatura**: Registo de um documento legal associado a uma viatura (livrete, inspecção, seguro, licença, manifesto, taxa de rádio, outro).
- **Documento_Motorista**: Registo de um documento legal associado a um motorista (carta de condução, BI, outro).
- **Manutencao_Viatura**: Registo de uma intervenção de manutenção (preventiva ou correctiva) numa viatura.
- **Checklist_Viatura**: Lista configurável de itens a verificar numa viatura antes de uma operação.
- **Item_Checklist**: Componente individual de uma Checklist_Viatura (ex.: pneus, extintor, triângulo).
- **Disponibilidade_Motorista**: Estado operacional de um motorista num dado período, podendo ser afectado por férias ou ausências integradas via RH.
- **Alerta_Expiracao**: Notificação gerada automaticamente quando um documento se aproxima ou ultrapassa a data de validade.
- **Alerta_Conflito**: Notificação gerada quando se tenta alocar uma viatura ou motorista já em uso simultâneo.
- **Modulo_RH**: Módulo de Recursos Humanos do GestPro ERP, fonte de dados de férias, ausências e estado de contrato dos motoristas.
- **Estado_Atividade**: Ciclo de vida de uma Atividade: `planeada`, `em_curso`, `suspensa`, `concluida`, `cancelada`.
- **Dashboard_Transporte**: Página principal do módulo em `/transporte`, com visão consolidada das operações.

---

## Requisitos

### Requisito 1: Reestruturação do Dashboard de Transporte

**User Story:** Como gestor de operações, quero um dashboard que reflita a nova estrutura orientada a atividades, para ter uma visão consolidada e accionável do estado da frota e das operações em curso.

#### Critérios de Aceitação

1. THE Dashboard_Transporte SHALL exibir cartões de KPI com: total de viaturas disponíveis, total de atividades em curso, total de motoristas disponíveis, e total de alertas activos (documentos a expirar + conflitos).
2. THE Dashboard_Transporte SHALL exibir uma secção de alertas operacionais que lista documentos de viaturas e motoristas com validade expirada ou a expirar nos próximos 30 dias.
3. THE Dashboard_Transporte SHALL exibir uma lista das atividades recentes com estado, viatura e motorista associados.
4. THE Dashboard_Transporte SHALL remover referências a "Entregas" como entidade principal e substituir pela entidade Atividade.
5. WHEN um alerta de documento expirado está presente, THE Dashboard_Transporte SHALL destacar o alerta com indicador visual de cor vermelha.
6. WHEN um alerta de documento próximo de expirar está presente, THE Dashboard_Transporte SHALL destacar o alerta com indicador visual de cor amarela.

---

### Requisito 2: Gestão de Viaturas — Cadastro e Dados Base

**User Story:** Como gestor de frota, quero cadastrar e gerir viaturas com todos os dados operacionais necessários, para manter o registo completo da frota.

#### Critérios de Aceitação

1. THE Modulo_Transporte SHALL permitir criar, editar, consultar e listar Viaturas.
2. WHEN uma Viatura é criada ou editada, THE Modulo_Transporte SHALL exigir os campos: matrícula, marca, modelo, tipo de viatura, capacidade, local de actividade, data de início de actividade, e estado da viatura.
3. THE Modulo_Transporte SHALL suportar os seguintes tipos de viatura: ligeiro de passageiros, ligeiro de mercadorias, pesado de mercadorias, pesado de passageiros, motociclo, outro.
4. THE Modulo_Transporte SHALL suportar os seguintes estados de viatura: disponível, em actividade, em manutenção, inactiva, abatida.
5. WHEN uma Viatura é listada, THE Modulo_Transporte SHALL exibir: matrícula, marca/modelo, tipo, estado, motorista responsável actual (se atribuído), e indicador de alertas activos.
6. THE Modulo_Transporte SHALL permitir associar um Motorista como responsável actual de uma Viatura.
7. IF uma Viatura tem documentos expirados, THEN THE Modulo_Transporte SHALL exibir um indicador de alerta na listagem dessa Viatura.

---

### Requisito 3: Gestão de Viaturas — Documentação

**User Story:** Como gestor de frota, quero registar e consultar todos os documentos legais de cada viatura, para garantir conformidade documental e receber alertas antes das expirações.

#### Critérios de Aceitação

1. THE Modulo_Transporte SHALL permitir registar Documentos_Viatura para cada Viatura, com os tipos: livrete, inspecção, seguro, licença, manifesto, taxa de rádio, outro.
2. WHEN um Documento_Viatura é registado, THE Modulo_Transporte SHALL exigir os campos: tipo de documento, número, data de emissão, data de validade, e entidade emissora.
3. THE Modulo_Transporte SHALL suportar os campos opcionais: anexo (ficheiro), observações.
4. THE Modulo_Transporte SHALL calcular e exibir o estado de cada Documento_Viatura como: válido, próximo a expirar (dentro do prazo de alerta configurável), ou expirado.
5. WHEN a data actual ultrapassa a data de validade de um Documento_Viatura, THE Modulo_Transporte SHALL marcar o documento como expirado e gerar um Alerta_Expiracao.
6. WHEN a data actual está dentro do prazo de alerta configurável antes da data de validade de um Documento_Viatura, THE Modulo_Transporte SHALL gerar um Alerta_Expiracao de proximidade.
7. THE Modulo_Transporte SHALL exibir todos os Documentos_Viatura de uma Viatura numa vista dedicada, com estado visual por documento.
8. THE Modulo_Transporte SHALL permitir configurar o prazo de alerta de expiração (em dias) por tipo de documento, com valor padrão de 30 dias.

---

### Requisito 4: Gestão de Viaturas — Manutenção

**User Story:** Como gestor de frota, quero registar e acompanhar as manutenções de cada viatura, para garantir a operacionalidade da frota e cumprir os planos de manutenção preventiva.

#### Critérios de Aceitação

1. THE Modulo_Transporte SHALL permitir registar Manutencoes_Viatura para cada Viatura, com os tipos: preventiva e correctiva.
2. WHEN uma Manutencao_Viatura é registada, THE Modulo_Transporte SHALL exigir os campos: tipo de manutenção, data, descrição, e responsável.
3. THE Modulo_Transporte SHALL suportar os campos opcionais: quilometragem ou critério de activação, fornecedor/oficina, custo, peças substituídas, e próxima manutenção prevista.
4. WHEN uma Manutencao_Viatura tem próxima manutenção prevista definida, THE Modulo_Transporte SHALL gerar um alerta automático quando a data ou quilometragem de activação for atingida.
5. THE Modulo_Transporte SHALL exibir o histórico completo de manutenções de cada Viatura, ordenado por data decrescente.
6. THE Modulo_Transporte SHALL exibir na ficha da Viatura a data da última manutenção e a data/critério da próxima manutenção prevista.
7. IF uma Viatura tem manutenção preventiva em atraso, THEN THE Modulo_Transporte SHALL exibir um alerta na ficha e na listagem dessa Viatura.

---

### Requisito 5: Gestão de Viaturas — Checklist

**User Story:** Como gestor de frota, quero configurar e registar checklists de inspecção para cada viatura, para garantir que os componentes essenciais são verificados antes de cada operação.

#### Critérios de Aceitação

1. THE Modulo_Transporte SHALL permitir configurar Checklists_Viatura por tipo de viatura, com Itens_Checklist personalizáveis.
2. THE Modulo_Transporte SHALL incluir os seguintes Itens_Checklist por defeito: pneus, travões, luzes, extintor, triângulo, roda sobressalente, macaco, kit de primeiros socorros, colete reflector.
3. WHEN um Checklist_Viatura é preenchido, THE Modulo_Transporte SHALL exigir: estado de cada item (ok, avaria, falta), responsável pela inspecção, e data da inspecção.
4. THE Modulo_Transporte SHALL manter o histórico de inspecções de cada Viatura, com todos os registos de Checklist_Viatura anteriores.
5. WHEN um Item_Checklist tem estado "avaria" ou "falta", THE Modulo_Transporte SHALL destacar esse item com indicador visual de alerta.
6. IF um Checklist_Viatura tem itens com estado "avaria" ou "falta", THEN THE Modulo_Transporte SHALL impedir a atribuição dessa Viatura a uma nova Atividade e exibir mensagem explicativa.

---

### Requisito 6: Gestão de Atividades

**User Story:** Como gestor de operações, quero criar e gerir atividades de transporte como entidade central, para planear, executar e acompanhar todas as operações logísticas de forma estruturada.

#### Critérios de Aceitação

1. THE Modulo_Transporte SHALL permitir criar, editar, consultar, listar e encerrar Atividades.
2. WHEN uma Atividade é criada, THE Modulo_Transporte SHALL exigir os campos: título, tipo de atividade, local de actividade, data de início prevista, e prioridade.
3. THE Modulo_Transporte SHALL suportar os campos opcionais: código (gerado automaticamente se não fornecido), descrição, data prevista de conclusão, motorista responsável, viatura associada, observações, e anexos.
4. THE Modulo_Transporte SHALL suportar os seguintes tipos de atividade: deslocação, missão de serviço, transporte de mercadorias, transporte de pessoal, manutenção em campo, outro.
5. THE Modulo_Transporte SHALL suportar os seguintes estados de Atividade: planeada, em curso, suspensa, concluída, cancelada.
6. WHEN o estado de uma Atividade muda, THE Modulo_Transporte SHALL registar o evento no histórico da Atividade com data, hora e utilizador responsável pela mudança.
7. THE Modulo_Transporte SHALL exibir o histórico completo de eventos de cada Atividade.
8. WHEN uma Atividade é encerrada, THE Modulo_Transporte SHALL exigir confirmação e registar a data e hora de encerramento.

---

### Requisito 7: Regras de Alocação de Atividades

**User Story:** Como gestor de operações, quero que o sistema impeça alocações inválidas de viaturas e motoristas, para garantir conformidade operacional e evitar conflitos de agenda.

#### Critérios de Aceitação

1. WHEN se tenta atribuir uma Viatura a uma Atividade, THE Modulo_Transporte SHALL verificar se a Viatura tem todos os Documentos_Viatura obrigatórios válidos.
2. IF uma Viatura tem um ou mais Documentos_Viatura expirados, THEN THE Modulo_Transporte SHALL impedir a atribuição e exibir uma mensagem indicando os documentos inválidos.
3. WHEN se tenta atribuir um Motorista a uma Atividade, THE Modulo_Transporte SHALL verificar se o Motorista tem carta de condução válida.
4. IF um Motorista tem carta de condução expirada, THEN THE Modulo_Transporte SHALL impedir a atribuição e exibir uma mensagem indicando o documento inválido.
5. WHEN se tenta atribuir uma Viatura a uma Atividade, THE Modulo_Transporte SHALL verificar se a Viatura não está já alocada a outra Atividade com datas sobrepostas.
6. IF uma Viatura está alocada a outra Atividade com datas sobrepostas, THEN THE Modulo_Transporte SHALL gerar um Alerta_Conflito e impedir a atribuição duplicada.
7. WHEN se tenta atribuir um Motorista a uma Atividade, THE Modulo_Transporte SHALL verificar se o Motorista não está já alocado a outra Atividade com datas sobrepostas.
8. IF um Motorista está alocado a outra Atividade com datas sobrepostas, THEN THE Modulo_Transporte SHALL gerar um Alerta_Conflito e impedir a atribuição duplicada.
9. IF um Motorista está marcado como indisponível (férias ou ausência via integração com Modulo_RH), THEN THE Modulo_Transporte SHALL impedir a atribuição e exibir o motivo de indisponibilidade.

---

### Requisito 8: Gestão de Motoristas — Cadastro Operacional

**User Story:** Como gestor de operações, quero cadastrar motoristas com os dados necessários para a operação logística, sem duplicar informações já geridas pelo módulo de RH.

#### Critérios de Aceitação

1. THE Modulo_Transporte SHALL permitir criar, editar, consultar e listar Motoristas com foco nos dados operacionais logísticos.
2. WHEN um Motorista é criado ou editado, THE Modulo_Transporte SHALL exigir os campos: nome completo, contacto telefónico, número da carta de condução, categoria da carta, data de emissão da carta, e validade da carta.
3. THE Modulo_Transporte SHALL suportar os campos opcionais: morada, número do BI, local de actividade, estado operacional, e observações.
4. THE Modulo_Transporte SHALL suportar os seguintes estados operacionais de Motorista: activo, inactivo, suspenso.
5. WHEN um Motorista é listado, THE Modulo_Transporte SHALL exibir: nome, contacto, estado da carta de condução, estado operacional, e indicador de disponibilidade actual.
6. IF a carta de condução de um Motorista está expirada, THEN THE Modulo_Transporte SHALL exibir um alerta na ficha e na listagem desse Motorista.
7. THE Modulo_Transporte SHALL remover os campos de métricas de entregas (totalEntregas, entregasNoTempo, entregasAtrasadas, entregasFalhadas, avaliacaoMedia) do cadastro de Motorista, pois são métricas de entrega e não de operação logística.

---

### Requisito 9: Gestão de Motoristas — Documentação

**User Story:** Como gestor de operações, quero registar e consultar os documentos legais de cada motorista, para garantir que apenas motoristas com documentação válida são alocados a atividades.

#### Critérios de Aceitação

1. THE Modulo_Transporte SHALL permitir registar Documentos_Motorista para cada Motorista, com os tipos: carta de condução, BI, outro.
2. WHEN um Documento_Motorista é registado, THE Modulo_Transporte SHALL exigir os campos: tipo de documento, número, data de emissão, data de validade, e entidade emissora.
3. THE Modulo_Transporte SHALL suportar os campos opcionais: anexo (ficheiro) e observações.
4. THE Modulo_Transporte SHALL calcular e exibir o estado de cada Documento_Motorista como: válido, próximo a expirar, ou expirado.
5. WHEN a data actual ultrapassa a data de validade de um Documento_Motorista, THE Modulo_Transporte SHALL marcar o documento como expirado e gerar um Alerta_Expiracao.
6. WHEN a data actual está dentro do prazo de alerta configurável antes da data de validade de um Documento_Motorista, THE Modulo_Transporte SHALL gerar um Alerta_Expiracao de proximidade.
7. THE Modulo_Transporte SHALL exibir todos os Documentos_Motorista de um Motorista numa vista dedicada, com estado visual por documento.

---

### Requisito 10: Disponibilidade Operacional de Motoristas

**User Story:** Como gestor de operações, quero consultar a disponibilidade de cada motorista e receber informação sobre indisponibilidades provenientes do módulo de RH, para planear as atividades sem conflitos.

#### Critérios de Aceitação

1. THE Modulo_Transporte SHALL exibir o estado de disponibilidade actual de cada Motorista na sua ficha e na listagem.
2. THE Modulo_Transporte SHALL suportar a integração com o Modulo_RH para receber dados de: férias, ausências, e estado do contrato do Motorista.
3. WHERE a integração com o Modulo_RH está activa, THE Modulo_Transporte SHALL consumir os dados de disponibilidade via API REST ou eventos (ex.: `motorista.indisponivel`), sem duplicar a gestão dessas informações.
4. WHEN o Modulo_RH indica que um Motorista está em férias ou ausência, THE Modulo_Transporte SHALL marcar o Motorista como indisponível para alocação a Atividades.
5. WHERE a integração com o Modulo_RH não está activa, THE Modulo_Transporte SHALL permitir registar manualmente períodos de indisponibilidade para cada Motorista.
6. THE Modulo_Transporte SHALL exibir o motivo de indisponibilidade (férias, ausência, suspensão, ou manual) quando um Motorista não está disponível para alocação.

---

### Requisito 11: Sistema de Alertas Operacionais

**User Story:** Como gestor de operações, quero receber alertas automáticos sobre documentos a expirar, manutenções pendentes e conflitos de alocação, para agir proactivamente e evitar paragens operacionais.

#### Critérios de Aceitação

1. THE Modulo_Transporte SHALL gerar Alertas_Expiracao para documentos de viaturas e motoristas com validade expirada ou dentro do prazo de alerta configurável.
2. THE Modulo_Transporte SHALL gerar alertas de manutenção preventiva quando a data ou quilometragem de activação de uma Manutencao_Viatura prevista for atingida.
3. THE Modulo_Transporte SHALL gerar Alertas_Conflito quando se tenta alocar uma Viatura ou Motorista já em uso simultâneo.
4. THE Modulo_Transporte SHALL exibir todos os alertas activos numa secção centralizada no Dashboard_Transporte.
5. WHEN um alerta é exibido, THE Modulo_Transporte SHALL indicar: tipo de alerta, entidade afectada (viatura ou motorista), descrição do problema, e nível de urgência (crítico para expirado, aviso para próximo a expirar).
6. THE Modulo_Transporte SHALL permitir configurar o prazo de alerta de expiração em dias, com valor padrão de 30 dias.
7. WHEN um documento expirado bloqueia uma operação, THE Modulo_Transporte SHALL exibir uma mensagem clara indicando qual documento está inválido e qual entidade está bloqueada.

---

### Requisito 12: Histórico Auditável

**User Story:** Como gestor de operações, quero que todas as acções relevantes sejam registadas num histórico imutável, para garantir rastreabilidade e conformidade operacional.

#### Critérios de Aceitação

1. THE Modulo_Transporte SHALL registar no histórico de cada Atividade todos os eventos de mudança de estado, com: data, hora, estado anterior, estado novo, e identificador do utilizador responsável.
2. THE Modulo_Transporte SHALL registar no histórico de cada Viatura todas as alterações de dados, registos de documentos, manutenções e checklists.
3. THE Modulo_Transporte SHALL registar no histórico de cada Motorista todas as alterações de dados e registos de documentos.
4. THE Modulo_Transporte SHALL exibir o histórico de cada entidade (Atividade, Viatura, Motorista) numa vista dedicada, ordenado por data decrescente.
5. THE Modulo_Transporte SHALL garantir que os registos de histórico não podem ser editados ou eliminados após criação (imutabilidade).

---

### Requisito 13: Actualização dos Tipos TypeScript

**User Story:** Como programador, quero que os tipos TypeScript em `src/types/transporte.ts` reflictam o novo modelo de domínio, para garantir consistência e segurança de tipos em todo o módulo.

#### Critérios de Aceitação

1. THE Modulo_Transporte SHALL definir os seguintes novos tipos em `src/types/transporte.ts`: `Atividade`, `DocumentoViatura`, `ManutencaoViatura` (expandido), `ChecklistViatura`, `ItemChecklist`, `DocumentoMotorista`, `DisponibilidadeMotorista`.
2. THE Modulo_Transporte SHALL actualizar o tipo `Viatura` para incluir: `localActividade`, `dataInicioActividade`, `motoristaResponsavelId`, e remover campos de seguro/inspecção/licença inline (substituídos por `DocumentoViatura[]`).
3. THE Modulo_Transporte SHALL actualizar o tipo `Motorista` para: remover métricas de entregas, adicionar `numeroBI`, `localActividade`, e substituir `cartaConducao` inline por referência a `DocumentoMotorista[]`.
4. THE Modulo_Transporte SHALL manter compatibilidade com os tipos existentes utilizados nas páginas de rotas e combustível que não são alvo desta refatoração.
