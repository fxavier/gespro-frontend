
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { FileBarChart } from 'lucide-react';
import { Balancete, LancamentoContabil, PlanoContas } from '@/types/contabilidade';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default function BalancetePage() {
  const [dataInicio, setDataInicio] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [dataFim, setDataFim] = useState(new Date().toISOString().split('T')[0]);
  const [balancete, setBalancete] = useState<Balancete | null>(null);

  const gerarBalancete = () => {
    const lancamentos: LancamentoContabil[] = JSON.parse(localStorage.getItem('lancamentos_contabeis') || '[]');
    const contas: PlanoContas[] = JSON.parse(localStorage.getItem('plano_contas') || '[]');

    const lancamentosFiltrados = lancamentos.filter(l => {
      const dataLanc = new Date(l.data);
      return dataLanc >= new Date(dataInicio) && dataLanc <= new Date(dataFim);
    });

    const movimentacoes = new Map<string, { debitos: number; creditos: number }>();

    lancamentosFiltrados.forEach(lancamento => {
      lancamento.partidas.forEach(partida => {
        const current = movimentacoes.get(partida.contaId) || { debitos: 0, creditos: 0 };
        
        if (partida.tipo === 'debito') {
          current.debitos += partida.valor;
        } else {
          current.creditos += partida.valor;
        }
        
        movimentacoes.set(partida.contaId, current);
      });
    });

    const contasBalancete = contas
      .filter(c => c.aceitaLancamento)
      .map(conta => {
        const mov = movimentacoes.get(conta.id) || { debitos: 0, creditos: 0 };
        const saldoAnterior = 0;
        
        let saldoAtual: number;
        if (conta.natureza === 'devedora') {
          saldoAtual = saldoAnterior + mov.debitos - mov.creditos;
        } else {
          saldoAtual = saldoAnterior + mov.creditos - mov.debitos;
        }

        return {
          codigo: conta.codigo,
          nome: conta.nome,
          tipo: conta.tipo,
          saldoAnterior,
          debitos: mov.debitos,
          creditos: mov.creditos,
          saldoAtual
        };
      })
      .filter(c => c.debitos > 0 || c.creditos > 0 || c.saldoAtual !== 0);

    const totalDebitos = contasBalancete.reduce((sum, c) => sum + c.debitos, 0);
    const totalCreditos = contasBalancete.reduce((sum, c) => sum + c.creditos, 0);

    const balanceteGerado: Balancete = {
      periodo: `${new Date(dataInicio).toLocaleDateString('pt-PT')} - ${new Date(dataFim).toLocaleDateString('pt-PT')}`,
      dataInicio,
      dataFim,
      contas: contasBalancete,
      totalDebitos,
      totalCreditos
    };

    setBalancete(balanceteGerado);
  };

  useEffect(() => {
    gerarBalancete();
  }, []);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-MZ', {
      style: 'currency',
      currency: 'MZN'
    }).format(value);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <FileBarChart className="h-8 w-8" />
          Balancete de Verificação
        </h1>
        <p className="text-muted-foreground mt-1">
          Verificação de débitos e créditos por conta
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
            <Button onClick={gerarBalancete}>Gerar Balancete</Button>
          </div>
        </CardContent>
      </Card>

      {balancete && (
        <Card>
          <CardHeader>
            <CardTitle>Balancete - {balancete.periodo}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Saldo Anterior</TableHead>
                  <TableHead className="text-right">Débitos</TableHead>
                  <TableHead className="text-right">Créditos</TableHead>
                  <TableHead className="text-right">Saldo Atual</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balancete.contas.map(conta => (
                  <TableRow key={conta.codigo}>
                    <TableCell className="font-mono">{conta.codigo}</TableCell>
                    <TableCell className="font-medium">{conta.nome}</TableCell>
                    <TableCell>
                      <span className="text-xs uppercase text-muted-foreground">
                        {conta.tipo.replace('_', ' ')}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(conta.saldoAnterior)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(conta.debitos)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(conta.creditos)}
                    </TableCell>
                    <TableCell className={`text-right font-mono font-semibold ${conta.saldoAtual >= 0 ? '' : 'text-destructive'}`}>
                      {conta.saldoAtual >= 0 
                        ? formatCurrency(conta.saldoAtual)
                        : `(${formatCurrency(Math.abs(conta.saldoAtual))})`
                      }
                    </TableCell>
                  </TableRow>
                ))}
                
                <TableRow className="font-bold bg-muted/50">
                  <TableCell colSpan={4}>TOTAIS</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(balancete.totalDebitos)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(balancete.totalCreditos)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(balancete.totalDebitos - balancete.totalCreditos)}
                  </TableCell>
                </TableRow>

                <TableRow className="font-bold bg-primary/10">
                  <TableCell colSpan={4}>DIFERENÇA (Deve ser zero)</TableCell>
                  <TableCell colSpan={3} className={`text-right font-mono text-lg ${Math.abs(balancete.totalDebitos - balancete.totalCreditos) < 0.01 ? 'text-green-600' : 'text-destructive'}`}>
                    {formatCurrency(balancete.totalDebitos - balancete.totalCreditos)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
