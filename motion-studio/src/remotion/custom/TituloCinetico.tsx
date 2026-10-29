import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { CustomComponentDef } from "./types";

interface Props {
  text: string;
  color: string;
  accent: string;
  fontSize: number;
  stagger: number;
}

/** Tipografia cinética: cada palavra entra com mola, alternando a cor de destaque. */
const TituloCinetico: React.FC<Props> = ({ text, color, accent, fontSize, stagger }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "row", flexWrap: "wrap", gap: fontSize * 0.25, padding: 40 }}>
      {words.map((w, i) => {
        const s = spring({ frame: frame - i * stagger, fps, config: { damping: 11, stiffness: 170 } });
        const y = interpolate(s, [0, 1], [fontSize * 0.9, 0]);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              fontFamily: '"Arial Black", "Segoe UI", sans-serif',
              fontWeight: 900,
              fontSize,
              lineHeight: 1.05,
              color: i % 2 === 1 ? accent : color,
              transform: `translateY(${y}px) scale(${0.6 + 0.4 * s})`,
              opacity: s,
              textShadow: "0 8px 30px rgba(0,0,0,0.45)",
            }}
          >
            {w}
          </span>
        );
      })}
    </AbsoluteFill>
  );
};

export const tituloCinetico: CustomComponentDef = {
  label: "Título cinético",
  description: "Palavras entram uma a uma com efeito de mola, alternando cores.",
  component: TituloCinetico,
  defaultProps: { text: "SEU TÍTULO AQUI", color: "#ffffff", accent: "#ec4899", fontSize: 120, stagger: 5 },
  propSpecs: {
    text: { kind: "text", label: "Texto" },
    color: { kind: "color", label: "Cor" },
    accent: { kind: "color", label: "Destaque" },
    fontSize: { kind: "number", label: "Tamanho", min: 20, max: 400, step: 2 },
    stagger: { kind: "number", label: "Intervalo (quadros)", min: 0, max: 30, step: 1 },
  },
  defaultSeconds: 4,
};
