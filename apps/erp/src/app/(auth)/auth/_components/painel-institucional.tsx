/**
 * Painel imersivo dos ecrãs de autenticação.
 *
 * Escuro nos DOIS temas: a classe `dark` redefine aqui os tokens de marca, por
 * isso não há uma cor literal em lado nenhum — o painel é escuro porque usa a
 * paleta escura, não porque alguém lhe escreveu um azul-marinho.
 *
 * O que diz é verificável no produto: os módulos são os grupos do menu lateral
 * e as garantias são regras do código (isolamento por tenant, trilho de
 * auditoria, plano PGC-NIRF, numeração por série). Não há valores monetários,
 * testemunhos, percentagens de disponibilidade nem selos de conformidade — não
 * há produção para os sustentar (ADR-0026 §5), e um número inventado num ecrã
 * de login é a pior primeira impressão possível. Já lá esteve um cartão de
 * «faturação consolidada» com um montante de exemplo; saiu por isso mesmo.
 *
 * Escondido abaixo de `lg`: no telemóvel o que interessa é o formulário.
 */

import {
  Building,
  Factory,
  FolderKanban,
  Landmark,
  PackageSearch,
  ShoppingCart,
  Truck,
  Users,
} from 'lucide-react';

/** Os módulos, pela ordem e com os ícones do menu lateral (`AppSidebar`). */
const MODULOS = [
  { icone: ShoppingCart, titulo: 'Vendas & POS', descricao: 'Encomendas, terminal, facturas e notas' },
  { icone: Landmark, titulo: 'Finanças & Contabilidade', descricao: 'PGC-NIRF, IVA, caixa e tesouraria' },
  { icone: PackageSearch, titulo: 'Compras & Procurement', descricao: 'Requisições, cotações e pedidos' },
  { icone: Building, titulo: 'Fornecedores', descricao: 'Contas a pagar, serviços e contratos' },
  { icone: Factory, titulo: 'Inventário & Activos', descricao: 'Stock, contagens e amortização' },
  { icone: Users, titulo: 'Recursos Humanos', descricao: 'Colaboradores, férias e payroll' },
  { icone: FolderKanban, titulo: 'Projectos', descricao: 'Tarefas, marcos e timesheets' },
  { icone: Truck, titulo: 'Transporte & Logística', descricao: 'Viaturas, rotas e entregas' },
];

/** Regras do produto que o código impõe — não promessas. */
const GARANTIAS = [
  'Cada empresa num tenant isolado, com os seus utilizadores e papéis.',
  'Partida dobrada sobre o PGC-NIRF (Decreto 70/2009); IVA, INSS e IRPS pelas tabelas em vigor.',
  'Documentos numerados por série, sem lacunas, com trilho de auditoria.',
];

export function PainelInstitucional() {
  return (
    <aside className="dark relative hidden overflow-hidden bg-background p-10 text-foreground lg:col-span-5 lg:flex lg:flex-col lg:justify-between">
      {/* Halos de fundo — cor de marca, opacidade baixa, sem literais. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-primary/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-24 size-80 rounded-full bg-info/10 blur-3xl"
      />

      <div className="relative z-10">
        <span className="rounded-full bg-foreground/10 px-3 py-1 text-xs font-medium">
          ERP para empresas moçambicanas
        </span>
      </div>

      <div className="relative z-10 my-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Tudo o que a empresa faz, num só sistema</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Da venda ao fecho do exercício, cada módulo escreve na mesma contabilidade.
          </p>
        </div>

        <ul className="grid grid-cols-2 gap-2" aria-label="Módulos do GestPro">
          {MODULOS.map(({ icone: Icone, titulo, descricao }) => (
            <li key={titulo} className="rounded-lg bg-foreground/5 px-3 py-2.5">
              <Icone className="mb-1 size-4 text-primary" aria-hidden="true" />
              <p className="text-sm font-medium leading-tight">{titulo}</p>
              <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{descricao}</p>
            </li>
          ))}
        </ul>

        <ul className="space-y-1.5 rounded-xl bg-foreground/5 p-4 text-xs leading-relaxed text-muted-foreground">
          {GARANTIAS.map((texto) => (
            <li key={texto} className="flex gap-2">
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>{texto}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="relative z-10 text-xs text-muted-foreground">
        GestPro · gestão empresarial multi-empresa
      </p>
    </aside>
  );
}
