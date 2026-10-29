import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { CACHE_DIR, binPath, ensureDir } from "./paths";
import type { AssetKind } from "@/lib/model/types";

export function run(bin: "ffmpeg" | "ffprobe", args: string[]): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(binPath(bin), args, { windowsHide: true });
    const out: Buffer[] = [];
    let err = "";
    p.stdout.on("data", (d: Buffer) => out.push(d));
    p.stderr.on("data", (d: Buffer) => {
      err += d.toString();
      if (err.length > 20000) err = err.slice(-20000);
    });
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve({ stdout: Buffer.concat(out), stderr: err });
      else reject(new Error(`${bin} saiu com código ${code}: ${err.slice(-600)}`));
    });
  });
}

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif", ".tif", ".tiff"]);
const AUDIO_EXT = new Set([".mp3", ".wav", ".aac", ".m4a", ".ogg", ".flac", ".opus", ".wma"]);

export const MIME: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".opus": "audio/ogg",
};

export function mimeFor(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

export interface ProbeResult {
  kind: AssetKind;
  duration: number;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
  /** Codec de vídeo; usado para decidir se o navegador consegue reproduzir direto. */
  videoCodec: string | null;
}

function parseRate(r: string | undefined): number {
  if (!r) return 0;
  const [a, b] = r.split("/").map(Number);
  return b ? a / b : a || 0;
}

/** Dimensões de WebP lidas do cabeçalho (a build reduzida do FFmpeg não decodifica WebP). */
function webpSize(file: string): { width: number; height: number } | null {
  const fd = fs.openSync(file, "r");
  const b = Buffer.alloc(30);
  fs.readSync(fd, b, 0, 30, 0);
  fs.closeSync(fd);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  if (chunk === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
  }
  return null;
}

export async function probe(file: string): Promise<ProbeResult> {
  const ext0 = path.extname(file).toLowerCase();
  if (ext0 === ".webp") {
    const s = webpSize(file);
    if (s) return { kind: "image", duration: 0, ...s, fps: 0, hasAudio: false, videoCodec: null };
  }
  const { stdout } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  const info = JSON.parse(stdout.toString()) as {
    format?: { duration?: string };
    streams?: { codec_type: string; codec_name?: string; width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string; duration?: string; disposition?: { attached_pic?: number }; tags?: { rotate?: string }; side_data_list?: { rotation?: number }[] }[];
  };
  const streams = info.streams ?? [];
  const ext = path.extname(file).toLowerCase();
  const v = streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  const a = streams.find((s) => s.codec_type === "audio");
  const duration = Number(info.format?.duration ?? v?.duration ?? a?.duration ?? 0) || 0;
  let kind: AssetKind;
  if (IMAGE_EXT.has(ext) || (v && duration < 0.05 && !a)) kind = "image";
  else if (v) kind = "video";
  else if (a || AUDIO_EXT.has(ext)) kind = "audio";
  else throw new Error("Formato não reconhecido: o arquivo não contém vídeo, áudio ou imagem.");
  let width = v?.width ?? 0;
  let height = v?.height ?? 0;
  // vídeos de celular gravados em pé vêm com metadado de rotação
  const rot = Math.abs(Number(v?.tags?.rotate ?? v?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0));
  if (rot === 90 || rot === 270) [width, height] = [height, width];
  return {
    kind,
    duration: kind === "image" ? 0 : duration,
    width,
    height,
    fps: v ? Math.round(parseRate(v.avg_frame_rate) || parseRate(v.r_frame_rate) || 30) : 0,
    hasAudio: Boolean(a),
    videoCodec: v?.codec_name ?? null,
  };
}

export function thumbPath(id: string) {
  return path.join(ensureDir(path.join(CACHE_DIR, "thumbs")), `${id}.jpg`);
}

export async function makeThumbnail(id: string, file: string, kind: AssetKind, duration: number) {
  if (kind === "audio") return;
  const out = thumbPath(id);
  const seek = kind === "video" ? Math.min(1, duration / 3) : 0;
  const args = ["-y", "-v", "error"];
  if (seek > 0) args.push("-ss", seek.toFixed(2));
  args.push("-i", file, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "4", out);
  await run("ffmpeg", args);
}

/**
 * Decodifica o áudio para PCM s16le. Sai como WAV (a build reduzida não tem o
 * muxer s16le) e devolve apenas o conteúdo do bloco "data".
 */
async function decodePcm(file: string, channels: number, rate: number): Promise<Buffer> {
  const { stdout } = await run("ffmpeg", ["-v", "error", "-i", file, "-vn", "-ac", String(channels), "-ar", String(rate), "-acodec", "pcm_s16le", "-f", "wav", "-"]);
  let off = 12;
  while (off + 8 <= stdout.length) {
    const id = stdout.toString("ascii", off, off + 4);
    const size = stdout.readUInt32LE(off + 4);
    if (id === "data") {
      const data = stdout.subarray(off + 8);
      const frameBytes = channels * 2;
      return data.subarray(0, data.length - (data.length % frameBytes));
    }
    off += 8 + size + (size % 2);
  }
  return Buffer.alloc(0);
}

export const WAVEFORM_PEAKS_PER_SECOND = 40;

export async function getWaveform(id: string, file: string): Promise<{ peaksPerSecond: number; peaks: number[] }> {
  const cache = path.join(ensureDir(path.join(CACHE_DIR, "waveforms")), `${id}.json`);
  if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, "utf8"));
  const rate = 4000;
  const pcm = Buffer.from(await decodePcm(file, 1, rate)); // cópia alinhada
  const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2);
  const bucket = rate / WAVEFORM_PEAKS_PER_SECOND;
  const peaks: number[] = [];
  for (let i = 0; i < samples.length; i += bucket) {
    let max = 0;
    const end = Math.min(samples.length, i + bucket);
    for (let j = i; j < end; j++) {
      const v = Math.abs(samples[j]);
      if (v > max) max = v;
    }
    peaks.push(Math.round((max / 32768) * 100) / 100);
  }
  const result = { peaksPerSecond: WAVEFORM_PEAKS_PER_SECOND, peaks };
  fs.writeFileSync(cache, JSON.stringify(result));
  return result;
}

