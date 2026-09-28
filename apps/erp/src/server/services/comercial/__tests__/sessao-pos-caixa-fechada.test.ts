/**
 * Oráculo de regressão — sessão POS presa a uma sessão de caixa fechada.
 *
 * Defeito: `SessaoPOSService.obterAtual` devolvia a última SessaoPOS ABERTA do
 * vendedor mesmo quando a SessaoCaixa dela já não estava ABERTA (ex.: FECHADA);
 * a página /pos mostrava o terminal e todas as vendas falhavam com
 * SESSAO_CAIXA_FECHADA. E `abrir` recusava com SESSAO_JA_ABERTA enquanto essa
 * sessão órfã existisse, sem saída para o utilizador.
 *
 * Contrato:
 *   1. obterAtual devolve null quando a única sessão POS ABERTA pertence a uma
 *      caixa não ABERTA; continua a devolvê-la quando a caixa está ABERTA.
 *   2. abrir, com uma caixa nova ABERTA, tem sucesso apesar da sessão POS órfã;
 *      a órfã fica FECHADA (com fechadoEm) e a nova ABERTA.
 *   3. abrir continua a recusar com SESSAO_JA_ABERTA quando a sessão POS
 *      ABERTA existente tem a caixa ABERTA.
 *
 * Requer o Postgres local (DATABASE_URL em .env). Dados isolados num tenant
 * próprio, apagados no fim. Cada caso usa o seu vendedor.
 */

import 'dotenv/config';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prismaBase } from '@/server/db/client';
import { runWithTenantContext } from '@/server/db/tenant-extension';
import { sessaoPOSService } from '@/server/services/comercial/index';

const SUFIXO = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const TENANT_ID = `test-tenant-pos-cx-${SUFIXO}`;

const USERS = {
  obterFechada: `test-user-pos-a-${SUFIXO}`,
  obterAberta: `test-user-pos-b-${SUFIXO}`,
  abrirRecupera: `test-user-pos-c-${SUFIXO}`,
  abrirRecusa: `test-user-pos-d-${SUFIXO}`,
} as const;

const ctxDe = (userId: string) => ({ tenantId: TENANT_ID, userId });

let contadorCaixa = 0;
async function criarSessaoCaixa(responsavelId: string, status: 'ABERTA' | 'FECHADA') {
  contadorCaixa += 1;
  return prismaBase.sessaoCaixa.create({
    data: {
      tenantId: TENANT_ID,
      responsavelId,
      numero: `SC-POSCX-${SUFIXO}-${contadorCaixa}`,
      fundoInicial: 1000,
      status,
      ...(status === 'FECHADA' ? { dataFechamento: new Date(), fundoFinal: 1000 } : {}),
    },
  });
}

async function criarSessaoPOSAberta(vendedorId: string, sessaoCaixaId: string) {
  return prismaBase.sessaoPOS.create({
    data: {
      tenantId: TENANT_ID,
      vendedorId,
      sessaoCaixaId,
      status: 'ABERTA',
      abertoEm: new Date(Date.now() - 60 * 60 * 1000),
    },
  });
}

beforeAll(async () => {
  await prismaBase.tenant.create({
    data: {
      id: TENANT_ID,
      nome: 'Tenant de Teste POS/Caixa',
      slug: `test-pos-cx-${SUFIXO}`,
      nuit: `${Date.now()}`.slice(-9),
    },
  });
  for (const [chave, id] of Object.entries(USERS)) {
    await prismaBase.user.create({
      data: {
        id,
        tenantId: TENANT_ID,
        nome: `Vendedor ${chave}`,
        email: `${id}@test.local`,
        keycloakSub: `kc-${id}`,
      },
    });
  }
});

afterAll(async () => {
  await prismaBase.sessaoPOS.deleteMany({ where: { tenantId: TENANT_ID } });
  await prismaBase.sessaoCaixa.deleteMany({ where: { tenantId: TENANT_ID } });
  await prismaBase.user.deleteMany({ where: { tenantId: TENANT_ID } });
  await prismaBase.tenant.delete({ where: { id: TENANT_ID } });
});

describe('SessaoPOSService — sessão POS sobre caixa não aberta', () => {
  it('obterAtual devolve null quando a única sessão POS ABERTA pertence a uma caixa FECHADA', async () => {
    const userId = USERS.obterFechada;
    const caixa = await criarSessaoCaixa(userId, 'FECHADA');
    await criarSessaoPOSAberta(userId, caixa.id);

    const atual = await runWithTenantContext(ctxDe(userId), () =>
      sessaoPOSService.obterAtual(ctxDe(userId)),
    );

    expect(atual).toBeNull();
  });

  it('obterAtual continua a devolver a sessão POS ABERTA quando a caixa está ABERTA', async () => {
    const userId = USERS.obterAberta;
    const caixa = await criarSessaoCaixa(userId, 'ABERTA');
    const pos = await criarSessaoPOSAberta(userId, caixa.id);

    const atual = await runWithTenantContext(ctxDe(userId), () =>
      sessaoPOSService.obterAtual(ctxDe(userId)),
    );

    expect(atual).not.toBeNull();
    expect(atual!.id).toBe(pos.id);
    expect(atual!.sessaoCaixaId).toBe(caixa.id);
  });

  it('abrir com caixa nova ABERTA fecha a sessão POS órfã (caixa FECHADA) e abre a nova', async () => {
    const userId = USERS.abrirRecupera;
    const caixaFechada = await criarSessaoCaixa(userId, 'FECHADA');
    const orfa = await criarSessaoPOSAberta(userId, caixaFechada.id);
    const caixaNova = await criarSessaoCaixa(userId, 'ABERTA');

    const nova = await runWithTenantContext(ctxDe(userId), () =>
      sessaoPOSService.abrir({ sessaoCaixaId: caixaNova.id }, ctxDe(userId)),
    );

    expect(nova.id).not.toBe(orfa.id);
    expect(nova.status).toBe('ABERTA');
    expect(nova.sessaoCaixaId).toBe(caixaNova.id);

    const orfaDepois = await prismaBase.sessaoPOS.findUniqueOrThrow({ where: { id: orfa.id } });
    expect(orfaDepois.status).toBe('FECHADA');
    expect(orfaDepois.fechadoEm).not.toBeNull();

    const novaDb = await prismaBase.sessaoPOS.findUniqueOrThrow({ where: { id: nova.id } });
    expect(novaDb.status).toBe('ABERTA');
  });

  it('abrir continua a recusar com SESSAO_JA_ABERTA quando a sessão POS existente tem a caixa ABERTA', async () => {
    const userId = USERS.abrirRecusa;
    const caixa = await criarSessaoCaixa(userId, 'ABERTA');
    const existente = await criarSessaoPOSAberta(userId, caixa.id);
    const outraCaixa = await criarSessaoCaixa(userId, 'ABERTA');

    await expect(
      runWithTenantContext(ctxDe(userId), () =>
        sessaoPOSService.abrir({ sessaoCaixaId: outraCaixa.id }, ctxDe(userId)),
      ),
    ).rejects.toMatchObject({ code: 'SESSAO_JA_ABERTA' });

    const existenteDepois = await prismaBase.sessaoPOS.findUniqueOrThrow({
      where: { id: existente.id },
    });
    expect(existenteDepois.status).toBe('ABERTA');
    const abertas = await prismaBase.sessaoPOS.count({
      where: { tenantId: TENANT_ID, vendedorId: userId, status: 'ABERTA' },
    });
    expect(abertas).toBe(1);
  });
});
