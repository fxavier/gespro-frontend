
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  LayoutList,
  Calendar,
  BarChart3,
  Users,
  DollarSign,
  FileText,
  MessageSquare,
  AlertTriangle,
  CheckSquare,
  Settings,
  TrendingUp,
  Kanban,
} from 'lucide-react';

export default function ProjetosPage() {
  const modulos = [
    {
      titulo: 'Lista de Projetos',
      descricao: 'Visualizar e gerenciar todos os projetos',
      icon: LayoutList,
      href: '/projetos/lista',
      cor: 'bg-blue-100',
    },
    {
      titulo: 'Novo Projeto',
      descricao: 'Criar um novo projeto',
      icon: CheckSquare,
      href: '/projetos/lista/novo',
      cor: 'bg-green-100',
    },
    {
      titulo: 'Cronograma',
      descricao: 'Visualizar timeline e cronograma dos projetos',
      icon: Calendar,
      href: '/projetos/cronograma',
      cor: 'bg-purple-100',
    },
    {
      titulo: 'Kanban',
      descricao: 'Quadro Kanban de tarefas',
      icon: Kanban,
      href: '/projetos/kanban',
      cor: 'bg-yellow-100',
    },
    {
      titulo: 'Tarefas',
      descricao: 'Gerenciar tarefas e atividades',
      icon: CheckSquare,
      href: '/projetos/tarefas',
      cor: 'bg-orange-100',
    },
    {
      titulo: 'Equipa',
      descricao: 'Gerenciar membros da equipa',
      icon: Users,
      href: '/projetos/equipa',
      cor: 'bg-pink-100',
    },
    {
      titulo: 'Orçamento',
      descricao: 'Gestão de orçamento e custos',
      icon: DollarSign,
      href: '/projetos/orcamento',
      cor: 'bg-indigo-100',
    },
    {
      titulo: 'Documentos',
      descricao: 'Armazenar e gerenciar documentos',
      icon: FileText,
      href: '/projetos/documentos',
      cor: 'bg-cyan-100',
    },
    {
      titulo: 'Comunicações',
      descricao: 'Reuniões e comunicados do projeto',
      icon: MessageSquare,
      href: '/projetos/comunicacoes',
      cor: 'bg-red-100',
    },
    {
      titulo: 'Riscos',
      descricao: 'Identificar e gerenciar riscos',
      icon: AlertTriangle,
      href: '/projetos/riscos',
      cor: 'bg-amber-100',
    },
    {
      titulo: 'Qualidade',
      descricao: 'Controlo de qualidade e testes',
      icon: CheckSquare,
      href: '/projetos/qualidade',
      cor: 'bg-teal-100',
    },
    {
      titulo: 'Marcos',
      descricao: 'Marcos e milestones do projeto',
      icon: TrendingUp,
      href: '/projetos/marcos',
      cor: 'bg-lime-100',
    },
    {
      titulo: 'Relatórios',
      descricao: 'Relatórios e análises de desempenho',
      icon: BarChart3,
      href: '/projetos/relatorios',
      cor: 'bg-violet-100',
    },
    {
      titulo: 'Configurações',
      descricao: 'Configurar o módulo de projetos',
      icon: Settings,
      href: '/projetos/configuracoes',
      cor: 'bg-slate-100',
    },
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Gestão de Projetos</h1>
        <p className="text-muted-foreground mt-2">
          Gerencie todos os aspectos dos seus projetos em um único lugar
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {modulos.map((modulo) => {
          const Icon = modulo.icon;
          return (
            <Button
              key={modulo.href}
              variant="outline"
              className="h-auto p-0 justify-start"
              asChild
            >
              <Link href={modulo.href}>
                <Card className={`w-full ${modulo.cor} border-0`}>
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <Icon className="h-8 w-8 text-gray-700 flex-shrink-0" />
                      <div className="text-left">
                        <h3 className="font-bold text-sm">{modulo.titulo}</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {modulo.descricao}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
