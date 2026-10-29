"use client";

import { useQuery } from "@tanstack/react-query";
import { ContextMenu } from "radix-ui";
import {
  Bookmark,
  Eye,
  EyeOff,
  Lock,
  Magnet,
  MousePointer2,
  Music,
  Plus,
  Scissors,
  Trash2,
  Unlock,
  Video,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { clipEnd, trackKindForClip } from "@/lib/model/defaults";
import { closeGaps, findClip, isTimedMedia, moveClip, setSpeed, slipClip, splitClip, trimClip } from "@/lib/model/ops";
import type { Clip, MediaClip, Track } from "@/lib/model/types";
import { cn, timecode } from "@/lib/utils";
import { playerRef, seek, srcFramesFor, useEditor, useProjectDuration } from "@/store/editor";
import { Button } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";

const HEADER_W = 184;
const RULER_H = 26;
const ROW_H: Record<Track["kind"], number> = { visual: 62, audio: 50 };
const SNAP_PX = 8;

const CLIP_COLORS: Record<Clip["type"], string> = {
  video: "var(--clip-video)",
  image: "var(--clip-image)",
  audio: "var(--clip-audio)",
  text: "var(--clip-text)",
  shape: "var(--clip-shape)",
  component: "var(--clip-component)",
};

export type TimelineTool = "select" | "blade";

export function Timeline({ tool, setTool }: { tool: TimelineTool; setTool: (t: TimelineTool) => void }) {
  const project = useEditor((s) => s.project)!;
  const ppf = useEditor((s) => s.pxPerFrame);
  const setZoom = useEditor((s) => s.setZoom);
  const snapOn = useEditor((s) => s.view.snap);
  const setView = useEditor((s) => s.setView);
  const duration = useProjectDuration();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ left: 0, width: 1000 });
  const [blade, setBlade] = useState<number | null>(null);

  const contentFrames = Math.max(duration + project.fps * 10, project.fps * 30);
  const contentW = contentFrames * ppf;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScroll({ left: el.scrollLeft, width: el.clientWidth }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Ctrl + roda do mouse: zoom temporal centrado no ponteiro.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left - HEADER_W + el.scrollLeft;
      const s = useEditor.getState();
      const frameAt = x / s.pxPerFrame;
      const next = Math.min(40, Math.max(0.05, s.pxPerFrame * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
      s.setZoom(next);
      requestAnimationFrame(() => (el.scrollLeft = frameAt * next - (e.clientX - rect.left - HEADER_W)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const fitZoom = () => {
    const w = (scrollRef.current?.clientWidth ?? 1000) - HEADER_W - 40;
    setZoom(w / Math.max(project.fps * 5, duration));
  };

  const frameFromClientX = useCallback(
    (clientX: number) => {
      const el = scrollRef.current!;
      const rect = el.getBoundingClientRect();
      return Math.max(0, Math.round((clientX - rect.left - HEADER_W + el.scrollLeft) / useEditor.getState().pxPerFrame));
    },
    [],
  );

  const onRulerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    playerPause();
    seek(frameFromClientX(e.clientX));
    const move = (ev: PointerEvent) => seek(frameFromClientX(ev.clientX));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const onDropNewTrack = (e: React.DragEvent) => {
    const id = e.dataTransfer.getData("application/x-ms-asset");
    const asset = useEditor.getState().assets[id];
    if (!asset) return;
    e.preventDefault();
    useEditor.getState().addAsset(asset, { start: frameFromClientX(e.clientX), newTrack: true });
  };

  const visualTracks = project.tracks;

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-2">
        <ToolBtn active={tool === "select"} onClick={() => setTool("select")} label="Seleção (V)">
          <MousePointer2 size={14} />
        </ToolBtn>
        <ToolBtn active={tool === "blade"} onClick={() => setTool("blade")} label="Lâmina — clique para cortar (C)">
          <Scissors size={14} />
        </ToolBtn>
        <div className="mx-1 h-5 w-px bg-line" />
        <Button size="sm" variant="ghost" title="Dividir no cursor (S)" onClick={() => useEditor.getState().splitSelectionAtPlayhead()}>
          <Scissors size={13} /> Dividir
        </Button>
        <Button size="sm" variant="ghost" title="Excluir (Delete) · Shift+Delete exclui com ripple" onClick={() => useEditor.getState().deleteSelection(false)}>
          <Trash2 size={13} /> Excluir
        </Button>
        <Button size="sm" variant="ghost" title="Marcador (M)" onClick={() => useEditor.getState().addMarker()}>
          <Bookmark size={13} /> Marcador
        </Button>
        <ToolBtn active={snapOn} onClick={() => setView({ snap: !snapOn })} label="Snap magnético">
          <Magnet size={14} />
        </ToolBtn>
        <div className="mx-1 h-5 w-px bg-line" />
        <Button size="sm" variant="ghost" title="Nova faixa de vídeo" onClick={() => useEditor.getState().addTrack("visual")}>
          <Plus size={13} /> <Video size={13} />
        </Button>
        <Button size="sm" variant="ghost" title="Nova faixa de áudio" onClick={() => useEditor.getState().addTrack("audio")}>
          <Plus size={13} /> <Music size={13} />
        </Button>
        <div className="flex-1" />
        <Button size="icon" variant="ghost" title="Diminuir zoom (-)" onClick={() => setZoom(ppf / 1.4)}>
          <ZoomOut size={14} />
        </Button>
        <input
          type="range"
          aria-label="Zoom da timeline"
          min={-3}
          max={3.6}
          step={0.01}
          value={Math.log(ppf)}
          onChange={(e) => setZoom(Math.exp(Number(e.target.value)))}
          className="w-28"
        />
        <Button size="icon" variant="ghost" title="Aumentar zoom (+)" onClick={() => setZoom(ppf * 1.4)}>
          <ZoomIn size={14} />
        </Button>
        <Button size="sm" variant="ghost" onClick={fitZoom} title="Ajustar timeline à janela">
          Ajustar
        </Button>
      </div>

      <div
        ref={scrollRef}
        className="relative min-h-0 flex-1 overflow-auto"
        onScroll={(e) => setScroll({ left: e.currentTarget.scrollLeft, width: e.currentTarget.clientWidth })}
        onPointerMove={(e) => tool === "blade" && setBlade(frameFromClientX(e.clientX))}
        onPointerLeave={() => setBlade(null)}
      >
        <div className="relative" style={{ width: HEADER_W + contentW, minHeight: "100%" }}>
          {/* Régua */}
          <div className="sticky top-0 z-20 flex" style={{ height: RULER_H }}>
            <div className="sticky left-0 z-30 flex shrink-0 items-center border-r border-b border-line bg-panel px-2 text-[11px] text-muted" style={{ width: HEADER_W }}>
              {project.tracks.length} faixas
            </div>
            <Ruler fps={project.fps} ppf={ppf} width={contentW} scrollLeft={scroll.left} viewWidth={scroll.width} onPointerDown={onRulerDown} />
          </div>

          {visualTracks.map((t) => (
            <TrackRow key={t.id} track={t} contentW={contentW} tool={tool} frameFromClientX={frameFromClientX} />
          ))}

          {/* Área livre: soltar mídia aqui cria uma faixa nova */}
          <div className="flex" style={{ height: 60 }} onDragOver={(e) => e.preventDefault()} onDrop={onDropNewTrack}>
            <div className="sticky left-0 shrink-0 border-r border-line bg-panel" style={{ width: HEADER_W }} />
            <div className="flex flex-1 items-center pl-4 text-[11px] text-muted/60">Arraste mídia para cá para criar uma nova faixa</div>
          </div>

          <Markers ppf={ppf} />
          <Playhead ppf={ppf} />
          {tool === "blade" && blade !== null && (
            <div className="pointer-events-none absolute top-0 bottom-0 z-10 w-px bg-red-400" style={{ left: HEADER_W + blade * ppf }} />
          )}
        </div>
      </div>
    </div>
  );
}

function playerPause() {
  playerRef.current?.pause();
}

function ToolBtn({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn("flex h-7 w-7 items-center justify-center rounded-md", active ? "bg-accent/20 text-accent" : "text-muted hover:bg-panel-3 hover:text-fg")}
    >
      {children}
    </button>
  );
}

function Ruler({
  fps,
  ppf,
  width,
  scrollLeft,
  viewWidth,
  onPointerDown,
}: {
  fps: number;
  ppf: number;
  width: number;
  scrollLeft: number;
  viewWidth: number;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const candidates = [1, 2, 5, 10, fps / 2, fps, fps * 2, fps * 5, fps * 10, fps * 15, fps * 30, fps * 60, fps * 120, fps * 300, fps * 600];
  const step = candidates.find((c) => c * ppf >= 80) ?? fps * 600;
  const minor = step / 5;
  const first = Math.max(0, Math.floor(scrollLeft / ppf / step) * step);
  const last = (scrollLeft + viewWidth) / ppf;
  const ticks: number[] = [];
  for (let f = first; f <= last; f += minor) ticks.push(Math.round(f * 1000) / 1000);
  return (
    <div className="relative cursor-pointer border-b border-line bg-panel-2 select-none" style={{ width, height: RULER_H }} onPointerDown={onPointerDown}>
      {ticks.map((f) => {
        const major = Math.abs(f / step - Math.round(f / step)) < 1e-6;
        return (
          <div key={f} className="absolute bottom-0" style={{ left: f * ppf }}>
            <div className={cn("w-px", major ? "h-2.5 bg-muted" : "h-1.5 bg-line")} />
            {major && <span className="absolute -top-4 left-1 font-mono text-[10px] whitespace-nowrap text-muted">{timecode(f, fps)}</span>}
          </div>
        );
      })}
    </div>
  );
}

function Playhead({ ppf }: { ppf: number }) {
  const frame = useEditor((s) => s.frame);
  return (
    <div className="pointer-events-none absolute top-0 bottom-0 z-20" style={{ left: HEADER_W + frame * ppf }}>
      <div className="absolute top-0 -left-[6px] h-3 w-[13px] rounded-b-sm bg-accent-2" />
      <div className="h-full w-px bg-accent-2" />
    </div>
  );
}

function Markers({ ppf }: { ppf: number }) {
  const markers = useEditor((s) => s.project!.markers);
  const fps = useEditor((s) => s.project!.fps);
  return (
    <>
      {markers.map((m) => (
        <div key={m.id} className="absolute top-0 bottom-0 z-10" style={{ left: HEADER_W + m.frame * ppf }}>
          <button
            title={`${m.label} — ${timecode(m.frame, fps)} (clique: ir · clique direito: remover)`}
            onClick={() => seek(m.frame)}
            onContextMenu={(e) => {
              e.preventDefault();
              useEditor.getState().removeMarker(m.id);
            }}
            className="absolute top-[13px] -left-[5px] h-[11px] w-[11px] rotate-45 rounded-[2px]"
            style={{ background: m.color }}
          />
          <div className="pointer-events-none h-full w-px opacity-40" style={{ background: m.color }} />
        </div>
      ))}
    </>
  );
}

function TrackRow({ track, contentW, tool, frameFromClientX }: { track: Track; contentW: number; tool: TimelineTool; frameFromClientX: (x: number) => number }) {
  const selectedTrackId = useEditor((s) => s.selectedTrackId);
  const h = ROW_H[track.kind];
  const [renaming, setRenaming] = useState(false);
  const [dropHint, setDropHint] = useState(false);

  const onDrop = (e: React.DragEvent) => {
    setDropHint(false);
    const id = e.dataTransfer.getData("application/x-ms-asset");
    const asset = useEditor.getState().assets[id];
    if (!asset) return;
    e.preventDefault();
    const kind = trackKindForClip(asset.kind);
    const start = frameFromClientX(e.clientX);
    if (kind !== track.kind || track.locked) useEditor.getState().addAsset(asset, { start });
    else useEditor.getState().addAsset(asset, { start, trackId: track.id });
  };

  const st = useEditor.getState;
  return (
    <div className="flex border-b border-line" style={{ height: h }} data-track-id={track.id} data-track-kind={track.kind}>
      <div
        className={cn(
          "sticky left-0 z-10 flex shrink-0 flex-col justify-center gap-1 border-r border-line px-2",
          selectedTrackId === track.id ? "bg-panel-3" : "bg-panel",
        )}
        style={{ width: HEADER_W }}
        onClick={() => st().selectTrack(track.id)}
      >
        <div className="flex items-center gap-1.5">
          {track.kind === "visual" ? <Video size={12} className="text-muted" /> : <Music size={12} className="text-muted" />}
          {renaming ? (
            <input
              autoFocus
              defaultValue={track.name}
              className="h-5 w-full rounded border border-accent bg-bg px-1 text-[12px] outline-none"
              onBlur={(e) => {
                st().updateTrack(track.id, { name: e.target.value || track.name });
                setRenaming(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          ) : (
            <span className="truncate text-[12px] font-medium" onDoubleClick={() => setRenaming(true)} title="Clique duplo para renomear">
              {track.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <HeaderBtn on={track.muted} onClick={() => st().updateTrack(track.id, { muted: !track.muted })} label={track.muted ? "Ativar som" : "Silenciar"}>
            {track.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
          </HeaderBtn>
          {track.kind === "visual" && (
            <HeaderBtn on={track.hidden} onClick={() => st().updateTrack(track.id, { hidden: !track.hidden })} label={track.hidden ? "Mostrar" : "Ocultar"}>
              {track.hidden ? <EyeOff size={12} /> : <Eye size={12} />}
            </HeaderBtn>
          )}
          <HeaderBtn on={track.locked} onClick={() => st().updateTrack(track.id, { locked: !track.locked })} label={track.locked ? "Desbloquear" : "Bloquear"}>
            {track.locked ? <Lock size={12} /> : <Unlock size={12} />}
          </HeaderBtn>
          <HeaderBtn on={false} onClick={() => st().edit((d) => closeGaps(d.tracks.find((t) => t.id === track.id)!))} label="Fechar lacunas">
            <span className="text-[10px] font-bold">⇤</span>
          </HeaderBtn>
          <HeaderBtn
            on={false}
            onClick={() => {
              if (track.clips.length && !confirm(`Remover a faixa "${track.name}" e seus ${track.clips.length} clipes?`)) return;
              st().removeTrack(track.id);
            }}
            label="Remover faixa"
          >
            <Trash2 size={12} />
          </HeaderBtn>
        </div>
      </div>
      <div
        className={cn("relative shrink-0", track.locked && "bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,#ffffff06_6px,#ffffff06_12px)]", dropHint && "bg-accent/10")}
        style={{ width: contentW }}
        onDragOver={(e) => {
          e.preventDefault();
          setDropHint(true);
        }}
        onDragLeave={() => setDropHint(false)}
        onDrop={onDrop}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) {
            st().select([]);
            st().selectTrack(track.id);
            if (tool === "select") seek(frameFromClientX(e.clientX));
          }
        }}
      >
        {track.clips.map((c) => (
          <ClipItem key={c.id} clip={c} track={track} height={h} tool={tool} frameFromClientX={frameFromClientX} />
        ))}
      </div>
    </div>
  );
}

function HeaderBtn({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn("flex h-5 w-5 items-center justify-center rounded", on ? "bg-accent/25 text-accent" : "text-muted hover:bg-panel-3 hover:text-fg")}
    >
      {children}
    </button>
  );
}

/** Pontos de encaixe: início, cursor, marcadores e bordas dos outros clipes. */
function snapPoints(exclude: Set<string>): number[] {
  const s = useEditor.getState();
  const p = s.project!;
  const pts = [0, s.frame, ...p.markers.map((m) => m.frame)];
  for (const t of p.tracks) for (const c of t.clips) if (!exclude.has(c.id)) pts.push(c.start, clipEnd(c));
  return pts;
}

function snapValue(v: number, pts: number[], ppf: number): number {
  let best = v;
  let dist = SNAP_PX / ppf;
  for (const p of pts) {
    const d = Math.abs(p - v);
    if (d < dist) {
      dist = d;
      best = p;
    }
  }
  return best;
}

function ClipItem({ clip, track, height, tool, frameFromClientX }: { clip: Clip; track: Track; height: number; tool: TimelineTool; frameFromClientX: (x: number) => number }) {
  const ppf = useEditor((s) => s.pxPerFrame);
  const selected = useEditor((s) => s.selection.includes(clip.id));
  const asset = useEditor((s) => ("assetId" in clip ? s.assets[clip.assetId] : undefined));
  const fps = useEditor((s) => s.project!.fps);
  const left = clip.start * ppf;
  const width = Math.max(2, clip.duration * ppf);

  const startGesture = (e: React.PointerEvent, mode: "move" | "trim-start" | "trim-end") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const s = useEditor.getState();
    if (tool === "blade" && mode === "move") {
      const f = frameFromClientX(e.clientX);
      s.select([clip.id]);
      s.edit((d) => void splitClip(d, clip.id, f));
      return;
    }
    if (track.locked) {
      s.select([clip.id]);
      return;
    }
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    if (additive) {
      s.select([clip.id], true);
      return;
    }
    if (!s.selection.includes(clip.id)) s.select([clip.id]);
    s.selectTrack(track.id);
    const ids = useEditor.getState().selection;
    const startX = e.clientX;
    const base = s.project!;
    const origins = new Map(ids.map((id) => [id, findClip(base, id)?.clip]).filter(([, c]) => c) as [string, Clip][]);
    const pts = snapPoints(new Set(ids));
    const slip = e.altKey && mode === "move" && isTimedMedia(clip);
    const srcFrames = srcFramesFor(s.assets, base.fps);
    let moved = false;
    s.beginGesture();

    const move = (ev: PointerEvent) => {
      const dxFrames = Math.round((ev.clientX - startX) / ppf);
      if (!moved && Math.abs(ev.clientX - startX) < 3) return;
      moved = true;
      const snap = useEditor.getState().view.snap && !ev.altKey;
      useEditor.getState().gestureEdit((d) => {
        if (slip) {
          const c0 = origins.get(clip.id) as MediaClip;
          slipClip(d, clip.id, c0.trimStart - dxFrames * c0.speed, srcFrames);
          return;
        }
        if (mode === "move") {
          const c0 = origins.get(clip.id)!;
          let start = Math.max(0, c0.start + dxFrames);
          if (snap) {
            const a = snapValue(start, pts, ppf);
            const b = snapValue(start + c0.duration, pts, ppf) - c0.duration;
            start = Math.abs(a - start) <= Math.abs(b - start) ? a : b;
          }
          const delta = start - c0.start;
          // faixa alvo pelo ponteiro (apenas para o clipe arrastado, mesma natureza)
          const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-track-id]") as HTMLElement | null;
          const targetId = el?.dataset.trackId;
          const kindOk = el?.dataset.trackKind === trackKindForClip(clip.type);
          for (const [id, c] of origins) {
            moveClip(d, id, Math.max(0, c.start + delta), id === clip.id && kindOk ? targetId : undefined);
          }
        } else {
          const c0 = origins.get(clip.id)!;
          let f = mode === "trim-start" ? c0.start + dxFrames : clipEnd(c0) + dxFrames;
          if (snap) f = snapValue(f, pts, ppf);
          trimClip(d, clip.id, mode === "trim-start" ? "start" : "end", f, srcFrames);
        }
      });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      useEditor.getState().endGesture();
      if (!moved) seek(frameFromClientX(startX));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const label = clip.type === "text" ? clip.text : clip.name;
  const thumb = asset && (clip.type === "video" || clip.type === "image") ? `/api/media/${asset.id}/thumb` : null;
  const showWave = asset && (clip.type === "audio" || (clip.type === "video" && asset.hasAudio && !(clip as MediaClip).videoMuted));
  const kfFrames = useMemo(() => Array.from(new Set(Object.values(clip.keyframes).flatMap((k) => k!.map((x) => x.frame)))), [clip.keyframes]);

  return (
    <ClipContextMenu clip={clip}>
      <div
        className={cn(
          "group absolute top-1 bottom-1 overflow-hidden rounded-md border text-white select-none",
          selected ? "z-[5] border-white ring-1 ring-white" : "border-black/30",
          tool === "blade" ? "cursor-crosshair" : track.locked ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing",
          track.hidden && "opacity-40",
        )}
        style={{ left, width, background: CLIP_COLORS[clip.type] }}
        onPointerDown={(e) => startGesture(e, "move")}
        title={`${label}\n${timecode(clip.start, fps)} → ${timecode(clipEnd(clip), fps)}${isTimedMedia(clip) && clip.speed !== 1 ? `\nVelocidade ${clip.speed}x` : ""}\nAlt+arrastar: slip`}
      >
        {thumb && width > 30 && (
          <div
            className="absolute inset-0 opacity-45"
            style={{ backgroundImage: `url(${thumb})`, backgroundSize: `auto 100%`, backgroundRepeat: "repeat-x" }}
          />
        )}
        {showWave && <Waveform clip={clip as MediaClip} assetId={asset!.id} height={height} width={width} fps={fps} />}
        <div className="relative flex items-center gap-1 px-1.5 pt-0.5 text-[11px] font-medium drop-shadow">
          {(clip as MediaClip).freeze && <span className="rounded bg-black/40 px-1 text-[9px]">CONGELADO</span>}
          {isTimedMedia(clip) && clip.speed !== 1 && <span className="rounded bg-black/40 px-1 text-[9px]">{clip.speed}x</span>}
          <span className="truncate">{label}</span>
        </div>
        {clip.transitionIn && (
          <div
            className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-white/45 to-transparent"
            style={{ width: Math.min(width / 2, clip.transitionIn.duration * ppf) }}
          />
        )}
        {clip.transitionOut && (
          <div
            className="absolute top-0 right-0 bottom-0 bg-gradient-to-l from-white/45 to-transparent"
            style={{ width: Math.min(width / 2, clip.transitionOut.duration * ppf) }}
          />
        )}
        {kfFrames.map((f) => (
          <span key={f} className="absolute bottom-0.5 h-2 w-2 -translate-x-1/2 rotate-45 border border-black/50 bg-yellow-300" style={{ left: f * ppf }} />
        ))}
        {tool === "select" && !track.locked && (
          <>
            <div className="absolute top-0 bottom-0 left-0 w-1.5 cursor-ew-resize bg-white/0 hover:bg-white/50" onPointerDown={(e) => startGesture(e, "trim-start")} />
            <div className="absolute top-0 right-0 bottom-0 w-1.5 cursor-ew-resize bg-white/0 hover:bg-white/50" onPointerDown={(e) => startGesture(e, "trim-end")} />
          </>
        )}
      </div>
    </ClipContextMenu>
  );
}

function Waveform({ clip, assetId, height, width, fps }: { clip: MediaClip; assetId: string; height: number; width: number; fps: number }) {
  const { data } = useQuery({ queryKey: ["waveform", assetId], queryFn: () => api.waveform(assetId), staleTime: Infinity });
  const path = useMemo(() => {
    if (!data?.peaks.length) return "";
    const cols = Math.max(1, Math.min(1500, Math.floor(width / 2)));
    const startSec = clip.freeze ? 0 : clip.trimStart / fps;
    const lenSec = (clip.duration * clip.speed) / fps;
    const h = height - 10;
    let d = "";
    for (let i = 0; i < cols; i++) {
      const a = Math.floor((startSec + (i / cols) * lenSec) * data.peaksPerSecond);
      const b = Math.max(a + 1, Math.floor((startSec + ((i + 1) / cols) * lenSec) * data.peaksPerSecond));
      let m = 0;
      for (let j = a; j < b && j < data.peaks.length; j++) m = Math.max(m, data.peaks[j]);
      const v = Math.min(1, m * clip.volume) * (h / 2);
      const x = (i / cols) * 1000;
      d += `M${x.toFixed(1)} ${(h / 2 - v + 8).toFixed(1)}V${(h / 2 + v + 8).toFixed(1)}`;
    }
    return d;
  }, [data, clip.trimStart, clip.duration, clip.speed, clip.volume, clip.freeze, width, height, fps]);
  if (!path || clip.freeze) return null;
  return (
    <svg className="pointer-events-none absolute inset-0" width="100%" height="100%" viewBox={`0 0 1000 ${height}`} preserveAspectRatio="none">
      <path d={path} stroke="rgba(255,255,255,0.55)" strokeWidth={1000 / Math.max(1, width)} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function ClipContextMenu({ clip, children }: { clip: Clip; children: React.ReactNode }) {
  const s = useEditor.getState;
  const assets = useEditor((st) => st.assets);
  const asset = "assetId" in clip ? assets[clip.assetId] : undefined;
  const item = "flex cursor-default items-center rounded px-2 py-1.5 text-[12px] outline-none data-[highlighted]:bg-accent data-[highlighted]:text-white data-[disabled]:opacity-40";
  const ensureSelected = () => {
    if (!s().selection.includes(clip.id)) s().select([clip.id]);
  };
  const changeSpeed = (v: number) => s().edit((d) => setSpeed(d, clip.id, v, srcFramesFor(s().assets, d.fps)));
  const reverse = async () => {
    if (!asset) return;
    toast.info("Gerando versão invertida com FFmpeg…");
    try {
      const rev = await api.reverseAsset(asset.id);
      s().upsertAsset(rev);
      const total = Math.floor(rev.duration * s().project!.fps);
      s().updateClip(clip.id, (c) => {
        const m = c as MediaClip;
        // o trecho usado passa a ser o espelhado dentro da mídia invertida
        m.trimStart = Math.max(0, total - m.trimStart - Math.ceil(m.duration * m.speed));
        m.assetId = rev.id;
        m.name = rev.name;
      });
      toast.ok("Clipe invertido");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <ContextMenu.Root onOpenChange={(o) => o && ensureSelected()}>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-50 min-w-52 rounded-lg border border-line bg-panel-2 p-1 shadow-2xl">
          <ContextMenu.Item className={item} onSelect={() => s().splitSelectionAtPlayhead()}>
            Dividir no cursor <Kbd>S</Kbd>
          </ContextMenu.Item>
          <ContextMenu.Item className={item} onSelect={() => s().duplicateSelection()}>
            Duplicar <Kbd>Ctrl+D</Kbd>
          </ContextMenu.Item>
          <ContextMenu.Item className={item} onSelect={() => s().copySelection()}>
            Copiar <Kbd>Ctrl+C</Kbd>
          </ContextMenu.Item>
          <ContextMenu.Separator className="my-1 h-px bg-line" />
          {(clip.type === "video" || clip.type === "audio") && (
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger className={item}>Velocidade ›</ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent className="z-50 min-w-32 rounded-lg border border-line bg-panel-2 p-1 shadow-2xl">
                  {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4].map((v) => (
                    <ContextMenu.Item key={v} className={item} onSelect={() => changeSpeed(v)}>
                      {v}x {isTimedMedia(clip) && clip.speed === v ? "✓" : ""}
                    </ContextMenu.Item>
                  ))}
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>
          )}
          {clip.type === "video" && (
            <ContextMenu.Item className={item} onSelect={() => s().freezeFrame()}>
              Congelar quadro no cursor
            </ContextMenu.Item>
          )}
          {clip.type === "video" && (
            <ContextMenu.Item className={item} disabled={!asset?.hasAudio || (clip as MediaClip).videoMuted} onSelect={() => s().detachAudio()}>
              Separar áudio
            </ContextMenu.Item>
          )}
          {(clip.type === "video" || clip.type === "audio") && (
            <ContextMenu.Item className={item} onSelect={reverse}>
              Reverter (tocar de trás para frente)
            </ContextMenu.Item>
          )}
          <ContextMenu.Separator className="my-1 h-px bg-line" />
          <ContextMenu.Item className={item} onSelect={() => s().deleteSelection(false)}>
            Excluir <Kbd>Del</Kbd>
          </ContextMenu.Item>
          <ContextMenu.Item className={item} onSelect={() => s().deleteSelection(true)}>
            Excluir e fechar lacuna <Kbd>Shift+Del</Kbd>
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <span className="ml-auto pl-4 font-mono text-[10px] opacity-60">{children}</span>;
}
