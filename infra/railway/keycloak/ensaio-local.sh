#!/bin/sh
# Ensaio local da imagem de produção do Keycloak e da borda (sem Railway).
#
# Constrói as duas imagens, arranca-as numa rede Docker descartável com um
# Postgres efémero (a mesma major do `postgres()` do Railway) e prova:
#   1. o realm `gespro` responde no .well-known — pela borda e pelo serviço,
#      também com o Host da sonda do Railway (healthcheck.railway.app);
#   2. o realm importado NÃO tem utilizadores (só a conta de serviço, que a
#      Admin API não lista) — nenhum *@demo.mz, nenhum plataforma@gespro.mz;
#   3. a borda recusa /admin e /realms/master (ADR-0012 §4);
#   4. o arranque recusa-se sem as variáveis obrigatórias.
# No fim apaga contentores, rede e imagens. Corre da raiz do repositório:
#   sh infra/railway/keycloak/ensaio-local.sh
#
# Credenciais aqui são descartáveis, geradas por corrida — nunca de produção.
set -eu

raiz="$(cd "$(dirname "$0")/../../.." && pwd)"
id="kc-ensaio-$$"
rede="$id-rede"
img_kc="gespro-keycloak-railway:ensaio"
img_borda="gespro-keycloak-borda:ensaio"
senha_db="$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"
senha_admin="$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"
porta_borda="${PORTA_BORDA:-18480}"
porta_kc="${PORTA_KC:-18481}"

limpar() {
  docker rm -f "$id-db" "$id-kc" "$id-borda" "$id-falta" >/dev/null 2>&1 || true
  docker network rm "$rede" >/dev/null 2>&1 || true
  [ -n "${MANTER_IMAGENS:-}" ] || docker rmi "$img_kc" "$img_borda" >/dev/null 2>&1 || true
}
trap limpar EXIT INT TERM

falhar() { echo "FALHOU: $*" >&2; exit 1; }

echo "== build"
docker build -q -t "$img_kc" -f "$raiz/infra/railway/keycloak/Dockerfile" "$raiz/infra" >/dev/null
docker build -q -t "$img_borda" "$raiz/infra/railway/keycloak-borda" >/dev/null

echo "== arranque sem variáveis obrigatórias tem de falhar"
if docker run --name "$id-falta" "$img_kc" >/dev/null 2>&1; then
  falhar "o arranque aceitou variáveis em falta"
fi
docker logs "$id-falta" 2>&1 | grep -q "variáveis em falta" || falhar "mensagem de variáveis em falta ausente"

echo "== postgres efémero + keycloak + borda"
docker network create "$rede" >/dev/null
docker run -d --name "$id-db" --network "$rede" --network-alias keycloak-db \
  -e POSTGRES_USER=keycloak -e POSTGRES_PASSWORD="$senha_db" -e POSTGRES_DB=keycloak \
  postgres:18-alpine >/dev/null

# Palavra-passe SMTP com os caracteres que partiam o sed/JSON ingénuo.
docker run -d --name "$id-kc" --network "$rede" --network-alias keycloak \
  -p "127.0.0.1:$porta_kc:8080" \
  -e PORT=8080 -e KC_HTTP_ENABLED=true \
  -e KC_HOSTNAME="http://localhost:$porta_borda" -e KC_HOSTNAME_BACKCHANNEL_DYNAMIC=false \
  -e KC_PROXY_HEADERS=xforwarded \
  -e KC_DB_URL_HOST=keycloak-db -e KC_DB_URL_PORT=5432 -e KC_DB_URL_DATABASE=keycloak \
  -e KC_DB_USERNAME=keycloak -e KC_DB_PASSWORD="$senha_db" \
  -e KC_BOOTSTRAP_ADMIN_USERNAME=admin-ensaio -e KC_BOOTSTRAP_ADMIN_PASSWORD="$senha_admin" \
  -e GESPRO_SSO_IDLE_SECONDS=28800 -e GESPRO_SSO_MAX_SECONDS=43200 \
  -e GESPRO_ERP_URL=https://app.exemplo.invalid -e GESPRO_ERP_CLIENT_SECRET=segredo-ensaio \
  -e GESPRO_SMTP_HOST=smtp.exemplo.invalid -e GESPRO_SMTP_PORT=587 \
  -e GESPRO_SMTP_FROM=noreply@exemplo.invalid -e GESPRO_SMTP_USER=utilizador \
  -e 'GESPRO_SMTP_PASSWORD=a"b\c|d&e' \
  "$img_kc" >/dev/null

docker run -d --name "$id-borda" --network "$rede" -p "127.0.0.1:$porta_borda:8080" \
  -e PORT=8080 -e KEYCLOAK_INTERNO=keycloak:8080 "$img_borda" >/dev/null

