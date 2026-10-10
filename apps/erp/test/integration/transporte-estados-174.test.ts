/**
 * Oráculo da issue #174 — estados de transporte coerentes e calculados na escrita.
 *
 * Lacunas (confirmadas em origin/main 4c8cdca, `src/server/services/operacoes/*`):
 *   1. `atividade.service.transitarAtividade` e `rota.service.transitarRota` mudam só o estado da
 *      actividade/rota — a viatura fica `DISPONIVEL` com a actividade em curso, e pode ser
 *      iniciada noutra actividade ao mesmo tempo.
 *   2. `viatura.service.adicionarDocumentoViatura` e `motorista.service.adicionarDocumentoMotorista`
 *      gravam o documento com o omissão `VALIDO` («será actualizado pelo cron F3») — um seguro já
 *      expirado fica `VALIDO` até ao cron, e a validação de alocação (que lê `estado`) deixa a
 *      viatura sair.
 *   (3. o estado operacional do motorista não é editável no ecrã — oráculo em
 *       `e2e/58-transporte-estados-174.spec.ts`; o serviço e o schema já o aceitam.)
 *
 * Contrato (decisão do orquestrador; as escolhas em aberto foram fechadas pela opção conservadora):
 *   A. Iniciar (actividade PLANEADA→EM_CURSO; rota PLANEADA→ATIVA) põe a viatura em
 *      `EM_ACTIVIDADE` (o enum real; o «EM_SERVICO» do contrato é este valor), na MESMA
 *      transacção da transição.
 *   B. Terminar (CONCLUIDA ou CANCELADA a partir de um estado em curso — EM_CURSO/SUSPENSA na
 *      actividade, ATIVA/PAUSADA na rota) devolve a viatura a `DISPONIVEL`.
 *   C. Suspender/pausar NÃO liberta a viatura (menos dados alterados: continua alocada).
 *   D. Iniciar com a viatura fora de `DISPONIVEL` (em manutenção, ou já em actividade noutra) é
 *      RECUSADO com `BusinessRuleError`; a actividade/rota fica `PLANEADA` e a viatura intacta.
 *   E. Cancelar uma actividade/rota que nunca começou (PLANEADA→CANCELADA) não toca na viatura.
 *   F. Documento novo (viatura e motorista) nasce com o estado calculado pela data de validade,
 *      com a MESMA regra do cron (`recalcularEstadosDocumentos`): expirado → EXPIRADO; dentro do
 *      prazo de alerta (viatura: `prazoAlertaDias`; motorista: 30) → PROXIMO_EXPIRAR; senão VALIDO.
 *      Prova de «mesma regra»: correr o recálculo do cron logo a seguir não altera nenhum documento.
 *   G. Consequência: viatura com um documento expirado acabado de registar não pode iniciar
 *      actividade (`VIATURA_COM_DOCUMENTOS_EXPIRADOS`), sem esperar pelo cron.
 *
 * Tudo real (Postgres efémero, serviços de `operacoes`), dentro de `runWithTenantContext`.
 * Acesso aos serviços por `any` para que um comportamento em falta falhe o caso, não o ficheiro.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó B:transporte-estados-174; um agente de implementação que o
 * altere é BLOCKER.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const skip = process.env.SKIP_INTEGRATION === 'true' || !process.env.INTEGRATION_DB_URL;

const DIA = 86_400_000;

describe.skipIf(skip)('#174 — estados de transporte coerentes e calculados na escrita (DB efémera)', () => {
  let db: any;
  let comCtx: (fn: () => Promise<any>) => Promise<any>;
  let atividadeService: any;
  let rotaService: any;
  let viaturaService: any;
  let motoristaService: any;
  let alertas: any;
  let BusinessRuleError: any;

  const sufixo = `transporte-estados-174-${Date.now()}`;
  const TENANT = `t-${sufixo}`;
  const USER = `u-${sufixo}`;
  const ctx = { tenantId: TENANT, userId: USER };

  let seq = 0;

  async function criarViatura(estado: string = 'DISPONIVEL'): Promise<string> {
    seq += 1;
    const v = await db.viatura.create({
      data: {
        tenantId: TENANT,
        matricula: `T174-${seq}-${String(Date.now()).slice(-5)}`,
        marca: 'Toyota',
        modelo: 'Hilux',
        tipoViatura: 'LIGEIRO_MERCADORIAS',
        capacidade: '1000',
        unidadeCapacidade: 'KG',
        localActividade: 'Maputo',
        dataInicioActividade: new Date('2025-01-01T10:00:00Z'),
        estado,
      },
      select: { id: true },
    });
    return v.id;
  }

  async function criarMotorista(): Promise<string> {
    seq += 1;
    const m = await db.motorista.create({
      data: {
        tenantId: TENANT,
        nomeCompleto: `Motorista 174 ${seq}`,
        contacto: '+258840000174',
        numeroCarta: `CARTA-174-${seq}`,
        categoriaCarta: ['B', 'C'],
        dataEmissaoCarta: new Date('2020-01-01T10:00:00Z'),
        validadeCarta: new Date(Date.now() + 3 * 365 * DIA),
        disponibilidade: { create: { tenantId: TENANT, disponivel: true, fonte: 'SISTEMA' } },
      },
      select: { id: true },
    });
    return m.id;
  }

  /** Actividade PLANEADA com viatura e motorista (código de teste, fora do formato das séries). */
  async function criarAtividade(viaturaId: string, motoristaId: string): Promise<string> {
    seq += 1;
    const a = await db.atividade.create({
      data: {
        tenantId: TENANT,
        codigo: `TESTE-174-ATI-${seq}`,
        titulo: `Actividade 174 ${seq}`,
        tipoActividade: 'DESLOCACAO',
        localActividade: 'Maputo',
        dataInicioPrevista: new Date(Date.now() + DIA),
        dataConclusaoPrevista: new Date(Date.now() + 2 * DIA),
        viaturaId,
        motoristaResponsavelId: motoristaId,
        criadoPorId: USER,
        anexos: [],
      },
      select: { id: true },
    });
    return a.id;
  }

  /** Rota PLANEADA sem pontos (concluir não esbarra em PONTOS_ABERTOS). */
  async function criarRota(viaturaId: string, motoristaId: string): Promise<string> {
    seq += 1;
    const r = await db.rota.create({
      data: {
        tenantId: TENANT,
        codigo: `TESTE-174-RT-${seq}`,
        nome: `Rota 174 ${seq}`,
        origem: 'Maputo',
        destino: 'Matola',
        dataInicio: new Date(Date.now() + DIA),
        viaturaId,
        motoristaId,
      },
      select: { id: true },
    });
    return r.id;
  }

  const estadoViatura = async (id: string): Promise<string> =>
    (await db.viatura.findUnique({ where: { id }, select: { estado: true } })).estado;
  const estadoAtividade = async (id: string): Promise<string> =>
    (await db.atividade.findUnique({ where: { id }, select: { estado: true } })).estado;
  const estadoRota = async (id: string): Promise<string> =>
    (await db.rota.findUnique({ where: { id }, select: { estado: true } })).estado;

  const transitarAtividade = (id: string, alvo: string) =>
    comCtx(() => atividadeService.transitarAtividade(id, alvo, `#174 → ${alvo}`, ctx));
  const transitarRota = (id: string, alvo: string) => comCtx(() => rotaService.transitarRota(id, alvo, ctx));

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    const { runWithTenantContext } = await import('@/server/db/tenant-extension');
    comCtx = (fn) => runWithTenantContext(ctx, fn) as any;
    ({ atividadeService } = (await import('@/server/services/operacoes/atividade.service')) as any);
    ({ rotaService } = (await import('@/server/services/operacoes/rota.service')) as any);
    ({ viaturaService } = (await import('@/server/services/operacoes/viatura.service')) as any);
    ({ motoristaService } = (await import('@/server/services/operacoes/motorista.service')) as any);
    alertas = await import('@/server/services/operacoes/alertas.service');
    ({ BusinessRuleError } = (await import('@/lib/errors')) as any);

    await db.tenant.create({
      data: {
        id: TENANT,
        nome: 'Tenant 174',
        slug: sufixo,
        nuit: `8${String(Date.now()).slice(-8)}`,
      },
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // A/B/C/D/E — actividade
  // ──────────────────────────────────────────────────────────────────────────

  describe('actividade ↔ estado da viatura', () => {
    it('A+B: iniciar põe a viatura EM_ACTIVIDADE; concluir devolve-a a DISPONIVEL', async () => {
      const v = await criarViatura();
      const a = await criarAtividade(v, await criarMotorista());

      await transitarAtividade(a, 'EM_CURSO');
      expect(await estadoAtividade(a)).toBe('EM_CURSO');
      expect(await estadoViatura(v), 'iniciar a actividade não mudou o estado da viatura').toBe('EM_ACTIVIDADE');

      await transitarAtividade(a, 'CONCLUIDA');
      expect(await estadoAtividade(a)).toBe('CONCLUIDA');
      expect(await estadoViatura(v), 'concluir a actividade não libertou a viatura').toBe('DISPONIVEL');
    });

    it('B: cancelar uma actividade em curso devolve a viatura a DISPONIVEL', async () => {
      const v = await criarViatura();
      const a = await criarAtividade(v, await criarMotorista());

      await transitarAtividade(a, 'EM_CURSO');
      expect(await estadoViatura(v)).toBe('EM_ACTIVIDADE');
      await transitarAtividade(a, 'CANCELADA');
      expect(await estadoViatura(v)).toBe('DISPONIVEL');
    });

    it('C: suspender mantém a viatura EM_ACTIVIDADE; cancelar a partir de SUSPENSA liberta-a', async () => {
      const v = await criarViatura();
      const a = await criarAtividade(v, await criarMotorista());

      await transitarAtividade(a, 'EM_CURSO');
      await transitarAtividade(a, 'SUSPENSA');
      expect(await estadoAtividade(a)).toBe('SUSPENSA');
      expect(await estadoViatura(v)).toBe('EM_ACTIVIDADE');

      await transitarAtividade(a, 'CANCELADA');
      expect(await estadoViatura(v)).toBe('DISPONIVEL');
    });

    it('D: viatura em manutenção — iniciar é recusado (BusinessRuleError), nada muda', async () => {
      const v = await criarViatura('EM_MANUTENCAO');
      const a = await criarAtividade(v, await criarMotorista());

      const erro = await transitarAtividade(a, 'EM_CURSO').then(
        () => null,
        (e: unknown) => e,
      );
      expect(erro, 'iniciar com a viatura em manutenção foi aceite').toBeInstanceOf(BusinessRuleError);
      expect(await estadoAtividade(a)).toBe('PLANEADA');
      expect(await estadoViatura(v)).toBe('EM_MANUTENCAO');
    });

    it('D: viatura já em actividade noutra — a segunda não pode iniciar, nada muda', async () => {
      const v = await criarViatura();
      const primeira = await criarAtividade(v, await criarMotorista());
      const segunda = await criarAtividade(v, await criarMotorista());

      await transitarAtividade(primeira, 'EM_CURSO');
      expect(await estadoViatura(v)).toBe('EM_ACTIVIDADE');

      const erro = await transitarAtividade(segunda, 'EM_CURSO').then(
        () => null,
        (e: unknown) => e,
      );
      expect(erro, 'a mesma viatura foi iniciada em duas actividades').toBeInstanceOf(BusinessRuleError);
      expect(await estadoAtividade(segunda)).toBe('PLANEADA');
      expect(await estadoAtividade(primeira)).toBe('EM_CURSO');
      expect(await estadoViatura(v)).toBe('EM_ACTIVIDADE');
    });

    it('E: cancelar uma actividade que nunca começou não toca na viatura', async () => {
      const v = await criarViatura('EM_MANUTENCAO');
      const a = await criarAtividade(v, await criarMotorista());

      await transitarAtividade(a, 'CANCELADA');
      expect(await estadoAtividade(a)).toBe('CANCELADA');
      expect(await estadoViatura(v)).toBe('EM_MANUTENCAO');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // A/B/C/D — rota
  // ──────────────────────────────────────────────────────────────────────────

  describe('rota ↔ estado da viatura', () => {
    it('A+B: activar a rota põe a viatura EM_ACTIVIDADE; concluir devolve-a a DISPONIVEL', async () => {
      const v = await criarViatura();
      const r = await criarRota(v, await criarMotorista());

      await transitarRota(r, 'ATIVA');
      expect(await estadoRota(r)).toBe('ATIVA');
      expect(await estadoViatura(v), 'iniciar a rota não mudou o estado da viatura').toBe('EM_ACTIVIDADE');

      await transitarRota(r, 'CONCLUIDA');
      expect(await estadoRota(r)).toBe('CONCLUIDA');
      expect(await estadoViatura(v), 'concluir a rota não libertou a viatura').toBe('DISPONIVEL');
    });

    it('C+B: pausar mantém EM_ACTIVIDADE; cancelar a partir de PAUSADA liberta a viatura', async () => {
      const v = await criarViatura();
      const r = await criarRota(v, await criarMotorista());

      await transitarRota(r, 'ATIVA');
      await transitarRota(r, 'PAUSADA');
      expect(await estadoViatura(v)).toBe('EM_ACTIVIDADE');
      await transitarRota(r, 'CANCELADA');
      expect(await estadoViatura(v)).toBe('DISPONIVEL');
    });

    it('D: viatura em manutenção — activar a rota é recusado, nada muda', async () => {
      const v = await criarViatura('EM_MANUTENCAO');
      const r = await criarRota(v, await criarMotorista());

      const erro = await transitarRota(r, 'ATIVA').then(
        () => null,
        (e: unknown) => e,
      );
      expect(erro, 'activar a rota com a viatura em manutenção foi aceite').toBeInstanceOf(BusinessRuleError);
      expect(await estadoRota(r)).toBe('PLANEADA');
      expect(await estadoViatura(v)).toBe('EM_MANUTENCAO');
    });

    it('D: viatura em actividade — activar uma rota com ela é recusado', async () => {
      const v = await criarViatura();
      const a = await criarAtividade(v, await criarMotorista());
      const r = await criarRota(v, await criarMotorista());

      await transitarAtividade(a, 'EM_CURSO');
      const erro = await transitarRota(r, 'ATIVA').then(
        () => null,
        (e: unknown) => e,
      );
      expect(erro, 'a viatura em actividade foi posta numa rota').toBeInstanceOf(BusinessRuleError);
      expect(await estadoRota(r)).toBe('PLANEADA');
      expect(await estadoViatura(v)).toBe('EM_ACTIVIDADE');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // F/G — documentos calculados na escrita
  // ──────────────────────────────────────────────────────────────────────────

  describe('documento novo nasce com o estado calculado pela validade', () => {
    const casos = [
      { nome: 'expirado há um ano', validade: () => new Date(Date.now() - 365 * DIA), esperado: 'EXPIRADO' },
      { nome: 'expira dentro de 10 dias', validade: () => new Date(Date.now() + 10 * DIA), esperado: 'PROXIMO_EXPIRAR' },
      { nome: 'válido por 2 anos', validade: () => new Date(Date.now() + 2 * 365 * DIA), esperado: 'VALIDO' },
    ];

    it.each(casos)('viatura: documento $nome → $esperado (devolvido e gravado)', async ({ validade, esperado }) => {
      const v = await criarViatura();
      const dataValidade = validade();
      const doc: any = await comCtx(() =>
        viaturaService.adicionarDocumentoViatura(
          {
            viaturaId: v,
            tipo: 'SEGURO',
            numero: `SEG-174-${esperado}`,
            dataEmissao: new Date(dataValidade.getTime() - 400 * DIA),
            dataValidade,
            entidadeEmissora: 'Seguradora 174',
            prazoAlertaDias: 30,
          },
          ctx,
        ),
      );
      expect(doc.estado).toBe(esperado);
      const gravado = await db.documentoViatura.findUnique({ where: { id: doc.id }, select: { estado: true } });
      expect(gravado.estado).toBe(esperado);
    });

    it('viatura: o prazo de alerta do próprio documento conta (validade a 45 dias, prazo 60 → PROXIMO_EXPIRAR)', async () => {
      const v = await criarViatura();
      const dataValidade = new Date(Date.now() + 45 * DIA);
      const doc: any = await comCtx(() =>
        viaturaService.adicionarDocumentoViatura(
          {
            viaturaId: v,
            tipo: 'INSPECAO',
            numero: 'INS-174-60',
            dataEmissao: new Date(Date.now() - 300 * DIA),
            dataValidade,
            entidadeEmissora: 'INATTER',
            prazoAlertaDias: 60,
          },
          ctx,
        ),
      );
      expect(doc.estado).toBe('PROXIMO_EXPIRAR');
    });

    it.each(casos)('motorista: documento $nome → $esperado (devolvido e gravado)', async ({ validade, esperado }) => {
      const m = await criarMotorista();
      const dataValidade = validade();
      const doc: any = await comCtx(() =>
        motoristaService.adicionarDocumentoMotorista(
          {
            motoristaId: m,
            tipo: 'BI',
            numero: `BI-174-${esperado}`,
            dataEmissao: new Date(dataValidade.getTime() - 400 * DIA),
            dataValidade,
            entidadeEmissora: 'DIC',
          },
          ctx,
        ),
      );
      expect(doc.estado).toBe(esperado);
      const gravado = await db.documentoMotorista.findUnique({ where: { id: doc.id }, select: { estado: true } });
      expect(gravado.estado).toBe(esperado);
    });

    it('F: mesma regra do cron — o recálculo logo a seguir à criação não altera nenhum documento', async () => {
      // Garante que há documentos de cada classe neste tenant (os casos anteriores também criaram).
      const v = await criarViatura();
      const m = await criarMotorista();
      await comCtx(() =>
        viaturaService.adicionarDocumentoViatura(
          {
            viaturaId: v,
            tipo: 'LICENCA',
            numero: 'LIC-174-CRON',
            dataEmissao: new Date(Date.now() - 800 * DIA),
            dataValidade: new Date(Date.now() - 5 * DIA),
            entidadeEmissora: 'Município',
            prazoAlertaDias: 30,
          },
          ctx,
        ),
      );
      await comCtx(() =>
        motoristaService.adicionarDocumentoMotorista(
          {
            motoristaId: m,
            tipo: 'OUTRO',
            numero: 'OUT-174-CRON',
            dataEmissao: new Date(Date.now() - 300 * DIA),
            dataValidade: new Date(Date.now() + 20 * DIA),
            entidadeEmissora: 'Entidade',
          },
          ctx,
        ),
      );

      const resultado: Record<string, number> = await comCtx(() =>
        alertas.recalcularEstadosDocumentos({ tenantId: TENANT }),
      );
      const total = Object.values(resultado).reduce((s, n) => s + Number(n), 0);
      expect(total, `o cron corrigiu documentos acabados de criar: ${JSON.stringify(resultado)}`).toBe(0);
    });

    it('G: viatura com documento expirado acabado de registar não pode iniciar actividade (sem esperar pelo cron)', async () => {
      const v = await criarViatura();
      const a = await criarAtividade(v, await criarMotorista());
      await comCtx(() =>
        viaturaService.adicionarDocumentoViatura(
          {
            viaturaId: v,
            tipo: 'SEGURO',
            numero: 'SEG-174-G',
            dataEmissao: new Date(Date.now() - 400 * DIA),
            dataValidade: new Date(Date.now() - 30 * DIA),
            entidadeEmissora: 'Seguradora 174',
            prazoAlertaDias: 30,
          },
          ctx,
        ),
      );

      const erro: any = await transitarAtividade(a, 'EM_CURSO').then(
        () => null,
        (e: unknown) => e,
      );
      expect(erro, 'a viatura com seguro expirado foi iniciada').toBeInstanceOf(BusinessRuleError);
      expect(erro.code).toBe('VIATURA_COM_DOCUMENTOS_EXPIRADOS');
      expect(await estadoAtividade(a)).toBe('PLANEADA');
      expect(await estadoViatura(v)).toBe('DISPONIVEL');
    });
  });
});
