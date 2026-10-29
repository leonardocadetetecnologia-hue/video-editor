import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getProject, listAssets, listProjects, saveProject } from "./db";
import { ROOT, ensureDir } from "./paths";
import { normalizeProject, type NormalizeContext } from "@/lib/model/normalize";
import type { Project } from "@/lib/model/types";

// Ponte de vibecoding: cada projeto tem um espelho JSON em vibe/projects/<id>.json.
// O Claude Code edita esse arquivo; o watcher valida, grava no banco e o editor
// aberto no navegador recarrega a prévia. O editor, por sua vez, publica em
// vibe/context.json o que está selecionado e onde está o cursor.

export const VIBE_DIR = path.join(ROOT, "vibe");
const PROJECTS_DIR = path.join(VIBE_DIR, "projects");

export interface VibeStatus {
  at: string;
  errors: string[];
  warnings: string[];
}

const g = globalThis as unknown as {
  __msVibe?: { watcher: fs.FSWatcher | null; hashes: Map<string, string>; status: Map<string, VibeStatus>; timers: Map<string, NodeJS.Timeout> };
};

function state() {
  if (!g.__msVibe) g.__msVibe = { watcher: null, hashes: new Map(), status: new Map(), timers: new Map() };
  return g.__msVibe;
}

const hash = (s: string) => createHash("sha1").update(s).digest("hex");

export function projectFile(id: string) {
  return path.join(PROJECTS_DIR, `${id}.json`);
}

function errorsFile(id: string) {
  return path.join(PROJECTS_DIR, `${id}.erros.txt`);
}

export function mirrorProject(p: Project) {
  ensureDir(PROJECTS_DIR);
  const text = JSON.stringify(p, null, 2) + "\n";
  const file = projectFile(p.id);
  // não reescreve se o conteúdo é o mesmo (evita disparar o watcher à toa)
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === text) return;
  state().hashes.set(p.id, hash(text));
  fs.writeFileSync(file, text);
}

export function removeMirror(id: string) {
  fs.rmSync(projectFile(id), { force: true });
  fs.rmSync(errorsFile(id), { force: true });
}

/** Grava vindo do editor/API e atualiza o espelho. */
export function saveAndMirror(p: Project, opts: { snapshot?: boolean } = {}): number {
  const rev = saveProject(p, opts);
  mirrorProject(p);
  return rev;
}

export function vibeStatus(id: string): VibeStatus | null {
  return state().status.get(id) ?? null;
}

export type ComponentCatalog = Record<
  string,
  { label: string; description: string; defaultSeconds: number; defaultBox?: [number, number, number, number]; defaultProps: Record<string, unknown>; propSpecs: Record<string, unknown> }
>;

const COMPONENTS_FILE = () => path.join(VIBE_DIR, "components.json");

/**
 * Catálogo de animações em código. Os componentes usam Remotion e não podem ser
 * importados nas rotas (ambiente de Server Components), então o editor publica o
 * catálogo; sem editor aberto, os ids são lidos do arquivo de registro.
 */
export function setComponentCatalog(catalog: ComponentCatalog) {
  ensureDir(VIBE_DIR);
  fs.writeFileSync(COMPONENTS_FILE(), JSON.stringify(catalog, null, 2) + "\n");
}

function componentCatalog(): NormalizeContext["components"] {
  const out: NormalizeContext["components"] = {};
  try {
    const cat = JSON.parse(fs.readFileSync(COMPONENTS_FILE(), "utf8")) as ComponentCatalog;
    for (const [id, d] of Object.entries(cat)) out[id] = { defaultSeconds: d.defaultSeconds, defaultBox: d.defaultBox };
  } catch {}
  try {
    const reg = fs.readFileSync(path.join(ROOT, "src", "remotion", "custom", "registry.ts"), "utf8");
    for (const m of reg.matchAll(/^\s*"([a-z0-9-]+)"\s*:/gm)) out[m[1]] ??= { defaultSeconds: 5 };
  } catch {}
  return out;
}

function normalizeContext(): NormalizeContext {
  const assets: NormalizeContext["assets"] = {};
  for (const a of listAssets()) assets[a.id] = { kind: a.kind, duration: a.duration };
  return { assets, components: componentCatalog() };
}

