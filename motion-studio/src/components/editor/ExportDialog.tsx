"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ImageDown, Loader2, X } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";
import { DEFAULT_EXPORT } from "@/lib/model/defaults";
import { getFormat } from "@/lib/model/formats";
import type { ExportCodec, ExportQuality, ExportSettings, FormatId } from "@/lib/model/types";
import { relativeDate } from "@/lib/utils";
import { useEditor } from "@/store/editor";
import { Button, Dialog, Label, Select } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { FormatPicker } from "@/components/presets/FormatPicker";
import { CODEC_LABELS, QUALITY_LABELS } from "@/components/presets/labels";

export function ExportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Exportar" description="Este vídeo vai para Story, Feed ou Reels?" className="w-[min(720px,calc(100vw-32px))]">
      {/* Montado a cada abertura: a pergunta do destino sempre recomeça do formato do projeto. */}
      {open && <ExportBody />}
    </Dialog>
  );
}

function ExportBody() {
  const project = useEditor((s) => s.project)!;
  const frame = useEditor((s) => s.frame);
  const qc = useQueryClient();
  const presets = useQuery({ queryKey: ["presets"], queryFn: api.presets });
  const [target, setTarget] = useState<FormatId | null>(project.formatId);
  const [draft, setSettings] = useState<ExportSettings | null>(null);
  const settings = draft ?? presets.data?.find((p) => p.id === project.presetId)?.export ?? DEFAULT_EXPORT;

  const jobs = useQuery({
    queryKey: ["renders", project.id],
    queryFn: () => api.renders(project.id),
    refetchInterval: (q) => (q.state.data?.some((j) => j.status === "queued" || j.status === "rendering") ? 800 : false),
  });

  const start = useMutation({
    mutationFn: (kind: "video" | "still") =>
      api.startRender({ projectId: project.id, project: useEditor.getState().project!, kind, formatId: target!, exportSettings: settings, frame }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["renders", project.id] }),
    onError: (e) => toast.error(e.message),
  });

  const reframe = target && target !== project.formatId ? getFormat(target) : null;

  return (
    <>
      <div className="flex flex-col gap-4">
        <FormatPicker value={target} onChange={setTarget} />
        {reframe && (
          <p className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-[12px] text-yellow-200">
            O projeto está em {getFormat(project.formatId).label} {getFormat(project.formatId).ratio}. A exportação será reenquadrada para {reframe.label} {reframe.ratio} ({reframe.width}×{reframe.height}) sem alterar o projeto.
          </p>
        )}
        <div className="grid grid-cols-[1fr_160px_110px] gap-3">
          <div className="flex flex-col gap-1">
            <Label>Formato do arquivo</Label>
            <Select value={settings.codec} onChange={(v) => setSettings({ ...settings, codec: v as ExportCodec })} options={Object.entries(CODEC_LABELS).map(([k, l]) => ({ value: k, label: l }))} />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Qualidade</Label>
            <Select
              value={settings.quality}
              onChange={(v) => setSettings({ ...settings, quality: v as ExportQuality })}
              options={Object.entries(QUALITY_LABELS).map(([k, l]) => ({ value: k, label: l }))}
              className={settings.codec === "prores" ? "opacity-50" : ""}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Áudio</Label>
            <Select
              value={settings.audioBitrate}
              onChange={(v) => setSettings({ ...settings, audioBitrate: v as ExportSettings["audioBitrate"] })}
              options={["128k", "192k", "320k"].map((b) => ({ value: b, label: `${b}bps` }))}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={() => start.mutate("still")} disabled={!target || start.isPending} title="Salva o quadro sob o cursor como PNG">
            <ImageDown size={14} /> Quadro atual (PNG)
          </Button>
          <Button variant="gradient" onClick={() => start.mutate("video")} disabled={!target || start.isPending}>
            <Download size={14} /> Exportar vídeo
          </Button>
        </div>

        {(jobs.data?.length ?? 0) > 0 && (
          <div className="flex flex-col gap-2 border-t border-line pt-3">
            <Label>Exportações deste projeto</Label>
            {jobs.data!.slice(0, 8).map((j) => (
              <div key={j.id} className="rounded-md border border-line bg-panel-2 px-3 py-2">
                <div className="flex items-center gap-2 text-[12px]">
                  {(j.status === "rendering" || j.status === "queued") && <Loader2 size={13} className="animate-spin text-accent" />}
                  <span className="flex-1 truncate">{j.outputPath?.split(/[\\/]/).pop() ?? (j.kind === "still" ? "Quadro PNG" : "Vídeo")}</span>
                  <span className="text-[11px] text-muted">{relativeDate(j.createdAt)}</span>
                  {j.status === "done" && (
                    <a href={`/api/render/${j.id}/file?download=1`} className="rounded bg-accent px-2 py-0.5 text-[11px] text-white hover:bg-accent/85">
                      Baixar
                    </a>
                  )}
                  {(j.status === "rendering" || j.status === "queued") && (
                    <button aria-label="Cancelar" className="text-muted hover:text-danger" onClick={() => api.cancelRender(j.id).then(() => jobs.refetch())}>
                      <X size={14} />
                    </button>
                  )}
                </div>
                {(j.status === "rendering" || j.status === "queued") && (
                  <>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-bg">
                      <div className="ig-gradient h-full transition-all" style={{ width: `${Math.max(2, j.progress * 100)}%` }} />
                    </div>
                    <p className="mt-1 text-[11px] text-muted">
                      {j.stage ?? "Na fila…"} {j.progress > 0 && `· ${Math.round(j.progress * 100)}%`}
                    </p>
                  </>
                )}
                {j.status === "done" && <p className="mt-0.5 truncate text-[11px] text-muted" title={j.outputPath ?? ""}>Salvo em {j.outputPath}</p>}
                {j.status === "error" && <p className="mt-1 text-[11px] break-words text-danger">{j.error}</p>}
                {j.status === "canceled" && <p className="mt-0.5 text-[11px] text-muted">Cancelado</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
