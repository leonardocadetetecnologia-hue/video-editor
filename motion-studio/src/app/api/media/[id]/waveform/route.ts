import { getAsset } from "@/server/db";
import { fail, handle, json } from "@/server/http";
import { getWaveform } from "@/server/media";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const a = getAsset((await params).id);
    if (!a) return fail("Mídia não encontrada", 404);
    if (!a.hasAudio && a.kind !== "audio") return json({ peaksPerSecond: 40, peaks: [] });
    return json(await getWaveform(a.id, a.path));
  });
}
