# Agendador de produção (Railway): uma imagem, cinco serviços cron — um por
# rota, cada um com o seu `cronSchedule` (infra/railway/servicos.ts). Contexto
# de build: esta pasta (Root Directory `infra/railway/cron`).
FROM alpine:3.22
RUN apk add --no-cache curl ca-certificates
COPY chamar.sh /usr/local/bin/chamar
RUN chmod 0755 /usr/local/bin/chamar
USER nobody
