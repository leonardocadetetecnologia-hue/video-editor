import { getSnapshot, listSnapshots } from "@/server/db";
import { fail, handle, json } from "@/server/http";

/** Lista as versões salvas; com ?snap=<id> devolve o conteúdo daquela versão. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const id = (await params).id;
    const snap = new URL(req.url).searchParams.get("snap");
    if (snap) {
      const p = getSnapshot(id, Number(snap));
      return p ? json(p) : fail("Versão não encontrada", 404);
    }
    return json(listSnapshots(id));
  });
}
