
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Wrench, 
  Calendar,
  Package,
  FileText,
  BarChart3,
  Settings,
  ArrowRight
} from 'lucide-react';

export default function ServicosPage() {
  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Módulo de Serviços
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Gestão completa de serviços, agendamentos e contratos
        </p>
      </div>

      {/* Menu Principal */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Dashboard */}
        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardContent className="p-6">
            <Link href="/servicos/dashboard" className="flex flex-col h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <BarChart3 className="h-6 w-6 text-blue-600 dark:text-blue-300" />
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Dashboard</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Visão geral de desempenho e estatísticas
              </p>
            </Link>
          </CardContent>
        </Card>

        {/* Serviços */}
        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardContent className="p-6">
            <Link href="/servicos/lista" className="flex flex-col h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-green-100 dark:bg-green-900 rounded-lg">
                  <Wrench className="h-6 w-6 text-green-600 dark:text-green-300" />
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Serviços</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Catálogo e gestão de serviços
              </p>
            </Link>
          </CardContent>
        </Card>

        {/* Agendamentos */}
        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardContent className="p-6">
            <Link href="/servicos/agendamentos" className="flex flex-col h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-orange-100 dark:bg-orange-900 rounded-lg">
                  <Calendar className="h-6 w-6 text-orange-600 dark:text-orange-300" />
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Agendamentos</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Gestão de agendamentos e compromissos
              </p>
            </Link>
          </CardContent>
        </Card>

        {/* Pacotes */}
        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardContent className="p-6">
            <Link href="/servicos/pacotes" className="flex flex-col h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-lg">
                  <Package className="h-6 w-6 text-purple-600 dark:text-purple-300" />
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Pacotes</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Combos e pacotes de serviços
              </p>
            </Link>
          </CardContent>
        </Card>

        {/* Contratos */}
        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardContent className="p-6">
            <Link href="/servicos/contratos" className="flex flex-col h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-red-100 dark:bg-red-900 rounded-lg">
                  <FileText className="h-6 w-6 text-red-600 dark:text-red-300" />
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Contratos</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Contratos recorrentes com clientes
              </p>
            </Link>
          </CardContent>
        </Card>

        {/* Relatórios */}
        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardContent className="p-6">
            <Link href="/servicos/relatorios" className="flex flex-col h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-indigo-100 dark:bg-indigo-900 rounded-lg">
                  <BarChart3 className="h-6 w-6 text-indigo-600 dark:text-indigo-300" />
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Relatórios</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Análise e estatísticas de desempenho
              </p>
            </Link>
          </CardContent>
        </Card>

        {/* Categorias */}
        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardContent className="p-6">
            <Link href="/servicos/categorias" className="flex flex-col h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="p-3 bg-cyan-100 dark:bg-cyan-900 rounded-lg">
                  <Settings className="h-6 w-6 text-cyan-600 dark:text-cyan-300" />
                </div>
                <ArrowRight className="h-5 w-5 text-gray-400" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Categorias</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Gestão de categorias de serviços
              </p>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Atalhos Rápidos */}
      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold mb-4">Atalhos Rápidos</h3>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/servicos/novo">Novo Serviço</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/servicos/agendamentos/novo">Novo Agendamento</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/servicos/pacotes/novo">Novo Pacote</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/servicos/contratos/novo">Novo Contrato</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
