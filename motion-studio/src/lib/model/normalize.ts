import { DEFAULT_FILTERS, DEFAULT_TEXT_STYLE, clipEnd, componentBox, trackKindForClip, uid } from "./defaults";
import { FORMATS } from "./formats";
import type { Clip, Easing, FormatId, Keyframe, Project, Track, Transition, TransitionType } from "./types";

// Normalização de projetos editados fora do editor (vibecoding pelo Claude Code).
// Tolerante: preenche campos omitidos com padrões e aceita tempos em segundos
// (startSec, durationSec, trimStartSec). Erros só quando não dá para adivinhar.

export interface NormalizeContext {
  assets: Record<string, { kind: "video" | "audio" | "image"; duration: number }>;
  components: Record<string, { defaultSeconds: number; defaultBox?: [number, number, number, number] }>;
}

export interface NormalizeResult {
  project: Project | null;
  errors: string[];
  warnings: string[];
}

const TRANSITIONS: TransitionType[] = ["fade", "dissolve", "slide-left", "slide-right", "slide-up", "slide-down", "zoom-in", "zoom-out", "wipe-left", "wipe-right", "blur"];
const EASINGS: Easing[] = ["linear", "ease-in", "ease-out", "ease-in-out"];
const CLIP_TYPES = ["video", "audio", "image", "text", "shape", "component"];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);
const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);

export function normalizeProject(input: unknown, ctx: NormalizeContext, expectedId?: string): NormalizeResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(input)) return { project: null, errors: ["O arquivo não contém um objeto JSON de projeto."], warnings };

  const id = str(input.id, expectedId ?? "");
  if (expectedId && id !== expectedId) errors.push(`"id" deve continuar "${expectedId}" (o nome do arquivo identifica o projeto).`);
  const formatId = str(input.formatId, "ig-reels") as FormatId;
  const fmt = FORMATS[formatId];
  if (!fmt) errors.push(`formatId "${formatId}" inválido. Use: ${Object.keys(FORMATS).join(", ")}.`);
  const fps = Math.round(num(input.fps, 30));
  const width = Math.round(num(input.width, fmt?.width ?? 1080));
  const height = Math.round(num(input.height, fmt?.height ?? 1920));
  const s = isObj(input.settings) ? input.settings : {};
  const settings = {
    defaultClipSeconds: num(s.defaultClipSeconds, 5),
    defaultTransition: normTransition(s.defaultTransition, fps, errors, "settings.defaultTransition"),
    defaultTextStyle: { ...DEFAULT_TEXT_STYLE, ...(isObj(s.defaultTextStyle) ? s.defaultTextStyle : {}) },
  };
  const frames = (sec: unknown) => (typeof sec === "number" ? Math.round(sec * fps) : undefined);

  if (!Array.isArray(input.tracks)) errors.push('"tracks" deve ser uma lista de faixas.');
  const tracks: Track[] = [];
  (Array.isArray(input.tracks) ? input.tracks : []).forEach((rawT, ti) => {
    const where = `tracks[${ti}]`;
    if (!isObj(rawT)) return errors.push(`${where} não é um objeto.`);
    const rawClips = Array.isArray(rawT.clips) ? rawT.clips : [];
    const inferredKind = rawClips.length && rawClips.every((c) => isObj(c) && c.type === "audio") ? "audio" : "visual";
    const kind = rawT.kind === "audio" || rawT.kind === "visual" ? rawT.kind : inferredKind;
    const track: Track = {
      id: str(rawT.id, uid("trk_")),
      name: str(rawT.name, kind === "audio" ? `Áudio ${ti + 1}` : `Vídeo ${ti + 1}`),
      kind,
      muted: bool(rawT.muted, false),
      hidden: bool(rawT.hidden, false),
      locked: bool(rawT.locked, false),
      clips: [],
    };
    rawClips.forEach((rc, ci) => {
      const cw = `${where}.clips[${ci}]`;
      if (!isObj(rc)) return errors.push(`${cw} não é um objeto.`);
      const c = normClip(rc, cw, { fps, width, height, settings, ctx, errors, frames });
      if (!c) return;
      if (trackKindForClip(c.type) !== kind) errors.push(`${cw} (${c.type}) está numa faixa de ${kind === "audio" ? "áudio" : "vídeo"}: mova para uma faixa "${trackKindForClip(c.type)}".`);
      track.clips.push(c);
    });
    track.clips.sort((a, b) => a.start - b.start);
    for (let i = 1; i < track.clips.length; i++) {
      const prev = track.clips[i - 1];
      if (track.clips[i].start < clipEnd(prev)) warnings.push(`Clipes "${prev.name}" e "${track.clips[i].name}" se sobrepõem na faixa "${track.name}".`);
    }
    tracks.push(track);
  });

  const ids = new Set<string>();
  for (const t of tracks)
    for (const c of t.clips) {
      if (ids.has(c.id)) {
        warnings.push(`id de clipe repetido "${c.id}" — gerado um novo.`);
        c.id = uid("clp_");
      }
      ids.add(c.id);
    }

  const markers = (Array.isArray(input.markers) ? input.markers : []).filter(isObj).map((m, i) => ({
    id: str(m.id, uid("mrk_")),
    frame: Math.max(0, Math.round(frames(m.sec) ?? num(m.frame, 0))),
    label: str(m.label, `Marcador ${i + 1}`),
    color: str(m.color, "#facc15"),
  }));

  if (errors.length) return { project: null, errors, warnings };
  return {
    project: {
      version: 1,
      id,
      name: str(input.name, "Projeto"),
      formatId,
      width,
      height,
      fps,
      backgroundColor: str(input.backgroundColor, "#000000"),
      tracks,
      markers,
      settings,
      presetId: typeof input.presetId === "string" ? input.presetId : null,
    },
    errors,
    warnings,
  };
}

