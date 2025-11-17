# GestPro ERP

Documentação e interface do ERP modular desenvolvido em Next.js 15. Esta versão descreve o sistema em Português de Portugal e foca-se na organização clara dos módulos de negócio.

## Como executar
```bash
npm install
npm run dev
```
Scripts adicionais:
- `npm run lint` &rarr; validação ESLint 9/Next.js.
- `npm run build` &rarr; build de produção App Router.
- `npm run start` &rarr; executa artefacto compilado (porta 3000).

## Documentação detalhada
Toda a documentação funcional reorganizada, incluindo diagramas e descrição dos módulos sem duplicações, está disponível em [`docs/DOCUMENTACAO.md`](docs/DOCUMENTACAO.md).

- Documentação funcional (frontend): [`docs/DOCUMENTACAO.md`](docs/DOCUMENTACAO.md)
- Documentação técnica do backend Spring Modulith: [`docs/BACKEND_MODULITH.md`](docs/BACKEND_MODULITH.md)

## Stack
- Next.js 15 (App Router) + React 19 + TypeScript 5.
- Tailwind CSS 4, Radix UI, `lucide-react`.
- `react-hook-form`, `zod`, `recharts`, `@supabase/postgrest-js`.

## Estrutura resumida
```
src/
├─ app/(dashboard)   # módulos funcionais (compras, vendas, rh, etc.)
├─ components        # biblioteca de UI e layouts
├─ lib               # conectores, utilidades e validações legais
├─ services          # motores de domínio (stock, comissões)
└─ types             # tipagens globais
```

Para detalhes adicionais (fluxos, backlog e integrações) consulte o documento principal em `docs/`.