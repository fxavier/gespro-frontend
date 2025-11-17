
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ColaboradorStorage } from '@/lib/storage/rh-storage';
import { Colaborador, DocumentoColaborador, FormacaoAcademica, ExperienciaProfissional } from '@/types/rh';
import { validarNUIT } from '@/lib/validacao-nuit';
import { validarBI, validarNISS } from '@/lib/validacao-bi';
import { getProvincias, getDistritosByProvincia } from '@/lib/provincias-mocambique';
import { 
  ArrowLeft,
  Upload,
  X,
  FileText,
  Image as ImageIcon,
  GraduationCap,
  Briefcase,
  Plus,
  Save
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export default function NovoColaboradorPage() {
  const router = useRouter();
  const [formData, setFormData] = useState<Partial<Colaborador>>({});
  const [distritos, setDistritos] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const now = new Date().toISOString();
    setFormData({
      codigo: ColaboradorStorage.getProximoCodigo(),
      status: 'activo',
      tipoContrato: 'efectivo',
      regimeTrabalho: 'tempo_integral',
      nivelAcesso: 'usuario',
      beneficios: [],
      documentos: [],
      formacaoAcademica: [],
      experienciaProfissional: [],
      subsidios: {},
      nacionalidade: 'Moçambicana',
      naturalidade: { provincia: '', distrito: '' },
      endereco: { rua: '', numero: '', bairro: '', cidade: '', provincia: '' },
      contactoEmergencia: { nome: '', parentesco: '', telefone: '' },
      dataCriacao: now,
      dataAtualizacao: now
    });
  }, []);

  useEffect(() => {
    if (formData.naturalidade?.provincia) {
      setDistritos(getDistritosByProvincia(formData.naturalidade.provincia));
    }
  }, [formData.naturalidade?.provincia]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>, tipo: DocumentoColaborador['tipo']) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (tipo === 'foto') {
      if (!file.type.startsWith('image/')) {
        toast.error('Por favor, selecione uma imagem válida');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('A imagem deve ter no máximo 5MB');
        return;
      }
    } else {
      if (file.size > 10 * 1024 * 1024) {
        toast.error('O ficheiro deve ter no máximo 10MB');
        return;
      }
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      
      if (tipo === 'foto') {
        setFormData({ ...formData, foto: base64String });
        toast.success('Foto carregada com sucesso');
      } else {
        const novoDocumento: DocumentoColaborador = {
          id: Date.now().toString(),
          tipo,
          nome: file.name,
          url: base64String,
          tamanho: file.size,
          dataUpload: new Date().toISOString()
        };
        
        const documentosAtualizados = [...(formData.documentos || []), novoDocumento];
        setFormData({ ...formData, documentos: documentosAtualizados });
        toast.success('Documento carregado com sucesso');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveDocumento = (documentoId: string) => {
    const documentosAtualizados = (formData.documentos || []).filter(d => d.id !== documentoId);
    setFormData({ ...formData, documentos: documentosAtualizados });
    toast.success('Documento removido');
  };

  const handleAddFormacao = () => {
    const novaFormacao: FormacaoAcademica = {
      id: Date.now().toString(),
      nivel: 'licenciatura',
      instituicao: '',
      curso: '',
      anoConclusao: ''
    };
    setFormData({
      ...formData,
      formacaoAcademica: [...(formData.formacaoAcademica || []), novaFormacao]
    });
  };

  const handleRemoveFormacao = (formacaoId: string) => {
    setFormData({
      ...formData,
      formacaoAcademica: (formData.formacaoAcademica || []).filter(f => f.id !== formacaoId)
    });
  };

  const handleUpdateFormacao = (formacaoId: string, updates: Partial<FormacaoAcademica>) => {
    setFormData({
      ...formData,
      formacaoAcademica: (formData.formacaoAcademica || []).map(f =>
        f.id === formacaoId ? { ...f, ...updates } : f
      )
    });
  };

  const handleAddExperiencia = () => {
    const novaExperiencia: ExperienciaProfissional = {
      id: Date.now().toString(),
      empresa: '',
      cargo: '',
      dataInicio: '',
      actual: false
    };
    setFormData({
      ...formData,
      experienciaProfissional: [...(formData.experienciaProfissional || []), novaExperiencia]
    });
  };

  const handleRemoveExperiencia = (experienciaId: string) => {
    setFormData({
      ...formData,
      experienciaProfissional: (formData.experienciaProfissional || []).filter(e => e.id !== experienciaId)
    });
  };

  const handleUpdateExperiencia = (experienciaId: string, updates: Partial<ExperienciaProfissional>) => {
    setFormData({
      ...formData,
      experienciaProfissional: (formData.experienciaProfissional || []).map(e =>
        e.id === experienciaId ? { ...e, ...updates } : e
      )
    });
  };

  const handleSave = () => {
    if (!formData.nome || !formData.email || !formData.bi || !formData.nuit || !formData.niss) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (!validarBI(formData.bi)) {
      toast.error('BI inválido. Formato esperado: 12 dígitos + 1 letra (ex: 110100123456A)');
      return;
    }

    if (!validarNUIT(formData.nuit)) {
      toast.error('NUIT inválido. Deve conter 9 dígitos');
      return;
    }

    if (!validarNISS(formData.niss)) {
      toast.error('NISS inválido. Deve conter 9 dígitos');
      return;
    }

    const now = new Date().toISOString();
    const novoColaborador: Colaborador = {
      ...formData,
      id: Date.now().toString(),
      tenantId: 'default',
      dataCriacao: now,
      dataAtualizacao: now
    } as Colaborador;
    
    ColaboradorStorage.addColaborador(novoColaborador);
    toast.success('Colaborador cadastrado com sucesso!');
    router.push('/rh/colaboradores');
  };

  const provincias = getProvincias();

  const getDocumentoIcon = (tipo: DocumentoColaborador['tipo']) => {
    if (tipo === 'foto') return <ImageIcon className="h-4 w-4" />;
    return <FileText className="h-4 w-4" />;
  };

  const getDocumentoLabel = (tipo: DocumentoColaborador['tipo']) => {
    const labels: Record<DocumentoColaborador['tipo'], string> = {
      foto: 'Fotografia',
      bi_frente: 'BI (Frente)',
      bi_verso: 'BI (Verso)',
      certificado_habilitacoes: 'Certificado de Habilitações',
      curriculum: 'Curriculum Vitae',
      certificado_criminal: 'Certificado de Registo Criminal',
      atestado_medico: 'Atestado Médico',
      comprovativo_residencia: 'Comprovativo de Residência',
      certificado_inss: 'Certificado INSS',
      declaracao_nuit: 'Declaração de NUIT',
      contrato_trabalho: 'Contrato de Trabalho',
      carta_conducao: 'Carta de Condução',
      certificado_profissional: 'Certificado Profissional',
      outro: 'Outro'
    };
    return labels[tipo];
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Novo Colaborador</h1>
            <p className="text-muted-foreground mt-1">
              Preencha os dados do novo colaborador
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.back()}>
            Cancelar
          </Button>
          <Button onClick={handleSave} className="gap-2">
            <Save className="h-4 w-4" />
            Cadastrar
          </Button>
        </div>
      </div>

      <Tabs defaultValue="pessoais" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="pessoais">Dados Pessoais</TabsTrigger>
          <TabsTrigger value="profissionais">Dados Profissionais</TabsTrigger>
          <TabsTrigger value="formacao">Formação</TabsTrigger>
          <TabsTrigger value="experiencia">Experiência</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
        </TabsList>

        <TabsContent value="pessoais">
          <Card>
            <CardHeader>
              <CardTitle>Informações Pessoais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex justify-center mb-4">
                <div className="relative">
                  <Avatar className="h-32 w-32">
                    <AvatarImage src={formData.foto} />
                    <AvatarFallback className="text-2xl">
                      {formData.nome ? formData.nome.substring(0, 2).toUpperCase() : 'FT'}
                    </AvatarFallback>
                  </Avatar>
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="absolute bottom-0 right-0 rounded-full"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e, 'foto')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="codigo">Código *</Label>
                  <Input
                    id="codigo"
                    value={formData.codigo || ''}
                    disabled
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Estado *</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="activo">Activo</SelectItem>
                      <SelectItem value="inactivo">Inactivo</SelectItem>
                      <SelectItem value="ferias">Férias</SelectItem>
                      <SelectItem value="afastado">Afastado</SelectItem>
                      <SelectItem value="periodo_experimental">Período Experimental</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nome">Nome Completo *</Label>
                <Input
                  id="nome"
                  value={formData.nome || ''}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  placeholder="Digite o nome completo"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dataNascimento">Data de Nascimento *</Label>
                  <Input
                    id="dataNascimento"
                    type="date"
                    value={formData.dataNascimento || ''}
                    onChange={(e) => setFormData({ ...formData, dataNascimento: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="genero">Género *</Label>
                  <Select
                    value={formData.genero}
                    onValueChange={(value) => setFormData({ ...formData, genero: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="feminino">Feminino</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="estadoCivil">Estado Civil *</Label>
                  <Select
                    value={formData.estadoCivil}
                    onValueChange={(value) => setFormData({ ...formData, estadoCivil: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="solteiro">Solteiro(a)</SelectItem>
                      <SelectItem value="casado">Casado(a)</SelectItem>
                      <SelectItem value="divorciado">Divorciado(a)</SelectItem>
                      <SelectItem value="viuvo">Viúvo(a)</SelectItem>
                      <SelectItem value="uniao_facto">União de Facto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="bi">BI/DIRE *</Label>
                  <Input
                    id="bi"
                    value={formData.bi || ''}
                    onChange={(e) => setFormData({ ...formData, bi: e.target.value })}
                    placeholder="110100123456A"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nuit">NUIT *</Label>
                  <Input
                    id="nuit"
                    value={formData.nuit || ''}
                    onChange={(e) => setFormData({ ...formData, nuit: e.target.value })}
                    placeholder="123456789"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="niss">NISS *</Label>
                  <Input
                    id="niss"
                    value={formData.niss || ''}
                    onChange={(e) => setFormData({ ...formData, niss: e.target.value })}
                    placeholder="987654321"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nacionalidade">Nacionalidade *</Label>
                  <Input
                    id="nacionalidade"
                    value={formData.nacionalidade || ''}
                    onChange={(e) => setFormData({ ...formData, nacionalidade: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="provincia">Província de Naturalidade *</Label>
                  <Select
                    value={formData.naturalidade?.provincia}
                    onValueChange={(value) => setFormData({
                      ...formData,
                      naturalidade: { ...formData.naturalidade!, provincia: value, distrito: '' }
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione" />
                    </SelectTrigger>
                    <SelectContent>
                      {provincias.map(prov => (
                        <SelectItem key={prov} value={prov}>{prov}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="distrito">Distrito de Naturalidade *</Label>
                  <Select
                    value={formData.naturalidade?.distrito}
                    onValueChange={(value) => setFormData({
                      ...formData,
                      naturalidade: { ...formData.naturalidade!, distrito: value }
                    })}
                    disabled={!formData.naturalidade?.provincia}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione" />
                    </SelectTrigger>
                    <SelectContent>
                      {distritos.map(dist => (
                        <SelectItem key={dist} value={dist}>{dist}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@empresa.co.mz"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telefone">Telefone *</Label>
                  <Input
                    id="telefone"
                    value={formData.telefone || ''}
                    onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                    placeholder="+258 84 123 4567"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefoneAlternativo">Telefone Alternativo</Label>
                <Input
                  id="telefoneAlternativo"
                  value={formData.telefoneAlternativo || ''}
                  onChange={(e) => setFormData({ ...formData, telefoneAlternativo: e.target.value })}
                  placeholder="+258 82 234 5678"
                />
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-4">Endereço</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="rua">Rua *</Label>
                    <Input
                      id="rua"
                      value={formData.endereco?.rua || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        endereco: { ...formData.endereco!, rua: e.target.value }
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="numero">Número *</Label>
                    <Input
                      id="numero"
                      value={formData.endereco?.numero || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        endereco: { ...formData.endereco!, numero: e.target.value }
                      })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="bairro">Bairro *</Label>
                    <Input
                      id="bairro"
                      value={formData.endereco?.bairro || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        endereco: { ...formData.endereco!, bairro: e.target.value }
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cidade">Cidade *</Label>
                    <Input
                      id="cidade"
                      value={formData.endereco?.cidade || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        endereco: { ...formData.endereco!, cidade: e.target.value }
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="provinciaEndereco">Província *</Label>
                    <Select
                      value={formData.endereco?.provincia}
                      onValueChange={(value) => setFormData({
                        ...formData,
                        endereco: { ...formData.endereco!, provincia: value }
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccione" />
                      </SelectTrigger>
                      <SelectContent>
                        {provincias.map(prov => (
                          <SelectItem key={prov} value={prov}>{prov}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-4">Contacto de Emergência</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="contactoNome">Nome *</Label>
                    <Input
                      id="contactoNome"
                      value={formData.contactoEmergencia?.nome || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        contactoEmergencia: { ...formData.contactoEmergencia!, nome: e.target.value }
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactoParentesco">Parentesco *</Label>
                    <Input
                      id="contactoParentesco"
                      value={formData.contactoEmergencia?.parentesco || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        contactoEmergencia: { ...formData.contactoEmergencia!, parentesco: e.target.value }
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contactoTelefone">Telefone *</Label>
                    <Input
                      id="contactoTelefone"
                      value={formData.contactoEmergencia?.telefone || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        contactoEmergencia: { ...formData.contactoEmergencia!, telefone: e.target.value }
                      })}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profissionais">
          <Card>
            <CardHeader>
              <CardTitle>Informações Profissionais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="departamento">Departamento *</Label>
                  <Input
                    id="departamento"
                    value={formData.departamento || ''}
                    onChange={(e) => setFormData({ ...formData, departamento: e.target.value })}
                    placeholder="Ex: Tecnologia"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cargo">Cargo *</Label>
                  <Input
                    id="cargo"
                    value={formData.cargo || ''}
                    onChange={(e) => setFormData({ ...formData, cargo: e.target.value })}
                    placeholder="Ex: Desenvolvedor"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dataAdmissao">Data de Admissão *</Label>
                  <Input
                    id="dataAdmissao"
                    type="date"
                    value={formData.dataAdmissao || ''}
                    onChange={(e) => setFormData({ ...formData, dataAdmissao: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tipoContrato">Tipo de Contrato *</Label>
                  <Select
                    value={formData.tipoContrato}
                    onValueChange={(value) => setFormData({ ...formData, tipoContrato: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="efectivo">Efectivo</SelectItem>
                      <SelectItem value="termo_certo">Termo Certo</SelectItem>
                      <SelectItem value="estagio">Estágio</SelectItem>
                      <SelectItem value="temporario">Temporário</SelectItem>
                      <SelectItem value="prestacao_servicos">Prestação de Serviços</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="regimeTrabalho">Regime de Trabalho *</Label>
                  <Select
                    value={formData.regimeTrabalho}
                    onValueChange={(value) => setFormData({ ...formData, regimeTrabalho: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tempo_integral">Tempo Integral</SelectItem>
                      <SelectItem value="tempo_parcial">Tempo Parcial</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="horarioTrabalho">Horário de Trabalho</Label>
                  <Input
                    id="horarioTrabalho"
                    value={formData.horarioTrabalho || ''}
                    onChange={(e) => setFormData({ ...formData, horarioTrabalho: e.target.value })}
                    placeholder="Ex: 08:00 - 17:00"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="salarioBase">Salário Base (MZN) *</Label>
                <Input
                  id="salarioBase"
                  type="number"
                  value={formData.salarioBase || ''}
                  onChange={(e) => setFormData({ ...formData, salarioBase: parseFloat(e.target.value) })}
                  placeholder="0.00"
                />
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-4">Subsídios</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="subsidioAlimentacao">Subsídio de Alimentação (MZN)</Label>
                    <Input
                      id="subsidioAlimentacao"
                      type="number"
                      value={formData.subsidios?.alimentacao || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        subsidios: { ...formData.subsidios, alimentacao: parseFloat(e.target.value) }
                      })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subsidioTransporte">Subsídio de Transporte (MZN)</Label>
                    <Input
                      id="subsidioTransporte"
                      type="number"
                      value={formData.subsidios?.transporte || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        subsidios: { ...formData.subsidios, transporte: parseFloat(e.target.value) }
                      })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subsidioHabitacao">Subsídio de Habitação (MZN)</Label>
                    <Input
                      id="subsidioHabitacao"
                      type="number"
                      value={formData.subsidios?.habitacao || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        subsidios: { ...formData.subsidios, habitacao: parseFloat(e.target.value) }
                      })}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="subsidioOutros">Outros Subsídios (MZN)</Label>
                    <Input
                      id="subsidioOutros"
                      type="number"
                      value={formData.subsidios?.outros || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        subsidios: { ...formData.subsidios, outros: parseFloat(e.target.value) }
                      })}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="supervisor">Supervisor</Label>
                  <Input
                    id="supervisor"
                    value={formData.supervisor || ''}
                    onChange={(e) => setFormData({ ...formData, supervisor: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="localizacao">Localização/Filial</Label>
                  <Input
                    id="localizacao"
                    value={formData.localizacao || ''}
                    onChange={(e) => setFormData({ ...formData, localizacao: e.target.value })}
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold mb-4">Dados Bancários</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="banco">Banco</Label>
                    <Input
                      id="banco"
                      value={formData.dadosBancarios?.banco || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        dadosBancarios: { ...formData.dadosBancarios!, banco: e.target.value }
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nib">NIB</Label>
                    <Input
                      id="nib"
                      value={formData.dadosBancarios?.nib || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        dadosBancarios: { ...formData.dadosBancarios!, nib: e.target.value }
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="titular">Titular da Conta</Label>
                    <Input
                      id="titular"
                      value={formData.dadosBancarios?.titular || ''}
                      onChange={(e) => setFormData({
                        ...formData,
                        dadosBancarios: { ...formData.dadosBancarios!, titular: e.target.value }
                      })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="observacoes">Observações</Label>
                <Textarea
                  id="observacoes"
                  value={formData.observacoes || ''}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="formacao">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Formação Académica</CardTitle>
                <Button type="button" onClick={handleAddFormacao} size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Adicionar Formação
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {(formData.formacaoAcademica || []).map((formacao, index) => (
                <Card key={formacao.id}>
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-2">
                        <GraduationCap className="h-5 w-5" />
                        <span className="font-medium">Formação {index + 1}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveFormacao(formacao.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Nível</Label>
                        <Select
                          value={formacao.nivel}
                          onValueChange={(value) => handleUpdateFormacao(formacao.id, { nivel: value as any })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="basico">Básico</SelectItem>
                            <SelectItem value="medio">Médio</SelectItem>
                            <SelectItem value="tecnico">Técnico</SelectItem>
                            <SelectItem value="licenciatura">Licenciatura</SelectItem>
                            <SelectItem value="mestrado">Mestrado</SelectItem>
                            <SelectItem value="doutoramento">Doutoramento</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Instituição</Label>
                        <Input
                          value={formacao.instituicao}
                          onChange={(e) => handleUpdateFormacao(formacao.id, { instituicao: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Curso</Label>
                        <Input
                          value={formacao.curso}
                          onChange={(e) => handleUpdateFormacao(formacao.id, { curso: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Ano de Conclusão</Label>
                        <Input
                          value={formacao.anoConclusao}
                          onChange={(e) => handleUpdateFormacao(formacao.id, { anoConclusao: e.target.value })}
                          placeholder="2020"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {(formData.formacaoAcademica || []).length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma formação académica adicionada
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="experiencia">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Experiência Profissional</CardTitle>
                <Button type="button" onClick={handleAddExperiencia} size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Adicionar Experiência
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {(formData.experienciaProfissional || []).map((exp, index) => (
                <Card key={exp.id}>
                  <CardContent className="pt-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-2">
                        <Briefcase className="h-5 w-5" />
                        <span className="font-medium">Experiência {index + 1}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveExperiencia(exp.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Empresa</Label>
                        <Input
                          value={exp.empresa}
                          onChange={(e) => handleUpdateExperiencia(exp.id, { empresa: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Cargo</Label>
                        <Input
                          value={exp.cargo}
                          onChange={(e) => handleUpdateExperiencia(exp.id, { cargo: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Data de Início</Label>
                        <Input
                          type="date"
                          value={exp.dataInicio}
                          onChange={(e) => handleUpdateExperiencia(exp.id, { dataInicio: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Data de Fim</Label>
                        <Input
                          type="date"
                          value={exp.dataFim || ''}
                          onChange={(e) => handleUpdateExperiencia(exp.id, { dataFim: e.target.value })}
                          disabled={exp.actual}
                        />
                      </div>
                      <div className="col-span-2 space-y-2">
                        <Label>Responsabilidades</Label>
                        <Textarea
                          value={exp.responsabilidades || ''}
                          onChange={(e) => handleUpdateExperiencia(exp.id, { responsabilidades: e.target.value })}
                          rows={3}
                        />
                      </div>
                      <div className="col-span-2 flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={exp.actual}
                          onChange={(e) => handleUpdateExperiencia(exp.id, { actual: e.target.checked, dataFim: undefined })}
                          className="rounded"
                        />
                        <Label>Emprego actual</Label>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {(formData.experienciaProfissional || []).length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma experiência profissional adicionada
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documentos">
          <Card>
            <CardHeader>
              <CardTitle>Documentos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { tipo: 'bi_frente' as const, label: 'BI (Frente)' },
                  { tipo: 'bi_verso' as const, label: 'BI (Verso)' },
                  { tipo: 'certificado_habilitacoes' as const, label: 'Certificado de Habilitações' },
                  { tipo: 'curriculum' as const, label: 'Curriculum Vitae' },
                  { tipo: 'certificado_criminal' as const, label: 'Certificado de Registo Criminal' },
                  { tipo: 'atestado_medico' as const, label: 'Atestado Médico' },
                  { tipo: 'comprovativo_residencia' as const, label: 'Comprovativo de Residência' },
                  { tipo: 'certificado_inss' as const, label: 'Certificado INSS' },
                  { tipo: 'declaracao_nuit' as const, label: 'Declaração de NUIT' },
                  { tipo: 'contrato_trabalho' as const, label: 'Contrato de Trabalho' },
                  { tipo: 'carta_conducao' as const, label: 'Carta de Condução' },
                  { tipo: 'certificado_profissional' as const, label: 'Certificado Profissional' }
                ].map(({ tipo, label }) => {
                  const documento = (formData.documentos || []).find(d => d.tipo === tipo);
                  return (
                    <Card key={tipo}>
                      <CardContent className="pt-6">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getDocumentoIcon(tipo)}
                            <span className="font-medium text-sm">{label}</span>
                          </div>
                          {documento && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveDocumento(documento.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        {documento ? (
                          <div className="text-sm text-muted-foreground">
                            <p className="truncate">{documento.nome}</p>
                            <p className="text-xs">
                              {new Date(documento.dataUpload).toLocaleDateString('pt-MZ')}
                            </p>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full gap-2"
                            onClick={() => {
                              const input = document.createElement('input');
                              input.type = 'file';
                              input.accept = '.pdf,.doc,.docx,.jpg,.jpeg,.png';
                              input.onchange = (e) => handleFileUpload(e as any, tipo);
                              input.click();
                            }}
                          >
                            <Upload className="h-4 w-4" />
                            Carregar
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
