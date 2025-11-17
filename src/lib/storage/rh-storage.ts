
import {
  Colaborador,
  Payroll,
  Ferias,
  SolicitacaoFerias,
  Ausencia,
  RegistroAssiduidade,
  Avaliacao,
  Formacao,
  Beneficio,
  VagaEmprego,
  Candidatura,
  DashboardRH
} from '@/types/rh';

const STORAGE_KEYS = {
  COLABORADORES: 'erp_colaboradores',
  PAYROLL: 'erp_payroll',
  FERIAS: 'erp_ferias',
  AUSENCIAS: 'erp_ausencias',
  ASSIDUIDADE: 'erp_assiduidade',
  AVALIACOES: 'erp_avaliacoes',
  FORMACOES: 'erp_formacoes',
  BENEFICIOS: 'erp_beneficios',
  VAGAS: 'erp_vagas_emprego'
};

export class ColaboradorStorage {
  static getColaboradores(): Colaborador[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.COLABORADORES);
    return data ? JSON.parse(data) : this.getColaboradoresIniciais();
  }

  static saveColaboradores(colaboradores: Colaborador[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.COLABORADORES, JSON.stringify(colaboradores));
  }

  static addColaborador(colaborador: Colaborador): Colaborador {
    const colaboradores = this.getColaboradores();
    colaboradores.push(colaborador);
    this.saveColaboradores(colaboradores);
    return colaborador;
  }

  static updateColaborador(id: string, updates: Partial<Colaborador>): Colaborador | null {
    const colaboradores = this.getColaboradores();
    const index = colaboradores.findIndex(c => c.id === id);
    if (index === -1) return null;
    
    colaboradores[index] = { 
      ...colaboradores[index], 
      ...updates, 
      dataAtualizacao: new Date().toISOString() 
    };
    this.saveColaboradores(colaboradores);
    return colaboradores[index];
  }

  static deleteColaborador(id: string): boolean {
    const colaboradores = this.getColaboradores();
    const filtered = colaboradores.filter(c => c.id !== id);
    if (filtered.length === colaboradores.length) return false;
    
    this.saveColaboradores(filtered);
    return true;
  }

  static getColaboradorById(id: string): Colaborador | null {
    const colaboradores = this.getColaboradores();
    return colaboradores.find(c => c.id === id) || null;
  }

  static getProximoCodigo(): string {
    const colaboradores = this.getColaboradores();
    if (colaboradores.length === 0) return 'COL-0001';
    
    const codigos = colaboradores
      .map(c => parseInt(c.codigo.split('-')[1]))
      .filter(n => !isNaN(n));
    
    const maiorCodigo = Math.max(...codigos, 0);
    return `COL-${(maiorCodigo + 1).toString().padStart(4, '0')}`;
  }

  private static getColaboradoresIniciais(): Colaborador[] {
    const now = new Date().toISOString();
    return [
      {
        id: '1',
        tenantId: 'default',
        codigo: 'COL-0001',
        nome: 'João Manuel Silva',
        dataNascimento: '1990-05-15',
        genero: 'masculino',
        estadoCivil: 'casado',
        nacionalidade: 'Moçambicana',
        naturalidade: {
          provincia: 'Maputo',
          distrito: 'Maputo'
        },
        bi: '110100123456A',
        nuit: '123456789',
        niss: '987654321',
        email: 'joao.silva@empresa.co.mz',
        telefone: '+258 84 123 4567',
        endereco: {
          rua: 'Avenida Julius Nyerere',
          numero: '123',
          bairro: 'Sommerschield',
          cidade: 'Maputo',
          provincia: 'Maputo'
        },
        contactoEmergencia: {
          nome: 'Maria Silva',
          parentesco: 'Esposa',
          telefone: '+258 84 765 4321'
        },
        departamento: 'Tecnologia',
        cargo: 'Desenvolvedor Sénior',
        dataAdmissao: '2020-01-15',
        status: 'activo',
        tipoContrato: 'efectivo',
        regimeTrabalho: 'tempo_integral',
        salarioBase: 45000,
        subsidios: {
          alimentacao: 5000,
          transporte: 3000
        },
        formacaoAcademica: [
          {
            id: '1',
            nivel: 'licenciatura',
            instituicao: 'Universidade Eduardo Mondlane',
            curso: 'Engenharia Informática',
            anoConclusao: '2015'
          }
        ],
        experienciaProfissional: [
          {
            id: '1',
            empresa: 'Tech Solutions Lda',
            cargo: 'Desenvolvedor Júnior',
            dataInicio: '2015-03-01',
            dataFim: '2019-12-31',
            actual: false
          }
        ],
        beneficios: ['subsidio_alimentacao', 'subsidio_transporte', 'seguro_saude'],
        nivelAcesso: 'usuario',
        documentos: [],
        dataCriacao: now,
        dataAtualizacao: now
      },
      {
        id: '2',
        tenantId: 'default',
        codigo: 'COL-0002',
        nome: 'Maria dos Santos',
        dataNascimento: '1988-08-20',
        genero: 'feminino',
        estadoCivil: 'solteiro',
        nacionalidade: 'Moçambicana',
        naturalidade: {
          provincia: 'Sofala',
          distrito: 'Beira'
        },
        bi: '110200234567B',
        nuit: '234567890',
        niss: '876543210',
        email: 'maria.santos@empresa.co.mz',
        telefone: '+258 82 234 5678',
        endereco: {
          rua: 'Avenida 24 de Julho',
          numero: '456',
          bairro: 'Polana',
          cidade: 'Maputo',
          provincia: 'Maputo'
        },
        contactoEmergencia: {
          nome: 'Ana Santos',
          parentesco: 'Mãe',
          telefone: '+258 82 876 5432'
        },
        departamento: 'Recursos Humanos',
        cargo: 'Gestora de RH',
        dataAdmissao: '2019-03-10',
        status: 'activo',
        tipoContrato: 'efectivo',
        regimeTrabalho: 'tempo_integral',
        salarioBase: 55000,
        subsidios: {
          alimentacao: 5000,
          transporte: 3000,
          habitacao: 10000
        },
        formacaoAcademica: [
          {
            id: '1',
            nivel: 'mestrado',
            instituicao: 'ISCTEM',
            curso: 'Gestão de Recursos Humanos',
            anoConclusao: '2018'
          }
        ],
        experienciaProfissional: [
          {
            id: '1',
            empresa: 'HR Consulting Lda',
            cargo: 'Consultora de RH',
            dataInicio: '2013-06-01',
            dataFim: '2019-02-28',
            actual: false
          }
        ],
        beneficios: ['subsidio_alimentacao', 'subsidio_transporte', 'subsidio_habitacao', 'seguro_saude'],
        nivelAcesso: 'gerente',
        documentos: [],
        dataCriacao: now,
        dataAtualizacao: now
      }
    ];
  }
}

