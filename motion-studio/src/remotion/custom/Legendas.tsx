import React, { useMemo } from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import type { CustomComponentDef } from "./types";

interface Props {
  /** Palavras com tempo em ms relativos ao início deste clipe (geradas pela IA; editáveis). */
  captions: Caption[];
  wordsTogetherMs: number;
  fontSize: number;
  color: string;
  highlight: string;
  strokeColor: string;
  strokeWidth: number;
  uppercase: boolean;
  fontFamily: string;
}

/** Legendas animadas estilo Reels/TikTok: poucas palavras por vez, palavra falada em destaque. */
const Legendas: React.FC<Props> = ({ captions, wordsTogetherMs, fontSize, color, highlight, strokeColor, strokeWidth, uppercase, fontFamily }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { pages } = useMemo(
    () => createTikTokStyleCaptions({ captions: captions ?? [], combineTokensWithinMilliseconds: wordsTogetherMs }),
    [captions, wordsTogetherMs],
  );
  const ms = (frame / fps) * 1000;
  const page = pages.find((p, i) => ms >= p.startMs && ms < (pages[i + 1]?.startMs ?? p.startMs + p.durationMs));
  if (!page || ms > page.startMs + page.durationMs + 400) return null;
  const pop = spring({ frame: frame - Math.round((page.startMs / 1000) * fps), fps, config: { damping: 14, stiffness: 220 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          fontFamily: `"${fontFamily}", "Segoe UI", sans-serif`,
          fontWeight: 900,
          fontSize,
          lineHeight: 1.1,
          textAlign: "center",
          whiteSpace: "pre-wrap",
          transform: `scale(${0.85 + 0.15 * pop})`,
          WebkitTextStroke: strokeWidth > 0 ? `${strokeWidth}px ${strokeColor}` : undefined,
          paintOrder: "stroke fill",
          textShadow: "0 6px 18px rgba(0,0,0,0.5)",
          textTransform: uppercase ? "uppercase" : "none",
        }}
      >
        {page.tokens.map((t, i) => {
          const active = ms >= t.fromMs && ms < t.toMs;
          return (
            <span key={i} style={{ color: active ? highlight : color }}>
              {t.text}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

export const legendas: CustomComponentDef = {
  label: "Legendas automáticas",
  description: "Legendas estilo Reels com a palavra falada em destaque. Geradas pela IA a partir da fala do vídeo.",
  component: Legendas,
  defaultProps: {
    captions: [],
    wordsTogetherMs: 900,
    fontSize: 78,
    color: "#ffffff",
    highlight: "#facc15",
    strokeColor: "#000000",
    strokeWidth: 8,
    uppercase: true,
    fontFamily: "Arial Black",
  },
  propSpecs: {
    wordsTogetherMs: { kind: "number", label: "Agrupar palavras (ms)", min: 0, max: 3000, step: 100 },
    fontSize: { kind: "number", label: "Tamanho", min: 20, max: 200, step: 2 },
    color: { kind: "color", label: "Cor" },
    highlight: { kind: "color", label: "Destaque" },
    strokeColor: { kind: "color", label: "Contorno" },
    strokeWidth: { kind: "number", label: "Espessura contorno", min: 0, max: 20, step: 1 },
    uppercase: { kind: "boolean", label: "Maiúsculas" },
    fontFamily: { kind: "text", label: "Fonte" },
  },
  defaultSeconds: 5,
  // terço inferior, acima da área de legenda/botões do Reels
  defaultBox: [0.06, 0.58, 0.88, 0.16],
};
