"use client";

import { Captions, Loader2, ScanEye, Scissors } from "lucide-react";
import type { MediaClip } from "@/lib/model/types";
import { useEditor } from "@/store/editor";
import { Button, Section } from "@/components/ui/primitives";
import { analyzeForClaude, cutSilences, generateCaptions, useAiProgress } from "./ai";

/** IA local (gratuita, offline) para o clipe de vídeo/áudio selecionado. */
export function AiSection({ clip }: { clip: MediaClip }) {
  const asset = useEditor((s) => s.assets[clip.assetId]);
  const running = useAiProgress((s) => s.running);
  const job = (kind: string) => running[`${kind}:${clip.assetId}`];
  const busy = Boolean(job("transcribe") || job("silences") || job("analyze"));
  const active = job("transcribe") ?? job("silences") ?? job("analyze");
  const hasAudio = clip.type === "audio" || Boolean(asset?.hasAudio);

  return (
    <Section title="Inteligência artificial (local)">
      <Button size="sm" disabled={busy || !hasAudio} onClick={() => generateCaptions(clip.assetId)} title="Transcreve a fala e cria legendas animadas estilo Reels">
        {job("transcribe") ? <Loader2 size={13} className="animate-spin" /> : <Captions size={13} />} Legendas automáticas
      </Button>
      <Button size="sm" disabled={busy || !hasAudio || clip.freeze} onClick={() => cutSilences(clip.id)} title="Remove pausas e silêncios, fechando as lacunas">
        {job("silences") ? <Loader2 size={13} className="animate-spin" /> : <Scissors size={13} />} Cortar silêncios
      </Button>
      <Button size="sm" disabled={busy} onClick={() => analyzeForClaude(clip.assetId)} title="Extrai quadros, fala e silêncios para o Claude Code entender o vídeo e sugerir edições">
        {job("analyze") ? <Loader2 size={13} className="animate-spin" /> : <ScanEye size={13} />} Analisar para o Claude
      </Button>
      {active && (
        <div>
          <div className="h-1 overflow-hidden rounded bg-bg">
            <div className="ig-gradient h-full transition-all" style={{ width: `${Math.max(4, active.progress * 100)}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-muted">{active.stage}</p>
        </div>
      )}
      {!hasAudio && <p className="text-[11px] text-muted">Este vídeo não tem áudio: legendas e corte de silêncio não se aplicam.</p>}
    </Section>
  );
}
