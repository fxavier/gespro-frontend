/**
 * Seed — WS E: Pessoas & Projectos
 * Porta dados de src/lib/storage/{rh,projeto}-storage.ts para o DB.
 * Mocks inline de produção incluídos.
 *
 * Exporta: seedPessoasProjetos(prisma, tenantId)
 */
import type { PrismaClient } from '@prisma/client';

export async function seedPessoasProjetos(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  // Utilizador admin (para campos *PorId)
  const admin = await prisma.user.findFirst({
    where: { tenantId, email: 'admin@demo.mz' },
    select: { id: true },
  });
  const adminId = admin?.id ?? 'seed-admin-id';

  // ─── Departamentos ──────────────────────────────────────────────────────────

  const deptTi = await prisma.departamento.upsert({
    where: { tenantId_codigo: { tenantId, codigo: 'TI' } },
    update: {},
    create: {
      tenantId,
      codigo: 'TI',
      nome: 'Tecnologia de Informação',
      descricao: 'Departamento de desenvolvimento de software',
      ativo: true,
    },
  });

  const deptRh = await prisma.departamento.upsert({
    where: { tenantId_codigo: { tenantId, codigo: 'RH' } },
    update: {},
    create: {
      tenantId,
      codigo: 'RH',
      nome: 'Recursos Humanos',
      descricao: 'Gestão de pessoas e cultura organizacional',
      ativo: true,
    },
  });

  // ─── Cargos ─────────────────────────────────────────────────────────────────

  const cargoDevSenior = await prisma.cargo.upsert({
    where: { tenantId_codigo: { tenantId, codigo: 'DEV-SR' } },
    update: {},
    create: {
      tenantId,
      codigo: 'DEV-SR',
      nome: 'Desenvolvedor Sénior',
      departamentoId: deptTi.id,
      nivelSalarial: 5,
      salarioMinimo: 40000,
      salarioMaximo: 60000,
      ativo: true,
    },
  });

  const cargoGestorRh = await prisma.cargo.upsert({
    where: { tenantId_codigo: { tenantId, codigo: 'GEST-RH' } },
    update: {},
    create: {
      tenantId,
      codigo: 'GEST-RH',
      nome: 'Gestor de Recursos Humanos',
      departamentoId: deptRh.id,
      nivelSalarial: 6,
      salarioMinimo: 50000,
      salarioMaximo: 70000,
      ativo: true,
    },
  });

  // ─── Colaboradores (fonte: rh-storage.ts mock data) ─────────────────────────

  const col1 = await prisma.colaborador.upsert({
    where: { tenantId_codigo: { tenantId, codigo: 'COL-0001' } },
    update: {},
    create: {
      tenantId,
      codigo: 'COL-0001',
      nome: 'João Manuel Silva',
      dataNascimento: new Date('1990-05-15'),
      genero: 'MASCULINO',
      estadoCivil: 'CASADO',
      nacionalidade: 'Moçambicana',
      naturalidadeProvincia: 'Maputo',
      naturalidadeDistrito: 'Maputo',
      bi: '110100123456A',
      nuit: '123456789',
      niss: '987654321',
      email: 'joao.silva@empresa.co.mz',
      telefone: '+258841234567',
      enderecoRua: 'Avenida Julius Nyerere',
      enderecoNumero: '123',
      enderecoBairro: 'Sommerschield',
      enderecoCidade: 'Maputo',
      enderecoProvincia: 'Maputo',
      emergenciaNome: 'Maria Silva',
      emergenciaParentesco: 'Esposa',
      emergenciaTelefone: '+258847654321',
      departamentoId: deptTi.id,
      cargoId: cargoDevSenior.id,
      dataAdmissao: new Date('2020-01-15'),
      status: 'ACTIVO',
      tipoContrato: 'EFECTIVO',
      regimeTrabalho: 'TEMPO_INTEGRAL',
      salarioBase: 45000,
      subsidioAlimentacao: 5000,
      subsidioTransporte: 3000,
      nivelAcesso: 'USUARIO',
    },
  });

  const col2 = await prisma.colaborador.upsert({
    where: { tenantId_codigo: { tenantId, codigo: 'COL-0002' } },
    update: {},
    create: {
      tenantId,
      codigo: 'COL-0002',
      nome: 'Maria dos Santos',
      dataNascimento: new Date('1988-08-20'),
      genero: 'FEMININO',
      estadoCivil: 'SOLTEIRO',
      nacionalidade: 'Moçambicana',
      naturalidadeProvincia: 'Sofala',
      naturalidadeDistrito: 'Beira',
      bi: '110200234567B',
      nuit: '234567890',
      niss: '876543210',
      email: 'maria.santos@empresa.co.mz',
      telefone: '+258822345678',
      enderecoRua: 'Avenida 24 de Julho',
      enderecoNumero: '456',
      enderecoBairro: 'Polana',
      enderecoCidade: 'Maputo',
      enderecoProvincia: 'Maputo',
      emergenciaNome: 'Ana Santos',
      emergenciaParentesco: 'Mãe',
      emergenciaTelefone: '+258828765432',
      departamentoId: deptRh.id,
      cargoId: cargoGestorRh.id,
      dataAdmissao: new Date('2019-03-10'),
      status: 'ACTIVO',
      tipoContrato: 'EFECTIVO',
      regimeTrabalho: 'TEMPO_INTEGRAL',
      salarioBase: 55000,
      subsidioAlimentacao: 5000,
      subsidioTransporte: 3000,
      subsidioHabitacao: 10000,
      nivelAcesso: 'GERENTE',
    },
  });

  // ─── Formação Académica ─────────────────────────────────────────────────────

  const formacaoExistente = await prisma.formacaoAcademica.findFirst({
    where: { tenantId, colaboradorId: col1.id },
  });
  if (!formacaoExistente) {
    await prisma.formacaoAcademica.create({
      data: {
        tenantId,
        colaboradorId: col1.id,
        nivel: 'LICENCIATURA',
        instituicao: 'Universidade Eduardo Mondlane',
        curso: 'Engenharia Informática',
        anoConclusao: '2015',
      },
    });
  }

  const formacaoExistente2 = await prisma.formacaoAcademica.findFirst({
    where: { tenantId, colaboradorId: col2.id },
  });
  if (!formacaoExistente2) {
    await prisma.formacaoAcademica.create({
      data: {
        tenantId,
        colaboradorId: col2.id,
        nivel: 'MESTRADO',
        instituicao: 'ISCTEM',
        curso: 'Gestão de Recursos Humanos',
        anoConclusao: '2018',
      },
    });
  }

  // ─── Período de Férias ──────────────────────────────────────────────────────

  const feriasExistente = await prisma.ferias.findFirst({
    where: { tenantId, colaboradorId: col1.id },
  });
  if (!feriasExistente) {
    await prisma.ferias.create({
      data: {
        tenantId,
        colaboradorId: col1.id,
        periodoAquisitivoInicio: new Date('2025-01-01'),
        periodoAquisitivoFim: new Date('2025-12-31'),
        diasDisponiveis: 24,
        diasUsados: 0,
      },
    });
  }

  const feriasExistente2 = await prisma.ferias.findFirst({
    where: { tenantId, colaboradorId: col2.id },
  });
  if (!feriasExistente2) {
    await prisma.ferias.create({
      data: {
        tenantId,
        colaboradorId: col2.id,
        periodoAquisitivoInicio: new Date('2025-01-01'),
        periodoAquisitivoFim: new Date('2025-12-31'),
        diasDisponiveis: 24,
        diasUsados: 5,
      },
    });
  }

  // ─── Equipa (fonte: projeto-storage.ts mock) ────────────────────────────────

  const equipa = await prisma.equipa.upsert({
    where: { tenantId_nome: { tenantId, nome: 'Equipa Produto' } },
    update: {},
    create: {
      tenantId,
      nome: 'Equipa Produto',
      descricao: 'Equipa principal de desenvolvimento de produto',
      status: 'ATIVA',
    },
  });

  // Membros da equipa
  const membroExistente = await prisma.membroEquipa.findFirst({
    where: { tenantId, equipaId: equipa.id, colaboradorId: col1.id },
  });
  if (!membroExistente) {
    await prisma.membroEquipa.create({
      data: {
        tenantId,
        equipaId: equipa.id,
        colaboradorId: col1.id,
        papel: 'DESENVOLVEDOR',
        custoHora: 250,
        horasSemanais: 40,
        dataEntrada: new Date('2024-01-01'),
        status: 'ATIVO',
      },
    });
  }

  const membroExistente2 = await prisma.membroEquipa.findFirst({
    where: { tenantId, equipaId: equipa.id, colaboradorId: col2.id },
  });
  if (!membroExistente2) {
    await prisma.membroEquipa.create({
      data: {
        tenantId,
        equipaId: equipa.id,
        colaboradorId: col2.id,
        papel: 'GERENTE',
        custoHora: 300,
        horasSemanais: 40,
        dataEntrada: new Date('2024-01-01'),
        status: 'ATIVO',
      },
    });
  }

  // ─── Projecto ───────────────────────────────────────────────────────────────

  const projeto = await prisma.projeto.upsert({
    where: { tenantId_codigo: { tenantId, codigo: 'PRJ-2025-001' } },
    update: {},
    create: {
      tenantId,
      codigo: 'PRJ-2025-001',
      nome: 'Sistema ERP v2.0',
      descricao: 'Modernização do sistema ERP interno',
      tipo: 'INTERNO',
      status: 'EM_ANDAMENTO',
      prioridade: 'ALTA',
      dataInicio: new Date('2025-01-01'),
      dataFimPrevista: new Date('2025-12-31'),
      orcamentoPlanejado: 500000,
      horasEstimadas: 2000,
      gerenteId: adminId,
      progresso: 25,
      tags: ['erp', 'modernizacao'],
    },
  });

  // Associar equipa ao projecto
  const projetoEquipaExistente = await prisma.projetoEquipa.findFirst({
    where: { tenantId, projetoId: projeto.id, equipaId: equipa.id },
  });
  if (!projetoEquipaExistente) {
    await prisma.projetoEquipa.create({
      data: { tenantId, projetoId: projeto.id, equipaId: equipa.id },
    });
  }

  // ─── Tarefas ────────────────────────────────────────────────────────────────

  const tarefaExistente = await prisma.tarefaProjeto.findFirst({
    where: { tenantId, codigo: 'T-001' },
  });
  if (!tarefaExistente) {
    await prisma.tarefaProjeto.create({
      data: {
        tenantId,
        projetoId: projeto.id,
        codigo: 'T-001',
        titulo: 'Implementar autenticação multi-factor',
        descricao: 'Adicionar suporte a MFA via TOTP',
        tipo: 'TAREFA',
        status: 'CONCLUIDA',
        prioridade: 'ALTA',
        posicao: '0.5',
        dataFimPrevista: new Date('2025-03-31'),
        horasEstimadas: 80,
        responsavelId: col1.id,
        criadoPorId: adminId,
        progresso: 100,
        dependencias: [],
        tags: ['auth', 'seguranca'],
      },
    });
  }

  const tarefaExistente2 = await prisma.tarefaProjeto.findFirst({
    where: { tenantId, codigo: 'T-002' },
  });
  if (!tarefaExistente2) {
    await prisma.tarefaProjeto.create({
      data: {
        tenantId,
        projetoId: projeto.id,
        codigo: 'T-002',
        titulo: 'Migração para Prisma 7',
        descricao: 'Actualizar ORM e migrar schema existente',
        tipo: 'MELHORIA',
        status: 'EM_PROGRESSO',
        prioridade: 'MEDIA',
        posicao: '0.75',
        dataFimPrevista: new Date('2025-06-30'),
        horasEstimadas: 120,
        responsavelId: col1.id,
        criadoPorId: adminId,
        progresso: 40,
        dependencias: [],
        tags: ['database', 'prisma'],
      },
    });
  }

  // ─── Marco ──────────────────────────────────────────────────────────────────

  const marcoExistente = await prisma.marco.findFirst({
    where: { tenantId, projetoId: projeto.id, nome: 'Alpha Release' },
  });
  if (!marcoExistente) {
    await prisma.marco.create({
      data: {
        tenantId,
        projetoId: projeto.id,
        nome: 'Alpha Release',
        descricao: 'Primeira versão funcional para testes internos',
        dataPrevista: new Date('2025-06-30'),
        status: 'EM_ANDAMENTO',
        progresso: 40,
      },
    });
  }

  // ─── Produção — mocks inline ────────────────────────────────────────────────

  // Centro de trabalho
  const centroExistente = await prisma.centroTrabalho.findFirst({
    where: { tenantId, codigo: 'CT-LINHA-1' },
  });
  let centroId: string;
  if (!centroExistente) {
    const ct = await prisma.centroTrabalho.create({
      data: {
        tenantId,
        codigo: 'CT-LINHA-1',
        nome: 'Linha de Produção 1',
        tipo: 'LINHA',
        descricao: 'Linha principal de montagem',
        capacidadeHorasDia: 8,
        custoHora: 500,
        ativo: true,
      },
    });
    centroId = ct.id;
  } else {
    centroId = centroExistente.id;
  }

  // Estrutura de produto (BOM) — produto mock (FK escalar)
  const PRODUTO_CADEIRA_ID = 'seed-produto-cadeira-ergo-2025'; // FK escalar → WS A (mock)
  const bomExistente = await prisma.estruturaProduto.findFirst({
    where: { tenantId, codigo: 'BOM-CADEIRA-001' },
  });
  let bomId: string;
  if (!bomExistente) {
    const bom = await prisma.estruturaProduto.create({
      data: {
        tenantId,
        produtoId: PRODUTO_CADEIRA_ID,
        codigo: 'BOM-CADEIRA-001',
        nome: 'Cadeira Ergonómica Exec',
        versao: '1.0',
        status: 'ATIVO',
        categoria: 'PRODUTO_ACABADO',
        unidadeProducao: 'un',
        tempoProducao: 120, // minutos
        nivelComplexidade: 'MEDIO',
        responsavelId: adminId,
      },
    });
    bomId = bom.id;

    // Componentes da BOM
    await prisma.componenteBOM.createMany({
      data: [
        {
          tenantId,
          estruturaProdutoId: bomId,
          componenteProdutoId: 'seed-prod-aco-inox-001',
          codigoComponente: 'MP-ACO-001',
          nomeComponente: 'Aço Inoxidável 2mm',
          categoria: 'MATERIA_PRIMA',
          quantidade: 5,
          unidadeMedida: 'kg',
          custoUnitario: 120,
          perdaPrevista: 0.05,
          tempoLead: 7,
          ativo: true,
        },
        {
          tenantId,
          estruturaProdutoId: bomId,
          componenteProdutoId: 'seed-prod-espuma-001',
          codigoComponente: 'MP-ESP-001',
          nomeComponente: 'Espuma HR 50',
          categoria: 'MATERIA_PRIMA',
          quantidade: 2,
          unidadeMedida: 'kg',
          custoUnitario: 80,
          perdaPrevista: 0.02,
          tempoLead: 3,
          ativo: true,
        },
        {
          tenantId,
          estruturaProdutoId: bomId,
          componenteProdutoId: 'seed-prod-roda-001',
          codigoComponente: 'MP-ROD-001',
          nomeComponente: 'Rodízios Duplos (pack 5)',
          categoria: 'COMPONENTE',
          quantidade: 1,
          unidadeMedida: 'pc',
          custoUnitario: 350,
          perdaPrevista: 0,
          tempoLead: 5,
          ativo: true,
        },
      ],
    });
  } else {
    bomId = bomExistente.id;
  }

  // Roteiro
  const roteiroExistente = await prisma.roteiro.findFirst({
    where: { tenantId, codigo: 'ROT-CADEIRA-001' },
  });
  if (!roteiroExistente) {
    const rot = await prisma.roteiro.create({
      data: {
        tenantId,
        codigo: 'ROT-CADEIRA-001',
        nome: 'Roteiro Cadeira Exec',
        estruturaProdutoId: bomId,
        versao: '1.0',
        status: 'ATIVO',
        responsavelId: adminId,
      },
    });

    await prisma.operacaoRoteiro.createMany({
      data: [
        {
          tenantId,
          roteiroId: rot.id,
          sequencia: 1,
          nome: 'Corte e dobra do aço',
          centroTrabalhoId: centroId,
          tempoPreparacao: 15,
          tempoOperacao: 30,
          tempoLimpeza: 5,
          custoHora: 500,
          eficienciaEsperada: 0.85,
          dependencias: [],
          paralela: false,
          obrigatoria: true,
          status: 'ATIVO',
          ferramentasNecessarias: ['prensa', 'cortadora'],
          qualificacoesRequeridas: ['soldadura_nv2'],
        },
        {
          tenantId,
          roteiroId: rot.id,
          sequencia: 2,
          nome: 'Montagem e estofamento',
          centroTrabalhoId: centroId,
          tempoPreparacao: 10,
          tempoOperacao: 45,
          tempoLimpeza: 5,
          custoHora: 500,
          eficienciaEsperada: 0.90,
          dependencias: [],
          paralela: false,
          obrigatoria: true,
          status: 'ATIVO',
          ferramentasNecessarias: ['pistola_cola', 'grampeador'],
          qualificacoesRequeridas: [],
        },
      ],
    });
  }

  // Ordem de Produção (status PLANEADA — sem movimentos de stock)
  const ordemExistente = await prisma.ordemProducao.findFirst({
    where: { tenantId, numero: 'OP-2025-0001' },
  });
  if (!ordemExistente) {
    await prisma.ordemProducao.create({
      data: {
        tenantId,
        numero: 'OP-2025-0001',
        produtoId: PRODUTO_CADEIRA_ID,
        codigoProduto: 'CAD-ERG-001',
        nomeProduto: 'Cadeira Ergonómica Exec',
        quantidade: 10,
        unidadeMedida: 'un',
        status: 'PLANEADA',
        prioridade: 'MEDIA',
        responsavelId: col1.id,
        dataPrevisaoInicio: new Date('2025-07-15'),
        dataPrevisaoFim: new Date('2025-07-31'),
        custoEstimado: 15000,
        criadoPorId: adminId,
        observacoes: 'Lote inicial para stock',
      },
    });
  }

  console.log('  pessoas-projetos: colaboradores, equipas, projectos, tarefas, produção — OK');
}
