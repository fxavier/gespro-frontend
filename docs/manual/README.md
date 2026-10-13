# Manual de Utilizador — GestPro

Guia para quem usa o GestPro no dia-a-dia: administradores, gestores, equipa financeira, operadores e
utilizadores de consulta. Explica **para que serve cada módulo**, mostra-o a funcionar com um **exemplo
prático** com valores reais, e descreve **o que cada ecrã faz, como se fazem as tarefas e o que acontece a
seguir noutros módulos**. Os nomes de botões, campos, estados e mensagens são os que aparecem no
produto.

**Autor:** Xavier Francisco Nhagumbe — Engenheiro de Software

> **Versão:** corresponde ao GestPro de 9 de Outubro de 2026. Onde uma função existe mas ainda não
> está completa, o capítulo diz-o numa caixa **Atenção** — preferimos avisar a deixar descobrir.

## Por onde começar

1. [Primeiros passos](00-primeiros-passos.md) — registar a empresa, entrar, conhecer o ecrã, perfis.
2. [Casos práticos](12-casos-praticos.md) — o fluxo completo, ponta-a-ponta, com valores de exemplo.
3. O capítulo do módulo em que trabalha.
4. [Plataforma e administração](11-plataforma-e-administracao.md) — se é administrador.

## Capítulos

| # | Capítulo | Objectivo do módulo, numa frase | Exemplo prático | Quem o usa mais |
|---|---|---|---|---|
| 0 | [Primeiros passos](00-primeiros-passos.md) | Pôr a empresa e as pessoas no sistema, com o acesso certo | O primeiro dia do Sérgio | Todos |
| 1 | [Compras](01-compras.md) | Nenhuma compra sem justificação, aprovação e rasto | Reabastecer cimento e varão | Compras, gestores, operadores |
| 2 | [Fornecedores e serviços](02-fornecedores-e-servicos.md) | Saber a quem se deve e pagar com rasto; vender serviços | Pagar uma conta vencida; vender entregas | Compras, financeiro |
| 3 | [Inventário e activos](03-inventario.md) | O número no ecrã é o número na prateleira | Entradas, quebras, contagem, reposição | Armazém, operadores |
| 4 | [Vendas e POS](04-vendas-e-pos.md) | Vender depressa sem perder controlo fiscal | Balcão, crédito e correcções | Balcão, vendas, financeiro |
| 5 | [Contabilidade](05-contabilidade.md) | Contabilidade sempre em dia e verificável | O fecho do mês; o fecho do ano | Contabilistas, financeiro |
| 6 | [Faturação, caixa e tesouraria](06-faturacao-caixa-tesouraria.md) | Facturar, cobrar, acertar a caixa e prever o dinheiro | Da proposta ao dinheiro no banco | Financeiro, operadores de caixa |
| 7 | [Recursos humanos](07-recursos-humanos.md) | Pagar certo, a tempo e com rasto | O salário de Outubro da Ana | RH, financeiro (payroll) |
| 8 | [Projectos e produção](08-projetos-e-producao.md) | Controlar projectos e o que se fabrica | Nova loja; fabrico de blocos | Gestores de projecto, produção |
| 9 | [Transporte e logística](09-transporte.md) | Entregar com a frota em condições e custo conhecido | Entrega na obra da Machava | Frota, logística |
| 10 | [Suporte e tickets](10-suporte.md) | Nenhum pedido perdido, cada um com prazo | A impressora do POS | Equipa de suporte |
| 11 | [Plataforma e administração](11-plataforma-e-administracao.md) | Governar acessos, auditoria, indicadores e subscrição | Uma nova caixeira e a revisão do mês | Administradores |
| 12 | [Casos práticos — um mês na vida de uma empresa](12-casos-praticos.md) | Ver os módulos encadeados de ponta a ponta | O primeiro mês completo | Todos — formação e implementação |

## A empresa dos exemplos

Todos os exemplos usam a mesma empresa fictícia, para que os números de um módulo se reconheçam nos outros.
Nomes, NUIT e matrículas são inventados; os preços de venda são **sem IVA** (IVA de 16 % somado por linha).

| | |
|---|---|
| Empresa | **Ferragens Boa Obra, Lda** — materiais de construção, Cidade de Maputo · NUIT 400500600 |
| Pessoas | Sérgio Cossa (sócio-gerente, **ADMIN**) · Marta Sitoe (gerente de loja, **GESTOR**) · Carlos Nhantumbo (financeiro, **FINANCEIRO**) · Ana Mabunda (balcão e armazém, **OPERADOR**) · Jorge Mabote (motorista) |
| Armazém | `ARM-01` Armazém Central |
| Banco | BCI (conta à ordem) e carteira M-Pesa da empresa |
| Cliente empresarial | Construções Machava, Lda · NUIT 400300400 · 30 dias · limite 500 000 MT |
| Fornecedor | Cimentos do Índico, SA · NUIT 400100200 · 30 dias |

| SKU | Produto | Compra (MT) | Venda s/ IVA (MT) | Stock mínimo |
|---|---|---:|---:|---:|
| CIM-50 | Cimento Portland 50 kg | 520,00 | 650,00 | 40 |
| VAR-12 | Varão de aço 12 mm (12 m) | 380,00 | 480,00 | 100 |
| TIN-20 | Tinta plástica branca 20 L | 2 900,00 | 3 600,00 | 10 |

Cada exemplo de capítulo é um momento isolado da vida da empresa; o [capítulo 12](12-casos-praticos.md) junta
tudo num mês contínuo, com os saldos a passar de um caso para o seguinte.

## Como ler cada capítulo

Todos seguem a mesma ordem: **Objectivo do módulo** (que problema resolve, quem usa, o que entra e o que
sai, com que módulos se liga) → **Exemplo prático** (a Ferragens Boa Obra a usar o módulo, com valores e
resultado esperado) → **Conceitos** → **Ecrãs** (com o endereço de cada um,
útil quando um ecrã não está no menu) → **Tarefas** passo a passo → **Estados** dos documentos →
**Erros frequentes** (a mensagem que vê, porquê, e o que fazer) → **Perguntas frequentes**.

## Perfis

| Perfil | Em resumo |
|---|---|
| Administrador | Pode tudo, incluindo utilizadores, papéis, subscrição e configurações |
| Gestor | Operação e aprovações; sem configurações sensíveis (plano de contas, fecho de períodos, séries…) |
| Financeiro | Contabilidade, faturação, caixa, payroll e consulta do resto |
| Operador | Armazém, produção, transporte, suporte, POS e caixa |
| Leitura | Só consulta e exportação |

Detalhe em [Primeiros passos › Perfis de sistema](00-primeiros-passos.md). Uma acção sem permissão
mostra «Sem permissão»: fale com o administrador da sua empresa.

## Capturas de ecrã

As imagens em `img/` são geradas automaticamente a partir do produto com dados de demonstração, pelo
script `apps/erp/e2e/manual/capturas.manual.ts` (ver o cabeçalho do script). Quando o produto muda,
regeneram-se — não se editam à mão.

## Versão em PDF

`GestPro-Manual-de-Utilizador.pdf` (nesta pasta) junta todos os capítulos, com as capturas, num único
ficheiro para distribuir a clientes. Gera-se a partir destes Markdown — nunca se edita à mão:

```bash
python3 docs/manual/tools/build_pdf.py   # requer: pip install markdown-it-py playwright pillow && playwright install chromium (pillow é opcional: reduz o PDF; pypdf, também opcional, grava o autor nos metadados)
```
