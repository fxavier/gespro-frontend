'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import {
	Plus,
	Edit,
	Trash2,
	Search,
	BookOpen,
	ChevronRight,
	ChevronDown,
} from 'lucide-react';
import { PlanoContas } from '@/types/contabilidade';

export default function PlanoContasPage() {
	const [contas, setContas] = useState<PlanoContas[]>([]);
	const [filteredContas, setFilteredContas] = useState<PlanoContas[]>([]);
	const [searchTerm, setSearchTerm] = useState('');
	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [editingConta, setEditingConta] = useState<PlanoContas | null>(null);
	const [expandedContas, setExpandedContas] = useState<Set<string>>(new Set());
	const [formData, setFormData] = useState({
		codigo: '',
		nome: '',
		tipo: 'ativo' as PlanoContas['tipo'],
		natureza: 'devedora' as PlanoContas['natureza'],
		contaPaiId: '',
		aceitaLancamento: true,
		ativo: true,
	});

	useEffect(() => {
		loadContas();
	}, []);

	useEffect(() => {
		filterContas();
	}, [searchTerm, contas]);

	const loadContas = () => {
		const stored = localStorage.getItem('plano_contas');
		if (stored) {
			const parsed = JSON.parse(stored);
			setContas(parsed);
		} else {
			const contasIniciais = createContasIniciais();
			setContas(contasIniciais);
			localStorage.setItem('plano_contas', JSON.stringify(contasIniciais));
		}
	};

	const createContasIniciais = (): PlanoContas[] => {
		const now = new Date().toISOString();
		return [
			{
				id: '1',
				tenantId: 'default',
				codigo: '1',
				nome: 'ATIVO',
				tipo: 'ativo',
				natureza: 'devedora',
				nivel: 1,
				aceitaLancamento: false,
				ativo: true,
				saldo: 0,
				dataCriacao: now,
				dataAtualizacao: now,
			},
			{
				id: '1.1',
				tenantId: 'default',
				codigo: '1.1',
				nome: 'ATIVO CIRCULANTE',
				tipo: 'ativo',
				natureza: 'devedora',
				nivel: 2,
				contaPaiId: '1',
				aceitaLancamento: false,
				ativo: true,
				saldo: 0,
				dataCriacao: now,
				dataAtualizacao: now,
			},
			{
				id: '1.1.1',
				tenantId: 'default',
				codigo: '1.1.1',
				nome: 'Caixa',
				tipo: 'ativo',
				natureza: 'devedora',
				nivel: 3,
				contaPaiId: '1.1',
				aceitaLancamento: true,
				ativo: true,
				saldo: 0,
				dataCriacao: now,
				dataAtualizacao: now,
			},
			{
				id: '1.1.2',
				tenantId: 'default',
				codigo: '1.1.2',
				nome: 'Bancos',
				tipo: 'ativo',
				natureza: 'devedora',
				nivel: 3,
				contaPaiId: '1.1',
				aceitaLancamento: true,
				ativo: true,
				saldo: 0,
				dataCriacao: now,
				dataAtualizacao: now,
			},
			{
				id: '2',
				tenantId: 'default',
				codigo: '2',
				nome: 'PASSIVO',
				tipo: 'passivo',
				natureza: 'credora',
				nivel: 1,
				aceitaLancamento: false,
				ativo: true,
				saldo: 0,
				dataCriacao: now,
				dataAtualizacao: now,
			},
			{
				id: '3',
				tenantId: 'default',
				codigo: '3',
				nome: 'RECEITAS',
				tipo: 'receita',
				natureza: 'credora',
				nivel: 1,
				aceitaLancamento: false,
				ativo: true,
				saldo: 0,
				dataCriacao: now,
				dataAtualizacao: now,
			},
			{
				id: '4',
				tenantId: 'default',
				codigo: '4',
				nome: 'DESPESAS',
				tipo: 'despesa',
				natureza: 'devedora',
				nivel: 1,
				aceitaLancamento: false,
				ativo: true,
				saldo: 0,
				dataCriacao: now,
				dataAtualizacao: now,
			},
		];
	};

	const filterContas = () => {
		if (!searchTerm) {
			setFilteredContas(contas);
			return;
		}

		const term = searchTerm.toLowerCase();
		const filtered = contas.filter(
			(conta) =>
				conta.codigo.toLowerCase().includes(term) ||
				conta.nome.toLowerCase().includes(term)
		);
		setFilteredContas(filtered);
	};

	const handleSubmit = () => {
		if (!formData.codigo || !formData.nome) {
			toast.error('Preencha todos os campos obrigatórios');
			return;
		}

		const now = new Date().toISOString();

		if (editingConta) {
			const updated = contas.map((c) =>
				c.id === editingConta.id
					? { ...c, ...formData, dataAtualizacao: now }
					: c
			);
			setContas(updated);
			localStorage.setItem('plano_contas', JSON.stringify(updated));
			toast.success('Conta atualizada com sucesso');
		} else {
			const nivel = formData.contaPaiId
				? (contas.find((c) => c.id === formData.contaPaiId)?.nivel || 0) + 1
				: 1;

			const novaConta: PlanoContas = {
				id: formData.codigo,
				tenantId: 'default',
				...formData,
				nivel,
				saldo: 0,
				dataCriacao: now,
				dataAtualizacao: now,
			};

			const updated = [...contas, novaConta];
			setContas(updated);
			localStorage.setItem('plano_contas', JSON.stringify(updated));
			toast.success('Conta criada com sucesso');
		}

		resetForm();
		setIsDialogOpen(false);
	};

	const handleEdit = (conta: PlanoContas) => {
		setEditingConta(conta);
		setFormData({
			codigo: conta.codigo,
			nome: conta.nome,
			tipo: conta.tipo,
			natureza: conta.natureza,
			contaPaiId: conta.contaPaiId || '',
			aceitaLancamento: conta.aceitaLancamento,
			ativo: conta.ativo,
		});
		setIsDialogOpen(true);
	};

	const handleDelete = (id: string) => {
		const hasFilhos = contas.some((c) => c.contaPaiId === id);
		if (hasFilhos) {
			toast.error('Não é possível excluir uma conta que possui subcontas');
			return;
		}

		const updated = contas.filter((c) => c.id !== id);
		setContas(updated);
		localStorage.setItem('plano_contas', JSON.stringify(updated));
		toast.success('Conta excluída com sucesso');
	};

	const resetForm = () => {
		setFormData({
			codigo: '',
			nome: '',
			tipo: 'ativo',
			natureza: 'devedora',
			contaPaiId: '',
			aceitaLancamento: true,
			ativo: true,
		});
		setEditingConta(null);
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
		const contasNivel = filteredContas.filter(
			(c) => c.contaPaiId === contaPaiId
		);

		return contasNivel.map((conta) => {
			const hasFilhos = filteredContas.some((c) => c.contaPaiId === conta.id);
			const isExpanded = expandedContas.has(conta.id);

			return (
				<div key={conta.id}>
					<div
						className='flex items-center justify-between p-3 hover:bg-accent rounded-lg transition-colors'
						style={{ paddingLeft: `${nivel * 1.5}rem` }}
					>
						<div className='flex items-center gap-3 flex-1'>
							{hasFilhos ? (
								<Button
									variant='ghost'
									size='sm'
									className='h-6 w-6 p-0'
									onClick={() => toggleExpand(conta.id)}
								>
									{isExpanded ? (
										<ChevronDown className='h-4 w-4' />
									) : (
										<ChevronRight className='h-4 w-4' />
									)}
								</Button>
							) : (
								<div className='w-6' />
							)}

							<div className='flex-1'>
								<div className='flex items-center gap-2'>
									<span className='font-mono text-sm font-medium'>
										{conta.codigo}
									</span>
									<span className='font-medium'>{conta.nome}</span>
									{!conta.ativo && <Badge variant='secondary'>Inativa</Badge>}
								</div>
								<div className='flex items-center gap-2 mt-1'>
									<Badge variant='outline' className='text-xs'>
										{conta.tipo.replace('_', ' ').toUpperCase()}
									</Badge>
									<Badge variant='outline' className='text-xs'>
										{conta.natureza}
									</Badge>
									{conta.aceitaLancamento && (
										<Badge variant='secondary' className='text-xs'>
											Aceita Lançamento
										</Badge>
									)}
								</div>
							</div>

							<div className='text-right'>
								<div className='font-semibold'>
									{new Intl.NumberFormat('pt-MZ', {
										style: 'currency',
										currency: 'MZN',
									}).format(conta.saldo)}
								</div>
							</div>
						</div>

						<div className='flex items-center gap-2 ml-4'>
							<Button
								variant='ghost'
								size='sm'
								onClick={() => handleEdit(conta)}
							>
								<Edit className='h-4 w-4' />
							</Button>
							<Button
								variant='ghost'
								size='sm'
								onClick={() => handleDelete(conta.id)}
							>
								<Trash2 className='h-4 w-4 text-destructive' />
							</Button>
						</div>
					</div>

					{hasFilhos && isExpanded && renderContaTree(conta.id, nivel + 1)}
				</div>
			);
		});
	};

	return (
		<div className='container mx-auto p-6 space-y-6'>
			<div className='flex items-center justify-between'>
				<div>
					<h1 className='text-3xl font-bold flex items-center gap-2'>
						<BookOpen className='h-8 w-8' />
						Plano de Contas
					</h1>
					<p className='text-muted-foreground mt-1'>
						Gerencie a estrutura de contas contabilísticas
					</p>
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
							Nova Conta
						</Button>
					</DialogTrigger>
					<DialogContent className='max-w-2xl'>
						<DialogHeader>
							<DialogTitle>
								{editingConta ? 'Editar Conta' : 'Nova Conta'}
							</DialogTitle>
						</DialogHeader>

						<div className='grid gap-4 py-4'>
							<div className='grid grid-cols-2 gap-4'>
								<div className='space-y-2'>
									<Label htmlFor='codigo'>Código *</Label>
									<Input
										id='codigo'
										value={formData.codigo}
										onChange={(e) =>
											setFormData({ ...formData, codigo: e.target.value })
										}
										placeholder='Ex: 1.1.1'
									/>
								</div>

								<div className='space-y-2'>
									<Label htmlFor='contaPai'>Conta Mãe</Label>
									<Select
										value={formData.contaPaiId}
										onValueChange={(value) =>
											setFormData({ ...formData, contaPaiId: value })
										}
									>
										<SelectTrigger>
											<SelectValue placeholder='Selecione (opcional)' />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value=''>Nenhuma</SelectItem>
											{contas
												.filter((c) => !c.aceitaLancamento)
												.map((conta) => (
													<SelectItem key={conta.id} value={conta.id}>
														{conta.codigo} - {conta.nome}
													</SelectItem>
												))}
										</SelectContent>
									</Select>
								</div>
							</div>

							<div className='space-y-2'>
								<Label htmlFor='nome'>Nome da Conta *</Label>
								<Input
									id='nome'
									value={formData.nome}
									onChange={(e) =>
										setFormData({ ...formData, nome: e.target.value })
									}
									placeholder='Ex: Caixa Geral'
								/>
							</div>

							<div className='grid grid-cols-2 gap-4'>
								<div className='space-y-2'>
									<Label htmlFor='tipo'>Tipo *</Label>
									<Select
										value={formData.tipo}
										onValueChange={(value: PlanoContas['tipo']) =>
											setFormData({ ...formData, tipo: value })
										}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value='ativo'>Ativo</SelectItem>
											<SelectItem value='passivo'>Passivo</SelectItem>
											<SelectItem value='patrimonio_liquido'>
												Patrimônio Líquido
											</SelectItem>
											<SelectItem value='receita'>Receita</SelectItem>
											<SelectItem value='despesa'>Despesa</SelectItem>
										</SelectContent>
									</Select>
								</div>

								<div className='space-y-2'>
									<Label htmlFor='natureza'>Natureza *</Label>
									<Select
										value={formData.natureza}
										onValueChange={(value: PlanoContas['natureza']) =>
											setFormData({ ...formData, natureza: value })
										}
									>
										<SelectTrigger>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value='devedora'>Devedora</SelectItem>
											<SelectItem value='credora'>Credora</SelectItem>
										</SelectContent>
									</Select>
								</div>
							</div>

							<div className='flex items-center justify-between'>
								<div className='flex items-center space-x-2'>
									<Switch
										id='aceitaLancamento'
										checked={formData.aceitaLancamento}
										onCheckedChange={(checked) =>
											setFormData({ ...formData, aceitaLancamento: checked })
										}
									/>
									<Label htmlFor='aceitaLancamento'>Aceita Lançamento</Label>
								</div>

								<div className='flex items-center space-x-2'>
									<Switch
										id='ativo'
										checked={formData.ativo}
										onCheckedChange={(checked) =>
											setFormData({ ...formData, ativo: checked })
										}
									/>
									<Label htmlFor='ativo'>Ativa</Label>
								</div>
							</div>
						</div>

						<DialogFooter>
							<Button variant='outline' onClick={() => setIsDialogOpen(false)}>
								Cancelar
							</Button>
							<Button onClick={handleSubmit}>
								{editingConta ? 'Atualizar' : 'Criar'}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Contas Cadastradas</CardTitle>
					<CardDescription>
						Estrutura hierárquica do plano de contas
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className='mb-4'>
						<div className='relative'>
							<Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground' />
							<Input
								placeholder='Buscar por código ou nome...'
								value={searchTerm}
								onChange={(e) => setSearchTerm(e.target.value)}
								className='pl-10'
							/>
						</div>
					</div>

					<div className='space-y-1'>{renderContaTree()}</div>

					{filteredContas.length === 0 && (
						<div className='text-center py-12 text-muted-foreground'>
							Nenhuma conta encontrada
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
