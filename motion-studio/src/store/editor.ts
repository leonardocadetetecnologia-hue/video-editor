"use client";

import { create } from "zustand";
import type { PlayerRef } from "@remotion/player";
import { clipEnd, createComponentClip, createMediaClip, createShapeClip, createTextClip, createTrack, projectDuration, sourceFrames, trackKindForClip, uid } from "@/lib/model/defaults";
import * as ops from "@/lib/model/ops";
import type { Asset, Clip, FormatId, Project, Track, TrackKind } from "@/lib/model/types";

// Estado do editor. O projeto é imutável do ponto de vista do React:
// cada edição clona, altera o rascunho via operações puras e registra histórico.

const HISTORY_LIMIT = 150;

export type LeftTab = "media" | "motion" | "text" | "elements" | "transitions" | "effects" | "styles";

export interface ViewOptions {
  safeArea: boolean;
  grid: boolean;
  thirds: boolean;
  snap: boolean;
  previewZoom: number | "fit";
}

interface EditorState {
  project: Project | null;
  assets: Record<string, Asset>;
  past: Project[];
  future: Project[];
  /** Instantâneo tirado no início de um gesto (arrastar), confirmado ao soltar. */
  gestureBase: Project | null;
  dirty: boolean;
  /** Última revisão conhecida do servidor (detecta edições do Claude Code). */
  serverRevision: number;
  lastSavedAt: string | null;
  saving: boolean;

  selection: string[];
  selectedTrackId: string | null;
  frame: number;
  playing: boolean;
  pxPerFrame: number;
  leftTab: LeftTab;
  view: ViewOptions;
  clipboard: Clip[];

  load: (p: Project, revision?: number) => void;
  /** Aplica uma versão vinda de fora (vibecoding) mantendo o desfazer. */
  applyRemote: (p: Project, revision: number) => void;
  setAssets: (list: Asset[]) => void;
  upsertAsset: (a: Asset) => void;

  /** Aplica uma edição registrando histórico (ou não, durante gestos). */
  edit: (fn: (draft: Project) => void, opts?: { record?: boolean }) => void;
  beginGesture: () => void;
  /** Durante um gesto: recalcula a partir do estado inicial do gesto (sem acumular efeitos). */
  gestureEdit: (fn: (draft: Project) => void) => void;
  endGesture: () => void;
  undo: () => void;
  redo: () => void;
  markSaved: (at: string, revision?: number) => void;
  setSaving: (v: boolean) => void;

  select: (ids: string[], additive?: boolean) => void;
  selectTrack: (id: string | null) => void;
  setFrame: (f: number) => void;
  setPlaying: (v: boolean) => void;
  setZoom: (pxPerFrame: number) => void;
  setLeftTab: (t: LeftTab) => void;
  setView: (patch: Partial<ViewOptions>) => void;

  // operações de alto nível
  addAsset: (asset: Asset, opts?: { trackId?: string; start?: number; newTrack?: boolean }) => void;
  addText: (text?: string, style?: Partial<import("@/lib/model/types").TextStyle>) => void;
  addShape: (shape: "rect" | "ellipse", fill: string, full?: boolean) => void;
  addComponent: (componentId: string, def: Parameters<typeof createComponentClip>[3]) => void;
  /** Insere clipes montados sobre o rascunho (sem sobrescrever; sobreposições vão por cima). */
  insertClips: (build: (draft: Project) => Clip[]) => string[];
  addTrack: (kind: TrackKind) => void;
  removeTrack: (id: string) => void;
  updateTrack: (id: string, patch: Partial<Pick<Track, "name" | "muted" | "hidden" | "locked">>) => void;
  updateClip: (id: string, fn: (c: Clip) => void, opts?: { record?: boolean }) => void;
  splitSelectionAtPlayhead: () => void;
  deleteSelection: (ripple: boolean) => void;
  duplicateSelection: () => void;
  copySelection: () => void;
  paste: () => void;
  freezeFrame: () => void;
  detachAudio: () => void;
  addMarker: () => void;
  removeMarker: (id: string) => void;
  reformat: (formatId: FormatId) => void;
}

/** Referência ao player fora do estado reativo (não deve disparar renderizações). */
export const playerRef: { current: PlayerRef | null } = { current: null };

export function srcFramesFor(assets: Record<string, Asset>, fps: number): ops.SourceFramesFn {
  return (c) => {
    if (!("assetId" in c)) return Infinity;
    const a = assets[c.assetId];
    if (!a || a.kind === "image" || c.freeze) return Infinity;
    return sourceFrames(a, fps);
  };
}

