import { getPreset, listProjects } from "@/server/db";
import { ensureVibe, saveAndMirror } from "@/server/vibe";
import { fail, handle, json } from "@/server/http";
import { createProject, uid } from "@/lib/model/defaults";
import { FORMATS } from "@/lib/model/formats";
import type { FormatId } from "@/lib/model/types";

export async function GET() {
  return handle(() => {
    ensureVibe();
    return json(listProjects());
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json()) as { name?: string; formatId: FormatId; presetId?: string | null };
    if (!FORMATS[body.formatId]) return fail("Formato inválido");
    const preset = body.presetId ? getPreset(body.presetId) : null;
    const project = createProject({
      id: uid("prj_"),
      name: body.name?.trim() || `Projeto ${FORMATS[body.formatId].label}`,
      formatId: body.formatId,
      preset,
    });
    saveAndMirror(project, { snapshot: true });
    return json(project, 201);
  });
}
