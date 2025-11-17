'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Factory,
  Component,
  Route,
  ClipboardList,
  Calculator,
  Gauge,
  Users,
  DollarSign,
  ShieldCheck,
  FileBarChart2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Clock,
  Target,
  Activity,
  BarChart3,
  PieChart,
  Zap,
  Eye,
  ArrowRight
} from 'lucide-react';
import Link from 'next/link';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
  Tooltip,
  PieChart as RechartsPieChart,
  Pie,
  Cell
} from 'recharts';

interface ModuloProducao {
  id: string;
  titulo: string;
  descricao: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  status: 'implementado' | 'em_desenvolvimento' | 'planejado';
  funcionalidades: string[];
}

export default function ProducaoPage() {
  const modulos: ModuloProducao[] = [
    {
      id: 'estrutura',
      titulo: 'Estrutura de Produto (BOM)',
      descricao: 'Gestão de listas de materiais e estruturas hierárquicas',
      icon: Component,
      href: '/producao/estrutura',
      status: 'implementado',
      funcionalidades: [
        'Lista de materiais hierárquica',
        'Validação de disponibilidade',
        'Cálculo automático de custos',
        'Gestão de versões'
      ]
    },
    {
      id: 'roteiros',
      titulo: 'Roteiros de Produção',
      descricao: 'Definição de processos e operações produtivas',
      icon: Route,
      href: '/producao/roteiros',
      status: 'implementado',
      funcionalidades: [
        'Operações sequenciais',
        'Tempos padrão',
        'Centros de trabalho',
        'Análise de eficiência'
      ]
    },
    {
      id: 'ordens',
      titulo: 'Ordens de Produção',
      descricao: 'Controlo e gestão das ordens de fabrico',
      icon: ClipboardList,
      href: '/producao/ordens',
      status: 'implementado',
      funcionalidades: [
        'Estados de produção',
        'Reserva de materiais',
        'Quadro Kanban',
        'Rastreabilidade completa'
      ]
    },
    {
      id: 'planeamento',
      titulo: 'Planeamento (MRP)',
      descricao: 'Planeamento de necessidades de materiais',
      icon: Calculator,
      href: '/producao/planeamento',
      status: 'implementado',
      funcionalidades: [
        'Cálculo de necessidades',
        'Sugestões automáticas',
        'Análise de capacidade',
        'Simulações "What-If"'
      ]
    },
    {
      id: 'capacidade',
      titulo: 'Capacidade (CRP)',
      descricao: 'Gestão da capacidade produtiva',
      icon: Gauge,
      href: '/producao/capacidade',
      status: 'implementado',
      funcionalidades: [
        'Balanceamento de carga',
        'Gráficos de Gantt',
        'Identificação de gargalos',
        'Otimização automática'
      ]
    },
    {
      id: 'mao-obra',
      titulo: 'Mão de Obra',
      descricao: 'Gestão de operadores e eficiência',
      icon: Users,
      href: '/producao/mao-obra',
      status: 'implementado',
      funcionalidades: [
        'Controlo de presença',
        'Alocação de equipas',
        'Análise de desempenho',
        'Gestão de certificados'
      ]
    },
    {
      id: 'custos',
      titulo: 'Custos de Produção',
      descricao: 'Cálculo e análise de custos',
      icon: DollarSign,
      href: '/producao/custos',
      status: 'implementado',
      funcionalidades: [
        'Custo padrão vs real',
        'Análise de variações',
        'Centros de custo',
        'Margem de contribuição'
      ]
    },
    {
      id: 'qualidade',
      titulo: 'Qualidade',
      descricao: 'Controlo de qualidade e rastreabilidade',
      icon: ShieldCheck,
      href: '/producao/qualidade',
      status: 'implementado',
      funcionalidades: [
        'Inspeções de qualidade',
        'Não conformidades',
        'Rastreabilidade de lotes',
        'Certificados de qualidade'
      ]
    },
    {
      id: 'relatorios',
      titulo: 'Relatórios',
      descricao: 'Dashboards e relatórios de produção',
      icon: FileBarChart2,
      href: '/producao/relatorios',
      status: 'implementado',
      funcionalidades: [
        'Templates de relatórios',
        'KPIs e métricas',
        'Analytics avançado',
        'Geração automática'
      ]
    }
  ];

  // Mock data para gráficos
  const dadosProducao = [
    { mes: 'Jan', produzido: 1200, planejado: 1150 },
    { mes: 'Fev', produzido: 1350, planejado: 1300 },
    { mes: 'Mar', produzido: 1180, planejado: 1250 },
    { mes: 'Abr', produzido: 1420, planejado: 1400 },
    { mes: 'Mai', produzido: 1380, planejado: 1350 },
    { mes: 'Jun', produzido: 1500, planejado: 1450 }
  ];

  const dadosOEE = [
    { name: 'Disponibilidade', value: 88 },
    { name: 'Performance', value: 85 },
    { name: 'Qualidade', value: 92 }
  ];

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];

  const getStatusBadge = (status: string) => {
    const variants = {
      implementado: 'bg-green-100 text-green-800',
      em_desenvolvimento: 'bg-yellow-100 text-yellow-800',
      planejado: 'bg-blue-100 text-blue-800'
    };
    
    return (
      <Badge className={variants[status as keyof typeof variants]}>
        {status === 'implementado' ? 'Implementado' : 
         status === 'em_desenvolvimento' ? 'Em Desenvolvimento' : 'Planejado'}
      </Badge>
    );
  };

  const calcularOEE = () => {
    const disponibilidade = 88;
    const performance = 85;
    const qualidade = 92;
    return Math.round((disponibilidade * performance * qualidade) / 10000);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Factory className="h-8 w-8" />
            Módulo de Produção
          </h1>
          <p className="text-muted-foreground">Sistema completo de gestão da produção industrial</p>
        </div>
      </div>

      {/* KPIs Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium">OEE Global</p>
                <p className="text-2xl font-bold text-blue-600">{calcularOEE()}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm font-medium">Ordens Ativas</p>
                <p className="text-2xl font-bold">23</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-sm font-medium">Taxa Qualidade</p>
                <p className="text-2xl font-bold text-purple-600">95.5%</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm font-medium">Eficiência</p>
                <p className="text-2xl font-bold text-orange-600">91%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Módulos de Produção */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Component className="h-5 w-5" />
            Módulos de Produção
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {modulos.map((modulo) => (
              <div key={modulo.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <modulo.icon className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{modulo.titulo}</h3>
                      <p className="text-sm text-gray-600">{modulo.descricao}</p>
                    </div>
                  </div>
                  {getStatusBadge(modulo.status)}
                </div>
                
                <div className="space-y-2 mb-4">
                  {modulo.funcionalidades.map((func, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-3 w-3 text-green-500" />
                      <span>{func}</span>
                    </div>
                  ))}
                </div>
                
                <Button asChild className="w-full">
                  <Link href={modulo.href}>
                    <Eye className="mr-2 h-4 w-4" />
                    Acessar Módulo
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Dashboard Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Produção Mensal</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dadosProducao}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="mes" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="produzido" fill="#8884d8" name="Produzido" />
                <Bar dataKey="planejado" fill="#82ca9d" name="Planejado" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>OEE - Overall Equipment Effectiveness</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <RechartsPieChart>
                <Pie
                  data={dadosOEE}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  label={(entry) => `${entry.name}: ${entry.value}%`}
                >
                  {dadosOEE.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </RechartsPieChart>
            </ResponsiveContainer>
            <div className="text-center mt-4">
              <p className="text-3xl font-bold text-blue-600">{calcularOEE()}%</p>
              <p className="text-sm text-gray-500">OEE Global</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Funcionalidades Implementadas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            Funcionalidades Implementadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Component className="h-4 w-4" />
                BOM & Estruturas
              </h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  Estruturas hierárquicas
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  Validação de stock
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  Cálculo de custos
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  Gestão de versões
                </li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Planeamento
              </h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  MRP automático
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  CRP - Capacidade
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  Sugestões de ordens
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  Simulações
                </li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" />
                Qualidade
              </h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  Inspeções
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  Rastreabilidade
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  Não conformidades
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-3 w-3 text-green-500" />
                  Certificados
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}