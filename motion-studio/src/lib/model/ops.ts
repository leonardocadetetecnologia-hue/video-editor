import { getFormat } from "./formats";
import { clipEnd, uid } from "./defaults";
import { baseValue } from "./animation";
import type { AnimProp, Clip, Easing, FormatId, MediaClip, Project, Track } from "./types";

// Operações de edição puras. Todas recebem um rascunho (cópia) do projeto e o
// alteram diretamente; quem chama é responsável por clonar e registrar histórico.

/** Retorna quantos quadros de origem um clipe de mídia tem (Infinity para não-mídia). */
export type SourceFramesFn = (clip: Clip) => number;

export function isTimedMedia(c: Clip): c is MediaClip {
  return (c.type === "video" || c.type === "audio") && !(c as MediaClip).freeze;
}

export function findClip(p: Project, id: string): { track: Track; clip: Clip; index: number } | null {
  for (const track of p.tracks) {
    const index = track.clips.findIndex((c) => c.id === id);
    if (index >= 0) return { track, clip: track.clips[index], index };
  }
  return null;
}

export function sortClips(track: Track) {
  track.clips.sort((a, b) => a.start - b.start);
}

/** Avança o ponto de entrada de um clipe em `delta` quadros da timeline. */
function shiftIn(c: Clip, delta: number) {
  c.start += delta;
  c.duration -= delta;
  if (isTimedMedia(c)) c.trimStart += Math.round(delta * c.speed);
  for (const key of Object.keys(c.keyframes) as AnimProp[]) {
    c.keyframes[key] = c.keyframes[key]!.map((k) => ({ ...k, frame: k.frame - delta })).filter((k) => k.frame >= -1e6);
  }
}

/**
 * Modo sobrescrever (como em editores profissionais): o clipe `keepId` ganha
 * prioridade e os outros clipes da faixa são aparados, divididos ou removidos.
 */
export function resolveOverlaps(track: Track, keepId: string) {
  const keep = track.clips.find((c) => c.id === keepId);
  if (!keep) return;
  const ks = keep.start;
  const ke = clipEnd(keep);
  const result: Clip[] = [];
  for (const c of track.clips) {
    if (c.id === keepId) {
      result.push(c);
      continue;
    }
    const cs = c.start;
    const ce = clipEnd(c);
    if (ce <= ks || cs >= ke) {
      result.push(c);
    } else if (cs >= ks && ce <= ke) {
      // totalmente coberto: removido
    } else if (cs < ks && ce > ke) {
      const tail = structuredClone(c);
      tail.id = uid("clp_");
      c.duration = ks - cs;
      c.transitionOut = null;
      shiftIn(tail, ke - cs);
      tail.transitionIn = null;
      result.push(c, tail);
    } else if (cs < ks) {
      c.duration = ks - cs;
      result.push(c);
    } else {
      shiftIn(c, ke - cs);
      result.push(c);
    }
  }
  track.clips = result.filter((c) => c.duration > 0);
  sortClips(track);
}

export function moveClip(p: Project, id: string, newStart: number, newTrackId?: string) {
  const found = findClip(p, id);
  if (!found) return;
  const { track, clip, index } = found;
  clip.start = Math.max(0, Math.round(newStart));
  let target = track;
  if (newTrackId && newTrackId !== track.id) {
    const t = p.tracks.find((x) => x.id === newTrackId);
    if (t && !t.locked) {
      track.clips.splice(index, 1);
      t.clips.push(clip);
      target = t;
    }
  }
  resolveOverlaps(target, id);
}

export function trimClip(p: Project, id: string, edge: "start" | "end", frame: number, srcFrames: SourceFramesFn) {
  const found = findClip(p, id);
  if (!found) return;
  const c = found.clip;
  const end = clipEnd(c);
  frame = Math.round(frame);
  if (edge === "start") {
    let newStart = Math.min(frame, end - 1);
    newStart = Math.max(0, newStart);
    if (isTimedMedia(c)) {
      // não pode recuar além do início da mídia de origem
      const minStart = c.start - Math.floor(c.trimStart / c.speed);
      newStart = Math.max(newStart, minStart);
    }
    shiftIn(c, newStart - c.start);
  } else {
    let newEnd = Math.max(frame, c.start + 1);
    if (isTimedMedia(c)) {
      const available = Math.floor((srcFrames(c) - c.trimStart) / c.speed);
      newEnd = Math.min(newEnd, c.start + available);
    }
    c.duration = newEnd - c.start;
  }
  resolveOverlaps(found.track, id);
}

/** Desloca o conteúdo da mídia sem mover o clipe na timeline (slip). */
export function slipClip(p: Project, id: string, trimStart: number, srcFrames: SourceFramesFn) {
  const found = findClip(p, id);
  if (!found || !isTimedMedia(found.clip)) return;
  const c = found.clip;
  const max = Math.max(0, srcFrames(c) - Math.ceil(c.duration * c.speed));
  c.trimStart = Math.min(max, Math.max(0, Math.round(trimStart)));
}

