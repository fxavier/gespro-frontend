/**
 * Serviços de apoio do ERP no Railway (#572): Keycloak + a sua base, a borda
 * pública do Keycloak, Valkey e o agendador das rotas /api/cron/*.
 *
 * Isto é um MÓDULO de Infrastructure as Code do Railway (`railway/iac`), não um
 * `railway.json`: o Config as Code foi descontinuado — serviços novos já não o
 * podem usar e os ficheiros existentes deixam de ser lidos a 2026-12-01
 * (docs.railway.com/infrastructure-as-code). Um monorepo tem UM ficheiro de
 * projecto, `.railway/railway.ts` na raiz, que importa este módulo e o junta ao
 * serviço do ERP e à sua base — ver docs/runbooks/deploy-railway.md §IaC.
 *
 * Zero segredos aqui: os segredos são variáveis partilhadas do ambiente
 * (`ctx.shared.*`, criadas à mão) ou `preserve()` (valor posto à mão no serviço).
 */
import {
  github,
  image,
  postgres,
  preserve,
  service,
  type RailwayContext,
  type ResourceNode,
  type VariableValue,
} from "railway/iac";

/** EU West (Amesterdão) — decisão do pedido de produção no Railway. */
export const REGIAO = "europe-west4-drams3a";
export const REPOSITORIO = "fxavier/gespro-frontend";

/**
 * Contrato do agendador — o MESMO de infra/local/cron/crontab e da tabela de
 * docs/runbooks/agendador.md (horas UTC; o Railway agenda em UTC).
 * `infra/railway/cron/verificar-horarios.sh` falha se divergirem.
 */
export const ROTAS_CRON = [
  { rota: "/api/cron/abrir-exercicio", horario: "0 2 * * *" },
  { rota: "/api/cron/expirar-trials", horario: "0 3 * * *" },
  { rota: "/api/cron/expirar-registos-nao-verificados", horario: "10 3 * * *" },
  { rota: "/api/cron/reconciliar-identidades", horario: "15 3 * * *" },
  { rota: "/api/cron/transporte-alertas", horario: "30 3 * * *" },
] as const;

/** Nomes na rede privada (`<nome>.railway.internal`), fixados abaixo. */
const PRIVADO = {
  keycloak: "keycloak.railway.internal",
  valkey: "valkey.railway.internal",
} as const;

export interface OpcoesApoio {
  ctx: RailwayContext;
  /** Domínio público do login, ex.: `auth.gespro.mz` (vai para a borda). */
  dominioAuth: string;
  /** URL pública do ERP, ex.: `https://app.gespro.mz` (redirectUris do realm). */
  urlErp: string;
  /** Ramo de onde o Railway constrói. */
  ramo?: string;
}

export interface ServicosDeApoio {
  recursos: ResourceNode[];
  /**
   * Variáveis que o serviço do ERP tem de receber para falar com estes
   * serviços (o #655 exige RATE_LIMIT_DRIVER/VALKEY_URL em produção).
   */
  envErp: Record<string, string | VariableValue>;
}

