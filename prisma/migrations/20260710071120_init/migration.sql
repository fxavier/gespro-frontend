-- CreateEnum
CREATE TYPE "TipoCliente" AS ENUM ('FISICA', 'JURIDICA', 'REVENDEDOR');

-- CreateEnum
CREATE TYPE "StatusCliente" AS ENUM ('ATIVO', 'INATIVO', 'SUSPENSO');

-- CreateEnum
CREATE TYPE "CategoriaCliente" AS ENUM ('VIP', 'REGULAR', 'NOVO', 'INATIVO');

-- CreateEnum
CREATE TYPE "TipoEnderecoCliente" AS ENUM ('FACTURACAO', 'ENTREGA', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoContactoCliente" AS ENUM ('PRINCIPAL', 'SECUNDARIO', 'TECNICO', 'FINANCEIRO');

-- CreateEnum
CREATE TYPE "SegmentoCliente" AS ENUM ('VAREJO', 'GROSSISTA', 'DISTRIBUIDOR', 'CORPORATIVO', 'GOVERNO');

-- CreateEnum
CREATE TYPE "TamanhoEmpresa" AS ENUM ('MICRO', 'PEQUENA', 'MEDIA', 'GRANDE');

-- CreateEnum
CREATE TYPE "PotencialVendas" AS ENUM ('ALTO', 'MEDIO', 'BAIXO');

-- CreateEnum
CREATE TYPE "FrequenciaCompra" AS ENUM ('DIARIA', 'SEMANAL', 'MENSAL', 'TRIMESTRAL', 'ANUAL');

-- CreateEnum
CREATE TYPE "TipoHistoricoTransacao" AS ENUM ('VENDA', 'DEVOLUCAO', 'PAGAMENTO', 'AJUSTE', 'NOTA_CREDITO');

-- CreateEnum
CREATE TYPE "StatusHistoricoTransacao" AS ENUM ('CONCLUIDO', 'PENDENTE', 'CANCELADO');

-- CreateEnum
CREATE TYPE "OrigemVenda" AS ENUM ('POS', 'ENCOMENDA', 'ECOMMERCE', 'MANUAL');

-- CreateEnum
CREATE TYPE "StatusVenda" AS ENUM ('RASCUNHO', 'PENDENTE', 'CONFIRMADA', 'EM_PREPARACAO', 'FATURADA', 'CONCLUIDA', 'CANCELADA', 'DEVOLVIDA');

-- CreateEnum
CREATE TYPE "MetodoPagamentoTipo" AS ENUM ('DINHEIRO', 'CARTAO', 'TRANSFERENCIA', 'MPESA', 'EMOLA', 'CREDITO');

-- CreateEnum
CREATE TYPE "StatusSessaoPOS" AS ENUM ('ABERTA', 'FECHADA', 'SUSPENSA');

-- CreateEnum
CREATE TYPE "TipoRegraComissao" AS ENUM ('FIXA', 'ESCALONADA', 'POR_CATEGORIA', 'POR_META', 'POR_PERIODO');

-- CreateEnum
CREATE TYPE "StatusComissao" AS ENUM ('PENDENTE', 'APROVADA', 'PAGA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoFornecedor" AS ENUM ('PESSOA_FISICA', 'PESSOA_JURIDICA');

-- CreateEnum
CREATE TYPE "StatusFornecedor" AS ENUM ('ATIVO', 'INATIVO', 'SUSPENSO');

-- CreateEnum
CREATE TYPE "ClassificacaoFornecedor" AS ENUM ('PREFERENCIAL', 'REGULAR', 'NOVO');

-- CreateEnum
CREATE TYPE "TipoEnderecoFornecedor" AS ENUM ('SEDE', 'ENTREGA', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoContactoFornecedor" AS ENUM ('PRINCIPAL', 'SECUNDARIO', 'TECNICO', 'FINANCEIRO');

-- CreateEnum
CREATE TYPE "TipoDocumentoFornecedor" AS ENUM ('CONTRATO', 'NUIT', 'CERTIFICACAO', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoAprovacaoWorkflow" AS ENUM ('REQUISICAO_COMPRA', 'PEDIDO_COMPRA');

-- CreateEnum
CREATE TYPE "TipoAprovacao" AS ENUM ('QUALQUER_UM', 'TODOS', 'MAIORIA');

-- CreateEnum
CREATE TYPE "StatusAprovacao" AS ENUM ('PENDENTE', 'APROVADO', 'REJEITADO');

-- CreateEnum
CREATE TYPE "PrioridadeRequisicao" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "StatusRequisicaoCompra" AS ENUM ('RASCUNHO', 'PENDENTE', 'EM_APROVACAO', 'APROVADA', 'REJEITADA', 'CANCELADA', 'CONVERTIDA');

-- CreateEnum
CREATE TYPE "StatusCotacao" AS ENUM ('RASCUNHO', 'ENVIADA', 'RESPONDIDA', 'ADJUDICADA', 'VENCIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusCotacaoFornecedor" AS ENUM ('PENDENTE', 'RESPONDIDA', 'RECUSADA');

-- CreateEnum
CREATE TYPE "StatusPedidoCompra" AS ENUM ('RASCUNHO', 'ENVIADO', 'CONFIRMADO', 'EM_TRANSITO', 'RECEBIDO_PARCIAL', 'RECEBIDO_TOTAL', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StatusRecebimento" AS ENUM ('COMPLETO', 'PARCIAL', 'COM_DIVERGENCIA');

-- CreateEnum
CREATE TYPE "StatusContaPagar" AS ENUM ('ABERTA', 'PARCIALMENTE_PAGA', 'PAGA', 'CANCELADA', 'VENCIDA');

-- CreateEnum
CREATE TYPE "StatusPagamento" AS ENUM ('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoServico" AS ENUM ('INSTALACAO', 'MANUTENCAO', 'REPARACAO', 'CONSULTORIA', 'LIMPEZA', 'TRANSPORTE', 'OUTRO');

-- CreateEnum
CREATE TYPE "NivelTecnicoServico" AS ENUM ('BASICO', 'INTERMEDIARIO', 'AVANCADO');

-- CreateEnum
CREATE TYPE "StatusAgendamento" AS ENUM ('PENDENTE', 'CONFIRMADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'CANCELADO', 'NAO_COMPARECEU');

-- CreateEnum
CREATE TYPE "StatusContratoServico" AS ENUM ('ATIVO', 'PAUSADO', 'ENCERRADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "PeriodicidadeContrato" AS ENUM ('MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL');

-- CreateEnum
CREATE TYPE "StatusSessaoCaixa" AS ENUM ('ABERTA', 'FECHADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoMovimentoCaixa" AS ENUM ('ABERTURA', 'VENDA', 'RECEBIMENTO', 'SANGRIA', 'REFORCO', 'DEVOLUCAO', 'FECHAMENTO', 'AJUSTE');

-- CreateEnum
CREATE TYPE "ClassePGC" AS ENUM ('CLASSE_1', 'CLASSE_2', 'CLASSE_3', 'CLASSE_4', 'CLASSE_5', 'CLASSE_6', 'CLASSE_7', 'CLASSE_8');

-- CreateEnum
CREATE TYPE "TipoConta" AS ENUM ('ATIVO', 'PASSIVO', 'CAPITAL_PROPRIO', 'RENDIMENTO', 'GASTO', 'RESULTADO');

-- CreateEnum
CREATE TYPE "NaturezaConta" AS ENUM ('DEVEDORA', 'CREDORA');

-- CreateEnum
CREATE TYPE "TipoDiario" AS ENUM ('VENDAS', 'COMPRAS', 'CAIXA', 'BANCO', 'OPERACOES', 'SALARIOS', 'ABERTURA', 'ENCERRAMENTO', 'OUTROS');

-- CreateEnum
CREATE TYPE "StatusLancamento" AS ENUM ('RASCUNHO', 'LANCADO', 'ESTORNADO');

-- CreateEnum
CREATE TYPE "OrigemLancamento" AS ENUM ('MANUAL', 'VENDA', 'COMPRA', 'PAGAMENTO', 'RECEBIMENTO', 'AJUSTE', 'AMORTIZACAO', 'PRODUCAO', 'CAIXA', 'RECONCILIACAO');

-- CreateEnum
CREATE TYPE "TipoPartida" AS ENUM ('DEBITO', 'CREDITO');

-- CreateEnum
CREATE TYPE "TipoContaBancaria" AS ENUM ('CORRENTE', 'POUPANCA', 'DEPOSITO_PRAZO');

-- CreateEnum
CREATE TYPE "StatusReconciliacao" AS ENUM ('EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoCentroCusto" AS ENUM ('DEPARTAMENTO', 'PROJETO', 'FILIAL', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoSerieDocumento" AS ENUM ('FATURA', 'NOTA_CREDITO', 'NOTA_DEBITO', 'PROFORMA', 'COTACAO_COMERCIAL', 'RECIBO', 'VENDA', 'SESSAO_CAIXA', 'REQUISICAO_COMPRA', 'COTACAO_RFQ', 'PEDIDO_COMPRA', 'CONTA_PAGAR', 'PAGAMENTO', 'RECEBIMENTO', 'ORDEM_PRODUCAO', 'ATIVIDADE', 'TICKET', 'ENTREGA');

-- CreateEnum
CREATE TYPE "StatusFatura" AS ENUM ('RASCUNHO', 'EMITIDA', 'PAGA', 'PARCIALMENTE_PAGA', 'VENCIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusNotaCredito" AS ENUM ('RASCUNHO', 'EMITIDA', 'LIQUIDADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusNotaDebito" AS ENUM ('RASCUNHO', 'EMITIDA', 'LIQUIDADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusProforma" AS ENUM ('RASCUNHO', 'ENVIADA', 'ACEITE', 'CONVERTIDA', 'EXPIRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusCotacaoComercial" AS ENUM ('RASCUNHO', 'ENVIADA', 'ACEITE', 'REJEITADA', 'CONVERTIDA', 'EXPIRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoLocalizacao" AS ENUM ('ARMAZEM', 'ESCRITORIO', 'DEPARTAMENTO', 'FILIAL', 'PRATELEIRA', 'SALA', 'ANDAR', 'AREA_TECNICA');

-- CreateEnum
CREATE TYPE "TipoMovimentoStock" AS ENUM ('ENTRADA', 'SAIDA', 'AJUSTE', 'TRANSFERENCIA_ENTRADA', 'TRANSFERENCIA_SAIDA');

-- CreateEnum
CREATE TYPE "StatusReservaStock" AS ENUM ('ATIVA', 'CONSUMIDA', 'LIBERADA', 'EXPIRADA');

-- CreateEnum
CREATE TYPE "EstadoAtivo" AS ENUM ('NOVO', 'EM_USO', 'EM_MANUTENCAO', 'OBSOLETO', 'BAIXADO', 'EM_TRANSFERENCIA');

-- CreateEnum
CREATE TYPE "TipoMovimentacaoAtivo" AS ENUM ('ENTRADA', 'SAIDA', 'TRANSFERENCIA', 'EMPRESTIMO', 'DEVOLUCAO', 'BAIXA', 'AJUSTE');

-- CreateEnum
CREATE TYPE "TipoManutencaoAtivo" AS ENUM ('PREVENTIVA', 'CORRETIVA', 'INSPECAO', 'CALIBRACAO');

-- CreateEnum
CREATE TYPE "StatusManutencaoAtivo" AS ENUM ('AGENDADA', 'EM_ANDAMENTO', 'ORCAMENTO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "PrioridadeManutencao" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "MetodoAmortizacao" AS ENUM ('LINEAR', 'DIGITOS_ANOS', 'UNIDADES_PRODUCAO', 'SALDOS_DECRESCENTES');

-- CreateEnum
CREATE TYPE "StatusInventarioFisico" AS ENUM ('PLANEJADO', 'AGENDADO', 'EM_ANDAMENTO', 'PAUSADO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoDiscrepanciaInventario" AS ENUM ('NAO_ENCONTRADO', 'LOCAL_DIFERENTE', 'RESPONSAVEL_DIFERENTE', 'ESTADO_DIFERENTE', 'DADOS_INCORRETOS');

-- CreateEnum
CREATE TYPE "TipoDocumentoAtivo" AS ENUM ('MANUAL', 'CERTIFICADO', 'GARANTIA', 'NOTA_FISCAL', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoViatura" AS ENUM ('LIGEIRO_PASSAGEIROS', 'LIGEIRO_MERCADORIAS', 'PESADO_MERCADORIAS', 'PESADO_PASSAGEIROS', 'MOTOCICLO', 'OUTRO');

-- CreateEnum
CREATE TYPE "UnidadeCapacidade" AS ENUM ('KG', 'TON', 'M3', 'PASSAGEIROS');

-- CreateEnum
CREATE TYPE "EstadoViatura" AS ENUM ('DISPONIVEL', 'EM_ACTIVIDADE', 'EM_MANUTENCAO', 'INACTIVA', 'ABATIDA');

-- CreateEnum
CREATE TYPE "TipoDocumentoViatura" AS ENUM ('LIVRETE', 'INSPECAO', 'SEGURO', 'LICENCA', 'MANIFESTO', 'TAXA_RADIO', 'OUTRO');

-- CreateEnum
CREATE TYPE "EstadoDocumento" AS ENUM ('VALIDO', 'PROXIMO_EXPIRAR', 'EXPIRADO');

-- CreateEnum
CREATE TYPE "TipoManutencaoViatura" AS ENUM ('PREVENTIVA', 'CORRECTIVA');

-- CreateEnum
CREATE TYPE "CategoriaItemChecklist" AS ENUM ('COMPONENTE', 'SOBRESSALENTE', 'ACESSORIO');

-- CreateEnum
CREATE TYPE "EstadoItemChecklist" AS ENUM ('OK', 'AVARIA', 'FALTA');

-- CreateEnum
CREATE TYPE "TipoDocumentoMotorista" AS ENUM ('CARTA_CONDUCAO', 'BI', 'OUTRO');

-- CreateEnum
CREATE TYPE "EstadoOperacionalMotorista" AS ENUM ('ACTIVO', 'INACTIVO', 'SUSPENSO');

-- CreateEnum
CREATE TYPE "MotivoIndisponibilidade" AS ENUM ('FERIAS', 'AUSENCIA', 'SUSPENSAO', 'MANUAL', 'CONFLITO_AGENDA');

-- CreateEnum
CREATE TYPE "FonteDisponibilidade" AS ENUM ('SISTEMA', 'RH_API', 'MANUAL');

-- CreateEnum
CREATE TYPE "TipoActividade" AS ENUM ('DESLOCACAO', 'MISSAO_SERVICO', 'TRANSPORTE_MERCADORIAS', 'TRANSPORTE_PESSOAL', 'MANUTENCAO_CAMPO', 'OUTRO');

-- CreateEnum
CREATE TYPE "PrioridadeAtividade" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "EstadoAtividade" AS ENUM ('PLANEADA', 'EM_CURSO', 'SUSPENSA', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "EstadoRota" AS ENUM ('PLANEADA', 'ATIVA', 'PAUSADA', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoPontoRota" AS ENUM ('COLETA', 'ENTREGA', 'PARADA');

-- CreateEnum
CREATE TYPE "EstadoPontoRota" AS ENUM ('PENDENTE', 'EM_TRANSITO', 'ENTREGUE', 'FALHADA');

-- CreateEnum
CREATE TYPE "EstadoEntrega" AS ENUM ('PENDENTE', 'AGENDADA', 'EM_TRANSITO', 'ENTREGUE', 'FALHADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "PrioridadeEntrega" AS ENUM ('BAIXA', 'NORMAL', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "TipoProvaEntrega" AS ENUM ('ASSINATURA', 'FOTO', 'CODIGO');

-- CreateEnum
CREATE TYPE "TipoCombustivel" AS ENUM ('GASOLINA', 'DIESEL', 'ETANOL', 'GNV');

-- CreateEnum
CREATE TYPE "TipoTicket" AS ENUM ('INCIDENTE', 'REQUISICAO', 'PROBLEMA', 'MUDANCA', 'CONSULTA');

-- CreateEnum
CREATE TYPE "PrioridadeTicket" AS ENUM ('BAIXA', 'NORMAL', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "EstadoTicket" AS ENUM ('ABERTO', 'EM_PROGRESSO', 'AGUARDANDO_CLIENTE', 'AGUARDANDO_TERCEIRO', 'RESOLVIDO', 'FECHADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoAtividadeTicket" AS ENUM ('COMENTARIO', 'MUDANCA_STATUS', 'ATRIBUICAO', 'ANEXO', 'SISTEMA');

-- CreateEnum
CREATE TYPE "VisibilidadeAtividadeTicket" AS ENUM ('PUBLICA', 'INTERNA');

-- CreateEnum
CREATE TYPE "EstadoBaseConhecimento" AS ENUM ('RASCUNHO', 'PUBLICADO', 'ARQUIVADO');

-- CreateEnum
CREATE TYPE "EstadoEquipeSuporte" AS ENUM ('ATIVA', 'INATIVA');

-- CreateEnum
CREATE TYPE "PapelMembroEquipeSuporte" AS ENUM ('LIDER', 'AGENTE', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "EstadoMembroEquipeSuporte" AS ENUM ('DISPONIVEL', 'OCUPADO', 'AUSENTE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "GeneroColaborador" AS ENUM ('MASCULINO', 'FEMININO', 'OUTRO');

-- CreateEnum
CREATE TYPE "EstadoCivil" AS ENUM ('SOLTEIRO', 'CASADO', 'DIVORCIADO', 'VIUVO', 'UNIAO_FACTO');

-- CreateEnum
CREATE TYPE "StatusColaborador" AS ENUM ('ACTIVO', 'INACTIVO', 'FERIAS', 'AFASTADO', 'PERIODO_EXPERIMENTAL');

-- CreateEnum
CREATE TYPE "TipoContratoTrabalho" AS ENUM ('EFECTIVO', 'TERMO_CERTO', 'ESTAGIO', 'TEMPORARIO', 'PRESTACAO_SERVICOS');

-- CreateEnum
CREATE TYPE "RegimeTrabalho" AS ENUM ('TEMPO_INTEGRAL', 'TEMPO_PARCIAL');

-- CreateEnum
CREATE TYPE "NivelAcessoColaborador" AS ENUM ('USUARIO', 'SUPERVISOR', 'GERENTE', 'ADMIN');

-- CreateEnum
CREATE TYPE "NivelFormacaoAcademica" AS ENUM ('BASICO', 'MEDIO', 'TECNICO', 'LICENCIATURA', 'MESTRADO', 'DOUTORAMENTO');

-- CreateEnum
CREATE TYPE "TipoDocColaborador" AS ENUM ('FOTO', 'BI_FRENTE', 'BI_VERSO', 'CERTIFICADO_HABILITACOES', 'CURRICULUM', 'CERTIFICADO_CRIMINAL', 'ATESTADO_MEDICO_DOC', 'COMPROVATIVO_RESIDENCIA', 'CERTIFICADO_INSS', 'DECLARACAO_NUIT', 'CONTRATO_TRABALHO', 'CARTA_CONDUCAO', 'CERTIFICADO_PROFISSIONAL', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoAusencia" AS ENUM ('FALTA', 'ATESTADO_MEDICO', 'LICENCA_MATERNIDADE', 'LICENCA_PATERNIDADE', 'LICENCA_SEM_VENCIMENTO', 'LICENCA_NOJO', 'LICENCA_CASAMENTO', 'OUTRO');

-- CreateEnum
CREATE TYPE "StatusAusencia" AS ENUM ('PENDENTE', 'APROVADA', 'REJEITADA');

-- CreateEnum
CREATE TYPE "TipoSolicitacaoFerias" AS ENUM ('INTEGRAL', 'FRACIONADA', 'ABONO_PECUNIARIO');

-- CreateEnum
CREATE TYPE "StatusSolicitacaoFerias" AS ENUM ('PENDENTE', 'APROVADA', 'REJEITADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "TipoAssiduidade" AS ENUM ('NORMAL', 'FERIADO', 'FIM_SEMANA', 'FERIAS', 'AUSENCIA');

-- CreateEnum
CREATE TYPE "TipoAvaliacao" AS ENUM ('DESEMPENHO', 'COMPETENCIAS', 'TREZENTOS_SESSENTA', 'PROBATORIO');

-- CreateEnum
CREATE TYPE "StatusAvaliacao" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "ModalidadeFormacao" AS ENUM ('PRESENCIAL', 'ONLINE', 'HIBRIDO');

-- CreateEnum
CREATE TYPE "StatusFormacao" AS ENUM ('PLANEADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusParticipante" AS ENUM ('INSCRITO', 'CONFIRMADO', 'PRESENTE', 'AUSENTE', 'APROVADO', 'REPROVADO');

-- CreateEnum
CREATE TYPE "StatusPayroll" AS ENUM ('PENDENTE', 'PROCESSADO', 'PAGO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoProjeto" AS ENUM ('INTERNO', 'EXTERNO', 'PESQUISA', 'DESENVOLVIMENTO');

-- CreateEnum
CREATE TYPE "StatusProjeto" AS ENUM ('PLANEAMENTO', 'EM_ANDAMENTO', 'PAUSADO', 'CONCLUIDO', 'CANCELADO', 'ARQUIVADO');

-- CreateEnum
CREATE TYPE "PrioridadeProjeto" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "TipoTarefa" AS ENUM ('TAREFA', 'BUG', 'MELHORIA', 'DOCUMENTACAO', 'TESTE');

-- CreateEnum
CREATE TYPE "StatusTarefa" AS ENUM ('A_FAZER', 'EM_PROGRESSO', 'EM_REVISAO', 'BLOQUEADA', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "PrioridadeTarefa" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'CRITICA');

-- CreateEnum
CREATE TYPE "StatusEquipa" AS ENUM ('ATIVA', 'INATIVA');

-- CreateEnum
CREATE TYPE "PapelMembroEquipa" AS ENUM ('GERENTE', 'LIDER', 'DESENVOLVEDOR', 'DESIGNER', 'ANALISTA', 'TESTER', 'OUTRO');

-- CreateEnum
CREATE TYPE "StatusMembroEquipa" AS ENUM ('ATIVO', 'INATIVO', 'FERIAS', 'LICENCA');

-- CreateEnum
CREATE TYPE "TipoTimesheet" AS ENUM ('DESENVOLVIMENTO', 'REUNIAO', 'DOCUMENTACAO', 'TESTE', 'SUPORTE', 'OUTRO');

-- CreateEnum
CREATE TYPE "StatusMilestone" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDO', 'ATRASADO');

-- CreateEnum
CREATE TYPE "StatusOrcamento" AS ENUM ('RASCUNHO', 'APROVADO', 'REJEITADO', 'REVISAO');

-- CreateEnum
CREATE TYPE "TipoCategoriaOrcamento" AS ENUM ('MAO_OBRA', 'MATERIAL', 'EQUIPAMENTO', 'SERVICO', 'OUTRO');

-- CreateEnum
CREATE TYPE "TipoCentroTrabalho" AS ENUM ('MAQUINA', 'PESSOA', 'CELULA', 'LINHA');

-- CreateEnum
CREATE TYPE "StatusBOM" AS ENUM ('RASCUNHO', 'ATIVO', 'INATIVO', 'SUBSTITUIDO');

-- CreateEnum
CREATE TYPE "CategoriaBOM" AS ENUM ('MATERIA_PRIMA', 'COMPONENTE', 'SUBCONJUNTO', 'PRODUTO_ACABADO');

-- CreateEnum
CREATE TYPE "ComplexidadeBOM" AS ENUM ('BAIXO', 'MEDIO', 'ALTO');

-- CreateEnum
CREATE TYPE "StatusRoteiro" AS ENUM ('RASCUNHO', 'ATIVO', 'INATIVO', 'SUBSTITUIDO', 'EM_REVISAO');

-- CreateEnum
CREATE TYPE "StatusOperacaoRoteiro" AS ENUM ('ATIVO', 'INATIVO', 'EM_REVISAO');

-- CreateEnum
CREATE TYPE "StatusOrdemProducao" AS ENUM ('PLANEADA', 'LIBERADA', 'EM_PRODUCAO', 'CONCLUIDA', 'CANCELADA', 'PAUSADA');

-- CreateEnum
CREATE TYPE "PrioridadeOrdemProducao" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "StatusOperacaoOrdem" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'PAUSADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "RegimeIva" AS ENUM ('NORMAL', 'SIMPLIFICADO', 'ISENTO');

-- CreateEnum
CREATE TYPE "PlanoAssinatura" AS ENUM ('BASICO', 'PROFISSIONAL', 'EMPRESARIAL');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "descricao" TEXT,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "data" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserInvite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "roleId" TEXT,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoCliente" NOT NULL,
    "nuit" TEXT NOT NULL,
    "bi" TEXT,
    "email" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "telefoneSec" TEXT,
    "diasPagamento" INTEGER NOT NULL DEFAULT 30,
    "limiteCreditoMT" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "creditoUtilizadoMT" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "StatusCliente" NOT NULL DEFAULT 'ATIVO',
    "categoria" "CategoriaCliente" NOT NULL DEFAULT 'NOVO',
    "observacoes" TEXT,
    "representanteNome" TEXT,
    "representanteEmail" TEXT,
    "representanteTelefone" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnderecoCliente" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipo" "TipoEnderecoCliente" NOT NULL DEFAULT 'FACTURACAO',
    "rua" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "bairro" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "provincia" TEXT NOT NULL,
    "codigoPostal" TEXT,
    "referencia" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnderecoCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactoCliente" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cargo" TEXT,
    "email" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "telefoneSec" TEXT,
    "tipo" "TipoContactoCliente" NOT NULL DEFAULT 'PRINCIPAL',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactoCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SegmentacaoCliente" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "segmento" "SegmentoCliente" NOT NULL,
    "industria" TEXT,
    "tamanhoEmpresa" "TamanhoEmpresa",
    "potencialVendas" "PotencialVendas" NOT NULL DEFAULT 'MEDIO',
    "frequenciaCompra" "FrequenciaCompra" NOT NULL DEFAULT 'MENSAL',
    "ticketMedio" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SegmentacaoCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoTransacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipo" "TipoHistoricoTransacao" NOT NULL,
    "referencia" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MZN',
    "dataTransacao" TIMESTAMP(3) NOT NULL,
    "status" "StatusHistoricoTransacao" NOT NULL DEFAULT 'CONCLUIDO',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricoTransacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessaoPOS" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "sessaoCaixaId" TEXT NOT NULL,
    "status" "StatusSessaoPOS" NOT NULL DEFAULT 'ABERTA',
    "abertoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechadoEm" TIMESTAMP(3),
    "totalVendas" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "numeroPedidos" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessaoPOS_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venda" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "origem" "OrigemVenda" NOT NULL DEFAULT 'POS',
    "status" "StatusVenda" NOT NULL DEFAULT 'PENDENTE',
    "clienteId" TEXT,
    "vendedorId" TEXT NOT NULL,
    "sessaoPOSId" TEXT,
    "sessaoCaixaId" TEXT,
    "faturaId" TEXT,
    "dataEntregaPrevista" TIMESTAMP(3),
    "enderecoEntregaId" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "descontoTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "ivaTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MZN',
    "observacoes" TEXT,
    "dataVenda" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemVenda" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "varianteId" TEXT,
    "nomeProduto" TEXT NOT NULL,
    "sku" TEXT,
    "quantidade" DECIMAL(18,2) NOT NULL,
    "precoUnitario" DECIMAL(18,2) NOT NULL,
    "desconto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxaIva" DECIMAL(9,6) NOT NULL DEFAULT 0.160000,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "ivaItem" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemVenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PagamentoVenda" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "tipo" "MetodoPagamentoTipo" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "referencia" TEXT,
    "troco" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagamentoVenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HistoricoEstadoVenda" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "estadoAntes" "StatusVenda" NOT NULL,
    "estadoDepois" "StatusVenda" NOT NULL,
    "motivo" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricoEstadoVenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegraComissao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoRegraComissao" NOT NULL,
    "vendedorId" TEXT,
    "categoriaId" TEXT,
    "percentualBase" DECIMAL(9,6) NOT NULL,
    "percentualBonus" DECIMAL(9,6),
    "valorMinimo" DECIMAL(18,2),
    "valorMaximo" DECIMAL(18,2),
    "quantidadeMinima" DECIMAL(18,2),
    "metaPercentual" DECIMAL(9,6),
    "dataInicio" TIMESTAMP(3),
    "dataFim" TIMESTAMP(3),
    "prioridade" INTEGER NOT NULL DEFAULT 1,
    "descricao" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegraComissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comissao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vendaId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "regraComissaoId" TEXT,
    "percentualAplicado" DECIMAL(9,6) NOT NULL,
    "valorBase" DECIMAL(18,2) NOT NULL,
    "valorComissao" DECIMAL(18,2) NOT NULL,
    "regrasAplicadas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "detalhes" TEXT,
    "status" "StatusComissao" NOT NULL DEFAULT 'PENDENTE',
    "pagoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comissao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fornecedor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoFornecedor" NOT NULL,
    "nuit" TEXT NOT NULL,
    "bi" TEXT,
    "email" TEXT NOT NULL,
    "telefone" TEXT,
    "telefoneSec" TEXT,
    "categoria" TEXT,
    "status" "StatusFornecedor" NOT NULL DEFAULT 'ATIVO',
    "classificacao" "ClassificacaoFornecedor" NOT NULL DEFAULT 'REGULAR',
    "rating" DECIMAL(3,2),
    "limiteCredito" DECIMAL(18,2),
    "saldoDevedor" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalCompras" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "ultimaCompra" TIMESTAMP(3),
    "diasPagamento" INTEGER NOT NULL DEFAULT 30,
    "prazoMedioPagamento" INTEGER NOT NULL DEFAULT 30,
    "condicoesPagamento" TEXT,
    "formasPagamento" TEXT[],
    "condicoesComerciaisDesconto" DECIMAL(5,2),
    "avaliacaoQualidade" DECIMAL(3,2),
    "observacoes" TEXT,
    "tags" TEXT[],
    "currency" TEXT NOT NULL DEFAULT 'MZN',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnderecoFornecedor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "tipo" "TipoEnderecoFornecedor" NOT NULL DEFAULT 'SEDE',
    "rua" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "bairro" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "provincia" TEXT NOT NULL,
    "codigoPostal" TEXT,
    "referencia" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnderecoFornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactoFornecedor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cargo" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "telefoneSec" TEXT,
    "tipo" "TipoContactoFornecedor" NOT NULL DEFAULT 'PRINCIPAL',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContactoFornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoFornecedor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "tipo" "TipoDocumentoFornecedor" NOT NULL DEFAULT 'OUTRO',
    "nome" TEXT NOT NULL,
    "dataUpload" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataValidade" TIMESTAMP(3),
    "url" TEXT NOT NULL,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentoFornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvaliacaoFornecedor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "avaliadorId" TEXT NOT NULL,
    "qualidade" INTEGER NOT NULL,
    "prazo" INTEGER NOT NULL,
    "preco" INTEGER NOT NULL,
    "comunicacao" INTEGER NOT NULL,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvaliacaoFornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracaoWorkflow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoAprovacaoWorkflow" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracaoWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NivelAprovacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "configuracaoWorkflowId" TEXT NOT NULL,
    "nivel" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "valorMinimo" DECIMAL(18,2) NOT NULL,
    "valorMaximo" DECIMAL(18,2) NOT NULL,
    "tipoAprovacao" "TipoAprovacao" NOT NULL DEFAULT 'QUALQUER_UM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NivelAprovacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AprovadorNivel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nivelAprovacaoId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "email" TEXT NOT NULL,

    CONSTRAINT "AprovadorNivel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequisicaoCompra" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "solicitanteId" TEXT NOT NULL,
    "solicitanteNome" TEXT NOT NULL,
    "departamento" TEXT NOT NULL,
    "prioridade" "PrioridadeRequisicao" NOT NULL DEFAULT 'MEDIA',
    "status" "StatusRequisicaoCompra" NOT NULL DEFAULT 'RASCUNHO',
    "justificativa" TEXT NOT NULL,
    "observacoes" TEXT,
    "valorTotal" DECIMAL(18,2) NOT NULL,
    "dataEntregaDesejada" TIMESTAMP(3),
    "centroCustoId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'MZN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequisicaoCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemRequisicao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requisicaoCompraId" TEXT NOT NULL,
    "produtoId" TEXT,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "unidadeMedida" TEXT NOT NULL,
    "precoEstimado" DECIMAL(18,2) NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemRequisicao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AprovacaoCompra" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requisicaoCompraId" TEXT,
    "pedidoCompraId" TEXT,
    "nivel" INTEGER NOT NULL,
    "aprovadorId" TEXT NOT NULL,
    "aprovadorNome" TEXT NOT NULL,
    "status" "StatusAprovacao" NOT NULL DEFAULT 'PENDENTE',
    "data" TIMESTAMP(3),
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AprovacaoCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cotacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "requisicaoCompraId" TEXT,
    "status" "StatusCotacao" NOT NULL DEFAULT 'RASCUNHO',
    "dataValidade" TIMESTAMP(3) NOT NULL,
    "vencedorFornecedorId" TEXT,
    "observacoes" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'MZN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cotacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotacaoFornecedor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cotacaoId" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "dataEnvio" TIMESTAMP(3),
    "dataResposta" TIMESTAMP(3),
    "status" "StatusCotacaoFornecedor" NOT NULL DEFAULT 'PENDENTE',
    "valorTotal" DECIMAL(18,2),
    "prazoEntregaDias" INTEGER,
    "condicoesPagamento" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CotacaoFornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemCotacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cotacaoId" TEXT NOT NULL,
    "produtoId" TEXT,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "unidadeMedida" TEXT NOT NULL,
    "especificacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemCotacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RespostaItemCotacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemCotacaoId" TEXT NOT NULL,
    "cotacaoFornecedorId" TEXT NOT NULL,
    "precoUnitario" DECIMAL(18,2) NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "prazoEntregaDias" INTEGER NOT NULL,
    "marca" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RespostaItemCotacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PedidoCompra" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "requisicaoCompraId" TEXT,
    "cotacaoId" TEXT,
    "fornecedorId" TEXT NOT NULL,
    "status" "StatusPedidoCompra" NOT NULL DEFAULT 'RASCUNHO',
    "valorSubtotal" DECIMAL(18,2) NOT NULL,
    "valorDesconto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "valorIva" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "valorTotal" DECIMAL(18,2) NOT NULL,
    "taxaIva" DECIMAL(9,6) NOT NULL DEFAULT 0.160000,
    "condicoesPagamento" TEXT NOT NULL,
    "prazoEntregaDias" INTEGER NOT NULL,
    "dataEntregaPrevista" TIMESTAMP(3) NOT NULL,
    "dataEntregaReal" TIMESTAMP(3),
    "enderecoEntrega" TEXT NOT NULL,
    "centroCustoId" TEXT,
    "observacoes" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'MZN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PedidoCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemPedidoCompra" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pedidoCompraId" TEXT NOT NULL,
    "produtoId" TEXT,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(18,4) NOT NULL,
    "quantidadeRecebida" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unidadeMedida" TEXT NOT NULL,
    "precoUnitario" DECIMAL(18,2) NOT NULL,
    "desconto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxaIva" DECIMAL(9,6) NOT NULL DEFAULT 0.160000,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemPedidoCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecebimentoCompra" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pedidoCompraId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "numeroDocumento" TEXT,
    "responsavelId" TEXT NOT NULL,
    "responsavelNome" TEXT NOT NULL,
    "status" "StatusRecebimento" NOT NULL,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecebimentoCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemRecebimento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recebimentoCompraId" TEXT NOT NULL,
    "itemPedidoCompraId" TEXT NOT NULL,
    "quantidadeRecebida" DECIMAL(18,4) NOT NULL,
    "quantidadeAceita" DECIMAL(18,4) NOT NULL,
    "quantidadeRejeitada" DECIMAL(18,4) NOT NULL,
    "motivoRejeicao" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemRecebimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaPagar" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "pedidoCompraId" TEXT,
    "descricao" TEXT NOT NULL,
    "valorOriginal" DECIMAL(18,2) NOT NULL,
    "valorPago" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "valorRestante" DECIMAL(18,2) NOT NULL,
    "dataEmissao" TIMESTAMP(3) NOT NULL,
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "status" "StatusContaPagar" NOT NULL DEFAULT 'ABERTA',
    "centroCustoId" TEXT,
    "contaContabilId" TEXT,
    "observacoes" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'MZN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContaPagar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pagamento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contaPagarId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "dataPagamento" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "formaPagamento" TEXT NOT NULL,
    "referencia" TEXT,
    "status" "StatusPagamento" NOT NULL DEFAULT 'PENDENTE',
    "lancamentoId" TEXT,
    "observacoes" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'MZN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoriaServico" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "cor" TEXT NOT NULL DEFAULT '#6B7280',
    "icone" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoriaServico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Servico" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "categoriaServicoId" TEXT,
    "subcategoria" TEXT,
    "preco" DECIMAL(18,2) NOT NULL,
    "precoMinimo" DECIMAL(18,2),
    "precoMaximo" DECIMAL(18,2),
    "duracaoEstimada" INTEGER NOT NULL,
    "unidadeMedida" TEXT NOT NULL DEFAULT 'un',
    "taxaIva" DECIMAL(9,6) NOT NULL DEFAULT 0.160000,
    "tipoServico" "TipoServico" NOT NULL DEFAULT 'OUTRO',
    "incluiMaterial" BOOLEAN NOT NULL DEFAULT false,
    "materialIncluido" TEXT,
    "requerAgendamento" BOOLEAN NOT NULL DEFAULT true,
    "requerTecnico" BOOLEAN NOT NULL DEFAULT false,
    "nivelTecnicoRequerido" "NivelTecnicoServico",
    "disponivel" BOOLEAN NOT NULL DEFAULT true,
    "diasDisponibilidade" TEXT[],
    "horaInicio" TEXT,
    "horaFim" TEXT,
    "imagem" TEXT,
    "observacoes" TEXT,
    "totalVendas" INTEGER NOT NULL DEFAULT 0,
    "faturamentoTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "ultimaVenda" TIMESTAMP(3),
    "avaliacaoMedia" DECIMAL(3,2),
    "numeroAvaliacoes" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "currency" TEXT NOT NULL DEFAULT 'MZN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Servico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TecnicoServico" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "especialidades" TEXT[],
    "nivelTecnico" "NivelTecnicoServico" NOT NULL DEFAULT 'BASICO',
    "disponivel" BOOLEAN NOT NULL DEFAULT true,
    "agendamentosAtivos" INTEGER NOT NULL DEFAULT 0,
    "avaliacaoMedia" DECIMAL(3,2),
    "numeroAvaliacoes" INTEGER NOT NULL DEFAULT 0,
    "custoHora" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TecnicoServico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgendamentoServico" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "servicoId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "clienteNome" TEXT NOT NULL,
    "clienteEmail" TEXT NOT NULL,
    "clienteTelefone" TEXT NOT NULL,
    "tecnicoId" TEXT,
    "tecnicoNome" TEXT,
    "dataAgendamento" TIMESTAMP(3) NOT NULL,
    "horaInicio" TEXT NOT NULL,
    "horaFim" TEXT NOT NULL,
    "duracaoEstimada" INTEGER NOT NULL,
    "local" TEXT NOT NULL,
    "endereco" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "provincia" TEXT NOT NULL,
    "status" "StatusAgendamento" NOT NULL DEFAULT 'PENDENTE',
    "precoServico" DECIMAL(18,2) NOT NULL,
    "desconto" DECIMAL(18,2),
    "taxaIva" DECIMAL(9,6) NOT NULL DEFAULT 0.160000,
    "total" DECIMAL(18,2) NOT NULL,
    "observacoes" TEXT,
    "notasConclusao" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'MZN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgendamentoServico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvaliacaoServico" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "agendamentoServicoId" TEXT NOT NULL,
    "servicoId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "clienteNome" TEXT NOT NULL,
    "nota" DECIMAL(3,2) NOT NULL,
    "comentario" TEXT,
    "aspectosPositivos" TEXT[],
    "aspectosNegativos" TEXT[],
    "recomendaria" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvaliacaoServico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContratoServico" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "clienteNome" TEXT NOT NULL,
    "servicosIds" TEXT[],
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "renovacaoAutomatica" BOOLEAN NOT NULL DEFAULT false,
    "periodicidade" "PeriodicidadeContrato" NOT NULL DEFAULT 'MENSAL',
    "valorMensal" DECIMAL(18,2) NOT NULL,
    "status" "StatusContratoServico" NOT NULL DEFAULT 'ATIVO',
    "observacoes" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'MZN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContratoServico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessaoCaixa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "responsavelId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "dataAbertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataFechamento" TIMESTAMP(3),
    "fundoInicial" DECIMAL(18,2) NOT NULL,
    "fundoFinal" DECIMAL(18,2),
    "totalEntradas" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalSaidas" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "diferenca" DECIMAL(18,2),
    "status" "StatusSessaoCaixa" NOT NULL DEFAULT 'ABERTA',
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessaoCaixa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoCaixa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessaoCaixaId" TEXT NOT NULL,
    "tipo" "TipoMovimentoCaixa" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "descricao" TEXT NOT NULL,
    "documentoOrigemId" TEXT,
    "documentoOrigemTipo" TEXT,
    "responsavelId" TEXT NOT NULL,
    "dataMovimento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentoCaixa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaPGC" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "classe" "ClassePGC" NOT NULL,
    "tipo" "TipoConta" NOT NULL,
    "natureza" "NaturezaConta" NOT NULL,
    "nivel" INTEGER NOT NULL,
    "contaPaiId" TEXT,
    "aceitaLancamento" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "descricao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContaPGC_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Diario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoDiario" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Diario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CentroCusto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo" "TipoCentroCusto" NOT NULL,
    "responsavelId" TEXT,
    "orcamento" DECIMAL(18,2),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CentroCusto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lancamento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "tipo" TEXT NOT NULL,
    "origem" "OrigemLancamento" NOT NULL,
    "diarioId" TEXT NOT NULL,
    "documentoOrigemId" TEXT,
    "documentoOrigemTipo" TEXT,
    "historico" TEXT NOT NULL,
    "valorTotal" DECIMAL(18,2) NOT NULL,
    "status" "StatusLancamento" NOT NULL DEFAULT 'RASCUNHO',
    "lancamentoEstornoId" TEXT,
    "periodoFiscal" TEXT NOT NULL,
    "observacoes" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartidaLancamento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "contaId" TEXT NOT NULL,
    "centroCustoId" TEXT,
    "tipo" "TipoPartida" NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "historico" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartidaLancamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContaBancaria" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "banco" TEXT NOT NULL,
    "agencia" TEXT NOT NULL,
    "numeroConta" TEXT NOT NULL,
    "tipoConta" "TipoContaBancaria" NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'MZN',
    "saldoAtual" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "contaContabilId" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContaBancaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliacaoBancaria" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contaBancariaId" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "saldoInicialBanco" DECIMAL(18,2) NOT NULL,
    "saldoFinalBanco" DECIMAL(18,2) NOT NULL,
    "saldoInicialContabil" DECIMAL(18,2) NOT NULL,
    "saldoFinalContabil" DECIMAL(18,2) NOT NULL,
    "diferencaNaoConciliada" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "StatusReconciliacao" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "observacoes" TEXT,
    "responsavelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconciliacaoBancaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemReconciliacaoBancaria" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reconciliacaoId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,
    "tipoMovimento" "TipoPartida" NOT NULL,
    "conciliado" BOOLEAN NOT NULL DEFAULT false,
    "lancamentoId" TEXT,
    "extratoReferencia" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ItemReconciliacaoBancaria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerieDocumento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tipo" "TipoSerieDocumento" NOT NULL,
    "prefixo" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "proximoNumero" INTEGER NOT NULL DEFAULT 1,
    "formatoNumero" TEXT NOT NULL DEFAULT '{prefixo}/{ano}/{numero:06}',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SerieDocumento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fatura" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serieDocumentoId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "vendaId" TEXT,
    "moeda" TEXT NOT NULL DEFAULT 'MZN',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "descontoTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "baseIva" DECIMAL(18,2) NOT NULL,
    "ivaTotal" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "totalPago" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "StatusFatura" NOT NULL DEFAULT 'RASCUNHO',
    "dataEmissao" TIMESTAMP(3) NOT NULL,
    "dataVencimento" TIMESTAMP(3) NOT NULL,
    "dataPagamento" TIMESTAMP(3),
    "observacoes" TEXT,
    "qrCode" TEXT,
    "hashValidacao" TEXT,
    "caminhoArquivoPdf" TEXT,
    "lancamentoId" TEXT,
    "emitidoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinhaFatura" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "faturaId" TEXT NOT NULL,
    "produtoId" TEXT,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(18,6) NOT NULL,
    "precoUnitario" DECIMAL(18,2) NOT NULL,
    "desconto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxaIva" DECIMAL(9,6) NOT NULL DEFAULT 0.16,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "ivaItem" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "ordemLinha" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinhaFatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotaCredito" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serieDocumentoId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "faturaOriginalId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'MZN',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "descontoTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "ivaTotal" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "status" "StatusNotaCredito" NOT NULL DEFAULT 'RASCUNHO',
    "dataEmissao" TIMESTAMP(3) NOT NULL,
    "observacoes" TEXT,
    "lancamentoId" TEXT,
    "emitidoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotaCredito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinhaNotaCredito" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "notaCreditoId" TEXT NOT NULL,
    "produtoId" TEXT,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(18,6) NOT NULL,
    "precoUnitario" DECIMAL(18,2) NOT NULL,
    "desconto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxaIva" DECIMAL(9,6) NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "ivaItem" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "ordemLinha" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinhaNotaCredito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotaDebito" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serieDocumentoId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "faturaReferenciaId" TEXT,
    "motivo" TEXT NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'MZN',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "descontoTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "ivaTotal" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "status" "StatusNotaDebito" NOT NULL DEFAULT 'RASCUNHO',
    "dataEmissao" TIMESTAMP(3) NOT NULL,
    "observacoes" TEXT,
    "lancamentoId" TEXT,
    "emitidoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotaDebito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinhaNotaDebito" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "notaDebitoId" TEXT NOT NULL,
    "produtoId" TEXT,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(18,6) NOT NULL,
    "precoUnitario" DECIMAL(18,2) NOT NULL,
    "desconto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxaIva" DECIMAL(9,6) NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "ivaItem" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "ordemLinha" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinhaNotaDebito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proforma" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serieDocumentoId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'MZN',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "descontoTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "ivaTotal" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "status" "StatusProforma" NOT NULL DEFAULT 'RASCUNHO',
    "dataEmissao" TIMESTAMP(3) NOT NULL,
    "dataValidade" TIMESTAMP(3) NOT NULL,
    "faturaId" TEXT,
    "observacoes" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Proforma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinhaProforma" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "proformaId" TEXT NOT NULL,
    "produtoId" TEXT,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(18,6) NOT NULL,
    "precoUnitario" DECIMAL(18,2) NOT NULL,
    "desconto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxaIva" DECIMAL(9,6) NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "ivaItem" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "ordemLinha" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinhaProforma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotacaoComercial" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serieDocumentoId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'MZN',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "descontoTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "ivaTotal" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "status" "StatusCotacaoComercial" NOT NULL DEFAULT 'RASCUNHO',
    "dataEmissao" TIMESTAMP(3) NOT NULL,
    "dataValidade" TIMESTAMP(3) NOT NULL,
    "proformaId" TEXT,
    "faturaId" TEXT,
    "observacoes" TEXT,
    "condicoesComerciais" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CotacaoComercial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinhaCotacaoComercial" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cotacaoComercialId" TEXT NOT NULL,
    "produtoId" TEXT,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(18,6) NOT NULL,
    "precoUnitario" DECIMAL(18,2) NOT NULL,
    "desconto" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxaIva" DECIMAL(9,6) NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "ivaItem" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "ordemLinha" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinhaCotacaoComercial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoriaProduto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "cor" TEXT NOT NULL DEFAULT '#6366f1',
    "icone" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CategoriaProduto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Produto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "codigoBarras" TEXT,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "categoriaId" TEXT NOT NULL,
    "marca" TEXT,
    "unidadeMedida" TEXT NOT NULL,
    "precoVenda" DECIMAL(18,2) NOT NULL,
    "precoCompra" DECIMAL(18,2) NOT NULL,
    "margemLucro" DECIMAL(9,6) NOT NULL,
    "taxaIva" DECIMAL(9,6) NOT NULL DEFAULT 0.160000,
    "stockMinimo" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "stockMaximo" DECIMAL(18,2),
    "dataValidade" TIMESTAMP(3),
    "imagens" TEXT[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VarianteProduto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "precoAdicional" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VarianteProduto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Localizacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoLocalizacao" NOT NULL,
    "endereco" TEXT,
    "descricao" TEXT,
    "capacidade" DECIMAL(18,2),
    "responsavelId" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "localizacaoPaiId" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Localizacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentoStock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "varianteProdutoId" TEXT,
    "tipo" "TipoMovimentoStock" NOT NULL,
    "quantidade" DECIMAL(18,2) NOT NULL,
    "localizacaoOrigemId" TEXT,
    "localizacaoDestinoId" TEXT,
    "transferenciaRefId" TEXT,
    "documentoReferenciaId" TEXT,
    "documentoReferenciaTipo" TEXT,
    "motivo" TEXT,
    "observacoes" TEXT,
    "criadoPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentoStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaldoStock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "varianteProdutoId" TEXT NOT NULL DEFAULT '',
    "localizacaoId" TEXT NOT NULL,
    "saldo" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "saldoReservado" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SaldoStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservaStock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "varianteProdutoId" TEXT,
    "localizacaoId" TEXT NOT NULL,
    "quantidade" DECIMAL(18,2) NOT NULL,
    "status" "StatusReservaStock" NOT NULL DEFAULT 'ATIVA',
    "documentoReferenciaId" TEXT,
    "documentoReferenciaTipo" TEXT,
    "expiradoEm" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservaStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoriaAtivo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "categoriaPaiId" TEXT,
    "metodoAmortizacao" "MetodoAmortizacao" NOT NULL DEFAULT 'LINEAR',
    "vidaUtilAnos" INTEGER NOT NULL,
    "valorResidualPct" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "intervaloPreventivaDias" INTEGER,
    "alertaManutencaoDias" INTEGER,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CategoriaAtivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ativo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigoInterno" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "categoriaId" TEXT NOT NULL,
    "numeroSerie" TEXT,
    "modelo" TEXT,
    "marca" TEXT,
    "fornecedorId" TEXT,
    "dataAquisicao" TIMESTAMP(3) NOT NULL,
    "valorCompra" DECIMAL(18,2) NOT NULL,
    "valorResidual" DECIMAL(18,2),
    "vidaUtilAnos" INTEGER NOT NULL,
    "dataSubstituicao" TIMESTAMP(3),
    "estado" "EstadoAtivo" NOT NULL DEFAULT 'NOVO',
    "localizacaoId" TEXT NOT NULL,
    "responsavelId" TEXT,
    "departamentoId" TEXT,
    "projetoId" TEXT,
    "metodoAmortizacao" "MetodoAmortizacao" NOT NULL DEFAULT 'LINEAR',
    "qrCode" TEXT,
    "codigoBarras" TEXT,
    "rfidTag" TEXT,
    "observacoes" TEXT,
    "garantiaDataInicio" TIMESTAMP(3),
    "garantiaDataFim" TIMESTAMP(3),
    "garantiaFornecedor" TEXT,
    "garantiaTermos" TEXT,
    "imagens" TEXT[],
    "criadoPor" TEXT NOT NULL,
    "atualizadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Ativo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoAtivo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ativoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoDocumentoAtivo" NOT NULL,
    "url" TEXT NOT NULL,
    "dataUpload" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoAtivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MovimentacaoAtivo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ativoId" TEXT NOT NULL,
    "tipo" "TipoMovimentacaoAtivo" NOT NULL,
    "localizacaoOrigemId" TEXT,
    "localizacaoDestinoId" TEXT,
    "responsavelOrigemId" TEXT,
    "responsavelDestinoId" TEXT,
    "dataMovimentacao" TIMESTAMP(3) NOT NULL,
    "dataPrevisaoDevolucao" TIMESTAMP(3),
    "motivo" TEXT NOT NULL,
    "observacoes" TEXT,
    "guiaMovimentacao" TEXT,
    "assinaturaDigital" TEXT,
    "termoResponsabilidade" TEXT,
    "confirmada" BOOLEAN NOT NULL DEFAULT false,
    "dataConfirmacao" TIMESTAMP(3),
    "confirmadaPor" TEXT,
    "criadoPor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MovimentacaoAtivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManutencaoAtivo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ativoId" TEXT NOT NULL,
    "tipo" "TipoManutencaoAtivo" NOT NULL,
    "status" "StatusManutencaoAtivo" NOT NULL DEFAULT 'AGENDADA',
    "prioridade" "PrioridadeManutencao",
    "dataAgendada" TIMESTAMP(3) NOT NULL,
    "dataInicio" TIMESTAMP(3),
    "dataConclusao" TIMESTAMP(3),
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "procedimentos" TEXT,
    "tecnicoId" TEXT,
    "responsavelId" TEXT,
    "fornecedorId" TEXT,
    "custoEstimado" DECIMAL(18,2),
    "custoReal" DECIMAL(18,2),
    "custoMaoObra" DECIMAL(18,2),
    "custoPecas" DECIMAL(18,2),
    "proximaManutencao" TIMESTAMP(3),
    "intervaloProximaManutencaoDias" INTEGER,
    "relatorio" TEXT,
    "fotos" TEXT[],
    "anexos" TEXT[],
    "observacoes" TEXT,
    "motivoCancelamento" TEXT,
    "criadoPor" TEXT NOT NULL,
    "atualizadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManutencaoAtivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PecaManutencao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "manutencaoId" TEXT NOT NULL,
    "produtoId" TEXT,
    "nome" TEXT NOT NULL,
    "quantidade" DECIMAL(18,2) NOT NULL,
    "custoUnitario" DECIMAL(18,2) NOT NULL,
    "custoTotal" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "PecaManutencao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmortizacaoCalculo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ativoId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "valorInicial" DECIMAL(18,2) NOT NULL,
    "valorResidual" DECIMAL(18,2) NOT NULL,
    "vidaUtilAnos" INTEGER NOT NULL,
    "valorAmortizacaoMensal" DECIMAL(18,2) NOT NULL,
    "valorAmortizadoAcumulado" DECIMAL(18,2) NOT NULL,
    "valorLiquidoContabilistico" DECIMAL(18,2) NOT NULL,
    "metodoAmortizacao" "MetodoAmortizacao" NOT NULL,
    "contaDebitoId" TEXT,
    "contaCreditoId" TEXT,
    "lancamentoContabilId" TEXT,
    "processadoPor" TEXT NOT NULL,
    "processadoEm" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmortizacaoCalculo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventarioFisico" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "status" "StatusInventarioFisico" NOT NULL DEFAULT 'PLANEJADO',
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataPrevistaConclusao" TIMESTAMP(3),
    "dataConclusao" TIMESTAMP(3),
    "localizacaoId" TEXT,
    "responsavelId" TEXT NOT NULL,
    "localizacoesIncluidas" TEXT[],
    "categoriasIncluidas" TEXT[],
    "totalAtivosEsperados" INTEGER,
    "totalAtivosContados" INTEGER,
    "totalDiscrepancias" INTEGER,
    "ajustesRealizados" BOOLEAN NOT NULL DEFAULT false,
    "dataAjustes" TIMESTAMP(3),
    "observacoes" TEXT,
    "relatorio" TEXT,
    "motivoCancelamento" TEXT,
    "criadoPor" TEXT NOT NULL,
    "atualizadoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventarioFisico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembroEquipeInventario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inventarioId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "localizacoesAtribuidas" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MembroEquipeInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContagemInventario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inventarioId" TEXT NOT NULL,
    "ativoId" TEXT NOT NULL,
    "localizacaoEsperadaId" TEXT NOT NULL,
    "responsavelEsperadoId" TEXT,
    "estadoEsperado" "EstadoAtivo" NOT NULL,
    "encontrado" BOOLEAN NOT NULL DEFAULT false,
    "localizacaoEncontradaId" TEXT,
    "responsavelEncontradoId" TEXT,
    "estadoEncontrado" "EstadoAtivo",
    "dataContagem" TIMESTAMP(3),
    "contadoPorId" TEXT,
    "observacoesContagem" TEXT,
    "fotoContagem" TEXT,
    "temDiscrepancia" BOOLEAN NOT NULL DEFAULT false,
    "tipoDiscrepancia" "TipoDiscrepanciaInventario",
    "justificativaDiscrepancia" TEXT,
    "ajusteRealizado" BOOLEAN NOT NULL DEFAULT false,
    "dataAjuste" TIMESTAMP(3),
    "ajustadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContagemInventario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Viatura" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "matricula" TEXT NOT NULL,
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "tipoViatura" "TipoViatura" NOT NULL,
    "capacidade" DECIMAL(10,2) NOT NULL,
    "unidadeCapacidade" "UnidadeCapacidade" NOT NULL,
    "localActividade" TEXT NOT NULL,
    "dataInicioActividade" TIMESTAMP(3) NOT NULL,
    "motoristaResponsavelId" TEXT,
    "estado" "EstadoViatura" NOT NULL DEFAULT 'DISPONIVEL',
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Viatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoViatura" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "viaturaId" TEXT NOT NULL,
    "tipo" "TipoDocumentoViatura" NOT NULL,
    "numero" TEXT NOT NULL,
    "dataEmissao" TIMESTAMP(3) NOT NULL,
    "dataValidade" TIMESTAMP(3) NOT NULL,
    "entidadeEmissora" TEXT NOT NULL,
    "estado" "EstadoDocumento" NOT NULL DEFAULT 'VALIDO',
    "prazoAlertaDias" INTEGER NOT NULL DEFAULT 30,
    "anexo" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentoViatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManutencaoViatura" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "viaturaId" TEXT NOT NULL,
    "tipo" "TipoManutencaoViatura" NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "quilometragem" INTEGER,
    "criterio" TEXT,
    "descricao" TEXT NOT NULL,
    "fornecedor" TEXT,
    "custo" DECIMAL(18,2),
    "pecasSubstituidas" TEXT,
    "responsavel" TEXT NOT NULL,
    "proximaManutencaoData" TIMESTAMP(3),
    "proximaManutencaoKm" INTEGER,
    "proximaManutencaoCriterio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManutencaoViatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checklist" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "viaturaId" TEXT NOT NULL,
    "tipoViatura" "TipoViatura" NOT NULL,
    "responsavel" TEXT NOT NULL,
    "responsavelId" TEXT,
    "dataInspeccao" TIMESTAMP(3) NOT NULL,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Checklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemChecklist" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "categoria" "CategoriaItemChecklist" NOT NULL,
    "estado" "EstadoItemChecklist" NOT NULL,
    "observacoes" TEXT,

    CONSTRAINT "ItemChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Motorista" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nomeCompleto" TEXT NOT NULL,
    "contacto" TEXT NOT NULL,
    "morada" TEXT,
    "numeroBI" TEXT,
    "numeroCarta" TEXT NOT NULL,
    "categoriaCarta" TEXT[],
    "dataEmissaoCarta" TIMESTAMP(3) NOT NULL,
    "validadeCarta" TIMESTAMP(3) NOT NULL,
    "localActividade" TEXT,
    "estadoOperacional" "EstadoOperacionalMotorista" NOT NULL DEFAULT 'ACTIVO',
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Motorista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoMotorista" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "motoristaId" TEXT NOT NULL,
    "tipo" "TipoDocumentoMotorista" NOT NULL,
    "numero" TEXT NOT NULL,
    "dataEmissao" TIMESTAMP(3) NOT NULL,
    "dataValidade" TIMESTAMP(3) NOT NULL,
    "entidadeEmissora" TEXT NOT NULL,
    "estado" "EstadoDocumento" NOT NULL DEFAULT 'VALIDO',
    "anexo" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentoMotorista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisponibilidadeMotorista" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "motoristaId" TEXT NOT NULL,
    "disponivel" BOOLEAN NOT NULL DEFAULT true,
    "motivo" "MotivoIndisponibilidade",
    "dataInicio" TIMESTAMP(3),
    "dataFim" TIMESTAMP(3),
    "fonte" "FonteDisponibilidade" NOT NULL DEFAULT 'MANUAL',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisponibilidadeMotorista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Atividade" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "tipoActividade" "TipoActividade" NOT NULL,
    "localActividade" TEXT NOT NULL,
    "dataInicioPrevista" TIMESTAMP(3) NOT NULL,
    "dataConclusaoPrevista" TIMESTAMP(3),
    "dataInicioReal" TIMESTAMP(3),
    "dataConclusaoReal" TIMESTAMP(3),
    "motoristaResponsavelId" TEXT,
    "viaturaId" TEXT,
    "prioridade" "PrioridadeAtividade" NOT NULL DEFAULT 'MEDIA',
    "estado" "EstadoAtividade" NOT NULL DEFAULT 'PLANEADA',
    "observacoes" TEXT,
    "anexos" TEXT[],
    "criadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Atividade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoAtividade" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "atividadeId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estadoAnterior" "EstadoAtividade",
    "estadoNovo" "EstadoAtividade" NOT NULL,
    "utilizadorId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,

    CONSTRAINT "EventoAtividade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rota" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "viaturaId" TEXT,
    "motoristaId" TEXT,
    "origem" TEXT NOT NULL,
    "destino" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3),
    "estado" "EstadoRota" NOT NULL DEFAULT 'PLANEADA',
    "distanciaTotal" DECIMAL(10,2),
    "tempoEstimadoMin" INTEGER,
    "tempoRealMin" INTEGER,
    "custoEstimado" DECIMAL(18,2),
    "custoReal" DECIMAL(18,2),
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PontoEntrega" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rotaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "tipo" "TipoPontoRota" NOT NULL DEFAULT 'ENTREGA',
    "clienteId" TEXT,
    "clienteNome" TEXT,
    "endereco" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "horaEstimada" TIMESTAMP(3),
    "horaChegada" TIMESTAMP(3),
    "horaSaida" TIMESTAMP(3),
    "estado" "EstadoPontoRota" NOT NULL DEFAULT 'PENDENTE',
    "entregaId" TEXT,
    "observacoes" TEXT,

    CONSTRAINT "PontoEntrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Entrega" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "vendaId" TEXT,
    "clienteId" TEXT NOT NULL,
    "clienteNome" TEXT NOT NULL,
    "clienteTelefone" TEXT NOT NULL,
    "enderecoEntrega" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "rotaId" TEXT,
    "viaturaId" TEXT,
    "motoristaId" TEXT,
    "dataAgendada" TIMESTAMP(3) NOT NULL,
    "dataEntrega" TIMESTAMP(3),
    "estado" "EstadoEntrega" NOT NULL DEFAULT 'PENDENTE',
    "prioridade" "PrioridadeEntrega" NOT NULL DEFAULT 'NORMAL',
    "pesoTotal" DECIMAL(10,3) NOT NULL,
    "volumeTotal" DECIMAL(10,3) NOT NULL,
    "valorCarga" DECIMAL(18,2) NOT NULL,
    "taxaEntrega" DECIMAL(18,2) NOT NULL,
    "comprovanteTipo" "TipoProvaEntrega",
    "comprovanteDados" TEXT,
    "comprovanteDataHora" TIMESTAMP(3),
    "comprovanteRecebedor" TEXT,
    "motivoFalha" TEXT,
    "tentativasEntrega" INTEGER NOT NULL DEFAULT 0,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Entrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemEntrega" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entregaId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "produtoNome" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "peso" DECIMAL(10,3) NOT NULL,
    "volume" DECIMAL(10,3) NOT NULL,
    "valor" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ItemEntrega_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Abastecimento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "viaturaId" TEXT NOT NULL,
    "motoristaId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "kmVeiculo" INTEGER NOT NULL,
    "tipoCombustivel" "TipoCombustivel" NOT NULL,
    "litros" DECIMAL(10,3) NOT NULL,
    "valorLitro" DECIMAL(18,2) NOT NULL,
    "valorTotal" DECIMAL(18,2) NOT NULL,
    "posto" TEXT,
    "notaFiscal" TEXT,
    "kmPercorrido" INTEGER,
    "consumoMedio" DECIMAL(6,2),
    "observacoes" TEXT,
    "rotaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Abastecimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ticket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "tipo" "TipoTicket" NOT NULL,
    "categoriaId" TEXT,
    "subcategoria" TEXT,
    "prioridade" "PrioridadeTicket" NOT NULL DEFAULT 'NORMAL',
    "estado" "EstadoTicket" NOT NULL DEFAULT 'ABERTO',
    "solicitanteId" TEXT NOT NULL,
    "solicitanteNome" TEXT NOT NULL,
    "solicitanteEmail" TEXT NOT NULL,
    "solicitanteTelefone" TEXT,
    "atribuidoParaId" TEXT,
    "atribuidoParaNome" TEXT,
    "equipeId" TEXT,
    "origemTipo" TEXT,
    "origemId" TEXT,
    "slaTempoResposta" INTEGER NOT NULL,
    "slaTempoResolucao" INTEGER NOT NULL,
    "slaDataLimiteResposta" TIMESTAMP(3) NOT NULL,
    "slaDataLimiteResolucao" TIMESTAMP(3) NOT NULL,
    "slaEmAtraso" BOOLEAN NOT NULL DEFAULT false,
    "dataAbertura" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataPrimeiraResposta" TIMESTAMP(3),
    "dataResolucao" TIMESTAMP(3),
    "dataFechamento" TIMESTAMP(3),
    "tempoRespostaMin" INTEGER,
    "tempoResolucaoMin" INTEGER,
    "tempoTotalMin" INTEGER,
    "tags" TEXT[],
    "avaliacaoNota" INTEGER,
    "avaliacaoComentario" TEXT,
    "avaliacaoData" TIMESTAMP(3),
    "avaliadoPorId" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtividadeTicket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "tipo" "TipoAtividadeTicket" NOT NULL,
    "descricao" TEXT NOT NULL,
    "detalhes" TEXT,
    "autorId" TEXT NOT NULL,
    "autorNome" TEXT NOT NULL,
    "visibilidade" "VisibilidadeAtividadeTicket" NOT NULL DEFAULT 'PUBLICA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtividadeTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoriaTicket" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "icone" TEXT,
    "cor" TEXT,
    "subcategorias" TEXT[],
    "slaTempoResposta" INTEGER NOT NULL,
    "slaTempoResolucao" INTEGER NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CategoriaTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipeSuporte" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "categorias" TEXT[],
    "horarioInicio" TEXT NOT NULL,
    "horarioFim" TEXT NOT NULL,
    "diasSemana" INTEGER[],
    "estado" "EstadoEquipeSuporte" NOT NULL DEFAULT 'ATIVA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipeSuporte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembroEquipeSuporte" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "equipeId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "papel" "PapelMembroEquipeSuporte" NOT NULL,
    "especialidades" TEXT[],
    "ticketsAtivos" INTEGER NOT NULL DEFAULT 0,
    "ticketsResolvidos" INTEGER NOT NULL DEFAULT 0,
    "avaliacaoMedia" DECIMAL(3,2),
    "estado" "EstadoMembroEquipeSuporte" NOT NULL DEFAULT 'DISPONIVEL',
    "dataEntrada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MembroEquipeSuporte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaseConhecimento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "resumo" TEXT,
    "categoria" TEXT NOT NULL,
    "tags" TEXT[],
    "anexos" JSONB,
    "visibilidade" "VisibilidadeAtividadeTicket" NOT NULL DEFAULT 'PUBLICA',
    "util" INTEGER NOT NULL DEFAULT 0,
    "naoUtil" INTEGER NOT NULL DEFAULT 0,
    "visualizacoes" INTEGER NOT NULL DEFAULT 0,
    "autorId" TEXT NOT NULL,
    "autorNome" TEXT NOT NULL,
    "estado" "EstadoBaseConhecimento" NOT NULL DEFAULT 'RASCUNHO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BaseConhecimento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Departamento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "departamentoPaiId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Departamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cargo" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "departamentoId" TEXT,
    "nivelSalarial" INTEGER,
    "salarioMinimo" DECIMAL(18,2),
    "salarioMaximo" DECIMAL(18,2),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Colaborador" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "dataNascimento" TIMESTAMP(3) NOT NULL,
    "genero" "GeneroColaborador" NOT NULL,
    "estadoCivil" "EstadoCivil" NOT NULL,
    "nacionalidade" TEXT NOT NULL,
    "naturalidadeProvincia" TEXT NOT NULL,
    "naturalidadeDistrito" TEXT NOT NULL,
    "bi" TEXT NOT NULL,
    "nuit" TEXT NOT NULL,
    "niss" TEXT,
    "email" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "telefoneAlternativo" TEXT,
    "enderecoRua" TEXT NOT NULL,
    "enderecoNumero" TEXT NOT NULL,
    "enderecoBairro" TEXT NOT NULL,
    "enderecoCidade" TEXT NOT NULL,
    "enderecoProvincia" TEXT NOT NULL,
    "enderecoCodigoPostal" TEXT,
    "emergenciaNome" TEXT NOT NULL,
    "emergenciaParentesco" TEXT NOT NULL,
    "emergenciaTelefone" TEXT NOT NULL,
    "fotoUrl" TEXT,
    "departamentoId" TEXT,
    "cargoId" TEXT,
    "supervisorId" TEXT,
    "dataAdmissao" TIMESTAMP(3) NOT NULL,
    "dataDemissao" TIMESTAMP(3),
    "status" "StatusColaborador" NOT NULL,
    "tipoContrato" "TipoContratoTrabalho" NOT NULL,
    "regimeTrabalho" "RegimeTrabalho" NOT NULL,
    "horarioTrabalho" TEXT,
    "salarioBase" DECIMAL(18,2) NOT NULL,
    "subsidioAlimentacao" DECIMAL(18,2),
    "subsidioTransporte" DECIMAL(18,2),
    "subsidioHabitacao" DECIMAL(18,2),
    "subsidiosOutros" DECIMAL(18,2),
    "localizacao" TEXT,
    "bancoBanco" TEXT,
    "bancoNib" TEXT,
    "bancoTitular" TEXT,
    "nivelAcesso" "NivelAcessoColaborador" NOT NULL,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Colaborador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormacaoAcademica" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "nivel" "NivelFormacaoAcademica" NOT NULL,
    "instituicao" TEXT NOT NULL,
    "curso" TEXT NOT NULL,
    "anoConclusao" TEXT NOT NULL,
    "certificadoUrl" TEXT,

    CONSTRAINT "FormacaoAcademica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperienciaProfissional" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "empresa" TEXT NOT NULL,
    "cargo" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3),
    "responsabilidades" TEXT,
    "actual" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ExperienciaProfissional_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentoColaborador" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "tipo" "TipoDocColaborador" NOT NULL,
    "nome" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "tamanho" INTEGER,
    "dataUpload" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentoColaborador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ferias" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "periodoAquisitivoInicio" TIMESTAMP(3) NOT NULL,
    "periodoAquisitivoFim" TIMESTAMP(3) NOT NULL,
    "diasDisponiveis" INTEGER NOT NULL,
    "diasUsados" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ferias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SolicitacaoFerias" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "feriasId" TEXT NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "diasSolicitados" INTEGER NOT NULL,
    "tipo" "TipoSolicitacaoFerias" NOT NULL,
    "status" "StatusSolicitacaoFerias" NOT NULL,
    "aprovadoPorId" TEXT,
    "dataAprovacao" TIMESTAMP(3),
    "motivoRejeicao" TEXT,
    "observacoes" TEXT,
    "dataSolicitacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SolicitacaoFerias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ausencia" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "tipo" "TipoAusencia" NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "diasAusencia" INTEGER NOT NULL,
    "justificada" BOOLEAN NOT NULL DEFAULT false,
    "justificativa" TEXT,
    "status" "StatusAusencia" NOT NULL,
    "aprovadoPorId" TEXT,
    "dataAprovacao" TIMESTAMP(3),
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ausencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistoAssiduidade" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "entrada" TIMESTAMP(3) NOT NULL,
    "saidaAlmoco" TIMESTAMP(3),
    "retornoAlmoco" TIMESTAMP(3),
    "saida" TIMESTAMP(3) NOT NULL,
    "horasTrabalhadas" DECIMAL(9,6) NOT NULL,
    "horasExtras" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "atrasos" INTEGER NOT NULL DEFAULT 0,
    "tipo" "TipoAssiduidade" NOT NULL,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistoAssiduidade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Avaliacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "avaliadorId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "tipo" "TipoAvaliacao" NOT NULL,
    "status" "StatusAvaliacao" NOT NULL,
    "notaFinal" DECIMAL(9,6),
    "pontosFortes" TEXT[],
    "pontosDesenvolvimento" TEXT[],
    "planoAcao" TEXT[],
    "comentarios" TEXT,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataConclusao" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Avaliacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriterioAvaliacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "avaliacaoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "peso" DECIMAL(9,6) NOT NULL,
    "nota" DECIMAL(9,6) NOT NULL,
    "comentario" TEXT,

    CONSTRAINT "CriterioAvaliacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Formacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "instrutor" TEXT NOT NULL,
    "cargaHoraria" INTEGER NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFim" TIMESTAMP(3) NOT NULL,
    "local" TEXT NOT NULL,
    "modalidade" "ModalidadeFormacao" NOT NULL,
    "vagasDisponiveis" INTEGER NOT NULL,
    "status" "StatusFormacao" NOT NULL,
    "custoTotal" DECIMAL(18,2) NOT NULL,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Formacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipanteFormacao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "formacaoId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "status" "StatusParticipante" NOT NULL,
    "notaFinal" DECIMAL(9,6),
    "certificadoUrl" TEXT,
    "dataInscricao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParticipanteFormacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payroll" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "mesReferencia" INTEGER NOT NULL,
    "anoReferencia" INTEGER NOT NULL,
    "salarioBruto" DECIMAL(18,2) NOT NULL,
    "descontoInss" DECIMAL(18,2) NOT NULL,
    "descontoIrps" DECIMAL(18,2) NOT NULL,
    "descontoOutros" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "proventoHorasExtras" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "proventoSubAlimentacao" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "proventoSubTransporte" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "proventoSubHabitacao" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "proventoComissoes" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "proventoBonus" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "proventoOutros" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "salarioLiquido" DECIMAL(18,2) NOT NULL,
    "status" "StatusPayroll" NOT NULL,
    "dataPagamento" TIMESTAMP(3),
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payroll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "status" "StatusEquipa" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MembroEquipa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "equipaId" TEXT NOT NULL,
    "colaboradorId" TEXT NOT NULL,
    "papel" "PapelMembroEquipa" NOT NULL,
    "custoHora" DECIMAL(18,2) NOT NULL,
    "horasSemanais" INTEGER NOT NULL,
    "dataEntrada" TIMESTAMP(3) NOT NULL,
    "dataSaida" TIMESTAMP(3),
    "status" "StatusMembroEquipa" NOT NULL,

    CONSTRAINT "MembroEquipa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Projeto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "clienteId" TEXT,
    "tipo" "TipoProjeto" NOT NULL,
    "status" "StatusProjeto" NOT NULL,
    "prioridade" "PrioridadeProjeto" NOT NULL,
    "dataInicio" TIMESTAMP(3) NOT NULL,
    "dataFimPrevista" TIMESTAMP(3) NOT NULL,
    "dataFimReal" TIMESTAMP(3),
    "progresso" INTEGER NOT NULL DEFAULT 0,
    "orcamentoPlanejado" DECIMAL(18,2),
    "horasEstimadas" INTEGER,
    "gerenteId" TEXT,
    "tags" TEXT[],
    "cor" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Projeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjetoEquipa" (
    "tenantId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "equipaId" TEXT NOT NULL,

    CONSTRAINT "ProjetoEquipa_pkey" PRIMARY KEY ("projetoId","equipaId")
);

-- CreateTable
CREATE TABLE "TarefaProjeto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo" "TipoTarefa" NOT NULL,
    "status" "StatusTarefa" NOT NULL,
    "prioridade" "PrioridadeTarefa" NOT NULL,
    "posicao" TEXT NOT NULL DEFAULT '0.5',
    "dataInicio" TIMESTAMP(3),
    "dataFimPrevista" TIMESTAMP(3) NOT NULL,
    "dataFimReal" TIMESTAMP(3),
    "horasEstimadas" INTEGER,
    "horasTrabalhadas" INTEGER NOT NULL DEFAULT 0,
    "progresso" INTEGER NOT NULL DEFAULT 0,
    "responsavelId" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "tarefaPaiId" TEXT,
    "dependencias" TEXT[],
    "tags" TEXT[],
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TarefaProjeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComentarioTarefa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tarefaId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "editado" BOOLEAN NOT NULL DEFAULT false,
    "dataEdicao" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComentarioTarefa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnexoTarefa" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tarefaId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "uploadPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnexoTarefa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Timesheet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "tarefaId" TEXT,
    "colaboradorId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "horaInicio" TIMESTAMP(3) NOT NULL,
    "horaFim" TIMESTAMP(3) NOT NULL,
    "duracaoHoras" DECIMAL(9,6) NOT NULL,
    "descricao" TEXT,
    "tipo" "TipoTimesheet" NOT NULL,
    "faturavel" BOOLEAN NOT NULL DEFAULT false,
    "aprovado" BOOLEAN NOT NULL DEFAULT false,
    "aprovadoPorId" TEXT,
    "dataAprovacao" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Timesheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Marco" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "dataPrevista" TIMESTAMP(3) NOT NULL,
    "dataReal" TIMESTAMP(3),
    "status" "StatusMilestone" NOT NULL,
    "progresso" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Marco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrcamentoProjeto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "status" "StatusOrcamento" NOT NULL,
    "totalPlanejado" DECIMAL(18,2) NOT NULL,
    "totalUtilizado" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "aprovadoPorId" TEXT,
    "dataAprovacao" TIMESTAMP(3),
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrcamentoProjeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoriaOrcamento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orcamentoProjetoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoCategoriaOrcamento" NOT NULL,
    "valorPlanejado" DECIMAL(18,2) NOT NULL,
    "valorUtilizado" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "CategoriaOrcamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemOrcamento" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "categoriaOrcamentoId" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL(18,2) NOT NULL,
    "valorUnitario" DECIMAL(18,2) NOT NULL,
    "valorTotal" DECIMAL(18,2) NOT NULL,
    "fornecedor" TEXT,
    "dataCompra" TIMESTAMP(3),
    "observacoes" TEXT,

    CONSTRAINT "ItemOrcamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CentroTrabalho" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoCentroTrabalho" NOT NULL,
    "descricao" TEXT,
    "capacidadeHorasDia" DECIMAL(9,6),
    "custoHora" DECIMAL(18,2) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CentroTrabalho_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstruturaProduto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "versao" TEXT NOT NULL,
    "status" "StatusBOM" NOT NULL,
    "categoria" TEXT,
    "unidadeProducao" TEXT NOT NULL,
    "tempoProducao" INTEGER,
    "nivelComplexidade" "ComplexidadeBOM",
    "responsavelId" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstruturaProduto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComponenteBOM" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "estruturaProdutoId" TEXT NOT NULL,
    "componenteProdutoId" TEXT NOT NULL,
    "codigoComponente" TEXT NOT NULL,
    "nomeComponente" TEXT NOT NULL,
    "categoria" "CategoriaBOM" NOT NULL,
    "quantidade" DECIMAL(18,2) NOT NULL,
    "unidadeMedida" TEXT NOT NULL,
    "custoUnitario" DECIMAL(18,2) NOT NULL,
    "nivel" INTEGER NOT NULL DEFAULT 1,
    "perdaPrevista" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "tempoLead" INTEGER,
    "fornecedorPrincipalId" TEXT,
    "componentePaiId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComponenteBOM_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Roteiro" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "estruturaProdutoId" TEXT,
    "versao" TEXT NOT NULL,
    "status" "StatusRoteiro" NOT NULL,
    "categoria" TEXT,
    "eficienciaGlobal" DECIMAL(9,6),
    "responsavelId" TEXT,
    "aprovadoPorId" TEXT,
    "dataAprovacao" TIMESTAMP(3),
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Roteiro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperacaoRoteiro" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "roteiroId" TEXT NOT NULL,
    "sequencia" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "centroTrabalhoId" TEXT,
    "maquina" TEXT,
    "tempoPreparacao" INTEGER NOT NULL,
    "tempoOperacao" INTEGER NOT NULL,
    "tempoLimpeza" INTEGER NOT NULL,
    "custoHora" DECIMAL(18,2) NOT NULL,
    "eficienciaEsperada" DECIMAL(9,6) NOT NULL,
    "dependencias" TEXT[],
    "paralela" BOOLEAN NOT NULL DEFAULT false,
    "obrigatoria" BOOLEAN NOT NULL DEFAULT true,
    "instrucoes" TEXT,
    "ferramentasNecessarias" TEXT[],
    "qualificacoesRequeridas" TEXT[],
    "status" "StatusOperacaoRoteiro" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperacaoRoteiro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdemProducao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "codigoProduto" TEXT NOT NULL,
    "nomeProduto" TEXT NOT NULL,
    "quantidade" DECIMAL(18,2) NOT NULL,
    "unidadeMedida" TEXT NOT NULL,
    "status" "StatusOrdemProducao" NOT NULL,
    "prioridade" "PrioridadeOrdemProducao" NOT NULL,
    "roteiroId" TEXT,
    "lote" TEXT,
    "numeroSerie" TEXT,
    "responsavelId" TEXT,
    "dataPrevisaoInicio" TIMESTAMP(3) NOT NULL,
    "dataPrevisaoFim" TIMESTAMP(3) NOT NULL,
    "dataInicioReal" TIMESTAMP(3),
    "dataFimReal" TIMESTAMP(3),
    "custoEstimado" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "custoRealizado" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "progresso" INTEGER NOT NULL DEFAULT 0,
    "qualidadeAprovada" BOOLEAN NOT NULL DEFAULT false,
    "pedidoVendaId" TEXT,
    "clienteId" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrdemProducao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperacaoOrdem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ordemProducaoId" TEXT NOT NULL,
    "sequencia" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "centroTrabalhoId" TEXT,
    "maquina" TEXT,
    "colaboradorId" TEXT,
    "status" "StatusOperacaoOrdem" NOT NULL,
    "tempoEstimado" INTEGER NOT NULL,
    "tempoRealizado" INTEGER NOT NULL DEFAULT 0,
    "dataInicio" TIMESTAMP(3),
    "dataFim" TIMESTAMP(3),
    "qualidadeAprovada" BOOLEAN NOT NULL DEFAULT false,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperacaoOrdem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumoProducao" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ordemProducaoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "codigoProduto" TEXT NOT NULL,
    "nomeProduto" TEXT NOT NULL,
    "quantidadePrevista" DECIMAL(18,2) NOT NULL,
    "quantidadeReal" DECIMAL(18,2) NOT NULL,
    "unidadeMedida" TEXT NOT NULL,
    "custoUnitario" DECIMAL(18,2) NOT NULL,
    "custoTotal" DECIMAL(18,2) NOT NULL,
    "reservaId" TEXT,
    "movimentoStockId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumoProducao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracaoFiscal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planoAssinatura" "PlanoAssinatura" NOT NULL DEFAULT 'BASICO',
    "statusAtivo" BOOLEAN NOT NULL DEFAULT true,
    "email" TEXT,
    "telefone" TEXT,
    "endereco" TEXT,
    "cidade" TEXT,
    "provincia" TEXT,
    "codigoPostal" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Maputo',
    "moedaBase" TEXT NOT NULL DEFAULT 'MZN',
    "regimeIva" "RegimeIva" NOT NULL DEFAULT 'NORMAL',
    "taxaIvaDefault" DECIMAL(9,6) NOT NULL DEFAULT 0.160000,
    "logoEmpresa" TEXT,
    "assinaturaDigital" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracaoFiscal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nuit" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_tenantId_ativo_idx" ON "User"("tenantId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE INDEX "Role_tenantId_idx" ON "Role"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_tenantId_nome_key" ON "Role"("tenantId", "nome");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entity_entityId_idx" ON "AuditLog"("tenantId", "entity", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_tenantId_idx" ON "PasswordResetToken"("tenantId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_token_idx" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "UserInvite_token_key" ON "UserInvite"("token");

-- CreateIndex
CREATE INDEX "UserInvite_tenantId_email_idx" ON "UserInvite"("tenantId", "email");

-- CreateIndex
CREATE INDEX "UserInvite_token_idx" ON "UserInvite"("token");

-- CreateIndex
CREATE INDEX "LoginAttempt_email_createdAt_idx" ON "LoginAttempt"("email", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_ip_createdAt_idx" ON "LoginAttempt"("ip", "createdAt");

-- CreateIndex
CREATE INDEX "Cliente_tenantId_status_idx" ON "Cliente"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Cliente_tenantId_categoria_idx" ON "Cliente"("tenantId", "categoria");

-- CreateIndex
CREATE INDEX "Cliente_tenantId_tipo_idx" ON "Cliente"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "Cliente_tenantId_nome_idx" ON "Cliente"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "Cliente_tenantId_deletedAt_idx" ON "Cliente"("tenantId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_tenantId_codigo_key" ON "Cliente"("tenantId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_tenantId_nuit_key" ON "Cliente"("tenantId", "nuit");

-- CreateIndex
CREATE INDEX "EnderecoCliente_tenantId_clienteId_idx" ON "EnderecoCliente"("tenantId", "clienteId");

-- CreateIndex
CREATE INDEX "EnderecoCliente_clienteId_principal_idx" ON "EnderecoCliente"("clienteId", "principal");

-- CreateIndex
CREATE INDEX "ContactoCliente_tenantId_clienteId_idx" ON "ContactoCliente"("tenantId", "clienteId");

-- CreateIndex
CREATE INDEX "ContactoCliente_tenantId_clienteId_ativo_idx" ON "ContactoCliente"("tenantId", "clienteId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "SegmentacaoCliente_clienteId_key" ON "SegmentacaoCliente"("clienteId");

-- CreateIndex
CREATE INDEX "SegmentacaoCliente_tenantId_idx" ON "SegmentacaoCliente"("tenantId");

-- CreateIndex
CREATE INDEX "SegmentacaoCliente_tenantId_segmento_idx" ON "SegmentacaoCliente"("tenantId", "segmento");

-- CreateIndex
CREATE INDEX "HistoricoTransacao_tenantId_clienteId_dataTransacao_idx" ON "HistoricoTransacao"("tenantId", "clienteId", "dataTransacao");

-- CreateIndex
CREATE INDEX "HistoricoTransacao_tenantId_tipo_dataTransacao_idx" ON "HistoricoTransacao"("tenantId", "tipo", "dataTransacao");

-- CreateIndex
CREATE INDEX "SessaoPOS_tenantId_status_idx" ON "SessaoPOS"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SessaoPOS_tenantId_vendedorId_idx" ON "SessaoPOS"("tenantId", "vendedorId");

-- CreateIndex
CREATE INDEX "SessaoPOS_tenantId_sessaoCaixaId_idx" ON "SessaoPOS"("tenantId", "sessaoCaixaId");

-- CreateIndex
CREATE INDEX "Venda_tenantId_status_idx" ON "Venda"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Venda_tenantId_origem_status_idx" ON "Venda"("tenantId", "origem", "status");

-- CreateIndex
CREATE INDEX "Venda_tenantId_clienteId_idx" ON "Venda"("tenantId", "clienteId");

-- CreateIndex
CREATE INDEX "Venda_tenantId_vendedorId_idx" ON "Venda"("tenantId", "vendedorId");

-- CreateIndex
CREATE INDEX "Venda_tenantId_dataVenda_idx" ON "Venda"("tenantId", "dataVenda");

-- CreateIndex
CREATE INDEX "Venda_faturaId_idx" ON "Venda"("faturaId");

-- CreateIndex
CREATE INDEX "Venda_sessaoCaixaId_idx" ON "Venda"("sessaoCaixaId");

-- CreateIndex
CREATE INDEX "Venda_sessaoPOSId_idx" ON "Venda"("sessaoPOSId");

-- CreateIndex
CREATE INDEX "Venda_enderecoEntregaId_idx" ON "Venda"("enderecoEntregaId");

-- CreateIndex
CREATE UNIQUE INDEX "Venda_tenantId_numero_key" ON "Venda"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "ItemVenda_tenantId_vendaId_idx" ON "ItemVenda"("tenantId", "vendaId");

-- CreateIndex
CREATE INDEX "ItemVenda_produtoId_idx" ON "ItemVenda"("produtoId");

-- CreateIndex
CREATE INDEX "PagamentoVenda_tenantId_vendaId_idx" ON "PagamentoVenda"("tenantId", "vendaId");

-- CreateIndex
CREATE INDEX "HistoricoEstadoVenda_tenantId_vendaId_createdAt_idx" ON "HistoricoEstadoVenda"("tenantId", "vendaId", "createdAt");

-- CreateIndex
CREATE INDEX "RegraComissao_tenantId_ativa_idx" ON "RegraComissao"("tenantId", "ativa");

-- CreateIndex
CREATE INDEX "RegraComissao_tenantId_vendedorId_ativa_idx" ON "RegraComissao"("tenantId", "vendedorId", "ativa");

-- CreateIndex
CREATE INDEX "Comissao_tenantId_vendedorId_status_idx" ON "Comissao"("tenantId", "vendedorId", "status");

-- CreateIndex
CREATE INDEX "Comissao_tenantId_vendaId_idx" ON "Comissao"("tenantId", "vendaId");

-- CreateIndex
CREATE INDEX "Comissao_tenantId_status_idx" ON "Comissao"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Comissao_tenantId_pagoEm_idx" ON "Comissao"("tenantId", "pagoEm");

-- CreateIndex
CREATE INDEX "Fornecedor_tenantId_status_idx" ON "Fornecedor"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Fornecedor_tenantId_classificacao_idx" ON "Fornecedor"("tenantId", "classificacao");

-- CreateIndex
CREATE INDEX "Fornecedor_tenantId_deletedAt_idx" ON "Fornecedor"("tenantId", "deletedAt");

-- CreateIndex
CREATE INDEX "Fornecedor_tenantId_createdAt_idx" ON "Fornecedor"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Fornecedor_tenantId_codigo_key" ON "Fornecedor"("tenantId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Fornecedor_tenantId_nuit_key" ON "Fornecedor"("tenantId", "nuit");

-- CreateIndex
CREATE INDEX "EnderecoFornecedor_tenantId_fornecedorId_idx" ON "EnderecoFornecedor"("tenantId", "fornecedorId");

-- CreateIndex
CREATE INDEX "ContactoFornecedor_tenantId_fornecedorId_tipo_idx" ON "ContactoFornecedor"("tenantId", "fornecedorId", "tipo");

-- CreateIndex
CREATE INDEX "DocumentoFornecedor_tenantId_fornecedorId_tipo_idx" ON "DocumentoFornecedor"("tenantId", "fornecedorId", "tipo");

-- CreateIndex
CREATE INDEX "DocumentoFornecedor_tenantId_fornecedorId_dataValidade_idx" ON "DocumentoFornecedor"("tenantId", "fornecedorId", "dataValidade");

-- CreateIndex
CREATE INDEX "AvaliacaoFornecedor_tenantId_fornecedorId_idx" ON "AvaliacaoFornecedor"("tenantId", "fornecedorId");

-- CreateIndex
CREATE INDEX "AvaliacaoFornecedor_avaliadorId_idx" ON "AvaliacaoFornecedor"("avaliadorId");

-- CreateIndex
CREATE INDEX "ConfiguracaoWorkflow_tenantId_tipo_ativo_idx" ON "ConfiguracaoWorkflow"("tenantId", "tipo", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracaoWorkflow_tenantId_nome_key" ON "ConfiguracaoWorkflow"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "NivelAprovacao_tenantId_configuracaoWorkflowId_idx" ON "NivelAprovacao"("tenantId", "configuracaoWorkflowId");

-- CreateIndex
CREATE UNIQUE INDEX "NivelAprovacao_configuracaoWorkflowId_nivel_key" ON "NivelAprovacao"("configuracaoWorkflowId", "nivel");

-- CreateIndex
CREATE INDEX "AprovadorNivel_tenantId_usuarioId_idx" ON "AprovadorNivel"("tenantId", "usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "AprovadorNivel_nivelAprovacaoId_usuarioId_key" ON "AprovadorNivel"("nivelAprovacaoId", "usuarioId");

-- CreateIndex
CREATE INDEX "RequisicaoCompra_tenantId_status_idx" ON "RequisicaoCompra"("tenantId", "status");

-- CreateIndex
CREATE INDEX "RequisicaoCompra_tenantId_createdAt_idx" ON "RequisicaoCompra"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "RequisicaoCompra_solicitanteId_idx" ON "RequisicaoCompra"("solicitanteId");

-- CreateIndex
CREATE INDEX "RequisicaoCompra_centroCustoId_idx" ON "RequisicaoCompra"("centroCustoId");

-- CreateIndex
CREATE UNIQUE INDEX "RequisicaoCompra_tenantId_numero_key" ON "RequisicaoCompra"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "ItemRequisicao_tenantId_requisicaoCompraId_idx" ON "ItemRequisicao"("tenantId", "requisicaoCompraId");

-- CreateIndex
CREATE INDEX "ItemRequisicao_produtoId_idx" ON "ItemRequisicao"("produtoId");

-- CreateIndex
CREATE INDEX "AprovacaoCompra_tenantId_status_idx" ON "AprovacaoCompra"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AprovacaoCompra_requisicaoCompraId_idx" ON "AprovacaoCompra"("requisicaoCompraId");

-- CreateIndex
CREATE INDEX "AprovacaoCompra_pedidoCompraId_idx" ON "AprovacaoCompra"("pedidoCompraId");

-- CreateIndex
CREATE INDEX "AprovacaoCompra_aprovadorId_idx" ON "AprovacaoCompra"("aprovadorId");

-- CreateIndex
CREATE INDEX "Cotacao_tenantId_status_idx" ON "Cotacao"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Cotacao_tenantId_createdAt_idx" ON "Cotacao"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Cotacao_requisicaoCompraId_idx" ON "Cotacao"("requisicaoCompraId");

-- CreateIndex
CREATE INDEX "Cotacao_vencedorFornecedorId_idx" ON "Cotacao"("vencedorFornecedorId");

-- CreateIndex
CREATE UNIQUE INDEX "Cotacao_tenantId_numero_key" ON "Cotacao"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "CotacaoFornecedor_tenantId_cotacaoId_idx" ON "CotacaoFornecedor"("tenantId", "cotacaoId");

-- CreateIndex
CREATE INDEX "CotacaoFornecedor_fornecedorId_idx" ON "CotacaoFornecedor"("fornecedorId");

-- CreateIndex
CREATE UNIQUE INDEX "CotacaoFornecedor_cotacaoId_fornecedorId_key" ON "CotacaoFornecedor"("cotacaoId", "fornecedorId");

-- CreateIndex
CREATE INDEX "ItemCotacao_tenantId_cotacaoId_idx" ON "ItemCotacao"("tenantId", "cotacaoId");

-- CreateIndex
CREATE INDEX "ItemCotacao_produtoId_idx" ON "ItemCotacao"("produtoId");

-- CreateIndex
CREATE INDEX "RespostaItemCotacao_tenantId_itemCotacaoId_idx" ON "RespostaItemCotacao"("tenantId", "itemCotacaoId");

-- CreateIndex
CREATE INDEX "RespostaItemCotacao_cotacaoFornecedorId_idx" ON "RespostaItemCotacao"("cotacaoFornecedorId");

-- CreateIndex
CREATE UNIQUE INDEX "RespostaItemCotacao_itemCotacaoId_cotacaoFornecedorId_key" ON "RespostaItemCotacao"("itemCotacaoId", "cotacaoFornecedorId");

-- CreateIndex
CREATE INDEX "PedidoCompra_tenantId_status_idx" ON "PedidoCompra"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PedidoCompra_tenantId_createdAt_idx" ON "PedidoCompra"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "PedidoCompra_fornecedorId_idx" ON "PedidoCompra"("fornecedorId");

-- CreateIndex
CREATE INDEX "PedidoCompra_requisicaoCompraId_idx" ON "PedidoCompra"("requisicaoCompraId");

-- CreateIndex
CREATE INDEX "PedidoCompra_cotacaoId_idx" ON "PedidoCompra"("cotacaoId");

-- CreateIndex
CREATE INDEX "PedidoCompra_centroCustoId_idx" ON "PedidoCompra"("centroCustoId");

-- CreateIndex
CREATE UNIQUE INDEX "PedidoCompra_tenantId_numero_key" ON "PedidoCompra"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "ItemPedidoCompra_tenantId_pedidoCompraId_idx" ON "ItemPedidoCompra"("tenantId", "pedidoCompraId");

-- CreateIndex
CREATE INDEX "ItemPedidoCompra_produtoId_idx" ON "ItemPedidoCompra"("produtoId");

-- CreateIndex
CREATE INDEX "RecebimentoCompra_tenantId_pedidoCompraId_idx" ON "RecebimentoCompra"("tenantId", "pedidoCompraId");

-- CreateIndex
CREATE INDEX "RecebimentoCompra_tenantId_createdAt_idx" ON "RecebimentoCompra"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "RecebimentoCompra_responsavelId_idx" ON "RecebimentoCompra"("responsavelId");

-- CreateIndex
CREATE INDEX "ItemRecebimento_tenantId_recebimentoCompraId_idx" ON "ItemRecebimento"("tenantId", "recebimentoCompraId");

-- CreateIndex
CREATE INDEX "ItemRecebimento_itemPedidoCompraId_idx" ON "ItemRecebimento"("itemPedidoCompraId");

-- CreateIndex
CREATE INDEX "ContaPagar_tenantId_status_idx" ON "ContaPagar"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ContaPagar_tenantId_dataVencimento_idx" ON "ContaPagar"("tenantId", "dataVencimento");

-- CreateIndex
CREATE INDEX "ContaPagar_fornecedorId_idx" ON "ContaPagar"("fornecedorId");

-- CreateIndex
CREATE INDEX "ContaPagar_pedidoCompraId_idx" ON "ContaPagar"("pedidoCompraId");

-- CreateIndex
CREATE INDEX "ContaPagar_centroCustoId_idx" ON "ContaPagar"("centroCustoId");

-- CreateIndex
CREATE INDEX "ContaPagar_contaContabilId_idx" ON "ContaPagar"("contaContabilId");

-- CreateIndex
CREATE UNIQUE INDEX "ContaPagar_tenantId_numero_key" ON "ContaPagar"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "Pagamento_tenantId_status_idx" ON "Pagamento"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Pagamento_tenantId_dataPagamento_idx" ON "Pagamento"("tenantId", "dataPagamento");

-- CreateIndex
CREATE INDEX "Pagamento_contaPagarId_idx" ON "Pagamento"("contaPagarId");

-- CreateIndex
CREATE INDEX "Pagamento_lancamentoId_idx" ON "Pagamento"("lancamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "Pagamento_tenantId_numero_key" ON "Pagamento"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "CategoriaServico_tenantId_ativo_idx" ON "CategoriaServico"("tenantId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaServico_tenantId_nome_key" ON "CategoriaServico"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "Servico_tenantId_ativo_idx" ON "Servico"("tenantId", "ativo");

-- CreateIndex
CREATE INDEX "Servico_tenantId_tipoServico_idx" ON "Servico"("tenantId", "tipoServico");

-- CreateIndex
CREATE INDEX "Servico_categoriaServicoId_idx" ON "Servico"("categoriaServicoId");

-- CreateIndex
CREATE UNIQUE INDEX "Servico_tenantId_codigo_key" ON "Servico"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "TecnicoServico_tenantId_disponivel_idx" ON "TecnicoServico"("tenantId", "disponivel");

-- CreateIndex
CREATE INDEX "TecnicoServico_colaboradorId_idx" ON "TecnicoServico"("colaboradorId");

-- CreateIndex
CREATE UNIQUE INDEX "TecnicoServico_tenantId_colaboradorId_key" ON "TecnicoServico"("tenantId", "colaboradorId");

-- CreateIndex
CREATE INDEX "AgendamentoServico_tenantId_status_idx" ON "AgendamentoServico"("tenantId", "status");

-- CreateIndex
CREATE INDEX "AgendamentoServico_tenantId_dataAgendamento_idx" ON "AgendamentoServico"("tenantId", "dataAgendamento");

-- CreateIndex
CREATE INDEX "AgendamentoServico_servicoId_idx" ON "AgendamentoServico"("servicoId");

-- CreateIndex
CREATE INDEX "AgendamentoServico_clienteId_idx" ON "AgendamentoServico"("clienteId");

-- CreateIndex
CREATE INDEX "AgendamentoServico_tecnicoId_idx" ON "AgendamentoServico"("tecnicoId");

-- CreateIndex
CREATE UNIQUE INDEX "AgendamentoServico_tenantId_codigo_key" ON "AgendamentoServico"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "AvaliacaoServico_tenantId_servicoId_idx" ON "AvaliacaoServico"("tenantId", "servicoId");

-- CreateIndex
CREATE INDEX "AvaliacaoServico_clienteId_idx" ON "AvaliacaoServico"("clienteId");

-- CreateIndex
CREATE INDEX "AvaliacaoServico_agendamentoServicoId_idx" ON "AvaliacaoServico"("agendamentoServicoId");

-- CreateIndex
CREATE INDEX "ContratoServico_tenantId_status_idx" ON "ContratoServico"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ContratoServico_clienteId_idx" ON "ContratoServico"("clienteId");

-- CreateIndex
CREATE INDEX "ContratoServico_tenantId_dataFim_idx" ON "ContratoServico"("tenantId", "dataFim");

-- CreateIndex
CREATE UNIQUE INDEX "ContratoServico_tenantId_codigo_key" ON "ContratoServico"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "SessaoCaixa_tenantId_status_idx" ON "SessaoCaixa"("tenantId", "status");

-- CreateIndex
CREATE INDEX "SessaoCaixa_tenantId_dataAbertura_idx" ON "SessaoCaixa"("tenantId", "dataAbertura");

-- CreateIndex
CREATE INDEX "SessaoCaixa_tenantId_responsavelId_idx" ON "SessaoCaixa"("tenantId", "responsavelId");

-- CreateIndex
CREATE UNIQUE INDEX "SessaoCaixa_tenantId_numero_key" ON "SessaoCaixa"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "MovimentoCaixa_tenantId_sessaoCaixaId_idx" ON "MovimentoCaixa"("tenantId", "sessaoCaixaId");

-- CreateIndex
CREATE INDEX "MovimentoCaixa_tenantId_tipo_dataMovimento_idx" ON "MovimentoCaixa"("tenantId", "tipo", "dataMovimento");

-- CreateIndex
CREATE INDEX "MovimentoCaixa_tenantId_dataMovimento_idx" ON "MovimentoCaixa"("tenantId", "dataMovimento");

-- CreateIndex
CREATE INDEX "ContaPGC_tenantId_classe_idx" ON "ContaPGC"("tenantId", "classe");

-- CreateIndex
CREATE INDEX "ContaPGC_tenantId_nivel_idx" ON "ContaPGC"("tenantId", "nivel");

-- CreateIndex
CREATE INDEX "ContaPGC_tenantId_ativo_idx" ON "ContaPGC"("tenantId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "ContaPGC_tenantId_codigo_key" ON "ContaPGC"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "Diario_tenantId_tipo_idx" ON "Diario"("tenantId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "Diario_tenantId_codigo_key" ON "Diario"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "CentroCusto_tenantId_tipo_idx" ON "CentroCusto"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "CentroCusto_tenantId_ativo_idx" ON "CentroCusto"("tenantId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "CentroCusto_tenantId_codigo_key" ON "CentroCusto"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "Lancamento_tenantId_status_idx" ON "Lancamento"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Lancamento_tenantId_data_idx" ON "Lancamento"("tenantId", "data");

-- CreateIndex
CREATE INDEX "Lancamento_tenantId_periodoFiscal_idx" ON "Lancamento"("tenantId", "periodoFiscal");

-- CreateIndex
CREATE INDEX "Lancamento_tenantId_origem_idx" ON "Lancamento"("tenantId", "origem");

-- CreateIndex
CREATE INDEX "Lancamento_tenantId_diarioId_data_idx" ON "Lancamento"("tenantId", "diarioId", "data");

-- CreateIndex
CREATE UNIQUE INDEX "Lancamento_tenantId_diarioId_periodoFiscal_numero_key" ON "Lancamento"("tenantId", "diarioId", "periodoFiscal", "numero");

-- CreateIndex
CREATE INDEX "PartidaLancamento_tenantId_lancamentoId_idx" ON "PartidaLancamento"("tenantId", "lancamentoId");

-- CreateIndex
CREATE INDEX "PartidaLancamento_tenantId_contaId_idx" ON "PartidaLancamento"("tenantId", "contaId");

-- CreateIndex
CREATE INDEX "PartidaLancamento_tenantId_contaId_tipo_idx" ON "PartidaLancamento"("tenantId", "contaId", "tipo");

-- CreateIndex
CREATE INDEX "ContaBancaria_tenantId_ativo_idx" ON "ContaBancaria"("tenantId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "ContaBancaria_tenantId_banco_numeroConta_key" ON "ContaBancaria"("tenantId", "banco", "numeroConta");

-- CreateIndex
CREATE INDEX "ReconciliacaoBancaria_tenantId_contaBancariaId_idx" ON "ReconciliacaoBancaria"("tenantId", "contaBancariaId");

-- CreateIndex
CREATE INDEX "ReconciliacaoBancaria_tenantId_status_idx" ON "ReconciliacaoBancaria"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ReconciliacaoBancaria_tenantId_dataInicio_dataFim_idx" ON "ReconciliacaoBancaria"("tenantId", "dataInicio", "dataFim");

-- CreateIndex
CREATE INDEX "ItemReconciliacaoBancaria_tenantId_reconciliacaoId_idx" ON "ItemReconciliacaoBancaria"("tenantId", "reconciliacaoId");

-- CreateIndex
CREATE INDEX "ItemReconciliacaoBancaria_tenantId_reconciliacaoId_concilia_idx" ON "ItemReconciliacaoBancaria"("tenantId", "reconciliacaoId", "conciliado");

-- CreateIndex
CREATE INDEX "SerieDocumento_tenantId_tipo_ativo_idx" ON "SerieDocumento"("tenantId", "tipo", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "SerieDocumento_tenantId_tipo_ano_prefixo_key" ON "SerieDocumento"("tenantId", "tipo", "ano", "prefixo");

-- CreateIndex
CREATE INDEX "Fatura_tenantId_status_idx" ON "Fatura"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Fatura_tenantId_clienteId_idx" ON "Fatura"("tenantId", "clienteId");

-- CreateIndex
CREATE INDEX "Fatura_tenantId_dataEmissao_idx" ON "Fatura"("tenantId", "dataEmissao");

-- CreateIndex
CREATE INDEX "Fatura_tenantId_dataVencimento_status_idx" ON "Fatura"("tenantId", "dataVencimento", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Fatura_tenantId_numero_key" ON "Fatura"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "LinhaFatura_tenantId_faturaId_idx" ON "LinhaFatura"("tenantId", "faturaId");

-- CreateIndex
CREATE INDEX "NotaCredito_tenantId_status_idx" ON "NotaCredito"("tenantId", "status");

-- CreateIndex
CREATE INDEX "NotaCredito_tenantId_faturaOriginalId_idx" ON "NotaCredito"("tenantId", "faturaOriginalId");

-- CreateIndex
CREATE INDEX "NotaCredito_tenantId_dataEmissao_idx" ON "NotaCredito"("tenantId", "dataEmissao");

-- CreateIndex
CREATE UNIQUE INDEX "NotaCredito_tenantId_numero_key" ON "NotaCredito"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "LinhaNotaCredito_tenantId_notaCreditoId_idx" ON "LinhaNotaCredito"("tenantId", "notaCreditoId");

-- CreateIndex
CREATE INDEX "NotaDebito_tenantId_status_idx" ON "NotaDebito"("tenantId", "status");

-- CreateIndex
CREATE INDEX "NotaDebito_tenantId_clienteId_idx" ON "NotaDebito"("tenantId", "clienteId");

-- CreateIndex
CREATE INDEX "NotaDebito_tenantId_dataEmissao_idx" ON "NotaDebito"("tenantId", "dataEmissao");

-- CreateIndex
CREATE UNIQUE INDEX "NotaDebito_tenantId_numero_key" ON "NotaDebito"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "LinhaNotaDebito_tenantId_notaDebitoId_idx" ON "LinhaNotaDebito"("tenantId", "notaDebitoId");

-- CreateIndex
CREATE INDEX "Proforma_tenantId_status_idx" ON "Proforma"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Proforma_tenantId_clienteId_idx" ON "Proforma"("tenantId", "clienteId");

-- CreateIndex
CREATE INDEX "Proforma_tenantId_dataValidade_status_idx" ON "Proforma"("tenantId", "dataValidade", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Proforma_tenantId_numero_key" ON "Proforma"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "LinhaProforma_tenantId_proformaId_idx" ON "LinhaProforma"("tenantId", "proformaId");

-- CreateIndex
CREATE INDEX "CotacaoComercial_tenantId_status_idx" ON "CotacaoComercial"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CotacaoComercial_tenantId_clienteId_idx" ON "CotacaoComercial"("tenantId", "clienteId");

-- CreateIndex
CREATE INDEX "CotacaoComercial_tenantId_dataValidade_status_idx" ON "CotacaoComercial"("tenantId", "dataValidade", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CotacaoComercial_tenantId_numero_key" ON "CotacaoComercial"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "LinhaCotacaoComercial_tenantId_cotacaoComercialId_idx" ON "LinhaCotacaoComercial"("tenantId", "cotacaoComercialId");

-- CreateIndex
CREATE INDEX "CategoriaProduto_tenantId_ativo_idx" ON "CategoriaProduto"("tenantId", "ativo");

-- CreateIndex
CREATE INDEX "CategoriaProduto_tenantId_createdAt_idx" ON "CategoriaProduto"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaProduto_tenantId_nome_key" ON "CategoriaProduto"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "Produto_tenantId_ativo_idx" ON "Produto"("tenantId", "ativo");

-- CreateIndex
CREATE INDEX "Produto_tenantId_categoriaId_idx" ON "Produto"("tenantId", "categoriaId");

-- CreateIndex
CREATE INDEX "Produto_tenantId_createdAt_idx" ON "Produto"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Produto_tenantId_sku_key" ON "Produto"("tenantId", "sku");

-- CreateIndex
CREATE INDEX "VarianteProduto_tenantId_produtoId_idx" ON "VarianteProduto"("tenantId", "produtoId");

-- CreateIndex
CREATE INDEX "Localizacao_tenantId_ativa_idx" ON "Localizacao"("tenantId", "ativa");

-- CreateIndex
CREATE INDEX "Localizacao_tenantId_tipo_idx" ON "Localizacao"("tenantId", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "Localizacao_tenantId_codigo_key" ON "Localizacao"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "MovimentoStock_tenantId_produtoId_createdAt_idx" ON "MovimentoStock"("tenantId", "produtoId", "createdAt");

-- CreateIndex
CREATE INDEX "MovimentoStock_tenantId_tipo_createdAt_idx" ON "MovimentoStock"("tenantId", "tipo", "createdAt");

-- CreateIndex
CREATE INDEX "MovimentoStock_tenantId_localizacaoOrigemId_idx" ON "MovimentoStock"("tenantId", "localizacaoOrigemId");

-- CreateIndex
CREATE INDEX "MovimentoStock_tenantId_localizacaoDestinoId_idx" ON "MovimentoStock"("tenantId", "localizacaoDestinoId");

-- CreateIndex
CREATE INDEX "MovimentoStock_tenantId_documentoReferenciaId_documentoRefe_idx" ON "MovimentoStock"("tenantId", "documentoReferenciaId", "documentoReferenciaTipo");

-- CreateIndex
CREATE INDEX "MovimentoStock_transferenciaRefId_idx" ON "MovimentoStock"("transferenciaRefId");

-- CreateIndex
CREATE INDEX "SaldoStock_tenantId_produtoId_idx" ON "SaldoStock"("tenantId", "produtoId");

-- CreateIndex
CREATE INDEX "SaldoStock_tenantId_localizacaoId_idx" ON "SaldoStock"("tenantId", "localizacaoId");

-- CreateIndex
CREATE UNIQUE INDEX "SaldoStock_tenantId_produtoId_varianteProdutoId_localizacao_key" ON "SaldoStock"("tenantId", "produtoId", "varianteProdutoId", "localizacaoId");

-- CreateIndex
CREATE INDEX "ReservaStock_tenantId_status_idx" ON "ReservaStock"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ReservaStock_tenantId_produtoId_status_idx" ON "ReservaStock"("tenantId", "produtoId", "status");

-- CreateIndex
CREATE INDEX "ReservaStock_tenantId_documentoReferenciaId_documentoRefere_idx" ON "ReservaStock"("tenantId", "documentoReferenciaId", "documentoReferenciaTipo");

-- CreateIndex
CREATE INDEX "CategoriaAtivo_tenantId_ativa_idx" ON "CategoriaAtivo"("tenantId", "ativa");

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaAtivo_tenantId_codigo_key" ON "CategoriaAtivo"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "Ativo_tenantId_estado_idx" ON "Ativo"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "Ativo_tenantId_categoriaId_idx" ON "Ativo"("tenantId", "categoriaId");

-- CreateIndex
CREATE INDEX "Ativo_tenantId_localizacaoId_idx" ON "Ativo"("tenantId", "localizacaoId");

-- CreateIndex
CREATE INDEX "Ativo_tenantId_responsavelId_idx" ON "Ativo"("tenantId", "responsavelId");

-- CreateIndex
CREATE INDEX "Ativo_tenantId_createdAt_idx" ON "Ativo"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ativo_tenantId_codigoInterno_key" ON "Ativo"("tenantId", "codigoInterno");

-- CreateIndex
CREATE INDEX "DocumentoAtivo_tenantId_ativoId_idx" ON "DocumentoAtivo"("tenantId", "ativoId");

-- CreateIndex
CREATE INDEX "MovimentacaoAtivo_tenantId_ativoId_createdAt_idx" ON "MovimentacaoAtivo"("tenantId", "ativoId", "createdAt");

-- CreateIndex
CREATE INDEX "MovimentacaoAtivo_tenantId_tipo_idx" ON "MovimentacaoAtivo"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "MovimentacaoAtivo_tenantId_confirmada_idx" ON "MovimentacaoAtivo"("tenantId", "confirmada");

-- CreateIndex
CREATE INDEX "ManutencaoAtivo_tenantId_ativoId_idx" ON "ManutencaoAtivo"("tenantId", "ativoId");

-- CreateIndex
CREATE INDEX "ManutencaoAtivo_tenantId_status_idx" ON "ManutencaoAtivo"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ManutencaoAtivo_tenantId_tipo_status_idx" ON "ManutencaoAtivo"("tenantId", "tipo", "status");

-- CreateIndex
CREATE INDEX "ManutencaoAtivo_tenantId_dataAgendada_idx" ON "ManutencaoAtivo"("tenantId", "dataAgendada");

-- CreateIndex
CREATE INDEX "PecaManutencao_tenantId_manutencaoId_idx" ON "PecaManutencao"("tenantId", "manutencaoId");

-- CreateIndex
CREATE INDEX "AmortizacaoCalculo_tenantId_ativoId_idx" ON "AmortizacaoCalculo"("tenantId", "ativoId");

-- CreateIndex
CREATE INDEX "AmortizacaoCalculo_tenantId_ano_mes_idx" ON "AmortizacaoCalculo"("tenantId", "ano", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "AmortizacaoCalculo_tenantId_ativoId_ano_mes_key" ON "AmortizacaoCalculo"("tenantId", "ativoId", "ano", "mes");

-- CreateIndex
CREATE INDEX "InventarioFisico_tenantId_status_idx" ON "InventarioFisico"("tenantId", "status");

-- CreateIndex
CREATE INDEX "InventarioFisico_tenantId_createdAt_idx" ON "InventarioFisico"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "InventarioFisico_tenantId_codigo_key" ON "InventarioFisico"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "MembroEquipeInventario_tenantId_inventarioId_idx" ON "MembroEquipeInventario"("tenantId", "inventarioId");

-- CreateIndex
CREATE UNIQUE INDEX "MembroEquipeInventario_inventarioId_userId_key" ON "MembroEquipeInventario"("inventarioId", "userId");

-- CreateIndex
CREATE INDEX "ContagemInventario_tenantId_inventarioId_idx" ON "ContagemInventario"("tenantId", "inventarioId");

-- CreateIndex
CREATE INDEX "ContagemInventario_tenantId_ativoId_idx" ON "ContagemInventario"("tenantId", "ativoId");

-- CreateIndex
CREATE INDEX "ContagemInventario_tenantId_temDiscrepancia_idx" ON "ContagemInventario"("tenantId", "temDiscrepancia");

-- CreateIndex
CREATE UNIQUE INDEX "ContagemInventario_inventarioId_ativoId_key" ON "ContagemInventario"("inventarioId", "ativoId");

-- CreateIndex
CREATE INDEX "Viatura_tenantId_estado_idx" ON "Viatura"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "Viatura_tenantId_createdAt_idx" ON "Viatura"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Viatura_tenantId_matricula_key" ON "Viatura"("tenantId", "matricula");

-- CreateIndex
CREATE INDEX "DocumentoViatura_tenantId_estado_idx" ON "DocumentoViatura"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "DocumentoViatura_tenantId_viaturaId_idx" ON "DocumentoViatura"("tenantId", "viaturaId");

-- CreateIndex
CREATE INDEX "DocumentoViatura_tenantId_dataValidade_idx" ON "DocumentoViatura"("tenantId", "dataValidade");

-- CreateIndex
CREATE INDEX "ManutencaoViatura_tenantId_viaturaId_idx" ON "ManutencaoViatura"("tenantId", "viaturaId");

-- CreateIndex
CREATE INDEX "ManutencaoViatura_tenantId_tipo_idx" ON "ManutencaoViatura"("tenantId", "tipo");

-- CreateIndex
CREATE INDEX "ManutencaoViatura_tenantId_proximaManutencaoData_idx" ON "ManutencaoViatura"("tenantId", "proximaManutencaoData");

-- CreateIndex
CREATE INDEX "Checklist_tenantId_viaturaId_idx" ON "Checklist"("tenantId", "viaturaId");

-- CreateIndex
CREATE INDEX "Checklist_tenantId_dataInspeccao_idx" ON "Checklist"("tenantId", "dataInspeccao");

-- CreateIndex
CREATE INDEX "ItemChecklist_tenantId_idx" ON "ItemChecklist"("tenantId");

-- CreateIndex
CREATE INDEX "ItemChecklist_checklistId_estado_idx" ON "ItemChecklist"("checklistId", "estado");

-- CreateIndex
CREATE INDEX "Motorista_tenantId_estadoOperacional_idx" ON "Motorista"("tenantId", "estadoOperacional");

-- CreateIndex
CREATE INDEX "Motorista_tenantId_createdAt_idx" ON "Motorista"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentoMotorista_tenantId_estado_idx" ON "DocumentoMotorista"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "DocumentoMotorista_tenantId_motoristaId_idx" ON "DocumentoMotorista"("tenantId", "motoristaId");

-- CreateIndex
CREATE INDEX "DocumentoMotorista_tenantId_dataValidade_idx" ON "DocumentoMotorista"("tenantId", "dataValidade");

-- CreateIndex
CREATE UNIQUE INDEX "DisponibilidadeMotorista_motoristaId_key" ON "DisponibilidadeMotorista"("motoristaId");

-- CreateIndex
CREATE INDEX "DisponibilidadeMotorista_tenantId_disponivel_idx" ON "DisponibilidadeMotorista"("tenantId", "disponivel");

-- CreateIndex
CREATE INDEX "Atividade_tenantId_estado_idx" ON "Atividade"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "Atividade_tenantId_motoristaResponsavelId_idx" ON "Atividade"("tenantId", "motoristaResponsavelId");

-- CreateIndex
CREATE INDEX "Atividade_tenantId_viaturaId_idx" ON "Atividade"("tenantId", "viaturaId");

-- CreateIndex
CREATE INDEX "Atividade_tenantId_dataInicioPrevista_idx" ON "Atividade"("tenantId", "dataInicioPrevista");

-- CreateIndex
CREATE INDEX "Atividade_tenantId_createdAt_idx" ON "Atividade"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Atividade_tenantId_codigo_key" ON "Atividade"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "EventoAtividade_tenantId_idx" ON "EventoAtividade"("tenantId");

-- CreateIndex
CREATE INDEX "EventoAtividade_atividadeId_data_idx" ON "EventoAtividade"("atividadeId", "data");

-- CreateIndex
CREATE INDEX "Rota_tenantId_estado_idx" ON "Rota"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "Rota_tenantId_viaturaId_idx" ON "Rota"("tenantId", "viaturaId");

-- CreateIndex
CREATE INDEX "Rota_tenantId_motoristaId_idx" ON "Rota"("tenantId", "motoristaId");

-- CreateIndex
CREATE INDEX "Rota_tenantId_dataInicio_idx" ON "Rota"("tenantId", "dataInicio");

-- CreateIndex
CREATE UNIQUE INDEX "Rota_tenantId_codigo_key" ON "Rota"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "PontoEntrega_rotaId_ordem_idx" ON "PontoEntrega"("rotaId", "ordem");

-- CreateIndex
CREATE INDEX "PontoEntrega_tenantId_estado_idx" ON "PontoEntrega"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "Entrega_tenantId_estado_idx" ON "Entrega"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "Entrega_tenantId_clienteId_idx" ON "Entrega"("tenantId", "clienteId");

-- CreateIndex
CREATE INDEX "Entrega_tenantId_rotaId_idx" ON "Entrega"("tenantId", "rotaId");

-- CreateIndex
CREATE INDEX "Entrega_tenantId_dataAgendada_idx" ON "Entrega"("tenantId", "dataAgendada");

-- CreateIndex
CREATE INDEX "Entrega_tenantId_createdAt_idx" ON "Entrega"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Entrega_tenantId_numero_key" ON "Entrega"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "ItemEntrega_tenantId_idx" ON "ItemEntrega"("tenantId");

-- CreateIndex
CREATE INDEX "ItemEntrega_entregaId_idx" ON "ItemEntrega"("entregaId");

-- CreateIndex
CREATE INDEX "Abastecimento_tenantId_viaturaId_idx" ON "Abastecimento"("tenantId", "viaturaId");

-- CreateIndex
CREATE INDEX "Abastecimento_tenantId_motoristaId_idx" ON "Abastecimento"("tenantId", "motoristaId");

-- CreateIndex
CREATE INDEX "Abastecimento_tenantId_data_idx" ON "Abastecimento"("tenantId", "data");

-- CreateIndex
CREATE INDEX "Ticket_tenantId_estado_idx" ON "Ticket"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "Ticket_tenantId_prioridade_idx" ON "Ticket"("tenantId", "prioridade");

-- CreateIndex
CREATE INDEX "Ticket_tenantId_solicitanteId_idx" ON "Ticket"("tenantId", "solicitanteId");

-- CreateIndex
CREATE INDEX "Ticket_tenantId_atribuidoParaId_idx" ON "Ticket"("tenantId", "atribuidoParaId");

-- CreateIndex
CREATE INDEX "Ticket_tenantId_equipeId_idx" ON "Ticket"("tenantId", "equipeId");

-- CreateIndex
CREATE INDEX "Ticket_tenantId_origemTipo_origemId_idx" ON "Ticket"("tenantId", "origemTipo", "origemId");

-- CreateIndex
CREATE INDEX "Ticket_tenantId_slaEmAtraso_idx" ON "Ticket"("tenantId", "slaEmAtraso");

-- CreateIndex
CREATE INDEX "Ticket_tenantId_createdAt_idx" ON "Ticket"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_tenantId_numero_key" ON "Ticket"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "AtividadeTicket_ticketId_createdAt_idx" ON "AtividadeTicket"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "AtividadeTicket_tenantId_ticketId_idx" ON "AtividadeTicket"("tenantId", "ticketId");

-- CreateIndex
CREATE INDEX "CategoriaTicket_tenantId_ativa_idx" ON "CategoriaTicket"("tenantId", "ativa");

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaTicket_tenantId_nome_key" ON "CategoriaTicket"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "EquipeSuporte_tenantId_estado_idx" ON "EquipeSuporte"("tenantId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "EquipeSuporte_tenantId_nome_key" ON "EquipeSuporte"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "MembroEquipeSuporte_tenantId_equipeId_idx" ON "MembroEquipeSuporte"("tenantId", "equipeId");

-- CreateIndex
CREATE INDEX "MembroEquipeSuporte_tenantId_usuarioId_idx" ON "MembroEquipeSuporte"("tenantId", "usuarioId");

-- CreateIndex
CREATE INDEX "MembroEquipeSuporte_tenantId_estado_idx" ON "MembroEquipeSuporte"("tenantId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "MembroEquipeSuporte_equipeId_usuarioId_key" ON "MembroEquipeSuporte"("equipeId", "usuarioId");

-- CreateIndex
CREATE INDEX "BaseConhecimento_tenantId_estado_idx" ON "BaseConhecimento"("tenantId", "estado");

-- CreateIndex
CREATE INDEX "BaseConhecimento_tenantId_categoria_idx" ON "BaseConhecimento"("tenantId", "categoria");

-- CreateIndex
CREATE INDEX "BaseConhecimento_tenantId_visibilidade_idx" ON "BaseConhecimento"("tenantId", "visibilidade");

-- CreateIndex
CREATE INDEX "BaseConhecimento_tenantId_createdAt_idx" ON "BaseConhecimento"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Departamento_tenantId_ativo_idx" ON "Departamento"("tenantId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "Departamento_tenantId_codigo_key" ON "Departamento"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "Cargo_tenantId_ativo_idx" ON "Cargo"("tenantId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "Cargo_tenantId_codigo_key" ON "Cargo"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "Colaborador_tenantId_status_idx" ON "Colaborador"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Colaborador_tenantId_departamentoId_idx" ON "Colaborador"("tenantId", "departamentoId");

-- CreateIndex
CREATE INDEX "Colaborador_tenantId_deletedAt_idx" ON "Colaborador"("tenantId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Colaborador_tenantId_codigo_key" ON "Colaborador"("tenantId", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Colaborador_tenantId_nuit_key" ON "Colaborador"("tenantId", "nuit");

-- CreateIndex
CREATE UNIQUE INDEX "Colaborador_tenantId_bi_key" ON "Colaborador"("tenantId", "bi");

-- CreateIndex
CREATE UNIQUE INDEX "Colaborador_tenantId_email_key" ON "Colaborador"("tenantId", "email");

-- CreateIndex
CREATE INDEX "FormacaoAcademica_tenantId_colaboradorId_idx" ON "FormacaoAcademica"("tenantId", "colaboradorId");

-- CreateIndex
CREATE INDEX "ExperienciaProfissional_tenantId_colaboradorId_idx" ON "ExperienciaProfissional"("tenantId", "colaboradorId");

-- CreateIndex
CREATE INDEX "DocumentoColaborador_tenantId_colaboradorId_idx" ON "DocumentoColaborador"("tenantId", "colaboradorId");

-- CreateIndex
CREATE INDEX "Ferias_tenantId_colaboradorId_idx" ON "Ferias"("tenantId", "colaboradorId");

-- CreateIndex
CREATE INDEX "SolicitacaoFerias_tenantId_feriasId_status_idx" ON "SolicitacaoFerias"("tenantId", "feriasId", "status");

-- CreateIndex
CREATE INDEX "SolicitacaoFerias_tenantId_status_idx" ON "SolicitacaoFerias"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Ausencia_tenantId_colaboradorId_status_idx" ON "Ausencia"("tenantId", "colaboradorId", "status");

-- CreateIndex
CREATE INDEX "Ausencia_tenantId_dataInicio_idx" ON "Ausencia"("tenantId", "dataInicio");

-- CreateIndex
CREATE INDEX "RegistoAssiduidade_tenantId_data_idx" ON "RegistoAssiduidade"("tenantId", "data");

-- CreateIndex
CREATE INDEX "RegistoAssiduidade_tenantId_colaboradorId_idx" ON "RegistoAssiduidade"("tenantId", "colaboradorId");

-- CreateIndex
CREATE UNIQUE INDEX "RegistoAssiduidade_tenantId_colaboradorId_data_key" ON "RegistoAssiduidade"("tenantId", "colaboradorId", "data");

-- CreateIndex
CREATE INDEX "Avaliacao_tenantId_colaboradorId_status_idx" ON "Avaliacao"("tenantId", "colaboradorId", "status");

-- CreateIndex
CREATE INDEX "Avaliacao_tenantId_status_idx" ON "Avaliacao"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CriterioAvaliacao_tenantId_avaliacaoId_idx" ON "CriterioAvaliacao"("tenantId", "avaliacaoId");

-- CreateIndex
CREATE INDEX "Formacao_tenantId_status_idx" ON "Formacao"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Formacao_tenantId_dataInicio_idx" ON "Formacao"("tenantId", "dataInicio");

-- CreateIndex
CREATE INDEX "ParticipanteFormacao_tenantId_formacaoId_idx" ON "ParticipanteFormacao"("tenantId", "formacaoId");

-- CreateIndex
CREATE INDEX "ParticipanteFormacao_tenantId_colaboradorId_idx" ON "ParticipanteFormacao"("tenantId", "colaboradorId");

-- CreateIndex
CREATE UNIQUE INDEX "ParticipanteFormacao_formacaoId_colaboradorId_key" ON "ParticipanteFormacao"("formacaoId", "colaboradorId");

-- CreateIndex
CREATE INDEX "Payroll_tenantId_status_idx" ON "Payroll"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Payroll_tenantId_colaboradorId_idx" ON "Payroll"("tenantId", "colaboradorId");

-- CreateIndex
CREATE UNIQUE INDEX "Payroll_tenantId_colaboradorId_anoReferencia_mesReferencia_key" ON "Payroll"("tenantId", "colaboradorId", "anoReferencia", "mesReferencia");

-- CreateIndex
CREATE INDEX "Equipa_tenantId_status_idx" ON "Equipa"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Equipa_tenantId_nome_key" ON "Equipa"("tenantId", "nome");

-- CreateIndex
CREATE INDEX "MembroEquipa_tenantId_equipaId_idx" ON "MembroEquipa"("tenantId", "equipaId");

-- CreateIndex
CREATE INDEX "MembroEquipa_tenantId_colaboradorId_idx" ON "MembroEquipa"("tenantId", "colaboradorId");

-- CreateIndex
CREATE UNIQUE INDEX "MembroEquipa_equipaId_colaboradorId_key" ON "MembroEquipa"("equipaId", "colaboradorId");

-- CreateIndex
CREATE INDEX "Projeto_tenantId_status_idx" ON "Projeto"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Projeto_tenantId_clienteId_idx" ON "Projeto"("tenantId", "clienteId");

-- CreateIndex
CREATE INDEX "Projeto_tenantId_createdAt_idx" ON "Projeto"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Projeto_tenantId_codigo_key" ON "Projeto"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "ProjetoEquipa_tenantId_projetoId_idx" ON "ProjetoEquipa"("tenantId", "projetoId");

-- CreateIndex
CREATE INDEX "TarefaProjeto_tenantId_projetoId_status_idx" ON "TarefaProjeto"("tenantId", "projetoId", "status");

-- CreateIndex
CREATE INDEX "TarefaProjeto_tenantId_projetoId_posicao_idx" ON "TarefaProjeto"("tenantId", "projetoId", "posicao");

-- CreateIndex
CREATE INDEX "TarefaProjeto_tenantId_responsavelId_idx" ON "TarefaProjeto"("tenantId", "responsavelId");

-- CreateIndex
CREATE UNIQUE INDEX "TarefaProjeto_tenantId_codigo_key" ON "TarefaProjeto"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "ComentarioTarefa_tenantId_tarefaId_createdAt_idx" ON "ComentarioTarefa"("tenantId", "tarefaId", "createdAt");

-- CreateIndex
CREATE INDEX "AnexoTarefa_tenantId_tarefaId_idx" ON "AnexoTarefa"("tenantId", "tarefaId");

-- CreateIndex
CREATE INDEX "Timesheet_tenantId_projetoId_data_idx" ON "Timesheet"("tenantId", "projetoId", "data");

-- CreateIndex
CREATE INDEX "Timesheet_tenantId_colaboradorId_data_idx" ON "Timesheet"("tenantId", "colaboradorId", "data");

-- CreateIndex
CREATE INDEX "Marco_tenantId_projetoId_status_idx" ON "Marco"("tenantId", "projetoId", "status");

-- CreateIndex
CREATE INDEX "OrcamentoProjeto_tenantId_projetoId_status_idx" ON "OrcamentoProjeto"("tenantId", "projetoId", "status");

-- CreateIndex
CREATE INDEX "CategoriaOrcamento_tenantId_orcamentoProjetoId_idx" ON "CategoriaOrcamento"("tenantId", "orcamentoProjetoId");

-- CreateIndex
CREATE INDEX "ItemOrcamento_tenantId_categoriaOrcamentoId_idx" ON "ItemOrcamento"("tenantId", "categoriaOrcamentoId");

-- CreateIndex
CREATE INDEX "CentroTrabalho_tenantId_ativo_idx" ON "CentroTrabalho"("tenantId", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "CentroTrabalho_tenantId_codigo_key" ON "CentroTrabalho"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "EstruturaProduto_tenantId_status_idx" ON "EstruturaProduto"("tenantId", "status");

-- CreateIndex
CREATE INDEX "EstruturaProduto_tenantId_produtoId_idx" ON "EstruturaProduto"("tenantId", "produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "EstruturaProduto_tenantId_produtoId_versao_key" ON "EstruturaProduto"("tenantId", "produtoId", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "EstruturaProduto_tenantId_codigo_key" ON "EstruturaProduto"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "ComponenteBOM_tenantId_estruturaProdutoId_idx" ON "ComponenteBOM"("tenantId", "estruturaProdutoId");

-- CreateIndex
CREATE INDEX "ComponenteBOM_tenantId_componenteProdutoId_idx" ON "ComponenteBOM"("tenantId", "componenteProdutoId");

-- CreateIndex
CREATE INDEX "ComponenteBOM_componentePaiId_idx" ON "ComponenteBOM"("componentePaiId");

-- CreateIndex
CREATE INDEX "Roteiro_tenantId_status_idx" ON "Roteiro"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Roteiro_tenantId_codigo_key" ON "Roteiro"("tenantId", "codigo");

-- CreateIndex
CREATE INDEX "OperacaoRoteiro_tenantId_roteiroId_idx" ON "OperacaoRoteiro"("tenantId", "roteiroId");

-- CreateIndex
CREATE UNIQUE INDEX "OperacaoRoteiro_roteiroId_sequencia_key" ON "OperacaoRoteiro"("roteiroId", "sequencia");

-- CreateIndex
CREATE INDEX "OrdemProducao_tenantId_status_idx" ON "OrdemProducao"("tenantId", "status");

-- CreateIndex
CREATE INDEX "OrdemProducao_tenantId_prioridade_idx" ON "OrdemProducao"("tenantId", "prioridade");

-- CreateIndex
CREATE INDEX "OrdemProducao_tenantId_produtoId_idx" ON "OrdemProducao"("tenantId", "produtoId");

-- CreateIndex
CREATE INDEX "OrdemProducao_tenantId_createdAt_idx" ON "OrdemProducao"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrdemProducao_tenantId_numero_key" ON "OrdemProducao"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "OperacaoOrdem_tenantId_ordemProducaoId_idx" ON "OperacaoOrdem"("tenantId", "ordemProducaoId");

-- CreateIndex
CREATE UNIQUE INDEX "OperacaoOrdem_ordemProducaoId_sequencia_key" ON "OperacaoOrdem"("ordemProducaoId", "sequencia");

-- CreateIndex
CREATE INDEX "ConsumoProducao_tenantId_ordemProducaoId_idx" ON "ConsumoProducao"("tenantId", "ordemProducaoId");

-- CreateIndex
CREATE INDEX "ConsumoProducao_tenantId_produtoId_idx" ON "ConsumoProducao"("tenantId", "produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracaoFiscal_tenantId_key" ON "ConfiguracaoFiscal"("tenantId");

-- CreateIndex
CREATE INDEX "ConfiguracaoFiscal_tenantId_idx" ON "ConfiguracaoFiscal"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_nuit_key" ON "Tenant"("nuit");

-- CreateIndex
CREATE INDEX "Tenant_deletedAt_idx" ON "Tenant"("deletedAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserInvite" ADD CONSTRAINT "UserInvite_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnderecoCliente" ADD CONSTRAINT "EnderecoCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactoCliente" ADD CONSTRAINT "ContactoCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SegmentacaoCliente" ADD CONSTRAINT "SegmentacaoCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoTransacao" ADD CONSTRAINT "HistoricoTransacao_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venda" ADD CONSTRAINT "Venda_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venda" ADD CONSTRAINT "Venda_sessaoPOSId_fkey" FOREIGN KEY ("sessaoPOSId") REFERENCES "SessaoPOS"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venda" ADD CONSTRAINT "Venda_enderecoEntregaId_fkey" FOREIGN KEY ("enderecoEntregaId") REFERENCES "EnderecoCliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemVenda" ADD CONSTRAINT "ItemVenda_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PagamentoVenda" ADD CONSTRAINT "PagamentoVenda_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HistoricoEstadoVenda" ADD CONSTRAINT "HistoricoEstadoVenda_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comissao" ADD CONSTRAINT "Comissao_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "Venda"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comissao" ADD CONSTRAINT "Comissao_regraComissaoId_fkey" FOREIGN KEY ("regraComissaoId") REFERENCES "RegraComissao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnderecoFornecedor" ADD CONSTRAINT "EnderecoFornecedor_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactoFornecedor" ADD CONSTRAINT "ContactoFornecedor_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoFornecedor" ADD CONSTRAINT "DocumentoFornecedor_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvaliacaoFornecedor" ADD CONSTRAINT "AvaliacaoFornecedor_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NivelAprovacao" ADD CONSTRAINT "NivelAprovacao_configuracaoWorkflowId_fkey" FOREIGN KEY ("configuracaoWorkflowId") REFERENCES "ConfiguracaoWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AprovadorNivel" ADD CONSTRAINT "AprovadorNivel_nivelAprovacaoId_fkey" FOREIGN KEY ("nivelAprovacaoId") REFERENCES "NivelAprovacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRequisicao" ADD CONSTRAINT "ItemRequisicao_requisicaoCompraId_fkey" FOREIGN KEY ("requisicaoCompraId") REFERENCES "RequisicaoCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AprovacaoCompra" ADD CONSTRAINT "AprovacaoCompra_requisicaoCompraId_fkey" FOREIGN KEY ("requisicaoCompraId") REFERENCES "RequisicaoCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AprovacaoCompra" ADD CONSTRAINT "AprovacaoCompra_pedidoCompraId_fkey" FOREIGN KEY ("pedidoCompraId") REFERENCES "PedidoCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cotacao" ADD CONSTRAINT "Cotacao_requisicaoCompraId_fkey" FOREIGN KEY ("requisicaoCompraId") REFERENCES "RequisicaoCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cotacao" ADD CONSTRAINT "Cotacao_vencedorFornecedorId_fkey" FOREIGN KEY ("vencedorFornecedorId") REFERENCES "Fornecedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoFornecedor" ADD CONSTRAINT "CotacaoFornecedor_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "Cotacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoFornecedor" ADD CONSTRAINT "CotacaoFornecedor_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemCotacao" ADD CONSTRAINT "ItemCotacao_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "Cotacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespostaItemCotacao" ADD CONSTRAINT "RespostaItemCotacao_itemCotacaoId_fkey" FOREIGN KEY ("itemCotacaoId") REFERENCES "ItemCotacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RespostaItemCotacao" ADD CONSTRAINT "RespostaItemCotacao_cotacaoFornecedorId_fkey" FOREIGN KEY ("cotacaoFornecedorId") REFERENCES "CotacaoFornecedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompra" ADD CONSTRAINT "PedidoCompra_requisicaoCompraId_fkey" FOREIGN KEY ("requisicaoCompraId") REFERENCES "RequisicaoCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompra" ADD CONSTRAINT "PedidoCompra_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "Cotacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoCompra" ADD CONSTRAINT "PedidoCompra_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemPedidoCompra" ADD CONSTRAINT "ItemPedidoCompra_pedidoCompraId_fkey" FOREIGN KEY ("pedidoCompraId") REFERENCES "PedidoCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecebimentoCompra" ADD CONSTRAINT "RecebimentoCompra_pedidoCompraId_fkey" FOREIGN KEY ("pedidoCompraId") REFERENCES "PedidoCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRecebimento" ADD CONSTRAINT "ItemRecebimento_recebimentoCompraId_fkey" FOREIGN KEY ("recebimentoCompraId") REFERENCES "RecebimentoCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemRecebimento" ADD CONSTRAINT "ItemRecebimento_itemPedidoCompraId_fkey" FOREIGN KEY ("itemPedidoCompraId") REFERENCES "ItemPedidoCompra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPagar" ADD CONSTRAINT "ContaPagar_pedidoCompraId_fkey" FOREIGN KEY ("pedidoCompraId") REFERENCES "PedidoCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pagamento" ADD CONSTRAINT "Pagamento_contaPagarId_fkey" FOREIGN KEY ("contaPagarId") REFERENCES "ContaPagar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Servico" ADD CONSTRAINT "Servico_categoriaServicoId_fkey" FOREIGN KEY ("categoriaServicoId") REFERENCES "CategoriaServico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendamentoServico" ADD CONSTRAINT "AgendamentoServico_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "Servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgendamentoServico" ADD CONSTRAINT "AgendamentoServico_tecnicoId_fkey" FOREIGN KEY ("tecnicoId") REFERENCES "TecnicoServico"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvaliacaoServico" ADD CONSTRAINT "AvaliacaoServico_agendamentoServicoId_fkey" FOREIGN KEY ("agendamentoServicoId") REFERENCES "AgendamentoServico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvaliacaoServico" ADD CONSTRAINT "AvaliacaoServico_servicoId_fkey" FOREIGN KEY ("servicoId") REFERENCES "Servico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoCaixa" ADD CONSTRAINT "MovimentoCaixa_sessaoCaixaId_fkey" FOREIGN KEY ("sessaoCaixaId") REFERENCES "SessaoCaixa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaPGC" ADD CONSTRAINT "ContaPGC_contaPaiId_fkey" FOREIGN KEY ("contaPaiId") REFERENCES "ContaPGC"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lancamento" ADD CONSTRAINT "Lancamento_diarioId_fkey" FOREIGN KEY ("diarioId") REFERENCES "Diario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartidaLancamento" ADD CONSTRAINT "PartidaLancamento_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "Lancamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartidaLancamento" ADD CONSTRAINT "PartidaLancamento_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "ContaPGC"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartidaLancamento" ADD CONSTRAINT "PartidaLancamento_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContaBancaria" ADD CONSTRAINT "ContaBancaria_contaContabilId_fkey" FOREIGN KEY ("contaContabilId") REFERENCES "ContaPGC"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliacaoBancaria" ADD CONSTRAINT "ReconciliacaoBancaria_contaBancariaId_fkey" FOREIGN KEY ("contaBancariaId") REFERENCES "ContaBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemReconciliacaoBancaria" ADD CONSTRAINT "ItemReconciliacaoBancaria_reconciliacaoId_fkey" FOREIGN KEY ("reconciliacaoId") REFERENCES "ReconciliacaoBancaria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fatura" ADD CONSTRAINT "Fatura_serieDocumentoId_fkey" FOREIGN KEY ("serieDocumentoId") REFERENCES "SerieDocumento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaFatura" ADD CONSTRAINT "LinhaFatura_faturaId_fkey" FOREIGN KEY ("faturaId") REFERENCES "Fatura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaCredito" ADD CONSTRAINT "NotaCredito_serieDocumentoId_fkey" FOREIGN KEY ("serieDocumentoId") REFERENCES "SerieDocumento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaCredito" ADD CONSTRAINT "NotaCredito_faturaOriginalId_fkey" FOREIGN KEY ("faturaOriginalId") REFERENCES "Fatura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaNotaCredito" ADD CONSTRAINT "LinhaNotaCredito_notaCreditoId_fkey" FOREIGN KEY ("notaCreditoId") REFERENCES "NotaCredito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaDebito" ADD CONSTRAINT "NotaDebito_serieDocumentoId_fkey" FOREIGN KEY ("serieDocumentoId") REFERENCES "SerieDocumento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaDebito" ADD CONSTRAINT "NotaDebito_faturaReferenciaId_fkey" FOREIGN KEY ("faturaReferenciaId") REFERENCES "Fatura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaNotaDebito" ADD CONSTRAINT "LinhaNotaDebito_notaDebitoId_fkey" FOREIGN KEY ("notaDebitoId") REFERENCES "NotaDebito"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proforma" ADD CONSTRAINT "Proforma_serieDocumentoId_fkey" FOREIGN KEY ("serieDocumentoId") REFERENCES "SerieDocumento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaProforma" ADD CONSTRAINT "LinhaProforma_proformaId_fkey" FOREIGN KEY ("proformaId") REFERENCES "Proforma"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoComercial" ADD CONSTRAINT "CotacaoComercial_serieDocumentoId_fkey" FOREIGN KEY ("serieDocumentoId") REFERENCES "SerieDocumento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaCotacaoComercial" ADD CONSTRAINT "LinhaCotacaoComercial_cotacaoComercialId_fkey" FOREIGN KEY ("cotacaoComercialId") REFERENCES "CotacaoComercial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaProduto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VarianteProduto" ADD CONSTRAINT "VarianteProduto_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Localizacao" ADD CONSTRAINT "Localizacao_localizacaoPaiId_fkey" FOREIGN KEY ("localizacaoPaiId") REFERENCES "Localizacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoStock" ADD CONSTRAINT "MovimentoStock_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoStock" ADD CONSTRAINT "MovimentoStock_varianteProdutoId_fkey" FOREIGN KEY ("varianteProdutoId") REFERENCES "VarianteProduto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoStock" ADD CONSTRAINT "MovimentoStock_localizacaoOrigemId_fkey" FOREIGN KEY ("localizacaoOrigemId") REFERENCES "Localizacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentoStock" ADD CONSTRAINT "MovimentoStock_localizacaoDestinoId_fkey" FOREIGN KEY ("localizacaoDestinoId") REFERENCES "Localizacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaldoStock" ADD CONSTRAINT "SaldoStock_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaldoStock" ADD CONSTRAINT "SaldoStock_localizacaoId_fkey" FOREIGN KEY ("localizacaoId") REFERENCES "Localizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaStock" ADD CONSTRAINT "ReservaStock_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaStock" ADD CONSTRAINT "ReservaStock_varianteProdutoId_fkey" FOREIGN KEY ("varianteProdutoId") REFERENCES "VarianteProduto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservaStock" ADD CONSTRAINT "ReservaStock_localizacaoId_fkey" FOREIGN KEY ("localizacaoId") REFERENCES "Localizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoriaAtivo" ADD CONSTRAINT "CategoriaAtivo_categoriaPaiId_fkey" FOREIGN KEY ("categoriaPaiId") REFERENCES "CategoriaAtivo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ativo" ADD CONSTRAINT "Ativo_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaAtivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ativo" ADD CONSTRAINT "Ativo_localizacaoId_fkey" FOREIGN KEY ("localizacaoId") REFERENCES "Localizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoAtivo" ADD CONSTRAINT "DocumentoAtivo_ativoId_fkey" FOREIGN KEY ("ativoId") REFERENCES "Ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoAtivo" ADD CONSTRAINT "MovimentacaoAtivo_ativoId_fkey" FOREIGN KEY ("ativoId") REFERENCES "Ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoAtivo" ADD CONSTRAINT "MovimentacaoAtivo_localizacaoOrigemId_fkey" FOREIGN KEY ("localizacaoOrigemId") REFERENCES "Localizacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MovimentacaoAtivo" ADD CONSTRAINT "MovimentacaoAtivo_localizacaoDestinoId_fkey" FOREIGN KEY ("localizacaoDestinoId") REFERENCES "Localizacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManutencaoAtivo" ADD CONSTRAINT "ManutencaoAtivo_ativoId_fkey" FOREIGN KEY ("ativoId") REFERENCES "Ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PecaManutencao" ADD CONSTRAINT "PecaManutencao_manutencaoId_fkey" FOREIGN KEY ("manutencaoId") REFERENCES "ManutencaoAtivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PecaManutencao" ADD CONSTRAINT "PecaManutencao_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmortizacaoCalculo" ADD CONSTRAINT "AmortizacaoCalculo_ativoId_fkey" FOREIGN KEY ("ativoId") REFERENCES "Ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventarioFisico" ADD CONSTRAINT "InventarioFisico_localizacaoId_fkey" FOREIGN KEY ("localizacaoId") REFERENCES "Localizacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembroEquipeInventario" ADD CONSTRAINT "MembroEquipeInventario_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "InventarioFisico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContagemInventario" ADD CONSTRAINT "ContagemInventario_inventarioId_fkey" FOREIGN KEY ("inventarioId") REFERENCES "InventarioFisico"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContagemInventario" ADD CONSTRAINT "ContagemInventario_ativoId_fkey" FOREIGN KEY ("ativoId") REFERENCES "Ativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContagemInventario" ADD CONSTRAINT "ContagemInventario_localizacaoEsperadaId_fkey" FOREIGN KEY ("localizacaoEsperadaId") REFERENCES "Localizacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContagemInventario" ADD CONSTRAINT "ContagemInventario_localizacaoEncontradaId_fkey" FOREIGN KEY ("localizacaoEncontradaId") REFERENCES "Localizacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viatura" ADD CONSTRAINT "Viatura_motoristaResponsavelId_fkey" FOREIGN KEY ("motoristaResponsavelId") REFERENCES "Motorista"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoViatura" ADD CONSTRAINT "DocumentoViatura_viaturaId_fkey" FOREIGN KEY ("viaturaId") REFERENCES "Viatura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManutencaoViatura" ADD CONSTRAINT "ManutencaoViatura_viaturaId_fkey" FOREIGN KEY ("viaturaId") REFERENCES "Viatura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checklist" ADD CONSTRAINT "Checklist_viaturaId_fkey" FOREIGN KEY ("viaturaId") REFERENCES "Viatura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemChecklist" ADD CONSTRAINT "ItemChecklist_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "Checklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoMotorista" ADD CONSTRAINT "DocumentoMotorista_motoristaId_fkey" FOREIGN KEY ("motoristaId") REFERENCES "Motorista"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisponibilidadeMotorista" ADD CONSTRAINT "DisponibilidadeMotorista_motoristaId_fkey" FOREIGN KEY ("motoristaId") REFERENCES "Motorista"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Atividade" ADD CONSTRAINT "Atividade_motoristaResponsavelId_fkey" FOREIGN KEY ("motoristaResponsavelId") REFERENCES "Motorista"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Atividade" ADD CONSTRAINT "Atividade_viaturaId_fkey" FOREIGN KEY ("viaturaId") REFERENCES "Viatura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoAtividade" ADD CONSTRAINT "EventoAtividade_atividadeId_fkey" FOREIGN KEY ("atividadeId") REFERENCES "Atividade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rota" ADD CONSTRAINT "Rota_viaturaId_fkey" FOREIGN KEY ("viaturaId") REFERENCES "Viatura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rota" ADD CONSTRAINT "Rota_motoristaId_fkey" FOREIGN KEY ("motoristaId") REFERENCES "Motorista"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PontoEntrega" ADD CONSTRAINT "PontoEntrega_rotaId_fkey" FOREIGN KEY ("rotaId") REFERENCES "Rota"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PontoEntrega" ADD CONSTRAINT "PontoEntrega_entregaId_fkey" FOREIGN KEY ("entregaId") REFERENCES "Entrega"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrega" ADD CONSTRAINT "Entrega_rotaId_fkey" FOREIGN KEY ("rotaId") REFERENCES "Rota"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrega" ADD CONSTRAINT "Entrega_viaturaId_fkey" FOREIGN KEY ("viaturaId") REFERENCES "Viatura"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entrega" ADD CONSTRAINT "Entrega_motoristaId_fkey" FOREIGN KEY ("motoristaId") REFERENCES "Motorista"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemEntrega" ADD CONSTRAINT "ItemEntrega_entregaId_fkey" FOREIGN KEY ("entregaId") REFERENCES "Entrega"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Abastecimento" ADD CONSTRAINT "Abastecimento_viaturaId_fkey" FOREIGN KEY ("viaturaId") REFERENCES "Viatura"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Abastecimento" ADD CONSTRAINT "Abastecimento_motoristaId_fkey" FOREIGN KEY ("motoristaId") REFERENCES "Motorista"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "EquipeSuporte"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtividadeTicket" ADD CONSTRAINT "AtividadeTicket_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembroEquipeSuporte" ADD CONSTRAINT "MembroEquipeSuporte_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "EquipeSuporte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Departamento" ADD CONSTRAINT "Departamento_departamentoPaiId_fkey" FOREIGN KEY ("departamentoPaiId") REFERENCES "Departamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cargo" ADD CONSTRAINT "Cargo_departamentoId_fkey" FOREIGN KEY ("departamentoId") REFERENCES "Departamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Colaborador" ADD CONSTRAINT "Colaborador_departamentoId_fkey" FOREIGN KEY ("departamentoId") REFERENCES "Departamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Colaborador" ADD CONSTRAINT "Colaborador_cargoId_fkey" FOREIGN KEY ("cargoId") REFERENCES "Cargo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Colaborador" ADD CONSTRAINT "Colaborador_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormacaoAcademica" ADD CONSTRAINT "FormacaoAcademica_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienciaProfissional" ADD CONSTRAINT "ExperienciaProfissional_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentoColaborador" ADD CONSTRAINT "DocumentoColaborador_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ferias" ADD CONSTRAINT "Ferias_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SolicitacaoFerias" ADD CONSTRAINT "SolicitacaoFerias_feriasId_fkey" FOREIGN KEY ("feriasId") REFERENCES "Ferias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ausencia" ADD CONSTRAINT "Ausencia_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistoAssiduidade" ADD CONSTRAINT "RegistoAssiduidade_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avaliacao" ADD CONSTRAINT "Avaliacao_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Avaliacao" ADD CONSTRAINT "Avaliacao_avaliadorId_fkey" FOREIGN KEY ("avaliadorId") REFERENCES "Colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterioAvaliacao" ADD CONSTRAINT "CriterioAvaliacao_avaliacaoId_fkey" FOREIGN KEY ("avaliacaoId") REFERENCES "Avaliacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipanteFormacao" ADD CONSTRAINT "ParticipanteFormacao_formacaoId_fkey" FOREIGN KEY ("formacaoId") REFERENCES "Formacao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipanteFormacao" ADD CONSTRAINT "ParticipanteFormacao_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payroll" ADD CONSTRAINT "Payroll_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembroEquipa" ADD CONSTRAINT "MembroEquipa_equipaId_fkey" FOREIGN KEY ("equipaId") REFERENCES "Equipa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MembroEquipa" ADD CONSTRAINT "MembroEquipa_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjetoEquipa" ADD CONSTRAINT "ProjetoEquipa_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjetoEquipa" ADD CONSTRAINT "ProjetoEquipa_equipaId_fkey" FOREIGN KEY ("equipaId") REFERENCES "Equipa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarefaProjeto" ADD CONSTRAINT "TarefaProjeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TarefaProjeto" ADD CONSTRAINT "TarefaProjeto_tarefaPaiId_fkey" FOREIGN KEY ("tarefaPaiId") REFERENCES "TarefaProjeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComentarioTarefa" ADD CONSTRAINT "ComentarioTarefa_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "TarefaProjeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnexoTarefa" ADD CONSTRAINT "AnexoTarefa_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "TarefaProjeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_tarefaId_fkey" FOREIGN KEY ("tarefaId") REFERENCES "TarefaProjeto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Timesheet" ADD CONSTRAINT "Timesheet_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Marco" ADD CONSTRAINT "Marco_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrcamentoProjeto" ADD CONSTRAINT "OrcamentoProjeto_projetoId_fkey" FOREIGN KEY ("projetoId") REFERENCES "Projeto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoriaOrcamento" ADD CONSTRAINT "CategoriaOrcamento_orcamentoProjetoId_fkey" FOREIGN KEY ("orcamentoProjetoId") REFERENCES "OrcamentoProjeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemOrcamento" ADD CONSTRAINT "ItemOrcamento_categoriaOrcamentoId_fkey" FOREIGN KEY ("categoriaOrcamentoId") REFERENCES "CategoriaOrcamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponenteBOM" ADD CONSTRAINT "ComponenteBOM_estruturaProdutoId_fkey" FOREIGN KEY ("estruturaProdutoId") REFERENCES "EstruturaProduto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComponenteBOM" ADD CONSTRAINT "ComponenteBOM_componentePaiId_fkey" FOREIGN KEY ("componentePaiId") REFERENCES "ComponenteBOM"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Roteiro" ADD CONSTRAINT "Roteiro_estruturaProdutoId_fkey" FOREIGN KEY ("estruturaProdutoId") REFERENCES "EstruturaProduto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperacaoRoteiro" ADD CONSTRAINT "OperacaoRoteiro_roteiroId_fkey" FOREIGN KEY ("roteiroId") REFERENCES "Roteiro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperacaoRoteiro" ADD CONSTRAINT "OperacaoRoteiro_centroTrabalhoId_fkey" FOREIGN KEY ("centroTrabalhoId") REFERENCES "CentroTrabalho"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemProducao" ADD CONSTRAINT "OrdemProducao_roteiroId_fkey" FOREIGN KEY ("roteiroId") REFERENCES "Roteiro"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperacaoOrdem" ADD CONSTRAINT "OperacaoOrdem_ordemProducaoId_fkey" FOREIGN KEY ("ordemProducaoId") REFERENCES "OrdemProducao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperacaoOrdem" ADD CONSTRAINT "OperacaoOrdem_centroTrabalhoId_fkey" FOREIGN KEY ("centroTrabalhoId") REFERENCES "CentroTrabalho"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OperacaoOrdem" ADD CONSTRAINT "OperacaoOrdem_colaboradorId_fkey" FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsumoProducao" ADD CONSTRAINT "ConsumoProducao_ordemProducaoId_fkey" FOREIGN KEY ("ordemProducaoId") REFERENCES "OrdemProducao"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
