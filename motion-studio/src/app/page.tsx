"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clapperboard, Plus, Settings2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { getFormat } from "@/lib/model/formats";
import { relativeDate } from "@/lib/utils";
import { Button } from "@/components/ui/primitives";
import { NewProjectDialog, OnboardingDialog, PresetsManagerDialog, useSettingsAndPresets } from "@/components/presets/dialogs";
import { toast } from "@/components/ui/toast";

export default function HomePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects });
  const { settings, presets } = useSettingsAndPresets();
  const [newOpen, setNewOpen] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const del = useMutation({
    mutationFn: api.deleteProject,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
    onError: (e) => toast.error(e.message),
  });
  const defaultPreset = presets.find((p) => p.id === settings?.defaultPresetId);

  return (
    <div className="h-full overflow-y-auto">
      <header className="flex items-center gap-3 border-b border-line bg-panel px-6 py-3">
        <div className="ig-gradient flex h-8 w-8 items-center justify-center rounded-lg">
          <Clapperboard size={17} className="text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-[15px] font-semibold">Motion Studio</h1>
          <p className="text-[11px] text-muted">Editor local de vídeo e motion design para Story, Feed e Reels</p>
        </div>
        <Button variant="ghost" onClick={() => setPresetsOpen(true)}>
          <Settings2 size={15} /> Padrões e estilos
        </Button>
        <Button variant="gradient" onClick={() => setNewOpen(true)}>
          <Plus size={15} /> Novo projeto
        </Button>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {defaultPreset && (
          <p className="mb-5 text-[12px] text-muted">
            Padrão atual: <span className="text-fg">{defaultPreset.name}</span> — {getFormat(defaultPreset.formatId).label} · {defaultPreset.fps} fps
          </p>
        )}
        <h2 className="mb-3 text-[13px] font-semibold tracking-wide text-muted uppercase">Projetos</h2>
        {projects.isLoading && <p className="text-muted">Carregando…</p>}
        {projects.data?.length === 0 && (
          <button
            onClick={() => setNewOpen(true)}
            className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-line py-16 text-muted hover:border-accent hover:text-fg"
          >
            <Plus size={28} />
            <span className="text-[14px]">Crie seu primeiro projeto</span>
            <span className="text-[12px]">Story, Feed ou Reels — você escolhe na hora</span>
          </button>
        )}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-4">
          {projects.data?.map((p) => {
            const f = getFormat(p.formatId);
            return (
              <div key={p.id} className="group relative overflow-hidden rounded-xl border border-line bg-panel transition-colors hover:border-accent/60">
                <button onClick={() => router.push(`/editor/${p.id}`)} className="block w-full text-left">
                  <div className="checker flex aspect-[4/5] items-center justify-center overflow-hidden">
                    {p.thumbAssetId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/media/${p.thumbAssetId}/thumb`} alt="" className="max-h-full max-w-full object-contain" style={{ aspectRatio: `${f.width}/${f.height}` }} />
                    ) : (
                      <div className="rounded border-2 border-muted/40" style={{ width: f.width > f.height ? "70%" : `${(f.width / f.height) * 70}%`, aspectRatio: `${f.width}/${f.height}` }} />
                    )}
                  </div>
                  <div className="p-3">
                    <div className="truncate font-medium">{p.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                      <span className="rounded bg-panel-3 px-1.5 py-0.5 text-fg">
                        {f.label} {f.ratio}
                      </span>
                      <span>{relativeDate(p.updatedAt)}</span>
                    </div>
                  </div>
                </button>
                <button
                  aria-label={`Excluir projeto ${p.name}`}
                  onClick={() => confirm(`Excluir o projeto "${p.name}"? As mídias continuam na biblioteca.`) && del.mutate(p.id)}
                  className="absolute top-2 right-2 rounded-md bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-danger"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      </main>

      <OnboardingDialog />
      <NewProjectDialog open={newOpen} onOpenChange={setNewOpen} onCreated={(p) => router.push(`/editor/${p.id}`)} />
      <PresetsManagerDialog open={presetsOpen} onOpenChange={setPresetsOpen} />
    </div>
  );
}
