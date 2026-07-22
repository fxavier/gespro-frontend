
import { Projeto, Tarefa, Equipe, RegistroTempo, OrcamentoProjeto, DocumentoProjeto, RelatorioProjeto } from '@/types/projeto';

const STORAGE_KEYS = {
  PROJETOS: 'erp_projetos',
  TAREFAS: 'erp_tarefas',
  EQUIPES: 'erp_equipes',
  TIMESHEET: 'erp_timesheet',
  ORCAMENTOS: 'erp_orcamentos_projeto',
  DOCUMENTOS: 'erp_documentos_projeto'
};

export class ProjetoStorage {
  static getProjetos(): Projeto[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.PROJETOS);
    return data ? JSON.parse(data) : [];
  }

  static saveProjetos(projetos: Projeto[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.PROJETOS, JSON.stringify(projetos));
  }

  static addProjeto(projeto: Projeto): Projeto {
    const projetos = this.getProjetos();
    projetos.push(projeto);
    this.saveProjetos(projetos);
    return projeto;
  }

  static updateProjeto(id: string, updates: Partial<Projeto>): Projeto | null {
    const projetos = this.getProjetos();
    const index = projetos.findIndex(p => p.id === id);
    if (index === -1) return null;
    
    projetos[index] = { ...projetos[index], ...updates, dataAtualizacao: new Date().toISOString() };
    this.saveProjetos(projetos);
    return projetos[index];
  }

  static deleteProjeto(id: string): boolean {
    const projetos = this.getProjetos();
    const filtered = projetos.filter(p => p.id !== id);
    if (filtered.length === projetos.length) return false;
    
    this.saveProjetos(filtered);
    return true;
  }

  static getProjetoById(id: string): Projeto | null {
    const projetos = this.getProjetos();
    return projetos.find(p => p.id === id) || null;
  }
}

export class TarefaStorage {
  static getTarefas(): Tarefa[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.TAREFAS);
    return data ? JSON.parse(data) : [];
  }

  static saveTarefas(tarefas: Tarefa[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.TAREFAS, JSON.stringify(tarefas));
  }

  static addTarefa(tarefa: Tarefa): Tarefa {
    const tarefas = this.getTarefas();
    tarefas.push(tarefa);
    this.saveTarefas(tarefas);
    return tarefa;
  }

  static updateTarefa(id: string, updates: Partial<Tarefa>): Tarefa | null {
    const tarefas = this.getTarefas();
    const index = tarefas.findIndex(t => t.id === id);
    if (index === -1) return null;
    
    tarefas[index] = { ...tarefas[index], ...updates, dataAtualizacao: new Date().toISOString() };
    this.saveTarefas(tarefas);
    return tarefas[index];
  }

  static deleteTarefa(id: string): boolean {
    const tarefas = this.getTarefas();
    const filtered = tarefas.filter(t => t.id !== id);
    if (filtered.length === tarefas.length) return false;
    
    this.saveTarefas(filtered);
    return true;
  }

  static getTarefaById(id: string): Tarefa | null {
    const tarefas = this.getTarefas();
    return tarefas.find(t => t.id === id) || null;
  }

  static getTarefasByProjetoId(projetoId: string): Tarefa[] {
    const tarefas = this.getTarefas();
    return tarefas.filter(t => t.projetoId === projetoId);
  }
}

export class EquipeStorage {
  static getEquipes(): Equipe[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.EQUIPES);
    return data ? JSON.parse(data) : [];
  }

  static saveEquipes(equipes: Equipe[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.EQUIPES, JSON.stringify(equipes));
  }

  static addEquipe(equipe: Equipe): Equipe {
    const equipes = this.getEquipes();
    equipes.push(equipe);
    this.saveEquipes(equipes);
    return equipe;
  }

  static updateEquipe(id: string, updates: Partial<Equipe>): Equipe | null {
    const equipes = this.getEquipes();
    const index = equipes.findIndex(e => e.id === id);
    if (index === -1) return null;
    
    equipes[index] = { ...equipes[index], ...updates, dataAtualizacao: new Date().toISOString() };
    this.saveEquipes(equipes);
    return equipes[index];
  }

  static deleteEquipe(id: string): boolean {
    const equipes = this.getEquipes();
    const filtered = equipes.filter(e => e.id !== id);
    if (filtered.length === equipes.length) return false;
    
    this.saveEquipes(filtered);
    return true;
  }

  static getEquipeById(id: string): Equipe | null {
    const equipes = this.getEquipes();
    return equipes.find(e => e.id === id) || null;
  }
}

