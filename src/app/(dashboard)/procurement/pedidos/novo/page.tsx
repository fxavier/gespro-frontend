'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PedidoCompra, ItemPedidoCompra } from '@/types/procurement';

export default function NovoPedidoPage() {
	const router = useRouter();
	const [loading, setLoading] = useState(false);
	const [itens, setItens] = useState<Partial<ItemPedidoCompra>[]>([
		{
			descricao: '',
			quantidade: 1,
			precoUnitario: 0,
			desconto: 0,
			taxaIva: 16,
		},
	]);
	const [formData, setFormData] = useState<Partial<PedidoCompra>>({
		fornecedorId: '',
		fornecedorNome: '',
		condicoesPagamento: '',
		prazoEntrega: 7,
		enderecoEntrega: '',
		observacoes: '',
	});

	const adicionarItem = () => {
		setItens([
			...itens,
			{
				descricao: '',
				quantidade: 1,
				precoUnitario: 0,
				desconto: 0,
				taxaIva: 16,
			},
		]);
	};

	const removerItem = (index: number) => {
		if (itens.length > 1) {
			setItens(itens.filter((_, i) => i !== index));
		}
	};

	const atualizarItem = (
		index: number,
		campo: keyof ItemPedidoCompra,
		valor: any
	) => {
		const novosItens = [...itens];
		novosItens[index] = { ...novosItens[index], [campo]: valor };
		setItens(novosItens);
	};

	const calcularSubtotalItem = (item: Partial<ItemPedidoCompra>) => {
		const quantidade = item.quantidade || 0;
		const preco = item.precoUnitario || 0;
		const desconto = item.desconto || 0;
		return quantidade * preco - desconto;
	};

	const calcularTotais = () => {
		const subtotal = itens.reduce(
			(acc, item) => acc + calcularSubtotalItem(item),
			0
		);
		const iva = itens.reduce((acc, item) => {
			const subtotalItem = calcularSubtotalItem(item);
			const taxaIva = (item.taxaIva || 0) / 100;
			return acc + subtotalItem * taxaIva;
		}, 0);
		const total = subtotal + iva;
		return { subtotal, iva, total };
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);

		try {
			if (!formData.fornecedorId || itens.length === 0) {
				toast.error('Por favor, preencha todos os campos obrigatórios');
				return;
			}

			const { subtotal, iva, total } = calcularTotais();
			const dataEntregaPrevista = new Date();
			dataEntregaPrevista.setDate(
				dataEntregaPrevista.getDate() + (formData.prazoEntrega || 7)
			);

			const novoPedido: PedidoCompra = {
				id: Date.now().toString(),
				tenantId: '1',
				numero: `PC${Date.now()}`,
				data: new Date().toISOString(),
				fornecedorId: formData.fornecedorId!,
				fornecedorNome: formData.fornecedorNome!,
				status: 'rascunho',
				itens: itens.map((item, index) => ({
					id: `${index + 1}`,
					descricao: item.descricao!,
					quantidade: item.quantidade!,
					quantidadeRecebida: 0,
					unidadeMedida: 'UN',
					precoUnitario: item.precoUnitario!,
					desconto: item.desconto || 0,
					taxaIva: item.taxaIva || 16,
					subtotal: calcularSubtotalItem(item),
				})),
				valorSubtotal: subtotal,
				valorDesconto: 0,
				valorIva: iva,
				valorTotal: total,
				condicoesPagamento: formData.condicoesPagamento || '',
				prazoEntrega: formData.prazoEntrega || 7,
				dataEntregaPrevista: dataEntregaPrevista.toISOString(),
				enderecoEntrega: formData.enderecoEntrega || '',
				observacoes: formData.observacoes,
				aprovacoes: [],
				recebimentos: [],
				dataCriacao: new Date().toISOString(),
				dataAtualizacao: new Date().toISOString(),
			};

			const pedidosExistentes = JSON.parse(
				localStorage.getItem('pedidos_compra') || '[]'
			);
			pedidosExistentes.push(novoPedido);
			localStorage.setItem('pedidos_compra', JSON.stringify(pedidosExistentes));

			toast.success('Pedido de compra criado com sucesso!');
			router.push('/procurement/pedidos');
		} catch (error) {
			toast.error('Erro ao criar pedido de compra');
			console.error(error);
		} finally {
			setLoading(false);
		}
	};

	const totais = calcularTotais();

	return (
		<div className='container mx-auto p-6 space-y-6'>
			<div className='flex items-center gap-4'>
				<Button variant='ghost' size='icon' onClick={() => router.back()}>
					<ArrowLeft className='h-5 w-5' />
				</Button>
				<div>
					<h1 className='text-3xl font-bold'>Nova Encomenda</h1>
					<p className='text-muted-foreground'>
						Criar uma nova encomenda de compra
					</p>
				</div>
			</div>

			<form onSubmit={handleSubmit}>
				<div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
					<div className='lg:col-span-2 space-y-6'>
						<Card>
							<CardHeader>
								<CardTitle>Informações do Fornecedor</CardTitle>
							</CardHeader>
							<CardContent className='space-y-4'>
								<div className='space-y-2'>
									<Label htmlFor='fornecedor'>Fornecedor *</Label>
									<Select
										value={formData.fornecedorId}
										onValueChange={(value) => {
											const fornecedores = [
												{ id: '1', nome: 'Fornecedor A' },
												{ id: '2', nome: 'Fornecedor B' },
												{ id: '3', nome: 'Fornecedor C' },
											];
											const fornecedor = fornecedores.find(
												(f) => f.id === value
											);
											setFormData({
												...formData,
												fornecedorId: value,
												fornecedorNome: fornecedor?.nome || '',
											});
										}}
									>
										<SelectTrigger>
											<SelectValue placeholder='Selecionar fornecedor' />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value='1'>Fornecedor A</SelectItem>
											<SelectItem value='2'>Fornecedor B</SelectItem>
											<SelectItem value='3'>Fornecedor C</SelectItem>
										</SelectContent>
									</Select>
								</div>

								<div className='grid grid-cols-2 gap-4'>
									<div className='space-y-2'>
										<Label htmlFor='condicoes'>Condições de Pagamento</Label>
										<Input
											id='condicoes'
											placeholder='Ex: 30 dias'
											value={formData.condicoesPagamento}
											onChange={(e) =>
												setFormData({
													...formData,
													condicoesPagamento: e.target.value,
												})
											}
										/>
									</div>

									<div className='space-y-2'>
										<Label htmlFor='prazo'>Prazo de Entrega (dias)</Label>
										<Input
											id='prazo'
											type='number'
											min='1'
											value={formData.prazoEntrega}
											onChange={(e) =>
												setFormData({
													...formData,
													prazoEntrega: parseInt(e.target.value) || 7,
												})
											}
										/>
									</div>
								</div>

								<div className='space-y-2'>
									<Label htmlFor='endereco'>Endereço de Entrega</Label>
									<Textarea
										id='endereco'
										placeholder='Endereço completo para entrega'
										value={formData.enderecoEntrega}
										onChange={(e) =>
											setFormData({
												...formData,
												enderecoEntrega: e.target.value,
											})
										}
										rows={3}
									/>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<div className='flex justify-between items-center'>
									<CardTitle>Itens da Encomenda</CardTitle>
									<Button
										type='button'
										variant='outline'
										size='sm'
										onClick={adicionarItem}
									>
										<Plus className='h-4 w-4 mr-2' />
										Adicionar Item
									</Button>
								</div>
							</CardHeader>
							<CardContent>
								<div className='space-y-4'>
									{itens.map((item, index) => (
										<Card key={index}>
											<CardContent className='pt-6'>
												<div className='space-y-4'>
													<div className='flex justify-between items-start'>
														<h4 className='font-medium'>Item {index + 1}</h4>
														{itens.length > 1 && (
															<Button
																type='button'
																variant='ghost'
																size='icon'
																onClick={() => removerItem(index)}
															>
																<Trash2 className='h-4 w-4' />
															</Button>
														)}
													</div>

													<div className='space-y-2'>
														<Label>Descrição *</Label>
														<Input
															placeholder='Descrição do item'
															value={item.descricao}
															onChange={(e) =>
																atualizarItem(
																	index,
																	'descricao',
																	e.target.value
																)
															}
															required
														/>
													</div>

													<div className='grid grid-cols-4 gap-4'>
														<div className='space-y-2'>
															<Label>Quantidade</Label>
															<Input
																type='number'
																min='1'
																value={item.quantidade}
																onChange={(e) =>
																	atualizarItem(
																		index,
																		'quantidade',
																		parseInt(e.target.value) || 1
																	)
																}
															/>
														</div>

														<div className='space-y-2'>
															<Label>Preço Unit. (MT)</Label>
															<Input
																type='number'
																step='0.01'
																min='0'
																value={item.precoUnitario}
																onChange={(e) =>
																	atualizarItem(
																		index,
																		'precoUnitario',
																		parseFloat(e.target.value) || 0
																	)
																}
															/>
														</div>

														<div className='space-y-2'>
															<Label>Desconto (MT)</Label>
															<Input
																type='number'
																step='0.01'
																min='0'
																value={item.desconto}
																onChange={(e) =>
																	atualizarItem(
																		index,
																		'desconto',
																		parseFloat(e.target.value) || 0
																	)
																}
															/>
														</div>

														<div className='space-y-2'>
															<Label>IVA (%)</Label>
															<Select
																value={item.taxaIva?.toString()}
																onValueChange={(value) =>
																	atualizarItem(
																		index,
																		'taxaIva',
																		parseFloat(value)
																	)
																}
															>
																<SelectTrigger>
																	<SelectValue />
																</SelectTrigger>
																<SelectContent>
																	<SelectItem value='0'>0%</SelectItem>
																	<SelectItem value='6'>6%</SelectItem>
																	<SelectItem value='13'>13%</SelectItem>
																	<SelectItem value='16'>16%</SelectItem>
																	<SelectItem value='23'>23%</SelectItem>
																</SelectContent>
															</Select>
														</div>
													</div>

													<div className='flex justify-end'>
														<div className='text-right'>
															<p className='text-sm text-muted-foreground'>
																Subtotal
															</p>
															<p className='text-lg font-bold'>
																{calcularSubtotalItem(item).toLocaleString(
																	'pt-MZ',
																	{ style: 'currency', currency: 'MZN' }
																)}
															</p>
														</div>
													</div>
												</div>
											</CardContent>
										</Card>
									))}
								</div>
							</CardContent>
						</Card>
					</div>

					<div className='space-y-6'>
						<Card>
							<CardHeader>
								<CardTitle>Resumo</CardTitle>
							</CardHeader>
							<CardContent className='space-y-4'>
								<div className='space-y-2'>
									<div className='flex justify-between'>
										<span className='text-muted-foreground'>Subtotal:</span>
										<span className='font-medium'>
											{totais.subtotal.toLocaleString('pt-MZ', {
												style: 'currency',
												currency: 'MZN',
											})}
										</span>
									</div>
									<div className='flex justify-between'>
										<span className='text-muted-foreground'>IVA:</span>
										<span className='font-medium'>
											{totais.iva.toLocaleString('pt-MZ', {
												style: 'currency',
												currency: 'MZN',
											})}
										</span>
									</div>
									<div className='border-t pt-2 flex justify-between'>
										<span className='font-bold'>Total:</span>
										<span className='font-bold text-lg'>
											{totais.total.toLocaleString('pt-MZ', {
												style: 'currency',
												currency: 'MZN',
											})}
										</span>
									</div>
								</div>
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle>Observações</CardTitle>
							</CardHeader>
							<CardContent>
								<Textarea
									placeholder='Observações adicionais sobre a encomenda'
									value={formData.observacoes}
									onChange={(e) =>
										setFormData({ ...formData, observacoes: e.target.value })
									}
									rows={6}
								/>
							</CardContent>
						</Card>

						<Card>
							<CardContent className='pt-6 space-y-3'>
								<Button
									type='submit'
									className='w-full gap-2'
									disabled={loading}
								>
									<Save className='h-4 w-4' />
									{loading ? 'A guardar...' : 'Guardar Encomenda'}
								</Button>
								<Button
									type='button'
									variant='outline'
									className='w-full'
									onClick={() => router.back()}
									disabled={loading}
								>
									Cancelar
								</Button>
							</CardContent>
						</Card>
					</div>
				</div>
			</form>
		</div>
	);
}
