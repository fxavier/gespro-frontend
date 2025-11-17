
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { BarChart3 } from 'lucide-react';
import { DRE, LancamentoContabil, PlanoContas } from '@/types/contabilidade';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function DREPage() {
  const [dataInicio, setDataInicio] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [dataFim, setDataFim] = useState(new Date().toISOString().split('T')[0]);
  const [dre, setDre] = useState<DRE | null>(null);

  const gerarDRE = () => {
    const lancamentos: LancamentoContabil[] = JSON.parse(localStorage.getItem('lancamentos_contabeis') || '[]');
    const contas: PlanoContas[] = JSON.parse(localStorage.getItem('plano_contas') || '[]');

    const lancamentosFiltrados = lancamentos.filter(l => {
      const dataLanc = new Date(l.data);
      return dataLanc >= new Date(dataInicio) && dataLanc <= new Date(dataFim);
    });

    let receitaBruta = 0;
    let deducoes = 0;
    let custoProdutosVendidos = 0;
    let despesasVendas = 0;
    let despesasAdministrativas = 0;
    let despesasGerais = 0;
    let receitasFinanceiras = 0;
    let despesasFinanceiras = 0;
    let impostos = 0;

    lancamentosFiltrados.forEach(lancamento => {
      lancamento.partidas.forEach(partida => {
        const conta = contas.find(c => c.id === partida.contaId);
        if (!conta) return;

        const valor = partida.valor;

        if (conta.tipo === 'receita') {
          if (partida.tipo === 'credito') {
            if (conta.nome.toLowerCase().includes('financeira')) {
              receitasFinanceiras += valor;
            } else {
              receitaBruta += valor;
            }
          }
        } else if (conta.tipo === 'despesa') {
          if (partida.tipo === 'debito') {
            if (conta.nome.toLowerCase().includes('custo') || conta.nome.toLowerCase().includes('cmv')) {
              custoProdutosVendidos += valor;
            } else if (conta.nome.toLowerCase().includes('venda')) {
              despesasVendas += valor;
            } else if (conta.nome.toLowerCase().includes('administrativa')) {
              despesasAdministrativas += valor;
            } else if (conta.nome.toLowerCase().includes('financeira')) {
              despesasFinanceiras += valor;
            } else if (conta.nome.toLowerCase().includes('imposto') || conta.nome.toLowerCase().includes('taxa')) {
              impostos += valor;
            } else {
              despesasGerais += valor;
            }
          }
        }
      });
    });

    const receitaLiquida = receitaBruta - deducoes;
    const lucroBruto = receitaLiquida - custoProdutosVendidos;
    const despesasOperacionaisTotais = despesasVendas + despesasAdministrativas + despesasGerais;
    const lucroOperacional = lucroBruto - despesasOperacionaisTotais;
    const resultadoFinanceiro = receitasFinanceiras - despesasFinanceiras;
    const lucroAntesImpostos = lucroOperacional + resultadoFinanceiro;
    const lucroLiquido = lucroAntesImpostos - impostos;

    const dreCalculada: DRE = {
      periodo: `${new Date(dataInicio).toLocaleDateString('pt-PT')} - ${new Date(dataFim).toLocaleDateString('pt-PT')}`,
      dataInicio,
      dataFim,
      receitaBruta,
      deducoes,
      receitaLiquida,
      custoProdutosVendidos,
      lucroBruto,
      despesasOperacionais: {
        despesasVendas,
        despesasAdministrativas,
        despesasGerais,
        total: despesasOperacionaisTotais
      },
      lucroOperacional,
      receitasFinanceiras,
      despesasFinanceiras,
      resultadoFinanceiro,
      lucroAntesImpostos,
      impostos,
      lucroLiquido,
      margemBruta: receitaLiquida > 0 ? (lucroBruto / receitaLiquida) * 100 : 0,
      margemOperacional: receitaLiquida > 0 ? (lucroOperacional / receitaLiquida) * 100 : 0,
      margemLiquida: receitaLiquida > 0 ? (lucroLiquido / receitaLiquida) * 100 : 0
    };

    setDre(dreCalculada);
  };

  useEffect(() => {
    gerarDRE();
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-MZ', {
      style: 'currency',
      currency: 'MZN'
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <BarChart3 className="h-8 w-8" />
          Demonstração do Resultado do Exercício (DRE)
        </h1>
        <p className="text-muted-foreground mt-1">
          Análise de receitas, custos e despesas
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Selecione o período para análise</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="dataInicio">Data Início</Label>
              <Input
                id="dataInicio"
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
              />
            </div>
            <div className="flex-1 space-y-2">
              <Label htmlFor="dataFim">Data Fim</Label>
              <Input
                id="dataFim"
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
              />
            </div>
            <Button onClick={gerarDRE}>Gerar DRE</Button>
          </div>
        </CardContent>
      </Card>

      {dre && (
        <Card>
          <CardHeader>
            <CardTitle>DRE - {dre.periodo}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <TableRow className="font-semibold bg-muted/50">
                  <TableCell>RECEITA BRUTA</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(dre.receitaBruta)}</TableCell>
                  <TableCell className="text-right"></TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="pl-8">(-) Deduções</TableCell>
                  <TableCell className="text-right font-mono text-destructive">({formatCurrency(dre.deducoes)})</TableCell>
                  <TableCell className="text-right"></TableCell>
                </TableRow>

                <TableRow className="font-semibold bg-muted/50">
                  <TableCell>RECEITA LÍQUIDA</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(dre.receitaLiquida)}</TableCell>
                  <TableCell className="text-right">100%</TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="pl-8">(-) Custo dos Produtos Vendidos</TableCell>
                  <TableCell className="text-right font-mono text-destructive">({formatCurrency(dre.custoProdutosVendidos)})</TableCell>
                  <TableCell className="text-right">
                    {formatPercent((dre.custoProdutosVendidos / dre.receitaLiquida) * 100)}
                  </TableCell>
                </TableRow>

                <TableRow className="font-semibold bg-muted/50">
                  <TableCell>LUCRO BRUTO</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(dre.lucroBruto)}</TableCell>
                  <TableCell className="text-right">{formatPercent(dre.margemBruta)}</TableCell>
                </TableRow>

                <TableRow className="font-medium">
                  <TableCell>DESPESAS OPERACIONAIS</TableCell>
                  <TableCell className="text-right font-mono text-destructive">({formatCurrency(dre.despesasOperacionais.total)})</TableCell>
                  <TableCell className="text-right">
                    {formatPercent((dre.despesasOperacionais.total / dre.receitaLiquida) * 100)}
                  </TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="pl-8">Despesas com Vendas</TableCell>
                  <TableCell className="text-right font-mono text-destructive">({formatCurrency(dre.despesasOperacionais.despesasVendas)})</TableCell>
                  <TableCell className="text-right"></TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="pl-8">Despesas Administrativas</TableCell>
                  <TableCell className="text-right font-mono text-destructive">({formatCurrency(dre.despesasOperacionais.despesasAdministrativas)})</TableCell>
                  <TableCell className="text-right"></TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="pl-8">Despesas Gerais</TableCell>
                  <TableCell className="text-right font-mono text-destructive">({formatCurrency(dre.despesasOperacionais.despesasGerais)})</TableCell>
                  <TableCell className="text-right"></TableCell>
                </TableRow>

                <TableRow className="font-semibold bg-muted/50">
                  <TableCell>LUCRO OPERACIONAL</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(dre.lucroOperacional)}</TableCell>
                  <TableCell className="text-right">{formatPercent(dre.margemOperacional)}</TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="pl-8">(+) Receitas Financeiras</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(dre.receitasFinanceiras)}</TableCell>
                  <TableCell className="text-right"></TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="pl-8">(-) Despesas Financeiras</TableCell>
                  <TableCell className="text-right font-mono text-destructive">({formatCurrency(dre.despesasFinanceiras)})</TableCell>
                  <TableCell className="text-right"></TableCell>
                </TableRow>

                <TableRow className="font-medium">
                  <TableCell>RESULTADO FINANCEIRO</TableCell>
                  <TableCell className={`text-right font-mono ${dre.resultadoFinanceiro >= 0 ? '' : 'text-destructive'}`}>
                    {dre.resultadoFinanceiro >= 0 ? formatCurrency(dre.resultadoFinanceiro) : `(${formatCurrency(Math.abs(dre.resultadoFinanceiro))})`}
                  </TableCell>
                  <TableCell className="text-right"></TableCell>
                </TableRow>

                <TableRow className="font-semibold bg-muted/50">
                  <TableCell>LUCRO ANTES DOS IMPOSTOS</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(dre.lucroAntesImpostos)}</TableCell>
                  <TableCell className="text-right"></TableCell>
                </TableRow>

                <TableRow>
                  <TableCell className="pl-8">(-) Impostos</TableCell>
                  <TableCell className="text-right font-mono text-destructive">({formatCurrency(dre.impostos)})</TableCell>
                  <TableCell className="text-right"></TableCell>
                </TableRow>

                <TableRow className="font-bold bg-primary/10 text-lg">
                  <TableCell>LUCRO LÍQUIDO</TableCell>
                  <TableCell className={`text-right font-mono ${dre.lucroLiquido >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                    {formatCurrency(dre.lucroLiquido)}
                  </TableCell>
                  <TableCell className="text-right font-bold">{formatPercent(dre.margemLiquida)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
