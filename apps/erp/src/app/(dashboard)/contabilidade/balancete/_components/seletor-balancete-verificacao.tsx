'use client';

/**
 * Seletor de exercício e períodos para o balancete de verificação PHC.
 *
 * ADR-0040, issue #280. Empurra a URL; o Server Component faz a leitura.
 *
 * Os ids nos SelectTrigger são obrigatórios para que o `<Label htmlFor>` funcione
 * e o Playwright consiga usar `getByLabel('Período inicial')`.
 */

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { codigoContaPGCValido } from '@/lib/validations/contabilidade';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ---------------------------------------------------------------------------
// Dados estáticos de períodos
// ---------------------------------------------------------------------------

const NOMES_MES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

/** Separador em traço (U+2014 — em dash), como o PHC usa. */
const SEP = '—';

const OPCOES_PERIODO = [
  ...NOMES_MES.map((nome, i) => ({
    value: String(i + 1),
    label: `${String(i + 1).padStart(2, '0')} ${SEP} ${nome}`,
  })),
  { value: '13', label: `13 ${SEP} Encerramento` },
];

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

// Sentinela 'todos' em vez de '' — o componente Select da casa descarta itens com value ''.
const NIVEL_TODOS = 'todos';
const OPCOES_NIVEL = [
  { value: NIVEL_TODOS, label: 'Todos' },
  ...Array.from({ length: 7 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) })),
];

// S3: classe (sentinela 'todas') e tipo de apresentação.
const CLASSE_TODAS = 'todas';

export type TipoApresentacao = 'ambos' | 'periodo' | 'acumulado';
const OPCOES_TIPO: { value: TipoApresentacao; label: string }[] = [
  { value: 'ambos', label: 'Por período e acumulado' },
  { value: 'periodo', label: 'Por período' },
  { value: 'acumulado', label: 'Acumulado' },
];

type CampoCodigo = 'contaInicial' | 'contaFinal' | 'excluir';

/** Mensagem de erro de um campo de código(s), ou undefined se for válido (vazio é válido). */
function erroCodigos(campo: CampoCodigo, valor: string): string | undefined {
  const codigos = campo === 'excluir'
    ? valor.split(',').map((c) => c.trim()).filter(Boolean)
    : [valor.trim()].filter(Boolean);
  const invalido = codigos.find((c) => !codigoContaPGCValido(c));
  if (invalido === undefined) return undefined;
  return `Código de conta inválido: «${invalido}» (ex.: 62 ou 6.2.1).`;
}

/** Filtros de apresentação (S3) tal como vêm do URL. */
export interface FiltrosApresentacao {
  contaInicial: string;
  contaFinal: string;
  /** '1'..'8' ou '' (todas). */
  classe: string;
  /** Códigos separados por vírgula. */
  excluir: string;
  zeradas: boolean;
  comSaldo: boolean;
  pesquisa: string;
  tipo: TipoApresentacao;
}

interface Props {
  exercicios: { id: string; codigo: string }[];
  exercicioAtual: string;
  periodoInicial: number;
  periodoFinal: number;
  incluir13: boolean;
  nivelAtual?: number;
  razaoAtual?: boolean;
  /** Opções do Select «Classe»: value '1'..'8', label «N — Nome». */
  classes: { value: string; label: string }[];
  filtrosAtuais: FiltrosApresentacao;
}

