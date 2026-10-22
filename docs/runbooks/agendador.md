# Runbook — agendador (rotas `/api/cron/*`)

**Governa:** ADR-0032 (§«O que isto custa»), ADR-0026 §2 (ambiente local como topologia
executável), ADR-0022 §4 (configuração por ambiente, nunca por código).

## O que é, e porque existe um contentor para isto

Cinco rotas do ERP fazem trabalho que ninguém pede a partir de um ecrã. Não se chamam sozinhas:
alguém tem de as chamar a horas. Localmente esse alguém é um contentor do `docker-compose`, no
perfil `full`; em produção são cinco serviços cron do Railway (§Em produção).

Não é decoração. **Sem agendador, o ciclo de vida das subscrições não acontece**: o trial não
acaba, a Leitura não começa, e a Leitura que começou nunca fecha. Para o trial ainda há o Stripe
como motor primário; para o fecho da Leitura não há motor nenhum — o prazo é nosso.

## Contrato (é isto que se leva para produção)

| Rota | Quando | O que faz |
|---|---|---|
| `/api/cron/expirar-trials` | diário, 03:00 UTC | Fim do Trial → Leitura · aviso a 7 dias do fecho · fim da Leitura → Fechada |
| `/api/cron/expirar-registos-nao-verificados` | diário, 03:10 UTC | Expurga registos públicos que nunca confirmaram o e-mail (> 7 dias) |
| `/api/cron/reconciliar-identidades` | diário, 03:15 UTC | Compara Identidade ↔ Utilizador. **Reporta, não apaga** (ADR-0013 §3) |
| `/api/cron/transporte-alertas` | diário, 03:30 UTC | Recalcula estados de documentos e emite alertas |
| `/api/cron/abrir-exercicio` | diário, 02:00 UTC | Cria `ExercicioContabil` + 13 `PeriodoContabil` + séries de documento. Por tenant: só actua no dia/mês configurado em `ConfiguracaoFiscal` (ADR-0033 §3). Idempotente. |

**Nota sobre a data da abertura de exercício:** a rota corre todos os dias (era `0 2 1 12 *`,
passou a `0 2 * * *`). A data deixou de viver no crontab e passou a ser configurada por tenant
em `ConfiguracaoFiscal.diaAberturaExercicio` / `mesAberturaExercicio`. Por omissão: dia 1, mês
12 (1 de Dezembro) — preserva o comportamento anterior. Um tenant que configure dia 15/mês 11
abre o exercício a 15 de Novembro. Quem procurar a data no crontab vai encontrá-la no ecrã
`/contabilidade/configuracoes` de cada tenant. O `?ano=YYYY` força a abertura ignorando a
configuração — é o caminho de recuperação de quem descobre em Janeiro que o automatismo falhou.

- **Método**: `GET`.
- **Autenticação**: `Authorization: Bearer <CRON_SECRET>`, verificado em cada rota pelo
  `withCron` (401 sem ele). O prefixo `/api/cron/` **está** em `PUBLIC_PATHS`
  (`apps/erp/src/proxy.ts`): o proxy não exige sessão — sem essa entrada o agendador
  recebia 307 → `/auth/login` antes de a credencial ser lida. Entram com esta credencial,
  nunca com sessão.
- **Idempotência**: todas. Repetir uma corrida tem o mesmo efeito que corrê-la uma vez — quem
  decide é o compare-and-set dentro das transições, não a consulta que produz candidatos. Uma
  corrida falhada pode simplesmente repetir-se.
- **Horário**: espaçados de propósito. A abertura de exercício corre às 02:00; das restantes, o
  de subscrições corre primeiro porque é o que pode fechar acessos; o de identidades corre depois
  para ver o mundo já estabilizado. A fonte dos horários é `infra/local/cron/crontab`: esta tabela
  e os comentários «Agendamento» de cada `route.ts` acompanham-no (há teste que o impõe), e o
  `ROTAS_CRON` de `infra/railway/servicos.ts` também (`sh infra/railway/cron/verificar-horarios.sh`).
- **Uma rota nova entra em dois sítios** — o `crontab` local e o `ROTAS_CRON` do Railway — além
  desta tabela e do comentário da própria rota. Só no compose, não corre em produção; só no
  Railway, nunca foi exercida localmente.
