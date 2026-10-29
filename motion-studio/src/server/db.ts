import { DatabaseSync } from "node:sqlite";
import { DB_PATH, DATA_DIR, DEFAULT_EXPORT_DIR, DEFAULT_MEDIA_DIR, ensureDir } from "./paths";
import type { Asset, Project, SavedStyle, VideoPreset } from "@/lib/model/types";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  format_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS project_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snap_project ON project_snapshots(project_id, id);
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  duration REAL NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  fps REAL NOT NULL,
  has_audio INTEGER NOT NULL,
  path TEXT NOT NULL,
  proxy_path TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS styles (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS renders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  project_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  stage TEXT,
  output_path TEXT,
  error TEXT,
  pid INTEGER,
  props TEXT NOT NULL,
  options TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

const g = globalThis as unknown as { __msDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (!g.__msDb) {
    ensureDir(DATA_DIR);
    const d = new DatabaseSync(DB_PATH);
    d.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
    d.exec(SCHEMA);
    // migração: contador de revisão para detectar edições externas (vibecoding)
    const cols = d.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
    if (!cols.some((c) => c.name === "revision")) d.exec("ALTER TABLE projects ADD COLUMN revision INTEGER NOT NULL DEFAULT 1");
    g.__msDb = d;
  }
  return g.__msDb;
}

export const now = () => new Date().toISOString();

// ---------- Configurações ----------

export interface AppSettings {
  onboardingDone: boolean;
  defaultPresetId: string | null;
  mediaDir: string;
  exportDir: string;
  useProxies: boolean;
  autosaveSeconds: number;
  keymap: Record<string, string>;
}

const DEFAULT_SETTINGS: AppSettings = {
  onboardingDone: false,
  defaultPresetId: null,
  mediaDir: DEFAULT_MEDIA_DIR,
  exportDir: DEFAULT_EXPORT_DIR,
  useProxies: true,
  autosaveSeconds: 2,
  keymap: {},
};

export function getSettings(): AppSettings {
  const rows = db().prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = JSON.parse(r.value);
  return s as unknown as AppSettings;
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const stmt = db().prepare("INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  for (const [k, v] of Object.entries(patch)) {
    if (k in DEFAULT_SETTINGS) stmt.run(k, JSON.stringify(v));
  }
  return getSettings();
}

// ---------- Projetos ----------

export interface ProjectSummary {
  id: string;
  name: string;
  formatId: string;
  createdAt: string;
  updatedAt: string;
  thumbAssetId: string | null;
}

export function listProjects(): ProjectSummary[] {
  const rows = db().prepare("SELECT id, name, format_id, data, created_at, updated_at FROM projects ORDER BY updated_at DESC").all() as Record<string, string>[];
  return rows.map((r) => {
    let thumbAssetId: string | null = null;
    try {
      const p = JSON.parse(r.data) as Project;
      for (const t of p.tracks) {
        const c = t.clips.find((c) => c.type === "video" || c.type === "image");
        if (c && "assetId" in c) {
          thumbAssetId = c.assetId;
          break;
        }
      }
    } catch {}
    return { id: r.id, name: r.name, formatId: r.format_id, createdAt: r.created_at, updatedAt: r.updated_at, thumbAssetId };
  });
}

export function getProject(id: string): Project | null {
  const row = db().prepare("SELECT data FROM projects WHERE id = ?").get(id) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as Project) : null;
}

const SNAPSHOT_INTERVAL_MS = 2 * 60 * 1000;
const SNAPSHOTS_KEPT = 30;

export function getRevision(id: string): number | null {
  const row = db().prepare("SELECT revision FROM projects WHERE id = ?").get(id) as { revision: number } | undefined;
  return row ? Number(row.revision) : null;
}