export class PayrollStorage {
  static getPayrolls(): Payroll[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.PAYROLL);
    return data ? JSON.parse(data) : [];
  }

  static savePayrolls(payrolls: Payroll[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.PAYROLL, JSON.stringify(payrolls));
  }

  static addPayroll(payroll: Payroll): Payroll {
    const payrolls = this.getPayrolls();
    payrolls.push(payroll);
    this.savePayrolls(payrolls);
    return payroll;
  }

  static updatePayroll(id: string, updates: Partial<Payroll>): Payroll | null {
    const payrolls = this.getPayrolls();
    const index = payrolls.findIndex(p => p.id === id);
    if (index === -1) return null;
    
    payrolls[index] = { 
      ...payrolls[index], 
      ...updates, 
      dataAtualizacao: new Date().toISOString() 
    };
    this.savePayrolls(payrolls);
    return payrolls[index];
  }

  static deletePayroll(id: string): boolean {
    const payrolls = this.getPayrolls();
    const filtered = payrolls.filter(p => p.id !== id);
    if (filtered.length === payrolls.length) return false;
    
    this.savePayrolls(filtered);
    return true;
  }
}

export class FeriasStorage {
  static getFerias(): Ferias[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.FERIAS);
    return data ? JSON.parse(data) : [];
  }

  static saveFerias(ferias: Ferias[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.FERIAS, JSON.stringify(ferias));
  }

  static addFerias(ferias: Ferias): Ferias {
    const allFerias = this.getFerias();
    allFerias.push(ferias);
    this.saveFerias(allFerias);
    return ferias;
  }

  static updateFerias(id: string, updates: Partial<Ferias>): Ferias | null {
    const allFerias = this.getFerias();
    const index = allFerias.findIndex(f => f.id === id);
    if (index === -1) return null;
    
    allFerias[index] = { 
      ...allFerias[index], 
      ...updates, 
      dataAtualizacao: new Date().toISOString() 
    };
    this.saveFerias(allFerias);
    return allFerias[index];
  }

  static getFeriasByColaboradorId(colaboradorId: string): Ferias | null {
    const allFerias = this.getFerias();
    return allFerias.find(f => f.colaboradorId === colaboradorId) || null;
  }
}

