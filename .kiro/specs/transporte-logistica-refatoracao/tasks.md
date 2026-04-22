# Plano de Implementação: Refatoração do Módulo de Transportes e Logística

## Visão Geral

Refatoração completa do módulo de Transportes e Logística do GestPro ERP, transformando-o de um sistema centrado em "Entregas" para um módulo orientado a domínio com a entidade **Atividade** como unidade central. A implementação segue a ordem: tipos → serviços → testes de propriedade → dashboard → atividades → viaturas → motoristas.

Stack: Next.js 15 App Router, TypeScript 5, React 19, Tailwind CSS 4, shadcn/ui, react-hook-form + zod, sonner, fast-check (PBT).

## Tarefas

- [x] 1. Actualizar tipos TypeScript em `src/types/transporte.ts`
  - Adicionar interface `Atividade` com campos: `id`, `codigo`, `titulo`, `descricao?`, `tipoActividade`, `localActividade`, `dataInicioPrevista`, `dataConclusaoPrevista?`, `motoristaResponsavelId?`, `motoristaResponsavelNome?`, `viaturaId?`, `viaturaMatricula?`, `prioridade`, `estado`, `observacoes?`, `anexos?`, `historico`, `criadoEm`, `criadoPor`
  - Adicionar interface `EventoAtividade` com campos: `id`, `data`, `estadoAnterior?`, `estadoNovo`, `utilizador`, `descricao`
  - Adicionar interface `DocumentoViatura` com campos: `id`, `viaturaId`, `tipo`, `numero`, `dataEmissao`, `dataValidade`, `entidadeEmissora`, `estado`, `anexo?`, `observacoes?`, `prazoAlertaDias`
  - Adicionar interface `DocumentoMotorista` com campos: `id`, `motoristaId`, `tipo`, `numero`, `dataEmissao`, `dataValidade`, `entidadeEmissora`, `estado`, `anexo?`, `observacoes?`
  - Adicionar interface `ManutencaoViatura` (expandida) com campos: `id`, `viaturaId`, `tipo`, `data`, `quilometragem?`, `criterio?`, `descricao`, `fornecedor?`, `custo?`, `pecasSubstituidas?`, `responsavel`, `proximaManutencaoPrevista?`, `criadoEm`
  - Adicionar interfaces `ChecklistViatura` e `ItemChecklist`
  - Adicionar interface `DisponibilidadeMotorista` com campos: `disponivel`, `motivo?`, `dataInicio?`, `dataFim?`, `fonte`
  - Substituir tipo `Veiculo` pelo novo tipo `Viatura` com campos actualizados: `tipoViatura`, `capacidade`, `localActividade`, `dataInicioActividade`, `motoristaResponsavelId?`, `motoristaResponsavelNome?`, `estado`, `documentos: DocumentoViatura[]`
  - Actualizar tipo `Motorista` para remover métricas de entregas (`totalEntregas`, `entregasNoTempo`, `entregasAtrasadas`, `entregasFalhadas`, `avaliacaoMedia`) e adicionar `nomeCompleto`, `contacto`, `numeroBI?`, `numeroCarta`, `categoriaCarta`, `dataEmissaoCarta`, `validadeCarta`, `localActividade?`, `estadoOperacional`, `documentos: DocumentoMotorista[]`, `disponibilidade: DisponibilidadeMotorista`
  - Manter tipos existentes `Rota`, `PontoEntrega`, `Entrega`, `ItemEntrega`, `Abastecimento`, `RelatorioTransporte` sem alterações
  - _Requisitos: 13.1, 13.2, 13.3, 13.4_

