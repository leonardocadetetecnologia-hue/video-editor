"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { defaultPreset, uid } from "@/lib/model/defaults";
import { getFormat } from "@/lib/model/formats";
import type { FormatId, Project, VideoPreset } from "@/lib/model/types";
import { Button, Dialog, Label, Select, TextInput } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { FormatPicker } from "./FormatPicker";
import { PresetForm } from "./PresetForm";
import { cn } from "@/lib/utils";

export function useSettingsAndPresets() {
  const settings = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const presets = useQuery({ queryKey: ["presets"], queryFn: api.presets });
  return { settings: settings.data, presets: presets.data ?? [], loading: settings.isLoading || presets.isLoading };
}

/** Primeiro uso: pergunta qual é o padrão de vídeo e salva como preset padrão. */
export function OnboardingDialog() {
  const qc = useQueryClient();
  const { settings } = useSettingsAndPresets();
  const [preset, setPreset] = useState<VideoPreset>(() => defaultPreset());
  const save = useMutation({
    mutationFn: () => api.savePreset(preset, true),
    onSuccess: async () => {
      await api.updateSettings({ onboardingDone: true });
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["presets"] });
      toast.ok(`Padrão "${preset.name}" salvo. Ele será usado em todos os novos projetos.`);
    },
    onError: (e) => toast.error(e.message),
  });
  const open = Boolean(settings && !settings.onboardingDone);
  return (
    <Dialog
      open={open}
      onOpenChange={() => {}}
      dismissible={false}
      title="Qual é o seu padrão de vídeo?"
      description="Responda uma vez. O padrão fica salvo e é aplicado automaticamente aos novos projetos — você pode criar outros padrões ou alterá-lo depois em Configurações."
      className="w-[min(680px,calc(100vw-32px))]"
    >
      <PresetForm value={preset} onChange={setPreset} />
      <div className="mt-5 flex justify-end">
        <Button variant="gradient" onClick={() => save.mutate()} disabled={save.isPending || !preset.name.trim()}>
          Salvar meu padrão
        </Button>
      </div>
    </Dialog>
  );
}

/**
 * Novo projeto: SEMPRE pergunta se o vídeo é Story, Feed ou Reels.
 * O formato vem pré-selecionado do padrão salvo, então basta confirmar.
 */
export function NewProjectDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (p: Project) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Novo projeto" description="Este vídeo é para Story, Feed ou Reels?" className="w-[min(680px,calc(100vw-32px))]">
      {/* Montado a cada abertura: a pergunta do formato sempre recomeça do padrão salvo. */}
      {open && <NewProjectBody onOpenChange={onOpenChange} onCreated={onCreated} />}
    </Dialog>
  );
}

