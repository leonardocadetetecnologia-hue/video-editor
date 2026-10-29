"use client";

import { create } from "zustand";
import { api, type AiJob, type AiJobKind } from "@/lib/api";
import { captionsForAsset, removeSilencesFromClip, type WordCaption } from "@/lib/model/ai-ops";
import { createComponentClip } from "@/lib/model/defaults";
import { findClip } from "@/lib/model/ops";
import type { ComponentClip, MediaClip } from "@/lib/model/types";
import { CUSTOM_COMPONENTS } from "@/remotion/custom/registry";
import { useEditor } from "@/store/editor";
import { toast } from "@/components/ui/toast";

// Ações de IA local no editor: legendas automáticas, corte de silêncios e
// análise de mídia para o Claude Code. As tarefas rodam no servidor.

/** Tarefa em andamento por asset, para mostrar progresso nos botões. */
export const useAiProgress = create<{ running: Record<string, AiJob> }>(() => ({ running: {} }));

async function runJob(kind: AiJobKind, assetId: string): Promise<unknown> {
  let job = await api.startAiJob(kind, assetId);
  const key = `${kind}:${assetId}`;
  while (job.status === "running") {
    useAiProgress.setState((s) => ({ running: { ...s.running, [key]: job } }));
    await new Promise((r) => setTimeout(r, 600));
    job = await api.aiJob(job.id);
  }
  useAiProgress.setState((s) => {
    const running = { ...s.running };
    delete running[key];
    return { running };
  });
  if (job.status === "error") throw new Error(job.error ?? "Falha na tarefa de IA");
  return job.result;
}

const isCaptionOf = (assetId: string) => (c: { type: string; componentId?: string; props?: Record<string, unknown> }) =>
  c.type === "component" && c.componentId === "legendas" && c.props?.sourceAssetId === assetId;

/** Transcreve a fala do asset e cria (ou refaz) a faixa de legendas animadas. */
export async function generateCaptions(assetId: string, opts: { quiet?: boolean } = {}) {
  try {
    if (!opts.quiet) toast.info("Transcrevendo a fala com a IA local… (a primeira vez demora mais)");
    const { captions } = (await runJob("transcribe", assetId)) as { captions: WordCaption[] };
    if (!captions.length) return toast.info("Nenhuma fala encontrada neste áudio.");
    const s = useEditor.getState();
    const prev = s.project!.tracks.flatMap((t) => t.clips).find(isCaptionOf(assetId)) as ComponentClip | undefined;
    s.insertClips((d) => {
      const r = captionsForAsset(d, assetId, captions);
      if (!r) return [];
      for (const t of d.tracks) t.clips = t.clips.filter((c) => !isCaptionOf(assetId)(c as ComponentClip));
      const clip = createComponentClip(d, r.start, "legendas", CUSTOM_COMPONENTS.legendas);
      clip.name = "Legendas (IA)";
      clip.duration = r.duration;
      // mantém o estilo e a posição que o usuário já ajustou
      if (prev) {
        clip.transform = prev.transform;
        clip.props = { ...prev.props };
      }
      clip.props = { ...clip.props, captions: r.captions, sourceAssetId: assetId };
      return [clip];
    });
    if (!opts.quiet) toast.ok(`Legendas criadas: ${captions.length} palavras. Edite o texto pedindo ao Claude Code ou no arquivo do projeto.`);
  } catch (e) {
    toast.error(`Legendas: ${(e as Error).message}`);
  }
}

/** Detecta silêncios e corta-os do clipe (com ripple na faixa). */
export async function cutSilences(clipId: string) {
  const s0 = useEditor.getState();
  const found = findClip(s0.project!, clipId);
  if (!found || (found.clip.type !== "video" && found.clip.type !== "audio")) return;
  const assetId = (found.clip as MediaClip).assetId;
  try {
    toast.info("Procurando silêncios…");
    const silences = (await runJob("silences", assetId)) as { startSec: number; endSec: number }[];
    let res = { cuts: 0, removedFrames: 0 };
    useEditor.getState().edit((d) => {
      res = removeSilencesFromClip(d, clipId, silences);
    });
    if (!res.cuts) return toast.info("Nenhum silêncio relevante neste clipe.");
    const fps = useEditor.getState().project!.fps;
    toast.ok(`${res.cuts} silêncio(s) removido(s): ${(res.removedFrames / fps).toFixed(1)} s a menos. Ctrl+Z desfaz.`);
    // legendas existentes desse vídeo são realinhadas aos cortes
    if (useEditor.getState().project!.tracks.some((t) => t.clips.some((c) => isCaptionOf(assetId)(c as ComponentClip)))) {
      await generateCaptions(assetId, { quiet: true });
    }
  } catch (e) {
    toast.error(`Silêncios: ${(e as Error).message}`);
  }
}

/** Gera vibe/analysis/<assetId>/ (quadros, fala, silêncios) para o Claude Code entender a mídia. */
export async function analyzeForClaude(assetId: string) {
  try {
    toast.info("Analisando a mídia para o Claude Code…");
    const r = (await runJob("analyze", assetId)) as { dir: string; frames: number; phrases: number };
    toast.ok(`Análise pronta (${r.frames} quadros, ${r.phrases} frases). Peça ao Claude Code: "analise o vídeo e sugira os cortes".`);
  } catch (e) {
    toast.error(`Análise: ${(e as Error).message}`);
  }
}
