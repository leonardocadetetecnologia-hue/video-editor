import { getAsset } from "@/server/db";
import { fail, serveFile } from "@/server/http";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = getAsset((await params).id);
  if (!a) return fail("Mídia não encontrada", 404);
  return serveFile(req, a.path, a.mime);
}
