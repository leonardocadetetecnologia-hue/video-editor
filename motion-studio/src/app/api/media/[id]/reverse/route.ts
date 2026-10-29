import fs from "node:fs";
import path from "node:path";
import { getAsset, getSettings, insertAsset, publicAsset, type AssetRow } from "@/server/db";
import { fail, handle, json } from "@/server/http";
import { makeReversed, makeThumbnail } from "@/server/media";
import { ensureDir } from "@/server/paths";
import { uid } from "@/lib/model/defaults";

/** Cria uma nova mídia com o conteúdo invertido (o original não é alterado). */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const a = getAsset((await params).id);
    if (!a) return fail("Mídia não encontrada", 404);
    if (a.kind === "image") return fail("Imagens não podem ser invertidas");
    const id = uid("ast_");
    const ext = a.kind === "audio" ? ".m4a" : ".mp4";
    const out = path.join(ensureDir(getSettings().mediaDir), `${id}${ext}`);
    await makeReversed(a.path, out, { hasVideo: a.kind === "video", hasAudio: a.hasAudio, fps: a.fps });
    const base = a.name.replace(/\.[^.]+$/, "");
    const asset: AssetRow = {
      ...a,
      id,
      name: `${base} (invertido)${ext}`,
      mime: a.kind === "audio" ? "audio/mp4" : "video/mp4",
      size: fs.statSync(out).size,
      path: out,
      proxyPath: null,
      hasProxy: false,
      createdAt: new Date().toISOString(),
    };
    await makeThumbnail(id, out, a.kind, a.duration).catch(() => {});
    insertAsset(asset);
    return json(publicAsset(asset), 201);
  });
}