- [x] 2. Implementar serviço de alocação (`src/services/transporte-alocacao.service.ts`)
  - [x] 2.1 Implementar `calcularEstadoDocumento(dataValidade: Date, prazoAlertaDias: number): 'valido' | 'proximo_expirar' | 'expirado'`
    - Retorna `'expirado'` se `dataValidade < hoje`
    - Retorna `'proximo_expirar'` se `dataValidade` estiver entre hoje e `hoje + prazoAlertaDias`
    - Retorna `'valido'` nos restantes casos
    - _Requisitos: 3.4, 3.5, 3.6, 9.4, 9.5, 9.6_

  - [ ]* 2.2 Escrever property test para `calcularEstadoDocumento`
    - **Property 1: calcularEstadoDocumento retorna estado correcto para qualquer data e prazo**
    - **Valida: Requisitos 3.4, 3.5, 3.6, 9.4, 9.5, 9.6**
    - Gerar datas de validade aleatórias (passado, dentro do prazo, futuro) e prazos de alerta aleatórios (1–365 dias)
    - Tag: `// Feature: transporte-logistica-refatoracao, Property 1: calcularEstadoDocumento retorna estado correcto para qualquer data e prazo`

  - [x] 2.3 Implementar `validarAlocacaoViatura(viatura, dataInicio, dataFim?, atividadesExistentes?): ValidationResult`
    - Verificar se a viatura tem documentos expirados → `isValid: false` com lista de documentos inválidos
    - Verificar se o checklist mais recente tem itens com `estado === 'avaria'` ou `estado === 'falta'` → `isValid: false`
    - Verificar conflitos de agenda com `atividadesExistentes` → `isValid: false` se houver sobreposição
    - _Requisitos: 7.1, 7.2, 5.6_

  - [ ]* 2.4 Escrever property test para bloqueio por documento expirado
    - **Property 2: viatura com documento expirado bloqueia alocação**
    - **Valida: Requisitos 7.1, 7.2**
    - Gerar viaturas com pelo menos um `DocumentoViatura` com `estado === 'expirado'`
    - Tag: `// Feature: transporte-logistica-refatoracao, Property 2: viatura com documento expirado bloqueia alocação`

  - [ ]* 2.5 Escrever property test para bloqueio por checklist com avaria/falta
    - **Property 9: checklist com avaria/falta bloqueia alocação de viatura**
    - **Valida: Requisitos 5.6**
    - Gerar checklists com pelo menos um item com `estado === 'avaria'` ou `estado === 'falta'`
    - Tag: `// Feature: transporte-logistica-refatoracao, Property 9: checklist com avaria/falta bloqueia alocação de viatura`

  - [x] 2.6 Implementar `validarAlocacaoMotorista(motorista, dataInicio, dataFim?, atividadesExistentes?): ValidationResult`
    - Verificar se `validadeCarta` é anterior à data actual → `isValid: false`
    - Verificar se `disponibilidade.disponivel === false` → `isValid: false` com motivo
    - Verificar conflitos de agenda com `atividadesExistentes` → `isValid: false` se houver sobreposição
    - _Requisitos: 7.3, 7.4, 7.7, 7.8, 7.9_

  - [ ]* 2.7 Escrever property test para bloqueio por carta de condução expirada
    - **Property 3: motorista com carta expirada bloqueia alocação**
    - **Valida: Requisitos 7.3, 7.4**
    - Gerar motoristas com `validadeCarta` no passado
    - Tag: `// Feature: transporte-logistica-refatoracao, Property 3: motorista com carta expirada bloqueia alocação`

  - [ ]* 2.8 Escrever property test para bloqueio por motorista indisponível
    - **Property 5: motorista indisponível bloqueia alocação**
    - **Valida: Requisitos 7.9**
    - Gerar motoristas com `disponibilidade.disponivel === false` e motivos aleatórios
    - Tag: `// Feature: transporte-logistica-refatoracao, Property 5: motorista indisponível bloqueia alocação`

  - [x] 2.9 Implementar `verificarConflitosAgenda(entidadeId, tipo, dataInicio, dataFim, atividades): ConflictResult[]`
    - Filtrar atividades pela `entidadeId` e `tipo` ('viatura' ou 'motorista')
    - Detectar sobreposição de intervalos `[dataInicioPrevista, dataConclusaoPrevista]`
    - Retornar array de `ConflictResult` com `atividadeId`, `atividadeCodigo`, `dataInicio`, `dataFim?`, `descricao`
    - _Requisitos: 7.5, 7.6, 7.7, 7.8_

  - [ ]* 2.10 Escrever property test para detecção de conflitos de agenda
    - **Property 4: atividades com datas sobrepostas geram conflito de agenda**
    - **Valida: Requisitos 7.5, 7.6, 7.7, 7.8**
    - Gerar pares de atividades com a mesma viatura/motorista e intervalos de datas sobrepostos
    - Tag: `// Feature: transporte-logistica-refatoracao, Property 4: atividades com datas sobrepostas geram conflito`

