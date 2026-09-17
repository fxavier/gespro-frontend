# Diagramas de arquitectura

Redesenhados em Setembro de 2026 a partir do código (`apps/`) e das decisões (`docs/decisions`, ADR-0001…0031):
Keycloak com Direct Access Grant, Valkey, MinIO/S3, pilha local de referência com duas instâncias, monorepo com site.
Paleta da marca (`packages/brand/cores.json`); tintas por domínio A–G iguais em todos os diagramas.

Cada diagrama existe em três formatos: `.drawio` (fonte), `.drawio.png` (com XML embebido — abre-se no draw.io e continua editável) e `.svg`.

| # | Ficheiro | O que mostra |
|---|---|---|
| 01 | `01-contexto` | C4 nível 1 — actores, plataforma (ERP, site, Keycloak) e sistemas externos |
| 02 | `02-alto-nivel` | C4 nível 2 — contentores, protocolos e portas do ambiente local de referência |
| 03 | `03-baixo-nivel` | C4 nível 3 — camadas do ERP, pipelines de entrada, 7 domínios e contratos publicados |
| 04 | `04-fluxo-de-dados` | DFD — leitura de página, mutação, route handlers; as duas correntes de contexto |
| 05 | `05-implantacao` | docker compose `--profile full` e produção expressa como capacidades (ADR-0026) |
| 06 | `06-classes` | Serviços, dependências `Pick<Interface>`, contratos com `tx`, hierarquia `AppError` |
| 07 | `07-erd-nucleo` | ~40 entidades centrais com FKs; escalares cross-domínio a tracejado |
| 08 | `08-sequencia` | Venda POS numa só `$transaction`; login por Direct Access Grant e re-resolução de 15 min |
| 09 | `09-maquinas-de-estado` | 26 mapas `TRANSICOES_*` agrupados por domínio |
| 10 | `10-casos-de-uso` | 5 papéis RBAC + actores de sistema sobre os 7 domínios |
| 11 | `11-cicd` | Gates locais, GitHub Actions, imagem OCI, publicação em duas fases (ADR-0022) |

Para regenerar as imagens depois de editar um `.drawio`:

```bash
drawio -x -f png -e -s 2 -o 0X-nome.drawio.png 0X-nome.drawio
drawio -x -f svg -e -o 0X-nome.svg 0X-nome.drawio
```