function normTransition(v: unknown, fps: number, errors: string[], where: string): Transition | null {
  if (v === null || v === undefined) return null;
  if (!isObj(v) || !TRANSITIONS.includes(v.type as TransitionType)) {
    errors.push(`${where}: transição inválida. Tipos: ${TRANSITIONS.join(", ")}.`);
    return null;
  }
  const d = typeof v.durationSec === "number" ? Math.round(v.durationSec * fps) : num(v.duration, Math.round(fps * 0.5));
  return { type: v.type as TransitionType, duration: Math.max(1, Math.round(d)) };
}

function normKeyframes(v: unknown, errors: string[], where: string): Clip["keyframes"] {
  const out: Clip["keyframes"] = {};
  if (!isObj(v)) return out;
  for (const prop of ["x", "y", "scale", "rotation", "opacity"] as const) {
    const list = v[prop];
    if (list === undefined) continue;
    if (!Array.isArray(list)) {
      errors.push(`${where}.keyframes.${prop} deve ser uma lista.`);
      continue;
    }
    const kfs: Keyframe[] = list.filter(isObj).map((k) => ({
      frame: Math.round(num(k.frame, 0)),
      value: num(k.value, 0),
      easing: EASINGS.includes(k.easing as Easing) ? (k.easing as Easing) : "ease-in-out",
    }));
    if (kfs.length) out[prop] = kfs.sort((a, b) => a.frame - b.frame);
  }
  return out;
}

