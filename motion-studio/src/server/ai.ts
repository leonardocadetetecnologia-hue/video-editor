import fs from "node:fs";
import path from "node:path";
import { downloadWhisperModel, installWhisperCpp, toCaptions, transcribe, type WhisperModel } from "@remotion/install-whisper-cpp";
import type { Caption } from "@remotion/captions";
import { getAsset, type AssetRow } from "./db";
import { run } from "./media";
import { CACHE_DIR, DATA_DIR, ensureDir } from "./paths";
import { VIBE_DIR } from "./vibe";
import { uid } from "@/lib/model/defaults";

// IA local e gratuita: transcrição (whisper.cpp), detecção de silêncio (FFmpeg) e
// quadros-chave para o Claude Code "assistir" ao vídeo. Nada sai do computador.

export const WHISPER_VERSION = "1.5.5"; // versão testada pelo Remotion no Windows
export const WHISPER_MODEL: WhisperModel = "small";
const WHISPER_DIR = path.join(DATA_DIR, "tools", `whisper-${WHISPER_VERSION}`);

export type AiJobKind = "transcribe" | "silences" | "analyze";

export interface AiJob {
  id: string;
  kind: AiJobKind;
  assetId: string;
  status: "running" | "done" | "error";
  progress: number;
  stage: string;
  error: string | null;
  result: unknown;
}

const g = globalThis as unknown as { __msAiJobs?: Map<string, AiJob> };
const jobs = () => (g.__msAiJobs ??= new Map());

export function getAiJob(id: string) {
  return jobs().get(id) ?? null;
}

// mesma regra do pacote para versões < 1.7.4: binário "main" na raiz (main.exe no Windows)
const whisperExe = () => path.join(WHISPER_DIR, process.platform === "win32" ? "main.exe" : "main");

export function whisperReady() {
  return fs.existsSync(whisperExe()) && fs.existsSync(path.join(WHISPER_DIR, `ggml-${WHISPER_MODEL}.bin`));
}

async function ensureWhisper(job: AiJob) {
  if (whisperReady()) return;
  job.stage = "Instalando a IA de transcrição (apenas na primeira vez)…";
  // instalação interrompida antes: recomeça do zero
  if (fs.existsSync(WHISPER_DIR) && !fs.existsSync(whisperExe())) fs.rmSync(WHISPER_DIR, { recursive: true, force: true });
  await installWhisperCpp({ version: WHISPER_VERSION, to: WHISPER_DIR, printOutput: false });
  await downloadWhisperModel({
    model: WHISPER_MODEL,
    folder: WHISPER_DIR,
    printOutput: false,
    onProgress: (done, total) => {
      job.stage = `Baixando modelo de transcrição… ${Math.round((done / total) * 100)}%`;
    },
  });
}

export interface Transcript {
  language: string;
  /** Legendas palavra a palavra, em ms do arquivo de origem. */
  captions: Caption[];
}

/** Trecho de fala do original e onde ele começa no áudio compactado (sem pausas). */
interface SpeechSegment {
  origStart: number;
  origEnd: number;
  compStart: number;
}

const SEGMENT_GAP = 0.3; // respiro entre trechos para o Whisper separar as frases

/**
 * Trechos com fala (complemento dos silêncios). O Whisper erra os tempos perto de
 * pausas longas, então transcrevemos só a fala, colada, e remapeamos os tempos.
 */
function speechSegments(silences: SilenceRange[], duration: number): SpeechSegment[] {
  const pad = 0.15;
  const segs: SpeechSegment[] = [];
  let cursor = 0;
  let comp = 0;
  const push = (s: number, e: number) => {
    s = Math.max(0, s - pad);
    e = Math.min(duration, e + pad);
    const prev = segs[segs.length - 1];
    if (prev && s <= prev.origEnd) {
      comp += e - prev.origEnd;
      prev.origEnd = e;
      return;
    }
    if (e - s < 0.05) return;
    segs.push({ origStart: s, origEnd: e, compStart: comp });
    comp += e - s + SEGMENT_GAP;
  };
  for (const sil of silences) {
    if (sil.startSec > cursor) push(cursor, sil.startSec);
    cursor = Math.max(cursor, sil.endSec);
  }
  if (cursor < duration) push(cursor, duration);
  return segs;
}

function segmentAt(segs: SpeechSegment[], ms: number): SpeechSegment {
  let seg = segs[0];
  for (const s of segs) if (s.compStart <= ms / 1000) seg = s;
  return seg;
}

