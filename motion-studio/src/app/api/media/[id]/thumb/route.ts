import fs from "node:fs";
import { getAsset } from "@/server/db";
import { fail, serveFile } from "@/server/http";
import { makeThumbnail, thumbPath } from "@/server/media";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = getAsset((await params).id);
  if (!a) return fail("Mídia não encontrada", 404);
  if (a.kind === "audio") return fail("Áudio não tem miniatura", 404);
  const file = thumbPath(a.id);
  if (!fs.existsSync(file)) {
    try {
      await makeThumbnail(a.id, a.path, a.kind, a.duration);
    } catch {
      // imagens que o FFmpeg não decodifica (ex.: WebP na build reduzida): o navegador mostra o original
      if (a.kind === "image") return serveFile(req, a.path, a.mime);
      return fail("Não foi possível gerar a miniatura", 500);
    }
  }
  return serveFile(req, file, "image/jpeg");
}
