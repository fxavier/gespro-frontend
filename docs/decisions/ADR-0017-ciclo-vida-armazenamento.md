# ADR-0017 — Ciclo de vida dos objectos no armazenamento

- **Estado**: Proposto
- **Data**: 2026-08-21
- **Contexto**: Spec 20 (Prontidão para Produção) · Wave 8
- **Relacionados**: [ADR-0005-b](./ADR-0005-infraestrutura-deploy.md), `docs/handoff/feat-01-doc-core.md`
- **Skills**: `engineering:architecture`, `api-conventions`

## Contexto

O armazenamento de documentos foi entregue na Wave 7 com uma porta hexagonal (`local` para
desenvolvimento e CI, `s3` para produção), URLs assinadas por prefixo de tenant, e asserção desse
prefixo na escrita, na leitura e no apagamento — vector cross-tenant que foi apanhado em revisão e
fechado na raiz. A base está sólida. O que ficou em aberto são **três buracos no ciclo de vida**,
todos registados no *handoff* da própria wave:

1. **O limite de 10 MB não é imposto pela URL assinada.** É validado no *presign* pelo schema Zod, no
   cliente, e mitigado por uma regra de ciclo de vida do bucket. Mas a assinatura por parâmetros de
   consulta não suporta condição de tamanho: quem tiver a URL assinada pode enviar um ficheiro de
   qualquer dimensão. É um vector de custo, não de segurança.

2. **`storage.delete()` existe e ninguém o chama.** As acções de remoção de documento apagam o
   metadado em Postgres e deixam o objecto no bucket. Cada remoção é um órfão que paga armazenamento
   para sempre e — mais grave — **um documento que o utilizador julga apagado continua a existir**,
   o que é um problema de protecção de dados, não apenas de custo.

3. **Documentos de colaborador existem com a forma errada.** O modelo `DocumentoColaborador` está em
   `pessoas-projetos.prisma:517`, mas foi escrito antes do armazenamento por objecto e guarda
   `nome`, `url` e `dataUpload` — **sem `storageKey`, sem `tipoConteudo` e sem `deletedAt`**. Não há
   acção de registo, listagem ou remoção; a única referência em `src/` é um tipo em `types/rh.ts`. O
   *presign* aceita o recurso e a permissão existe, mas o ficheiro sobe e não tem onde ser registado.
   O documento de arquitectura descreveu isto como «modelo inexistente»; é pior — existe e está
   desalinhado com os outros seis recursos.

## Decisão

### 0. Tornar o cliente de armazenamento portátil

`src/lib/storage/objeto/s3.ts` cria o cliente com `new S3Client({ region })` — **sem `endpoint`**, o
que o prende à AWS sem necessidade nenhuma. Acrescentar `endpoint` e `forcePathStyle`, ambos lidos do
ambiente, abre MinIO (ambiente de referência, ADR-0026), Cloudflare R2, Backblaze B2, Scaleway e o
modo de interoperabilidade do Google Cloud Storage.

São duas linhas, e é o que permite que a política de POST decidida a seguir seja **verificada
localmente contra um servidor que fala mesmo a API S3**, em vez de ser verificada por leitura.

### 1. Impor o limite de tamanho com política de POST

Substituir a URL assinada de PUT por **política de POST** (`createPresignedPost`), que suporta a
condição `content-length-range` na própria política assinada. O limite passa a ser imposto pelo S3, do
lado do servidor, e um ficheiro acima do limite é recusado com 400 antes de ocupar largura de banda.

A política declara, além do tamanho: o prefixo de chave exacto (mantendo a asserção de tenant já
existente), o tipo de conteúdo permitido, e uma validade curta. O cliente passa a submeter um
formulário com os campos assinados em vez de um PUT directo — mudança contida, confinada ao
componente de envio e ao adaptador.

Limites por tipo de recurso, em vez de um limite único: **10 MB** para documentos correntes,
**25 MB** para anexos de projecto, **2 MB** para imagens de perfil e logótipos.

### 2. Fechar o ciclo de vida do objecto

- Toda a acção `removerDocumento*` passa a chamar `storage.delete(storageKey)` **depois** de a
  transacção que remove o metadado confirmar. A ordem é deliberada: metadado primeiro, objecto
  depois. Se o apagamento do objecto falhar, fica um órfão detectável; se fosse ao contrário, ficaria
  um metadado a apontar para nada — que o utilizador vê como erro.
