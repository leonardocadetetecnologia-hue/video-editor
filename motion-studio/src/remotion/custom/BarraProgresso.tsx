import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { CustomComponentDef } from "./types";

interface Props {
  segments: number;
  color: string;
  track: string;
  thickness: number;
}

/** Barras de progresso no estilo Stories, preenchidas ao longo do clipe. */
const BarraProgresso: React.FC<Props> = ({ segments, color, track, thickness }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const total = Math.max(1, Math.round(segments));
  const progress = (frame / Math.max(1, durationInFrames - 1)) * total;
  return (
    <AbsoluteFill style={{ flexDirection: "row", gap: thickness, padding: thickness }}>
      {Array.from({ length: total }, (_, i) => {
        const fill = Math.min(1, Math.max(0, progress - i));
        return (
          <div key={i} style={{ flex: 1, height: thickness, borderRadius: thickness, background: track, overflow: "hidden" }}>
            <div style={{ width: `${fill * 100}%`, height: "100%", background: color }} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

export const barraProgresso: CustomComponentDef = {
  label: "Barra de progresso (Stories)",
  description: "Segmentos que se preenchem durante o clipe, como nos Stories.",
  component: BarraProgresso,
  defaultProps: { segments: 3, color: "#ffffff", track: "rgba(255,255,255,0.35)", thickness: 8 },
  propSpecs: {
    segments: { kind: "number", label: "Segmentos", min: 1, max: 20, step: 1 },
    color: { kind: "color", label: "Cor" },
    track: { kind: "text", label: "Cor do fundo" },
    thickness: { kind: "number", label: "Espessura", min: 2, max: 40, step: 1 },
  },
  defaultSeconds: 5,
  defaultBox: [0.03, 0.02, 0.94, 0.03],
};