function compToOrigMs(segs: SpeechSegment[], ms: number, within = segmentAt(segs, ms)): number {
  const t = ms / 1000;
  return Math.round(Math.min(within.origEnd, within.origStart + Math.max(0, t - within.compStart)) * 1000);
}

export async function transcribeAsset(a: AssetRow, job: AiJob): Promise<Transcript> {
  const cache = path.join(ensureDir(path.join(CACHE_DIR, "transcripts")), `${a.id}.v2.json`);
  if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, "utf8"));
  if (a.kind === "image" || !a.hasAudio) return { language: "pt", captions: [] };
  await ensureWhisper(job);
  job.stage = "Preparando áudio…";
  const wav = path.join(ensureDir(path.join(CACHE_DIR, "tmp")), `${a.id}-16k.wav`);
  const silences = await detectSilences(a, -35, 0.6);
  const segs = silences.length ? speechSegments(silences, a.duration) : [];
  try {
    if (segs.length) {
      // só a fala, com um pequeno respiro entre os trechos
      const parts = segs.map((s, i) => `[0:a]atrim=start=${s.origStart.toFixed(3)}:end=${s.origEnd.toFixed(3)},asetpts=PTS-STARTPTS,apad=pad_dur=${SEGMENT_GAP}[s${i}]`);
      const graph = `${parts.join(";")};${segs.map((_, i) => `[s${i}]`).join("")}concat=n=${segs.length}:v=0:a=1[out]`;
      await run("ffmpeg", ["-y", "-v", "error", "-i", a.path, "-filter_complex", graph, "-map", "[out]", "-ac", "1", "-ar", "16000", "-acodec", "pcm_s16le", "-f", "wav", wav]);
    } else {
      await run("ffmpeg", ["-y", "-v", "error", "-i", a.path, "-vn", "-ac", "1", "-ar", "16000", "-acodec", "pcm_s16le", "-f", "wav", wav]);
    }
    job.stage = "Transcrevendo fala…";
    const out = await transcribe({
      inputPath: wav,
      whisperPath: WHISPER_DIR,
      whisperCppVersion: WHISPER_VERSION,
      model: WHISPER_MODEL,
      modelFolder: WHISPER_DIR,
      tokenLevelTimestamps: true,
      language: "pt",
      splitOnWord: true,
      printOutput: false,
      onProgress: (p) => {
        job.progress = p;
        job.stage = `Transcrevendo fala… ${Math.round(p * 100)}%`;
      },
    });
    const { captions } = toCaptions({ whisperCppOutput: out });
    const mapped = captions
      .filter((c) => c.text.trim())
      .map((c) => {
        if (!segs.length) return c;
        // fim da palavra limitado ao trecho de fala onde ela começa (não atravessa pausas)
        const seg = segmentAt(segs, c.startMs);
        const startMs = compToOrigMs(segs, c.startMs, seg);
        const endMs = Math.max(startMs + 80, Math.min(compToOrigMs(segs, c.endMs), Math.round(seg.origEnd * 1000)));
        return { ...c, startMs, endMs, timestampMs: c.timestampMs === null ? null : compToOrigMs(segs, c.timestampMs, seg) };
      });
    const result: Transcript = { language: out.result.language, captions: mapped };
    fs.writeFileSync(cache, JSON.stringify(result));
    return result;
  } finally {
    fs.rmSync(wav, { force: true });
  }
}

export interface SilenceRange {
  startSec: number;
  endSec: number;
}