- Os *mappers* de leitura passam a expor `storageKey`, hoje omitido, que é o que torna a chamada
  possível a partir do consumidor.
- **Tarefa de reconciliação semanal** que compara o conteúdo do bucket com as chaves referenciadas em
  Postgres e reporta órfãos nas duas direcções. Como no ADR-0013, **reporta e não apaga**: apagar
  automaticamente um objecto por causa de uma inconsistência de leitura é uma forma barata de perder
  um documento fiscal de um cliente.
- **Regra de ciclo de vida do bucket** para abortar envios em várias partes incompletos — já existe,
  mantém-se — e para expirar objectos sob um prefixo `tmp/` ao fim de 24 horas.

### 3. Documentos de colaborador — migrar, não criar

`DocumentoColaborador` **já existe** e é alinhado com os restantes modelos de documento:
`url` → `storageKey`, mais `nomeOriginal`, `tipoConteudo` e `deletedAt`; `nome` e `dataUpload`
mantêm-se. Acrescentam-se acção de registo, de listagem e de remoção, e cobertura no *download*.

**Isto gera migração com SQL, não vazia** — há uma coluna a mudar de semântica. Duas consequências:

- A migração corre **antes** da separação de domínio do ADR-0025, cujo critério de aceitação é uma
  migração vazia. As duas não podem partilhar janela.
- A tabela está vazia em desenvolvimento e não existe em produção, pelo que a conversão `url` →
  `storageKey` é um `RENAME COLUMN`, sem transformação de dados. Se alguma vez houver dados, a
  migração passa a exigir passo de transformação — e deixa de ser trivial.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Política de POST com `content-length-range`** ✅ | Limite imposto pelo S3, não pela boa vontade do cliente; recusa antes de transferir; mesma política declara prefixo e tipo | Muda o contrato do *presign* e o componente de envio; formulário em vez de PUT é ligeiramente menos directo |
| Manter o PUT assinado e aceitar o risco | Zero trabalho | O limite continua a ser sugestão. Um cliente comprometido ou um utilizador malicioso enche o bucket |
| Enviar através da aplicação | Controlo total sobre validação e antivírus | Todo o tráfego de ficheiros passa a atravessar o contentor da aplicação — largura de banda, memória e tempo de pedido. É exactamente o que a URL assinada existe para evitar |
| Verificar o tamanho depois, por evento do bucket | Sem alterar o *presign* | O ficheiro já ocupou espaço e largura de banda; a limpeza é assíncrona e o custo já foi pago |
| Apagar objectos automaticamente na reconciliação | Bucket sempre limpo, sem intervenção | Um erro de leitura ou uma condição de corrida apagam um documento fiscal de um cliente. Assimetria de risco inaceitável |

## Consequências

- **O contrato de `/api/documentos/presign` muda**: passa a devolver `url` mais `fields` em vez de uma
  URL de PUT. É uma alteração incompatível, mas nenhum consumidor externo depende dele — o único
  cliente é o componente de envio da própria aplicação.
- **O adaptador `local` deixa de ser o caminho de desenvolvimento por omissão.** Com MinIO na pilha
  local, o adaptador `s3` passa a ser exercitado em desenvolvimento e em CI contra um servidor real —
  o que elimina a categoria de erro «só aparece em produção» nesta área. O adaptador `local`
  mantém-se para testes unitários e para quem não queira levantar a pilha completa.
- **`DocumentoColaborador` altera um modelo de `pessoas-projetos.prisma`** — não acrescenta. O
  ficheiro mantém 50 modelos, e o inventário 26/16/8 do ADR-0025 continua correcto. A coordenação com
  o ADR-0025 é de **ordem**, não de contagem: esta migração vem primeiro.
- **Duas tarefas agendadas novas** — reconciliação de armazenamento e expurgo de temporários — ambas
  através de `withApi`.
- **A remoção passa a ser efectiva.** Deixa de haver a situação em que o utilizador remove um documento
  na interface e o ficheiro continua acessível a quem tenha a chave. É a parte desta decisão que tem
  implicações de protecção de dados, e não apenas de custo.
- **Custo de armazenamento passa a ser observável**: métrica de dimensão do bucket por tenant, que
  alimenta a discussão de preço por escalão de plano.
