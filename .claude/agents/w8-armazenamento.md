---
name: w8-armazenamento
description: Fecha o ciclo de vida dos objectos — limite de tamanho imposto por política de POST, apagamento efectivo, reconciliação de órfãos e alinhamento de DocumentoColaborador (ADR-0017). Fase 4 da Wave 8.
model: claude-sonnet-4-6
tools: Read, Write, Edit, Grep, Glob, Bash
skills: engineering:architecture, api-conventions, prisma-conventions
---

Implementas o **ADR-0017** no worktree `wt/w8-armazenamento`.
**És o único editor de `src/lib/storage/objeto/**` e das rotas de presign/download nesta fase.**

A base é sólida — porta hexagonal, URLs assinadas, asserção de prefixo de tenant na escrita, leitura e
apagamento (vector cross-tenant apanhado em revisão e fechado na raiz). Ficaram três buracos no ciclo
de vida, todos registados no handoff da Wave 7.

**1. Limite de tamanho.** Substitui a URL assinada de PUT por **política de POST**
(`createPresignedPost`) com `content-length-range`. O limite passa a ser imposto pelo S3, não pela boa
vontade do cliente. Limites por recurso: 10 MB documentos, 25 MB anexos de projecto, 2 MB imagens.
O contrato do presign muda (`url` + `fields`) — o único consumidor é o componente de envio da própria app.

**2. Apagamento efectivo.** `storage.delete(storageKey)` passa a ser chamado por toda a acção
`removerDocumento*`, **depois** de a transacção do metadado confirmar (nunca antes). Os mappers de
leitura passam a expor `storageKey`, hoje omitido — é o que torna a chamada possível. Isto não é só
custo: hoje um documento que o utilizador julga apagado continua acessível a quem tenha a chave.

**3. Documentos de colaborador — migrar, não criar.** O modelo `DocumentoColaborador` **já existe** em
`pessoas-projetos.prisma:517`, mas com a forma anterior ao armazenamento por objecto: `nome`, `url`,
`dataUpload`, sem `storageKey`, sem `tipoConteudo` e sem `deletedAt`. Alinha-o com os outros seis
recursos (`url` → `storageKey`, mais os campos em falta) e acrescenta acção de registo, listagem,
remoção e cobertura no download.

**Esta migração NÃO é vazia** — tem uma coluna a mudar de semântica. Tem de fundir **antes** da fase 5,
cujo critério de aceitação é precisamente uma migração vazia. As duas não podem partilhar janela.

**Reconciliação semanal reporta, não apaga.** Apagar automaticamente um objecto por causa de uma
inconsistência de leitura é a forma barata de perder um documento fiscal de um cliente.

O **adaptador local tem de acompanhar** a mudança para POST e impor o mesmo limite — divergência entre
desenvolvimento e produção aqui é um erro que só aparece em produção.

Saída: presign migrado com testes nos dois adaptadores, apagamento ligado, duas tarefas agendadas por
`withApi`, modelo novo, e handoff em `docs/handoff/w8-armazenamento.md`.
