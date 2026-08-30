/**
 * Utilizadores de demonstração — fonte única partilhada entre o seed Prisma e
 * o teste de sincronização com `infra/keycloak/realm-gespro.json` (ADR-0013 §7).
 *
 * Os `keycloakSub` são FIXOS e têm de ser exactamente os `id` dos utilizadores
 * no ficheiro de realm: é isso que faz o `sub` do token OIDC resolver para o
 * `User` local certo. Dois ficheiros que têm de concordar levam um teste que
 * falha no `pnpm check` (`src/server/auth/__tests__/realm-demo-sync.test.ts`),
 * não num E2E enigmático.
 *
 * A palavra-passe (`demo1234`) vive apenas no ficheiro de realm — o ERP deixou
 * de ver, transportar ou guardar palavras-passe (ADR-0013 §4).
 */
export interface DemoUser {
  /** `id`/`sub` do utilizador no realm `gespro` (UUID fixo, obviamente fixture). */
  keycloakSub: string;
  email: string;
  nome: string;
  roleNome: 'ADMIN' | 'GESTOR' | 'FINANCEIRO' | 'OPERADOR' | 'LEITURA';
}

export const DEMO_USERS: readonly DemoUser[] = [
  {
    keycloakSub: '11111111-1111-4111-8111-111111111111',
    email: 'admin@demo.mz',
    nome: 'Administrador Demo',
    roleNome: 'ADMIN',
  },
  {
    keycloakSub: '22222222-2222-4222-8222-222222222222',
    email: 'gestor@demo.mz',
    nome: 'Gestor Demo',
    roleNome: 'GESTOR',
  },
  {
    keycloakSub: '33333333-3333-4333-8333-333333333333',
    email: 'financeiro@demo.mz',
    nome: 'Financeiro Demo',
    roleNome: 'FINANCEIRO',
  },
  {
    keycloakSub: '44444444-4444-4444-8444-444444444444',
    email: 'operador@demo.mz',
    nome: 'Operador Demo',
    roleNome: 'OPERADOR',
  },
  {
    keycloakSub: '55555555-5555-4555-8555-555555555555',
    email: 'leitura@demo.mz',
    nome: 'Utilizador Leitura',
    roleNome: 'LEITURA',
  },
] as const;
