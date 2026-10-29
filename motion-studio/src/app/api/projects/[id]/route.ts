import { deleteProject, getProject, getRevision } from "@/server/db";
import { fail, handle, json } from "@/server/http";
import { ensureVibe, importMirror, removeMirror, saveAndMirror } from "@/server/vibe";
import type { Project } from "@/lib/model/types";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = (await params).id;
    ensureVibe();
    importMirror(id);
    const p = getProject(id);
    if (!p) return fail("Projeto não encontrado", 404);
    return Response.json(p, { headers: { "X-Revision": String(getRevision(id) ?? 1) } });
  });
}

export async function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = (await params).id;
    const p = (await req.json()) as Project;
    if (p.id !== id || p.version !== 1 || !Array.isArray(p.tracks)) return fail("Projeto inválido");
    const revision = saveAndMirror(p);
    return json({ ok: true, savedAt: new Date().toISOString(), revision });
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const id = (await params).id;
    deleteProject(id);
    removeMirror(id);
    return json({ ok: true });
  });
}
