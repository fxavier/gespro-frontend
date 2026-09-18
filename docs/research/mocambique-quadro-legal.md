# Quadro legal moçambicano aplicável a um ERP SaaS — apuramento primário

> **Este documento corrige [`acesso-suporte-b2b.md`](./acesso-suporte-b2b.md).** Aquele citou o
> Código Comercial de 2005 sem verificar que fora revogado. Onde os dois discordem, **vale este**.
>
> **Estado de verificação:** nada aqui está conferido por mim contra o *Boletim da República*.
> É trabalho de um segundo agente de investigação que leu textos primários e que, em vários
> pontos, corrigiu o primeiro. Traz uma tabela própria de 15 conflitos e incertezas. Tratar como
> a melhor leitura disponível, **não** como parecer. Ver [#55](https://github.com/fxavier/gespro-frontend/issues/55).

## As quatro correcções ao documento anterior

| O que ficou escrito | O que se apurou depois |
|---|---|
| «Código Comercial art. 52.1 — **dez anos** a contar do último lançamento» | O **Decreto-Lei n.º 1/2022, de 25 de Maio**, art. 7 n.º 1, **revogou os artigos 1 a 476** do Código de 2005. O art. 52.º já não existe. O Código vigente **não tem prazo geral de conservação** |
| «art. 48 — autorização presumida ao terceiro que faz a escrituração; a melhor âncora legal para o acesso do fornecedor» | **Não existe equivalente no Código de 2022.** A âncora que eu tinha por mais forte **desapareceu** |
| «art. 49.3 — correcção por estorno; a regra append-only é literalmente a lei» | Do código revogado. **Não verificado** no texto vigente |
| «art. 54 — escrituração secreta» · «art. 55 — exame na presença do empresário» | **Mantém-se, com outra numeração:** é o **art. 35** do Código de 2022, que condensou os antigos 54.º a 57.º |

**O prazo de dez anos subsiste — mas a base legal é fiscal, não comercial:** CIRPC art. 75 n.º 5,
Regulamento do CIRPC art. 46 n.º 1, Regulamento do CIVA art. 54, Código do IRPS art. 105 n.º 2.

## O art. 35 do Código Comercial de 2022 — o texto que importa

> 1. A escrituração empresarial **é secreta**, sem prejuízo do disposto nos números seguintes […]
> 2. A exibição ou exame […] só pode decretar-se **judicialmente** […]
> 3. O exame […] ocorre, **na sua presença**, no seu domicílio profissional, sede, estabelecimento
>    empresarial deste ou no tribunal e é **limitado à averiguação e extracção dos elementos que
>    tenham relação com a questão**.

A conclusão de fundo do documento anterior **mantém-se e sai reforçada**: o direito moçambicano
desenhou um modelo de acesso presencial, judicialmente autorizado e de âmbito mínimo. É o inverso
do acesso de suporte remoto e discricionário.

## O que é novo, e muda o desenho

### Territorialidade da escrita — existe, e o documento anterior não a encontrou

O Regulamento do CIRPC (**Decreto n.º 9/2008**) art. 42 n.º 1 e art. 46 n.º 2, e o Código do IRPS
art. 105 n.º 1, exigem **centralizar a contabilidade e o processo de documentação fiscal em
estabelecimento ou instalação situado em território moçambicano**, declarado à Autoridade
Tributária. O Regulamento do CIVA art. 55 n.º 3 exige que seja o mesmo estabelecimento.

**A norma fala de *estabelecimento*, não de *servidores*.** Não se encontrou norma que proíba
alojar dados contabilísticos fora de Moçambique, nem que o autorize. Combinada com o poder da AT
de *«aceder, consultar e testar o sistema informático»* (Lei Geral Tributária art. 102 n.º 2 al. d),
a leitura prudente é que a escrita tem de ser **integralmente acessível e reproduzível no
estabelecimento moçambicano declarado**, durante todo o prazo de conservação.

**Consequência directa para o ADR-0026** (escolha de fornecedor de infraestrutura, adiada): a
latência para Moçambique já estava na grelha de avaliação. Isto acrescenta-lhe uma dimensão
jurídica que não estava lá.

### Localização obrigatória — existe, em três bolsas estreitas

Telecomunicações (Decreto 13/2023 art. 28 n.º 2) · centros de dados primários de **operadores de
serviços essenciais**, incluindo o sector financeiro (Decreto 71/2025 art. 22 n.º 3) · **segredo de
Estado** (art. 25). **Uma empresa comercial comum não está abrangida.** Para o resto, o regulador
exige **divulgar** onde estão as bases de dados — contemplando expressamente «no estrangeiro».

### Registo e licenciamento obrigatórios — e uma taxa sobre a receita

**Decreto n.º 59/2023, de 27 de Outubro**, alterado pelo **Decreto n.º 44/2025**: registo e licença
para provedores intermediários de serviços electrónicos e operadores de plataformas digitais.
Aplica-se a quem serve destinatários em Moçambique **independentemente do lugar de estabelecimento**.

- Licença válida **5 anos**, registo como pré-requisito.
- **Taxa anual de 1% da receita operacional bruta.**
- **Isenção para startups** com capital social até 50.000 MT e facturação anual até 2.500.000 MT.
- Sanções até cancelamento da licença.

A definição de «provedor intermediário» no glossário da Lei 3/2017 abrange expressamente
**provedores de aplicativos e provedores de hospedagem** — um ERP SaaS cai lá dentro.

### Cibersegurança — entra em vigor a 29 de Setembro de 2026

**Lei n.º 13/2026** (Segurança Cibernética) e **Lei n.º 14/2026** (Crimes Cibernéticos), ambas de
1 de Julho de 2026. Âmbito inclui provedores de serviços digitais e operadores de plataformas
digitais: CSIRT institucional registado, política de segurança da informação, auditoria interna,
e **notificação de incidentes**. Coimas de 80 a 100 salários mínimos pela falta de notificação.

⚠️ A Lei n.º 8/2020 **não** é de cibersegurança — ratifica a terceira prorrogação do estado de
emergência da COVID-19. Não citar.

### Protecção de dados — o que está em vigor, e o que não está

**Não há lei geral em vigor.** A Proposta de Lei foi aprovada em Conselho de Ministros a **3 de
Março de 2026** e está na Assembleia da República. **Não há autoridade de protecção de dados.**

O regime efectivo é a **Lei n.º 3/2017** (Transacções Electrónicas): arts. 63-65 (obrigações do
processador, incluindo o **art. 65 n.º 3**, que responsabiliza pelo que é transferido a terceiros)
e arts. 14-18 (sigilo do provedor intermediário). Mais o **art. 71 da Constituição**, de que o
art. 64 da Lei 3/2017 é decalque literal.

**A Convenção de Malabo vincula.** Moçambique assinou (29/6/2018), ratificou (2/12/2019) e
depositou (21/1/2020) — confirmado na lista oficial da União Africana. Pelo art. 18 da Constituição,
integra o direito interno. O seu art. 14 n.º 6 exige nível adequado de protecção no destino de
transferências — **mas falta a autoridade nacional que a Convenção pressupõe** para autorizar
derrogações. Norma vinculativa e praticamente inexequível.

## Os artigos que continuam a valer para a pergunta do #55

O **art. 64 da Lei 3/2017** — a pergunta central para o advogado — **mantém-se intacto e verificado**:

> «Não é permitido o acesso a arquivos, ficheiros e registos informáticos ou de bancos de dados
> para conhecimento de dados pessoais relativos à terceiros […] salvo nos casos estabelecidos por
> diploma legal ou por decisão judicial.»

O consentimento continua a não estar entre as excepções. A Lei 3/2017 só exige consentimento em
marketing directo (art. 40). **Não há regime de bases de licitude no direito moçambicano em vigor.**

## O que continua por saber

O próprio documento de origem lista 15 conflitos e incertezas. Os que mais pesam:

- O **articulado promulgado** do Decreto 59/2023 e da alteração de 2025 — foi lido o anteprojecto;
  o âmbito, a licença de 5 anos, a taxa de 1% e as sanções vêm de uma FAQ oficial do INTIC de
  Janeiro de 2026.
- O articulado do Decreto 72/2025 além dos arts. 1-6.
- Os textos da Lei n.º 12/2025 (IRPC) e da Lei n.º 10/2025 (IVA), e o novo Estatuto da OCAM.
- Se a obrigação de centralizar em «estabelecimento» abrange ou não alojamento em nuvem estrangeira.
  **É a pergunta que mais afecta a arquitectura, e não se resolve com mais leitura.**
