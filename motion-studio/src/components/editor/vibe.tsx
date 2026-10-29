"use client";

import { Bot, Check, Copy, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type VibeStatus } from "@/lib/api";
import type { Clip, Project } from "@/lib/model/types";
import { cn } from "@/lib/utils";
import { ownSave, seek, useEditor } from "@/store/editor";
import { toast } from "@/components/ui/toast";
import { CUSTOM_COMPONENTS } from "@/remotion/custom/registry";

const POLL_MS = 700;

function catalogSignature(): string {
  const out: Record<string, unknown> = {};
  for (const [id, d] of Object.entries(CUSTOM_COMPONENTS)) {
    out[id] = { label: d.label, description: d.description, defaultSeconds: d.defaultSeconds, defaultBox: d.defaultBox, defaultProps: d.defaultProps, propSpecs: d.propSpecs };
  }
  return JSON.stringify(out);
}

/** Primeiro clipe novo ou alterado (o de menor início), para a prévia "abrir" nele. */
function firstChangedClip(before: Project, after: Project): Clip | null {
  const old = new Map<string, string>();
  for (const t of before.tracks) for (const c of t.clips) old.set(c.id, JSON.stringify(c));
  let best: Clip | null = null;
  for (const t of after.tracks)
    for (const c of t.clips) {
      if (old.get(c.id) === JSON.stringify(c)) continue;
      if (!best || c.start < best.start) best = c;
    }
  return best;
}

/**
 * Sincronização com o Claude Code: quando o espelho vibe/projects/<id>.json é
 * editado, a revisão no servidor sobe e o editor aplica a nova versão na hora.
 */
export function useVibeSync(projectId: string) {
  const [status, setStatus] = useState<VibeStatus | null>(null);
  useEffect(() => {
    let busy = false;
    let publishedCatalog = "";
    const tick = async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        // novas animações criadas pelo Claude chegam por hot reload: republica o catálogo
        const catalog = catalogSignature();
        if (catalog !== publishedCatalog) {
          await fetch("/api/vibe/components", { method: "POST", headers: { "Content-Type": "application/json" }, body: catalog });
          publishedCatalog = catalog;
        }
        const s = useEditor.getState();
        if (!s.project || s.saving || s.gestureBase) return;
        const r = await api.revision(projectId);
        setStatus((prev) => (prev?.at === r.vibe?.at ? prev : r.vibe));
        if (r.revision <= useEditor.getState().serverRevision) return;
        const { project, revision } = await api.project(projectId);
        const cur = useEditor.getState();
        if (!cur.project || cur.saving || cur.gestureBase) return;
        const json = JSON.stringify(project);
        // a revisão subiu por um salvamento do próprio editor: nada a aplicar
        if (json === ownSave.json || json === JSON.stringify(cur.project)) {
          useEditor.setState({ serverRevision: revision });
          return;
        }
        const changed = firstChangedClip(cur.project, project);
        cur.applyRemote(project, revision);
        if (changed) {
          useEditor.getState().select([changed.id]);
          seek(changed.start + Math.min(Math.round(project.fps / 2), Math.max(0, changed.duration - 1)));
        }
        toast.info("Prévia atualizada pelo Claude Code. Ctrl+Z desfaz.");
      } catch {
        // servidor reiniciando ou offline: tenta no próximo ciclo
      } finally {
        busy = false;
      }
    };
    const t = setInterval(tick, POLL_MS);
    return () => clearInterval(t);
  }, [projectId]);
  return status;
}

/** Publica seleção e cursor em vibe/context.json ("este clipe", "aqui"). */
export function useVibeContext(projectId: string) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const publish = () => {
      const s = useEditor.getState();
      if (!s.project) return;
      api.postContext({ projectId, frame: s.frame, selection: s.selection, playing: s.playing });
    };
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.selection === prev.selection && s.frame === prev.frame && s.playing === prev.playing) return;
      if (s.playing && s.selection === prev.selection && s.playing === prev.playing) return; // durante a reprodução, só ao pausar
      if (timer) clearTimeout(timer);
      timer = setTimeout(publish, 400);
    });
    publish();
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [projectId]);
}

export function VibeBadge({ projectId, status }: { projectId: string; status: VibeStatus | null }) {
  const [copied, setCopied] = useState(false);
  const path = `motion-studio/vibe/projects/${projectId}.json`;
  const hasErrors = Boolean(status?.errors.length);
  return (
    <div className="relative">
      <button
        onClick={() => {
          navigator.clipboard?.writeText(path).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        title={`Vibecoding pelo Claude Code\nArquivo vivo do projeto: ${path}\nPeça edições ao Claude Code; a prévia atualiza aqui. Clique para copiar o caminho.`}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px]",
          hasErrors ? "border-danger/60 bg-danger/10 text-danger" : "border-accent/40 bg-accent/10 text-fg",
        )}
      >
        {hasErrors ? <TriangleAlert size={12} /> : copied ? <Check size={12} className="text-ok" /> : <Bot size={12} className="text-accent" />}
        {hasErrors ? "Edição do Claude rejeitada" : copied ? "Caminho copiado" : "Vibe ao vivo"}
        {!hasErrors && !copied && <Copy size={10} className="opacity-50" />}
      </button>
      {hasErrors && (
        <div className="absolute top-9 right-0 z-40 w-96 rounded-lg border border-danger/50 bg-panel-2 p-3 text-[12px] shadow-2xl">
          <p className="mb-1.5 font-semibold">A última edição do arquivo do projeto não foi aplicada:</p>
          <ul className="list-disc space-y-1 pl-4 text-muted">
            {status!.errors.slice(0, 6).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted">O Claude Code vê o mesmo erro em vibe/projects/{projectId}.erros.txt e corrige em seguida.</p>
        </div>
      )}
    </div>
  );
}
