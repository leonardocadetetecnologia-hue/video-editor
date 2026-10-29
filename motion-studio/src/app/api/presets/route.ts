import { getSettings, listPresets, savePreset, updateSettings } from "@/server/db";
import { handle, json } from "@/server/http";
import type { VideoPreset } from "@/lib/model/types";

export async function GET() {
  return handle(() => json(listPresets()));
}

/** Cria ou atualiza um preset. `makeDefault` o torna o padrão de novos projetos. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json()) as { preset: VideoPreset; makeDefault?: boolean };
    savePreset(body.preset);
    if (body.makeDefault || !getSettings().defaultPresetId) updateSettings({ defaultPresetId: body.preset.id, onboardingDone: true });
    return json(body.preset);
  });
}
