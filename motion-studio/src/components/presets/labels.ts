import type { ExportCodec, ExportQuality, TextAnimation, TransitionType } from "@/lib/model/types";

export const TRANSITION_LABELS: Record<TransitionType, string> = {
  fade: "Fade",
  dissolve: "Dissolver",
  "slide-left": "Deslizar ←",
  "slide-right": "Deslizar →",
  "slide-up": "Deslizar ↑",
  "slide-down": "Deslizar ↓",
  "zoom-in": "Zoom de entrada",
  "zoom-out": "Zoom de saída",
  "wipe-left": "Cortina ←",
  "wipe-right": "Cortina →",
  blur: "Desfoque",
};

export const TEXT_ANIMATION_LABELS: Record<TextAnimation, string> = {
  none: "Nenhuma",
  fade: "Surgir",
  "slide-up": "Subir",
  pop: "Pop",
  bounce: "Quicar",
  typewriter: "Máquina de escrever",
};

export const CODEC_LABELS: Record<ExportCodec, string> = {
  h264: "MP4 (H.264) — recomendado para Instagram",
  h265: "MP4 (H.265/HEVC) — arquivo menor",
  vp9: "WebM (VP9)",
  prores: "MOV (ProRes HQ) — masterização",
};

export const QUALITY_LABELS: Record<ExportQuality, string> = {
  maxima: "Máxima",
  alta: "Alta",
  media: "Média",
  rascunho: "Rascunho (rápido)",
};
