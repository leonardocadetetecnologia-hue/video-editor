import type { FormatGroup, FormatId, FormatSpec } from "./types";

// Áreas seguras: regiões cobertas pela interface do Instagram (nome do perfil,
// legenda, botões). Valores em pixels da composição.
export const FORMATS: Record<FormatId, FormatSpec> = {
  "ig-story": {
    id: "ig-story",
    group: "story",
    label: "Story",
    ratio: "9:16",
    width: 1080,
    height: 1920,
    safeZone: { top: 250, bottom: 250, left: 60, right: 60 },
    description: "Stories do Instagram — 1080×1920, tela cheia vertical",
  },
  "ig-reels": {
    id: "ig-reels",
    group: "reels",
    label: "Reels",
    ratio: "9:16",
    width: 1080,
    height: 1920,
    safeZone: { top: 220, bottom: 420, left: 60, right: 140 },
    description: "Reels do Instagram — 1080×1920, evita legenda e botões laterais",
  },
  "ig-feed-portrait": {
    id: "ig-feed-portrait",
    group: "feed",
    label: "Feed retrato",
    ratio: "4:5",
    width: 1080,
    height: 1350,
    safeZone: { top: 54, bottom: 54, left: 54, right: 54 },
    description: "Feed 4:5 — 1080×1350, ocupa mais espaço na tela",
  },
  "ig-feed-34": {
    id: "ig-feed-34",
    group: "feed",
    label: "Feed 3:4",
    ratio: "3:4",
    width: 1080,
    height: 1440,
    safeZone: { top: 54, bottom: 54, left: 54, right: 54 },
    description: "Feed 3:4 — 1080×1440, proporção da grade do perfil",
  },
  "ig-feed-square": {
    id: "ig-feed-square",
    group: "feed",
    label: "Feed quadrado",
    ratio: "1:1",
    width: 1080,
    height: 1080,
    safeZone: { top: 54, bottom: 54, left: 54, right: 54 },
    description: "Feed 1:1 — 1080×1080, formato clássico",
  },
  "ig-feed-landscape": {
    id: "ig-feed-landscape",
    group: "feed",
    label: "Feed paisagem",
    ratio: "1.91:1",
    width: 1080,
    height: 566,
    safeZone: { top: 28, bottom: 28, left: 54, right: 54 },
    description: "Feed horizontal — 1080×566",
  },
  "hd-720": {
    id: "hd-720",
    group: "outros",
    label: "HD 720p",
    ratio: "16:9",
    width: 1280,
    height: 720,
    safeZone: { top: 36, bottom: 36, left: 64, right: 64 },
    description: "1280×720 horizontal",
  },
  "fhd-1080": {
    id: "fhd-1080",
    group: "outros",
    label: "Full HD 1080p",
    ratio: "16:9",
    width: 1920,
    height: 1080,
    safeZone: { top: 54, bottom: 54, left: 96, right: 96 },
    description: "1920×1080 horizontal",
  },
  "qhd-1440": {
    id: "qhd-1440",
    group: "outros",
    label: "QHD 1440p",
    ratio: "16:9",
    width: 2560,
    height: 1440,
    safeZone: { top: 72, bottom: 72, left: 128, right: 128 },
    description: "2560×1440 horizontal",
  },
  "uhd-4k": {
    id: "uhd-4k",
    group: "outros",
    label: "4K UHD",
    ratio: "16:9",
    width: 3840,
    height: 2160,
    safeZone: { top: 108, bottom: 108, left: 192, right: 192 },
    description: "3840×2160 horizontal",
  },
};

export const FORMAT_GROUPS: { id: FormatGroup; label: string; hint: string }[] = [
  { id: "story", label: "Story", hint: "Vertical 9:16, some em 24h" },
  { id: "feed", label: "Feed", hint: "Post no perfil: 4:5, 3:4, 1:1 ou paisagem" },
  { id: "reels", label: "Reels", hint: "Vertical 9:16 com áreas seguras de Reels" },
  { id: "outros", label: "Outros", hint: "YouTube, apresentações e 4K" },
];

export const FPS_OPTIONS = [24, 25, 30, 50, 60];

export function formatsInGroup(group: FormatGroup): FormatSpec[] {
  return Object.values(FORMATS).filter((f) => f.group === group);
}

export function getFormat(id: FormatId): FormatSpec {
  return FORMATS[id] ?? FORMATS["ig-reels"];
}
