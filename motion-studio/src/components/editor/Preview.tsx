"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { ChevronFirst, ChevronLast, Grid3x3, Magnet, Pause, Play, ScanLine, SkipBack, SkipForward, Shield } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MainComposition } from "@/remotion/MainComposition";
import { getAnimatedState } from "@/lib/model/animation";
import { clipEnd } from "@/lib/model/defaults";
import { getFormat } from "@/lib/model/formats";
import { findClip, setKeyframe } from "@/lib/model/ops";
import type { AssetRef, Clip, CompositionProps } from "@/lib/model/types";
import { cn, timecode } from "@/lib/utils";
import { playerRef, seek, useEditor, useProjectDuration } from "@/store/editor";
import { Button, Select } from "@/components/ui/primitives";

export function Preview({ useProxies }: { useProxies: boolean }) {
  const project = useEditor((s) => s.project)!;
  const assets = useEditor((s) => s.assets);
  const view = useEditor((s) => s.view);
  const setView = useEditor((s) => s.setView);
  const duration = useProjectDuration();
  const containerRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 800, h: 600 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const assetRefs = useMemo(() => {
    const out: Record<string, AssetRef> = {};
    for (const a of Object.values(assets)) out[a.id] = { id: a.id, kind: a.kind, duration: a.duration, width: a.width, height: a.height, hasProxy: a.hasProxy };
    return out;
  }, [assets]);

  const inputProps = useMemo<CompositionProps>(() => ({ project, assets: assetRefs, mediaBaseUrl: "", useProxies }), [project, assetRefs, useProxies]);

  const fit = Math.max(0.05, Math.min((box.w - 40) / project.width, (box.h - 40) / project.height));
  const scale = view.previewZoom === "fit" ? fit : view.previewZoom;

  const setRef = useCallback((r: PlayerRef | null) => {
    playerRef.current = r;
  }, []);

  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const onFrame = (e: { detail: { frame: number } }) => useEditor.getState().setFrame(e.detail.frame);
    const onPlay = () => useEditor.getState().setPlaying(true);
    const onPause = () => useEditor.getState().setPlaying(false);
    p.addEventListener("frameupdate", onFrame);
    p.addEventListener("play", onPlay);
    p.addEventListener("pause", onPause);
    p.addEventListener("ended", onPause);
    return () => {
      p.removeEventListener("frameupdate", onFrame);
      p.removeEventListener("play", onPlay);
      p.removeEventListener("pause", onPause);
      p.removeEventListener("ended", onPause);
    };
  });

  const fmt = getFormat(project.formatId);

  return (
    <div className="flex h-full flex-col bg-bg">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line bg-panel px-2">
        <span className="mr-2 rounded bg-panel-3 px-2 py-0.5 text-[11px]">
          {fmt.label} · {fmt.ratio} · {project.width}×{project.height} · {project.fps} fps
        </span>
        <div className="flex-1" />
        <ToggleIcon active={view.safeArea} onClick={() => setView({ safeArea: !view.safeArea })} label="Área segura do Instagram">
          <Shield size={14} />
        </ToggleIcon>
        <ToggleIcon active={view.grid} onClick={() => setView({ grid: !view.grid })} label="Grade">
          <Grid3x3 size={14} />
        </ToggleIcon>
        <ToggleIcon active={view.thirds} onClick={() => setView({ thirds: !view.thirds })} label="Regra dos terços">
          <ScanLine size={14} />
        </ToggleIcon>
        <ToggleIcon active={view.snap} onClick={() => setView({ snap: !view.snap })} label="Snap magnético">
          <Magnet size={14} />
        </ToggleIcon>
        <Select
          ariaLabel="Zoom do preview"
          className="ml-1 w-24"
          value={String(view.previewZoom)}
          onChange={(v) => setView({ previewZoom: v === "fit" ? "fit" : Number(v) })}
          options={[
            { value: "fit", label: `Ajustar (${Math.round(fit * 100)}%)` },
            ...[0.25, 0.5, 0.75, 1, 1.5, 2].map((z) => ({ value: String(z), label: `${z * 100}%` })),
          ]}
        />
      </div>

      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-auto">
        <div className="flex min-h-full min-w-full items-center justify-center p-5" style={{ width: project.width * scale + 40, height: project.height * scale + 40 }}>
          <div className="checker relative shrink-0 shadow-2xl" style={{ width: project.width * scale, height: project.height * scale }}>
            <Player
              ref={setRef}
              component={MainComposition}
              inputProps={inputProps}
              durationInFrames={Math.max(1, duration)}
              compositionWidth={project.width}
              compositionHeight={project.height}
              fps={project.fps}
              style={{ width: "100%", height: "100%" }}
              clickToPlay={false}
              doubleClickToFullscreen={false}
              spaceKeyToPlayOrPause={false}
              moveToBeginningWhenEnded={false}
              bufferStateDelayInMilliseconds={300}
              acknowledgeRemotionLicense
            />
            <Guides scale={scale} />
            <TransformOverlay scale={scale} />
          </div>
        </div>
      </div>

      <Transport duration={duration} />
    </div>
  );
}