export class AusenciaStorage {
  static getAusencias(): Ausencia[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.AUSENCIAS);
    return data ? JSON.parse(data) : [];
  }

  static saveAusencias(ausencias: Ausencia[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.AUSENCIAS, JSON.stringify(ausencias));
  }

  static addAusencia(ausencia: Ausencia): Ausencia {
    const ausencias = this.getAusencias();
    ausencias.push(ausencia);
    this.saveAusencias(ausencias);
    return ausencia;
  }

  static updateAusencia(id: string, updates: Partial<Ausencia>): Ausencia | null {
    const ausencias = this.getAusencias();
    const index = ausencias.findIndex(a => a.id === id);
    if (index === -1) return null;
    
    ausencias[index] = { 
      ...ausencias[index], 
      ...updates, 
      dataAtualizacao: new Date().toISOString() 
    };
    this.saveAusencias(ausencias);
    return ausencias[index];
  }

  static deleteAusencia(id: string): boolean {
    const ausencias = this.getAusencias();
    const filtered = ausencias.filter(a => a.id !== id);
    if (filtered.length === ausencias.length) return false;
    
    this.saveAusencias(filtered);
    return true;
  }
}

export class AssiduidadeStorage {
  static getRegistros(): RegistroAssiduidade[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.ASSIDUIDADE);
    return data ? JSON.parse(data) : [];
  }

  static saveRegistros(registros: RegistroAssiduidade[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.ASSIDUIDADE, JSON.stringify(registros));
  }

  static addRegistro(registro: RegistroAssiduidade): RegistroAssiduidade {
    const registros = this.getRegistros();
    registros.push(registro);
    this.saveRegistros(registros);
    return registro;
  }

  static updateRegistro(id: string, updates: Partial<RegistroAssiduidade>): RegistroAssiduidade | null {
    const registros = this.getRegistros();
    const index = registros.findIndex(r => r.id === id);
    if (index === -1) return null;
    
    registros[index] = { ...registros[index], ...updates };
    this.saveRegistros(registros);
    return registros[index];
  }
}

export class AvaliacaoStorage {
  static getAvaliacoes(): Avaliacao[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.AVALIACOES);
    return data ? JSON.parse(data) : [];
  }

  static saveAvaliacoes(avaliacoes: Avaliacao[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.AVALIACOES, JSON.stringify(avaliacoes));
  }

  static addAvaliacao(avaliacao: Avaliacao): Avaliacao {
    const avaliacoes = this.getAvaliacoes();
    avaliacoes.push(avaliacao);
    this.saveAvaliacoes(avaliacoes);
    return avaliacao;
  }

  static updateAvaliacao(id: string, updates: Partial<Avaliacao>): Avaliacao | null {
    const avaliacoes = this.getAvaliacoes();
    const index = avaliacoes.findIndex(a => a.id === id);
    if (index === -1) return null;
    
    avaliacoes[index] = { 
      ...avaliacoes[index], 
      ...updates, 
      dataAtualizacao: new Date().toISOString() 
    };
    this.saveAvaliacoes(avaliacoes);
    return avaliacoes[index];
  }
}

