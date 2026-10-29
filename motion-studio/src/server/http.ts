import fs from "node:fs";
import { Readable } from "node:stream";

export function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export function fail(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

export async function handle(fn: () => Promise<Response> | Response): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    console.error(e);
    return fail(e instanceof Error ? e.message : String(e), 500);
  }
}

/** Serve um arquivo com suporte a Range (necessário para busca em vídeo no navegador). */
export function serveFile(req: Request, file: string, mime: string, extraHeaders: Record<string, string> = {}): Response {
  if (!fs.existsSync(file)) return fail("Arquivo não encontrado no disco", 404);
  const size = fs.statSync(file).size;
  const range = req.headers.get("range");
  const base = { "Content-Type": mime, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600", ...extraHeaders };
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start = m && m[1] ? parseInt(m[1], 10) : 0;
    let end = m && m[2] ? parseInt(m[2], 10) : size - 1;
    if (m && !m[1] && m[2]) {
      start = Math.max(0, size - parseInt(m[2], 10));
      end = size - 1;
    }
    if (start >= size || end >= size || start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...base, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  const stream = Readable.toWeb(fs.createReadStream(file)) as ReadableStream;
  return new Response(stream, { status: 200, headers: { ...base, "Content-Length": String(size) } });
}
