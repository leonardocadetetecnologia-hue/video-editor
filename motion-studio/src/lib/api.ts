import type { Asset, ExportSettings, FormatId, Project, SavedStyle, VideoPreset } from "./model/types";

export interface AppSettings {
  onboardingDone: boolean;
  defaultPresetId: string | null;
  mediaDir: string;
  exportDir: string;
  useProxies: boolean;
  autosaveSeconds: number;
  keymap: Record<string, string>;
}

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

export interface VibeStatus {
  at: string;
  errors: string[];
  warnings: string[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  formatId: FormatId;
  createdAt: string;
  updatedAt: string;
  thumbAssetId: string | null;
}

export interface RenderJob {
  id: string;
  projectId: string;
  projectName: string;
  kind: "video" | "still";
  status: "queued" | "rendering" | "done" | "error" | "canceled";
  progress: number;
  stage: string | null;
  outputPath: string | null;
  error: string | null;
  createdAt: string;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {}
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  settings: () => req<AppSettings>("/api/settings"),
  updateSettings: (patch: Partial<AppSettings>) => req<AppSettings>("/api/settings", jsonInit("PUT", patch)),

  presets: () => req<VideoPreset[]>("/api/presets"),
  savePreset: (preset: VideoPreset, makeDefault = false) => req<VideoPreset>("/api/presets", jsonInit("POST", { preset, makeDefault })),
  deletePreset: (id: string) => req(`/api/presets/${id}`, { method: "DELETE" }),

  styles: () => req<SavedStyle[]>("/api/styles"),
  saveStyle: (s: SavedStyle) => req<SavedStyle>("/api/styles", jsonInit("POST", s)),
  deleteStyle: (id: string) => req(`/api/styles/${id}`, { method: "DELETE" }),

  projects: () => req<ProjectSummary[]>("/api/projects"),
  project: async (id: string) => {
    const res = await fetch(`/api/projects/${id}`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? `Projeto não encontrado (${res.status})`);
    return { project: (await res.json()) as Project, revision: Number(res.headers.get("X-Revision") ?? 1) };
  },
  revision: (id: string) => req<{ revision: number; vibe: VibeStatus | null }>(`/api/projects/${id}/revision`),
  postContext: (ctx: { projectId: string; frame: number; selection: string[]; playing: boolean }) =>
    fetch("/api/vibe/context", jsonInit("POST", ctx)).catch(() => undefined),
  createProject: (body: { name: string; formatId: FormatId; presetId: string | null }) => req<Project>("/api/projects", jsonInit("POST", body)),
  saveProject: (p: Project, keepalive = false) => req<{ savedAt: string; revision: number }>(`/api/projects/${p.id}`, { ...jsonInit("PUT", p), keepalive }),
  deleteProject: (id: string) => req(`/api/projects/${id}`, { method: "DELETE" }),
  snapshots: (id: string) => req<{ id: number; created_at: string; size: number }[]>(`/api/projects/${id}/snapshots`),
  snapshot: (id: string, snap: number) => req<Project>(`/api/projects/${id}/snapshots?snap=${snap}`),

  assets: () => req<Asset[]>("/api/media"),
  uploadAsset: (file: File, onProgress?: (p: number) => void) =>
    new Promise<Asset>((resolve, reject) => {
      // XHR para ter progresso de envio; o servidor grava em streaming.
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/media");
      xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) resolve(data);
          else reject(new Error(data.error ?? `Falha no envio (${xhr.status})`));
        } catch {
          reject(new Error(`Falha no envio (${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error("Falha de rede no envio"));
      xhr.send(file);
    }),
  renameAsset: (id: string, name: string) => req<Asset>(`/api/media/${id}`, jsonInit("PATCH", { name })),
  deleteAsset: (id: string) => req(`/api/media/${id}`, { method: "DELETE" }),
  makeProxy: (id: string) => req<Asset>(`/api/media/${id}/proxy`, { method: "POST" }),
  reverseAsset: (id: string) => req<Asset>(`/api/media/${id}/reverse`, { method: "POST" }),
  waveform: (id: string) => req<{ peaksPerSecond: number; peaks: number[] }>(`/api/media/${id}/waveform`),

  renders: (projectId?: string) => req<RenderJob[]>(`/api/render${projectId ? `?projectId=${projectId}` : ""}`),
  render: (id: string) => req<RenderJob>(`/api/render/${id}`),
  startRender: (body: { projectId: string; project: Project; kind: "video" | "still"; formatId: FormatId; exportSettings: ExportSettings; frame?: number }) =>
    req<{ id: string }>("/api/render", jsonInit("POST", body)),
  cancelRender: (id: string) => req(`/api/render/${id}`, { method: "DELETE" }),
  aiStatus: () => req<{ whisperReady: boolean; model: string }>("/api/ai/jobs"),
  startAiJob: (kind: AiJobKind, assetId: string) => req<AiJob>("/api/ai/jobs", jsonInit("POST", { kind, assetId })),
  aiJob: (id: string) => req<AiJob>(`/api/ai/jobs/${id}`),
  system: () => req<{ ffmpeg: string; ffmpegPath: string; dataDir: string; node: string }>("/api/system"),
};
