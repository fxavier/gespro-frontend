# ADR-0030 — A palavra-passe inicial é atribuída pelo ERP

**Estado:** Proposto
**Data:** 2026-09-14
**Substitui:** ADR-0029 §5 (o primeiro acesso e a reposição deixam de acontecer no ecrã do Keycloak)
**Depende de:** ADR-0010, ADR-0013 (§2, §5-bis), ADR-0029

## Contexto

O ADR-0013 §5-bis criou os utilizadores **sem credencial**: identidade no Keycloak com
`VERIFY_EMAIL` e `UPDATE_PASSWORD` pendentes, e um e-mail de acções a dar entrada no produto.
O ADR-0029 §5 registou a costura que isso deixa — «a UI fica meia nossa, meia dele» — e
antecipou este momento: *«Se a costura incomodar, é um ADR próprio.»*

Incomoda, e por uma razão que não é estética. O convite por e-mail pressupõe **e-mail a
funcionar e a chegar**. Numa PME moçambicana o administrativo que entra na segunda-feira
recebe as credenciais do colega ao lado; o domínio da empresa pode nem ter correio
configurado, e uma mensagem de um sistema novo tem tanta probabilidade de acabar em spam
como na caixa de entrada. Enquanto a única porta de entrada for um link enviado por e-mail,
há tenants onde ninguém entra.

O nó técnico é o ADR-0029. Com *Direct Access Grant*, o Keycloak **recusa** emitir tokens a
uma conta com acções obrigatórias pendentes. Uma palavra-passe temporária, por si só, tranca
a pessoa do lado de fora: acerta a palavra-passe e recebe «conta por activar», sem nenhum
ecrã onde a possa mudar. **Atribuir a palavra-passe obriga a decidir onde é que ela se muda.**

Verificado contra o Keycloak 26.7 antes de decidir:

| Comportamento | Resultado |
|---|---|
| `reset-password` com `temporary: true` | acrescenta `UPDATE_PASSWORD` às acções obrigatórias |
| `reset-password` com `temporary: false` | **remove** `UPDATE_PASSWORD`; o *direct grant* passa a funcionar de imediato |
| *Direct grant*, palavra-passe certa, acção pendente | `invalid_grant` · `Account is not fully set up` |
| *Direct grant*, palavra-passe errada | `invalid_grant` · `Invalid user credentials` |

A última linha é a que sustenta o desenho: o Keycloak **distingue** as duas recusas, portanto
«conta por activar» é prova de que a palavra-passe está certa.

## Decisão

**1. O administrador escolhe como se entra.** O formulário de criação passa a ter dois modos:
*convite por e-mail* (o de hoje, que se mantém por omissão) e *definir palavra-passe agora*.
Nada do que existe se perde — acrescenta-se o caminho para quem não pode contar com o e-mail.

**2. A palavra-passe inicial é gerada pelo sistema e mostrada uma vez.** O ERP gera-a com
`crypto.randomInt`, mostra-a ao administrador imediatamente a seguir a criar o utilizador, e
nunca mais a mostra. Não é escrita em Postgres, não entra em nenhum log, não volta em nenhuma
leitura. Quem a perder repõe-na — que é uma operação, não uma consulta.

A alternativa — o administrador escrever a palavra-passe — foi recusada por conhecimento do
terreno: dá invariavelmente a mesma palavra-passe a toda a gente.

**3. A conta nasce com `emailVerified: true` e só `UPDATE_PASSWORD` pendente.** Quando o
administrador define a palavra-passe, é ele quem responde pelo endereço: manter `VERIFY_EMAIL`
pendente reintroduziria a dependência do e-mail que este ADR existe para remover, e trancaria
a conta à mesma. No modo *convite* nada muda: continuam as duas acções e o e-mail do Keycloak.

**4. A mudança acontece num ecrã nosso.** `/auth/mudar-palavra-passe`, com o mesmo aspecto do
login. O `/auth/login` reconhece a recusa «conta por activar» e encaminha para lá em vez de
mostrar um beco sem saída.