function NewProjectBody({ onOpenChange, onCreated }: { onOpenChange: (o: boolean) => void; onCreated: (p: Project) => void }) {
  const { settings, presets } = useSettingsAndPresets();
  const def = presets.find((p) => p.id === settings?.defaultPresetId) ?? presets[0];
  const [name, setName] = useState("");
  const [presetDraft, setPresetId] = useState<string | null>(null);
  const [formatDraft, setFormatId] = useState<FormatId | null>(null);
  const presetId = presetDraft ?? def?.id ?? "none";
  const formatId = formatDraft ?? presets.find((p) => p.id === presetId)?.formatId ?? null;

  const create = useMutation({
    mutationFn: () =>
      api.createProject({ name: name.trim() || `${getFormat(formatId!).label} ${new Date().toLocaleDateString("pt-BR")}`, formatId: formatId!, presetId: presetId === "none" ? null : presetId }),
    onSuccess: (p) => {
      onOpenChange(false);
      onCreated(p);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col gap-4">
        <FormatPicker value={formatId} onChange={setFormatId} />
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Nome do projeto</Label>
            <TextInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Lançamento coleção verão" onKeyDown={(e) => e.key === "Enter" && formatId && create.mutate()} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Padrão aplicado</Label>
            <Select
              value={presetId}
              onChange={(v) => {
                setPresetId(v);
                const p = presets.find((x) => x.id === v);
                if (p) setFormatId(p.formatId);
              }}
              ariaLabel="Padrão aplicado"
              options={[
                ...presets.map((p) => ({ value: p.id, label: `${p.name}${p.id === settings?.defaultPresetId ? " (padrão)" : ""}` })),
                { value: "none", label: "Sem padrão (valores de fábrica)" },
              ]}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="gradient" disabled={!formatId || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? "Criando…" : "Criar projeto"}
          </Button>
        </div>
    </div>
  );
}

/** Gerenciador de padrões de vídeo e estilos salvos. */
export function PresetsManagerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { settings, presets } = useSettingsAndPresets();
  const styles = useQuery({ queryKey: ["styles"], queryFn: api.styles, enabled: open });
  const [editing, setEditing] = useState<VideoPreset | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["presets"] });
    qc.invalidateQueries({ queryKey: ["settings"] });
    qc.invalidateQueries({ queryKey: ["styles"] });
  };

  const save = async (makeDefault: boolean) => {
    if (!editing) return;
    try {
      await api.savePreset(editing, makeDefault);
      toast.ok("Padrão salvo");
      setEditing(null);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (setEditing(null), onOpenChange(o))} title="Padrões e estilos" className="w-[min(720px,calc(100vw-32px))]">
      {editing ? (
        <div>
          <PresetForm value={editing} onChange={setEditing} />
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Voltar
            </Button>
            <Button onClick={() => save(false)}>Salvar</Button>
            <Button variant="gradient" onClick={() => save(true)}>
              Salvar como padrão
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label>Padrões de vídeo</Label>
              <Button size="sm" onClick={() => setEditing({ ...defaultPreset(), id: uid("pre_"), name: "Novo padrão" })}>
                <Plus size={14} /> Novo padrão
              </Button>
            </div>
            <div className="flex flex-col gap-1.5">
              {presets.length === 0 && <p className="text-[12px] text-muted">Nenhum padrão salvo ainda.</p>}
              {presets.map((p) => {
                const isDefault = p.id === settings?.defaultPresetId;
                const f = getFormat(p.formatId);
                return (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg border border-line bg-panel-2 px-3 py-2">
                    <button
                      title={isDefault ? "Padrão atual" : "Tornar padrão"}
                      onClick={async () => {
                        await api.updateSettings({ defaultPresetId: p.id });
                        refresh();
                      }}
                      className={cn("rounded p-1", isDefault ? "text-yellow-400" : "text-muted hover:text-fg")}
                    >
                      <Star size={15} fill={isDefault ? "currentColor" : "none"} />
                    </button>
                    <div className="flex-1">
                      <div className="font-medium">{p.name}</div>
                      <div className="text-[11px] text-muted">
                        {f.label} {f.ratio} · {p.fps} fps · {p.export.codec.toUpperCase()} {p.export.quality}
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setEditing(structuredClone(p))}>
                      <Pencil size={14} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Excluir"
                      onClick={async () => {
                        if (!confirm(`Excluir o padrão "${p.name}"?`)) return;
                        await api.deletePreset(p.id);
                        refresh();
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <Label>Estilos salvos</Label>
            <p className="mt-1 mb-2 text-[12px] text-muted">Salve estilos de texto e looks (cor + transições) pelo painel de propriedades de um clipe.</p>
            <div className="flex flex-wrap gap-1.5">
              {(styles.data ?? []).length === 0 && <p className="text-[12px] text-muted">Nenhum estilo salvo ainda.</p>}
              {(styles.data ?? []).map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-panel-2 py-1 pr-1 pl-2.5 text-[12px]">
                  <span className="text-muted">{s.kind === "text" ? "Texto" : "Look"}:</span> {s.name}
                  <button
                    aria-label={`Excluir estilo ${s.name}`}
                    className="rounded p-0.5 text-muted hover:text-danger"
                    onClick={async () => {
                      await api.deleteStyle(s.id);
                      refresh();
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}
