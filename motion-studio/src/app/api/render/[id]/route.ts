import { getRender } from "@/server/db";
import { fail, handle, json } from "@/server/http";
import { cancelRender } from "@/server/render";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const job = getRender((await params).id);
    if (!job) return fail("Renderização não encontrada", 404);
    const { pid: _pid, ...rest } = job;
    return json(rest);
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    cancelRender((await params).id);
    return json({ ok: true });
  });
}
