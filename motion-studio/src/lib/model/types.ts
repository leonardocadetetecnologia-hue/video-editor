// Modelo canônico do projeto. Independente de React, Remotion ou FFmpeg:
// qualquer motor de renderização deve conseguir interpretar estes tipos.
// Use apenas imports relativos aqui (o bundle do Remotion não conhece o alias "@/").

export type FormatId =
  | "ig-story"
  | "ig-reels"
  | "ig-feed-square"
  | "ig-feed-portrait"
  | "ig-feed-34"
  | "ig-feed-landscape"
  | "hd-720"
  | "fhd-1080"
  | "qhd-1440"
  | "uhd-4k";

export type FormatGroup = "story" | "reels" | "feed" | "outros";

export interface SafeZone {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface FormatSpec {
  id: FormatId;
  group: FormatGroup;
  label: string;
  ratio: string;
  width: number;
  height: number;
  safeZone: SafeZone;
  description: string;
}

export type AssetKind = "video" | "audio" | "image";

export interface Asset {
  id: string;
  name: string;
  kind: AssetKind;
  mime: string;
  size: number;
  /** Duração em segundos (0 para imagens). */
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  hasProxy: boolean;
  createdAt: string;
}

/** Subconjunto do Asset que o motor de composição precisa. */
export interface AssetRef {
  id: string;
  kind: AssetKind;
  duration: number;
  width: number;
  height: number;
  hasProxy: boolean;
}

export type AnimProp = "x" | "y" | "scale" | "rotation" | "opacity";
export type Easing = "linear" | "ease-in" | "ease-out" | "ease-in-out";

export interface Keyframe {
  /** Quadro relativo ao início do clipe. */
  frame: number;
  value: number;
  easing: Easing;
}

export interface Transform {
  /** Canto superior esquerdo da caixa, em pixels da composição. */
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
}

export interface Filters {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  blur: number;
  grayscale: number;
  sepia: number;
}

export type TransitionType =
  | "fade"
  | "dissolve"
  | "slide-left"
  | "slide-right"
  | "slide-up"
  | "slide-down"
  | "zoom-in"
  | "zoom-out"
  | "wipe-left"
  | "wipe-right"
  | "blur";

export interface Transition {
  type: TransitionType;
  /** Duração em quadros. */
  duration: number;
}

export type TextAnimation = "none" | "fade" | "slide-up" | "pop" | "typewriter" | "bounce";

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  color: string;
  align: "left" | "center" | "right";
  lineHeight: number;
  letterSpacing: number;
  uppercase: boolean;
  background: string | null;
  padding: number;
  borderRadius: number;
  strokeColor: string;
  strokeWidth: number;
  shadow: boolean;
  shadowColor: string;
  animation: TextAnimation;
}

export type Fit = "contain" | "cover" | "fill";

interface BaseClip {
  id: string;
  name: string;
  /** Início na timeline, em quadros. */
  start: number;
  /** Duração na timeline, em quadros. */
  duration: number;
  transform: Transform;
  opacity: number;
  keyframes: Partial<Record<AnimProp, Keyframe[]>>;
  filters: Filters;
  transitionIn: Transition | null;
  transitionOut: Transition | null;
}

export interface MediaClip extends BaseClip {
  type: "video" | "audio" | "image";
  assetId: string;
  /** Quadros da mídia de origem (no fps do projeto) ignorados no início. */
  trimStart: number;
  speed: number;
  volume: number;
  audioFadeIn: number;
  audioFadeOut: number;
  /** Silencia apenas o áudio embutido do vídeo (ex.: após separar o áudio). */
  videoMuted: boolean;
  fit: Fit;
  freeze: boolean;
}

export interface TextClip extends BaseClip {
  type: "text";
  text: string;
  style: TextStyle;
}

export interface ShapeClip extends BaseClip {
  type: "shape";
  shape: "rect" | "ellipse";
  fill: string;
  strokeColor: string;
  strokeWidth: number;
  radius: number;
}

/** Animação escrita em código (componente Remotion em src/remotion/custom/). */
export interface ComponentClip extends BaseClip {
  type: "component";
  componentId: string;
  props: Record<string, unknown>;
}

export type Clip = MediaClip | TextClip | ShapeClip | ComponentClip;
export type ClipType = Clip["type"];

export type TrackKind = "visual" | "audio";

export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  muted: boolean;
  hidden: boolean;
  locked: boolean;
  clips: Clip[];
}

export interface Marker {
  id: string;
  frame: number;
  label: string;
  color: string;
}

export interface ProjectSettings {
  /** Duração padrão de imagens/textos, em segundos. */
  defaultClipSeconds: number;
  defaultTransition: Transition | null;
  defaultTextStyle: TextStyle;
}

export interface Project {
  version: 1;
  id: string;
  name: string;
  formatId: FormatId;
  width: number;
  height: number;
  fps: number;
  backgroundColor: string;
  tracks: Track[];
  markers: Marker[];
  settings: ProjectSettings;
  presetId: string | null;
}

export type ExportCodec = "h264" | "h265" | "vp9" | "prores";
export type ExportQuality = "maxima" | "alta" | "media" | "rascunho";

export interface ExportSettings {
  codec: ExportCodec;
  quality: ExportQuality;
  audioBitrate: "128k" | "192k" | "320k";
}

/** Padrão de vídeo salvo: evita perguntar tudo de novo a cada projeto. */
export interface VideoPreset {
  id: string;
  name: string;
  formatId: FormatId;
  fps: number;
  backgroundColor: string;
  defaultClipSeconds: number;
  defaultTransition: Transition | null;
  defaultTextStyle: TextStyle;
  export: ExportSettings;
}

export type StyleKind = "text" | "look";

export interface SavedStyle {
  id: string;
  kind: StyleKind;
  name: string;
  /** TextStyle para "text"; { filters, transitionIn, transitionOut } para "look". */
  data: TextStyle | LookData;
}

export interface LookData {
  filters: Filters;
  transitionIn: Transition | null;
  transitionOut: Transition | null;
}

export interface CompositionProps {
  project: Project;
  assets: Record<string, AssetRef>;
  /** Base para montar URLs de mídia ("" no navegador; http://localhost:porta no render). */
  mediaBaseUrl: string;
  useProxies: boolean;
  [key: string]: unknown;
}
