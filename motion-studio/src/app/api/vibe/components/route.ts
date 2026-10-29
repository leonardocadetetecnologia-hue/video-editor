import { handle, json } from "@/server/http";
import { setComponentCatalog, type ComponentCatalog } from "@/server/vibe";

/** O editor publica o catálogo de animações em código (vibe/components.json). */
export async function POST(req: Request) {
  return handle(async () => {
    setComponentCatalog((await req.json()) as ComponentCatalog);
    return json({ ok: true });
  });
}