export class TimesheetStorage {
  static getRegistros(): RegistroTempo[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.TIMESHEET);
    return data ? JSON.parse(data) : [];
  }

  static saveRegistros(registros: RegistroTempo[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.TIMESHEET, JSON.stringify(registros));
  }

  static addRegistro(registro: RegistroTempo): RegistroTempo {
    const registros = this.getRegistros();
    registros.push(registro);
    this.saveRegistros(registros);
    return registro;
  }

  static updateRegistro(id: string, updates: Partial<RegistroTempo>): RegistroTempo | null {
    const registros = this.getRegistros();
    const index = registros.findIndex(r => r.id === id);
    if (index === -1) return null;
    
    registros[index] = { ...registros[index], ...updates, dataAtualizacao: new Date().toISOString() };
    this.saveRegistros(registros);
    return registros[index];
  }

  static deleteRegistro(id: string): boolean {
    const registros = this.getRegistros();
    const filtered = registros.filter(r => r.id !== id);
    if (filtered.length === registros.length) return false;
    
    this.saveRegistros(filtered);
    return true;
  }

  static getRegistrosByProjetoId(projetoId: string): RegistroTempo[] {
    const registros = this.getRegistros();
    return registros.filter(r => r.projetoId === projetoId);
  }
}

export class OrcamentoStorage {
  static getOrcamentos(): OrcamentoProjeto[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.ORCAMENTOS);
    return data ? JSON.parse(data) : [];
  }

  static saveOrcamentos(orcamentos: OrcamentoProjeto[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.ORCAMENTOS, JSON.stringify(orcamentos));
  }

  static addOrcamento(orcamento: OrcamentoProjeto): OrcamentoProjeto {
    const orcamentos = this.getOrcamentos();
    orcamentos.push(orcamento);
    this.saveOrcamentos(orcamentos);
    return orcamento;
  }

  static updateOrcamento(id: string, updates: Partial<OrcamentoProjeto>): OrcamentoProjeto | null {
    const orcamentos = this.getOrcamentos();
    const index = orcamentos.findIndex(o => o.id === id);
    if (index === -1) return null;
    
    orcamentos[index] = { ...orcamentos[index], ...updates, dataAtualizacao: new Date().toISOString() };
    this.saveOrcamentos(orcamentos);
    return orcamentos[index];
  }

  static deleteOrcamento(id: string): boolean {
    const orcamentos = this.getOrcamentos();
    const filtered = orcamentos.filter(o => o.id !== id);
    if (filtered.length === orcamentos.length) return false;
    
    this.saveOrcamentos(filtered);
    return true;
  }

  static getOrcamentosByProjetoId(projetoId: string): OrcamentoProjeto[] {
    const orcamentos = this.getOrcamentos();
    return orcamentos.filter(o => o.projetoId === projetoId);
  }
}

export class DocumentoStorage {
  static getDocumentos(): DocumentoProjeto[] {
    if (typeof window === 'undefined') return [];
    const data = localStorage.getItem(STORAGE_KEYS.DOCUMENTOS);
    return data ? JSON.parse(data) : [];
  }

  static saveDocumentos(documentos: DocumentoProjeto[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.DOCUMENTOS, JSON.stringify(documentos));
  }

  static addDocumento(documento: DocumentoProjeto): DocumentoProjeto {
    const documentos = this.getDocumentos();
    documentos.push(documento);
    this.saveDocumentos(documentos);
    return documento;
  }

  static updateDocumento(id: string, updates: Partial<DocumentoProjeto>): DocumentoProjeto | null {
    const documentos = this.getDocumentos();
    const index = documentos.findIndex(d => d.id === id);
    if (index === -1) return null;
    
    documentos[index] = { ...documentos[index], ...updates, dataAtualizacao: new Date().toISOString() };
    this.saveDocumentos(documentos);
    return documentos[index];
  }

  static deleteDocumento(id: string): boolean {
    const documentos = this.getDocumentos();
    const filtered = documentos.filter(d => d.id !== id);
    if (filtered.length === documentos.length) return false;
    
    this.saveDocumentos(filtered);
    return true;
  }

  static getDocumentosByProjetoId(projetoId: string): DocumentoProjeto[] {
    const documentos = this.getDocumentos();
    return documentos.filter(d => d.projetoId === projetoId);
  }
}