echo "== à espera do realm (até 180 s)"
i=0
until curl -fsS -o /dev/null "http://127.0.0.1:$porta_kc/realms/gespro/.well-known/openid-configuration"; do
  i=$((i + 1)); [ "$i" -lt 90 ] || { docker logs "$id-kc" 2>&1 | tail -40; falhar "o realm não respondeu"; }
  sleep 2
done

echo "== 1. .well-known (serviço, sonda do Railway, borda)"
curl -fsS -H 'Host: healthcheck.railway.app' -o /dev/null \
  "http://127.0.0.1:$porta_kc/realms/gespro/.well-known/openid-configuration" \
  || falhar "o .well-known recusou o Host da sonda do Railway"
emissor="$(curl -fsS -H 'X-Forwarded-Proto: https' \
  "http://127.0.0.1:$porta_borda/realms/gespro/.well-known/openid-configuration" \
  | sed -E 's/.*"issuer":"([^"]+)".*/\1/')"
[ "$emissor" = "http://localhost:$porta_borda/realms/gespro" ] || falhar "issuer inesperado: $emissor"
echo "   issuer = $emissor"
pagina_login="$(curl -fsS -H 'X-Forwarded-Proto: https' \
  "http://127.0.0.1:$porta_borda/realms/gespro/protocol/openid-connect/auth?client_id=gespro-erp&response_type=code&scope=openid&code_challenge_method=S256&code_challenge=E9Melhoue1OOS8K6aLdhqH6QxBCj0b5Pr2-zNUvlx9Q&redirect_uri=https%3A%2F%2Fapp.exemplo.invalid%2Fapi%2Fauth%2Fcallback%2Fkeycloak")"
echo "$pagina_login" | grep -q 'gespro.css' || falhar "a página de login pela borda não traz o tema gespro"

echo "== 2. utilizadores do realm gespro (Admin API)"
token="$(curl -fsS -X POST "http://127.0.0.1:$porta_kc/realms/master/protocol/openid-connect/token" \
  -d grant_type=password -d client_id=admin-cli \
  --data-urlencode username=admin-ensaio --data-urlencode "password=$senha_admin" \
  | sed -E 's/.*"access_token":"([^"]+)".*/\1/')"
utilizadores="$(curl -fsS -H "Authorization: Bearer $token" \
  "http://127.0.0.1:$porta_kc/admin/realms/gespro/users?briefRepresentation=true&max=100")"
echo "   GET /admin/realms/gespro/users → $utilizadores"
[ "$utilizadores" = "[]" ] || falhar "o realm de produção tem utilizadores"
contagem="$(curl -fsS -H "Authorization: Bearer $token" "http://127.0.0.1:$porta_kc/admin/realms/gespro/users/count")"
echo "   GET /admin/realms/gespro/users/count → $contagem"
cliente="$(curl -fsS -H "Authorization: Bearer $token" \
  "http://127.0.0.1:$porta_kc/admin/realms/gespro/clients?clientId=gespro-erp")"
echo "$cliente" | grep -q '"https://app.exemplo.invalid/\*"' || falhar "redirectUris do gespro-erp sem o domínio do ERP"
echo "$cliente" | grep -q 'localhost' && falhar "o cliente gespro-erp ainda aponta a localhost"
id_cliente="$(echo "$cliente" | sed -E 's/^\[\{"id":"([^"]+)".*/\1/')"
conta_servico="$(curl -fsS -H "Authorization: Bearer $token" \
  "http://127.0.0.1:$porta_kc/admin/realms/gespro/clients/$id_cliente/service-account-user")"
echo "$conta_servico" | grep -q 'service-account-gespro-erp' || falhar "conta de serviço do gespro-erp em falta"
smtp="$(curl -fsS -H "Authorization: Bearer $token" "http://127.0.0.1:$porta_kc/admin/realms/gespro" \
  | sed -E 's/.*"smtpServer":\{([^}]*)\}.*/\1/')"
echo "$smtp" | grep -q '"host":"smtp.exemplo.invalid"' || falhar "smtpServer sem o host substituído"
echo "   conta de serviço presente; redirectUris e SMTP substituídos"

echo "== 3. borda recusa a consola e o realm master"
for caminho in /admin/ /admin/master/console/ /realms/master/.well-known/openid-configuration /metrics; do
  codigo="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$porta_borda$caminho")"
  echo "   $caminho → $codigo"
  [ "$codigo" = "404" ] || falhar "a borda deixou passar $caminho"
done

echo "OK: realm de produção sem utilizadores de demonstração; borda fechada à administração"