/** Importa uma edição externa do espelho JSON. */
export function importMirror(id: string): VibeStatus | null {
  const file = projectFile(id);
  if (!fs.existsSync(file)) return null;
  const text = fs.readFileSync(file, "utf8");
  const h = hash(text);
  const st = state();
  if (st.hashes.get(id) === h) return st.status.get(id) ?? null;
  st.hashes.set(id, h);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return report(id, [`JSON inválido: ${(e as Error).message}`], []);
  }
  const res = normalizeProject(parsed, normalizeContext(), id);
  if (!res.project) return report(id, res.errors, res.warnings);
  const current = getProject(id);
  if (!current || JSON.stringify(current) !== JSON.stringify(res.project)) saveProject(res.project, { snapshot: true });
  return report(id, [], res.warnings);
}

function report(id: string, errors: string[], warnings: string[]): VibeStatus {
  const status = { at: new Date().toISOString(), errors, warnings };
  state().status.set(id, status);
  if (errors.length) {
    fs.writeFileSync(errorsFile(id), `Edição rejeitada (${status.at}). Corrija e salve de novo:\n\n- ${errors.join("\n- ")}\n`);
    console.warn(`[vibe] ${id}: ${errors.join(" | ")}`);
  } else fs.rmSync(errorsFile(id), { force: true });
  return status;
}

/** Inicia (uma vez por processo) o espelhamento e a observação da pasta vibe/projects. */
export function ensureVibe() {
  const st = state();
  if (st.watcher) return;
  ensureDir(PROJECTS_DIR);
  writeAssetsIndex();
  for (const p of listProjects()) {
    if (!fs.existsSync(projectFile(p.id))) {
      const full = getProject(p.id);
      if (full) mirrorProject(full);
    } else {
      st.hashes.set(p.id, hash(fs.readFileSync(projectFile(p.id), "utf8")));
    }
  }
  st.watcher = fs.watch(PROJECTS_DIR, (_event, name) => {
    if (!name || !name.endsWith(".json")) return;
    const id = name.slice(0, -5);
    clearTimeout(st.timers.get(id));
    // espera o editor de texto terminar de gravar
    st.timers.set(
      id,
      setTimeout(() => {
        try {
          importMirror(id);
        } catch (e) {
          console.error("[vibe]", e);
        }
      }, 150),
    );
  });
}

/** Biblioteca de mídia resumida para o Claude Code escolher assetIds. */
export function writeAssetsIndex() {
  ensureDir(VIBE_DIR);
  const list = listAssets().map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind,
    durationSec: +a.duration.toFixed(3),
    size: a.width ? `${a.width}x${a.height}` : null,
    hasAudio: a.hasAudio,
  }));
  fs.writeFileSync(path.join(VIBE_DIR, "assets.json"), JSON.stringify(list, null, 2) + "\n");
}

export interface EditorContext {
  projectId: string;
  frame: number;
  selection: string[];
  playing: boolean;
}

/** Contexto do editor para o Claude saber "este clipe" e "aqui". */
export function writeContext(ctx: EditorContext) {
  ensureDir(VIBE_DIR);
  const p = getProject(ctx.projectId);
  if (!p) return;
  const selected = p.tracks.flatMap((t) =>
    t.clips
      .filter((c) => ctx.selection.includes(c.id))
      .map((c) => ({
        id: c.id,
        type: c.type,
        name: c.name,
        track: t.name,
        startSec: +(c.start / p.fps).toFixed(3),
        durationSec: +(c.duration / p.fps).toFixed(3),
        ...(c.type === "text" ? { text: c.text } : {}),
        ...(c.type === "component" ? { componentId: c.componentId } : {}),
      })),
  );
  const out = {
    updatedAt: new Date().toISOString(),
    projectId: p.id,
    projectName: p.name,
    projectFile: path.relative(ROOT, projectFile(p.id)).replace(/\\/g, "/"),
    format: p.formatId,
    size: `${p.width}x${p.height}`,
    fps: p.fps,
    cursor: { frame: ctx.frame, sec: +(ctx.frame / p.fps).toFixed(3) },
    playing: ctx.playing,
    selectedClips: selected,
  };
  fs.writeFileSync(path.join(VIBE_DIR, "context.json"), JSON.stringify(out, null, 2) + "\n");
  writeAssetsIndex();
}
