import { getProject, listRenders } from "@/server/db";
import { fail, handle, json } from "@/server/http";
import { startRender } from "@/server/render";
import { FORMATS } from "@/lib/model/formats";
import type { ExportSettings, FormatId, Project } from "@/lib/model/types";

export async function GET(req: Request) {
  return handle(() => json(listRenders(new URL(req.url).searchParams.get("projectId") ?? undefined)));
}

export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json()) as {
      projectId: string;
      project?: Project;
      kind?: "video" | "still";
      formatId: FormatId;
      exportSettings: ExportSettings;
      frame?: number;
    };
    // Usa o estado enviado pelo editor (mais recente que o autosave) ou o salvo.
    const project = body.project ?? getProject(body.projectId);
    if (!project) return fail("Projeto não encontrado", 404);
    if (!FORMATS[body.formatId]) return fail("Formato de destino inválido");
    const hasClips = project.tracks.some((t) => t.clips.length > 0);
    if (!hasClips) return fail("A timeline está vazia: adicione mídia, texto ou elementos antes de exportar.");
    const origin = new URL(req.url).origin;
    const id = startRender({
      project,
      kind: body.kind ?? "video",
      formatId: body.formatId,
      exportSettings: body.exportSettings,
      frame: body.frame,
      baseUrl: origin,
    });
    return json({ id }, 201);
  });
}
