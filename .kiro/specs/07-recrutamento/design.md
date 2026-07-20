# Design: Recrutamento

## Âmbito

Módulo greenfield no WS E (Pessoas). Auto-contido; a única integração é a
conversão de `Candidatura` contratada em `Colaborador` (mesmo domínio, chamada de
serviço directa em transacção). Reutiliza validadores MZ e o padrão kanban.

## Novos modelos (`prisma/schema/pessoas-projetos.prisma`)

```prisma
enum StatusVaga { RASCUNHO ABERTA EM_TRIAGEM FECHADA CANCELADA }
enum EtapaCandidatura { RECEBIDA TRIAGEM ENTREVISTA PROPOSTA CONTRATADO REJEITADO DESISTIU }
enum TipoEntrevista { TELEFONICA PRESENCIAL VIDEO TECNICA PAINEL }

model Vaga {
  id String @id @default(cuid())
  tenantId String
  codigo String
  titulo String
  descricao String
  departamentoId String?
  cargoId String?
  numeroPosicoes Int @default(1)
  posicoesPreenchidas Int @default(0)
  salarioMin Decimal? @db.Decimal(18,2)
  salarioMax Decimal? @db.Decimal(18,2)
  regimeTrabalho RegimeTrabalho
  tipoContrato TipoContratoTrabalho
  localizacao String?
  requisitos String[]
  status StatusVaga @default(RASCUNHO)
  dataAbertura DateTime?
  dataFecho DateTime?
  responsavelId String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  candidaturas Candidatura[]
  @@unique([tenantId, codigo])
  @@index([tenantId, status])
}

model Candidato {
  id String @id @default(cuid())
  tenantId String
  nome String
  email String
  telefone String
  bi String?
  nuit String?
  cvUrl String?
  linkedinUrl String?
  observacoes String?
  createdAt DateTime @default(now())
  candidaturas Candidatura[]
  @@index([tenantId, email])
}

model Candidatura {
  id String @id @default(cuid())
  tenantId String
  vagaId String
  candidatoId String
  etapa EtapaCandidatura @default(RECEBIDA)
  posicao String @default("0.5") // kanban fraccional
  fonte String? // origem (site, referência, ...)
  pretensaoSalarial Decimal? @db.Decimal(18,2)
  notaTriagem Decimal? @db.Decimal(9,6)
  colaboradorId String? // preenchido na admissão
  motivoRejeicao String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  vaga Vaga @relation(fields: [vagaId], references: [id])
  candidato Candidato @relation(fields: [candidatoId], references: [id])
  entrevistas Entrevista[]
  historico HistoricoCandidatura[]
  @@unique([tenantId, vagaId, candidatoId])
  @@index([tenantId, vagaId, etapa])
}

model Entrevista {
  id String @id @default(cuid())
  tenantId String
  candidaturaId String
  tipo TipoEntrevista
  dataHora DateTime
  entrevistadores String[] // userIds/nomes
  avaliacao Decimal? @db.Decimal(9,6)
  parecer String?
  recomendaAvancar Boolean?
  createdAt DateTime @default(now())
  candidatura Candidatura @relation(fields: [candidaturaId], references: [id], onDelete: Cascade)
  @@index([tenantId, candidaturaId])
}

model HistoricoCandidatura {
  id String @id @default(cuid())
  tenantId String
  candidaturaId String
  etapaAnterior EtapaCandidatura?
  etapaNova EtapaCandidatura
  responsavelId String
  notas String?
  createdAt DateTime @default(now())
  candidatura Candidatura @relation(fields: [candidaturaId], references: [id], onDelete: Cascade)
  @@index([tenantId, candidaturaId, createdAt])
}
```

## Máquinas de estado

```ts
const TRANSICOES_VAGA: Record<StatusVaga, StatusVaga[]> = {
  RASCUNHO: ['ABERTA', 'CANCELADA'],
  ABERTA: ['EM_TRIAGEM', 'FECHADA', 'CANCELADA'],
  EM_TRIAGEM: ['FECHADA', 'CANCELADA', 'ABERTA'],
  FECHADA: [], CANCELADA: [],
};
const TRANSICOES_CANDIDATURA: Record<EtapaCandidatura, EtapaCandidatura[]> = {
  RECEBIDA: ['TRIAGEM', 'REJEITADO', 'DESISTIU'],
  TRIAGEM: ['ENTREVISTA', 'REJEITADO', 'DESISTIU'],
  ENTREVISTA: ['PROPOSTA', 'REJEITADO', 'DESISTIU'],
  PROPOSTA: ['CONTRATADO', 'REJEITADO', 'DESISTIU'],
  CONTRATADO: [], REJEITADO: [], DESISTIU: [],
};
```

## Serviço (`recrutamento.service.ts` — novo)

```ts
VagaService: { criar, actualizar, transitarStatus, listar, obter }
CandidatoService: { criar, actualizar, listar, obter }
CandidaturaService: {
  candidatar,                        // valida vaga ABERTA + unicidade
  moverEtapa,                        // transição + HistoricoCandidatura + auditoria
  moverPosicaoKanban,                // chave fraccional (midpoint string)
  registarEntrevista,
  admitir(candidaturaId, dadosColaborador, ctx) // $transaction:
    //  cria Colaborador ← dados do candidato; candidatura.etapa=CONTRATADO;
    //  vaga.posicoesPreenchidas++ ; fecha vaga se preenchida
}
```

## Validações / Actions / UI

- `src/lib/validations/recrutamento.ts`: `VagaSchema`, `CandidatoSchema`,
  `CandidaturaSchema`, `EntrevistaSchema`, `MoverEtapaSchema`, `AdmitirSchema`
  (reutiliza `validarNUIT`/`validarBI`).
- `src/server/actions/recrutamento.actions.ts` + permissões `rh:recrutamento:*`.
- UI (substitui o `EmptyState`):
  ```
  /rh/recrutamento/                       dashboard + lista de vagas
  /rh/recrutamento/vagas/nova             form
  /rh/recrutamento/vagas/[id]             detalhe + kanban de candidaturas
  /rh/recrutamento/candidaturas/[id]      detalhe + entrevistas + botão Admitir
  ```
  Kanban com posição fraccional (padrão `state-machines.ts` client-safe).

## Riscos e mitigações

- **Admissão atómica:** criação de colaborador + fecho de vaga numa
  `$transaction`; unicidade de `Colaborador` (NUIT/BI/email) validada antes.
- **Concorrência kanban:** posição fraccional string (sem renumeração), à imagem
  de `TarefaProjeto`.
