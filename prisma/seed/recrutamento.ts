/**
 * Seed — Recrutamento (Spec 07).
 * 2 vagas demo + candidatos em várias etapas.
 * Idempotente: usa upsert por chave natural.
 * NÃO executa se as tabelas ainda não existirem (será chamado após migrations).
 */
import type { PrismaClient } from '@prisma/client';

export async function seedRecrutamento(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  // Departamento TI (criado no seed pessoas-projetos)
  const deptTi = await prisma.departamento.findFirst({
    where: { tenantId, codigo: 'TI' },
    select: { id: true },
  });

  const deptRh = await prisma.departamento.findFirst({
    where: { tenantId, codigo: 'RH' },
    select: { id: true },
  });

  // ─── Vagas ──────────────────────────────────────────────────────────────────

  const vaga1 = await prisma.vaga.upsert({
    where: { tenantId_codigo: { tenantId, codigo: 'VAG-DEMO-001' } },
    update: {},
    create: {
      tenantId,
      codigo: 'VAG-DEMO-001',
      titulo: 'Programador Full-Stack Sénior',
      descricao: 'Procuramos um programador experiente para integrar a nossa equipa de produto. Será responsável pelo desenvolvimento de funcionalidades end-to-end, revisões de código e mentoria de juniors.',
      departamentoId: deptTi?.id ?? null,
      numeroPosicoes: 2,
      posicoesPreenchidas: 0,
      salarioMin: 45000,
      salarioMax: 65000,
      regimeTrabalho: 'TEMPO_INTEGRAL',
      tipoContrato: 'EFECTIVO',
      localizacao: 'Maputo',
      requisitos: [
        'Mínimo 4 anos de experiência com React e Node.js',
        'Experiência com PostgreSQL e ORMs',
        'Capacidade de trabalho em equipa ágil',
        'Inglês técnico (leitura)',
      ],
      status: 'ABERTA',
      dataAbertura: new Date('2025-06-01'),
    },
  });

  const vaga2 = await prisma.vaga.upsert({
    where: { tenantId_codigo: { tenantId, codigo: 'VAG-DEMO-002' } },
    update: {},
    create: {
      tenantId,
      codigo: 'VAG-DEMO-002',
      titulo: 'Técnico de Recursos Humanos',
      descricao: 'Pretendemos admitir um técnico de RH para reforço da equipa de pessoas, com foco em recrutamento, processamento salarial e gestão de benefícios.',
      departamentoId: deptRh?.id ?? null,
      numeroPosicoes: 1,
      posicoesPreenchidas: 0,
      salarioMin: 25000,
      salarioMax: 35000,
      regimeTrabalho: 'TEMPO_INTEGRAL',
      tipoContrato: 'EFECTIVO',
      localizacao: 'Maputo',
      requisitos: [
        'Licenciatura em Gestão de Recursos Humanos ou área afim',
        'Experiência mínima de 2 anos',
        'Conhecimento de legislação laboral moçambicana',
      ],
      status: 'EM_TRIAGEM',
      dataAbertura: new Date('2025-05-15'),
    },
  });

  // ─── Candidatos ─────────────────────────────────────────────────────────────

  const cand1 = await prisma.candidato.upsert({
    where: { tenantId_email: { tenantId, email: 'joao.silva.demo@example.mz' } },
    update: {},
    create: {
      tenantId,
      nome: 'João Alberto Silva',
      email: 'joao.silva.demo@example.mz',
      telefone: '84 123 4567',
      observacoes: 'Candidato com forte background em React e TypeScript. Participou em 2 hackathons.',
    },
  });

  const cand2 = await prisma.candidato.upsert({
    where: { tenantId_email: { tenantId, email: 'maria.santos.demo@example.mz' } },
    update: {},
    create: {
      tenantId,
      nome: 'Maria da Graça Santos',
      email: 'maria.santos.demo@example.mz',
      telefone: '85 987 6543',
      observacoes: 'Perfil sénior, experiência em gestão de equipas.',
    },
  });

  const cand3 = await prisma.candidato.upsert({
    where: { tenantId_email: { tenantId, email: 'pedro.machava.demo@example.mz' } },
    update: {},
    create: {
      tenantId,
      nome: 'Pedro António Machava',
      email: 'pedro.machava.demo@example.mz',
      telefone: '86 555 1234',
      observacoes: 'Recém-licenciado com estágio em empresa de software.',
    },
  });

  const cand4 = await prisma.candidato.upsert({
    where: { tenantId_email: { tenantId, email: 'ana.tembe.demo@example.mz' } },
    update: {},
    create: {
      tenantId,
      nome: 'Ana Paula Tembe',
      email: 'ana.tembe.demo@example.mz',
      telefone: '87 321 9876',
      observacoes: 'Licenciada em Gestão de RH. 3 anos de experiência.',
    },
  });

  const cand5 = await prisma.candidato.upsert({
    where: { tenantId_email: { tenantId, email: 'carlos.nhantumbo.demo@example.mz' } },
    update: {},
    create: {
      tenantId,
      nome: 'Carlos Nhantumbo',
      email: 'carlos.nhantumbo.demo@example.mz',
      telefone: '84 777 8888',
      observacoes: 'Técnico de RH com experiência em processamento salarial.',
    },
  });

  // ─── Candidaturas — Vaga 1 (Programador) ───────────────────────────────────

  // Candidatura 1: em Entrevista
  const candidatura1 = await prisma.candidatura.upsert({
    where: { tenantId_vagaId_candidatoId: { tenantId, vagaId: vaga1.id, candidatoId: cand1.id } },
    update: {},
    create: {
      tenantId,
      vagaId: vaga1.id,
      candidatoId: cand1.id,
      etapa: 'ENTREVISTA',
      posicao: '1',
      fonte: 'LinkedIn',
      pretensaoSalarial: 55000,
    },
  });

  // Candidatura 2: em Proposta
  const candidatura2 = await prisma.candidatura.upsert({
    where: { tenantId_vagaId_candidatoId: { tenantId, vagaId: vaga1.id, candidatoId: cand2.id } },
    update: {},
    create: {
      tenantId,
      vagaId: vaga1.id,
      candidatoId: cand2.id,
      etapa: 'PROPOSTA',
      posicao: '1',
      fonte: 'Referência',
      pretensaoSalarial: 62000,
    },
  });

  // Candidatura 3: recebida (recente)
  const candidatura3 = await prisma.candidatura.upsert({
    where: { tenantId_vagaId_candidatoId: { tenantId, vagaId: vaga1.id, candidatoId: cand3.id } },
    update: {},
    create: {
      tenantId,
      vagaId: vaga1.id,
      candidatoId: cand3.id,
      etapa: 'RECEBIDA',
      posicao: '1',
      fonte: 'Site',
      pretensaoSalarial: 45000,
    },
  });

  // ─── Candidaturas — Vaga 2 (Técnico RH) ────────────────────────────────────

  // Candidatura 4: em Triagem
  const candidatura4 = await prisma.candidatura.upsert({
    where: { tenantId_vagaId_candidatoId: { tenantId, vagaId: vaga2.id, candidatoId: cand4.id } },
    update: {},
    create: {
      tenantId,
      vagaId: vaga2.id,
      candidatoId: cand4.id,
      etapa: 'TRIAGEM',
      posicao: '1',
      fonte: 'Referência interna',
      pretensaoSalarial: 30000,
    },
  });

  const candidatura5 = await prisma.candidatura.upsert({
    where: { tenantId_vagaId_candidatoId: { tenantId, vagaId: vaga2.id, candidatoId: cand5.id } },
    update: {},
    create: {
      tenantId,
      vagaId: vaga2.id,
      candidatoId: cand5.id,
      etapa: 'RECEBIDA',
      posicao: '1',
      fonte: 'Site',
      pretensaoSalarial: 28000,
    },
  });

  // ─── Histórico das candidaturas (aditivo — não duplica se já existir) ───────

  async function garantirHistorico(
    candidaturaId: string,
    etapaNova: string,
    notas: string,
    responsavelId: string,
  ) {
    const existe = await prisma.historicoCandidatura.findFirst({
      where: { tenantId, candidaturaId, etapaNova: etapaNova as 'RECEBIDA' | 'TRIAGEM' | 'ENTREVISTA' | 'PROPOSTA' | 'CONTRATADO' | 'REJEITADO' | 'DESISTIU', etapaAnterior: null },
    });
    if (!existe) {
      await prisma.historicoCandidatura.create({
        data: {
          tenantId,
          candidaturaId,
          etapaAnterior: null,
          etapaNova: etapaNova as 'RECEBIDA' | 'TRIAGEM' | 'ENTREVISTA' | 'PROPOSTA' | 'CONTRATADO' | 'REJEITADO' | 'DESISTIU',
          responsavelId,
          notas,
        },
      });
    }
  }

  const admin = await prisma.user.findFirst({
    where: { tenantId, email: 'admin@demo.mz' },
    select: { id: true },
  });
  const adminId = admin?.id ?? 'seed-admin';

  await garantirHistorico(candidatura1.id, 'RECEBIDA', 'Candidatura recebida via LinkedIn', adminId);
  await garantirHistorico(candidatura2.id, 'RECEBIDA', 'Candidatura recebida via referência', adminId);
  await garantirHistorico(candidatura3.id, 'RECEBIDA', 'Candidatura recebida pelo site', adminId);
  await garantirHistorico(candidatura4.id, 'RECEBIDA', 'Candidatura recebida', adminId);
  await garantirHistorico(candidatura5.id, 'RECEBIDA', 'Candidatura recebida pelo site', adminId);

  // ─── Entrevista demo ─────────────────────────────────────────────────────────

  const existeEntrevista = await prisma.entrevista.findFirst({
    where: { tenantId, candidaturaId: candidatura1.id },
  });

  if (!existeEntrevista) {
    await prisma.entrevista.create({
      data: {
        tenantId,
        candidaturaId: candidatura1.id,
        tipo: 'TECNICA',
        dataHora: new Date('2025-07-10T10:00:00Z'),
        entrevistadores: ['Maria Gerente', 'João Tech Lead'],
        avaliacao: 7.5,
        parecer: 'Candidato com bons fundamentos. Demonstrou conhecimento sólido em React e TypeScript. Alguma hesitação em testes unitários.',
        recomendaAvancar: true,
      },
    });
  }

  console.log('  recrutamento: 2 vagas, 5 candidatos, 5 candidaturas — OK');
}
