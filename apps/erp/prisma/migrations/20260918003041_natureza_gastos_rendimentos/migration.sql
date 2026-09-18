-- Correcção de dados: a natureza das classes 6 e 7 estava trocada.
--
-- O plano PGC-NIRF semeado marcava as 145 contas de GASTO como `CREDORA` e as
-- 87 de RENDIMENTO como `DEVEDORA` — o inverso do que a partida dobrada exige
-- (gasta-se a débito, ganha-se a crédito). O `montarLinhasBalancete` usa a
-- natureza para dar sinal ao saldo, por isso o balancete mostrava a receita em
-- negativo e os gastos em positivo; a DRE herdava o mesmo erro. O teste
-- `balancete.test.ts` já assumia o correcto («7.1» CREDORA) — era o ficheiro de
-- dados que discordava do código.
--
-- `tipo` não muda: `derivarTipoConta` decide GASTO/RENDIMENTO pela classe, não
-- pela natureza. Só o sinal do saldo é afectado.
--
-- Não toca na classe 4 (Terceiros), que tem contas das duas naturezas — os
-- fornecedores e o IVA liquidado são credores e estão marcados devedores. Essa
-- correcção é conta a conta e fica por fazer.
UPDATE "ContaPGC" SET natureza = 'DEVEDORA' WHERE classe = 'CLASSE_6' AND natureza <> 'DEVEDORA';
UPDATE "ContaPGC" SET natureza = 'CREDORA'  WHERE classe = 'CLASSE_7' AND natureza <> 'CREDORA';