/** Trechos em silêncio (em segundos do arquivo de origem). */
export async function detectSilences(a: AssetRow, noiseDb = -35, minSec = 0.4): Promise<SilenceRange[]> {
  if (!a.hasAudio && a.kind !== "audio") return [];
  const { stderr } = await run("ffmpeg", ["-v", "info", "-hide_banner", "-nostats", "-i", a.path, "-vn", "-af", `silencedetect=noise=${noiseDb}dB:d=${minSec}`, "-f", "null", "-"]);
  const out: SilenceRange[] = [];
  let start: number | null = null;
  for (const line of stderr.split(/\r?\n/)) {
    const s = /silence_start: (-?[\d.]+)/.exec(line);
    if (s) start = Math.max(0, Number(s[1]));
    const e = /silence_end: ([\d.]+)/.exec(line);
    if (e && start !== null) {
      out.push({ startSec: +start.toFixed(3), endSec: +Number(e[1]).toFixed(3) });
      start = null;
    }
  }
  if (start !== null && a.duration > start) out.push({ startSec: +start.toFixed(3), endSec: +a.duration.toFixed(3) });
  return out;
}

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${(sec % 60).toFixed(1).padStart(4, "0")}`;

/**
 * Pacote para o Claude Code entender a mídia: quadros-chave, transcrição e
 * silêncios em vibe/analysis/<assetId>/, com um resumo.md legível.
 */
async function analyzeAsset(a: AssetRow, job: AiJob) {
  const dir = ensureDir(path.join(VIBE_DIR, "analysis", a.id));
  const framesDir = path.join(dir, "frames");
  fs.rmSync(framesDir, { recursive: true, force: true });
  const frames: { sec: number; file: string }[] = [];
  if (a.kind !== "audio") {
    ensureDir(framesDir);
    const count = a.kind === "image" ? 1 : Math.min(40, Math.max(4, Math.ceil(a.duration / 1.5)));
    for (let i = 0; i < count; i++) {
      const sec = a.kind === "image" ? 0 : +((a.duration * (i + 0.5)) / count).toFixed(2);
      const file = `t${String(sec.toFixed(1)).padStart(6, "0")}s.jpg`;
      job.stage = `Extraindo quadros-chave… ${i + 1}/${count}`;
      job.progress = (i / count) * 0.3;
      const args = ["-y", "-v", "error"];
      if (sec > 0) args.push("-ss", String(sec));
      args.push("-i", a.path, "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "5", path.join(framesDir, file));
      try {
        await run("ffmpeg", args);
        frames.push({ sec, file: `frames/${file}` });
      } catch {}
    }
  }
  job.stage = "Detectando silêncios…";
  const silences = await detectSilences(a);
  const transcript = await transcribeAsset(a, job);
  fs.writeFileSync(path.join(dir, "silences.json"), JSON.stringify(silences, null, 2));
  fs.writeFileSync(path.join(dir, "transcript.json"), JSON.stringify(transcript, null, 2));

  // frases: junta palavras até uma pausa > 0,6 s ou pontuação final
  const phrases: { start: number; end: number; text: string }[] = [];
  for (const c of transcript.captions) {
    const last = phrases[phrases.length - 1];
    if (last && c.startMs / 1000 - last.end < 0.6 && !/[.!?]$/.test(last.text)) {
      last.text += c.text;
      last.end = c.endMs / 1000;
    } else phrases.push({ start: c.startMs / 1000, end: c.endMs / 1000, text: c.text.trim() });
  }
  const md = [
    `# Análise de mídia: ${a.name}`,
    "",
    `- assetId: \`${a.id}\` · tipo: ${a.kind} · duração: ${a.duration.toFixed(2)} s${a.width ? ` · ${a.width}×${a.height}` : ""} · áudio: ${a.hasAudio ? "sim" : "não"}`,
    `- Gerado em ${new Date().toLocaleString("pt-BR")}`,
    "",
    "## Fala (transcrição automática, pode conter erros)",
    "",
    ...(phrases.length ? phrases.map((p) => `- [${fmt(p.start)}–${fmt(p.end)}] ${p.text.trim()}`) : ["(sem fala detectada)"]),
    "",
    "## Silêncios (> 0,4 s, abaixo de -35 dB)",
    "",
    ...(silences.length ? silences.map((s) => `- ${fmt(s.startSec)}–${fmt(s.endSec)} (${(s.endSec - s.startSec).toFixed(1)} s)`) : ["(nenhum)"]),
    "",
    "## Quadros-chave (abra as imagens para ver o conteúdo)",
    "",
    ...(frames.length ? frames.map((f) => `- ${fmt(f.sec)} → ${f.file}`) : ["(mídia sem imagem)"]),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(dir, "resumo.md"), md);
  return { dir: path.relative(path.dirname(VIBE_DIR), dir).replace(/\\/g, "/"), frames: frames.length, phrases: phrases.length, silences: silences.length };
}

export function startAiJob(kind: AiJobKind, assetId: string): AiJob {
  const a = getAsset(assetId);
  if (!a) throw new Error("Mídia não encontrada");
  // reaproveita um job igual em andamento
  for (const j of jobs().values()) if (j.kind === kind && j.assetId === assetId && j.status === "running") return j;
  const job: AiJob = { id: uid("ai_"), kind, assetId, status: "running", progress: 0, stage: "Iniciando…", error: null, result: null };
  jobs().set(job.id, job);
  const work = kind === "transcribe" ? transcribeAsset(a, job) : kind === "silences" ? detectSilences(a) : analyzeAsset(a, job);
  work
    .then((result) => Object.assign(job, { status: "done", progress: 1, stage: "Concluído", result }))
    .catch((e: Error) => {
      console.error("[ia]", e);
      Object.assign(job, { status: "error", error: e.message.slice(0, 1000), stage: "Falhou" });
    });
  return job;
}
