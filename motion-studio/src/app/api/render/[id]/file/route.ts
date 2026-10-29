import path from "node:path";
import { getRender } from "@/server/db";
import { fail, serveFile } from "@/server/http";
import { mimeFor } from "@/server/media";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const job = getRender((await params).id);
  if (!job || job.status !== "done" || !job.outputPath) return fail("Arquivo ainda não está pronto", 404);
  const download = new URL(req.url).searchParams.get("download") === "1";
  const name = path.basename(job.outputPath);
  const mime = job.outputPath.endsWith(".mov") ? "video/quicktime" : mimeFor(job.outputPath);
  return serveFile(req, job.outputPath, mime, download ? { "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"` } : {});
}
