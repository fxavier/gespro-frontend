#!/bin/sh
# Falha se os horários do agendador do Railway (ROTAS_CRON em
# infra/railway/servicos.ts) divergirem do contrato em infra/local/cron/crontab
# — o mesmo contrato que o teste agendador-runbook-192 impõe ao runbook e às
# rotas. Uma rota /api/cron/* nova entra no crontab E em servicos.ts.
#
# Uso (da raiz do repositório): sh infra/railway/cron/verificar-horarios.sh
set -eu

raiz="$(cd "$(dirname "$0")/../../.." && pwd)"
crontab="$raiz/infra/local/cron/crontab"
servicos="$raiz/infra/railway/servicos.ts"

do_crontab="$(grep -Ev '^[[:space:]]*(#|$)' "$crontab" \
  | awk '{ print $7 " " $1 " " $2 " " $3 " " $4 " " $5 }' | sort)"
do_railway="$(grep -E '\{ rota: "/api/cron/' "$servicos" \
  | sed -E 's/.*rota: "([^"]+)", horario: "([^"]+)".*/\1 \2/' | sort)"

if [ "$do_crontab" != "$do_railway" ]; then
  echo "Horários divergentes entre o crontab local e o Railway:" >&2
  echo "--- infra/local/cron/crontab" >&2
  echo "$do_crontab" >&2
  echo "--- infra/railway/servicos.ts (ROTAS_CRON)" >&2
  echo "$do_railway" >&2
  exit 1
fi
echo "ok: $(echo "$do_railway" | wc -l | tr -d ' ') rotas com o mesmo horário no crontab e no Railway"