function normClip(
  rc: Obj,
  where: string,
  o: {
    fps: number;
    width: number;
    height: number;
    settings: Project["settings"];
    ctx: NormalizeContext;
    errors: string[];
    frames: (s: unknown) => number | undefined;
  },
): Clip | null {
  const { fps, width, height, ctx, errors, frames } = o;
  const type = rc.type as Clip["type"];
  if (!CLIP_TYPES.includes(type)) {
    errors.push(`${where}: "type" deve ser um de ${CLIP_TYPES.join(", ")}.`);
    return null;
  }
  // keyframes em kfSec (segundos relativos ao clipe) também são aceitos
  if (isObj(rc.keyframes)) {
    for (const list of Object.values(rc.keyframes)) {
      if (Array.isArray(list)) for (const k of list) if (isObj(k) && typeof k.sec === "number" && k.frame === undefined) k.frame = Math.round(k.sec * fps);
    }
  }
  const full = { x: 0, y: 0, width, height, rotation: 0, scale: 1 };
  const defaultSeconds = o.settings.defaultClipSeconds;
  const start = Math.max(0, Math.round(frames(rc.startSec) ?? num(rc.start, 0)));
  const base = {
    id: str(rc.id, uid("clp_")),
    name: str(rc.name, type === "text" ? str(rc.text, "Texto").slice(0, 24) : type),
    start,
    opacity: num(rc.opacity, 1),
    keyframes: normKeyframes(rc.keyframes, errors, where),
    filters: { ...DEFAULT_FILTERS, ...(isObj(rc.filters) ? rc.filters : {}) },
    transitionIn: normTransition(rc.transitionIn, fps, errors, `${where}.transitionIn`),
    transitionOut: normTransition(rc.transitionOut, fps, errors, `${where}.transitionOut`),
  };
  const tr = (def: typeof full) => ({ ...def, ...(isObj(rc.transform) ? (rc.transform as Partial<typeof full>) : {}) });
  const dur = (fallback: number) => Math.max(1, Math.round(frames(rc.durationSec) ?? num(rc.duration, fallback)));

  if (type === "video" || type === "audio" || type === "image") {
    const assetId = str(rc.assetId, "");
    const asset = ctx.assets[assetId];
    if (!asset) {
      errors.push(`${where}: assetId "${assetId}" não existe na biblioteca de mídia.`);
      return null;
    }
    if (type === "image" && asset.kind !== "image") errors.push(`${where}: a mídia "${assetId}" não é uma imagem.`);
    if (type !== "image" && asset.kind === "image") errors.push(`${where}: a mídia "${assetId}" é uma imagem; use type "image".`);
    const speed = Math.min(16, Math.max(0.1, num(rc.speed, 1)));
    const trimStart = Math.max(0, Math.round(frames(rc.trimStartSec) ?? num(rc.trimStart, 0)));
    const srcFrames = Math.floor(asset.duration * fps);
    const freeze = bool(rc.freeze, false);
    const fallback = type === "image" ? Math.round(defaultSeconds * fps) : Math.max(1, Math.floor((srcFrames - trimStart) / speed));
    let duration = dur(fallback);
    if (type !== "image" && !freeze && srcFrames > 0) {
      const max = Math.floor((srcFrames - trimStart) / speed);
      if (max < 1) errors.push(`${where}: trimStart passa do fim da mídia.`);
      else duration = Math.min(duration, max);
    }
    return {
      ...base,
      type,
      assetId,
      duration,
      transform: tr(full),
      trimStart,
      speed,
      volume: num(rc.volume, 1),
      audioFadeIn: Math.round(frames(rc.audioFadeInSec) ?? num(rc.audioFadeIn, 0)),
      audioFadeOut: Math.round(frames(rc.audioFadeOutSec) ?? num(rc.audioFadeOut, 0)),
      videoMuted: bool(rc.videoMuted, false),
      fit: rc.fit === "cover" || rc.fit === "fill" ? rc.fit : "contain",
      freeze,
    };
  }
  if (type === "text") {
    if (typeof rc.text !== "string") {
      errors.push(`${where}: clipe de texto precisa de "text".`);
      return null;
    }
    const style = { ...o.settings.defaultTextStyle, ...(isObj(rc.style) ? rc.style : {}) };
    const w = Math.round(width * 0.84);
    const h = Math.round(style.fontSize * style.lineHeight * 2 + style.padding * 2);
    return {
      ...base,
      type,
      text: rc.text,
      style,
      duration: dur(Math.round(defaultSeconds * fps)),
      transform: tr({ x: Math.round((width - w) / 2), y: Math.round((height - h) / 2), width: w, height: h, rotation: 0, scale: 1 }),
    };
  }
  if (type === "shape") {
    const size = Math.round(Math.min(width, height) * 0.4);
    return {
      ...base,
      type,
      shape: rc.shape === "ellipse" ? "ellipse" : "rect",
      fill: str(rc.fill, "#ffffff"),
      strokeColor: str(rc.strokeColor, "#ffffff"),
      strokeWidth: num(rc.strokeWidth, 0),
      radius: num(rc.radius, 0),
      duration: dur(Math.round(defaultSeconds * fps)),
      transform: tr({ x: Math.round((width - size) / 2), y: Math.round((height - size) / 2), width: size, height: size, rotation: 0, scale: 1 }),
    };
  }
  const componentId = str(rc.componentId, "");
  const def = ctx.components[componentId];
  if (!def) {
    errors.push(`${where}: componentId "${componentId}" não existe. Disponíveis: ${Object.keys(ctx.components).join(", ") || "nenhum"}.`);
    return null;
  }
  return {
    ...base,
    type: "component",
    componentId,
    props: isObj(rc.props) ? rc.props : {},
    duration: dur(Math.round(def.defaultSeconds * fps)),
    transform: tr(componentBox(def.defaultBox, width, height)),
  };
}

