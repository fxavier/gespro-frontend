# 8. Lacunas conhecidas

> Apuradas em **2026-09-24** ao escrever o manual de utilizador, por leitura do código em `3ea52bd`
> (não por execução). Cada item foi confirmado no ficheiro citado pelo autor do capítulo, mas **não foi
> reproduzido em runtime** — confirmar antes de abrir issue. O manual avisa o utilizador (caixas
> «Atenção») onde o defeito o afecta.
>
> Cada lacuna tem issue no GitHub (etiquetas `needs-triage` e `gravidade:A|M|B`), ligada no fim da linha.
>
> **Gravidade** — **A**: dados ou valores errados, efeito contabilístico/fiscal, ou segurança ·
> **M**: fluxo de negócio sem saída na UI (serviço existe, ecrã não) · **B**: cosmético/incoerência.

## Resumo

O padrão dominante não é código errado: é **last-mile**. Os serviços e as máquinas de estado existem e
estão testados, mas muitas transições não têm botão, e por isso vários ciclos de vida param no primeiro
estado. O segundo padrão é **estado sem escritor** (colunas lidas por decisões que nada escreve em
produção). Os itens **A** são os que merecem prioridade antes de qualquer cliente real.

## Transversal

| G | Lacuna | Onde |
|---|---|---|
| A | Visibilidade não filtrada por permissão de consulta: menu e páginas abrem para qualquer perfil (ex.: Operador vê Utilizadores e Auditoria) ([#76](https://github.com/fxavier/gespro-frontend/issues/76)) | `AppSidebar.tsx` (só «Subscrição» filtra), `page.tsx` |
| A | IVA 0% gravado como 16% (`Number(taxaIva) \|\| 0.16`) em fatura, cotação, proforma, nota de crédito (/faturacao) e pedido de compra ([#77](https://github.com/fxavier/gespro-frontend/issues/77)) | formulários em `faturacao/*`, `novo-pedido-form.tsx` |
| M | Grupo «Compras & Procurement» invisível para todos: permissões `compras:requisicao:ver`, `compras:cotacao:ver`, `compras:pedido:ver` não existem em `rbac.ts` ([#100](https://github.com/fxavier/gespro-frontend/issues/100)) | `AppSidebar.tsx` |
| M | Muitos formulários pedem o **id interno** (CUID) em vez de pesquisa: ausências, benefícios, devoluções, cotação/proforma/NC, BOM/ordens, orçamento de projecto, contagens de stock, contratos ([#101](https://github.com/fxavier/gespro-frontend/issues/101)) | vários |
| B | `StatusBadge`: `FECHADA` mapeada para «Acesso Fechado» (colide em caixa, vaga, qualidade); estados sem etiqueta (`ACTIVO`, `FERIAS`, `AFASTADO`, `EM_PRODUCAO`, `SUBSTITUIDO`, `PREFERENCIAL`, `TRANSFERENCIA_*`) ([#102](https://github.com/fxavier/gespro-frontend/issues/102)) ([#103](https://github.com/fxavier/gespro-frontend/issues/103)) | `patterns/status-badge.tsx` |
| B | KPIs calculados sobre `take: 1`/`take: 100` em vez de `count` (dashboards de inventário, stock, colaboradores, core-tenancy, contabilidade) ([#104](https://github.com/fxavier/gespro-frontend/issues/104)) | vários `page.tsx` |
| B | Filtros com valores que não existem no enum ou pesquisa (`q`) ignorada pela página — projectos, produção, transporte, tickets, movimentações ([#105](https://github.com/fxavier/gespro-frontend/issues/105)) ([#106](https://github.com/fxavier/gespro-frontend/issues/106)) | vários |
| B | Mensagens com jargão interno («neste tenant», «Transição inválida de RequisicaoCompra») ([#107](https://github.com/fxavier/gespro-frontend/issues/107)) | serviços |
| B | Barra lateral marca dois itens activos (o «Dashboard» do grupo por prefixo e o ecrã actual) ([#203](https://github.com/fxavier/gespro-frontend/issues/203)) | `AppSidebar.tsx` (`isActive`) |

## Compras e fornecedores

| G | Lacuna |
|---|---|
| M | Circuito pára em Rascunho: sem UI para aprovar/rejeitar requisição, configurar circuitos, enviar/adjudicar cotação, converter em pedido, confirmar/enviar pedido, registar recepção, criar conta a pagar manual. Sem pedido confirmado, a recepção (e a conta a pagar automática) é inalcançável ([#108](https://github.com/fxavier/gespro-frontend/issues/108)) ([#109](https://github.com/fxavier/gespro-frontend/issues/109)) ([#110](https://github.com/fxavier/gespro-frontend/issues/110)) ([#111](https://github.com/fxavier/gespro-frontend/issues/111)) |
| M | Bug do interceptor `@panel/(.)[id]` que captura `novo` continua (`/compras/requisicoes/novo`) ([#112](https://github.com/fxavier/gespro-frontend/issues/112)) |
| A | «Vencida» nunca atribuída (`actualizarVencidas` só em testes); indicador «A pagar» ignora parcialmente pagas ([#79](https://github.com/fxavier/gespro-frontend/issues/79)) |
| M | FINANCEIRO não pode registar pagamentos a fornecedores (`compras:pagamento:registar`) ([#113](https://github.com/fxavier/gespro-frontend/issues/113)) |
| B | Rotas inexistentes: `/compras/cotacoes/[id]`, `/compras/pedidos/[id]`, `/servicos/*/[id]`, `/servicos/lista/[id]/editar`; arquivar fornecedor irreversível apesar do texto ([#114](https://github.com/fxavier/gespro-frontend/issues/114)) ([#115](https://github.com/fxavier/gespro-frontend/issues/115)) |
| B | Valores do formulário ignorados pelo servidor ([#116](https://github.com/fxavier/gespro-frontend/issues/116)) |

## Inventário e activos

| G | Lacuna |
|---|---|
| A | Nenhum ecrã mostra saldo de stock por produto (`listarSaldos` sem consumidor) ([#80](https://github.com/fxavier/gespro-frontend/issues/80)) |
| A | Contagem: justificar item já contado não impede o ajuste; limiar fixo de 5% sem aprovação bloqueia a reconciliação (`DISCREPANCIA_SEM_APROVACAO`) ([#81](https://github.com/fxavier/gespro-frontend/issues/81)) |
| M | Inventário Físico (activos) só cria e consulta — sem contagem/transições; sem UI de movimentação de activos nem de amortização mensal ([#117](https://github.com/fxavier/gespro-frontend/issues/117)) ([#118](https://github.com/fxavier/gespro-frontend/issues/118)) |
| M | Não há ecrã de categorias de produto, mas a categoria é obrigatória no produto ([#119](https://github.com/fxavier/gespro-frontend/issues/119)) |
| B | `/inventario/transferencias` filtra `TRANSFERENCIA` (tipos reais `TRANSFERENCIA_ENTRADA/SAIDA`) → sempre vazia; filtro/pesquisa de movimentações ignorados; dois botões «Concluir» na manutenção; links 404 de edição de localização e inventário físico ([#120](https://github.com/fxavier/gespro-frontend/issues/120)) ([#121](https://github.com/fxavier/gespro-frontend/issues/121)) ([#122](https://github.com/fxavier/gespro-frontend/issues/122)) ([#123](https://github.com/fxavier/gespro-frontend/issues/123)) |
| B | OPERADOR recebe `inventario:admin` (por `startsWith`) e GESTOR não; OPERADOR sem `ativos:write` ([#124](https://github.com/fxavier/gespro-frontend/issues/124)) |
| B | Produto: IVA com placeholder 0.17 mas validação só aceita 0 ou 0.16; variantes sem UI ([#125](https://github.com/fxavier/gespro-frontend/issues/125)) |
| B | `/stock/reposicao` mostra ids truncados em vez de nomes ([#126](https://github.com/fxavier/gespro-frontend/issues/126)) |

## Vendas e POS

| G | Lacuna |
|---|---|
| A | Sessão POS impossível de fechar: vendas POS ficam `PENDENTE` e o fecho recusa-se ([#82](https://github.com/fxavier/gespro-frontend/issues/82)) |
| A | Todos os métodos de pagamento (M-Pesa, cartão, transferência) entram no caixa como dinheiro ([#83](https://github.com/fxavier/gespro-frontend/issues/83)) |
| A | Cancelar venda POS não repõe stock nem retira do caixa ([#84](https://github.com/fxavier/gespro-frontend/issues/84)) |
| A | Nota de débito sem natureza: `emitirNotaDebito` não grava natureza e credita sempre 711; `resolverContaNaturezaNotaDebito` sem chamador (nó `contabilizacao` do ADR-0039 por fazer) ([#85](https://github.com/fxavier/gespro-frontend/issues/85)) |
| A | Nota de crédito sem limite face ao valor da factura ([#86](https://github.com/fxavier/gespro-frontend/issues/86)) |
| M | POS sem recibo/talão, um só método de pagamento, 60 primeiros produtos, sem validação do valor recebido ([#127](https://github.com/fxavier/gespro-frontend/issues/127)) ([#128](https://github.com/fxavier/gespro-frontend/issues/128)) |
| M | Encomendas, devoluções, trocas e comissões sem UI de transição; «Submeter» venda em Rascunho falha sempre ([#129](https://github.com/fxavier/gespro-frontend/issues/129)) ([#130](https://github.com/fxavier/gespro-frontend/issues/130)) ([#131](https://github.com/fxavier/gespro-frontend/issues/131)) ([#132](https://github.com/fxavier/gespro-frontend/issues/132)) |
| M | «Baixar PDF» da factura inerte; `/api/faturacao/[id]/pdf` só por URL (e pede `faturacao:ver` em vez de `faturacao:leitura`) ([#133](https://github.com/fxavier/gespro-frontend/issues/133)) |
| B | Histórico de clientes só escrito pelo seed; comissões filtradas pelo id errado no perfil do vendedor ([#134](https://github.com/fxavier/gespro-frontend/issues/134)) ([#135](https://github.com/fxavier/gespro-frontend/issues/135)) |
| B | Motivo da desactivação de cliente não é enviado ([#136](https://github.com/fxavier/gespro-frontend/issues/136)) |

## Contabilidade, IVA e reconciliação

| G | Lacuna |
|---|---|
| A | Novo Lançamento só carrega as primeiras 200 contas de movimento (até 493): classes 5–8 inescolhíveis ([#87](https://github.com/fxavier/gespro-frontend/issues/87)) |
| A | Fim de intervalo `aaaa-mm-dd` à meia-noite UTC exclui o último dia (balancete, razão, DRE) ([#88](https://github.com/fxavier/gespro-frontend/issues/88)) |
| A | Estornar apuramento de IVA em duas transacções: com período fechado fica ESTORNADO com o lançamento activo ([#89](https://github.com/fxavier/gespro-frontend/issues/89)) |
| A | `converterProformaEmFatura` emite sem lançamento → `DOCUMENTO_SEM_LANCAMENTO` bloqueia IVA e fecho, e o utilizador não consegue resolver ([#90](https://github.com/fxavier/gespro-frontend/issues/90)) |
| M | Rascunhos de lançamento sem editar nem eliminar ([#137](https://github.com/fxavier/gespro-frontend/issues/137)) |
| M | Encerramento do exercício (ADR-0035) não implementado; período 13 sem lançamentos mas exige apuramento ([#138](https://github.com/fxavier/gespro-frontend/issues/138)) |
| M | Sem ecrã para conta por natureza de ND, regras de sugestão da reconciliação e tolerâncias da conta bancária ([#139](https://github.com/fxavier/gespro-frontend/issues/139)) ([#140](https://github.com/fxavier/gespro-frontend/issues/140)) |
| B | Balancete: «Saldo Anterior» sempre 0, «Incluir zeradas» e pesquisa sem efeito; etiquetas de classes 2–4 erradas no formulário de conta; GESTOR abre exercício e FINANCEIRO não ([#141](https://github.com/fxavier/gespro-frontend/issues/141)) ([#142](https://github.com/fxavier/gespro-frontend/issues/142)) ([#143](https://github.com/fxavier/gespro-frontend/issues/143)) |
| B | Mensagens de recusa sugerem acções que não resolvem ([#144](https://github.com/fxavier/gespro-frontend/issues/144)) |
| B | DRE, Centros de Custo e Contas Bancárias fora do menu lateral ([#145](https://github.com/fxavier/gespro-frontend/issues/145)) |

## Faturação, caixa e tesouraria

| G | Lacuna |
|---|---|
| A | Fecho de caixa conta o fundo inicial duas vezes (movimento ABERTURA + `fundoInicial`) — diferença gravada errada ([#91](https://github.com/fxavier/gespro-frontend/issues/91)) |
| A | `SessaoCaixa.totalEntradas` só escrito no fecho → tesouraria subestima sessões abertas (o golden do seed esconde-o) ([#92](https://github.com/fxavier/gespro-frontend/issues/92)) |
| A | Série escolhida ignorada na numeração (numera pela série do ano da data) ([#93](https://github.com/fxavier/gespro-frontend/issues/93)) |
| M | Sem UI para sangria, reforço, cancelar sessão, pagamento/vencimento de factura, liquidar/cancelar NC, séries ([#146](https://github.com/fxavier/gespro-frontend/issues/146)) ([#147](https://github.com/fxavier/gespro-frontend/issues/147)) ([#148](https://github.com/fxavier/gespro-frontend/issues/148)) ([#149](https://github.com/fxavier/gespro-frontend/issues/149)) |
| B | `/caixa/fechamento` ignora `?sessaoId=`; falta MT 500/1000 na contagem; links para `/faturacao/nota-credito/[id]` inexistentes; DFC sem UI ([#150](https://github.com/fxavier/gespro-frontend/issues/150)) ([#151](https://github.com/fxavier/gespro-frontend/issues/151)) ([#152](https://github.com/fxavier/gespro-frontend/issues/152)) ([#153](https://github.com/fxavier/gespro-frontend/issues/153)) |
| B | Menu da lista de cotações mostra «Converter» e «Rejeitar» em qualquer estado ([#154](https://github.com/fxavier/gespro-frontend/issues/154)) |

## Recursos humanos

| G | Lacuna |
|---|---|
| A | Ausências nunca aprovadas (sem action/botão) → payroll nunca desconta faltas ([#94](https://github.com/fxavier/gespro-frontend/issues/94)) |
| A | Benefícios não entram na folha (`linhasPayrollDeBeneficios` sem chamador) ([#95](https://github.com/fxavier/gespro-frontend/issues/95)) |
| A | «Marcar como paga» sem sessão de caixa: sempre contra 121 com data de hoje ([#96](https://github.com/fxavier/gespro-frontend/issues/96)) |
| A | Mapa INSS com taxas fixas no cabeçalho do CSV (contra tabelas por vigência) ([#97](https://github.com/fxavier/gespro-frontend/issues/97)) |
| M | Criar avaliação provavelmente falha (`avaliadorId` = User, FK aponta a Colaborador) ([#155](https://github.com/fxavier/gespro-frontend/issues/155)) |
| M | Férias sem aprovação na UI; recrutamento «Marcar como Contratado» impede «Admitir como Colaborador» ([#156](https://github.com/fxavier/gespro-frontend/issues/156)) ([#157](https://github.com/fxavier/gespro-frontend/issues/157)) |
| M | Sem ecrã para tabelas INSS/IRPS, recalcular payroll ou ajustes manuais ([#158](https://github.com/fxavier/gespro-frontend/issues/158)) ([#159](https://github.com/fxavier/gespro-frontend/issues/159)) |
| B | NUIT/BI/email duplicados → «Erro interno»; formulário de colaborador sem subsídios/departamento/cargo ([#160](https://github.com/fxavier/gespro-frontend/issues/160)) ([#161](https://github.com/fxavier/gespro-frontend/issues/161)) |
| B | «Editar» dá 404; sem suspender/terminar atribuições ([#162](https://github.com/fxavier/gespro-frontend/issues/162)) |
| B | /rh/documentos promete upload na ficha do colaborador, que não existe ([#163](https://github.com/fxavier/gespro-frontend/issues/163)) |

## Projectos, produção, transporte, suporte

| G | Lacuna |
|---|---|
| M | Produção: sem transições de ordem, consumo, entrada de produto acabado, activar BOM/roteiro, centros de trabalho; `qualidadeAprovada` sem escritor → nenhuma ordem pode concluir ([#164](https://github.com/fxavier/gespro-frontend/issues/164)) ([#165](https://github.com/fxavier/gespro-frontend/issues/165)) ([#166](https://github.com/fxavier/gespro-frontend/issues/166)) |
| M | Projectos: sem transição de estado, criar/editar tarefas, aprovar timesheets, marcos; configurações gravadas que ninguém lê ([#167](https://github.com/fxavier/gespro-frontend/issues/167)) ([#168](https://github.com/fxavier/gespro-frontend/issues/168)) |
| M | Tickets: sem atribuir agente, comentar, avaliar; ABERTO → EM_PROGRESSO exige agente (inalcançável) ([#169](https://github.com/fxavier/gespro-frontend/issues/169)) |
| B | Rotas 404 em detalhes de tarefas, ordens, BOM, roteiros; entregas e documentos de transporte sem ligação no menu; código de projecto duplicado → «Erro interno» ([#170](https://github.com/fxavier/gespro-frontend/issues/170)) ([#171](https://github.com/fxavier/gespro-frontend/issues/171)) ([#172](https://github.com/fxavier/gespro-frontend/issues/172)) |
| B | «Cancelar» em RESOLVIDO; «SLA em atraso» só actualiza na transição; KPI «Em Progresso» sempre 0 ([#173](https://github.com/fxavier/gespro-frontend/issues/173)) |
| B | Iniciar rota/actividade não muda estado da viatura; estado do motorista não editável; documento novo sempre VALIDO até ao cron ([#174](https://github.com/fxavier/gespro-frontend/issues/174)) |
| B | /projetos/documentos guarda só no browser ([#175](https://github.com/fxavier/gespro-frontend/issues/175)) |

## Plataforma e subscrição

| G | Lacuna |
|---|---|
| A | Limites do plano (utilizadores, armazéns) anunciados mas não aplicados — contraria ADR-0027 §2 ([#98](https://github.com/fxavier/gespro-frontend/issues/98)) |
| A | Tenant FECHADO não tem saída pelo produto (ninguém entra; a mensagem manda regularizar nas definições) ([#99](https://github.com/fxavier/gespro-frontend/issues/99)) |
| M | Sem ecrã para mudar papéis de utilizador existente, dados da empresa ou configuração fiscal; sem recuperação de palavra-passe self-service ([#176](https://github.com/fxavier/gespro-frontend/issues/176)) ([#177](https://github.com/fxavier/gespro-frontend/issues/177)) ([#178](https://github.com/fxavier/gespro-frontend/issues/178)) |
| M | Desactivar utilizador grava `deletedAt` (irreversível), contra o texto da confirmação; «Cancelar subscrição» disponível em LEITURA/FECHADA e texto desactualizado ([#179](https://github.com/fxavier/gespro-frontend/issues/179)) ([#180](https://github.com/fxavier/gespro-frontend/issues/180)) |
| B | GESTOR com `admin:gerir_roles` pode criar papéis com permissões que não tem; caixa de pesquisa do cabeçalho não abre a paleta; item «Configurações» → `/configuracoes` inexistente ([#181](https://github.com/fxavier/gespro-frontend/issues/181)) ([#182](https://github.com/fxavier/gespro-frontend/issues/182)) |
| B | «Exportar Relatório» sem acção; pesquisa e paginação de notificações ausentes ([#183](https://github.com/fxavier/gespro-frontend/issues/183)) |
| B | Em modo Leitura não se marcam notificações como lidas nem se mudam preferências ([#184](https://github.com/fxavier/gespro-frontend/issues/184)) |
| B | Utilizador convidado que entra antes de concluir o convite vai para «Palavra-passe provisória» ([#185](https://github.com/fxavier/gespro-frontend/issues/185)) |
| B | Lista de papéis sem linhas clicáveis (ficha `/core-tenancy/roles/[id]` órfã); datas com `toLocaleDateString` ([#202](https://github.com/fxavier/gespro-frontend/issues/202)) |

## API e operação

Detalhe em [API §6](05-api.md).

| G | Lacuna |
|---|---|
| B | Três crons sem `withApi`; `transporte-alertas` usa console.log ([#186](https://github.com/fxavier/gespro-frontend/issues/186)) |
| B | `withApi` não devolve `traceId` no corpo do 500 (CLAUDE.md diz que sim) ([#187](https://github.com/fxavier/gespro-frontend/issues/187)) |
| B | `withApi` sem validação Zod; `/api/audit` com `take=abc` dá 500 ([#188](https://github.com/fxavier/gespro-frontend/issues/188)) |
| B | Envelope `{ data }` inconsistente (presign, metrics, registo) ([#189](https://github.com/fxavier/gespro-frontend/issues/189)) |
| M | /api/ready e /api/metrics expõem a mensagem crua do erro sem autenticação ([#190](https://github.com/fxavier/gespro-frontend/issues/190)) |
| M | /api/metrics aberto quando `METRICS_SECRET` não está definido ([#191](https://github.com/fxavier/gespro-frontend/issues/191)) |
| B | agendador.md desalinhado: cron em `PUBLIC_PATHS`, «quatro rotas», horários ([#192](https://github.com/fxavier/gespro-frontend/issues/192)) |
| B | Download exige permissão de escrita; `colaborador` tem upload sem download ([#193](https://github.com/fxavier/gespro-frontend/issues/193)) |
| M | PUT /api/documentos/local/* não verifica a permissão do recurso ([#194](https://github.com/fxavier/gespro-frontend/issues/194)) |
| M | presign valida `recursoId` com `.cuid()` e o tamanho não é imposto pela assinatura ([#195](https://github.com/fxavier/gespro-frontend/issues/195)) |
| M | Exportações, PDF e mapas de IVA sem limitador; comentários de limites errados ([#196](https://github.com/fxavier/gespro-frontend/issues/196)) |
| B | Preflight de /api/publico/planos anuncia métodos e credenciais diferentes do GET ([#197](https://github.com/fxavier/gespro-frontend/issues/197)) |
| M | transporte-alertas processa tenants apagados e com assinatura FECHADA ([#198](https://github.com/fxavier/gespro-frontend/issues/198)) |
| B | Mapa de declaração descarta resumo/avisos e usa o id no nome do ficheiro; `antiguidade` exige apuramento ([#199](https://github.com/fxavier/gespro-frontend/issues/199)) |
| B | Recibo formata data com `toLocaleDateString` no servidor e não envia `no-store` ([#200](https://github.com/fxavier/gespro-frontend/issues/200)) |
| B | Grafia `motoistasActualizados` na resposta de transporte-alertas ([#201](https://github.com/fxavier/gespro-frontend/issues/201)) |
