-- Correcção de dados (#295): a natureza da classe 4 (Terceiros) é conta a conta.
--
-- O plano PGC-NIRF semeado marcava a classe 4 inteira como DEVEDORA, e o
-- `derivarTipoConta` fazia de todas essas contas ATIVO. Os passivos — 421
-- Fornecedores, 44331 IVA liquidado, empréstimos, remunerações a pagar,
-- provisões, acréscimos de gastos — apareciam «contra natureza» no balancete
-- e com o sinal ao contrário nos mapas que assinam o saldo pela natureza.
--
-- Credoras (fonte: prisma/seed/data/plano-contas-pgc.json): 419, 42 (excepto
-- 429), 43, 442, 4433, 44342, 4436, 449, 46, 47, 48, 491, 492 e as suas filhas.
-- O resto fica DEVEDORA — as ambíguas 441, 4435, 445 e 446 inclusive.
--
-- Só toca nos códigos canónicos do plano: uma subconta criada pelo utilizador
-- (ex.: 42199) mantém o que tem, porque a natureza dela foi uma escolha dele.
-- Idempotente: a segunda corrida não encontra linhas.
--
-- Precedente: 20260918003041_natureza_gastos_rendimentos (classes 6/7).
UPDATE "ContaPGC"
SET natureza = 'CREDORA', tipo = 'PASSIVO'
WHERE classe = 'CLASSE_4'
  AND (natureza <> 'CREDORA' OR tipo <> 'PASSIVO')
  AND codigo IN (
  '419', '42', '421', '422', '43', '431', '4311', '4312', '432', '4321', '4322', '433',
  '439', '442', '4421', '4422', '4423', '4424', '4425', '4433', '44331', '44332', '44333', '44342',
  '4436', '449', '46', '461', '4611', '4612', '4613', '4614', '4619', '462', '4621', '4622',
  '4623', '4628', '4629', '463', '464', '465', '466', '467', '4671', '4673', '4674', '469',
  '47', '471', '472', '48', '481', '482', '483', '484', '485', '486', '487', '489',
  '491', '4911', '4912', '4919', '492', '4921', '4922', '4923', '4924', '4929'
  );
