/**
 * Oráculo — issue #163: /rh/documentos promete «Upload via ficha do colaborador», que não existe.
 *
 * O presign (`POST /api/documentos/presign`) já aceita `recurso: 'colaborador'` com a permissão
 * `rh:colaboradores:update` (ADR-0017, #194/#418), mas nada regista o metadado nem o lista: o
 * `DocumentoColaborador` só é lido pela listagem global e ninguém o escreve.
 *
 * Contrato (decidido pelo orquestrador; o modelo `DocumentoColaborador` SUPORTA o fluxo sem
 * migração — `url` guarda a ref opaca `gestpro-storage:{key}`, `tamanho` o tamanho em bytes):
 *   1. `adicionarDocumentoColaboradorAction` (em `@/server/actions/rh.actions`, `createSafeAction`,
 *      permissão `rh:colaboradores:update`) recebe `{ colaboradorId, tipo, nome, url, tamanho }` e
 *      grava um `DocumentoColaborador` do tenant da sessão, com o `colaboradorId`, o `tipo`
 *      (`TipoDocColaborador`), o `nome`, a `url` e o `tamanho` enviados.
 *   2. Sem `rh:colaboradores:update` → `ok:false`, `SEM_PERMISSAO`; nada gravado.
 *   3. Colaborador de outro tenant, inexistente ou arquivado → `ok:false`, `NAO_ENCONTRADO`
 *      (nunca 403, nunca `ERRO_INTERNO`); nada gravado.
 *   4. `url` cuja key está no prefixo de OUTRO tenant → `ok:false`, `STORAGE_KEY_CROSS_TENANT`
 *      (o mesmo travão B2 de `fornecedorService.adicionarDocumento`); nada gravado.
 *   5. `ColaboradorService.listarDocumentos(colaboradorId, ctx)` devolve os documentos desse
 *      colaborador no tenant do contexto — e só esses — do mais recente para o mais antigo, com
 *      `id`, `tipo`, `nome`, `dataUpload`, `tamanho`. Colaborador de outro tenant → `NotFoundError`.
 *
 * O download (rota `GET /api/documentos/[id]/download`) é provado em
 * `src/app/api/documentos/__tests__/download-colaborador-163.test.ts`; a secção na ficha em
 * `e2e/58-rh-documentos-upload-163.spec.ts`.
 *
 * Sessão (`@/lib/auth`) é o único duplo, mutável por `vi.hoisted`; `next/cache` dobrado porque o
 * `updateTag` exige um pedido Next. Tudo o resto é real: Postgres efémero, `createSafeAction`,
 * actions de `rh.actions`, `ColaboradorService`.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó B:rh-documentos-upload-163; um agente de implementação que o
 * altere é BLOCKER.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

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

type Resultado = { ok: boolean; data?: any; error?: { code: string; message: string; details?: any } };

describe.skipIf(skip)('Documentos na ficha do colaborador (#163) — DB efémera', () => {
  let db: any;
  let criarColaborador: (input: unknown) => Promise<Resultado>;
  let adicionar: (input: unknown) => Promise<Resultado>;
  let ColaboradorService: any;
  let runWithTenantContext: <T>(ctx: { tenantId: string; userId: string }, fn: () => Promise<T>) => Promise<T>;
  let prefixoTenant: (tenantId: string) => string;
  let keyParaUrlRef: (key: string) => string;

  const sufixo = Date.now();
  const s9 = `${sufixo}`.slice(-9);
  const TENANT = `tenant-rh-docs-163-${sufixo}`;
  const OUTRO_TENANT = `tenant-rh-docs-163-b-${sufixo}`;
  const USER = `cuserrhdocs${sufixo}`;
  const USER_B = `cuserrhdocsb${sufixo}`;
  const PERMS = ['rh:colaboradores:create', 'rh:colaboradores:update', 'rh:colaboradores:read'];

  let seq = 0;
  function inputColaborador(tag: string): Record<string, unknown> {
    seq += 1;
    return {
      codigo: `D${seq}-${s9.slice(-5)}`,
      nome: `Colaborador ${tag}`,
      dataNascimento: '1990-05-05',
      genero: 'FEMININO',
      estadoCivil: 'SOLTEIRO',
      nacionalidade: 'Moçambicana',
      naturalidadeProvincia: 'Maputo',
      naturalidadeDistrito: 'KaMpfumo',
      bi: `1102${String(seq).padStart(2, '0')}${s9.slice(-6)}B`,
      nuit: `2${String(seq).padStart(2, '0')}${s9.slice(-6)}`,
      email: `doc-${tag}-${seq}-${sufixo}@test.mz`,
      telefone: '+258840000001',
      enderecoRua: 'Av. 24 de Julho',
      enderecoNumero: '1',
      enderecoBairro: 'Polana',
      enderecoCidade: 'Maputo',
      enderecoProvincia: 'Maputo',
      emergenciaNome: 'Contacto',
      emergenciaParentesco: 'Irmão',
      emergenciaTelefone: '+258840000002',
      dataAdmissao: '2020-01-01',
      status: 'ACTIVO',
      tipoContrato: 'EFECTIVO',
      regimeTrabalho: 'TEMPO_INTEGRAL',
      salarioBase: 30000,
      nivelAcesso: 'USUARIO',
    };
  }

  function sessao(tenantId: string, userId: string, permissions: string[] = PERMS) {
    h.sessao = { user: { id: userId, tenantId, permissions, acesso: 'aberto' } };
  }

  async function novoColaborador(tenantId: string, userId: string, tag: string): Promise<string> {
    sessao(tenantId, userId);
    const dados = inputColaborador(tag);
    const r = await criarColaborador(dados);
    expect(r.ok, `criação do colaborador «${tag}» falhou: ${JSON.stringify(r)}`).toBe(true);
    const c = await db.colaborador.findFirst({ where: { tenantId, nuit: dados.nuit } });
    expect(c).toBeTruthy();
    return c.id as string;
  }

  /** Ref opaca de uma key sob o prefixo do tenant, como a devolvida pelo presign. */
  function ref(tenantId: string, colaboradorId: string, ficheiro: string): string {
    return keyParaUrlRef(
      `${prefixoTenant(tenantId)}colaborador/${colaboradorId}/00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}-${ficheiro}`,
    );
  }

  async function docsDe(colaboradorId: string): Promise<any[]> {
    return db.documentoColaborador.findMany({ where: { colaboradorId } });
  }

  let COLAB_A: string;
  let COLAB_A2: string;
  let COLAB_B: string;

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    ({ runWithTenantContext } = (await import('@/server/db/tenant-extension')) as any);
    ({ prefixoTenant, keyParaUrlRef } = await import('@/lib/storage/objeto'));
    // Acesso dinâmico: falha o caso, não o ficheiro.
    const actions = (await import('@/server/actions/rh.actions')) as unknown as Record<string, any>;
    criarColaborador = actions.criarColaboradorAction;
    adicionar = (input: unknown) => {
      const fn = actions.adicionarDocumentoColaboradorAction;
      if (typeof fn !== 'function') {
        throw new Error('adicionarDocumentoColaboradorAction não existe em @/server/actions/rh.actions');
      }
      return fn(input);
    };
    ({ ColaboradorService } = (await import('@/server/services/pessoas-projetos/rh.service')) as any);

    for (const [t, u, slug] of [
      [TENANT, USER, `rh-docs-163-${sufixo}`],
      [OUTRO_TENANT, USER_B, `rh-docs-163-b-${sufixo}`],
    ] as const) {
      await db.tenant.create({
        data: { id: t, nome: `Tenant ${slug}`, slug, nuit: (t === TENANT ? `5${s9}` : `6${s9}`).slice(0, 9) },
      });
      await db.user.create({
        data: { id: u, tenantId: t, email: `rh-${slug}@test.mz`, nome: 'Gestor RH', keycloakSub: `kc-${u}` },
      });
    }

    COLAB_A = await novoColaborador(TENANT, USER, 'a');
    COLAB_A2 = await novoColaborador(TENANT, USER, 'a2');
    COLAB_B = await novoColaborador(OUTRO_TENANT, USER_B, 'b');
  }, 60_000);

  beforeEach(() => {
    sessao(TENANT, USER);
  });

  it('regista o documento carregado pelo presign na ficha do colaborador', async () => {
    const url = ref(TENANT, COLAB_A, 'bi.pdf');
    const r = await adicionar({ colaboradorId: COLAB_A, tipo: 'BI_FRENTE', nome: 'bi.pdf', url, tamanho: 12345 });
    expect(r.ok, JSON.stringify(r)).toBe(true);

    const docs = await docsDe(COLAB_A);
    const d = docs.find((x) => x.url === url);
    expect(d, `documento não gravado: ${JSON.stringify(docs)}`).toBeTruthy();
    expect(d.tenantId).toBe(TENANT);
    expect(d.colaboradorId).toBe(COLAB_A);
    expect(d.tipo).toBe('BI_FRENTE');
    expect(d.nome).toBe('bi.pdf');
    expect(d.tamanho).toBe(12345);
  });

  it('sem rh:colaboradores:update → SEM_PERMISSAO, nada gravado', async () => {
    sessao(TENANT, USER, ['rh:colaboradores:read']);
    const antes = (await docsDe(COLAB_A)).length;
    const r = await adicionar({
      colaboradorId: COLAB_A,
      tipo: 'OUTRO',
      nome: 'sem-perm.pdf',
      url: ref(TENANT, COLAB_A, 'sem-perm.pdf'),
      tamanho: 10,
    });
    expect(r.ok, JSON.stringify(r)).toBe(false);
    expect(r.error?.code).toBe('SEM_PERMISSAO');
    expect((await docsDe(COLAB_A)).length).toBe(antes);
  });

  it('colaborador de outro tenant → NAO_ENCONTRADO (nunca 403/erro interno), nada gravado', async () => {
    const antes = (await docsDe(COLAB_B)).length;
    const r = await adicionar({
      colaboradorId: COLAB_B,
      tipo: 'OUTRO',
      nome: 'intruso.pdf',
      url: ref(TENANT, COLAB_B, 'intruso.pdf'),
      tamanho: 10,
    });
    expect(r.ok, JSON.stringify(r)).toBe(false);
    expect(r.error?.code).toBe('NAO_ENCONTRADO');
    expect((await docsDe(COLAB_B)).length).toBe(antes);
  });

  it('colaborador arquivado → NAO_ENCONTRADO, nada gravado', async () => {
    const arquivado = await novoColaborador(TENANT, USER, 'arquivado');
    await db.colaborador.update({ where: { id: arquivado }, data: { deletedAt: new Date() } });
    sessao(TENANT, USER);
    const r = await adicionar({
      colaboradorId: arquivado,
      tipo: 'OUTRO',
      nome: 'arq.pdf',
      url: ref(TENANT, arquivado, 'arq.pdf'),
      tamanho: 10,
    });
    expect(r.ok, JSON.stringify(r)).toBe(false);
    expect(r.error?.code).toBe('NAO_ENCONTRADO');
    expect(await docsDe(arquivado)).toHaveLength(0);
  });

  it('url com key no prefixo de OUTRO tenant → STORAGE_KEY_CROSS_TENANT, nada gravado', async () => {
    const antes = (await docsDe(COLAB_A)).length;
    const r = await adicionar({
      colaboradorId: COLAB_A,
      tipo: 'OUTRO',
      nome: 'roubado.pdf',
      url: ref(OUTRO_TENANT, COLAB_A, 'roubado.pdf'),
      tamanho: 10,
    });
    expect(r.ok, JSON.stringify(r)).toBe(false);
    expect(r.error?.code).toBe('STORAGE_KEY_CROSS_TENANT');
    expect((await docsDe(COLAB_A)).length).toBe(antes);
  });

  it('listarDocumentos devolve só os do colaborador e do tenant, do mais recente para o mais antigo', async () => {
    // Documentos de controlo: outro colaborador do mesmo tenant e o colaborador do outro tenant.
    await db.documentoColaborador.create({
      data: { tenantId: TENANT, colaboradorId: COLAB_A2, tipo: 'OUTRO', nome: 'do-a2.pdf', url: ref(TENANT, COLAB_A2, 'do-a2.pdf') },
    });
    await db.documentoColaborador.create({
      data: { tenantId: OUTRO_TENANT, colaboradorId: COLAB_B, tipo: 'OUTRO', nome: 'do-b.pdf', url: ref(OUTRO_TENANT, COLAB_B, 'do-b.pdf') },
    });
    const antigo = await db.documentoColaborador.create({
      data: {
        tenantId: TENANT,
        colaboradorId: COLAB_A,
        tipo: 'CURRICULUM',
        nome: 'cv-antigo.pdf',
        url: ref(TENANT, COLAB_A, 'cv-antigo.pdf'),
        tamanho: 111,
        dataUpload: new Date('2020-01-01T10:00:00Z'),
      },
    });
    const recente = await db.documentoColaborador.create({
      data: {
        tenantId: TENANT,
        colaboradorId: COLAB_A,
        tipo: 'CONTRATO_TRABALHO',
        nome: 'contrato-recente.pdf',
        url: ref(TENANT, COLAB_A, 'contrato-recente.pdf'),
        tamanho: 222,
        dataUpload: new Date('2099-01-01T10:00:00Z'),
      },
    });

    const ctx = { tenantId: TENANT, userId: USER };
    expect(typeof ColaboradorService?.listarDocumentos, 'ColaboradorService.listarDocumentos não existe').toBe('function');
    const lista: any[] = await runWithTenantContext(ctx, () => ColaboradorService.listarDocumentos(COLAB_A, ctx));

    const nomes = lista.map((d) => d.nome);
    expect(nomes).not.toContain('do-a2.pdf');
    expect(nomes).not.toContain('do-b.pdf');
    const esperados = (await docsDe(COLAB_A)).map((d) => d.id).sort();
    expect(lista.map((d) => d.id).sort()).toEqual(esperados);

    expect(lista[0].id).toBe(recente.id);
    expect(lista[lista.length - 1].id).toBe(antigo.id);
    const r = lista[0];
    expect(r.tipo).toBe('CONTRATO_TRABALHO');
    expect(r.nome).toBe('contrato-recente.pdf');
    expect(r.tamanho).toBe(222);
    expect(new Date(r.dataUpload).toISOString()).toBe('2099-01-01T10:00:00.000Z');
  });

  it('listarDocumentos de colaborador de outro tenant → NotFoundError', async () => {
    const ctx = { tenantId: TENANT, userId: USER };
    expect(typeof ColaboradorService?.listarDocumentos, 'ColaboradorService.listarDocumentos não existe').toBe('function');
    await expect(
      runWithTenantContext(ctx, () => ColaboradorService.listarDocumentos(COLAB_B, ctx)),
    ).rejects.toMatchObject({ code: 'NAO_ENCONTRADO' });
  });
});
