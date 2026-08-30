import 'server-only';
import { prismaBase } from '@/server/db/client';
import { logger } from '@/server/observability/logger';
import { kcConfig } from './keycloak';

/**
 * Reconciliação identidade↔autorização — ADR-0013 §3, revisto: compara
 * UTILIZADORES do realm `gespro` com `User` em Postgres, por `keycloakSub`
 * (com as Organizations adiadas, a divergência que magoa é a do utilizador
 * que não consegue entrar).
 *
 * **Reporta, não repara**: reparação automática de identidade é como se cria
 * um incidente pior do que o que se resolve. As divergências vão para o
 * registo estruturado; o alerta é POR TAXA, não por linha (execução paralela
 * W8 §6-quater): a ordem «Keycloak primeiro» faz de cada registo abusivo
 * falhado um utilizador Keycloak órfão — reportar um alerta por órfão
 * transformaria uma onda de spam numa tempestade de alertas. Só contam órfãos
 * com MAIS DE UMA HORA, e o nível `error` (que dispara alerta na pilha de
 * observabilidade) só é usado acima do limiar.
 */

/** Órfãos mais novos do que isto são provavelmente registos ainda em curso. */
const IDADE_MINIMA_ORFAO_MS = 60 * 60 * 1000;

/** Acima disto, o relatório sobe de warn para error (dispara alerta). */
function limiarAlerta(): number {
  const v = Number(process.env.RECONCILIACAO_LIMIAR_ORFAOS);
  return Number.isFinite(v) && v > 0 ? v : 5;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface KcUser {
  id: string;
  username?: string;
  email?: string;
  createdTimestamp?: number;
  serviceAccountClientId?: string;
}

export interface RelatorioReconciliacao {
  /** Utilizadores no realm sem `User` local (órfãos > 1 h). Inofensivos por construção (ADR-0011). */
  keycloakSemLocal: number;
  /** `User` locais cujo sub não existe no realm — quem NÃO CONSEGUE entrar. */
  localSemKeycloak: number;
  /** Sub sintéticos ignorados (fixtures de carga, não-UUID — nunca existiram no realm). */
  sinteticosIgnorados: number;
  totalKeycloak: number;
  totalLocal: number;
  alerta: boolean;
}

async function listarUtilizadoresRealm(
  fetchAdmin: (caminho: string) => Promise<Response>,
): Promise<KcUser[]> {
  const todos: KcUser[] = [];
  const pagina = 100;
  for (let first = 0; ; first += pagina) {
    const res = await fetchAdmin(`/users?briefRepresentation=true&first=${first}&max=${pagina}`);
    if (!res.ok) throw new Error(`[reconciliacao] listagem do realm falhou (HTTP ${res.status})`);
    const lote = (await res.json()) as KcUser[];
    todos.push(...lote);
    if (lote.length < pagina) return todos;
  }
}

export async function reconciliarIdentidades(): Promise<RelatorioReconciliacao> {
  const cfg = kcConfig();
  // Token da conta de serviço via o mesmo caminho do resto do ERP.
  const tokenRes = await fetch(`${cfg.issuerInterno}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`[reconciliacao] conta de serviço recusada (HTTP ${tokenRes.status})`);
  }
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const fetchAdmin = (caminho: string) =>
    fetch(`${cfg.adminBase}${caminho}`, { headers: { Authorization: `Bearer ${access_token}` } });

  const [doRealm, locais] = await Promise.all([
    listarUtilizadoresRealm(fetchAdmin),
    prismaBase.user.findMany({ select: { keycloakSub: true, email: true, tenantId: true } }),
  ]);

  const agora = Date.now();
  const subsLocais = new Set(locais.map((u) => u.keycloakSub));
  const subsRealm = new Set(doRealm.map((u) => u.id));

  const orfaosKc = doRealm.filter(
    (u) =>
      !u.serviceAccountClientId &&
      !subsLocais.has(u.id) &&
      (u.createdTimestamp ?? 0) < agora - IDADE_MINIMA_ORFAO_MS,
  );

  const sinteticos = locais.filter((u) => !UUID_RE.test(u.keycloakSub));
  const semIdentidade = locais.filter(
    (u) => UUID_RE.test(u.keycloakSub) && !subsRealm.has(u.keycloakSub),
  );

  const relatorio: RelatorioReconciliacao = {
    keycloakSemLocal: orfaosKc.length,
    localSemKeycloak: semIdentidade.length,
    sinteticosIgnorados: sinteticos.length,
    totalKeycloak: doRealm.length,
    totalLocal: locais.length,
    alerta: false,
  };

  // «User sem identidade» é sempre grave: é gente que não consegue entrar.
  if (semIdentidade.length > 0) {
    relatorio.alerta = true;
    logger.error(
      {
        contagem: semIdentidade.length,
        exemplos: semIdentidade.slice(0, 5).map((u) => ({ email: u.email, tenantId: u.tenantId })),
      },
      '[reconciliacao] Users locais SEM identidade no realm — não conseguem entrar',
    );
  }

  // Órfãos Keycloak: por taxa, nunca por linha.
  if (orfaosKc.length > limiarAlerta()) {
    relatorio.alerta = true;
    logger.error(
      { contagem: orfaosKc.length, limiar: limiarAlerta() },
      '[reconciliacao] órfãos Keycloak acima do limiar — possível onda de registos abusivos',
    );
  } else if (orfaosKc.length > 0) {
    logger.warn(
      { contagem: orfaosKc.length },
      '[reconciliacao] identidades Keycloak sem User local (inofensivas; reparação manual)',
    );
  }

  logger.info({ ...relatorio }, '[reconciliacao] concluída');
  return relatorio;
}
