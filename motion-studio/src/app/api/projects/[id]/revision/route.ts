import { getRevision } from "@/server/db";
import { fail, handle, json } from "@/server/http";
import { ensureVibe, importMirror, vibeStatus } from "@/server/vibe";

/** Consultado continuamente pelo editor para refletir edições feitas pelo Claude Code. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const id = (await params).id;
    ensureVibe();
    importMirror(id);
    const revision = getRevision(id);
    if (revision === null) return fail("Projeto não encontrado", 404);
    return json({ revision, vibe: vibeStatus(id) });
  });
}
