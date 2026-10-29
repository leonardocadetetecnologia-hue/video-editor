import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CustomComponentDef } from "./types";

interface Props {
  from: number;
  color: string;
  ring: string;
  label: string;
}

/** Contagem regressiva com anel de progresso; um número por segundo. */
const ContagemRegressiva: React.FC<Props> = ({ from, color, ring, label }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const second = Math.floor(frame / fps);
  const n = Math.max(0, from - second);
  const within = (frame % fps) / fps;
  const pop = spring({ frame: frame % fps, fps, config: { damping: 10, stiffness: 200 } });
  const size = Math.min(width, height) * 0.5;
  const r = size / 2 - 14;
  const circ = 2 * Math.PI * r;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 24 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.15)" strokeWidth={14} fill="none" />
          <circle cx={size / 2} cy={size / 2} r={r} stroke={ring} strokeWidth={14} fill="none" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * within} />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: '"Arial Black", sans-serif',
            fontSize: size * 0.45,
            color,
            transform: `scale(${interpolate(pop, [0, 1], [1.4, 1])})`,
          }}
        >
          {n}
        </div>
      </div>
      {label && <div style={{ fontFamily: '"Segoe UI", sans-serif', fontWeight: 700, fontSize: size * 0.12, color, letterSpacing: 4 }}>{label}</div>}
    </AbsoluteFill>
  );
};

export const contagemRegressiva: CustomComponentDef = {
  label: "Contagem regressiva",
  description: "Números com anel de progresso, um por segundo.",
  component: ContagemRegressiva,
  defaultProps: { from: 3, color: "#ffffff", ring: "#8b5cf6", label: "COMEÇA EM" },
  propSpecs: {
    from: { kind: "number", label: "Começar em", min: 1, max: 60, step: 1 },
    color: { kind: "color", label: "Cor" },
    ring: { kind: "color", label: "Anel" },
    label: { kind: "text", label: "Legenda" },
  },
  defaultSeconds: 3,
};
