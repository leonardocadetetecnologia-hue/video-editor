import React from "react";
import { AbsoluteFill, random, useCurrentFrame, useVideoConfig } from "remotion";
import type { CustomComponentDef } from "./types";

interface Props {
  count: number;
  colors: string;
  gravity: number;
  seed: string;
}

/** Explosão de confete a partir do centro; determinística (mesma prévia e render). */
const Confete: React.FC<Props> = ({ count, colors, gravity, seed }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const palette = colors.split(",").map((c) => c.trim()).filter(Boolean);
  const t = frame / fps;
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      {Array.from({ length: Math.round(count) }, (_, i) => {
        const angle = random(`${seed}-a-${i}`) * Math.PI * 2;
        const speed = 500 + random(`${seed}-s-${i}`) * 900;
        const x = width / 2 + Math.cos(angle) * speed * t;
        const y = height * 0.45 + Math.sin(angle) * speed * t + 0.5 * gravity * t * t;
        const spin = (random(`${seed}-r-${i}`) - 0.5) * 1440 * t;
        const size = 14 + random(`${seed}-z-${i}`) * 18;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size,
              height: size * 0.55,
              background: palette[i % palette.length] ?? "#ffffff",
              borderRadius: 3,
              transform: `rotate(${spin}deg)`,
              opacity: Math.max(0, 1 - t / 3),
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

export const confete: CustomComponentDef = {
  label: "Confete",
  description: "Explosão de confete colorido a partir do centro.",
  component: Confete,
  defaultProps: { count: 140, colors: "#ec4899, #8b5cf6, #facc15, #22c55e, #0ea5e9", gravity: 1400, seed: "confete" },
  propSpecs: {
    count: { kind: "number", label: "Quantidade", min: 10, max: 400, step: 10 },
    colors: { kind: "text", label: "Cores (vírgula)" },
    gravity: { kind: "number", label: "Gravidade", min: 0, max: 4000, step: 100 },
    seed: { kind: "text", label: "Variação" },
  },
  defaultSeconds: 3,
};
