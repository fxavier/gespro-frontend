/**
 * Issue #349, defeito irmão — com os DOIS limites preenchidos, quatro serviços constroem o
 * `where` com dois spreads da MESMA chave:
 *
 *   ...(filter.dataInicio ? { data: { gte: filter.dataInicio } } : {}),
 *   ...(filter.dataFim    ? { data: { lte: filter.dataFim } }    : {}),
 *
 * O segundo substitui o primeiro: só o `lte` sobrevive e o início é ignorado — um registo
 * ANTERIOR ao intervalo aparece na listagem. Contrato: com início e fim, a listagem devolve
 * só o que está em [início, fim].
 *
 *   - contagem-stock.service `listar`        (ContagemStock.dataAbertura, DateTime)
 *   - comunicacao.service `listar`           (ComunicacaoProjeto.data, DateTime)
 *   - rh.service AssiduidadeService.listar   (RegistoAssiduidade.data, @db.Date)
 *   - projetos.service TimesheetService.listar (Timesheet.data, @db.Date)
 *
 * Os filtros são passados já como Date (o que o schema devolve), para que este oráculo não
 * dependa da correcção dos schemas (o outro lado do #349). Em cada caso há um registo antes,
 * um dentro e um depois do intervalo: o «depois» prova que o fim continua a funcionar.
 *
 * Fixtures: o tenant é montado com o `bootstrapContabilidade` real (séries incluídas); a
 * contagem nasce pelo serviço (número da série), e só a `dataAbertura` é depois fixada à mão —
 * a coluna tem `@default(now())` e não há outra forma de pôr uma contagem no passado. Projecto,
 * colaborador, comunicação, assiduidade e timesheet são escritos pelo client cru (não são
 * documentos numerados nem lançamentos).
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo autor do oráculo (run datas-349, nó B2); um agente de implementação que o
 * altere é BLOCKER.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

describe.skipIf(skip)('Filtro por intervalo com os dois limites — o início não é descartado (#349)', () => {
  let db: any;
  let runCtx: (typeof import('@/server/db/tenant-extension'))['runWithTenantContext'];

  const sufixo = Date.now();
  const TENANT = `tenant-dois-limites-${sufixo}`;
  const USER = `user-dois-limites-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };
  const noCtx = <T>(fn: () => Promise<T>) => runCtx(ctx, fn);

  let projetoId: string;
  let colaboradorId: string;

  // Intervalo de DateTime: dezembro de 2026 em Maputo, como o schema corrigido o devolverá.
  const INICIO = new Date('2026-12-01T00:00:00.000+02:00');
  const FIM = new Date('2026-12-31T23:59:59.999+02:00');
  const ANTES = new Date('2026-11-20T12:00:00+02:00');
  const DENTRO = new Date('2026-12-15T12:00:00+02:00');
  const DEPOIS = new Date('2027-01-10T12:00:00+02:00');

  // Intervalo de @db.Date: como o schema (excluído do #349) o devolve — meia-noite UTC.
  const D_INICIO = new Date('2026-12-01T00:00:00.000Z');
  const D_FIM = new Date('2026-12-31T00:00:00.000Z');
  const D_ANTES = new Date('2026-11-20T00:00:00.000Z');
  const D_DENTRO = new Date('2026-12-15T00:00:00.000Z');
  const D_DEPOIS = new Date('2027-01-10T00:00:00.000Z');

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext: runCtx } = await import('@/server/db/tenant-extension'));
    const { bootstrapContabilidade } = await import('@/server/provisioning/tenant-bootstrap');

    const slug = `dois-limites-${sufixo}`;
    await db.tenant.create({ data: { id: TENANT, nome: `Tenant ${slug}`, slug, nuit: `${sufixo}`.slice(-9) } });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `${slug}@test.mz`, nome: 'Gestor', keycloakSub: `kc-${slug}` },
    });
    await db.$transaction((tx: any) => bootstrapContabilidade(tx, TENANT), { timeout: 60_000 });

    const projeto = await db.projeto.create({
      data: {
        tenantId: TENANT,
        codigo: `PRJ-${sufixo}`,
        nome: 'Projecto do oráculo',
        tipo: 'INTERNO',
        status: 'EM_ANDAMENTO',
        prioridade: 'MEDIA',
        dataInicio: new Date('2026-01-01T00:00:00+02:00'),
        dataFimPrevista: new Date('2027-12-31T00:00:00+02:00'),
      },
      select: { id: true },
    });
    projetoId = projeto.id;

    const colaborador = await db.colaborador.create({
      data: {
        tenantId: TENANT,
        codigo: `COL-${sufixo}`,
        nome: 'Colaborador do oráculo',
        dataNascimento: new Date('1990-05-05T00:00:00Z'),
        genero: 'FEMININO',
        estadoCivil: 'SOLTEIRO',
        nacionalidade: 'Moçambicana',
        naturalidadeProvincia: 'Maputo',
        naturalidadeDistrito: 'KaMpfumo',
        bi: '110100000001A',
        nuit: '400000001',
        email: `colab-${slug}@test.mz`,
        telefone: '+258840000001',
        enderecoRua: 'Av. 24 de Julho',
        enderecoNumero: '1',
        enderecoBairro: 'Polana',
        enderecoCidade: 'Maputo',
        enderecoProvincia: 'Maputo',
        emergenciaNome: 'Contacto',
        emergenciaParentesco: 'Irmão',
        emergenciaTelefone: '+258840000002',
        dataAdmissao: new Date('2020-01-01T00:00:00Z'),
        status: 'ACTIVO',
        tipoContrato: 'EFECTIVO',
        regimeTrabalho: 'TEMPO_INTEGRAL',
        salarioBase: '30000.00',
        nivelAcesso: 'USUARIO',
      },
      select: { id: true },
    });
    colaboradorId = colaborador.id;
  });

  it('contagem de stock (dataAbertura): só a contagem dentro do intervalo', async () => {
    const svc = await import('@/server/services/inventario/contagem-stock.service');
    const ids: Record<'antes' | 'dentro' | 'depois', string> = {} as never;
    for (const [k, quando] of [
      ['antes', ANTES],
      ['dentro', DENTRO],
      ['depois', DEPOIS],
    ] as const) {
      const { id } = await noCtx(() =>
        svc.abrirContagem({ cega: false, responsavelId: USER } as never, ctx),
      );
      await db.contagemStock.update({ where: { id }, data: { dataAbertura: quando } });
      ids[k] = id;
    }

    const r = await noCtx(() =>
      svc.listar({ dataInicio: INICIO, dataFim: FIM, take: 25 } as never, ctx),
    );
    const devolvidos = r.items.map((c: { id: string }) => c.id);
    expect(devolvidos, 'o registo ANTERIOR ao início foi devolvido').not.toContain(ids.antes);
    expect(devolvidos, 'o registo POSTERIOR ao fim foi devolvido').not.toContain(ids.depois);
    expect(devolvidos).toEqual([ids.dentro]);
  });

  it('comunicação de projecto (data): só a comunicação dentro do intervalo', async () => {
    const { ComunicacaoService } = await import('@/server/services/pessoas-projetos/comunicacao.service');
    const ids: Record<'antes' | 'dentro' | 'depois', string> = {} as never;
    for (const [k, quando] of [
      ['antes', ANTES],
      ['dentro', DENTRO],
      ['depois', DEPOIS],
    ] as const) {
      const c = await db.comunicacaoProjeto.create({
        data: { tenantId: TENANT, projetoId, tipo: 'REUNIAO', data: quando, participantes: ['A'], resumo: k },
        select: { id: true },
      });
      ids[k] = c.id;
    }

    const r = await noCtx(() =>
      ComunicacaoService.listar({ projetoId, dataInicio: INICIO, dataFim: FIM, take: 25 } as never, ctx),
    );
    const devolvidos = r.items.map((c: { id: string }) => c.id);
    expect(devolvidos, 'o registo ANTERIOR ao início foi devolvido').not.toContain(ids.antes);
    expect(devolvidos, 'o registo POSTERIOR ao fim foi devolvido').not.toContain(ids.depois);
    expect(devolvidos).toEqual([ids.dentro]);
  });

  it('assiduidade (data @db.Date): só o registo dentro do intervalo', async () => {
    const { AssiduidadeService } = await import('@/server/services/pessoas-projetos/rh.service');
    const ids: Record<'antes' | 'dentro' | 'depois', string> = {} as never;
    for (const [k, dia] of [
      ['antes', D_ANTES],
      ['dentro', D_DENTRO],
      ['depois', D_DEPOIS],
    ] as const) {
      const r = await db.registoAssiduidade.create({
        data: {
          tenantId: TENANT,
          colaboradorId,
          data: dia,
          entrada: new Date(dia.getTime() + 6 * 3600_000),
          saida: new Date(dia.getTime() + 15 * 3600_000),
          horasTrabalhadas: '8',
          tipo: 'NORMAL',
        },
        select: { id: true },
      });
      ids[k] = r.id;
    }

    const r = await noCtx(() =>
      AssiduidadeService.listar({ colaboradorId, dataInicio: D_INICIO, dataFim: D_FIM, take: 25 } as never, ctx),
    );
    const devolvidos = r.items.map((x: { id: string }) => x.id);
    expect(devolvidos, 'o registo ANTERIOR ao início foi devolvido').not.toContain(ids.antes);
    expect(devolvidos, 'o registo POSTERIOR ao fim foi devolvido').not.toContain(ids.depois);
    expect(devolvidos).toEqual([ids.dentro]);
  });

  it('timesheet (data @db.Date): só o registo dentro do intervalo', async () => {
    const { TimesheetService } = await import('@/server/services/pessoas-projetos/projetos.service');
    const ids: Record<'antes' | 'dentro' | 'depois', string> = {} as never;
    for (const [k, dia] of [
      ['antes', D_ANTES],
      ['dentro', D_DENTRO],
      ['depois', D_DEPOIS],
    ] as const) {
      const r = await db.timesheet.create({
        data: {
          tenantId: TENANT,
          projetoId,
          colaboradorId,
          data: dia,
          horaInicio: new Date(dia.getTime() + 6 * 3600_000),
          horaFim: new Date(dia.getTime() + 8 * 3600_000),
          duracaoHoras: '2',
          tipo: 'REUNIAO',
        },
        select: { id: true },
      });
      ids[k] = r.id;
    }

    const r = await noCtx(() =>
      TimesheetService.listar(
        { projetoId, colaboradorId, dataInicio: D_INICIO, dataFim: D_FIM, take: 25 } as never,
        ctx,
      ),
    );
    const devolvidos = r.items.map((x: { id: string }) => x.id);
    expect(devolvidos, 'o registo ANTERIOR ao início foi devolvido').not.toContain(ids.antes);
    expect(devolvidos, 'o registo POSTERIOR ao fim foi devolvido').not.toContain(ids.depois);
    expect(devolvidos).toEqual([ids.dentro]);
  });
});
