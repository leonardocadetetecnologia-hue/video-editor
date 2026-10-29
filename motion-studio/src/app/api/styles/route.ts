import { listStyles, saveStyle } from "@/server/db";
import { fail, handle, json } from "@/server/http";
import type { SavedStyle } from "@/lib/model/types";

export async function GET() {
  return handle(() => json(listStyles()));
}

export async function POST(req: Request) {
  return handle(async () => {
    const s = (await req.json()) as SavedStyle;
    if (!s.id || !s.name || (s.kind !== "text" && s.kind !== "look")) return fail("Estilo inválido");
    saveStyle(s);
    return json(s);
  });
}
