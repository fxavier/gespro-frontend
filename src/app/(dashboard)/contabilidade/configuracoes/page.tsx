
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Cog } from 'lucide-react';
import { ConfiguracaoContabil, PlanoContas } from '@/types/contabilidade';

export default function ConfiguracoesContabilidadePage() {
  const [contas, setContas] = useState<PlanoContas[]>([]);
  const [config, setConfig] = useState<ConfiguracaoContabil>({
    id: '1',
    tenantId: 'default',
    regimeContabil: 'competencia',
    exercicioFiscalInicio: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0],
    exercicioFiscalFim: new Date(new Date().getFullYear(), 11, 31).toISOString().split('T')[0],
    contasPadrao: {
      caixa: '',
      banco: '',
      clientesReceber: '',
      fornecedoresPagar: '',
      estoque: '',
      receitaVendas: '',
      custoVendas: '',
      descontosConcedidos: '',
      descontosObtidos: '',
      ivaReceber: '',
      ivaPagar: ''
    },
    integracaoAutomatica: {
      vendas: true,
      compras: true,
      pagamentos: true,
      recebimentos: true,
      estoque: true
    },
    dataCriacao: new Date().toISOString(),
    dataAtualizacao: new Date().toISOString()
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    const storedContas = localStorage.getItem('plano_contas');
    if (storedContas) {
      const parsed = JSON.parse(storedContas);
      setContas(parsed.filter((c: PlanoContas) => c.aceitaLancamento));
    }

    const storedConfig = localStorage.getItem('configuracao_contabil');
    if (storedConfig) {
      setConfig(JSON.parse(storedConfig));
    }
  };

  const handleSave = () => {
    const updated = {
      ...config,
      dataAtualizacao: new Date().toISOString()
    };
    
    localStorage.setItem('configuracao_contabil', JSON.stringify(updated));
    setConfig(updated);
    toast.success('Configurações salvas com sucesso');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Cog className="h-8 w-8" />
          Configurações de Contabilidade
        </h1>
        <p className="text-muted-foreground mt-1">
          Configure o regime contábil e contas padrão
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Regime Contábil</CardTitle>
          <CardDescription>
            Defina o regime de contabilização
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="regime">Regime Contábil</Label>
            <Select
              value={config.regimeContabil}
              onValueChange={(value: 'caixa' | 'competencia') => 
                setConfig({ ...config, regimeContabil: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="caixa">Regime de Caixa</SelectItem>
                <SelectItem value="competencia">Regime de Competência</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">
              {config.regimeContabil === 'caixa' 
                ? 'Receitas e despesas são reconhecidas quando recebidas ou pagas'
                : 'Receitas e despesas são reconhecidas quando ocorrem, independente do pagamento'
              }
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="exercicioInicio">Início do Exercício Fiscal</Label>
              <Input
                id="exercicioInicio"
                type="date"
                value={config.exercicioFiscalInicio}
                onChange={(e) => setConfig({ ...config, exercicioFiscalInicio: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="exercicioFim">Fim do Exercício Fiscal</Label>
              <Input
                id="exercicioFim"
                type="date"
                value={config.exercicioFiscalFim}
                onChange={(e) => setConfig({ ...config, exercicioFiscalFim: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contas Padrão</CardTitle>
          <CardDescription>
            Defina as contas contábeis padrão para integração automática
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="caixa">Caixa</Label>
              <Select
                value={config.contasPadrao.caixa}
                onValueChange={(value) => 
                  setConfig({ 
                    ...config, 
                    contasPadrao: { ...config.contasPadrao, caixa: value }
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {contas.map(conta => (
                    <SelectItem key={conta.id} value={conta.id}>
                      {conta.codigo} - {conta.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="banco">Banco</Label>
              <Select
                value={config.contasPadrao.banco}
                onValueChange={(value) => 
                  setConfig({ 
                    ...config, 
                    contasPadrao: { ...config.contasPadrao, banco: value }
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {contas.map(conta => (
                    <SelectItem key={conta.id} value={conta.id}>
                      {conta.codigo} - {conta.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="clientesReceber">Clientes a Receber</Label>
              <Select
                value={config.contasPadrao.clientesReceber}
                onValueChange={(value) => 
                  setConfig({ 
                    ...config, 
                    contasPadrao: { ...config.contasPadrao, clientesReceber: value }
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {contas.map(conta => (
                    <SelectItem key={conta.id} value={conta.id}>
                      {conta.codigo} - {conta.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fornecedoresPagar">Fornecedores a Pagar</Label>
              <Select
                value={config.contasPadrao.fornecedoresPagar}
                onValueChange={(value) => 
                  setConfig({ 
                    ...config, 
                    contasPadrao: { ...config.contasPadrao, fornecedoresPagar: value }
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {contas.map(conta => (
                    <SelectItem key={conta.id} value={conta.id}>
                      {conta.codigo} - {conta.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="receitaVendas">Receita de Vendas</Label>
              <Select
                value={config.contasPadrao.receitaVendas}
                onValueChange={(value) => 
                  setConfig({ 
                    ...config, 
                    contasPadrao: { ...config.contasPadrao, receitaVendas: value }
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {contas.map(conta => (
                    <SelectItem key={conta.id} value={conta.id}>
                      {conta.codigo} - {conta.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="custoVendas">Custo de Vendas</Label>
              <Select
                value={config.contasPadrao.custoVendas}
                onValueChange={(value) => 
                  setConfig({ 
                    ...config, 
                    contasPadrao: { ...config.contasPadrao, custoVendas: value }
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {contas.map(conta => (
                    <SelectItem key={conta.id} value={conta.id}>
                      {conta.codigo} - {conta.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Integração Automática</CardTitle>
          <CardDescription>
            Configure quais módulos devem gerar lançamentos contábeis automaticamente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="vendas">Vendas</Label>
              <p className="text-sm text-muted-foreground">
                Gerar lançamentos automáticos para vendas
              </p>
            </div>
            <Switch
              id="vendas"
              checked={config.integracaoAutomatica.vendas}
              onCheckedChange={(checked) => 
                setConfig({ 
                  ...config, 
                  integracaoAutomatica: { ...config.integracaoAutomatica, vendas: checked }
                })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="compras">Compras</Label>
              <p className="text-sm text-muted-foreground">
                Gerar lançamentos automáticos para compras
              </p>
            </div>
            <Switch
              id="compras"
              checked={config.integracaoAutomatica.compras}
              onCheckedChange={(checked) => 
                setConfig({ 
                  ...config, 
                  integracaoAutomatica: { ...config.integracaoAutomatica, compras: checked }
                })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="pagamentos">Pagamentos</Label>
              <p className="text-sm text-muted-foreground">
                Gerar lançamentos automáticos para pagamentos
              </p>
            </div>
            <Switch
              id="pagamentos"
              checked={config.integracaoAutomatica.pagamentos}
              onCheckedChange={(checked) => 
                setConfig({ 
                  ...config, 
                  integracaoAutomatica: { ...config.integracaoAutomatica, pagamentos: checked }
                })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="recebimentos">Recebimentos</Label>
              <p className="text-sm text-muted-foreground">
                Gerar lançamentos automáticos para recebimentos
              </p>
            </div>
            <Switch
              id="recebimentos"
              checked={config.integracaoAutomatica.recebimentos}
              onCheckedChange={(checked) => 
                setConfig({ 
                  ...config, 
                  integracaoAutomatica: { ...config.integracaoAutomatica, recebimentos: checked }
                })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="estoque">Movimentação de Estoque</Label>
              <p className="text-sm text-muted-foreground">
                Gerar lançamentos automáticos para movimentações de estoque
              </p>
            </div>
            <Switch
              id="estoque"
              checked={config.integracaoAutomatica.estoque}
              onCheckedChange={(checked) => 
                setConfig({ 
                  ...config, 
                  integracaoAutomatica: { ...config.integracaoAutomatica, estoque: checked }
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} size="lg">
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
}