export function SeletorBalanceteVerificacao({
  exercicios,
  exercicioAtual,
  periodoInicial,
  periodoFinal,
  incluir13,
  nivelAtual,
  razaoAtual = false,
  classes,
  filtrosAtuais,
}: Props) {
  const router = useRouter();
  const [aAplicar, startTransition] = useTransition();
  const [erros, setErros] = useState<Partial<Record<CampoCodigo, string>>>({});

  const [exercicio, setExercicio] = useState(exercicioAtual);
  const [pInicial, setPInicial] = useState(periodoInicial);
  const [pFinal, setPFinal] = useState(periodoFinal);
  const [incl13, setIncl13] = useState(incluir13);
  const [nivel, setNivel] = useState<string>(nivelAtual !== undefined ? String(nivelAtual) : NIVEL_TODOS);
  const [razao, setRazao] = useState(razaoAtual);
  const [filtros, setFiltros] = useState(filtrosAtuais);
  const mudar = <K extends keyof FiltrosApresentacao>(k: K, v: FiltrosApresentacao[K]) =>
    setFiltros((f) => ({ ...f, [k]: v }));
  /** Campo de código(s): o erro desaparece assim que o utilizador volta a escrever. */
  const mudarCodigo = (k: CampoCodigo, v: string) => {
    mudar(k, v);
    setErros((e) => ({ ...e, [k]: undefined }));
  };
  /** Props de acessibilidade do erro de um campo de código(s). */
  const aria = (k: CampoCodigo, id: string) =>
    erros[k] ? { 'aria-invalid': true as const, 'aria-describedby': `${id}-erro` } : {};

  // «Adjusting state when a prop changes» (React docs) — no effect needed.
  // Next.js App Router updates client components in-place across RSC navigations
  // (key remount does not occur); this pattern resets local state during render
  // when the server sends new clamped values.
  const chave = `${exercicioAtual}-${periodoInicial}-${periodoFinal}-${incluir13}-${nivelAtual ?? NIVEL_TODOS}-${razaoAtual}-${JSON.stringify(filtrosAtuais)}`;
  const [chaveAnterior, setChaveAnterior] = useState(chave);
  if (chave !== chaveAnterior) {
    setChaveAnterior(chave);
    setExercicio(exercicioAtual);
    setPInicial(periodoInicial);
    setPFinal(periodoFinal);
    setIncl13(incluir13);
    setNivel(nivelAtual !== undefined ? String(nivelAtual) : NIVEL_TODOS);
    setRazao(razaoAtual);
      setFiltros(filtrosAtuais);
      setErros({});
    }

  const labelInicial = OPCOES_PERIODO.find((o) => o.value === String(pInicial))?.label ?? '';
  const labelFinal = OPCOES_PERIODO.find((o) => o.value === String(pFinal))?.label ?? '';
  const labelClasse = classes.find((o) => o.value === filtros.classe)?.label ?? 'Todas';
  const labelTipo = OPCOES_TIPO.find((o) => o.value === filtros.tipo)?.label ?? '';

  const handleAplicar = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const novosErros: Partial<Record<CampoCodigo, string>> = {
      contaInicial: erroCodigos('contaInicial', filtros.contaInicial),
      contaFinal: erroCodigos('contaFinal', filtros.contaFinal),
      excluir: erroCodigos('excluir', filtros.excluir),
    };
    setErros(novosErros);
    if (Object.values(novosErros).some(Boolean)) return; // não navega; os valores ficam

    // Clamp before push so the URL already carries the normalised values
    const ateEfetivo = incl13 ? pFinal : Math.min(pFinal, 12);
    const deEfetivo = Math.min(pInicial, ateEfetivo);
    const params = new URLSearchParams();
    params.set('exercicio', exercicio);
    params.set('de', String(deEfetivo));
    params.set('ate', String(ateEfetivo));
    if (incl13) params.set('p13', '1');
    if (nivel !== NIVEL_TODOS) params.set('nivel', nivel);
    if (razao) params.set('razao', '1');
    const ci = filtros.contaInicial.trim();
    const cf = filtros.contaFinal.trim();
    const excluir = filtros.excluir.split(',').map((c) => c.trim()).filter(Boolean).join(',');
    const q = filtros.pesquisa.trim();
    if (ci) params.set('ci', ci);
    if (cf) params.set('cf', cf);
    if (filtros.classe) params.set('classe', filtros.classe);
    if (excluir) params.set('excluir', excluir);
    if (filtros.zeradas) params.set('zeradas', '1');
    if (filtros.comSaldo) params.set('comSaldo', '1');
    if (q) params.set('q', q);
    if (filtros.tipo !== 'ambos') params.set('tipo', filtros.tipo);
    startTransition(() => router.push(`/contabilidade/balancete?${params.toString()}`));
  };

  return (
    <form onSubmit={handleAplicar} noValidate className="space-y-4 rounded-lg border bg-card p-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-end">
        {/* Exercício */}
        <div className="space-y-2">
          <Label htmlFor="bv-exercicio">Exercício</Label>
          <Select value={exercicio} onValueChange={setExercicio}>
            <SelectTrigger id="bv-exercicio">
              <SelectValue placeholder="Exercício">{exercicio}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {exercicios.map((ex) => (
                <SelectItem key={ex.id} value={ex.codigo}>
                  {ex.codigo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Período inicial */}
        <div className="space-y-2">
          <Label htmlFor="bv-periodo-inicial">Período inicial</Label>
          <Select
            value={String(pInicial)}
            onValueChange={(v) => setPInicial(Number(v))}
          >
            <SelectTrigger id="bv-periodo-inicial">
              <SelectValue placeholder="Período inicial">{labelInicial}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {OPCOES_PERIODO.filter((o) => o.value !== '13' || incl13).map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Período final */}
        <div className="space-y-2">
          <Label htmlFor="bv-periodo-final">Período final</Label>
          <Select
            value={String(pFinal)}
            onValueChange={(v) => setPFinal(Number(v))}
          >
            <SelectTrigger id="bv-periodo-final">
              <SelectValue placeholder="Período final">{labelFinal}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {OPCOES_PERIODO.filter((o) => o.value !== '13' || incl13).map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Grau máximo */}
        <div className="space-y-2">
          <Label htmlFor="bv-nivel">Grau máximo</Label>
          <Select value={String(nivel)} onValueChange={setNivel}>
            <SelectTrigger id="bv-nivel">
              <SelectValue placeholder="Todos">{nivel === NIVEL_TODOS ? 'Todos' : nivel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {OPCOES_NIVEL.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Período 13 e contas de razão */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="bv-incluir13"
              checked={incl13}
              onCheckedChange={(v) => {
                const novo = Boolean(v);
                setIncl13(novo);
                // NIT-2: ao destickr p13, clamp os períodos a 12
                if (!novo) {
                  if (pInicial > 12) setPInicial(12);
                  if (pFinal > 12) setPFinal(12);
                }
              }}
            />
            <Label htmlFor="bv-incluir13" className="cursor-pointer text-sm font-normal">
              Incluir período 13 (encerramento)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="bv-razao"
              checked={razao}
              onCheckedChange={(v) => setRazao(Boolean(v))}
            />
            <Label htmlFor="bv-razao" className="cursor-pointer text-sm font-normal">
              Ver apenas contas de razão
            </Label>
          </div>

        </div>
      </div>

      {/* S3: filtros de apresentação (não alteram Totais nem o equilíbrio) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <div className="space-y-2">
          <Label htmlFor="bv-conta-inicial">Conta inicial</Label>
          <Input
            id="bv-conta-inicial"
            value={filtros.contaInicial}
            onChange={(e) => mudarCodigo('contaInicial', e.target.value)}
            {...aria('contaInicial', 'bv-conta-inicial')}
          />
          <ErroCampo id="bv-conta-inicial-erro" mensagem={erros.contaInicial} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bv-conta-final">Conta final</Label>
          <Input
            id="bv-conta-final"
            value={filtros.contaFinal}
            onChange={(e) => mudarCodigo('contaFinal', e.target.value)}
            {...aria('contaFinal', 'bv-conta-final')}
          />
          <ErroCampo id="bv-conta-final-erro" mensagem={erros.contaFinal} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bv-classe">Classe</Label>
          <Select
            value={filtros.classe || CLASSE_TODAS}
            onValueChange={(v) => mudar('classe', v === CLASSE_TODAS ? '' : v)}
          >
            <SelectTrigger id="bv-classe">
              <SelectValue placeholder="Todas">{labelClasse}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={CLASSE_TODAS}>Todas</SelectItem>
              {classes.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="bv-tipo">Apresentação</Label>
          <Select value={filtros.tipo} onValueChange={(v) => mudar('tipo', v as TipoApresentacao)}>
            <SelectTrigger id="bv-tipo">
              <SelectValue placeholder="Por período e acumulado">{labelTipo}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {OPCOES_TIPO.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="bv-excluir">Excluir contas</Label>
          <Input
            id="bv-excluir"
            placeholder="ex.: 121, 6112"
              value={filtros.excluir}
              onChange={(e) => mudarCodigo('excluir', e.target.value)}
              {...aria('excluir', 'bv-excluir')}
            />
            <ErroCampo id="bv-excluir-erro" mensagem={erros.excluir} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bv-pesquisa">Pesquisar</Label>
          <Input
            id="bv-pesquisa"
            type="search"
            placeholder="Código ou nome"
            value={filtros.pesquisa}
            onChange={(e) => mudar('pesquisa', e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2 lg:col-span-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id="bv-zeradas"
              checked={filtros.zeradas}
              onCheckedChange={(v) => mudar('zeradas', Boolean(v))}
            />
            <Label htmlFor="bv-zeradas" className="cursor-pointer text-sm font-normal">
              Ver contas sem movimento e saldo
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="bv-com-saldo"
              checked={filtros.comSaldo}
              onCheckedChange={(v) => mudar('comSaldo', Boolean(v))}
            />
            <Label htmlFor="bv-com-saldo" className="cursor-pointer text-sm font-normal">
              Ver apenas contas com saldo
            </Label>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={aAplicar}>
          {aAplicar ? 'A aplicar…' : 'Aplicar'}
        </Button>
      </div>
    </form>
  );
}

function ErroCampo({ id, mensagem }: { id: string; mensagem?: string }) {
  if (!mensagem) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {mensagem}
    </p>
  );
}