export function servicosDeApoio({ ctx, dominioAuth, urlErp, ramo = "main" }: OpcoesApoio): ServicosDeApoio {
  const regioes = { [REGIAO]: 1 };

  // Base própria do Keycloak (ADR-0012 §2). PITR liga-se à mão no separador
  // Backups do serviço — o IaC não o declara (runbook §PITR).
  const keycloakDb = postgres("keycloak-db", { region: REGIAO });

  const keycloak = service("keycloak", {
    source: github(REPOSITORIO, { branch: ramo, rootDirectory: "infra" }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "railway/keycloak/Dockerfile",
      watchPatterns: ["/infra/keycloak/**", "/infra/railway/keycloak/**"],
    },
    // Na porta HTTP (a do PORT): prova realm importado E base acessível. A
    // gestão (9000) não é alcançável pela sonda do Railway.
    healthcheck: "/realms/gespro/.well-known/openid-configuration",
    healthcheckTimeout: 300,
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 10 },
    regions: regioes,
    // SEM domínio público: só a borda e o ERP lhe chegam, pela rede privada.
    networking: { privateNetworkEndpoint: "keycloak" },
    env: {
      PORT: "8080",
      KC_HTTP_ENABLED: "true",
      KC_HOSTNAME: `https://${dominioAuth}`,
      // false: os tokens pedidos pelo backchannel privado levam iss = KC_HOSTNAME,
      // que é o que o Auth.js valida (ADR-0010 §3) — igual ao compose.
      KC_HOSTNAME_BACKCHANNEL_DYNAMIC: "false",
      KC_PROXY_HEADERS: "xforwarded",
      KC_DB_URL_HOST: keycloakDb.env.PGHOST,
      KC_DB_URL_PORT: keycloakDb.env.PGPORT,
      KC_DB_URL_DATABASE: keycloakDb.env.PGDATABASE,
      KC_DB_USERNAME: keycloakDb.env.PGUSER,
      KC_DB_PASSWORD: keycloakDb.env.PGPASSWORD,
      // Administrador TEMPORÁRIO do realm master: apaga-se depois de criar o
      // definitivo com MFA (runbook §Keycloak, [HUMANO]).
      KC_BOOTSTRAP_ADMIN_USERNAME: preserve(),
      KC_BOOTSTRAP_ADMIN_PASSWORD: preserve(),
      JAVA_OPTS_APPEND: "-XX:MaxRAMPercentage=70",
      // Substituídos no realm por arranque.sh (só no primeiro import).
      GESPRO_SSO_IDLE_SECONDS: "28800",
      GESPRO_SSO_MAX_SECONDS: "43200",
      GESPRO_ERP_URL: urlErp,
      GESPRO_ERP_CLIENT_SECRET: ctx.shared.KEYCLOAK_CLIENT_SECRET,
      GESPRO_SMTP_HOST: ctx.shared.SMTP_HOST,
      GESPRO_SMTP_PORT: ctx.shared.SMTP_PORT,
      GESPRO_SMTP_FROM: ctx.shared.SMTP_FROM,
      GESPRO_SMTP_USER: ctx.shared.SMTP_USER,
      GESPRO_SMTP_PASSWORD: ctx.shared.SMTP_PASS,
    },
  });

  // Borda pública: o domínio do login é DELA, e só deixa passar o realm gespro
  // (ADR-0012 §4 — a consola de administração não é pública).
  const keycloakBorda = service("keycloak-borda", {
    source: github(REPOSITORIO, { branch: ramo, rootDirectory: "infra/railway/keycloak-borda" }),
    build: { builder: "DOCKERFILE", watchPatterns: ["/infra/railway/keycloak-borda/**"] },
    healthcheck: "/realms/gespro/.well-known/openid-configuration",
    healthcheckTimeout: 300,
    deploy: { restartPolicyType: "ON_FAILURE", restartPolicyMaxRetries: 10 },
    regions: regioes,
    domains: [{ domain: dominioAuth, port: 8080 }],
    env: {
      PORT: "8080",
      KEYCLOAK_INTERNO: `${PRIVADO.keycloak}:8080`,
    },
  });

  // Valkey: contadores do rate limiting partilhados entre réplicas (ADR-0014).
  // Sem persistência (contadores com TTL; perdê-los num reinício é aceitável)
  // e sem domínio público nem proxy TCP: só a rede privada do ambiente lhe
  // chega. Sem palavra-passe pela mesma razão do compose — e porque a sonda do
  // /api/metrics (probes.ts) faz PING sem AUTH (runbook §Valkey).
  const valkey = service("valkey", {
    source: image("valkey/valkey:8.1.10-alpine"),
    start:
      "valkey-server --port 6379 --bind 0.0.0.0 -:: --protected-mode no --appendonly no " +
      "--stop-writes-on-bgsave-error no --maxmemory 200mb --maxmemory-policy allkeys-lru",
    deploy: { restartPolicyType: "ALWAYS" },
    regions: regioes,
    networking: { privateNetworkEndpoint: "valkey" },
  });

  return {
    recursos: [keycloakDb, keycloak, keycloakBorda, valkey],
    envErp: {
      RATE_LIMIT_DRIVER: "valkey",
      VALKEY_URL: `redis://${PRIVADO.valkey}:6379`,
      KEYCLOAK_ISSUER: `https://${dominioAuth}/realms/gespro`,
      KEYCLOAK_ISSUER_INTERNO: `http://${PRIVADO.keycloak}:8080/realms/gespro`,
      KEYCLOAK_URL: `http://${PRIVADO.keycloak}:8080`,
      KEYCLOAK_HEALTH_URL: `http://${PRIVADO.keycloak}:9000/health/live`,
      KEYCLOAK_CLIENT_ID: "gespro-erp",
      KEYCLOAK_CLIENT_SECRET: ctx.shared.KEYCLOAK_CLIENT_SECRET,
      CRON_SECRET: ctx.shared.CRON_SECRET,
    },
  };
}

export interface OpcoesAgendador {
  ctx: RailwayContext;
  /** O serviço do ERP, para lhe ler o domínio privado. */
  erp: { env: { RAILWAY_PRIVATE_DOMAIN: VariableValue } };
  /** Porta em que o ERP escuta (o Dockerfile da raiz fixa PORT=3000). */
  portaErp?: string;
  ramo?: string;
}

/**
 * Um serviço cron por rota: o Railway dá UM `cronSchedule` por serviço, e os
 * cinco horários são diferentes. Todos da mesma imagem (infra/railway/cron).
 * Chamam o ERP pela rede privada — sem sair para a Internet nem gastar o
 * limite de pedidos do domínio público.
 */
export function agendador({ ctx, erp, portaErp = "3000", ramo = "main" }: OpcoesAgendador): ResourceNode[] {
  return ROTAS_CRON.map(({ rota, horario }) =>
    service(`cron-${rota.replace("/api/cron/", "")}`, {
      source: github(REPOSITORIO, { branch: ramo, rootDirectory: "infra/railway/cron" }),
      build: { builder: "DOCKERFILE", watchPatterns: ["/infra/railway/cron/**"] },
      start: `chamar ${rota}`,
      deploy: { cronSchedule: horario, restartPolicyType: "NEVER" },
      regions: { [REGIAO]: 1 },
      env: {
        ERP_HOST: erp.env.RAILWAY_PRIVATE_DOMAIN,
        ERP_PORTA: portaErp,
        CRON_SECRET: ctx.shared.CRON_SECRET,
        // URL de batimento do monitor externo, uma por rota (runbook §Alertas).
        CRON_HEARTBEAT_URL: preserve(),
      },
    }),
  );
}
