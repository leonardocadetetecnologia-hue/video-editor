import { clipEnd } from "./defaults";
import { deleteClips, findClip, isTimedMedia, splitClip } from "./ops";
import type { MediaClip, Project } from "./types";

// Operações que aplicam resultados da IA local ao projeto (puras, sobre um rascunho).

export interface WordCaption {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs: number | null;
  confidence: number | null;
}

/** Clipes de mídia (com tempo) que usam o asset, em ordem na timeline. */
function clipsOfAsset(p: Project, assetId: string): MediaClip[] {
  return p.tracks
    .flatMap((t) => t.clips)
    .filter((c): c is MediaClip => isTimedMedia(c) && c.assetId === assetId)
    .sort((a, b) => a.start - b.start);
}

/**
 * Converte a transcrição (ms do arquivo de origem) para a timeline, respeitando
 * cortes, trims e velocidade de todos os clipes daquele asset. Devolve o intervalo
 * a cobrir e as palavras em ms relativos ao início desse intervalo.
 */
export function captionsForAsset(p: Project, assetId: string, words: WordCaption[]): { start: number; duration: number; captions: WordCaption[] } | null {
  const clips = clipsOfAsset(p, assetId);
  if (!clips.length) return null;
  const start = clips[0].start;
  const end = Math.max(...clips.map(clipEnd));
  const msPerFrame = 1000 / p.fps;
  const out: WordCaption[] = [];
  for (const w of words) {
    // o Whisper costuma esticar o fim da palavra para dentro da pausa seguinte; por isso
    // a palavra vai para o clipe com maior sobreposição (e não pelo ponto médio)
    let best: { c: MediaClip; srcStartMs: number; srcEndMs: number; overlap: number } | null = null;
    for (const c of clips) {
      const srcStartMs = c.trimStart * msPerFrame;
      const srcEndMs = srcStartMs + c.duration * c.speed * msPerFrame;
      const overlap = Math.min(w.endMs, srcEndMs) - Math.max(w.startMs, srcStartMs);
      // palavra sem duração (acontece no Whisper): vale estar dentro ou encostada no trecho
      const score = w.endMs <= w.startMs ? (w.startMs >= srcStartMs && w.startMs <= srcEndMs ? 1 : -1) : overlap;
      if (score > 0 && (!best || score > best.overlap)) best = { c, srcStartMs, srcEndMs, overlap: score };
    }
    if (!best) continue;
    const { c, srcStartMs, srcEndMs } = best;
    const toTimeline = (ms: number) => (c.start - start) * msPerFrame + (Math.min(Math.max(ms, srcStartMs), srcEndMs) - srcStartMs) / c.speed;
    out.push({ ...w, startMs: Math.round(toTimeline(w.startMs)), endMs: Math.round(toTimeline(w.endMs)), timestampMs: null });
  }
  return { start, duration: end - start, captions: out };
}

/**
 * Remove os trechos silenciosos de um clipe, fechando as lacunas na própria faixa.
 * `padSec` mantém uma folga antes/depois da fala para o corte não ficar seco.
 */
export function removeSilencesFromClip(
  p: Project,
  clipId: string,
  silences: { startSec: number; endSec: number }[],
  opts: { padSec?: number; minSec?: number } = {},
): { cuts: number; removedFrames: number } {
  const pad = opts.padSec ?? 0.12;
  const min = opts.minSec ?? 0.35;
  const found = findClip(p, clipId);
  if (!found || !isTimedMedia(found.clip) || found.track.locked) return { cuts: 0, removedFrames: 0 };
  const c = found.clip;
  const fps = p.fps;
  // silêncio (s da origem) → quadros da timeline dentro do clipe
  const ranges = silences
    .map((s) => ({ a: s.startSec + pad, b: s.endSec - pad }))
    .filter((r) => r.b - r.a >= min)
    .map((r) => ({
      a: Math.round(c.start + (r.a * fps - c.trimStart) / c.speed),
      b: Math.round(c.start + (r.b * fps - c.trimStart) / c.speed),
    }))
    .map((r) => ({ a: Math.max(r.a, c.start), b: Math.min(r.b, clipEnd(c)) }))
    .filter((r) => r.b - r.a >= 2)
    .sort((x, y) => y.a - x.a); // do fim para o começo: cortes posteriores não deslocam os anteriores
  let cuts = 0;
  let removed = 0;
  for (const r of ranges) {
    const cur = findClip(p, clipId);
    if (!cur) break;
    if (r.b < clipEnd(cur.clip)) splitClip(p, clipId, r.b);
    const mid = r.a > cur.clip.start ? splitClip(p, clipId, r.a) : clipId;
    if (!mid) continue;
    deleteClips(p, [mid], true);
    cuts++;
    removed += r.b - r.a;
    if (mid === clipId) break; // o silêncio começava no início do clipe: nada antes dele
  }
  return { cuts, removedFrames: removed };
}
