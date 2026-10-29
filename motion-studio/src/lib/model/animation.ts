import type { AnimProp, Clip, Easing, Filters, Keyframe, Transform } from "./types";

// Cálculo puro de valores animados. Usado pelo preview, pela sobreposição de
// transformação e pelo render final, garantindo o mesmo resultado em todos.

function ease(t: number, easing: Easing): number {
  switch (easing) {
    case "ease-in":
      return t * t;
    case "ease-out":
      return 1 - (1 - t) * (1 - t);
    case "ease-in-out":
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    default:
      return t;
  }
}

export function sampleKeyframes(kfs: Keyframe[] | undefined, frame: number, fallback: number): number {
  if (!kfs || kfs.length === 0) return fallback;
  const sorted = kfs.length > 1 ? [...kfs].sort((a, b) => a.frame - b.frame) : kfs;
  if (frame <= sorted[0].frame) return sorted[0].value;
  const last = sorted[sorted.length - 1];
  if (frame >= last.frame) return last.value;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (frame >= a.frame && frame <= b.frame) {
      const t = b.frame === a.frame ? 1 : (frame - a.frame) / (b.frame - a.frame);
      return a.value + (b.value - a.value) * ease(t, a.easing);
    }
  }
  return last.value;
}

export interface AnimatedState {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  rotation: number;
  opacity: number;
}

export function baseValue(clip: Clip, prop: AnimProp): number {
  if (prop === "opacity") return clip.opacity;
  return clip.transform[prop as keyof Transform];
}

/** Estado animado do clipe num quadro relativo ao seu início (sem transições). */
export function getAnimatedState(clip: Clip, localFrame: number): AnimatedState {
  const k = clip.keyframes;
  return {
    x: sampleKeyframes(k.x, localFrame, clip.transform.x),
    y: sampleKeyframes(k.y, localFrame, clip.transform.y),
    width: clip.transform.width,
    height: clip.transform.height,
    scale: sampleKeyframes(k.scale, localFrame, clip.transform.scale),
    rotation: sampleKeyframes(k.rotation, localFrame, clip.transform.rotation),
    opacity: sampleKeyframes(k.opacity, localFrame, clip.opacity),
  };
}

export function filtersToCss(f: Filters, extraBlur = 0): string {
  const parts: string[] = [];
  if (f.brightness !== 1) parts.push(`brightness(${f.brightness})`);
  if (f.contrast !== 1) parts.push(`contrast(${f.contrast})`);
  if (f.saturation !== 1) parts.push(`saturate(${f.saturation})`);
  if (f.hue !== 0) parts.push(`hue-rotate(${f.hue}deg)`);
  if (f.grayscale > 0) parts.push(`grayscale(${f.grayscale})`);
  if (f.sepia > 0) parts.push(`sepia(${f.sepia})`);
  const blur = f.blur + extraBlur;
  if (blur > 0) parts.push(`blur(${blur}px)`);
  return parts.length ? parts.join(" ") : "none";
}

export interface TransitionEffect {
  opacity: number;
  translateX: number;
  translateY: number;
  scale: number;
  blur: number;
  clipPath: string | undefined;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Efeito combinado das transições de entrada e saída num quadro local. */
export function getTransitionEffect(clip: Clip, localFrame: number, compW: number, compH: number): TransitionEffect {
  const fx: TransitionEffect = { opacity: 1, translateX: 0, translateY: 0, scale: 1, blur: 0, clipPath: undefined };
  const apply = (type: string, p: number, entering: boolean) => {
    // p: 0 = invisível, 1 = totalmente presente
    const inv = 1 - ease(p, "ease-out");
    switch (type) {
      case "fade":
      case "dissolve":
        fx.opacity *= p;
        break;
      case "slide-left":
        fx.translateX += (entering ? compW : -compW) * inv;
        break;
      case "slide-right":
        fx.translateX += (entering ? -compW : compW) * inv;
        break;
      case "slide-up":
        fx.translateY += (entering ? compH : -compH) * inv;
        break;
      case "slide-down":
        fx.translateY += (entering ? -compH : compH) * inv;
        break;
      case "zoom-in":
        fx.scale *= 0.6 + 0.4 * ease(p, "ease-out");
        fx.opacity *= p;
        break;
      case "zoom-out":
        fx.scale *= 1 + 0.5 * inv;
        fx.opacity *= p;
        break;
      case "wipe-left":
        fx.clipPath = `inset(0 ${(1 - p) * 100}% 0 0)`;
        break;
      case "wipe-right":
        fx.clipPath = `inset(0 0 0 ${(1 - p) * 100}%)`;
        break;
      case "blur":
        fx.blur += 30 * inv;
        fx.opacity *= p;
        break;
    }
  };
  const tin = clip.transitionIn;
  if (tin && tin.duration > 0 && localFrame < tin.duration) {
    apply(tin.type, clamp01(localFrame / tin.duration), true);
  }
  const tout = clip.transitionOut;
  if (tout && tout.duration > 0 && localFrame >= clip.duration - tout.duration) {
    apply(tout.type, clamp01((clip.duration - localFrame) / tout.duration), false);
  }
  return fx;
}