- [x] 3. Implementar serviço de alertas (`src/services/transporte-alertas.service.ts`)
  - [x] 3.1 Definir interface `Alerta` com campos: `id`, `tipo`, `urgencia`, `entidade`, `entidadeId`, `entidadeNome`, `descricao`, `dataAlerta`
    - _Requisitos: 11.5_

  - [x] 3.2 Implementar `gerarAlertasDocumentos(viaturas: Viatura[], motoristas: Motorista[]): Alerta[]`
    - Iterar sobre `viatura.documentos` de cada viatura e gerar um `Alerta` por documento com `estado !== 'valido'`
    - Iterar sobre `motorista.documentos` de cada motorista e gerar um `Alerta` por documento com `estado !== 'valido'`
    - Definir `urgencia: 'critico'` para documentos expirados e `urgencia: 'aviso'` para documentos próximos a expirar
    - _Requisitos: 1.2, 1.5, 1.6, 11.1_

  - [ ]* 3.3 Escrever property test para geração de alertas por documentos inválidos
    - **Property 6: gerarAlertasDocumentos gera alerta por cada documento inválido com urgência correcta**
    - **Valida: Requisitos 1.2, 1.5, 1.6, 11.1**
    - Gerar conjuntos aleatórios de viaturas e motoristas com documentos de estados variados
    - Verificar que o número de alertas corresponde exactamente ao número de documentos com `estado !== 'valido'`
    - Tag: `// Feature: transporte-logistica-refatoracao, Property 6: gerarAlertasDocumentos gera alerta por cada documento inválido`

  - [x] 3.4 Implementar `gerarAlertasManutencao(viaturas: Viatura[], manutencoes: ManutencaoViatura[]): Alerta[]`
    - Gerar alertas para manutenções preventivas com `proximaManutencaoPrevista.data` atingida ou ultrapassada
    - _Requisitos: 4.4, 11.2_

- [ ] 4. Checkpoint — Verificar serviços e tipos
  - Garantir que todos os testes passam, perguntar ao utilizador se surgirem dúvidas.

- [x] 5. Refatorar dashboard de transporte (`src/app/(dashboard)/transporte/page.tsx`)
  - [x] 5.1 Substituir dados mock de entregas por dados mock de `Atividade[]` e `Alerta[]`
    - Declarar `atividadesMock: Atividade[]` e `viaturasMock: Viatura[]` e `motoristasMock: Motorista[]` como constantes no topo do ficheiro
    - _Requisitos: 1.4_

  - [x] 5.2 Implementar KPIs do dashboard com contagens derivadas dos arrays mock
    - Viaturas disponíveis: `viaturas.filter(v => v.estado === 'disponivel').length`
    - Atividades em curso: `atividades.filter(a => a.estado === 'em_curso').length`
    - Motoristas disponíveis: `motoristas.filter(m => m.disponibilidade.disponivel).length`
    - Alertas activos: resultado de `gerarAlertasDocumentos` + `gerarAlertasManutencao`
    - _Requisitos: 1.1_

  - [ ]* 5.3 Escrever property test para KPIs do dashboard
    - **Property 7: KPIs do dashboard correspondem às contagens reais dos arrays**
    - **Valida: Requisitos 1.1**
    - Gerar conjuntos aleatórios de viaturas, atividades e motoristas
    - Verificar que cada KPI calculado corresponde exactamente à contagem filtrada do array
    - Tag: `// Feature: transporte-logistica-refatoracao, Property 7: KPIs do dashboard correspondem às contagens reais`

  - [x] 5.4 Implementar secção de alertas operacionais no dashboard
    - Exibir alertas gerados por `gerarAlertasDocumentos` e `gerarAlertasManutencao`
    - Destacar alertas com `urgencia === 'critico'` com indicador visual vermelho
    - Destacar alertas com `urgencia === 'aviso'` com indicador visual amarelo
    - _Requisitos: 1.2, 1.5, 1.6_

  - [x] 5.5 Implementar lista de atividades recentes no dashboard
    - Exibir as 5 atividades mais recentes com estado, viatura e motorista associados
    - Remover secção de "Entregas Recentes" e substituir por "Atividades Recentes"
    - Adicionar link "Ver todas" para `/transporte/atividades`
    - _Requisitos: 1.3, 1.4_

