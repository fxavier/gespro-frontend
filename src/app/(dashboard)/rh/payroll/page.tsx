
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PayrollStorage, ColaboradorStorage } from '@/lib/storage/rh-storage';
import { Payroll, Colaborador } from '@/types/rh';
import { 
  Plus, 
  Download, 
  DollarSign,
  TrendingUp,
  TrendingDown,
  FileText,
  Calendar,
  Filter
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/format-currency';
import { usePagination } from '@/hooks/usePagination';
import { DataTablePagination } from '@/components/ui/data-table-pagination';

export default function PayrollPage() {
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [filteredPayrolls, setFilteredPayrolls] = useState<Payroll[]>([]);
  const [mesFilter, setMesFilter] = useState<string>(new Date().getMonth().toString());
  const [anoFilter, setAnoFilter] = useState<string>(new Date().getFullYear().toString());
  const [statusFilter, setStatusFilter] = useState<string>('todos');
  const [showDialog, setShowDialog] = useState(false);
  const [selectedPayroll, setSelectedPayroll] = useState<Payroll | null>(null);
  const [formData, setFormData] = useState<Partial<Payroll>>({});

  const {
    currentPage,
    totalPages,
    itemsPerPage,
    paginatedData,
    totalItems,
    handlePageChange,
    handleItemsPerPageChange,
  } = usePagination({ data: filteredPayrolls, initialItemsPerPage: 10 });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterPayrolls();
  }, [payrolls, mesFilter, anoFilter, statusFilter]);

  const loadData = () => {
    const payrollData = PayrollStorage.getPayrolls();
    const colaboradoresData = ColaboradorStorage.getColaboradores();
    setPayrolls(payrollData);
    setColaboradores(colaboradoresData);
  };

  const filterPayrolls = () => {
    let filtered = [...payrolls];

    if (mesFilter !== 'todos') {
      filtered = filtered.filter(p => p.mesReferencia === mesFilter);
    }

    if (anoFilter !== 'todos') {
      filtered = filtered.filter(p => p.anoReferencia.toString() === anoFilter);
    }

    if (statusFilter !== 'todos') {
      filtered = filtered.filter(p => p.status === statusFilter);
    }

    setFilteredPayrolls(filtered);
  };

  const handleOpenDialog = (payroll?: Payroll) => {
    if (payroll) {
      setSelectedPayroll(payroll);
      setFormData(payroll);
    } else {
      setSelectedPayroll(null);
      const now = new Date();
      setFormData({
        mesReferencia: (now.getMonth() + 1).toString(),
        anoReferencia: now.getFullYear(),
        status: 'pendente',
        descontos: { inss: 0, irps: 0, outros: 0 },
        proventos: { horasExtras: 0, subsidioAlimentacao: 0, subsidioTransporte: 0, subsidioHabitacao: 0, comissoes: 0, bonus: 0, outros: 0 }
      });
    }
    setShowDialog(true);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setSelectedPayroll(null);
    setFormData({});
  };

  const calcularSalarioLiquido = (data: Partial<Payroll>) => {
    const salarioBruto = data.salarioBruto || 0;
    const totalDescontos = Object.values(data.descontos || {}).reduce((a, b) => a + b, 0);
    const totalProventos = Object.values(data.proventos || {}).reduce((a, b) => a + b, 0);
    return salarioBruto + totalProventos - totalDescontos;
  };

  const handleSave = () => {
    if (!formData.colaboradorId || !formData.salarioBruto) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    const salarioLiquido = calcularSalarioLiquido(formData);
    const now = new Date().toISOString();

    if (selectedPayroll) {
      PayrollStorage.updatePayroll(selectedPayroll.id, { ...formData, salarioLiquido });
      toast.success('Folha de pagamento actualizada com sucesso!');
    } else {
      const novoPayroll: Payroll = {
        ...formData,
        id: Date.now().toString(),
        tenantId: 'default',
        salarioLiquido,
        dataCriacao: now,
        dataAtualizacao: now
      } as Payroll;
      
      PayrollStorage.addPayroll(novoPayroll);
      toast.success('Folha de pagamento criada com sucesso!');
    }

    loadData();
    handleCloseDialog();
  };

  const getColaboradorNome = (colaboradorId: string) => {
    const colaborador = colaboradores.find(c => c.id === colaboradorId);
    return colaborador?.nome || 'Desconhecido';
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      pendente: 'secondary',
      processado: 'default',
      pago: 'default',
      cancelado: 'destructive'
    };

    return (
      <Badge variant={variants[status] || 'secondary'}>
        {status}
      </Badge>
    );
  };

  const totalFolha = filteredPayrolls.reduce((acc, p) => acc + p.salarioLiquido, 0);
  const totalDescontos = filteredPayrolls.reduce((acc, p) => 
    acc + Object.values(p.descontos).reduce((a, b) => a + b, 0), 0
  );
  const totalProventos = filteredPayrolls.reduce((acc, p) => 
    acc + Object.values(p.proventos).reduce((a, b) => a + b, 0), 0
  );

  const meses = [
    { value: '1', label: 'Janeiro' },
    { value: '2', label: 'Fevereiro' },
    { value: '3', label: 'Março' },
    { value: '4', label: 'Abril' },
    { value: '5', label: 'Maio' },
    { value: '6', label: 'Junho' },
    { value: '7', label: 'Julho' },
    { value: '8', label: 'Agosto' },
    { value: '9', label: 'Setembro' },
    { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' },
    { value: '12', label: 'Dezembro' }
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Processamento Salarial (Payroll)</h1>
          <p className="text-muted-foreground mt-1">
            Gerir a folha de pagamento dos colaboradores
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Exportar
          </Button>
          <Button onClick={() => handleOpenDialog()} className="gap-2">
            <Plus className="h-4 w-4" />
            Processar Folha
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total da Folha</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(totalFolha)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {filteredPayrolls.length} colaboradores
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Proventos</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(totalProventos)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Horas extras, bónus, comissões
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Descontos</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(totalDescontos)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              INSS, IRPS, Outros
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pagamentos Pendentes</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {filteredPayrolls.filter(p => p.status === 'pendente').length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              A aguardar processamento
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-4">
            <Select value={mesFilter} onValueChange={setMesFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Meses</SelectItem>
                {meses.map(mes => (
                  <SelectItem key={mes.value} value={mes.value}>{mes.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={anoFilter} onValueChange={setAnoFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Anos</SelectItem>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2023">2023</SelectItem>
                <SelectItem value="2022">2022</SelectItem>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os Estados</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="processado">Processado</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="cancelado">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Colaborador</TableHead>
                <TableHead>Período</TableHead>
                <TableHead>Salário Bruto</TableHead>
                <TableHead>Proventos</TableHead>
                <TableHead>Descontos</TableHead>
                <TableHead>Salário Líquido</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acções</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Nenhum registo encontrado
                  </TableCell>
                </TableRow>
              ) : (
                paginatedData.map((payroll) => {
                  const totalProventos = Object.values(payroll.proventos).reduce((a, b) => a + b, 0);
                  const totalDescontos = Object.values(payroll.descontos).reduce((a, b) => a + b, 0);

                  return (
                    <TableRow key={payroll.id}>
                      <TableCell className="font-medium">
                        {getColaboradorNome(payroll.colaboradorId)}
                      </TableCell>
                      <TableCell>
                        {meses.find(m => m.value === payroll.mesReferencia)?.label}/{payroll.anoReferencia}
                      </TableCell>
                      <TableCell>
                        {formatCurrency(payroll.salarioBruto)}
                      </TableCell>
                      <TableCell className="text-green-600">
                        + {formatCurrency(totalProventos)}
                      </TableCell>
                      <TableCell className="text-red-600">
                        - {formatCurrency(totalDescontos)}
                      </TableCell>
                      <TableCell className="font-bold">
                        {formatCurrency(payroll.salarioLiquido)}
                      </TableCell>
                      <TableCell>{getStatusBadge(payroll.status)}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="gap-2">
                          <FileText className="h-4 w-4" />
                          Recibo
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>

          <DataTablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            itemsPerPage={itemsPerPage}
            totalItems={totalItems}
            onPageChange={handlePageChange}
            onItemsPerPageChange={handleItemsPerPageChange}
          />
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedPayroll ? 'Editar Folha de Pagamento' : 'Processar Nova Folha'}
            </DialogTitle>
            <DialogDescription>
              Preencha os dados da folha de pagamento
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="colaboradorId">Colaborador *</Label>
                <Select
                  value={formData.colaboradorId}
                  onValueChange={(value) => {
                    const colaborador = colaboradores.find(c => c.id === value);
                    setFormData({ 
                      ...formData, 
                      colaboradorId: value,
                      salarioBruto: colaborador?.salarioBase || 0
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione" />
                  </SelectTrigger>
                  <SelectContent>
                    {colaboradores.filter(c => c.status === 'activo').map(colaborador => (
                      <SelectItem key={colaborador.id} value={colaborador.id}>
                        {colaborador.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mesReferencia">Mês *</Label>
                <Select
                  value={formData.mesReferencia}
                  onValueChange={(value) => setFormData({ ...formData, mesReferencia: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meses.map(mes => (
                      <SelectItem key={mes.value} value={mes.value}>{mes.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="anoReferencia">Ano *</Label>
                <Input
                  id="anoReferencia"
                  type="number"
                  value={formData.anoReferencia || ''}
                  onChange={(e) => setFormData({ ...formData, anoReferencia: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="salarioBruto">Salário Bruto *</Label>
              <Input
                id="salarioBruto"
                type="number"
                step="0.01"
                value={formData.salarioBruto || ''}
                onChange={(e) => setFormData({ ...formData, salarioBruto: parseFloat(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label>Proventos</Label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="horasExtras" className="text-sm">Horas Extras</Label>
                  <Input
                    id="horasExtras"
                    type="number"
                    step="0.01"
                    value={formData.proventos?.horasExtras || 0}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      proventos: { ...formData.proventos!, horasExtras: parseFloat(e.target.value) || 0 }
                    })}
                  />
                </div>
                <div>
                  <Label htmlFor="subsidioAlimentacao" className="text-sm">Subsídio Alimentação</Label>
                  <Input
                    id="subsidioAlimentacao"
                    type="number"
                    step="0.01"
                    value={formData.proventos?.subsidioAlimentacao || 0}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      proventos: { ...formData.proventos!, subsidioAlimentacao: parseFloat(e.target.value) || 0 }
                    })}
                  />
                </div>
                <div>
                  <Label htmlFor="subsidioTransporte" className="text-sm">Subsídio Transporte</Label>
                  <Input
                    id="subsidioTransporte"
                    type="number"
                    step="0.01"
                    value={formData.proventos?.subsidioTransporte || 0}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      proventos: { ...formData.proventos!, subsidioTransporte: parseFloat(e.target.value) || 0 }
                    })}
                  />
                </div>
                <div>
                  <Label htmlFor="subsidioHabitacao" className="text-sm">Subsídio Habitação</Label>
                  <Input
                    id="subsidioHabitacao"
                    type="number"
                    step="0.01"
                    value={formData.proventos?.subsidioHabitacao || 0}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      proventos: { ...formData.proventos!, subsidioHabitacao: parseFloat(e.target.value) || 0 }
                    })}
                  />
                </div>
                <div>
                  <Label htmlFor="comissoes" className="text-sm">Comissões</Label>
                  <Input
                    id="comissoes"
                    type="number"
                    step="0.01"
                    value={formData.proventos?.comissoes || 0}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      proventos: { ...formData.proventos!, comissoes: parseFloat(e.target.value) || 0 }
                    })}
                  />
                </div>
                <div>
                  <Label htmlFor="bonus" className="text-sm">Bónus</Label>
                  <Input
                    id="bonus"
                    type="number"
                    step="0.01"
                    value={formData.proventos?.bonus || 0}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      proventos: { ...formData.proventos!, bonus: parseFloat(e.target.value) || 0 }
                    })}
                  />
                </div>
                <div>
                  <Label htmlFor="outrosProventos" className="text-sm">Outros</Label>
                  <Input
                    id="outrosProventos"
                    type="number"
                    step="0.01"
                    value={formData.proventos?.outros || 0}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      proventos: { ...formData.proventos!, outros: parseFloat(e.target.value) || 0 }
                    })}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descontos</Label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="inss" className="text-sm">INSS</Label>
                  <Input
                    id="inss"
                    type="number"
                    step="0.01"
                    value={formData.descontos?.inss || 0}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      descontos: { ...formData.descontos!, inss: parseFloat(e.target.value) || 0 }
                    })}
                  />
                </div>
                <div>
                  <Label htmlFor="irps" className="text-sm">IRPS</Label>
                  <Input
                    id="irps"
                    type="number"
                    step="0.01"
                    value={formData.descontos?.irps || 0}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      descontos: { ...formData.descontos!, irps: parseFloat(e.target.value) || 0 }
                    })}
                  />
                </div>
                <div>
                  <Label htmlFor="outrosDescontos" className="text-sm">Outros Descontos</Label>
                  <Input
                    id="outrosDescontos"
                    type="number"
                    step="0.01"
                    value={formData.descontos?.outros || 0}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      descontos: { ...formData.descontos!, outros: parseFloat(e.target.value) || 0 }
                    })}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-muted rounded-lg">
              <div className="flex justify-between items-center">
                <span className="font-semibold">Salário Líquido:</span>
                <span className="text-2xl font-bold text-green-600">
                  {formatCurrency(calcularSalarioLiquido(formData))}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>
              {selectedPayroll ? 'Actualizar' : 'Processar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
