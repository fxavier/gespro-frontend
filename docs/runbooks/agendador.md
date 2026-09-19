# Runbook — agendador (rotas `/api/cron/*`)

**Governa:** ADR-0032 (§«O que isto custa»), ADR-0026 §2 (ambiente local como topologia
executável), ADR-0022 §4 (configuração por ambiente, nunca por código).

## O que é, e porque existe um contentor para isto

Quatro rotas do ERP fazem trabalho que ninguém pede a partir de um ecrã. Não se chamam sozinhas:
alguém tem de as chamar a horas. Enquanto não houver fornecedor escolhido (ADR-0026 §5) esse
alguém é um contentor do `docker-compose`, no perfil `full`.

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
| `/api/cron/abrir-exercicio` | 1 de Dezembro, 02:00 UTC | Cria `ExercicioContabil` + 13 `PeriodoContabil` + séries de documento para o ano seguinte (ADR-0033 §3). Idempotente. |

- **Método**: `GET`.
- **Autenticação**: `Authorization: Bearer <CRON_SECRET>`. As rotas **não** estão em
  `PUBLIC_PATHS` — entram com esta credencial, nunca com sessão.
- **Idempotência**: todas. Repetir uma corrida tem o mesmo efeito que corrê-la uma vez — quem
  decide é o compare-and-set dentro das transições, não a consulta que produz candidatos. Uma
  corrida falhada pode simplesmente repetir-se.
- **Horário**: espaçados de propósito. O de subscrições corre primeiro porque é o que pode fechar
  acessos; o de identidades corre depois para ver o mundo já estabilizado.
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

## Em produção

Substituir o contentor pelo agendador do fornecedor (cron gerido, EventBridge, Cloud Scheduler,
um `CronJob` de Kubernetes — o que houver), mantendo **rota, método, cabeçalho e horário**. O
segredo vem do gestor de segredos, nunca do repositório.

Duas coisas a montar do lado da operação, porque o contentor local não as dá:

1. **Alarme de corrida em falta.** Já existe regra para isto em
   `infra/local/observabilidade/alerts/rules.yaml` — apontá-la ao ambiente real. Um agendador
   silenciosamente parado é indistinguível de «não havia nada para fazer», e a diferença só
   aparece quando um cliente reclama que ainda está a usar um trial de há três meses.
2. **Retentativa.** O `crond` local não tenta de novo: a próxima corrida é no dia seguinte. Como
   tudo é idempotente, um agendador com retentativa é estritamente melhor — use-a se o fornecedor
   a oferecer.

## Se falhar

O contentor **não** morre quando uma chamada falha; regista `FALHOU` e segue. Ler os registos e
verificar, por esta ordem: o ERP responde (`/api/health`), o `CRON_SECRET` do agendador é o mesmo
que o do ERP, e a rota não passou a 401 (segredo trocado num dos lados). Depois de corrigir,
forçar a corrida à mão — é seguro repetir.
