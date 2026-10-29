import fs from "node:fs";
import { getAsset, publicAsset, setAssetProxy } from "@/server/db";
import { fail, handle, json, serveFile } from "@/server/http";
import { makeProxy } from "@/server/media";

type Ctx = { params: Promise<{ id: string }> };

/** Serve o proxy; sem proxy disponível, serve o original. */
export async function GET(req: Request, { params }: Ctx) {
  const a = getAsset((await params).id);
  if (!a) return fail("Mídia não encontrada", 404);
  if (a.proxyPath && fs.existsSync(a.proxyPath)) return serveFile(req, a.proxyPath, "video/mp4");
  return serveFile(req, a.path, a.mime);
}

/** Gera (ou regenera) o proxy de preview. */
export async function POST(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const a = getAsset((await params).id);
    if (!a) return fail("Mídia não encontrada", 404);
    if (a.kind !== "video") return fail("Proxy só se aplica a vídeos");
    const out = await makeProxy(a.id, a.path);
    setAssetProxy(a.id, out);
    return json(publicAsset({ ...a, proxyPath: out, hasProxy: true }));
  });
}
