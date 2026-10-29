import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getSettings, insertAsset, listAssets, publicAsset, setAssetProxy, type AssetRow } from "@/server/db";
import { fail, handle, json } from "@/server/http";
import { browserPlayable, makeProxy, makeThumbnail, mimeFor, probe } from "@/server/media";
import { ensureDir } from "@/server/paths";
import { uid } from "@/lib/model/defaults";

export async function GET() {
  return handle(() => json(listAssets().map(publicAsset)));
}

/**
 * Upload em streaming: o corpo da requisição é o próprio arquivo, gravado
 * direto em disco, sem limite de tamanho imposto pela aplicação.
 * Cabeçalho x-file-name traz o nome original (URI-encoded).
 */
export async function POST(req: Request) {
  return handle(async () => {
    if (!req.body) return fail("Corpo vazio");
    const original = decodeURIComponent(req.headers.get("x-file-name") ?? "arquivo");
    const ext = path.extname(original).toLowerCase() || ".bin";
    const id = uid("ast_");
    const dir = ensureDir(getSettings().mediaDir);
    const file = path.join(dir, `${id}${ext}`);
    await pipeline(Readable.fromWeb(req.body as import("node:stream/web").ReadableStream), fs.createWriteStream(file));
    try {
      const info = await probe(file);
      const asset: AssetRow = {
        id,
        name: original,
        kind: info.kind,
        mime: mimeFor(file),
        size: fs.statSync(file).size,
        duration: info.duration,
        width: info.width,
        height: info.height,
        fps: info.fps,
        hasAudio: info.hasAudio,
        hasProxy: false,
        createdAt: new Date().toISOString(),
        path: file,
        proxyPath: null,
      };
      await makeThumbnail(id, file, info.kind, info.duration).catch((e) => console.warn("thumbnail:", e.message));
      insertAsset(asset);
      // Codecs que o navegador não reproduz recebem proxy automaticamente.
      if (info.kind === "video" && !browserPlayable(info.videoCodec)) {
        makeProxy(id, file)
          .then((p) => setAssetProxy(id, p))
          .catch((e) => console.warn("proxy:", e.message));
      }
      return json(publicAsset(asset), 201);
    } catch (e) {
      fs.rmSync(file, { force: true });
      throw e;
    }
  });
}
