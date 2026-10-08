"use client";

/**
 * Formulário de centro de trabalho (criar/editar) — #165. Mesmo schema Zod do servidor
 * (`CreateCentroTrabalhoSchema`: capacidade até 24 h/dia). O código duplicado é recusado pelo
 * serviço (`CENTRO_CODIGO_DUPLICADO`) e chega aqui como toast.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  FormPage,
  FormSection,
  UnsavedChangesGuard,
} from "@/components/patterns";
import {
  criarCentroTrabalhoAction,
  actualizarCentroTrabalhoAction,
} from "@/server/actions/producao.actions";
import {
  CreateCentroTrabalhoSchema,
  type CreateCentroTrabalhoInput,
} from "@/lib/validations/producao";

export const TIPOS_CENTRO = [
  { value: "MAQUINA", label: "Máquina" },
  { value: "PESSOA", label: "Pessoa" },
  { value: "CELULA", label: "Célula" },
  { value: "LINHA", label: "Linha" },
] as const;

const LISTA = "/producao/centros-trabalho";

/** '' → undefined (campo vazio), senão número. */
const paraNumero = (v: string) => (v === "" ? undefined : Number(v));

export function CentroTrabalhoForm({
  centroId,
  valoresIniciais,
}: {
  /** Presente em modo edição. */
  centroId?: string;
  valoresIniciais?: Partial<CreateCentroTrabalhoInput>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const edicao = Boolean(centroId);

  const form = useForm<CreateCentroTrabalhoInput>({
    resolver: zodResolver(CreateCentroTrabalhoSchema),
    defaultValues: {
      codigo: valoresIniciais?.codigo ?? "",
      nome: valoresIniciais?.nome ?? "",
      tipo: valoresIniciais?.tipo ?? "MAQUINA",
      descricao: valoresIniciais?.descricao ?? "",
      custoHora: valoresIniciais?.custoHora ?? 0,
      capacidadeHorasDia: valoresIniciais?.capacidadeHorasDia,
      ativo: valoresIniciais?.ativo ?? true,
    },
  });

  const { isDirty } = form.formState;

  function onSubmit(dados: CreateCentroTrabalhoInput) {
    startTransition(async () => {
      const r = centroId
        ? await actualizarCentroTrabalhoAction({ id: centroId, data: dados })
        : await criarCentroTrabalhoAction({
            ...dados,
            descricao: dados.descricao || undefined,
          });
      if (!r.ok) {
        toast.error(
          r.error.message ?? "Não foi possível gravar o centro de trabalho.",
        );
        return;
      }
      toast.success(
        edicao
          ? "Centro de trabalho actualizado."
          : "Centro de trabalho criado.",
      );
      router.push(LISTA);
    });
  }

  return (
    <>
      <UnsavedChangesGuard isDirty={isDirty && !isPending} />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <FormPage
            actions={
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push(LISTA)}
                  disabled={isPending}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending
                    ? "A gravar…"
                    : edicao
                      ? "Guardar"
                      : "Criar centro"}
                </Button>
              </>
            }
          >
            <FormSection title="Identificação">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="codigo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Código *</FormLabel>
                      <FormControl>
                        <Input placeholder="CT-001" maxLength={20} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Linha de montagem 1"
                          maxLength={100}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tipo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo *</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccione o tipo">
                              {
                                TIPOS_CENTRO.find(
                                  (t) => t.value === field.value,
                                )?.label
                              }
                            </SelectValue>
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TIPOS_CENTRO.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="descricao"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={2}
                        maxLength={500}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </FormSection>

            <FormSection title="Custo e capacidade">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="custoHora"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custo por hora (MT) *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          name={field.name}
                          ref={field.ref}
                          onBlur={field.onBlur}
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(paraNumero(e.target.value))
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="capacidadeHorasDia"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Capacidade (h/dia)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          max={24}
                          step="0.5"
                          name={field.name}
                          ref={field.ref}
                          onBlur={field.onBlur}
                          value={field.value ?? ""}
                          // 0 (o Input repõe-no ao sair vazio) é «sem capacidade definida».
                          onChange={(e) =>
                            field.onChange(
                              paraNumero(e.target.value) || undefined,
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {edicao && (
                  <FormField
                    control={form.control}
                    name="ativo"
                    render={({ field }) => (
                      <FormItem className="flex flex-col gap-3">
                        <FormLabel>Activo</FormLabel>
                        <FormControl>
                          <Switch
                            checked={field.value ?? true}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </FormSection>
          </FormPage>
        </form>
      </Form>
    </>
  );
}
