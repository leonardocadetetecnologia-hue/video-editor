import { getSettings, updateSettings, type AppSettings } from "@/server/db";
import { handle, json } from "@/server/http";

export async function GET() {
  return handle(() => json(getSettings()));
}

export async function PUT(req: Request) {
  return handle(async () => json(updateSettings((await req.json()) as Partial<AppSettings>)));
}
