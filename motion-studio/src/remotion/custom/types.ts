import type React from "react";

export type PropKind = "text" | "number" | "color" | "boolean";

export interface CustomPropSpec {
  kind: PropKind;
  label: string;
  min?: number;
  max?: number;
  step?: number;
}

/**
 * Animação em código disponível na aba "Animações" e no vibecoding.
 * O componente recebe `props` e desenha dentro da caixa do clipe
 * (useCurrentFrame() começa em 0 no início do clipe).
 */
export interface CustomComponentDef {
  label: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: React.FC<any>;
  defaultProps: Record<string, unknown>;
  /** Descrição dos props para o painel de propriedades. */
  propSpecs: Record<string, CustomPropSpec>;
  defaultSeconds: number;
  /** Caixa inicial em frações do quadro [x, y, largura, altura]; omitida = quadro inteiro. */
  defaultBox?: [number, number, number, number];
}
