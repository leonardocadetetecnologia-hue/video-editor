import React from "react";
import {
  AbsoluteFill,
  Audio,
  Freeze,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { filtersToCss, getAnimatedState, getTransitionEffect } from "../lib/model/animation";
import type { AssetRef, Clip, ComponentClip, CompositionProps, MediaClip, ShapeClip, TextClip, Track } from "../lib/model/types";
import { CUSTOM_COMPONENTS } from "./custom/registry";

// Composição principal: interpreta o modelo canônico do projeto.
// Usada pelo Remotion Player (preview) e pelo renderizador (exportação).

function mediaUrl(props: CompositionProps, asset: AssetRef | undefined, id: string): string {
  const useProxy = props.useProxies && asset?.kind === "video" && asset.hasProxy;
  return `${props.mediaBaseUrl}/api/media/${id}/${useProxy ? "proxy" : "file"}`;
}

function audioVolume(clip: MediaClip, trackMuted: boolean) {
  return (f: number) => {
    if (trackMuted) return 0;
    let v = clip.volume;
    if (clip.audioFadeIn > 0) v *= interpolate(f, [0, clip.audioFadeIn], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    if (clip.audioFadeOut > 0)
      v *= interpolate(f, [clip.duration - clip.audioFadeOut, clip.duration], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return Math.max(0, Math.min(2, v));
  };
}

const MediaContent: React.FC<{ clip: MediaClip; props: CompositionProps; trackMuted: boolean }> = ({ clip, props, trackMuted }) => {
  const asset = props.assets[clip.assetId];
  const src = mediaUrl(props, asset, clip.assetId);
  const style: React.CSSProperties = { width: "100%", height: "100%", objectFit: clip.fit };
  if (!asset) {
    return (
      <AbsoluteFill style={{ background: "#3a1020", color: "#fff", alignItems: "center", justifyContent: "center", fontSize: 32 }}>
        Mídia ausente
      </AbsoluteFill>
    );
  }
  if (clip.type === "image") return <Img src={src} style={style} />;
  if (clip.type === "video") {
    const video = (
      <OffthreadVideo
        src={src}
        trimBefore={clip.trimStart || undefined}
        playbackRate={clip.speed}
        muted={clip.freeze || clip.videoMuted || trackMuted}
        volume={audioVolume(clip, trackMuted)}
        style={style}
        pauseWhenBuffering
      />
    );
    return clip.freeze ? <Freeze frame={0}>{video}</Freeze> : video;
  }
  return null;
};

const TextContent: React.FC<{ clip: TextClip }> = ({ clip }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = clip.style;
  let text = s.uppercase ? clip.text.toUpperCase() : clip.text;
  let opacity = 1;
  let translateY = 0;
  let scale = 1;
  switch (s.animation) {
    case "fade":
      opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: "clamp" });
      break;
    case "slide-up":
      opacity = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
      translateY = interpolate(frame, [0, 14], [60, 0], { extrapolateRight: "clamp" });
      break;
    case "pop":
      scale = spring({ frame, fps, config: { damping: 12, stiffness: 180 } });
      break;
    case "bounce":
      scale = spring({ frame, fps, config: { damping: 5, stiffness: 160 } });
      break;
    case "typewriter": {
      const total = Math.max(1, Math.min(clip.duration * 0.7, text.length * 2));
      const n = Math.round(interpolate(frame, [0, total], [0, text.length], { extrapolateRight: "clamp" }));
      text = text.slice(0, n);
      break;
    }
  }
  const justify = s.align === "left" ? "flex-start" : s.align === "right" ? "flex-end" : "center";
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: justify, display: "flex", flexDirection: "row" }}>
      <div
        style={{
          fontFamily: `"${s.fontFamily}", "Segoe UI", Arial, sans-serif`,
          fontSize: s.fontSize,
          fontWeight: s.fontWeight,
          fontStyle: s.italic ? "italic" : "normal",
          color: s.color,
          textAlign: s.align,
          lineHeight: s.lineHeight,
          letterSpacing: s.letterSpacing,
          background: s.background ?? "transparent",
          padding: s.background ? s.padding : 0,
          borderRadius: s.borderRadius,
          WebkitTextStroke: s.strokeWidth > 0 ? `${s.strokeWidth}px ${s.strokeColor}` : undefined,
          paintOrder: "stroke fill",
          textShadow: s.shadow ? `0 6px 24px ${s.shadowColor}, 0 2px 4px ${s.shadowColor}` : "none",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxWidth: "100%",
          opacity,
          transform: `translateY(${translateY}px) scale(${scale})`,
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
};

const ShapeContent: React.FC<{ clip: ShapeClip }> = ({ clip }) => (
  <div
    style={{
      width: "100%",
      height: "100%",
      background: clip.fill,
      borderRadius: clip.shape === "ellipse" ? "50%" : clip.radius,
      border: clip.strokeWidth > 0 ? `${clip.strokeWidth}px solid ${clip.strokeColor}` : undefined,
      boxSizing: "border-box",
    }}
  />
);

/** Animação em código: props do clipe sobre os padrões do componente. */
const CustomContent: React.FC<{ clip: ComponentClip }> = ({ clip }) => {
  const def = CUSTOM_COMPONENTS[clip.componentId];
  if (!def) {
    return (
      <AbsoluteFill style={{ background: "#3a1020", color: "#fff", alignItems: "center", justifyContent: "center", fontSize: 32 }}>
        Animação “{clip.componentId}” não encontrada
      </AbsoluteFill>
    );
  }
  const C = def.component;
  return <C {...def.defaultProps} {...clip.props} />;
};

const VisualLayer: React.FC<{ clip: Clip; props: CompositionProps; trackMuted: boolean }> = ({ clip, props, trackMuted }) => {
  const frame = useCurrentFrame();
  const { width, height } = props.project;
  const st = getAnimatedState(clip, frame);
  const fx = getTransitionEffect(clip, frame, width, height);
  return (
    <div
      style={{
        position: "absolute",
        left: st.x + fx.translateX,
        top: st.y + fx.translateY,
        width: st.width,
        height: st.height,
        transform: `rotate(${st.rotation}deg) scale(${st.scale * fx.scale})`,
        transformOrigin: "center center",
        opacity: Math.max(0, Math.min(1, st.opacity * fx.opacity)),
        filter: filtersToCss(clip.filters, fx.blur),
        clipPath: fx.clipPath,
        overflow: clip.type === "text" || clip.type === "component" ? "visible" : "hidden",
      }}
    >
      {clip.type === "text" ? (
        <TextContent clip={clip} />
      ) : clip.type === "shape" ? (
        <ShapeContent clip={clip} />
      ) : clip.type === "component" ? (
        <CustomContent clip={clip} />
      ) : (
        <MediaContent clip={clip} props={props} trackMuted={trackMuted} />
      )}
    </div>
  );
};

const AudioLayer: React.FC<{ clip: MediaClip; props: CompositionProps; trackMuted: boolean }> = ({ clip, props, trackMuted }) => (
  <Audio
    src={mediaUrl(props, props.assets[clip.assetId], clip.assetId)}
    trimBefore={clip.trimStart || undefined}
    playbackRate={clip.speed}
    volume={audioVolume(clip, trackMuted)}
    muted={trackMuted}
    pauseWhenBuffering
  />
);

const TrackLayer: React.FC<{ track: Track; props: CompositionProps }> = ({ track, props }) => {
  if (track.hidden) return null;
  return (
    <>
      {track.clips.map((clip) => (
        <Sequence key={clip.id} from={clip.start} durationInFrames={Math.max(1, clip.duration)} layout="none" name={clip.name}>
          {clip.type === "audio" ? (
            <AudioLayer clip={clip} props={props} trackMuted={track.muted} />
          ) : (
            <VisualLayer clip={clip} props={props} trackMuted={track.muted} />
          )}
        </Sequence>
      ))}
    </>
  );
};

export const MainComposition: React.FC<CompositionProps> = (props) => {
  const { project } = props;
  // A primeira faixa da lista fica por cima: desenhamos de baixo para cima.
  const ordered = [...project.tracks].reverse();
  return (
    <AbsoluteFill style={{ background: project.backgroundColor, overflow: "hidden" }}>
      {ordered.map((t) => (
        <TrackLayer key={t.id} track={t} props={props} />
      ))}
    </AbsoluteFill>
  );
};