- **Fuso**: UTC. Maputo é UTC+2, portanto 03:00 UTC = 05:00 locais — fora do horário de expediente
  moçambicano, que é o que se quer.

## Localmente

```bash
docker compose --profile full up -d
docker compose logs -f cron          # uma linha por chamada, com o corpo da resposta
```

Forçar uma corrida sem esperar pela hora:

```bash
docker compose exec cron chamar /api/cron/expirar-trials
```

Ficheiros: `infra/local/cron/crontab` (horários) e `infra/local/cron/chamar.sh` (a chamada).
O `CRON_SECRET` vem do `.env` da raiz; sem `.env`, o compose usa o placeholder de dev.

## Em produção (Railway)

Um **serviço cron do Railway por rota** — o Railway dá um só `cronSchedule` por serviço e os
horários são cinco. Todos da mesma imagem, `infra/railway/cron/` (`alpine` + `curl` +
`chamar.sh`), declarados em `infra/railway/servicos.ts` (`agendador()`), com o nome
`cron-<rota>`. Mantêm **rota, método, cabeçalho e horário** do contrato acima. Procedimento de
criação e variáveis: [`deploy-railway.md`](./deploy-railway.md).

- **Caminho**: pela rede privada, `http://<domínio privado do ERP>:3000/api/cron/<rota>` — não sai
  para a Internet. O `CRON_SECRET` é uma variável **partilhada** do ambiente, lida pelo ERP e pelos
  cinco crons: trocá-la é num sítio só, e os dois lados nunca divergem.
- **Execução**: cada corrida arranca o contentor, faz uma chamada e termina. Se a anterior ainda
  estiver viva, o Railway **salta** a nova — não há corridas sobrepostas vindas do agendador. O
  Railway avisa que a hora pode variar «alguns minutos»: os horários estão espaçados de ≥ 5 min.
- **Falha**: ao contrário do dublê local, o `chamar.sh` de produção **sai com erro** (resposta
  ≥ 400 ou rede), e a execução fica falhada no Railway em vez de um «ok» enganador.
- **Retentativa**: duas, com 30 s entre elas, em ligação recusada e 5xx (o `curl --retry`). Seguro
  porque as rotas são idempotentes; o 409 por `pg_try_advisory_lock` pedido na #572 ainda não
  existe, e é ele que protege uma retentativa que apanhe a anterior a meio.

Duas coisas do lado da operação:

1. **Alarme de corrida em falta / falhada.** O Railway não alerta um cron falhado nem um que não
   correu (só alerta deploys falhados ou rebentados). Cada cron avisa um **monitor de batimento
   externo** depois de um 2xx (`CRON_HEARTBEAT_URL`, uma por rota): sem batimento na janela, o
   monitor alerta — e isso cobre as duas falhas, porque um agendador silenciosamente parado é
   indistinguível de «não havia nada para fazer», e a diferença só aparece quando um cliente
   reclama que ainda está a usar um trial de há três meses. Ver
   [`deploy-railway.md`](./deploy-railway.md) §Alertas. (O desenho para a AWS, com
   `AVISO-cron-falhou`/`AVISO-cron-em-falta` sobre os registos, está em
   [`alertas-producao.md`](./alertas-producao.md) e fica arquivado com esse IaC.)
2. **Forçar uma corrida**: no painel do Railway, serviço `cron-<rota>` → executar agora; ou, de
   fora, pelo domínio público do ERP (o prefixo está em `PUBLIC_PATHS`, a credencial é o Bearer):
   `curl --fail-with-body -H "Authorization: Bearer $CRON_SECRET" https://<domínio do ERP>/api/cron/expirar-trials`
   (é seguro repetir).

## Se falhar

O contentor **não** morre quando uma chamada falha; regista `FALHOU` e segue. Ler os registos e
verificar, por esta ordem: o ERP responde (`/api/health`), o `CRON_SECRET` do agendador é o mesmo
que o do ERP, e a rota não passou a 401 (segredo trocado num dos lados). Depois de corrigir,
forçar a corrida à mão — é seguro repetir.