function ToggleIcon({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn("flex h-7 w-7 items-center justify-center rounded-md", active ? "bg-accent/20 text-accent" : "text-muted hover:bg-panel-3 hover:text-fg")}
    >
      {children}
    </button>
  );
}

function Transport({ duration }: { duration: number }) {
  const frame = useEditor((s) => s.frame);
  const playing = useEditor((s) => s.playing);
  const fps = useEditor((s) => s.project!.fps);
  const markers = useEditor((s) => s.project!.markers);
  const prevMarker = () => seek([...markers].reverse().find((m) => m.frame < frame)?.frame ?? 0);
  const nextMarker = () => seek(markers.find((m) => m.frame > frame)?.frame ?? duration);
  return (
    <div className="flex h-10 shrink-0 items-center justify-center gap-1 border-t border-line bg-panel px-3">
      <span className="w-28 font-mono text-[12px] text-fg">{timecode(frame, fps)}</span>
      <div className="flex-1" />
      <Button variant="ghost" size="icon" title="Início (Home)" onClick={() => seek(0)}>
        <ChevronFirst size={16} />
      </Button>
      <Button variant="ghost" size="icon" title="Marcador anterior" onClick={prevMarker}>
        <SkipBack size={14} />
      </Button>
      <Button variant="ghost" size="icon" title="Quadro anterior (←)" onClick={() => seek(frame - 1)}>
        <span className="text-[11px]">-1</span>
      </Button>
      <Button variant="primary" size="icon" className="h-8 w-8 rounded-full" title="Reproduzir/pausar (Espaço)" onClick={() => playerRef.current?.toggle()}>
        {playing ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
      </Button>
      <Button variant="ghost" size="icon" title="Próximo quadro (→)" onClick={() => seek(frame + 1)}>
        <span className="text-[11px]">+1</span>
      </Button>
      <Button variant="ghost" size="icon" title="Próximo marcador" onClick={nextMarker}>
        <SkipForward size={14} />
      </Button>
      <Button variant="ghost" size="icon" title="Fim (End)" onClick={() => seek(Math.max(0, duration - 1))}>
        <ChevronLast size={16} />
      </Button>
      <div className="flex-1" />
      <span className="w-28 text-right font-mono text-[12px] text-muted">{timecode(duration, fps)}</span>
    </div>
  );
}

function Guides({ scale }: { scale: number }) {
  const project = useEditor((s) => s.project)!;
  const view = useEditor((s) => s.view);
  const sz = getFormat(project.formatId).safeZone;
  const W = project.width * scale;
  const H = project.height * scale;
  return (
    <svg className="pointer-events-none absolute inset-0" width={W} height={H}>
      {view.grid &&
        Array.from({ length: 9 }, (_, i) => (
          <g key={i} stroke="rgba(255,255,255,0.18)" strokeWidth={1}>
            <line x1={((i + 1) * W) / 10} x2={((i + 1) * W) / 10} y1={0} y2={H} />
            <line y1={((i + 1) * H) / 10} y2={((i + 1) * H) / 10} x1={0} x2={W} />
          </g>
        ))}
      {view.thirds && (
        <g stroke="rgba(255,255,255,0.4)" strokeWidth={1}>
          <line x1={W / 3} x2={W / 3} y1={0} y2={H} />
          <line x1={(2 * W) / 3} x2={(2 * W) / 3} y1={0} y2={H} />
          <line y1={H / 3} y2={H / 3} x1={0} x2={W} />
          <line y1={(2 * H) / 3} y2={(2 * H) / 3} x1={0} x2={W} />
        </g>
      )}
      {view.safeArea && (
        <g>
          <path
            fillRule="evenodd"
            fill="rgba(236,72,153,0.10)"
            d={`M0 0H${W}V${H}H0Z M${sz.left * scale} ${sz.top * scale}V${H - sz.bottom * scale}H${W - sz.right * scale}V${sz.top * scale}Z`}
          />
          <rect
            x={sz.left * scale}
            y={sz.top * scale}
            width={W - (sz.left + sz.right) * scale}
            height={H - (sz.top + sz.bottom) * scale}
            fill="none"
            stroke="rgba(236,72,153,0.7)"
            strokeDasharray="6 4"
          />
        </g>
      )}
    </svg>
  );
}

type Handle = "move" | "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w" | "rotate";

/** Caixa de seleção sobre o preview: mover, redimensionar e girar o elemento. */
function TransformOverlay({ scale }: { scale: number }) {
  const project = useEditor((s) => s.project)!;
  const frame = useEditor((s) => s.frame);
  const selection = useEditor((s) => s.selection);
  const snapOn = useEditor((s) => s.view.snap);
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });

  const visibleAt = useCallback(
    (c: Clip) => c.type !== "audio" && frame >= c.start && frame < clipEnd(c),
    [frame],
  );

  const selected = selection.length === 1 ? findClip(project, selection[0]) : null;
  const sel = selected && visibleAt(selected.clip) && !selected.track.hidden ? selected : null;

  const startDrag = (e: React.PointerEvent, clipId: string, handle: Handle) => {
    e.stopPropagation();
    e.preventDefault();
    const st = useEditor.getState();
    const f0 = findClip(st.project!, clipId);
    if (!f0 || f0.track.locked) return;
    const clip0 = f0.clip;
    const local = st.frame - clip0.start;
    const a0 = getAnimatedState(clip0, local);
    const startX = e.clientX;
    const startY = e.clientY;
    const rect = (e.currentTarget as HTMLElement).closest("[data-overlay-root]")!.getBoundingClientRect();
    const P = st.project!;
    const sz = getFormat(P.formatId).safeZone;
    const xs = [0, P.width / 2, P.width, sz.left, P.width - sz.right];
    const ys = [0, P.height / 2, P.height, sz.top, P.height - sz.bottom];
    const thr = 8 / scale;
    st.beginGesture();

    const setProp = (c: Clip, prop: "x" | "y" | "rotation" | "scale", v: number) => {
      if (c.keyframes[prop]?.length) setKeyframe(c, prop, local, v);
      else c.transform[prop] = v;
    };

    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      const gx: number[] = [];
      const gy: number[] = [];
      useEditor.getState().gestureEdit((d) => {
        const c = findClip(d, clipId)!.clip;
        if (handle === "move") {
          let nx = a0.x + dx;
          let ny = a0.y + dy;
          if (snapOn && !ev.altKey) {
            // encaixa bordas e centro do elemento nas bordas, centro e área segura
            const w = a0.width;
            const h = a0.height;
            let best = thr;
            for (const t of xs)
              for (const off of [0, w / 2, w]) {
                const dist = Math.abs(nx + off - t);
                if (dist < best) {
                  best = dist;
                  nx = t - off;
                  gx.length = 0;
                  gx.push(t);
                }
              }
            best = thr;
            for (const t of ys)
              for (const off of [0, h / 2, h]) {
                const dist = Math.abs(ny + off - t);
                if (dist < best) {
                  best = dist;
                  ny = t - off;
                  gy.length = 0;
                  gy.push(t);
                }
              }
          }
          setProp(c, "x", Math.round(nx));
          setProp(c, "y", Math.round(ny));
        } else if (handle === "rotate") {
          const cx = rect.left + (a0.x + a0.width / 2) * scale;
          const cy = rect.top + (a0.y + a0.height / 2) * scale;
          let deg = (Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180) / Math.PI + 90;
          if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
          if (deg > 180) deg -= 360;
          setProp(c, "rotation", Math.round(deg * 10) / 10);
        } else {
          const s = a0.scale || 1;
          const ldx = dx / s;
          const ldy = dy / s;
          let { x, y, width: w, height: h } = { x: a0.x, y: a0.y, width: a0.width, height: a0.height };
          if (handle.includes("e")) w = a0.width + ldx;
          if (handle.includes("s")) h = a0.height + ldy;
          if (handle.includes("w")) {
            w = a0.width - ldx;
            x = a0.x + ldx;
          }
          if (handle.includes("n")) {
            h = a0.height - ldy;
            y = a0.y + ldy;
          }
          // cantos mantêm a proporção (Shift libera)
          if (handle.length === 2 && !ev.shiftKey) {
            const ratio = a0.width / a0.height;
            if (Math.abs(w - a0.width) / a0.width > Math.abs(h - a0.height) / a0.height) h = w / ratio;
            else w = h * ratio;
            if (handle.includes("w")) x = a0.x + a0.width - w;
            if (handle.includes("n")) y = a0.y + a0.height - h;
          }
          w = Math.max(8, w);
          h = Math.max(8, h);
          c.transform.width = Math.round(w);
          c.transform.height = Math.round(h);
          setProp(c, "x", Math.round(x));
          setProp(c, "y", Math.round(y));
        }
      });
      setGuides({ x: gx, y: gy });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      useEditor.getState().endGesture();
      setGuides({ x: [], y: [] });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  /** Clique no quadro: seleciona o elemento visível mais acima e já permite arrastá-lo. */
  const onRootPointerDown = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / scale;
    const py = (e.clientY - r.top) / scale;
    for (const t of project.tracks) {
      if (t.hidden || t.kind !== "visual") continue;
      const hit = [...t.clips].reverse().find((c) => {
        if (!visibleAt(c)) return false;
        const a = getAnimatedState(c, frame - c.start);
        const w = a.width * a.scale;
        const h = a.height * a.scale;
        const cx = a.x + a.width / 2;
        const cy = a.y + a.height / 2;
        return px >= cx - w / 2 && px <= cx + w / 2 && py >= cy - h / 2 && py <= cy + h / 2;
      });
      if (hit) {
        useEditor.getState().select([hit.id]);
        useEditor.getState().selectTrack(t.id);
        startDrag(e, hit.id, "move");
        return;
      }
    }
    useEditor.getState().select([]);
  };

  const a = sel ? getAnimatedState(sel.clip, frame - sel.clip.start) : null;
  const handles: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  const pos: Record<string, string> = {
    nw: "left-0 top-0 cursor-nwse-resize",
    n: "left-1/2 top-0 cursor-ns-resize",
    ne: "left-full top-0 cursor-nesw-resize",
    e: "left-full top-1/2 cursor-ew-resize",
    se: "left-full top-full cursor-nwse-resize",
    s: "left-1/2 top-full cursor-ns-resize",
    sw: "left-0 top-full cursor-nesw-resize",
    w: "left-0 top-1/2 cursor-ew-resize",
  };

  return (
    <div data-overlay-root className="absolute inset-0" onPointerDown={onRootPointerDown}>
      {sel && a && (
        <div
          className={cn("absolute border-2", sel.track.locked ? "border-muted" : "border-accent")}
          style={{
            left: a.x * scale,
            top: a.y * scale,
            width: a.width * scale,
            height: a.height * scale,
            transform: `rotate(${a.rotation}deg) scale(${a.scale})`,
            transformOrigin: "center",
            cursor: sel.track.locked ? "not-allowed" : "move",
          }}
          onPointerDown={(e) => startDrag(e, sel.clip.id, "move")}
          onDoubleClick={() => sel.clip.type === "text" && window.dispatchEvent(new CustomEvent("ms:focus-text"))}
        >
          {!sel.track.locked && (
            <>
              {handles.map((h) => (
                <span
                  key={h}
                  onPointerDown={(e) => startDrag(e, sel.clip.id, h)}
                  className={cn("absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border border-accent bg-white", pos[h])}
                  style={{ transform: `translate(-50%,-50%) scale(${1 / a.scale})` }}
                />
              ))}
              <span
                onPointerDown={(e) => startDrag(e, sel.clip.id, "rotate")}
                title="Girar (Shift: passos de 15°)"
                className="absolute left-1/2 -top-7 h-3 w-3 -translate-x-1/2 cursor-grab rounded-full border-2 border-accent bg-white"
              />
            </>
          )}
        </div>
      )}
      {guides.x.map((x) => (
        <div key={`x${x}`} className="pointer-events-none absolute top-0 bottom-0 w-px bg-accent-2" style={{ left: x * scale }} />
      ))}
      {guides.y.map((y) => (
        <div key={`y${y}`} className="pointer-events-none absolute right-0 left-0 h-px bg-accent-2" style={{ top: y * scale }} />
      ))}
    </div>
  );
}
