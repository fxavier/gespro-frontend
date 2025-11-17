'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/components/ui/dialog';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
	Wallet,
	Plus,
	DollarSign,
	TrendingUp,
	TrendingDown,
	AlertCircle,
	Edit,
	Trash2,
	CheckCircle,
} from 'lucide-react';
import {
	OrcamentoStorage,
	ProjetoStorage,
} from '@/lib/storage/projeto-storage';
import {
	OrcamentoProjeto,
	CategoriaOrcamento,
	ItemOrcamento,
	Projeto,
} from '@/types/projeto';
import { toast } from 'sonner';

export default function OrcamentosPage() {
	const [orcamentos, setOrcamentos] = useState<OrcamentoProjeto[]>([]);
	const [projetos, setProjetos] = useState<Projeto[]>([]);
	const [projetoFilter, setProjetoFilter] = useState<string>('todos');
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
	const [editingOrcamento, setEditingOrcamento] =
		useState<OrcamentoProjeto | null>(null);
	const [categoriaAtual, setCategoriaAtual] =
		useState<CategoriaOrcamento | null>(null);
	const [formData, setFormData] = useState({
		projetoId: '',
		observacoes: '',
	});
	const [itemFormData, setItemFormData] = useState({
		descricao: '',
		quantidade: '',
		valorUnitario: '',
		fornecedor: '',
		observacoes: '',
	});

	useEffect(() => {
		loadData();
	}, []);

	const loadData = () => {
		const orcamentosData = OrcamentoStorage.getOrcamentos();
		const projetosData = ProjetoStorage.getProjetos();
		setOrcamentos(orcamentosData);
		setProjetos(projetosData);
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();

		if (!formData.projetoId) {
			toast.error('Selecione um projeto');
			return;
		}

		const projeto = projetos.find((p) => p.id === formData.projetoId);
		if (!projeto) {
			toast.error('Projeto não encontrado');
			return;
		}

		const categoriasIniciais: CategoriaOrcamento[] = [
			{
				id: `cat_${Date.now()}_1`,
				nome: 'Mão de Obra',
				tipo: 'mao_obra',
				valorPlanejado: 0,
				valorUtilizado: 0,
				valorRestante: 0,
				itens: [],
			},
			{
				id: `cat_${Date.now()}_2`,
				nome: 'Materiais',
				tipo: 'material',
				valorPlanejado: 0,
				valorUtilizado: 0,
				valorRestante: 0,
				itens: [],
			},
			{
				id: `cat_${Date.now()}_3`,
				nome: 'Equipamentos',
				tipo: 'equipamento',
				valorPlanejado: 0,
				valorUtilizado: 0,
				valorRestante: 0,
				itens: [],
			},
			{
				id: `cat_${Date.now()}_4`,
				nome: 'Serviços',
				tipo: 'servico',
				valorPlanejado: 0,
				valorUtilizado: 0,
				valorRestante: 0,
				itens: [],
			},
		];

		if (editingOrcamento) {
			const updated = OrcamentoStorage.updateOrcamento(editingOrcamento.id, {
				...formData,
				projetoNome: projeto.nome,
			});
			if (updated) {
				toast.success('Orçamento atualizado com sucesso');
			}
		} else {
			const novoOrcamento: OrcamentoProjeto = {
				id: `orc_${Date.now()}`,
				tenantId: 'tenant_1',
				projetoId: formData.projetoId,
				projetoNome: projeto.nome,
				versao: 1,
				status: 'rascunho',
				categorias: categoriasIniciais,
				totalPlanejado: 0,
				totalUtilizado: 0,
				totalRestante: 0,
				observacoes: formData.observacoes,
				dataCriacao: new Date().toISOString(),
				dataAtualizacao: new Date().toISOString(),
			};
			OrcamentoStorage.addOrcamento(novoOrcamento);
			toast.success('Orçamento criado com sucesso');
		}

		loadData();
		setIsDialogOpen(false);
		resetForm();
	};

	const handleAddItem = (e: React.FormEvent) => {
		e.preventDefault();

		if (
			!itemFormData.descricao ||
			!itemFormData.quantidade ||
			!itemFormData.valorUnitario
		) {
			toast.error('Preencha todos os campos obrigatórios');
			return;
		}

		if (!editingOrcamento || !categoriaAtual) {
			toast.error('Selecione uma categoria');
			return;
		}

		const quantidade = parseFloat(itemFormData.quantidade);
		const valorUnitario = parseFloat(itemFormData.valorUnitario);
		const valorTotal = quantidade * valorUnitario;

		const novoItem: ItemOrcamento = {
			id: `item_${Date.now()}`,
			descricao: itemFormData.descricao,
			quantidade,
			valorUnitario,
			valorTotal,
			fornecedor: itemFormData.fornecedor,
			observacoes: itemFormData.observacoes,
		};

		const categoriasAtualizadas = editingOrcamento.categorias.map((cat) => {
			if (cat.id === categoriaAtual.id) {
				const novosItens = [...cat.itens, novoItem];
				const valorPlanejado = novosItens.reduce(
					(sum, item) => sum + item.valorTotal,
					0
				);
				return {
					...cat,
					itens: novosItens,
					valorPlanejado,
					valorRestante: valorPlanejado - cat.valorUtilizado,
				};
			}
			return cat;
		});

		const totalPlanejado = categoriasAtualizadas.reduce(
			(sum, cat) => sum + cat.valorPlanejado,
			0
		);
		const totalUtilizado = categoriasAtualizadas.reduce(
			(sum, cat) => sum + cat.valorUtilizado,
			0
		);

		const updated = OrcamentoStorage.updateOrcamento(editingOrcamento.id, {
			categorias: categoriasAtualizadas,
			totalPlanejado,
			totalUtilizado,
			totalRestante: totalPlanejado - totalUtilizado,
		});

		if (updated) {
			setEditingOrcamento(updated);
			toast.success('Item adicionado com sucesso');
		}

		loadData();
		setIsItemDialogOpen(false);
		resetItemForm();
	};

	const handleDeleteItem = (categoriaId: string, itemId: string) => {
		if (!editingOrcamento) return;

		const categoriasAtualizadas = editingOrcamento.categorias.map((cat) => {
			if (cat.id === categoriaId) {
				const novosItens = cat.itens.filter((item) => item.id !== itemId);
				const valorPlanejado = novosItens.reduce(
					(sum, item) => sum + item.valorTotal,
					0
				);
				return {
					...cat,
					itens: novosItens,
					valorPlanejado,
					valorRestante: valorPlanejado - cat.valorUtilizado,
				};
			}
			return cat;
		});

		const totalPlanejado = categoriasAtualizadas.reduce(
			(sum, cat) => sum + cat.valorPlanejado,
			0
		);
		const totalUtilizado = categoriasAtualizadas.reduce(
			(sum, cat) => sum + cat.valorUtilizado,
			0
		);

		const updated = OrcamentoStorage.updateOrcamento(editingOrcamento.id, {
			categorias: categoriasAtualizadas,
			totalPlanejado,
			totalUtilizado,
			totalRestante: totalPlanejado - totalUtilizado,
		});

		if (updated) {
			setEditingOrcamento(updated);
			toast.success('Item removido com sucesso');
		}

		loadData();
	};

	const handleAprovar = (id: string) => {
		const updated = OrcamentoStorage.updateOrcamento(id, {
			status: 'aprovado',
			aprovadoPorId: 'user_1',
			aprovadoPorNome: 'Gestor',
			dataAprovacao: new Date().toISOString(),
		});
		if (updated) {
			toast.success('Orçamento aprovado com sucesso');
			loadData();
		}
	};

	const resetForm = () => {
		setEditingOrcamento(null);
		setFormData({
			projetoId: '',
			observacoes: '',
		});
	};

	const resetItemForm = () => {
		setCategoriaAtual(null);
		setItemFormData({
			descricao: '',
			quantidade: '',
			valorUnitario: '',
			fornecedor: '',
			observacoes: '',
		});
	};

	const orcamentosFiltrados =
		projetoFilter === 'todos'
			? orcamentos
			: orcamentos.filter((o) => o.projetoId === projetoFilter);

	const totalGeral = orcamentosFiltrados.reduce(
		(sum, o) => sum + o.totalPlanejado,
		0
	);
	const utilizadoGeral = orcamentosFiltrados.reduce(
		(sum, o) => sum + o.totalUtilizado,
		0
	);
	const restanteGeral = totalGeral - utilizadoGeral;
	const percentualUtilizado =
		totalGeral > 0 ? (utilizadoGeral / totalGeral) * 100 : 0;

	return (
		<div className='container mx-auto p-6 space-y-6'>
			<div className='flex justify-between items-center'>
				<div>
					<h1 className='text-3xl font-bold'>Orçamentos de Projetos</h1>
					<p className='text-muted-foreground'>Gestão e controlo orçamental</p>
				</div>
				<Dialog
					open={isDialogOpen}
					onOpenChange={(open) => {
						setIsDialogOpen(open);
						if (!open) resetForm();
					}}
				>
					<DialogTrigger asChild>
						<Button>
							<Plus className='h-4 w-4 mr-2' />
							Novo Orçamento
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Novo Orçamento</DialogTitle>
						</DialogHeader>
						<form onSubmit={handleSubmit} className='space-y-4'>
							<div className='space-y-2'>
								<Label htmlFor='projetoId'>Projeto *</Label>
								<Select
									value={formData.projetoId}
									onValueChange={(value) =>
										setFormData({ ...formData, projetoId: value })
									}
								>
									<SelectTrigger>
										<SelectValue placeholder='Selecione um projeto' />
									</SelectTrigger>
									<SelectContent>
										{projetos.map((projeto) => (
											<SelectItem key={projeto.id} value={projeto.id}>
												{projeto.codigo} - {projeto.nome}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>

							<div className='space-y-2'>
								<Label htmlFor='observacoes'>Observações</Label>
								<Textarea
									id='observacoes'
									value={formData.observacoes}
									onChange={(e) =>
										setFormData({ ...formData, observacoes: e.target.value })
									}
									placeholder='Observações sobre o orçamento'
									rows={3}
								/>
							</div>

							<div className='flex justify-end gap-4'>
								<Button
									type='button'
									variant='outline'
									onClick={() => setIsDialogOpen(false)}
								>
									Cancelar
								</Button>
								<Button type='submit'>Criar Orçamento</Button>
							</div>
						</form>
					</DialogContent>
				</Dialog>
			</div>

			<div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
				<Card>
					<CardContent className='pt-6'>
						<div className='flex items-center justify-between'>
							<div>
								<p className='text-sm text-muted-foreground'>Total Planeado</p>
								<p className='text-2xl font-bold'>
									MT {totalGeral.toLocaleString('pt-MZ')}
								</p>
							</div>
							<Wallet className='h-10 w-10 text-blue-600' />
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardContent className='pt-6'>
						<div className='flex items-center justify-between'>
							<div>
								<p className='text-sm text-muted-foreground'>Total Utilizado</p>
								<p className='text-2xl font-bold'>
									MT {utilizadoGeral.toLocaleString('pt-MZ')}
								</p>
							</div>
							<DollarSign className='h-10 w-10 text-orange-600' />
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardContent className='pt-6'>
						<div className='flex items-center justify-between'>
							<div>
								<p className='text-sm text-muted-foreground'>Saldo Restante</p>
								<p className='text-2xl font-bold'>
									MT {restanteGeral.toLocaleString('pt-MZ')}
								</p>
							</div>
							{restanteGeral >= 0 ? (
								<TrendingUp className='h-10 w-10 text-green-600' />
							) : (
								<TrendingDown className='h-10 w-10 text-red-600' />
							)}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardContent className='pt-6'>
						<div className='flex items-center justify-between'>
							<div>
								<p className='text-sm text-muted-foreground'>% Utilizado</p>
								<p className='text-2xl font-bold'>
									{percentualUtilizado.toFixed(1)}%
								</p>
							</div>
							{percentualUtilizado > 90 ? (
								<AlertCircle className='h-10 w-10 text-red-600' />
							) : (
								<CheckCircle className='h-10 w-10 text-green-600' />
							)}
						</div>
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Filtrar por Projeto</CardTitle>
				</CardHeader>
				<CardContent>
					<Select value={projetoFilter} onValueChange={setProjetoFilter}>
						<SelectTrigger>
							<SelectValue placeholder='Todos os projetos' />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value='todos'>Todos os Projetos</SelectItem>
							{projetos.map((projeto) => (
								<SelectItem key={projeto.id} value={projeto.id}>
									{projeto.nome}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</CardContent>
			</Card>

			<div className='space-y-4'>
				{orcamentosFiltrados.length === 0 ? (
					<Card>
						<CardContent className='py-12 text-center text-muted-foreground'>
							<Wallet className='h-16 w-16 mx-auto mb-4 opacity-50' />
							<p className='text-lg font-medium'>Nenhum orçamento encontrado</p>
							<p className='text-sm'>Crie um novo orçamento para começar</p>
						</CardContent>
					</Card>
				) : (
					orcamentosFiltrados.map((orcamento) => (
						<Card key={orcamento.id}>
							<CardHeader>
								<div className='flex justify-between items-start'>
									<div>
										<CardTitle>{orcamento.projetoNome}</CardTitle>
										<p className='text-sm text-muted-foreground mt-1'>
											Versão {orcamento.versao} • Criado em{' '}
											{new Date(orcamento.dataCriacao).toLocaleDateString(
												'pt-PT'
											)}
										</p>
									</div>
									<div className='flex gap-2 items-center'>
										<Badge
											variant={
												orcamento.status === 'aprovado'
													? 'default'
													: 'secondary'
											}
										>
											{orcamento.status === 'aprovado'
												? 'Aprovado'
												: 'Rascunho'}
										</Badge>
										{orcamento.status !== 'aprovado' && (
											<Button
												variant='outline'
												size='sm'
												onClick={() => handleAprovar(orcamento.id)}
											>
												<CheckCircle className='h-4 w-4 mr-1' />
												Aprovar
											</Button>
										)}
										<Button
											variant='outline'
											size='sm'
											onClick={() => {
												setEditingOrcamento(orcamento);
											}}
										>
											Ver Detalhes
										</Button>
									</div>
								</div>
							</CardHeader>
							<CardContent>
								<div className='grid grid-cols-3 gap-4 mb-4'>
									<div>
										<p className='text-sm text-muted-foreground'>
											Total Planeado
										</p>
										<p className='text-xl font-bold'>
											MT {orcamento.totalPlanejado.toLocaleString('pt-MZ')}
										</p>
									</div>
									<div>
										<p className='text-sm text-muted-foreground'>
											Total Utilizado
										</p>
										<p className='text-xl font-bold'>
											MT {orcamento.totalUtilizado.toLocaleString('pt-MZ')}
										</p>
									</div>
									<div>
										<p className='text-sm text-muted-foreground'>
											Saldo Restante
										</p>
										<p
											className={`text-xl font-bold ${
												orcamento.totalRestante < 0
													? 'text-red-600'
													: 'text-green-600'
											}`}
										>
											MT {orcamento.totalRestante.toLocaleString('pt-MZ')}
										</p>
									</div>
								</div>
								<div className='w-full bg-gray-200 rounded-full h-3'>
									<div
										className={`h-3 rounded-full ${
											(orcamento.totalUtilizado / orcamento.totalPlanejado) *
												100 >
											90
												? 'bg-red-600'
												: 'bg-blue-600'
										}`}
										style={{
											width: `${Math.min(
												(orcamento.totalUtilizado / orcamento.totalPlanejado) *
													100,
												100
											)}%`,
										}}
									/>
								</div>
							</CardContent>
						</Card>
					))
				)}
			</div>

			{editingOrcamento && (
				<Dialog
					open={!!editingOrcamento}
					onOpenChange={() => setEditingOrcamento(null)}
				>
					<DialogContent className='max-w-6xl max-h-[90vh] overflow-y-auto'>
						<DialogHeader>
							<DialogTitle>
								Detalhes do Orçamento: {editingOrcamento.projetoNome}
							</DialogTitle>
						</DialogHeader>
						<div className='space-y-6'>
							{editingOrcamento.categorias.map((categoria) => (
								<Card key={categoria.id}>
									<CardHeader>
										<div className='flex justify-between items-center'>
											<CardTitle className='text-lg'>
												{categoria.nome}
											</CardTitle>
											<Button
												size='sm'
												onClick={() => {
													setCategoriaAtual(categoria);
													setIsItemDialogOpen(true);
												}}
											>
												<Plus className='h-4 w-4 mr-1' />
												Adicionar Item
											</Button>
										</div>
									</CardHeader>
									<CardContent>
										<div className='grid grid-cols-3 gap-4 mb-4'>
											<div>
												<p className='text-sm text-muted-foreground'>
													Planeado
												</p>
												<p className='font-bold'>
													MT {categoria.valorPlanejado.toLocaleString('pt-MZ')}
												</p>
											</div>
											<div>
												<p className='text-sm text-muted-foreground'>
													Utilizado
												</p>
												<p className='font-bold'>
													MT {categoria.valorUtilizado.toLocaleString('pt-MZ')}
												</p>
											</div>
											<div>
												<p className='text-sm text-muted-foreground'>
													Restante
												</p>
												<p className='font-bold'>
													MT {categoria.valorRestante.toLocaleString('pt-MZ')}
												</p>
											</div>
										</div>
										{categoria.itens.length > 0 && (
											<Table>
												<TableHeader>
													<TableRow>
														<TableHead>Descrição</TableHead>
														<TableHead>Quantidade</TableHead>
														<TableHead>Valor Unit.</TableHead>
														<TableHead>Total</TableHead>
														<TableHead>Fornecedor</TableHead>
														<TableHead className='text-right'>Ações</TableHead>
													</TableRow>
												</TableHeader>
												<TableBody>
													{categoria.itens.map((item) => (
														<TableRow key={item.id}>
															<TableCell>{item.descricao}</TableCell>
															<TableCell>{item.quantidade}</TableCell>
															<TableCell>
																MT {item.valorUnitario.toLocaleString('pt-MZ')}
															</TableCell>
															<TableCell className='font-medium'>
																MT {item.valorTotal.toLocaleString('pt-MZ')}
															</TableCell>
															<TableCell>{item.fornecedor || '-'}</TableCell>
															<TableCell className='text-right'>
																<Button
																	variant='ghost'
																	size='icon'
																	onClick={() =>
																		handleDeleteItem(categoria.id, item.id)
																	}
																>
																	<Trash2 className='h-4 w-4 text-red-600' />
																</Button>
															</TableCell>
														</TableRow>
													))}
												</TableBody>
											</Table>
										)}
									</CardContent>
								</Card>
							))}
						</div>
					</DialogContent>
				</Dialog>
			)}

			<Dialog open={isItemDialogOpen} onOpenChange={setIsItemDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Adicionar Item - {categoriaAtual?.nome}</DialogTitle>
					</DialogHeader>
					<form onSubmit={handleAddItem} className='space-y-4'>
						<div className='space-y-2'>
							<Label htmlFor='descricao'>Descrição *</Label>
							<Input
								id='descricao'
								value={itemFormData.descricao}
								onChange={(e) =>
									setItemFormData({
										...itemFormData,
										descricao: e.target.value,
									})
								}
								placeholder='Descrição do item'
								required
							/>
						</div>

						<div className='grid grid-cols-2 gap-4'>
							<div className='space-y-2'>
								<Label htmlFor='quantidade'>Quantidade *</Label>
								<Input
									id='quantidade'
									type='number'
									step='0.01'
									value={itemFormData.quantidade}
									onChange={(e) =>
										setItemFormData({
											...itemFormData,
											quantidade: e.target.value,
										})
									}
									placeholder='0'
									required
								/>
							</div>

							<div className='space-y-2'>
								<Label htmlFor='valorUnitario'>Valor Unitário (MT) *</Label>
								<Input
									id='valorUnitario'
									type='number'
									step='0.01'
									value={itemFormData.valorUnitario}
									onChange={(e) =>
										setItemFormData({
											...itemFormData,
											valorUnitario: e.target.value,
										})
									}
									placeholder='0.00'
									required
								/>
							</div>
						</div>

						{itemFormData.quantidade && itemFormData.valorUnitario && (
							<div className='text-sm text-muted-foreground'>
								Valor Total: MT{' '}
								{(
									parseFloat(itemFormData.quantidade) *
									parseFloat(itemFormData.valorUnitario)
								).toLocaleString('pt-MZ')}
							</div>
						)}

						<div className='space-y-2'>
							<Label htmlFor='fornecedor'>Fornecedor</Label>
							<Input
								id='fornecedor'
								value={itemFormData.fornecedor}
								onChange={(e) =>
									setItemFormData({
										...itemFormData,
										fornecedor: e.target.value,
									})
								}
								placeholder='Nome do fornecedor'
							/>
						</div>

						<div className='space-y-2'>
							<Label htmlFor='observacoesItem'>Observações</Label>
							<Textarea
								id='observacoesItem'
								value={itemFormData.observacoes}
								onChange={(e) =>
									setItemFormData({
										...itemFormData,
										observacoes: e.target.value,
									})
								}
								placeholder='Observações sobre o item'
								rows={2}
							/>
						</div>

						<div className='flex justify-end gap-4'>
							<Button
								type='button'
								variant='outline'
								onClick={() => setIsItemDialogOpen(false)}
							>
								Cancelar
							</Button>
							<Button type='submit'>Adicionar Item</Button>
						</div>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