- [x] 6. Criar página de lista de atividades (`src/app/(dashboard)/transporte/atividades/page.tsx`)
  - [x] 6.1 Criar componente `AtividadesPage` com dados mock `atividadesMock: Atividade[]` no topo do ficheiro
    - Incluir pelo menos 5 atividades mock com estados variados (`planeada`, `em_curso`, `suspensa`, `concluida`, `cancelada`)
    - _Requisitos: 6.1_

  - [x] 6.2 Implementar tabela de atividades com colunas: código, título, tipo, local, data início, motorista, viatura, prioridade, estado
    - Usar `usePagination` de `@/hooks/usePagination` e `PaginationControls`
    - _Requisitos: 6.1_

  - [x] 6.3 Implementar filtros: pesquisa por texto (título/código), filtro por estado, filtro por tipo de atividade
    - _Requisitos: 6.1_

  - [x] 6.4 Implementar Dialog de criação de nova atividade com formulário `react-hook-form` + `zod`
    - Campos obrigatórios: título, tipo de atividade, local de actividade, data de início prevista, prioridade
    - Campos opcionais: descrição, data prevista de conclusão, motorista responsável, viatura associada, observações
    - Gerar código automaticamente no formato `AT-YYYY-NNNN` se não fornecido
    - Chamar `validarAlocacaoViatura` e `validarAlocacaoMotorista` antes de guardar; exibir erros inline se inválido
    - Ao criar, adicionar evento inicial ao `historico` da atividade com `estadoNovo: 'planeada'`
    - Toast de sucesso via `sonner` ao criar
    - _Requisitos: 6.2, 6.3, 6.4, 6.5, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9_

  - [x] 6.5 Implementar mudança de estado de atividade (botão de acção na tabela)
    - Ao mudar estado, adicionar `EventoAtividade` ao `historico` com data, estado anterior, estado novo, utilizador
    - Exigir confirmação ao encerrar (estado `concluida` ou `cancelada`)
    - _Requisitos: 6.6, 6.7, 6.8_

  - [ ]* 6.6 Escrever property test para imutabilidade do histórico de atividades
    - **Property 8: histórico de atividade é append-only (imutável)**
    - **Valida: Requisitos 6.6, 12.1, 12.5**
    - Gerar sequências aleatórias de N mudanças de estado (1–10)
    - Verificar que o histórico cresce de 1 em 1 e que os eventos anteriores não são modificados
    - Tag: `// Feature: transporte-logistica-refatoracao, Property 8: histórico de atividade é append-only`

- [x] 7. Criar página de detalhe de atividade (`src/app/(dashboard)/transporte/atividades/[id]/page.tsx`)
  - [x] 7.1 Criar componente `AtividadeDetalhesPage` com lookup por `params.id` nos dados mock
    - Renderizar estado not-found com botão "Voltar" se `id` não existir
    - _Requisitos: 6.1_

  - [x] 7.2 Implementar header com: código, título, estado (badge), prioridade (badge), botões de acção (mudar estado, editar)
    - _Requisitos: 6.5, 6.6_

  - [x] 7.3 Implementar Tab "Detalhes" com: tipo, local, datas, motorista, viatura, observações
    - _Requisitos: 6.2, 6.3_

  - [x] 7.4 Implementar Tab "Histórico" com lista de `EventoAtividade` ordenada por data decrescente
    - Exibir: data/hora, estado anterior → estado novo, utilizador, descrição
    - _Requisitos: 6.7, 12.1, 12.4_

