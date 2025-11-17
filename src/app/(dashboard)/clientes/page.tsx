
'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  BarChart3,
  Users,
  FileText,
  MapPin,
  Phone,
  History,
  TrendingUp,
  Plus,
  ArrowRight
} from 'lucide-react';

export default function ClientesPage() {
  const modules = [
    {
      title: 'Dashboard',
      description: 'Visão geral e análise da base de clientes',
      icon: BarChart3,
      href: '/clientes/dashboard',
      color: 'bg-blue-500'
    },
    {
      title: 'Lista de Clientes',
      description: 'Gestão completa de clientes',
      icon: Users,
      href: '/clientes/lista',
      color: 'bg-green-500'
    },
    {
      title: 'Novo Cliente',
      description: 'Criar novo cliente',
      icon: Plus,
      href: '/clientes/novo',
      color: 'bg-purple-500'
    },
    {
      title: 'Contactos',
      description: 'Gestão de contactos por cliente',
      icon: Phone,
      href: '/clientes/contactos',
      color: 'bg-orange-500'
    },
    {
      title: 'Endereços',
      description: 'Gestão de endereços de facturação e entrega',
      icon: MapPin,
      href: '/clientes/enderecos',
      color: 'bg-red-500'
    },
    {
      title: 'Histórico',
      description: 'Histórico de transações com clientes',
      icon: History,
      href: '/clientes/historico',
      color: 'bg-indigo-500'
    },
    {
      title: 'Segmentação',
      description: 'Análise e categorização de clientes',
      icon: TrendingUp,
      href: '/clientes/segmentacao',
      color: 'bg-cyan-500'
    },
    {
      title: 'Relatórios',
      description: 'Relatórios e análises de clientes',
      icon: FileText,
      href: '/clientes/relatorios',
      color: 'bg-pink-500'
    }
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Gestão de Clientes
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Módulo completo de gestão de clientes com todas as funcionalidades
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {modules.map((module) => {
          const Icon = module.icon;
          return (
            <Link key={module.href} href={module.href}>
              <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{module.title}</CardTitle>
                    <div className={`${module.color} p-2 rounded-lg`}>
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {module.description}
                  </p>
                  <Button variant="ghost" className="mt-4 w-full justify-between">
                    Acessar
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
