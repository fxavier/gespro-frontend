import type { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Catálogo COMPLETO de permissões — formato `modulo:accao` (e sub-acção).
// União das permissões grosseiras (Wave 0-beta) com as 169 finas usadas
// nas Server Actions dos 7 domínios (Wave 2). Descrições em pt-PT.
// ---------------------------------------------------------------------------
export const PERMISSIONS: { code: string; descricao: string }[] = [
  // ── Faturação ─────────────────────────────────────────────────────────────
  { code: 'faturacao:ver',               descricao: 'Consultar facturas e documentos de venda' },
  { code: 'faturacao:criar',             descricao: 'Criar facturas (genérico)' },
  { code: 'faturacao:editar',            descricao: 'Editar rascunhos de facturas' },
  { code: 'faturacao:anular',            descricao: 'Anular facturas emitidas' },
  { code: 'faturacao:aprovar',           descricao: 'Aprovar facturas para emissão' },
  { code: 'faturacao:exportar',          descricao: 'Exportar facturas (PDF/XML)' },
  { code: 'faturacao:leitura',           descricao: 'Leitura geral do módulo de faturação' },
  { code: 'faturacao:fatura:emitir',     descricao: 'Emitir factura definitiva' },
  { code: 'faturacao:fatura:gerir',      descricao: 'Gerir facturas (anular, arquivar)' },
  { code: 'faturacao:fatura:pagar',      descricao: 'Registar pagamento de factura' },
  { code: 'faturacao:cotacao:criar',     descricao: 'Criar cotação comercial' },
  { code: 'faturacao:cotacao:gerir',     descricao: 'Gerir cotações (editar, anular)' },
  { code: 'faturacao:cotacao:converter', descricao: 'Converter cotação em factura' },
  { code: 'faturacao:proforma:criar',    descricao: 'Criar factura proforma' },
  { code: 'faturacao:proforma:gerir',    descricao: 'Gerir proformas (editar, anular)' },
  { code: 'faturacao:proforma:converter', descricao: 'Converter proforma em factura' },
  { code: 'faturacao:proforma:cancelar', descricao: 'Cancelar factura proforma' },
  { code: 'faturacao:nc:emitir',         descricao: 'Emitir nota de crédito' },
  { code: 'faturacao:nc:cancelar',       descricao: 'Cancelar nota de crédito' },
  { code: 'faturacao:nc:liquidar',       descricao: 'Liquidar nota de crédito' },
  { code: 'faturacao:nd:emitir',         descricao: 'Emitir nota de débito' },
  { code: 'faturacao:nd:cancelar',       descricao: 'Cancelar nota de débito' },
  { code: 'faturacao:nd:liquidar',       descricao: 'Liquidar nota de débito' },
  { code: 'faturacao:series:escrita',    descricao: 'Configurar séries de faturação' },

  // ── Compras / Procurement ─────────────────────────────────────────────────
  { code: 'compras:ver',                   descricao: 'Consultar ordens e requisições de compra' },
  { code: 'compras:criar',                 descricao: 'Criar documentos de compra (genérico)' },
  { code: 'compras:editar',                descricao: 'Editar documentos em rascunho' },
  { code: 'compras:aprovar',               descricao: 'Aprovar requisições e ordens de compra' },
  { code: 'compras:receber',               descricao: 'Registar recepção de mercadorias' },
  { code: 'compras:anular',                descricao: 'Anular ordens de compra' },
  { code: 'compras:configurar',            descricao: 'Configurar parâmetros do módulo de compras' },
  { code: 'compras:requisicao:criar',      descricao: 'Criar requisição de compra' },
  { code: 'compras:requisicao:editar',     descricao: 'Editar requisição em rascunho' },
  { code: 'compras:requisicao:submeter',   descricao: 'Submeter requisição para aprovação' },
  { code: 'compras:requisicao:cancelar',   descricao: 'Cancelar requisição de compra' },
  { code: 'compras:aprovacao:decidir',     descricao: 'Decidir (aprovar/rejeitar) requisições' },
  { code: 'compras:pedido:criar',          descricao: 'Criar pedido/ordem de compra' },
  { code: 'compras:pedido:editar',         descricao: 'Editar pedido de compra' },
  { code: 'compras:pedido:enviar',         descricao: 'Enviar pedido de compra ao fornecedor' },
  { code: 'compras:pedido:cancelar',       descricao: 'Cancelar pedido de compra' },
  { code: 'compras:cotacao:criar',         descricao: 'Criar consulta ao mercado (cotação)' },
  { code: 'compras:cotacao:enviar',        descricao: 'Enviar pedido de cotação a fornecedores' },
  { code: 'compras:cotacao:resposta',      descricao: 'Registar resposta de fornecedor' },
  { code: 'compras:cotacao:adjudicar',     descricao: 'Adjudicar cotação vencedora' },
  { code: 'compras:cotacao:cancelar',      descricao: 'Cancelar processo de cotação' },
  { code: 'compras:recebimento:registar',  descricao: 'Registar recebimento físico de mercadorias' },
  { code: 'compras:pagamento:registar',    descricao: 'Registar pagamento a fornecedor' },
  { code: 'compras:conta-pagar:criar',     descricao: 'Criar conta a pagar' },
  { code: 'compras:conta-pagar:cancelar',  descricao: 'Cancelar conta a pagar' },

  // ── Inventário / Stock ────────────────────────────────────────────────────
  { code: 'inventario:ver',        descricao: 'Consultar inventário e movimentos de stock' },
  { code: 'inventario:movimentar', descricao: 'Registar entradas, saídas e transferências' },
  { code: 'inventario:ajustar',    descricao: 'Efectuar ajustes de inventário' },
  { code: 'inventario:configurar', descricao: 'Configurar armazéns e categorias' },
  { code: 'inventario:exportar',   descricao: 'Exportar relatórios de inventário' },
  { code: 'inventario:write',      descricao: 'Escrita geral no módulo de inventário' },
  { code: 'inventario:admin',      descricao: 'Administração total do inventário' },

  // ── Contagem de Stock (Spec 05) ───────────────────────────────────────────
  { code: 'inventario:contagens:ver',         descricao: 'Consultar contagens de stock' },
  { code: 'inventario:contagens:abrir',       descricao: 'Abrir nova contagem de stock' },
  { code: 'inventario:contagens:registar',    descricao: 'Registar contagem de itens' },
  { code: 'inventario:contagens:justificar',  descricao: 'Justificar discrepâncias de contagem' },
  { code: 'inventario:contagens:reconciliar', descricao: 'Reconciliar contagem (gera ajustes de stock)' },
  { code: 'inventario:contagens:concluir',    descricao: 'Concluir contagem de stock' },
  { code: 'inventario:contagens:cancelar',    descricao: 'Cancelar contagem de stock' },

  // ── Financeiro / Contabilidade ────────────────────────────────────────────
  { code: 'financas:ver',                   descricao: 'Consultar lançamentos e relatórios' },
  { code: 'financas:lancar',                descricao: 'Efectuar lançamentos contabilísticos' },
  { code: 'financas:fechar_periodo',        descricao: 'Fechar período contabilístico' },
  { code: 'financas:fechar_caixa',          descricao: 'Fechar caixa diário' },
  { code: 'financas:conciliar',             descricao: 'Conciliar extractos bancários' },
  { code: 'financas:exportar',              descricao: 'Exportar relatórios financeiros' },
  { code: 'financas:configurar',            descricao: 'Configurar plano de contas' },
  { code: 'financas:leitura',               descricao: 'Leitura geral do módulo financeiro' },
  { code: 'financas:lancamentos:escrita',   descricao: 'Criar e editar lançamentos contabilísticos' },
  { code: 'financas:lancamentos:confirmar', descricao: 'Confirmar lançamentos pendentes' },
  { code: 'financas:lancamentos:estornar',  descricao: 'Estornar lançamentos confirmados' },
  { code: 'financas:diarios:escrita',       descricao: 'Criar e editar diários contabilísticos' },
  { code: 'financas:banca:escrita',         descricao: 'Registar movimentos bancários' },
  { code: 'financas:banca:reconciliacao',   descricao: 'Reconciliar extractos bancários' },
  { code: 'financas:banca:contas:escrita',  descricao: 'Criar e editar contas bancárias' },
  { code: 'financas:banca:contas:leitura',  descricao: 'Consultar contas bancárias' },
  { code: 'financas:centros-custo:escrita', descricao: 'Criar e editar centros de custo' },
  { code: 'financas:plano-contas:escrita',  descricao: 'Criar e editar contas no plano de contas' },
  { code: 'financas:relatorios:leitura',    descricao: 'Consultar relatórios financeiros' },

  // ── Caixa / PDV ───────────────────────────────────────────────────────────
  { code: 'caixa:ver',             descricao: 'Consultar movimentos de caixa' },
  { code: 'caixa:operar',          descricao: 'Operar ponto de venda (PDV/POS)' },
  { code: 'caixa:abrir',           descricao: 'Abrir sessão de caixa' },
  { code: 'caixa:fechar',          descricao: 'Fechar sessão de caixa' },
  { code: 'caixa:anular_transacao', descricao: 'Anular transacção de caixa' },
  { code: 'caixa:leitura',         descricao: 'Leitura geral do módulo de caixa' },
  { code: 'caixa:abertura',        descricao: 'Registar abertura de caixa com fundo' },
  { code: 'caixa:fecho',           descricao: 'Registar fecho de caixa com conferência' },
  { code: 'caixa:reforco',         descricao: 'Registar reforço de caixa' },
  { code: 'caixa:sangria',         descricao: 'Registar sangria de caixa' },
  { code: 'caixa:cancelar',        descricao: 'Cancelar transacção de caixa' },

  // ── POS ───────────────────────────────────────────────────────────────────
  { code: 'pos:operar',            descricao: 'Operar terminal POS' },

  // ── Vendas / Comercial ────────────────────────────────────────────────────
  { code: 'vendas:ver',            descricao: 'Consultar pipeline de vendas' },
  { code: 'vendas:criar',          descricao: 'Criar oportunidade ou proposta de venda' },
  { code: 'vendas:editar',         descricao: 'Editar oportunidade ou proposta' },
  { code: 'vendas:fechar',         descricao: 'Fechar negócio / converter para factura' },
  { code: 'vendas:cancelar',       descricao: 'Cancelar venda ou proposta' },

  // ── Clientes ──────────────────────────────────────────────────────────────
  { code: 'clientes:ver',          descricao: 'Consultar ficha de clientes' },
  { code: 'clientes:criar',        descricao: 'Criar clientes' },
  { code: 'clientes:editar',       descricao: 'Editar dados de clientes' },
  { code: 'clientes:eliminar',     descricao: 'Arquivar (soft delete) clientes' },
  { code: 'clientes:desativar',    descricao: 'Desactivar cliente' },

  // ── Fornecedores ──────────────────────────────────────────────────────────
  { code: 'fornecedores:ver',      descricao: 'Consultar ficha de fornecedores' },
  { code: 'fornecedores:criar',    descricao: 'Criar fornecedores' },
  { code: 'fornecedores:editar',   descricao: 'Editar dados de fornecedores' },
  { code: 'fornecedores:eliminar', descricao: 'Arquivar (soft delete) fornecedores' },
  { code: 'fornecedores:arquivar', descricao: 'Arquivar fornecedor inactivo' },
  { code: 'fornecedores:avaliar',  descricao: 'Avaliar desempenho de fornecedor' },

  // ── Produtos ──────────────────────────────────────────────────────────────
  { code: 'produtos:ver',          descricao: 'Consultar catálogo de produtos e serviços' },
  { code: 'produtos:criar',        descricao: 'Criar produtos e serviços' },
  { code: 'produtos:editar',       descricao: 'Editar produtos e preços' },
  { code: 'produtos:eliminar',     descricao: 'Arquivar produtos' },
  { code: 'produtos:write',        descricao: 'Escrita geral no catálogo de produtos' },

  // ── Ativos Fixos ──────────────────────────────────────────────────────────
  { code: 'ativos:read',           descricao: 'Consultar registo de activos fixos' },
  { code: 'ativos:write',          descricao: 'Criar e editar activos fixos' },
  { code: 'ativos:admin',          descricao: 'Administração total de activos fixos' },

  // ── Comissões ─────────────────────────────────────────────────────────────
  { code: 'comissoes:gerir',       descricao: 'Gerir regras e cálculos de comissões' },
  { code: 'comissoes:pagar',       descricao: 'Registar pagamento de comissões' },

  // ── RH / Pessoas ──────────────────────────────────────────────────────────
  { code: 'rh:ver',                   descricao: 'Consultar dados gerais de colaboradores' },
  { code: 'rh:criar',                 descricao: 'Admitir colaboradores' },
  { code: 'rh:editar',                descricao: 'Editar dados de colaboradores' },
  { code: 'rh:aprovar_ferias',        descricao: 'Aprovar pedidos de férias e ausências' },
  { code: 'rh:processar_salarios',    descricao: 'Processar folha salarial' },
  { code: 'rh:ver_salarios',          descricao: 'Consultar valores salariais' },
  { code: 'rh:colaboradores:read',    descricao: 'Consultar ficha de colaboradores' },
  { code: 'rh:colaboradores:create',  descricao: 'Admitir novo colaborador' },
  { code: 'rh:colaboradores:update',  descricao: 'Actualizar dados de colaborador' },
  { code: 'rh:colaboradores:delete',  descricao: 'Desactivar/remover colaborador' },
  { code: 'rh:ferias:solicitar',      descricao: 'Solicitar férias (self-service)' },
  { code: 'rh:ferias:create',         descricao: 'Criar marcação de férias' },
  { code: 'rh:ferias:aprovar',        descricao: 'Aprovar pedido de férias' },
  { code: 'rh:ausencias:create',      descricao: 'Registar ausência de colaborador' },
  { code: 'rh:assiduidade:read',      descricao: 'Consultar registos de assiduidade' },
  { code: 'rh:assiduidade:create',    descricao: 'Registar ponto/assiduidade' },
  { code: 'rh:avaliacoes:create',     descricao: 'Criar avaliação de desempenho' },
  { code: 'rh:avaliacoes:update',     descricao: 'Actualizar avaliação de desempenho' },
  { code: 'rh:formacoes:create',      descricao: 'Criar acção de formação' },
  { code: 'rh:formacoes:update',      descricao: 'Actualizar acção de formação' },
  // Payroll — Spec 06 (aditivo)
  { code: 'rh:payroll:read',          descricao: 'Consultar folhas salariais e recibos' },
  { code: 'rh:payroll:processar',     descricao: 'Processar/recalcular folha salarial mensal' },
  { code: 'rh:payroll:pagar',         descricao: 'Marcar folha salarial como paga' },
  { code: 'rh:payroll:cancelar',      descricao: 'Cancelar folha salarial (com estorno)' },
  { code: 'rh:payroll:tabelas',       descricao: 'Gerir tabelas INSS/IRPS (vigências)' },

  // ── Recrutamento (Spec 07) ────────────────────────────────────────────────
  { code: 'rh:recrutamento:read',                  descricao: 'Consultar vagas e candidaturas' },
  { code: 'rh:recrutamento:vagas:create',          descricao: 'Criar vaga de recrutamento' },
  { code: 'rh:recrutamento:vagas:update',          descricao: 'Actualizar/transitar estado de vaga' },
  { code: 'rh:recrutamento:candidatos:create',     descricao: 'Registar novo candidato' },
  { code: 'rh:recrutamento:candidatos:update',     descricao: 'Actualizar dados de candidato' },
  { code: 'rh:recrutamento:candidaturas:create',   descricao: 'Submeter candidatura a vaga' },
  { code: 'rh:recrutamento:candidaturas:update',   descricao: 'Mover candidatura no pipeline (etapa/kanban)' },
  { code: 'rh:recrutamento:entrevistas:create',    descricao: 'Registar entrevista de candidatura' },
  { code: 'rh:recrutamento:admitir',               descricao: 'Admitir candidato como Colaborador' },

  // ── Produção ──────────────────────────────────────────────────────────────
  { code: 'producao:ver',             descricao: 'Consultar ordens de produção' },
  { code: 'producao:criar',           descricao: 'Criar ordens de produção' },
  { code: 'producao:iniciar',         descricao: 'Iniciar produção' },
  { code: 'producao:concluir',        descricao: 'Concluir ordens de produção' },
  { code: 'producao:anular',          descricao: 'Anular ordens de produção' },
  { code: 'producao:ordens:read',     descricao: 'Consultar ordens de produção' },
  { code: 'producao:ordens:create',   descricao: 'Criar ordem de produção' },
  { code: 'producao:ordens:update',   descricao: 'Actualizar ordem de produção' },
  { code: 'producao:bom:read',        descricao: 'Consultar estruturas de produto (BOM)' },
  { code: 'producao:bom:create',      descricao: 'Criar estrutura de produto (BOM)' },
  { code: 'producao:bom:update',      descricao: 'Actualizar estrutura de produto (BOM)' },
  { code: 'producao:roteiros:read',   descricao: 'Consultar roteiros de produção' },
  { code: 'producao:roteiros:create', descricao: 'Criar roteiro de produção' },
  { code: 'producao:roteiros:update', descricao: 'Actualizar roteiro de produção' },
  { code: 'producao:centros:create',  descricao: 'Criar centro de trabalho' },
  { code: 'producao:centros:update',  descricao: 'Actualizar centro de trabalho' },

  // ── Projetos ──────────────────────────────────────────────────────────────
  { code: 'projetos:ver',               descricao: 'Consultar projectos e tarefas' },
  { code: 'projetos:criar',             descricao: 'Criar projectos' },
  { code: 'projetos:editar',            descricao: 'Editar projectos e tarefas' },
  { code: 'projetos:fechar',            descricao: 'Fechar projectos' },
  { code: 'projetos:alocar_recursos',   descricao: 'Alocar recursos a projectos' },
  { code: 'projetos:read',              descricao: 'Consultar projectos (leitura)' },
  { code: 'projetos:create',            descricao: 'Criar projectos' },
  { code: 'projetos:update',            descricao: 'Actualizar projectos' },
  { code: 'projetos:tarefas:read',      descricao: 'Consultar tarefas de projecto' },
  { code: 'projetos:tarefas:create',    descricao: 'Criar tarefa de projecto' },
  { code: 'projetos:tarefas:update',    descricao: 'Actualizar tarefa de projecto' },
  { code: 'projetos:equipas:create',    descricao: 'Criar equipa de projecto' },
  { code: 'projetos:equipas:update',    descricao: 'Actualizar equipa de projecto' },
  { code: 'projetos:marcos:create',     descricao: 'Criar marco de projecto' },
  { code: 'projetos:marcos:update',     descricao: 'Actualizar marco de projecto' },
  { code: 'projetos:orcamentos:create', descricao: 'Criar orçamento de projecto' },
  { code: 'projetos:orcamentos:update', descricao: 'Actualizar orçamento de projecto' },
  { code: 'projetos:timesheets:read',   descricao: 'Consultar timesheets' },
  { code: 'projetos:timesheets:create', descricao: 'Registar horas (timesheet)' },
  { code: 'projetos:timesheets:aprovar', descricao: 'Aprovar timesheets de equipa' },

  // ── Transporte / Logística ────────────────────────────────────────────────
  { code: 'transporte:ver',                  descricao: 'Consultar guias e rotas de transporte' },
  { code: 'transporte:criar',                descricao: 'Criar guias de transporte' },
  { code: 'transporte:expedir',              descricao: 'Expedir carga' },
  { code: 'transporte:receber',              descricao: 'Confirmar recepção de carga' },
  { code: 'transporte:viatura:listar',       descricao: 'Listar viaturas da frota' },
  { code: 'transporte:viatura:criar',        descricao: 'Registar nova viatura' },
  { code: 'transporte:viatura:editar',       descricao: 'Editar dados de viatura' },
  { code: 'transporte:viatura:transitar',    descricao: 'Mudar estado de viatura' },
  { code: 'transporte:viatura:documentos',   descricao: 'Gerir documentos de viatura' },
  { code: 'transporte:viatura:manutencao',   descricao: 'Registar manutenção de viatura' },
  { code: 'transporte:viatura:checklist',    descricao: 'Registar checklist de viatura' },
  { code: 'transporte:motorista:listar',     descricao: 'Listar motoristas' },
  { code: 'transporte:motorista:criar',      descricao: 'Registar novo motorista' },
  { code: 'transporte:motorista:editar',     descricao: 'Editar dados de motorista' },
  { code: 'transporte:motorista:documentos', descricao: 'Gerir documentos de motorista' },
  { code: 'transporte:motorista:disponibilidade', descricao: 'Gerir disponibilidade de motorista' },
  { code: 'transporte:rota:listar',          descricao: 'Listar rotas de transporte' },
  { code: 'transporte:rota:criar',           descricao: 'Criar rota de transporte' },
  { code: 'transporte:rota:editar',          descricao: 'Editar rota de transporte' },
  { code: 'transporte:rota:transitar',       descricao: 'Mudar estado de rota' },
  { code: 'transporte:entrega:listar',       descricao: 'Listar entregas' },
  { code: 'transporte:entrega:criar',        descricao: 'Criar entrega' },
  { code: 'transporte:entrega:editar',       descricao: 'Editar entrega' },
  { code: 'transporte:entrega:transitar',    descricao: 'Mudar estado de entrega' },
  { code: 'transporte:entrega:comprovante',  descricao: 'Registar comprovante de entrega' },
  { code: 'transporte:atividade:listar',     descricao: 'Listar actividades de transporte' },
  { code: 'transporte:atividade:criar',      descricao: 'Criar actividade de transporte' },
  { code: 'transporte:atividade:editar',     descricao: 'Editar actividade de transporte' },
  { code: 'transporte:atividade:transitar',  descricao: 'Mudar estado de actividade' },
  { code: 'transporte:abastecimento:listar', descricao: 'Listar abastecimentos de combustível' },
  { code: 'transporte:abastecimento:criar',  descricao: 'Registar abastecimento de combustível' },

  // ── Serviços / After-sales ────────────────────────────────────────────────
  { code: 'servicos:ver',                   descricao: 'Consultar ordens de serviço' },
  { code: 'servicos:criar',                 descricao: 'Criar ordem de serviço' },
  { code: 'servicos:editar',                descricao: 'Editar ordem de serviço' },
  { code: 'servicos:fechar',                descricao: 'Fechar ordem de serviço' },
  { code: 'servicos:arquivar',              descricao: 'Arquivar ordem de serviço concluída' },
  { code: 'servicos:avaliar',               descricao: 'Avaliar serviço prestado' },
  { code: 'servicos:configurar',            descricao: 'Configurar parâmetros de serviços' },
  { code: 'servicos:contrato:criar',        descricao: 'Criar contrato de serviço' },
  { code: 'servicos:contrato:editar',       descricao: 'Editar contrato de serviço' },
  { code: 'servicos:contrato:renovar',      descricao: 'Renovar contrato de serviço' },
  { code: 'servicos:agendamento:criar',     descricao: 'Criar agendamento de serviço' },
  { code: 'servicos:agendamento:editar',    descricao: 'Editar agendamento de serviço' },
  { code: 'servicos:agendamento:transitar', descricao: 'Mudar estado de agendamento' },
  { code: 'servicos:tecnicos:criar',        descricao: 'Registar técnico de serviço' },
  { code: 'servicos:tecnicos:editar',       descricao: 'Editar dados de técnico' },

  // ── Tickets / Suporte ─────────────────────────────────────────────────────
  { code: 'tickets:ver',                      descricao: 'Consultar tickets de suporte' },
  { code: 'tickets:criar',                    descricao: 'Criar ticket de suporte' },
  { code: 'tickets:atribuir',                 descricao: 'Atribuir tickets a agentes' },
  { code: 'tickets:fechar',                   descricao: 'Fechar tickets' },
  { code: 'tickets:listar',                   descricao: 'Listar tickets (vista de fila)' },
  { code: 'tickets:editar',                   descricao: 'Editar tickets' },
  { code: 'tickets:comentar',                 descricao: 'Comentar em tickets' },
  { code: 'tickets:transitar',                descricao: 'Mudar estado de ticket' },
  { code: 'tickets:avaliar',                  descricao: 'Avaliar resolução de ticket' },
  { code: 'tickets:categoria:criar',          descricao: 'Criar categoria de ticket' },
  { code: 'tickets:categoria:editar',         descricao: 'Editar categoria de ticket' },
  { code: 'tickets:equipe:criar',             descricao: 'Criar equipa de suporte' },
  { code: 'tickets:equipe:editar',            descricao: 'Editar equipa de suporte' },
  { code: 'tickets:base-conhecimento:listar', descricao: 'Listar artigos da base de conhecimento' },
  { code: 'tickets:base-conhecimento:criar',  descricao: 'Criar artigo na base de conhecimento' },
  { code: 'tickets:base-conhecimento:editar', descricao: 'Editar artigo da base de conhecimento' },

  // ── Analytics / Relatórios ────────────────────────────────────────────────
  { code: 'analytics:ver',         descricao: 'Consultar dashboards e relatórios analíticos' },
  { code: 'analytics:exportar',    descricao: 'Exportar dados e relatórios analíticos' },

  // ── Core-tenancy ──────────────────────────────────────────────────────────
  { code: 'core_tenancy:ver',        descricao: 'Consultar configurações do tenant' },
  { code: 'core_tenancy:configurar', descricao: 'Configurar dados e preferências do tenant' },

  // ── Administração de utilizadores e permissões ────────────────────────────
  { code: 'admin:ver_utilizadores',   descricao: 'Consultar utilizadores e roles' },
  { code: 'admin:gerir_utilizadores', descricao: 'Criar, editar e desactivar utilizadores' },
  { code: 'admin:gerir_roles',        descricao: 'Criar e editar roles de utilizadores' },
  { code: 'admin:gerir_permissoes',   descricao: 'Atribuir/revogar permissões a roles' },
  { code: 'admin:ver_auditoria',      descricao: 'Consultar trilho de auditoria' },
  { code: 'admin:ver_integracoes',    descricao: 'Consultar integrações activas' },
  { code: 'admin:gerir_integracoes',  descricao: 'Configurar integrações externas' },
];

// ---------------------------------------------------------------------------
// Helpers de composição de roles
// ---------------------------------------------------------------------------
function allCodes(): string[] {
  return PERMISSIONS.map((p) => p.code);
}

/** Verifica se o código termina num sufixo de leitura. */
function isReadOnly(code: string): boolean {
  const readSuffixes = [':ver', ':read', ':leitura', ':listar', ':exportar', ':relatorios:leitura'];
  if (readSuffixes.some((s) => code.endsWith(s))) return true;
  // Permissões de leitura explícitas
  const readExact = [
    'analytics:ver', 'analytics:exportar',
    'core_tenancy:ver',
    'admin:ver_utilizadores', 'admin:ver_auditoria', 'admin:ver_integracoes',
    'financas:relatorios:leitura',
    'ativos:read',
    'rh:colaboradores:read', 'rh:assiduidade:read', 'rh:recrutamento:read',
    'projetos:read', 'projetos:tarefas:read', 'projetos:timesheets:read',
    'producao:ordens:read', 'producao:bom:read', 'producao:roteiros:read',
    'tickets:base-conhecimento:listar', 'tickets:listar',
    'transporte:viatura:listar', 'transporte:motorista:listar',
    'transporte:rota:listar', 'transporte:entrega:listar',
    'transporte:atividade:listar', 'transporte:abastecimento:listar',
  ];
  return readExact.includes(code);
}

// ---------------------------------------------------------------------------
// Mapeamento de permissões por role de sistema
// ---------------------------------------------------------------------------
const ROLE_PERMISSIONS: Record<string, string[]> = {
  // ADMIN — acesso total
  ADMIN: allCodes(),

  // LEITURA — apenas consulta, listagem e exportação
  LEITURA: allCodes().filter(isReadOnly),

  // FINANCEIRO — contabilidade, faturação, caixa + leituras gerais
  FINANCEIRO: allCodes().filter((code) => {
    if (code.startsWith('financas:')) return true;
    if (code.startsWith('faturacao:')) return true;
    if (code.startsWith('caixa:')) return true;
    if (code.startsWith('analytics:')) return true;
    if (isReadOnly(code)) return true;
    // Payroll — o financeiro processa/paga a folha salarial (Spec 06)
    if (code.startsWith('rh:payroll:')) return true;
    // Leituras de suporte (para criar facturas precisa de ver clientes/produtos)
    return ['ativos:read', 'admin:ver_auditoria'].includes(code);
  }),

  // OPERADOR — operacional (armazém, produção, transporte, suporte, caixa)
  OPERADOR: allCodes().filter((code) => {
    if (isReadOnly(code)) return true;
    // Inventário
    if (code.startsWith('inventario:')) return true;
    // Produção
    if (code.startsWith('producao:')) return true;
    // Transporte
    if (code.startsWith('transporte:')) return true;
    // Tickets/suporte
    if (code.startsWith('tickets:')) return true;
    // POS
    if (code === 'pos:operar') return true;
    // Serviços (operacional)
    if (['servicos:criar', 'servicos:editar', 'servicos:fechar', 'servicos:arquivar',
         'servicos:agendamento:criar', 'servicos:agendamento:editar', 'servicos:agendamento:transitar'].includes(code)) return true;
    // Compras (só criação e recebimento, não aprovação)
    if (['compras:ver', 'compras:requisicao:criar', 'compras:requisicao:editar',
         'compras:requisicao:submeter', 'compras:recebimento:registar'].includes(code)) return true;
    // Caixa operacional
    if (['caixa:ver', 'caixa:operar', 'caixa:abertura', 'caixa:fecho',
         'caixa:leitura', 'caixa:reforco', 'caixa:sangria'].includes(code)) return true;
    // Vendas básico
    if (['vendas:ver', 'vendas:criar', 'vendas:editar'].includes(code)) return true;
    // Projetos (operacional)
    if (['projetos:read', 'projetos:tarefas:read', 'projetos:tarefas:create',
         'projetos:tarefas:update', 'projetos:timesheets:create', 'projetos:timesheets:read'].includes(code)) return true;
    // RH self-service
    if (['rh:colaboradores:read', 'rh:assiduidade:create', 'rh:assiduidade:read',
         'rh:ausencias:create', 'rh:ferias:solicitar', 'rh:recrutamento:read'].includes(code)) return true;
    // Produtos/clientes/fornecedores (leitura já coberta acima)
    if (['produtos:write'].includes(code)) return true;
    return false;
  }),

  // GESTOR — quase tudo, excepto configurações de sistema perigosas
  GESTOR: allCodes().filter((code) => {
    const restricted = [
      'admin:gerir_permissoes',
      'admin:gerir_integracoes',
      'core_tenancy:configurar',
      'financas:plano-contas:escrita',
      'financas:fechar_periodo',
      'financas:lancamentos:estornar',
      'faturacao:series:escrita',
      'rh:colaboradores:delete',
      'ativos:admin',
      'inventario:admin',
    ];
    return !restricted.includes(code);
  }),
};

// ---------------------------------------------------------------------------
// System roles com descrições
// ---------------------------------------------------------------------------
export interface SystemRole {
  nome: string;
  descricao: string;
  permissionCodes: string[];
}

export const SYSTEM_ROLES: SystemRole[] = [
  {
    nome: 'ADMIN',
    descricao: 'Administrador — acesso total ao tenant',
    permissionCodes: ROLE_PERMISSIONS.ADMIN,
  },
  {
    nome: 'GESTOR',
    descricao: 'Gestor — operações e aprovações, sem configuração de sistema',
    permissionCodes: ROLE_PERMISSIONS.GESTOR,
  },
  {
    nome: 'FINANCEIRO',
    descricao: 'Financeiro — contabilidade, caixa e faturação',
    permissionCodes: ROLE_PERMISSIONS.FINANCEIRO,
  },
  {
    nome: 'OPERADOR',
    descricao: 'Operador — operações de armazém, produção e suporte',
    permissionCodes: ROLE_PERMISSIONS.OPERADOR,
  },
  {
    nome: 'LEITURA',
    descricao: 'Leitura — apenas consulta e exportação',
    permissionCodes: ROLE_PERMISSIONS.LEITURA,
  },
];

// ---------------------------------------------------------------------------
// Seed function — idempotente
// ---------------------------------------------------------------------------
export async function seedRbac(prisma: PrismaClient, tenantId: string) {
  // 1. Upsert catálogo global de permissões.
  await prisma.permission.createMany({ data: PERMISSIONS, skipDuplicates: true });
  const allPermissions = await prisma.permission.findMany();
  const permByCode = Object.fromEntries(allPermissions.map((p) => [p.code, p]));

  // 2. Upsert roles de sistema para o tenant.
  const roles = await Promise.all(
    SYSTEM_ROLES.map(async (sr) => {
      const role = await prisma.role.upsert({
        where: { tenantId_nome: { tenantId, nome: sr.nome } },
        update: { descricao: sr.descricao, isSystem: true },
        create: { tenantId, nome: sr.nome, descricao: sr.descricao, isSystem: true },
      });

      // 3. Upsert permissões do role.
      await prisma.rolePermission.createMany({
        data: sr.permissionCodes
          .filter((code) => permByCode[code])
          .map((code) => ({ roleId: role.id, permissionId: permByCode[code].id })),
        skipDuplicates: true,
      });

      return role;
    }),
  );

  return roles;
}
