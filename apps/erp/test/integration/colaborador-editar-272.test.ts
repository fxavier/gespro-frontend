/**
 * Oráculo — issues #272/#275: editar colaborador grava tudo o que a validação aceita, e recusa o
 * resto.
 *
 * #272 (tipoContrato/regimeTrabalho descartados pelo `actualizar`) já está corrigido no serviço;
 * aqui fica provado ponta a ponta, pela Server Action. #275: o `UpdateColaboradorSchema` aceitava
 * 23 campos (e `status`) que o `actualizar` não grava — «sucesso» e nada muda.
 *
 * Contrato (opção conservadora: recusar > aceitar em silêncio):
 *   1. INVARIANTE: cada chave do `UpdateColaboradorSchema` é gravada pelo `actualizarColaboradorAction`.
 *      O conjunto de chaves é lido do próprio schema; uma chave nova sem valor em `novosValores()`
 *      falha o teste — é o alarme contra o próximo buraco do tipo #161/#272.
 *   2. Um pedido com um campo que o `actualizar` não grava (`status`, `bi`, `dataAdmissao`,
 *      `bancoNib`, `codigo`…) é recusado com `VALIDACAO` e a linha fica intacta — inclusive os
 *      campos editáveis que vinham no mesmo pedido.
 *   3. Edição parcial não toca no que não veio (`nivelAcesso` não volta ao omissão).
 *
 * Sessão (`@/lib/auth`) é o único duplo, mutável por `vi.hoisted`; `next/cache` dobrado porque o
 * `updateTag` exige um pedido Next. Tudo o resto é real: Postgres efémero, `createSafeAction`,
 * `actualizarColaboradorAction`, `ColaboradorService.actualizar`.
 *
 * Requer: Docker + @testcontainers/postgresql. SKIP_INTEGRATION=true → saltado.
 * Escrito pelo verificador do nó D:colaborador-editar-272; um agente de implementação que o
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

type Resultado = { ok: boolean; data?: any; error?: { code: string; message: string } };

describe.skipIf(skip)('Editar colaborador — schema de edição = o que o actualizar grava (#272/#275) — DB efémera', () => {
  let db: any;
  let actualizar: (input: unknown) => Promise<Resultado>;
  let chavesDoSchema: string[];

  const sufixo = Date.now();
  const TENANT = `tenant-colab-ed-272-${sufixo}`;
  const USER = `cusercolabed${sufixo}`;

  const ids = { dep: '', cargo: '', supervisor: '', alvo: '', recusas: '', parcial: '' };

  let seq = 0;
  async function criarColaborador(tag: string): Promise<string> {
    seq += 1;
    const c = await db.colaborador.create({
      data: {
        tenantId: TENANT,
        codigo: `COL-${tag}-${sufixo}`,
        nome: `Colaborador ${tag}`,
        dataNascimento: new Date('1990-05-05T00:00:00Z'),
        genero: 'FEMININO',
        estadoCivil: 'SOLTEIRO',
        nacionalidade: 'Moçambicana',
        naturalidadeProvincia: 'Maputo',
        naturalidadeDistrito: 'KaMpfumo',
        bi: `11010000000${seq}A`,
        nuit: `50000000${seq}`,
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
        nivelAcesso: 'SUPERVISOR',
      },
      select: { id: true },
    });
    return c.id;
  }

  /** Um valor novo (diferente do criado) para cada campo editável, e como compará-lo com a linha. */
  function novosValores(): Record<string, { enviar: unknown; gravado: (v: any) => unknown; esperado: unknown }> {
    const igual = (esperado: unknown) => ({ enviar: esperado, gravado: (v: any) => v, esperado });
    const decimal = (n: number) => ({ enviar: n, gravado: (v: any) => (v == null ? v : Number(v.toString())), esperado: n });
    return {
      nome: igual('Colaborador Alvo Editado'),
      email: igual(`alvo-editado-${sufixo}@test.mz`),
      telefone: igual('+258849999999'),
      tipoContrato: igual('TERMO_CERTO'),
      regimeTrabalho: igual('TEMPO_PARCIAL'),
      departamentoId: igual(ids.dep),
      cargoId: igual(ids.cargo),
      supervisorId: igual(ids.supervisor),
      salarioBase: decimal(45000),
      subsidioAlimentacao: decimal(1500),
      subsidioTransporte: decimal(2000),
      subsidioHabitacao: decimal(3000),
      subsidiosOutros: decimal(500),
      horarioTrabalho: igual('08:00-17:00'),
      localizacao: igual('Sede'),
      nivelAcesso: igual('GERENTE'),
      observacoes: igual('Revisto na edição'),
      fotoUrl: igual('https://exemplo.mz/foto-alvo.png'),
    };
  }

  beforeAll(async () => {
    ({ prismaBase: db } = await import('@/server/db/client'));
    // Acesso dinâmico: falha o caso, não o ficheiro.
    const actions = (await import('@/server/actions/rh.actions')) as unknown as Record<string, any>;
    actualizar = actions.actualizarColaboradorAction;
    const rh = (await import('@/lib/validations/rh')) as unknown as Record<string, any>;
    chavesDoSchema = Object.keys(rh.UpdateColaboradorSchema?.shape ?? {});

    await db.tenant.create({
      data: { id: TENANT, nome: `Tenant colab-ed-272-${sufixo}`, slug: `colab-ed-272-${sufixo}`, nuit: `${sufixo}`.slice(-9) },
    });
    await db.user.create({
      data: { id: USER, tenantId: TENANT, email: `gestor-ed-272-${sufixo}@test.mz`, nome: 'Gestor RH', keycloakSub: `kc-${USER}` },
    });
    ids.dep = (await db.departamento.create({ data: { tenantId: TENANT, codigo: `DEP-${sufixo}`, nome: 'Finanças' } })).id;
    ids.cargo = (
      await db.cargo.create({ data: { tenantId: TENANT, codigo: `CAR-${sufixo}`, nome: 'Tesoureiro', departamentoId: ids.dep } })
    ).id;
    ids.supervisor = await criarColaborador('supervisor');
    ids.alvo = await criarColaborador('alvo');
    ids.recusas = await criarColaborador('recusas');
    ids.parcial = await criarColaborador('parcial');
  }, 60_000);

  beforeEach(() => {
    h.sessao = { user: { id: USER, tenantId: TENANT, permissions: ['rh:colaboradores:update'], acesso: 'aberto' } };
  });

  it('cada chave aceite pelo UpdateColaboradorSchema é gravada pela action (invariante #275)', async () => {
    expect(typeof actualizar, 'actualizarColaboradorAction não está exportada').toBe('function');
    expect(chavesDoSchema.length, 'UpdateColaboradorSchema sem .shape legível').toBeGreaterThan(0);
    const valores = novosValores();

    // Uma chave do schema sem valor aqui é um campo que ninguém provou que se grava.
    const semValor = chavesDoSchema.filter((k) => !(k in valores));
    expect(semValor, `chaves do schema de edição sem prova de gravação: ${semValor.join(', ')}`).toEqual([]);

    const data = Object.fromEntries(chavesDoSchema.map((k) => [k, valores[k].enviar]));
    const r = await actualizar({ id: ids.alvo, data });
    expect(r.ok, JSON.stringify(r)).toBe(true);

    const linha = await db.colaborador.findUnique({ where: { id: ids.alvo } });
    const naoGravados = chavesDoSchema.filter((k) => valores[k].gravado(linha[k]) !== valores[k].esperado);
    expect(
      naoGravados,
      `aceites e não gravados: ${naoGravados.map((k) => `${k}=${JSON.stringify(linha[k])}`).join(', ')}`,
    ).toEqual([]);
  });

  it('o schema de edição não aceita campos que o actualizar não grava (status, bi, dataAdmissao…)', () => {
    for (const k of ['codigo', 'status', 'bi', 'nuit', 'dataAdmissao', 'bancoNib', 'enderecoRua', 'emergenciaNome']) {
      expect(chavesDoSchema, `«${k}» continua no schema de edição`).not.toContain(k);
    }
  });

  const RECUSAS: Array<[string, unknown]> = [
    ['status', 'INACTIVO'],
    ['bi', '110100000099Z'],
    ['nuit', '100000099'],
    ['dataAdmissao', new Date('2025-06-01T10:00:00Z')],
    ['bancoNib', '000800000000000000000'],
    ['enderecoRua', 'Av. Eduardo Mondlane'],
    ['codigo', 'COL-NOVO'],
  ];

  for (const [campo, valor] of RECUSAS) {
    it(`pedido com «${campo}» é recusado com VALIDACAO e nada muda`, async () => {
      const antes = await db.colaborador.findUnique({ where: { id: ids.recusas } });
      const r = await actualizar({ id: ids.recusas, data: { nome: `Nome Que Não Pode Ficar ${campo}`, [campo]: valor } });
      expect(r.ok, `«${campo}» foi aceite: ${JSON.stringify(r)}`).toBe(false);
      expect(r.error?.code).toBe('VALIDACAO');

      const depois = await db.colaborador.findUnique({ where: { id: ids.recusas } });
      expect(depois.nome).toBe(antes.nome);
      expect(depois[campo] instanceof Date ? depois[campo].toISOString() : depois[campo]).toEqual(
        antes[campo] instanceof Date ? antes[campo].toISOString() : antes[campo],
      );
      expect(depois.updatedAt?.toISOString?.()).toBe(antes.updatedAt?.toISOString?.());
    });
  }

  it('edição parcial (tipo de contrato e regime, #272) não toca no resto — nivelAcesso não volta ao omissão', async () => {
    const r = await actualizar({ id: ids.parcial, data: { tipoContrato: 'ESTAGIO', regimeTrabalho: 'TEMPO_PARCIAL' } });
    expect(r.ok, JSON.stringify(r)).toBe(true);

    const linha = await db.colaborador.findUnique({ where: { id: ids.parcial } });
    expect(linha.tipoContrato).toBe('ESTAGIO');
    expect(linha.regimeTrabalho).toBe('TEMPO_PARCIAL');
    expect(linha.nivelAcesso).toBe('SUPERVISOR');
    expect(linha.status).toBe('ACTIVO');
    expect(linha.nome).toBe('Colaborador parcial');
    expect(Number(linha.salarioBase.toString())).toBe(30000);
  });
});
