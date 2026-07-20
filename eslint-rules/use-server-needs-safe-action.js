/**
 * Regra ESLint: ficheiros com `'use server'` devem usar `createSafeAction`.
 *
 * Rationale: toda a mutação de UI deve passar pelo factory `createSafeAction`
 * para garantir autenticação → autorização → validação Zod → tratamento de erros.
 * Ficheiros `'use server'` fora de `*.actions.ts` são um erro de arquitectura.
 *
 * Excepções explícitas (via comentário `// eslint-disable-next-line`):
 *  - Route Handlers usam `withApi` em vez de `createSafeAction` — ignorados
 *    porque a verificação de ficheiro `route.ts` está na excepção de pattern.
 *
 * @type {import('eslint').Rule.RuleModule}
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Ficheiros com 'use server' devem chamar createSafeAction (ou withApi em route.ts)",
      recommended: true,
    },
    schema: [],
    messages: {
      missing:
        "Ficheiro com 'use server' não usa createSafeAction. " +
        'Mova a lógica para um ficheiro *.actions.ts e envolva-a em createSafeAction().',
    },
  },
  create(context) {
    const filename = context.getFilename();

    // Excepções: route handlers (usam withApi), e ficheiros da própria lib de safe-action.
    const EXEMPT_PATTERNS = [
      /route\.(ts|tsx)$/,
      /safe-action\.(ts|tsx)$/,
      /with-api\.(ts|tsx)$/,
      /auth\.(ts|tsx)$/,           // src/lib/auth.ts — NextAuth config
      /rate-limit\.(ts|tsx)$/,
      /password-reset\.(ts|tsx)$/,
      /audit-extension\.(ts|tsx)$/,
    ];

    if (EXEMPT_PATTERNS.some((p) => p.test(filename))) return {};

    let hasUseServer = false;
    let hasSafeAction = false;

    return {
      ExpressionStatement(node) {
        // Detectar `'use server'` no topo do ficheiro (diretiva de módulo).
        if (
          node.expression.type === 'Literal' &&
          node.expression.value === 'use server' &&
          node.parent.type === 'Program'
        ) {
          hasUseServer = true;
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'createSafeAction'
        ) {
          hasSafeAction = true;
        }
      },
      'Program:exit'(node) {
        if (hasUseServer && !hasSafeAction) {
          context.report({
            node,
            messageId: 'missing',
          });
        }
      },
    };
  },
};