- [ ] 8. Checkpoint — Verificar atividades
  - Garantir que todos os testes passam, perguntar ao utilizador se surgirem dúvidas.

- [x] 9. Refatorar lista de viaturas (`src/app/(dashboard)/transporte/veiculos/page.tsx`)
  - [x] 9.1 Substituir dados mock `veiculosMock: Veiculo[]` por `viaturasMock: Viatura[]` com o novo tipo
    - Incluir pelo menos 4 viaturas mock com documentos variados (válidos, próximos a expirar, expirados)
    - _Requisitos: 2.1, 2.2, 2.3, 2.4_

  - [x] 9.2 Actualizar tabela de viaturas com colunas: matrícula, marca/modelo, tipo, estado, motorista responsável, indicador de alertas
    - Exibir indicador de alerta (ícone vermelho) se a viatura tiver documentos expirados
    - Adicionar link para `/transporte/veiculos/[id]` em cada linha
    - _Requisitos: 2.5, 2.6, 2.7_

  - [x] 9.3 Actualizar filtros e tipos de viatura para os novos valores: `ligeiro_passageiros`, `ligeiro_mercadorias`, `pesado_mercadorias`, `pesado_passageiros`, `motociclo`, `outro`
    - Actualizar estados para: `disponivel`, `em_actividade`, `em_manutencao`, `inactiva`, `abatida`
    - _Requisitos: 2.3, 2.4_

  - [x] 9.4 Actualizar Dialog de criação/edição de viatura com campos do novo tipo `Viatura`
    - Campos obrigatórios: matrícula, marca, modelo, tipo de viatura, capacidade, local de actividade, data de início de actividade, estado
    - Remover campos inline de seguro/inspecção/licença (substituídos por `DocumentoViatura[]`)
    - _Requisitos: 2.2_

- [x] 10. Criar página de detalhe de viatura (`src/app/(dashboard)/transporte/veiculos/[id]/page.tsx`)
  - [x] 10.1 Criar componente `ViaturaDetalhesPage` com lookup por `params.id` nos dados mock
    - Renderizar estado not-found com botão "Voltar" se `id` não existir
    - _Requisitos: 2.1_

  - [x] 10.2 Implementar header com: matrícula, marca/modelo, tipo, estado (badge), motorista responsável, indicador de alertas activos
    - _Requisitos: 2.5, 2.7_

  - [x] 10.3 Implementar Tab "Dados Base" com todos os campos da viatura e botão de edição
    - _Requisitos: 2.2_

  - [x] 10.4 Implementar Tab "Documentação" com lista de `DocumentoViatura`
    - Exibir estado visual por documento (verde/amarelo/vermelho)
    - Dialog para adicionar novo documento com campos: tipo, número, data de emissão, data de validade, entidade emissora, prazo de alerta (default 30 dias)
    - _Requisitos: 3.1, 3.2, 3.3, 3.4, 3.7, 3.8_

  - [x] 10.5 Implementar Tab "Manutenção" com histórico de `ManutencaoViatura` ordenado por data decrescente
    - Exibir: data, tipo, descrição, responsável, custo, próxima manutenção prevista
    - Dialog para registar nova manutenção com campos obrigatórios e opcionais
    - _Requisitos: 4.1, 4.2, 4.3, 4.5, 4.6_

  - [x] 10.6 Implementar Tab "Checklist" com histórico de `ChecklistViatura` e formulário de nova inspecção
    - Exibir itens com indicador visual de alerta para `estado === 'avaria'` ou `estado === 'falta'`
    - Itens por defeito: pneus, travões, luzes, extintor, triângulo, roda sobressalente, macaco, kit de primeiros socorros, colete reflector
    - _Requisitos: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 10.7 Implementar Tab "Histórico" com lista de eventos da viatura ordenada por data decrescente
    - _Requisitos: 12.2, 12.4_