/** Salva e devolve a nova revisão (cada gravação incrementa o contador). */
export function saveProject(p: Project, opts: { snapshot?: boolean } = {}): number {
  const d = db();
  const ts = now();
  const data = JSON.stringify(p);
  d.prepare(
    `INSERT INTO projects(id, name, format_id, data, created_at, updated_at, revision) VALUES(?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name, format_id = excluded.format_id, data = excluded.data,
       updated_at = excluded.updated_at, revision = projects.revision + 1`,
  ).run(p.id, p.name, p.formatId, data, ts, ts);
  // Versões para recuperação: no máximo uma a cada 2 minutos.
  const last = d.prepare("SELECT created_at FROM project_snapshots WHERE project_id = ? ORDER BY id DESC LIMIT 1").get(p.id) as
    | { created_at: string }
    | undefined;
  if (opts.snapshot || !last || Date.now() - Date.parse(last.created_at) > SNAPSHOT_INTERVAL_MS) {
    d.prepare("INSERT INTO project_snapshots(project_id, data, created_at) VALUES(?, ?, ?)").run(p.id, data, ts);
    d.prepare(
      `DELETE FROM project_snapshots WHERE project_id = ? AND id NOT IN
       (SELECT id FROM project_snapshots WHERE project_id = ? ORDER BY id DESC LIMIT ?)`,
    ).run(p.id, p.id, SNAPSHOTS_KEPT);
  }
  return getRevision(p.id) ?? 1;
}

export function deleteProject(id: string) {
  db().prepare("DELETE FROM projects WHERE id = ?").run(id);
  db().prepare("DELETE FROM project_snapshots WHERE project_id = ?").run(id);
}

export function listSnapshots(projectId: string) {
  return db()
    .prepare("SELECT id, created_at, length(data) AS size FROM project_snapshots WHERE project_id = ? ORDER BY id DESC")
    .all(projectId) as { id: number; created_at: string; size: number }[];
}

export function getSnapshot(projectId: string, snapId: number): Project | null {
  const row = db().prepare("SELECT data FROM project_snapshots WHERE project_id = ? AND id = ?").get(projectId, snapId) as
    | { data: string }
    | undefined;
  return row ? (JSON.parse(row.data) as Project) : null;
}

// ---------- Mídia ----------

export interface AssetRow extends Asset {
  path: string;
  proxyPath: string | null;
}

function rowToAsset(r: Record<string, unknown>): AssetRow {
  return {
    id: r.id as string,
    name: r.name as string,
    kind: r.kind as Asset["kind"],
    mime: r.mime as string,
    size: Number(r.size),
    duration: Number(r.duration),
    width: Number(r.width),
    height: Number(r.height),
    fps: Number(r.fps),
    hasAudio: Boolean(r.has_audio),
    hasProxy: Boolean(r.proxy_path),
    createdAt: r.created_at as string,
    path: r.path as string,
    proxyPath: (r.proxy_path as string) ?? null,
  };
}

export function publicAsset(a: AssetRow): Asset {
  const { path: _p, proxyPath: _pp, ...rest } = a;
  return rest;
}

export function listAssets(): AssetRow[] {
  return (db().prepare("SELECT * FROM assets ORDER BY created_at DESC").all() as Record<string, unknown>[]).map(rowToAsset);
}

