import { fail, handle, json } from "@/server/http";
import { startAiJob, whisperReady, WHISPER_MODEL, type AiJobKind } from "@/server/ai";

export async function GET() {
  return handle(() => json({ whisperReady: whisperReady(), model: WHISPER_MODEL }));
}

/** Inicia uma tarefa de IA local: transcribe | silences | analyze. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json()) as { kind: AiJobKind; assetId: string };
    if (!["transcribe", "silences", "analyze"].includes(body.kind)) return fail("Tarefa inválida");
    return json(startAiJob(body.kind, body.assetId), 201);
  });
}