export class FormacaoStorage {
  static getFormacoes(): Formacao[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.FORMACOES);
    return data ? JSON.parse(data) : [];
  }

  static saveFormacoes(formacoes: Formacao[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.FORMACOES, JSON.stringify(formacoes));
  }

  static addFormacao(formacao: Formacao): Formacao {
    const formacoes = this.getFormacoes();
    formacoes.push(formacao);
    this.saveFormacoes(formacoes);
    return formacao;
  }

  static updateFormacao(id: string, updates: Partial<Formacao>): Formacao | null {
    const formacoes = this.getFormacoes();
    const index = formacoes.findIndex(f => f.id === id);
    if (index === -1) return null;
    
    formacoes[index] = { 
      ...formacoes[index], 
      ...updates, 
      dataAtualizacao: new Date().toISOString() 
    };
    this.saveFormacoes(formacoes);
    return formacoes[index];
  }

  static deleteFormacao(id: string): boolean {
    const formacoes = this.getFormacoes();
    const filtered = formacoes.filter(f => f.id !== id);
    if (filtered.length === formacoes.length) return false;
    
    this.saveFormacoes(filtered);
    return true;
  }
}

export class BeneficioStorage {
  static getBeneficios(): Beneficio[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.BENEFICIOS);
    return data ? JSON.parse(data) : this.getBeneficiosIniciais();
  }

  static saveBeneficios(beneficios: Beneficio[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.BENEFICIOS, JSON.stringify(beneficios));
  }

  static addBeneficio(beneficio: Beneficio): Beneficio {
    const beneficios = this.getBeneficios();
    beneficios.push(beneficio);
    this.saveBeneficios(beneficios);
    return beneficio;
  }

  static updateBeneficio(id: string, updates: Partial<Beneficio>): Beneficio | null {
    const beneficios = this.getBeneficios();
    const index = beneficios.findIndex(b => b.id === id);
    if (index === -1) return null;
    
    beneficios[index] = { 
      ...beneficios[index], 
      ...updates, 
      dataAtualizacao: new Date().toISOString() 
    };
    this.saveBeneficios(beneficios);
    return beneficios[index];
  }

  static deleteBeneficio(id: string): boolean {
    const beneficios = this.getBeneficios();
    const filtered = beneficios.filter(b => b.id !== id);
    if (filtered.length === beneficios.length) return false;
    
    this.saveBeneficios(filtered);
    return true;
  }

  private static getBeneficiosIniciais(): Beneficio[] {
    const now = new Date().toISOString();
    return [
      {
        id: '1',
        tenantId: 'default',
        nome: 'Subsídio de Alimentação',
        descricao: 'Auxílio alimentação mensal',
        tipo: 'subsidio_alimentacao',
        valor: 5000,
        periodicidade: 'mensal',
        obrigatorio: true,
        elegibilidade: ['efectivo'],
        ativo: true,
        dataCriacao: now,
        dataAtualizacao: now
      },
      {
        id: '2',
        tenantId: 'default',
        nome: 'Subsídio de Transporte',
        descricao: 'Auxílio transporte mensal',
        tipo: 'subsidio_transporte',
        valor: 3000,
        periodicidade: 'mensal',
        obrigatorio: false,
        elegibilidade: ['efectivo'],
        ativo: true,
        dataCriacao: now,
        dataAtualizacao: now
      },
      {
        id: '3',
        tenantId: 'default',
        nome: 'Seguro de Saúde',
        descricao: 'Seguro de saúde empresarial',
        tipo: 'seguro_saude',
        valor: 8000,
        periodicidade: 'mensal',
        obrigatorio: false,
        elegibilidade: ['efectivo'],
        ativo: true,
        dataCriacao: now,
        dataAtualizacao: now
      }
    ];
  }
}