export const useEditor = create<EditorState>((set, get) => {
  const commit = (next: Project, record = true) => {
    const { project, past, gestureBase } = get();
    if (!project) return;
    set({
      project: next,
      dirty: true,
      ...(record && !gestureBase ? { past: [...past, project].slice(-HISTORY_LIMIT), future: [] } : {}),
    });
  };

  const mutate = (fn: (draft: Project) => void, record = true) => {
    const p = get().project;
    if (!p) return;
    const draft = structuredClone(p);
    fn(draft);
    commit(draft, record);
  };

  const firstTrack = (p: Project, kind: TrackKind, preferId?: string | null) => {
    const preferred = p.tracks.find((t) => t.id === preferId && t.kind === kind && !t.locked);
    return preferred ?? p.tracks.find((t) => t.kind === kind && !t.locked) ?? null;
  };

  /**
   * Coloca o clipe na faixa sem sobrescrever: se houver colisão, cria faixa nova acima.
   * Textos e formas são sobreposições: só entram em faixas acima de tudo que
   * aparece no mesmo intervalo, senão ficariam escondidos atrás do vídeo.
   */
  const placeWithoutOverwrite = (p: Project, clip: Clip, preferId?: string | null) => {
    const kind = trackKindForClip(clip.type);
    const overlaps = (t: Track) => t.clips.some((c) => c.start < clipEnd(clip) && clipEnd(c) > clip.start);
    let limit = p.tracks.length;
    if (clip.type === "text" || clip.type === "shape" || clip.type === "component") {
      const firstBusy = p.tracks.findIndex((t) => t.kind === "visual" && overlaps(t));
      if (firstBusy >= 0) limit = firstBusy;
    }
    const free = (t: Track) => !t.locked && t.kind === kind && !overlaps(t) && p.tracks.indexOf(t) < limit;
    let track = p.tracks.find((t) => t.id === preferId && free(t)) ?? p.tracks.find(free);
    if (!track) {
      track = createTrack(kind, p.tracks.filter((t) => t.kind === kind).length + 1);
      const idx = kind === "visual" ? 0 : p.tracks.length;
      p.tracks.splice(idx, 0, track);
    }
    track.clips.push(clip);
    ops.sortClips(track);
  };

  return {
    project: null,
    assets: {},
    past: [],
    future: [],
    gestureBase: null,
    dirty: false,
    serverRevision: 0,
    lastSavedAt: null,
    saving: false,
    selection: [],
    selectedTrackId: null,
    frame: 0,
    playing: false,
    pxPerFrame: 4,
    leftTab: "media",
    view: { safeArea: true, grid: false, thirds: false, snap: true, previewZoom: "fit" },
    clipboard: [],

    load: (p, revision = 0) => set({ project: p, serverRevision: revision, past: [], future: [], dirty: false, selection: [], frame: 0, gestureBase: null }),
    applyRemote: (p, revision) => {
      const { project, past } = get();
      set({
        project: p,
        serverRevision: revision,
        past: project ? [...past, project].slice(-HISTORY_LIMIT) : past,
        future: [],
        dirty: false,
        gestureBase: null,
        selection: get().selection.filter((id) => p.tracks.some((t) => t.clips.some((c) => c.id === id))),
      });
    },
    setAssets: (list) => set({ assets: Object.fromEntries(list.map((a) => [a.id, a])) }),
    upsertAsset: (a) => set((s) => ({ assets: { ...s.assets, [a.id]: a } })),

    edit: (fn, opts) => mutate(fn, opts?.record ?? true),
    beginGesture: () => set({ gestureBase: get().project }),
    gestureEdit: (fn) => {
      const base = get().gestureBase ?? get().project;
      if (!base) return;
      const draft = structuredClone(base);
      fn(draft);
      set({ project: draft, dirty: true });
    },
    endGesture: () => {
      const { gestureBase, project, past } = get();
      if (gestureBase && project && gestureBase !== project) {
        set({ past: [...past, gestureBase].slice(-HISTORY_LIMIT), future: [], gestureBase: null });
      } else set({ gestureBase: null });
    },
    undo: () => {
      const { past, project, future } = get();
      if (!past.length || !project) return;
      set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future], dirty: true });
    },
    redo: () => {
      const { past, project, future } = get();
      if (!future.length || !project) return;
      set({ project: future[0], future: future.slice(1), past: [...past, project], dirty: true });
    },
    markSaved: (at, revision) => set((s) => ({ lastSavedAt: at, serverRevision: Math.max(s.serverRevision, revision ?? 0) })),
    setSaving: (v) => set({ saving: v }),

    select: (ids, additive) =>
      set((s) => ({
        selection: additive ? Array.from(new Set(s.selection.some((x) => ids.includes(x)) ? s.selection.filter((x) => !ids.includes(x)) : [...s.selection, ...ids])) : ids,
      })),
    selectTrack: (id) => set({ selectedTrackId: id }),
    setFrame: (f) => set({ frame: Math.max(0, Math.round(f)) }),
    setPlaying: (v) => set({ playing: v }),
    setZoom: (z) => set({ pxPerFrame: Math.min(40, Math.max(0.05, z)) }),
    setLeftTab: (t) => set({ leftTab: t }),
    setView: (patch) => set((s) => ({ view: { ...s.view, ...patch } })),

    addAsset: (asset, opts = {}) => {
      const p = get().project;
      if (!p) return;
      let newId = "";
      mutate((d) => {
        const clip = createMediaClip(d, asset, opts.start ?? get().frame);
        newId = clip.id;
        const kind = trackKindForClip(clip.type);
        if (opts.newTrack) {
          const t = createTrack(kind, d.tracks.filter((x) => x.kind === kind).length + 1);
          d.tracks.splice(kind === "visual" ? 0 : d.tracks.length, 0, t);
          t.clips.push(clip);
        } else if (opts.trackId) {
          const t = d.tracks.find((x) => x.id === opts.trackId);
          if (t && t.kind === kind && !t.locked) {
            t.clips.push(clip);
            ops.resolveOverlaps(t, clip.id);
          } else placeWithoutOverwrite(d, clip, null);
        } else placeWithoutOverwrite(d, clip, get().selectedTrackId);
      });
      set({ selection: [newId] });
    },
    addText: (text, style) => {
      let id = "";
      mutate((d) => {
        const c = createTextClip(d, get().frame, text, style);
        id = c.id;
        placeWithoutOverwrite(d, c, get().selectedTrackId);
      });
      set({ selection: [id] });
    },
    addShape: (shape, fill, full) => {
      let id = "";
      mutate((d) => {
        const c = createShapeClip(d, get().frame, shape, fill, full);
        id = c.id;
        placeWithoutOverwrite(d, c, get().selectedTrackId);
      });
      set({ selection: [id] });
    },
    addComponent: (componentId, def) => {
      let id = "";
      mutate((d) => {
        const c = createComponentClip(d, get().frame, componentId, def);
        id = c.id;
        placeWithoutOverwrite(d, c, get().selectedTrackId);
      });
      set({ selection: [id] });
    },
    insertClips: (build) => {
      const ids: string[] = [];
      mutate((d) => {
        for (const c of build(d)) {
          ids.push(c.id);
          placeWithoutOverwrite(d, c, null);
        }
      });
      if (ids.length) set({ selection: ids });
      return ids;
    },
    addTrack: (kind) =>
      mutate((d) => {
        const t = createTrack(kind, d.tracks.filter((x) => x.kind === kind).length + 1);
        if (kind === "visual") d.tracks.splice(0, 0, t);
        else d.tracks.push(t);
      }),
    removeTrack: (id) => mutate((d) => void (d.tracks = d.tracks.filter((t) => t.id !== id))),
    updateTrack: (id, patch) =>
      mutate((d) => {
        const t = d.tracks.find((x) => x.id === id);
        if (t) Object.assign(t, patch);
      }),
    updateClip: (id, fn, opts) =>
      mutate((d) => {
        const f = ops.findClip(d, id);
        if (f) fn(f.clip);
      }, opts?.record ?? true),

    splitSelectionAtPlayhead: () => {
      const { frame, selection } = get();
      let created: string[] = [];
      mutate((d) => {
        created = ops.splitAt(d, frame, selection);
      });
      if (created.length) set({ selection: created });
    },
    deleteSelection: (ripple) => {
      const sel = get().selection;
      if (!sel.length) return;
      mutate((d) => ops.deleteClips(d, sel, ripple));
      set({ selection: [] });
    },
    duplicateSelection: () => {
      const sel = get().selection;
      const ids: string[] = [];
      mutate((d) => {
        for (const id of sel) {
          const f = ops.findClip(d, id);
          if (!f) continue;
          const copy = structuredClone(f.clip);
          copy.id = uid("clp_");
          copy.start = clipEnd(f.clip);
          ids.push(copy.id);
          placeWithoutOverwrite(d, copy, f.track.id);
        }
      });
      if (ids.length) set({ selection: ids });
    },
    copySelection: () => {
      const p = get().project;
      if (!p) return;
      const clips = get()
        .selection.map((id) => ops.findClip(p, id)?.clip)
        .filter(Boolean) as Clip[];
      set({ clipboard: structuredClone(clips) });
    },
    paste: () => {
      const { clipboard, frame } = get();
      if (!clipboard.length) return;
      const minStart = Math.min(...clipboard.map((c) => c.start));
      const ids: string[] = [];
      mutate((d) => {
        for (const c of clipboard) {
          const copy = structuredClone(c);
          copy.id = uid("clp_");
          copy.start = frame + (c.start - minStart);
          ids.push(copy.id);
          placeWithoutOverwrite(d, copy, get().selectedTrackId);
        }
      });
      set({ selection: ids });
    },
    /** Congela o quadro atual do vídeo selecionado por 2 s, empurrando o restante. */
    freezeFrame: () => {
      const { selection, frame, project } = get();
      if (!project) return;
      const id = selection[0];
      const found = id ? ops.findClip(project, id) : null;
      if (!found || found.clip.type !== "video" || frame < found.clip.start || frame >= clipEnd(found.clip)) return;
      const holdFrames = project.fps * 2;
      let freezeId = "";
      mutate((d) => {
        const f = ops.findClip(d, id)!;
        const c = f.clip as import("@/lib/model/types").MediaClip;
        const local = frame - c.start;
        const rightId = local > 0 ? ops.splitClip(d, id, frame) : id;
        for (const other of f.track.clips) if (other.start >= frame && other.id !== undefined) other.start += holdFrames;
        const freeze: import("@/lib/model/types").MediaClip = {
          ...structuredClone(c),
          id: uid("clp_"),
          name: `${c.name} (congelado)`,
          start: frame,
          duration: holdFrames,
          trimStart: c.trimStart + Math.round(local * c.speed),
          freeze: true,
          transitionIn: null,
          transitionOut: null,
          keyframes: {},
        };
        freezeId = freeze.id;
        f.track.clips.push(freeze);
        ops.sortClips(f.track);
        void rightId;
      });
      set({ selection: [freezeId] });
    },
    /** Separa o áudio do vídeo numa faixa de áudio, silenciando o vídeo original. */
    detachAudio: () => {
      const { selection, project, assets } = get();
      if (!project) return;
      const found = selection[0] ? ops.findClip(project, selection[0]) : null;
      if (!found || found.clip.type !== "video" || !assets[found.clip.assetId]?.hasAudio) return;
      mutate((d) => {
        const f = ops.findClip(d, found.clip.id)!;
        const v = f.clip as import("@/lib/model/types").MediaClip;
        v.videoMuted = true;
        const audio: import("@/lib/model/types").MediaClip = {
          ...structuredClone(v),
          id: uid("clp_"),
          type: "audio",
          name: `${v.name} (áudio)`,
          videoMuted: false,
          freeze: false,
          transitionIn: null,
          transitionOut: null,
          keyframes: {},
        };
        placeWithoutOverwrite(d, audio, null);
      });
    },
    addMarker: () =>
      mutate((d) => {
        const f = get().frame;
        if (d.markers.some((m) => m.frame === f)) return;
        d.markers.push({ id: uid("mrk_"), frame: f, label: `Marcador ${d.markers.length + 1}`, color: "#facc15" });
        d.markers.sort((a, b) => a.frame - b.frame);
      }),
    removeMarker: (id) => mutate((d) => void (d.markers = d.markers.filter((m) => m.id !== id))),
    reformat: (formatId) => mutate((d) => ops.reformatProject(d, formatId)),
  };
});

export function useSelectedClip(): { clip: Clip; track: Track } | null {
  const project = useEditor((s) => s.project);
  const sel = useEditor((s) => s.selection);
  if (!project || sel.length !== 1) return null;
  const f = ops.findClip(project, sel[0]);
  return f ? { clip: f.clip, track: f.track } : null;
}

export function useProjectDuration(): number {
  return useEditor((s) => (s.project ? projectDuration(s.project) : 0));
}

/** Move o cursor de reprodução (estado + player). */
export function seek(frame: number) {
  const f = Math.max(0, Math.round(frame));
  useEditor.getState().setFrame(f);
  playerRef.current?.seekTo(f);
}

/** Último conteúdo salvo pelo próprio editor (para não confundir com edição externa). */
export const ownSave = { json: "" };