export function getAsset(id: string): AssetRow | null {
  const r = db().prepare("SELECT * FROM assets WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? rowToAsset(r) : null;
}

export function insertAsset(a: AssetRow) {
  db()
    .prepare(
      `INSERT INTO assets(id, name, kind, mime, size, duration, width, height, fps, has_audio, path, proxy_path, created_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(a.id, a.name, a.kind, a.mime, a.size, a.duration, a.width, a.height, a.fps, a.hasAudio ? 1 : 0, a.path, a.proxyPath, a.createdAt);
}

export function setAssetProxy(id: string, proxyPath: string | null) {
  db().prepare("UPDATE assets SET proxy_path = ? WHERE id = ?").run(proxyPath, id);
}

export function renameAsset(id: string, name: string) {
  db().prepare("UPDATE assets SET name = ? WHERE id = ?").run(name, id);
}

export function deleteAssetRow(id: string) {
  db().prepare("DELETE FROM assets WHERE id = ?").run(id);
}

// ---------- Presets e estilos ----------

export function listPresets(): VideoPreset[] {
  return (db().prepare("SELECT data FROM presets ORDER BY updated_at DESC").all() as { data: string }[]).map((r) => JSON.parse(r.data));
}

export function getPreset(id: string): VideoPreset | null {
  const r = db().prepare("SELECT data FROM presets WHERE id = ?").get(id) as { data: string } | undefined;
  return r ? JSON.parse(r.data) : null;
}

export function savePreset(p: VideoPreset) {
  db()
    .prepare(
      `INSERT INTO presets(id, name, data, updated_at) VALUES(?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data, updated_at = excluded.updated_at`,
    )
    .run(p.id, p.name, JSON.stringify(p), now());
}

export function deletePreset(id: string) {
  db().prepare("DELETE FROM presets WHERE id = ?").run(id);
  const s = getSettings();
  if (s.defaultPresetId === id) updateSettings({ defaultPresetId: null });
}

export function listStyles(): SavedStyle[] {
  return (db().prepare("SELECT id, kind, name, data FROM styles ORDER BY created_at DESC").all() as Record<string, string>[]).map((r) => ({
    id: r.id,
    kind: r.kind as SavedStyle["kind"],
    name: r.name,
    data: JSON.parse(r.data),
  }));
}

export function saveStyle(s: SavedStyle) {
  db()
    .prepare(
      `INSERT INTO styles(id, kind, name, data, created_at) VALUES(?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, data = excluded.data`,
    )
    .run(s.id, s.kind, s.name, JSON.stringify(s.data), now());
}

export function deleteStyle(id: string) {
  db().prepare("DELETE FROM styles WHERE id = ?").run(id);
}

// ---------- Renderizações ----------

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
  updatedAt: string;
}

function rowToJob(r: Record<string, unknown>): RenderJob {
  return {
    id: r.id as string,
    projectId: r.project_id as string,
    projectName: r.project_name as string,
    kind: r.kind as RenderJob["kind"],
    status: r.status as RenderJob["status"],
    progress: Number(r.progress),
    stage: (r.stage as string) ?? null,
    outputPath: (r.output_path as string) ?? null,
    error: (r.error as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function insertRender(job: { id: string; projectId: string; projectName: string; kind: string; props: unknown; options: unknown }) {
  const ts = now();
  db()
    .prepare(
      `INSERT INTO renders(id, project_id, project_name, kind, status, progress, props, options, created_at, updated_at)
       VALUES(?, ?, ?, ?, 'queued', 0, ?, ?, ?, ?)`,
    )
    .run(job.id, job.projectId, job.projectName, job.kind, JSON.stringify(job.props), JSON.stringify(job.options), ts, ts);
}

export function listRenders(projectId?: string): RenderJob[] {
  const rows = projectId
    ? db().prepare("SELECT * FROM renders WHERE project_id = ? ORDER BY created_at DESC LIMIT 50").all(projectId)
    : db().prepare("SELECT * FROM renders ORDER BY created_at DESC LIMIT 50").all();
  return (rows as Record<string, unknown>[]).map(rowToJob);
}

export function getRender(id: string): (RenderJob & { pid: number | null }) | null {
  const r = db().prepare("SELECT * FROM renders WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  return r ? { ...rowToJob(r), pid: r.pid ? Number(r.pid) : null } : null;
}

export function updateRender(id: string, patch: { status?: string; error?: string | null; pid?: number | null }) {
  const sets: string[] = [];
  const vals: (string | number | null)[] = [];
  for (const [k, v] of Object.entries(patch)) {
    sets.push(`${k} = ?`);
    vals.push(v as string | number | null);
  }
  sets.push("updated_at = ?");
  vals.push(now());
  db()
    .prepare(`UPDATE renders SET ${sets.join(", ")} WHERE id = ?`)
    .run(...vals, id);
}
