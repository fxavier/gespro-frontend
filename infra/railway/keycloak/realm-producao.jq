# Deriva o realm de PRODUÇÃO a partir do realm de desenvolvimento
# (infra/keycloak/realm-gespro.json), que continua a ser a única fonte da
# configuração do realm (ADR-0012 §7). Corre no build da imagem
# (infra/railway/keycloak/Dockerfile); o resultado nunca é versionado.
#
# O que muda, e só isto:
#   1. users — ficam APENAS as contas de serviço (`serviceAccountClientId`).
#      Saem os cinco `*@demo.mz` e o `plataforma@gespro.mz`, todos com a
#      palavra-passe de demonstração (#572). O primeiro administrador de
#      plataforma cria-se à mão, com MFA (docs/runbooks/deploy-railway.md).
#   2. cliente gespro-erp — redirectUris e post-logout apontam ao domínio do
#      ERP em produção (`${env.GESPRO_ERP_URL}`), não a localhost.
#   3. smtpServer — produção fala com um fornecedor real: autenticação e
#      STARTTLS ligados, remetente e credenciais por variável de ambiente.
#   4. descrição do papel plataforma-admin — a do realm de dev tem 300
#      caracteres e o Keycloak guarda-a em varchar(255): num import do zero
#      (base vazia, como a de produção) o arranque rebenta com «value too long
#      for type character varying(255)». Encurtada aqui; o Dockerfile falha se
#      outra descrição passar de 255.
#
# Os `${env.…}` são substituídos no arranque por arranque.sh — zero segredos
# na imagem e no repositório.

del(.users[] | select(has("serviceAccountClientId") | not))
| .roles.realm |= map(
    if .name == "plataforma-admin" then
      .description = "Administrador geral do sistema (ADR-0011 §5, #525): área /plataforma do ERP e consola de identidade. Não dá acesso aos dados de nenhum cliente."
    else . end
  )
| .clients |= map(
    if .clientId == "gespro-erp" then
      .redirectUris = ["${env.GESPRO_ERP_URL}/*"]
      | .attributes["post.logout.redirect.uris"] = "${env.GESPRO_ERP_URL}/*"
    else . end
  )
| .smtpServer = {
    host: "${env.GESPRO_SMTP_HOST}",
    port: "${env.GESPRO_SMTP_PORT}",
    from: "${env.GESPRO_SMTP_FROM}",
    fromDisplayName: .smtpServer.fromDisplayName,
    auth: "true",
    user: "${env.GESPRO_SMTP_USER}",
    password: "${env.GESPRO_SMTP_PASSWORD}",
    ssl: "false",
    starttls: "true"
  }