export function splitClip(p: Project, id: string, frame: number): string | null {
  const found = findClip(p, id);
  if (!found) return null;
  const c = found.clip;
  if (frame <= c.start || frame >= clipEnd(c) || found.track.locked) return null;
  const right = structuredClone(c);
  right.id = uid("clp_");
  const offset = frame - c.start;
  c.duration = offset;
  c.transitionOut = null;
  shiftIn(right, offset);
  right.transitionIn = null;
  // keyframes à esquerda ficam no clipe da esquerda, os da direita no novo
  for (const key of Object.keys(c.keyframes) as AnimProp[]) {
    const kfs = c.keyframes[key]!;
    const atCut = kfInterpolatedValue(c, key, offset);
    c.keyframes[key] = kfs.filter((k) => k.frame <= offset);
    right.keyframes[key] = right.keyframes[key]!.filter((k) => k.frame >= 0);
    if (!right.keyframes[key]!.some((k) => k.frame === 0)) right.keyframes[key]!.unshift({ frame: 0, value: atCut, easing: "linear" });
  }
  found.track.clips.splice(found.index + 1, 0, right);
  return right.id;
}

function kfInterpolatedValue(c: Clip, prop: AnimProp, frame: number): number {
  const kfs = [...(c.keyframes[prop] ?? [])].sort((a, b) => a.frame - b.frame);
  if (!kfs.length) return baseValue(c, prop);
  if (frame <= kfs[0].frame) return kfs[0].value;
  for (let i = 0; i < kfs.length - 1; i++) {
    if (frame <= kfs[i + 1].frame) {
      const t = (frame - kfs[i].frame) / Math.max(1, kfs[i + 1].frame - kfs[i].frame);
      return kfs[i].value + (kfs[i + 1].value - kfs[i].value) * t;
    }
  }
  return kfs[kfs.length - 1].value;
}

/** Divide no quadro informado os clipes indicados ou, se nenhum, todos sob o cursor. */
export function splitAt(p: Project, frame: number, ids: string[]): string[] {
  const created: string[] = [];
  const targets = ids.length
    ? ids
    : p.tracks.filter((t) => !t.locked).flatMap((t) => t.clips.filter((c) => c.start < frame && clipEnd(c) > frame).map((c) => c.id));
  for (const id of targets) {
    const n = splitClip(p, id, frame);
    if (n) created.push(n);
  }
  return created;
}

export function deleteClips(p: Project, ids: string[], ripple: boolean) {
  const set = new Set(ids);
  for (const track of p.tracks) {
    if (track.locked) continue;
    const removed = track.clips.filter((c) => set.has(c.id)).sort((a, b) => b.start - a.start);
    if (!removed.length) continue;
    track.clips = track.clips.filter((c) => !set.has(c.id));
    if (ripple) {
      for (const r of removed) {
        for (const c of track.clips) if (c.start >= clipEnd(r)) c.start -= r.duration;
      }
    }
  }
}

export function closeGaps(track: Track) {
  sortClips(track);
  let cursor = 0;
  for (const c of track.clips) {
    c.start = cursor;
    cursor = clipEnd(c);
  }
}

export function setSpeed(p: Project, id: string, speed: number, srcFrames: SourceFramesFn) {
  const found = findClip(p, id);
  if (!found) return;
  const c = found.clip;
  if (c.type !== "video" && c.type !== "audio") return;
  speed = Math.min(16, Math.max(0.1, speed));
  const sourceUsed = c.duration * c.speed;
  c.speed = speed;
  let duration = Math.max(1, Math.round(sourceUsed / speed));
  const available = Math.floor((srcFrames(c) - c.trimStart) / speed);
  duration = Math.min(duration, Math.max(1, available));
  c.duration = duration;
  resolveOverlaps(found.track, id);
}

export function setKeyframe(clip: Clip, prop: AnimProp, frame: number, value: number, easing: Easing = "ease-in-out") {
  const list = (clip.keyframes[prop] ?? []).filter((k) => k.frame !== frame);
  list.push({ frame, value, easing });
  list.sort((a, b) => a.frame - b.frame);
  clip.keyframes[prop] = list;
}

export function removeKeyframe(clip: Clip, prop: AnimProp, frame: number) {
  const list = (clip.keyframes[prop] ?? []).filter((k) => k.frame !== frame);
  if (list.length) clip.keyframes[prop] = list;
  else delete clip.keyframes[prop];
}

/**
 * Altera o formato (ex.: Reels → Feed 4:5) reposicionando os elementos:
 * clipes que ocupavam a tela inteira continuam ocupando; os demais são
 * reescalados mantendo a posição relativa ao centro.
 */
export function reformatProject(p: Project, formatId: FormatId) {
  const fmt = getFormat(formatId);
  const sx = fmt.width / p.width;
  const sy = fmt.height / p.height;
  const s = Math.min(sx, sy);
  for (const t of p.tracks) {
    for (const c of t.clips) {
      const tr = c.transform;
      const isFull = tr.x === 0 && tr.y === 0 && tr.width === p.width && tr.height === p.height;
      if (isFull) {
        tr.width = fmt.width;
        tr.height = fmt.height;
        continue;
      }
      const cx = (tr.x + tr.width / 2) * sx;
      const cy = (tr.y + tr.height / 2) * sy;
      tr.width = Math.round(tr.width * s);
      tr.height = Math.round(tr.height * s);
      tr.x = Math.round(cx - tr.width / 2);
      tr.y = Math.round(cy - tr.height / 2);
      if (c.type === "text") c.style.fontSize = Math.round(c.style.fontSize * s);
      for (const [prop, f] of [["x", sx], ["y", sy]] as const) {
        const kfs = c.keyframes[prop];
        if (kfs) c.keyframes[prop] = kfs.map((k) => ({ ...k, value: Math.round(k.value * f) }));
      }
    }
  }
  p.formatId = fmt.id;
  p.width = fmt.width;
  p.height = fmt.height;
}
