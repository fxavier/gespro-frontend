
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { BookOpen, Search, Calendar, TrendingUp, TrendingDown, FileText, Download, Filter, ChevronRight, ChevronDown } from 'lucide-react';
import { PlanoContas, LancamentoContabil, PartidaContabil } from '@/types/contabilidade';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface MovimentoConta {
  data: string;
  numero: string;
  historico: string;
  debito: number;
  credito: number;
  saldo: number;
}

export default function RazaoGeralPage() {
  const [contas, setContas] = useState<PlanoContas[]>([]);
  const [lancamentos, setLancamentos] = useState<LancamentoContabil[]>([]);
  const [filteredContas, setFilteredContas] = useState<PlanoContas[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<string>('todos');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [contaSelecionada, setContaSelecionada] = useState<PlanoContas | null>(null);
  const [movimentosConta, setMovimentosConta] = useState<MovimentoConta[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [expandedContas, setExpandedContas] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterContas();
  }, [searchTerm, tipoFiltro, contas]);

  const loadData = () => {
    const storedContas = localStorage.getItem('plano_contas');
    if (storedContas) {
      setContas(JSON.parse(storedContas));
    }

    const storedLancamentos = localStorage.getItem('lancamentos_contabeis');
    if (storedLancamentos) {
      setLancamentos(JSON.parse(storedLancamentos));
    }
  };

  const filterContas = () => {
    let filtered = [...contas];

    if (tipoFiltro !== 'todos') {
      filtered = filtered.filter(c => c.tipo === tipoFiltro);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(c =>
        c.codigo.toLowerCase().includes(term) ||
        c.nome.toLowerCase().includes(term)
      );
    }

    filtered.sort((a, b) => a.codigo.localeCompare(b.codigo));
    setFilteredContas(filtered);
  };

  const calcularMovimentosConta = (conta: PlanoContas) => {
    const movimentos: MovimentoConta[] = [];
    let saldoAcumulado = 0;

    const lancamentosFiltrados = lancamentos
      .filter(l => {
        const dataLancamento = l.data;
        const dentroIntervalo = 
          (!dataInicio || dataLancamento >= dataInicio) &&
          (!dataFim || dataLancamento <= dataFim);
        
        const temPartidaConta = l.partidas.some(p => p.contaId === conta.id);
        
        return dentroIntervalo && temPartidaConta;
      })
      .sort((a, b) => new Date(a.data).getTime() - new Date(b.data).getTime());

    lancamentosFiltrados.forEach(lancamento => {
      lancamento.partidas
        .filter(p => p.contaId === conta.id)
        .forEach(partida => {
          const debito = partida.tipo === 'debito' ? partida.valor : 0;
          const credito = partida.tipo === 'credito' ? partida.valor : 0;

          if (conta.natureza === 'devedora') {
            saldoAcumulado += debito - credito;
          } else {
            saldoAcumulado += credito - debito;
          }

          movimentos.push({
            data: lancamento.data,
            numero: lancamento.numero,
            historico: lancamento.historico,
            debito,
            credito,
            saldo: saldoAcumulado
          });
        });
    });

    return movimentos;
  };

  const handleVerMovimentos = (conta: PlanoContas) => {
    setContaSelecionada(conta);
    const movimentos = calcularMovimentosConta(conta);
    setMovimentosConta(movimentos);
    setIsDialogOpen(true);
  };

  const calcularTotaisConta = (conta: PlanoContas) => {
    const movimentos = calcularMovimentosConta(conta);
    
    const totalDebitos = movimentos.reduce((sum, m) => sum + m.debito, 0);
    const totalCreditos = movimentos.reduce((sum, m) => sum + m.credito, 0);
    const saldoFinal = movimentos.length > 0 ? movimentos[movimentos.length - 1].saldo : 0;

    return { totalDebitos, totalCreditos, saldoFinal };
  };

  const exportarRazao = () => {
    const dados = filteredContas.map(conta => {
      const { totalDebitos, totalCreditos, saldoFinal } = calcularTotaisConta(conta);
      return {
        Código: conta.codigo,
        Nome: conta.nome,
        Tipo: conta.tipo,
        Natureza: conta.natureza,
        'Total Débitos': totalDebitos.toFixed(2),
        'Total Créditos': totalCreditos.toFixed(2),
        'Saldo': saldoFinal.toFixed(2)
      };
    });

    const csv = [
      Object.keys(dados[0]).join(','),
      ...dados.map(row => Object.values(row).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `razao-geral-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    
    toast.success('Razão geral exportado com sucesso');
  };

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedContas);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedContas(newExpanded);
  };

  const renderContaTree = (contaPaiId?: string, nivel = 1) => {
    const contasNivel = filteredContas.filter(c => c.contaPaiId === contaPaiId);
    
    return contasNivel.map(conta => {
      const hasFilhos = filteredContas.some(c => c.contaPaiId === conta.id);
      const isExpanded = expandedContas.has(conta.id);
      const { totalDebitos, totalCreditos, saldoFinal } = calcularTotaisConta(conta);

      return (
        <div key={conta.id}>
          <div
            className="flex items-center justify-between p-3 hover:bg-accent rounded-lg transition-colors"
            style={{ paddingLeft: `${nivel * 1.5}rem` }}
          >
            <div className="flex items-center gap-3 flex-1">
              {hasFilhos ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => toggleExpand(conta.id)}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              ) : (
                <div className="w-6" />
              )}
              
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium">{conta.codigo}</span>
                  <span className="font-medium">{conta.nome}</span>
                  <Badge variant="outline" className="text-xs">
                    {conta.natureza}
                  </Badge>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 text-right min-w-[400px]">
                <div>
                  <div className="text-xs text-muted-foreground">Débitos</div>
                  <div className="font-mono text-sm">
                    {new Intl.NumberFormat('pt-PT', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    }).format(totalDebitos)} MT
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Créditos</div>
                  <div className="font-mono text-sm">
                    {new Intl.NumberFormat('pt-PT', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    }).format(totalCreditos)} MT
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Saldo</div>
                  <div className={`font-mono text-sm font-semibold ${saldoFinal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {new Intl.NumberFormat('pt-PT', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    }).format(saldoFinal)} MT
                  </div>
                </div>
              </div>
            </div>

            {conta.aceitaLancamento && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleVerMovimentos(conta)}
                className="ml-4"
              >
                <FileText className="h-4 w-4 mr-2" />
                Ver Movimentos
              </Button>
            )}
          </div>

          {hasFilhos && isExpanded && renderContaTree(conta.id, nivel + 1)}
        </div>
      );
    });
  };

  const calcularTotaisGerais = () => {
    const totais = {
      ativo: 0,
      passivo: 0,
      patrimonioLiquido: 0,
      receita: 0,
      despesa: 0
    };

    filteredContas.forEach(conta => {
      const { saldoFinal } = calcularTotaisConta(conta);
      
      switch (conta.tipo) {
        case 'ativo':
          totais.ativo += saldoFinal;
          break;
        case 'passivo':
          totais.passivo += saldoFinal;
          break;
        case 'patrimonio_liquido':
          totais.patrimonioLiquido += saldoFinal;
          break;
        case 'receita':
          totais.receita += saldoFinal;
          break;
        case 'despesa':
          totais.despesa += saldoFinal;
          break;
      }
    });

    return totais;
  };

  const totaisGerais = calcularTotaisGerais();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BookOpen className="h-8 w-8" />
            Razão Geral (General Ledger)
          </h1>
          <p className="text-muted-foreground mt-1">
            Movimentação detalhada de todas as contas contábeis
          </p>
        </div>

        <Button onClick={exportarRazao}>
          <Download className="h-4 w-4 mr-2" />
          Exportar Razão
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Ativo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat('pt-PT', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              }).format(totaisGerais.ativo)} MT
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              Passivo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat('pt-PT', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              }).format(totaisGerais.passivo)} MT
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Patrimônio Líquido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat('pt-PT', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              }).format(totaisGerais.patrimonioLiquido)} MT
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-600" />
              Receitas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {new Intl.NumberFormat('pt-PT', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              }).format(totaisGerais.receita)} MT
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-600" />
              Despesas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {new Intl.NumberFormat('pt-PT', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              }).format(totaisGerais.despesa)} MT
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar conta..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo de conta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="passivo">Passivo</SelectItem>
                <SelectItem value="patrimonio_liquido">Patrimônio Líquido</SelectItem>
                <SelectItem value="receita">Receita</SelectItem>
                <SelectItem value="despesa">Despesa</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                placeholder="Data início"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                placeholder="Data fim"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contas do Razão Geral</CardTitle>
          <CardDescription>
            Estrutura hierárquica com saldos e movimentações
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {renderContaTree()}
          </div>

          {filteredContas.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma conta encontrada</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Movimentos da Conta: {contaSelecionada?.codigo} - {contaSelecionada?.nome}
            </DialogTitle>
          </DialogHeader>

          {contaSelecionada && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground">Total Débitos</div>
                    <div className="text-xl font-bold">
                      {new Intl.NumberFormat('pt-PT', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      }).format(
                        movimentosConta.reduce((sum, m) => sum + m.debito, 0)
                      )} MT
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground">Total Créditos</div>
                    <div className="text-xl font-bold">
                      {new Intl.NumberFormat('pt-PT', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      }).format(
                        movimentosConta.reduce((sum, m) => sum + m.credito, 0)
                      )} MT
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground">Saldo Final</div>
                    <div className={`text-xl font-bold ${
                      movimentosConta.length > 0 && movimentosConta[movimentosConta.length - 1].saldo >= 0
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}>
                      {new Intl.NumberFormat('pt-PT', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      }).format(
                        movimentosConta.length > 0 ? movimentosConta[movimentosConta.length - 1].saldo : 0
                      )} MT
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Número</TableHead>
                    <TableHead>Histórico</TableHead>
                    <TableHead className="text-right">Débito</TableHead>
                    <TableHead className="text-right">Crédito</TableHead>
                    <TableHead className="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movimentosConta.map((movimento, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        {new Date(movimento.data).toLocaleDateString('pt-PT')}
                      </TableCell>
                      <TableCell className="font-mono">{movimento.numero}</TableCell>
                      <TableCell>{movimento.historico}</TableCell>
                      <TableCell className="text-right font-mono">
                        {movimento.debito > 0 && (
                          <span>
                            {new Intl.NumberFormat('pt-PT', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            }).format(movimento.debito)} MT
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {movimento.credito > 0 && (
                          <span>
                            {new Intl.NumberFormat('pt-PT', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2
                            }).format(movimento.credito)} MT
                          </span>
                        )}
                      </TableCell>
                      <TableCell className={`text-right font-mono font-semibold ${
                        movimento.saldo >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {new Intl.NumberFormat('pt-PT', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        }).format(movimento.saldo)} MT
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {movimentosConta.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum movimento encontrado para esta conta no período selecionado</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