- [x] 11. Refatorar lista de motoristas (`src/app/(dashboard)/transporte/motoristas/page.tsx`)
  - [x] 11.1 Substituir dados mock `motoristasMock: Motorista[]` pelo novo tipo `Motorista` actualizado
    - Remover campos de métricas de entregas dos dados mock
    - Incluir pelo menos 4 motoristas mock com disponibilidade e documentos variados
    - _Requisitos: 8.1, 8.7_

  - [x] 11.2 Actualizar cards de KPI: remover "Taxa de Sucesso" e "Avaliação Média"; adicionar "Disponíveis" e "Com Alertas"
    - _Requisitos: 8.7_

  - [x] 11.3 Actualizar lista de motoristas com colunas: nome, contacto, estado da carta, estado operacional, indicador de disponibilidade
    - Exibir indicador de alerta se a carta de condução estiver expirada
    - Adicionar link para `/transporte/motoristas/[id]` em cada card
    - _Requisitos: 8.5, 8.6_

  - [x] 11.4 Actualizar Dialog de criação/edição de motorista com campos do novo tipo
    - Campos obrigatórios: nome completo, contacto telefónico, número da carta, categoria da carta, data de emissão da carta, validade da carta
    - Campos opcionais: morada, número do BI, local de actividade, estado operacional, observações
    - Remover campos de métricas de entregas do formulário
    - _Requisitos: 8.2, 8.3, 8.4_

- [ ] 12. Criar página de detalhe de motorista (`src/app/(dashboard)/transporte/motoristas/[id]/page.tsx`)
  - [x] 12.1 Criar componente `MotoristaDetalhesPage` com lookup por `params.id` nos dados mock
    - Renderizar estado not-found com botão "Voltar" se `id` não existir
    - _Requisitos: 8.1_

  - [x] 12.2 Implementar header com: nome, estado operacional (badge), disponibilidade actual (badge), indicador de alertas
    - _Requisitos: 8.5, 10.1_

  - [x] 12.3 Implementar Tab "Dados Operacionais" com todos os campos do motorista e botão de edição
    - _Requisitos: 8.2, 8.3_

  - [x] 12.4 Implementar Tab "Documentação" com lista de `DocumentoMotorista`
    - Exibir estado visual por documento (verde/amarelo/vermelho)
    - Dialog para adicionar novo documento com campos: tipo, número, data de emissão, data de validade, entidade emissora
    - _Requisitos: 9.1, 9.2, 9.3, 9.4, 9.7_

  - [x] 12.5 Implementar Tab "Disponibilidade" com estado actual e períodos de indisponibilidade
    - Exibir motivo de indisponibilidade (férias, ausência, suspensão, manual)
    - Formulário para registar período de indisponibilidade manual
    - _Requisitos: 10.1, 10.5, 10.6_

  - [x] 12.6 Implementar Tab "Histórico" com lista de eventos do motorista ordenada por data decrescente
    - _Requisitos: 12.3, 12.4_

- [ ] 13. Checkpoint final — Garantir que todos os testes passam
  - Garantir que todos os testes passam, perguntar ao utilizador se surgirem dúvidas.

## Notas

- Tarefas marcadas com `*` são opcionais e podem ser ignoradas para um MVP mais rápido
- Cada tarefa referencia os requisitos específicos para rastreabilidade
- Os serviços (`transporte-alocacao.service.ts` e `transporte-alertas.service.ts`) são funções puras — sem estado interno, sem chamadas HTTP
- Os dados mock são declarados como constantes no topo de cada ficheiro de página (fora do componente), seguindo o padrão existente do projecto
- Os property tests usam **fast-check** e devem correr um mínimo de 100 iterações por propriedade
- As páginas de rotas, combustível e manutenção existentes não são alvo desta refatoração e devem ser mantidas sem alterações
