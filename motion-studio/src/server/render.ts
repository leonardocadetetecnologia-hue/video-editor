import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getAsset, getRender, getSettings, insertRender, updateRender } from "./db";
import { CACHE_DIR, ROOT, ensureDir } from "./paths";
import { uid } from "@/lib/model/defaults";
import { reformatProject } from "@/lib/model/ops";
import type { AssetRef, CompositionProps, ExportSettings, FormatId, Project } from "@/lib/model/types";

const EXT: Record<ExportSettings["codec"], string> = { h264: ".mp4", h265: ".mp4", vp9: ".webm", prores: ".mov" };

function safeName(s: string) {
  return s.replace(/[<>:"/\\|?*\x00-\x1f]/g, "").trim().slice(0, 80) || "video";
}

function collectAssets(project: Project): Record<string, AssetRef> {
  const assets: Record<string, AssetRef> = {};
  for (const t of project.tracks)
    for (const c of t.clips) {
      if (!("assetId" in c) || assets[c.assetId]) continue;
      const a = getAsset(c.assetId);
      if (a) assets[a.id] = { id: a.id, kind: a.kind, duration: a.duration, width: a.width, height: a.height, hasProxy: a.hasProxy };
    }
  return assets;
}

export function startRender(opts: {
  project: Project;
  kind: "video" | "still";
  formatId: FormatId;
  exportSettings: ExportSettings;
  frame?: number;
  baseUrl: string;
}): string {
  const project = structuredClone(opts.project);
  // Exportar em outro formato (ex.: projeto Reels → Feed 4:5) sem alterar o projeto salvo.
  if (opts.formatId !== project.formatId) reformatProject(project, opts.formatId);
  const id = uid("rnd_");
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const ext = opts.kind === "still" ? ".png" : EXT[opts.exportSettings.codec];
  const outputPath = path.join(ensureDir(getSettings().exportDir), `${safeName(project.name)}_${project.formatId}_${stamp}${opts.kind === "still" ? `_q${opts.frame ?? 0}` : ""}_${id.slice(-4)}${ext}`);
  const props: CompositionProps = { project, assets: collectAssets(project), mediaBaseUrl: opts.baseUrl, useProxies: false };
  insertRender({
    id,
    projectId: project.id,
    projectName: project.name,
    kind: opts.kind,
    props,
    options: { ...opts.exportSettings, outputPath, frame: opts.frame ?? 0 },
  });
  const logFile = path.join(ensureDir(path.join(CACHE_DIR, "render-logs")), `${id}.log`);
  const log = fs.openSync(logFile, "a");
  const child = spawn(process.execPath, [path.join(ROOT, "scripts", "render-worker.mjs"), id], {
    cwd: ROOT,
    stdio: ["ignore", log, log],
    windowsHide: true,
    detached: false,
  });
  updateRender(id, { pid: child.pid ?? null });
  child.on("exit", (code) => {
    fs.closeSync(log);
    const job = getRender(id);
    if (job && (job.status === "queued" || job.status === "rendering") && code !== 0) {
      updateRender(id, { status: "error", error: `O processo de renderização terminou inesperadamente (código ${code}). Veja ${logFile}` });
    }
  });
  return id;
}

export function cancelRender(id: string) {
  const job = getRender(id);
  if (!job) return;
  if (job.pid) {
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(job.pid), "/T", "/F"], { windowsHide: true });
    else
      try {
        process.kill(job.pid, "SIGTERM");
      } catch {}
  }
  updateRender(id, { status: "canceled", pid: null });
}
