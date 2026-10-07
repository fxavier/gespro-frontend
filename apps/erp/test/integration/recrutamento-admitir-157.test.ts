/**
 * Oráculo — issue #157: «Marcar como Contratado» impede «Admitir como Colaborador».
 *
 * Hoje o pipeline deixa mover uma candidatura PROPOSTA → CONTRATADO (`moverEtapa`) sem criar
 * Colaborador; depois o `CandidaturaService.admitir` recusa qualquer candidatura em CONTRATADO
 * com `CANDIDATURA_JA_ADMITIDA` — a candidatura fica num estado sem saída: «contratada» e sem
 * colaborador para sempre.
 *
 * Contrato (decisão do orquestrador): admitir funciona a partir de CONTRATADO enquanto a
 * candidatura ainda não tiver colaborador. O que decide «já admitida» é haver `colaboradorId`,
 * não a etapa.
 *   - CONTRATADO sem colaborador → `admitirAction` cria o Colaborador, liga-o à candidatura
 *     (`colaboradorId`), a etapa fica CONTRATADO, o histórico regista a admissão (notas com o
 *     código do colaborador), a vaga ganha uma posição preenchida e fecha quando enche — tal e
 *     qual a admissão a partir de PROPOSTA (o `moverEtapa` não mexeu em posições).
 *   - CONTRATADO com colaborador → recusa `CANDIDATURA_JA_ADMITIDA`, nada é criado, a vaga não
 *     muda (sem dupla admissão).
 *   - Uma falha de negócio na admissão a partir de CONTRATADO (NUIT duplicado) devolve o código
 *     da falha — não `CANDIDATURA_JA_ADMITIDA` — e deixa a candidatura admissível.
 *   - Continua tudo o resto: PROPOSTA admite; REJEITADO não admite; outro tenant → 404.
 *
 * Sessão (`@/lib/auth`) é o único duplo (fronteira), mutável por `vi.hoisted`. `next/cache` é
 * dobrado porque o `updateTag` exige um pedido Next. Tudo o resto é real: Postgres efémero,
 * `createSafeAction`, `moverEtapaAction`, `admitirAction`, `CandidaturaService`.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó D:recrutamento-admitir-157; um agente de implementação que o
 * altere é BLOCKER.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

const h = vi.hoisted(() => ({
  sessao: null as null | {
    user: { id: string; tenantId: string; permissions: string[]; acesso: 'aberto' | 'leitura' | 'fechado' };
  },
}));
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => h.sessao) }));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

type Resultado = { ok: boolean; data?: any; error?: { code: string; message: string } };

describe.skipIf(skip)('Admitir a partir de CONTRATADO sem colaborador (#157) — DB efémera', () => {
  let db: any;
  let admitir: (input: unknown) => Promise<Resultado>;
  let moverEtapa: (input: unknown) => Promise<Resultado>;

  const sufixo = Date.now();
  const TENANT = `tenant-rec-157-${sufixo}`;
  const OUTRO_TENANT = `tenant-rec-157-outro-${sufixo}`;
  const USER = `cuserrec157${sufixo}`;
  const PERMISSOES = [
    'rh:recrutamento:read',
    'rh:recrutamento:candidaturas:update',
    'rh:recrutamento:admitir',
  ];

  function sessao(tenantId = TENANT) {
    h.sessao = { user: { id: USER, tenantId, permissions: PERMISSOES, acesso: 'aberto' } };
  }

  // NUIT (9 dígitos, não todos iguais) e BI (12 dígitos + letra) únicos por chamada.
  let seq = 0;
  function identidade() {
    seq += 1;
    const n = String(seq).padStart(3, '0');
    return {
      nuit: `4${String(sufixo).slice(-5)}${n}`,
      bi: `1101${String(sufixo).slice(-5)}${n}A`,
      codigo: `REC157-${seq}-${String(sufixo).slice(-6)}`,
      email: `admitido-157-${seq}-${sufixo}@test.mz`,
    };
  }

  function inputAdmitir(candidaturaId: string, id = identidade()) {
    return {
      candidaturaId,
      nome: `Admitido ${id.codigo}`,
      codigo: id.codigo,
      dataNascimento: new Date('1992-04-10T00:00:00Z'),
      genero: 'FEMININO',
      estadoCivil: 'SOLTEIRO',
      nacionalidade: 'Moçambicana',
      naturalidadeProvincia: 'Maputo',
      naturalidadeDistrito: 'KaMpfumo',
      bi: id.bi,
      nuit: id.nuit,
      email: id.email,
      telefone: '+258840000001',
      enderecoRua: 'Av. 24 de Julho',
      enderecoNumero: '1',
      enderecoBairro: 'Polana',
      enderecoCidade: 'Maputo',
      enderecoProvincia: 'Maputo',
      emergenciaNome: 'Contacto',
      emergenciaParentesco: 'Irmão',
      emergenciaTelefone: '+258840000002',
      dataAdmissao: new Date('2026-11-01T10:00:00Z'),
      tipoContrato: 'EFECTIVO',
      regimeTrabalho: 'TEMPO_INTEGRAL',
      salarioBase: 30000,
      nivelAcesso: 'USUARIO',
    };
  }

  let seqVaga = 0;
  /** Vaga própria (1 posição por omissão) + candidato + candidatura na etapa pedida, sem colaborador. */
  async function candidaturaEm(
    etapa: 'PROPOSTA' | 'REJEITADO',
    { tenant = TENANT, posicoes = 1 }: { tenant?: string; posicoes?: number } = {},
  ): Promise<{ candidaturaId: string; vagaId: string }> {
    seqVaga += 1;
    const vaga = await db.vaga.create({
      data: {
        tenantId: tenant,
        codigo: `VAG-157-${seqVaga}-${sufixo}`,
        titulo: `Vaga 157 #${seqVaga}`,
        descricao: 'Vaga do oráculo #157',
        numeroPosicoes: posicoes,
        regimeTrabalho: 'TEMPO_INTEGRAL',
        tipoContrato: 'EFECTIVO',
        requisitos: [],
        status: 'ABERTA',
        dataAbertura: new Date('2026-10-01T10:00:00Z'),
      },
      select: { id: true },
    });
    const candidato = await db.candidato.create({
      data: {
        tenantId: tenant,
        nome: `Candidato 157 #${seqVaga}`,
        email: `candidato-157-${seqVaga}-${sufixo}@test.mz`,
        telefone: '+258840000003',
      },
      select: { id: true },
    });
    const candidatura = await db.candidatura.create({
      data: { tenantId: tenant, vagaId: vaga.id, candidatoId: candidato.id, etapa },
      select: { id: true },
    });
    return { candidaturaId: candidatura.id, vagaId: vaga.id };
  }

  /** O caminho real do defeito: «Marcar como Contratado» no pipeline (sem criar colaborador). */
  async function contratadaSemColaborador(opts?: { tenant?: string; posicoes?: number }) {
    const c = await candidaturaEm('PROPOSTA', opts);
    sessao(opts?.tenant ?? TENANT);
    const r = await moverEtapa({ candidaturaId: c.candidaturaId, novaEtapa: 'CONTRATADO' });
    expect(r.ok, `moverEtapa PROPOSTA→CONTRATADO falhou: ${JSON.stringify(r.error)}`).toBe(true);
    const linha = await db.candidatura.findUnique({ where: { id: c.candidaturaId } });
    expect(linha.etapa).toBe('CONTRATADO');
    expect(linha.colaboradorId).toBeNull();
    sessao();
    return c;
  }

  const lerCandidatura = (id: string) =>
    db.candidatura.findUnique({ where: { id }, select: { etapa: true, colaboradorId: true } });
  const lerVaga = (id: string) =>
    db.vaga.findUnique({ where: { id }, select: { posicoesPreenchidas: true, status: true } });
  const contarColaboradores = (tenant = TENANT) => db.colaborador.count({ where: { tenantId: tenant } });

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    // Acesso dinâmico: falha o caso, não o ficheiro.
    const actions = (await import('@/server/actions/recrutamento.actions')) as unknown as Record<string, any>;
    admitir = actions.admitirAction;
    moverEtapa = actions.moverEtapaAction;

    for (const [id, slug, nuit] of [
      [TENANT, `rec-157-${sufixo}`, `${sufixo}`.slice(-9)],
      [OUTRO_TENANT, `rec-157-outro-${sufixo}`, `${sufixo + 1}`.slice(-9)],
    ] as const) {
      await db.tenant.create({ data: { id, nome: `Tenant ${slug}`, slug, nuit } });
    }
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `gestor-rec-157-${sufixo}@test.mz`, nome: 'Gestor RH', keycloakSub: `kc-${USER}` },
    });
  });

  it('regressão: a partir de PROPOSTA admite, liga o colaborador e passa a CONTRATADO', async () => {
    const { candidaturaId, vagaId } = await candidaturaEm('PROPOSTA');
    sessao();
    const id = identidade();
    const r = await admitir(inputAdmitir(candidaturaId, id));
    expect(r.ok, JSON.stringify(r.error)).toBe(true);

    const colab = await db.colaborador.findFirst({ where: { tenantId: TENANT, nuit: id.nuit } });
    expect(colab).not.toBeNull();
    expect(r.data?.colaboradorId).toBe(colab.id);
    expect(await lerCandidatura(candidaturaId)).toEqual({ etapa: 'CONTRATADO', colaboradorId: colab.id });
    expect(await lerVaga(vagaId)).toEqual({ posicoesPreenchidas: 1, status: 'FECHADA' });
  });

  it('CONTRATADO sem colaborador: «Admitir como Colaborador» cria o colaborador e liga-o à candidatura', async () => {
    const { candidaturaId, vagaId } = await contratadaSemColaborador();
    const antes = await contarColaboradores();
    const id = identidade();

    const r = await admitir(inputAdmitir(candidaturaId, id));
    expect(r.ok, `admitir a partir de CONTRATADO recusado: ${JSON.stringify(r.error)}`).toBe(true);

    expect(await contarColaboradores()).toBe(antes + 1);
    const colab = await db.colaborador.findFirst({
      where: { tenantId: TENANT, nuit: id.nuit },
      select: { id: true, codigo: true, bi: true, email: true, status: true },
    });
    expect(colab).toMatchObject({ codigo: id.codigo, bi: id.bi, email: id.email, status: 'PERIODO_EXPERIMENTAL' });
    expect(r.data?.colaboradorId).toBe(colab.id);

    // A candidatura continua CONTRATADO e passa a ter o colaborador.
    expect(await lerCandidatura(candidaturaId)).toEqual({ etapa: 'CONTRATADO', colaboradorId: colab.id });

    // O histórico regista a admissão (o «Marcar como Contratado» não a registou).
    const historico = await db.historicoCandidatura.findMany({
      where: { tenantId: TENANT, candidaturaId },
      orderBy: { createdAt: 'asc' },
    });
    const admissao = historico.filter((x: any) => x.etapaNova === 'CONTRATADO' && (x.notas ?? '').includes(id.codigo));
    expect(admissao, 'histórico sem registo da admissão').toHaveLength(1);
    expect(admissao[0].responsavelId).toBe(USER);

    // A vaga ganha a posição que o «Marcar como Contratado» não contou, e fecha por ficar cheia.
    expect(await lerVaga(vagaId)).toEqual({ posicoesPreenchidas: 1, status: 'FECHADA' });
  });

  it('CONTRATADO já com colaborador: recusa CANDIDATURA_JA_ADMITIDA e não cria nada', async () => {
    const { candidaturaId, vagaId } = await contratadaSemColaborador({ posicoes: 3 });
    const primeira = await admitir(inputAdmitir(candidaturaId));
    expect(primeira.ok, `primeira admissão recusada: ${JSON.stringify(primeira.error)}`).toBe(true);
    const depoisDaPrimeira = await lerCandidatura(candidaturaId);
    expect(depoisDaPrimeira.colaboradorId).toBe(primeira.data?.colaboradorId);
    const colaboradores = await contarColaboradores();
    const historicos = await db.historicoCandidatura.count({ where: { tenantId: TENANT, candidaturaId } });

    // Segunda tentativa, com identidade nova (nada de duplicados a mascarar a recusa).
    const segunda = await admitir(inputAdmitir(candidaturaId));
    expect(segunda.ok).toBe(false);
    expect(segunda.error?.code).toBe('CANDIDATURA_JA_ADMITIDA');

    expect(await contarColaboradores()).toBe(colaboradores);
    expect(await lerCandidatura(candidaturaId)).toEqual(depoisDaPrimeira);
    expect(await db.historicoCandidatura.count({ where: { tenantId: TENANT, candidaturaId } })).toBe(historicos);
    expect(await lerVaga(vagaId)).toEqual({ posicoesPreenchidas: 1, status: 'ABERTA' });
  });

  it('CONTRATADO sem colaborador: uma falha de negócio devolve o seu código e a candidatura continua admissível', async () => {
    const { candidaturaId, vagaId } = await contratadaSemColaborador();

    // NUIT de um colaborador que já existe no tenant.
    const ocupado = identidade();
    const outra = await candidaturaEm('PROPOSTA', { posicoes: 2 });
    sessao();
    const r0 = await admitir(inputAdmitir(outra.candidaturaId, ocupado));
    expect(r0.ok, JSON.stringify(r0.error)).toBe(true);

    const antes = await contarColaboradores();
    const dup = { ...identidade(), nuit: ocupado.nuit };
    const r1 = await admitir(inputAdmitir(candidaturaId, dup));
    expect(r1.ok).toBe(false);
    expect(r1.error?.code).toBe('COLABORADOR_NUIT_DUPLICADO');
    expect(await contarColaboradores()).toBe(antes);
    expect(await lerCandidatura(candidaturaId)).toEqual({ etapa: 'CONTRATADO', colaboradorId: null });
    expect(await lerVaga(vagaId)).toEqual({ posicoesPreenchidas: 0, status: 'ABERTA' });

    // Corrigido o NUIT, admite.
    const r2 = await admitir(inputAdmitir(candidaturaId));
    expect(r2.ok, JSON.stringify(r2.error)).toBe(true);
    expect((await lerCandidatura(candidaturaId)).colaboradorId).toBe(r2.data?.colaboradorId);
  });

  it('regressão: REJEITADO continua sem admissão (erro de negócio, nada criado)', async () => {
    const { candidaturaId, vagaId } = await candidaturaEm('REJEITADO');
    sessao();
    const antes = await contarColaboradores();
    const r = await admitir(inputAdmitir(candidaturaId));
    expect(r.ok).toBe(false);
    expect(r.error?.code).not.toBe('ERRO_INTERNO');
    expect(await contarColaboradores()).toBe(antes);
    expect(await lerCandidatura(candidaturaId)).toEqual({ etapa: 'REJEITADO', colaboradorId: null });
    expect(await lerVaga(vagaId)).toEqual({ posicoesPreenchidas: 0, status: 'ABERTA' });
  });

  it('CONTRATADO sem colaborador de outro tenant → NAO_ENCONTRADO, nada criado em lado nenhum', async () => {
    const { candidaturaId, vagaId } = await contratadaSemColaborador({ tenant: OUTRO_TENANT });
    sessao(TENANT);
    const antesAqui = await contarColaboradores(TENANT);
    const antesLa = await contarColaboradores(OUTRO_TENANT);
    const r = await admitir(inputAdmitir(candidaturaId));
    expect(r.ok).toBe(false);
    expect(r.error?.code).toBe('NAO_ENCONTRADO');
    expect(await contarColaboradores(TENANT)).toBe(antesAqui);
    expect(await contarColaboradores(OUTRO_TENANT)).toBe(antesLa);
    expect(await lerCandidatura(candidaturaId)).toEqual({ etapa: 'CONTRATADO', colaboradorId: null });
    expect(await lerVaga(vagaId)).toEqual({ posicoesPreenchidas: 0, status: 'ABERTA' });
  });
});
