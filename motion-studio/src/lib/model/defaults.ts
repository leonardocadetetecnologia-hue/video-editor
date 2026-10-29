import { getFormat } from "./formats";
import type {
  Asset,
  Clip,
  ComponentClip,
  ExportSettings,
  Filters,
  FormatId,
  MediaClip,
  Project,
  ShapeClip,
  TextClip,
  TextStyle,
  Track,
  TrackKind,
  Transform,
  VideoPreset,
} from "./types";

export function uid(prefix = ""): string {
  return prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

export const DEFAULT_FILTERS: Filters = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  hue: 0,
  blur: 0,
  grayscale: 0,
  sepia: 0,
};

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: "Segoe UI",
  fontSize: 96,
  fontWeight: 800,
  italic: false,
  color: "#ffffff",
  align: "center",
  lineHeight: 1.15,
  letterSpacing: 0,
  uppercase: false,
  background: null,
  padding: 24,
  borderRadius: 16,
  strokeColor: "#000000",
  strokeWidth: 0,
  shadow: true,
  shadowColor: "rgba(0,0,0,0.55)",
  animation: "pop",
};

export const DEFAULT_EXPORT: ExportSettings = { codec: "h264", quality: "alta", audioBitrate: "192k" };

export const FONT_FAMILIES = [
  "Segoe UI",
  "Arial",
  "Arial Black",
  "Impact",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Comic Sans MS",
  "Bahnschrift",
  "Candara",
  "Consolas",
];

export function defaultPreset(formatId: FormatId = "ig-reels"): VideoPreset {
  return {
    id: uid("pre_"),
    name: "Meu padrão",
    formatId,
    fps: 30,
    backgroundColor: "#000000",
    defaultClipSeconds: 5,
    defaultTransition: null,
    defaultTextStyle: { ...DEFAULT_TEXT_STYLE },
    export: { ...DEFAULT_EXPORT },
  };
}

export function createTrack(kind: TrackKind, index: number): Track {
  return {
    id: uid("trk_"),
    name: kind === "visual" ? `Vídeo ${index}` : `Áudio ${index}`,
    kind,
    muted: false,
    hidden: false,
    locked: false,
    clips: [],
  };
}

export function createProject(opts: { id: string; name: string; formatId: FormatId; preset?: VideoPreset | null }): Project {
  const fmt = getFormat(opts.formatId);
  const p = opts.preset;
  return {
    version: 1,
    id: opts.id,
    name: opts.name,
    formatId: fmt.id,
    width: fmt.width,
    height: fmt.height,
    fps: p?.fps ?? 30,
    backgroundColor: p?.backgroundColor ?? "#000000",
    tracks: [createTrack("visual", 2), createTrack("visual", 1), createTrack("audio", 1)],
    markers: [],
    settings: {
      defaultClipSeconds: p?.defaultClipSeconds ?? 5,
      defaultTransition: p?.defaultTransition ?? null,
      defaultTextStyle: { ...(p?.defaultTextStyle ?? DEFAULT_TEXT_STYLE) },
    },
    presetId: p?.id ?? null,
  };
}

function fullFrame(project: Project): Transform {
  return { x: 0, y: 0, width: project.width, height: project.height, rotation: 0, scale: 1 };
}

function baseClipFields(project: Project, start: number, duration: number) {
  const t = project.settings.defaultTransition;
  return {
    id: uid("clp_"),
    start,
    duration,
    transform: fullFrame(project),
    opacity: 1,
    keyframes: {},
    filters: { ...DEFAULT_FILTERS },
    transitionIn: t ? { ...t } : null,
    transitionOut: null,
  };
}

/** Quantidade de quadros da mídia de origem no fps do projeto. */
export function sourceFrames(asset: Pick<Asset, "duration">, fps: number): number {
  return Math.max(1, Math.floor(asset.duration * fps));
}