export class VagaEmpregoStorage {
  static getVagas(): VagaEmprego[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.VAGAS);
    return data ? JSON.parse(data) : [];
  }

  static saveVagas(vagas: VagaEmprego[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.VAGAS, JSON.stringify(vagas));
  }

  static addVaga(vaga: VagaEmprego): VagaEmprego {
    const vagas = this.getVagas();
    vagas.push(vaga);
    this.saveVagas(vagas);
    return vaga;
  }

  static updateVaga(id: string, updates: Partial<VagaEmprego>): VagaEmprego | null {
    const vagas = this.getVagas();
    const index = vagas.findIndex(v => v.id === id);
    if (index === -1) return null;
    
    vagas[index] = { 
      ...vagas[index], 
      ...updates, 
      dataAtualizacao: new Date().toISOString() 
    };
    this.saveVagas(vagas);
    return vagas[index];
  }

  static deleteVaga(id: string): boolean {
    const vagas = this.getVagas();
    const filtered = vagas.filter(v => v.id !== id);
    if (filtered.length === vagas.length) return false;
    
    this.saveVagas(filtered);
    return true;
  }
}

export class DashboardRHStorage {
  static getDashboardData(): DashboardRH {
    const colaboradores = ColaboradorStorage.getColaboradores();
    const payrolls = PayrollStorage.getPayrolls();
    const ferias = FeriasStorage.getFerias();
    const ausencias = AusenciaStorage.getAusencias();
    const avaliacoes = AvaliacaoStorage.getAvaliacoes();
    const formacoes = FormacaoStorage.getFormacoes();
    const vagas = VagaEmpregoStorage.getVagas();

    const hoje = new Date();
    const mesAtual = hoje.getMonth();

    const colaboradoresActivos = colaboradores.filter(c => c.status === 'activo');
    const aniversariantesMes = colaboradoresActivos.filter(c => {
      const dataNasc = new Date(c.dataNascimento);
      return dataNasc.getMonth() === mesAtual;
    });

    const feriasPendentes = ferias.reduce((acc, f) => {
      const pendentes = f.solicitacoes.filter(s => s.status === 'pendente');
      return acc + pendentes.length;
    }, 0);

    const ausenciasHoje = ausencias.filter(a => {
      const inicio = new Date(a.dataInicio);
      const fim = new Date(a.dataFim);
      return hoje >= inicio && hoje <= fim;
    }).length;

    const mesAtualStr = hoje.toISOString().slice(0, 7);
    const payrollMesAtual = payrolls.filter(p => 
      `${p.anoReferencia}-${p.mesReferencia.padStart(2, '0')}` === mesAtualStr
    );
    const custoFolhaMensal = payrollMesAtual.reduce((acc, p) => acc + p.salarioLiquido, 0);

    const distribuicaoDepartamento = colaboradoresActivos.reduce((acc, c) => {
      const existing = acc.find(d => d.departamento === c.departamento);
      if (existing) {
        existing.total++;
      } else {
        acc.push({ departamento: c.departamento, total: 1 });
      }
      return acc;
    }, [] as { departamento: string; total: number }[]);

    const distribuicaoCargo = colaboradoresActivos.reduce((acc, c) => {
      const existing = acc.find(d => d.cargo === c.cargo);
      if (existing) {
        existing.total++;
      } else {
        acc.push({ cargo: c.cargo, total: 1 });
      }
      return acc;
    }, [] as { cargo: string; total: number }[]);

    return {
      totalColaboradores: colaboradores.length,
      colaboradoresActivos: colaboradoresActivos.length,
      colaboradoresInactivos: colaboradores.filter(c => c.status === 'inactivo').length,
      colaboradoresPeriodoExperimental: colaboradores.filter(c => c.status === 'periodo_experimental').length,
      aniversariantesMes,
      feriasPendentes,
      ausenciasHoje,
      custoFolhaMensal,
      taxaRotatividade: 2.5,
      avaliacoesPendentes: avaliacoes.filter(a => a.status === 'pendente').length,
      formacoesMes: formacoes.filter(f => f.status === 'em_andamento').length,
      contratosExpirando: 3,
      vagasAbertas: vagas.filter(v => v.status === 'aberta').length,
      distribuicaoDepartamento,
      distribuicaoCargo,
      mediaAssiduidade: 95.5
    };
  }
}
