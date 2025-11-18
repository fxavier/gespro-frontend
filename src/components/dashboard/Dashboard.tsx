
'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { SYSTEM_MODULES } from '@/data/system-modules';
import { 
  Building2, 
  Users, 
  ShoppingCart, 
  FileText, 
  TrendingUp, 
  Settings,
  LogOut
} from 'lucide-react';

export default function Dashboard() {
  const { tenant, usuario, logout } = useAuth();

  const estatisticas = [
    {
      titulo: 'Vendas do Mês',
      valor: 'MT 125.430,00',
      icone: TrendingUp,
      cor: 'text-green-600'
    },
    {
      titulo: 'Produtos em Stock',
      valor: '1.247',
      icone: ShoppingCart,
      cor: 'text-blue-600'
    },
    {
      titulo: 'Faturas Emitidas',
      valor: '89',
      icone: FileText,
      cor: 'text-purple-600'
    },
    {
      titulo: 'Clientes Ativos',
      valor: '156',
      icone: Users,
      cor: 'text-orange-600'
    }
  ];

  const accoesRapidas = [
    { titulo: 'Nova Venda', descricao: 'Registrar uma nova venda', icone: ShoppingCart },
    { titulo: 'Emitir Fatura', descricao: 'Criar nova fatura', icone: FileText },
    { titulo: 'Gestão de Stock', descricao: 'Gerir produtos e inventário', icone: Building2 },
    { titulo: 'Configurações', descricao: 'Configurar sistema', icone: Settings }
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Cabeçalho */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Building2 className="h-8 w-8 text-blue-600" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                  {tenant?.nomeEmpresa}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  NUIT: {tenant?.nuit}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {usuario?.nome}
                </p>
                <div className="flex items-center space-x-2">
                  <Badge variant="secondary" className="text-xs">
                    {usuario?.funcao}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {tenant?.planoAssinatura}
                  </Badge>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={logout}>
                <LogOut className="h-4 w-4 mr-2" />
                Sair
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="container mx-auto px-4 py-8">
        {/* Boas-vindas */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Bem-vindo, {usuario?.nome}!
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Aqui está um resumo da atividade da sua empresa hoje.
          </p>
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {estatisticas.map((stat, index) => (
            <Card key={index}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                      {stat.titulo}
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                      {stat.valor}
                    </p>
                  </div>
                  <stat.icone className={`h-8 w-8 ${stat.cor}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Ações Rápidas */}
        <Card>
          <CardHeader>
            <CardTitle>Ações Rápidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {accoesRapidas.map((acao, index) => (
                <Button
                  key={index}
                  variant="outline"
                  className="h-auto p-4 flex flex-col items-center space-y-2"
                >
                  <acao.icone className="h-6 w-6" />
                  <div className="text-center">
                    <p className="font-medium">{acao.titulo}</p>
                    <p className="text-xs text-gray-500">{acao.descricao}</p>
                  </div>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Atividade Recente */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Vendas Recentes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[1, 2, 3].map((item) => (
                  <div key={item} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div>
                      <p className="font-medium">Venda #{item.toString().padStart(3, '0')}</p>
                      <p className="text-sm text-gray-500">Cliente: João Silva</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">MT 2.450,00</p>
                      <p className="text-xs text-gray-500">Hoje, 14:30</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Produtos em Baixo Stock</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { nome: 'Arroz Branco 25kg', stock: 5, minimo: 10 },
                  { nome: 'Óleo de Cozinha 1L', stock: 8, minimo: 15 },
                  { nome: 'Açúcar Cristal 1kg', stock: 12, minimo: 20 }
                ].map((produto, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <div>
                      <p className="font-medium">{produto.nome}</p>
                      <p className="text-sm text-gray-500">Mínimo: {produto.minimo} unidades</p>
                    </div>
                    <Badge variant="destructive">
                      {produto.stock} restantes
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Módulos do Sistema */}
        <section className="mt-12 space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Bounded Contexts &amp; Módulos
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Mapeamento dos modelos TypeScript e módulos Spring Modulith com acesso rápido aos dashboards.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {SYSTEM_MODULES.map((module) => {
              const Icon = module.icon;
              return (
                <Card key={module.id} className="flex flex-col">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`${module.accentColor} rounded-xl p-2 text-white`}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{module.title}</CardTitle>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {module.springModule}
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {module.typescriptModels.length} modelos
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {module.description}
                    </p>
                    <div className="mt-4">
                      <p className="text-xs font-semibold text-gray-500 uppercase dark:text-gray-400">
                        Modelos TypeScript
                      </p>
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {module.typescriptModels.join(', ')}
                      </p>
                    </div>
                    <ul className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                      {module.responsibilities.map((responsibility) => (
                        <li key={responsibility} className="flex items-start space-x-2">
                          <span className="mt-1 h-2 w-2 rounded-full bg-blue-500 dark:bg-blue-400" />
                          <span>{responsibility}</span>
                        </li>
                      ))}
                    </ul>
                    <Button asChild variant="outline" className="mt-6 w-full">
                      <Link href={module.dashboardPath}>Abrir Dashboard</Link>
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
