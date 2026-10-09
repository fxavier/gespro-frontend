/**
 * Oráculo — issues #101 e #265: formulários que pedem o identificador interno (CUID) num campo de
 * texto em vez de deixarem escolher a entidade numa combobox.
 *
 * Este ficheiro prova o lado do SERVIDOR: as pesquisas `procurar*` que as `ComboboxRemoto` novas
 * vão chamar. A remoção dos campos de id é provada por
 * `src/app/(dashboard)/__tests__/combobox-ids-101-265.test.ts` (varrimento estático) e a escolha pela UI por
 * `e2e/53-combobox-ids-101-265.spec.ts`.
 *
 * Contrato (decisão do orquestrador; nomes e decisões conservadoras do verificador, tratadas como
 * contrato):
 *
 *   Reaproveitam-se as pesquisas que já existem — `procurarClientes`, `procurarProdutos`,
 *   `procurarVendedores` (vendas/clientes) e `procurarFornecedoresAction` — e acrescentam-se
 *   (OBRIGAÇÃO NOVA) cinco leituras, todas `createSafeAction` com `permiteEmLeitura: true`, SEM
 *   permissões novas no catálogo, sem endpoints públicos, recebendo `{ q }`:
 *
 *     compras.actions.ts   procurarRequisicoesCompraAction({ q })      pesquisa pelo número
 *     compras.actions.ts   procurarCotacoesCompraAction({ q })         pesquisa pelo número
 *     vendas.actions.ts    procurarVendas({ q, clienteId? })            pesquisa pelo número;
 *                                                                       clienteId restringe às
 *                                                                       vendas desse cliente
 *     rh.actions.ts        procurarColaboradoresAction({ q })           pesquisa pelo nome
 *     projetos.actions.ts  procurarProjetosAction({ q })                pesquisa pelo nome
 *
 *   Para cada uma:
 *     - devolve uma lista de opções; cada opção tem `id` e o rótulo humano (número/nome) — é o
 *       que a combobox mostra;
 *     - a pesquisa não distingue maiúsculas de minúsculas (nomes) e aceita um fragmento;
 *     - NUNCA devolve registos de outro tenant (o tenant vem da sessão, nunca do cliente);
 *     - corre em modo de Leitura (ADR-0032) — é leitura;
 *     - sem permissão nenhuma → SEM_PERMISSAO (nunca ERRO_INTERNO) e nada é devolvido;
 *     - devolve uma página limitada (≤ 50 opções).
 *   Colaboradores apagados (soft delete, `deletedAt`) não aparecem.
 *
 *   Listas pequenas — centros de custo, catálogo de benefícios, utilizadores responsáveis pela
 *   contagem — podem ser `Combobox` local carregado pelo Server Component: não exigem action nova
 *   e não são provadas aqui (o E2E prova que se escolhem pela UI).
 *
 * Sessão (`@/lib/auth`) é o único duplo (fronteira), mutável por `vi.hoisted`; `next/cache` é
 * dobrado porque o `updateTag` exige um pedido Next. Tudo o resto é real: Postgres efémero,
 * `createSafeAction`, serviços e extensão de tenant.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó B:combobox-ids-101-265; um agente de implementação que o
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
type Modulo = Record<string, (input: unknown) => Promise<Resultado>>;

// Permissões de leitura/criação de cada módulo — o implementador escolhe UMA delas para a action;
// o oráculo não fixa qual, só que nenhuma é nova.
const PERM = {
  compras: ['compras:ver', 'compras:criar', 'compras:cotacao:criar', 'compras:pedido:criar'],
  vendas: ['vendas:ver', 'vendas:devolucoes:ver', 'vendas:devolucoes:criar', 'vendas:trocas:criar', 'clientes:ver'],
  rh: ['rh:ver', 'rh:colaboradores:read', 'rh:ausencias:create', 'rh:beneficios:read', 'rh:beneficios:atribuir'],
  projetos: ['projetos:ver', 'projetos:read', 'projetos:orcamentos:create', 'projetos:criar', 'projetos:create'],
} as const;

describe.skipIf(skip)('Pesquisas para as combobox dos formulários (#101/#265) — DB efémera (Testcontainers)', () => {
  let db: any;
  const mods: Record<'compras' | 'vendas' | 'rh' | 'projetos', Modulo> = {} as any;

  const sufixo = Date.now();
  const TOKEN = `Cbx${sufixo}`; // aparece em números e nomes de TODOS os registos (dos dois tenants)
  const TENANT = `tenant-cbx-265-${sufixo}`;
  const OUTRO = `tenant-cbx-265-o-${sufixo}`;
  const USER = `user-cbx-265-${sufixo}`;
  const USER_OUTRO = `user-cbx-265-o-${sufixo}`;

  // ids criados no beforeAll
  const ids = {
    req: '', reqOutro: '',
    cot: '', cotOutro: '',
    clienteA: '', clienteB: '', vendaA: '', vendaB: '', vendaOutro: '',
    colab: '', colabApagado: '', colabOutro: '',
    projeto: '', projetoOutro: '',
  };
  const NUM = {
    req: `REQ-${TOKEN}-1`, reqOutro: `REQ-${TOKEN}-9`,
    cot: `COT-${TOKEN}-1`, cotOutro: `COT-${TOKEN}-9`,
    vendaA: `VD-${TOKEN}-1`, vendaB: `VD-${TOKEN}-2`, vendaOutro: `VD-${TOKEN}-9`,
  };
  const NOME = {
    colab: `Zélia Mabunda ${TOKEN}`,
    colabApagado: `Removido Nhantumbo ${TOKEN}`,
    colabOutro: `Outro Tenant ${TOKEN}`,
    projeto: `Projecto Armazém ${TOKEN}`,
    projetoOutro: `Projecto Alheio ${TOKEN}`,
  };

  function sessao(permissions: readonly string[], acesso: 'aberto' | 'leitura' = 'aberto', tenantId = TENANT, userId = USER) {
    h.sessao = { user: { id: userId, tenantId, permissions: [...permissions], acesso } };
  }

  function action(mod: keyof typeof mods, nome: string) {
    const fn = mods[mod][nome];
    expect(typeof fn, `${nome} não está exportada de ${mod}.actions.ts`).toBe('function');
    return fn;
  }

  /** Chama a action e devolve a lista de opções (falha o caso se não for ok ou não for lista). */
  async function opcoes(mod: keyof typeof mods, nome: string, input: Record<string, unknown>): Promise<any[]> {
    const r = await action(mod, nome)(input);
    expect(r.ok, `${nome}(${JSON.stringify(input)}) falhou: ${JSON.stringify(r)}`).toBe(true);
    expect(Array.isArray(r.data), `${nome} não devolveu uma lista: ${JSON.stringify(r.data)}`).toBe(true);
    for (const o of r.data) {
      expect(typeof o?.id, `opção sem id: ${JSON.stringify(o)}`).toBe('string');
    }
    return r.data;
  }

  const idsDe = (lista: any[]) => lista.map((o) => o.id);

  /** O rótulo humano (número/nome) tem de vir na opção — é o que a combobox mostra. */
  function temRotulo(lista: any[], id: string, rotulo: string) {
    const o = lista.find((x) => x.id === id);
    expect(o, `a opção ${id} não veio`).toBeTruthy();
    expect(JSON.stringify(o), `a opção ${id} não traz o rótulo «${rotulo}»`).toContain(rotulo);
  }

  async function criarColaborador(tenantId: string, nome: string, tag: string, apagado = false): Promise<string> {
    const c = await db.colaborador.create({
      data: {
        tenantId,
        codigo: `COL-${tag}-${sufixo}`,
        nome,
        dataNascimento: new Date('1990-05-05T00:00:00Z'),
        genero: 'FEMININO',
        estadoCivil: 'SOLTEIRO',
        nacionalidade: 'Moçambicana',
        naturalidadeProvincia: 'Maputo',
        naturalidadeDistrito: 'KaMpfumo',
        bi: `1101${tag.charCodeAt(0)}${String(sufixo).slice(-6)}A`,
        nuit: `4${tag.charCodeAt(0) % 10}${String(sufixo).slice(-7)}`,
        email: `colab-${tag}-${sufixo}@test.mz`,
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
        ...(apagado ? { deletedAt: new Date() } : {}),
      },
      select: { id: true },
    });
    return c.id;
  }

  async function criarCliente(tenantId: string, tag: string, nuit: string): Promise<string> {
    const c = await db.cliente.create({
      data: {
        tenantId,
        codigo: `CLI-${tag}-${sufixo}`,
        nome: `Cliente ${tag} ${TOKEN}`,
        tipo: 'FISICA',
        nuit,
        email: `cli-${tag}-${sufixo}@test.mz`,
        telefone: '+258840000003',
      },
      select: { id: true },
    });
    return c.id;
  }

  async function criarVenda(tenantId: string, numero: string, clienteId: string | null, vendedorId: string): Promise<string> {
    const v = await db.venda.create({
      data: {
        tenantId,
        numero,
        origem: 'POS',
        status: 'CONCLUIDA',
        clienteId,
        vendedorId,
        subtotal: '100.00',
        total: '116.00',
        ivaTotal: '16.00',
      },
      select: { id: true },
    });
    return v.id;
  }

  async function criarRequisicao(tenantId: string, numero: string, status: string): Promise<string> {
    const r = await db.requisicaoCompra.create({
      data: {
        tenantId,
        numero,
        data: new Date(),
        solicitanteId: tenantId === TENANT ? USER : USER_OUTRO,
        solicitanteNome: 'Solicitante',
        departamento: 'Administração',
        status,
        justificativa: `Requisição do oráculo #265 (${sufixo})`,
        valorTotal: '1000.00',
      },
      select: { id: true },
    });
    return r.id;
  }

  async function criarCotacao(tenantId: string, numero: string): Promise<string> {
    const c = await db.cotacao.create({
      data: {
        tenantId,
        numero,
        data: new Date(),
        status: 'ENVIADA',
        dataValidade: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      },
      select: { id: true },
    });
    return c.id;
  }

  async function criarProjeto(tenantId: string, nome: string, tag: string): Promise<string> {
    const p = await db.projeto.create({
      data: {
        tenantId,
        codigo: `PRJ-${tag}-${sufixo}`,
        nome,
        tipo: 'INTERNO',
        status: 'EM_ANDAMENTO',
        prioridade: 'MEDIA',
        dataInicio: new Date('2026-01-01T00:00:00Z'),
        dataFimPrevista: new Date('2026-12-31T00:00:00Z'),
      },
      select: { id: true },
    });
    return p.id;
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    mods.compras = (await import('@/server/actions/compras.actions')) as unknown as Modulo;
    mods.vendas = (await import('@/server/actions/vendas.actions')) as unknown as Modulo;
    mods.rh = (await import('@/server/actions/rh.actions')) as unknown as Modulo;
    mods.projetos = (await import('@/server/actions/projetos.actions')) as unknown as Modulo;

    for (const [id, slug, nuit] of [
      [TENANT, `cbx-265-${sufixo}`, `${sufixo}`.slice(-9)],
      [OUTRO, `cbx-265-o-${sufixo}`, `${sufixo + 1}`.slice(-9)],
    ] as const) {
      await db.tenant.create({ data: { id, nome: `Tenant ${slug}`, slug, nuit } });
    }
    await db.user.create({ data: { id: USER, tenantId: TENANT, email: `${USER}@test.mz`, nome: 'Utilizador', keycloakSub: `kc-${USER}` } });
    await db.user.create({
      data: { id: USER_OUTRO, tenantId: OUTRO, email: `${USER_OUTRO}@test.mz`, nome: 'Outro', keycloakSub: `kc-${USER_OUTRO}` },
    });

    ids.req = await criarRequisicao(TENANT, NUM.req, 'APROVADA');
    ids.reqOutro = await criarRequisicao(OUTRO, NUM.reqOutro, 'APROVADA');
    ids.cot = await criarCotacao(TENANT, NUM.cot);
    ids.cotOutro = await criarCotacao(OUTRO, NUM.cotOutro);

    ids.clienteA = await criarCliente(TENANT, 'A', `5${String(sufixo).slice(-8)}`);
    ids.clienteB = await criarCliente(TENANT, 'B', `6${String(sufixo).slice(-8)}`);
    const clienteOutro = await criarCliente(OUTRO, 'O', `7${String(sufixo).slice(-8)}`);
    ids.vendaA = await criarVenda(TENANT, NUM.vendaA, ids.clienteA, USER);
    ids.vendaB = await criarVenda(TENANT, NUM.vendaB, ids.clienteB, USER);
    ids.vendaOutro = await criarVenda(OUTRO, NUM.vendaOutro, clienteOutro, USER_OUTRO);

    ids.colab = await criarColaborador(TENANT, NOME.colab, 'A');
    ids.colabApagado = await criarColaborador(TENANT, NOME.colabApagado, 'X', true);
    ids.colabOutro = await criarColaborador(OUTRO, NOME.colabOutro, 'O');

    ids.projeto = await criarProjeto(TENANT, NOME.projeto, 'A');
    ids.projetoOutro = await criarProjeto(OUTRO, NOME.projetoOutro, 'O');
  }, 180_000);

  // -------------------------------------------------------------------------
  // Requisições de compra (cotação RFQ e pedido de compra)
  // -------------------------------------------------------------------------

  describe('procurarRequisicoesCompraAction', () => {
    const NOME_ACTION = 'procurarRequisicoesCompraAction';

    it('encontra a requisição pelo número completo e por um fragmento, com o número no rótulo', async () => {
      sessao(PERM.compras);
      const porNumero = await opcoes('compras', NOME_ACTION, { q: NUM.req });
      expect(idsDe(porNumero)).toContain(ids.req);
      temRotulo(porNumero, ids.req, NUM.req);

      const porFragmento = await opcoes('compras', NOME_ACTION, { q: TOKEN.toLowerCase() });
      expect(idsDe(porFragmento)).toContain(ids.req);
    });

    it('nunca devolve requisições de outro tenant', async () => {
      sessao(PERM.compras);
      const lista = await opcoes('compras', NOME_ACTION, { q: TOKEN });
      expect(idsDe(lista)).not.toContain(ids.reqOutro);
      expect(JSON.stringify(lista)).not.toContain(NUM.reqOutro);
      expect(lista.length).toBeLessThanOrEqual(50);
    });

    it('corre em modo de Leitura e recusa quem não tem permissão (SEM_PERMISSAO)', async () => {
      sessao(PERM.compras, 'leitura');
      expect(idsDe(await opcoes('compras', NOME_ACTION, { q: NUM.req }))).toContain(ids.req);

      sessao([]);
      const r = await action('compras', NOME_ACTION)({ q: NUM.req });
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('SEM_PERMISSAO');
    });
  });

  // -------------------------------------------------------------------------
  // Cotações RFQ (pedido de compra)
  // -------------------------------------------------------------------------

  describe('procurarCotacoesCompraAction', () => {
    const NOME_ACTION = 'procurarCotacoesCompraAction';

    it('encontra a cotação pelo número e por um fragmento, com o número no rótulo', async () => {
      sessao(PERM.compras);
      const porNumero = await opcoes('compras', NOME_ACTION, { q: NUM.cot });
      expect(idsDe(porNumero)).toContain(ids.cot);
      temRotulo(porNumero, ids.cot, NUM.cot);
      expect(idsDe(await opcoes('compras', NOME_ACTION, { q: TOKEN.toLowerCase() }))).toContain(ids.cot);
    });

    it('nunca devolve cotações de outro tenant', async () => {
      sessao(PERM.compras);
      const lista = await opcoes('compras', NOME_ACTION, { q: TOKEN });
      expect(idsDe(lista)).not.toContain(ids.cotOutro);
      expect(JSON.stringify(lista)).not.toContain(NUM.cotOutro);
      expect(lista.length).toBeLessThanOrEqual(50);
    });

    it('corre em modo de Leitura e recusa quem não tem permissão (SEM_PERMISSAO)', async () => {
      sessao(PERM.compras, 'leitura');
      expect(idsDe(await opcoes('compras', NOME_ACTION, { q: NUM.cot }))).toContain(ids.cot);

      sessao([]);
      const r = await action('compras', NOME_ACTION)({ q: NUM.cot });
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('SEM_PERMISSAO');
    });
  });

  // -------------------------------------------------------------------------
  // Vendas (nova devolução)
  // -------------------------------------------------------------------------

  describe('procurarVendas', () => {
    const NOME_ACTION = 'procurarVendas';

    it('encontra a venda pelo número, com o número no rótulo', async () => {
      sessao(PERM.vendas);
      const lista = await opcoes('vendas', NOME_ACTION, { q: NUM.vendaA });
      expect(idsDe(lista)).toContain(ids.vendaA);
      temRotulo(lista, ids.vendaA, NUM.vendaA);
    });

    it('com clienteId, só devolve as vendas desse cliente', async () => {
      sessao(PERM.vendas);
      const doA = await opcoes('vendas', NOME_ACTION, { q: TOKEN, clienteId: ids.clienteA });
      expect(idsDe(doA)).toContain(ids.vendaA);
      expect(idsDe(doA)).not.toContain(ids.vendaB);

      const doB = await opcoes('vendas', NOME_ACTION, { q: TOKEN, clienteId: ids.clienteB });
      expect(idsDe(doB)).toContain(ids.vendaB);
      expect(idsDe(doB)).not.toContain(ids.vendaA);
    });

    it('nunca devolve vendas de outro tenant', async () => {
      sessao(PERM.vendas);
      const lista = await opcoes('vendas', NOME_ACTION, { q: TOKEN });
      expect(idsDe(lista)).toEqual(expect.arrayContaining([ids.vendaA, ids.vendaB]));
      expect(idsDe(lista)).not.toContain(ids.vendaOutro);
      expect(JSON.stringify(lista)).not.toContain(NUM.vendaOutro);
      expect(lista.length).toBeLessThanOrEqual(50);
    });

    it('corre em modo de Leitura e recusa quem não tem permissão (SEM_PERMISSAO)', async () => {
      sessao(PERM.vendas, 'leitura');
      expect(idsDe(await opcoes('vendas', NOME_ACTION, { q: NUM.vendaA }))).toContain(ids.vendaA);

      sessao([]);
      const r = await action('vendas', NOME_ACTION)({ q: NUM.vendaA });
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('SEM_PERMISSAO');
    });
  });

  // -------------------------------------------------------------------------
  // Colaboradores (ausências, atribuição de benefícios)
  // -------------------------------------------------------------------------

  describe('procurarColaboradoresAction', () => {
    const NOME_ACTION = 'procurarColaboradoresAction';

    it('encontra o colaborador por um fragmento do nome, sem distinguir maiúsculas, com o nome no rótulo', async () => {
      sessao(PERM.rh);
      const lista = await opcoes('rh', NOME_ACTION, { q: `mabunda ${TOKEN}`.toLowerCase() });
      expect(idsDe(lista)).toContain(ids.colab);
      temRotulo(lista, ids.colab, NOME.colab);
    });

    it('não devolve colaboradores apagados nem de outro tenant', async () => {
      sessao(PERM.rh);
      const lista = await opcoes('rh', NOME_ACTION, { q: TOKEN });
      expect(idsDe(lista)).toContain(ids.colab);
      expect(idsDe(lista)).not.toContain(ids.colabApagado);
      expect(idsDe(lista)).not.toContain(ids.colabOutro);
      expect(JSON.stringify(lista)).not.toContain(NOME.colabOutro);
      expect(lista.length).toBeLessThanOrEqual(50);
    });

    it('corre em modo de Leitura e recusa quem não tem permissão (SEM_PERMISSAO)', async () => {
      sessao(PERM.rh, 'leitura');
      expect(idsDe(await opcoes('rh', NOME_ACTION, { q: TOKEN }))).toContain(ids.colab);

      sessao([]);
      const r = await action('rh', NOME_ACTION)({ q: TOKEN });
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('SEM_PERMISSAO');
    });
  });

  // -------------------------------------------------------------------------
  // Projectos (orçamento de projecto)
  // -------------------------------------------------------------------------

  describe('procurarProjetosAction', () => {
    const NOME_ACTION = 'procurarProjetosAction';

    it('encontra o projecto por um fragmento do nome, sem distinguir maiúsculas, com o nome no rótulo', async () => {
      sessao(PERM.projetos);
      const lista = await opcoes('projetos', NOME_ACTION, { q: `armazém ${TOKEN}`.toLowerCase() });
      expect(idsDe(lista)).toContain(ids.projeto);
      temRotulo(lista, ids.projeto, NOME.projeto);
    });

    it('nunca devolve projectos de outro tenant', async () => {
      sessao(PERM.projetos);
      const lista = await opcoes('projetos', NOME_ACTION, { q: TOKEN });
      expect(idsDe(lista)).toContain(ids.projeto);
      expect(idsDe(lista)).not.toContain(ids.projetoOutro);
      expect(JSON.stringify(lista)).not.toContain(NOME.projetoOutro);
      expect(lista.length).toBeLessThanOrEqual(50);
    });

    it('corre em modo de Leitura e recusa quem não tem permissão (SEM_PERMISSAO)', async () => {
      sessao(PERM.projetos, 'leitura');
      expect(idsDe(await opcoes('projetos', NOME_ACTION, { q: TOKEN }))).toContain(ids.projeto);

      sessao([]);
      const r = await action('projetos', NOME_ACTION)({ q: TOKEN });
      expect(r.ok).toBe(false);
      expect(r.error?.code).toBe('SEM_PERMISSAO');
    });
  });
});
