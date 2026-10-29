import { handle, json } from "@/server/http";
import { writeContext, type EditorContext } from "@/server/vibe";

/** O editor publica seleção e cursor em vibe/context.json para o Claude Code. */
export async function POST(req: Request) {
  return handle(async () => {
    const ctx = (await req.json()) as EditorContext;
    if (typeof ctx.projectId !== "string" || !Array.isArray(ctx.selection)) return json({ ok: false }, 400);
    writeContext(ctx);
    return json({ ok: true });
  });
}
