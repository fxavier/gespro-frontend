'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { gerarBalancetePeriodo } from '@/lib/contabilidade/balancete';
import type { Balancete } from '@/types/contabilidade';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  FileBarChart,
  ArrowLeft,
  Save,
  Eye,
  FileText
} from 'lucide-react';

interface BalanceteRegistro extends Balancete {
  id: string;
  nome: string;
  descricao?: string;
  responsavel?: string;
  criadoEm: string;
  configuracoes: {
    incluirZeradas: boolean;
    gerarAnalitico: boolean;
  };
}

export default function NovoBalancetePage() {
  const router = useRouter();
  const hoje = new Date();
  const inicioAno = new Date(hoje.getFullYear(), 0, 1).toISOString().split('T')[0];
  const hojeStr = hoje.toISOString().split('T')[0];

  const [formData, setFormData] = useState({
    nome: `Balancete ${hoje.getFullYear()}`,
    descricao: '',
    responsavel: 'Equipe Financeira',
    dataInicio: inicioAno,
    dataFim: hojeStr,
    incluirZeradas: false,
    gerarAnalitico: true
  });
  const [preview, setPreview] = useState<Balancete | null>(null);
  const [gerando, setGerando] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const handleChange = (field: keyof typeof formData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const gerarPreview = () => {
    setGerando(true);
    try {
      const resultado = gerarBalancetePeriodo({
        dataInicio: formData.dataInicio,
        dataFim: formData.dataFim,
        incluirZeradas: formData.incluirZeradas
      });
      setPreview(resultado);
      toast.success('Pré-visualização atualizada');
    } catch (error) {
      console.error(error);
      toast.error('Não foi possível gerar o balancete');
    } finally {
      setGerando(false);
    }
  };

  const salvarBalancete = () => {
    if (!preview) {
      toast.error('Gere uma pré-visualização antes de salvar');
      return;
    }
    if (!formData.nome.trim()) {
      toast.error('Informe um nome para o balancete');
      return;
    }

    setSalvando(true);
    try {
      const registro: BalanceteRegistro = {
        ...preview,
        id: `BAL-${Date.now()}`,
        nome: formData.nome,
        descricao: formData.descricao,
        responsavel: formData.responsavel,
        criadoEm: new Date().toISOString(),
        configuracoes: {
          incluirZeradas: formData.incluirZeradas,
          gerarAnalitico: formData.gerarAnalitico
        }
      };

      const key = 'balancetes_registrados';
      const existentes: BalanceteRegistro[] = JSON.parse(localStorage.getItem(key) || '[]');
      existentes.push(registro);
      localStorage.setItem(key, JSON.stringify(existentes));

      toast.success('Balancete criado e guardado');
      setTimeout(() => router.push('/contabilidade/balancete'), 1200);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar balancete');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Button asChild variant="ghost" size="sm">
              <Link href="/contabilidade/balancete">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <span>Finanças &gt; Balancete</span>
          </div>
          <h1 className="text-3xl font-bold flex items-center gap-2 mt-2">
            <FileBarChart className="h-8 w-8" />
            Criar Balancete
          </h1>
          <p className="text-muted-foreground">
            Configure o período e gere um balancete oficial para arquivamento
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informações Gerais</CardTitle>
          <CardDescription>Defina os metadados que identificarão este balancete</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={(e) => handleChange('nome', e.target.value)}
                placeholder="Ex: Balancete Q1 2024"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="responsavel">Responsável</Label>
              <Input
                id="responsavel"
                value={formData.responsavel}
                onChange={(e) => handleChange('responsavel', e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              value={formData.descricao}
              onChange={(e) => handleChange('descricao', e.target.value)}
              placeholder="Notas internas sobre este balancete..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Parâmetros do Balancete</CardTitle>
          <CardDescription>Escolha o período e opções de cálculo</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dataInicio">Data início *</Label>
              <Input
                id="dataInicio"
                type="date"
                value={formData.dataInicio}
                max={formData.dataFim}
                onChange={(e) => handleChange('dataInicio', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dataFim">Data fim *</Label>
              <Input
                id="dataFim"
                type="date"
                value={formData.dataFim}
                min={formData.dataInicio}
                onChange={(e) => handleChange('dataFim', e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between border rounded-lg p-3">
              <div>
                <p className="font-medium">Incluir contas zeradas</p>
                <p className="text-sm text-muted-foreground">Mostra contas sem movimento no período</p>
              </div>
              <Switch
                checked={formData.incluirZeradas}
                onCheckedChange={(checked) => handleChange('incluirZeradas', checked)}
              />
            </div>
            <div className="flex items-center justify-between border rounded-lg p-3">
              <div>
                <p className="font-medium">Gerar versão analítica</p>
                <p className="text-sm text-muted-foreground">Exportar com detalhes por conta</p>
              </div>
              <Switch
                checked={formData.gerarAnalitico}
                onCheckedChange={(checked) => handleChange('gerarAnalitico', checked)}
              />
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={gerarPreview} disabled={gerando}>
              <Eye className="h-4 w-4 mr-2" />
              {gerando ? 'Gerando...' : 'Gerar pré-visualização'}
            </Button>
            <Button onClick={salvarBalancete} disabled={salvando || !preview}>
              <Save className="h-4 w-4 mr-2" />
              {salvando ? 'Salvando...' : 'Salvar balancete'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>Pré-visualização ({preview.periodo})</CardTitle>
            <CardDescription>Total de contas: {preview.contas.length}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Total Débitos</p>
                <p className="text-2xl font-bold">MT {preview.totalDebitos.toLocaleString('pt-MZ')}</p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Total Créditos</p>
                <p className="text-2xl font-bold">MT {preview.totalCreditos.toLocaleString('pt-MZ')}</p>
              </div>
              <div className="border rounded-lg p-3">
                <p className="text-xs text-muted-foreground">Diferença</p>
                <p className={`text-2xl font-bold ${Math.abs(preview.totalDebitos - preview.totalCreditos) < 0.01 ? 'text-emerald-600' : 'text-destructive'}`}>
                  MT {(preview.totalDebitos - preview.totalCreditos).toLocaleString('pt-MZ')}
                </p>
              </div>
            </div>

            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Conta</TableHead>
                    <TableHead className="text-right">Débitos</TableHead>
                    <TableHead className="text-right">Créditos</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.contas.map((conta) => (
                    <TableRow key={conta.codigo}>
                      <TableCell className="font-mono">{conta.codigo}</TableCell>
                      <TableCell>{conta.nome}</TableCell>
                      <TableCell className="text-right font-mono">MT {conta.debitos.toLocaleString('pt-MZ')}</TableCell>
                      <TableCell className="text-right font-mono">MT {conta.creditos.toLocaleString('pt-MZ')}</TableCell>
                      <TableCell className={`text-right font-mono ${conta.saldoAtual < 0 ? 'text-destructive' : ''}`}>
                        MT {conta.saldoAtual.toLocaleString('pt-MZ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
