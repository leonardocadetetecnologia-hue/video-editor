// Worker de renderização: roda em processo separado do servidor web.
// Uso: node scripts/render-worker.mjs <renderId>
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, renderStill, selectComposition } from "@remotion/renderer";

const ROOT = process.cwd();
const DATA_DIR = process.env.MOTION_STUDIO_DATA ?? path.join(ROOT, "data");
const renderId = process.argv[2];

const db = new DatabaseSync(path.join(DATA_DIR, "motion-studio.db"));
db.exec("PRAGMA busy_timeout = 5000;");

let lastWrite = 0;
function update(fields, force = false) {
  const t = Date.now();
  if (!force && t - lastWrite < 400) return;
  lastWrite = t;
  const keys = Object.keys(fields);
  db.prepare(`UPDATE renders SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ?`).run(
    ...keys.map((k) => fields[k]),
    new Date().toISOString(),
    renderId,
  );
}

function newestMtime(dir) {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(p) : fs.statSync(p).mtimeMs);
  }
  return newest;
}

/**
 * Reaproveita o bundle da composição enquanto o código-fonte não mudar.
 * Cada versão do código tem sua pasta; o bundle é montado numa pasta temporária
 * e renomeado no fim, então renders simultâneos não se atrapalham.
 */
async function getBundle() {
  const cacheDir = path.join(DATA_DIR, "cache");
  const sources = [path.join(ROOT, "src", "remotion"), path.join(ROOT, "src", "lib", "model")];
  const stamp = String(Math.max(...sources.map(newestMtime)));
  const outDir = path.join(cacheDir, `remotion-bundle-${stamp}`);
  if (fs.existsSync(path.join(outDir, "index.html"))) return outDir;
  update({ stage: "Preparando composição…" }, true);
  const tmpDir = `${outDir}.tmp-${process.pid}`;
  await bundle({
    entryPoint: path.join(ROOT, "src", "remotion", "index.ts"),
    outDir: tmpDir,
    onProgress: (p) => update({ stage: `Preparando composição… ${p}%` }),
  });
  try {
    fs.renameSync(tmpDir, outDir);
  } catch {
    // outro render terminou primeiro: usa o dele
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  // limpa bundles de versões antigas do código (melhor esforço)
  for (const d of fs.readdirSync(cacheDir)) {
    if (d.startsWith("remotion-bundle") && !d.startsWith(`remotion-bundle-${stamp}`)) {
      try {
        fs.rmSync(path.join(cacheDir, d), { recursive: true, force: true });
      } catch {}
    }
  }
  return outDir;
}

const CRF = {
  h264: { maxima: 16, alta: 20, media: 24, rascunho: 30 },
  h265: { maxima: 20, alta: 24, media: 28, rascunho: 34 },
  vp9: { maxima: 20, alta: 28, media: 34, rascunho: 42 },
};

async function main() {
  const job = db.prepare("SELECT * FROM renders WHERE id = ?").get(renderId);
  if (!job) throw new Error("Job de renderização não encontrado");
  const inputProps = JSON.parse(job.props);
  const options = JSON.parse(job.options);
  update({ status: "rendering", stage: "Verificando navegador de renderização…", pid: process.pid }, true);

  await ensureBrowser({
    onBrowserDownload: () => {
      update({ stage: "Baixando navegador de renderização (apenas na primeira vez)…" }, true);
      return { version: null, onProgress: ({ percent }) => update({ stage: `Baixando navegador de renderização… ${Math.round(percent * 100)}%` }) };
    },
  });

  const serveUrl = await getBundle();
  const composition = await selectComposition({ serveUrl, id: "Main", inputProps });
  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });

  if (job.kind === "still") {
    update({ stage: "Renderizando quadro…" }, true);
    await renderStill({ composition, serveUrl, inputProps, output: options.outputPath, frame: options.frame ?? 0, imageFormat: "png" });
  } else {
    const codec = options.codec;
    const crf = CRF[codec]?.[options.quality];
    update({ stage: "Renderizando quadros…" }, true);
    await renderMedia({
      composition,
      serveUrl,
      codec,
      inputProps,
      outputLocation: options.outputPath,
      crf: codec === "prores" ? undefined : crf,
      proResProfile: codec === "prores" ? "hq" : undefined,
      x264Preset: codec === "h264" ? (options.quality === "rascunho" ? "veryfast" : "medium") : undefined,
      audioBitrate: options.audioBitrate,
      pixelFormat: codec === "prores" ? "yuv422p10le" : "yuv420p",
      hardwareAcceleration: "if-possible",
      onProgress: ({ progress, stitchStage, renderedFrames }) => {
        const stage =
          stitchStage === "muxing" ? "Juntando áudio e vídeo…" : `Renderizando quadro ${renderedFrames} de ${composition.durationInFrames}…`;
        update({ progress, stage });
      },
    });
  }
  update({ status: "done", progress: 1, stage: "Concluído", output_path: options.outputPath, pid: null }, true);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    try {
      update({ status: "error", error: String(e?.message ?? e).slice(0, 2000), stage: "Falhou", pid: null }, true);
    } catch {}
    process.exit(1);
  });
