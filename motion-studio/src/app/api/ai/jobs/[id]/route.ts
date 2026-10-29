import { fail, handle, json } from "@/server/http";
import { getAiJob } from "@/server/ai";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const job = getAiJob((await params).id);
    return job ? json(job) : fail("Tarefa não encontrada (o servidor pode ter reiniciado)", 404);
  });
}