/** Proxy leve (720p, H.264) para o preview fluir com arquivos 4K/pesados. */
export async function makeProxy(id: string, file: string): Promise<string> {
  const out = path.join(ensureDir(path.join(CACHE_DIR, "proxies")), `${id}.mp4`);
  await run("ffmpeg", [
    "-y", "-v", "error", "-i", file,
    "-vf", "scale='min(1280,iw)':-2",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-g", "15",
    "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out,
  ]);
  return out;
}

/**
 * Versão invertida da mídia (vídeo e áudio de trás para frente).
 * Não depende dos filtros reverse/areverse (ausentes na build do Remotion):
 * os quadros vão para disco e são regravados em ordem inversa; o áudio PCM
 * é invertido em memória. Funciona com qualquer duração sem estourar a RAM no vídeo.
 */
export async function makeReversed(file: string, out: string, opts: { hasVideo: boolean; hasAudio: boolean; fps: number }) {
  const tmp = ensureDir(path.join(CACHE_DIR, `rev_${Date.now().toString(36)}`));
  const RATE = 48000;
  try {
    let frames = 0;
    if (opts.hasVideo) {
      await run("ffmpeg", ["-y", "-v", "error", "-i", file, "-an", "-q:v", "2", path.join(tmp, "f_%07d.jpg")]);
      const list = fs.readdirSync(tmp).filter((f) => f.startsWith("f_")).sort();
      frames = list.length;
      list.forEach((f, i) => fs.renameSync(path.join(tmp, f), path.join(tmp, `r_${String(frames - i).padStart(7, "0")}.jpg`)));
    }
    const rawOut = path.join(tmp, "rev.raw");
    if (opts.hasAudio) {
      const pcm = await decodePcm(file, 2, RATE);
      const src = new Int32Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
      src.reverse(); // cada Int32 = uma amostra estéreo (2 × s16)
      fs.writeFileSync(rawOut, Buffer.from(src.buffer));
    }
    const args = ["-y", "-v", "error"];
    if (opts.hasVideo) args.push("-framerate", String(opts.fps || 30), "-i", path.join(tmp, "r_%07d.jpg"));
    if (opts.hasAudio) args.push("-f", "s16le", "-ar", String(RATE), "-ac", "2", "-i", rawOut);
    if (opts.hasVideo) args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p");
    if (opts.hasAudio) args.push("-c:a", "aac", "-b:a", "192k");
    // contêiner MP4 explícito: .m4a é MP4, mas a build reduzida não reconhece a extensão
    args.push("-movflags", "+faststart", "-f", "mp4", out);
    await run("ffmpeg", args);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Codecs que o Chromium reproduz direto; outros (ex.: ProRes, HEVC em alguns PCs) precisam de proxy. */
export function browserPlayable(codec: string | null): boolean {
  if (!codec) return true;
  return ["h264", "vp8", "vp9", "av1"].includes(codec);
}