**5. A prova de identidade é a própria palavra-passe actual, revalidada no Keycloak.** O
formulário pede a actual, a nova e a confirmação — como qualquer mudança de palavra-passe. O
servidor chama o *direct grant* com a actual e só aceita `ok` **ou** `conta-por-activar`; o
Keycloak continua a ser quem valida credenciais. Só então escreve a nova, com
`temporary: false`, o que limpa a acção obrigatória e devolve a conta ao normal.

Não se inventa token de passagem, nem cookie de meio-caminho, nem estado de sessão parcial:
não há nada para expirar, nada para revogar, e nada que se possa roubar entre os dois passos.

**6. O mesmo mecanismo serve a reposição.** «Repor palavra-passe» na ficha do utilizador gera
uma nova temporária e devolve-a uma vez ao administrador. É o caso real de quem se esquece — e
reutiliza inteiramente o caminho acima.

## O que isto custa

**O ERP passa a escrever credenciais pela Admin API.** É exactamente o que o ADR-0010 quis
tirar de cima, e não se finge o contrário. A diferença face ao que o ADR-0010 recusou é o que
fica: **o ERP nunca guarda, nem verifica, palavras-passe.** Não há hash em Postgres, não há
comparação nossa, não há política nossa de expiração. O Keycloak continua a ser o único
depósito e o único verificador; o ERP tornou-se um cliente com mais uma operação de escrita.

Herdado do ADR-0029 e agravado: o ERP vê a palavra-passe em claro em mais um caminho (a
mudança, além do login). Vale o que valia — nunca sai do processo, nunca é registada — e a
mitigação é a mesma: limitação de tráfego e HTTPS.

**Continua a não haver política de força do lado do Keycloak.** O realm não define
`passwordPolicy`; o gate efectivo é o schema Zod do nosso formulário (mínimo 10 caracteres).
Uma palavra-passe definida por outra via — a consola de administração do Keycloak — escapa-lhe.
Fica registado como dívida: a política pertence ao realm, e o realm não a tem.

**Alternativas consideradas:**

| Opção | Prós | Contras |
|---|---|---|
| **Ecrã nosso + `reset-password`** ✅ | Sem salto de domínio; coerente com o ADR-0029; serve o primeiro acesso e a reposição | O ERP escreve credenciais; vê a palavra-passe em mais um caminho |
| Manter só o convite por e-mail (ADR-0013 §5-bis) | Zero código; o ERP nunca toca em credenciais | Tenants sem e-mail fiável ficam sem entrar — o problema que originou o pedido |
| Palavra-passe do administrador + ecrã `UPDATE_PASSWORD` do Keycloak | Reaproveita o tema do ADR-0028; o ERP não escreve credenciais | Devolve o salto de domínio que o ADR-0029 eliminou |
| Ticket assinado de passagem em vez de revalidar a palavra-passe | Um só pedido ao Keycloak | Formato, expiração e revogação a inventar — estado novo para proteger, sem ganho |

## Consequências

- **`src/server/auth/keycloak.ts`** ganha `definirPalavraPasse(sub, valor, { temporaria })`; o
  `garantirUtilizador` passa a aceitar as acções obrigatórias e o `emailVerified` de quem chama.
- **`criarUtilizador`** ramifica em dois modos e devolve a palavra-passe gerada **uma única
  vez**, fora do modelo persistido.
- **`/auth/mudar-palavra-passe`** é a primeira acção de servidor **sem sessão** fora do
  `createSafeAction` — que exige `auth()`. Leva limitação de tráfego própria, pelas mesmas
  chaves do login (ADR-0014).
- **O ADR-0028 mantém-se de pé**, mas encolhe: o tema do Keycloak continua a servir a
  recuperação por e-mail iniciada pelo próprio utilizador — deixa de servir o primeiro acesso.
- **O ADR-0029 §5 deixa de vigorar.** A UI deixa de ser meia nossa: o que resta do lado do
  Keycloak é a recuperação por auto-serviço.