export function createMediaClip(project: Project, asset: Asset, start: number): MediaClip {
  const isImage = asset.kind === "image";
  const duration = isImage
    ? Math.round(project.settings.defaultClipSeconds * project.fps)
    : sourceFrames(asset, project.fps);
  const clip: MediaClip = {
    ...baseClipFields(project, start, duration),
    type: asset.kind,
    name: asset.name,
    assetId: asset.id,
    trimStart: 0,
    speed: 1,
    volume: 1,
    audioFadeIn: 0,
    audioFadeOut: 0,
    videoMuted: false,
    fit: "contain",
    freeze: false,
  };
  if (asset.kind === "audio") clip.transitionIn = null;
  // Mídia que já tem a proporção do quadro ocupa a tela inteira; o resto é "contido".
  if (asset.width > 0 && asset.height > 0) {
    const ra = asset.width / asset.height;
    const rp = project.width / project.height;
    if (Math.abs(ra - rp) < 0.02) clip.fit = "cover";
  }
  return clip;
}

export function createTextClip(project: Project, start: number, text = "Seu texto aqui", style?: Partial<TextStyle>): TextClip {
  const s = { ...project.settings.defaultTextStyle, ...style };
  const w = Math.round(project.width * 0.84);
  const h = Math.round(s.fontSize * s.lineHeight * 2 + s.padding * 2);
  return {
    ...baseClipFields(project, start, Math.round(project.settings.defaultClipSeconds * project.fps)),
    transitionIn: null,
    type: "text",
    name: text.slice(0, 24) || "Texto",
    text,
    style: s,
    transform: {
      x: Math.round((project.width - w) / 2),
      y: Math.round((project.height - h) / 2),
      width: w,
      height: h,
      rotation: 0,
      scale: 1,
    },
  };
}

export function createShapeClip(project: Project, start: number, shape: "rect" | "ellipse", fill: string, full = false): ShapeClip {
  const size = Math.round(Math.min(project.width, project.height) * 0.4);
  const transform: Transform = full
    ? fullFrame(project)
    : {
        x: Math.round((project.width - size) / 2),
        y: Math.round((project.height - size) / 2),
        width: size,
        height: shape === "rect" ? Math.round(size * 0.6) : size,
        rotation: 0,
        scale: 1,
      };
  return {
    ...baseClipFields(project, start, Math.round(project.settings.defaultClipSeconds * project.fps)),
    transitionIn: null,
    type: "shape",
    name: full ? "Cor sólida" : shape === "rect" ? "Retângulo" : "Círculo",
    shape,
    fill,
    strokeColor: "#ffffff",
    strokeWidth: 0,
    radius: shape === "rect" && !full ? 24 : 0,
    transform,
  };
}

/** Clipe de animação em código; a definição vem do registro em src/remotion/custom. */
export function createComponentClip(
  project: Project,
  start: number,
  componentId: string,
  def: { label: string; defaultSeconds: number; defaultBox?: [number, number, number, number]; defaultProps: Record<string, unknown> },
): ComponentClip {
  return {
    ...baseClipFields(project, start, Math.round(def.defaultSeconds * project.fps)),
    transitionIn: null,
    type: "component",
    name: def.label,
    componentId,
    props: { ...def.defaultProps },
    transform: componentBox(def.defaultBox, project.width, project.height),
  };
}

export function clipEnd(c: Pick<Clip, "start" | "duration">): number {
  return c.start + c.duration;
}

export function projectDuration(project: Project): number {
  let end = 0;
  for (const t of project.tracks) for (const c of t.clips) end = Math.max(end, clipEnd(c));
  return end;
}

export function trackKindForClip(type: Clip["type"]): TrackKind {
  return type === "audio" ? "audio" : "visual";
}


/** Caixa inicial de uma animação (frações do quadro); sem caixa = quadro inteiro. */
export function componentBox(box: [number, number, number, number] | undefined, width: number, height: number) {
  if (!box) return { x: 0, y: 0, width, height, rotation: 0, scale: 1 };
  return { x: Math.round(box[0] * width), y: Math.round(box[1] * height), width: Math.round(box[2] * width), height: Math.max(1, Math.round(box[3] * height)), rotation: 0, scale: 1 };
}
