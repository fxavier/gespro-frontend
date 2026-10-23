/**
 * Projecto Railway do GestPro: o ficheiro único de Infrastructure as Code do
 * monorepo (`railway config plan` / `railway config apply`, na raiz).
 *
 * Substitui o Config as Code (`railway.json`), que está descontinuado: serviços
 * novos já não o podem adoptar e os ficheiros deixam de ser lidos a 2026-12-01
 * (docs.railway.com/infrastructure-as-code). É UM ficheiro para o ambiente
 * inteiro e o que ele omitir é APAGADO no `apply` — um serviço criado à mão na
 * consola desaparece no apply seguinte.
 *
 * Aqui: o ERP e a sua base. Os serviços de apoio (Keycloak, base, borda,
 * Valkey) e os crons vêm de infra/railway/servicos.ts (#572). Runbook:
 * docs/runbooks/deploy-railway.md.
 *
 * ZERO segredos neste ficheiro. Um segredo é uma variável PARTILHADA do
 * ambiente (`ctx.shared.X` compila para `${{shared.X}}`: referencia, não cria)
 * ou `preserve()` (mantém o valor posto à mão no serviço). Os dois são
 * [HUMANO] e vêm ANTES do primeiro `apply`.
 *
 * Requer a CLI do Railway >= 5.42.1 e o pacote `railway` (ensaiado com 3.16.0)
 * onde o plano corre.
 */
import { defineRailway, github, postgres, preserve, service } from "railway/iac";
import { agendador, REGIAO, REPOSITORIO, servicosDeApoio } from "../infra/railway/servicos";

/** [HUMANO] Domínios definitivos — têm de coincidir com o DNS (runbook, passo 7). */
const DOMINIO_APP = "app.gespro.mz";
const DOMINIO_AUTH = "auth.gespro.mz";
const URL_ERP = `https://${DOMINIO_APP}`;
/** [HUMANO] Domínio do site de marketing (ALLOWED_ORIGINS, SITE_URL). */
const URL_SITE = "https://gespro.mz";
const RAMO = "main";
/** O Dockerfile da raiz fixa PORT=3000. A sonda do Railway usa o PORT. */
const PORTA_ERP = 3000;

export default defineRailway((ctx, project) => {
  const apoio = servicosDeApoio({ ctx, dominioAuth: DOMINIO_AUTH, urlErp: URL_ERP, ramo: RAMO });

  // Base do ERP. O PITR liga-se à mão no separador Backups, porque o IaC não o
  // declara. É a rede de segurança das migrações (#574) — runbook §PITR.
  const erpDb = postgres("erp-db", { region: REGIAO });

  const erp = service("erp", {
    // Raiz do monorepo: o Dockerfile usa-a como contexto de build.
    // checkSuites: só faz deploy de um commit cujos checks do GitHub passaram
    // (o job `image` do CI inclusive).
    source: github(REPOSITORIO, { branch: RAMO, checkSuites: true }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
      // Um commit só no site, na doc ou na infra dos outros serviços não
      // redeploya o ERP.
      watchPatterns: [
        "/apps/erp/**",
        "/packages/**",
        "/Dockerfile",
        "/.dockerignore",
        "/package.json",
        "/pnpm-lock.yaml",
        "/pnpm-workspace.yaml",
      ],
    },
    // #574: as migrações correm UMA vez, num contentor à parte, antes de a
    // versão nova receber tráfego. Se falharem, o deploy não avança. Funciona
    // quer o Railway substitua o ENTRYPOINT, quer lhe passe isto como
    // argumentos (o entrypoint faz `exec "$@"`).
    preDeploy: "/app/docker-entrypoint.sh migrar",
    // O Railway só usa a sonda NO DEPLOY (não monitoriza depois) e espera 2xx.
    // O /api/ready faz SELECT 1: uma versão sem acesso à base não chega a
    // receber tráfego, e o /api/health dava 200 nesse caso.
    healthcheck: "/api/ready",
    healthcheckTimeout: 120,
    deploy: {
      // Há migrações com backfill (ex.: exercício/período sobre ~100 mil
      // lançamentos). Sem tecto, o Railway não tem limite.
      preDeployTimeoutSeconds: 900,
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
      // Entre o SIGTERM e o SIGKILL da versão anterior.
      drainingSeconds: 30,
    },
    // Duas réplicas (plano Pro). O limitador é partilhado (Valkey) e a sessão
    // é JWT, por isso nada fica preso a uma réplica.
    regions: { [REGIAO]: 2 },
    // erp.railway.internal: é por aqui que os crons chamam /api/cron/*.
    networking: { privateNetworkEndpoint: "erp" },
    domains: [{ domain: DOMINIO_APP, port: PORTA_ERP }],
    env: {
      ...apoio.envErp,
      PORT: String(PORTA_ERP),
      // Pela rede privada. O Prisma usa as duas (prisma.config.ts).
      DATABASE_URL: erpDb.env.DATABASE_URL,
      DIRECT_URL: erpDb.env.DATABASE_URL,
      APP_VERSION: "${{RAILWAY_GIT_COMMIT_SHA}}",
      NEXTAUTH_URL: URL_ERP,
      APP_URL: URL_ERP,
      SITE_URL: URL_SITE,
      ALLOWED_ORIGINS: `${URL_ERP},${URL_SITE}`,
      // Um salto de proxy à frente (a borda do Railway) — #552/#655.
      TRUSTED_PROXY_HOPS: "1",
      AUTH_SESSION_MAX_AGE: "900",
      KEYCLOAK_SSO_MAX_SECONDS: "43200",
      // Segredos do próprio ERP: postos à mão no serviço, selados.
      AUTH_SECRET: preserve(),
      METRICS_SECRET: preserve(),
      EMAIL_VERIFY_SECRET: preserve(),
      STRIPE_SECRET_KEY: preserve(),
      STRIPE_WEBHOOK_SECRET: preserve(),
      // Anti-abuso (ADR-0016). Sem as chaves, o registo público é recusado.
      // A site key é NEXT_PUBLIC_*: entra no bundle no BUILD (ARG no Dockerfile).
      CAPTCHA_PROVIDER: "turnstile",
      CAPTCHA_SECRET_KEY: preserve(),
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: preserve(),
      // E-mail: o mesmo fornecedor que o Keycloak (variáveis partilhadas).
      EMAIL_PROVIDER: "smtp",
      SMTP_HOST: ctx.shared.SMTP_HOST,
      SMTP_PORT: ctx.shared.SMTP_PORT,
      SMTP_USER: ctx.shared.SMTP_USER,
      SMTP_PASS: ctx.shared.SMTP_PASS,
      SMTP_FROM: ctx.shared.SMTP_FROM,
      // Documentos no S3 externo com Object Lock (Terraform de storage).
      // Bucket, região e credenciais IAM são outputs desse stack.
      STORAGE_DRIVER: "s3",
      S3_BUCKET: preserve(),
      S3_REGION: preserve(),
      AWS_ACCESS_KEY_ID: preserve(),
      AWS_SECRET_ACCESS_KEY: preserve(),
      // Telemetria: sem endpoint, o SDK OTLP não arranca (ADR-0019). Fica em
      // preserve até haver destino.
      OTEL_SERVICE_NAME: "gespro-erp",
      OTEL_EXPORTER_OTLP_ENDPOINT: preserve(),
      OTEL_EXPORTER_OTLP_HEADERS: preserve(),
    },
  });

  return project("gespro", {
    resources: [erpDb, erp, ...apoio.recursos, ...agendador({ ctx, erp, portaErp: String(PORTA_ERP), ramo: RAMO })],
  });
});
