import { deletePreset } from "@/server/db";
import { handle, json } from "@/server/http";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    deletePreset((await params).id);
    return json({ ok: true });
  });
}
