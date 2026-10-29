import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const ROOT = process.cwd();
export const DATA_DIR = process.env.MOTION_STUDIO_DATA ?? path.join(ROOT, "data");
export const DB_PATH = path.join(DATA_DIR, "motion-studio.db");
export const CACHE_DIR = path.join(DATA_DIR, "cache");
export const DEFAULT_MEDIA_DIR = path.join(DATA_DIR, "media");
export const DEFAULT_EXPORT_DIR = path.join(DATA_DIR, "exports");

export function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Pasta com ffmpeg/ffprobe distribuídos junto do Remotion (sem instalação extra). */
function remotionBinDir(): string | null {
  const base = path.join(ROOT, "node_modules", "@remotion");
  try {
    const dir = fs.readdirSync(base).find((d) => d.startsWith("compositor-") && d.includes(process.platform === "win32" ? "win32" : process.platform));
    return dir ? path.join(base, dir) : null;
  } catch {
    return null;
  }
}

const exe = process.platform === "win32" ? ".exe" : "";
const resolved = new Map<string, string>();

function onSystemPath(name: string): string | null {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [name], { encoding: "utf8", windowsHide: true });
  const first = r.status === 0 ? r.stdout.split(/\r?\n/).find(Boolean) : null;
  return first ?? null;
}

/**
 * Ordem: variável de ambiente → FFmpeg completo instalado no sistema →
 * build reduzida que acompanha o Remotion (sempre presente).
 */
export function binPath(name: "ffmpeg" | "ffprobe"): string {
  const cached = resolved.get(name);
  if (cached) return cached;
  let found = process.env[name === "ffmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH"] || onSystemPath(name);
  if (!found) {
    const dir = remotionBinDir();
    const p = dir ? path.join(dir, name + exe) : null;
    found = p && fs.existsSync(p) ? p : name;
  }
  resolved.set(name, found);
  return found;
}
