import fs from "node:fs";
import path from "node:path";
import { deleteAssetRow, getAsset, publicAsset, renameAsset } from "@/server/db";
import { fail, handle, json } from "@/server/http";
import { thumbPath } from "@/server/media";
import { CACHE_DIR } from "@/server/paths";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const a = getAsset((await params).id);
    return a ? json(publicAsset(a)) : fail("Mídia não encontrada", 404);
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = (await params).id;
    const body = (await req.json()) as { name?: string };
    if (body.name) renameAsset(id, body.name.trim());
    const a = getAsset(id);
    return a ? json(publicAsset(a)) : fail("Mídia não encontrada", 404);
  });
}

/** Remove a mídia da biblioteca e apaga a cópia gerenciada pelo app e seus caches. */
export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const a = getAsset((await params).id);
    if (!a) return fail("Mídia não encontrada", 404);
    deleteAssetRow(a.id);
    for (const f of [a.path, a.proxyPath, thumbPath(a.id), path.join(CACHE_DIR, "waveforms", `${a.id}.json`)]) {
      if (f) fs.rmSync(f, { force: true });
    }
    return json({ ok: true });
  });
}
