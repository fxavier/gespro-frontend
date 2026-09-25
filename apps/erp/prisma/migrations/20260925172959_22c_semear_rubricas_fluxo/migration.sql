-- 22c_semear_rubricas_fluxo (ADR-0037 §3, E1; ticket 4.3). Só dados: dá aos tenants que já existem
-- as rubricas SISTEMA, o mapeamento das folhas do PGC padrão e a versão 1 PENDING. Espelho de
-- prisma/seed/data/rubricas-fluxo-caixa.json (tenant-bootstrap.ts: semearRubricasFluxo) — alterar um é alterar os dois.
-- Idempotente pelos @@unique da 22b.

-- 1. Rubricas SISTEMA, por tenant com plano de contas.
INSERT INTO "RubricaFluxoCaixa"
  ("id", "tenantId", "codigo", "designacao", "atividade", "sinal", "ordem", "origem", "ativo", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", r.codigo, r.designacao,
       r.atividade::"AtividadeFluxo", r.sinal::"SinalFluxo", r.ordem, 'SISTEMA'::"OrigemRubrica", true, now(), now()
FROM "Tenant" t
CROSS JOIN (VALUES
  ('CX-01', 'Caixa e equivalentes de caixa', 'CAIXA', 'VARIACAO', 1),
  ('OP-00', 'Contas de resultados (incluídas no resultado líquido)', 'OPERACIONAL', 'VARIACAO', 0),
  ('OP-01', 'Amortizações e depreciações', 'OPERACIONAL', 'VARIACAO', 1),
  ('OP-02', 'Imparidades, ajustamentos e provisões', 'OPERACIONAL', 'VARIACAO', 2),
  ('OP-03', 'Variação de inventários e activos biológicos', 'OPERACIONAL', 'VARIACAO', 3),
  ('OP-04', 'Variação de clientes', 'OPERACIONAL', 'VARIACAO', 4),
  ('OP-05', 'Variação de fornecedores', 'OPERACIONAL', 'VARIACAO', 5),
  ('OP-06', 'Variação do Estado e outros entes públicos', 'OPERACIONAL', 'VARIACAO', 6),
  ('OP-07', 'Imposto sobre o rendimento', 'OPERACIONAL', 'VARIACAO', 7),
  ('OP-08', 'Variação de pessoal', 'OPERACIONAL', 'VARIACAO', 8),
  ('OP-09', 'Variação de outros devedores e credores', 'OPERACIONAL', 'VARIACAO', 9),
  ('OP-10', 'Variação de acréscimos e diferimentos', 'OPERACIONAL', 'VARIACAO', 10),
  ('INV-01', 'Activos tangíveis e investimentos em curso', 'INVESTIMENTO', 'VARIACAO', 1),
  ('INV-02', 'Activos intangíveis', 'INVESTIMENTO', 'VARIACAO', 2),
  ('INV-03', 'Investimentos financeiros e empréstimos concedidos', 'INVESTIMENTO', 'VARIACAO', 3),
  ('INV-04', 'Subsídios ao investimento', 'INVESTIMENTO', 'VARIACAO', 4),
  ('FIN-01', 'Financiamentos obtidos', 'FINANCIAMENTO', 'VARIACAO', 1),
  ('FIN-02', 'Capital próprio e reservas', 'FINANCIAMENTO', 'VARIACAO', 2),
  ('FIN-03', 'Dividendos e outras operações com sócios', 'FINANCIAMENTO', 'VARIACAO', 3)
) AS r(codigo, designacao, atividade, sinal, ordem)
WHERE EXISTS (SELECT 1 FROM "ContaPGC" c WHERE c."tenantId" = t."id" AND c."aceitaLancamento" AND c."ativo")
ON CONFLICT ("tenantId", "codigo") DO NOTHING;

-- 2. Mapeamento conta folha → rubrica (uma linha por folha activa do plano do
--    tenant; conta ausente do plano fica sem linha, nunca uma conta inventada).
INSERT INTO "MapeamentoContaFluxo" ("id", "tenantId", "contaId", "rubricaId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."tenantId", c."id", r."id", now(), now()
FROM (VALUES
  ('CX-01', ARRAY['111','121','122','123']),
  ('OP-00', ARRAY['611','6112','6116','61161','61162','61163','6117','612','6121','6122','6123','621','622','623','624','625','6251','6252','626','6261','6262','627','628','629','631','632','63211','63212','63213','632131','6321311','6321312','632132','6321321','6321322','632133','6321331','6321332','63214','63215','632151','632152','63216','63217','63218','63221','63222','63223','63224','63225','63226','63227','632271','632272','63228','632281','632282','63229','63231','63232','632321','63233','632331','63234','63235','63236','63237','63299','641','642','643','644','645','646','647','648','6481','6482','651','652','653','654','661','662','663','664','665','666','667','669','671','672','673','681','682','6821','6822','6823','6824','6825','683','6831','6832','6833','684','6841','6842','6849','689','6891','6892','6893','6894','6895','68951','68952','6896','6899','691','6911','6912','6913','6914','6915','6916','69161','69162','6919','694','6941','6942','695','698','6981','6989','711','712','713','714','715','716','717','721','726','731','732','733','734','741','7411','7412','7413','7414','7415','7416','7417','7418','742','7421','7422','7423','7424','743','7431','7432','7433','7434','7435','7436','7437','7439','751','752','753','754','755','756','757','759','761','7611','7619','762','7621','7629','763','7631','7632','764','7641','7642','7649','769','7691','7692','7693','7699','781','7811','7812','7813','7814','7819','782','783','784','7841','7842','785','789','791','792','793']),
  ('OP-01', ARRAY['382','383','386','387']),
  ('OP-02', ARRAY['292','293','294','295','296','297','391','392','393','395','396','397','471','472','481','482','483','484','485','486','487','489']),
  ('OP-03', ARRAY['211','212','2121','2122','2123','21231','21232','21233','21239','217','218','221','222','231','241','242','261','262','263','2631','2632','2633','2639','264','271','2711','2712','272','2721','2722','282','283','284','285','286','287']),
  ('OP-04', ARRAY['411','412','418','419']),
  ('OP-05', ARRAY['421','422','429']),
  ('OP-06', ARRAY['442','4421','4422','4423','4424','4425','443','4431','44311','44312','44313','4432','44321','44322','44323','4433','44331','44332','44333','4434','44341','44342','44343','4435','4436','4437','4438','4439','444','4441','4442','445','449']),
  ('OP-07', ARRAY['441','4411','4412','4413','446','4461','4462','851','852']),
  ('OP-08', ARRAY['451','4511','4512','4513','4518','4519','462','4621','4622','4623','4628','4629','463']),
  ('OP-09', ARRAY['455','4551','4552','459','466','469']),
  ('OP-10', ARRAY['491','4911','4912','4919','492','4923','4929','493','4931','4933','4939','494','4949']),
  ('INV-01', ARRAY['321','3211','3212','3213','3216','322','323','324','325','326','327','329','342','461','4611','4612','4613','4619']),
  ('INV-02', ARRAY['331','332','333','334','343']),
  ('INV-03', ARRAY['131','132','133','311','312','313','314','315','316','4541','464']),
  ('INV-04', ARRAY['4924']),
  ('FIN-01', ARRAY['431','4311','4312','432','4321','4322','433','439','453','4614','465','4671','4921','4922','4941','4942']),
  ('FIN-02', ARRAY['452','4521','4522','4529','521','522','551','552','553','561','5611','5612','562','581','582','589']),
  ('FIN-03', ARRAY['454','4542','4543','4544','4549','467','4673','4674'])
) AS m(rubrica, contas)
CROSS JOIN LATERAL unnest(m.contas) AS conta(codigo)
JOIN "ContaPGC" c
  ON c."codigo" = conta.codigo AND c."aceitaLancamento" AND c."ativo"
JOIN "RubricaFluxoCaixa" r
  ON r."tenantId" = c."tenantId" AND r."codigo" = m.rubrica AND r."deletedAt" IS NULL
ON CONFLICT ("tenantId", "contaId") DO NOTHING;

-- 3. Versão 1 PENDING com o instantâneo do mapeamento vivo (V1), na forma
--    canónica de instantaneoDe (rubricas por codigo, mapeamentos por contaId;
--    ordem por ponto de código = COLLATE "C"). Só para tenants sem versão.
INSERT INTO "VersaoMapeamentoFluxo" ("id", "tenantId", "numero", "estado", "instantaneo", "createdAt")
SELECT gen_random_uuid()::text, t."id", 1, 'PENDING'::"EstadoVersaoMapeamento",
  jsonb_build_object(
    'rubricas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', r."id", 'codigo', r."codigo", 'designacao', r."designacao",
               'atividade', r."atividade", 'sinal', r."sinal", 'ordem', r."ordem",
               'origem', r."origem", 'ativo', r."ativo")
             ORDER BY r."codigo" COLLATE "C", r."id" COLLATE "C")
      FROM "RubricaFluxoCaixa" r WHERE r."tenantId" = t."id" AND r."deletedAt" IS NULL), '[]'::jsonb),
    'mapeamentos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('contaId', m."contaId", 'rubricaId', m."rubricaId")
             ORDER BY m."contaId" COLLATE "C", m."rubricaId" COLLATE "C")
      FROM "MapeamentoContaFluxo" m WHERE m."tenantId" = t."id"), '[]'::jsonb)
  ),
  now()
FROM "Tenant" t
WHERE EXISTS (SELECT 1 FROM "ContaPGC" c WHERE c."tenantId" = t."id" AND c."aceitaLancamento" AND c."ativo")
  AND NOT EXISTS (SELECT 1 FROM "VersaoMapeamentoFluxo" v WHERE v."tenantId" = t."id")
ON CONFLICT ("tenantId", "numero") DO NOTHING;
